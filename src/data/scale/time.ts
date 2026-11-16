/**
 * time.ts — the steps and ticks of a time axis, on the wall-clock boundaries
 * of a time zone.
 * @module
 */

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;
// The Gregorian calendar's mean month and year, 365.2425 days, which only
// space the steps: their ticks fall on a month's or a year's first day.
const MONTH = 2_629_746_000;
const YEAR = 12 * MONTH;

// How far from 1970 an instant may lie, in ms: what `Date` holds
// (ECMA-262, "Time Values and Time Range").
const TIME_LIMIT = 8.64e15;

/** Throws a `RangeError` naming `what` unless instant `t` lies within
 *  `TIME_LIMIT`. */
export function withinTime(t: number, what: string): void {
  if (!(Math.abs(t) <= TIME_LIMIT)) {
    throw new RangeError(
      `${what} must lie within 8.64e15 ms either side of 1970, the range Date holds`,
    );
  }
}

/** The one way the chart and its scales make a `Date`, so an instant past
 *  `TIME_LIMIT` is a `RangeError` naming `what`, never the engine's
 *  "Invalid time value" from wherever it is written. */
export function dateAt(t: number, what: string): Date {
  withinTime(t, what);
  return new Date(t);
}

/** What a time step counts. */
export type TimeUnit = "minute" | "hour" | "day" | "month" | "year";

/** A step of the time axis: `count` of `unit`, `ms` long on average. */
interface TimeStep {
  readonly unit: TimeUnit;
  readonly count: number;
  readonly ms: number;
}

const LENGTH: Readonly<Record<TimeUnit, number>> = {
  minute: MIN,
  hour: HR,
  day: DAY,
  month: MONTH,
  year: YEAR,
};

const steps = (unit: TimeUnit, counts: readonly number[]): TimeStep[] =>
  counts.map((count) => ({ unit, count, ms: count * LENGTH[unit] }));

/** The time axis's increments, finest first, as uPlot's are: years go on
 *  by 1, 2 and 5 times each power of ten up to 500,000, whose one tick
 *  across all that `Date` holds is year 0. */
export const TIME_STEPS: readonly TimeStep[] = [
  ...steps("minute", [1, 5, 10, 15, 30]),
  ...steps("hour", [1, 2, 3, 6, 12]),
  ...steps("day", [1, 2, 7]),
  ...steps("month", [1, 3, 6]),
  ...steps(
    "year",
    [1, 10, 100, 1_000, 10_000, 100_000].flatMap((p) => [p, 2 * p, 5 * p]),
  ),
];

/** The index in `TIME_STEPS` of the finest step at least `spacing` px wide
 *  when `span` ms take `px` px; the coarsest when none is. */
export function timeStep(span: number, px: number, spacing: number): number {
  const at = TIME_STEPS.findIndex((step) => (step.ms * px) / span >= spacing);
  return at === -1 ? TIME_STEPS.length - 1 : at;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** The day count since 1970 of a proleptic Gregorian date, month 1 to 12, by
 *  Howard Hinnant's days_from_civil, so year 0 to 99 and years past what
 *  `Date` holds count as written:
 *  https://howardhinnant.github.io/date_algorithms.html#days_from_civil */
export function civilDays(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * mod(month - 3, 12) + 2) / 5) + day - 1;
  return era * 146_097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719_468;
}

/** The year, month (1 to 12) and day of a day count since 1970, by
 *  civil_from_days, for any whole count. */
export function civil(days: number): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const month = mp < 10 ? mp + 3 : mp - 9;
  return {
    year: yoe + era * 400 + (month <= 2 ? 1 : 0),
    month,
    day: doy - Math.floor((153 * mp + 2) / 5) + 1,
  };
}

const parts = new Map<string, Intl.DateTimeFormat>();

// A wall clock with Latin digits, a 0-to-23 hour and an era in every
// locale, so its parts read back as numbers and a year before 1 as one.
function clock(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let dtf = parts.get(key);
  if (dtf === undefined) {
    dtf = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      ...(timeZone === undefined ? {} : { timeZone }),
    });
    parts.set(key, dtf);
  }
  return dtf;
}

