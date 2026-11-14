/**
 * geometry.ts — the SVG path of each mark inside a plot `width` by `height`
 * px, y down: rects with their gaps, lines and areas reduced per device
 * pixel and cut at the plot's ends, rows of dots, bars and points along
 * their rows, a slope's lines and ends, a scatter's dots, rules and the
 * axis lines.
 * @module
 */

import { reduce, upperBound, type Point } from "../scale/reduce.js";

import {
  barsApart,
  barTotal,
  barValue,
  drawnTotal,
  drawnValue,
  sampleValue,
  type AreaModel,
  type BarModel,
  type DotRowModel,
  type LineModel,
  type PointModel,
  type RectModel,
  type SampleModel,
  type ScatterModel,
  type SlopeModel,
} from "./model.js";
import type { Continuous } from "./scales.js";

/** The px a device pixel grid is snapped to at `dpr`. */
export const snap = (v: number, dpr: number): number => Math.round(v * dpr) / dpr;

/** A path number, to the hundredth of a px. */
export const num = (v: number): string => String(Math.round(v * 100) / 100);

/** The plot's size, its device pixel ratio, and its scales mapped to px. */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly x: Continuous;
  readonly xAt: (v: number) => number;
  readonly yAt: (v: number) => number;
  /** A split or mirrored bar chart's panels, one per series in series
   *  order; absent once a split folds into one panel under 30rem. */
  readonly panels?: readonly Panel[];
  /** A bubble chart's largest radius, in px. */
  readonly bubble?: number;
}

/** A bar chart's panel: its left and right px in the plot, its share of
 *  the chart's one x scale mapped into it, and whether its bars run
 *  leftward from their baseline at `at(0)`. */
