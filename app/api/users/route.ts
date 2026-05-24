import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";

/** GET — active users list. Admin only. Used for assignment dropdowns. */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  if (!isAdmin(user)) return forbidden();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      username: true,
      displayName: true,
      department: { select: { key: true, nameEn: true } },
      role: { select: { key: true, isAdmin: true } },
    },
    orderBy: [{ department: { key: "asc" } }, { displayName: "asc" }],
  });

  return NextResponse.json(users);
}
