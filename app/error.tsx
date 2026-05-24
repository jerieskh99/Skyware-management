"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          An unexpected error occurred. If this persists, contact your system administrator.
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
            Go to Dashboard
          </Link>
        </div>
      </body>
    </html>
  );
}
