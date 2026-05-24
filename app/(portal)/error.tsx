"use client";

import Link from "next/link";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        This section encountered an unexpected error.
        {error.digest && (
          <span className="block mt-1 text-xs font-mono opacity-60">ID: {error.digest}</span>
        )}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          Try again
        </button>
        <Link href="/dashboard" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
