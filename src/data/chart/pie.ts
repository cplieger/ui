/**
 * pie.ts — a pie's circle and its slices' angles.
 * @module
 */

import type { PieModel } from "./model.js";

/** A pie's circle in plot px; `inner` is a donut's hole radius, else 0. */
export interface Disc {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly inner: number;
}

/** A drawn slice: its index in the mark, and its angles in radians
 *  clockwise from 12 o'clock. */
export interface Slice {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

export const TURN = 2 * Math.PI;

/** The slices `m` draws, those above 0, in the app's order from 12 o'clock. */
export function sliceAngles(m: PieModel): Slice[] {
  const out: Slice[] = [];
  let sum = 0;
  m.slices.forEach((s, index) => {
    const v = s.value ?? 0;
    if (v <= 0) {
      return;
    }
    const from = (sum / m.total) * TURN;
    // The model sums its total in this order, so the last slice ends at a whole turn.
    sum += v;
    out.push({ index, from, to: (sum / m.total) * TURN });
  });
  return out;
}

/** The point at angle `a` and distance `r` from `p`'s centre. */
export const rimPoint = (p: Disc, a: number, r: number): { x: number; y: number } => ({
  x: p.cx + r * Math.sin(a),
  y: p.cy - r * Math.cos(a),
});