/** The wall-clock time at instant `t` in `timeZone`, as milliseconds of a
 *  clock that keeps no zone (UTC's fields): local midnights are multiples of
 *  a day. */
function wall(t: number, timeZone: string | undefined): number {
  const f: Record<string, number> = {};
  let before = false;
  for (const p of clock(timeZone).formatToParts(dateAt(t, "an instant on the wall clock"))) {
    if (p.type === "era") {
      before = p.value === "BC";
    } else {
      f[p.type] = Number(p.value);
    }
  }
  const year = f["year"] ?? 1970;
  const day = civilDays(before ? 1 - year : year, f["month"] ?? 1, f["day"] ?? 1);
  const time = (f["hour"] ?? 0) * HR + (f["minute"] ?? 0) * MIN + (f["second"] ?? 0) * 1_000;
  return day * DAY + time + mod(t, 1_000);
}

// A probe past what `Date` holds reads its edge's offset, local mean time
// in every zone there.
const offset = (t: number, timeZone: string | undefined): number => {
  const at = Math.min(Math.max(t, -TIME_LIMIT), TIME_LIMIT);
  return wall(at, timeZone) - at;
};

// The instants whose wall clock reads `w`: none in a spring gap, two in an
// autumn overlap. A zone changes its offset at most once within a day of `w`.
function instants(w: number, timeZone: string | undefined): number[] {
  const before = w - offset(w - DAY, timeZone);
  const after = w - offset(w + DAY, timeZone);
  const found = [before, after].filter((t) => Math.abs(t) <= TIME_LIMIT && wall(t, timeZone) === w);
  return [...new Set(found)].sort((a, b) => a - b);
}

/** The first instant of local day `day` (a day count since 1970) in
 *  `timeZone`: its midnight, or the instant after a skipped one. */
export const midnight = (day: number, timeZone: string | undefined): number => {
  const w = day * DAY;
  return instants(w, timeZone)[0] ?? w - offset(w - DAY, timeZone);
};

// The local days from `from` to `to` that a day, month or year step ticks
// on: every day, every other day by the count since 1970, Mondays for a
// week, and the first day of every `count`th month or year from year 0.
function stepDays(step: TimeStep, from: number, to: number): number[] {
  const days: number[] = [];
  const { count } = step;
  if (step.unit === "day") {
    // 1 January 1970 was a Thursday, three days after a Monday.
    const first = count === 7 ? from + mod(-(from + 3), 7) : from + mod(-from, count);
    for (let d = first; d <= to; d += count) {
      days.push(d);
    }
    return days;
  }
  const lo = civil(from);
  const hi = civil(to);
  if (step.unit === "month") {
    const last = hi.year * 12 + hi.month - 1;
    for (let q = Math.ceil((lo.year * 12 + lo.month - 1) / count) * count; q <= last; q += count) {
      days.push(civilDays(Math.floor(q / 12), mod(q, 12) + 1, 1));
    }
    return days;
  }
  for (let y = Math.ceil(lo.year / count) * count; y <= hi.year; y += count) {
    days.push(civilDays(y, 1, 1));
  }
  return days;
}

// Whether a span of at most two weeks keeps one offset throughout, read once
// a day: tzdata holds no change and its return within a day of each other.
function sameOffset(
  lo: number,
  hi: number,
  offLo: number,
  offHi: number,
  timeZone: string | undefined,
): boolean {
  if (offLo !== offHi || hi - lo > 14 * DAY) {
    return false;
  }
  for (let t = lo + DAY; t < hi; t += DAY) {
    if (offset(t, timeZone) !== offLo) {
      return false;
    }
  }
  return true;
}

/** The ticks `TIME_STEPS[at]` apart from `lo` to `hi`, on `timeZone`'s wall
 *  clock, generating only those: below a day, every instant whose clock
 *  reads a multiple of the step since midnight, so an hour step gives a 23-
 *  or 25-tick day and never a half hour; from a day, the local midnights
 *  (the day's first instant when midnight is skipped) `stepDays` names.
 *  Both ends lie within `TIME_LIMIT`. */
