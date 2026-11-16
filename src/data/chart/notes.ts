/**
 * notes.ts — where a text mark's note sits beside its point: its lines
 * wrapped at spaces, its side, flipped at the plot's edge, then shifted
 * along that edge until it fits; and the stop whose reading it joins.
 * @module
 */

import { lowerBound } from "../scale/reduce.js";

import {
  dayOf,
  stepStopAt,
  type Model,
  type RectModel,
  type Side,
  type TextModel,
} from "./model.js";
import { ruleAt } from "./scales.js";

/** The room between a note and its point. */
const NOTE_OFFSET = 4;
/** A note wraps at this many rem. */
export const NOTE_REM = 12;
/** A numbered marker's radius: a 20 px circle. */
export const MARKER_RADIUS = 10;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Placed {
  readonly side: Side;
  readonly box: Box;
  /** The box lies inside the plot on the side it took. */
  readonly fits: boolean;
}

/** `text` broken at spaces into lines of at most `max` px by `width`; a
 *  word wider than `max` takes a line of its own. */
export function wrapNote(text: string, max: number, width: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && width(next) > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

const OPPOSITE: Record<Side, Side> = {
  above: "below",
  below: "above",
  left: "right",
  right: "left",
};

function boxAt(x: number, y: number, side: Side, w: number, h: number): Box {
  switch (side) {
    case "above":
      return {
        left: x - w / 2,
        right: x + w / 2,
        bottom: y - NOTE_OFFSET,
        top: y - NOTE_OFFSET - h,
      };
    case "below":
      return {
        left: x - w / 2,
        right: x + w / 2,
        top: y + NOTE_OFFSET,
        bottom: y + NOTE_OFFSET + h,
      };
    case "left":
      return {
        right: x - NOTE_OFFSET,
        left: x - NOTE_OFFSET - w,
        top: y - h / 2,
        bottom: y + h / 2,
      };
    case "right":
      return {
        left: x + NOTE_OFFSET,
        right: x + NOTE_OFFSET + w,
        top: y - h / 2,
        bottom: y + h / 2,
      };
  }
}

// Whether `b` crosses the plot's edge on `side`, the edge a note moves off.
function crosses(b: Box, side: Side, width: number, height: number): boolean {
  switch (side) {
    case "above":
      return b.top < 0;
    case "below":
      return b.bottom > height;
    case "left":
      return b.left < 0;
    case "right":
      return b.right > width;
  }
}

/**
 * Places a `w` by `h` px note on `side` of its point (`x`, `y`) in a plot
 * `width` by `height` px: on the opposite side when it would cross the
 * plot's edge on its own, then shifted along the point's other axis until
 * it lies inside. `fits` is false when no shift brings it inside.
 */
export function placeNote(
  x: number,
  y: number,
  side: Side,
  w: number,
  h: number,
  width: number,
  height: number,
): Placed {
  let taken = side;
  if (crosses(boxAt(x, y, side, w, h), side, width, height)) {
    taken = OPPOSITE[side];
  }
  const b = boxAt(x, y, taken, w, h);
  const along = taken === "above" || taken === "below";
  const [lo, hi, room] = along ? [b.left, b.right, width] : [b.top, b.bottom, height];
  const shift = lo < 0 ? -lo : hi > room ? room - hi : 0;
  const box = along
    ? { ...b, left: b.left + shift, right: b.right + shift }
    : { ...b, top: b.top + shift, bottom: b.bottom + shift };
  const fits = box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height;
  return { side: taken, box, fits };
}

/** The stop a note joins: bucket or sample `i`, or a calendar's day `i`. */
export type Join =
  { readonly kind: "stop"; readonly i: number } | { readonly kind: "day"; readonly i: number };

/**
 * The index in `[from, to)` of ascending `xs` nearest `x`, the earlier on a
 * tie. Before the first or after the last only within half the distance to
 * that end's neighbour, or at any x for a lone one; undefined otherwise.
 */
export function nearestStop(
  xs: readonly number[],
  from: number,
  to: number,
  x: number,
): number | undefined {
  if (to <= from) {
    return undefined;
  }
  if (to - from === 1) {
    return from;
  }
  const first = xs[from] ?? 0;
  const last = xs[to - 1] ?? 0;
  if (x < first) {
    return first - x <= ((xs[from + 1] ?? first) - first) / 2 ? from : undefined;
  }
  if (x > last) {
    return x - last <= (last - (xs[to - 2] ?? last)) / 2 ? to - 1 : undefined;
  }
  const i = Math.min(Math.max(lowerBound(xs, x), from + 1), to - 1);
  return x - (xs[i - 1] ?? x) <= (xs[i] ?? x) - x ? i - 1 : i;
}

// The shown bucket whose [x1, x2) holds x, or at the domain's high end the
// bucket ending there, which no bucket's interval holds. checkX keeps x1
// strictly increasing and x2 never decreasing, so the shown buckets ending
// past x are a run whose first has the lowest x1, and it holds x if any does.
function bucketAt(m: RectModel, x: number, hi: number): number | undefined {
  const x2 = (i: number) => m.x2[i] ?? 0;
  const held = m.shown[firstShown(m, (i) => x2(i) > x)];
  if (held !== undefined && (m.x1[held] ?? 0) <= x) {
    return held;
  }
  const end = x === hi ? m.shown[firstShown(m, (i) => x2(i) >= x)] : undefined;
  return end !== undefined && x2(end) === x ? end : undefined;
}

// The first place in m.shown whose bucket passes `past`, which holds from
// some place on; m.shown.length when none does.
function firstShown(m: RectModel, past: (i: number) => boolean): number {
  let lo = 0;
  let hi = m.shown.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (past(m.shown[mid] ?? 0)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/**
 * Where note `t` stands on x, or undefined off the x domain, which the scales
 * set without notes. Layout and `noteJoin` both check it, so whether a note
 * is on the plot never depends on the chart's width.
 */
export function notePoint(model: Model, t: TextModel): number | undefined {
  const x = ruleAt(model.x, t.x);
  return "off" in x ? undefined : x.at;
}

/** The stop note `t` joins in `model`: on a rect, line or area the stop at
 *  its x (on a step curve the stop holding its nearest sample, since the keys
 *  stop only there), on a calendar the day holding its instant on the chart's
 *  wall clock. Elsewhere a reading is a row, a dot or a cell, which an x alone
 *  does not name, so none. */
export function noteJoin(model: Model, t: TextModel): Join | undefined {
  const x = notePoint(model, t);
  const m = model.primary;
  if (x === undefined) {
    return undefined;
  }
  switch (m?.kind) {
    case "rect": {
      const i = bucketAt(m, x, model.x.hi);
      return i === undefined ? undefined : { kind: "stop", i };
    }
    case "line":
    case "area": {
      const i = nearestStop(m.x, m.from, m.to, x);
      if (i === undefined) {
        return undefined;
      }
      return { kind: "stop", i: m.step ? stepStopAt(m, i) : i };
    }
    case "calendar": {
      const i = dayOf(model, m, x);
      return i === -1 ? undefined : { kind: "day", i };
    }
    default:
      return undefined;
  }
}
