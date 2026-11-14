/**
 * linear.ts — the steps, niced domains and ticks of a linear axis.
 * @module
 */

// Twelve significant digits clear the binary noise of k * 0.1 and keep every
// value a chart can tell apart.
const clean = (v: number): number => Number(v.toPrecision(12));

const FINEST = 1e-300;

/** The smallest of 1, 2 and 5 times a power of ten at or above `min` (> 0),
 *  compared to twelve figures: niceStep(1.000000000004) is 1. */
export function niceStep(min: number): number {
  // A drifting quotient (0.6 / 6 is 0.10000000000000002) still takes its exact step.
  const least = clean(min);
  const power = 10 ** Math.floor(Math.log10(least));
  for (const m of [1, 2, 5]) {
    if (clean(m * power) >= least) {
      return clean(m * power);
    }
  }
  return clean(10 * power);
}

/**
 * The finest step `clean` keeps apart at the magnitude of `lo` and `hi`, their
 * twelfth figure, and never below 1e-300. A finer step or class width collapses:
 * 1e15 + 1 cleans to 1e15, 1e16 + 1 is 1e16, and a power of ten under 1e-323 is 0.
 */
export function resolution(lo: number, hi: number): number {
  const big = Math.max(Math.abs(lo), Math.abs(hi));
  return big === 0 ? FINEST : Math.max(10 ** (Math.floor(Math.log10(big)) - 11), FINEST);
}

/** The next step of the 1, 2, 5 sequence above `step`. */
export const coarserStep = (step: number): number => niceStep(clean(step * 1.5));

/** The multiples of `step` from `lo` to `hi`, both included when they are one. */
export function linearTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(clean(lo / step));
  const last = Math.floor(clean(hi / step));
  for (let k = first; k <= last; k++) {
    // 0 rather than -0, which Intl writes as "-0".
    ticks.push(clean(k * step) + 0);
  }
  return ticks;
}

interface LinearAxis {
  readonly domain: readonly [number, number];
  readonly step: number;
}

interface LinearAxisOptions {
  /** Extend the domain to the step's multiples around it. */
  readonly nice: boolean;
  /** Every value is an integer, so the step is at least 1. */
  readonly integer: boolean;
}

/**
 * The axis for values from `lo` to `hi` (lo < hi) along `px` pixels: the
 * smallest step, at least the values' `resolution`, whose ticks stand at least
 * `spacing` px apart on the domain it gives, or the first step as wide as that
 * domain when none does. A niced domain always holds `lo` and `hi`.
 */
export function linearAxis(
  lo: number,
  hi: number,
  px: number,
  spacing: number,
  { nice, integer }: LinearAxisOptions,
): LinearAxis {
  let step = niceStep(Math.max(((hi - lo) * spacing) / Math.max(px, 1), resolution(lo, hi)));
  if (integer && step < 1) {
    step = 1;
  }
  for (;;) {
    // Cleaning can cut an end inside the data (hi / step of 1e15 + 1 cleans to
    // 1e11), so each end reaches the value it rounds.
    const domain: readonly [number, number] = nice
      ? [
          Math.min(clean(Math.floor(clean(lo / step)) * step), lo) + 0,
          Math.max(clean(Math.ceil(clean(hi / step)) * step), hi),
        ]
      : [lo, hi];
    const span = domain[1] - domain[0];
    if ((step * px) / span >= spacing || step >= span) {
      return { domain, step };
    }
    step = coarserStep(step);
  }
}
