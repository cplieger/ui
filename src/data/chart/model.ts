/**
 * model.ts — a checked spec and what each of its marks shows inside the
 * x domain, the one source the drawing, the readings and the table read.
 * @module
 */

import {
  formatter,
  instantFormat,
  signedFormatter,
  spanFormat,
  type Unit,
} from "../scale/format.js";
import { lowerBound, upperBound } from "../scale/reduce.js";
import { spansDay } from "../scale/time.js";

import { ruleAt, xScale, yScale, type Band, type Continuous } from "./scales.js";
import type { BarMark, ChartSpec, Mark, RectMark } from "./spec.js";

type Kind =
  | "stackedColumn"
  | "groupedColumn"
  | "shareColumn"
  | "column"
  | "stackedArea"
  | "shareArea"
  | "area"
  | "histogram"
  | "line"
  | "step"
  | "timeline"
  | "bar"
  | "stackedBar"
  | "groupedBar"
  | "shareBar"
  | "divergingBar"
  | "splitBar";

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
   *  series grouped is a plain column, so it reads "stack". "share" draws
   *  each series' share of its bucket's total; `series` keeps the values. */
  readonly arrange: "stack" | "group" | "share";
  readonly shape: "bars" | "area";
  readonly series: readonly SeriesModel[];
  /** The buckets drawn, read and listed: every one not wholly outside the domain. */
  readonly shown: readonly number[];
}

/** The sum of bucket `i`'s values, a `null` as 0. */
export const bucketTotal = (m: RectModel, i: number): number =>
  m.series.reduce((n, s) => n + (s.y[i] ?? 0), 0);

/** The height series `s` draws in bucket `i`, a `null` as 0: under "share"
 *  its share of the bucket's total, 0 when the total is, else its value. */
export function drawnValue(m: RectModel, s: SeriesModel, i: number): number {
  const v = s.y[i] ?? 0;
  if (m.arrange !== "share") {
    return v;
  }
  const total = bucketTotal(m, i);
  return total > 0 ? v / total : 0;
}

interface Samples {
  readonly x: ArrayLike<number>;
  readonly step: boolean;
  readonly series: readonly SeriesModel[];
  /** The samples inside the domain, `[from, to)`. */
  readonly from: number;
  readonly to: number;
}

export interface LineModel extends Samples {
  readonly kind: "line";
}

/** Series stacked in series order over samples, each a layer; under
 *  "share" each draws its share of the sample's total, `series` keeping the
 *  values. */
export interface AreaModel extends Samples {
  readonly kind: "area";
  readonly arrange: "stack" | "share";
}

/** A mark over `x` samples, read by the same stops and keys. */
export type SampleModel = LineModel | AreaModel;

/** The stack's top at sample `i` of `m`, or `null` where any series is a
 *  gap, which breaks every layer there. */
export function sampleTotal(m: AreaModel, i: number): number | null {
  let total = 0;
  for (const s of m.series) {
    const v = s.y[i] ?? null;
    if (v === null) {
      return null;
    }
    total += v;
  }
  return total;
}

/** The total area `m` draws its stack to at sample `i`, or `null` where it
 *  draws none: a gap in any series, or under "share" a total of 0, which
 *  has no shares. */
export function drawnTotal(m: AreaModel, i: number): number | null {
  const total = sampleTotal(m, i);
  return total === null || (m.arrange === "share" && total <= 0) ? null : total;
}

/** The thickness series `s` draws at sample `i` of area `m`: its value, or
 *  under "share" its share of the total; `null` where the stack is not drawn. */
