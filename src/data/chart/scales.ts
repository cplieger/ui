/**
 * scales.ts — which scale each axis of a chart takes and the domain it
 * spans: the type, the extent, zero, and a log x's underflow bin.
 * @module
 */

import type { Format } from "../scale/format.js";

import { resolution } from "../scale/linear.js";
import { localDay, midnight } from "../scale/time.js";

import type {
  BarMark,
  BoxMark,
  CalendarMark,
  CellMark,
  ChartSpec,
  PointMark,
  RectMark,
  ScatterMark,
} from "./spec.js";

type Scale = NonNullable<ChartSpec["x"]>;

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
  /** Its ticks write their distance from 0, as on a diverging bar chart,
   *  whose left bars hold values of 0 or more. */
  readonly absolute: boolean;
  readonly under: Underflow | undefined;
  /** Where the drawing starts: `lo`, or an underflow bin's `from` below it. */
  readonly drawnLo: number;
}

export interface Band {
  readonly type: "band";
  readonly rows: readonly string[];
  readonly mono: boolean;
}

/** The largest magnitude a chart places on a value or colour scale: past
 *  about 1e306 a span times a tick spacing overflows to Infinity, and the
 *  axis's search for a step never ends. */
export const LIMIT = 1e300;

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
    // The spec check holds every value within LIMIT, so only a stack's sum passes it here.
    if (Math.abs(v) > LIMIT && Number.isFinite(v)) {
      throw new RangeError("renderChart: a stack's total must lie within ±1e300");
    }
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

// A linear extent of one value spans 1 each way of it, or 0 to 1 at 0. Past
// 1e12, 1 is finer than the axis tells apart (1e16 + 1 is 1e16), so the
// value's resolution, its twelfth figure, is the bump.
function widen(lo: number, hi: number): readonly [number, number] {
  if (lo < hi) {
    return [lo, hi];
  }
  if (lo === 0) {
    return [0, 1];
  }
  const bump = Math.max(1, resolution(lo, hi));
  return [lo - bump, hi + bump];
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

// A bar row's stack reaches from the sum of its negative values to the sum
// of its positive ones, through 0; a diverging row from its left series'
// sum and half its centre series to the rest; grouped, split and mirrored
// bars each reach their own value.
function addBars(extent: Extent, m: BarMark): void {
  const apart = m.arrange === "group" || m.arrange === "split" || m.arrange === "mirror";
  const left = m.arrange === "diverge" ? (m.left ?? 0) : -1;
  const centre = m.centre === true ? left : -1;
  for (let i = 0; i < m.y.length; i++) {
    let lo = 0;
    let hi = 0;
    for (const [k, s] of m.series.entries()) {
      const v = s.x[i];
      if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
        throw new RangeError("renderChart: a bar's x cannot be infinite");
      }
      if (m.arrange === "share" && finite(v) && v < 0) {
        throw new RangeError("renderChart: a 100% stack's x cannot be negative");
      }
      // Each panel's bars start at its left edge, with no room left of 0.
      if (m.arrange === "split" && finite(v) && v < 0) {
        throw new RangeError("renderChart: a split bar's x cannot be negative");
      }
      // Each side's bars start at the spine, with no room past it.
      if (m.arrange === "mirror" && finite(v) && v < 0) {
        throw new RangeError("renderChart: a mirrored bar's x cannot be negative");
      }
      // A diverging bar's side comes from its place in the order, never its sign.
      if (left !== -1 && finite(v) && v < 0) {
        throw new RangeError("renderChart: a diverging bar's x cannot be negative");
      }
      if (finite(v)) {
        extent.count(v);
        if (apart) {
          extent.add(v);
        } else if (k === centre) {
          lo -= v / 2;
          hi += v / 2;
        } else if (k < left || v < 0) {
          lo -= Math.abs(v);
        } else {
          hi += v;
        }
      }
    }
    extent.add(lo);
    extent.add(hi);
  }
}

// A point's dot is placed by its value, so a log x has no place for 0 or below.
function addPoints(extent: Extent, m: PointMark, log: boolean): void {
  for (const s of m.series) {
    for (const v of Array.from(s.x)) {
      if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
        throw new RangeError("renderChart: a point's x cannot be infinite");
      }
      if (finite(v)) {
        if (log && v <= 0) {
          throw new RangeError("renderChart: a point's x must be above 0 on a log x");
        }
        extent.count(v);
        extent.add(v);
      }
    }
  }
}

