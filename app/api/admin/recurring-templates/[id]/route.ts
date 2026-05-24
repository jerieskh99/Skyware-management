import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
  updateTemplateSchema,
} from "@/lib/recurring/template-queries";

interface Params { params: Promise<{ id: string }> }

/** GET — detail. Admin only. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();
  const { id } = await params;
  const row = await getTemplate(id);
  if (!row) return notFound("RecurringJobTemplate");
  return NextResponse.json(row);
}

/** PATCH — update. Admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();
  const { id } = await params;
  const existing = await prisma.recurringJobTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound("RecurringJobTemplate");

  const body = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const updated = await prisma.$transaction(async (tx) => {
    return updateTemplate(tx, { actorUserId: auth.user.id, id, patch: parsed.data });
  });
  return NextResponse.json(updated);
}

/** DELETE — hard delete. Admin only. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();
  const { id } = await params;
  const existing = await prisma.recurringJobTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound("RecurringJobTemplate");

  await prisma.$transaction(async (tx) => {
    await deleteTemplate(tx, { actorUserId: auth.user.id, id });
  });
  return NextResponse.json({ ok: true });
}
