/**
 * notes.ts — where a text mark's note sits beside its point: its lines
 * wrapped at spaces, its side, flipped at the plot's edge, then shifted
 * along that edge until it fits.
 * @module
 */

import type { Side } from "./model.js";

/** The room between a note and its point. */
export const NOTE_OFFSET = 4;
/** A note wraps at this many rem. */
export const NOTE_REM = 12;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Placed {
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
