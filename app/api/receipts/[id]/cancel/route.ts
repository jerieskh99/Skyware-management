import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  notFound,
  unprocessable,
  badRequest,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { cancelReceipt } from "@/lib/receipts/cancel";
import { ReceiptStateError } from "@/lib/receipts/errors";

interface Params {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .optional();

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const enabled = await getFeatureFlag("receipt_finalize_enabled");
  if (!enabled) {
    return NextResponse.json(
      { error: "Receipts finalization is disabled" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const raw = await req.json().catch(() => undefined);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const reason = parsed.data?.reason;

  try {
    const updated = await prisma.$transaction((tx) =>
      cancelReceipt(tx, {
        id,
        actorUserId: auth.user.id,
        ...(reason ? { reason } : {}),
      }),
    );
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ReceiptStateError) {
      if (err.message === "receipt not found") return notFound("Receipt");
      return unprocessable(err.message);
    }
    throw err;
  }
}
