import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { listClients } from "@/lib/clients/queries";
import { ClientFiltersBar } from "@/components/clients/ClientFiltersBar";
import { ClientsPageHeader } from "@/components/clients/ClientsPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Building2 } from "lucide-react";
import type { ClientStatus } from "@prisma/client";

const VALID_STATUSES = new Set(["active", "inactive"]);

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function ClientsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  const params = await searchParams;
  const search = params["search"]?.trim() || undefined;
  const statusParam = params["status"];
  const status =
    statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as ClientStatus)
      : undefined;

  const clients = await listClients({ search, status });

  return (
    <div className="space-y-4">
      <ClientsPageHeader />
      <ClientFiltersBar initialSearch={search ?? ""} initialStatus={status ?? ""} />

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            search || status
              ? "No clients match your filters."
              : "No clients yet."
          }
          description={
            !search && !status
              ? "Add your first client to start tracking jobs and billing."
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{client.companyName}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      client.status === "active"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {client.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {client.contactPerson && <span>{client.contactPerson}</span>}
                  {client.email && <span>{client.email}</span>}
                  {client.phone && <span>{client.phone}</span>}
                  <span>
                    {client._count.jobs}{" "}
                    {client._count.jobs === 1 ? "job" : "jobs"}
                  </span>
                </div>
              </div>

              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(client.createdAt).toLocaleDateString("en-GB")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
