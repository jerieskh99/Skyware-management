"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClientDialog } from "./ClientDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { useT } from "@/lib/i18n/client";
import { Building2, Plus } from "lucide-react";

export function ClientsPageHeader() {
  const [showCreate, setShowCreate] = useState(false);
  const { t } = useT();

  return (
    <>
      <PageHeader
        icon={Building2}
        title={t("clients.title")}
        description={t("clients.description")}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="me-1.5 h-4 w-4" />
            {t("clients.addClient")}
          </Button>
        }
      />
      {showCreate && <ClientDialog mode="create" onClose={() => setShowCreate(false)} />}
    </>
  );
}
