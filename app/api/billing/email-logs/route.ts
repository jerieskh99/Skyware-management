import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";

const listQuerySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((d) => Boolean(d.clientId) || Boolean(d.paymentId), {
    message: "Provide clientId or paymentId.",
  });

/**
 * GET /api/billing/email-logs — admin email history for a client or payment.
 *
 * Requires `clientId` OR `paymentId`. Admin-only. (No feature-flag gate: this
 * is a read-only audit view that should be available wherever billing is.)
 *
 * Returns: { logs: [{ id, kind, status, testMode, toEmail, subject,
 *            language, createdAt }], total, limit, offset }.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    clientId: searchParams.get("clientId") ?? undefined,
    paymentId: searchParams.get("paymentId") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.issues);
  const q = parsed.data;

  const where: Prisma.EmailLogWhereInput = {
    ...(q.clientId ? { clientId: q.clientId } : {}),
    ...(q.paymentId ? { paymentId: q.paymentId } : {}),
  };

  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      select: {
        id: true,
        kind: true,
        status: true,
        testMode: true,
        toEmail: true,
        subject: true,
        language: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.emailLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
