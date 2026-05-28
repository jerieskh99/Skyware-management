"use client";

import { useEffect, useState, useCallback } from "react";
import type { EmailKind, EmailDeliveryStatus } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { formatDateTimeIL } from "@/lib/format";
import { Mail, Loader2 } from "lucide-react";

interface EmailLogRow {
  id: string;
  kind: EmailKind;
  status: EmailDeliveryStatus;
  testMode: boolean;
  toEmail: string;
  subject: string;
  language: string;
  createdAt: string;
}

interface Props {
  clientId?: string;
  paymentId?: string;
  /** Cap rows fetched. Defaults to 20. */
  limit?: number;
  /** Bump this to force a refetch (e.g. after a manual send). */
  refreshKey?: number;
}

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  bounced: "bg-red-50 text-red-700 border-red-200",
};

/**
 * Compact email-history table for a client or payment. Reads
 * `GET /api/billing/email-logs` (admin-only, no feature gate). Surfaces the
 * test-mode flag on every row so it is clear which sends were captured rather
 * than delivered.
 */
export function EmailHistory({ clientId, paymentId, limit = 20, refreshKey = 0 }: Props) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<EmailLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (paymentId) params.set("paymentId", paymentId);
    params.set("limit", String(limit));
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/email-logs?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = (await res.json()) as { logs: EmailLogRow[] };
      setRows(data.logs);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, paymentId, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading && rows === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center">
        <Mail className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("emailHistory.empty")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("emailHistory.colKind")}</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("emailHistory.colStatus")}</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("emailHistory.colSubject")}</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground whitespace-nowrap">{t("emailHistory.colDate")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((log) => (
              <tr key={log.id} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{log.kind}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLES[log.status] ?? "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {log.status}
                    </span>
                    {log.testMode && (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {t("common.testMode")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 max-w-[260px] truncate" dir="auto">{log.subject}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {formatDateTimeIL(new Date(log.createdAt), locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
