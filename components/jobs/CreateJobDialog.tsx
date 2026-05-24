"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface User {
  id: string;
  username: string;
  displayName: string;
  department: { key: string; nameEn: string };
}

interface Client {
  id: string;
  companyName: string;
}

interface Props { onClose: () => void }

export function CreateJobDialog({ onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentKey, setDepartmentKey] = useState("helpdesk");
  const [priority, setPriority] = useState("normal");
  const [severity, setSeverity] = useState("moderate");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [clientId, setClientId] = useState("");
  const [sendToHub, setSendToHub] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: User[]) => setUsers(data))
      .catch(() => {/* assignment is optional */});

    fetch("/api/clients?status=active")
      .then((r) => r.json())
      .then((data: Client[]) => setClients(data))
      .catch(() => {/* client association is optional */});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          departmentKey,
          priority,
          severity,
          assignedEmployeeId: assignedEmployeeId || undefined,
          clientId: clientId || undefined,
          sendToHub: sendToHub && !assignedEmployeeId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Failed to create job.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const deptUsers = users.filter(
    (u) => u.department.key === departmentKey || departmentKey === "global"
  );

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">Create new job</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title *</label>
            <Input placeholder="Short job title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea placeholder="Details, context, reproduction steps..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={isPending} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Department</label>
              <select
                value={departmentKey}
                onChange={(e) => { setDepartmentKey(e.target.value); setAssignedEmployeeId(""); }}
                disabled={isPending}
                className={selectClass}
              >
                <option value="global">Global</option>
                <option value="helpdesk">Helpdesk</option>
                <option value="it">IT</option>
                <option value="rnd">R&D</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={isPending} className={selectClass}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={isPending} className={selectClass}>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assign to</label>
              <select
                value={assignedEmployeeId}
                onChange={(e) => { setAssignedEmployeeId(e.target.value); if (e.target.value) setSendToHub(false); }}
                disabled={isPending}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {deptUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.department.nameEn})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {clients.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client (optional)</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isPending} className={selectClass}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
            </div>
          )}

          {!assignedEmployeeId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendToHub} onChange={(e) => setSendToHub(e.target.checked)} disabled={isPending} className="h-4 w-4 rounded border-input" />
              Send to hub (employees can take it)
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Creating..." : "Create job"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
