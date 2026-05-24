"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/permissions";

interface Props {
  user: SessionUser;
}

function initialsOf(user: SessionUser) {
  const source = user.username || "?";
  const parts = source.trim().split(/[\s._-]+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function UserMenu({ user }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand text-xs font-semibold">
        {initialsOf(user)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-none">
          {user.username}
        </p>
        <p className="mt-1 truncate text-[11px] capitalize text-muted-foreground">
          {user.roleKey}
        </p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Log out"
        aria-label="Log out"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
