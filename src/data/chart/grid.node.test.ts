import { describe, expect, it } from "vitest";

import { boxGrid, pointGrid } from "./grid.js";

const REACH = 40;

const grid = (dots: readonly (readonly [number, number, number])[]) =>
  pointGrid(
    { x: dots.map((d) => d[0]), y: dots.map((d) => d[1]), r: dots.map((d) => d[2]) },
    REACH,
  );

describe("the pointer grid", () => {
  it("reaches a dot whose edge is 40 px away, and no farther", () => {
    const g = grid([[100, 100, 4]]);
    expect(g.nearest(100, 100)).toBe(0);
    expect(g.nearest(144, 100)).toBe(0);
    expect(g.nearest(100, 56)).toBe(0);
    expect(g.nearest(144.01, 100)).toBe(undefined);
    expect(g.nearest(100 + 31.1, 100 + 31.1)).toBe(0);
    expect(g.nearest(100 + 31.2, 100 + 31.2)).toBe(undefined);
  });

  it("finds a dot two 40 px cells away whose edge is within reach", () => {
    // 44 px between centres: 40 px to the edge of a 4 px dot.
    const g = grid([
      [0, 0, 4],
      [79.9, 0, 4],
    ]);
    expect(g.nearest(123.9, 0)).toBe(1);
  });

  it("reaches a large dot's edge from 40 px past it", () => {
    const g = grid([
      [0, 0, 4],
      [300, 300, 24],
    ]);
    expect(g.nearest(364, 300)).toBe(1);
    expect(g.nearest(300, 364.5)).toBe(undefined);
  });

  it("takes the dot whose edge is nearest", () => {
    const g = grid([
      [100, 100, 4],
      [130, 100, 4],
    ]);
    expect(g.nearest(114, 100)).toBe(0);
    expect(g.nearest(116, 100)).toBe(1);
  });

  it("takes the dot drawn last among equally near ones, a pointer inside several among them", () => {
    const g = grid([
      [100, 100, 4],
      [102, 100, 4],
      [101, 100, 4],
      [400, 400, 4],
    ]);
    expect(g.nearest(101, 100)).toBe(2);
    // 10 px from 100 and from 120, neither inside.
    const apart = grid([
      [100, 100, 4],
      [120, 100, 4],
    ]);
    expect(apart.nearest(110, 100)).toBe(1);
  });

  it("measures a big dot's inside as 0, so a small dot within it is no nearer", () => {
    const g = grid([
      [100, 100, 4],
      [100, 100, 24],
    ]);
    expect(g.nearest(110, 100)).toBe(1);
    const under = grid([
      [100, 100, 24],
      [110, 100, 4],
    ]);
    expect(under.nearest(110, 100)).toBe(1);
  });

  it("takes the smallest of nested bubbles drawn largest first, and a larger one past its edge", () => {
    const g = grid([
      [100, 100, 24],
      [104, 100, 12],
      [106, 100, 3],
    ]);
    expect(g.nearest(106, 100)).toBe(2);
    // Inside the two larger ones, 7 px past the smallest's edge.
    expect(g.nearest(113, 106)).toBe(1);
    // Inside the largest alone.
    expect(g.nearest(100, 118)).toBe(0);
  });

  it("reaches from outside the dots' bounds, and has nothing to reach with no dots", () => {
    const g = grid([
      [100, 100, 4],
      [500, 500, 4],
    ]);
    expect(g.nearest(70, 100)).toBe(0);
    expect(g.nearest(530, 520)).toBe(1);
    expect(g.nearest(-1000, -1000)).toBe(undefined);
    expect(grid([]).nearest(0, 0)).toBe(undefined);
  });
});

describe("the box grid", () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({
    left,
    top,
    right,
    bottom,
  });

  it("finds the box under a point, deep inside one larger than many cells", () => {
    const g = boxGrid([box(0, 0, 300, 200), box(301, 0, 400, 200)], 4);
    expect(g.nearest(150, 100)).toBe(0);
    expect(g.nearest(0, 0)).toBe(0);
    expect(g.nearest(300, 200)).toBe(0);
    expect(g.nearest(350, 199)).toBe(1);
  });

  it("reaches a box within 4 px of a point in a gap or past an edge, and no farther", () => {
    const g = boxGrid([box(0, 0, 100, 100), box(104, 0, 200, 100)], 4);
    expect(g.nearest(101, 50)).toBe(0);
    expect(g.nearest(103, 50)).toBe(1);
    expect(g.nearest(-4, 50)).toBe(0);
    expect(g.nearest(-4.01, 50)).toBe(undefined);
    expect(g.nearest(50, 104)).toBe(0);
    expect(g.nearest(200 + 2.8, 100 + 2.8)).toBe(1);
    expect(g.nearest(200 + 2.9, 100 + 2.9)).toBe(undefined);
  });

  it("takes the first of two equally near boxes", () => {
    const g = boxGrid([box(0, 0, 100, 100), box(101, 0, 200, 100)], 4);
    expect(g.nearest(100.5, 50)).toBe(0);
  });

  it("never reaches an undefined box, and has nothing to reach with none", () => {
    const g = boxGrid([undefined, box(0, 0, 10, 10), undefined], 4);
    expect(g.nearest(5, 5)).toBe(1);
    expect(boxGrid([undefined], 4).nearest(0, 0)).toBe(undefined);
    expect(boxGrid([], 4).nearest(0, 0)).toBe(undefined);
  });
});
