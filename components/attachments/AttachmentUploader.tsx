"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { validateUpload } from "@/lib/storage/upload-policy";

export type UploaderParent =
  | { kind: "job"; jobId: string }
  | { kind: "post"; channelKey: string; postId: string }
  | { kind: "reply"; channelKey: string; postId: string; replyId: string };

interface Props {
  parent: UploaderParent;
  onUploaded?: () => void;
  /** Default visibility for new uploads. */
  defaultVisibility?: "public_in_org" | "admin_only";
}

interface QueueItem {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
  controller?: AbortController;
}

function linkUrl(parent: UploaderParent): string {
  if (parent.kind === "job") return `/api/jobs/${parent.jobId}/attachments`;
  if (parent.kind === "post")
    return `/api/channels/${parent.channelKey}/posts/${parent.postId}/attachments`;
  return `/api/channels/${parent.channelKey}/posts/${parent.postId}/replies/${parent.replyId}/attachments`;
}

let seq = 0;
function nextId() {
  seq += 1;
  return `up-${Date.now().toString(36)}-${seq}`;
}

export function AttachmentUploader({
  parent,
  onUploaded,
  defaultVisibility = "public_in_org",
}: Props) {
  const { t } = useT();
  const { push } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (item: QueueItem) => {
      const v = validateUpload({
        filename: item.file.name,
        contentType: item.file.type || "application/octet-stream",
        contentLength: item.file.size,
      });
      if (!v.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", error: v.error } : q,
          ),
        );
        push({ tone: "error", title: t(`attachments.error.${v.error}`) });
        return;
      }

      const controller = new AbortController();
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "uploading", controller } : q,
        ),
      );

      // 1. Allocate attachment row + presign
      const allocRes = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          filename: item.file.name,
          contentType: item.file.type || "application/octet-stream",
          contentLength: item.file.size,
          visibility: defaultVisibility,
        }),
      }).catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return null;
        return null;
      });
      if (!allocRes || !allocRes.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", error: "alloc_failed" }
              : q,
          ),
        );
        push({ tone: "error", title: t("attachments.error.alloc_failed") });
        return;
      }
      const alloc = (await allocRes.json()) as {
        id: string;
        presignedUrl: string;
        headers: Record<string, string>;
      };

      // 2. Upload to S3 via XHR for progress.
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", alloc.presignedUrl, true);
        for (const [k, v2] of Object.entries(alloc.headers)) {
          if (k.toLowerCase() === "content-length") continue;
          xhr.setRequestHeader(k, v2);
        }
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress } : q)),
          );
        };
        xhr.onerror = () => resolve();
        xhr.onabort = () => resolve();
        xhr.onload = () => resolve();
        controller.signal.addEventListener("abort", () => xhr.abort());
        xhr.send(item.file);
      });

      if (controller.signal.aborted) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "cancelled" } : q,
          ),
        );
        return;
      }

      // 3. Link the attachment to the parent.
      const linkRes = await fetch(linkUrl(parent), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: alloc.id }),
      });
      if (!linkRes.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", error: "link_failed" }
              : q,
          ),
        );
        push({ tone: "error", title: t("attachments.error.link_failed") });
        return;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "done", progress: 100 } : q,
        ),
      );
      push({ tone: "success", title: t("attachments.uploaded") });
      onUploaded?.();
    },
    [defaultVisibility, onUploaded, parent, push, t],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const items: QueueItem[] = arr.map((file) => ({
        id: nextId(),
        file,
        progress: 0,
        status: "queued",
      }));
      setQueue((prev) => [...prev, ...items]);
      for (const it of items) void upload(it);
    },
    [upload],
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function cancel(id: string) {
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        q.controller?.abort();
        return { ...q, status: "cancelled" };
      }),
    );
  }

  function clearDone() {
    setQueue((prev) => prev.filter((q) => q.status !== "done" && q.status !== "cancelled"));
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-sm transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-input bg-muted/30"
        }`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("attachments.dropHint")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {t("attachments.choose")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPick}
          aria-label={t("attachments.choose")}
        />
      </div>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((q) => (
            <li
              key={q.id}
              className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={q.file.name}>
                  {q.file.name}
                </p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
                  <div
                    className={`h-full transition-all ${
                      q.status === "error"
                        ? "bg-destructive"
                        : q.status === "done"
                          ? "bg-emerald-500"
                          : "bg-primary"
                    }`}
                    style={{ width: `${q.progress}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {q.status === "uploading" && `${q.progress}%`}
                  {q.status === "done" && t("attachments.uploaded")}
                  {q.status === "cancelled" && t("attachments.cancelled")}
                  {q.status === "error" && (q.error ? t(`attachments.error.${q.error}`) : t("attachments.error.unknown"))}
                </p>
              </div>
              {(q.status === "uploading" || q.status === "queued") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => cancel(q.id)}
                  aria-label={t("attachments.cancel")}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </li>
          ))}
          {queue.some((q) => q.status === "done" || q.status === "cancelled") && (
            <li className="text-right">
              <Button type="button" variant="ghost" size="sm" onClick={clearDone}>
                {t("attachments.clearDone")}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
