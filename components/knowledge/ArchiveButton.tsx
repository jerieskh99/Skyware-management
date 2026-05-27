"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  slug: string;
}

/** Admin archive: published -> archived (standard takedown). */
export function ArchiveButton({ slug }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.archiveSuccess") });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Archive className="me-1.5 h-3.5 w-3.5" />
        {t("knowledge.detail.archive")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setError(null);
          setOpen(o);
        }}
        title={t("knowledge.actions.archiveConfirmTitle")}
        description={<p>{t("knowledge.actions.archiveConfirmBody")}</p>}
        confirmLabel={t("knowledge.detail.archive")}
        cancelLabel={t("common.cancel")}
        destructive
        pending={isPending}
        errorMessage={error}
        onConfirm={confirm}
      />
    </>
  );
}
