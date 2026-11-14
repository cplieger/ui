/**
 * model.ts — a checked spec and what each of its marks shows inside the
 * x domain, the one source the drawing, the readings and the table read.
 * @module
 */

import {
  instantFormat,
  spanFormat,
  widthKey,
  writer,
  type Unit,
  type WidthKey,
} from "../scale/format.js";
import { lowerBound, upperBound } from "../scale/reduce.js";
import { localDay, spansDay } from "../scale/time.js";

import { dayFormat, weekStartOf } from "./calendar.js";
import { classes, type Classes } from "./classes.js";
import {
  LIMIT,
  rScale,
  ruleAt,
  xScale,
  yScale,
  type Band,
  type Continuous,
  type Size,
} from "./scales.js";
import type {
  BarMark,
  BoxMark,
  CellMark,
  ChartSpec,
  Mark,
  PointMark,
  RectMark,
  ScatterMark,
} from "./spec.js";

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
  | "splitBar"
  | "divergingStackedBar"
  | "mirrorBar"
  | "dotPlot"
  | "rangePlot"
  | "arrowPlot"
  | "slope"
  | "scatter"
  | "bubble"
  | "heatmap"
  | "histogram2d"
  | "calendar"
  | "box";

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
   *  `series` keeps the values. "diverge" stacks the first `left` series
   *  leftward from 0 and the rest rightward; "mirror" sets its two series
   *  back to back in a panel each. */
  readonly arrange: "stack" | "group" | "share" | "split" | "diverge" | "mirror";
  /** How many series, the first ones, lie left of 0: 0 unless "diverge". */
  readonly left: number;
  /** Under "diverge", the series after the left ones straddles 0. */
  readonly centre: boolean;
  /** Each row's value written at its bar's end, in place of an x axis;
   *  never under "share" or "diverge". */
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

export interface PointSeriesModel {
  readonly name: string;
  readonly slot: number;
  /** A value per row of the band, a gap (`null` or `NaN`) as `null`. */
  readonly x: readonly (number | null)[];
}

/** Dots along x, a dot per series on each row of the chart's band y. */
export interface PointModel {
  readonly kind: "point";
  /** Joins each row's two dots; with it there are exactly two series. */
  readonly link: "range" | "arrow" | undefined;
  readonly series: readonly PointSeriesModel[];
}

/** Row `i`'s gap between the two dots of `m` under "range", or under
 *  "arrow" the second less the first; `null` with no link or a gap at
 *  either end. */
export function pointLink(m: PointModel, i: number): number | null {
  const [a, b] = m.series.map((s) => s.x[i] ?? null);
  if (m.link === undefined || a === null || a === undefined || b === null || b === undefined) {
    return null;
  }
  return m.link === "range" ? Math.abs(b - a) : b - a;
}

/** Each series as one line between two named columns, which sit at x 0
 *  and 1 of the chart's x. */
export interface SlopeModel {
  readonly kind: "slope";
  /** The columns' names, left to right. */
  readonly columns: readonly [string, string];
  /** Each series' `y` holds its two ends. */
  readonly series: readonly SeriesModel[];
}

/** A slope series' right end less its left; `null` with either end missing. */
export function slopeChange(s: SeriesModel): number | null {
  const [a = null, b = null] = s.y;
  return a === null || b === null ? null : b - a;
}

interface ScatterSeriesModel {
  readonly name: string;
  readonly slot: number;
  readonly names: readonly string[];
  /** A value per dot, a gap (`null` or `NaN`) as `null`. */
  readonly x: readonly (number | null)[];
  readonly y: readonly (number | null)[];
  /** A bubble chart's sizes, a gap as `null`; undefined without `r`. */
  readonly r: readonly (number | null)[] | undefined;
}

/** A scatter's dot: index `i` of series `series`. */
export interface DotRef {
  readonly series: number;
  readonly i: number;
}

/** Dots on two continuous scales, each series a group in its slot. */
export interface ScatterModel {
  readonly kind: "scatter";
  readonly unit: Unit | undefined;
  readonly series: readonly ScatterSeriesModel[];
  /** Per series, its dots drawn, read and listed in the app's order: those
   *  with both values, and on a bubble chart a size, inside both domains. */
  readonly shown: readonly (readonly number[])[];
  /** The bubbles' size scale; undefined for plain dots. */
  readonly size: Size | undefined;
  /** The shown dots in draw order, a later one over an earlier: series,
   *  then the app's order; bubbles largest first across every series, ties
   *  in that order, so a small bubble is never hidden under a large one. */
  readonly drawn: readonly DotRef[];
}

/** The shown dot of `m` whose values are `x` and `y`, the one drawn on top
 *  among coincident dots. Undefined when no shown dot has both. */
export function scatterDotAt(m: ScatterModel, x: number, y: number): DotRef | undefined {
  for (let d = m.drawn.length - 1; d >= 0; d--) {
    const ref = m.drawn[d];
    const s = ref === undefined ? undefined : m.series[ref.series];
    if (ref !== undefined && s?.x[ref.i] === x && s.y[ref.i] === y) {
      return ref;
    }
  }
  return undefined;
}

/** A category's five numbers, each at most the next. */
interface Five {
  readonly low: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly high: number;
}

export interface BoxSeriesModel {
  readonly name: string;
  readonly slot: number;
  /** Per row of the band, its five numbers, or `null` where all five are gaps. */
  readonly boxes: readonly (Five | null)[];
  /** Per row of the band, its outliers in ascending order. */
  readonly outliers: readonly (readonly number[])[];
}

