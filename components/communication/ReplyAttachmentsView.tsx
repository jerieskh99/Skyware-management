"use client";

import { AttachmentList } from "@/components/attachments/AttachmentList";

interface Props {
  channelKey: string;
  postId: string;
  replyId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export function ReplyAttachmentsView({
  channelKey,
  postId,
  replyId,
  currentUserId,
  isAdmin,
}: Props) {
  return (
    <AttachmentList
      parent={{ kind: "reply", channelKey, postId, replyId }}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
    />
  );
}
