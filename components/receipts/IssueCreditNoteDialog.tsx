"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string;
}

export function IssueCreditNoteDialog({ open, onOpenChange, receiptId }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(o: boolean) {
    if (!o) setError(null);
    onOpenChange(o);
  }

  async function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/receipts/${receiptId}/credit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 503) {
        toast.push({ tone: "error", title: t("receipts.finalize.disabledToast") });
        handleOpenChange(false);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }

      const created = (await res.json()) as { id: string };
      toast.push({ tone: "success", title: t("receipts.creditNote.success") });
      handleOpenChange(false);
      router.push(`/receipts/${created.id}`);
      router.refresh();
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("receipts.creditNote.title")}
      description={<p>{t("receipts.creditNote.body")}</p>}
      confirmLabel={t("receipts.creditNote.confirm")}
      cancelLabel={t("receipts.creditNote.cancel")}
      destructive={false}
      pending={isPending}
      errorMessage={error}
      onConfirm={confirm}
    />
  );
}