/** A box per series on each row of the chart's band y. */
export interface BoxModel {
  readonly kind: "box";
  /** The app's words for its whiskers' convention. */
  readonly whiskers: string | undefined;
  readonly series: readonly BoxSeriesModel[];
}

/** A cell chart's axis: its categories' names, at 0 to n − 1 of a named x,
 *  or its bins' edges, one more than its bins. */
export type CellAxis =
  { readonly names: readonly string[] } | { readonly edges: readonly number[] };

/** The columns or rows along `axis`. */
export const cellCount = (axis: CellAxis): number =>
  "names" in axis ? axis.names.length : axis.edges.length - 1;

/** The bin of ascending `edges` holding `v`, each from its low edge, the
 *  last to its high edge too; -1 outside them. */
export function binOf(edges: readonly number[], v: number): number {
  const last = edges.length - 1;
  if (last < 1 || !(v >= (edges[0] ?? 0) && v <= (edges[last] ?? 0))) {
    return -1;
  }
  return v === edges[last] ? last - 1 : upperBound(edges, v) - 1;
}

/** A cell chart's cells in reading order, as `[row, column]`: rows from the
 *  top (a binned y's highest bin first), columns from the left. */
export function* cellOrder(model: Model, m: CellModel): Generator<readonly [number, number]> {
  const rows = cellCount(m.y);
  const columns = cellCount(m.x);
  const up = "edges" in m.y;
  for (let k = 0; k < rows; k++) {
    const r = up ? rows - 1 - k : k;
    for (let j = 0; j < columns; j++) {
      yield [r, model.x.reverse ? columns - 1 - j : j];
    }
  }
}

/** A grid of cells, each coloured by its value's class. */
export interface CellModel {
  readonly kind: "cell";
  readonly x: CellAxis;
  readonly y: CellAxis;
  /** A row of values per row of the band, a gap (`null` or `NaN`) as `null`. */
  readonly values: readonly (readonly (number | null)[])[];
  readonly classes: Classes;
}

/** A calendar of days from local day `day`, each coloured by its value's class. */
export interface CalendarModel {
  readonly kind: "calendar";
  /** The first day, as a local day count since 1970. */
  readonly day: number;
  /** A value per day, a gap (`null` or `NaN`) as `null`. */
  readonly values: readonly (number | null)[];
  /** The last day is still running. */
  readonly open: boolean;
  /** The ISO weekday a week column starts on. */
  readonly weekStart: number;
  readonly classes: Classes;
}

/** The day of `m` holding instant `t` on the chart's wall clock; -1 outside its days. */
export function dayOf(model: Model, m: CalendarModel, t: number): number {
  const i = localDay(t, model.timeZone) - m.day;
  return i >= 0 && i < m.values.length ? i : -1;
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
  /** An x value; none for a note at its row's end beside a split,
   *  diverging or mirrored bar chart. */
  readonly x: number | undefined;
  /** A y value, or on a band y the index of the row it names. */
  readonly y: number;
  readonly row: boolean;
  readonly text: string;
  readonly side: Side;
}

type MarkModel =
  | RectModel
  | LineModel
  | AreaModel
  | DotModel
  | BarModel
  | PointModel
  | SlopeModel
  | ScatterModel
  | CellModel
  | CalendarModel
  | BoxModel
  | RuleModel
  | TextModel;

export interface Model {
  readonly spec: ChartSpec;
  readonly x: Continuous;
  readonly y: Continuous | Band;
  /** In the spec's order. */
  readonly marks: readonly MarkModel[];
  /** The data mark's kind; absent with rules alone. */
  readonly kind: Kind | undefined;
  /** Nothing to draw: every value null, every row empty, every rect 0, no
   *  point inside the domain, or every area sample 0 or a gap. */
  readonly empty: boolean;
  /** An x value as the readings and the table write it; on a slope or a
   *  cell chart of categories a column's index as its name. */
  readonly xText: (v: number) => string;
  /** Both ends of a span of x, the end without a date the start already says. */
  readonly xSpan: (from: number, to: number) => readonly [string, string];
  /** A y value, as the axis and the readings write it. */
  readonly yText: (v: number) => string;
  /** A bubble's size, in the r scale's format. */
  readonly rText: (v: number) => string;
  /** A cell's value or a class boundary, in the colour scale's format. */
  readonly colourText: (v: number) => string;
  /** A local day's date in full (a day count since 1970), as a calendar
   *  writes its days. */
  readonly dateText: (day: number) => string;
  /** A value or total as an amount: the value axis's format (`xText` on a
   *  bar, point or box chart, else `yText`), or a plain number under "share",
   *  whose axis writes shares. */
  readonly amountText: (v: number) => string;
  /** The width keys of `xText` off a time x and named columns, `yText`, `rText`
   *  and `amountText`; undefined where a format has none. */
  readonly widthKeys: {
    readonly x: WidthKey | undefined;
    readonly y: WidthKey | undefined;
    readonly r: WidthKey | undefined;
    readonly amount: WidthKey | undefined;
    readonly colour: WidthKey | undefined;
  };
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

function checkFormat(format: unknown, what: string): void {
  const ok =
    format === undefined ||
    typeof format === "function" ||
    isObject(format) ||
    (typeof format === "string" && FORMATS.has(format));
  if (!ok) {
    fail(`${what}.format must be a format name, Intl options or a function`);
  }
}

// Infinite and non-numeric values are each check's own to refuse, in its own words.
function within(values: Iterable<unknown>, what: string): void {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > LIMIT) {
      fail(`${what} must lie within ±1e300`, RangeError);
    }
  }
}