export function timeTicks(
  lo: number,
  hi: number,
  at: number,
  timeZone: string | undefined,
): number[] {
  const step = TIME_STEPS[at];
  if (step === undefined) {
    return [];
  }
  const ticks = new Set<number>();
  const offLo = offset(lo, timeZone);
  const offHi = offset(hi, timeZone);
  const { ms } = step;
  if (step.unit !== "minute" && step.unit !== "hour") {
    const from = Math.floor((lo + offLo) / DAY);
    for (const day of stepDays(step, from, Math.floor((hi + offHi) / DAY))) {
      ticks.add(midnight(day, timeZone));
    }
  } else if (sameOffset(lo, hi, offLo, offHi, timeZone)) {
    for (let w = Math.ceil((lo + offLo) / ms) * ms; w - offLo <= hi; w += ms) {
      ticks.add(w - offLo);
    }
  } else {
    // An overlap reads earlier wall times after `lo`, at most hours earlier.
    const from = lo + Math.min(offLo, offHi) - 3 * HR;
    const to = hi + Math.max(offLo, offHi) + 3 * HR;
    for (let w = Math.ceil(from / ms) * ms; w <= to; w += ms) {
      for (const t of instants(w, timeZone)) {
        ticks.add(t);
      }
    }
  }
  return [...ticks].filter((t) => t >= lo && t <= hi).sort((a, b) => a - b);
}

/** Whether `lo` to `hi` spans a whole day: 24 hours elapsed, or 24 hours on
 *  `timeZone`'s wall clock, as a 23-hour spring-forward day does. A shorter
 *  span across midnight does not. */
export const spansDay = (lo: number, hi: number, timeZone: string | undefined): boolean =>
  hi - lo >= DAY || wall(hi, timeZone) - wall(lo, timeZone) >= DAY;

/** The local day `t` falls on in `timeZone`, as a day count since 1970. */
export const localDay = (t: number, timeZone: string | undefined): number =>
  Math.floor(wall(t, timeZone) / DAY);

/** The local year `t` falls in in `timeZone`, 0 for 1 BC and below it
 *  before. */
export const localYear = (t: number, timeZone: string | undefined): number =>
  civil(localDay(t, timeZone)).year;

/** The calendar unit an instant's words name: its minute, or the day, month
 *  or year it starts. */
export type Grain = "minute" | "day" | "month" | "year";

/** The coarsest grain every instant of `times` starts in `timeZone`: a local
 *  midnight (a day's first instant where midnight is skipped) for "day",
 *  the 1st of a month for "month", 1 January for "year"; "minute" for none. */
export function grainOf(times: Iterable<number>, timeZone: string | undefined): Grain {
  let grain: Grain | undefined;
  for (const t of times) {
    const w = wall(t, timeZone);
    const day = Math.floor(w / DAY);
    if (mod(w, DAY) !== 0 && t !== midnight(day, timeZone)) {
      return "minute";
    }
    const date = civil(day);
    if (date.day !== 1) {
      grain = "day";
    } else if (date.month !== 1 && grain !== "day") {
      grain = "month";
    } else {
      grain ??= "year";
    }
  }
  return grain ?? "minute";
}

/** The whole grains from `a` to `b` on `timeZone`'s calendar, both on that
 *  grain: 1 for a 23-hour day, 2 from 1 January to 1 March. */
export function grainsBetween(
  a: number,
  b: number,
  grain: Exclude<Grain, "minute">,
  timeZone: string | undefined,
): number {
  const from = localDay(a, timeZone);
  const to = localDay(b, timeZone);
  if (grain === "day") {
    return to - from;
  }
  const p = civil(from);
  const q = civil(to);
  return grain === "month" ? (q.year - p.year) * 12 + q.month - p.month : q.year - p.year;
}

/** The first instant of the grain before the one `t` starts. */
export function grainBefore(
  t: number,
  grain: Exclude<Grain, "minute">,
  timeZone: string | undefined,
): number {
  const day = localDay(t, timeZone);
  if (grain === "day") {
    return midnight(day - 1, timeZone);
  }
  const { year, month } = civil(day);
  const before =
    grain === "year"
      ? civilDays(year - 1, 1, 1)
      : civilDays(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, 1);
  return midnight(before, timeZone);
}
