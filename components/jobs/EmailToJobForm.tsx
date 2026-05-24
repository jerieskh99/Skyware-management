"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, AlertTriangle } from "lucide-react";

interface Client {
  id: string;
  companyName: string;
}

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;
const SEVERITY_OPTIONS = ["minor", "moderate", "major", "critical"] as const;
const DEPT_KEYS = ["global", "helpdesk", "it", "rnd"] as const;

export function EmailToJobForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [departmentKey, setDepartmentKey] = useState<string>("helpdesk");
  const [priority, setPriority] = useState<string>("normal");
  const [severity, setSeverity] = useState<string>("moderate");
  const [sendToHub, setSendToHub] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients?status=active")
      .then((r) => r.ok ? r.json() as Promise<Client[]> : Promise.resolve([]))
      .then(setClients)
      .catch(() => {});
  }, []);

  function buildTitle(): string {
    if (subject.trim()) return subject.trim().slice(0, 255);
    if (sender.trim()) return `Support request from ${sender.trim()}`.slice(0, 255);
    return "Support request (manual email)";
  }

  function buildDescription(): string {
    const parts: string[] = [];
    if (sender.trim()) parts.push(`From: ${sender.trim()}`);
    if (subject.trim()) parts.push(`Subject: ${subject.trim()}`);
    if (body.trim()) parts.push(`\n${body.trim()}`);
    return parts.join("\n");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !subject.trim()) {
      setError("At least a subject or body is required.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const payload = {
        title: buildTitle(),
        description: buildDescription(),
        departmentKey,
        priority,
        severity,
        isBillable: true,
        source: "email_manual",
        sendToHub,
        ...(clientId ? { clientId } : {}),
      };

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to create job.");
        return;
      }

      const job = await res.json() as { id: string; publicNumber: string };
      setCreatedJobId(job.id);
    });
  }

  if (createdJobId) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Mail className="h-5 w-5 text-green-600" />
        </div>
        <p className="font-semibold">Job created successfully.</p>
        <div className="flex justify-center gap-2">
          <Button size="sm" onClick={() => router.push(`/my-jobs/${createdJobId}`)}>
            View job
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSender(""); setSubject(""); setBody(""); setClientId("");
              setDepartmentKey("helpdesk"); setPriority("normal"); setSeverity("moderate");
              setSendToHub(false); setCreatedJobId(null);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );
  }

  const selectCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Disclaimer */}
      <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This is a <strong>manual entry form</strong>. Paste email content manually.
          No inbox connection, email parsing, or credentials are involved.
        </p>
      </div>

      {/* Email meta */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Sender / Contact</label>
          <Input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            disabled={isPending}
            maxLength={200}
            placeholder="name@example.com or contact name"
            dir="auto"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isPending}
            maxLength={255}
            placeholder="Email subject or brief description"
            dir="auto"
          />
        </div>
      </div>

      {/* Email body */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Email body</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          rows={8}
          maxLength={10000}
          placeholder="Paste the email content here..."
          dir="auto"
        />
      </div>

      {/* Job routing */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Department</label>
          <select
            value={departmentKey}
            onChange={(e) => setDepartmentKey(e.target.value)}
            disabled={isPending}
            className={selectCls}
          >
            {DEPT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {clients.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Client (optional)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={isPending}
              className={selectCls}
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={isPending}
            className={selectCls}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={isPending}
            className={selectCls}
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Send to hub */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendToHub}
          onChange={(e) => setSendToHub(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-input"
        />
        Send directly to task hub (department queue)
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Creating job..." : "Create job from email"}
      </Button>
    </form>
  );
}
