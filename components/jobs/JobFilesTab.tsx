import { Paperclip } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { getT } from "@/lib/i18n/server";
import { getFeatureFlag } from "@/lib/feature-flags";
import { JobFilesTabClient } from "./JobFilesTabClient";

interface Props {
  jobId: string;
  currentUserId: string;
  isAdmin: boolean;
  canUpload: boolean;
}

export async function JobFilesTab({ jobId, currentUserId, isAdmin, canUpload }: Props) {
  const { t } = await getT();
  const enabled = await getFeatureFlag("attachments_enabled");
  if (!enabled) {
    return (
      <EmptyState
        icon={Paperclip}
        title={t("jobs.detail.filesPlaceholder")}
      />
    );
  }

  return (
    <JobFilesTabClient
      jobId={jobId}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      canUpload={canUpload}
    />
  );
}
