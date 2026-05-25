"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

interface Props {
  receiptId: string;
  /** Optional cache-bust seed (e.g., receipt.updatedAt) so the iframe refetches on parent refresh. */
  initialCacheBuster?: string | number;
}

export function EmbeddedPdfPreview({ receiptId, initialCacheBuster }: Props) {
  const { t } = useT();
  const [cb, setCb] = useState<string>(
    initialCacheBuster !== undefined ? String(initialCacheBuster) : String(Date.now()),
  );

  const src = `/api/receipts/${receiptId}/pdf?cb=${encodeURIComponent(cb)}`;

  function refresh() {
    setCb(String(Date.now()));
  }

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-semibold">
          {t("receipts.detail.summary.previewHeading")}
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          className="h-7 text-xs"
        >
          <RefreshCw className="me-1.5 h-3 w-3" />
          {t("receipts.detail.refreshPreview")}
        </Button>
      </header>
      <div className="min-h-[800px] flex-1">
        <iframe
          key={cb}
          src={src}
          title={t("receipts.detail.summary.previewHeading")}
          className="h-full min-h-[800px] w-full rounded-b-xl border-0"
        />
      </div>
    </div>
  );
}
