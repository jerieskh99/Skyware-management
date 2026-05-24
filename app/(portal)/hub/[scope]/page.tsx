import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { canTakeInHub } from "@/lib/permissions";
import { HubView } from "@/components/jobs/HubView";
import QueryProvider from "@/components/providers/QueryProvider";

const SCOPES = ["global", "helpdesk", "it", "rnd"] as const;
type HubScope = (typeof SCOPES)[number];

const LABELS: Record<HubScope, string> = {
  global: "Global",
  helpdesk: "Helpdesk",
  it: "IT",
  rnd: "R&D",
};

interface Props { params: Promise<{ scope: string }> }

export default async function HubPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const { scope } = await params;
  if (!SCOPES.includes(scope as HubScope)) notFound();
  if (!canTakeInHub(user, scope)) notFound();

  const label = LABELS[scope as HubScope];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Task Hub</h1>
          <p className="text-sm text-muted-foreground">
            {label} — available tasks. Take one to claim it.
          </p>
        </div>
        {/* Scope tabs */}
        <div className="hidden gap-1 sm:flex">
          {SCOPES.map((s) => {
            const accessible = canTakeInHub(user, s);
            if (!accessible) return null;
            return (
              <a
                key={s}
                href={`/hub/${s}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  s === scope
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {LABELS[s]}
              </a>
            );
          })}
        </div>
      </div>

      <QueryProvider>
        <HubView scope={scope} scopeLabel={label} />
      </QueryProvider>
    </div>
  );
}
