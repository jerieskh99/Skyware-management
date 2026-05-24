type LogLevel = "error" | "warn" | "info";
type LogMeta = Record<string, unknown>;

const ENV = process.env.NODE_ENV ?? "development";

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    env: ENV,
    message,
    ...(meta ?? {}),
  };

  const fn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  // Single-line JSON: consumable by any log shipper (Sentry, Logtail, Vercel).
  // Swap this body for a structured sink later without touching call sites.
  fn(JSON.stringify(line));
}

export const logger = {
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
};

/**
 * Wrap an async API handler body so any unexpected throw is logged with
 * context, then re-raised for Next.js to surface as a 500.
 *
 *   return withErrorLog("clients.create", async () => { ... });
 */
export async function withErrorLog<T>(
  context: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error("api.unhandled", {
      context,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
    });
    throw err;
  }
}
