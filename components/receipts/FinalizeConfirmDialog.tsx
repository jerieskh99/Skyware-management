"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string;
}

export function FinalizeConfirmDialog({ open, onOpenChange, receiptId }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setChecked(false);
    setError(null);
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  async function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/receipts/${receiptId}/finalize`, {
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

      toast.push({ tone: "success", title: t("receipts.finalize.success") });
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("receipts.finalize.title")}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-foreground">
              <p>{t("receipts.finalize.body")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4"
          />
          <span>{t("receipts.finalize.checkbox")}</span>
        </label>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            {t("receipts.finalize.cancel")}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={confirm}
            disabled={isPending || !checked}
          >
            {isPending ? t("common.working") : t("receipts.finalize.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
