"use client";

import { EmailHistory } from "../EmailHistory";
import { useT } from "@/lib/i18n/client";
import { Mails } from "lucide-react";

export function EmailHistorySection({ clientId, refreshKey }: { clientId: string; refreshKey: number }) {
  const { t } = useT();
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Mails className="h-4 w-4 text-muted-foreground" /> {t("emailHistory.title")}
      </h3>
      <EmailHistory clientId={clientId} refreshKey={refreshKey} />
    </section>
  );
}
