"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
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
  slug: string;
  /** When true, the action is disabled because the AI feature flag is off. */
  disabled?: boolean;
}

/**
 * Triggers `/api/knowledge/[slug]/ai-structure`, which runs the dry-run
 * structuring path and writes `aiStructuredSnapshot` + `rawInputSnapshot`
 * to the article. After the call returns, we navigate to the
 * side-by-side review page where the author can accept or reject.
 */
export function AiStructureDialog({ slug, disabled = false }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/ai-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.runAiSuccess") });
      setOpen(false);
      router.push(`/knowledge/${slug}/ai`);
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="me-1.5 h-3.5 w-3.5" />
        {t("knowledge.detail.runAi")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setError(null);
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("knowledge.ai.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("knowledge.ai.confirmBody")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t("knowledge.ai.drySetNote")}
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={run} disabled={isPending}>
              {isPending ? t("common.working") : t("knowledge.detail.runAi")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