function checkDomain(domain: unknown, what: string): void {
  if (domain !== undefined && !(arrayLike(domain) && domain.length === 2)) {
    fail(`${what}.domain must be a low and a high`);
  }
  if (arrayLike(domain)) {
    within(Array.from(domain), `${what}.domain`);
  }
}

function checkScale(scale: unknown, what: string): void {
  if (!isObject(scale)) {
    fail(`${what} must be an object`);
  }
  const { type } = scale;
  if (type !== undefined && !(typeof type === "string" && SCALE_TYPES.has(type))) {
    fail(`${what}.type must be "linear", "log", "time" or "band"`);
  }
  optional(scale["label"], "string", `${what}.label`);
  for (const flag of ["zero", "mono", "reverse"]) {
    optional(scale[flag], "boolean", `${what}.${flag}`);
  }
  checkUnit(scale["unit"], what);
  checkFormat(scale["format"], what);
  checkDomain(scale["domain"], what);
}

// A cell chart's colour classes come from `steps` over a domain, or from
// `thresholds` alone; `pivot` and `reverse` place a diverging scale's arms.
function checkColour(colour: unknown): void {
  if (!isObject(colour)) {
    fail("colour must be an object");
  }
  const { type, steps, domain, thresholds, pivot, reverse } = colour;
  if (type !== undefined && type !== "sequential" && type !== "diverging") {
    fail('colour.type must be "sequential" or "diverging"');
  }
  optional(colour["label"], "string", "colour.label");
  checkUnit(colour["unit"], "colour");
  checkFormat(colour["format"], "colour");
  checkDomain(domain, "colour");
  if (
    steps !== undefined &&
    !(typeof steps === "number" && Number.isInteger(steps) && steps >= 2 && steps <= 9)
  ) {
    fail("colour.steps must be a whole number of classes from 2 to 9");
  }
  if (thresholds !== undefined) {
    if (!arrayLike(thresholds) || Array.from(thresholds).some((t) => typeof t !== "number")) {
      fail("colour.thresholds must be an array of numbers");
    }
    for (const [field, v] of [
      ["steps", steps],
      ["domain", domain],
      ["pivot", pivot],
    ] as const) {
      if (v !== undefined) {
        fail(`colour.${field} has no place beside thresholds, which place every class`);
      }
    }
    const list = Array.from(thresholds as ArrayLike<number>);
    if (list.length < 1 || list.length > 8) {
      fail("colour.thresholds must hold one to eight boundaries, for 2 to 9 classes", RangeError);
    }
    if (list.some((t, k) => !Number.isFinite(t) || (k > 0 && t <= (list[k - 1] ?? 0)))) {
      fail("colour.thresholds must be finite and strictly increase", RangeError);
    }
    within(list, "colour.thresholds");
  }
  if (arrayLike(domain)) {
    const [lo, hi] = Array.from(domain);
    if (typeof lo !== "number" || typeof hi !== "number") {
      fail("colour.domain must be two numbers");
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
      fail("colour.domain must be finite, low below high", RangeError);
    }
  }
  optional(pivot, "number", "colour.pivot");
  if (typeof pivot === "number" && !Number.isFinite(pivot)) {
    fail("colour.pivot must be finite", RangeError);
  }
  within([pivot], "colour.pivot");
  optional(reverse, "boolean", "colour.reverse");
  if (type !== "diverging") {
    for (const [field, v] of [
      ["pivot", pivot],
      ["reverse", reverse],
    ] as const) {
      if (v !== undefined) {
        fail(`colour.${field} has no place on a sequential scale, which has no middle`);
      }
    }
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
  within(Array.from(values), what);
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

function checkSeriesHead(
  one: unknown,
  s: number,
  at: string,
): asserts one is Record<string, unknown> {
  if (!isObject(one) || typeof one["name"] !== "string") {
    fail(`${at} must have a name`);
  }
  checkSlot(one["slot"], at);
  if (one["slot"] === undefined && s >= 9) {
    fail(`${at} needs a slot, since series past the ninth take none of their own`, RangeError);
  }
}

function checkValues(values: unknown, length: number, of: string, against: string): void {
  if (!arrayLike(values)) {
    fail(`${of} must be an array of numbers`);
  }
  if (values.length !== length) {
    fail(`${of} must be as long as its ${against}`);
  }
  if (Array.from(values).some((v) => v !== null && typeof v !== "number")) {
    fail(`${of} must hold numbers or null`);
  }
  within(Array.from(values), of);
}

function checkSeries(
  series: unknown,
  length: number,
  what: string,
  channel = "y",
): asserts series is ArrayLike<Record<string, unknown>> {
  if (!arrayLike(series)) {
    fail(`${what}.series must be an array`);
  }
  for (let s = 0; s < series.length; s++) {
    const one = series[s];
    const at = `${what}.series[${String(s)}]`;
    checkSeriesHead(one, s, at);
    checkValues(one[channel], length, `${at}.${channel}`, channel === "y" ? "x" : "y");
  }
}

// A scatter's series each name their dots, and the readings and the table
// tell a dot by its name alone, so each is unique across the mark.
function checkScatter(mark: Record<string, unknown>, what: string): void {
  checkUnit(mark["unit"], what);
  const list = mark["series"];
  if (!arrayLike(list)) {
    fail(`${what}.series must be an array`);
  }
  const seen = new Set<unknown>();
  let sized: boolean | undefined;
  for (let s = 0; s < list.length; s++) {
    const one = list[s];
    const at = `${what}.series[${String(s)}]`;
    checkSeriesHead(one, s, at);
    // One series without sizes would have no area to compare with the rest.
    const r = one["r"] !== undefined;
    if (sized !== undefined && r !== sized) {
      fail(`${what}.series must all carry r or none, since a bubble's area compares across them`);
    }
    sized = r;
    const names = one["names"];
    if (!arrayLike(names) || Array.from(names).some((n) => typeof n !== "string")) {
      fail(`${at}.names must be an array of the dots' names`);
    }
    for (const name of Array.from(names)) {
      if (name === "" || seen.has(name)) {
        fail(`${what} must name each dot once across its series, never ""`, RangeError);
      }
      seen.add(name);
    }
    for (const channel of r ? ["x", "y", "r"] : ["x", "y"]) {
      checkValues(one[channel], names.length, `${at}.${channel}`, "names");
    }
  }
}

// `left` and `centre` place a diverging bar's series either side of 0, so
// they need "diverge", and it needs a left series and a right one.
function checkDiverge(
  mark: Record<string, unknown>,
  diverge: boolean,
  count: number,
  what: string,
): void {
  const { left, centre } = mark;
  optional(centre, "boolean", `${what}.centre`);
  if (!diverge) {
    for (const [field, v] of [
      ["left", left],
      ["centre", centre],
    ] as const) {
      if (v !== undefined) {
        fail(`${what}.${field} has no place outside arrange "diverge"`);
      }
    }
    return;
  }
  if (count < (centre === true ? 3 : 2)) {
    fail(
      centre === true
        ? `${what}.arrange "diverge" with centre needs three or more series: left, centre and right`
        : `${what}.arrange "diverge" needs two or more series, one each side of 0`,
    );
  }
  if (typeof left !== "number") {
    fail(`${what}.left must be a number: how many series lie left of 0 under arrange "diverge"`);
  }
  const most = count - (centre === true ? 2 : 1);
  if (!Number.isInteger(left) || left < 1 || left > most) {
    fail(
      `${what}.left must be a whole number from 1 to ${String(most)}, leaving a series ${centre === true ? "to straddle 0 and one " : ""}right of 0`,
      RangeError,
    );
  }
}

// The readings and the table name a row, or a cell's column, by its name alone.
function checkNames(names: unknown, what: string, axis = "y"): ArrayLike<unknown> {
  if (!arrayLike(names) || Array.from(names).some((n) => typeof n !== "string")) {
    fail(`${what}.${axis} must be an array of the categories' names`);
  }
  const seen = new Set<unknown>();
  for (const name of Array.from(names)) {
    if (name === "" || seen.has(name)) {
      fail(`${what}.${axis} must name each category once, never ""`, RangeError);
    }
    seen.add(name);
  }
  return names;
}

// A cell axis names its categories or gives its bins' edges; returns its
// column or row count.
function checkCellAxis(axis: unknown, what: string, name: "x" | "y"): number {
  if (!isObject(axis)) {
    fail(`${what}.${name} must name its categories or give its bins' edges`);
  }
  if (arrayLike(axis)) {
    return checkNames(axis, what, name).length;
  }
  const edges = axis["edges"];
  if (!arrayLike(edges) || Array.from(edges).some((e) => typeof e !== "number")) {
    fail(`${what}.${name}.edges must be an array of numbers`);
  }
  const list = Array.from(edges as ArrayLike<number>);
  if (list.length < 2) {
    fail(`${what}.${name}.edges must hold two or more, a bin's low and high edges`, RangeError);
  }
  if (list.some((e, k) => !Number.isFinite(e) || (k > 0 && e <= (list[k - 1] ?? 0)))) {
    fail(`${what}.${name}.edges must be finite and strictly increase`, RangeError);
  }
  within(list, `${what}.${name}.edges`);
  return list.length - 1;
}

// A calendar lays out its own days, so it takes no axis or grid of values.
function checkDays(mark: Record<string, unknown>, what: string): void {
  for (const field of ["x", "y", "values"]) {
    if (mark[field] !== undefined) {
      fail(`${what}.${field} has no place beside days; a calendar lays out its days itself`);
    }
  }
  const days = mark["days"];
  if (!isObject(days)) {
    fail(`${what}.days must be an object`);
  }
  const start = days["start"];
  if (typeof start !== "number") {
    fail(`${what}.days.start must be a number, the first day's midnight`);
  }
  if (!Number.isFinite(start)) {
    fail(`${what}.days.start must be finite`, RangeError);
  }
  const values = days["values"];
  if (!arrayLike(values) || Array.from(values).some((v) => v !== null && typeof v !== "number")) {
    fail(`${what}.days.values must be an array of numbers or null`);
  }
  if (
    Array.from(values).some((v) => v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY)
  ) {
    fail(`${what}.days.values cannot hold an infinite value`, RangeError);
  }
  within(Array.from(values), `${what}.days.values`);
  optional(days["open"], "boolean", `${what}.days.open`);
  const weekStart = mark["weekStart"];
  if (
    weekStart !== undefined &&
    !(
      typeof weekStart === "number" &&
      Number.isInteger(weekStart) &&
      weekStart >= 1 &&
      weekStart <= 7
    )
  ) {
    fail(`${what}.weekStart must be an ISO weekday from 1 (Monday) to 7 (Sunday)`);
  }
}

function checkCells(mark: Record<string, unknown>, what: string): void {
  if (mark["days"] !== undefined) {
    checkDays(mark, what);
    return;
  }
  if (mark["weekStart"] !== undefined) {
    fail(`${what}.weekStart has no place without days, which it lays out in weeks`);
  }
  const columns = checkCellAxis(mark["x"], what, "x");
  const rows = checkCellAxis(mark["y"], what, "y");
  const values = mark["values"];
  if (!arrayLike(values) || values.length !== rows) {
    fail(`${what}.values must hold one row per y entry`);
  }
  for (let r = 0; r < rows; r++) {
    const row = values[r];
    const at = `${what}.values[${String(r)}]`;
    checkValues(row, columns, at, "x");
    if (
      Array.from(row as ArrayLike<unknown>).some(
        (v) => v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY,
      )
    ) {
      fail(`${at} cannot hold an infinite value`, RangeError);
    }
  }
}

const FIVE = ["low", "q1", "median", "q3", "high"] as const;

// The chart computes no quartile, so it takes each category's five numbers
// as sent, all or none, in order, with its outliers beyond them.
function checkBox(mark: Record<string, unknown>, what: string): void {
  const names = Array.from(checkNames(mark["y"], what)) as string[];
  const whiskers = mark["whiskers"];
  if (whiskers !== undefined && !(typeof whiskers === "string" && whiskers.trim() !== "")) {
    fail(`${what}.whiskers must be a non-empty string naming the whiskers' convention`);
  }
  const list = mark["series"];
  if (!arrayLike(list)) {
    fail(`${what}.series must be an array`);
  }
  for (let s = 0; s < list.length; s++) {
    const one = list[s];
    const at = `${what}.series[${String(s)}]`;
    checkSeriesHead(one, s, at);
    for (const field of FIVE) {
      checkValues(one[field], names.length, `${at}.${field}`, "y");
    }
    const outliers = one["outliers"];
    if (
      outliers !== undefined &&
      !(
        arrayLike(outliers) &&
        outliers.length === names.length &&
        Array.from(outliers).every(
          (o) => arrayLike(o) && Array.from(o).every((v) => typeof v === "number"),
        )
      )
    ) {
      fail(`${at}.outliers must hold an array of numbers per category`);
    }
    names.forEach((name, i) => {
      const where = `${at} at "${name}"`;
      const five = FIVE.map((field) => (one[field] as ArrayLike<number | null>)[i] ?? null);
      const gaps = five.filter((v) => v === null || Number.isNaN(v)).length;
      const extra = Array.from((outliers as ArrayLike<ArrayLike<number>> | undefined)?.[i] ?? []);
      if (gaps === FIVE.length) {
        if (extra.length > 0) {
          fail(`${where} has outliers but no five numbers for them to lie beyond`);
        }
        return;
      }
      if (gaps > 0) {
        fail(`${where} must have all five numbers, low, q1, median, q3 and high, or none`);
      }
      const [low = 0, , , , high = 0] = five as number[];
      if (five.some((v) => !Number.isFinite(v))) {
        fail(`${where} cannot hold an infinite value`, RangeError);
      }
      if (five.some((v, k) => k > 0 && (v ?? 0) < (five[k - 1] ?? 0))) {
        fail(`${where} must have low ≤ q1 ≤ median ≤ q3 ≤ high`, RangeError);
      }
      if (extra.some((v) => !Number.isFinite(v))) {
        fail(`${where}'s outliers must be finite`, RangeError);
      }
      within(extra, `${where}'s outliers`);
      if (extra.some((v) => v >= low && v <= high)) {
        fail(
          `${where}'s outliers must lie beyond its whiskers, below low or above high`,
          RangeError,
        );
      }
    });
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
      if (arrange === "share" && list.length < 2) {
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
      if (arrange === "share" && list.length < 2) {
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
      const names = checkNames(mark["y"], what);
      const arrange = mark["arrange"];
      if (
        arrange !== undefined &&
        arrange !== "stack" &&
        arrange !== "group" &&
        arrange !== "share" &&
        arrange !== "split" &&
        arrange !== "diverge" &&
        arrange !== "mirror"
      ) {
        fail(`${what}.arrange must be "stack", "group", "share", "split", "diverge" or "mirror"`);
      }
      optional(mark["labels"], "boolean", `${what}.labels`);
      if (arrange === "share" && mark["labels"] !== undefined) {
        fail(`${what}.labels has no place under arrange "share", whose rows all reach 100%`);
      }
      if (arrange === "diverge" && mark["labels"] !== undefined) {
        fail(
          `${what}.labels has no place under arrange "diverge", whose bars run either side of 0`,
        );
      }
      const list = mark["series"];
      checkSeries(list, names.length, what, "x");
      if (arrange === "share" && list.length < 2) {
        fail(`${what}.arrange "share" needs two or more series, since one reads 100% everywhere`);
      }
      if (arrange === "mirror" && list.length !== 2) {
        fail(`${what}.arrange "mirror" needs exactly two series, one each side of its spine`);
      }
      checkDiverge(mark, arrange === "diverge", list.length, what);
      const all = Array.from(list);
      all.forEach((one, s) => {
        const at = `${what}.series[${String(s)}]`;
        checkSlot(one["below"], at, "below");
        if (one["below"] !== undefined && all.length > 1) {
          fail(`${at}.below has no place beside other series, whose slots tell them apart`);
        }
      });
      return;
    }
    case "point": {
      const list = mark["series"];
      checkSeries(list, checkNames(mark["y"], what).length, what, "x");
      const link = mark["link"];
      if (link !== undefined && link !== "range" && link !== "arrow") {
        fail(`${what}.link must be "range" or "arrow"`);
      }
      if (link !== undefined && list.length !== 2) {
        fail(`${what}.link "${link}" needs exactly two series, the two ends it joins`);
      }
      return;
    }
    case "slope": {
      const columns = mark["x"];
      if (
        !arrayLike(columns) ||
        columns.length !== 2 ||
        Array.from(columns).some((c) => typeof c !== "string")
      ) {
        fail(`${what}.x must name its two columns, left to right`);
      }
      const [from, to] = Array.from(columns);
      if (from === "" || to === "" || from === to) {
        fail(`${what}.x must name two different columns, never ""`, RangeError);
      }
      const list = mark["series"];
      checkSeries(list, 2, what);
      // The legend row, the readings and the table name a series by its name alone.
      const names = Array.from(list, (s) => s["name"]);
      if (names.some((n, k) => n === "" || names.indexOf(n) !== k)) {
        fail(`${what}.series must name each series once, never ""`, RangeError);
      }
      return;
    }
    case "scatter":
      checkScatter(mark, what);
      return;
    case "cell":
      checkCells(mark, what);
      return;
    case "box":
      checkBox(mark, what);
      return;
    case "rule": {
      const { x, y } = mark;
      if ((x === undefined) === (y === undefined)) {
        fail(`${what} must have exactly one of x and y`);
      }
      const value = x ?? y;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail(`${what}'s value must be a finite number`, RangeError);
      }
      within([value], `${what}'s value`);
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
        within([v], `${what}.${axis}`);
      }
      return;
    }
    default:
      fail(
        `${what}.mark must be "rect", "line", "area", "dot", "bar", "point", "slope", "scatter", "cell", "box", "rule" or "text"`,
      );
  }
}

/** Throws a `TypeError` or `RangeError` naming the first rule `spec` breaks. */
function check(spec: unknown): asserts spec is ChartSpec {
  if (!isObject(spec)) {
    fail("the spec must be an object");
  }
  if (spec["x"] !== undefined) {
    checkScale(spec["x"], "x");
  }
  if (spec["y"] !== undefined) {
    checkScale(spec["y"], "y");
  }
  if (spec["r"] !== undefined) {
    checkScale(spec["r"], "r");
  }
  const r = spec["r"];
  if (isObject(r)) {
    if (r["type"] !== undefined && r["type"] !== "linear") {
      fail('r.type must be "linear", since a bubble\'s area is proportional to its value');
    }
    for (const flag of ["zero", "mono", "reverse"]) {
      if (r[flag] !== undefined) {
        fail(`r.${flag} has no place on a size scale, which runs from 0 and draws no axis`);
      }
    }
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
        `marks[${String(m)}] is a second data mark beside marks[${String(data)}]; a chart holds one rect, line, area, dot, bar, point, slope, scatter, cell or box mark and any rules and text marks`,
      );
    }
    data = m;
  }
  const height = spec["height"];
  const primary = marks[data];
  if (isObject(primary) && primary["mark"] === "scatter") {
    const list = primary["series"];
    const sized = arrayLike(list) && isObject(list[0]) && list[0]["r"] !== undefined;
    for (const axis of sized ? ["x", "y", "r"] : ["x", "y"]) {
      const scale = spec[axis];
      const label = isObject(scale) ? scale["label"] : undefined;
      if (typeof label !== "string" || label === "") {
        fail(`${axis}.label is required on a scatter, whose readings name each measure by it`);
      }
      if (isObject(scale) && scale["unit"] !== undefined) {
        fail(
          `${axis}.unit has no place on a scatter, whose readings name each measure by its label; the mark's unit names the dots`,
        );
      }
    }
  }
  const cellChart = isObject(primary) && primary["mark"] === "cell";
  const calendar = cellChart && primary["days"] !== undefined;
  const binnedY = cellChart && isObject(primary["y"]) && !arrayLike(primary["y"]);
  const band =
    isObject(primary) &&
    (primary["mark"] === "dot" ||
      primary["mark"] === "bar" ||
      primary["mark"] === "point" ||
      primary["mark"] === "box" ||
      (cellChart && !binnedY));
  if (band && height !== undefined) {
    fail(
      calendar
        ? "height has no place on a calendar, which is as tall as its weeks"
        : `height has no place on a ${cellChart ? "cell chart of categories" : "dot, bar, point or box chart"}, which is as tall as its rows`,
    );
  }
  if (spec["colour"] !== undefined) {
    if (!(isObject(primary) && primary["mark"] === "cell")) {
      fail("colour has no place without a cell mark, whose classes it colours");
    }
    checkColour(spec["colour"]);
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

const pointSeries = (list: PointMark["series"]): PointSeriesModel[] =>
  list.map((s, i) => ({ name: s.name, slot: s.slot ?? i + 1, x: gaps(s.x, false) }));

const boxSeries = (list: BoxMark["series"]): BoxSeriesModel[] =>
  list.map((s, i) => ({
    name: s.name,
    slot: s.slot ?? i + 1,
    // The check holds a category's five all or none, so its low tells.
    boxes: Array.from(s.low, (low, r) =>
      low === null || Number.isNaN(low)
        ? null
        : {
            low,
            q1: s.q1[r] ?? low,
            median: s.median[r] ?? low,
            q3: s.q3[r] ?? low,
            high: s.high[r] ?? low,
          },
    ),
    outliers: Array.from(s.low, (_, r) => [...(s.outliers?.[r] ?? [])].sort((a, b) => a - b)),
  }));

// A dot outside a passed domain is not drawn, and with no position, or a
// bubble with no size, it is no stop.
function scatterModel(
  mark: ScatterMark,
  x: Continuous,
  y: Continuous,
  size: Size | undefined,
): ScatterModel {
  const series = mark.series.map((s, i) => ({
    name: s.name,
    slot: s.slot ?? i + 1,
    names: s.names,
    x: gaps(s.x, false),
    y: gaps(s.y, false),
    r: s.r === undefined ? undefined : gaps(s.r, false),
  }));
  const inside = (v: number | null | undefined, scale: Continuous): v is number =>
    v !== null && v !== undefined && v >= scale.lo && v <= scale.hi;
  const shown = series.map((s) =>
    s.names.flatMap((_, i) =>
      inside(s.x[i], x) && inside(s.y[i], y) && s.r?.[i] !== null ? [i] : [],
    ),
  );
  const drawn = shown.flatMap((dots, k) => dots.map((i) => ({ series: k, i })));
  if (size !== undefined) {
    // Array.prototype.sort is stable, so ties keep series, then the app's order.
    const r = (d: DotRef) => series[d.series]?.r?.[d.i] ?? 0;
    drawn.sort((a, b) => r(b) - r(a));
  }
  return { kind: "scatter", unit: mark.unit, series, shown, size, drawn };
}

/** One series with a value below 0: its bars run either side of the zero
 *  line, and every value not written as 0 carries its sign. */
const signedBar = (m: BarModel): boolean =>
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
              : first.arrange === "diverge"
                ? "divergingStackedBar"
                : first.arrange === "mirror"
                  ? "mirrorBar"
                  : "stackedBar";
    case "point":
      return first.link === "range"
        ? "rangePlot"
        : first.link === "arrow"
          ? "arrowPlot"
          : "dotPlot";
    case "slope":
      return "slope";
    case "scatter":
      return first.size === undefined ? "scatter" : "bubble";
    case "cell":
      return "edges" in first.x && "edges" in first.y ? "histogram2d" : "heatmap";
    case "calendar":
      return "calendar";
    case "box":
      return "box";
  }
}

