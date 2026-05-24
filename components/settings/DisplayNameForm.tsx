"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props { currentName: string }

export function DisplayNameForm({ currentName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === currentName) return;
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Save failed.");
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <Input
          id="displayName"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          disabled={isPending}
          maxLength={100}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}
      <Button
        type="submit"
        size="sm"
        disabled={isPending || !name.trim() || name.trim() === currentName}
      >
        {isPending ? "Saving..." : "Save name"}
      </Button>
    </form>
  );
}
