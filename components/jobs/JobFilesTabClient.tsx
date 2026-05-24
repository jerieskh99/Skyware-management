"use client";

import { useState } from "react";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";

interface Props {
  jobId: string;
  currentUserId: string;
  isAdmin: boolean;
  canUpload: boolean;
}

export function JobFilesTabClient({ jobId, currentUserId, isAdmin, canUpload }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      {canUpload && (
        <AttachmentUploader
          parent={{ kind: "job", jobId }}
          onUploaded={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <AttachmentList
        parent={{ kind: "job", jobId }}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        refreshKey={refreshKey}
      />
    </div>
  );
}
