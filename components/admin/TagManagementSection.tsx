"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface TagRow {
  id: string;
  key: string;
  labelEn: string;
  labelHe: string;
  scope: string;
  colorHex: string | null;
  isSystem: boolean;
  _count: { jobTags: number; postTags: number };
}

interface Props { tags: TagRow[] }

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SCOPE_LABELS: Record<string, string> = {
  job: "Jobs",
  communication: "Communication",
  both: "Both",
};

export function TagManagementSection({ tags }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TagRow | null>(null);

  // Create form
  const [cKey, setCKey] = useState("");
  const [cLabelEn, setCLabelEn] = useState("");
  const [cLabelHe, setCLabelHe] = useState("");
  const [cScope, setCScope] = useState("communication");
  const [cColor, setCColor] = useState("#6366f1");

  // Edit form
  const [eLabelEn, setELabelEn] = useState("");
  const [eLabelHe, setELabelHe] = useState("");
  const [eColor, setEColor] = useState("");

  function openCreate() { setError(null); setCKey(""); setCLabelEn(""); setCLabelHe(""); setCScope("communication"); setCColor("#6366f1"); setCreateOpen(true); }
  function openEdit(t: TagRow) { setError(null); setELabelEn(t.labelEn); setELabelHe(t.labelHe); setEColor(t.colorHex ?? ""); setEditTarget(t); }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cKey || !cLabelEn || !cLabelHe) { setError("Key, English label, and Hebrew label are required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: cKey, labelEn: cLabelEn, labelHe: cLabelHe, scope: cScope, colorHex: cColor || null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      router.refresh(); setCreateOpen(false);
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/tags/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelEn: eLabelEn, labelHe: eLabelHe, colorHex: eColor || null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed."); return; }
      router.refresh(); setEditTarget(null);
    });
  }

  function deleteTag(tag: TagRow) {
    if (!confirm(`Delete tag "${tag.key}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; alert(d.error ?? "Delete failed."); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tags.length} tags</p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus className="me-1.5 h-3.5 w-3.5" /> Add tag
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Key</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">English</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">Hebrew</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Scope</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">Usage</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tags.map((t) => (
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.colorHex && (
                        <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: t.colorHex }} />
                      )}
                      <span className="font-mono text-xs">{t.key}</span>
                      {t.isSystem && (
                        <span className="rounded border border-muted bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">sys</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{t.labelEn}</td>
                  <td className="px-4 py-3 hidden sm:table-cell" dir="rtl">{t.labelHe}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{SCOPE_LABELS[t.scope] ?? t.scope}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {t._count.jobTags + t._count.postTags} uses
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(t)} disabled={isPending} title="Edit" className="rounded p-1 text-muted-foreground hover:bg-accent">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTag(t)}
                        disabled={isPending || t.isSystem || t._count.jobTags > 0 || t._count.postTags > 0}
                        title={t.isSystem ? "System tag" : t._count.jobTags + t._count.postTags > 0 ? "In use" : "Delete"}
                        className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Add tag</h3>
            <form onSubmit={submitCreate} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Key * (lowercase, digits, _ -)</label>
                <Input value={cKey} onChange={(e) => setCKey(e.target.value)} placeholder="my-tag" disabled={isPending} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">English label *</label>
                  <Input value={cLabelEn} onChange={(e) => setCLabelEn(e.target.value)} disabled={isPending} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hebrew label *</label>
                  <Input value={cLabelHe} onChange={(e) => setCLabelHe(e.target.value)} dir="rtl" disabled={isPending} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Scope</label>
                  <select value={cScope} onChange={(e) => setCScope(e.target.value)} disabled={isPending} className={selectClass}>
                    <option value="communication">Communication</option>
                    <option value="job">Jobs</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Color</label>
                  <Input type="color" value={cColor} onChange={(e) => setCColor(e.target.value)} disabled={isPending} className="h-10 px-2" />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Creating..." : "Create"}</Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold">Edit tag</h3>
            <p className="mb-4 text-xs text-muted-foreground font-mono">{editTarget.key}</p>
            <form onSubmit={submitEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">English label</label>
                  <Input value={eLabelEn} onChange={(e) => setELabelEn(e.target.value)} disabled={isPending} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hebrew label</label>
                  <Input value={eLabelHe} onChange={(e) => setELabelHe(e.target.value)} dir="rtl" disabled={isPending} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Color</label>
                <Input type="color" value={eColor} onChange={(e) => setEColor(e.target.value)} disabled={isPending} className="h-10 px-2" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : "Save"}</Button>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
