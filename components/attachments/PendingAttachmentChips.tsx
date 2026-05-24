"use client";

import { useCallback, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { validateUpload } from "@/lib/storage/upload-policy";

interface PendingItem {
  attachmentId: string;
  filename: string;
  progress: number;
  status: "uploading" | "done" | "error";
}

interface Props {
  /** Receives the attachment ids that have been fully uploaded so far. */
  onIdsChange?: (ids: string[]) => void;
  defaultVisibility?: "public_in_org" | "admin_only";
}

let seq = 0;
function nextKey() {
  seq += 1;
  return `pend-${Date.now().toString(36)}-${seq}`;
}

/**
 * Upload-only widget: PUTs files to S3 and surfaces the resulting Attachment
 * ids upward. The parent component is responsible for linking them once the
 * post/reply is created.
 */
export function PendingAttachmentChips({
  onIdsChange,
  defaultVisibility = "public_in_org",
}: Props) {
  const { t } = useT();
  const { push } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Array<PendingItem & { key: string }>>([]);

  const emit = useCallback(
    (next: Array<PendingItem & { key: string }>) => {
      onIdsChange?.(
        next.filter((i) => i.status === "done").map((i) => i.attachmentId),
      );
    },
    [onIdsChange],
  );

  const upload = useCallback(
    async (file: File, key: string) => {
      const v = validateUpload({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentLength: file.size,
      });
      if (!v.ok) {
        push({ tone: "error", title: t(`attachments.error.${v.error}`) });
        setItems((prev) => {
          const next = prev.filter((i) => i.key !== key);
          emit(next);
          return next;
        });
        return;
      }

      const allocRes = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          contentLength: file.size,
          visibility: defaultVisibility,
        }),
      });
      if (!allocRes.ok) {
        push({ tone: "error", title: t("attachments.error.alloc_failed") });
        setItems((prev) => {
          const next = prev.map((i) =>
            i.key === key ? { ...i, status: "error" as const } : i,
          );
          emit(next);
          return next;
        });
        return;
      }
      const alloc = (await allocRes.json()) as {
        id: string;
        presignedUrl: string;
        headers: Record<string, string>;
      };

      setItems((prev) =>
        prev.map((i) =>
          i.key === key ? { ...i, attachmentId: alloc.id } : i,
        ),
      );

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
          setItems((prev) =>
            prev.map((i) => (i.key === key ? { ...i, progress } : i)),
          );
        };
        xhr.onload = () => resolve();
        xhr.onerror = () => resolve();
        xhr.send(file);
      });

      setItems((prev) => {
        const next = prev.map((i) =>
          i.key === key
            ? { ...i, status: "done" as const, progress: 100, attachmentId: alloc.id }
            : i,
        );
        emit(next);
        return next;
      });
    },
    [defaultVisibility, emit, push, t],
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const newItems = Array.from(files).map((f) => ({
      key: nextKey(),
      attachmentId: "",
      filename: f.name,
      progress: 0,
      status: "uploading" as const,
    }));
    setItems((prev) => [...prev, ...newItems]);
    for (let i = 0; i < files.length; i += 1) {
      const k = newItems[i]!.key;
      void upload(files[i]!, k);
    }
    e.target.value = "";
  }

  function remove(key: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.key !== key);
      emit(next);
      return next;
    });
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="me-1.5 h-3.5 w-3.5" aria-hidden />
        {t("attachments.attach")}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onPick}
        aria-label={t("attachments.choose")}
      />
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li
              key={i.key}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-xs"
            >
              <span className="max-w-[16ch] truncate" title={i.filename}>
                {i.filename}
              </span>
              {i.status === "uploading" && (
                <span className="text-muted-foreground">{i.progress}%</span>
              )}
              {i.status === "error" && (
                <span className="text-destructive">{t("attachments.error.unknown")}</span>
              )}
              <button
                type="button"
                onClick={() => remove(i.key)}
                aria-label={t("attachments.cancel")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
