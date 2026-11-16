/**
 * grid.ts — the dot or the box a pointer reaches on a two-dimensional
 * plot: dots or boxes bucketed once into square cells, so a pick reads the
 * cells around the pointer rather than every dot or box.
 * @module
 */

import type { Box } from "./notes.js";

/** Dots in plot px, in draw order: a later dot lies over an earlier one. */
interface Dots {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  /** Each dot's radius. */
  readonly r: ArrayLike<number>;
}

export interface Grid {
  /** The dot whose edge is nearest `(px, py)`, at most `reach` px away, a
   *  pointer inside a dot counting as 0; among equally near dots the one
   *  drawn last, among equally near boxes the first. Undefined when none
   *  is within reach. */
  nearest(px: number, py: number): number | undefined;
}

/** The side of a box grid's square cells, in px. */
const BOX_CELL = 40;

/**
 * Buckets `dots` into cells of `reach` plus the largest radius, so every
 * dot whose edge lies within `reach` of a point has its centre in one of
 * the nine cells around it.
 */
export function pointGrid(dots: Dots, reach: number): Grid {
  const n = dots.x.length;
  let largest = 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (let d = 0; d < n; d++) {
    const x = dots.x[d] ?? 0;
    const y = dots.y[d] ?? 0;
    largest = Math.max(largest, dots.r[d] ?? 0);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (n === 0) {
    return { nearest: () => undefined };
  }
  const size = Math.max(reach + largest, 1);
  const cols = Math.floor((right - left) / size) + 1;
  const rows = Math.floor((bottom - top) / size) + 1;
  const cellOf = (x: number, y: number) =>
    Math.floor((y - top) / size) * cols + Math.floor((x - left) / size);
  // Each cell's dots as a run of `order`, ascending, so a scan meets them in draw order.
  const start = new Int32Array(cols * rows + 1);
  for (let d = 0; d < n; d++) {
    const c = cellOf(dots.x[d] ?? 0, dots.y[d] ?? 0) + 1;
    start[c] = (start[c] ?? 0) + 1;
  }
  for (let c = 0; c < cols * rows; c++) {
    start[c + 1] = (start[c + 1] ?? 0) + (start[c] ?? 0);
  }
  const fill = start.slice(0, -1);
  const order = new Int32Array(n);
  for (let d = 0; d < n; d++) {
    const c = cellOf(dots.x[d] ?? 0, dots.y[d] ?? 0);
    order[fill[c] ?? 0] = d;
    fill[c] = (fill[c] ?? 0) + 1;
  }
  return {
    nearest(px, py) {
      const col = Math.floor((px - left) / size);
      const row = Math.floor((py - top) / size);
      let best: number | undefined;
      let gap = Number.POSITIVE_INFINITY;
      for (let r = Math.max(row - 1, 0); r <= Math.min(row + 1, rows - 1); r++) {
        for (let c = Math.max(col - 1, 0); c <= Math.min(col + 1, cols - 1); c++) {
          const cell = r * cols + c;
          for (let k = start[cell] ?? 0; k < (start[cell + 1] ?? 0); k++) {
            const d = order[k] ?? 0;
            const x = (dots.x[d] ?? 0) - px;
            const y = (dots.y[d] ?? 0) - py;
            const edge = Math.max(Math.hypot(x, y) - (dots.r[d] ?? 0), 0);
            if (edge <= reach && (edge < gap || (edge === gap && d > (best ?? -1)))) {
              best = d;
              gap = edge;
            }
          }
        }
      }
      return best;
    },
  };
}

/**
 * Buckets `boxes` into BOX_CELL px cells, each box into every cell its
 * edges grown by `reach` overlap, so the one cell under a point holds every
 * box within `reach` of it. An undefined box is never reached.
 */
export function boxGrid(boxes: readonly (Box | undefined)[], reach: number): Grid {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const b of boxes) {
    if (b !== undefined) {
      left = Math.min(left, b.left - reach);
      top = Math.min(top, b.top - reach);
      right = Math.max(right, b.right + reach);
      bottom = Math.max(bottom, b.bottom + reach);
    }
  }
  if (left > right) {
    return { nearest: () => undefined };
  }
  const cols = Math.floor((right - left) / BOX_CELL) + 1;
  const rows = Math.floor((bottom - top) / BOX_CELL) + 1;
  const each = (visit: (cell: number, k: number) => void) => {
    boxes.forEach((b, k) => {
      if (b === undefined) {
        return;
      }
      const c1 = Math.floor((b.right + reach - left) / BOX_CELL);
      const r1 = Math.floor((b.bottom + reach - top) / BOX_CELL);
      for (let r = Math.floor((b.top - reach - top) / BOX_CELL); r <= r1; r++) {
        for (let c = Math.floor((b.left - reach - left) / BOX_CELL); c <= c1; c++) {
          visit(r * cols + c, k);
        }
      }
    });
  };
  // Each cell's boxes as a run of `order`, ascending, so a scan meets them in order.
  const start = new Int32Array(cols * rows + 1);
  each((cell) => {
    start[cell + 1] = (start[cell + 1] ?? 0) + 1;
  });
  for (let c = 0; c < cols * rows; c++) {
    start[c + 1] = (start[c + 1] ?? 0) + (start[c] ?? 0);
  }
  const fill = start.slice(0, -1);
  const order = new Int32Array(start[cols * rows] ?? 0);
  each((cell, k) => {
    order[fill[cell] ?? 0] = k;
    fill[cell] = (fill[cell] ?? 0) + 1;
  });
  return {
    nearest(px, py) {
      const col = Math.floor((px - left) / BOX_CELL);
      const row = Math.floor((py - top) / BOX_CELL);
      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        return undefined;
      }
      const cell = row * cols + col;
      let best: number | undefined;
      let gap = Number.POSITIVE_INFINITY;
      for (let i = start[cell] ?? 0; i < (start[cell + 1] ?? 0); i++) {
        const k = order[i] ?? 0;
        const b = boxes[k];
        if (b === undefined) {
          continue;
        }
        const dx = Math.max(b.left - px, px - b.right, 0);
        const dy = Math.max(b.top - py, py - b.bottom, 0);
        const d = Math.hypot(dx, dy);
        if (d <= reach && d < gap) {
          best = k;
          gap = d;
        }
      }
      return best;
    },
  };
}
