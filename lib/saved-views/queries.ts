import type { Prisma, SavedViewScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Personal saved views are scoped to the owning user. Every read and mutation
 * filters on `userId` so a leaked id from another user surfaces as "not found"
 * (404) at the route layer rather than 403 — see `SavedViewNotFoundError`.
 *
 * Team-shared scope (`userId IS NULL`, `isTeam = true`) is intentionally
 * excluded from these helpers; that surface arrives in Phase 3.
 */

export type Scope = SavedViewScope;

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
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavedViewSelect;

export type SavedViewRow = Prisma.SavedViewGetPayload<{ select: typeof VIEW_SELECT }>;

export async function listForUser(userId: string, scope: Scope): Promise<SavedViewRow[]> {
  return prisma.savedView.findMany({
    where: { userId, scope },
    select: VIEW_SELECT,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

interface CreateInput {
  name: string;
  filterJson: Prisma.InputJsonValue;
  isDefault?: boolean;
}

export async function createForUser(
  userId: string,
  scope: Scope,
  input: CreateInput,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow> {
  const db = tx ?? prisma;
  return db.savedView.create({
    data: {
      userId,
      createdById: userId,
      scope,
      name: input.name,
      filterJson: input.filterJson,
      isDefault: input.isDefault ?? false,
    },
    select: VIEW_SELECT,
  });
}

interface UpdatePatch {
  name?: string;
  filterJson?: Prisma.InputJsonValue;
  isDefault?: boolean;
}

export async function updateForUser(
  userId: string,
  viewId: string,
  patch: UpdatePatch,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow> {
  const db = tx ?? prisma;
  const result = await db.savedView.updateMany({
    where: { id: viewId, userId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.filterJson !== undefined ? { filterJson: patch.filterJson } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    },
  });
  if (result.count === 0) throw new SavedViewNotFoundError();
  const row = await db.savedView.findFirst({
    where: { id: viewId, userId },
    select: VIEW_SELECT,
  });
  if (!row) throw new SavedViewNotFoundError();
  return row;
}

export async function deleteForUser(
  userId: string,
  viewId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const result = await db.savedView.deleteMany({ where: { id: viewId, userId } });
  if (result.count === 0) throw new SavedViewNotFoundError();
}

/**
 * Atomically set the default view for `(userId, scope)`. Clears any prior
 * default in the same scope before setting the new one so the partial unique
 * index added in `20260524000300_saved_view_extras` is never violated.
 *
 * Pass `viewId = null` to clear the default for the scope without choosing a
 * replacement.
 */
export async function setDefaultForUser(
  userId: string,
  scope: Scope,
  viewId: string | null,
  tx?: Prisma.TransactionClient,
): Promise<SavedViewRow | null> {
  const run = async (db: Prisma.TransactionClient) => {
    if (viewId) {
      const owned = await db.savedView.findFirst({
        where: { id: viewId, userId, scope },
        select: { id: true },
      });
      if (!owned) throw new SavedViewNotFoundError();
    }
    await db.savedView.updateMany({
      where: { userId, scope, isDefault: true, ...(viewId ? { NOT: { id: viewId } } : {}) },
      data: { isDefault: false },
    });
    if (!viewId) return null;
    await db.savedView.update({ where: { id: viewId }, data: { isDefault: true } });
    return db.savedView.findFirst({
      where: { id: viewId, userId },
      select: VIEW_SELECT,
    });
  };
  if (tx) return run(tx);
  return prisma.$transaction(run);
}
