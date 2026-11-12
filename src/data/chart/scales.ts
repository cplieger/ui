/**
 * scales.ts — which scale each axis of a chart takes and the domain it
 * spans: the type, the extent, zero, and a log x's underflow bin.
 * @module
 */

import type { Format } from "../scale/format.js";

import type { ChartSpec, RectMark } from "./spec.js";

/** A log x's one rect whose `x1` is 0 or below. */
interface Underflow {
  /** Its mark's index in the spec, and its bucket's index in the mark. */
  readonly mark: number;
  readonly index: number;
  readonly x1: number;
  /** "below": its `x2` is the low end, so it is drawn under it from `from`;
   *  "cut": it crosses the low end; "out": it lies wholly below it. */
  readonly drawn: "below" | "cut" | "out";
  readonly from: number;
}

export interface Continuous {
  readonly type: "linear" | "log" | "time";
  /** The axis domain: passed, or the extent (a linear one before nicing). */
  readonly lo: number;
  readonly hi: number;
  readonly passed: boolean;
  /** Every mark value on the axis is an integer. */
  readonly integer: boolean;
  readonly format: Format | undefined;
  readonly reverse: boolean;
  readonly under: Underflow | undefined;
  /** Where the drawing starts: `lo`, or an underflow bin's `from` below it. */
  readonly drawnLo: number;
}

export interface Band {
  readonly type: "band";
  readonly rows: readonly string[];
  readonly mono: boolean;
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function passedDomain(
  domain: readonly [number, number] | undefined,
  axis: string,
  log: boolean,
): readonly [number, number] | undefined {
  if (domain === undefined) {
    return undefined;
  }
  const [lo, hi] = domain;
  if (!finite(lo) || !finite(hi) || lo >= hi) {
    throw new RangeError(`renderChart: ${axis}.domain must be finite, low below high`);
  }
  if (log && lo <= 0) {
    throw new RangeError(`renderChart: a log ${axis}.domain must be above 0`);
  }
  return domain;
}

// The least and greatest finite values added (above 0 only on a log scale),
// and whether every value counted was an integer.
class Extent {
  lo = Number.POSITIVE_INFINITY;
  hi = Number.NEGATIVE_INFINITY;
  integer = true;
  readonly #log: boolean;

  constructor(log: boolean) {
    this.#log = log;
  }

  get empty(): boolean {
    return this.lo > this.hi;
  }

  count(v: number): void {
    this.integer &&= Number.isInteger(v);
  }