function hasData(m: MarkModel, x: Continuous): boolean {
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
    case "point":
      return m.series.some((s) => s.x.some((v) => v !== null && v >= x.lo && v <= x.hi));
    case "slope":
      return m.series.some((s) => s.y.some((v) => v !== null));
    case "scatter":
      return m.shown.some((dots) => dots.length > 0);
    case "cell":
      return m.values.some((row) => row.some((v) => v !== null));
    case "calendar":
      return m.values.some((v) => v !== null);
    case "box":
      return m.series.some((s) => s.boxes.some((b) => b !== null));
    case "rule":
    case "text":
      return false;
  }
}

// A note's place in the data mark's terms: values on continuous scales, or
// on a band y a row's name. Under `ends`, the arrangement a bar chart's one
// x value would name a place in every panel or on both sides of, the note
// takes no x and sits at its row's end.
function textModel(
  m: Extract<Mark, { mark: "text" }>,
  what: string,
  x: Continuous,
  y: Continuous | Band,
  ends: string | undefined,
  columns: { readonly names: readonly string[]; readonly cell: boolean } | undefined,
  calendar: boolean,
): TextModel {
  const side = m.side ?? "above";
  if (calendar) {
    if (m.y !== undefined) {
      fail(`${what}.y has no place on a calendar; a note's x is an instant in its day`);
    }
    if (typeof m.x !== "number") {
      fail(`${what}.x must be a number on a calendar, an instant in its day`);
    }
    return { kind: "text", x: m.x, y: 0, row: false, text: m.text, side };
  }
  if (ends !== undefined && m.x !== undefined) {
    fail(`${what}.x has no place under arrange "${ends}"; the note sits at its row's end`);
  }
  // A slope's columns sit at x 0 and 1, so a note names its column by index
  // there; a cell chart's column c spans c to c + 1, so its note sits mid-column.
  const column = (v: number | string | undefined): number => {
    const of = columns?.cell === true ? "the cell chart's columns" : "the slope's two columns";
    if (v === undefined) {
      return fail(
        `${what}.x is missing; a note on ${columns?.cell === true ? "a cell chart names one of its columns" : "a slope names one of its two columns"}`,
      );
    }
    if (typeof v !== "string") {
      return fail(`${what}.x must name one of ${of}`);
    }
    const c = columns?.names.indexOf(v) ?? -1;
    if (c === -1) {
      return fail(`${what}.x names no column: "${v}"`, RangeError);
    }
    return columns?.cell === true ? c + 0.5 : c;
  };
  const place = (v: number | string | undefined, axis: "x" | "y", scale: Continuous | Band) => {
    if (v === undefined) {
      return fail(
        `${what}.${axis} is missing; a note needs ${ends === undefined ? "an x and a y" : "a y naming its row"} on this chart`,
      );
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
    x: columns !== undefined ? column(m.x) : ends === undefined ? place(m.x, "x", x) : undefined,
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
  const x = xScale(spec, timeZone);
  const y = yScale(spec);
  const size = rScale(spec);
  const ends = spec.marks
    .map((m) => (m.mark === "bar" ? m.arrange : undefined))
    .find((a) => a === "split" || a === "diverge" || a === "mirror");
  const columns = spec.marks.find((m) => m.mark === "slope")?.x;
  const cellMark = spec.marks.find((m): m is CellMark => m.mark === "cell" && !("days" in m));
  const calendar = spec.marks.some((m) => m.mark === "cell" && "days" in m);
  const cellNames = cellMark === undefined || "edges" in cellMark.x ? undefined : cellMark.x;
  // The values a cell chart's inferred classes span.
  const filled = (m: CellMark): number[] =>
    m.values.flatMap((row) =>
      Array.from(row).flatMap((v) => (v === null || Number.isNaN(v) ? [] : [v])),
    );
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
            m.arrange === "diverge" ||
            m.arrange === "mirror" ||
            ((m.arrange === "group" || m.arrange === "split") && m.series.length > 1)
              ? m.arrange
              : "stack",
          left: m.arrange === "diverge" ? (m.left ?? 0) : 0,
          centre: m.arrange === "diverge" && m.centre === true,
          labels: m.arrange !== "share" && m.arrange !== "diverge" && m.labels !== false,
          series: barSeries(m.series),
        };
      case "point":
        return { kind: "point", link: m.link, series: pointSeries(m.series) };
      case "box":
        return { kind: "box", whiskers: m.whiskers, series: boxSeries(m.series) };
      case "slope":
        return { kind: "slope", columns: m.x, series: series(m.series) };
      case "scatter":
        // A band y throws in yScale without band rows, so y is continuous.
        return scatterModel(m, x, y as Continuous, size);
      case "cell":
        if ("days" in m) {
          const values = gaps(m.days.values, false);
          return {
            kind: "calendar",
            day: localDay(m.days.start, timeZone),
            values,
            open: m.days.open === true,
            weekStart: m.weekStart ?? weekStartOf(locale),
            classes: classes(
              spec.colour ?? {},
              values.filter((v) => v !== null),
            ),
          };
        }
        return {
          kind: "cell",
          x: "edges" in m.x ? { edges: m.x.edges } : { names: m.x },
          y: "edges" in m.y ? { edges: m.y.edges } : { names: m.y },
          values: m.values.map((row) => gaps(row, false)),
          classes: classes(spec.colour ?? {}, filled(m)),
        };
      case "rule": {
        const axis = m.x === undefined ? "y" : "x";
        const value = m.x ?? m.y ?? 0;
        const scale = axis === "x" ? x : y;
        // A y rule on a band throws in yScale, so its scale is continuous.
        const place = scale.type === "band" ? { at: value } : ruleAt(scale, value);
        // A diverging axis draws a rule either side of 0, so it is off only
        // where both its lines are.
        const either = axis === "x" && x.absolute && "off" in place && "at" in ruleAt(x, -value);
        return { kind: "rule", axis, value, label: m.label, place: either ? { at: value } : place };
      }
      case "text":
        return textModel(
          m,
          `marks[${String(index)}]`,
          x,
          y,
          ends,
          columns === undefined
            ? cellNames === undefined
              ? undefined
              : { names: cellNames, cell: true }
            : { names: columns, cell: false },
          calendar,
        );
    }
  });
  // The ends of a domain a whole day long can share their clock time, so they
  // need their dates ("Nov 10, 2:00 PM to Nov 11, 2:00 PM").
  const days = x.type === "time" && spansDay(x.lo, x.hi, timeZone);
  const signed = marks.some((m) => m.kind === "bar" && signedBar(m));
  const slope = marks.find((m) => m.kind === "slope");
  const cellX = marks.find((m) => m.kind === "cell")?.x;
  const named =
    slope?.columns ?? (cellX !== undefined && "names" in cellX ? cellX.names : undefined);
  const dateText = dayFormat(locale, { dateStyle: "full" });
  const xText =
    named !== undefined
      ? (v: number) => named[Math.floor(v)] ?? ""
      : calendar
        ? (v: number) => dateText(localDay(v, timeZone))
        : x.type === "time"
          ? instantFormat(locale, timeZone, days)
          : writer(x.format, locale, { signed });
  const xSpan =
    x.type === "time" && !calendar
      ? spanFormat(locale, timeZone, days)
      : (from: number, to: number) => [xText(from), xText(to)] as const;
  const yText = writer(y.type === "band" ? undefined : y.format, locale);
  const rText = writer(size?.format, locale);
  const colourText = writer(spec.colour?.format, locale);
  const share = marks.some(
    (m) => (m.kind === "rect" || m.kind === "area" || m.kind === "bar") && m.arrange === "share",
  );
  const bars = marks.some((m) => m.kind === "bar" || m.kind === "point" || m.kind === "box");
  const xKey = named !== undefined || x.type === "time" ? undefined : widthKey(x.format, locale);
  const yKey = y.type === "band" ? undefined : widthKey(y.format, locale);
  return {
    spec,
    x,
    y,
    marks,
    kind: kindOf(marks, x),
    empty: !marks.some((m) => hasData(m, x)),
    xText,
    xSpan,
    yText,
    rText,
    colourText,
    dateText,
    amountText: share ? writer("number", locale) : bars ? xText : yText,
    widthKeys: {
      x: xKey,
      y: yKey,
      r: widthKey(size?.format, locale),
      amount: share ? widthKey("number", locale) : bars ? xKey : yKey,
      colour: widthKey(spec.colour?.format, locale),
    },
    locale,
    timeZone,
  };
}
