"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pin, PinOff, CheckCircle, Circle } from "lucide-react";

interface Props {
  channelKey: string;
  postId: string;
  resolved: boolean;
  pinned: boolean;
  isAuthor: boolean;
  isAdmin: boolean;
}

export function PostActions({
  channelKey,
  postId,
  resolved,
  pinned,
  isAuthor,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function patch(data: { resolved?: boolean; pinned?: boolean }) {
    const res = await fetch(`/api/channels/${channelKey}/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) router.refresh();
  }

  const canResolve = isAuthor || isAdmin;
  const canPin = isAdmin;

  if (!canResolve && !canPin) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canResolve && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => patch({ resolved: !resolved }))}
          className={resolved ? "text-green-600 border-green-200 hover:bg-green-50" : ""}
        >
          {resolved ? (
            <>
              <CheckCircle className="me-1.5 h-3.5 w-3.5" /> Resolved
            </>
          ) : (
            <>
              <Circle className="me-1.5 h-3.5 w-3.5" /> Mark resolved
            </>
          )}
        </Button>
      )}
      {canPin && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => patch({ pinned: !pinned }))}
        >
          {pinned ? (
            <>
              <PinOff className="me-1.5 h-3.5 w-3.5" /> Unpin
            </>
          ) : (
            <>
              <Pin className="me-1.5 h-3.5 w-3.5" /> Pin
            </>
          )}
        </Button>
      )}
    </div>
  );
}
