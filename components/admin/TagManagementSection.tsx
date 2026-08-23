"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";

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

export function TagManagementSection({ tags }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TagRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [cKey, setCKey] = useState("");
  const [cLabelEn, setCLabelEn] = useState("");
  const [cLabelHe, setCLabelHe] = useState("");
  const [cScope, setCScope] = useState("communication");
  const [cColor, setCColor] = useState("#6366f1");

  const [eLabelEn, setELabelEn] = useState("");
  const [eLabelHe, setELabelHe] = useState("");
  const [eColor, setEColor] = useState("");

  function scopeLabel(scope: string): string {
    if (scope === "job") return t("admin.tags.scope_job");
    if (scope === "communication") return t("admin.tags.scope_communication");
    if (scope === "both") return t("admin.tags.scope_both");
    return scope;
  }

  function openCreate() {
    setError(null);
    setCKey(""); setCLabelEn(""); setCLabelHe(""); setCScope("communication"); setCColor("#6366f1");
    setCreateOpen(true);
  }
  function openEdit(tag: TagRow) {
    setError(null);
    setELabelEn(tag.labelEn); setELabelHe(tag.labelHe); setEColor(tag.colorHex ?? "");
    setEditTarget(tag);
  }

  function handleCreateOpenChange(o: boolean) { if (!o) { setCreateOpen(false); setError(null); } }
  function handleEditOpenChange(o: boolean) { if (!o) { setEditTarget(null); setError(null); } }
  function handleDeleteOpenChange(o: boolean) { if (!o) { setDeleteTarget(null); setDeleteError(null); } }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cKey || !cLabelEn || !cLabelHe) { setError(t("admin.tags.keyRequiredLabels")); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: cKey, labelEn: cLabelEn, labelHe: cLabelHe, scope: cScope, colorHex: cColor || null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t("admin.tags.saveFailed")); return; }
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
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t("admin.tags.saveFailed")); return; }
      router.refresh(); setEditTarget(null);
    });
  }

  function requestDelete(tag: TagRow) {
    setDeleteError(null);
    setDeleteTarget(tag);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const tag = deleteTarget;
    startTransition(async () => {
      const res = await fetch(`/api/admin/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(d.error ?? t("admin.tags.deleteFailed"));
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{tags.length} {t("admin.tags.tagsCount")}</p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus className="me-1.5 h-3.5 w-3.5" /> {t("admin.tags.addTag")}
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.tags.key")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.tags.english")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("admin.tags.hebrew")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.tags.scope")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">{t("admin.tags.usage")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {tag.colorHex && (
                        <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: tag.colorHex }} />
                      )}
                      <span className="font-mono text-xs">{tag.key}</span>
                      {tag.isSystem && (
                        <span className="rounded border border-muted bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">sys</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{tag.labelEn}</td>
                  <td className="px-4 py-3 hidden sm:table-cell" dir="rtl">{tag.labelHe}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{scopeLabel(tag.scope)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {tag._count.jobTags + tag._count.postTags} {t("admin.tags.uses")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(tag)} disabled={isPending} title={t("common.edit")} className="rounded p-1 text-muted-foreground hover:bg-accent">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => requestDelete(tag)}
                        disabled={isPending || tag.isSystem || tag._count.jobTags > 0 || tag._count.postTags > 0}
                        title={tag.isSystem ? t("admin.tags.systemTag") : tag._count.jobTags + tag._count.postTags > 0 ? t("admin.tags.inUse") : t("common.delete")}
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

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.tags.addTag")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.tags.keyHint")}</label>
              <Input value={cKey} onChange={(e) => setCKey(e.target.value)} placeholder={t("admin.tags.keyPlaceholder")} disabled={isPending} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.englishLabel")} *</label>
                <Input value={cLabelEn} onChange={(e) => setCLabelEn(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.hebrewLabel")} *</label>
                <Input value={cLabelHe} onChange={(e) => setCLabelHe(e.target.value)} dir="rtl" disabled={isPending} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.scope")}</label>
                <select value={cScope} onChange={(e) => setCScope(e.target.value)} disabled={isPending} className={selectClass}>
                  <option value="communication">{t("admin.tags.scope_communication")}</option>
                  <option value="job">{t("admin.tags.scope_job")}</option>
                  <option value="both">{t("admin.tags.scope_both")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.color")}</label>
                <Input type="color" value={cColor} onChange={(e) => setCColor(e.target.value)} disabled={isPending} className="h-10 px-2" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? t("common.creating") : t("common.create")}</Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={handleDeleteOpenChange}
        title={t("admin.tags.deleteTag")}
        description={deleteTarget ? (
          <>
            <span className="font-mono text-foreground">{deleteTarget.key}</span>
            {" — "}
            {t("admin.tags.deleteConfirm")}
          </>
        ) : ""}
        pending={isPending}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
      />

      <Dialog open={editTarget !== null} onOpenChange={handleEditOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.tags.editTag")}</DialogTitle>
            {editTarget && (
              <DialogDescription className="font-mono">{editTarget.key}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.englishLabel")}</label>
                <Input value={eLabelEn} onChange={(e) => setELabelEn(e.target.value)} disabled={isPending} autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.tags.hebrewLabel")}</label>
                <Input value={eLabelHe} onChange={(e) => setELabelHe(e.target.value)} dir="rtl" disabled={isPending} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.tags.color")}</label>
              <Input type="color" value={eColor} onChange={(e) => setEColor(e.target.value)} disabled={isPending} className="h-10 px-2" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? t("common.saving") : t("common.save")}</Button>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
