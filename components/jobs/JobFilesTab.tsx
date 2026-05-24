import { Paperclip } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { getT } from "@/lib/i18n/server";

export async function JobFilesTab() {
  const { t } = await getT();
  return (
    <EmptyState
      icon={Paperclip}
      title={t("jobs.detail.filesPlaceholder")}
    />
  );
}
