"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Plus, Pencil, Trash2, Pause, Play } from "lucide-react";

type Cadence = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";
type Priority = "low" | "normal" | "high" | "urgent";
type Severity = "minor" | "moderate" | "major" | "critical";
type Status = "active" | "paused";

interface TemplateRow {
  id: string;
  name: string | null;
  titleTemplate: string;
  description: string | null;
  departmentId: string;
  clientId: string | null;
  priority: Priority;
  severity: Severity;
  defaultAssigneeId: string | null;
  cadence: Cadence;
  anchor: unknown;
  timezone: string;
  nextRunAt: string | Date;
  lastGeneratedAt: string | Date | null;
  generatedCount: number;
  status: Status;
}

interface DeptOption { id: string; nameEn: string; nameHe: string }
interface ClientOption { id: string; companyName: string }
interface UserOption { id: string; displayName: string }

interface Props {
  templates: TemplateRow[];
  deptOptions: DeptOption[];
  clientOptions: ClientOption[];
  userOptions: UserOption[];
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
const SEVERITIES: Severity[] = ["minor", "moderate", "major", "critical"];
const CADENCES: Cadence[] = ["daily", "weekly", "biweekly", "monthly", "quarterly"];

interface FormState {
  name: string;
  titleTemplate: string;
  description: string;
  departmentId: string;
  clientId: string;
  priority: Priority;
  severity: Severity;
  defaultAssigneeId: string;
  cadence: Cadence;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timezone: string;
}

function emptyForm(deptId: string): FormState {
  return {
    name: "",
    titleTemplate: "",
    description: "",
    departmentId: deptId,
    clientId: "",
    priority: "normal",
    severity: "moderate",
    defaultAssigneeId: "",
    cadence: "weekly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    timezone: "Asia/Jerusalem",
  };
}

function readMinuteOfDay(anchor: unknown): number {
  if (anchor && typeof anchor === "object" && "minuteOfDay" in (anchor as Record<string, unknown>)) {
    const v = (anchor as Record<string, unknown>)["minuteOfDay"];
    if (typeof v === "number") return v;
  }
  return 0;
}
function readNumberField(anchor: unknown, key: string, fallback: number): number {
  if (anchor && typeof anchor === "object" && key in (anchor as Record<string, unknown>)) {
    const v = (anchor as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return fallback;
}

function formFromRow(row: TemplateRow): FormState {
  const m = readMinuteOfDay(row.anchor);
  return {
    name: row.name ?? "",
    titleTemplate: row.titleTemplate,
    description: row.description ?? "",
    departmentId: row.departmentId,
    clientId: row.clientId ?? "",
    priority: row.priority,
    severity: row.severity,
    defaultAssigneeId: row.defaultAssigneeId ?? "",
    cadence: row.cadence,
    dayOfWeek: readNumberField(row.anchor, "dayOfWeek", 1),
    dayOfMonth: readNumberField(row.anchor, "dayOfMonth", 1),
    hour: Math.floor(m / 60),
    minute: m % 60,
    timezone: row.timezone,
  };
}

function buildAnchor(form: FormState): Record<string, number> {
  const minuteOfDay = form.hour * 60 + form.minute;
  if (form.cadence === "daily") return { minuteOfDay };
  if (form.cadence === "weekly" || form.cadence === "biweekly") {
    return { dayOfWeek: form.dayOfWeek, minuteOfDay };
  }
  return { dayOfMonth: form.dayOfMonth, minuteOfDay };
}

interface FormPayload {
  name: string | null;
  titleTemplate: string;
  description: string | null;
  departmentId: string;
  clientId: string | null;
  priority: Priority;
  severity: Severity;
  defaultAssigneeId: string | null;
  cadence: Cadence;
  anchor: Record<string, number>;
  timezone: string;
}

function buildPayload(form: FormState): FormPayload {
  return {
    name: form.name.trim() === "" ? null : form.name.trim(),
    titleTemplate: form.titleTemplate.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    departmentId: form.departmentId,
    clientId: form.clientId === "" ? null : form.clientId,
    priority: form.priority,
    severity: form.severity,
    defaultAssigneeId: form.defaultAssigneeId === "" ? null : form.defaultAssigneeId,
    cadence: form.cadence,
    anchor: buildAnchor(form),
    timezone: form.timezone,
  };
}

export function RecurringTemplatesSection({
  templates,
  deptOptions,
  clientOptions,
  userOptions,
}: Props) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaultDeptId = deptOptions[0]?.id ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDeptId));

