import { redirect } from "next/navigation";

/**
 * Root route. Middleware (`middleware.ts`) already redirects unauthenticated
 * requests at `/` to `/login`, so anything that reaches this page is a logged-in
 * user landing on the bare origin. Send them to the dashboard.
 */
export default function RootPage(): never {
  redirect("/dashboard");
}
