import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { Bot, Circle, Zap, ShieldCheck, Clock, Plug } from "lucide-react";

const PLANNED_CAPABILITIES = [
  "Monitor a dedicated mailbox",
  "Detect client payment confirmations",
  "Read supplier receipts",
  "Create draft jobs from inbound emails",
  "Alert admins about urgent flags",
  "Suggest billing updates",
  "Summarize internal activity",
  "Detect repeated technical issues",
  "Generate operational reports",
];

const PERMISSION_TABLE = [
  ["Read mailbox",        "Planned",      "Read only",    "—"],
  ["Draft jobs from email", "Planned",    "Propose only", "Admin review required"],
  ["Update billing items", "Not planned", "—",            "—"],
  ["Send messages",       "Not planned",  "—",            "—"],
  ["Modify payments",     "Not planned",  "—",            "—"],
  ["Issue receipts",      "Not planned",  "—",            "—"],
  ["Access credentials",  "Never",        "—",            "—"],
];

export default async function AgentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const isEnabled = await getFeatureFlag("agent_control_center_module");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
          <Bot className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Control Center</h1>
          <p className="text-sm text-muted-foreground">Internal automation agent management.</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Circle className="h-2.5 w-2.5 fill-muted-foreground text-muted-foreground" />
          <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Offline — not provisioned
          </span>
        </div>
      </div>

      {!isEnabled && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Feature flag <code className="rounded bg-muted px-1 font-mono text-xs">agent_control_center_module</code> is
          disabled. Enable it in Admin Panel → Feature Flags when the agent is provisioned.
        </div>
      )}

      {/* Status card */}
      <section className="rounded-lg border p-5">
        <div className="flex items-start gap-4">
          <Bot className="mt-0.5 h-8 w-8 shrink-0 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="font-medium">Agent is offline</p>
            <p className="text-sm text-muted-foreground">
              The internal automation agent is not yet provisioned. When activated, it will operate in
              propose-only mode — every action requires explicit admin approval before execution.
              No autonomous changes to jobs, billing, or receipts will occur without review.
            </p>
            <p className="text-xs text-muted-foreground">
              No real agent code exists in this codebase. This page is a planning placeholder.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Planned capabilities */}
        <section className="rounded-lg border p-5 space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Zap className="h-4 w-4 text-muted-foreground" /> Planned capabilities
          </h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {PLANNED_CAPABILITIES.map((cap) => (
              <li key={cap} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                {cap}
              </li>
            ))}
          </ul>
        </section>

        {/* Future integrations */}
        <section className="rounded-lg border p-5 space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Plug className="h-4 w-4 text-muted-foreground" /> Future integrations (planned)
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              ["Dedicated mailbox", "Read-only, classified by type"],
              ["Billing module", "Propose payment linking"],
              ["Job system", "Create draft jobs from emails"],
              ["Admin notifications", "Alert on urgent flags"],
            ].map(([name, desc]) => (
              <li key={name} className="space-y-0.5 opacity-60">
                <p className="font-medium text-foreground text-xs">{name}</p>
                <p className="text-xs">{desc}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            No connection to email, billing systems, bank accounts, filesystem, or external services exists today.
          </p>
        </section>
      </div>

      {/* Permissions table */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Permission model (planned)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-2 text-start font-medium">Capability</th>
                <th className="pb-2 text-start font-medium">Status</th>
                <th className="pb-2 text-start font-medium">Mode</th>
                <th className="pb-2 text-start font-medium hidden sm:table-cell">Constraint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PERMISSION_TABLE.map(([cap, status, mode, constraint]) => (
                <tr key={cap} className="text-muted-foreground">
                  <td className="py-2">{cap}</td>
                  <td className={`py-2 font-medium ${status === "Never" ? "text-destructive/70" : status === "Planned" ? "text-amber-600" : ""}`}>
                    {status}
                  </td>
                  <td className="py-2">{mode}</td>
                  <td className="py-2 hidden sm:table-cell">{constraint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent actions placeholder */}
      <section className="rounded-lg border p-5 space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" /> Recent actions
        </h2>
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No agent actions recorded. Agent is offline.
        </div>
      </section>
    </div>
  );
}
