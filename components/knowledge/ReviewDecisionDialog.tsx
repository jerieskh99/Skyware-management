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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

type Decision = "approved" | "changes_requested" | "rejected";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  articleTitle: string;
}

export function ReviewDecisionDialog({
  open,
  onOpenChange,
  slug,
  articleTitle,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [decision, setDecision] = useState<Decision>("approved");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (decision !== "approved" && !comment.trim()) {
      setError(t("knowledge.review.commentRequired"));
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${slug}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("common.error"));
        return;
      }
      toast.push({
        tone: "success",
        title: t(`knowledge.review.decision.${decision}Success`),
      });
      onOpenChange(false);
      setComment("");
      setDecision("approved");
      router.refresh();
    });
  }

  function reset(o: boolean) {
    if (!o) {
      setError(null);
      setComment("");
      setDecision("approved");
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("knowledge.review.decideTitle")}</DialogTitle>
          <DialogDescription className="truncate">{articleTitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("knowledge.review.decision.label")}
            </legend>
            <div className="space-y-1.5">
              {(["approved", "changes_requested", "rejected"] as Decision[]).map((d) => (
                <label
                  key={d}
                  className="flex items-start gap-2 rounded-md border border-input p-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40"
                >
                  <input
                    type="radio"
                    name="decision"
                    value={d}
                    checked={decision === d}
                    onChange={() => setDecision(d)}
                    disabled={isPending}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <p className="font-medium">{t(`knowledge.review.decision.${d}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`knowledge.review.decision.${d}Help`)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("knowledge.review.decision.comment")}
              {decision !== "approved" && (
                <span className="ms-1 text-destructive">*</span>
              )}
            </label>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isPending}
              placeholder={t("knowledge.review.decision.commentPlaceholder")}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => reset(false)}
              disabled={isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.working") : t("knowledge.review.submitDecision")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
