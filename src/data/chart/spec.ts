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
  /** The axis title. */
  readonly label?: string;
  /** The measured noun ("posts"), or the band's rows ("agents"). */
  readonly unit?: Unit;
  /** Linear, log and time only. */
  readonly domain?: readonly [number, number];
  /** A linear y under line marks only. */
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
 *  but 0 with its sign. */
export interface BarMark {
  readonly mark: "bar";
  /** The categories' names, each once. */
  readonly y: readonly string[];
  /** How several series share a row: stacked from 0, negatives leftward
   *  (the default); thinner bars one under another; stacked to 100 % of
   *  the row ("share", two or more series, x 0 to 1 in "percent" unless
   *  x.format says another, no domain); a panel each on one shared scale
   *  ("split", folded under 30rem as a group); or either side of 0
   *  ("diverge", see `left`), its axis reading distances from 0 both ways.
   *  "share", "split" and "diverge" take values of 0 or more. */
  readonly arrange?: "stack" | "group" | "share" | "split" | "diverge";
  /** "diverge" only, and required there: how many series, the first ones,
   *  stack leftward from 0, the last of them nearest it; the rest stack
   *  rightward. From 1 to the series count less one (less two with
   *  `centre`). */
  readonly left?: number;
  /** "diverge" only: the series after the left ones straddles 0, half its
   *  value each side, as a neutral answer does. */
  readonly centre?: boolean;
  /** Each bar's value at its end (default true), in place of an x axis: a
   *  stack's total, or each grouped or split bar's own value. "share" and
   *  "diverge" take none, since their bars have no one length to label, and
   *  keep their x axis. */
  readonly labels?: boolean;
  readonly series: readonly BarSeries[];
}

/** Exactly one of `x` and `y`, finite. */
interface RuleMark {
  readonly mark: "rule";
  readonly x?: number;
  readonly y?: number;
  readonly label: string;
}

/** A note at a place on the plot, set 4 px off it on its `side` (default
 *  "above"). Under a rect, line or area `x` and `y` are values on the
 *  chart's scales; under a dot mark `x` is a time and `y` a row's name. Both
 *  are required. A note outside the drawn range is not drawn. */
interface TextMark {
  readonly mark: "text";
  readonly x?: number | string;
  readonly y?: number | string;
  readonly text: string;
  readonly side?: "above" | "below" | "left" | "right";
}

export type Mark = RectMark | LineMark | AreaMark | DotMark | BarMark | RuleMark | TextMark;

export interface ChartSpec {
  readonly x: Scale;
  /** Band when the chart has a dot or bar mark. */
  readonly y?: Scale;
  /** One rect, line, area, dot or bar mark and any rules and text marks,
   *  drawn in order: a rule after a rect draws over it. A second data mark
   *  is a `TypeError`. */
  readonly marks: readonly Mark[];
  /** The plot's height in px. A band chart (dot or bar) is as tall as its
   *  rows, so there it is a `TypeError`. */
  readonly height?: number;
  readonly summary?: string | ((generated: string) => string);
  /** Shown instead of the plot when there is nothing to draw. */
  readonly empty?: string;
}
