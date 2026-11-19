/**
 * spec.ts — what an app passes to a chart: a frame of data, the mark that
 * draws it, and the page's words for the frame's keys, refs and notes.
 * @module
 */

import type {
  BinsFrame,
  BoxesFrame,
  CalendarFrame,
  CategoriesFrame,
  EventsFrame,
  GridFrame,
  PointsFrame,
  SeriesFrame,
  TreeFrame,
} from "../frame/frame.js";
import type { Unit } from "../../core/format/format.js";
import type { Format } from "../scale/format.js";

type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** The frames a chart draws; its mark names which it takes. */
export type ChartFrame =
  | BinsFrame
  | SeriesFrame
  | EventsFrame
  | CategoriesFrame
  | PointsFrame
  | GridFrame
  | CalendarFrame
  | BoxesFrame
  | TreeFrame;

interface Scale {
  /** A bins frame's `axis` and a dot's instants set x's type, so there a
   *  type that contradicts them is a `TypeError`. */
  readonly type?: "linear" | "log" | "time" | "band";
  /** The axis title; required on both axes of a scatter, whose readings
   *  name each measure by it. */
  readonly label?: string;
  /** The measured noun ("posts"), or the band's rows ("agents"); none on a
   *  scatter, whose readings name each measure by its label. */
  readonly unit?: Unit;
  /** Linear, log and time only; on x it wins over the frame's `domain`. */
  readonly domain?: readonly [number, number];
  /** A linear y under a line or a slope, which holds 0 unless false, or a
   *  linear x under a point or box mark, or either under a scatter, which
   *  holds it only when true. */
  readonly zero?: boolean;
  /** Default from the frame's unit: "duration" for "seconds", "percent" for
   *  "ratio", else "number". */
  readonly format?: Format;
  /** Band only: names in the mono face. */
  readonly mono?: boolean;
  /** x only: x runs leftward and the y gutter moves right. */
  readonly reverse?: boolean;
}

/** The page's words and colour for one of the frame's keys. An entry for a
 *  key the frame does not hold is ignored, since a live frame's keys come
 *  and go. */
interface Key {
  readonly key: string;
  /** Default the key itself. */
  readonly name?: string;
  /** Default the series rule, slot i + 1; past the ninth it is required. */
  readonly slot?: Slot;
}

/** A bins frame's series as bars or flat-topped areas over its bins. */
interface RectMark {
  readonly mark: "rect";
  /** How several series share a bucket: stacked from the baseline (the
   *  default), side by side in series order from the left, or stacked to
   *  100 % of each bucket's total. "share" needs two or more series; its y
   *  runs 0 to 1, in "percent" unless y.format says another, and takes no
   *  domain. */
  readonly arrange?: "stack" | "group" | "share";
  /** "bars" (the default) draws each bucket apart; "area" draws each
   *  series' run of touching buckets above 0 as one flat-topped shape. "area"
   *  takes no "group". */
  readonly shape?: "bars" | "area";
  readonly keys?: readonly Key[];
}

/** A series frame's series as lines, broken at its resets. */
interface LineMark {
  readonly mark: "line";
  /** Default "linear". */
  readonly curve?: "linear" | "step";
  readonly keys?: readonly Key[];
}

/** A series frame's series stacked as areas, broken at its resets. */
interface AreaMark {
  readonly mark: "area";
  /** Default "linear"; "step" holds each value until the next sample. */
  readonly curve?: "linear" | "step";
  /** Stacked in series order from the baseline (the default), or to 100 %
   *  of each sample's total. A sample where any series is a gap, or under
   *  "share" whose total is 0, breaks every layer there. "share" needs two
   *  or more series; its y runs 0 to 1 and takes no domain. */
  readonly arrange?: "stack" | "share";
  readonly keys?: readonly Key[];
}

/** An events frame's rows as a timeline strip, a row of dots each, on a
 *  time x. */
interface DotMark {
  readonly mark: "dot";
  readonly slot?: Slot;
  readonly unit?: Unit;
  /** The rows' names; a row takes the mark's slot. */
  readonly keys?: readonly Omit<Key, "slot">[];
}

/** A categories frame as horizontal bars, one row per name on a band y, top
 *  to bottom in the order sent; each bar's length from 0 along a linear x
 *  is its value, leftward below 0. */
interface BarMark {
  readonly mark: "bar";
  /** How several series share a row: stacked from 0, negatives leftward
   *  (the default); one under another ("group"); stacked to 100 % ("share",
   *  two or more series, no domain); a panel each on one shared scale
   *  ("split", folded under 30rem as a group); either side of 0 ("diverge",
   *  see `left`); or back to back ("mirror", exactly two series). "share",
   *  "split", "diverge" and "mirror" take values of 0 or more. */
  readonly arrange?: "stack" | "group" | "share" | "split" | "diverge" | "mirror";
  /** "diverge" only, and required there: how many series, the first ones,
   *  stack leftward from 0; from 1 to the series count less one (less two
   *  with `centre`). */
  readonly left?: number;
  /** "diverge" only: the series after the left ones straddles 0. */
  readonly centre?: boolean;
  /** Each bar's value at its end (default true), in place of an x axis;
   *  "share" and "diverge" take none and keep their x axis. */
  readonly labels?: boolean;
  readonly keys?: readonly (Key & {
    /** The slot of the bars below 0, on a chart of this one series. */
    readonly below?: Slot;
  })[];
}