  add(v: number): void {
    if (Number.isFinite(v) && (!this.#log || v > 0)) {
      this.lo = Math.min(this.lo, v);
      this.hi = Math.max(this.hi, v);
    }
  }

  addAll(values: ArrayLike<number>): void {
    for (const v of Array.from(values)) {
      this.count(v);
      this.add(v);
    }
  }
}

// A linear extent of one value spans 1 each way of it, or 0 to 1 at 0.
function widen(lo: number, hi: number): readonly [number, number] {
  if (lo < hi) {
    return [lo, hi];
  }
  if (lo === 0) {
    return [0, 1];
  }
  return [lo - 1, hi + 1];
}

function rectAt(mark: RectMark, i: number): readonly [number, number] {
  return [mark.x1[i] ?? 0, mark.x2[i] ?? 0];
}

function underflow(spec: ChartSpec, lo: number): Underflow | undefined {
  let found: Underflow | undefined;
  spec.marks.forEach((m, mark) => {
    if (m.mark !== "rect") {
      return;
    }
    for (let index = 0; index < m.x1.length; index++) {
      const [x1, x2] = rectAt(m, index);
      if (x1 > 0) {
        continue;
      }
      if (found !== undefined) {
        throw new RangeError(
          "renderChart: a log x holds one rect whose x1 is 0 or below, the underflow bin",
        );
      }
      const [n1, n2] = index + 1 < m.x1.length ? rectAt(m, index + 1) : [1, 2];
      const drawn = x2 === lo ? "below" : x2 > lo ? "cut" : "out";
      found = { mark, index, x1, drawn, from: drawn === "below" ? x2 / (n2 / n1) : lo };
    }
  });
  return found;
}

/** The x scale of `spec`: linear unless it says another continuous type.
 *  Throws for a band x and for a domain or underflow bin that breaks a rule. */
export function xScale(spec: ChartSpec): Continuous {
  const type = spec.x.type ?? "linear";
  if (type === "band") {
    throw new TypeError("renderChart: x cannot be a band scale; dot rows lie along y");
  }
  const log = type === "log";
  const extent = new Extent(log);
  for (const m of spec.marks) {
    if (m.mark === "rect") {
      extent.addAll(m.x1);
      extent.addAll(m.x2);
    } else if (m.mark === "line") {
      extent.addAll(m.x);
    } else if (m.mark === "dot") {
      for (const row of m.rows) {
        extent.addAll(row.x);
      }
    }
  }
  const integer = extent.integer;
  // On a log scale a rule never moves the extent, so a sub-second median
  // opens no empty strip left of the underflow bin.
  if (!log) {
    for (const m of spec.marks) {
      if (m.mark === "rule" && finite(m.x)) {
        extent.add(m.x);
      }
    }
  }
  const passed = passedDomain(spec.x.domain, "x", log);
  let lo: number;
  let hi: number;
  if (passed !== undefined) {
    [lo, hi] = passed;
  } else if (extent.empty) {
    if (log) {
      throw new RangeError("renderChart: a log x needs a domain or a value above 0");
    }
    [lo, hi] = [0, 1];
  } else {
    [lo, hi] = type === "linear" ? widen(extent.lo, extent.hi) : [extent.lo, extent.hi];
  }
  const under = log ? underflow(spec, lo) : undefined;
  return {
    type,
    lo,
    hi,
    passed: passed !== undefined,
    integer,
    format: spec.x.format,
    reverse: spec.x.reverse === true,
    under,
    drawnLo: under?.drawn === "below" ? under.from : lo,
  };
}

/** Where a rule at `value` sits on `scale`: at a domain value, or off the
 *  axis at its nearer end. A rule under a log x's low end, inside an
 *  underflow bin drawn below it, sits at the bin's middle on the log axis. */
export function ruleAt(
  scale: Continuous,
  value: number,
): { readonly at: number } | { readonly off: "low" | "high" } {
  const { under, lo, hi } = scale;
  if (under?.drawn === "below" && value >= under.x1 && value < lo) {
    return { at: Math.sqrt(under.from * lo) };
  }
  if (value >= lo && value <= hi) {
    return { at: value };
  }
  return { off: value < lo ? "low" : "high" };
}

function yValue(v: number | null | undefined, rect: boolean): number | null {
  if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
    throw new RangeError("renderChart: a y value cannot be infinite");
  }
  if (!finite(v)) {
    return null;
  }
  if (rect && v < 0) {
    throw new RangeError("renderChart: a rect's y cannot be negative");
  }
  return v;
}

function yExtent(spec: ChartSpec, log: boolean): Extent {
  const extent = new Extent(log);
  for (const m of spec.marks) {
    if (m.mark === "rect") {
      // Segments are never negative, so a stack's total is its highest value.
      for (let i = 0; i < m.x1.length; i++) {
        let total = 0;
        for (const s of m.series) {
          const v = yValue(s.y[i], true);
          if (v !== null) {
            extent.count(v);
            total += v;
          }
        }
        extent.add(total);
      }
    } else if (m.mark === "line") {
      for (const s of m.series) {
        for (const value of Array.from(s.y)) {
          const v = yValue(value, false);
          if (v !== null) {
            extent.count(v);
            extent.add(v);
          }
        }
      }
    }
  }
  return extent;
}

/** The y scale of `spec`: a band of the dot rows, else linear unless it
 *  says log. Throws for a y type its mark cannot take and for a domain or
 *  zero a rect cannot take. */
export function yScale(spec: ChartSpec): Continuous | Band {
  const y = spec.y ?? {};
  const kinds = new Set(spec.marks.map((m) => m.mark));
  if (kinds.has("dot")) {
    if ((y.type ?? "band") !== "band") {
      throw new TypeError("renderChart: a dot mark's y is a band of its rows");
    }
    if (spec.marks.some((m) => m.mark === "rule" && m.y !== undefined)) {
      throw new TypeError("renderChart: a rule on a band y has no value to sit at");
    }
    if (y.domain !== undefined) {
      throw new TypeError("renderChart: a band scale takes no domain; its rows are its domain");
    }
    const rows = spec.marks.flatMap((m) => (m.mark === "dot" ? m.rows.map((r) => r.name) : []));
    return { type: "band", rows, mono: y.mono === true };
  }
  const type = y.type ?? "linear";
  if (type === "band" || type === "time") {
    throw new TypeError(`renderChart: y cannot be a ${type} scale without dot rows`);
  }
  const rects = kinds.has("rect");
  if (rects && type !== "linear") {
    throw new TypeError("renderChart: a rect's y is linear, so a bar's length is its value");
  }
  if (rects && y.zero === false) {
    throw new TypeError("renderChart: a rect's y always starts at zero");
  }
  const log = type === "log";
  const passed = passedDomain(y.domain, "y", log);
  if (rects && passed !== undefined && (passed[0] > 0 || passed[1] < 0)) {
    throw new RangeError("renderChart: a rect's y domain must hold 0");
  }
  const extent = yExtent(spec, log);
  const integer = extent.integer;
  if (!log) {
    for (const m of spec.marks) {
      if (m.mark === "rule" && finite(m.y)) {
        extent.add(m.y);
      }
    }
    if (y.zero !== false) {
      extent.add(0);
    }
  }
  let lo: number;
  let hi: number;
  if (passed !== undefined) {
    [lo, hi] = passed;
  } else if (extent.empty) {
    if (log) {
      throw new RangeError("renderChart: a log y needs a domain or a value above 0");
    }
    [lo, hi] = [0, 1];
  } else {
    [lo, hi] = log ? [extent.lo, extent.hi] : widen(extent.lo, extent.hi);
  }
  return {
    type,
    lo,
    hi,
    passed: passed !== undefined,
    integer,
    format: y.format,
    reverse: false,
    under: undefined,
    drawnLo: lo,
  };
}
