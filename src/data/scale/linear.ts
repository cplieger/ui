/**
 * linear.ts — the steps, niced domains and ticks of a linear axis.
 * @module
 */

// Twelve significant digits clear the binary noise of k * 0.1 and keep every
// value a chart can tell apart.
const clean = (v: number): number => Number(v.toPrecision(12));

/** The smallest of 1, 2 and 5 times a power of ten at or above `min` (> 0). */
export function niceStep(min: number): number {
  // `min` is a quotient that drifts (0.6 / 6 is 0.10000000000000002), so it is
  // cleaned as the steps are, or an exact span would skip its step.
  const least = clean(min);
  const power = 10 ** Math.floor(Math.log10(least));
  for (const m of [1, 2, 5]) {
    if (clean(m * power) >= least) {
      return clean(m * power);
    }
  }
  return clean(10 * power);
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
 * smallest step whose ticks stand at least `spacing` px apart on the domain
 * it gives, or the first step as wide as that domain when none does.
 */
export function linearAxis(
  lo: number,
  hi: number,
  px: number,
  spacing: number,
  { nice, integer }: LinearAxisOptions,
): LinearAxis {
  let step = niceStep(((hi - lo) * spacing) / Math.max(px, 1));
  if (integer && step < 1) {
    step = 1;
  }
  for (;;) {
    const domain: readonly [number, number] = nice
      ? [clean(Math.floor(clean(lo / step)) * step) + 0, clean(Math.ceil(clean(hi / step)) * step)]
      : [lo, hi];
    const span = domain[1] - domain[0];
    if ((step * px) / span >= spacing || step >= span) {
      return { domain, step };
    }
    step = coarserStep(step);
  }
}
