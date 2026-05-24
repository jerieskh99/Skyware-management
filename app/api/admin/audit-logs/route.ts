import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";

const PAGE_SIZE = 25;

/** GET — paginated audit log. Admin only. Filters: action, entityType, page. */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const action = searchParams.get("action")?.trim() || undefined;
  const entityType = searchParams.get("entityType")?.trim() || undefined;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
        ...(entityType ? { entityType } : {}),
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        diffJson: true,
        createdAt: true,
        actor: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({
      where: {
        ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
        ...(entityType ? { entityType } : {}),
      },
    }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });
}