export function sampleValue(m: AreaModel, s: SeriesModel, i: number): number | null {
  const total = drawnTotal(m, i);
  if (total === null) {
    return null;
  }
  const v = s.y[i] ?? 0;
  return m.arrange === "share" ? v / total : v;
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

export interface BarSeriesModel {
  readonly name: string;
  readonly slot: number;
  /** The slot of its bars below 0; its own slot unless `below` names one. */
  readonly below: number;
  /** A value per row of the band, a gap (`null` or `NaN`) as `null`. */
  readonly x: readonly (number | null)[];
}

/** Bars along x, one row per category of the chart's band y. */
export interface BarModel {
  readonly kind: "bar";
  /** "group" sets two or more series one under another in each row, and
   *  "split" in a panel each; one series grouped or split is a plain bar, so
   *  it reads "stack". "share" draws each series' share of its row's total;
   *  `series` keeps the values. */
  readonly arrange: "stack" | "group" | "share" | "split";
  /** Each row's value written at its bar's end, in place of an x axis;
   *  never under "share". */
  readonly labels: boolean;
  readonly series: readonly BarSeriesModel[];
}

/** Whether each of `m`'s bars stands on its own from 0, as a group's and a
 *  split's do, so its rows read no total. */
export const barsApart = (m: BarModel): boolean => m.arrange === "group" || m.arrange === "split";

/** Row `i`'s total of bar mark `m`, or `null` when every value is a gap. */
export function barTotal(m: BarModel, i: number): number | null {
  let total: number | null = null;
  for (const s of m.series) {
    const v = s.x[i] ?? null;
    if (v !== null) {
      total = (total ?? 0) + v;
    }
  }
  return total;
}

/** The length series `s` draws in row `i`, a `null` as 0: under "share" its
 *  share of the row's total, 0 when the total is, else its value. */
export function barValue(m: BarModel, s: BarSeriesModel, i: number): number {
  const v = s.x[i] ?? 0;
  if (m.arrange !== "share") {
    return v;
  }
  const total = barTotal(m, i) ?? 0;
  return total > 0 ? v / total : 0;
}

interface RuleModel {
  readonly kind: "rule";
  readonly axis: "x" | "y";
  readonly value: number;
  readonly label: string;
  /** Where it sits on its axis, or the end it is off. */
  readonly place: ReturnType<typeof ruleAt>;
}

export type Side = "above" | "below" | "left" | "right";

/** A note at a place on the plot, which joins the reading of the stop it names. */
export interface TextModel {
  readonly kind: "text";
  readonly x: number;
  /** A y value, or under a dot mark the index of the row it names. */
  readonly y: number;
  readonly row: boolean;
  readonly text: string;
  readonly side: Side;
}

type MarkModel = RectModel | LineModel | AreaModel | DotModel | BarModel | RuleModel | TextModel;

export interface Model {
  readonly spec: ChartSpec;
  readonly x: Continuous;
  readonly y: Continuous | Band;
  /** In the spec's order. */
  readonly marks: readonly MarkModel[];
  /** The data mark's kind; absent with rules alone. */
  readonly kind: Kind | undefined;
  /** Nothing to draw: every value null, every row empty, every rect 0, or
   *  every area sample 0 or a gap. */
  readonly empty: boolean;
  /** An x value as the readings and the table write it. */
  readonly xText: (v: number) => string;
  /** Both ends of a span of x, the end without a date the start already says. */
  readonly xSpan: (from: number, to: number) => readonly [string, string];
  /** A y value, as the axis and the readings write it. */
  readonly yText: (v: number) => string;
  /** A value or total as an amount: the value axis's format (`xText` on a
   *  bar chart, else `yText`), or a plain number under "share", whose axis
   *  writes shares. */
  readonly amountText: (v: number) => string;
  readonly locale: string | undefined;
  readonly timeZone: string | undefined;
}

const SCALE_TYPES = new Set(["linear", "log", "time", "band"]);
const FORMATS = new Set(["number", "integer", "percent", "duration"]);
const SIDES = new Set(["above", "below", "left", "right"]);

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

function checkSlot(slot: unknown, what: string, field = "slot"): void {
  if (slot === undefined) {
    return;
  }
  if (typeof slot !== "number") {
    fail(`${what}.${field} must be a number`);
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    fail(`${what}.${field} must be 1 to 9`, RangeError);
  }
}

function checkSeries(series: unknown, length: number, what: string, channel = "y"): void {
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
    const values = one[channel];
    const of = `${at}.${channel}`;
    if (!arrayLike(values)) {
      fail(`${of} must be an array of numbers`);
    }
    if (values.length !== length) {
      fail(`${of} must be as long as its ${channel === "y" ? "x" : "y"}`);
    }
    if (Array.from(values).some((v) => v !== null && typeof v !== "number")) {
      fail(`${of} must hold numbers or null`);
    }
  }
}

