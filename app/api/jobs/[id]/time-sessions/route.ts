import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api-utils";
import { getJobForUser } from "@/lib/jobs/queries";

interface Params { params: Promise<{ id: string }> }

/** GET: list active and recent sessions for this user on this job. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { id } = await params;
  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  const sessions = await prisma.timeSession.findMany({
    where: { jobId: id, userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return NextResponse.json(sessions);
}

/** POST: start a new time session (stops any other active session for this user first). */
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { id } = await params;
  const job = await getJobForUser(user, id);
  if (!job) return notFound("Job");

  const now = new Date();

  const session = await prisma.$transaction(async (tx) => {
    // End any existing active session for this user
    await tx.timeSession.updateMany({
      where: { userId: user.id, endedAt: null },
      data: { endedAt: now },
    });

    return tx.timeSession.create({
      data: {
        userId: user.id,
        jobId: id,
        startedAt: now,
        source: "manual_button",
      },
    });
  });

  return NextResponse.json(session, { status: 201 });
}
