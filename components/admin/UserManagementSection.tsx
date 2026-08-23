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
import { Plus, Pencil, KeyRound, UserX, UserCheck } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface UserRow {
  id: string;
  username: string;
  email: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: string | Date | null;
  role: { key: string; nameEn: string; isAdmin: boolean };
  department: { key: string; nameEn: string };
}

interface RoleOption { key: string; nameEn: string }
interface DeptOption { key: string; nameEn: string }

interface Props {
  users: UserRow[];
  roleOptions: RoleOption[];
  deptOptions: DeptOption[];
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function UserManagementSection({ users, roleOptions, deptOptions }: Props) {
  const router = useRouter();
  const { t } = useT();

  function fmtDate(d: string | Date | null) {
    if (!d) return t("admin.users.neverLoggedIn");
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<UserRow | null>(null);

  const [cUsername, setCUsername] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cDisplayName, setCDisplayName] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRoleKey, setCRoleKey] = useState("employee");
  const [cDeptKey, setCDeptKey] = useState("helpdesk");

  const [eDisplayName, setEDisplayName] = useState("");
  const [eRoleKey, setERoleKey] = useState("");
  const [eDeptKey, setEDeptKey] = useState("");
  const [eIsActive, setEIsActive] = useState(true);

  const [rpPassword, setRpPassword] = useState("");
  const [rpConfirm, setRpConfirm] = useState("");

  function openCreate() {
    setError(null);
    setCUsername(""); setCEmail(""); setCDisplayName(""); setCPassword("");
    setCRoleKey("employee"); setCDeptKey("helpdesk");
    setCreateOpen(true);
  }
  function openEdit(u: UserRow) {
    setError(null);
    setEDisplayName(u.displayName); setERoleKey(u.role.key);
    setEDeptKey(u.department.key); setEIsActive(u.isActive);
    setEditTarget(u);
  }
  function openResetPw(u: UserRow) {
    setError(null);
    setRpPassword(""); setRpConfirm("");
    setResetPwTarget(u);
  }

  function handleCreateOpenChange(o: boolean) { if (!o) { setCreateOpen(false); setError(null); } }
  function handleEditOpenChange(o: boolean) { if (!o) { setEditTarget(null); setError(null); } }
  function handleResetPwOpenChange(o: boolean) { if (!o) { setResetPwTarget(null); setError(null); } }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cUsername || !cEmail || !cDisplayName || !cPassword) { setError(t("admin.users.allFieldsRequired")); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cUsername, email: cEmail, displayName: cDisplayName, password: cPassword, roleKey: cRoleKey, departmentKey: cDeptKey }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t("admin.users.createFailed")); return; }
      router.refresh(); setCreateOpen(false);
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: eDisplayName, roleKey: eRoleKey, departmentKey: eDeptKey, isActive: eIsActive }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t("admin.users.updateFailed")); return; }
      router.refresh(); setEditTarget(null);
    });
  }

  function submitResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwTarget) return;
    if (rpPassword.length < 8) { setError(t("admin.users.passwordMinChars")); return; }
    if (rpPassword !== rpConfirm) { setError(t("admin.users.passwordsDoNotMatch")); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${resetPwTarget.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: rpPassword }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t("admin.users.resetFailed")); return; }
      router.refresh(); setResetPwTarget(null);
    });
  }

  function toggleActive(u: UserRow) {
    startTransition(async () => {
      await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      router.refresh();
    });
  }

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {activeCount} {t("admin.users.active")} · {inactiveCount} {t("admin.users.inactive")}
        </p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus className="me-1.5 h-3.5 w-3.5" /> {t("admin.users.addUser")}
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.users.username")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.users.displayName")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">{t("admin.users.email")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.users.role")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("admin.users.department")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("admin.users.statusCol")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">{t("admin.users.lastLogin")}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">{t("billing.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3 font-medium">{u.displayName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${u.role.isAdmin ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-muted text-muted-foreground border-border"}`}>
                      {u.role.nameEn}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.department.nameEn}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${u.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                      {u.isActive ? t("common.active") : t("common.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} disabled={isPending} title={t("common.edit")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openResetPw(u)} disabled={isPending} title={t("admin.users.resetPassword")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={isPending} title={u.isActive ? t("admin.users.deactivate") : t("admin.users.reactivate")} className={`rounded p-1 ${u.isActive ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-green-600"}`}>
                        {u.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("admin.users.deactivatedNote")}
      </p>

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.users.addUser")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.username")} *</label>
                <Input value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder={t("admin.users.usernamePlaceholder")} disabled={isPending} autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.email")} *</label>
                <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder={t("admin.users.emailPlaceholder")} disabled={isPending} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.users.displayName")} *</label>
              <Input value={cDisplayName} onChange={(e) => setCDisplayName(e.target.value)} placeholder={t("admin.users.displayNamePlaceholder")} disabled={isPending} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.users.tempPassword")} *</label>
              <Input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder={t("admin.users.tempPasswordPlaceholder")} disabled={isPending} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.role")}</label>
                <select value={cRoleKey} onChange={(e) => setCRoleKey(e.target.value)} disabled={isPending} className={selectClass}>
                  {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.nameEn}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.department")}</label>
                <select value={cDeptKey} onChange={(e) => setCDeptKey(e.target.value)} disabled={isPending} className={selectClass}>
                  {deptOptions.map((d) => <option key={d.key} value={d.key}>{d.nameEn}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? t("admin.users.creating") : t("admin.users.createUser")}</Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={handleEditOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.users.editUser")}</DialogTitle>
            {editTarget && (
              <DialogDescription className="font-mono">{editTarget.username}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.users.displayName")}</label>
              <Input value={eDisplayName} onChange={(e) => setEDisplayName(e.target.value)} disabled={isPending} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.role")}</label>
                <select value={eRoleKey} onChange={(e) => setERoleKey(e.target.value)} disabled={isPending} className={selectClass}>
                  {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.nameEn}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("admin.users.department")}</label>
                <select value={eDeptKey} onChange={(e) => setEDeptKey(e.target.value)} disabled={isPending} className={selectClass}>
                  {deptOptions.map((d) => <option key={d.key} value={d.key}>{d.nameEn}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={eIsActive} onChange={(e) => setEIsActive(e.target.checked)} disabled={isPending} className="h-4 w-4 rounded" />
              {t("admin.users.activeCheckbox")}
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? t("common.saving") : t("common.save")}</Button>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPwTarget !== null} onOpenChange={handleResetPwOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("admin.users.resetPassword")}</DialogTitle>
            {resetPwTarget && (
              <DialogDescription>
                {t("admin.users.resetPasswordBody")}{" "}
                <strong>{resetPwTarget.displayName}</strong> ({resetPwTarget.username})
              </DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={submitResetPw} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.users.newPassword")}</label>
              <Input type="password" value={rpPassword} onChange={(e) => setRpPassword(e.target.value)} placeholder={t("admin.users.tempPasswordPlaceholder")} disabled={isPending} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("admin.users.confirmPassword")}</label>
              <Input type="password" value={rpConfirm} onChange={(e) => setRpConfirm(e.target.value)} disabled={isPending} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={isPending} className="flex-1">{isPending ? t("admin.users.resetting") : t("admin.users.resetPassword")}</Button>
              <Button type="button" variant="outline" onClick={() => setResetPwTarget(null)} disabled={isPending}>{t("common.cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
