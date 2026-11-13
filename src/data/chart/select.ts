/**
 * select.ts — what a chart's selection is and how it moves: the keys'
 * stops for each mark, the pointer's pick, the selection kept across an
 * update, and what the legend row reads and announce says for it.
 * @module
 */

import { lowerBound, upperBound } from "../scale/reduce.js";

import { dotGroups, dotRadius, scatterAt, snap, type DotGroup, type Frame } from "./geometry.js";
import { pointGrid, type Grid } from "./grid.js";
import type { Layout } from "./layout.js";
import { noteJoin, type Join } from "./notes.js";
import { dayAt, monthsFrom } from "./calendar.js";
import type {
  CalendarModel,
  CellModel,
  DotModel,
  DotRef,
  Model,
  RectModel,
  SampleModel,
  ScatterModel,
  SlopeModel,
} from "./model.js";
import { barsApart, cellCount, cellOrder, pointLink, slopeChange } from "./model.js";
import {
  barPart,
  barReading,
  bucketReading,
  cellReading,
  changeText,
  dayReading,
  columnReading,
  measureText,
  partText,
  pointPart,
  pointReading,
  postReading,
  primaryOf,
  rowReading,
  samplePart,
  sampleReading,
  scatterReading,
  type Reading,
} from "./readout.js";
import { stepStopAt, stepStops } from "./table.js";
import type { Words } from "./words.js";

/**
 * A bucket, a sample or a slope's column `i`, with one series (`part`) when
 * Up or Down chose it; the posts `[from, to)` of a dot row; a dot row as a
 * whole; a bar or point row, with one series (`part`) when Left or Right
 * chose it; a scatter's dot `i` of `series`; a cell chart's cell at
 * `row` and `column`, indices into its axes; or a calendar's day `i`.
 */
export type Selection =
  | { readonly kind: "rect"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "line"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "area"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "slope"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "dot"; readonly row: number; readonly from: number; readonly to: number }
  | { readonly kind: "row"; readonly row: number }
  | { readonly kind: "bar" | "point"; readonly row: number; readonly part: number | undefined }
  | { readonly kind: "scatter"; readonly series: number; readonly i: number }
  | { readonly kind: "cell"; readonly row: number; readonly column: number }
  | { readonly kind: "day"; readonly i: number };

export type Key =
  "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "PageUp" | "PageDown";

