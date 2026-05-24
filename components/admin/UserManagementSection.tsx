"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, KeyRound, UserX, UserCheck } from "lucide-react";

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

function fmtDate(d: string | Date | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function UserManagementSection({ users, roleOptions, deptOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<UserRow | null>(null);

  // Create form
  const [cUsername, setCUsername] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cDisplayName, setCDisplayName] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRoleKey, setCRoleKey] = useState("employee");
  const [cDeptKey, setCDeptKey] = useState("helpdesk");

  // Edit form
  const [eDisplayName, setEDisplayName] = useState("");
  const [eRoleKey, setERoleKey] = useState("");
  const [eDeptKey, setEDeptKey] = useState("");
  const [eIsActive, setEIsActive] = useState(true);

  // Reset PW form
  const [rpPassword, setRpPassword] = useState("");
  const [rpConfirm, setRpConfirm] = useState("");

  function openCreate() { setError(null); setCUsername(""); setCEmail(""); setCDisplayName(""); setCPassword(""); setCRoleKey("employee"); setCDeptKey("helpdesk"); setCreateOpen(true); }
  function openEdit(u: UserRow) { setError(null); setEDisplayName(u.displayName); setERoleKey(u.role.key); setEDeptKey(u.department.key); setEIsActive(u.isActive); setEditTarget(u); }
  function openResetPw(u: UserRow) { setError(null); setRpPassword(""); setRpConfirm(""); setResetPwTarget(u); }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cUsername || !cEmail || !cDisplayName || !cPassword) { setError("All fields are required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cUsername, email: cEmail, displayName: cDisplayName, password: cPassword, roleKey: cRoleKey, departmentKey: cDeptKey }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed to create user."); return; }
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
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed to update user."); return; }
      router.refresh(); setEditTarget(null);
    });
  }

  function submitResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwTarget) return;
    if (rpPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (rpPassword !== rpConfirm) { setError("Passwords do not match."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${resetPwTarget.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: rpPassword }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? "Failed to reset password."); return; }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.filter((u) => u.isActive).length} active · {users.filter((u) => !u.isActive).length} inactive
        </p>
        <Button size="sm" onClick={openCreate} disabled={isPending}>
          <Plus className="me-1.5 h-3.5 w-3.5" /> Add user
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Username</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Display name</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden sm:table-cell">Dept</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground hidden lg:table-cell">Last login</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground">Actions</th>
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
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} disabled={isPending} title="Edit" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openResetPw(u)} disabled={isPending} title="Reset password" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={isPending} title={u.isActive ? "Deactivate" : "Reactivate"} className={`rounded p-1 ${u.isActive ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-green-600"}`}>
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
        Note: Deactivated users cannot log in. Existing JWT sessions remain valid until expiry (session duration is set in Auth.js config).
      </p>

      {/* Create user dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">Add user</h3>
            <form onSubmit={submitCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Username *</label>
                  <Input value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder="emp.name.1" disabled={isPending} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email *</label>
                  <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="user@example.com" disabled={isPending} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Display name *</label>
                <Input value={cDisplayName} onChange={(e) => setCDisplayName(e.target.value)} placeholder="First Last" disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Temporary password *</label>
                <Input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="Min 8 chars" disabled={isPending} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <select value={cRoleKey} onChange={(e) => setCRoleKey(e.target.value)} disabled={isPending} className={selectClass}>
                    {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.nameEn}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Department</label>
                  <select value={cDeptKey} onChange={(e) => setCDeptKey(e.target.value)} disabled={isPending} className={selectClass}>
                    {deptOptions.map((d) => <option key={d.key} value={d.key}>{d.nameEn}</option>)}
                  </select>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Creating..." : "Create user"}</Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit user dialog */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold">Edit user</h3>
            <p className="mb-4 text-xs text-muted-foreground font-mono">{editTarget.username}</p>
            <form onSubmit={submitEdit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Display name</label>
                <Input value={eDisplayName} onChange={(e) => setEDisplayName(e.target.value)} disabled={isPending} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <select value={eRoleKey} onChange={(e) => setERoleKey(e.target.value)} disabled={isPending} className={selectClass}>
                    {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.nameEn}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Department</label>
                  <select value={eDeptKey} onChange={(e) => setEDeptKey(e.target.value)} disabled={isPending} className={selectClass}>
                    {deptOptions.map((d) => <option key={d.key} value={d.key}>{d.nameEn}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={eIsActive} onChange={(e) => setEIsActive(e.target.checked)} disabled={isPending} className="h-4 w-4 rounded" />
                Active (unchecking blocks login)
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : "Save"}</Button>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password dialog */}
      {resetPwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold">Reset password</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Setting a new password for <strong>{resetPwTarget.displayName}</strong> ({resetPwTarget.username}). Communicate the new password securely.
            </p>
            <form onSubmit={submitResetPw} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">New password</label>
                <Input type="password" value={rpPassword} onChange={(e) => setRpPassword(e.target.value)} placeholder="Min 8 chars" disabled={isPending} autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirm password</label>
                <Input type="password" value={rpConfirm} onChange={(e) => setRpConfirm(e.target.value)} disabled={isPending} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Resetting..." : "Reset password"}</Button>
                <Button type="button" variant="outline" onClick={() => setResetPwTarget(null)} disabled={isPending}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
