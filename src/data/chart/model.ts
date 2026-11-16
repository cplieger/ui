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
  type Reach,
  type Span,
  type Unit,
  type WidthKey,
} from "../scale/format.js";
import { position } from "../scale/position.js";
import { lowerBound, upperBound } from "../scale/reduce.js";
import { localDay, localYear, spansDay, type Grain } from "../scale/time.js";

import { dayFormat, weekCount, weekRow, weekStartOf } from "./calendar.js";
import { classes, type Classes } from "./classes.js";
import { shareWriter } from "./pie.js";
import {
  LIMIT,
  rScale,
  ruleAt,
  isCalendar,
  timeGrain,
  withinDate,
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
  PieMark,
  PointMark,
  RectMark,
  ScatterMark,
  TreeMark,
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
  | "box"
  | "pie"
  | "donut"
  | "treemap";

export interface SeriesModel {
  readonly name: string;
  readonly slot: number;
  /** Every value, a gap (`null` or `NaN`) as `null`. */
  readonly y: readonly (number | null)[];
}

export interface RectModel {
  readonly kind: "rect";
  readonly x1: readonly number[];
  readonly x2: readonly number[];
  readonly open: boolean;
  /** "group" sets two or more series side by side in each bucket; one
   *  series grouped is a plain column, so it reads "stack". "share" draws
   *  each series' share of its bucket's total; `series` keeps the values. */
  readonly arrange: "stack" | "group" | "share";
  readonly shape: "bars" | "area";
  readonly series: readonly SeriesModel[];
  /** Each bucket's sum, found once so a reading per series costs no pass
   *  over the others; read through `bucketTotal`. */
  readonly totals: readonly number[];
  /** The buckets drawn, read and listed: every one not wholly outside the domain. */
  readonly shown: readonly number[];
}

/** The sum of bucket `i`'s values, a `null` as 0. */
export const bucketTotal = (m: RectModel, i: number): number => m.totals[i] ?? 0;

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
  readonly x: readonly number[];
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
  /** Each sample's stack top, found once so a reading per series costs no
   *  pass over the others; read through `sampleTotal`. */
  readonly totals: readonly (number | null)[];
}

/** A mark over `x` samples, read by the same stops and keys. */
export type SampleModel = LineModel | AreaModel;

const isStop = (m: SampleModel, i: number): boolean =>
  i === m.from || i === m.to - 1 || m.series.some((s) => s.y[i] !== s.y[i - 1]);

/** The samples a step line's table lists and its keys stop at: the first
 *  and last inside the domain, and each where any series changes value or
 *  turns to or from a gap. */
export function stepStops(m: SampleModel): number[] {
  const out: number[] = [];
  for (let i = m.from; i < m.to; i++) {
    if (isStop(m, i)) {
      out.push(i);
    }
  }
  return out;
}

/** The stop holding sample `i` of a step line inside its domain: the last of
 *  `stepStops` at or before it. */
export function stepStopAt(m: SampleModel, i: number): number {
  let k = i;
  while (k > m.from && !isStop(m, k)) {
    k--;
  }
  return k;
}

/** The stack's top at sample `i` of `m`, or `null` where any series is a
 *  gap, which breaks every layer there. */
export const sampleTotal = (m: AreaModel, i: number): number | null => m.totals[i] ?? null;

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
  readonly x: readonly number[];
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
export const barsApart = (m: { readonly arrange?: string | undefined }): boolean =>
  m.arrange === "group" || m.arrange === "split";

/** The sub-rows each row of a bar or box mark takes across the band: a
 *  series each where its bars stand apart or it holds boxes, else one. */
export const subRows = (m: {
  readonly kind: "bar" | "box";
  readonly arrange?: string | undefined;
  readonly series: readonly unknown[];
}): number => (m.kind === "box" || barsApart(m) ? m.series.length : 1);

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

/** The length each series draws in row `i`, in series order, a `null` as
 *  0: under "share" its share of the row's total, 0 when the total is,
 *  else its value. */
export function barLengths(m: BarModel, i: number): number[] {
  const values = m.series.map((s) => s.x[i] ?? 0);
  if (m.arrange !== "share") {
    return values;
  }
  const total = barTotal(m, i) ?? 0;
  return values.map((v) => (total > 0 ? v / total : 0));
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
  /** The drawn dot at each x, then y: the last drawn among coincident dots. */
  readonly at: ReadonlyMap<number, ReadonlyMap<number, DotRef>>;
}

/** The shown dot of `m` whose values are `x` and `y`, the one drawn on top
 *  among coincident dots. Undefined when no shown dot has both. */
