"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

type Priority = "urgent" | "high" | "normal" | "low";

interface Row {
  priority: Priority;
  targetMinutes: number;
  updatedAt: string | Date | null;
}

interface Props { rows: Row[] }

export function SlaDefaultsSection({ rows }: Props) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<Priority, string>>(() => {
    const out = {} as Record<Priority, string>;
    for (const r of rows) out[r.priority] = String(r.targetMinutes);
    return out;
  });
  const [error, setError] = useState<string | null>(null);

  function save(priority: Priority) {
    const raw = values[priority];
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0 || n > 7200) {
      setError(t("admin.sla.invalidRange"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/sla-defaults/${priority}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMinutes: n }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("admin.sla.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("admin.sla.saved") });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("admin.sla.intro")}</p>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                {t("admin.sla.colPriority")}
              </th>
              <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                {t("admin.sla.colTargetMinutes")}
              </th>
              <th className="px-4 py-2.5 text-start font-medium text-muted-foreground hidden sm:table-cell">
                {t("admin.sla.colLastUpdated")}
              </th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.priority}>
                <td className="px-4 py-2.5 font-medium">{t(`admin.sla.priority.${r.priority}`)}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min={1}
                    max={7200}
                    step={1}
                    value={values[r.priority] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [r.priority]: e.target.value }))
                    }
                    disabled={isPending}
                    className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                  {r.updatedAt
                    ? new Date(r.updatedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : t("admin.sla.notSet")}
                </td>
                <td className="px-4 py-2.5 text-end">
                  <button
                    type="button"
                    onClick={() => save(r.priority)}
                    disabled={isPending}
                    className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {t("admin.sla.save")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.sla.severityNote")}</p>
    </div>
  );
}