export interface Panel {
  readonly left: number;
  readonly right: number;
  readonly at: (v: number) => number;
  readonly leftward: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The gap between neighbouring buckets and between stacked segments. */
const GAP = 1;
/** A segment shorter than this keeps its whole height, with no gap below. */
const GAP_MIN = 3;

/** Bucket `i`'s left and right px: cut at the plot's ends, snapped to
 *  device px, and as bars inset half the gap a side unless that leaves
 *  under 1 px of bar. */
export function bucketEdges(
  m: RectModel,
  i: number,
  f: Frame,
): { readonly left: number; readonly right: number } {
  const s = bucketSpan(m, i, f);
  let { left, right } = s;
  if (m.shape === "bars" && right - left - GAP >= 1) {
    left += s.cutLeft ? 0 : GAP / 2;
    right -= s.cutRight ? 0 : GAP / 2;
  }
  return { left: snap(left, f.dpr), right: snap(right, f.dpr) };
}

// Bucket `i`'s px cut at the plot's ends, and which side was cut at the
// domain's end, where there is no neighbour to leave a gap for.
function bucketSpan(m: RectModel, i: number, f: Frame) {
  const x1 = m.x1[i] ?? 0;
  const x2 = m.x2[i] ?? 0;
  const a = f.xAt(Math.max(x1, f.x.drawnLo));
  const b = f.xAt(Math.min(x2, f.x.hi));
  const [cutA, cutB] = [x1 < f.x.drawnLo, x2 > f.x.hi];
  const flip = a > b;
  return {
    left: clamp(Math.min(a, b), 0, f.width),
    right: clamp(Math.max(a, b), 0, f.width),
    cutLeft: flip ? cutB : cutA,
    cutRight: flip ? cutA : cutB,
  };
}

/** A group's inset a side, as a share of its bucket's width. */
const GROUP_INSET = 0.125;
/** A sub-column under this gives up the group's spaces, widest first. */
const SUB_MIN = 2;

/**
 * Bucket `i`'s sub-columns in a group, one per series of `m` in series
 * order from the left, snapped to device px. Each group is inset by the
 * larger of 0.5 px and 12.5 % of the bucket a side, sub-columns 1 px apart.
 * Under 2 px a sub-column, the inset drops to 0.5 px, then the inner gaps
 * go; the 1 px between groups goes last, under 1 px a sub-column, so the
 * space between groups is never less than the space inside one.
 */
export function groupEdges(
  m: RectModel,
  i: number,
  f: Frame,
): { readonly left: number; readonly right: number }[] {
  const s = bucketSpan(m, i, f);
  const n = m.series.length;
  const width = s.right - s.left;
  const sides = (s.cutLeft ? 0 : 1) + (s.cutRight ? 0 : 1);
  const sub = (inset: number, inner: number) => (width - inset * sides - inner * (n - 1)) / n;
  const half = GAP / 2;
  const tries: [number, number][] = [
    [Math.max(half, GROUP_INSET * width), GAP],
    [half, GAP],
  ];
  const [first, inner] = tries.find(([a, b]) => sub(a, b) >= SUB_MIN) ?? [half, 0];
  const inset = inner === 0 && sub(half, 0) < 1 ? 0 : first;
  const w = sub(inset, inner);
  const start = s.left + (s.cutLeft ? 0 : inset);
  return m.series.map((_, k) => {
    const left = start + k * (w + inner);
    return { left: snap(left, f.dpr), right: snap(left + w, f.dpr) };
  });
}

/**
 * One path per series of `m`, every shown bucket's segment a rectangle,
 * stacked in series order from the baseline (under "share" each its share
 * of the bucket), or under "group" each its sub-column from the baseline.
 * A `null` counts as 0 and draws nothing. Each segment over another gives
 * up its bottom px as the gap, unless it is under 3 px tall, so a stack's
 * top stays at its total. Under shape "area" each run of touching buckets
 * is one shape instead (`stepAreaPaths`).
 */
export function rectPaths(m: RectModel, f: Frame): string[] {
  if (m.shape === "area") {
    return stepAreaPaths(m, f);
  }
  const paths = m.series.map(() => "");
  const box = (k: number, left: number, right: number, top: number, bottom: number) => {
    paths[k] =
      `${paths[k] ?? ""}M${num(left)} ${num(top)}H${num(right)}V${num(bottom)}H${num(left)}Z`;
  };
  for (const i of m.shown) {
    if (m.arrange === "group") {
      const subs = groupEdges(m, i, f);
      const bottom = clamp(f.yAt(0), 0, f.height);
      m.series.forEach((s, k) => {
        const v = s.y[i] ?? 0;
        const sub = subs[k];
        const top = clamp(f.yAt(v), 0, f.height);
        if (v > 0 && sub !== undefined && sub.right > sub.left && bottom > top) {
          box(k, sub.left, sub.right, top, bottom);
        }
      });
      continue;
    }
    const { left, right } = bucketEdges(m, i, f);
    if (right <= left) {
      continue;
    }
    let base = 0;
    let below = false;
    m.series.forEach((s, k) => {
      const v = drawnValue(m, s, i);
      if (v <= 0) {
        return;
      }
      const bottom = clamp(f.yAt(base), 0, f.height);
      base += v;
      const top = clamp(f.yAt(base), 0, f.height);
      const tall = bottom - top;
      const end = below && tall >= GAP_MIN ? bottom - GAP : bottom;
      below = true;
      if (end > top) {
        box(k, left, right, top, end);
      }
    });
  }
  return paths;
}

/** One bucket of a run: the px of its x1 and x2 sides and its segment's top and bottom. */
interface Step {
  readonly from: number;
  readonly to: number;
  readonly top: number;
  readonly bottom: number;
}

// A run as one closed outline: up its first side, along each bucket's top
// with a vertical step at each shared edge, down its last side and back
// along the bottoms, so touching buckets meet inside one path with no seam.
function outline(run: readonly Step[]): string {
  const first = run[0];
  if (first === undefined) {
    return "";
  }
  let d = `M${num(first.from)} ${num(first.bottom)}`;
  for (const s of run) {
    d += `V${num(s.top)}H${num(s.to)}`;
  }
  for (let j = run.length - 1; j >= 0; j--) {
    const s = run[j];
    d += s === undefined ? "" : `V${num(s.bottom)}H${num(s.from)}`;
  }
  return `${d}Z`;
}

/**
 * The step area: one path per series of `m`, each run of shown buckets that
 * touch (one's x2 is the next one's x1) and where the series draws above 0
 * one closed shape, stacked as `rectPaths` stacks bars and flush at each
 * shared edge. A 0, a `null` or a gap in x ends the run.
 */
function stepAreaPaths(m: RectModel, f: Frame): string[] {
  const paths = m.series.map(() => "");
  const runs: Step[][] = m.series.map(() => []);
  const end = (k: number) => {
    paths[k] = `${paths[k] ?? ""}${outline(runs[k] ?? [])}`;
    runs[k] = [];
  };
  let prev: number | undefined;
  for (const i of m.shown) {
    const touching = prev !== undefined && m.x2[prev] === m.x1[i];
    prev = i;
    const { left, right } = bucketEdges(m, i, f);
    const [from, to] = f.x.reverse ? [right, left] : [left, right];
    let base = 0;
    let below = false;
    m.series.forEach((s, k) => {
      const v = drawnValue(m, s, i);
      if (!touching || v <= 0) {
        end(k);
      }
      if (v <= 0) {
        return;
      }
      const bottom = clamp(f.yAt(base), 0, f.height);
      base += v;
      const top = clamp(f.yAt(base), 0, f.height);
      const gap = below && bottom - top >= GAP_MIN ? GAP : 0;
      below = true;
      runs[k]?.push({ from, to, top, bottom: bottom - gap });
    });
  }
  m.series.forEach((_, k) => {
    end(k);
  });
  return paths;
}

// Keeps the part of a run's polyline between 0 and `width` along u, which
// never decreases, so one run gives one piece.
function cut(points: readonly Point[], width: number): Point[] {
  const out: Point[] = [];
  points.forEach((q, k) => {
    const p = points[k - 1];
    if (p !== undefined && p.x !== q.x) {
      for (const edge of [0, width]) {
        if ((p.x - edge) * (q.x - edge) < 0) {
          const t = (edge - p.x) / (q.x - p.x);
          out.push({ x: edge, y: p.y + (q.y - p.y) * t });
        }
      }
    }
    if (q.x >= 0 && q.x <= width) {
      out.push(q);
    }
  });
  return out;
}

// The samples a path reads (those inside the domain and the one beyond each
// end) and each one's px along u, which runs left to right whichever way x
// does, for the reduction.
function placed(m: SampleModel, f: Frame) {
  // A log x cannot place a sample at or below 0: a straight line then starts
  // at its first sample inside the domain, and a step line holds that
  // sample's value from just left of the plot, where u is -1.
  const unplaced = (i: number) => f.x.type === "log" && (m.x[i] ?? 0) <= 0;
  const before = m.from > 0 && (m.step || !unplaced(m.from - 1));
  const from = before ? m.from - 1 : m.from;
  const to = Math.min(m.to + 1, m.x.length);
  const flip = f.x.reverse;
  const u = (v: number) => (flip ? f.width - f.xAt(v) : f.xAt(v));
  const us = Array.from(m.x, (v, i) =>
    i >= from && i < to ? (i === from && unplaced(i) ? -1 : u(v)) : 0,
  );
  return { from, to, us, flip };
}

// A reduced run in plot px as drawn: in steps held until the next sample
// when `step`, cut where the plot ends.
function piece(run: readonly Point[], step: boolean, width: number): Point[] {
  const points: Point[] = [];
  run.forEach((p, k) => {
    const before = run[k - 1];
    if (step && before !== undefined) {
      // A held value inside the run only continues the horizontal.
      if (before.y === p.y && k < run.length - 1) {
        return;
      }
      points.push({ x: p.x, y: before.y });
    }
    points.push(p);
  });
  return cut(points, width);
}

/**
 * Series `s` of `m` as one path: the samples inside the domain and the one
 * beyond each end, reduced per device pixel column, in steps held until the
 * next sample when `m.step`, cut where the plot ends, broken at each gap. A
 * lone sample is a zero-length segment, which a round cap draws as a dot.
 */
export function linePath(m: LineModel, s: number, f: Frame): string {
  const ys = m.series[s]?.y ?? [];
  const { from, to, us, flip } = placed(m, f);
  const runs = reduce(us, ys, from, to, 1 / f.dpr, f.width);
  let d = "";
  for (const run of runs) {
    const drawn = piece(
      run.map((p) => ({ x: p.x, y: f.yAt(p.y) })),
      m.step,
      f.width,
    );
    if (drawn.length === 0) {
      continue;
    }
    const at = drawn.map((p) => `${num(flip ? f.width - p.x : p.x)} ${num(p.y)}`);
    d += `M${at.join("L")}${at.length === 1 ? `L${at[0] ?? ""}` : ""}`;
  }
  return d;
}

// The device pixel column `reduce` gives each sample of `[from, to)`, by its
// rule: after a gap, a run starts past the column the run before it ended in.
function columnsOf(
  us: readonly number[],
  gap: (i: number) => boolean,
  from: number,
  to: number,
  width: number,
): number[] {
  const out: number[] = [];
  let after = Number.NEGATIVE_INFINITY;
  let col = Number.NaN;
  for (let i = from; i < to; i++) {
    if (gap(i)) {
      if (!Number.isNaN(col)) {
        after = col;
        col = Number.NaN;
      }
      continue;
    }
    col = Math.max(Math.floor((us[i] ?? 0) / width), after + 1);
    out[i] = col;
  }
  return out;
}

/**
 * One path per series of area `m`: the layer between its stack's top and the
 * top below it (the baseline for the first), one closed shape per run between
 * gaps, stacked under "share" from each sample's shares; a sample whose stack
 * is not drawn (`drawnTotal`) breaks every layer. Each boundary
 * is reduced per device pixel column as a line is, so a layer's bottom is the
 * edge below it, raised by the 1 px gap in each column where the layer is at
 * least 3 px tall at every sample and stands on a stack above 0.
 */
export function areaPaths(m: AreaModel, f: Frame): string[] {
  const { from, to, us, flip } = placed(m, f);
  const w = 1 / f.dpr;
  const tops: (number | null)[][] = m.series.map(() => []);
  for (let i = from; i < to; i++) {
    let base = 0;
    m.series.forEach((s, k) => {
      const v = sampleValue(m, s, i);
      base += v ?? 0;
      const top = tops[k];
      if (top !== undefined) {
        top[i] = v === null ? null : base;
      }
    });
  }
  const gap = (i: number) => drawnTotal(m, i) === null;
  const cols = columnsOf(us, gap, from, to, w);
  const at = (p: Point) => `${num(flip ? f.width - p.x : p.x)} ${num(p.y)}`;
  return m.series.map((_, k) => {
    const top = tops[k] ?? [];
    const below = tops[k - 1];
    const topPx: (number | null)[] = [];
    const bottomPx: (number | null)[] = [];
    // Whether every sample in each column keeps the gap.
    const keeps = new Map<number, boolean>();
    for (let i = from; i < to; i++) {
      const v = top[i] ?? null;
      const under = below === undefined ? 0 : (below[i] ?? null);
      if (v === null || under === null) {
        topPx[i] = null;
        bottomPx[i] = null;
        continue;
      }
      topPx[i] = f.yAt(v);
      bottomPx[i] = f.yAt(under);
      const c = cols[i] ?? 0;
      const ok = under > 0 && f.yAt(under) - f.yAt(v) >= GAP_MIN;
      keeps.set(c, (keeps.get(c) ?? true) && ok);
    }
    for (let i = from; i < to; i++) {
      const b = bottomPx[i];
      if (b !== null && b !== undefined && keeps.get(cols[i] ?? 0) === true) {
        bottomPx[i] = b - GAP;
      }
    }
    const upper = reduce(us, topPx, from, to, w, f.width);
    const lower = reduce(us, bottomPx, from, to, w, f.width);
    let d = "";
    upper.forEach((run, r) => {
      const a = piece(run, m.step, f.width);
      const b = piece(lower[r] ?? [], m.step, f.width);
      // A lone sample has no width to fill.
      if (a.length > 1 && b.length > 1) {
        d += `M${[...a, ...b.reverse()].map(at).join("L")}Z`;
      }
    });
    return d;
  });
}

// Where row `i` of a diverging `m` starts left of 0: its left series' sum
// and half its centre series' value, each a `null` as 0.
function divergeStart(m: BarModel, i: number): number {
  let start = m.centre ? -(m.series[m.left]?.x[i] ?? 0) / 2 : 0;
  for (const s of m.series.slice(0, m.left)) {
    start -= s.x[i] ?? 0;
  }
  return start;
}

/** Row `i`'s reach of `m` along x, each end 0 without a value past it: a
 *  stack's sums of its negative and of its positive values, a diverging
 *  row's left and right extents, or the lowest and highest value of bars
 *  standing apart. */
export function barReach(m: BarModel, i: number): { readonly lo: number; readonly hi: number } {
  if (m.arrange === "diverge") {
    const lo = divergeStart(m, i);
    return { lo, hi: lo + (barTotal(m, i) ?? 0) };
  }
  let lo = 0;
  let hi = 0;
  for (const s of m.series) {
    const v = barValue(m, s, i);
    if (barsApart(m)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    } else if (v < 0) {
      lo += v;
    } else {
      hi += v;
    }
  }
  return { lo, hi };
}

/** A grouped row's bars are this share of a bar's thickness, 1 px apart. */
const SUB_BAR = 0.75;

/** The px across a row that `m`'s bars of `thick` px take: one bar, or the
 *  bars of a group or a folded split and the 1 px between them. A split in
 *  panels takes one bar's `thick`. */
export const barBlock = (m: BarModel, thick: number): number =>
  barsApart(m) ? m.series.length * thick * SUB_BAR + (m.series.length - 1) * GAP : thick;

/** The centre across its row of series `k`'s bar in a row of `m` centred
 *  at `cy`: `cy` itself unless the row's bars stand one under another, as
 *  a group's and a folded split's do; a split in panels keeps `cy`. */
export function barCentre(m: BarModel, k: number, cy: number, thick: number): number {
  if (!barsApart(m)) {
    return cy;
  }
  const sub = thick * SUB_BAR;
  return cy - barBlock(m, thick) / 2 + k * (sub + GAP) + sub / 2;
}

/** A bar segment's px: left to right along x, top to bottom across its row. */
export interface Segment {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

// The px a bar may fill along `at`: the domain's span, so a bar crossing a
// passed domain's end is cut there, short of the room kept for value labels
// and notes, where its label then sits.
function barSpan(f: Frame, at: (v: number) => number): readonly [number, number] {
  const [a, b] = [at(f.x.lo), at(f.x.hi)];
  return [Math.min(a, b), Math.max(a, b)];
}

/** Row `i`'s segments of `m`, one per series, absent where it draws nothing
 *  (a `null` counts as 0): centred on `cy`, `thick` px across, snapped to
 *  device px. Values stack from 0 in series order, rightward above it and
 *  leftward below; a segment beyond another gives up its first px toward 0
 *  as the gap unless under 3 px long, so a stack ends at its sum. "diverge"
 *  stacks through `divergeSegments`; "split" and "mirror" run each bar from
 *  0 in its panel of `f.panels`; "group" and a folded split from 0 at
 *  `barCentre`. */
export function barSegments(
  m: BarModel,
  i: number,
  f: Frame,
  cy: number,
  thick: number,
): (Segment | undefined)[] {
  const panels = m.arrange === "split" || m.arrange === "mirror" ? f.panels : undefined;
  if (panels !== undefined) {
    const top = snap(cy - thick / 2, f.dpr);
    const bottom = snap(cy + thick / 2, f.dpr);
    return m.series.map((s, k) => {
      const p = panels[k];
      const v = s.x[i] ?? 0;
      if (p === undefined || v === 0) {
        return undefined;
      }
      const [a, b] = [p.at(0), p.at(v)];
      const [lo, hi] = barSpan(f, p.at);
      const left = clamp(Math.min(a, b), lo, hi);
      const right = clamp(Math.max(a, b), lo, hi);
      return right > left ? { left, right, top, bottom } : undefined;
    });
  }
  const [lo, hi] = barSpan(f, f.xAt);
  if (barsApart(m)) {
    const half = (thick * SUB_BAR) / 2;
    return m.series.map((s, k) => {
      const v = s.x[i] ?? 0;
      const c = barCentre(m, k, cy, thick);
      const [a, b] = [f.xAt(0), f.xAt(v)];
      const left = clamp(Math.min(a, b), lo, hi);
      const right = clamp(Math.max(a, b), lo, hi);
      return v !== 0 && right > left
        ? { left, right, top: snap(c - half, f.dpr), bottom: snap(c + half, f.dpr) }
        : undefined;
    });
  }
  const top = snap(cy - thick / 2, f.dpr);
  const bottom = snap(cy + thick / 2, f.dpr);
  if (m.arrange === "diverge") {
    return divergeSegments(m, i, f, top, bottom);
  }
  const base = { lo: 0, hi: 0 };
  const drawn = { lo: false, hi: false };
  return m.series.map((s) => {
    const v = barValue(m, s, i);
    if (v === 0) {
      return undefined;
    }
    const side = v < 0 ? "lo" : "hi";
    let a = f.xAt(base[side]);
    base[side] += v;
    const b = f.xAt(base[side]);
    if (drawn[side] && Math.abs(b - a) >= GAP_MIN) {
      a += Math.sign(b - a) * GAP;
    }
    drawn[side] = true;
    const left = clamp(Math.min(a, b), lo, hi);
    const right = clamp(Math.max(a, b), lo, hi);
    return right > left ? { left, right, top, bottom } : undefined;
  });
}

// A diverging row's segments: the left series outward from 0 (or from the
// centre series' left half), the last of them nearest it, then the rest
// outward on the right. Each segment beyond a drawn one gives up its px
// toward 0 as the gap unless it is under 3 px long, so each side ends at
// its sum; at 0 the right side gives it, and the zero line shows there.
function divergeSegments(
  m: BarModel,
  i: number,
  f: Frame,
  top: number,
  bottom: number,
): (Segment | undefined)[] {
  const out: (Segment | undefined)[] = m.series.map(() => undefined);
  const [lo, hi] = barSpan(f, f.xAt);
  const value = (k: number) => m.series[k]?.x[i] ?? 0;
  const half = m.centre ? value(m.left) / 2 : 0;
  const centred = half > 0;
  const place = (k: number, inner: number, outer: number, drawn: boolean) => {
    let a = f.xAt(inner);
    const b = f.xAt(outer);
    if (drawn && Math.abs(b - a) >= GAP_MIN) {
      a += Math.sign(b - a) * GAP;
    }
    const left = clamp(Math.min(a, b), lo, hi);
    const right = clamp(Math.max(a, b), lo, hi);
    out[k] = right > left ? { left, right, top, bottom } : undefined;
  };
  if (centred) {
    place(m.left, -half, half, false);
  }
  let at = -half;
  let drawn = centred;
  for (let k = m.left - 1; k >= 0; k--) {
    const v = value(k);
    if (v > 0) {
      place(k, at, at - v, drawn);
      at -= v;
      drawn = true;
    }
  }
  at = half;
  for (let k = m.left + (m.centre ? 1 : 0); k < m.series.length; k++) {
    const v = value(k);
    if (v > 0) {
      place(k, at, at + v, drawn);
      at += v;
      drawn = true;
    }
  }
  return out;
}

/** A path in its series slot, the rectangles of every segment it fills. */
interface BarPath {
  readonly slot: number;
  readonly d: string;
}

/** One path per series of `m` in series order, each row's segment a
 *  rectangle (`barSegments`) on the bar centred at that row's `ys` entry,
 *  then for a series whose `below` slot is not its own a path of its
 *  segments below 0 in that slot. */
export function barPaths(m: BarModel, ys: readonly number[], thick: number, f: Frame): BarPath[] {
  const paths = m.series.map(() => ["", ""]);
  ys.forEach((cy, i) => {
    barSegments(m, i, f, cy, thick).forEach((g, k) => {
      const s = m.series[k];
      const p = paths[k];
      if (g !== undefined && s !== undefined && p !== undefined) {
        const side = s.below !== s.slot && (s.x[i] ?? 0) < 0 ? 1 : 0;
        p[side] =
          `${p[side] ?? ""}M${num(g.left)} ${num(g.top)}H${num(g.right)}V${num(g.bottom)}H${num(g.left)}Z`;
      }
    });
  });
  const out = m.series.map((s, k) => ({ slot: s.slot, d: paths[k]?.[0] ?? "" }));
  m.series.forEach((s, k) => {
    if (s.below !== s.slot) {
      out.push({ slot: s.below, d: paths[k]?.[1] ?? "" });
    }
  });
  return out;
}

/** One drawn dot of a row: its centre's px and the dots `[from, to)` it stands for. */
export interface DotGroup {
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/** The drawn dots of `row`: its dots inside the domain, those that fall in
 *  one device pixel column drawn once. */
export function dotGroups(row: DotRowModel, f: Frame): DotGroup[] {
  const groups: DotGroup[] = [];
  let column = Number.NaN;
  for (let i = row.from; i < row.to; i++) {
    const at = snap(f.xAt(row.x[i] ?? 0), f.dpr);
    const last = groups.at(-1);
    if (last !== undefined && at === column) {
      groups[groups.length - 1] = { ...last, to: i + 1 };
    } else {
      groups.push({ at, from: i, to: i + 1 });
      column = at;
    }
  }
  return groups;
}

/** `groups` as one path of zero-length segments on the line at `cy`, each
 *  a dot of radius 3 under the 6 px round-capped stroke `chart.css` gives it. */
export function dotPath(groups: readonly DotGroup[], cy: number): string {
  const y = num(cy);
  return groups.map((g) => `M${num(g.at)} ${y}h0`).join("");
}

/** A 1 px line across the plot at `y`, on whole device pixels. */
export const hairline = (y: number, width: number, dpr: number): string =>
  `M0 ${num(snap(y, dpr) + 0.5)}H${num(width)}`;

/** A point mark's dot radius, under the 10 px round-capped stroke
 *  `chart.css` gives it: larger than a timeline's, since each is a value
 *  the reader compares. */
export const POINT_RADIUS = 5;

/** Series `k`'s dot in row `i` of `m`: its centre's px along x, snapped to
 *  device px, or undefined at a gap or outside the domain. */
export function pointAt(m: PointModel, k: number, i: number, f: Frame): number | undefined {
  const v = m.series[k]?.x[i] ?? null;
  return v === null || v < f.x.lo || v > f.x.hi ? undefined : snap(f.xAt(v), f.dpr);
}

/** One path per series of `m` in series order, each row's dot a zero-length
 *  segment on the row's line at that row's `ys` entry, so a later series'
 *  dot lies over an earlier one where they meet. */
export function pointPaths(m: PointModel, ys: readonly number[], f: Frame): string[] {
  return m.series.map((_, k) =>
    ys
      .map((cy, i) => {
        const at = pointAt(m, k, i, f);
        return at === undefined ? "" : `M${num(at)} ${num(snap(cy, f.dpr) + 0.5)}h0`;
      })
      .join(""),
  );
}

/** An arrow plot's head length, 8 px, the room it needs between its two
 *  dots' edges. */
const ARROW_HEAD = 8;

// Each row's two drawn dots of `m` with their row's line, in series order;
// none where either is not drawn.
function linked(m: PointModel, ys: readonly number[], f: Frame) {
  const out: { a: number; b: number; y: number }[] = [];
  ys.forEach((cy, i) => {
    const a = pointAt(m, 0, i, f);
    const b = pointAt(m, 1, i, f);
    if (a !== undefined && b !== undefined) {
      out.push({ a, b, y: snap(cy, f.dpr) + 0.5 });
    }
  });
  return out;
}

/** A range plot's links, a line between each row's two drawn dots. */
export const rangePath = (m: PointModel, ys: readonly number[], f: Frame): string =>
  linked(m, ys, f)
    .map(({ a, b, y }) => `M${num(a)} ${num(y)}H${num(b)}`)
    .join("");

/** An arrow plot's shafts and heads: from the first dot's edge to the
 *  second's, the last `ARROW_HEAD` px a head as wide as it is long; none in
 *  a row whose dots' edges stand under `ARROW_HEAD` px apart. */
export function arrowPaths(
  m: PointModel,
  ys: readonly number[],
  f: Frame,
): { shafts: string; heads: string } {
  let shafts = "";
  let heads = "";
  for (const { a, b, y } of linked(m, ys, f)) {
    const dir = Math.sign(b - a);
    if (Math.abs(b - a) < 2 * POINT_RADIUS + ARROW_HEAD) {
      continue;
    }
    const tip = b - dir * POINT_RADIUS;
    const base = tip - dir * ARROW_HEAD;
    const half = ARROW_HEAD / 2;
    shafts += `M${num(a + dir * POINT_RADIUS)} ${num(y)}H${num(base)}`;
    heads += `M${num(tip)} ${num(y)}L${num(base)} ${num(y - half)}V${num(y + half)}Z`;
  }
  return { shafts, heads };
}

/** A slope end's radius, the half of chart.css's 8 px round cap. */
export const SLOPE_RADIUS = 4;

/** Series `k`'s two ends of slope `m`, left then right, in plot px: its
 *  columns at the plot's edges, each `undefined` at a `null` end. */
export function slopeEnds(m: SlopeModel, k: number, f: Frame): (Point | undefined)[] {
  return [0, 1].map((c) => {
    const v = m.series[k]?.y[c] ?? null;
    return v === null ? undefined : { x: f.xAt(c), y: f.yAt(v) };
  });
}

/** Each series of `m` in series order: its line between its two ends, none
 *  with a `null` end, and its ends as zero-length segments. */
export function slopePaths(m: SlopeModel, f: Frame): { lines: string[]; ends: string[] } {
  const lines: string[] = [];
  const ends: string[] = [];
  m.series.forEach((_, k) => {
    const [a, b] = slopeEnds(m, k, f);
    lines.push(
      a === undefined || b === undefined ? "" : `M${num(a.x)} ${num(a.y)}L${num(b.x)} ${num(b.y)}`,
    );
    ends.push(
      [a, b]
        .filter((p): p is Point => p !== undefined)
        .map((p) => `M${num(p.x)} ${num(p.y)}h0`)
        .join(""),
    );
  });
  return { lines, ends };
}

/** A scatter dot's radius: one more than a timeline's, since each dot is
 *  an item the reader looks for. */
export const SCATTER_RADIUS = 4;

/** Dot `i` of series `k` of `m`, its centre in plot px; undefined for a
 *  dot `m` does not show. */
export function scatterAt(m: ScatterModel, k: number, i: number, f: Frame): Point | undefined {
  const s = m.series[k];
  const x = s?.x[i] ?? null;
  const y = s?.y[i] ?? null;
  return x === null || y === null ? undefined : { x: f.xAt(x), y: f.yAt(y) };
}

/** A bubble chart's largest radius from 30rem up, and under it, as
 *  Datawrapper shrinks its symbols on a small screen. */
export const BUBBLE_RADIUS = 24;
export const BUBBLE_RADIUS_NARROW = 12;

/** The radius of dot `i` of series `k` of `m`: a plain dot's, or a
 *  bubble's, its area proportional to its r from 0 (Plot's square-root
 *  scale), at least 0.5 px above 0 so it draws 1 px wide, and none at 0. */
export function dotRadius(m: ScatterModel, k: number, i: number, f: Pick<Frame, "bubble">): number {
  if (m.size === undefined) {
    return SCATTER_RADIUS;
  }
  const v = m.series[k]?.r?.[i] ?? 0;
  return v > 0 ? Math.max((f.bubble ?? 0) * Math.sqrt(v / m.size.hi), 0.5) : 0;
}

// A closed circle of radius r from its left end, so its outline joins
// where it starts.
const arcs = (r: number): string =>
  `a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0Z`;
const SCATTER_ARCS = arcs(SCATTER_RADIUS);
const circle = (c: Point, r: number, tail = arcs(r)): string =>
  `M${num(c.x - r)} ${num(c.y)}${tail}`;

/** A path of bubbles in one slot. */
export interface BubblePath {
  readonly slot: number;
  readonly d: string;
}

/**
 * `m`'s bubbles as paths in paint order, a 0 drawing none. No two bubbles
 * in one path touch, outlines included, and each lies in a path after every
 * path holding a bubble it touches that draws before it, so each outline
 * lies with its fill over the larger bubbles under it, as one element per
 * bubble would, in a few elements: each element's styles cost the page.
 */
export function bubblePaths(m: ScatterModel, f: Frame): BubblePath[] {
  const paths: { slot: number; circles: string[] }[] = [];
  // Per slot, its paths' indices, ascending.
  const bySlot = new Map<number, number[]>();
  const reach = 2 * (f.bubble ?? 0) + 1;
  // A cell's key packs its column and row; two cells sharing a key only add
  // neighbours the distance test then drops.
  const cells = new Map<number, { x: number; y: number; r: number; path: number }[]>();
  for (const ref of m.drawn) {
    const c = scatterAt(m, ref.series, ref.i, f);
    const r = Math.round(dotRadius(m, ref.series, ref.i, f) * 100) / 100;
    if (c === undefined || r <= 0) {
      continue;
    }
    // The last path holding a bubble this one touches, each outline 0.5 px outside.
    let after = -1;
    const cx = Math.floor(c.x / reach);
    const cy = Math.floor(c.y / reach);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const o of cells.get(gx * 0x100000 + gy) ?? []) {
          const dx = o.x - c.x;
          const dy = o.y - c.y;
          const near = o.r + r + 1;
          if (o.path > after && dx * dx + dy * dy < near * near) {
            after = o.path;
          }
        }
      }
    }
    const slot = m.series[ref.series]?.slot ?? 1;
    const own = bySlot.get(slot) ?? [];
    let path = own[upperBound(own, after)];
    if (path === undefined) {
      path = paths.length;
      paths.push({ slot, circles: [] });
      own.push(path);
      bySlot.set(slot, own);
    }
    paths[path]?.circles.push(circle(c, r));
    const key = cx * 0x100000 + cy;
    const cell = cells.get(key);
    const at = { x: c.x, y: c.y, r, path };
    if (cell === undefined) {
      cells.set(key, [at]);
    } else {
      cell.push(at);
    }
  }
  return paths.map((p) => ({ slot: p.slot, d: p.circles.join("") }));
}

