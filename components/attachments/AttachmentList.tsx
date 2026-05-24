"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentItem, type AttachmentDto } from "./AttachmentItem";

export type ParentKind = "job" | "post" | "reply";

interface Props {
  parent:
    | { kind: "job"; jobId: string }
    | { kind: "post"; channelKey: string; postId: string }
    | { kind: "reply"; channelKey: string; postId: string; replyId: string };
  currentUserId: string;
  isAdmin: boolean;
  /** External signal: bump this to refresh. */
  refreshKey?: number;
}

function listUrl(parent: Props["parent"]): string {
  if (parent.kind === "job") return `/api/jobs/${parent.jobId}/attachments`;
  if (parent.kind === "post")
    return `/api/channels/${parent.channelKey}/posts/${parent.postId}/attachments`;
  return `/api/channels/${parent.channelKey}/posts/${parent.postId}/replies/${parent.replyId}/attachments`;
}

function deleteUrl(parent: Props["parent"], attachmentId: string): string {
  if (parent.kind === "job")
    return `/api/jobs/${parent.jobId}/attachments/${attachmentId}`;
  if (parent.kind === "post")
    return `/api/channels/${parent.channelKey}/posts/${parent.postId}/attachments/${attachmentId}`;
  return `/api/channels/${parent.channelKey}/posts/${parent.postId}/replies/${parent.replyId}/attachments/${attachmentId}`;
}

export function AttachmentList({ parent, currentUserId, isAdmin, refreshKey = 0 }: Props) {
  const { t } = useT();
  const { push } = useToast();
  const [items, setItems] = useState<AttachmentDto[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    const res = await fetch(listUrl(parent));
    if (!res.ok) {
      push({ tone: "error", title: t("attachments.loadFailed") });
      setItems([]);
      return;
    }
    const data = (await res.json()) as AttachmentDto[];
    setItems(data);
  }, [parent, push, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function doDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(deleteUrl(parent, id), { method: "DELETE" });
      if (!res.ok) {
        push({ tone: "error", title: t("attachments.deleteFailed") });
        return;
      }
      push({ tone: "success", title: t("attachments.deleted") });
      setConfirmId(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  if (items === null) {
    return (
      <ul className="space-y-2" aria-busy="true">
        <li><Skeleton className="h-10 w-full" /></li>
        <li><Skeleton className="h-10 w-full" /></li>
      </ul>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("attachments.empty")}</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const canDelete = isAdmin || item.uploadedBy.id === currentUserId;
          return (
            <AttachmentItem
              key={item.id}
              item={item}
              canDelete={canDelete}
              onDelete={(id) => setConfirmId(id)}
              pendingDelete={deleting && confirmId === item.id}
            />
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={t("attachments.deleteConfirmTitle")}
        description={t("attachments.deleteConfirmBody")}
        confirmLabel={t("attachments.delete")}
        pending={deleting}
        onConfirm={() => confirmId && doDelete(confirmId)}
      />
    </>
  );
}
