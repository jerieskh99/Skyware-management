import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getClientDetail } from "@/lib/clients/queries";

interface Params { params: Promise<{ id: string }> }

/** GET — client detail with billing account and counts. Admin only. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const client = await getClientDetail(id);
  if (!client) return notFound("Client");

  return NextResponse.json(client);
}

const patchSchema = z.object({
  companyName: z.string().min(1).max(200).trim().optional(),
  contactPerson: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  israeliTaxId: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
});

/** PATCH — update client fields. Admin only. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id } = await params;
  const existing = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      email: true,
      phone: true,
      address: true,
      israeliTaxId: true,
      status: true,
      notes: true,
    },
  });
  if (!existing) return notFound("Client");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const data = parsed.data;

  // Build update payload containing only provided keys
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      const normalized = v === "" ? null : v;
      updateData[k] = normalized;
      diff[k] = { old: (existing as Record<string, unknown>)[k] ?? null, new: normalized };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.client.update({ where: { id }, data: updateData });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "client.updated",
      entityType: "Client",
      entityId: id,
      diff,
    });

    return u;
  });

  return NextResponse.json(updated);
}