export function scatterDotAt(m: ScatterModel, x: number, y: number): DotRef | undefined {
  return m.at.get(x)?.get(y);
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

interface SliceModel {
  readonly name: string;
  readonly slot: number;
  /** Its value, a gap (`null` or `NaN`) as `null`. */
  readonly value: number | null;
}

/** Slices of one whole, clockwise from 12 o'clock in the app's order. */
export interface PieModel {
  readonly kind: "pie";
  /** A donut, its total in the hole. */
  readonly hole: boolean;
  readonly unit: Unit | undefined;
  readonly slices: readonly SliceModel[];
  /** The sum of the values, in slice order. */
  readonly total: number;
}

interface TreePartModel {
  readonly name: string;
  readonly slot: number;
  /** Its value, a gap (`null` or `NaN`) as `null`. */
  readonly value: number | null;
  /** Its group's index, -1 with one level. */
  readonly group: number;
}

interface TreeGroupModel {
  readonly name: string;
  readonly slot: number;
  /** The sum of its parts' values. */
  readonly value: number;
  /** Its parts are `parts[first]` to `parts[first + count - 1]`. */
  readonly first: number;
  readonly count: number;
}

/** A treemap's whole: its groups, none with one level, and every part in
 *  the app's order, each group's parts together. */
export interface TreeModel {
  readonly kind: "tree";
  readonly unit: Unit | undefined;
  readonly groups: readonly TreeGroupModel[];
  readonly parts: readonly TreePartModel[];
  /** The sum of the values, in part order. */
  readonly total: number;
}

const DAY = 86_400_000;

// A calendar writes every day of its weeks, its weekday names and its
// table's empty places included, from the first week's start to the last
// week's end; each is a UTC date written through Intl.
function withinWeeks(day: number, weekStart: number, days: number, most: Room): void {
  const first = day - weekRow(day, weekStart);
  const weeks = Math.max(1, weekCount(day - first, days));
  if (weeks > most.rows) {
    fail(`the days of a calendar must fit in ${String(most.rows)} weeks${most.each}`, RangeError);
  }
  const last = first + 7 * weeks - 1;
  withinDate(first * DAY, "the days of a calendar's first week");
  withinDate(last * DAY, "the days of a calendar's last week");
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
  | PieModel
  | TreeModel
  | RuleModel
  | TextModel;

/** A mark drawing the chart's data, every mark but a rule or a note. */
type DataModel = Exclude<MarkModel, RuleModel | TextModel>;

/** Small multiples: a model per panel, on the chart's scales. */
export interface FacetsModel {
  readonly unit: Unit | undefined;
  readonly context: boolean;
  readonly panels: readonly { readonly name: string; readonly model: Model }[];
}

export interface Model {
  readonly spec: ChartSpec;
  readonly x: Continuous;
  readonly y: Continuous | Band;
  /** In the spec's order. */
  readonly marks: readonly MarkModel[];
  /** The first data mark in `marks`, the one the legend, keys and readings
   *  read; absent with rules and notes alone. */
  readonly primary: DataModel | undefined;
  /** The data mark's kind; absent with rules alone. */
  readonly kind: Kind | undefined;
  /** Nothing to draw: every value null, every row empty, every rect 0, no
   *  point inside the domain, or every area sample 0 or a gap. */
  readonly empty: boolean;
  /** An x value as the readings and the table write it; on a slope or a
   *  cell chart of categories a column's index as its name. */
  readonly xText: (v: number) => string;
  /** A span of x as `spanFormat` writes it; `open` for a bucket's. */
  readonly xSpan: (from: number, to: number, open?: boolean) => Span;
  /** The calendar unit a time x's instants are written at (`timeGrain`). */
  readonly grain: Grain;
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
   *  bar, point or box chart, else `yText`), a pie's or a tree's own
   *  format, or a plain number under "share", whose axis writes shares. */
  readonly amountText: (v: number) => string;
  /** A share of a whole, a pie's slice's or a tree's part's (`shareWriter`). */
  readonly shareText: (v: number) => string;
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
  /** Under `facets`, the panels; the rest of the model is the first panel's,
   *  `spec` and `empty` aside, which are the chart's. */
  readonly facets?: FacetsModel;
}

// No reader scans a plot past a thousand rows: the most rows a plot holds, a
// binned y's included, the most weeks a calendar holds and the most series a
// slope names at each end, a line each.
const MOST_ROWS = 1_000;

// Datawrapper's advice is to show fewer panels than first planned; past this
// many no reader compares them, and the grid would scroll for screens.
const MOST_PANELS = 100;

// A thousand of the y axis's 40px tick spaces, so a plot draws at most
// about a thousand y ticks.
const MOST_HEIGHT = 40_000;

// A box's sub-row is 16px and a grouped bar's 13px at the default text size,
// so this many keep a band plot's sub-rows within MOST_HEIGHT there, its
// rows' own spacing aside.
const MOST_SUB_ROWS = MOST_HEIGHT / 16;

/** A plot's ceilings: the figure's, shared out evenly among its panels,
 *  since each panel draws a plot of its own. */
interface Room {
  readonly rows: number;
  readonly subRows: number;
  readonly height: number;
  /** What an error adds after a ceiling: "" for a lone plot. */
  readonly each: string;
}

function room(panels: number): Room {
  return {
    rows: Math.floor(MOST_ROWS / panels),
    subRows: Math.floor(MOST_SUB_ROWS / panels),
    height: Math.floor(MOST_HEIGHT / panels),
    each: panels > 1 ? ` in each of ${String(panels)} panels` : "",
  };
}

const ALONE = room(1);

function checkSubRows(rows: number, across: number, what: string, most: Room): void {
  if (rows * across > most.subRows) {
    fail(
      `${what}.series must take at most ${String(most.subRows)} sub-rows${most.each}, a sub-row per series in each row, since the plot is as tall as its rows`,
      RangeError,
    );
  }
}

/** The thinnest of `edges`' bins, as a share of the axis from the first
 *  edge to the last on a `type` scale. */
export function thinnestBin(type: "linear" | "log" | "time", edges: readonly number[]): number {
  const at = position(type, edges[0] ?? 0, edges.at(-1) ?? 1, 0, 1);
  let least = 1;
  for (let i = 1; i < edges.length; i++) {
    least = Math.min(least, at(edges[i] ?? 0) - at(edges[i - 1] ?? 0));
  }
  return least;
}

const SCALE_TYPES = new Set(["linear", "log", "time", "band"]);
const FORMATS = new Set(["number", "integer", "percent", "duration"]);
const SIDES = new Set(["above", "below", "left", "right"]);

function fail(message: string, type: ErrorConstructor = TypeError): never {
  throw new type(`renderChart: ${message}`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isArray = (v: unknown): v is readonly unknown[] => Array.isArray(v);

const anyBut = (list: readonly unknown[], ok: (v: unknown) => boolean): boolean =>
  list.some((v) => !ok(v));

function optional(v: unknown, type: "string" | "boolean" | "number", what: string): void {
  if (v !== undefined && typeof v !== type) {
    fail(`${what} must be a ${type}`);
  }
}

// Intl.PluralRules selects only these (Intl.LDMLPluralRule).
const PLURALS = new Set(["zero", "one", "two", "few", "many", "other"]);

function checkUnit(unit: unknown, what: string): void {
  if (unit === undefined) {
    return;
  }
  if (!(isObject(unit) && typeof unit["other"] === "string")) {
    fail(`${what}.unit must name its "other" form`);
  }
  for (const [key, v] of Object.entries(unit)) {
    if (!PLURALS.has(key)) {
      fail(
        `${what}.unit.${key} is no plural form; a unit takes zero, one, two, few, many and other`,
      );
    }
    optional(v, "string", `${what}.unit.${key}`);
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
  if (isObject(format)) {
    for (const [key, v] of Object.entries(format)) {
      if (
        v !== undefined &&
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean"
      ) {
        fail(`${what}.format.${key} must be a string, a number or a boolean`);
      }
    }
    // Intl names a bad option ("unit", "signDisplay") only once it builds the
    // format: a RangeError for a value it lacks, a TypeError for a missing one.
    try {
      writer(format, undefined);
    } catch (e) {
      fail(
        `${what}.format holds options Intl refuses: ${(e as Error).message}`,
        e instanceof TypeError ? TypeError : RangeError,
      );
    }
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
  if (domain !== undefined && !(isArray(domain) && domain.length === 2)) {
    fail(`${what}.domain must be an array of a low and a high`);
  }
  if (isArray(domain)) {
    if (anyBut(domain, (v) => typeof v === "number")) {
      fail(`${what}.domain must be two numbers`);
    }
    within(domain, `${what}.domain`);
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
    if (!isArray(thresholds) || anyBut(thresholds, (t) => typeof t === "number")) {
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
    const list = thresholds as readonly number[];
    if (list.length < 1 || list.length > 8) {
      fail("colour.thresholds must hold one to eight boundaries, for 2 to 9 classes", RangeError);
    }
    if (list.some((t, k) => !Number.isFinite(t) || (k > 0 && t <= (list[k - 1] ?? 0)))) {
      fail("colour.thresholds must be finite and strictly increase", RangeError);
    }
    within(list, "colour.thresholds");
  }
  if (isArray(domain)) {
    const [lo, hi] = domain as readonly [number, number];
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
function checkX(values: unknown, what: string, ties: boolean): readonly number[] {
  if (!isArray(values)) {
    fail(`${what} must be an array of numbers`);
  }
  let before = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      fail(`${what} must hold finite numbers`, RangeError);
    }
    if (ties ? v < before : v <= before) {
      fail(`${what} must ${ties ? "never decrease" : "strictly increase"}`, RangeError);
    }
    before = v;
  }
  within(values, what);
  return values as readonly number[];
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
  if (!isArray(values)) {
    fail(`${of} must be an array of numbers`);
  }
  if (values.length !== length) {
    fail(`${of} must be as long as its ${against}`);
  }
  if (anyBut(values, (v) => v === null || typeof v === "number")) {
    fail(`${of} must hold numbers or null`);
  }
  within(values, of);
}

function checkSeries(
  series: unknown,
  length: number,
  what: string,
  channel = "y",
): asserts series is readonly Record<string, unknown>[] {
  if (!isArray(series)) {
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
  if (!isArray(list)) {
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
    if (!isArray(names) || anyBut(names, (n) => typeof n === "string")) {
      fail(`${at}.names must be an array of the dots' names`);
    }
    for (const name of names) {
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
function checkNames(names: unknown, what: string, axis: "x" | "y", most: Room): readonly string[] {
  if (!isArray(names) || anyBut(names, (n) => typeof n === "string")) {
    fail(`${what}.${axis} must be an array of the categories' names`);
  }
  if (axis === "y" && names.length > most.rows) {
    fail(`${what}.y must name at most ${String(most.rows)} rows${most.each}`, RangeError);
  }
  const seen = new Set<unknown>();
  for (const name of names) {
    if (name === "" || seen.has(name)) {
      fail(`${what}.${axis} must name each category once, never ""`, RangeError);
    }
    seen.add(name);
  }
  return names as readonly string[];
}

// A cell axis names its categories or gives its bins' edges; returns its
// column or row count.
function checkCellAxis(axis: unknown, what: string, name: "x" | "y", most: Room): number {
  if (!isObject(axis)) {
    fail(`${what}.${name} must name its categories or give its bins' edges`);
  }
  if (isArray(axis)) {
    return checkNames(axis, what, name, most).length;
  }
  const edges = axis["edges"];
  if (!isArray(edges) || anyBut(edges, (e) => typeof e === "number")) {
    fail(`${what}.${name}.edges must be an array of numbers`);
  }
  const list = edges as readonly number[];
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
  if (!isArray(values) || anyBut(values, (v) => v === null || typeof v === "number")) {
    fail(`${what}.days.values must be an array of numbers or null`);
  }
  if (values.some((v) => v === Number.POSITIVE_INFINITY || v === Number.NEGATIVE_INFINITY)) {
    fail(`${what}.days.values cannot hold an infinite value`, RangeError);
  }
  within(values, `${what}.days.values`);
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

function checkCells(mark: Record<string, unknown>, what: string, most: Room): void {
  if (mark["days"] !== undefined) {
    checkDays(mark, what);
    return;
  }
  if (mark["weekStart"] !== undefined) {
    fail(`${what}.weekStart has no place without days, which it lays out in weeks`);
  }
  const columns = checkCellAxis(mark["x"], what, "x", most);
  const rows = checkCellAxis(mark["y"], what, "y", most);
  const values = mark["values"];
  if (!isArray(values) || values.length !== rows) {
    fail(`${what}.values must hold one row per y entry`);
  }
  for (let r = 0; r < rows; r++) {
    const row = values[r];
    const at = `${what}.values[${String(r)}]`;
    checkValues(row, columns, at, "x");
    if (
      (row as readonly unknown[]).some(
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
function checkBox(mark: Record<string, unknown>, what: string, most: Room): void {
  const names = checkNames(mark["y"], what, "y", most);
  const whiskers = mark["whiskers"];
  if (whiskers !== undefined && !(typeof whiskers === "string" && whiskers.trim() !== "")) {
    fail(`${what}.whiskers must be a non-empty string naming the whiskers' convention`);
  }
  const list = mark["series"];
  if (!isArray(list)) {
    fail(`${what}.series must be an array`);
  }
  checkSubRows(names.length, subRows({ kind: "box", series: list }), what, most);
  for (let s = 0; s < list.length; s++) {
    const one = list[s];
    const at = `${what}.series[${String(s)}]`;
    checkSeriesHead(one, s, at);
    for (const field of FIVE) {
      checkValues(one[field], names.length, `${at}.${field}`, "y");
    }
    const outliers = one["outliers"];
    if (outliers !== undefined && !(isArray(outliers) && outliers.length === names.length)) {
      fail(`${at}.outliers must hold an array of numbers per category`);
    }
    names.forEach((name, i) => {
      const where = `${at} at "${name}"`;
      const listed = outliers === undefined ? [] : outliers[i];
      if (!isArray(listed) || anyBut(listed, (v) => typeof v === "number")) {
        fail(`${at}.outliers[${String(i)}] must be an array of numbers`);
      }
      const extra = listed as readonly number[];
      const five = FIVE.map((field) => (one[field] as readonly (number | null)[])[i] ?? null);
      const gaps = five.filter((v) => v === null || Number.isNaN(v)).length;
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

// The legend row, the readings and the table name a slice by its name
// alone, and a share needs a whole of values of 0 or more.
function checkPie(mark: Record<string, unknown>, what: string): void {
  optional(mark["hole"], "boolean", `${what}.hole`);
  checkUnit(mark["unit"], what);
  checkFormat(mark["format"], what);
  const list = mark["slices"];
  if (!isArray(list)) {
    fail(`${what}.slices must be an array`);
  }
  const seen = new Set<unknown>();
  for (let s = 0; s < list.length; s++) {
    const one = list[s];
    const at = `${what}.slices[${String(s)}]`;
    checkSeriesHead(one, s, at);
    const { name, value } = one;
    if (name === "" || seen.has(name)) {
      fail(`${what}.slices must name each slice once, never ""`, RangeError);
    }
    seen.add(name);
    checkPart(value, at, "a slice");
  }
}

// A part's value, of a pie's slice or a tree's part: 0 or more, or no data.
function checkPart(value: unknown, at: string, of: string): void {
  if (value !== null && typeof value !== "number") {
    fail(`${at}.value must be a number or null`);
  }
  if (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY) {
    fail(`${at}.value cannot be infinite`, RangeError);
  }
  if (typeof value === "number" && value < 0) {
    fail(`${at}.value cannot be negative; ${of} is a part of the whole`, RangeError);
  }
  within([value], `${at}.value`);
}

// Siblings' names tell them apart in the legend row, the readings and the
// table; two groups may each hold an "Other".
function checkSiblings(list: readonly unknown[], what: string, of: string): void {
  const seen = new Set<unknown>();
  for (let k = 0; k < list.length; k++) {
    const one = list[k];
    if (!isObject(one) || typeof one["name"] !== "string") {
      fail(`${what}[${String(k)}] must have a name`);
    }
    const name = one["name"];
    if (name === "" || seen.has(name)) {
      fail(`${what} must name each ${of} once, never ""`, RangeError);
    }
    seen.add(name);
  }
}

function checkTree(mark: Record<string, unknown>, what: string): void {
  checkUnit(mark["unit"], what);
  checkFormat(mark["format"], what);
  checkSlot(mark["slot"], what);
  const nodes = mark["nodes"];
  if (!isArray(nodes)) {
    fail(`${what}.nodes must be an array`);
  }
  checkSiblings(nodes, `${what}.nodes`, "node");
  const grouped = isObject(nodes[0]) && nodes[0]["children"] !== undefined;
  if (grouped && mark["slot"] !== undefined) {
    fail(`${what}.slot has no place beside groups, which take a slot each`);
  }
  for (let k = 0; k < nodes.length; k++) {
    const node = nodes[k] as Record<string, unknown>;
    const at = `${what}.nodes[${String(k)}]`;
    const children = node["children"];
    if ((children !== undefined) === (node["value"] !== undefined)) {
      fail(`${at} must hold a value or children, not both or neither`);
    }
    if ((children !== undefined) !== grouped) {
      fail(`${what}.nodes must be all parts or all groups`);
    }
    if (children === undefined) {
      checkSlot(node["slot"], at);
      checkPart(node["value"], at, "a part");
      continue;
    }
    checkSeriesHead(node, k, at);
    if (!isArray(children)) {
      fail(`${at}.children must be an array`);
    }
    if (children.length === 0) {
      fail(`${at}.children must hold a part`);
    }
    checkSiblings(children, `${at}.children`, "part");
    for (let c = 0; c < children.length; c++) {
      const part = children[c] as Record<string, unknown>;
      const on = `${at}.children[${String(c)}]`;
      if (part["children"] !== undefined) {
        fail(`${on} cannot hold children; a tree has two levels at most`);
      }
      if (part["value"] === undefined) {
        fail(`${on} must hold a value`);
      }
      if (part["slot"] !== undefined) {
        fail(`${on}.slot has no place inside a group, whose slot its parts take`);
      }
      checkPart(part["value"], on, "a part");
    }
  }
}

function checkCurve(curve: unknown, what: string): void {
  if (curve !== undefined && curve !== "linear" && curve !== "step") {
    fail(`${what}.curve must be "linear" or "step"`);
  }
}

function checkMark(mark: unknown, what: string, most: Room): void {
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
      if (!isArray(rows)) {
        fail(`${what}.rows must be an array`);
      }
      if (rows.length > MOST_ROWS) {
        fail(`${what}.rows must hold at most ${String(MOST_ROWS)} rows`, RangeError);
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
      const names = checkNames(mark["y"], what, "y", most);
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
      checkSubRows(names.length, subRows({ kind: "bar", arrange, series: list }), what, most);
      list.forEach((one, s) => {
        const at = `${what}.series[${String(s)}]`;
        checkSlot(one["below"], at, "below");
        if (one["below"] !== undefined && list.length > 1) {
          fail(`${at}.below has no place beside other series, whose slots tell them apart`);
        }
      });
      return;
    }
    case "point": {
      const list = mark["series"];
      checkSeries(list, checkNames(mark["y"], what, "y", most).length, what, "x");
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
        !isArray(columns) ||
        columns.length !== 2 ||
        anyBut(columns, (c) => typeof c === "string")
      ) {
        fail(`${what}.x must name its two columns, left to right`);
      }
      const [from, to] = columns;
      if (from === "" || to === "" || from === to) {
        fail(`${what}.x must name two different columns, never ""`, RangeError);
      }
      const list = mark["series"];
      if (isArray(list) && list.length > MOST_ROWS) {
        fail(
          `${what}.series must hold at most ${String(MOST_ROWS)} series, since each end names every series on a line of its own`,
          RangeError,
        );
      }
      checkSeries(list, 2, what);
      // The legend row, the readings and the table name a series by its name alone.
      const names = list.map((s) => s["name"]);
      if (names.some((n, k) => n === "" || names.indexOf(n) !== k)) {
        fail(`${what}.series must name each series once, never ""`, RangeError);
      }
      return;
    }
    case "scatter":
      checkScatter(mark, what);
      return;
    case "cell":
      checkCells(mark, what, most);
      return;
    case "box":
      checkBox(mark, what, most);
      return;
    case "pie":
      checkPie(mark, what);
      return;
    case "tree":
      checkTree(mark, what);
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
        `${what}.mark must be "rect", "line", "area", "dot", "bar", "point", "slope", "scatter", "cell", "box", "pie", "tree", "rule" or "text"`,
      );
  }
}

// Every instant a time x places is written through Intl, so each is held to
// what Date holds by its own field, whatever the domain.
function checkInstants(
  spec: Record<string, unknown>,
  marks: readonly unknown[],
  names: readonly string[],
): void {
  const x = spec["x"];
  if (!isObject(x) || x["type"] !== "time") {
    return;
  }
  const each = (values: unknown, what: string): void => {
    if (!isArray(values)) {
      return;
    }
    values.forEach((v, i) => {
      if (typeof v === "number" && Number.isFinite(v)) {
        withinDate(v, `${what}[${String(i)}]`);
      }
    });
  };
  each(x["domain"], "x.domain");
  for (let m = 0; m < marks.length; m++) {
    const mark = marks[m] as Record<string, unknown>;
    const what = names[m] ?? "";
    switch (mark["mark"]) {
      case "rect":
        each(mark["x1"], `${what}.x1`);
        each(mark["x2"], `${what}.x2`);
        break;
      case "line":
      case "area":
        each(mark["x"], `${what}.x`);
        break;
      case "dot":
        (mark["rows"] as readonly Record<string, unknown>[]).forEach((row, r) => {
          each(row["x"], `${what}.rows[${String(r)}].x`);
        });
        break;
      case "point":
        (mark["series"] as readonly Record<string, unknown>[]).forEach((one, s) => {
          each(one["x"], `${what}.series[${String(s)}].x`);
        });
        break;
      case "cell": {
        const axis = mark["x"];
        if (isObject(axis) && !isArray(axis)) {
          each(axis["edges"], `${what}.x.edges`);
        }
        break;
      }
      case "rule":
      case "text":
        if (typeof mark["x"] === "number") {
          withinDate(mark["x"], `${what}.x`);
        }
        break;
      default:
        break;
    }
  }
}

// About seven series of a minute's samples over 90 days, the largest data a
// chart is designed for; past it the readings and the table grow without end.
const MOST_VALUES = 1_000_000;

interface List {
  readonly each?: (v: unknown, i: number, length: number) => unknown;
  readonly most?: number;
  readonly why?: string;
  readonly charge?: (length: number) => number;
}

interface Door {
  /** A copy of `v` read by index, each entry through `each`, when it is an
   *  array; `v` itself otherwise, for its field's check to refuse. An array
   *  whose one length read is not a whole number from 0 to `most` is the
   *  `RangeError` naming `field`; `charge` of that length is added to the
   *  values count before the first entry is read. */
  readonly list: (v: unknown, field: string, options?: List) => unknown;
  readonly add: (n: number, field: string) => void;
}

const size = (copy: unknown): number => (isArray(copy) ? copy.length : 0);

const ALL: List = { charge: (length) => length };

// A series, timeline row or cell row is one value at least, so every legend
// chip and row name is counted too.
const ONE_AT_LEAST: List = { charge: (length) => Math.max(1, length) };

// What a list holds past the `n` values charged for it elsewhere.
const past = (n: number): List => ({ charge: (length) => Math.max(0, length - n) });

// `names` of `v`, each read once, in an object of the chart's own.
function fields(v: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    const field = v[name];
    if (field !== undefined) {
      out[name] = field;
    }
  }
  return out;
}

function put(copy: Record<string, unknown>, key: string, to: (v: unknown) => unknown): void {
  if (copy[key] !== undefined) {
    copy[key] = to(copy[key]);
  }
}

// A unit's forms or a format's Intl options, which their checks read as entries.
const entries = (v: unknown): unknown => (isObject(v) ? Object.fromEntries(Object.entries(v)) : v);

const SCALE = ["type", "label", "unit", "domain", "zero", "format", "mono", "reverse"];
const COLOUR = [
  "type",
  "steps",
  "domain",
  "thresholds",
  "pivot",
  "reverse",
  "label",
  "unit",
  "format",
];
const PART = ["name", "slot", "value", "children"];

// Each mark's fields and its series', by its kind: what spec.ts documents.
const MARKS = new Map<string, readonly (readonly string[])[]>([
  [
    "rect",
    [
      ["x1", "x2", "open", "arrange", "shape", "series"],
      ["name", "slot", "y"],
    ],
  ],
  [
    "line",
    [
      ["x", "curve", "series"],
      ["name", "slot", "y"],
    ],
  ],
  [
    "area",
    [
      ["x", "curve", "arrange", "series"],
      ["name", "slot", "y"],
    ],
  ],
  ["dot", [["slot", "unit", "rows"]]],
  [
    "bar",
    [
      ["y", "arrange", "left", "centre", "labels", "series"],
      ["name", "slot", "below", "x"],
    ],
  ],
  [
    "point",
    [
      ["y", "link", "series"],
      ["name", "slot", "x"],
    ],
  ],
  [
    "slope",
    [
      ["x", "series"],
      ["name", "slot", "y"],
    ],
  ],
  [
    "scatter",
    [
      ["unit", "series"],
      ["name", "slot", "names", "x", "y", "r"],
    ],
  ],
  ["cell", [["days", "weekStart", "x", "y", "values"]]],
  [
    "box",
    [
      ["y", "whiskers", "series"],
      ["name", "slot", ...FIVE, "outliers"],
    ],
  ],
  ["pie", [["hole", "unit", "format", "slices"]]],
  ["tree", [["slot", "unit", "format", "nodes"]]],
  ["rule", [["x", "y", "label"]]],
  ["text", [["x", "y", "text", "side"]]],
]);

// A cell axis's columns or rows: its names, or its bins between its edges.
// `covered` of them are charged elsewhere, and the axis charges the rest.
function copyAxis(
  m: Record<string, unknown>,
  key: "x" | "y",
  what: string,
  door: Door,
  covered = Number.POSITIVE_INFINITY,
): number {
  const axis = m[key];
  const field = `${what}.${key}`;
  if (isArray(axis)) {
    m[key] = door.list(axis, field, past(covered));
    return size(m[key]);
  }
  if (!isObject(axis)) {
    return 0;
  }
  const bins = fields(axis, ["edges"]);
  // A bin per value, on one more edge.
  put(bins, "edges", (v) =>
    door.list(v, `${field}.edges`, {
      most: MOST_VALUES + 1,
      why: "a bin per value a spec takes",
      ...past(covered + 1),
    }),
  );
  m[key] = bins;
  return Math.max(0, size(bins["edges"]) - 1);
}

function copyCells(m: Record<string, unknown>, what: string, door: Door): void {
  const { list, add } = door;
  const days = m["days"];
  if (isObject(days)) {
    const copy = fields(days, ["start", "values", "open"]);
    put(copy, "values", (v) => list(v, `${what}.days.values`, ALL));
    m["days"] = copy;
    return;
  }
  const columns = copyAxis(m, "x", what, door);
  put(m, "values", (v) =>
    list(v, `${what}.values`, {
      each: (row, r) => {
        const at = `${what}.values[${String(r)}]`;
        if (isArray(row)) {
          return list(row, at, ONE_AT_LEAST);
        }
        add(1, at);
        return row;
      },
    }),
  );
  const rows = size(m["values"]);
  copyAxis(m, "y", what, door, rows);
  // A grid with no rows is its columns, so every column name is counted.
  if (rows === 0) {
    add(columns, `${what}.x`);
  }
}

function copyMark(
  mark: Record<string, unknown>,
  kind: unknown,
  what: string,
  door: Door,
): Record<string, unknown> {
  const { list, add } = door;
  const [names = [], parts = []] = (typeof kind === "string" ? MARKS.get(kind) : undefined) ?? [];
  const m = fields(mark, names);
  if (kind !== undefined) {
    m["mark"] = kind;
  }
  put(m, "unit", entries);
  put(m, "format", entries);
  const own = (key: string, options?: List): number => {
    put(m, key, (v) => list(v, `${what}.${key}`, options));
    return size(m[key]);
  };
  const eachSeries = (fill: (one: Record<string, unknown> | undefined, at: string) => void) => {
    put(m, "series", (v) =>
      list(v, `${what}.series`, {
        each: (one, s) => {
          const copy = isObject(one) ? fields(one, parts) : undefined;
          fill(copy, `${what}.series[${String(s)}]`);
          return copy ?? one;
        },
      }),
    );
    return size(m["series"]);
  };
  const channels = (
    one: Record<string, unknown> | undefined,
    at: string,
    keys: string[],
    n: number,
  ) => {
    if (one !== undefined) {
      for (const key of keys) {
        put(one, key, (v) => list(v, `${at}.${key}`, past(n)));
      }
    }
  };
  // Each series is n values, one at least, charged before its channels, which
  // charge what they hold past n; a mark with no series is its x. The mark's
  // own list is charged before it is read, as `paid` of the first series' n,
  // since panels may share it by reference.
  const across = (n: number, keys: string[], empty: string, paid: number): void => {
    let owed = paid;
    const count = eachSeries((one, at) => {
      add(Math.max(1, n) - owed, `${at}.${keys[0] ?? ""}`);
      owed = 0;
      channels(one, at, keys, n);
    });
    if (count === 0) {
      add(n - paid, empty);
    }
  };
  switch (kind) {
    case "rect": {
      const n = own("x1", ALL);
      own("x2", past(n));
      across(n, ["y"], `${what}.x1`, n);
      return m;
    }
    case "line":
    case "area": {
      const n = own("x", ALL);
      across(n, ["y"], `${what}.x`, n);
      return m;
    }
    case "bar":
    case "point": {
      const n = own("y", ALL);
      across(n, ["x"], `${what}.y`, n);
      return m;
    }
    case "slope":
      across(2, ["y"], `${what}.x`, Math.min(2, own("x", ALL)));
      return m;
    case "box": {
      const n = own("y", ALL);
      let owed = n;
      eachSeries((one, at) => {
        add(Math.max(1, n) - owed, `${at}.median`);
        owed = 0;
        channels(one, at, ["median", "low", "q1", "q3", "high"], n);
        // Its rows are read only when one per category, as the box check takes them.
        put(one ?? {}, "outliers", (v) =>
          list(v, `${at}.outliers`, {
            ...past(n),
            each: (o, i, length) =>
              length === n ? list(o, `${at}.outliers[${String(i)}]`, ALL) : o,
          }),
        );
      });
      return m;
    }
    case "dot":
      put(m, "rows", (v) =>
        list(v, `${what}.rows`, {
          each: (row, r) => {
            const at = `${what}.rows[${String(r)}].x`;
            const copy = isObject(row) ? fields(row, ["name", "x"]) : undefined;
            const x = copy?.["x"];
            if (copy !== undefined && isArray(x)) {
              copy["x"] = list(x, at, ONE_AT_LEAST);
            } else {
              add(1, at);
            }
            return copy ?? row;
          },
        }),
      );
      return m;
    case "scatter":
      eachSeries((one, at) => {
        const field = `${at}.names`;
        const dots = one?.["names"];
        if (one !== undefined && isArray(dots)) {
          one["names"] = list(dots, field, ONE_AT_LEAST);
        } else {
          add(1, field);
        }
        channels(one, at, ["x", "y", "r"], size(one?.["names"]));
      });
      return m;
    case "cell":
      copyCells(m, what, door);
      return m;
    case "pie":
      put(m, "slices", (v) =>
        list(v, `${what}.slices`, {
          ...ALL,
          each: (one) => (isObject(one) ? fields(one, ["name", "slot", "value"]) : one),
        }),
      );
      return m;
    case "tree":
      put(m, "nodes", (v) =>
        list(v, `${what}.nodes`, {
          ...ALL,
          each: (node, k) => {
            if (!isObject(node)) {
              return node;
            }
            const copy = fields(node, PART);
            put(copy, "children", (c) =>
              list(c, `${what}.nodes[${String(k)}].children`, {
                ...ALL,
                each: (part) => (isObject(part) ? fields(part, PART) : part),
              }),
            );
            return copy;
          },
        }),
      );
      return m;
    default:
      add(1, what);
      return m;
  }
}

// The door every spec passes before a check reads it: the chart's own copy of
// the fields spec.ts documents, each read once, every list through Door.list,
// so no check or model reads the app's objects again. It counts a sample per
// series, a bucket, bar, dot, box, outlier, cell, day, slice, part, rule or
// note, and a mark with no series its x. Every list a mark, series, row, node
// or part holds is charged before its first entry is read, so a list they share
// by reference is copied only for those the ceiling admits, once per field
// that holds it: a fixed multiple of the ceiling in all.
function copySpec(spec: Record<string, unknown>): Record<string, unknown> {
  let count = 0;
  const add = (
    n: number,
    field: string,
    what = "its samples, bars, dots, cells, parts, rules and notes together",
  ): void => {
    count += n;
    if (count > MOST_VALUES) {
      fail(
        `${field} must not take the spec past ${String(MOST_VALUES)} values, ${what}`,
        RangeError,
      );
    }
  };
  const door: Door = {
    list: (v, field, options = {}) => {
      if (!isArray(v)) {
        return v;
      }
      const {
        each = (entry) => entry,
        most = MOST_VALUES,
        why = "the most values a spec takes",
        charge,
      } = options;
      // A Proxy over an array may claim any length, NaN included.
      const length: unknown = v.length;
      if (!(
        typeof length === "number" &&
        Number.isInteger(length) &&
        length >= 0 &&
        length <= most
      )) {
        fail(`${field} must hold at most ${String(most)} entries, ${why}`, RangeError);
      }
      if (charge !== undefined) {
        add(charge(length), field);
      }
      const out: unknown[] = [];
      for (let i = 0; i < length; i++) {
        out.push(each(v[i], i, length));
      }
      return out;
    },
    add,
  };
  const copy = fields(spec, [
    "x",
    "y",
    "r",
    "colour",
    "marks",
    "facets",
    "height",
    "summary",
    "empty",
  ]);
  for (const name of ["x", "y", "r", "colour"]) {
    put(copy, name, (scale) => {
      if (!isObject(scale)) {
        return scale;
      }
      const own = fields(scale, name === "colour" ? COLOUR : SCALE);
      put(own, "unit", entries);
      put(own, "format", entries);
      put(own, "domain", (v) => door.list(v, `${name}.domain`));
      put(own, "thresholds", (v) => door.list(v, `${name}.thresholds`));
      return own;
    });
  }
  // A list of marks, at `field`: one data mark at most.
  const copyMarks = (v: unknown, field: string): unknown => {
    let data: number | undefined;
    return door.list(v, field, {
      each: (mark, m) => {
        const what = `${field}[${String(m)}]`;
        if (!isObject(mark)) {
          add(1, what);
          return mark;
        }
        const kind = mark["mark"];
        // The keys, the legend row, the summary and the table read one mark,
        // so a second would draw values none of them give. Refused before its
        // copy, so lists the marks share are read once.
        if (typeof kind === "string" && kind !== "rule" && kind !== "text" && MARKS.has(kind)) {
          if (data !== undefined) {
            fail(
              `${what} is a second data mark beside ${field}[${String(data)}]; a chart holds one rect, line, area, dot, bar, point, slope, scatter, cell, box, pie or tree mark and any rules and text marks`,
            );
          }
          data = m;
        }
        return copyMark(mark, kind, what, door);
      },
    });
  };
  put(copy, "marks", (v) => copyMarks(v, "marks"));
  // Every panel draws the chart's rules, so each is charged them again.
  const rules = size(copy["marks"]);
  put(copy, "facets", (v) => {
    if (!isObject(v)) {
      return v;
    }
    const own = fields(v, ["unit", "context", "panels"]);
    put(own, "unit", entries);
    let values = 0;
    put(own, "panels", (list) =>
      door.list(list, "facets.panels", {
        most: MOST_PANELS,
        why: "past which no reader compares them",
        charge: (length) => length * Math.max(1, rules),
        each: (panel, p) => {
          if (!isObject(panel)) {
            return panel;
          }
          const one = fields(panel, ["name", "marks"]);
          const before = count;
          put(one, "marks", (marks) => copyMarks(marks, `facets.panels[${String(p)}].marks`));
          values += count - before;
          return one;
        },
      }),
    );
    if (own["context"] === true) {
      add(
        Math.max(0, size(own["panels"]) - 1) * values,
        "facets.context",
        "each panel's values counted again for every other panel, behind which they are drawn",
      );
    }
    return own;
  });
  return copy;
}

/** The chart's own copy of `given`, which no later code reads again; throws a
 *  `TypeError` or `RangeError` naming the first rule the spec breaks. */
function check(given: unknown): ChartSpec {
  if (!isObject(given)) {
    fail("the spec must be an object");
  }
  const spec = copySpec(given);
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
  if (!isArray(marks)) {
    fail("marks must be an array");
  }
  const facets = spec["facets"];
  const panels = isObject(facets) ? size(facets["panels"]) : 0;
  const most = room(Math.max(1, panels));
  if (facets === undefined) {
    checkMarks(
      spec,
      marks,
      marks.map((_, m) => `marks[${String(m)}]`),
      most,
    );
  } else {
    checkFacets(spec, facets, marks, most);
  }
  const height = spec["height"];
  optional(height, "number", "height");
  if (typeof height === "number" && !(height > 0 && height <= most.height)) {
    fail(
      `height must be a number of px above 0 and at most ${String(most.height)}${most.each}`,
      RangeError,
    );
  }
  const summary = spec["summary"];
  if (summary !== undefined && typeof summary !== "string" && typeof summary !== "function") {
    fail("summary must be a string or a function");
  }
  optional(spec["empty"], "string", "empty");
  return spec as unknown as ChartSpec;
}

/** Checks one plot's `marks`, each named by `names`, against `spec`'s
 *  scales and height and the plot's ceilings; returns the data mark's
 *  index, or -1. */
function checkMarks(
  spec: Record<string, unknown>,
  marks: readonly unknown[],
  names: readonly string[],
  most: Room,
): number {
  let data = -1;
  for (let m = 0; m < marks.length; m++) {
    const mark = marks[m];
    checkMark(mark, names[m] ?? "", most);
    if (isObject(mark) && (mark["mark"] === "rule" || mark["mark"] === "text")) {
      continue;
    }
    // copySpec refuses a second data mark.
    data = m;
  }
  checkInstants(spec, marks, names);
  const height = spec["height"];
  const primary = marks[data];
  const whole = isObject(primary) ? primary["mark"] : undefined;
  if (whole === "pie" || whole === "tree") {
    for (let m = 0; m < marks.length; m++) {
      const mark = marks[m];
      if (isObject(mark) && (mark["mark"] === "rule" || mark["mark"] === "text")) {
        fail(
          `${names[m] ?? ""} is a ${mark["mark"]} mark beside a ${whole}, which has no scale to place it on`,
        );
      }
    }
  }
  if (isObject(primary) && primary["mark"] === "scatter") {
    const list = primary["series"];
    const sized = isArray(list) && isObject(list[0]) && list[0]["r"] !== undefined;
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
  const binnedY = cellChart && isObject(primary["y"]) && !isArray(primary["y"]);
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
  if (binnedY) {
    const { edges } = primary["y"] as { edges: readonly number[] };
    const log = isObject(spec["y"]) && spec["y"]["type"] === "log";
    // A log y's edge at or below 0 is the y scale's to name; the 1e-9 lets a
    // float share of exactly a thousandth (1 / 1000) through.
    if (
      !(log && (edges[0] ?? 0) <= 0) &&
      thinnestBin(log ? "log" : "linear", edges) * most.rows < 1 - 1e-9
    ) {
      fail(
        `${names[data] ?? ""}.y.edges' thinnest bin must be at least 1/${String(most.rows)} of the axis${most.each}, since the plot grows until it is a row tall`,
        RangeError,
      );
    }
  }
  if (spec["colour"] !== undefined) {
    if (!(isObject(primary) && primary["mark"] === "cell")) {
      fail("colour has no place without a cell mark, whose classes it colours");
    }
    checkColour(spec["colour"]);
  }
  return data;
}

// The marks that draw in panels: a timeline is already a row per name on one
// scale, a slope holds few lines, and a treemap's equal areas in two panels
// would be unequal values.
const FACETED = new Set(["rect", "line", "area", "bar", "point", "scatter", "box", "cell", "pie"]);

// Every option a faceted data mark takes beside its data.
const OPTIONS = [
  "shape",
  "arrange",
  "curve",
  "open",
  "left",
  "centre",
  "labels",
  "link",
  "whiskers",
  "weekStart",
  "hole",
  "unit",
  "format",
];

const same = (a: unknown, b: unknown): boolean =>
  a === b || (isObject(a) && isObject(b) && JSON.stringify(a) === JSON.stringify(b));

/** A faceted data mark's series' names, or a pie's slices', in order; none
 *  for a cell grid. Read after checkMark. */
function seriesNames(mark: Record<string, unknown>): string[] {
  const list = mark["mark"] === "pie" ? mark["slices"] : mark["series"];
  return isArray(list) ? list.map((s) => (isObject(s) ? String(s["name"]) : "")) : [];
}

/** A checked panel's name: its own, or its data mark's one series'. */
function panelName(panel: NonNullable<ChartSpec["facets"]>["panels"][number]): string {
  const mark = panel.marks.find((m) => m.mark !== "rule" && m.mark !== "text");
  const names = mark === undefined ? [] : seriesNames(mark as unknown as Record<string, unknown>);
  return panel.name ?? names[0] ?? "";
}

/** What every panel's checked data mark must hold as the first's, with
 *  the field naming it: a band's rows, a heatmap's axes, a calendar's days. */
function sharedFields(mark: Record<string, unknown>): [string, unknown][] {
  switch (mark["mark"]) {
    case "bar":
    case "point":
    case "box":
      return [["y", mark["y"]]];
    case "cell": {
      const days = mark["days"];
      if (!isObject(days)) {
        return [
          ["x", mark["x"]],
          ["y", mark["y"]],
        ];
      }
      const values = days["values"];
      return [
        ["days.start", days["start"]],
        ["days.values.length", isArray(values) ? values.length : undefined],
        ["days.open", days["open"]],
      ];
    }
    default:
      return [];
  }
}

// A checked series' or slice's slot, as the model gives it.
const slotOf = (part: unknown, i: number): number =>
  isObject(part) && typeof part["slot"] === "number" ? part["slot"] : i + 1;

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

function checkFacets(
  spec: Record<string, unknown>,
  facets: unknown,
  rules: readonly unknown[],
  most: Room,
) {
  if (!isObject(facets)) {
    fail("facets must be an object");
  }
  const panels = facets["panels"];
  if (!isArray(panels) || panels.length === 0) {
    fail("facets.panels must be a non-empty array, a panel each");
  }
  if (facets["unit"] !== undefined) {
    checkUnit(facets["unit"], "facets.unit");
  }
  optional(facets["context"], "boolean", "facets.context");
  rules.forEach((mark, m) => {
    if (!(isObject(mark) && mark["mark"] === "rule")) {
      fail(
        `marks[${String(m)}] must be a rule beside facets, which draws in every panel; a panel's own marks hold its data and notes`,
      );
    }
  });
  const ruleNames = rules.map((_, m) => `marks[${String(m)}]`);
  let first: Record<string, unknown> | undefined;
  const lists: string[][] = [];
  const slots: { at: string; of: number[] }[] = [];
  const seen = new Set<string>();
  panels.forEach((panel, p) => {
    const at = `facets.panels[${String(p)}]`;
    if (!isObject(panel)) {
      fail(`${at} must be an object`);
    }
    optional(panel["name"], "string", `${at}.name`);
    const own = panel["marks"];
    if (!isArray(own)) {
      fail(`${at}.marks must be an array`);
    }
    const names = [...own.map((_, m) => `${at}.marks[${String(m)}]`), ...ruleNames];
    const data = checkMarks(spec, [...own, ...rules], names, most);
    const mark = own[data];
    if (!isObject(mark)) {
      fail(`${at}.marks must hold one data mark`);
    }
    const kind = String(mark["mark"]);
    const what = names[data] ?? at;
    if (!FACETED.has(kind)) {
      fail(
        `${what} is a ${kind} mark, which draws no panels; facet a rect, line, area, bar, point, scatter, box, cell or pie mark`,
      );
    }
    if (first === undefined) {
      first = mark;
    } else if (kind !== first["mark"]) {
      fail(
        `${what} is a ${kind} mark beside ${String(first["mark"])} panels; every panel draws one kind`,
      );
    } else {
      for (const option of OPTIONS) {
        if (!same(mark[option], first[option])) {
          fail(`${what}.${option} must be facets.panels[0]'s; the panels share one set of options`);
        }
      }
      const theirs = sharedFields(first);
      sharedFields(mark).forEach(([field, value], j) => {
        if (!same(value, theirs[j]?.[1])) {
          fail(
            `${what}.${field} must be facets.panels[0]'s; the panels share one ${kind === "cell" ? (field.startsWith("days") ? "calendar" : "grid") : "band of rows"}`,
          );
        }
      });
    }
    const list = seriesNames(mark);
    lists.push(list);
    const field = kind === "pie" ? "slices" : "series";
    const parts = mark[field];
    slots.push({ at: `${what}.${field}`, of: isArray(parts) ? parts.map(slotOf) : [] });
    const given = panel["name"];
    const name = typeof given === "string" ? given : list.length === 1 ? list[0] : undefined;
    if (name === undefined) {
      fail(
        list.length === 0
          ? `${at}.name is required; a ${kind} panel has no series to name it`
          : `${at}.name is required on a panel of ${String(list.length)} series`,
      );
    }
    if (name === "" || seen.has(name)) {
      fail(`${at}'s name "${name}" must be unique and not empty`, RangeError);
    }
    seen.add(name);
  });
  const [head = []] = lists;
  const alike = lists.every((l) => sameList(l, head));
  // A pie's slices are its whole's parts, so every pie holds the same ones.
  if (first?.["mark"] === "pie" && !alike) {
    fail("facets.panels must each hold the same slices in the same order");
  }
  const perSeries = lists.every((l) => l.length === 1);
  if (!perSeries && !alike) {
    fail("facets.panels must each hold one series, or all the same series in the same order");
  }
  // The legend row's chips are framed once from the first panel, so their
  // swatches hold for every panel only while each series keeps its slot.
  if (!perSeries) {
    const theirs = slots[0]?.of ?? [];
    for (const { at, of } of slots) {
      const s = of.findIndex((slot, i) => slot !== theirs[i]);
      if (s !== -1) {
        fail(
          `${at}[${String(s)}].slot must be facets.panels[0]'s; a series keeps one colour in every panel`,
        );
      }
    }
  }
  if (facets["context"] === true) {
    const kind = first?.["mark"];
    if (kind !== "line" && kind !== "scatter") {
      fail("facets.context draws behind line or scatter panels only");
    }
    if (!perSeries) {
      fail("facets.context needs one series a panel, each drawn behind the others");
    }
  }
}

// A log axis has no place for 0 or below, so a line reads such a value as a
// gap, as the extent already leaves it out.
const gaps = (y: readonly (number | null)[], log: boolean): (number | null)[] =>
  Array.from(y, (v) => (v === null || Number.isNaN(v) || (log && v <= 0) ? null : v));

function series(list: RectMark["series"], log = false): SeriesModel[] {
  return list.map((s, i) => ({ name: s.name, slot: s.slot ?? i + 1, y: gaps(s.y, log) }));
}

// A rect's series and each of its `length` buckets' sum, a `null` as 0.
function rectSeries(list: RectMark["series"], length: number) {
  const out = series(list);
  const totals = Array.from({ length }, () => 0);
  for (const s of out) {
    for (let i = 0; i < totals.length; i++) {
      totals[i] = (totals[i] ?? 0) + (s.y[i] ?? 0);
    }
  }
  return { series: out, totals };
}

// An area's series and each of its `length` samples' stack top, `null` where
// any series is a gap.
function areaSeries(list: RectMark["series"], length: number) {
  const out = series(list);
  const totals = Array.from({ length }, (): number | null => 0);
  for (const s of out) {
    for (let i = 0; i < totals.length; i++) {
      const total = totals[i] ?? null;
      const v = s.y[i] ?? null;
      totals[i] = total === null || v === null ? null : total + v;
    }
  }
  return { series: out, totals };
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
  const at = new Map<number, Map<number, DotRef>>();
  for (const ref of drawn) {
    const s = series[ref.series];
    const dx = s?.x[ref.i];
    const dy = s?.y[ref.i];
    if (dx !== null && dx !== undefined && dy !== null && dy !== undefined) {
      const column = at.get(dx) ?? new Map<number, DotRef>();
      at.set(dx, column.set(dy, ref));
    }
  }
  return { kind: "scatter", unit: mark.unit, series, shown, size, drawn, at };
}

function pieModel(mark: PieMark): PieModel {
  const slices = mark.slices.map((s, i) => ({
    name: s.name,
    slot: s.slot ?? i + 1,
    value: s.value === null || Number.isNaN(s.value) ? null : s.value,
  }));
  const total = slices.reduce((n, s) => n + (s.value ?? 0), 0);
  if (total > LIMIT) {
    fail("the total of a pie's slices must lie within ±1e300", RangeError);
  }
  return {
    kind: "pie",
    hole: mark.hole === true,
    unit: mark.unit,
    slices,
    total,
  };
}

type TreeNode = TreeMark["nodes"][number];

// The check's own test, so a part written with `children: undefined` is a part.
const isGroup = (node: TreeNode): node is Extract<TreeNode, { children: unknown }> =>
  (node as { readonly children?: unknown }).children !== undefined;

// The check holds the nodes all parts or all groups of parts.
function treeModel(mark: TreeMark): TreeModel {
  const gap = (v: number | null): number | null => (v === null || Number.isNaN(v) ? null : v);
  const groups: TreeGroupModel[] = [];
  const parts: TreePartModel[] = [];
  mark.nodes.forEach((node, g) => {
    if (!isGroup(node)) {
      parts.push({
        name: node.name,
        slot: node.slot ?? mark.slot ?? 1,
        value: gap(node.value),
        group: -1,
      });
      return;
    }
    const slot = node.slot ?? g + 1;
    const first = parts.length;
    let value = 0;
    for (const p of node.children) {
      const v = gap(p.value);
      value += v ?? 0;
      parts.push({ name: p.name, slot, value: v, group: g });
    }
    groups.push({ name: node.name, slot, value, first, count: node.children.length });
  });
  const total = parts.reduce((n, p) => n + (p.value ?? 0), 0);
  if (total > LIMIT) {
    fail("the total of a tree's nodes must lie within ±1e300", RangeError);
  }
  return { kind: "tree", unit: mark.unit, groups, parts, total };
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

function kindOf(first: DataModel | undefined, x: Continuous): Kind | undefined {
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
    case "pie":
      return first.hole ? "donut" : "pie";
    case "tree":
      return "treemap";
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
    case "pie":
    case "tree":
      return m.total > 0;
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
    withinDate(m.x, `${what}.x`);
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

// How much of a date an instant's words need on a domain from `lo` to `hi`:
// ends a whole day apart can share their clock time ("Nov 10, 2:00 PM to
// Nov 11, 2:00 PM"), ends in two years their years, and a year before 1 its
// era.
function timeReach(lo: number, hi: number, timeZone: string | undefined): Reach {
  if (!spansDay(lo, hi, timeZone)) {
    return "time";
  }
  const first = localYear(lo, timeZone);
  if (first === localYear(hi, timeZone)) {
    return "day";
  }
  return first < 1 ? "era" : "year";
}

interface Scales {
  readonly x: Continuous;
  readonly y: Continuous | Band;
  readonly size: Size | undefined;
  readonly classes: Classes;
  readonly grain: Grain;
}

/** `spec`'s colour classes, inferred over every cell grid's or calendar's
 *  values when the spec passes no thresholds or domain. */
function colourClasses(spec: ChartSpec): Classes {
  const values: number[] = [];
  for (const m of spec.marks) {
    if (m.mark !== "cell") {
      continue;
    }
    for (const row of isCalendar(m) ? [m.days.values] : m.values) {
      for (const v of row) {
        if (v !== null && !Number.isNaN(v)) {
          values.push(v);
        }
      }
    }
  }
  return classes(spec.colour ?? {}, values);
}

/**
 * Checks `spec` and builds its model in `locale` and `timeZone`. Throws a
 * `RangeError` or `TypeError` naming the first rule the spec breaks.
 */
export function chartModel(
  given: ChartSpec,
  locale: string | undefined,
  timeZone: string | undefined,
): Model {
  const spec = check(given);
  const { facets, ...rest } = spec;
  if (facets === undefined) {
    const x = xScale(spec, timeZone);
    const scales = {
      x,
      y: yScale(spec),
      size: rScale(spec),
      classes: colourClasses(spec),
      grain: timeGrain(spec, x, timeZone),
    };
    return build(spec, scales, "marks", ALONE, locale, timeZone);
  }
  // The scales are the chart's: their domains are taken over every panel.
  const each = facets.panels.map((p) => ({ ...rest, marks: [...p.marks, ...spec.marks] }));
  const all = { ...rest, marks: [...facets.panels.flatMap((p) => p.marks), ...spec.marks] };
  const y = yScale(all);
  const x = xScale(all, timeZone);
  const scales: Scales = {
    x,
    grain: timeGrain(all, x, timeZone),
    // Every panel holds the same band, so the first names its rows once.
    y: y.type === "band" ? yScale(each[0] ?? all) : y,
    size: rScale(all),
    classes: colourClasses(all),
  };
  const panels = facets.panels.map((p, k) => ({
    name: panelName(p),
    model: build(
      each[k] ?? all,
      scales,
      `facets.panels[${String(k)}].marks`,
      room(facets.panels.length),
      locale,
      timeZone,
    ),
  }));
  const [first] = panels;
  if (first === undefined) {
    throw new TypeError("renderChart: facets.panels must be a non-empty array, a panel each");
  }
  return {
    ...first.model,
    spec,
    empty: panels.every((p) => p.model.empty),
    facets: { unit: facets.unit, context: facets.context === true, panels },
  };
}

/** The model of a checked `spec` on `scales`, its marks named under `field`,
 *  within the plot's ceilings `most`. */
function build(
  spec: ChartSpec,
  { x, y, size, classes: colour, grain }: Scales,
  field: string,
  most: Room,
  locale: string | undefined,
  timeZone: string | undefined,
): Model {
  const ends = spec.marks
    .map((m) => (m.mark === "bar" ? m.arrange : undefined))
    .find((a) => a === "split" || a === "diverge" || a === "mirror");
  const columns = spec.marks.find((m) => m.mark === "slope")?.x;
  const cellMark = spec.marks.find((m): m is CellMark => m.mark === "cell" && !isCalendar(m));
  const calendar = spec.marks.some(isCalendar);
  const cellNames = cellMark === undefined || "edges" in cellMark.x ? undefined : cellMark.x;
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
          ...rectSeries(m.series, m.x1.length),
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
          ...areaSeries(m.series, m.x.length),
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
      case "pie":
        return pieModel(m);
      case "tree":
        return treeModel(m);
      case "slope":
        return { kind: "slope", columns: m.x, series: series(m.series) };
      case "scatter":
        // A band y throws in yScale without band rows, so y is continuous.
        return scatterModel(m, x, y as Continuous, size);
      case "cell":
        if (isCalendar(m)) {
          const values = gaps(m.days.values, false);
          const day = localDay(m.days.start, timeZone);
          const weekStart = m.weekStart ?? weekStartOf(locale);
          withinWeeks(day, weekStart, values.length, most);
          return {
            kind: "calendar",
            day,
            values,
            open: m.days.open === true,
            weekStart,
            classes: colour,
          };
        }
        return {
          kind: "cell",
          x: "edges" in m.x ? { edges: m.x.edges } : { names: m.x },
          y: "edges" in m.y ? { edges: m.y.edges } : { names: m.y },
          values: m.values.map((row) => gaps(row, false)),
          classes: colour,
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
          `${field}[${String(index)}]`,
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
  // A calendar writes its days as dates, never its x ends, which may lie past Date.
  const reach = x.type === "time" && !calendar ? timeReach(x.lo, x.hi, timeZone) : "time";
  const primary = marks.find((m): m is DataModel => m.kind !== "rule" && m.kind !== "text");
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
          ? instantFormat(locale, timeZone, reach, grain)
          : writer(x.format, locale, { signed });
  const xSpan =
    x.type === "time" && !calendar
      ? spanFormat(locale, timeZone, reach, grain)
      : (from: number, to: number): Span => [
          { at: from, text: xText(from) },
          { at: to, text: xText(to) },
        ];
  const yText = writer(y.type === "band" ? undefined : y.format, locale);
  const rText = writer(size?.format, locale);
  const colourText = writer(spec.colour?.format, locale);
  const share = marks.some(
    (m) => (m.kind === "rect" || m.kind === "area" || m.kind === "bar") && m.arrange === "share",
  );
  const bars = marks.some((m) => m.kind === "bar" || m.kind === "point" || m.kind === "box");
  // A pie and a tree have no scale, so their mark carries their format.
  const whole = spec.marks.find(
    (m): m is PieMark | TreeMark => m.mark === "pie" || m.mark === "tree",
  );
  const amount = whole !== undefined ? whole.format : share ? "number" : undefined;
  const xKey = named !== undefined || x.type === "time" ? undefined : widthKey(x.format, locale);
  const yKey = y.type === "band" ? undefined : widthKey(y.format, locale);
  return {
    spec,
    x,
    y,
    marks,
    primary,
    kind: kindOf(primary, x),
    empty: !marks.some((m) => hasData(m, x)),
    xText,
    xSpan,
    grain,
    yText,
    rText,
    colourText,
    dateText,
    amountText: whole !== undefined || share ? writer(amount, locale) : bars ? xText : yText,
    shareText: shareWriter(locale),
    widthKeys: {
      x: xKey,
      y: yKey,
      r: widthKey(size?.format, locale),
      amount: whole !== undefined || share ? widthKey(amount, locale) : bars ? xKey : yKey,
      colour: widthKey(spec.colour?.format, locale),
    },
    locale,
    timeZone,
  };
}
