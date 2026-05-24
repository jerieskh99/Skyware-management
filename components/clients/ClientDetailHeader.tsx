"use client";

import { useState } from "react";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientDialog } from "./ClientDialog";

interface ClientSummary {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  israeliTaxId: string | null;
  status: "active" | "inactive";
  notes: string | null;
}

interface Props {
  client: ClientSummary;
}

export function ClientDetailHeader({ client }: Props) {
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client.companyName}</h1>
            {client.contactPerson && (
              <p className="text-sm text-muted-foreground">{client.contactPerson}</p>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
          <Pencil className="me-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {showEdit && (
        <ClientDialog
          mode="edit"
          initialData={client}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
