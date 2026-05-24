import { formatInTimeZone } from "date-fns-tz";
import { format, formatDistanceToNowStrict } from "date-fns";

const TZ = process.env["TZ"] ?? "Asia/Jerusalem";

/** Format a date in the company timezone for display. */
export function formatTz(date: Date, fmt = "dd/MM/yyyy HH:mm"): string {
  return formatInTimeZone(date, TZ, fmt);
}

/** Format a date-only value (no time component). */
export function formatDate(date: Date): string {
  return formatInTimeZone(date, TZ, "dd/MM/yyyy");
}

/** Human-readable "2 hours ago" style relative time. */
export function timeAgo(date: Date): string {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** ISO date string (YYYY-MM) for billing periods. */
export function toYearMonth(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Current year as a number. */
export function currentYear(): number {
  return new Date().getFullYear();
}