// A box's whiskers' ends and its outliers are its row's extremes, which a
// log x has no place for at 0 or below.
function addBoxes(extent: Extent, m: BoxMark, log: boolean): void {
  for (const s of m.series) {
    for (let i = 0; i < s.low.length; i++) {
      const low = s.low[i];
      if (!finite(low)) {
        continue;
      }
      for (const v of [low, s.high[i] ?? low, ...(s.outliers?.[i] ?? [])]) {
        if (log && v <= 0) {
          throw new RangeError("renderChart: a box's values must be above 0 on a log x");
        }
        extent.count(v);
        extent.add(v);
      }
    }
  }
}

// A scatter's dot is placed by its value, so a log axis has no place for 0
// or below; a dot without its other value, or a bubble without its size,
// is not drawn, so it holds no extent.
function addScatter(extent: Extent, m: ScatterMark, axis: "x" | "y", log: boolean): void {
  const other = axis === "x" ? "y" : "x";
  for (const s of m.series) {
    for (let i = 0; i < s[axis].length; i++) {
      const v = s[axis][i];
      if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
        throw new RangeError(`renderChart: a scatter's ${axis} cannot be infinite`);
      }
      if (finite(v)) {
        if (log && v <= 0) {
          throw new RangeError(`renderChart: a scatter's ${axis} must be above 0 on a log ${axis}`);
        }
        if (finite(s[other][i]) && (s.r === undefined || finite(s.r[i]))) {
          extent.count(v);
          extent.add(v);
        }
      }
    }
  }
}

/** A bubble chart's size: a dot's area runs from none at 0 to the largest
 *  dot's at `hi`. */
export interface Size {
  readonly hi: number;
  readonly format: Format | undefined;
}

/** The r scale of `spec`, undefined unless its scatter's series carry `r`:
 *  [0, the largest r of a dot with both positions], or the passed domain.
 *  Throws for an r scale beside no r, a domain whose low end is not 0, and
 *  an r infinite, below 0 or past a passed domain, which no area shows. */
export function rScale(spec: ChartSpec): Size | undefined {
  const scatter = spec.marks.find((m): m is ScatterMark => m.mark === "scatter");
  const series = scatter?.series.filter((s) => s.r !== undefined) ?? [];
  if (series.length === 0) {
    if (spec.r !== undefined) {
      throw new TypeError("renderChart: an r scale sizes a scatter's dots, and none carries r");
    }
    return undefined;
  }
  const passed = passedDomain(spec.r?.domain, "r", false);
  if (passed !== undefined && passed[0] !== 0) {
    throw new RangeError("renderChart: r.domain must start at 0, where a dot has no area");
  }
  let hi = 0;
  for (const s of series) {
    for (let i = 0; i < (s.r?.length ?? 0); i++) {
      const v = s.r?.[i];
      if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
        throw new RangeError("renderChart: a scatter's r cannot be infinite");
      }
      if (!finite(v)) {
        continue;
      }
      if (v < 0) {
        throw new RangeError("renderChart: a scatter's r cannot be below 0, which has no area");
      }
      if (passed !== undefined && v > passed[1]) {
        throw new RangeError("renderChart: a scatter's r must lie inside r.domain");
      }
      if (finite(s.x[i]) && finite(s.y[i])) {
        hi = Math.max(hi, v);
      }
    }
  }
  return { hi: passed?.[1] ?? (hi > 0 ? hi : 1), format: spec.r?.format };
}

// A slope's two columns, named by its mark, at 0 and 1.
const COLUMNS: Continuous = {
  type: "linear",
  lo: 0,
  hi: 1,
  passed: true,
  integer: true,
  format: undefined,
  reverse: false,
  absolute: false,
  under: undefined,
  drawnLo: 0,
};

// A cell chart's binned axis spans its edges as a passed domain does: never
// niced, and a rule past them is off the axis.
function binned(edges: readonly number[], s: Scale, axis: "x" | "y"): Continuous {
  const type = s.type ?? "linear";
  if (type === "band" || (axis === "y" && type === "time")) {
    throw new TypeError(
      `renderChart: a cell mark's binned ${axis} is ${axis === "x" ? "linear, log or time" : "linear or log"}`,
    );
  }
  if (s.domain !== undefined) {
    throw new TypeError(`renderChart: a binned ${axis} takes no domain; its edges are its domain`);
  }
  if (s.zero !== undefined) {
    throw new TypeError(`renderChart: a binned ${axis} spans its edges, so it has no zero to hold`);
  }
  const lo = edges[0] ?? 0;
  if (type === "log" && lo <= 0) {
    throw new RangeError(`renderChart: a log ${axis}'s edges must be above 0`);
  }
  return {
    type,
    lo,
    hi: edges[edges.length - 1] ?? 1,
    passed: true,
    integer: edges.every((e) => Number.isInteger(e)),
    format: s.format,
    reverse: axis === "x" && s.reverse === true,
    absolute: false,
    under: undefined,
    drawnLo: lo,
  };
}

