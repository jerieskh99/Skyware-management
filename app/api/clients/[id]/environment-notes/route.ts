import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getClientEnvironmentNotes } from "@/lib/clients/queries";

interface Params { params: Promise<{ id: string }> }

/** GET — environment notes for a client. Admin only. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return notFound("Client");

  const notes = await getClientEnvironmentNotes(id);
  return NextResponse.json(notes);
}

const schema = z.object({
  section: z.enum(["network", "servers", "hosting", "contacts", "vendors", "security", "backup", "other"]),
  content: z.string().min(1).max(5000).trim(),
});

/**
 * POST — upsert a note for a given section.
 * If a note already exists for that section, it is updated.
 * Treats each section as a single canonical note per client.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return notFound("Client");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { section, content } = parsed.data;
  const now = new Date();

  const note = await prisma.$transaction(async (tx) => {
    const existing = await tx.clientEnvironmentNote.findFirst({
      where: { clientId, section },
    });

    let n;
    if (existing) {
      n = await tx.clientEnvironmentNote.update({
        where: { id: existing.id },
        data: { content, lastEditedByUserId: auth.user.id, lastEditedAt: now },
      });
    } else {
      n = await tx.clientEnvironmentNote.create({
        data: { clientId, section, content, lastEditedByUserId: auth.user.id, lastEditedAt: now },
      });
    }

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "client_environment_note.upserted",
      entityType: "ClientEnvironmentNote",
      entityId: n.id,
      diff: { section: { old: null, new: section } },
    });

    return n;
  });

  return NextResponse.json(note);
}
