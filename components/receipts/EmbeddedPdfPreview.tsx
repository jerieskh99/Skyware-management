"use client";

import { useState } from "react";
import { RefreshCw, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

interface Props {
  receiptId: string;
  /** Optional cache-bust seed (e.g., receipt.updatedAt) so the preview refetches on parent refresh. */
  initialCacheBuster?: string | number;
}

/**
 * PDF preview embed.
 *
 * Uses <object> instead of <iframe> for two reasons:
 *   1. <object> with type="application/pdf" gives every browser (Chrome,
 *      Firefox, Safari, Edge) the strongest hint that the response should
 *      be rendered by the built-in PDF viewer rather than downloaded.
 *   2. <object> exposes a children fallback path. When the browser cannot
 *      render the PDF inline (older Safari, sandbox restrictions, blocked
 *      X-Frame-Options on the response), the fallback download link
 *      becomes visible automatically.
 *
 * The response is gated by next.config.ts X-Frame-Options=SAMEORIGIN so
 * same-origin embedding works. A full dev-server restart is required after
 * editing next.config.ts; hot reload does not re-evaluate the headers
 * function.
 */
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
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <a href={src} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="me-1.5 h-3 w-3" />
              {t("receipts.detail.openInNewTab")}
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            className="h-7 text-xs"
          >
            <RefreshCw className="me-1.5 h-3 w-3" />
            {t("receipts.detail.refreshPreview")}
          </Button>
        </div>
      </header>
      <div className="min-h-[800px] flex-1">
        <object
          key={cb}
          data={src}
          type="application/pdf"
          className="h-full min-h-[800px] w-full rounded-b-xl border-0"
        >
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
            <p>{t("receipts.detail.previewUnsupported")}</p>
            <Button asChild size="sm" variant="outline">
              <a href={src} download>
                <Download className="me-1.5 h-3.5 w-3.5" />
                {t("receipts.detail.downloadPdf")}
              </a>
            </Button>
          </div>
        </object>
      </div>
    </div>
  );
}
