import { describe, expect, it } from "vitest";

import { durationEdges } from "../scale/ladder.js";
import { position } from "../scale/position.js";

import { bucketEdges, dotGroups, dotPath, linePath, rectPaths, type Frame } from "./geometry.js";
import { chartModel, type LineModel, type Model, type RectModel } from "./model.js";
import type { ChartSpec } from "./spec.js";

function frame(model: Model, width: number, height: number, yHi: number, dpr = 1): Frame {
  const { x } = model;
  const xAt = x.reverse
    ? position(x.type, x.drawnLo, x.hi, width, 0)
    : position(x.type, x.drawnLo, x.hi, 0, width);
  return { width, height, dpr, x, xAt, yAt: position("linear", 0, yHi, height, 0) };
}

const model = (spec: ChartSpec) => chartModel(spec, "en", "UTC");
const rectOf = (m: Model) => m.marks[0] as RectModel;
const lineOf = (m: Model) => m.marks[0] as LineModel;

// Each rectangle "M l t H r V b H l Z" of a path, as numbers.
function boxes(d: string): { left: number; top: number; right: number; bottom: number }[] {
  return [...d.matchAll(/M([\d.-]+) ([\d.-]+)H([\d.-]+)V([\d.-]+)H[\d.-]+Z/g)].map((g) => ({
    left: Number(g[1]),
    top: Number(g[2]),
    right: Number(g[3]),
    bottom: Number(g[4]),
  }));
}

function buckets(n: number, values: (i: number) => number | null = () => 1): ChartSpec {
  const x1 = Array.from({ length: n }, (_, i) => i);
  return {
    x: {},
    marks: [
      {
        mark: "rect",
        x1,
        x2: x1.map((v) => v + 1),
        series: [{ name: "a", y: x1.map(values) }],
      },
    ],
  };
}

describe("rect geometry", () => {
  it("draws 72 buckets in 276 px about 2.8 px wide and 1 px apart", () => {
    const m = model(buckets(72));
    const f = frame(m, 276, 200, 1, 3);
    const edges = rectOf(m).shown.map((i) => bucketEdges(rectOf(m), i, f));
    const widths = edges.map((e) => e.right - e.left);
    const mean = widths.reduce((a, b) => a + b) / widths.length;
    expect(mean).toBeCloseTo(276 / 72 - 1, 1);
    for (let i = 1; i < edges.length; i++) {
      expect((edges[i]?.left ?? 0) - (edges[i - 1]?.right ?? 0)).toBeCloseTo(1, 9);
    }
  });

  it("lets buckets touch when a gap would leave under 1 px of bar", () => {
    const m = model(buckets(200));
    const f = frame(m, 276, 200, 1, 2);
    const edges = rectOf(m).shown.map((i) => bucketEdges(rectOf(m), i, f));
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]?.left).toBe(edges[i - 1]?.right);
    }
  });

  it("stacks in series order, the upper segment giving its bottom px as the gap", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "rect",
          x1: [0],
          x2: [1],
          series: [
            { name: "a", y: [100] },
            { name: "b", y: [50] },
            { name: "c", y: [1] },
            { name: "d", y: [0.4] },
          ],
        },
      ],
    };
    const m = model(spec);
    // 1 px per post.
    const [a, b, c, d] = rectPaths(rectOf(m), frame(m, 100, 300, 300)).map(boxes);
    expect(a?.[0]).toMatchObject({ top: 200, bottom: 300 });
    expect(b?.[0]).toMatchObject({ top: 150, bottom: 199 });
    expect(c?.[0]).toMatchObject({ top: 149, bottom: 150 });
    expect(d?.[0]?.top).toBeCloseTo(148.6, 9);
    expect(d?.[0]?.bottom).toBe(149);
  });

  it("draws nothing for a null or a 0, which keeps the segments above in place", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "rect",
          x1: [0],
          x2: [1],
          series: [
            { name: "a", y: [null] },
            { name: "b", y: [0] },
            { name: "c", y: [Number.NaN] },
            { name: "d", y: [10] },
          ],
        },
      ],
    };
    const m = model(spec);
    const [a, b, c, d] = rectPaths(rectOf(m), frame(m, 100, 100, 10));
    expect([a, b, c]).toEqual(["", "", ""]);
    expect(boxes(d ?? "")[0]).toMatchObject({ top: 0, bottom: 100 });
  });

  it("never writes a height below 0, and a stack's top is its total", () => {
    const m = model(buckets(20, (i) => (i % 3) * 0.3));
    const f = frame(m, 200, 3, 1);
    for (const box of boxes(rectPaths(rectOf(m), f)[0] ?? "")) {
      expect(box.bottom).toBeGreaterThan(box.top);
    }
    const two: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "rect",
          x1: [0],
          x2: [1],
          series: [
            { name: "a", y: [7] },
            { name: "b", y: [5] },
          ],
        },
      ],
    };
    const t = model(two);
    expect(boxes(rectPaths(rectOf(t), frame(t, 10, 240, 12))[1] ?? "")[0]?.top).toBe(0);
  });

  it("cuts a rect crossing each end of a passed domain at the plot's edge and leaves out one wholly outside", () => {
    const spec = buckets(6);
    const m = model({ ...spec, x: { domain: [1.5, 4.5] } });
    const rect = rectOf(m);
    expect(rect.shown).toEqual([1, 2, 3, 4]);
    const f = frame(m, 300, 100, 1, 2);
    expect(bucketEdges(rect, 1, f)).toEqual({ left: 0, right: 50 - 0.5 });
    expect(bucketEdges(rect, 4, f)).toEqual({ left: 250 + 0.5, right: 300 });
  });

  it("draws job 2's underflow bin below the low end, the width of its neighbour", () => {
    const edges = durationEdges();
    const spec: ChartSpec = {
      x: { type: "log", format: "duration", domain: [1_000, edges.at(-1) ?? 0] },
      marks: [
        {
          mark: "rect",
          x1: edges.slice(0, -1),
          x2: edges.slice(1),
          series: [{ name: "Reads", y: edges.slice(1).map(() => 1) }],
        },
      ],
    };
    const m = model(spec);
    expect(m.x.drawnLo).toBe(500);
    const f = frame(m, 276, 200, 1, 1);
    const under = bucketEdges(rectOf(m), 0, f);
    const next = bucketEdges(rectOf(m), 1, f);
    expect(under.left).toBe(0);
    expect(under.right).toBe(Math.round(f.xAt(1_000) - 0.5));
    expect(f.xAt(1_000) - f.xAt(500)).toBeCloseTo(f.xAt(2_000) - f.xAt(1_000), 9);
    expect(next.left).toBe(under.right + 1);
  });
});

