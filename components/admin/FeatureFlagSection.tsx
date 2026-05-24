"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

interface FlagRow {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: Date | string;
}

interface Props { flags: FlagRow[] }

const RECEIPT_FLAG = "receipt_finalize_enabled";

export function FeatureFlagSection({ flags }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(flag: FlagRow) {
    if (!flag.enabled && flag.key === RECEIPT_FLAG) {
      setConfirmKey(flag.key);
      return;
    }
    doToggle(flag.key, !flag.enabled);
  }

  function doToggle(key: string, enabled: boolean) {
    setConfirmKey(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/feature-flags/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to update flag. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Feature flags are stored in the database and read at server request time.
      </p>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="divide-y rounded-lg border">
        {flags.map((f) => (
          <div key={f.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-mono text-sm font-medium">{f.key}</p>
              {f.description && (
                <p className="text-xs text-muted-foreground">{f.description}</p>
              )}
              {f.key === RECEIPT_FLAG && !f.enabled && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50/60 px-2 py-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] text-amber-700">
                    Enabling this flag allows finalizing Israeli tax documents. Do not enable until your accountant has verified all templates, VAT rates, and document numbering. Enabling is irreversible in production.
                  </p>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${f.enabled ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                {f.enabled ? "Enabled" : "Disabled"}
              </span>
              <button
                onClick={() => toggle(f)}
                disabled={isPending}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  f.enabled
                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                    : "hover:bg-accent"
                } disabled:opacity-50`}
              >
                {f.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation dialog for receipt flag */}
      {confirmKey === RECEIPT_FLAG && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-sm">Enable receipt finalization?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This allows finalizing Israeli tax documents with real document numbers.
                  Only enable after your accountant has signed off on templates, VAT rate, and numbering.
                  This action will be audit logged.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => doToggle(RECEIPT_FLAG, true)}
                className="flex-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                disabled={isPending}
              >
                Enable anyway
              </button>
              <button
                onClick={() => setConfirmKey(null)}
                className="flex-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
