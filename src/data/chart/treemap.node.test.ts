import { describe, expect, it } from "vitest";

import type { Box } from "./notes.js";
import { resquarify, squarify } from "./treemap.js";

const plot: Box = { left: 0, top: 0, right: 600, bottom: 400 };
const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
const ratio = (b: Box) => {
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  return Math.max(w / h, h / w);
};
const overlaps = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1e-9 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1e-9;

// A world's GDP by country in trillions, largest first, then a long tail.
const gdp = [27.4, 17.8, 4.5, 4.2, 3.7, 3.3, 3, 2.2, 2.1, 1.7, 1.4, 1.2, 1.1, 0.9, 0.5, 0.3];

describe("squarify", () => {
  it("gives each value its share of the area, the boxes tiling the plot with no overlap", () => {
    const { boxes } = squarify(gdp, plot);
    const total = gdp.reduce((n, v) => n + v, 0);
    boxes.forEach((b, i) => {
      expect(area(b) / area(plot)).toBeCloseTo((gdp[i] ?? 0) / total, 9);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(600 + 1e-9);
      expect(b.bottom).toBeLessThanOrEqual(400 + 1e-9);
      for (const other of boxes.slice(i + 1)) {
        expect(overlaps(b, other)).toBe(false);
      }
    });
    expect(boxes.reduce((n, b) => n + area(b), 0)).toBeCloseTo(area(plot), 6);
  });

  it("lays rows in the app's order, each row's values side by side in order", () => {
    const { boxes, rows } = squarify(gdp, plot);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(gdp.length);
    let i = 0;
    for (const row of rows) {
      const strip = boxes.slice(i, i + row.count);
      strip.slice(1).forEach((b, k) => {
        const before = strip[k] as Box;
        if (row.dice) {
          expect(b.left).toBeCloseTo(before.right, 9);
          expect([b.top, b.bottom]).toEqual([before.top, before.bottom]);
        } else {
          expect(b.top).toBeCloseTo(before.bottom, 9);
          expect([b.left, b.right]).toEqual([before.left, before.right]);
        }
      });
      i += row.count;
    }
  });

  it("matches D3's squarify at the golden ratio on Bruls's example", () => {
    const { boxes, rows } = squarify([6, 6, 4, 3, 2, 2, 1], {
      left: 0,
      top: 0,
      right: 6,
      bottom: 4,
    });
    // Worked by hand through D3's squarifyRatio: each row takes values while
    // max(max / β, β / min), β = sum² · max(dy/dx, dx/dy) / (rest · φ), falls.
    expect(rows).toEqual([
      { count: 2, dice: false },
      { count: 2, dice: true },
      { count: 2, dice: false },
      { count: 1, dice: true },
    ]);
    const round = (b: Box) =>
      [b.left, b.top, b.right, b.bottom].map((v) => Math.round(v * 1e6) / 1e6);
    expect(boxes.map(round)).toEqual([
      [0, 0, 3, 2],
      [0, 2, 3, 4],
      [3, 0, 4.714286, 2.333333],
      [4.714286, 0, 6, 2.333333],
      [3, 2.333333, 5.4, 3.166667],
      [3, 3.166667, 5.4, 4],
      [5.4, 2.333333, 6, 4],
    ]);
  });

  it("keeps tiles near square, as slicing the plot into strips would not", () => {
    const { boxes } = squarify(gdp.slice(0, 8), plot);
    expect(Math.max(...boxes.map(ratio))).toBeLessThan(3);
  });

  it("gives a 0 no area and keeps every other value's share and order", () => {
    const values = [5, 0, 3, 0, 0, 2];
    const { boxes, rows } = squarify(values, plot);
    expect(boxes).toHaveLength(6);
    expect([1, 3, 4].map((i) => area(boxes[i] as Box))).toEqual([0, 0, 0]);
    expect(area(boxes[0] as Box) / area(plot)).toBeCloseTo(0.5, 9);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(6);
  });

  it("lays every value at no area when they are all 0, and nothing when there are none", () => {
    const { boxes } = squarify([0, 0], plot);
    expect(boxes.map(area)).toEqual([0, 0]);
    expect(boxes.flatMap((b) => [b.left, b.top, b.right, b.bottom]).every(Number.isFinite)).toBe(
      true,
    );
    expect(squarify([], plot)).toEqual({ boxes: [], rows: [] });
  });

  it("lays a box of no width without a NaN", () => {
    const { boxes } = squarify([2, 1], { left: 10, top: 0, right: 10, bottom: 50 });
    expect(boxes.flatMap((b) => [b.left, b.top, b.right, b.bottom]).every(Number.isFinite)).toBe(
      true,
    );
  });
});

describe("resquarify", () => {
  it("lays the same values along their own rows as squarify does", () => {
    const fresh = squarify(gdp, plot);
    expect(resquarify(gdp, plot, fresh.rows)).toEqual(fresh.boxes);
  });

  it("keeps every tile's row and place on an update that would squarify afresh in other rows", () => {
    const before = squarify(gdp, plot);
    const after = gdp.map((v, i) => (i === 0 ? v * 0.4 : i === 1 ? v * 2.5 : v));
    expect(squarify(after, plot).rows).not.toEqual(before.rows);
    const kept = resquarify(after, plot, before.rows);
    const total = after.reduce((n, v) => n + v, 0);
    kept.forEach((b, k) => {
      expect(area(b) / area(plot)).toBeCloseTo((after[k] ?? 0) / total, 9);
    });
    // Each kept row's tiles still share one strip and keep their order along it.
    let i = 0;
    for (const row of before.rows) {
      const strip = kept.slice(i, i + row.count);
      const across = strip.map((b) =>
        row.dice ? `${String(b.top)} ${String(b.bottom)}` : `${String(b.left)} ${String(b.right)}`,
      );
      const along = strip.map((b) => (row.dice ? b.left : b.top));
      expect(new Set(across).size).toBe(1);
      expect(along).toEqual(along.toSorted((a, b) => a - b));
      i += row.count;
    }
  });
});
