/**
 * time.ts — the steps and ticks of a time axis, on the wall-clock boundaries
 * of a time zone.
 * @module
 */

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

/** The time axis's increments, finest first. */
export const TIME_STEPS: readonly number[] = [
  MIN,
  5 * MIN,
  10 * MIN,
  15 * MIN,
  30 * MIN,
  HR,
  2 * HR,
  3 * HR,
  6 * HR,
  12 * HR,
  DAY,
  2 * DAY,
  7 * DAY,
];

/** The index in `TIME_STEPS` of the finest step at least `spacing` px wide
 *  when `span` ms take `px` px; the coarsest when none is. */
export function timeStep(span: number, px: number, spacing: number): number {
  const at = TIME_STEPS.findIndex((step) => (step * px) / span >= spacing);
  return at === -1 ? TIME_STEPS.length - 1 : at;
}

const parts = new Map<string, Intl.DateTimeFormat>();

// A wall clock with Latin digits and a 0-to-23 hour in every locale, so its
// parts read back as numbers.
function clock(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let dtf = parts.get(key);
  if (dtf === undefined) {
    dtf = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      hourCycle: "h23",
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
  for (const p of clock(timeZone).formatToParts(t)) {
    f[p.type] = Number(p.value);
  }
  const at = Date.UTC(
    f["year"] ?? 1970,
    (f["month"] ?? 1) - 1,
    f["day"] ?? 1,
    f["hour"] ?? 0,
    f["minute"] ?? 0,
    f["second"] ?? 0,
  );
  return at + (((t % 1_000) + 1_000) % 1_000);
}

const offset = (t: number, timeZone: string | undefined): number => wall(t, timeZone) - t;

// The instants whose wall clock reads `w`: none in a spring gap, two in an
// autumn overlap. A zone changes its offset at most once within a day of `w`.
function instants(w: number, timeZone: string | undefined): number[] {
  const before = w - offset(w - DAY, timeZone);
  const after = w - offset(w + DAY, timeZone);
  const found = [before, after].filter((t) => wall(t, timeZone) === w);
  return [...new Set(found)].sort((a, b) => a - b);
}

/** The ticks `TIME_STEPS[at]` apart from `lo` to `hi`, on `timeZone`'s wall
 *  clock: below a day, every instant whose clock reads a multiple of the
 *  step since midnight, so an hour step gives a 23- or 25-tick day and never
 *  a half hour; from a day, each local midnight (the day's first instant when
 *  midnight is skipped), every other day by the day count since 1970, and
 *  Mondays for a week. */
export function timeTicks(
  lo: number,
  hi: number,
  at: number,
  timeZone: string | undefined,
): number[] {
  const step = TIME_STEPS[at] ?? DAY;
  const ticks = new Set<number>();
  const offLo = offset(lo, timeZone);
  const offHi = offset(hi, timeZone);
  if (step < DAY && offLo === offHi) {
    // One offset at both ends of a span of at most weeks: no change between.
    for (let w = Math.ceil((lo + offLo) / step) * step; w - offLo <= hi; w += step) {
      ticks.add(w - offLo);
    }
  } else if (step < DAY) {
    // An overlap reads earlier wall times after `lo`, at most hours earlier.
    const from = lo + Math.min(offLo, offHi) - 3 * HR;
    const to = hi + Math.max(offLo, offHi) + 3 * HR;
    for (let w = Math.ceil(from / step) * step; w <= to; w += step) {
      for (const t of instants(w, timeZone)) {
        ticks.add(t);
      }
    }
  } else {
    const from = lo + offLo - DAY;
    const to = hi + offHi + DAY;
    for (let w = Math.ceil(from / DAY) * DAY; w <= to; w += DAY) {
      const day = w / DAY;
      // 1 January 1970 was a Thursday, three days after a Monday.
      const keep = step === DAY || (step === 2 * DAY ? day % 2 === 0 : (day + 3) % 7 === 0);
      if (keep) {
        const first = instants(w, timeZone)[0] ?? w - offset(w - DAY, timeZone);
        ticks.add(first);
      }
    }
  }
  return [...ticks].filter((t) => t >= lo && t <= hi).sort((a, b) => a - b);
}

/** The local day `t` falls on in `timeZone`, as a day count since 1970. */
export const localDay = (t: number, timeZone: string | undefined): number =>
  Math.floor(wall(t, timeZone) / DAY);
