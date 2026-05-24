"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }
    if (!current) { setError("Current password is required."); return; }

    startTransition(async () => {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Failed to change password.");
        return;
      }

      setSaved(true);
      setCurrent(""); setNext(""); setConfirm("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="currentPw" className="text-sm font-medium">
          Current password
        </label>
        <Input
          id="currentPw"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="newPw" className="text-sm font-medium">
          New password
        </label>
        <Input
          id="newPw"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirmPw" className="text-sm font-medium">
          Confirm new password
        </label>
        <Input
          id="confirmPw"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Password changed.</p>}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}
