/**
 * select.ts — what a chart's selection is and how it moves: the keys'
 * stops for each mark, the pointer's pick, the selection kept across an
 * update, and what the legend row reads and announce says for it.
 * @module
 */

import { lowerBound, upperBound } from "../scale/reduce.js";

import { dotGroups, snap, type DotGroup, type Frame } from "./geometry.js";
import type { Layout } from "./layout.js";
import { noteJoin, type Join } from "./notes.js";
import type { BarModel, DotModel, Model, RectModel, SampleModel } from "./model.js";
import { barsApart } from "./model.js";
import {
  barPart,
  barReading,
  bucketReading,
  partText,
  postReading,
  primaryOf,
  rowReading,
  samplePart,
  sampleReading,
  type Reading,
} from "./readout.js";
import { stepStopAt, stepStops } from "./table.js";
import type { Words } from "./words.js";

/**
 * A bucket or a sample, with one series (`part`) when Up or Down chose it;
 * the posts `[from, to)` of a dot row; a dot row as a whole; or a bar row,
 * with one series (`part`) when Left or Right chose it.
 */
export type Selection =
  | { readonly kind: "rect"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "line"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "area"; readonly i: number; readonly part: number | undefined }
  | { readonly kind: "dot"; readonly row: number; readonly from: number; readonly to: number }
  | { readonly kind: "row"; readonly row: number }
  | { readonly kind: "bar"; readonly row: number; readonly part: number | undefined };

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

/** How far a pointer reaches for a dot in its row, in px. */
const REACH = 40;
/** One x tick's room when the axis draws fewer than two ticks, in px. */
const TICK_FALLBACK = 80;
/** Page Up and Page Down move a band chart's selection this many rows. */
const PAGE_ROWS = 10;

const bandRows = (model: Model): number => (model.y.type === "band" ? model.y.rows.length : 0);

/** A bucket's drawn extent in plot px, low to high, before its insets. */
function bucketSpan(m: RectModel, i: number, f: Frame): readonly [number, number] {
  const a = f.xAt(Math.max(m.x1[i] ?? 0, f.x.drawnLo));
  const b = f.xAt(Math.min(m.x2[i] ?? 0, f.x.hi));
  return a <= b ? [a, b] : [b, a];
}

const lineStops = (m: SampleModel): number[] =>
  m.step ? stepStops(m) : Array.from({ length: m.to - m.from }, (_, k) => m.from + k);

/** The selection focus gives a chart that has none yet: the newest x, on
 *  a timeline the first row's last post, or that row when it is silent, or
 *  a bar chart's first row, whole. */
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
      return bandRows(model) > 0 ? { kind: "bar", row: 0, part: undefined } : undefined;
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

/** The parts of a bucket or sample in Up order: the series in series order
 *  (bottom to top in a stack, left to right in a group), or the lines with a
 *  value there by value, ties in series order. */
function partsAt(m: RectModel | SampleModel, i: number): number[] {
  const all = m.series.map((_, k) => k);
  if (m.kind !== "line") {
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
 * Where `key` moves a bar row selection over `rows` rows: Up and Down, Home,
 * End and the Page keys through the rows, keeping the chosen part; Left and
 * Right through the row's parts in series order, from the whole row to its
 * first or last, the other way when `reverse` lays them right to left. One
 * series has no parts to choose.
 */
function moveBar(
  m: BarModel,
  rows: number,
  sel: Selection & { kind: "bar" },
  key: Key,
  reverse: boolean,
): Selection | undefined {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const n = m.series.length;
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
  /** What a pointer at plot px `(px, py)` selects. */
  pick(px: number, py: number): Selection | undefined;
  /** The crosshair's px along x, absent for a row selection. */
  crosshair(sel: Selection): number | undefined;
  /** A touch drag moves the selection; on a bar chart only a tap does,
   *  since a vertical drag is the page's scroll. */
  readonly drags: boolean;
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
      if (m.kind === "bar") {
        // Bars one under another keep series order on a reversed x; a
        // stack's segments and a split's panels run with it.
        const along = f.x.reverse && (!barsApart(m) || f.panels !== undefined);
        return sel.kind === "bar" ? moveBar(m, bandRows(model), sel, key, along) : undefined;
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
        case "bar": {
          // The row whose band holds the pointer, anywhere across the plot's
          // width: on a phone a row's name sits above its bar, inside its band.
          const n = lay.rows.length;
          if (n === 0) {
            return undefined;
          }
          const r = Math.floor((py / f.height) * n);
          return { kind: "bar", row: Math.min(Math.max(r, 0), n - 1), part: undefined };
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
    drags: m?.kind !== "bar",
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
  if (sel.kind === "bar" && was.kind === "bar" && now.kind === "bar") {
    // Categories are unique, so a row is found by its name in any order.
    const name = before.y.type === "band" ? before.y.rows[sel.row] : undefined;
    const row = after.y.type === "band" && name !== undefined ? after.y.rows.indexOf(name) : -1;
    const part = sel.part !== undefined && sel.part < now.series.length ? sel.part : undefined;
    return row === -1 ? undefined : { kind: "bar", row, part };
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
  return undefined;
}

/**
 * What announce says for `sel`: with `part` and a series chosen, that one
 * segment, line or bar part through `words.segment`; otherwise the whole reading
 * through `words.reading`, or a silent row's `words.silentRow`; then each
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
  if (sel.kind === "rect") {
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
      : sel.kind === "row" && sel.row === j.row;

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
  return words.reading(reading.at, parts, reading.total ?? "");
}
