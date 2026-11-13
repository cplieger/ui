import { describe, expect, it } from "vitest";

import { pointGrid } from "./grid.js";

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