// A cell chart's categories on x, column i spanning i to i + 1, as a
// slope's columns sit at 0 and 1: every place on it is a column's index.
function cellColumns(spec: ChartSpec, m: CellMark): Continuous {
  const x = spec.x ?? {};
  if ("edges" in m.x) {
    return binned(m.x.edges, x, "x");
  }
  if ((x.type ?? "band") !== "band") {
    throw new TypeError(
      "renderChart: a cell mark's x names its columns, so it is a band; bins give their edges",
    );
  }
  if (x.domain !== undefined) {
    throw new TypeError("renderChart: a band scale takes no domain; its columns are its domain");
  }
  if (x.zero !== undefined) {
    throw new TypeError("renderChart: a band x has no zero to hold");
  }
  if (spec.marks.some((r) => r.mark === "rule" && r.x !== undefined)) {
    throw new TypeError("renderChart: a rule on a band x has no value to sit at");
  }
  return { ...COLUMNS, hi: m.x.length, reverse: x.reverse === true };
}

const calendarOf = (spec: ChartSpec): CalendarMark | undefined =>
  spec.marks.find((m): m is CalendarMark => m.mark === "cell" && "days" in m);

// A calendar's x runs from its first day's midnight to the midnight after
// its last on the chart's wall clock, so a note's instant finds its day.
function calendarDays(spec: ChartSpec, m: CalendarMark, timeZone: string | undefined): Continuous {
  if (spec.x !== undefined) {
    throw new TypeError("renderChart: a calendar takes no x scale; its days are its x");
  }
  if (spec.marks.some((r) => r.mark === "rule")) {
    throw new TypeError("renderChart: a rule on a calendar has no value scale to sit on");
  }
  const day = localDay(m.days.start, timeZone);
  const lo = midnight(day, timeZone);
  return {
    ...COLUMNS,
    type: "time",
    lo,
    hi: midnight(day + m.days.values.length, timeZone),
    integer: false,
    drawnLo: lo,
  };
}

/** The x scale of `spec`: linear unless it says another continuous type,
 *  under a bar mark linear from 0, under a point or box mark or a scatter
 *  holding 0 only with `zero: true`, under a slope its two columns at 0 and 1, and
 *  under a cell mark its columns from 0 to their count or its bins' edges,
 *  and under a calendar its days in `timeZone`. Throws for a band x and for
 *  a type, domain, zero or underflow bin that breaks a rule, for an x scale
 *  or an x rule beside a slope, and for an x scale or a rule beside a
 *  calendar. */
