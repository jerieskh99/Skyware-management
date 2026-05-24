import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { checkRateLimit, getClientIp, tooManyRequests, LIMITS } from "@/lib/rate-limit";

export const GET = handlers.GET;

export async function POST(req: NextRequest) {
  // Throttle credentials sign-in attempts per IP. Other NextAuth POST endpoints
  // (CSRF token issuance, sign-out) pass through untouched.
  if (req.nextUrl.pathname.endsWith("/callback/credentials")) {
    const key = `auth-login:${getClientIp(req)}`;
    if (checkRateLimit(key, LIMITS.authLogin)) {
      return tooManyRequests(
        "Too many login attempts. Try again in a few minutes.",
      );
    }
  }
  return handlers.POST(req);
}
