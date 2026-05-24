import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { listClients } from "@/lib/clients/queries";
import type { ClientStatus } from "@prisma/client";

const VALID_STATUSES = new Set(["active", "inactive"]);

/** GET — list clients. Admin only. */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || undefined;
  const statusParam = searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as ClientStatus)
      : undefined;

  const clients = await listClients({ search, status });
  return NextResponse.json(clients);
}

const createSchema = z.object({
  companyName: z.string().min(1).max(200).trim(),
  contactPerson: z.string().max(200).trim().optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  israeliTaxId: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(3000).optional(),
});

/** POST — create client + auto-create BillingAccount. Admin only. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { companyName, contactPerson, email, phone, address, israeliTaxId, notes } = parsed.data;

  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: {
        companyName,
        contactPerson: contactPerson || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        israeliTaxId: israeliTaxId || null,
        notes: notes || null,
        createdByUserId: auth.user.id,
      },
    });

    await tx.billingAccount.create({ data: { clientId: c.id } });

    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "client.created",
      entityType: "Client",
      entityId: c.id,
      diff: { companyName: { old: null, new: companyName } },
    });

    return c;
  });

  return NextResponse.json(client, { status: 201 });
}
