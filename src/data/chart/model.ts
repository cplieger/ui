/**
 * model.ts — a checked spec and what each of its marks shows inside the
 * x domain, the one source the drawing, the readings and the table read.
 * @module
 */

import { formatter, instantFormat, spanFormat, type Unit } from "../scale/format.js";
import { lowerBound, upperBound } from "../scale/reduce.js";

import { ruleAt, xScale, yScale, type Band, type Continuous } from "./scales.js";
import type { ChartSpec, RectMark } from "./spec.js";

type Kind =
  "stackedColumn" | "groupedColumn" | "column" | "histogram" | "line" | "step" | "timeline";

export interface SeriesModel {
  readonly name: string;
  readonly slot: number;
  /** Every value, a gap (`null` or `NaN`) as `null`. */
  readonly y: readonly (number | null)[];
}

export interface RectModel {
  readonly kind: "rect";
  readonly x1: ArrayLike<number>;
  readonly x2: ArrayLike<number>;
  readonly open: boolean;
  /** "group" sets two or more series side by side in each bucket; one
   *  series grouped is a plain column, so it reads "stack". */
  readonly arrange: "stack" | "group";
  readonly series: readonly SeriesModel[];
  /** The buckets drawn, read and listed: every one not wholly outside the domain. */
  readonly shown: readonly number[];
}

export interface LineModel {
  readonly kind: "line";
  readonly x: ArrayLike<number>;
  readonly step: boolean;
  readonly series: readonly SeriesModel[];
  /** The samples inside the domain, `[from, to)`. */
  readonly from: number;
  readonly to: number;
}

export interface DotRowModel {
  readonly name: string;
  readonly x: ArrayLike<number>;
  /** The dots inside the domain, `[from, to)`. */
  readonly from: number;
  readonly to: number;
}

export interface DotModel {
  readonly kind: "dot";
  readonly slot: number;
  readonly unit: Unit | undefined;
  readonly rows: readonly DotRowModel[];
}

interface RuleModel {
  readonly kind: "rule";
  readonly axis: "x" | "y";
  readonly value: number;
  readonly label: string;
  /** Where it sits on its axis, or the end it is off. */
  readonly place: ReturnType<typeof ruleAt>;
}

type MarkModel = RectModel | LineModel | DotModel | RuleModel;

export interface Model {
  readonly spec: ChartSpec;
  readonly x: Continuous;
  readonly y: Continuous | Band;
  /** In the spec's order. */
  readonly marks: readonly MarkModel[];
  /** The data mark's kind; absent with rules alone. */
  readonly kind: Kind | undefined;
  /** Nothing to draw: every value null, every row empty, or every rect 0. */
  readonly empty: boolean;
  /** An x value as the readings and the table write it. */
  readonly xText: (v: number) => string;
  /** Both ends of a span of x, the end without a date the start already says. */
  readonly xSpan: (from: number, to: number) => readonly [string, string];
  /** A y value, as the axis and the readings write it. */
  readonly yText: (v: number) => string;
  readonly locale: string | undefined;
  readonly timeZone: string | undefined;
}

const DAY = 86_400_000;
const SCALE_TYPES = new Set(["linear", "log", "time", "band"]);
const FORMATS = new Set(["number", "integer", "percent", "duration"]);