/** One path per series of `m` in series order, a circle per shown dot in
 *  the app's order. Inside one path every fill paints before any stroke
 *  (https://www.w3.org/TR/SVG2/painting.html#PaintOrderProperty), so a
 *  series' outlines all lie over its fills, and a later series over it. */
export function scatterPaths(m: ScatterModel, f: Frame): string[] {
  return m.series.map((_, k) =>
    (m.shown[k] ?? [])
      .map((i) => {
        const c = scatterAt(m, k, i, f);
        return c === undefined ? "" : circle(c, SCATTER_RADIUS, SCATTER_ARCS);
      })
      .join(""),
  );
}

/** A 1 px line down the plot at `x`, on whole device pixels. */
export const upright = (x: number, height: number, dpr: number): string =>
  `M${num(snap(x, dpr) + 0.5)} 0V${num(height)}`;

/** A 2 px rule across the plot at x `at`, or along it at y `at`. */
export const rulePath = (axis: "x" | "y", at: number, f: Frame): string =>
  axis === "x"
    ? `M${num(snap(at, f.dpr))} 0V${num(f.height)}`
    : `M0 ${num(snap(at, f.dpr))}H${num(f.width)}`;

/** The px an x rule at `value` draws at: in every panel, in series order;
 *  at its distance either side of a diverging axis's 0, each inside the
 *  domain; or once. */
export function ruleXs(value: number, f: Pick<Frame, "x" | "xAt" | "panels">): number[] {
  if (f.panels !== undefined) {
    return f.panels.map((p) => p.at(value));
  }
  if (!f.x.absolute || value === 0) {
    return [f.xAt(value)];
  }
  return [-value, value].filter((v) => v >= f.x.lo && v <= f.x.hi).map((v) => f.xAt(v));
}

/** The 4 px tick vectors under the plot at `ats`, from its bottom edge. */
export const tickPath = (ats: readonly number[], dpr: number): string =>
  ats.map((at) => `M${num(snap(at, dpr) + 0.5)} 0v4`).join("");
