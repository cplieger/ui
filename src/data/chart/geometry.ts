/**
 * geometry.ts — the SVG path of each mark inside a plot `width` by `height`
 * px, y down: rects with their gaps, lines reduced per device pixel and cut
 * at the plot's ends, rows of dots, rules and the axis lines.
 * @module
 */

import { reduce, type Point } from "../scale/reduce.js";

import { drawnValue, type DotRowModel, type LineModel, type RectModel } from "./model.js";
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
 * is one shape instead (`areaPaths`).
 */
export function rectPaths(m: RectModel, f: Frame): string[] {
  if (m.shape === "area") {
    return areaPaths(m, f);
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
function areaPaths(m: RectModel, f: Frame): string[] {
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

/**
 * Series `s` of `m` as one path: the samples inside the domain and the one
 * beyond each end, reduced per device pixel column, in steps held until the
 * next sample when `m.step`, cut where the plot ends, broken at each gap. A
 * lone sample is a zero-length segment, which a round cap draws as a dot.
 */
export function linePath(m: LineModel, s: number, f: Frame): string {
  const ys = m.series[s]?.y ?? [];
  // A log x cannot place a sample at or below 0: a straight line then starts
  // at its first sample inside the domain, and a step line holds that
  // sample's value from just left of the plot, where u is -1.
  const unplaced = (i: number) => f.x.type === "log" && (m.x[i] ?? 0) <= 0;
  const before = m.from > 0 && (m.step || !unplaced(m.from - 1));
  const from = before ? m.from - 1 : m.from;
  const to = Math.min(m.to + 1, m.x.length);
  // u runs left to right whichever way x does, for the reduction.
  const flip = f.x.reverse;
  const u = (v: number) => (flip ? f.width - f.xAt(v) : f.xAt(v));
  const us = Array.from(m.x, (v, i) =>
    i >= from && i < to ? (i === from && unplaced(i) ? -1 : u(v)) : 0,
  );
  const runs = reduce(us, ys, from, to, 1 / f.dpr, f.width);
  let d = "";
  for (const run of runs) {
    const points: Point[] = [];
    run.forEach((p, k) => {
      const before = run[k - 1];
      if (m.step && before !== undefined) {
        // A held value inside the run only continues the horizontal.
        if (before.y === p.y && k < run.length - 1) {
          return;
        }
        points.push({ x: p.x, y: f.yAt(before.y) });
      }
      points.push({ x: p.x, y: f.yAt(p.y) });
    });
    const piece = cut(points, f.width);
    if (piece.length === 0) {
      continue;
    }
    const at = piece.map((p) => `${num(flip ? f.width - p.x : p.x)} ${num(p.y)}`);
    d += `M${at.join("L")}${at.length === 1 ? `L${at[0] ?? ""}` : ""}`;
  }
  return d;
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

/** A 2 px rule across the plot at x `at`, or along it at y `at`. */
export const rulePath = (axis: "x" | "y", at: number, f: Frame): string =>
  axis === "x"
    ? `M${num(snap(at, f.dpr))} 0V${num(f.height)}`
    : `M0 ${num(snap(at, f.dpr))}H${num(f.width)}`;

/** The 4 px tick vectors under the plot at `ats`, from its bottom edge. */
export const tickPath = (ats: readonly number[], dpr: number): string =>
  ats.map((at) => `M${num(snap(at, dpr) + 0.5)} 0v4`).join("");
