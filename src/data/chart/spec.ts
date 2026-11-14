/**
 * spec.ts — the data and encodings an app passes to a chart.
 * @module
 */

import type { Format, Unit } from "../scale/format.js";

type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Values along a series; `null` or `NaN` is a gap. */
type Values = ArrayLike<number | null>;

interface Scale {
  readonly type?: "linear" | "log" | "time" | "band";
  /** The axis title; required on both axes of a scatter, whose readings
   *  name each measure by it. */
  readonly label?: string;
  /** The measured noun ("posts"), or the band's rows ("agents"); none on a
   *  scatter, whose readings name each measure by its label. */
  readonly unit?: Unit;
  /** Linear, log and time only. */
  readonly domain?: readonly [number, number];
  /** A linear y under a line or a slope, which holds 0 unless false, or a
   *  linear x under a point or box mark, or either under a scatter, which
   *  holds it only when true. */
  readonly zero?: boolean;
  readonly format?: Format;
  /** Band only: names in the mono face. */
  readonly mono?: boolean;
  /** x only: time runs leftward and the y gutter moves right. */
  readonly reverse?: boolean;
}

interface Series {
  readonly name: string;
  readonly slot?: Slot;
  readonly y: Values;
}

export interface RectMark {
  readonly mark: "rect";
  readonly x1: ArrayLike<number>;
  readonly x2: ArrayLike<number>;
  /** The last bucket is still filling. */
  readonly open?: boolean;
  /** How several series share a bucket: stacked from the baseline (the
   *  default), side by side in series order from the left, or stacked to
   *  100 % of each bucket's total. "share" needs two or more series; its y
   *  runs 0 to 1, in "percent" unless y.format says another, and takes no
   *  domain. */
  readonly arrange?: "stack" | "group" | "share";
  /** "bars" (the default) draws each bucket apart; "area" draws each
   *  series' run of touching buckets above 0 as one flat-topped shape, with
   *  no gap between buckets. "area" takes no "group". */
  readonly shape?: "bars" | "area";
  readonly series: readonly Series[];
}

interface LineMark {
  readonly mark: "line";
  readonly x: ArrayLike<number>;
  /** Default "linear". */
  readonly curve?: "linear" | "step";
  readonly series: readonly Series[];
}

interface AreaMark {
  readonly mark: "area";
  readonly x: ArrayLike<number>;
  /** Default "linear"; "step" holds each value until the next sample. */
  readonly curve?: "linear" | "step";
  /** Several series stack in series order from the baseline (the default),
   *  or to 100 % of each sample's total. A sample where any series is a gap,
   *  or under "share" whose total is 0, breaks every layer there. "share"
   *  needs two or more series; its y runs 0 to 1, in "percent" unless
   *  y.format says another, and takes no domain. */
  readonly arrange?: "stack" | "share";
  readonly series: readonly Series[];
}

interface DotRow {
  readonly name: string;
  readonly x: ArrayLike<number>;
}

interface DotMark {
  readonly mark: "dot";
  readonly slot?: Slot;
  readonly unit?: Unit;
  readonly rows: readonly DotRow[];
}

interface BarSeries {
  readonly name: string;
  readonly slot?: Slot;
  /** The slot of the bars below 0, on a chart of this one series. */
  readonly below?: Slot;
  /** A value per category, in `y`'s order; `null` or `NaN` is a gap. */
  readonly x: Values;
}

/** Horizontal bars, one row per category on a band y, top to bottom in
 *  the order sent; each bar's length from 0 along a linear x is its value,
 *  leftward below 0. One series with a value below 0 writes every value
 *  not written as 0 with its sign. */
export interface BarMark {
  readonly mark: "bar";
  /** The categories' names, each once. */
  readonly y: readonly string[];
  /** How several series share a row: stacked from 0, negatives leftward
   *  (the default); thinner bars one under another ("group"); stacked to
   *  100 % ("share", two or more series, x 0 to 1 in "percent" unless
   *  x.format says otherwise, no domain); a panel each on one shared scale
   *  ("split", folded under 30rem as a group); either side of 0 ("diverge",
   *  see `left`); or back to back ("mirror", exactly two series, the first
   *  leftward from a spine, as a population pyramid). "share", "split",
   *  "diverge" and "mirror" take values of 0 or more. */
  readonly arrange?: "stack" | "group" | "share" | "split" | "diverge" | "mirror";
  /** "diverge" only, and required there: how many series, the first ones,
   *  stack leftward from 0, the last of them nearest it; the rest stack
   *  rightward. From 1 to the series count less one (less two with
   *  `centre`). */
  readonly left?: number;
  /** "diverge" only: the series after the left ones straddles 0, half its
   *  value each side, as a neutral answer does. */
  readonly centre?: boolean;
  /** Each bar's value at its end (default true), in place of an x axis: a
   *  stack's total, or each grouped, split or mirrored bar's own value. "share" and
   *  "diverge" take none, since their bars have no one length to label, and
   *  keep their x axis. */
  readonly labels?: boolean;
  readonly series: readonly BarSeries[];
}

