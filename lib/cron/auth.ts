import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";

/**
 * Cron endpoints accept either:
 *   1. `Authorization: Bearer <CRON_SECRET>` header (system cron, Vercel cron).
 *   2. An authenticated admin session (manual trigger from the UI).
 * If neither holds, return 401.
 *
 * If `CRON_SECRET` is unset in the env, the bearer path is disabled and
 * routes are reachable only via an authenticated admin session.
 */

export type CronAuthResult =
  | { kind: "cron"; error?: never }
  | { kind: "admin"; userId: string; error?: never }
  | { kind: "deny"; error: NextResponse };

export async function requireCronAuth(req: Request): Promise<CronAuthResult> {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${secret}`) {
      return { kind: "cron" };
    }
  }

  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (user?.isAdmin) {
    return { kind: "admin", userId: user.id };
  }

  return {
    kind: "deny",
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
