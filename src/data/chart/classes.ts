/**
 * classes.ts — a cell chart's colour classes: their boundaries, which class
 * a value takes, and the scale step each class fills with.
 * @module
 */

export interface Classes {
  readonly type: "sequential" | "diverging";
  /** The n − 1 strictly increasing boundaries of n classes. */
  readonly thresholds: readonly number[];
  /** Each class's step of its scale, 1 to 9, in class order. */
  readonly steps: readonly number[];
}

/** What the classes are built from: the chart's `colour`, checked. */
export interface ClassSpec {
  readonly type?: "sequential" | "diverging";
  readonly steps?: number;
  readonly domain?: readonly [number, number];
  readonly thresholds?: readonly number[];
  readonly pivot?: number;
  readonly reverse?: boolean;
}

const DEFAULT_STEPS = 5;

/** A class width's leading figures; the width is one of them times a power of ten. */
const NICE = [1, 2, 2.5, 5];

// Sums of a class width drift in binary (0.1 × 3); twelve figures hold every
// boundary a reader could tell apart.
const tidy = (v: number): number => Number(v.toPrecision(12));

// The class widths from the smallest at least `min` upward; integer data
// takes whole widths only, so a sequential boundary, or an even diverging
// count's about a whole pivot, never falls between two counts.
function* widths(min: number, integer: boolean): Generator<number, never> {
  for (let k = Math.floor(Math.log10(min)) - 1; ; k++) {
    for (const lead of NICE) {
      const w = tidy(lead * 10 ** k);
      if (w >= min && (!integer || Number.isInteger(w))) {
        yield w;
      }
    }
  }
}

/** The step of a nine-step scale each of `n` classes takes: spread evenly
 *  over a sequential scale, both ends included; on a diverging one the
 *  middle step 5 for an odd count's middle class and each arm's steps at
 *  distances round(4k / m) from it for the m classes a side, the accent's
 *  arm (6 to 9) above the pivot unless `reverse`. */
export function classSteps(type: "sequential" | "diverging", n: number, reverse = false): number[] {
  if (type === "sequential") {
    return Array.from({ length: n }, (_, i) => 1 + Math.round((8 * i) / (n - 1)));
  }
  const m = Math.floor(n / 2);
  const arm = Array.from({ length: m }, (_, k) => Math.round((4 * (k + 1)) / m));
  const steps = [
    ...arm.map((d) => 5 - d).reverse(),
    ...(n % 2 === 1 ? [5] : []),
    ...arm.map((d) => 5 + d),
  ];
  return reverse ? steps.map((s) => 10 - s) : steps;
}

/**
 * The classes of `spec` over `values`, the finite values a chart fills: `thresholds` as
 * sent, a passed `domain` divided into equal classes exactly, or an inferred one (from 0
 * when no value is below it) at the smallest rounded width (1, 2, 2.5 or 5 times a power
 * of ten) whose classes, from a multiple of it, reach the greatest value. A diverging
 * scale's classes are symmetric about `pivot`, which an odd count centres in its middle
 * class and an even count makes a boundary.
 */
export function classes(spec: ClassSpec, values: readonly number[]): Classes {
  const type = spec.type ?? "sequential";
  if (spec.thresholds !== undefined) {
    const n = spec.thresholds.length + 1;
    return { type, thresholds: [...spec.thresholds], steps: classSteps(type, n, spec.reverse) };
  }
  const n = spec.steps ?? DEFAULT_STEPS;
  const steps = classSteps(type, n, spec.reverse);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let integer = true;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    integer &&= Number.isInteger(v);
  }
  const passed = spec.domain;
  if (passed !== undefined) {
    [lo, hi] = passed;
    integer = false;
  } else if (lo > hi) {
    [lo, hi] = [0, 1];
  }
  if (type === "diverging") {
    const pivot = spec.pivot ?? 0;
    const half = Math.max(hi - pivot, pivot - lo) || 1;
    const m = Math.floor(n / 2);
    const odd = n % 2 === 1;
    const min = odd ? (2 * half) / n : half / m;
    const w = passed === undefined ? widths(min, integer).next().value : min;
    const first = odd ? pivot - (m - 0.5) * w : pivot - (m - 1) * w;
    return {
      type,
      thresholds: Array.from({ length: n - 1 }, (_, j) => tidy(first + j * w)),
      steps,
    };
  }
  if (passed === undefined && lo >= 0) {
    lo = 0;
  }
  if (lo === hi) {
    [lo, hi] = lo === 0 ? [0, 1] : [lo - 1, hi + 1];
  }
  let start = lo;
  let w = (hi - lo) / n;
  if (passed === undefined) {
    for (const width of widths(w, integer)) {
      start = tidy(Math.floor(lo / width) * width);
      w = width;
      if (tidy(start + n * width) >= hi) {
        break;
      }
    }
  }
  return {
    type,
    thresholds: Array.from({ length: n - 1 }, (_, j) => tidy(start + (j + 1) * w)),
    steps,
  };
}

/** The class `v` takes: the count of boundaries at or below it, so a value
 *  on a boundary takes the class above, and one past either end the end class. */
export function classOf(c: Classes, v: number): number {
  let k = 0;
  while (k < c.thresholds.length && (c.thresholds[k] ?? 0) <= v) {
    k++;
  }
  return k;
}
