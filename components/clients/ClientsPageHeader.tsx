"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClientDialog } from "./ClientDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Building2, Plus } from "lucide-react";

export function ClientsPageHeader() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <PageHeader
        icon={Building2}
        title="Clients"
        description="Client records, billing accounts, and environment notes."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="me-1.5 h-4 w-4" />
            Add client
          </Button>
        }
      />
      {showCreate && <ClientDialog mode="create" onClose={() => setShowCreate(false)} />}
    </>
  );
}
