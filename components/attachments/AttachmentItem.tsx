"use client";

import {
  FileText,
  Image as ImageIcon,
  File,
  FileSpreadsheet,
  Archive,
  Trash2,
  Lock,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  visibility: "public_in_org" | "admin_only";
  createdAt: string;
  uploadedBy: { id: string; username: string; displayName: string };
  url: string;
}

interface Props {
  item: AttachmentDto;
  canDelete: boolean;
  onDelete?: (id: string) => void;
  pendingDelete?: boolean;
}

function pickIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  if (mime.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml"))
    return FileSpreadsheet;
  if (mime === "application/zip" || mime === "application/x-zip-compressed")
    return Archive;
  if (mime.startsWith("text/") || mime.startsWith("application/msword")) return FileText;
  return File;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentItem({ item, canDelete, onDelete, pendingDelete }: Props) {
  const { t } = useT();
  const Icon = pickIcon(item.mimeType);
  const visibilityLabel =
    item.visibility === "admin_only"
      ? t("attachments.visibilityAdmin")
      : t("attachments.visibilityPublic");

  return (
    <li className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:underline"
          title={item.fileName}
        >
          {item.fileName}
        </a>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(item.byteSize)}</span>
          <span>·</span>
          <span>{item.uploadedBy.displayName}</span>
          {item.visibility === "admin_only" && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Lock className="h-3 w-3" aria-hidden />
              {visibilityLabel}
            </span>
          )}
        </div>
      </div>
      {canDelete && onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(item.id)}
          disabled={pendingDelete}
          aria-label={t("attachments.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
    </li>
  );
}
