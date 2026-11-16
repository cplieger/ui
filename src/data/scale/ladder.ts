/**
 * ladder.ts — the ticks a duration axis draws, in seconds, from chartdata's
 * duration ladder.
 * @module
 */

import { DURATION_EDGES } from "../frame/limits.js";

const MIN = 60;
const HR = 60 * MIN;
const DAY = 24 * HR;

/** The ticks of a duration axis, ascending: the units people say up to 3
 *  days, then every ladder edge above. */
export const DURATION_TICKS: readonly number[] = [
  1,
  10,
  MIN,
  10 * MIN,
  HR,
  6 * HR,
  DAY,
  ...DURATION_EDGES.filter((edge) => edge >= 3 * DAY),
];

/** The duration axis's thinning lists after "every tick": these, each kept
 *  where it falls inside the domain, then the last tick in the domain. */
export const DURATION_THIN: readonly (readonly number[])[] = [
  [1, MIN, HR],
  [1, HR],
];
