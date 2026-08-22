"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { ClientOption } from "./CreateDraftDialog";

// Click-gated dialog: kept out of the receipts list route's initial bundle and
// loaded on demand. It renders nothing until `open` is set, so no fallback.
const CreateDraftDialog = dynamic(
  () => import("./CreateDraftDialog").then((m) => m.CreateDraftDialog),
  { ssr: false },
);

interface Props {
  clients: ClientOption[];
}

/**
 * Page-level wrapper that owns the open/close state of CreateDraftDialog.
 * Renders the trigger button in the header.
 */
export function CreateDraftWrapper({ clients }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="me-1.5 h-3.5 w-3.5" />
        {t("receipts.list.createDraft")}
      </Button>
      <CreateDraftDialog open={open} onOpenChange={setOpen} clients={clients} />
    </>
  );
}
