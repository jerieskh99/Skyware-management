"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type {
  KnowledgeArticleStatus,
  KnowledgeArticleType,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { FinalizeButton } from "./FinalizeButton";
import { PublishButton } from "./PublishButton";
import { ArchiveButton } from "./ArchiveButton";
import { RescindButton } from "./RescindButton";
import { ReVerifyButton } from "./ReVerifyButton";
import { UnApproveButton } from "./UnApproveButton";
import { UnArchiveButton } from "./UnArchiveButton";
import { AiStructureDialog } from "./AiStructureDialog";
import { ReviewDecisionDialog } from "./ReviewDecisionDialog";

interface Props {
  slug: string;
  title: string;
  status: KnowledgeArticleStatus;
  kind: KnowledgeArticleType;
  authorUserId: string;
  currentUserId: string;
  isAdmin: boolean;
  aiStructuringEnabled: boolean;
}

/**
 * Renders the full action bar shown above the article body on the detail
 * page. Each individual action is its own button so it can mount its own
 * confirm dialog. UI visibility mirrors the server-side predicates in
 * `lib/knowledge/permissions.ts`; the API will still re-check.
 */
export function ArticleDetailActions({
  slug,
  title,
  status,
  kind,
  authorUserId,
  currentUserId,
  isAdmin,
  aiStructuringEnabled,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const toast = useToast();
  const isAuthor = authorUserId === currentUserId;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const canEdit = isAdmin || (isAuthor && (status === "draft" || status === "ai_structured"));
  const canSubmit = (isAdmin || isAuthor) && (status === "draft" || status === "ai_structured");
  const canRunAi = (isAdmin || isAuthor) && status === "draft";
  const canDecideReview = isAdmin && status === "pending_review" && authorUserId !== currentUserId;
  const canPublish = isAdmin && status === "approved";
  const canArchive = isAdmin && status === "published";
  const canRescind = isAdmin && status === "published";
  const canReVerify =
    status === "published" &&
    (isAdmin ||
      kind === "external_reference" ||
      kind === "troubleshooting_note" ||
      kind === "how_to_guide");
  const canUnApprove = isAdmin && status === "approved";
  const canUnArchive = isAdmin && status === "archived";
  const canDelete = status === "draft" && (isAdmin || isAuthor);

  function confirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const res = await fetch(`/api/knowledge/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(data.error ?? t("common.error"));
        return;
      }
      toast.push({ tone: "success", title: t("knowledge.actions.deleteSuccess") });
      setDeleteOpen(false);
      router.push("/knowledge");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEdit && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/knowledge/${slug}/edit`}>
            <Pencil className="me-1.5 h-3.5 w-3.5" />
            {t("knowledge.detail.edit")}
          </Link>
        </Button>
      )}
      {canSubmit && <FinalizeButton slug={slug} />}
      {canRunAi && (
        <AiStructureDialog slug={slug} disabled={!aiStructuringEnabled} />
      )}
      {canDecideReview && (
        <>
          <Button size="sm" onClick={() => setReviewOpen(true)}>
            {t("knowledge.detail.review")}
          </Button>
          <ReviewDecisionDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            slug={slug}
            articleTitle={title}
          />
        </>
      )}
      {canPublish && <PublishButton slug={slug} />}
      {canArchive && <ArchiveButton slug={slug} />}
      {canRescind && <RescindButton slug={slug} />}
      {canReVerify && <ReVerifyButton slug={slug} />}
      {canUnApprove && <UnApproveButton slug={slug} />}
      {canUnArchive && <UnArchiveButton slug={slug} />}
      {canDelete && (
        <>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            {t("knowledge.detail.delete")}
          </Button>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={(o) => {
              if (!o) setDeleteError(null);
              setDeleteOpen(o);
            }}
            title={t("knowledge.actions.deleteConfirmTitle")}
            description={<p>{t("knowledge.actions.deleteConfirmBody")}</p>}
            confirmLabel={t("knowledge.detail.delete")}
            cancelLabel={t("common.cancel")}
            destructive
            pending={isDeleting}
            errorMessage={deleteError}
            onConfirm={confirmDelete}
          />
        </>
      )}
    </div>
  );
}
