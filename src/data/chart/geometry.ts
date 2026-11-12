/**
 * geometry.ts — the SVG path of each mark inside a plot `width` by `height`
 * px, y down: rects with their gaps, lines reduced per device pixel and cut
 * at the plot's ends, rows of dots, rules and the axis lines.
 * @module
 */

import { reduce, type Point } from "../scale/reduce.js";

import type { DotRowModel, LineModel, RectModel } from "./model.js";
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

/** Bucket `i`'s left and right px: cut at the plot's ends, inset half the
 *  gap a side unless that leaves under 1 px of bar, snapped to device px. */
export function bucketEdges(
  m: RectModel,
  i: number,
  f: Frame,
): { readonly left: number; readonly right: number } {
  const x1 = m.x1[i] ?? 0;
  const x2 = m.x2[i] ?? 0;
  const a = f.xAt(Math.max(x1, f.x.drawnLo));
  const b = f.xAt(Math.min(x2, f.x.hi));
  // A side cut at the domain's end has no neighbour to leave a gap for.
  const [cutA, cutB] = [x1 < f.x.drawnLo, x2 > f.x.hi];
  const flip = a > b;
  let left = clamp(Math.min(a, b), 0, f.width);
  let right = clamp(Math.max(a, b), 0, f.width);
  if (right - left - GAP >= 1) {
    left += (flip ? cutB : cutA) ? 0 : GAP / 2;
    right -= (flip ? cutA : cutB) ? 0 : GAP / 2;
  }
  return { left: snap(left, f.dpr), right: snap(right, f.dpr) };
}

/**
 * One path per series of `m`, every shown bucket's segment a rectangle,
 * stacked in series order from the baseline. A `null` counts as 0 and draws
 * nothing. Each segment over another gives up its bottom px as the gap,
 * unless it is under 3 px tall, so a stack's top stays at its total.
 */
export function rectPaths(m: RectModel, f: Frame): string[] {
  const paths = m.series.map(() => "");
  for (const i of m.shown) {
    const { left, right } = bucketEdges(m, i, f);
    if (right <= left) {
      continue;
    }
    let base = 0;
    let below = false;
    m.series.forEach((s, k) => {
      const v = s.y[i] ?? 0;
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
        paths[k] =
          `${paths[k] ?? ""}M${num(left)} ${num(top)}H${num(right)}V${num(end)}H${num(left)}Z`;
      }
    });
  }
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
  const from = Math.max(m.from - 1, 0);
  const to = Math.min(m.to + 1, m.x.length);
  // u runs left to right whichever way x does, for the reduction.
  const flip = f.x.reverse;
  const u = (v: number) => (flip ? f.width - f.xAt(v) : f.xAt(v));
  const us = Array.from(m.x, (v, i) => (i >= from && i < to ? u(v) : 0));
  const runs = reduce(us, ys, from, to, 1 / f.dpr);
  let d = "";
  for (const run of runs) {
    const points: Point[] = [];
    run.forEach((p, k) => {
      const before = run[k - 1];
      if (m.step && before !== undefined) {
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

/** A dot's radius, in px. */
const R = 3;

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

/** `groups` as one path of circles on the line at `cy`. */
export function dotPath(groups: readonly DotGroup[], cy: number): string {
  return groups
    .map(
      (g) =>
        `M${num(g.at - R)} ${num(cy)}a${String(R)} ${String(R)} 0 1 0 ${String(2 * R)} 0a${String(R)} ${String(R)} 0 1 0 ${String(-2 * R)} 0`,
    )
    .join("");
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
