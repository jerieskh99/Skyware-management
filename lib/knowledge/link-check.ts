/**
 * Outbound URL health probe used by the knowledge-link-health cron.
 *
 * Kept as a tiny seam (`checkUrlHealth`) so the integration tests can mock
 * `globalThis.fetch` without going through the cron orchestrator. Production
 * uses a HEAD request with an AbortController-based 5s timeout and follows
 * redirects (the default for `fetch`).
 *
 * The function never throws on network failure: it returns a sentinel
 * `{ ok: false, status: null }` so the cron loop can continue scanning the
 * remaining rows.
 */

export interface LinkHealthResult {
  /** HTTP status code from the final response, or `null` on fetch error. */
  status: number | null;
  /** True iff status is in the 2xx range. */
  ok: boolean;
  /** Wall-clock duration of the probe, in milliseconds. */
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * HEAD-fetch `url` with a 5s timeout. Resolves to a result object; never
 * rejects. Callers should not rely on any specific error class; the
 * `status === null` sentinel covers DNS, TLS, timeout, and parser errors.
 */
export async function checkUrlHealth(
  url: string,
  options?: { timeoutMs?: number },
): Promise<LinkHealthResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await globalThis.fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      status: null,
      ok: false,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
