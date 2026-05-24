import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { requestAllocationNumber } from "@/lib/receipts/allocation";
import { ReceiptStateError } from "@/lib/receipts/errors";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
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

  try {
    const result = await prisma.$transaction((tx) =>
      requestAllocationNumber(tx, {
        receiptId: id,
        actorUserId: auth.user.id,
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReceiptStateError) {
      if (err.message === "receipt not found") return notFound("Receipt");
      return unprocessable(err.message);
    }
    throw err;
  }
}