const KEYS = new Set<string>([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export const isKey = (key: string): key is Key => KEYS.has(key);

/** How far a pointer reaches for a dot in its row, or for a scatter dot's edge, in px. */
const REACH = 40;
/** One x tick's room when the axis draws fewer than two ticks, in px. */
const TICK_FALLBACK = 80;
/** Page Up and Page Down move a band chart's selection this many rows, and
 *  a cell chart's on a band x this many columns. */
const PAGE_ROWS = 10;

const bandRows = (model: Model): number => (model.y.type === "band" ? model.y.rows.length : 0);

/** A bucket's drawn extent in plot px, low to high, before its insets. */
function bucketSpan(m: RectModel, i: number, f: Frame): readonly [number, number] {
  const a = f.xAt(Math.max(m.x1[i] ?? 0, f.x.drawnLo));
  const b = f.xAt(Math.min(m.x2[i] ?? 0, f.x.hi));
  return a <= b ? [a, b] : [b, a];
}

/** A scatter's shown dots in series order, then the app's order, and their
 *  two key orders, each a list of indices into `dots`. */
interface Orders {
  readonly dots: readonly DotRef[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly byX: readonly number[];
  readonly byY: readonly number[];
  /** Each dot's place in `byX` and in `byY`. */
  readonly rankX: Int32Array;
  readonly rankY: Int32Array;
  /** Each series' first index in `dots`. */
  readonly base: readonly number[];
}

const ordersOf = new WeakMap<ScatterModel, Orders>();

// Ties in either order fall to the other value, then to series and the
// app's order, so coincident dots are each a stop.
function orders(m: ScatterModel): Orders {
  let o = ordersOf.get(m);
  if (o !== undefined) {
    return o;
  }
  const dots: DotRef[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const base: number[] = [];
  m.series.forEach((s, k) => {
    base.push(dots.length);
    for (const i of m.shown[k] ?? []) {
      dots.push({ series: k, i });
      x.push(s.x[i] ?? 0);
      y.push(s.y[i] ?? 0);
    }
  });
  const all = dots.map((_, d) => d);
  const byX = [...all].sort(
    (a, b) => (x[a] ?? 0) - (x[b] ?? 0) || (y[a] ?? 0) - (y[b] ?? 0) || a - b,
  );
  const byY = all.sort((a, b) => (y[a] ?? 0) - (y[b] ?? 0) || (x[a] ?? 0) - (x[b] ?? 0) || a - b);
  const rankX = new Int32Array(dots.length);
  const rankY = new Int32Array(dots.length);
  byX.forEach((d, p) => {
    rankX[d] = p;
  });
  byY.forEach((d, p) => {
    rankY[d] = p;
  });
  o = { dots, x, y, byX, byY, rankX, rankY, base };
  ordersOf.set(m, o);
  return o;
}

// The index of `sel` in `o.dots`, or -1 when it is not a shown dot.
function dotIndex(m: ScatterModel, o: Orders, sel: DotRef): number {
  const shown = m.shown[sel.series] ?? [];
  const j = lowerBound(shown, sel.i);
  return shown[j] === sel.i ? (o.base[sel.series] ?? 0) + j : -1;
}

const dotSelection = (o: Orders, d: number | undefined): Selection | undefined => {
  const ref = d === undefined ? undefined : o.dots[d];
  return ref === undefined ? undefined : { kind: "scatter", ...ref };
};

const lineStops = (m: SampleModel): number[] =>
  m.step ? stepStops(m) : Array.from({ length: m.to - m.from }, (_, k) => m.from + k);

/** The selection focus gives a chart that has none yet: the newest x or a
 *  slope's right column, on a timeline the first row's last post, or that
 *  row when it is silent, a bar or point chart's first row, whole, a
 *  scatter's first dot in x order, a cell chart's first cell in reading
 *  order, or a calendar's newest day. */
export function initial(model: Model): Selection | undefined {
  const m = primaryOf(model);
  switch (m?.kind) {
    case undefined:
      return undefined;
    case "rect": {
      const i = m.shown.at(-1);
      return i === undefined ? undefined : { kind: "rect", i, part: undefined };
    }
    case "line":
    case "area": {
      const i = lineStops(m).at(-1);
      return i === undefined ? undefined : { kind: m.kind, i, part: undefined };
    }
    case "dot": {
      const row = m.rows[0];
      if (row === undefined) {
        return undefined;
      }
      return row.to > row.from
        ? { kind: "dot", row: 0, from: row.to - 1, to: row.to }
        : { kind: "row", row: 0 };
    }
    case "bar":
    case "point":
      return bandRows(model) > 0 ? { kind: m.kind, row: 0, part: undefined } : undefined;
    case "slope":
      return { kind: "slope", i: 1, part: undefined };
    case "scatter": {
      const o = orders(m);
      return dotSelection(o, o.byX[0]);
    }
    case "cell": {
      const first = cellOrder(model, m).next();
      return first.done === true
        ? undefined
        : { kind: "cell", row: first.value[0], column: first.value[1] };
    }
    case "calendar":
      return m.values.length === 0 ? undefined : { kind: "day", i: m.values.length - 1 };
  }
}

/** The x value a dot selection stands at, which Up and Down aim for. */
export function xOf(model: Model, sel: Selection): number | undefined {
  const m = primaryOf(model);
  return sel.kind === "dot" && m?.kind === "dot" ? m.rows[sel.row]?.x[sel.from] : undefined;
}

/** The post of `row` nearest `x`, or its last post without one; -1 when silent. */
function nearestPost(row: DotModel["rows"][number], x: number | undefined): number {
  if (row.to <= row.from) {
    return -1;
  }
  if (x === undefined) {
    return row.to - 1;
  }
  const i = Math.min(Math.max(lowerBound(row.x, x), row.from), row.to);
  if (i === row.from) {
    return i;
  }
  if (i === row.to) {
    return i - 1;
  }
  return x - (row.x[i - 1] ?? x) <= (row.x[i] ?? x) - x ? i - 1 : i;
}

/** The px between the two x ticks around `px`, or the nearest pair. */
function tickRoom(lay: Layout, px: number): number {
  const ticks = lay.xAxis.ticks.map((t) => t.at).sort((a, b) => a - b);
  if (ticks.length < 2) {
    return TICK_FALLBACK;
  }
  const k = Math.min(Math.max(upperBound(ticks, px), 1), ticks.length - 1);
  return (ticks[k] ?? 0) - (ticks[k - 1] ?? 0);
}

/**
 * Moves `[lo, hi]`, a span of `stops` (data indices, ascending), by `key`
 * along x, as the drawing runs: Right is rightward on a reversed x too.
 * `px` places a stop on the plot. Undefined when there is nowhere to go.
 */
function along(
  stops: readonly number[],
  lo: number,
  hi: number,
  key: Key,
  px: (i: number) => number,
  lay: Layout,
): number | undefined {
  if (stops.length === 0) {
    return undefined;
  }
  const reverse = lay.frame.x.reverse;
  const forward = (k: Key) => (k === "ArrowRight" || k === "End" || k === "PageDown") !== reverse;
  const after = () => stops[upperBound(stops, hi)];
  const before = () => stops[lowerBound(stops, lo) - 1];
  let next: number | undefined;
  switch (key) {
    case "ArrowLeft":
    case "ArrowRight":
      next = forward(key) ? after() : before();
      break;
    case "Home":
    case "End":
      next = forward(key) ? stops.at(-1) : stops[0];
      break;
    case "PageUp":
    case "PageDown": {
      const rightward = key === "PageDown";
      const from = px(rightward !== reverse ? hi : lo);
      const room = tickRoom(lay, from) - 0.5;
      const far = (i: number) => (rightward ? px(i) - from : from - px(i)) >= room;
      // Stops run one way along px, so the first far one is the nearest.
      const order = forward(key) ? stops : [...stops].reverse();
      next = order.find(far) ?? order.at(-1);
      break;
    }
    case "ArrowUp":
    case "ArrowDown":
      return undefined;
  }
  return next === undefined || (next >= lo && next <= hi) ? undefined : next;
}

/** The parts of a bucket, sample or slope column in Up order: the series in
 *  series order (bottom to top in a stack, left to right in a group), or the
 *  lines with a value there by value, ties in series order. */
function partsAt(m: RectModel | SampleModel | SlopeModel, i: number): number[] {
  const all = m.series.map((_, k) => k);
  if (m.kind !== "line" && m.kind !== "slope") {
    return all;
  }
  return all
    .filter((k) => m.series[k]?.y[i] !== null)
    .sort((a, b) => (m.series[a]?.y[i] ?? 0) - (m.series[b]?.y[i] ?? 0) || a - b);
}

// Up from the whole x takes the bottom part, Down the top one.
function stepPart(order: readonly number[], part: number | undefined, up: boolean) {
  const k = part === undefined ? -1 : order.indexOf(part);
  if (k === -1) {
    return up ? order[0] : order.at(-1);
  }
  return order[up ? k + 1 : k - 1];
}

/**
 * Where `key` moves a bar or point row selection over `rows` rows of `n`
 * series: Up and Down, Home, End and the Page keys through the rows, keeping
 * the chosen part; Left and Right through the row's parts in series order,
 * from the whole row to its first or last, the other way when `reverse`
 * lays them right to left. One series has no parts to choose.
 */
function moveRow(
  n: number,
  rows: number,
  sel: Selection & { kind: "bar" | "point" },
  key: Key,
  reverse: boolean,
): Selection | undefined {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (n < 2) {
      return undefined;
    }
    const forward = (key === "ArrowRight") !== reverse;
    const part = sel.part === undefined ? (forward ? 0 : n - 1) : sel.part + (forward ? 1 : -1);
    return part >= 0 && part < n ? { ...sel, part } : undefined;
  }
  const page = (by: number) => Math.min(Math.max(sel.row + by, 0), rows - 1);
  const row =
    key === "ArrowUp"
      ? sel.row - 1
      : key === "ArrowDown"
        ? sel.row + 1
        : key === "Home"
          ? 0
          : key === "End"
            ? rows - 1
            : page(key === "PageUp" ? -PAGE_ROWS : PAGE_ROWS);
  return row >= 0 && row < rows && row !== sel.row ? { ...sel, row } : undefined;
}

/** Where `key` moves a slope's selection: Up and Down through the series
 *  at its column, Left and Right, Home and End to the left or the right
 *  column, keeping the chosen series. The Page keys are the page's. */
function moveColumn(
  m: SlopeModel,
  sel: Selection & { kind: "slope" },
  key: Key,
): Selection | undefined {
  if (key === "ArrowUp" || key === "ArrowDown") {
    const part = stepPart(partsAt(m, sel.i), sel.part, key === "ArrowUp");
    return part === undefined ? undefined : { ...sel, part };
  }
  const left = key === "ArrowLeft" || key === "Home";
  const right = key === "ArrowRight" || key === "End";
  const i = left ? 0 : right ? 1 : sel.i;
  return i === sel.i ? undefined : { ...sel, i };
}

/** Where `key` moves a scatter's dot: Left and Right, Home, End and the
 *  Page keys along x order, as the drawing runs; Up and Down along y order,
 *  Up to the next higher value. */
function moveScatter(
  m: ScatterModel,
  sel: Selection & { kind: "scatter" },
  key: Key,
  lay: Layout,
): Selection | undefined {
  const o = orders(m);
  const d = dotIndex(m, o, sel);
  if (d === -1) {
    return undefined;
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    return dotSelection(o, o.byY[(o.rankY[d] ?? 0) + (key === "ArrowUp" ? 1 : -1)]);
  }
  const places = Array.from({ length: o.byX.length }, (_, p) => p);
  const px = (p: number) => lay.frame.xAt(o.x[o.byX[p] ?? 0] ?? 0);
  const at = o.rankX[d] ?? 0;
  const p = along(places, at, at, key, px, lay);
  return p === undefined ? undefined : dotSelection(o, o.byX[p]);
}

/** Where `key` moves a cell selection, as the drawing runs: Left and Right,
 *  Home and End along the row, Up and Down to the cell above or below (a
 *  binned y's rows run up from the bottom), Page Up and Page Down by one x
 *  tick on a binned x and PAGE_ROWS columns on a band x. */
function moveCell(
  m: CellModel,
  sel: Selection & { kind: "cell" },
  key: Key,
  lay: Layout,
): Selection | undefined {
  const rows = cellCount(m.y);
  const columns = cellCount(m.x);
  if (key === "ArrowUp" || key === "ArrowDown") {
    const up = (key === "ArrowUp") !== "edges" in m.y;
    const row = sel.row + (up ? -1 : 1);
    return row >= 0 && row < rows ? { ...sel, row } : undefined;
  }
  const xs = lay.cells?.xs ?? [];
  if ((key === "PageUp" || key === "PageDown") && "names" in m.x) {
    const rightward = (key === "PageDown") !== lay.frame.x.reverse;
    const column = Math.min(
      Math.max(sel.column + (rightward ? PAGE_ROWS : -PAGE_ROWS), 0),
      columns - 1,
    );
    return column === sel.column ? undefined : { ...sel, column };
  }
  const stops = Array.from({ length: columns }, (_, c) => c);
  const px = (c: number) => ((xs[c] ?? 0) + (xs[c + 1] ?? 0)) / 2;
  const column = along(stops, sel.column, sel.column, key, px, lay);
  return column === undefined ? undefined : { ...sel, column };
}

/** Where `key` moves a calendar's day `i`: Left and Right a week, Up and
 *  Down a day, Home and End to the first and last, Page Up and Page Down
 *  to the same date a month away (its last day when it has no such date),
 *  held at the first and last day. */
function moveDay(m: CalendarModel, i: number, key: Key): Selection | undefined {
  const last = m.values.length - 1;
  const to =
    key === "ArrowLeft"
      ? i - 7
      : key === "ArrowRight"
        ? i + 7
        : key === "ArrowUp"
          ? i - 1
          : key === "ArrowDown"
            ? i + 1
            : key === "Home"
              ? 0
              : key === "End"
                ? last
                : Math.min(
                    Math.max(monthsFrom(m.day + i, key === "PageUp" ? -1 : 1) - m.day, 0),
                    last,
                  );
  return to === i || to < 0 || to > last ? undefined : { kind: "day", i: to };
}

/** The span of `edges`, ascending or descending, holding `v`, the later on
 *  a shared edge; -1 outside them. */
function spanOf(edges: readonly number[], v: number): number {
  const n = edges.length - 1;
  const first = edges[0] ?? 0;
  const last = edges[n] ?? 0;
  if (n < 1 || v < Math.min(first, last) || v > Math.max(first, last)) {
    return -1;
  }
  const up = last >= first;
  let lo = 0;
  let hi = n;
  // The last edge at or before v along the edges' own direction.
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (up ? (edges[mid] ?? 0) <= v : (edges[mid] ?? 0) >= v) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** A selection's position along x on the plot, in px. */
function selectionPx(model: Model, sel: Selection, f: Frame): number | undefined {
  const m = primaryOf(model);
  if (sel.kind === "rect" && m?.kind === "rect") {
    const [a, b] = bucketSpan(m, sel.i, f);
    return (a + b) / 2;
  }
  if ((sel.kind === "line" || sel.kind === "area") && sel.kind === m?.kind) {
    return f.xAt(m.x[sel.i] ?? 0);
  }
  if (sel.kind === "slope") {
    return f.xAt(sel.i);
  }
  if (sel.kind === "dot" && m?.kind === "dot") {
    return snap(f.xAt(m.rows[sel.row]?.x[sel.from] ?? 0), f.dpr);
  }
  return undefined;
}

/** A selection and the model and layout it moves over. */
export interface Navigator {
  /** Where `key` moves `sel`; `x` is the post x Up and Down aim for.
   *  Undefined when the key has nowhere to go. */
  move(sel: Selection, key: Key, x: number | undefined): Selection | undefined;
  /** What a pointer at plot px `(px, py)` selects; undefined when nothing
   *  is within reach, which clears the selection. */
  pick(px: number, py: number): Selection | undefined;
  /** The crosshair's px along x, absent for a row or a scatter's dot,
   *  whose crosshair is two rules to its edge. */
  crosshair(sel: Selection): number | undefined;
  /** A touch drag moves the selection; on a bar, point or scatter chart
   *  only a tap does, since a vertical drag is the page's scroll. */
  readonly drags: boolean;
  /** Page Up and Page Down move the selection; on a slope, whose two
   *  columns have no ticks to page by, they are the page's. */
  readonly pages: boolean;
  /** A touch drag keeps the row it began on, as along a cell chart's row. */
  readonly alongRow: boolean;
}

export function navigator(model: Model, lay: Layout): Navigator {
  const f = lay.frame;
  const m = primaryOf(model);
  const cache = new Map<number, DotGroup[]>();
  const groups = (r: number): DotGroup[] => {
    let g = cache.get(r);
    const row = m?.kind === "dot" ? m.rows[r] : undefined;
    if (g === undefined) {
      g = row === undefined ? [] : dotGroups(row, f);
      cache.set(r, g);
    }
    return g;
  };
  let stops: number[] | undefined;
  const lineStopsOnce = (l: SampleModel): number[] => (stops ??= lineStops(l));
  let grid: Grid | undefined;
  // Built at the first pick, so a draw no pointer reaches never pays for it;
  // in draw order, so among equally near dots it takes the one on top.
  const gridOf = (s: ScatterModel): Grid => {
    if (grid === undefined) {
      const at = s.drawn.map((d) => scatterAt(s, d.series, d.i, f) ?? { x: 0, y: 0 });
      const r = s.drawn.map((d) => dotRadius(s, d.series, d.i, f));
      grid = pointGrid({ x: at.map((p) => p.x), y: at.map((p) => p.y), r }, REACH);
    }
    return grid;
  };

  const moveDot = (d: DotModel, sel: Selection & { kind: "dot" | "row" }, key: Key, x?: number) => {
    if (key === "ArrowUp" || key === "ArrowDown") {
      const r = sel.row + (key === "ArrowUp" ? -1 : 1);
      const row = d.rows[r];
      if (row === undefined) {
        return undefined;
      }
      const i = nearestPost(row, x);
      return i === -1
        ? ({ kind: "row", row: r } as const)
        : ({ kind: "dot", row: r, from: i, to: i + 1 } as const);
    }
    const row = d.rows[sel.row];
    if (row === undefined || row.to <= row.from) {
      return undefined;
    }
    if (sel.kind === "row") {
      // From a whole row, Home and End take its ends and any other key
      // the post nearest the x last selected.
      const leftmost = f.x.reverse ? row.to - 1 : row.from;
      const rightmost = f.x.reverse ? row.from : row.to - 1;
      const i = key === "Home" ? leftmost : key === "End" ? rightmost : nearestPost(row, x);
      return { kind: "dot", row: sel.row, from: i, to: i + 1 } as const;
    }
    const posts = Array.from({ length: row.to - row.from }, (_, k) => row.from + k);
    const at = (i: number) => f.xAt(row.x[i] ?? 0);
    const i = along(posts, sel.from, sel.to - 1, key, at, lay);
    return i === undefined
      ? undefined
      : ({ kind: "dot", row: sel.row, from: i, to: i + 1 } as const);
  };

  return {
    move(sel, key, x) {
      if (m === undefined) {
        return undefined;
      }
      if (m.kind === "dot") {
        return sel.kind === "dot" || sel.kind === "row" ? moveDot(m, sel, key, x) : undefined;
      }
      if (m.kind === "bar" || m.kind === "point") {
        // Bars one under another and a row's dots, which lie at their
        // values, keep series order on a reversed x; a stack's segments and
        // the panels run with it.
        const along = f.x.reverse && m.kind === "bar" && (!barsApart(m) || f.panels !== undefined);
        return sel.kind === m.kind
          ? moveRow(m.series.length, bandRows(model), sel, key, along)
          : undefined;
      }
      if (m.kind === "slope") {
        return sel.kind === "slope" ? moveColumn(m, sel, key) : undefined;
      }
      if (m.kind === "scatter") {
        return sel.kind === "scatter" ? moveScatter(m, sel, key, lay) : undefined;
      }
      if (m.kind === "cell") {
        return sel.kind === "cell" ? moveCell(m, sel, key, lay) : undefined;
      }
      if (m.kind === "calendar") {
        return sel.kind === "day" ? moveDay(m, sel.i, key) : undefined;
      }
      if (sel.kind !== m.kind) {
        return undefined;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const part = stepPart(partsAt(m, sel.i), sel.part, key === "ArrowUp");
        return part === undefined ? undefined : { ...sel, part };
      }
      const px =
        m.kind === "rect"
          ? (i: number) => {
              const [a, b] = bucketSpan(m, i, f);
              return (a + b) / 2;
            }
          : (i: number) => f.xAt(m.x[i] ?? 0);
      const i = along(m.kind === "rect" ? m.shown : lineStopsOnce(m), sel.i, sel.i, key, px, lay);
      return i === undefined ? undefined : { ...sel, i };
    },
    pick(px, py) {
      switch (m?.kind) {
        case undefined:
          return undefined;
        case "rect": {
          let best: number | undefined;
          let gap = Number.POSITIVE_INFINITY;
          for (const i of m.shown) {
            const [a, b] = bucketSpan(m, i, f);
            const d = px < a ? a - px : px > b ? px - b : 0;
            if (d < gap) {
              best = i;
              gap = d;
            }
          }
          return best === undefined ? undefined : { kind: "rect", i: best, part: undefined };
        }
        case "line":
        case "area": {
          if (m.to <= m.from) {
            return undefined;
          }
          // Binary search along px, which runs with x or against it on a reversed x.
          const sign = f.x.reverse ? -1 : 1;
          let lo = m.from;
          let hi = m.to;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (sign * f.xAt(m.x[mid] ?? 0) < sign * px) {
              lo = mid + 1;
            } else {
              hi = mid;
            }
          }
          const i =
            lo === m.from
              ? lo
              : lo === m.to ||
                  Math.abs(f.xAt(m.x[lo - 1] ?? 0) - px) <= Math.abs(f.xAt(m.x[lo] ?? 0) - px)
                ? lo - 1
                : lo;
          return { kind: m.kind, i, part: undefined };
        }
        case "bar":
        case "point": {
          // The row whose band holds the pointer, anywhere across the plot's
          // width: on a phone a row's name sits above its bars, inside its band.
          const n = lay.rows.length;
          if (n === 0) {
            return undefined;
          }
          const r = Math.floor((py / f.height) * n);
          return { kind: m.kind, row: Math.min(Math.max(r, 0), n - 1), part: undefined };
        }
        case "slope": {
          const i = Math.abs(px - f.xAt(0)) < Math.abs(px - f.xAt(1)) ? 0 : 1;
          return { kind: "slope", i, part: undefined };
        }
        case "scatter": {
          const d = gridOf(m).nearest(px, py);
          const ref = d === undefined ? undefined : m.drawn[d];
          return ref === undefined ? undefined : { kind: "scatter", ...ref };
        }
        case "cell": {
          // The cell whose box holds the pointer, a gap taking the cell past
          // it; off the grid nothing.
          const column = spanOf(lay.cells?.xs ?? [], px);
          const row = spanOf(lay.cells?.ys ?? [], py);
          return column === -1 || row === -1 ? undefined : { kind: "cell", row, column };
        }
        case "calendar": {
          // The day whose week column and weekday row hold the pointer; a
          // block's month line, the space between blocks and a place
          // outside the days select nothing.
          const g = lay.days;
          if (g === undefined) {
            return undefined;
          }
          const block = g.tops.findIndex((top) => py >= top && py < top + 7 * g.row);
          const top = g.tops[block] ?? 0;
          const i = dayAt(
            g.weeks,
            block,
            Math.floor(px / g.column),
            Math.floor((py - top) / g.row),
          );
          return block === -1 || i === -1 ? undefined : { kind: "day", i };
        }
        case "dot": {
          if (lay.rows.length === 0) {
            return undefined;
          }
          let r = 0;
          lay.rows.forEach((row, k) => {
            if (Math.abs(row.y - py) < Math.abs((lay.rows[r]?.y ?? 0) - py)) {
              r = k;
            }
          });
          // Groups come in data order, which runs against px on a reversed x.
          const g = f.x.reverse ? [...groups(r)].reverse() : groups(r);
          const ats = g.map((d) => d.at);
          const k = lowerBound(ats, px);
          const near = [k - 1, k]
            .filter((j) => j >= 0 && j < ats.length)
            .sort((a, b) => Math.abs((ats[a] ?? 0) - px) - Math.abs((ats[b] ?? 0) - px))[0];
          const hit = near === undefined ? undefined : g[near];
          return hit !== undefined && Math.abs(hit.at - px) <= REACH
            ? { kind: "dot", row: r, from: hit.from, to: hit.to }
            : { kind: "row", row: r };
        }
      }
    },
    crosshair: (sel) => selectionPx(model, sel, f),
    drags: m?.kind !== "bar" && m?.kind !== "point" && m?.kind !== "scatter",
    pages: m?.kind !== "slope",
    alongRow: m?.kind === "cell" || m?.kind === "calendar",
  };
}

/** `sel` from `before` in `after`, where its x, or its row, is still in the
 *  data; undefined when it left. */
export function rekey(before: Model, sel: Selection, after: Model): Selection | undefined {
  const was = primaryOf(before);
  const now = primaryOf(after);
  if (was === undefined || now === undefined) {
    return undefined;
  }
  if (sel.kind === "rect" && was.kind === "rect" && now.kind === "rect") {
    const v = was.x1[sel.i];
    const i = v === undefined ? -1 : lowerBound(now.x1, v);
    const part = sel.part !== undefined && sel.part < now.series.length ? sel.part : undefined;
    return now.x1[i] === v && now.shown.includes(i) ? { kind: "rect", i, part } : undefined;
  }
  if (
    (sel.kind === "line" || sel.kind === "area") &&
    was.kind === sel.kind &&
    now.kind === sel.kind
  ) {
    const v = was.x[sel.i];
    const i = v === undefined ? -1 : lowerBound(now.x, v);
    const part = sel.part !== undefined && sel.part < now.series.length ? sel.part : undefined;
    return now.x[i] === v && i >= now.from && i < now.to ? { kind: sel.kind, i, part } : undefined;
  }
  if (
    (sel.kind === "bar" || sel.kind === "point") &&
    was.kind === sel.kind &&
    now.kind === sel.kind
  ) {
    // Categories are unique, so a row is found by its name in any order.
    const name = before.y.type === "band" ? before.y.rows[sel.row] : undefined;
    const row = after.y.type === "band" && name !== undefined ? after.y.rows.indexOf(name) : -1;
    const part = sel.part !== undefined && sel.part < now.series.length ? sel.part : undefined;
    return row === -1 ? undefined : { kind: sel.kind, row, part };
  }
  if (sel.kind === "slope" && was.kind === "slope" && now.kind === "slope") {
    const i = now.columns.indexOf(was.columns[sel.i] ?? "");
    const part = sel.part !== undefined && sel.part < now.series.length ? sel.part : undefined;
    return i === -1 ? undefined : { kind: "slope", i, part };
  }
  if (sel.kind === "scatter" && was.kind === "scatter" && now.kind === "scatter") {
    // A dot's name is unique across the mark, so it is found in any series.
    const name = was.series[sel.series]?.names[sel.i];
    for (let k = 0; k < now.series.length; k++) {
      const i = (now.shown[k] ?? []).find((j) => now.series[k]?.names[j] === name);
      if (i !== undefined) {
        return { kind: "scatter", series: k, i };
      }
    }
    return undefined;
  }
  if (sel.kind === "cell" && was.kind === "cell" && now.kind === "cell") {
    // A column or row is found by its name, or by its bin's low edge.
    const find = (a: CellModel["x"], b: CellModel["x"], i: number) =>
      "names" in a
        ? "names" in b
          ? b.names.indexOf(a.names[i] ?? "")
          : -1
        : "edges" in b && i < a.edges.length - 1
          ? b.edges.slice(0, -1).indexOf(a.edges[i] ?? Number.NaN)
          : -1;
    const row = find(was.y, now.y, sel.row);
    const column = find(was.x, now.x, sel.column);
    return row === -1 || column === -1 ? undefined : { kind: "cell", row, column };
  }
  if (sel.kind === "day" && was.kind === "calendar" && now.kind === "calendar") {
    // A day is found by its date.
    const i = was.day + sel.i - now.day;
    return i >= 0 && i < now.values.length ? { kind: "day", i } : undefined;
  }
  if ((sel.kind === "dot" || sel.kind === "row") && was.kind === "dot" && now.kind === "dot") {
    const name = was.rows[sel.row]?.name;
    // The same name's same occurrence, since rows may come in a new order.
    const nth = was.rows.slice(0, sel.row).filter((r) => r.name === name).length;
    const r = now.rows.findIndex(
      (row, k) =>
        row.name === name && now.rows.slice(0, k).filter((o) => o.name === name).length === nth,
    );
    const row = now.rows[r];
    if (row === undefined) {
      return undefined;
    }
    if (sel.kind === "row") {
      return { kind: "row", row: r };
    }
    const old = was.rows[sel.row];
    const a = old?.x[sel.from];
    const b = old?.x[sel.to - 1];
    if (a === undefined || b === undefined) {
      return undefined;
    }
    const from = Math.max(lowerBound(row.x, a), row.from);
    const to = Math.min(upperBound(row.x, b), row.to);
    return row.x[from] === a && to > from ? { kind: "dot", row: r, from, to } : undefined;
  }
  return undefined;
}

/** What the legend row reads for `sel`. */
export function selectionReading(model: Model, sel: Selection, words: Words): Reading | undefined {
  const m = primaryOf(model);
  if (sel.kind === "rect" && m?.kind === "rect") {
    return bucketReading(model, m, sel.i, words);
  }
  if ((sel.kind === "line" || sel.kind === "area") && sel.kind === m?.kind) {
    return sampleReading(model, m, sel.i, words);
  }
  if (sel.kind === "dot" && m?.kind === "dot") {
    return postReading(model, m, sel.row, sel.from, sel.to, words);
  }
  if (sel.kind === "row" && m?.kind === "dot") {
    return rowReading(model, m, sel.row, words);
  }
  if (sel.kind === "bar" && m?.kind === "bar") {
    return barReading(model, m, sel.row, words);
  }
  if (sel.kind === "point" && m?.kind === "point") {
    return pointReading(model, m, sel.row, words);
  }
  if (sel.kind === "slope" && m?.kind === "slope") {
    return columnReading(model, m, sel.i, words, sel.part);
  }
  if (sel.kind === "scatter" && m?.kind === "scatter") {
    return scatterReading(model, m, sel.series, sel.i, words);
  }
  if (sel.kind === "cell" && m?.kind === "cell") {
    return cellReading(model, m, sel.row, sel.column, words);
  }
  if (sel.kind === "day" && m?.kind === "calendar") {
    return dayReading(model, m, sel.i, words);
  }
  return undefined;
}

/**
 * What announce says for `sel`: with `part` and a series chosen, that one
 * segment, line or bar part through `words.segment`; otherwise the whole reading
 * through `words.reading` (a range plot's `gapReading`, an arrow plot's
 * `changeReading`), or a silent row's `words.silentRow`; then each
 * note joining the stop through `words.noteReading`.
 */
export function spoken(model: Model, sel: Selection, words: Words, part: boolean): string {
  const said = readingWords(model, sel, words, part);
  const notes = noteReadings(model, sel, words);
  if (said === "" || notes === "") {
    return said;
  }
  // A silent row's words end without a full stop, which the notes need before them.
  const silent = sel.kind === "row" && said === selectionReading(model, sel, words)?.at;
  return `${said}${silent ? "." : ""} ${notes}`;
}

// The stop `sel` stands on: a pointer on a step curve's held sample stands on
// the stop holding it, which is where `noteJoin` joins a note.
function stopOf(model: Model, sel: Selection): number | undefined {
  if (sel.kind === "rect" || sel.kind === "slope") {
    return sel.i;
  }
  if (sel.kind !== "line" && sel.kind !== "area") {
    return undefined;
  }
  const m = primaryOf(model);
  return m?.kind === sel.kind && m.step ? stepStopAt(m, sel.i) : sel.i;
}

const joins = (j: Join, sel: Selection, stop: number | undefined): boolean =>
  j.kind === "stop"
    ? stop === j.i
    : j.kind === "post"
      ? sel.kind === "dot" && sel.row === j.row && j.i >= sel.from && j.i < sel.to
      : j.kind === "dot"
        ? sel.kind === "scatter" && sel.series === j.series && sel.i === j.i
        : j.kind === "cell"
          ? sel.kind === "cell" && sel.row === j.row && sel.column === j.column
          : j.kind === "day"
            ? sel.kind === "day" && sel.i === j.i
            : (sel.kind === "row" || sel.kind === "bar" || sel.kind === "point") &&
              sel.row === j.row;

/** Each note joining `sel`'s stop through `words.noteReading`, in spec order. */
function noteReadings(model: Model, sel: Selection, words: Words): string {
  const out: string[] = [];
  const stop = stopOf(model, sel);
  for (const m of model.marks) {
    const j = m.kind === "text" ? noteJoin(model, m) : undefined;
    if (m.kind === "text" && j !== undefined && joins(j, sel, stop)) {
      out.push(words.noteReading(m.text));
    }
  }
  return out.join(" ");
}

function readingWords(model: Model, sel: Selection, words: Words, part: boolean): string {
  const reading = selectionReading(model, sel, words);
  const m = primaryOf(model);
  if (reading === undefined || m === undefined) {
    return "";
  }
  if (sel.kind === "row" && m.kind === "dot") {
    const row = m.rows[sel.row];
    return row === undefined || row.to <= row.from
      ? reading.at
      : words.reading(reading.at, reading.entries[0]?.value ?? "", "");
  }
  if (sel.kind === "bar" && m.kind === "bar") {
    const s = sel.part === undefined ? undefined : m.series[sel.part];
    if (part && s !== undefined) {
      return words.segment(reading.at, s.name, barPart(model, m, s, sel.row, words));
    }
  } else if (sel.kind === "point" && m.kind === "point") {
    const s = sel.part === undefined ? undefined : m.series[sel.part];
    if (part && s !== undefined) {
      return words.segment(reading.at, s.name, pointPart(model, s, sel.row, words));
    }
  } else if (sel.kind === "slope" && m.kind === "slope") {
    const s = sel.part === undefined ? undefined : m.series[sel.part];
    if (part && s !== undefined) {
      return slopeWords(model, m, s, words);
    }
  } else if (sel.kind === "scatter" && m.kind === "scatter") {
    // The dot's series, then each measure; the chips' counts are the chart's, not the dot's.
    const s = m.series[sel.series];
    const parts = [
      ...(m.series.length > 1 ? [s?.name ?? ""] : []),
      measureText(model, "x", s?.x[sel.i] ?? null, words),
      measureText(model, "y", s?.y[sel.i] ?? null, words),
      ...(s?.r === undefined ? [] : [measureText(model, "r", s.r[sel.i] ?? null, words)]),
    ];
    return words.reading(reading.at, parts.join(", "), "");
  } else if (
    (sel.kind === "rect" || sel.kind === "line" || sel.kind === "area") &&
    (m.kind === "rect" || m.kind === "line" || m.kind === "area")
  ) {
    const s = sel.part === undefined ? undefined : m.series[sel.part];
    if (part && s !== undefined) {
      const value =
        m.kind === "rect"
          ? partText(model, m, s, sel.i, words)
          : samplePart(model, m, s, sel.i, words);
      return words.segment(reading.at, s.name, value);
    }
    if (m.kind === "line" && m.series.every((one) => one.y[sel.i] === null)) {
      return words.reading(reading.at, words.noData, "");
    }
  }
  const parts = reading.entries
    .map((e) => (e.name === undefined ? e.value : `${e.name} ${e.value}`))
    .join(", ");
  if (sel.kind === "point" && m.kind === "point" && m.link !== undefined) {
    // A gap at either end leaves the gap or change out, as the legend row's No data says.
    const frame = m.link === "range" ? words.gapReading : words.changeReading;
    return pointLink(m, sel.row) === null
      ? words.reading(reading.at, parts, "")
      : frame(reading.at, parts, reading.total ?? "");
  }
  return words.reading(reading.at, parts, reading.total ?? "");
}

// A chosen slope series, both its ends and its change, which a missing end leaves out.
function slopeWords(model: Model, m: SlopeModel, s: SlopeModel["series"][number], words: Words) {
  const parts = m.columns
    .map((c, i) => {
      const v = s.y[i] ?? null;
      return `${c} ${v === null ? words.noData : model.yText(v)}`;
    })
    .join(", ");
  const change = slopeChange(s);
  return change === null
    ? words.reading(s.name, parts, "")
    : words.changeReading(s.name, parts, changeText(model, change));
}
