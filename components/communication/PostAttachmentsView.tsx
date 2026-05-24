"use client";

import { AttachmentList } from "@/components/attachments/AttachmentList";

interface Props {
  channelKey: string;
  postId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export function PostAttachmentsView({
  channelKey,
  postId,
  currentUserId,
  isAdmin,
}: Props) {
  return (
    <AttachmentList
      parent={{ kind: "post", channelKey, postId }}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
    />
  );
}
