"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

interface Props {
  jobId: string;
}

/**
 * Server-rendered jobs detail page mounts this for reviewed jobs.
 * POSTs `/api/jobs/[id]/create-knowledge-article` and on success navigates
 * the user directly into the editor for the new draft so they can fill in
 * the body while the lesson is fresh. The legacy behavior (push to the
 * view page after creation) left the user staring at the auto-generated
 * skeleton with no obvious next step.
 */
export function CreateKnowledgeFromJobButton({ jobId }: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}/create-knowledge-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ tone: "error", title: data.error ?? t("common.error") });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { slug?: string };
      toast.push({
        tone: "success",
        title: t("markDone.createKnowledgeArticleSuccess"),
      });
      if (data.slug) {
        router.push(`/knowledge/${data.slug}/edit`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={isPending}>
      <BookOpen className="me-1.5 h-3.5 w-3.5" />
      {isPending
        ? t("common.working")
        : t("myJobs.createKnowledgeArticleButton")}
    </Button>
  );
}
