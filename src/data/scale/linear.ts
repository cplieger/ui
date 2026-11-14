/**
 * linear.ts — the steps, niced domains and ticks of a linear axis, and the
 * exact decimals a step's multiples are.
 * @module
 */

/** A step of `lead` × 10^`exp`, `lead` a positive integer. */
export interface Step {
  readonly lead: number;
  readonly exp: number;
  /** The nearest double to the step. */
  readonly value: number;
}

// 1e0 to 1e22, the powers of ten a double holds exactly.
const POWERS = Array.from({ length: 23 }, (_, k) => Number(`1e${k}`));

/** The nearest double to `n` × 10^`exp`, `n` an integer, never -0. Within ±1e22
 *  one exact multiplication or division rounds once; past it the decimal is parsed. */
export function decimal(n: number, exp: number): number {
  const power = POWERS[Math.abs(exp)];
  const v =
    power === undefined || !Number.isSafeInteger(n)
      ? Number(`${n}e${exp}`)
      : exp < 0
        ? n / power
        : n * power;
  return v + 0;
}

export const step = (lead: number, exp: number): Step => ({
  lead,
  exp,
  value: decimal(lead, exp),
});

/** The value `k` steps from 0. */
export const multiple = (k: number, s: Step): number => decimal(k * s.lead, s.exp);

// The least `k` whose multiple is at or above `v`.
function ceilCount(v: number, s: Step): number {
  // The quotient is a rounded division, at most one count off the exact one.
  let k = Math.ceil(v / s.value);
  while (multiple(k - 1, s) >= v) {
    k--;
  }
  while (multiple(k, s) < v) {
    k++;
  }
  return k;
}

/** The greatest `k` whose multiple is at or below `v`. */
export const floorCount = (v: number, s: Step): number => -ceilCount(-v, s);

/** How far a data end may pass a multiple of `s` and still be read as on it:
 *  a chart's own sum such as 0.4 + 0.8 is the double above 1.2. A billionth of
 *  the step or of the data's `span`, whichever is less, so both ends of a span
 *  never fall on one multiple. */
export const drift = (s: Step, span: number): number => Math.min(s.value, span) * 1e-9;

const LEADS = [1, 2, 5];

/** The smallest of 1, 2 and 5 times a power of ten at or above `min` (> 0). */
export function niceStep(min: number): Step {
  let exp = Math.floor(Math.log10(min));
  // log10 of a value near a power of ten may round across it.
  if (decimal(1, exp) > min) {
    exp--;
  }
  for (;;) {
    for (const lead of LEADS) {
      const s = step(lead, exp);
      if (s.value >= min) {
        return s;
      }
    }
    exp++;
  }
}

/** The next step of the 1, 2, 5 sequence above `s`. */
export const coarserStep = (s: Step): Step =>
  s.lead === 5 ? step(1, s.exp + 1) : step(s.lead === 1 ? 2 : 5, s.exp);

const finerStep = (s: Step): Step =>
  s.lead === 1 ? step(5, s.exp - 1) : step(s.lead === 5 ? 2 : 1, s.exp);

const FINEST = 1e-300;

/**
 * The finest step or class width a chart takes at the magnitude of `lo` and `hi`:
 * their twelfth figure, never below 1e-300 (10^-324 is 0). Four figures above a
 * double's precision, so every count of steps is a safe integer and every
 * multiple a different double from the next.
 */
export function resolution(lo: number, hi: number): number {
  const big = Math.max(Math.abs(lo), Math.abs(hi));
  return big === 0 ? FINEST : Math.max(decimal(1, Math.floor(Math.log10(big)) - 11), FINEST);
}

/** The multiples of `s` from `lo` to `hi`, both included when they are one. */
export function linearTicks(lo: number, hi: number, s: Step): number[] {
  const ticks: number[] = [];
  for (let k = ceilCount(lo, s); k <= floorCount(hi, s); k++) {
    ticks.push(multiple(k, s));
  }
  return ticks;
}

interface LinearAxis {
  readonly domain: readonly [number, number];
  readonly step: Step;
}

interface LinearAxisOptions {
  /** Extend the domain to the step's multiples around it. */
  readonly nice: boolean;
  /** Every value is an integer, so the step is at least 1 over a domain at least 1 wide. */
  readonly integer: boolean;
}

/**
 * The axis for values from `lo` to `hi` (lo < hi) along `px` pixels: the
 * smallest step, at least the values' `resolution`, whose ticks stand at least
 * `spacing` px apart on the domain it gives, or the first step as wide as `lo`
 * to `hi` when none does. A niced domain's ends are multiples of the step, and
 * hold `lo` and `hi` unless one passes its multiple by no more than `drift`.
 */
export function linearAxis(
  lo: number,
  hi: number,
  px: number,
  spacing: number,
  { nice, integer }: LinearAxisOptions,
): LinearAxis {
  const floor = resolution(lo, hi);
  const room = Math.max(px, 1) / spacing;
  let s = niceStep(Math.max(((hi - lo) * spacing) / Math.max(px, 1), floor));
  // The quotient may pass the step it names (0.6 / 6 is 0.10000000000000002).
  if (finerStep(s).value >= floor) {
    s = finerStep(s);
  }
  // A passed domain under 1 wide holds at most one whole step.
  if (integer && s.value < 1 && hi - lo >= 1) {
    s = step(1, 0);
  }
  for (;;) {
    if (nice) {
      const tolerance = drift(s, hi - lo);
      const bottom = floorCount(lo + tolerance, s);
      const top = ceilCount(hi - tolerance, s);
      // Data across a multiple spans two steps however wide they are.
      if (top - bottom <= room || s.value >= hi - lo) {
        return { domain: [multiple(bottom, s), multiple(top, s)], step: s };
      }
    } else if ((hi - lo) / s.value <= room || s.value >= hi - lo) {
      return { domain: [lo, hi], step: s };
    }
    s = coarserStep(s);
  }
}