function fail(message: string, type: ErrorConstructor = TypeError): never {
  throw new type(`renderChart: ${message}`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const arrayLike = (v: unknown): v is ArrayLike<unknown> =>
  isObject(v) && typeof v["length"] === "number";

function optional(v: unknown, type: "string" | "boolean" | "number", what: string): void {
  if (v !== undefined && typeof v !== type) {
    fail(`${what} must be a ${type}`);
  }
}

function checkUnit(unit: unknown, what: string): void {
  if (unit !== undefined && !(isObject(unit) && typeof unit["other"] === "string")) {
    fail(`${what}.unit must name its "other" form`);
  }
}

function checkScale(scale: unknown, what: string): void {
  if (!isObject(scale)) {
    fail(`${what} must be an object`);
  }
  const { type, format, domain } = scale;
  if (type !== undefined && !(typeof type === "string" && SCALE_TYPES.has(type))) {
    fail(`${what}.type must be "linear", "log", "time" or "band"`);
  }
  optional(scale["label"], "string", `${what}.label`);
  for (const flag of ["zero", "mono", "reverse"]) {
    optional(scale[flag], "boolean", `${what}.${flag}`);
  }
  checkUnit(scale["unit"], what);
  const formatOk =
    format === undefined ||
    typeof format === "function" ||
    isObject(format) ||
    (typeof format === "string" && FORMATS.has(format));
  if (!formatOk) {
    fail(`${what}.format must be a format name, Intl options or a function`);
  }
  if (domain !== undefined && !(arrayLike(domain) && domain.length === 2)) {
    fail(`${what}.domain must be a low and a high`);
  }
}

// Every x is finite and in order: strictly increasing, or with `ties` never decreasing.
function checkX(values: unknown, what: string, ties: boolean): ArrayLike<number> {
  if (!arrayLike(values)) {
    fail(`${what} must be an array of numbers`);
  }
  let before = Number.NEGATIVE_INFINITY;
  for (const v of Array.from(values)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      fail(`${what} must hold finite numbers`, RangeError);
    }
    if (ties ? v < before : v <= before) {
      fail(`${what} must ${ties ? "never decrease" : "strictly increase"}`, RangeError);
    }
    before = v;
  }
  return values as ArrayLike<number>;
}

function checkSlot(slot: unknown, what: string): void {
  if (slot === undefined) {
    return;
  }
  if (typeof slot !== "number") {
    fail(`${what}.slot must be a number`);
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    fail(`${what}.slot must be 1 to 9`, RangeError);
  }
}

function checkSeries(series: unknown, length: number, what: string): void {
  if (!arrayLike(series)) {
    fail(`${what}.series must be an array`);
  }
  for (let s = 0; s < series.length; s++) {
    const one = series[s];
    const at = `${what}.series[${String(s)}]`;
    if (!isObject(one) || typeof one["name"] !== "string") {
      fail(`${at} must have a name`);
    }
    checkSlot(one["slot"], at);
    if (one["slot"] === undefined && s >= 9) {
      fail(`${at} needs a slot, since series past the ninth take none of their own`, RangeError);
    }
    const y = one["y"];
    if (!arrayLike(y)) {
      fail(`${at}.y must be an array of numbers`);
    }
    if (y.length !== length) {
      fail(`${at}.y must be as long as its x`);
    }
    if (Array.from(y).some((v) => v !== null && typeof v !== "number")) {
      fail(`${at}.y must hold numbers or null`);
    }
  }
}

function checkMark(mark: unknown, what: string): void {
  if (!isObject(mark)) {
    fail(`${what} must be an object`);
  }
  switch (mark["mark"]) {
    case "rect": {
      const x1 = checkX(mark["x1"], `${what}.x1`, false);
      const x2 = checkX(mark["x2"], `${what}.x2`, true);
      if (x2.length !== x1.length) {
        fail(`${what}.x2 must be as long as its x1`);
      }
      for (let i = 0; i < x1.length; i++) {
        if ((x2[i] ?? 0) <= (x1[i] ?? 0)) {
          fail(`${what}.x2 must be above its x1`, RangeError);
        }
      }
      optional(mark["open"], "boolean", `${what}.open`);
      const arrange = mark["arrange"];
      if (arrange !== undefined && arrange !== "stack" && arrange !== "group") {
        fail(`${what}.arrange must be "stack" or "group"`);
      }
      checkSeries(mark["series"], x1.length, what);
      return;
    }
    case "line": {
      const x = checkX(mark["x"], `${what}.x`, false);
      const curve = mark["curve"];
      if (curve !== undefined && curve !== "linear" && curve !== "step") {
        fail(`${what}.curve must be "linear" or "step"`);
      }
      checkSeries(mark["series"], x.length, what);
      return;
    }
    case "dot": {
      checkSlot(mark["slot"], what);
      checkUnit(mark["unit"], what);
      const rows = mark["rows"];
      if (!arrayLike(rows)) {
        fail(`${what}.rows must be an array`);
      }
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const at = `${what}.rows[${String(r)}]`;
        if (!isObject(row) || typeof row["name"] !== "string") {
          fail(`${at} must have a name`);
        }
        checkX(row["x"], `${at}.x`, true);
      }
      return;
    }
    case "rule": {
      const { x, y } = mark;
      if ((x === undefined) === (y === undefined)) {
        fail(`${what} must have exactly one of x and y`);
      }
      const value = x ?? y;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail(`${what}'s value must be a finite number`, RangeError);
      }
      if (typeof mark["label"] !== "string") {
        fail(`${what}.label must be a string`);
      }
      return;
    }
    default:
      fail(`${what}.mark must be "rect", "line", "dot" or "rule"`);
  }
}

/** Throws a `TypeError` or `RangeError` naming the first rule `spec` breaks. */
function check(spec: unknown): asserts spec is ChartSpec {
  if (!isObject(spec)) {
    fail("the spec must be an object");
  }
  checkScale(spec["x"], "x");
  if (spec["y"] !== undefined) {
    checkScale(spec["y"], "y");
  }
  const marks = spec["marks"];
  if (!arrayLike(marks)) {
    fail("marks must be an array");
  }
  let data = -1;
  for (let m = 0; m < marks.length; m++) {
    const mark = marks[m];
    checkMark(mark, `marks[${String(m)}]`);
    if (isObject(mark) && mark["mark"] === "rule") {
      continue;
    }
    // The keys, the legend row, the summary and the table read one mark, so a
    // second would draw values none of them give.
    if (data !== -1) {
      fail(
        `marks[${String(m)}] is a second data mark beside marks[${String(data)}]; a chart holds one rect, line or dot mark and any rules`,
      );
    }
    data = m;
  }
  const height = spec["height"];
  optional(height, "number", "height");
  if (typeof height === "number" && !(Number.isFinite(height) && height > 0)) {
    fail("height must be a number of px above 0", RangeError);
  }
  const summary = spec["summary"];
  if (summary !== undefined && typeof summary !== "string" && typeof summary !== "function") {
    fail("summary must be a string or a function");
  }
  optional(spec["empty"], "string", "empty");
}

