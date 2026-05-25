"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  receiptId: string;
}

export function RequestAllocationButton({ receiptId }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await fetch(`/api/receipts/${receiptId}/allocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 503) {
        toast.push({ tone: "error", title: t("receipts.finalize.disabledToast") });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ tone: "error", title: data.error ?? t("common.error") });
        return;
      }
      toast.push({ tone: "success", title: t("receipts.allocation.requestSuccess") });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={isPending}>
      {isPending ? t("common.working") : t("receipts.detail.requestAllocation")}
    </Button>
  );
}
