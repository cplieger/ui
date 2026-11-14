/**
 * treemap.ts — a treemap's tiles: squarified at the golden ratio in the
 * app's order, after Bruls, Huizing and van Wijk, as D3's `treemapSquarify`
 * does, and laid out again along kept rows when only the values change, as
 * its `treemapResquarify` does (https://d3js.org/d3-hierarchy/treemap).
 * @module
 */

import type { Box } from "./notes.js";

/** A row of a squarified layout: its next `count` values side by side
 *  across a strip at the top (`dice`), or down a strip at the left. */
export interface Row {
  readonly count: number;
  readonly dice: boolean;
}

const PHI = (1 + Math.sqrt(5)) / 2;

const sumOf = (values: readonly number[], from = 0, to = values.length): number => {
  let n = 0;
  for (let i = from; i < to; i++) {
    n += values[i] ?? 0;
  }
  return n;
};

// Lays values[from, to) along one strip of `b`, the last ending at its far
// edge exactly so no drift opens a sliver; a strip of 0s has no length.
function strip(values: readonly number[], from: number, to: number, b: Box, dice: boolean): Box[] {
  const total = sumOf(values, from, to);
  const out: Box[] = [];
  const lo = dice ? b.left : b.top;
  const hi = dice ? b.right : b.bottom;
  const k = total > 0 ? (hi - lo) / total : 0;
  let at = lo;
  for (let i = from; i < to; i++) {
    const end = total > 0 && i === to - 1 ? hi : at + (values[i] ?? 0) * k;
    out.push(
      dice
        ? { left: at, top: b.top, right: end, bottom: b.bottom }
        : { left: b.left, top: at, right: b.right, bottom: end },
    );
    at = end;
  }
  return out;
}

// Lays `values` along `rows` in `b`: each row takes its share of what is
// left, a strip across the top when it dices, down the left when not.
function place(values: readonly number[], b: Box, rows: readonly Row[]): Box[] {
  let { left, top } = b;
  const { right, bottom } = b;
  let rest = sumOf(values);
  let i = 0;
  const out: Box[] = [];
  rows.forEach((row, r) => {
    const v = sumOf(values, i, i + row.count);
    const last = r === rows.length - 1;
    const f = last || rest <= 0 ? 1 : v / rest;
    if (row.dice) {
      const end = last ? bottom : top + (bottom - top) * f;
      out.push(...strip(values, i, i + row.count, { left, top, right, bottom: end }, true));
      top = end;
    } else {
      const end = last ? right : left + (right - left) * f;
      out.push(...strip(values, i, i + row.count, { left, top, right: end, bottom }, false));
      left = end;
    }
    rest -= v;
    i += row.count;
  });
  return out;
}

/**
 * Squarifies `values` (each 0 or more, in the order given, never sorted)
 * into `b`: each row takes values while its worst aspect ratio, against
 * the golden ratio, does not grow. Returns each value's box, a 0 a box of
 * no area, and the rows, which `resquarify` can keep.
 */
export function squarify(values: readonly number[], b: Box): { boxes: Box[]; rows: Row[] } {
  const rows: Row[] = [];
  const n = values.length;
  let { left, top } = b;
  let rest = sumOf(values);
  let i0 = 0;
  while (i0 < n) {
    const dx = b.right - left;
    const dy = b.bottom - top;
    // A run of zeros joins the row the next value starts.
    let i1 = i0;
    let sum = 0;
    while (sum === 0 && i1 < n) {
      sum = values[i1++] ?? 0;
    }
    let min = sum;
    let max = sum;
    const alpha = Math.max(dy / dx, dx / dy) / (rest * PHI);
    let beta = sum * sum * alpha;
    let worst = Math.max(max / beta, beta / min);
    for (; i1 < n; i1++) {
      const v = values[i1] ?? 0;
      const lo = Math.min(min, v);
      const hi = Math.max(max, v);
      beta = (sum + v) * (sum + v) * alpha;
      const ratio = Math.max(hi / beta, beta / lo);
      if (ratio > worst) {
        break;
      }
      sum += v;
      min = lo;
      max = hi;
      worst = ratio;
    }
    const dice = dx < dy;
    rows.push({ count: i1 - i0, dice });
    if (rest > 0 && i1 < n) {
      if (dice) {
        top += (dy * sum) / rest;
      } else {
        left += (dx * sum) / rest;
      }
    }
    rest -= sum;
    i0 = i1;
  }
  return { boxes: place(values, b, rows), rows };
}

/** Lays `values` into `b` along `rows` kept from an earlier `squarify` of
 *  as many values, so each value keeps its row and its place in it and
 *  only the edges move. */
export const resquarify = (values: readonly number[], b: Box, rows: readonly Row[]): Box[] =>
  place(values, b, rows);
