import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string; noteId: string }> }

/** DELETE — remove an environment note for a client section. Admin only. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId, noteId } = await params;

  const note = await prisma.clientEnvironmentNote.findFirst({
    where: { id: noteId, clientId },
    select: { id: true, section: true },
  });
  if (!note) return notFound("Environment note");

  await prisma.$transaction(async (tx) => {
    await tx.clientEnvironmentNote.delete({ where: { id: noteId } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "client_environment_note.deleted",
      entityType: "ClientEnvironmentNote",
      entityId: noteId,
      diff: { section: { old: note.section, new: null } },
    });
  });

  return new NextResponse(null, { status: 204 });
}