/** A categories frame as a dot per series on each name's row, along a
 *  linear, log or time x that holds 0 only with `x.zero: true`. */
interface PointMark {
  readonly mark: "point";
  /** Joins each row's two dots, so it needs exactly two series: "range"
   *  with a bold line, read as their gap; "arrow" from the first to the
   *  second, read as the change, drawn where the dots stand 18 px apart. */
  readonly link?: "range" | "arrow";
  readonly keys?: readonly Key[];
}

/** A categories frame of exactly two names, its columns left to right, each
 *  series a line between them along a linear y. */
interface SlopeMark {
  readonly mark: "slope";
  readonly keys?: readonly Key[];
}

/** A points frame as dots on a linear or log x and y, each group in its
 *  slot; with `r`, a bubble per point, the larger drawn first. */
interface ScatterMark {
  readonly mark: "scatter";
  /** The dots' noun ("countries"); without one they are points. */
  readonly unit?: Unit;
  readonly keys?: readonly Key[];
}

/** A grid frame as cells, or a calendar frame as a calendar of days in its
 *  zone, each filled by its value's class on the `colour` scale. */
interface CellMark {
  readonly mark: "cell";
  /** A calendar's first weekday, 1 (Monday) to 7 (Sunday); default the
   *  locale's, or Monday where the engine gives none. */
  readonly weekStart?: number;
}

/** A boxes frame as a box per series on each name's row, along a linear or
 *  log x that holds 0 only with `x.zero: true`. */
interface BoxMark {
  readonly mark: "box";
  /** The app's words for its whiskers' convention ("1.5 × IQR"). */
  readonly whiskers?: string;
  readonly keys?: readonly Key[];
}

/** A categories frame of one series as slices of a circle, clockwise from
 *  12 o'clock in the order sent; values of 0 or more. */
interface PieMark {
  readonly mark: "pie";
  /** A donut: the inner half of the radius left open, the total in it. */
  readonly hole?: boolean;
  /** The values' noun ("km²"). */
  readonly unit?: Unit;
  readonly format?: Format;
  /** The slices, by their names. */
  readonly keys?: readonly Key[];
}

/** A tree frame as tiles of the plot, laid out in the order sent. */
interface TreeMark {
  readonly mark: "tree";
  /** One level: every tile's slot, default 1; a `TypeError` beside groups,
   *  which take a slot each. */
  readonly slot?: Slot;
  /** The values' noun ("USD"). */
  readonly unit?: Unit;
  readonly format?: Format;
  /** The top level: its parts, or its groups, whose parts take their slot. */
  readonly keys?: readonly Key[];
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
  | BoxMark
  | PieMark
  | TreeMark;

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

/** A bubble chart's size: area proportional to the value from 0. */
interface SizeScale {
  readonly type?: "linear";
  /** Required: the readings name the size by it. */
  readonly label?: string;
  /** Its low end is 0; every r value lies inside it. */
  readonly domain?: readonly [number, number];
  readonly format?: Format;
}

/** The page's words for a frame ref, drawn as a rule. */
interface RefEncoding {
  readonly key: string;
  /** Default the key. */
  readonly label?: string;
  /** Default the axis the frame's unit is on. Where the chart has no
   *  continuous axis for it, the summary and the table give it instead. */
  readonly axis?: "x" | "y";
}

/** The page's words for a frame note, drawn at its x on the plot's top edge
 *  (a calendar's day), set 4 px off it on its `side`. */
interface NoteEncoding {
  readonly key: string;
  /** Default the key. */
  readonly text?: string;
  /** Default "above". */
  readonly side?: "above" | "below" | "left" | "right";
}

/** A panel of small multiples and its frame, of the type the mark takes. */
interface FacetPanel {
  /** Unique across the panels; a `FrameEvent`'s key names it. */
  readonly key: string;
  /** Default its frame's one series' name; required with more series. */
  readonly name?: string;
  readonly data: ChartFrame;
}

/** One panel per series or per category, in a grid that follows the
 *  figure's width, every panel on the chart's scales. Every panel holds one
 *  series, or the same series in the same order. */
interface Facets {
  /** The panels' noun ("regions"); default "panels". */
  readonly unit?: Unit;
  /** Each one-series line or scatter panel draws every other panel's
   *  series faintly behind its own. */
  readonly context?: boolean;
  /** One to 100 panels, left to right and then down. */
  readonly panels: readonly FacetPanel[];
}

interface Common {
  readonly mark: Mark;
  /** A slope, a calendar, a pie and a tree take none. */
  readonly x?: Scale;
  /** Band under a dot, bar, point or box mark or a grid of names; a
   *  calendar, a pie and a tree take none. */
  readonly y?: Scale;
  /** A scatter's size, when its frame carries `r`. */
  readonly r?: SizeScale;
  /** A cell mark's classes only. */
  readonly colour?: ColourScale;
  readonly refs?: readonly RefEncoding[];
  readonly notes?: readonly NoteEncoding[];
  /** The plot's height in px, each panel's under `facets` (default 120); a
   *  band chart and a calendar are as tall as their rows and take none. */
  readonly height?: number;
  readonly summary?: string | ((generated: string) => string);
  /** Shown instead of the plot when there is nothing to draw. */
  readonly empty?: string;
}

export type ChartSpec =
  | (Common & { readonly data: ChartFrame; readonly facets?: never })
  | (Common & { readonly facets: Facets; readonly data?: never });
