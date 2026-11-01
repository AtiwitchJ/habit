// Logical day = local calendar date shifted by a per-user rollover.
// Rollover 240 (04:00): 2026-11-02 03:59 local -> logical '2026-11-01'.
// Pure functions. Only `currentLogicalDate` reads the clock, and only when `now` is omitted.

export type LogicalDate = string; // 'YYYY-MM-DD'

export interface DayBoundary {
  timeZone: string; // IANA id, e.g. 'Asia/Bangkok'
  rolloverMinutes: number; // minutes after local midnight the day flips, 0..1439 (240 = 04:00)
}

const DAY_MS = 86_400_000;
const LOGICAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

export function assertLogicalDate(value: string): LogicalDate {
  if (!LOGICAL_DATE_RE.test(value) || dayNumberToDate(dateToDayNumber(value)) !== value) {
    throw new RangeError(`Invalid logical date: ${value}`);
  }
  return value;
}

function dateToDayNumber(date: LogicalDate): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function dayNumberToDate(dayNumber: number): LogicalDate {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: LogicalDate, days: number): LogicalDate {
  return dayNumberToDate(dateToDayNumber(date) + days);
}

// Whole calendar days from `from` to `to`. Negative when `to` is earlier.
export function daysBetween(from: LogicalDate, to: LogicalDate): number {
  return dateToDayNumber(to) - dateToDayNumber(from);
}

// ISO weekday: 1 = Monday ... 7 = Sunday.
export function isoWeekday(date: LogicalDate): number {
  const sundayFirst = new Date(dateToDayNumber(date) * DAY_MS).getUTCDay();
  return ((sundayFirst + 6) % 7) + 1;
}

export function startOfIsoWeek(date: LogicalDate): LogicalDate {
  return addDays(date, 1 - isoWeekday(date));
}

function wallClock(instant: Date, timeZone: string): { date: LogicalDate; minutes: number } {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    // Throws RangeError on an unknown timeZone, which is the behavior we want.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function toLogicalDate(instant: Date | number, boundary: DayBoundary): LogicalDate {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) throw new RangeError('Invalid instant');
  if (!Number.isInteger(boundary.rolloverMinutes) || boundary.rolloverMinutes < 0 || boundary.rolloverMinutes > 1439) {
    throw new RangeError(`Invalid rolloverMinutes: ${boundary.rolloverMinutes}`);
  }
  // Compare wall-clock time of day, not an absolute offset. That keeps DST transitions correct.
  const local = wallClock(at, boundary.timeZone);
  return local.minutes < boundary.rolloverMinutes ? addDays(local.date, -1) : local.date;
}

export function currentLogicalDate(boundary: DayBoundary, now: Date | number = Date.now()): LogicalDate {
  return toLogicalDate(now, boundary);
}
