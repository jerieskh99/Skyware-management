"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateJobDialog } from "./CreateJobDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Briefcase, Plus } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  isAdmin: boolean;
}

export function JobsPageHeader({ title, description, isAdmin }: Props) {
  const [showCreate, setShowCreate] = useState(false);

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
              New job
            </Button>
          ) : null
        }
      />
      {showCreate && <CreateJobDialog onClose={() => setShowCreate(false)} />}
    </>
  );
}