  function openCreate() {
    setError(null);
    setForm(emptyForm(defaultDeptId));
    setCreateOpen(true);
  }
  function openEdit(row: TemplateRow) {
    setError(null);
    setForm(formFromRow(row));
    setEditTarget(row);
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titleTemplate.trim() || !form.departmentId) {
      setError(t("admin.recurring.saveFailed"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/recurring-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? t("admin.recurring.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("common.saved") });
      router.refresh();
      setCreateOpen(false);
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/recurring-templates/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? t("admin.recurring.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("common.saved") });
      router.refresh();
      setEditTarget(null);
    });
  }

  function togglePause(row: TemplateRow) {
    startTransition(async () => {
      const path = row.status === "active" ? "pause" : "resume";
      await fetch(`/api/admin/recurring-templates/${row.id}/${path}`, { method: "POST" });
      router.refresh();
    });
  }

  function submitDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/recurring-templates/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? t("admin.recurring.deleteFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("common.deleted") });
      router.refresh();
      setDeleteTarget(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("admin.recurring.intro")}</p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus className="me-1.5 h-3.5 w-3.5" /> {t("admin.recurring.addTemplate")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("admin.recurring.noTemplates")}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.recurring.colName")}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.recurring.colCadence")}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("admin.recurring.colNextRun")}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">{t("admin.recurring.colGenerated")}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.recurring.colStatus")}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.recurring.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map((row) => (
                  <tr key={row.id} className={row.status === "paused" ? "opacity-60" : ""}>
                    <td className="px-4 py-3 font-medium">{row.name ?? row.titleTemplate}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t(`admin.recurring.cadenceLabels.${row.cadence}`)} {describeAnchor(row.cadence, row.anchor, t)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {new Date(row.nextRunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{row.generatedCount}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        row.status === "active"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-muted text-muted-foreground border-border"
                      }`}>
                        {t(`admin.recurring.status.${row.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(row)} disabled={isPending} title={t("admin.recurring.editTemplate")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => togglePause(row)} disabled={isPending} title={row.status === "active" ? t("admin.recurring.actions.pause") : t("admin.recurring.actions.resume")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          {row.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setDeleteTarget(row)} disabled={isPending} title={t("admin.recurring.deleteTemplate")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
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
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setError(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.recurring.addTemplate")}</DialogTitle>
          </DialogHeader>
          <TemplateForm
            form={form}
            setForm={setForm}
            deptOptions={deptOptions}
            clientOptions={clientOptions}
            userOptions={userOptions}
            error={error}
            isPending={isPending}
            onSubmit={submitCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) { setEditTarget(null); setError(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.recurring.editTemplate")}</DialogTitle>
          </DialogHeader>
          <TemplateForm
            form={form}
            setForm={setForm}
            deptOptions={deptOptions}
            clientOptions={clientOptions}
            userOptions={userOptions}
            error={error}
            isPending={isPending}
            onSubmit={submitEdit}
            onCancel={() => setEditTarget(null)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={t("admin.recurring.deleteTemplate")}
        description={t("admin.recurring.deleteConfirm")}
        pending={isPending}
        onConfirm={submitDelete}
      />
    </div>
  );
}

function describeAnchor(cadence: Cadence, anchor: unknown, t: (k: string) => string): string {
  const m = readMinuteOfDay(anchor);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  if (cadence === "daily") return `${hh}:${mm}`;
  if (cadence === "weekly" || cadence === "biweekly") {
    const dow = readNumberField(anchor, "dayOfWeek", 0);
    return `${t(`admin.recurring.dayNames.${dow}`)} ${hh}:${mm}`;
  }
  const dom = readNumberField(anchor, "dayOfMonth", 1);
  return `${dom} ${hh}:${mm}`;
}

interface TemplateFormProps {
  form: FormState;
  setForm: (v: FormState) => void;
  deptOptions: DeptOption[];
  clientOptions: ClientOption[];
  userOptions: UserOption[];
  error: string | null;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function TemplateForm({
  form,
  setForm,
  deptOptions,
  clientOptions,
  userOptions,
  error,
  isPending,
  onSubmit,
  onCancel,
}: TemplateFormProps) {
  const { t } = useT();
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("admin.recurring.fields.name")}</label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("admin.recurring.fields.namePlaceholder")} disabled={isPending} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("admin.recurring.fields.titleTemplate")} *</label>
        <Input value={form.titleTemplate} onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })} disabled={isPending} />
        <p className="text-[11px] text-muted-foreground">{t("admin.recurring.fields.titleTemplateHint")}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("admin.recurring.fields.description")}</label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={isPending} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.department")} *</label>
          <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} disabled={isPending} className={selectClass}>
            {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.client")}</label>
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} disabled={isPending} className={selectClass}>
            <option value="">{t("admin.recurring.fields.noClient")}</option>
            {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.priority")}</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} disabled={isPending} className={selectClass}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.severity")}</label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} disabled={isPending} className={selectClass}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("admin.recurring.fields.defaultAssignee")}</label>
        <select value={form.defaultAssigneeId} onChange={(e) => setForm({ ...form, defaultAssigneeId: e.target.value })} disabled={isPending} className={selectClass}>
          <option value="">{t("admin.recurring.fields.noAssignee")}</option>
          {userOptions.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.cadence")}</label>
          <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })} disabled={isPending} className={selectClass}>
            {CADENCES.map((c) => <option key={c} value={c}>{t(`admin.recurring.cadenceLabels.${c}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.timezone")}</label>
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={isPending} />
        </div>
      </div>
      <AnchorInputs form={form} setForm={setForm} isPending={isPending} />
      <p className="text-[11px] text-muted-foreground">{t(`admin.recurring.fields.anchorHelp.${form.cadence}`)}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

function AnchorInputs({
  form,
  setForm,
  isPending,
}: { form: FormState; setForm: (v: FormState) => void; isPending: boolean }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-3 gap-3">
      {(form.cadence === "weekly" || form.cadence === "biweekly") && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.dayOfWeek")}</label>
          <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} disabled={isPending} className={selectClass}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{t(`admin.recurring.dayNames.${d}`)}</option>)}
          </select>
        </div>
      )}
      {(form.cadence === "monthly" || form.cadence === "quarterly") && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("admin.recurring.fields.dayOfMonth")}</label>
          <Input type="number" min={1} max={28} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} disabled={isPending} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("admin.recurring.fields.time")}</label>
        <div className="flex items-center gap-1">
          <Input type="number" min={0} max={23} value={form.hour} onChange={(e) => setForm({ ...form, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} disabled={isPending} className="w-16" />
          <span className="text-sm">:</span>
          <Input type="number" min={0} max={59} value={form.minute} onChange={(e) => setForm({ ...form, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })} disabled={isPending} className="w-16" />
        </div>
      </div>
    </div>
  );
}
