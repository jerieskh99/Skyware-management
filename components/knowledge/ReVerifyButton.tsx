"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  slug: string;
}

/** Bump `lastVerifiedAt` to now. Available on published articles per permissions. */
export function ReVerifyButton({ slug }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/re-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.reVerifySuccess") });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ShieldCheck className="me-1.5 h-3.5 w-3.5" />
        {t("knowledge.detail.reVerify")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setError(null);
          setOpen(o);
        }}
        title={t("knowledge.actions.reVerifyConfirmTitle")}
        description={<p>{t("knowledge.actions.reVerifyConfirmBody")}</p>}
        confirmLabel={t("knowledge.detail.reVerify")}
        cancelLabel={t("common.cancel")}
        destructive={false}
        pending={isPending}
        errorMessage={error}
        onConfirm={confirm}
      />
    </>
  );
}