function points(d: string): number[][] {
  return d
    .split("M")
    .filter((s) => s !== "")
    .map((run) => run.split(/[ L]/).map(Number));
}

describe("line geometry", () => {
  const ramp = (curve: "linear" | "step"): ChartSpec => ({
    x: { domain: [5, 25] },
    marks: [
      { mark: "line", x: [0, 10, 20, 30], curve, series: [{ name: "a", y: [0, 10, 20, 30] }] },
    ],
  });

  it("cuts a straight line at each end of the domain at its value there", () => {
    const m = model(ramp("linear"));
    const d = linePath(lineOf(m), 0, frame(m, 200, 300, 30));
    expect(points(d)).toEqual([[0, 250, 50, 200, 150, 100, 200, 50]]);
  });

  it("holds a step line's value to the edge from the last sample before it", () => {
    const m = model(ramp("step"));
    const d = linePath(lineOf(m), 0, frame(m, 200, 300, 30));
    expect(points(d)).toEqual([[0, 300, 50, 300, 50, 200, 150, 200, 150, 100, 200, 100]]);
  });

  it("breaks at a gap, NaN included, and draws a lone value as a dot", () => {
    const m = model({
      x: {},
      marks: [
        {
          mark: "line",
          x: [0, 1, 2, 3, 4],
          series: [{ name: "a", y: [1, 2, null, 4, Number.NaN] }],
        },
      ],
    });
    const d = linePath(lineOf(m), 0, frame(m, 400, 100, 4));
    expect(points(d)).toEqual([
      [0, 75, 100, 50],
      [300, 0, 300, 0],
    ]);
  });

  it("keeps each pixel column's extremes of 4,320 samples", () => {
    const x = Array.from({ length: 4_320 }, (_, i) => i);
    const y = x.map((i) => (i === 2_000 ? 50 : i === 3_000 ? -40 : 0));
    const m = model({
      x: {},
      y: { zero: false },
      marks: [{ mark: "line", x, series: [{ name: "a", y }] }],
    });
    const f: Frame = { ...frame(m, 276, 100, 1), yAt: (v) => 50 - v };
    const pts = points(linePath(lineOf(m), 0, f))[0] ?? [];
    const ys = pts.filter((_, k) => k % 2 === 1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(90);
    expect(pts.length / 2).toBeLessThan(4 * 277);
  });

  it("draws a reversed x right to left", () => {
    const m = model({
      x: { reverse: true },
      marks: [{ mark: "line", x: [0, 1], series: [{ name: "a", y: [0, 1] }] }],
    });
    expect(points(linePath(lineOf(m), 0, frame(m, 100, 100, 1)))).toEqual([[100, 100, 0, 0]]);
  });
});

describe("dot geometry", () => {
  it("draws tied and same-pixel dots once and leaves out dots outside the domain", () => {
    const m = model({
      x: { domain: [0, 400] },
      marks: [{ mark: "dot", rows: [{ name: "a", x: [10, 10, 10.2, 20, 500] }] }],
    });
    const dots = m.marks[0];
    if (dots?.kind !== "dot") {
      throw new Error("expected a dot mark");
    }
    const row = dots.rows[0];
    expect(row).toMatchObject({ from: 0, to: 4 });
    const f = frame(m, 400, 24, 1);
    const groups = dotGroups(row ?? { name: "", x: [], from: 0, to: 0 }, f);
    expect(groups).toEqual([
      { at: 10, from: 0, to: 3 },
      { at: 20, from: 3, to: 4 },
    ]);
    expect(dotPath(groups, 12.5)).toBe("M10 12.5h0M20 12.5h0");
  });
});
