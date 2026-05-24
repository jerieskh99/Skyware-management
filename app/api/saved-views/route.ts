import { NextResponse } from "next/server";
import { z } from "zod";
import { SavedViewVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  createForUser,
  listVisibleTo,
  setDefaultForUser,
} from "@/lib/saved-views/queries";

const SCOPE_KEYS = ["jobs", "clients", "billing"] as const;
const scopeSchema = z.enum(SCOPE_KEYS);

const filterRecordSchema = z.record(z.string(), z.string());
const visibilitySchema = z.enum(["personal", "team"]);

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const parsed = scopeSchema.safeParse(searchParams.get("scope"));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const views = await listVisibleTo(auth.user.id, parsed.data);
  return NextResponse.json(views);
}

const createBody = z.object({
  scope: scopeSchema,
  name: z.string().min(1).max(80).trim(),
  filterJson: filterRecordSchema,
  isDefault: z.boolean().optional(),
  visibility: visibilitySchema.optional(),
});

// Any logged-in user may create a team view. The audit row captures the
// actor; if a future policy requires admin-only team creation, gate here.
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createBody.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const { scope, name, filterJson, isDefault, visibility } = parsed.data;

  if (visibility === "team") {
    const enabled = await getFeatureFlag("saved_views_team_shared_enabled");
    if (!enabled) {
      return NextResponse.json(
        { error: "Team-shared saved views are disabled." },
        { status: 400 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const view = await createForUser(
      auth.user.id,
      scope,
      {
        name,
        filterJson,
        isDefault: isDefault === true,
        visibility: visibility === "team"
          ? SavedViewVisibility.team
          : SavedViewVisibility.personal,
      },
      tx,
    );
    if (isDefault === true) {
      await setDefaultForUser(auth.user, scope, view.id, tx);
    }
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "saved_view.created",
      entityType: "SavedView",
      entityId: view.id,
      diff: {
        scope: { old: null, new: scope },
        name: { old: null, new: name },
        isDefault: { old: null, new: isDefault === true },
        visibility: { old: null, new: view.visibility },
      },
    });
    return view;
  });

  return NextResponse.json(
    { ...created, isDefault: isDefault === true },
    { status: 201 },
  );
}
