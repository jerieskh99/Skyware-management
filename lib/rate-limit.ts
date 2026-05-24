import { NextResponse } from "next/server";

/**
 * Simple in-memory rate limiter.
 *
 * LIMITATION: State is per-process and resets on restart. This is suitable for
 * single-process pilot deployments. For production multi-instance deployments
 * (e.g. Docker replicas, Vercel), replace with a Redis-backed solution such as
 * @upstash/ratelimit or ioredis. See docs/production-readiness.md.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Periodically clean expired entries to prevent unbounded memory growth.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store.entries()) {
      if (win.resetAt < now) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const win = store.get(key);

  if (!win || win.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return false; // not limited
  }

  win.count += 1;
  return win.count > opts.max;
}

/** Extract client IP for rate-limit keying. Falls back to "unknown". */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Ready-to-return 429 response. */
export function tooManyRequests(message = "Too many requests. Please wait before trying again.") {
  return NextResponse.json({ error: message }, { status: 429 });
}

// Pre-configured limits for common use cases.
export const LIMITS = {
  /** Password reset/change: 5 attempts per 15 minutes per IP. */
  passwordReset: { windowMs: 15 * 60 * 1000, max: 5 },
  /** Admin user create: 20 per 15 minutes per IP. */
  adminCreate: { windowMs: 15 * 60 * 1000, max: 20 },
  /**
   * Credentials sign-in: 10 attempts per 15 minutes per IP.
   * Tighter than UI guidance so brute-force is impractical without exposing
   * a normal user who fat-fingers a few passwords during a single session.
   */
  authLogin: { windowMs: 15 * 60 * 1000, max: 10 },
} as const;
