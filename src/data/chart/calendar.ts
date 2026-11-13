/**
 * calendar.ts — a calendar heatmap's days and weeks: the locale's first day
 * of the week, each day's place in its week column and block, the fold into
 * blocks of weeks, and the date a month away.
 * @module
 */

const DAY = 86_400_000;

/** A week column narrower than this folds the calendar into blocks. */
const WEEK_MIN = 12;
/** The weeks a folded block holds, the wider fold first. */
const FOLDS = [26, 13];

/** The ISO weekday (1 Monday to 7 Sunday) a week starts on in `locale`, from
 *  `Intl.Locale` `getWeekInfo`; Monday, ISO 8601's first day, in an engine
 *  without it. */
export function weekStartOf(locale: string | undefined): number {
  const tag = locale ?? new Intl.DateTimeFormat().resolvedOptions().locale;
  const info = new Intl.Locale(tag) as { readonly getWeekInfo?: () => { firstDay?: unknown } };
  const first = typeof info.getWeekInfo === "function" ? info.getWeekInfo().firstDay : undefined;
  return typeof first === "number" && Number.isInteger(first) && first >= 1 && first <= 7
    ? first
    : 1;
}

/** The ISO weekday of local day `day`, a day count since 1970. */
// 1 January 1970, day 0, was a Thursday.
export const isoWeekday = (day: number): number => ((((day + 3) % 7) + 7) % 7) + 1;

/** Day `day`'s row in a week starting on ISO weekday `weekStart`, 0 to 6. */
export const weekRow = (day: number, weekStart: number): number =>
  (isoWeekday(day) - weekStart + 7) % 7;

/** The week columns `days` days take when the first sits at row `lead`. */
export const weekCount = (lead: number, days: number): number =>
  days === 0 ? 0 : Math.ceil((lead + days) / 7);

/** The week columns a block holds on a plot `width` px wide: every week, or
 *  26, then 13, until a column is `WEEK_MIN` px or more; 13 at the least. */
export function foldSize(weeks: number, width: number): number {
  for (const size of [weeks, ...FOLDS]) {
    const columns = Math.min(size, weeks);
    if (width / columns >= WEEK_MIN) {
      return columns;
    }
  }
  return Math.min(FOLDS[FOLDS.length - 1] ?? 13, weeks);
}

/** Where a calendar's days lie: day 0 at row `lead`, `size` week columns a
 *  block. */
export interface Weeks {
  readonly lead: number;
  readonly size: number;
  readonly days: number;
}

/** Day `i`'s block, its column in the block and its weekday row. */
export function dayPlace(
  w: Weeks,
  i: number,
): { readonly block: number; readonly column: number; readonly row: number } {
  const q = w.lead + i;
  const week = Math.floor(q / 7);
  return { block: Math.floor(week / w.size), column: week % w.size, row: q % 7 };
}

/** The day at `row` of `column` in `block`; -1 for a place outside the days. */
export function dayAt(w: Weeks, block: number, column: number, row: number): number {
  if (column < 0 || column >= w.size || row < 0 || row > 6) {
    return -1;
  }
  const i = (block * w.size + column) * 7 + row - w.lead;
  return i >= 0 && i < w.days ? i : -1;
}

/** The local day `months` months from `day` on the same date, or that
 *  month's last day when it has no such date. */
export function monthsFrom(day: number, months: number): number {
  const d = new Date(day * DAY);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / DAY;
}

/** Whether local day `day` is the first of its month. */
export const monthFirst = (day: number): boolean => new Date(day * DAY).getUTCDate() === 1;

/** `day` written by `options` in `locale`, on its own calendar date
 *  whatever the chart's time zone. */
export function dayFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): (day: number) => string {
  const df = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
  return (day) => df.format(day * DAY);
}
