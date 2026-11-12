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

/** Exactly one of `x` and `y`, finite. */
interface RuleMark {
  readonly mark: "rule";
  readonly x?: number;
  readonly y?: number;
  readonly label: string;
}

export type Mark = RectMark | LineMark | DotMark | RuleMark;

export interface ChartSpec {
  readonly x: Scale;
  /** Band when the chart has a dot mark. */
  readonly y?: Scale;
  /** One rect, line or dot mark and any rules, drawn in order: a rule after
   *  a rect draws over it. A second data mark is a `TypeError`. */
  readonly marks: readonly Mark[];
  /** The plot's height in px. */
  readonly height?: number;
  readonly summary?: string | ((generated: string) => string);
  /** Shown instead of the plot when there is nothing to draw. */
  readonly empty?: string;
}
