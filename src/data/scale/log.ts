/**
 * log.ts — the tick lists of a log axis, fullest first, which the axis thins
 * through since it has no coarser increment to move to.
 * @module
 */

import { DURATION_THIN, DURATION_TICKS } from "./ladder.js";
import { decimal } from "./linear.js";

const inside = (lo: number, hi: number) => (v: number) => v >= lo && v <= hi;

/**
 * The tick lists for `lo` to `hi` (0 < lo < hi). A duration axis: every
 * duration tick in the domain, then each `DURATION_THIN` list with the last
 * tick in the domain. Any other: 1, 2 and 5 times each power of ten, then
 * each power of ten, then the even powers of ten.
 */
export function logTickLists(lo: number, hi: number, duration: boolean): number[][] {
  const inDomain = inside(lo, hi);
  if (duration) {
    const every = DURATION_TICKS.filter(inDomain);
    const last = every.at(-1);
    if (last === undefined) {
      return [[]];
    }
    return [every, ...DURATION_THIN.map((list) => [...new Set([...list.filter(inDomain), last])])];
  }
  const ones: number[] = [];
  const all: number[] = [];
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
    if (inDomain(decimal(1, k))) {
      ones.push(k);
    }
    all.push(...[1, 2, 5].map((m) => decimal(m, k)).filter(inDomain));
  }
  return [
    all,
    ones.map((k) => decimal(1, k)),
    ones.filter((k) => k % 2 === 0).map((k) => decimal(1, k)),
  ];
}
