import { describe, expect, it } from "vitest";

import { lowerBound, reduce } from "./reduce.js";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("reduce", () => {
  it("keeps every sample of a column of four or fewer, and each run apart", () => {
    const xs = [0, 0.25, 0.5, 0.75, 1, 1.5];
    const ys = [3, 1, 4, 1, 5, 9];
    expect(reduce(xs, ys, 0, 6, 1)).toEqual([xs.map((x, i) => ({ x, y: ys[i] }))]);
  });

  it("keeps a crowded column's entry, minimum, maximum and exit in sample order", () => {
    const xs = range(10).map((i) => i / 10);
    const ys = [5, 6, 2, 7, 9, 3, 0, 4, 8, 6];
    expect(reduce(xs, ys, 0, 10, 1)).toEqual([
      [
        { x: 0, y: 5 },
        { x: 0.4, y: 9 },
        { x: 0.6, y: 0 },
        { x: 0.9, y: 6 },
      ],
    ]);
  });

  it("keeps every column's extremes over thousands of samples, for any width", () => {
    const n = 4_320;
    const xs = range(n).map((i) => (i * 276) / n);
    const ys = range(n).map((i) => Math.round(50 + 40 * Math.sin(i / 7) + ((i * 7919) % 13)));
    const runs = reduce(xs, ys, 0, n, 1);
    expect(runs).toHaveLength(1);
    const points = runs[0]!;
    expect(points.length).toBeLessThanOrEqual(4 * 276);
    for (let c = 0; c < 276; c++) {
      const inColumn = ys.filter((_, i) => Math.floor(xs[i]!) === c);
      const kept = points.filter((p) => Math.floor(p.x) === c).map((p) => p.y);
      expect(Math.min(...kept)).toBe(Math.min(...inColumn));
      expect(Math.max(...kept)).toBe(Math.max(...inColumn));
    }
  });

  it("breaks at a null inside a column and starts the next run at the next column", () => {
    const xs = [0, 0.2, 0.4, 0.6, 0.8, 1.2];
    const ys = [1, 2, null, 3, 4, 5];
    expect(reduce(xs, ys, 0, 6, 1)).toEqual([
      [
        { x: 0, y: 1 },
        { x: 0.2, y: 2 },
      ],
      [
        { x: 1, y: 3 },
        { x: 1, y: 4 },
        { x: 1.2, y: 5 },
      ],
    ]);
  });

  it("moves a sample after a gap no further than the end it is given", () => {
    expect(reduce([0, 0.5, 0.8], [1, null, 2], 0, 3, 1, 0.8)).toEqual([
      [{ x: 0, y: 1 }],
      [{ x: 0.8, y: 2 }],
    ]);
  });

  it("reads NaN as a gap, draws nothing for a run of nulls wider than a column, and joins nothing across it", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [1, Number.NaN, null, null, 7, 8];
    expect(reduce(xs, ys, 0, 6, 1)).toEqual([
      [{ x: 0, y: 1 }],
      [
        { x: 4, y: 7 },
        { x: 5, y: 8 },
      ],
    ]);
    expect(reduce(xs, [null, null, null, null, null, null], 0, 6, 1)).toEqual([]);
  });

  it("reduces only the index range it is given", () => {
    expect(reduce([0, 1, 2, 3], [1, 2, 3, 4], 1, 3, 1)).toEqual([
      [
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ],
    ]);
  });
});

describe("binary search", () => {
  const xs = [10, 20, 20, 30];

  it("finds the first index at or above a value, at both ends", () => {
    expect(lowerBound(xs, 5)).toBe(0);
    expect(lowerBound(xs, 10)).toBe(0);
    expect(lowerBound(xs, 20)).toBe(1);
    expect(lowerBound(xs, 25)).toBe(3);
    expect(lowerBound(xs, 35)).toBe(4);
    expect(lowerBound([], 1)).toBe(0);
  });
});
