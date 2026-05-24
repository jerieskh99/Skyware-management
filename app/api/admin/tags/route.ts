import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  key: z.string().min(1).max(60).trim().regex(/^[a-z0-9_-]+$/, "Lowercase, digits, _ - only"),
  labelEn: z.string().min(1).max(100).trim(),
  labelHe: z.string().min(1).max(100).trim(),
  scope: z.enum(["communication", "job", "both"]),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

/** POST — create tag. Admin only. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const existing = await prisma.tag.findUnique({ where: { key: d.key }, select: { id: true } });
  if (existing) return badRequest([{ message: "Tag key already exists." }]);

  const tag = await prisma.$transaction(async (tx) => {
    const t = await tx.tag.create({
      data: {
        key: d.key,
        labelEn: d.labelEn,
        labelHe: d.labelHe,
        scope: d.scope,
        colorHex: d.colorHex ?? null,
      },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "tag.created",
      entityType: "Tag",
      entityId: t.id,
      diff: { key: { old: null, new: d.key }, labelEn: { old: null, new: d.labelEn } },
    });
    return t;
  });

  return NextResponse.json(tag, { status: 201 });
}
