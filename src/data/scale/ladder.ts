/**
 * ladder.ts — the duration ladder: the edges a histogram of waits bins on,
 * and the ticks a duration axis draws.
 * @module
 */

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;
const DAY = 24 * HR;

// Every neighbouring pair of positive edges differs by a factor of 2 to 3, so
// no bin is more than 1.6 times as wide as another on a log axis. A longer
// ladder adds edges above, never moves one below: stored bins keep their edges.
const EDGES = [
  0,
  S,
  2 * S,
  5 * S,
  10 * S,
  30 * S,
  MIN,
  2 * MIN,
  5 * MIN,
  10 * MIN,
  30 * MIN,
  HR,
  2 * HR,
  6 * HR,
  12 * HR,
  DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
] as const;

const DEFAULT_MAX = 3 * DAY;
const LONGEST = 90 * DAY;

/** The duration ladder's bin edges, in milliseconds, from 0 up to its first
 *  edge at or above `maxMs`, the longest delay the data can hold (not a
 *  setting that may have changed since older data was written): 0, 1_000,
 *  2_000, 5_000, … 86_400_000, 259_200_000 (3 days, the default), then
 *  604_800_000, 1_209_600_000, 2_592_000_000 and 7_776_000_000 (7, 14, 30
 *  and 90 days). Each bin is [edge_i, edge_i+1) and the last is closed,
 *  [edge_n-1, edge_n], so every delay from 0 to the last edge falls in
 *  exactly one bin. Throws a `RangeError` unless `maxMs` is finite, above 0
 *  and at most 90 days. */
export function durationEdges(maxMs: number = DEFAULT_MAX): readonly number[] {
  if (!Number.isFinite(maxMs) || maxMs <= 0 || maxMs > LONGEST) {
    throw new RangeError(
      `durationEdges: maxMs must be finite, above 0 and at most ${String(LONGEST)} (90 days)`,
    );
  }
  const last = EDGES.findIndex((edge) => edge >= maxMs);
  return EDGES.slice(0, last + 1);
}

/** The ticks of a duration axis, ascending: the units people say up to 3
 *  days, then every ladder edge above. */
export const DURATION_TICKS: readonly number[] = [
  S,
  10 * S,
  MIN,
  10 * MIN,
  HR,
  6 * HR,
  DAY,
  ...EDGES.filter((edge) => edge >= 3 * DAY),
];

/** The duration axis's thinning lists after "every tick": these, each kept
 *  where it falls inside the domain, then the last tick in the domain. */
export const DURATION_THIN: readonly (readonly number[])[] = [
  [S, MIN, HR],
  [S, HR],
];
