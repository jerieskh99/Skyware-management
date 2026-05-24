"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateJobDialog } from "./CreateJobDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { useT } from "@/lib/i18n/client";
import { Briefcase, Plus } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  isAdmin: boolean;
}

export function JobsPageHeader({ title, description, isAdmin }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const { t } = useT();

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        icon={Briefcase}
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="me-1.5 h-4 w-4" />
              {t("jobs.newJob")}
            </Button>
          ) : null
        }
      />
      {showCreate && <CreateJobDialog onClose={() => setShowCreate(false)} />}
    </>
  );
}