interface PointSeries {
  readonly name: string;
  readonly slot?: Slot;
  /** A value per category, in `y`'s order; `null` or `NaN` draws no dot. */
  readonly x: Values;
}

/** A dot per series on each category's row, one row per category on a
 *  band y, top to bottom in the order sent, along a linear, log or time x
 *  that holds 0 only with `x.zero: true`, since no length encodes a value. */
export interface PointMark {
  readonly mark: "point";
  /** The categories' names, each once. */
  readonly y: readonly string[];
  /** Joins each row's two dots, so it needs exactly two series: "range"
   *  with a bold line under them, read as their gap; "arrow" with an
   *  arrow from the first to the second, read as the change, and drawn
   *  only where the dots stand 18 px apart or more. */
  readonly link?: "range" | "arrow";
  readonly series: readonly PointSeries[];
}

/** Each series as one line between two columns, two moments or two
 *  conditions, along the chart's linear y; the chart takes no x scale. */
interface SlopeMark {
  readonly mark: "slope";
  /** The two columns' names, left to right. */
  readonly x: readonly [string, string];
  /** Each series' `y` holds its two ends; a `null` end draws only the other. */
  readonly series: readonly Series[];
}

interface ScatterSeries {
  readonly name: string;
  readonly slot?: Slot;
  /** Each dot's name, once across the whole mark. */
  readonly names: readonly string[];
  /** A value per dot on each axis; `null` or `NaN` draws no dot. */
  readonly x: Values;
  readonly y: Values;
  /** A value of 0 or more per dot that its area is proportional to, on the
   *  chart's `r`: on every series or none. A 0 draws no dot but is read
   *  and listed; `null` or `NaN` draws none either. */
  readonly r?: Values;
}

/** A dot per item on the chart's linear or log x and y, each series a
 *  group of dots in its slot, a later series drawn over an earlier one;
 *  with `r`, a bubble per item, the larger drawn first across every series. */
export interface ScatterMark {
  readonly mark: "scatter";
  /** The dots' noun ("countries"); without one they are points. */
  readonly unit?: Unit;
  readonly series: readonly ScatterSeries[];
}

/** A binned axis of a cell chart: `edges[i]` to `edges[i + 1]` is bin i,
 *  on the chart's scale for that axis. */
interface CellBins {
  /** Two or more finite edges, strictly increasing; above 0 on a log scale. */
  readonly edges: readonly number[];
}

/** A grid of cells, each filled by its value's class on the chart's
 *  `colour` scale: named columns from the left and rows from the top, bins
 *  from the axis's low end. */
export interface CellMark {
  readonly mark: "cell";
  /** The columns' names, each once, or their bins on a linear, log or time x. */
  readonly x: readonly string[] | CellBins;
  /** The rows' names, each once, or their bins on a linear or log y. */
  readonly y: readonly string[] | CellBins;
  /** A row of values per y entry, each as long as `x`; `null` or `NaN` is
   *  no data, outlined. */
  readonly values: readonly Values[];
}

/** A calendar heatmap's days, one value each from `start`. */
interface CalendarDays {
  /** The first day's midnight in the chart's time zone; each value is the
   *  next calendar day, 23 or 25 hours long across a DST change. */
  readonly start: number;
  /** A value per day; `null` or `NaN` is no data, outlined. */
  readonly values: Values;
  /** The last day is still running. */
  readonly open?: boolean;
}

/** A calendar of days, each filled by its value's class on the chart's
 *  `colour` scale: a week column of seven weekday rows each, folded into
 *  blocks of 26 or 13 weeks when a week would be under 12 px. The chart
 *  takes no x or y scale and no `height`. */
export interface CalendarMark {
  readonly mark: "cell";
  readonly days: CalendarDays;
  /** The ISO weekday a week column starts on, 1 (Monday) to 7 (Sunday);
   *  default the locale's first day, or Monday where the engine gives none. */
  readonly weekStart?: number;
}

interface BoxSeries {
  readonly name: string;
  readonly slot?: Slot;
  /** Each category's five numbers, in `y`'s order, from the low whisker's
   *  end to the high one's; a category whose five are all `null` or `NaN`
   *  draws no box. */
  readonly low: Values;
  readonly q1: Values;
  readonly median: Values;
  readonly q3: Values;
  readonly high: Values;
  /** Each category's values beyond its whiskers, one array per category. */
  readonly outliers?: readonly (readonly number[])[];
}

