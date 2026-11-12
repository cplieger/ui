/**
 * position.ts — the map from a continuous scale's values to pixels.
 * @module
 */

/** Maps `d0`..`d1` onto `r0`..`r1`, linearly or (for "log", d0 > 0) by
 *  logarithm, each end exactly onto its end of the range. A domain of one
 *  value maps to the range's middle. */
export function position(
  type: "linear" | "log" | "time",
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): (v: number) => number {
  const f = type === "log" ? Math.log : (v: number) => v;
  const a = f(d0);
  const span = f(d1) - a;
  if (span === 0) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  const k = (r1 - r0) / span;
  // d0 lands on r0 exactly by the sum; d1 only up to float error, so it is
  // pinned.
  return (v) => (v === d1 ? r1 : r0 + (f(v) - a) * k);
}
