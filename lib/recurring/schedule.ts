import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { RecurringCadence } from "@prisma/client";

/**
 * Anchor shape per cadence (validated at the Zod layer in `template-queries`):
 *   daily      -> { minuteOfDay: 0..1439 }
 *   weekly     -> { dayOfWeek: 0..6,  minuteOfDay: 0..1439 } (0 = Sunday)
 *   biweekly   -> { dayOfWeek: 0..6,  minuteOfDay: 0..1439 } (every other week)
 *   monthly    -> { dayOfMonth: 1..28, minuteOfDay: 0..1439 }
 *   quarterly  -> { dayOfMonth: 1..28, minuteOfDay: 0..1439 } (every 3rd month from anchor)
 */

export interface DailyAnchor {
  minuteOfDay: number;
}
export interface WeeklyAnchor {
  dayOfWeek: number;
  minuteOfDay: number;
}
export interface MonthlyAnchor {
  dayOfMonth: number;
  minuteOfDay: number;
}

export type AnchorByCadence = {
  daily: DailyAnchor;
  weekly: WeeklyAnchor;
  biweekly: WeeklyAnchor;
  monthly: MonthlyAnchor;
  quarterly: MonthlyAnchor;
};

const MIN_PER_DAY = 24 * 60;

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readDaily(anchor: unknown): DailyAnchor {
  const o = (anchor ?? {}) as Record<string, unknown>;
  const m = asNumber(o["minuteOfDay"]);
  if (m === null || m < 0 || m >= MIN_PER_DAY || !Number.isInteger(m)) {
    throw new Error("daily anchor requires integer minuteOfDay in [0, 1439]");
  }
  return { minuteOfDay: m };
}

function readWeekly(anchor: unknown): WeeklyAnchor {
  const o = (anchor ?? {}) as Record<string, unknown>;
  const m = asNumber(o["minuteOfDay"]);
  const d = asNumber(o["dayOfWeek"]);
  if (m === null || m < 0 || m >= MIN_PER_DAY || !Number.isInteger(m)) {
    throw new Error("weekly anchor requires integer minuteOfDay in [0, 1439]");
  }
  if (d === null || d < 0 || d > 6 || !Number.isInteger(d)) {
    throw new Error("weekly anchor requires integer dayOfWeek in [0, 6]");
  }
  return { dayOfWeek: d, minuteOfDay: m };
}

function readMonthly(anchor: unknown): MonthlyAnchor {
  const o = (anchor ?? {}) as Record<string, unknown>;
  const m = asNumber(o["minuteOfDay"]);
  const d = asNumber(o["dayOfMonth"]);
  if (m === null || m < 0 || m >= MIN_PER_DAY || !Number.isInteger(m)) {
    throw new Error("monthly anchor requires integer minuteOfDay in [0, 1439]");
  }
  if (d === null || d < 1 || d > 28 || !Number.isInteger(d)) {
    throw new Error("monthly anchor requires integer dayOfMonth in [1, 28]");
  }
  return { dayOfMonth: d, minuteOfDay: m };
}

/** Read an anchor as the typed shape for its cadence. */
export function readAnchor<C extends RecurringCadence>(
  cadence: C,
  anchor: unknown
): AnchorByCadence[C] {
  switch (cadence) {
    case "daily":
      return readDaily(anchor) as AnchorByCadence[C];
    case "weekly":
    case "biweekly":
      return readWeekly(anchor) as AnchorByCadence[C];
    case "monthly":
    case "quarterly":
      return readMonthly(anchor) as AnchorByCadence[C];
    default:
      throw new Error(`unknown cadence: ${String(cadence)}`);
  }
}

