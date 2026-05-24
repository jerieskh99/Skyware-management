import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({
  displayName: z.string().min(1).max(200).trim().optional(),
  roleKey: z.enum(["employee", "ceo", "cto"]).optional(),
  departmentKey: z.enum(["global", "helpdesk", "it", "rnd"]).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH — update user profile. Admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, displayName: true, isActive: true,
      role: { select: { key: true } },
      department: { select: { key: true } },
    },
  });
  if (!existing) return notFound("User");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  // Guard: admin cannot deactivate their own account or downgrade their own role.
  if (id === auth.user.id) {
    if (d.isActive === false) {
      return badRequest([{ message: "You cannot deactivate your own account." }]);
    }
    if (d.roleKey !== undefined && d.roleKey !== existing.role.key) {
      return badRequest([{ message: "You cannot change your own role." }]);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  if (d.displayName !== undefined) {
    updateData.displayName = d.displayName;
    diff.displayName = { old: existing.displayName, new: d.displayName };
  }
  if (d.isActive !== undefined) {
    updateData.isActive = d.isActive;
    diff.isActive = { old: existing.isActive, new: d.isActive };
  }
  if (d.roleKey !== undefined) {
    const role = await prisma.role.findUnique({ where: { key: d.roleKey }, select: { id: true } });
    if (!role) return badRequest([{ message: "Invalid role." }]);
    updateData.roleId = role.id;
    diff.roleKey = { old: existing.role.key, new: d.roleKey };
  }
  if (d.departmentKey !== undefined) {
    const dept = await prisma.department.findUnique({ where: { key: d.departmentKey }, select: { id: true } });
    if (!dept) return badRequest([{ message: "Invalid department." }]);
    updateData.departmentId = dept.id;
    diff.departmentKey = { old: existing.department.key, new: d.departmentKey };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: updateData, select: { id: true } });
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "user.updated",
      entityType: "User",
      entityId: id,
      diff,
    });
    return u;
  });

  return NextResponse.json(updated);
}
