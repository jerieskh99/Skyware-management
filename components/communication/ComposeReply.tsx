"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  channelKey: string;
  postId: string;
}

export function ComposeReply({ channelKey, postId }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError("Reply cannot be empty."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/channels/${channelKey}/posts/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to post reply.");
        return;
      }

      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        placeholder="Write a reply..."
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isPending}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Posting..." : "Reply"}
      </Button>
    </form>
  );
}
