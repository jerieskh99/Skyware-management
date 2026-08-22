"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReceiptDocument } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Download, FileEdit, Trash2, FileCheck, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { RequestAllocationButton } from "./RequestAllocationButton";

// Heavy, click-gated dialogs: split out of the receipt detail route's initial
// bundle. They render nothing until their `open` state is toggled, so a null
// loading state keeps the visible behavior identical.
const EditDraftDrawer = dynamic(
  () => import("./EditDraftDrawer").then((m) => m.EditDraftDrawer),
  { ssr: false },
);
const FinalizeConfirmDialog = dynamic(
  () => import("./FinalizeConfirmDialog").then((m) => m.FinalizeConfirmDialog),
  { ssr: false },
);
const IssueCreditNoteDialog = dynamic(
  () => import("./IssueCreditNoteDialog").then((m) => m.IssueCreditNoteDialog),
  { ssr: false },
);

interface Props {
  receipt: ReceiptDocument;
  /** True when allocation request button should appear (server-side decision). */
  showRequestAllocation: boolean;
}

export function ReceiptDetailActions({ receipt, showRequestAllocation }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function openPdf() {
    window.open(`/api/receipts/${receipt.id}/pdf`, "_blank", "noopener,noreferrer");
  }

  function confirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("receipts.delete.success") });
      setDeleteOpen(false);
      router.push("/receipts");
      router.refresh();
    });
  }

  const isDraft = receipt.status === "draft";
  const isFinalized = receipt.status === "finalized";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" variant="outline" onClick={openPdf}>
        <Download className="me-1.5 h-3.5 w-3.5" />
        {t("receipts.detail.downloadPdf")}
      </Button>

      {isDraft && (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <FileEdit className="me-1.5 h-3.5 w-3.5" />
            {t("receipts.detail.edit")}
          </Button>
          <Button size="sm" onClick={() => setFinalizeOpen(true)}>
            <FileCheck className="me-1.5 h-3.5 w-3.5" />
            {t("receipts.detail.finalize")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            {t("receipts.detail.delete")}
          </Button>
        </>
      )}

      {isFinalized && (
        <>
          {showRequestAllocation && <RequestAllocationButton receiptId={receipt.id} />}
          <Button size="sm" variant="outline" onClick={() => setCreditOpen(true)}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            {t("receipts.detail.creditNote")}
          </Button>
        </>
      )}

      {isDraft && (
        <>
          <EditDraftDrawer
            open={editOpen}
            onOpenChange={setEditOpen}
            receipt={receipt}
          />
          <FinalizeConfirmDialog
            open={finalizeOpen}
            onOpenChange={setFinalizeOpen}
            receiptId={receipt.id}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={(o) => {
              if (!o) setDeleteError(null);
              setDeleteOpen(o);
            }}
            title={t("receipts.delete.title")}
            description={<p>{t("receipts.delete.body")}</p>}
            confirmLabel={t("receipts.delete.confirm")}
            cancelLabel={t("receipts.delete.cancel")}
            destructive
            pending={isDeleting}
            errorMessage={deleteError}
            onConfirm={confirmDelete}
          />
        </>
      )}

      {isFinalized && (
        <IssueCreditNoteDialog
          open={creditOpen}
          onOpenChange={setCreditOpen}
          receiptId={receipt.id}
        />
      )}
    </div>
  );
}
