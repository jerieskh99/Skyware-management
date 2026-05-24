import { NextResponse } from "next/server";
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
import { finalizeReceipt } from "@/lib/receipts/finalize";
import {
  ReceiptStateError,
  ReceiptValidationError,
} from "@/lib/receipts/errors";

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
    const finalized = await prisma.$transaction((tx) =>
      finalizeReceipt(tx, { id, actorUserId: auth.user.id }),
    );
    return NextResponse.json(finalized);
  } catch (err) {
    if (err instanceof ReceiptValidationError) return badRequest([{ message: err.message }]);
    if (err instanceof ReceiptStateError) {
      if (err.message === "receipt not found") return notFound("Receipt");
      return unprocessable(err.message);
    }
    throw err;
  }
}
