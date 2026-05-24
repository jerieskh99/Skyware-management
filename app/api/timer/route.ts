import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";

/** GET — current user's active or paused time session (if any). */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const session = await prisma.timeSession.findFirst({
    where: { userId: user.id, endedAt: null },
    include: {
      job: {
        select: { id: true, publicNumber: true, title: true, status: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json(session ?? null);
}