function checkCurve(curve: unknown, what: string): void {
  if (curve !== undefined && curve !== "linear" && curve !== "step") {
    fail(`${what}.curve must be "linear" or "step"`);
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
      if (
        arrange !== undefined &&
        arrange !== "stack" &&
        arrange !== "group" &&
        arrange !== "share"
      ) {
        fail(`${what}.arrange must be "stack", "group" or "share"`);
      }
      const shape = mark["shape"];
      if (shape !== undefined && shape !== "bars" && shape !== "area") {
        fail(`${what}.shape must be "bars" or "area"`);
      }
      if (shape === "area" && arrange === "group") {
        fail(
          `${what}.shape "area" takes no arrange "group", since areas cannot stand side by side`,
        );
      }
      const list = mark["series"];
      checkSeries(list, x1.length, what);
      if (arrange === "share" && arrayLike(list) && list.length < 2) {
        fail(`${what}.arrange "share" needs two or more series, since one reads 100% everywhere`);
      }
      return;
    }
    case "line": {
      const x = checkX(mark["x"], `${what}.x`, false);
      checkCurve(mark["curve"], what);
      checkSeries(mark["series"], x.length, what);
      return;
    }
    case "area": {
      const x = checkX(mark["x"], `${what}.x`, false);
      checkCurve(mark["curve"], what);
      const arrange = mark["arrange"];
      if (arrange !== undefined && arrange !== "stack" && arrange !== "share") {
        fail(`${what}.arrange must be "stack" or "share"`);
      }
      const list = mark["series"];
      checkSeries(list, x.length, what);
      if (arrange === "share" && arrayLike(list) && list.length < 2) {
        fail(`${what}.arrange "share" needs two or more series, since one reads 100% everywhere`);
      }
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
    case "bar": {
      const names = mark["y"];
      if (!arrayLike(names) || Array.from(names).some((n) => typeof n !== "string")) {
        fail(`${what}.y must be an array of the categories' names`);
      }
      // The readings and the table name a row by its name alone.
      const seen = new Set<unknown>();
      for (const name of Array.from(names)) {
        if (name === "" || seen.has(name)) {
          fail(`${what}.y must name each category once, never ""`, RangeError);
        }
        seen.add(name);
      }
      const arrange = mark["arrange"];
      if (
        arrange !== undefined &&
        arrange !== "stack" &&
        arrange !== "group" &&
        arrange !== "share" &&
        arrange !== "split"
      ) {
        fail(`${what}.arrange must be "stack", "group", "share" or "split"`);
      }
      optional(mark["labels"], "boolean", `${what}.labels`);
      if (arrange === "share" && mark["labels"] !== undefined) {
        fail(`${what}.labels has no place under arrange "share", whose rows all reach 100%`);
      }
      const list = mark["series"];
      checkSeries(list, names.length, what, "x");
      if (arrange === "share" && arrayLike(list) && list.length < 2) {
        fail(`${what}.arrange "share" needs two or more series, since one reads 100% everywhere`);
      }
      const all = Array.from(list as ArrayLike<Record<string, unknown>>);
      all.forEach((one, s) => {
        const at = `${what}.series[${String(s)}]`;
        checkSlot(one["below"], at, "below");
        if (one["below"] !== undefined && all.length > 1) {
          fail(`${at}.below has no place beside other series, whose slots tell them apart`);
        }
      });
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
    case "text": {
      if (typeof mark["text"] !== "string" || mark["text"].trim() === "") {
        fail(`${what}.text must be a non-empty string`);
      }
      const side = mark["side"];
      if (side !== undefined && !(typeof side === "string" && SIDES.has(side))) {
        fail(`${what}.side must be "above", "below", "left" or "right"`);
      }
      for (const axis of ["x", "y"]) {
        const v = mark[axis];
        if (v !== undefined && typeof v !== "number" && typeof v !== "string") {
          fail(`${what}.${axis} must be a number or a name`);
        }
        if (typeof v === "number" && !Number.isFinite(v)) {
          fail(`${what}.${axis} must be finite`, RangeError);
        }
      }
      return;
    }
    default:
      fail(`${what}.mark must be "rect", "line", "area", "dot", "bar", "rule" or "text"`);
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
    if (isObject(mark) && (mark["mark"] === "rule" || mark["mark"] === "text")) {
      continue;
    }
    // The keys, the legend row, the summary and the table read one mark, so a
    // second would draw values none of them give.
    if (data !== -1) {
      fail(
        `marks[${String(m)}] is a second data mark beside marks[${String(data)}]; a chart holds one rect, line, area, dot or bar mark and any rules and text marks`,
      );
    }
    data = m;
  }
  const height = spec["height"];
  const primary = marks[data];
  const band = isObject(primary) && (primary["mark"] === "dot" || primary["mark"] === "bar");
  if (band && height !== undefined) {
    fail("height has no place on a dot or bar chart, which is as tall as its rows");
  }
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

const barSeries = (list: BarMark["series"]): BarSeriesModel[] =>
  list.map((s, i) => {
    const slot = s.slot ?? i + 1;
    return { name: s.name, slot, below: s.below ?? slot, x: gaps(s.x, false) };
  });

/** One series with a value below 0: its bars run either side of the zero
 *  line, and every value but 0 is written with its sign. */
export const signedBar = (m: BarModel): boolean =>
  m.series.length === 1 && (m.series[0]?.x.some((v) => v !== null && v < 0) ?? false);

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
  const first = marks.find((m) => m.kind !== "rule" && m.kind !== "text");
  switch (first?.kind) {
    case undefined:
      return undefined;
    case "rect":
      if (x.type === "log") {
        return "histogram";
      }
      if (first.shape === "area") {
        return first.series.length < 2
          ? "area"
          : first.arrange === "share"
            ? "shareArea"
            : "stackedArea";
      }
      if (first.series.length < 2) {
        return "column";
      }
      return first.arrange === "group"
        ? "groupedColumn"
        : first.arrange === "share"
          ? "shareColumn"
          : "stackedColumn";
    case "line":
      return first.step ? "step" : "line";
    case "area":
      return first.series.length < 2
        ? "area"
        : first.arrange === "share"
          ? "shareArea"
          : "stackedArea";
    case "dot":
      return "timeline";
    case "bar":
      return first.series.length < 2
        ? signedBar(first)
          ? "divergingBar"
          : "bar"
        : first.arrange === "group"
          ? "groupedBar"
          : first.arrange === "share"
            ? "shareBar"
            : first.arrange === "split"
              ? "splitBar"
              : "stackedBar";
  }
}

function hasData(m: MarkModel): boolean {
  switch (m.kind) {
    case "rect":
      return m.shown.some((i) => m.series.some((s) => (s.y[i] ?? 0) > 0));
    case "line":
      return m.series.some((s) => s.y.slice(m.from, m.to).some((v) => v !== null));
    case "area":
      for (let i = m.from; i < m.to; i++) {
        if ((sampleTotal(m, i) ?? 0) > 0) {
          return true;
        }
      }
      return false;
    case "dot":
      return m.rows.some((r) => r.to > r.from);
    case "bar":
      return m.series.some((s) => s.x.some((v) => v !== null && v !== 0));
    case "rule":
    case "text":
      return false;
  }
}

// A note's place in the data mark's terms: values on continuous scales, or
// under a dot mark a time and a row's name.
function textModel(
  m: Extract<Mark, { mark: "text" }>,
  what: string,
  x: Continuous,
  y: Continuous | Band,
): TextModel {
  const side = m.side ?? "above";
  const place = (v: number | string | undefined, axis: "x" | "y", scale: Continuous | Band) => {
    if (v === undefined) {
      return fail(`${what}.${axis} is missing; a note needs an x and a y on this chart`);
    }
    if (scale.type === "band") {
      if (typeof v !== "string") {
        return fail(`${what}.${axis} must name a row of the band`);
      }
      const row = scale.rows.indexOf(v);
      if (row === -1) {
        return fail(`${what}.${axis} names no row: "${v}"`, RangeError);
      }
      return row;
    }
    if (typeof v !== "number") {
      return fail(`${what}.${axis} must be a number on a ${scale.type} scale`);
    }
    if (scale.type === "log" && v <= 0) {
      return fail(`${what}.${axis} must be above 0 on a log scale`, RangeError);
    }
    return v;
  };
  return {
    kind: "text",
    x: place(m.x, "x", x),
    y: place(m.y, "y", y),
    row: y.type === "band",
    text: m.text,
    side,
  };
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
          arrange:
            m.arrange === "share" || (m.arrange === "group" && m.series.length > 1)
              ? m.arrange
              : "stack",
          shape: m.shape ?? "bars",
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
      case "area":
        return {
          kind: "area",
          x: m.x,
          step: m.curve === "step",
          arrange: m.arrange ?? "stack",
          series: series(m.series),
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
      case "bar":
        return {
          kind: "bar",
          arrange:
            m.arrange === "share" ||
            ((m.arrange === "group" || m.arrange === "split") && m.series.length > 1)
              ? m.arrange
              : "stack",
          labels: m.arrange !== "share" && m.labels !== false,
          series: barSeries(m.series),
        };
      case "rule": {
        const axis = m.x === undefined ? "y" : "x";
        const value = m.x ?? m.y ?? 0;
        const scale = axis === "x" ? x : y;
        // A y rule on a band throws in yScale, so its scale is continuous.
        const place = scale.type === "band" ? { at: value } : ruleAt(scale, value);
        return { kind: "rule", axis, value, label: m.label, place };
      }
      case "text":
        return textModel(m, `marks[${String(index)}]`, x, y);
    }
  });
  // The ends of a domain a whole day long can share their clock time, so they
  // need their dates ("Nov 10, 2:00 PM to Nov 11, 2:00 PM").
  const days = x.type === "time" && spansDay(x.lo, x.hi, timeZone);
  const signed = marks.some((m) => m.kind === "bar" && signedBar(m));
  const xText =
    x.type === "time"
      ? instantFormat(locale, timeZone, days)
      : (signed ? signedFormatter : formatter)(x.format, locale);
  const xSpan =
    x.type === "time"
      ? spanFormat(locale, timeZone, days)
      : (from: number, to: number) => [xText(from), xText(to)] as const;
  const yText = formatter(y.type === "band" ? undefined : y.format, locale);
  const share = marks.some(
    (m) => (m.kind === "rect" || m.kind === "area" || m.kind === "bar") && m.arrange === "share",
  );
  const bars = marks.some((m) => m.kind === "bar");
  return {
    spec,
    x,
    y,
    marks,
    kind: kindOf(marks, x),
    empty: !marks.some(hasData),
    xText,
    xSpan,
    yText,
    amountText: share ? formatter("number", locale) : bars ? xText : yText,
    locale,
    timeZone,
  };
}
