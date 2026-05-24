import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({
  labelEn: z.string().min(1).max(100).trim().optional(),
  labelHe: z.string().min(1).max(100).trim().optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const tag = await prisma.tag.findUnique({ where: { id }, select: { id: true, labelEn: true, labelHe: true, colorHex: true } });
  if (!tag) return notFound("Tag");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      updateData[k] = v;
      diff[k] = { old: (tag as Record<string, unknown>)[k] ?? null, new: v };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.tag.update({ where: { id }, data: updateData });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "tag.updated",
      entityType: "Tag",
      entityId: id,
      diff,
    });
    return t;
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, key: true, isSystem: true, _count: { select: { jobTags: true, postTags: true } } },
  });
  if (!tag) return notFound("Tag");

  if (tag.isSystem) return badRequest([{ message: "System tags cannot be deleted." }]);
  if (tag._count.jobTags > 0 || tag._count.postTags > 0) {
    return badRequest([{ message: `Tag is in use (${tag._count.jobTags + tag._count.postTags} references). Remove tag from all items first.` }]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.tag.delete({ where: { id } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "tag.deleted",
      entityType: "Tag",
      entityId: id,
      diff: { key: { old: tag.key, new: null } },
    });
  });

  return new NextResponse(null, { status: 204 });
}
