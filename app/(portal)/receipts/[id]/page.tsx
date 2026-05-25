import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getReceipt } from "@/lib/receipts/queries";
import {
  getActiveCountryCode,
  getCountryProfile,
} from "@/lib/compliance/country";
import { getT } from "@/lib/i18n/server";

import { PageHeader } from "@/components/shared/PageHeader";
import { ReceiptStatusChip } from "@/components/receipts/ReceiptStatusChip";
import { ReceiptTypeChip } from "@/components/receipts/ReceiptTypeChip";
import { DocumentSummary } from "@/components/receipts/DocumentSummary";
import { EmbeddedPdfPreview } from "@/components/receipts/EmbeddedPdfPreview";
import { ReceiptDetailActions } from "@/components/receipts/ReceiptDetailActions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceiptDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();

  const [client, settings, creditedSource, creditedBy] = await Promise.all([
    prisma.client.findUnique({
      where: { id: receipt.clientId },
      select: { id: true, companyName: true },
    }),
    prisma.companySettings.findFirst({ select: { country: true } }),
    receipt.creditedReceiptId
      ? prisma.receiptDocument.findUnique({
          where: { id: receipt.creditedReceiptId },
          select: {
            id: true,
            documentNumber: true,
            documentNumberYear: true,
            type: true,
          },
        })
      : Promise.resolve(null),
    prisma.receiptDocument.findMany({
      where: { creditedReceiptId: receipt.id },
      select: {
        id: true,
        documentNumber: true,
        documentNumberYear: true,
        status: true,
        type: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const { t } = await getT();

  // Show Request allocation only when allocation is not_required and the
  // active country profile threshold applies to this document type at issueDate.
  // The lib will recompute server-side on click; this is just UI gating.
  const profile = getCountryProfile(getActiveCountryCode(settings?.country));
  const threshold = profile.getAllocationThreshold(new Date(receipt.issueDate), receipt.type);
  const showRequestAllocation =
    receipt.status === "finalized" &&
    receipt.allocationStatus === "not_required" &&
    threshold !== null &&
    (receipt.amountBeforeVat ?? 0) >= threshold;

  const documentNumberLabel =
    receipt.documentNumber !== null && receipt.documentNumberYear !== null
      ? `${receipt.documentNumberYear}-${receipt.documentNumber}`
      : t("receipts.detail.draftBadge");

  return (
    <div className="space-y-5">
      <Link
        href="/receipts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("receipts.detail.back")}
      </Link>

      <PageHeader
        title={documentNumberLabel}
        description={client?.companyName ?? "—"}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <ReceiptTypeChip type={receipt.type} />
            <ReceiptStatusChip status={receipt.status} />
          </div>
        }
        actions={
          <ReceiptDetailActions
            receipt={receipt}
            showRequestAllocation={showRequestAllocation}
          />
        }
      />

      {receipt.status === "cancelled" && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-amber-800">{t("receipts.detail.cancelledNotice")}</p>
        </div>
      )}

      {creditedSource && (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("receipts.detail.credits.crediting")}
          </p>
          <Link
            href={`/receipts/${creditedSource.id}`}
            className="mt-0.5 inline-block font-medium hover:underline"
          >
            {creditedSource.documentNumberYear !== null &&
            creditedSource.documentNumber !== null
              ? `${creditedSource.documentNumberYear}-${creditedSource.documentNumber}`
              : creditedSource.id}{" "}
            <span className="text-xs text-muted-foreground">
              ({t(`receipts.type.${creditedSource.type}`)})
            </span>
          </Link>
        </div>
      )}

      {creditedBy.length > 0 && (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("receipts.detail.credits.heading")}
          </p>
          <ul className="mt-1 space-y-1">
            {creditedBy.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/receipts/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.documentNumberYear !== null && c.documentNumber !== null
                    ? `${c.documentNumberYear}-${c.documentNumber}`
                    : t("receipts.detail.draftBadge")}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({t(`receipts.type.${c.type}`)})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <DocumentSummary receipt={receipt} />
        <EmbeddedPdfPreview
          receiptId={receipt.id}
          initialCacheBuster={new Date(receipt.updatedAt).getTime()}
        />
      </div>
    </div>
  );
}
