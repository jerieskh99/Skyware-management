import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Link href="/dashboard" className="text-sm underline underline-offset-4">
        Go to Dashboard
      </Link>
    </div>
  );
}