/** Compose a Date in the given timezone with explicit Y/M/D/h/m parts. */
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const iso = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00`;
  return fromZonedTime(iso, timezone);
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function pad4(n: number): string { return String(n).padStart(4, "0"); }

interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0..6, 0 = Sunday
}

function partsOf(d: Date, timezone: string): ZonedParts {
  const zd = toZonedTime(d, timezone);
  return {
    year: zd.getFullYear(),
    month: zd.getMonth() + 1,
    day: zd.getDate(),
    hour: zd.getHours(),
    minute: zd.getMinutes(),
    weekday: zd.getDay(),
  };
}

function addDays(parts: ZonedParts, n: number, timezone: string, hour: number, minute: number): Date {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + n);
  return zonedDate(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    hour,
    minute,
    timezone
  );
}

function nextDaily(from: Date, anchor: DailyAnchor, timezone: string): Date {
  const p = partsOf(from, timezone);
  const todayAt = zonedDate(p.year, p.month, p.day, Math.floor(anchor.minuteOfDay / 60), anchor.minuteOfDay % 60, timezone);
  if (todayAt.getTime() > from.getTime()) return todayAt;
  return addDays(p, 1, timezone, Math.floor(anchor.minuteOfDay / 60), anchor.minuteOfDay % 60);
}

function nextWeekly(from: Date, anchor: WeeklyAnchor, timezone: string, intervalWeeks: number): Date {
  const hour = Math.floor(anchor.minuteOfDay / 60);
  const minute = anchor.minuteOfDay % 60;
  const p = partsOf(from, timezone);
  const todayDelta = (anchor.dayOfWeek - p.weekday + 7) % 7;
  const candidate = addDays(p, todayDelta, timezone, hour, minute);
  if (todayDelta === 0 && candidate.getTime() <= from.getTime()) {
    return addDays(p, 7 * intervalWeeks, timezone, hour, minute);
  }
  return candidate;
}

function nextMonthly(from: Date, anchor: MonthlyAnchor, timezone: string, intervalMonths: number): Date {
  const hour = Math.floor(anchor.minuteOfDay / 60);
  const minute = anchor.minuteOfDay % 60;
  const p = partsOf(from, timezone);
  const thisMonth = zonedDate(p.year, p.month, anchor.dayOfMonth, hour, minute, timezone);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;
  let m = p.month + intervalMonths;
  let y = p.year;
  while (m > 12) { m -= 12; y += 1; }
  return zonedDate(y, m, anchor.dayOfMonth, hour, minute, timezone);
}

/**
 * Compute the next time a template should run, strictly AFTER `from`.
 *
 * Pure function. No side effects, no DB. The template writer calls this with
 * `from = new Date()` for first scheduling and with `from = lastGeneratedAt`
 * (or current time) after each generation.
 */
export function computeNextRunAt(
  from: Date,
  cadence: RecurringCadence,
  anchor: unknown,
  timezone: string
): Date {
  switch (cadence) {
    case "daily":
      return nextDaily(from, readDaily(anchor), timezone);
    case "weekly":
      return nextWeekly(from, readWeekly(anchor), timezone, 1);
    case "biweekly":
      return nextWeekly(from, readWeekly(anchor), timezone, 2);
    case "monthly":
      return nextMonthly(from, readMonthly(anchor), timezone, 1);
    case "quarterly":
      return nextMonthly(from, readMonthly(anchor), timezone, 3);
    default:
      throw new Error(`unknown cadence: ${String(cadence)}`);
  }
}

/** Render a short human summary like "daily 09:00" or "weekly Mon 14:30". */
export function describeCadence(cadence: RecurringCadence, anchor: unknown): string {
  switch (cadence) {
    case "daily": {
      const a = readDaily(anchor);
      return `daily ${fmtTime(a.minuteOfDay)}`;
    }
    case "weekly":
    case "biweekly": {
      const a = readWeekly(anchor);
      return `${cadence} ${dayName(a.dayOfWeek)} ${fmtTime(a.minuteOfDay)}`;
    }
    case "monthly":
    case "quarterly": {
      const a = readMonthly(anchor);
      return `${cadence} day ${a.dayOfMonth} ${fmtTime(a.minuteOfDay)}`;
    }
    default:
      return String(cadence);
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayName(d: number): string { return DAY_NAMES[d] ?? String(d); }
function fmtTime(minuteOfDay: number): string {
  return `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/** Render a job title from a template, replacing date placeholders.
 *  Supported: {{date}} (yyyy-MM-dd), {{week}} (yyyy-Www), {{month}} (yyyy-MM). */
export function renderTitle(template: string, now: Date, timezone: string): string {
  const p = partsOf(now, timezone);
  const date = `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
  const month = `${pad4(p.year)}-${pad2(p.month)}`;
  const week = `${pad4(p.year)}-W${pad2(isoWeek(p.year, p.month, p.day))}`;
  return template
    .replaceAll("{{date}}", date)
    .replaceAll("{{week}}", week)
    .replaceAll("{{month}}", month);
}

function isoWeek(year: number, month: number, day: number): number {
  // ISO 8601 week number.
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
