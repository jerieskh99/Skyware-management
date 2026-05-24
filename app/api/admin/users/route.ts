import { NextResponse } from "next/server";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

/** GET — all users (active + inactive). Admin only. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      isActive: true,
      lastLoginAt: true,
      role: { select: { key: true, nameEn: true, isAdmin: true } },
      department: { select: { key: true, nameEn: true } },
    },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });

  return NextResponse.json(users);
}

const createSchema = z.object({
  username: z.string().min(2).max(50).trim().regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only"),
  email: z.string().email().max(200).trim().toLowerCase(),
  displayName: z.string().min(1).max(200).trim(),
  password: z.string().min(8).max(200),
  roleKey: z.enum(["employee", "ceo", "cto"]),
  departmentKey: z.enum(["global", "helpdesk", "it", "rnd"]),
});

/** POST — create user. Admin only. Does not log plain-text password. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  const [existingUsername, existingEmail, role, dept] = await Promise.all([
    prisma.user.findUnique({ where: { username: d.username }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: d.email }, select: { id: true } }),
    prisma.role.findUnique({ where: { key: d.roleKey }, select: { id: true } }),
    prisma.department.findUnique({ where: { key: d.departmentKey }, select: { id: true } }),
  ]);

  if (existingUsername) return badRequest([{ message: "Username already taken." }]);
  if (existingEmail) return badRequest([{ message: "Email already in use." }]);
  if (!role || !dept) return badRequest([{ message: "Invalid role or department." }]);

  const passwordHash = await bcryptjs.hash(d.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username: d.username,
        email: d.email,
        displayName: d.displayName,
        passwordHash,
        roleId: role.id,
        departmentId: dept.id,
      },
      select: { id: true, username: true, displayName: true },
    });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "user.created",
      entityType: "User",
      entityId: u.id,
      diff: { username: { old: null, new: d.username }, displayName: { old: null, new: d.displayName } },
    });
    return u;
  });

  return NextResponse.json(user, { status: 201 });
}
