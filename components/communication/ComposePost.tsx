"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PendingAttachmentChips } from "@/components/attachments/PendingAttachmentChips";

interface Tag {
  key: string;
  labelEn: string;
  colorHex: string | null;
  scope: string;
}

interface Props {
  channelKey: string;
  attachmentsEnabled?: boolean;
}

export function ComposePost({ channelKey, attachmentsEnabled = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data: Tag[]) =>
        setAvailableTags(data.filter((t) => t.scope === "communication" || t.scope === "both"))
      )
      .catch(() => {/* silently ignore */});
  }, []);

  function toggleTag(key: string) {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function reset() {
    setTitle("");
    setBody("");
    setSelectedTags([]);
    setPendingIds([]);
    setError(null);
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!body.trim()) { setError("Body is required."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/channels/${channelKey}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          tagKeys: selectedTags.length ? selectedTags : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to create post.");
        return;
      }

      const created = (await res.json()) as { id: string };
      for (const attachmentId of pendingIds) {
        await fetch(`/api/channels/${channelKey}/posts/${created.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId }),
        });
      }

      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
      >
        <ChevronDown className="h-4 w-4" />
        Write a post in this channel...
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">New post</h3>
        <button
          onClick={reset}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          aria-label="Collapse compose form"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Title *</label>
          <Input
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Body *</label>
          <Textarea
            placeholder="What do you want to share with the team?"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isPending}
          />
        </div>

        {availableTags.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => toggleTag(tag.key)}
                  disabled={isPending}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    selectedTags.includes(tag.key)
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent"
                  }`}
                  style={
                    selectedTags.includes(tag.key) && tag.colorHex
                      ? { backgroundColor: tag.colorHex, borderColor: tag.colorHex }
                      : undefined
                  }
                >
                  {tag.labelEn}
                </button>
              ))}
            </div>
          </div>
        )}

        {attachmentsEnabled && (
          <PendingAttachmentChips onIdsChange={setPendingIds} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Posting..." : "Post"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
