/**
 * classes.ts — a cell chart's colour classes: their boundaries, which class
 * a value takes, and the scale step each class fills with.
 * @module
 */

import { drift, floorCount, multiple, resolution, step, type Step } from "../scale/linear.js";

export interface Classes {
  readonly type: "sequential" | "diverging";
  /** The n − 1 strictly increasing boundaries of n classes. */
  readonly thresholds: readonly number[];
  /** Each class's step of its scale, 1 to 9, in class order. */
  readonly steps: readonly number[];
  /** The least and most fraction digits a key writes inferred boundaries and the
   *  pivot with: the fewest that write them exactly, at least their spacing's (a
   *  class, or half a class on an odd diverging count) where they need that many,
   *  and at most three past it; undefined for passed thresholds or a passed domain. */
  readonly digits: readonly [number, number] | undefined;
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

/** A class width's leads in order, as an integer lead and its shift of the
 *  exponent: 1, 2, 2.5 and 5 times a power of ten. */
const LEADS = [
  [1, 0],
  [2, 0],
  [25, -1],
  [5, 0],
] as const;

// The smallest class width that `fits`, from a power of ten below `from` (above 0)
// upward and none finer than `floor`; integer data takes whole widths only, so a
// sequential boundary, or an even diverging count's about a whole pivot, never
// falls between two counts.
function width(from: number, floor: number, integer: boolean, fits: (w: Step) => boolean): Step {
  for (let exp = Math.floor(Math.log10(from)) - 1; ; exp++) {
    for (const [lead, shift] of LEADS) {
      const w = step(lead, exp + shift);
      if (w.value >= floor && (!integer || w.exp >= 0) && fits(w)) {
        return w;
      }
    }
  }
}

/** A finite double as the decimal `String` writes for it: `n` × 10^`exp`. */
interface Decimal {
  readonly n: bigint;
  readonly exp: number;
}

function decimalOf(v: number): Decimal {
  const [, sign = "", whole = "0", fraction = "", exp = "0"] =
    /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(v)) ?? [];
  return { n: BigInt(`${sign}${whole}${fraction}`), exp: Number(exp) - fraction.length };
}

// `d`'s count at exponent `exp`, at or below its own.
const at = (d: Decimal, exp: number): bigint => d.n * 10n ** BigInt(d.exp - exp);

// The nearest double to n / d × 10^exp, d from 1 to 9: the quotient to twenty
// figures past its point, then read as a decimal, which rounds once.
const ratio = (n: bigint, d: bigint, exp: number): number =>
  Number(`${(n * 10n ** 20n) / d}e${exp - 20}`) + 0;

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

const places = (exp: number): number => Math.max(0, -exp);

// A key's least and most fraction digits for boundaries `ns` × 10^`exp` spaced by
// `unit`: the fewest that write them all, capped at the unit's to start with and
// three past it at most, so a pivot computed as a mean is not written to its
// seventeenth figure.
function keyDigits(ns: readonly bigint[], exp: number, unit: Step): [number, number] {
  let fewest = places(exp);
  for (let p = 10n; fewest > 0 && ns.every((v) => v % p === 0n); p *= 10n) {
    fewest--;
  }
  const own = places(unit.exp);
  return [Math.min(fewest, own), Math.min(fewest, own + 3)];
}

/**
 * The classes of `spec` over `values`, the finite values a chart fills: `thresholds` as
 * sent; a passed `domain` in equal classes, each boundary the nearest double to the exact
 * division; else the smallest width of 1, 2, 2.5 or 5 times a power of ten, never finer
 * than the values' (and pivot's) `resolution`, whose classes reach the data, from 0 when
 * no value is below it. A diverging scale is symmetric about `pivot`, a boundary as sent
 * when the count is even. A passed `domain` too narrow to divide is a `RangeError`.
 */
