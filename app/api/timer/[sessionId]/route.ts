import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api-utils";

interface Params { params: Promise<{ sessionId: string }> }

const patchSchema = z.object({
  action: z.enum(["pause", "resume", "stop"]),
});

/** PATCH — pause, resume, or stop a time session. */
export async function PATCH(req: Request, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const { sessionId } = await params;

  const session = await prisma.timeSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return notFound("TimeSession");
  if (session.userId !== user.id) return forbidden("Not your session");
  if (session.endedAt) {
    return NextResponse.json({ error: "Session already ended" }, { status: 422 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { action } = parsed.data;
  const now = new Date();

  if (action === "pause") {
    if (session.pausedAt) {
      return NextResponse.json({ error: "Session already paused" }, { status: 422 });
    }
    // Accumulate minutes since last start/resume
    const lastStart = session.resumedAt ?? session.startedAt;
    const delta = Math.floor((now.getTime() - lastStart.getTime()) / 60_000);
    const updated = await prisma.timeSession.update({
      where: { id: sessionId },
      data: {
        pausedAt: now,
        accumulatedMinutes: session.accumulatedMinutes + delta,
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "resume") {
    if (!session.pausedAt) {
      return NextResponse.json({ error: "Session is not paused" }, { status: 422 });
    }
    const updated = await prisma.timeSession.update({
      where: { id: sessionId },
      data: { pausedAt: null, resumedAt: now },
    });
    return NextResponse.json(updated);
  }

  // stop
  const lastStart = session.pausedAt
    ? null // already paused — no additional time to add
    : (session.resumedAt ?? session.startedAt);
  const delta = lastStart
    ? Math.floor((now.getTime() - lastStart.getTime()) / 60_000)
    : 0;
  const updated = await prisma.timeSession.update({
    where: { id: sessionId },
    data: {
      endedAt: now,
      pausedAt: session.pausedAt ?? null,
      accumulatedMinutes: session.accumulatedMinutes + delta,
    },
  });
  return NextResponse.json(updated);
}
