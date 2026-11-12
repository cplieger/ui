/**
 * labels.ts — where an axis's labels sit along it and which of them it keeps.
 * @module
 */

/** The least room between two labels an axis keeps. */
export const LABEL_GAP = 8;

/** A label's extent along its axis, in pixels. */
export interface Box {
  readonly start: number;
  readonly end: number;
}

/** Each label centred on its tick at `at[i]`, `size[i]` long; with `flush`,
 *  moved inside 0..`length` so none overhangs the plot. */
export function boxes(
  at: readonly number[],
  size: readonly number[],
  length: number,
  flush: boolean,
): Box[] {
  return at.map((p, i) => {
    const s = size[i] ?? 0;
    const start = flush ? Math.min(Math.max(p - s / 2, 0), Math.max(length - s, 0)) : p - s / 2;
    return { start, end: start + s };
  });
}

/** The indices kept by walking `placed` (in order along the axis) and
 *  dropping each label closer than `LABEL_GAP` to the last one kept. */
export function greedy(placed: readonly Box[]): number[] {
  const kept: number[] = [];
  let end = Number.NEGATIVE_INFINITY;
  placed.forEach((box, i) => {
    if (box.start - end >= LABEL_GAP) {
      kept.push(i);
      end = box.end;
    }
  });
  return kept;
}

/** Whether greedy keeps fewer than every other label of `n`, the point
 *  where a linear or time axis takes a coarser step instead. */
export const tooSparse = (kept: number, n: number): boolean => kept < Math.ceil(n / 2);