export function classes(spec: ClassSpec, values: readonly number[]): Classes {
  const type = spec.type ?? "sequential";
  if (spec.thresholds !== undefined) {
    const n = spec.thresholds.length + 1;
    return {
      type,
      thresholds: [...spec.thresholds],
      steps: classSteps(type, n, spec.reverse),
      digits: undefined,
    };
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
  } else if (lo > hi) {
    [lo, hi] = [0, 1];
  }
  const count = (k: number) => Array.from({ length: n - 1 }, (_, j) => k + j);
  if (type === "diverging") {
    const pivot = decimalOf(spec.pivot ?? 0);
    const m = Math.floor(n / 2);
    const odd = n % 2 === 1;
    // Each boundary's count from the pivot: of half-widths, odd, for an odd n; else of widths.
    const offsets = count(0).map((j) => BigInt(odd ? 1 - 2 * m + 2 * j : 1 - m + j));
    if (passed !== undefined) {
      const [a, b] = [decimalOf(passed[0]), decimalOf(passed[1])];
      const exp = Math.min(a.exp, b.exp, pivot.exp);
      const p = at(pivot, exp);
      const above = at(b, exp) - p;
      const below = p - at(a, exp);
      const half = above > below ? above : below;
      const d = BigInt(odd ? n : m);
      return increasing({
        type,
        thresholds: offsets.map((c) => ratio(p * d + c * half, d, exp)),
        steps,
        digits: undefined,
      });
    }
    const centre = spec.pivot ?? 0;
    // A pivot far from the values is the boundaries' magnitude.
    const floor = resolution(Math.max(Math.abs(lo), Math.abs(hi)), centre);
    const half = Math.max(hi - centre, centre - lo) || Math.max(1, floor);
    const reach = odd ? n / 2 : m;
    const w = width(
      Math.max(half / reach, floor),
      floor,
      integer,
      (c) => c.value * reach >= half - drift(c, half),
    );
    // Half of 2 × 10^e is 1 × 10^e: as 10 × 10^(e-1) the key's digit cap would rise by one.
    const halfClass = w.lead === 2 ? step(1, w.exp) : step(5 * w.lead, w.exp - 1);
    const unit = odd ? halfClass : w;
    const exp = Math.min(unit.exp, pivot.exp);
    const p = at(pivot, exp);
    const u = at({ n: BigInt(unit.lead), exp: unit.exp }, exp);
    const ns = offsets.map((c) => p + c * u);
    return {
      type,
      thresholds: ns.map((v) => ratio(v, 1n, exp)),
      steps,
      digits: keyDigits([...ns, p], exp, unit),
    };
  }
  if (passed !== undefined) {
    const [a, b] = [decimalOf(passed[0]), decimalOf(passed[1])];
    const exp = Math.min(a.exp, b.exp);
    const [x, y] = [at(a, exp), at(b, exp)];
    const d = BigInt(n);
    return increasing({
      type,
      thresholds: count(1).map((j) => ratio(x * (d - BigInt(j)) + y * BigInt(j), d, exp)),
      steps,
      digits: undefined,
    });
  }
  if (lo >= 0) {
    lo = 0;
  }
  if (lo === hi) {
    const bump = Math.max(1, resolution(lo, hi));
    [lo, hi] = lo === 0 ? [0, 1] : [lo - bump, hi + bump];
  }
  const floor = resolution(lo, hi);
  const start = (c: Step) => floorCount(lo + drift(c, hi - lo), c);
  const w = width(
    Math.max((hi - lo) / n, floor),
    floor,
    integer,
    (c) => multiple(start(c) + n, c) >= hi - drift(c, hi - lo),
  );
  const ks = count(start(w) + 1);
  return {
    type,
    thresholds: ks.map((k) => multiple(k, w)),
    steps,
    digits: keyDigits(
      ks.map((k) => BigInt(k) * BigInt(w.lead)),
      w.exp,
      w,
    ),
  };
}

// Only a passed domain can fail: an inferred width is at least the resolution.
function increasing(c: Classes): Classes {
  if (c.thresholds.some((t, k) => k > 0 && t <= (c.thresholds[k - 1] ?? 0))) {
    throw new RangeError(
      "renderChart: colour.domain is too narrow for its classes' boundaries to strictly increase",
    );
  }
  return c;
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
