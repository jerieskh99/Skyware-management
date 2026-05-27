"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  slug: string;
}

/**
 * Admin rescind: published -> archived, but with a required note
 * stating WHY the rescission happened. Stronger than a normal archive.
 */
export function RescindButton({ slug }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!note.trim()) {
      setError(t("knowledge.actions.rescindNoteRequired"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/rescind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.rescindSuccess") });
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        <AlertOctagon className="me-1.5 h-3.5 w-3.5" />
        {t("knowledge.detail.rescind")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setError(null);
            setNote("");
          }
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("knowledge.actions.rescindConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("knowledge.actions.rescindConfirmBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("knowledge.actions.rescindNoteLabel")}
            </label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
              placeholder={t("knowledge.actions.rescindNotePlaceholder")}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={isPending}>
              {isPending ? t("common.working") : t("knowledge.detail.rescind")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
