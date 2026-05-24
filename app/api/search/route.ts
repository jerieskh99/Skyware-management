import { NextResponse } from "next/server";
import type { Prisma, DepartmentKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";
import { canReadJob, canPostInChannel } from "@/lib/permissions";

/**
 * GET /api/search?q=...&scope=jobs|posts|all
 * Returns permission-filtered results. Max 15 per scope.
 */
export async function GET(req: Request) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const scope = searchParams.get("scope") ?? "jobs";

  if (q.length < 1) return NextResponse.json({ jobs: [], posts: [] });

  const doJobs = scope === "jobs" || scope === "all";
  const doPosts = scope === "posts" || scope === "all";

  // ---- Jobs ----
  let jobs: {
    id: string;
    publicNumber: string;
    title: string;
    status: string;
    priority: string;
    client: { companyName: string } | null;
    department: { key: string; nameEn: string };
    assignedEmployeeId: string | null;
  }[] = [];

  if (doJobs) {
    const scopeWhere: Prisma.JobWhereInput = user.isAdmin
      ? {}
      : {
          OR: [
            { assignedEmployeeId: user.id },
            { department: { key: user.departmentKey as DepartmentKey } },
            { department: { key: "global" as DepartmentKey } },
          ],
        };

    const rows = await prisma.job.findMany({
      where: {
        AND: [
          scopeWhere,
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { publicNumber: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        publicNumber: true,
        title: true,
        status: true,
        priority: true,
        client: { select: { companyName: true } },
        department: { select: { key: true, nameEn: true } },
        assignedEmployeeId: true,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 15,
    });

    jobs = rows.filter((j) =>
      canReadJob(user, {
        departmentKey: j.department.key,
        assignedEmployeeId: j.assignedEmployeeId,
      })
    );
  }

  // ---- Posts ----
  let posts: {
    id: string;
    title: string;
    channelKey: string;
    channelNameEn: string;
    authorDisplayName: string;
    createdAt: Date;
  }[] = [];

  if (doPosts) {
    // Determine visible channel IDs for this user.
    const allChannels = await prisma.communicationChannel.findMany({
      include: { department: { select: { key: true } } },
    });
    const visibleChannelIds = allChannels
      .filter((ch) => canPostInChannel(user, ch.department?.key ?? null))
      .map((ch) => ch.id);

    const rows = await prisma.communicationPost.findMany({
      where: {
        channelId: { in: visibleChannelIds },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { body: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        channel: { select: { key: true, nameEn: true } },
        author: { select: { displayName: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    posts = rows.map((p) => ({
      id: p.id,
      title: p.title,
      channelKey: p.channel.key,
      channelNameEn: p.channel.nameEn,
      authorDisplayName: p.author.displayName,
      createdAt: p.createdAt,
    }));
  }

  return NextResponse.json({ jobs, posts });
}
