import { NextResponse } from "next/server";
import { z } from "zod";
import { SavedViewVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  SavedViewNotFoundError,
  canManageTeamView,
  deleteForUser,
  setDefaultForUser,
  updateForUser,
} from "@/lib/saved-views/queries";

interface Params { params: Promise<{ id: string }> }

const patchSchema = z
  .object({
    name: z.string().min(1).max(80).trim().optional(),
    filterJson: z.record(z.string(), z.string()).optional(),
    isDefault: z.boolean().optional(),
    visibility: z.enum(["personal", "team"]).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.filterJson !== undefined ||
      d.isDefault !== undefined ||
      d.visibility !== undefined,
    { message: "At least one field is required." },
  );

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const { name, filterJson, isDefault, visibility } = parsed.data;

  if (visibility === "team") {
    const enabled = await getFeatureFlag("saved_views_team_shared_enabled");
    if (!enabled) {
      return NextResponse.json(
        { error: "Team-shared saved views are disabled." },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedView.findFirst({
        where: { id },
        select: {
          id: true,
          userId: true,
          createdById: true,
          scope: true,
          name: true,
          isDefault: true,
          visibility: true,
        },
      });
      if (!existing) throw new SavedViewNotFoundError();
      if (!canManageTeamView(auth.user, existing)) throw new SavedViewNotFoundError();

      const nextVisibility =
        visibility === undefined
          ? undefined
          : visibility === "team"
            ? SavedViewVisibility.team
            : SavedViewVisibility.personal;

      const next = await updateForUser(
        auth.user,
        id,
        {
          ...(name !== undefined ? { name } : {}),
          ...(filterJson !== undefined ? { filterJson } : {}),
          ...(nextVisibility !== undefined ? { visibility: nextVisibility } : {}),
        },
        tx,
      );

      let withDefault = next;
      if (isDefault === true) {
        const pinned = await setDefaultForUser(auth.user, existing.scope, id, tx);
        if (pinned) withDefault = pinned;
      } else if (isDefault === false && existing.isDefault) {
        await tx.savedView.update({ where: { id }, data: { isDefault: false } });
        withDefault = { ...next, isDefault: false };
      }

      const diff: Record<string, { old: unknown; new: unknown }> = {};
      if (name !== undefined && name !== existing.name) {
        diff["name"] = { old: existing.name, new: name };
      }
      if (filterJson !== undefined) {
        diff["filterJson"] = { old: null, new: filterJson };
      }
      if (isDefault !== undefined && isDefault !== existing.isDefault) {
        diff["isDefault"] = { old: existing.isDefault, new: isDefault };
      }
      if (nextVisibility !== undefined && nextVisibility !== existing.visibility) {
        diff["visibility"] = { old: existing.visibility, new: nextVisibility };
      }
      if (Object.keys(diff).length > 0) {
        await writeAudit(tx, {
          actorUserId: auth.user.id,
          action: "saved_view.updated",
          entityType: "SavedView",
          entityId: id,
          diff,
        });
      }
      return withDefault;
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof SavedViewNotFoundError) return notFound("Saved view");
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.savedView.findFirst({
        where: { id },
        select: {
          id: true,
          userId: true,
          createdById: true,
          name: true,
          scope: true,
        },
      });
      if (!existing) throw new SavedViewNotFoundError();
      if (!canManageTeamView(auth.user, existing)) throw new SavedViewNotFoundError();

      await deleteForUser(auth.user, id, tx);

      await writeAudit(tx, {
        actorUserId: auth.user.id,
        action: "saved_view.deleted",
        entityType: "SavedView",
        entityId: id,
        diff: {
          name: { old: existing.name, new: null },
          scope: { old: existing.scope, new: null },
        },
      });
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof SavedViewNotFoundError) return notFound("Saved view");
    throw err;
  }
}
