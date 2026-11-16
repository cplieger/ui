/**
 * model.ts — a checked spec and what each of its marks shows inside the
 * x domain, the one source the drawing, the readings and the table read.
 * @module
 */

import { MAX_MAGNITUDE } from "../frame/limits.js";
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
import { lowerBound, upperBound } from "../scale/reduce.js";
import { localDay, localYear, spansDay, type Grain } from "../scale/time.js";

import { dayFormat, weekCount, weekRow, weekStartOf } from "./calendar.js";
import { classes, type Classes } from "./classes.js";
import { shareWriter } from "./pie.js";
import {
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
import { check, room, type Room } from "./check.js";
import type {
  BarInput,
  BoxInput,
  PieInput,
  Plot,
  PointInput,
  RectInput,
  ScatterInput,
  TreeInput,
  Unplaced,
} from "./plot.js";
import type { ChartSpec } from "./spec.js";

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

/** A note at an x on the plot's top edge, or a calendar's day. */
export interface TextModel {
  readonly kind: "text";
  readonly x: number;
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
  readonly spec: Plot;
  /** The refs and notes the plot has no place for: under `facets` the
   *  chart's, each panel's model holding its own. */
  readonly unplaced: Unplaced;
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

const ALONE = room(1);

function fail(message: string, type: ErrorConstructor = TypeError): never {
  throw new type(`renderChart: ${message}`);
}

// A log axis has no place for 0 or below, so a line reads such a value as a
// gap, as the extent already leaves it out.
const gaps = (y: readonly (number | null)[], log: boolean): (number | null)[] =>
  Array.from(y, (v) => (v === null || Number.isNaN(v) || (log && v <= 0) ? null : v));

function series(list: RectInput["series"], log = false): SeriesModel[] {
  return list.map((s, i) => ({ name: s.name, slot: s.slot ?? i + 1, y: gaps(s.y, log) }));
}

// A rect's series and each of its `length` buckets' sum, a `null` as 0.
function rectSeries(list: RectInput["series"], length: number) {
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
function areaSeries(list: RectInput["series"], length: number) {
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

const barSeries = (list: BarInput["series"]): BarSeriesModel[] =>
  list.map((s, i) => {
    const slot = s.slot ?? i + 1;
    return { name: s.name, slot, below: s.below ?? slot, x: gaps(s.x, false) };
  });

const pointSeries = (list: PointInput["series"]): PointSeriesModel[] =>
  list.map((s, i) => ({ name: s.name, slot: s.slot ?? i + 1, x: gaps(s.x, false) }));

const boxSeries = (list: BoxInput["series"]): BoxSeriesModel[] =>
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
  mark: ScatterInput,
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

function pieModel(mark: PieInput): PieModel {
  const slices = mark.slices.map((s, i) => ({
    name: s.name,
    slot: s.slot ?? i + 1,
    value: s.value === null || Number.isNaN(s.value) ? null : s.value,
  }));
  const total = slices.reduce((n, s) => n + (s.value ?? 0), 0);
  if (total > MAX_MAGNITUDE) {
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

type TreeNode = TreeInput["nodes"][number];

// The check's own test, so a part written with `children: undefined` is a part.
const isGroup = (node: TreeNode): node is Extract<TreeNode, { children: unknown }> =>
  (node as { readonly children?: unknown }).children !== undefined;

// The check holds the nodes all parts or all groups of parts.
function treeModel(mark: TreeInput): TreeModel {
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
  if (total > MAX_MAGNITUDE) {
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
function shownBuckets(mark: RectInput, index: number, x: Continuous): number[] {
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
function colourClasses(spec: Plot): Classes {
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
  chartZone: string | undefined,
): Model {
  const spec = check(given);
  // A calendar's days are its frame's, in its zone; it shows no other time.
  const timeZone = spec.zone ?? chartZone;
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
    return build(spec, scales, ALONE, locale, timeZone);
  }
  // The scales are the chart's: their domains are taken over every panel.
  const each = facets.panels.map((p): Plot => ({
    ...rest,
    marks: [...p.marks, ...spec.marks],
    unplaced: p.unplaced,
  }));
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
    name: p.name,
    model: build(each[k] ?? all, scales, room(facets.panels.length), locale, timeZone),
  }));
  const [first] = panels;
  if (first === undefined) {
    throw new TypeError("renderChart: facets.panels must be a non-empty array, a panel each");
  }
  return {
    ...first.model,
    spec,
    unplaced: spec.unplaced,
    empty: panels.every((p) => p.model.empty),
    facets: { unit: facets.unit, context: facets.context === true, panels },
  };
}

/** The model of a checked `spec` on `scales`, within the plot's ceilings
 *  `most`. */
function build(
  spec: Plot,
  { x, y, size, classes: colour, grain }: Scales,
  most: Room,
  locale: string | undefined,
  timeZone: string | undefined,
): Model {
  const calendar = spec.marks.some(isCalendar);
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
        return { kind: "text", x: m.x, text: m.text, side: m.side ?? "above" };
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
    (m): m is PieInput | TreeInput => m.mark === "pie" || m.mark === "tree",
  );
  const amount = whole !== undefined ? whole.format : share ? "number" : undefined;
  const xKey = named !== undefined || x.type === "time" ? undefined : widthKey(x.format, locale);
  const yKey = y.type === "band" ? undefined : widthKey(y.format, locale);
  return {
    spec,
    unplaced: spec.unplaced,
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
