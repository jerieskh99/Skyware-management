import { Prisma, SavedViewVisibility, type SavedViewScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

/**
 * Personal saved views are scoped to the owning user. Team-shared views live
 * on the same table but with `visibility = 'team'`; they're visible to any
 * logged-in user on the matching scope. The route layer translates ownership
 * misses to 404 (rather than 403) so a leaked id reveals nothing.
 */

export type Scope = SavedViewScope;
export type Visibility = SavedViewVisibility;

export class SavedViewNotFoundError extends Error {
  constructor() {
    super("Saved view not found");
    this.name = "SavedViewNotFoundError";
  }
}

const VIEW_SELECT = {
  id: true,
  userId: true,
  scope: true,
  name: true,
  filterJson: true,
  visibility: true,
  isDefault: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavedViewSelect;

export type SavedViewRow = Prisma.SavedViewGetPayload<{ select: typeof VIEW_SELECT }>;

/** True when the actor may edit or delete the given view. */
export function canManageTeamView(
  user: Pick<SessionUser, "id" | "isAdmin">,
  view: { createdById: string; userId: string | null },
): boolean {
  if (isAdmin(user as SessionUser)) return true;
  return view.createdById === user.id || view.userId === user.id;
}

export async function listVisibleTo(
  userId: string,
  scope: Scope,
): Promise<SavedViewRow[]> {
  const rows = await prisma.savedView.findMany({
    where: {
      scope,
      OR: [{ userId }, { visibility: SavedViewVisibility.team }],
    },
    select: VIEW_SELECT,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  // Dedupe by id (a user's own team-view satisfies both OR clauses).
  const seen = new Set<string>();
  const out: SavedViewRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

interface CreateInput {
  name: string;
  filterJson: Prisma.InputJsonValue;
  isDefault?: boolean;
  visibility?: Visibility;
}

export async function createForUser(
  userId: string,
  scope: Scope,
  input: CreateInput,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow> {
  const db = tx ?? prisma;
  const visibility = input.visibility ?? SavedViewVisibility.personal;
  return db.savedView.create({
    data: {
      userId,
      createdById: userId,
      scope,
      name: input.name,
      filterJson: input.filterJson,
      isDefault: input.isDefault ?? false,
      visibility,
      isTeam: visibility === SavedViewVisibility.team,
    },
    select: VIEW_SELECT,
  });
}

interface UpdatePatch {
  name?: string;
  filterJson?: Prisma.InputJsonValue;
  isDefault?: boolean;
  visibility?: Visibility;
}

/**
 * Apply a non-default-flag patch to a saved view. Caller is responsible for
 * ownership/admin checks; pass `actor` so admins may patch views owned by
 * other users. `isDefault` flips must be routed through `setDefaultForUser`
 * so the partial unique indexes can never collide.
 */
export async function updateForUser(
  actor: Pick<SessionUser, "id" | "isAdmin">,
  viewId: string,
  patch: UpdatePatch,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow> {
  const db = tx ?? prisma;
  const existing = await db.savedView.findFirst({
    where: { id: viewId },
    select: { id: true, userId: true, createdById: true, visibility: true },
  });
  if (!existing) throw new SavedViewNotFoundError();
  if (!canManageTeamView(actor, existing)) throw new SavedViewNotFoundError();

  const data: Prisma.SavedViewUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.filterJson !== undefined) data.filterJson = patch.filterJson;
  if (patch.visibility !== undefined) {
    data.visibility = patch.visibility;
    data.isTeam = patch.visibility === SavedViewVisibility.team;
  }
  if (Object.keys(data).length > 0) {
    await db.savedView.update({ where: { id: viewId }, data });
  }
  const row = await db.savedView.findFirst({ where: { id: viewId }, select: VIEW_SELECT });
  if (!row) throw new SavedViewNotFoundError();
  return row;
}

export async function deleteForUser(
  actor: Pick<SessionUser, "id" | "isAdmin">,
  viewId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const existing = await db.savedView.findFirst({
    where: { id: viewId },
    select: { id: true, userId: true, createdById: true },
  });
  if (!existing) throw new SavedViewNotFoundError();
  if (!canManageTeamView(actor, existing)) throw new SavedViewNotFoundError();
  await db.savedView.delete({ where: { id: viewId } });
}

/**
 * Atomically pin/unpin a default view. Routing depends on visibility:
 *  - Personal: clears any other personal default for (user_id, scope).
 *  - Team: clears any other team default for (scope) across the org.
 *
 * The actor must be able to manage the target view (owner or admin). Pass
 * `viewId = null` to clear the default for the personal scope without pinning
 * a replacement — team unpinning still requires passing the target id.
 */
export async function setDefaultForUser(
  actor: Pick<SessionUser, "id" | "isAdmin">,
  scope: Scope,
  viewId: string | null,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow | null> {
  const run = async (db: Prisma.TransactionClient) => {
    if (!viewId) {
      await db.savedView.updateMany({
        where: {
          userId: actor.id,
          scope,
          visibility: SavedViewVisibility.personal,
          isDefault: true,
        },
        data: { isDefault: false },
      });
      return null;
    }
    const target = await db.savedView.findFirst({
      where: { id: viewId, scope },
      select: { id: true, userId: true, createdById: true, visibility: true },
    });
    if (!target) throw new SavedViewNotFoundError();
    if (!canManageTeamView(actor, target)) throw new SavedViewNotFoundError();

    if (target.visibility === SavedViewVisibility.team) {
      await db.savedView.updateMany({
        where: {
          scope,
          visibility: SavedViewVisibility.team,
          isDefault: true,
          NOT: { id: viewId },
        },
        data: { isDefault: false },
      });
    } else {
      await db.savedView.updateMany({
        where: {
          userId: actor.id,
          scope,
          visibility: SavedViewVisibility.personal,
          isDefault: true,
          NOT: { id: viewId },
        },
        data: { isDefault: false },
      });
    }
    await db.savedView.update({ where: { id: viewId }, data: { isDefault: true } });
    return db.savedView.findFirst({ where: { id: viewId }, select: VIEW_SELECT });
  };
  if (tx) return run(tx);
  return prisma.$transaction(run);
}