// A log axis has no place for 0 or below, so a line reads such a value as a
// gap, as the extent already leaves it out.
const gaps = (y: ArrayLike<number | null>, log: boolean): (number | null)[] =>
  Array.from(y, (v) => (v === null || Number.isNaN(v) || (log && v <= 0) ? null : v));

function series(list: RectMark["series"], log = false): SeriesModel[] {
  return list.map((s, i) => ({ name: s.name, slot: s.slot ?? i + 1, y: gaps(s.y, log) }));
}

// A rect is drawn unless it lies wholly outside the domain; a log x's
// underflow bin follows its own rule.
function shownBuckets(mark: RectMark, index: number, x: Continuous): number[] {
  const out: number[] = [];
  for (let i = 0; i < mark.x1.length; i++) {
    const under = x.under;
    const inside =
      under?.mark === index && under.index === i
        ? under.drawn !== "out"
        : (mark.x2[i] ?? 0) > x.lo && (mark.x1[i] ?? 0) < x.hi;
    if (inside) {
      out.push(i);
    }
  }
  return out;
}

function kindOf(marks: readonly MarkModel[], x: Continuous): Kind | undefined {
  const first = marks.find((m) => m.kind !== "rule");
  switch (first?.kind) {
    case undefined:
      return undefined;
    case "rect":
      if (x.type === "log") {
        return "histogram";
      }
      if (first.series.length < 2) {
        return "column";
      }
      return first.arrange === "group" ? "groupedColumn" : "stackedColumn";
    case "line":
      return first.step ? "step" : "line";
    case "dot":
      return "timeline";
  }
}

function hasData(m: MarkModel): boolean {
  switch (m.kind) {
    case "rect":
      return m.shown.some((i) => m.series.some((s) => (s.y[i] ?? 0) > 0));
    case "line":
      return m.series.some((s) => s.y.slice(m.from, m.to).some((v) => v !== null));
    case "dot":
      return m.rows.some((r) => r.to > r.from);
    case "rule":
      return false;
  }
}

/**
 * Checks `spec` and builds its model in `locale` and `timeZone`. Throws a
 * `RangeError` or `TypeError` naming the first rule the spec breaks.
 */
export function chartModel(
  spec: ChartSpec,
  locale: string | undefined,
  timeZone: string | undefined,
): Model {
  check(spec);
  const x = xScale(spec);
  const y = yScale(spec);
  const marks = spec.marks.map((m, index): MarkModel => {
    switch (m.mark) {
      case "rect":
        return {
          kind: "rect",
          x1: m.x1,
          x2: m.x2,
          open: m.open === true,
          arrange: m.arrange === "group" && m.series.length > 1 ? "group" : "stack",
          series: series(m.series),
          shown: shownBuckets(m, index, x),
        };
      case "line":
        return {
          kind: "line",
          x: m.x,
          step: m.curve === "step",
          series: series(m.series, y.type === "log"),
          from: lowerBound(m.x, x.lo),
          to: upperBound(m.x, x.hi),
        };
      case "dot":
        return {
          kind: "dot",
          slot: m.slot ?? 1,
          unit: m.unit,
          rows: m.rows.map((r) => ({
            name: r.name,
            x: r.x,
            from: lowerBound(r.x, x.lo),
            to: upperBound(r.x, x.hi),
          })),
        };
      case "rule": {
        const axis = m.x === undefined ? "y" : "x";
        const value = m.x ?? m.y ?? 0;
        const scale = axis === "x" ? x : y;
        // A y rule beside dot rows throws in yScale, so its scale is continuous.
        const place = scale.type === "band" ? { at: value } : ruleAt(scale, value);
        return { kind: "rule", axis, value, label: m.label, place };
      }
    }
  });
  const days = x.hi - x.lo > DAY;
  const xText =
    x.type === "time" ? instantFormat(locale, timeZone, days) : formatter(x.format, locale);
  const xSpan =
    x.type === "time"
      ? spanFormat(locale, timeZone, days)
      : (from: number, to: number) => [xText(from), xText(to)] as const;
  return {
    spec,
    x,
    y,
    marks,
    kind: kindOf(marks, x),
    empty: !marks.some(hasData),
    xText,
    xSpan,
    yText: formatter(y.type === "band" ? undefined : y.format, locale),
    locale,
    timeZone,
  };
}
