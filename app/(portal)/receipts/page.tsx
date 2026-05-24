import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { Receipt } from "lucide-react";

export default async function ReceiptsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipts and Tax Documents</h1>
        <p className="text-sm text-muted-foreground">
          Israeli business documents issued to clients.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-sm">
        <p className="font-medium text-amber-800">Compliance hold</p>
        <p className="mt-1 text-amber-700">
          Document finalization is locked until an Israeli accountant verifies templates, VAT rate,
          allocation number requirements, and any Tax Authority API integrations.
          Drafts can be created but will not be numbered or issued.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Receipt className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold">Receipts / Tax Documents — Phase 7</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Six document types will be supported: Invoice, Receipt, Tax Invoice, Tax Invoice + Receipt
          (חשבונית מס קבלה), Credit Note, and Proforma Invoice. All with Hebrew and bilingual support.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          All document types are modeled in the database. Finalize is feature-flag gated.
          Requires accountant sign-off before real documents can be issued.
        </p>
      </div>
    </div>
  );
}