export function xScale(spec: ChartSpec, timeZone?: string): Continuous {
  const calendar = calendarOf(spec);
  if (calendar !== undefined) {
    return calendarDays(spec, calendar, timeZone);
  }
  if (spec.marks.some((m) => m.mark === "slope")) {
    if (spec.x !== undefined) {
      throw new TypeError("renderChart: a slope takes no x scale; its mark names its two columns");
    }
    if (spec.marks.some((m) => m.mark === "rule" && m.x !== undefined)) {
      throw new TypeError("renderChart: a rule on a slope's x has no value to sit at");
    }
    return COLUMNS;
  }
  const cell = spec.marks.find((m): m is CellMark => m.mark === "cell" && !("days" in m));
  if (cell !== undefined) {
    return cellColumns(spec, cell);
  }
  const x = spec.x ?? {};
  const type = x.type ?? "linear";
  if (type === "band") {
    throw new TypeError("renderChart: x cannot be a band scale; rows lie along y");
  }
  const bars = spec.marks.some((m) => m.mark === "bar");
  const share = spec.marks.some((m) => m.mark === "bar" && m.arrange === "share");
  if (share && x.domain !== undefined) {
    throw new TypeError("renderChart: a 100% stack's x runs 0 to 1, so it takes no domain");
  }
  if (bars && type !== "linear") {
    throw new TypeError("renderChart: a bar's x is linear, so its length is its value");
  }
  if (bars && x.zero === false) {
    throw new TypeError("renderChart: a bar's x always starts at zero");
  }
  const scatter = spec.marks.some((m) => m.mark === "scatter");
  if (scatter && type === "time") {
    throw new TypeError("renderChart: a scatter's x is linear or log; a value over time is a line");
  }
  const boxes = spec.marks.some((m) => m.mark === "box");
  if (boxes && type === "time") {
    throw new TypeError("renderChart: a box's x is linear or log");
  }
  // None holds 0 unless asked, since a place, not a length from 0, is the
  // value: a dot's, or a box's spread.
  const placed = scatter || boxes || spec.marks.some((m) => m.mark === "point");
  if (placed && x.zero !== undefined && type !== "linear") {
    throw new TypeError(`renderChart: a ${type} x has no zero to hold`);
  }
  const log = type === "log";
  const extent = new Extent(log);
  if (bars || (placed && x.zero === true)) {
    extent.add(0);
  }
  for (const m of spec.marks) {
    if (m.mark === "rect") {
      extent.addAll(m.x1);
      extent.addAll(m.x2);
    } else if (m.mark === "line" || m.mark === "area") {
      extent.addAll(m.x);
    } else if (m.mark === "dot") {
      for (const row of m.rows) {
        extent.addAll(row.x);
      }
    } else if (m.mark === "bar") {
      addBars(extent, m);
    } else if (m.mark === "point") {
      addPoints(extent, m, log);
    } else if (m.mark === "scatter") {
      addScatter(extent, m, "x", log);
    } else if (m.mark === "box") {
      addBoxes(extent, m, log);
    }
  }
  const integer = extent.integer;
  // A split's panels and a mirror's or diverging chart's sides start at 0,
  // so a rule there reads as a distance from it, drawn on both sides of a
  // diverging axis.
  const from0 = spec.marks
    .map((m) => (m.mark === "bar" ? m.arrange : undefined))
    .find((a) => a === "split" || a === "mirror" || a === "diverge");
  // On a log scale a rule never moves the extent, so a sub-second median
  // opens no empty strip left of the underflow bin.
  if (!log) {
    for (const m of spec.marks) {
      if (m.mark === "rule" && finite(m.x)) {
        if (from0 !== undefined && m.x < 0) {
          throw new RangeError(`renderChart: a rule under arrange "${from0}" cannot be below 0`);
        }
        extent.add(m.x);
        if (from0 === "diverge") {
          extent.add(-m.x);
        }
      }
    }
  }
  if (share) {
    // Every row drawn reaches 1, so the axis is fixed as a passed domain is:
    // a rule outside it is off the axis.
    return {
      type,
      lo: 0,
      hi: 1,
      passed: true,
      integer: false,
      format: x.format ?? "percent",
      reverse: x.reverse === true,
      absolute: false,
      under: undefined,
      drawnLo: 0,
    };
  }
  const passed = passedDomain(x.domain, "x", log);
  if (bars && passed !== undefined && (passed[0] > 0 || passed[1] < 0)) {
    throw new RangeError("renderChart: a bar's x domain must hold 0");
  }
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
    format: x.format,
    reverse: x.reverse === true,
    absolute: spec.marks.some((m) => m.mark === "bar" && m.arrange === "diverge"),
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

// `filled` names a mark whose length or height from 0 is its value, which
// has no place for a value below 0.
function yValue(v: number | null | undefined, filled?: "rect" | "area"): number | null {
  if (v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY) {
    throw new RangeError("renderChart: a y value cannot be infinite");
  }
  if (!finite(v)) {
    return null;
  }
  if (filled !== undefined && v < 0) {
    throw new RangeError(
      `renderChart: ${filled === "rect" ? "a rect" : "an area"}'s y cannot be negative`,
    );
  }
  return v;
}

function yExtent(spec: ChartSpec, log: boolean): Extent {
  const extent = new Extent(log);
  for (const m of spec.marks) {
    if (m.mark === "rect") {
      // Segments are never negative, so a stack's total is its highest value;
      // a group's sub-columns stand on the baseline, each its own height.
      const group = m.arrange === "group";
      for (let i = 0; i < m.x1.length; i++) {
        let total = 0;
        for (const s of m.series) {
          const v = yValue(s.y[i], "rect");
          if (v !== null) {
            extent.count(v);
            total += v;
            if (group) {
              extent.add(v);
            }
          }
        }
        if (!group) {
          extent.add(total);
        }
      }
    } else if (m.mark === "area") {
      // A layer stands on those before it, so the stack's top is its total;
      // a sample where any series is a gap draws no stack.
      for (let i = 0; i < m.x.length; i++) {
        let total = 0;
        let gap = false;
        for (const s of m.series) {
          const v = yValue(s.y[i], "area");
          if (v === null) {
            gap = true;
          } else {
            extent.count(v);
            total += v;
          }
        }
        if (!gap) {
          extent.add(total);
        }
      }
    } else if (m.mark === "scatter") {
      addScatter(extent, m, "y", log);
    } else if (m.mark === "line" || m.mark === "slope") {
      for (const s of m.series) {
        for (const value of Array.from(s.y)) {
          const v = yValue(value);
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

/** The y scale of `spec`: a band of the dot rows or the bar, point, box or
 *  cell categories, a cell mark's bins' edges, a calendar's seven weekday rows
 *  from 0 to 7, else linear unless it says log, which a slope cannot; a
 *  linear y holds 0 unless `zero: false`, under a scatter only with
 *  `zero: true`. Throws for a y type its mark cannot take and for a
 *  domain or zero a rect, an area or bins cannot take. */
export function yScale(spec: ChartSpec): Continuous | Band {
  if (calendarOf(spec) !== undefined) {
    if (spec.y !== undefined) {
      throw new TypeError("renderChart: a calendar takes no y scale; its rows are weekdays");
    }
    return { ...COLUMNS, hi: 7 };
  }
  const y = spec.y ?? {};
  const cell = spec.marks.find((m): m is CellMark => m.mark === "cell" && !("days" in m));
  if (cell !== undefined && "edges" in cell.y) {
    return binned(cell.y.edges, y, "y");
  }
  const kinds = new Set(spec.marks.map((m) => m.mark));
  const banded = (["dot", "bar", "point", "box", "cell"] as const).find((k) => kinds.has(k));
  if (banded !== undefined) {
    if ((y.type ?? "band") !== "band") {
      throw new TypeError(
        `renderChart: a ${banded} mark's y is a band of its rows${banded === "cell" ? "; bins give their edges" : ""}`,
      );
    }
    if (spec.marks.some((m) => m.mark === "rule" && m.y !== undefined)) {
      throw new TypeError("renderChart: a rule on a band y has no value to sit at");
    }
    if (y.domain !== undefined) {
      throw new TypeError("renderChart: a band scale takes no domain; its rows are its domain");
    }
    const rows = spec.marks.flatMap((m) =>
      m.mark === "dot"
        ? m.rows.map((r) => r.name)
        : m.mark === "bar" || m.mark === "point" || m.mark === "box"
          ? [...m.y]
          : m.mark === "cell" && "y" in m && !("edges" in m.y)
            ? [...m.y]
            : [],
    );
    return { type: "band", rows, mono: y.mono === true };
  }
  const type = y.type ?? "linear";
  if (type === "band" || type === "time") {
    throw new TypeError(
      `renderChart: y cannot be a ${type} scale without dot, bar, point or box rows`,
    );
  }
  if (kinds.has("slope") && type !== "linear") {
    throw new TypeError("renderChart: a slope's y is linear");
  }
  const rects = kinds.has("rect");
  const filled = rects ? "a rect's" : kinds.has("area") ? "an area's" : undefined;
  if (filled !== undefined && type !== "linear") {
    throw new TypeError(
      `renderChart: ${filled} y is linear, so ${rects ? "a bar's length" : "its height"} is its value`,
    );
  }
  if (filled !== undefined && y.zero === false) {
    throw new TypeError(`renderChart: ${filled} y always starts at zero`);
  }
  const log = type === "log";
  const scatter = kinds.has("scatter");
  if (scatter && log && y.zero !== undefined) {
    throw new TypeError("renderChart: a log y has no zero to hold");
  }
  const share = spec.marks.some(
    (m) => (m.mark === "rect" || m.mark === "area") && m.arrange === "share",
  );
  if (share && y.domain !== undefined) {
    throw new TypeError("renderChart: a 100% stack's y runs 0 to 1, so it takes no domain");
  }
  const passed = passedDomain(y.domain, "y", log);
  if (filled !== undefined && passed !== undefined && (passed[0] > 0 || passed[1] < 0)) {
    throw new RangeError(`renderChart: ${filled} y domain must hold 0`);
  }
  const extent = yExtent(spec, log);
  if (share) {
    // Every stack drawn reaches 1, so the axis is fixed as a passed domain
    // is: a rule outside it is off the axis.
    return {
      type,
      lo: 0,
      hi: 1,
      passed: true,
      integer: false,
      format: y.format ?? "percent",
      reverse: false,
      absolute: false,
      under: undefined,
      drawnLo: 0,
    };
  }
  const integer = extent.integer;
  if (!log) {
    for (const m of spec.marks) {
      if (m.mark === "rule" && finite(m.y)) {
        extent.add(m.y);
      }
    }
    if (scatter ? y.zero === true : y.zero !== false) {
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
    absolute: false,
    under: undefined,
    drawnLo: lo,
  };
}
