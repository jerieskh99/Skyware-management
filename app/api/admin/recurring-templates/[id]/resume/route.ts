import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { resumeTemplate } from "@/lib/recurring/template-queries";

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();
  const { id } = await params;
  const existing = await prisma.recurringJobTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound("RecurringJobTemplate");

  const updated = await prisma.$transaction(async (tx) => {
    return resumeTemplate(tx, { actorUserId: auth.user.id, id });
  });
  return NextResponse.json(updated);
}