/** A distribution per category as a box from q1 to q3 with its median,
 *  whiskers and outliers, one row per category on a band y, top to bottom
 *  in the order sent, along a linear or log x that holds 0 only with
 *  `x.zero: true`. Several series stand one under another in each row.
 *  The app sends the five numbers: the chart computes no quartile. */
export interface BoxMark {
  readonly mark: "box";
  /** The categories' names, each once. */
  readonly y: readonly string[];
  /** The app's words for its whiskers' convention ("1.5 × IQR"), said once
   *  in the summary and under the table. */
  readonly whiskers?: string;
  readonly series: readonly BoxSeries[];
}

/** A cell chart's colour classes: equal rounded classes over the data, or
 *  the app's `thresholds`; a value past either end takes the end class. */
interface ColourScale {
  /** Default "sequential": low to high. "diverging": either side of `pivot`. */
  readonly type?: "sequential" | "diverging";
  /** The number of classes, 2 to 9; default 5. */
  readonly steps?: number;
  /** The span the equal classes divide, exactly; default the data's, from 0
   *  when every value is 0 or more. */
  readonly domain?: readonly [number, number];
  /** One to eight strictly increasing boundaries, in place of `steps` and
   *  `domain`. */
  readonly thresholds?: readonly number[];
  /** Diverging only: the middle the classes are symmetric about; default 0. */
  readonly pivot?: number;
  /** Diverging only: the accent's arm below the pivot, for more is worse. */
  readonly reverse?: boolean;
  readonly label?: string;
  readonly unit?: Unit;
  readonly format?: Format;
}

/** Exactly one of `x` and `y`, finite. Beside a dot, bar, point or box
 *  mark only `x`, drawn down every row: in every panel of a split, and at its
 *  distance from 0 on both sides of a mirror or a diverging chart, where it
 *  cannot be below 0. Beside a slope only `y`. */
interface RuleMark {
  readonly mark: "rule";
  readonly x?: number;
  readonly y?: number;
  readonly label: string;
}

/** A note at a place on the plot, set 4 px off it on its `side` (default "above"); a
 *  note outside the drawn range is not drawn. `x` and `y` are values on the scales under
 *  a rect, line, area or scatter; categories or values the bins hold under a cell grid;
 *  a time and a row's name under a dot; a place along the row and the row's name under
 *  a bar, point or box; a column's name and a value under a slope. Both are required,
 *  except that a calendar takes only `x`, an instant in its day, and a split, diverging
 *  or mirrored bar refuses `x` and sets the note at its row's end. */
interface TextMark {
  readonly mark: "text";
  readonly x?: number | string;
  readonly y?: number | string;
  readonly text: string;
  readonly side?: "above" | "below" | "left" | "right";
}

/** A bubble chart's size: area proportional to the value from 0. */
interface SizeScale {
  readonly type?: "linear";
  /** Required: the readings name the size by it. */
  readonly label?: string;
  /** Its low end is 0; every r value lies inside it. Shared by several
   *  charts, it keeps one size for one value across them. */
  readonly domain?: readonly [number, number];
  readonly format?: Format;
}

export type Mark =
  | RectMark
  | LineMark
  | AreaMark
  | DotMark
  | BarMark
  | PointMark
  | SlopeMark
  | ScatterMark
  | CellMark
  | CalendarMark
  | BoxMark
  | RuleMark
  | TextMark;

export interface ChartSpec {
  /** Default `{}`. A slope names its columns itself, so there it is a
   *  `TypeError`; a scatter's is linear or log; a cell mark's categories
   *  make it a band, and its bins' edges are its domain. A calendar's days
   *  are its x, so there it is a `TypeError` too. */
  readonly x?: Scale;
  /** Band when the chart has a dot, bar, point or box mark or a cell
   *  mark's categories; linear under a slope; linear or log under a scatter or a
   *  cell mark's bins; a `TypeError` beside a calendar, whose rows are
   *  weekdays. */
  readonly y?: Scale;
  /** A scatter's size, when its series carry `r`; a `TypeError` otherwise. */
  readonly r?: SizeScale;
  /** A cell mark's classes, a grid's or a calendar's; a `TypeError` beside
   *  any other mark. */
  readonly colour?: ColourScale;
  /** One rect, line, area, dot, bar, point, slope, scatter, cell or box
   *  mark and any rules and text marks, drawn in order: a rule after a rect draws
   *  over it. A second data mark is a `TypeError`. */
  readonly marks: readonly Mark[];
  /** The plot's height in px. A band chart (dot, bar, point or box, or a
   *  cell mark with categories on y) is as tall as its rows, and a calendar as
   *  its weeks, so there it is a `TypeError`; a slope grows past it to give
   *  each end label a line, and a cell mark's binned y to give its thinnest
   *  bin a row. */
  readonly height?: number;
  readonly summary?: string | ((generated: string) => string);
  /** Shown instead of the plot when there is nothing to draw. */
  readonly empty?: string;
}
