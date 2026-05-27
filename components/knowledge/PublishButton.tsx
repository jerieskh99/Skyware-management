"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  slug: string;
}

/** Admin publish: approved -> published. */
export function PublishButton({ slug }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.publishSuccess") });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
        {t("knowledge.detail.publish")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setError(null);
          setOpen(o);
        }}
        title={t("knowledge.actions.publishConfirmTitle")}
        description={<p>{t("knowledge.actions.publishConfirmBody")}</p>}
        confirmLabel={t("knowledge.detail.publish")}
        cancelLabel={t("common.cancel")}
        destructive={false}
        pending={isPending}
        errorMessage={error}
        onConfirm={confirm}
      />
    </>
  );
}
