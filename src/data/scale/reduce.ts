/**
 * reduce.ts — the per-pixel reduction of a drawn series, and the binary
 * searches the pointer and the keys run on a sorted x.
 * @module
 */

/** A drawn point: its position along x and its value. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The runs of `ys[from..to)` between gaps (`null` or `NaN`), placed at
 * `xs` (ascending), reduced so each column `width` wide keeps its entry,
 * minimum, maximum and exit per run, in sample order. A column of four
 * samples or fewer keeps them all. After a gap, the samples that share a
 * column with the run before it move to the next column's start, so a gap
 * narrower than a column still breaks the path by one column.
 */
export function reduce(
  xs: ArrayLike<number>,
  ys: ArrayLike<number | null>,
  from: number,
  to: number,
  width: number,
): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  let column: Point[] = [];
  let col = Number.NaN;
  // The column the last run ended in, before which the next run may not start.
  let after = Number.NEGATIVE_INFINITY;

  const flush = (): void => {
    if (column.length <= 4) {
      run.push(...column);
    } else {
      let lo = 0;
      let hi = 0;
      column.forEach((p, i) => {
        if (p.y < (column[lo]?.y ?? p.y)) {
          lo = i;
        }
        if (p.y > (column[hi]?.y ?? p.y)) {
          hi = i;
        }
      });
      const keep = new Set([0, lo, hi, column.length - 1]);
      run.push(...column.filter((_, i) => keep.has(i)));
    }
    column = [];
  };

  for (let i = from; i < to; i++) {
    const y = ys[i] ?? null;
    if (y === null || Number.isNaN(y)) {
      if (column.length > 0 || run.length > 0) {
        flush();
        runs.push(run);
        run = [];
        after = col;
        col = Number.NaN;
      }
      continue;
    }
    let x = xs[i] ?? 0;
    let c = Math.floor(x / width);
    if (c <= after) {
      c = after + 1;
      x = Math.max(x, c * width);
    }
    if (c !== col) {
      if (column.length > 0) {
        flush();
      }
      col = c;
    }
    column.push({ x, y });
  }
  if (column.length > 0) {
    flush();
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

/** The first index whose `xs` value is at or above `v`; `xs.length` when none is. */
export function lowerBound(xs: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((xs[mid] ?? v) < v) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** The first index whose `xs` value is above `v`; `xs.length` when none is. */
export function upperBound(xs: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((xs[mid] ?? v) <= v) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** The index of the `xs` value nearest `v`, the earlier on a tie; -1 when `xs` is empty. */
export function nearest(xs: ArrayLike<number>, v: number): number {
  if (xs.length === 0) {
    return -1;
  }
  const i = lowerBound(xs, v);
  if (i === 0 || i === xs.length) {
    return Math.max(i - 1, 0);
  }
  return v - (xs[i - 1] ?? v) <= (xs[i] ?? v) - v ? i - 1 : i;
}
