import { describe, expect, it } from "vitest";

import { durationEdges } from "../scale/ladder.js";
import { position } from "../scale/position.js";

import {
  areaPaths,
  barBlock,
  barCentre,
  barPaths,
  barReach,
  barSegments,
  bucketEdges,
  dotGroups,
  dotPath,
  groupEdges,
  linePath,
  rectPaths,
  type Frame,
} from "./geometry.js";
import {
  chartModel,
  type AreaModel,
  type BarModel,
  type LineModel,
  type Model,
  type RectModel,
} from "./model.js";
import type { ChartSpec } from "./spec.js";
import { generatedSummary } from "./summary.js";
import { tableModel } from "./table.js";
import { chartWords } from "./words.js";

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
const areaOf = (m: Model) => m.marks[0] as AreaModel;

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

  it("stacks a 100% bucket's shares to the top, the gap between them, and leaves a total of 0 empty", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "rect",
          arrange: "share",
          x1: [0, 1, 2],
          x2: [1, 2, 3],
          series: [
            { name: "a", y: [30, 0, 5] },
            { name: "b", y: [10, 0, null] },
          ],
        },
      ],
    };
    const m = model(spec);
    // 200 px for the whole of each bucket: 3/4 and 1/4 of 40, then 5 of 5.
    const [a, b] = rectPaths(rectOf(m), frame(m, 30, 200, 1)).map(boxes);
    const heights = (list: typeof a) =>
      list?.map(({ left, top, bottom }) => ({ left, top, bottom }));
    expect(heights(a)).toEqual([
      { left: 1, top: 50, bottom: 200 },
      { left: 21, top: 0, bottom: 200 },
    ]);
    expect(heights(b)).toEqual([{ left: 1, top: 0, bottom: 49 }]);
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

  it("draws the read histogram's underflow bin below the low end, the width of its neighbour", () => {
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

// `n` buckets of `series` series under "group", each value its series' index + 1.
function grouped(n: number, series: number, domain?: readonly [number, number]): Model {
  const x1 = Array.from({ length: n }, (_, i) => i);
  return model({
    x: domain === undefined ? {} : { domain },
    marks: [
      {
        mark: "rect",
        arrange: "group",
        x1,
        x2: x1.map((v) => v + 1),
        series: Array.from({ length: series }, (_, k) => ({
          name: String(k),
          y: x1.map(() => k + 1),
        })),
      },
    ],
  });
}

// The space between neighbouring groups and the widest space inside any group.
function spaces(subs: { left: number; right: number }[][]): { between: number; inside: number } {
  let between = Number.POSITIVE_INFINITY;
  let inside = 0;
  subs.forEach((group, i) => {
    group.forEach((s, k) => {
      const next = group[k + 1];
      if (next !== undefined) {
        inside = Math.max(inside, next.left - s.right);
      }
    });
    const after = subs[i + 1]?.[0];
    const last = group.at(-1);
    if (after !== undefined && last !== undefined) {
      between = Math.min(between, after.left - last.right);
    }
  });
  return { between, inside };
}

describe("grouped column geometry", () => {
  // dpr 100 snaps to the hundredth of a px, so the widths below are the design's.
  const edgesOf = (m: Model, width: number) => {
    const f = frame(m, width, 100, 3, 100);
    return rectOf(m).shown.map((i) => groupEdges(rectOf(m), i, f));
  };

  it("drops the inset to 0.5 px when 12.5 % leaves a sub-column under 2 px", () => {
    // 6.5 px buckets: (6.5 − 1.63 − 1) ÷ 2 = 1.94 px, so (6.5 − 1 − 1) ÷ 2 = 2.25 px.
    const subs = edgesOf(grouped(10, 2), 65);
    expect(subs[1]).toEqual([
      { left: 7, right: 9.25 },
      { left: 10.25, right: 12.5 },
    ]);
    expect(spaces(subs)).toEqual({ between: 1, inside: 1 });
  });

  it("keeps the 12.5 % inset for two series in 24 buckets on the 206 px phone plot", () => {
    const subs = edgesOf(grouped(24, 2), 206);
    const bucket = 206 / 24;
    const width = (bucket - 0.25 * bucket - 1) / 2;
    for (const s of subs.flat()) {
      expect(s.right - s.left).toBeCloseTo(width, 1);
    }
    expect(subs[3]?.[0]?.left).toBeCloseTo(3 * bucket + 0.125 * bucket, 1);
    const { between, inside } = spaces(subs);
    expect(inside).toBeCloseTo(1, 1);
    expect(between).toBeCloseTo(0.25 * bucket, 1);
  });

  it("lets three series in 24 buckets touch, with 1 px between groups", () => {
    const subs = edgesOf(grouped(24, 3), 206);
    const width = (206 / 24 - 1) / 3;
    for (const s of subs.flat()) {
      expect(s.right - s.left).toBeCloseTo(width, 1);
    }
    expect(spaces(subs)).toEqual({ between: expect.closeTo(1, 1), inside: expect.closeTo(0, 1) });
  });

  it("lets groups touch too when 1 px between them would leave a sub-column under 1 px", () => {
    // 72 buckets of 2.86 px: (2.86 − 1) ÷ 2 = 0.93 px, so 2.86 ÷ 2 = 1.43 px.
    const subs = edgesOf(grouped(72, 2), 206);
    for (const s of subs.flat()) {
      expect(s.right - s.left).toBeCloseTo(206 / 144, 1);
    }
    expect(spaces(subs)).toEqual({ between: expect.closeTo(0, 1), inside: expect.closeTo(0, 1) });
  });

  it("never leaves less space between groups than inside one, at any bucket width", () => {
    for (const series of [2, 3, 4]) {
      for (let width = 20; width <= 1_200; width += 7) {
        const { between, inside } = spaces(edgesOf(grouped(24, series), width));
        // Snapping to the hundredth of a px may move each space by 0.01.
        expect(between, `${String(series)} series in ${String(width)} px`).toBeGreaterThanOrEqual(
          inside - 0.02,
        );
      }
    }
  });

  it("takes no inset on a side cut at the domain's end", () => {
    // The last 10 px bucket is cut to 5 px: the inner gaps go, (5 − 0.5) ÷ 2 = 2.25 px.
    const subs = edgesOf(grouped(10, 2, [0, 9.5]), 95);
    expect(subs.at(-1)).toEqual([
      { left: 90.5, right: 92.75 },
      { left: 92.75, right: 95 },
    ]);
  });

  it("draws each series from the baseline in its own slot, a null leaving its slot empty", () => {
    const m = model({
      x: {},
      marks: [
        {
          mark: "rect",
          arrange: "group",
          x1: [0],
          x2: [1],
          series: [
            { name: "a", y: [10] },
            { name: "b", y: [null] },
            { name: "c", y: [5] },
          ],
        },
      ],
    });
    const [a, b, c] = rectPaths(rectOf(m), frame(m, 100, 100, 10, 100)).map(boxes);
    // A 12.5 px inset a side and 1 px gaps leave (100 − 25 − 2) ÷ 3 px each.
    const w = 73 / 3;
    expect(a?.[0]).toEqual({ left: 12.5, top: 0, right: expect.closeTo(12.5 + w, 2), bottom: 100 });
    expect(b).toEqual([]);
    expect(c?.[0]).toEqual({
      left: expect.closeTo(87.5 - w, 2),
      top: 50,
      right: 87.5,
      bottom: 100,
    });
  });
});

// Each closed shape "M x y (V y | H x)… Z" of a path as its corners, a
// point on a straight run between two others dropped.
function outlines(d: string): [number, number][][] {
  return [...d.matchAll(/M([^Z]*)Z/g)].map((g) => {
    const [x0, y0, ...rest] = (g[1] ?? "").split(/(?=[VH])| /);
    let at: [number, number] = [Number(x0), Number(y0)];
    const out: [number, number][] = [at];
    for (const c of rest) {
      at = c.startsWith("V") ? [at[0], Number(c.slice(1))] : [Number(c.slice(1)), at[1]];
      const [p, q] = [out.at(-2), out.at(-1)];
      if (q?.[0] === at[0] && q[1] === at[1]) {
        continue;
      }
      const straight =
        p !== undefined &&
        q !== undefined &&
        ((p[0] === q[0] && q[0] === at[0]) || (p[1] === q[1] && q[1] === at[1]));
      if (straight) {
        out[out.length - 1] = at;
      } else {
        out.push(at);
      }
    }
    return out;
  });
}

const area = (
  x1: number[],
  series: { name: string; y: (number | null)[] }[],
  more: { x2?: number[]; arrange?: "stack" | "share"; domain?: [number, number] } = {},
): Model =>
  model({
    x: more.domain === undefined ? {} : { domain: more.domain },
    marks: [
      {
        mark: "rect",
        shape: "area",
        x1,
        x2: more.x2 ?? x1.map((v) => v + 1),
        ...(more.arrange === undefined ? {} : { arrange: more.arrange }),
        series,
      },
    ],
  });

describe("step area geometry", () => {
  it("draws each series' run of touching buckets as one shape, flat across each bucket, the 1 px gap per bucket", () => {
    const m = area(
      [0, 1, 2, 3],
      [
        { name: "a", y: [2, 4, 0, 3] },
        { name: "b", y: [1, 1, 1, 1] },
      ],
    );
    // 100 px a bucket, 10 px a unit.
    const [a, b] = rectPaths(rectOf(m), frame(m, 400, 100, 10)).map(outlines);
    expect(a).toEqual([
      [
        [0, 100],
        [0, 80],
        [100, 80],
        [100, 60],
        [200, 60],
        [200, 100],
        [0, 100],
      ],
      [
        [300, 100],
        [300, 70],
        [400, 70],
        [400, 100],
        [300, 100],
      ],
    ]);
    // b sits 1 px above a's top in every bucket a fills, on the baseline in bucket 2.
    expect(b).toEqual([
      [
        [0, 79],
        [0, 70],
        [100, 70],
        [100, 50],
        [200, 50],
        [200, 90],
        [300, 90],
        [300, 60],
        [400, 60],
        [400, 69],
        [300, 69],
        [300, 100],
        [200, 100],
        [200, 59],
        [100, 59],
        [100, 79],
        [0, 79],
      ],
    ]);
  });

  it("takes no gap below a segment under 3 px tall", () => {
    const m = area(
      [0],
      [
        { name: "a", y: [5] },
        { name: "b", y: [0.2] },
      ],
    );
    const [, b] = rectPaths(rectOf(m), frame(m, 100, 100, 10)).map(outlines);
    expect(b?.[0]?.slice(0, 2)).toEqual([
      [0, 50],
      [0, 48],
    ]);
  });

  it("ends a run at a 0, a null and a gap in x, never bridging them", () => {
    const m = area([0, 1, 3, 4, 5, 6], [{ name: "a", y: [1, 1, 1, null, 1, 0] }], {
      x2: [1, 2, 4, 5, 6, 7],
    });
    const [a] = rectPaths(rectOf(m), frame(m, 700, 100, 1)).map(outlines);
    expect(a?.map((o) => [o[0]?.[0], Math.max(...o.map((p) => p[0]))])).toEqual([
      [0, 200],
      [300, 400],
      [500, 600],
    ]);
  });

  it("lets buckets touch with no inset, so 72 on 276 px fill the plot edge to edge", () => {
    const x1 = Array.from({ length: 72 }, (_, i) => i);
    const m = area(x1, [{ name: "a", y: x1.map(() => 1) }]);
    const f = frame(m, 276, 200, 1, 3);
    const edges = rectOf(m).shown.map((i) => bucketEdges(rectOf(m), i, f));
    expect(edges[0]?.left).toBe(0);
    expect(edges.at(-1)?.right).toBe(276);
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]?.left).toBe(edges[i - 1]?.right);
    }
    expect(outlines(rectPaths(rectOf(m), f)[0] ?? "")).toHaveLength(1);
  });

  it("cuts a run at each end of a passed domain at the plot's edge", () => {
    const m = area([0, 1, 2, 3, 4, 5], [{ name: "a", y: [1, 1, 1, 1, 1, 1] }], {
      domain: [1.5, 4.5],
    });
    const [a] = rectPaths(rectOf(m), frame(m, 300, 100, 1)).map(outlines);
    expect(a).toEqual([
      [
        [0, 100],
        [0, 0],
        [300, 0],
        [300, 100],
        [0, 100],
      ],
    ]);
  });

  it("runs right to left on a reversed x", () => {
    const m = model({
      x: { reverse: true },
      marks: [
        { mark: "rect", shape: "area", x1: [0, 1], x2: [1, 2], series: [{ name: "a", y: [1, 2] }] },
      ],
    });
    const [a] = rectPaths(rectOf(m), frame(m, 200, 100, 2)).map(outlines);
    expect(a).toEqual([
      [
        [200, 100],
        [200, 50],
        [100, 50],
        [100, 0],
        [0, 0],
        [0, 100],
        [200, 100],
      ],
    ]);
  });

  it("joins the read histogram's underflow bin to its run", () => {
    const edges = durationEdges();
    const m = model({
      x: { type: "log", format: "duration", domain: [1_000, edges.at(-1) ?? 0] },
      marks: [
        {
          mark: "rect",
          shape: "area",
          x1: edges.slice(0, -1),
          x2: edges.slice(1),
          series: [{ name: "Reads", y: edges.slice(1).map(() => 1) }],
        },
      ],
    });
    const [a] = rectPaths(rectOf(m), frame(m, 276, 200, 1)).map(outlines);
    expect(a).toEqual([
      [
        [0, 200],
        [0, 0],
        [276, 0],
        [276, 200],
        [0, 200],
      ],
    ]);
  });

  it("stacks a 100% area's shares to the top, a bucket whose total is 0 ending every run", () => {
    const m = area(
      [0, 1, 2],
      [
        { name: "a", y: [1, 0, 1] },
        { name: "b", y: [3, 0, 1] },
      ],
      { arrange: "share" },
    );
    const [a, b] = rectPaths(rectOf(m), frame(m, 300, 100, 1)).map(outlines);
    expect(a?.map((o) => o.map((p) => p[1]))).toEqual([
      [100, 75, 75, 100, 100],
      [100, 50, 50, 100, 100],
    ]);
    expect(b?.map((o) => o[1])).toEqual([
      [0, 0],
      [200, 0],
    ]);
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

  it("reads a line's value at or below 0 on a log y as a gap, in the path, summary and table", () => {
    const m = model({
      x: {},
      y: { type: "log" },
      marks: [{ mark: "line", x: [0, 1, 2, 3], series: [{ name: "a", y: [2, 0, 8, -1] }] }],
    });
    const f: Frame = { ...frame(m, 300, 100, 1), yAt: position("log", 2, 8, 100, 0) };
    expect(points(linePath(lineOf(m), 0, f))).toEqual([
      [0, 100, 0, 100],
      [200, 0, 200, 0],
    ]);
    const words = chartWords();
    expect(generatedSummary(m, words)).toContain("low 2, high 8");
    const cells = tableModel(m, words).rows.map((r) => r.cells[0]?.parts.join(""));
    expect(cells).toEqual(["2", words.noData, "8", words.noData]);
  });

  it("starts a line on a log x at its first sample inside the domain when the one before is at 0", () => {
    const m = model({
      x: { type: "log", domain: [1, 100] },
      marks: [{ mark: "line", x: [0, 10, 100], series: [{ name: "a", y: [1, 2, 3] }] }],
    });
    const d = linePath(lineOf(m), 0, frame(m, 200, 300, 3));
    expect(points(d)).toEqual([[100, 100, 200, 0]]);
  });

  it("holds a step line's value from the low end of a log x when the sample before is at 0", () => {
    const m = model({
      x: { type: "log", domain: [1, 100] },
      marks: [
        { mark: "line", x: [0, 10, 100], curve: "step", series: [{ name: "a", y: [5, 2, 3] }] },
      ],
    });
    const d = linePath(lineOf(m), 0, frame(m, 200, 300, 6));
    expect(points(d)).toEqual([[0, 50, 100, 50, 100, 200, 200, 200, 200, 150]]);
  });

  describe("draws the newest sample on the plot's end of an inferred time domain", () => {
    const MIN = 60_000;
    const S = Date.UTC(2026, 10, 12, 9);
    const x = [S, S + 10 * MIN, S + 20 * MIN];
    const line = (y: (number | null)[], curve: "linear" | "step", reverse = false): ChartSpec => ({
      x: { type: "time", reverse },
      marks: [{ mark: "line", x, curve, series: [{ name: "a", y }] }],
    });
    // On 425 px, 100 px tall up to 5: 3 sits at 40, 4 at 20 and 5 at 0.
    const drawn = (spec: ChartSpec) => {
      const m = model(spec);
      return points(linePath(lineOf(m), 0, frame(m, 425, 100, 5)));
    };

    it("ends a step line on its last change", () => {
      expect(drawn(line([3, 5, 4], "step"))).toEqual([
        [0, 40, 212.5, 40, 212.5, 0, 425, 0, 425, 20],
      ]);
    });

    it("ends a reversed step line on its last change", () => {
      expect(drawn(line([3, 5, 4], "step", true))).toEqual([
        [425, 40, 212.5, 40, 212.5, 0, 0, 0, 0, 20],
      ]);
    });

    it("draws a lone newest sample after a gap", () => {
      expect(drawn(line([3, null, 4], "linear"))).toEqual([
        [0, 40, 0, 40],
        [425, 20, 425, 20],
      ]);
    });
  });

  it("draws a sample on the end of a plot of fractional width after a gap in its last column", () => {
    const m = model({
      x: { domain: [0, 1_000] },
      marks: [
        { mark: "line", x: [0, 999, 999.5, 1_000], series: [{ name: "a", y: [1, 2, null, 3] }] },
      ],
    });
    const runs = points(linePath(lineOf(m), 0, frame(m, 424.6, 300, 3)));
    expect(runs).toHaveLength(2);
    expect(runs[1]).toEqual([424.6, 0, 424.6, 0]);
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

// Each closed shape "M x yLx y…Z" of a path, as its points' numbers.
function shapes(d: string): number[][] {
  return [...d.matchAll(/M([^Z]*)Z/g)].map((g) => (g[1] ?? "").split(/[ L]/).map(Number));
}

describe("area geometry", () => {
  const stack = (
    series: (number | null)[][],
    more: { curve?: "step"; reverse?: boolean; share?: boolean } = {},
  ): ChartSpec => ({
    x: { reverse: more.reverse === true },
    marks: [
      {
        mark: "area",
        x: (series[0] ?? []).map((_, i) => i),
        ...(more.curve === undefined ? {} : { curve: more.curve }),
        ...(more.share === true ? { arrange: "share" as const } : {}),
        series: series.map((y, k) => ({ name: `s${String(k)}`, y })),
      },
    ],
  });
  const drawn = (spec: ChartSpec, width: number, yHi: number) => {
    const m = model(spec);
    return areaPaths(areaOf(m), frame(m, width, 100, yHi)).map(shapes);
  };

  it("fills the first layer from the baseline and the next from its top, 1 px above it", () => {
    // On 100 px up to 10, a value v sits at 100 - 10v.
    const [a, b] = drawn(
      stack([
        [2, 4],
        [2, 2],
      ]),
      100,
      10,
    );
    expect(a).toEqual([[0, 80, 100, 60, 100, 100, 0, 100]]);
    expect(b).toEqual([[0, 60, 100, 40, 100, 59, 0, 79]]);
  });

  it("breaks every layer where any series is a gap, and fills no lone sample", () => {
    const [a, b] = drawn(
      stack([
        [2, 4, 2, 4, 4],
        [2, 2, null, 2, 2],
      ]),
      400,
      10,
    );
    expect(a).toEqual([
      [0, 80, 100, 60, 100, 100, 0, 100],
      [300, 60, 400, 60, 400, 100, 300, 100],
    ]);
    expect(b).toHaveLength(2);
    expect(drawn(stack([[1, null, 1]]), 200, 1)).toEqual([[]]);
  });

  it("takes no gap below a layer under 3 px tall in a column, nor on a stack of 0", () => {
    // 0.2 is 2 px on 100 px up to 10.
    const [, thin] = drawn(
      stack([
        [2, 2],
        [0.2, 0.2],
      ]),
      100,
      10,
    );
    expect(thin).toEqual([[0, 78, 100, 78, 100, 80, 0, 80]]);
    const [, onZero] = drawn(
      stack([
        [0, 0],
        [5, 5],
      ]),
      100,
      10,
    );
    expect(onZero).toEqual([[0, 50, 100, 50, 100, 100, 0, 100]]);
  });

  it("stacks shares to the top of the plot under share, the 1 px gap kept", () => {
    // On 100 px up to 1, a share v sits at 100 - 100v.
    const [a, b] = drawn(
      stack(
        [
          [1, 3],
          [3, 1],
        ],
        { share: true },
      ),
      100,
      1,
    );
    expect(a).toEqual([[0, 75, 100, 25, 100, 100, 0, 100]]);
    expect(b).toEqual([[0, 0, 100, 0, 100, 24, 0, 74]]);
  });

  it("breaks every layer under share where a sample's total is 0", () => {
    const [a, b] = drawn(
      stack(
        [
          [1, 1, 0, 1, 1],
          [1, 1, 0, 1, 1],
        ],
        { share: true },
      ),
      400,
      1,
    );
    expect(a).toEqual([
      [0, 50, 100, 50, 100, 100, 0, 100],
      [300, 50, 400, 50, 400, 100, 300, 100],
    ]);
    expect(b).toHaveLength(2);
  });

  it("holds each value until the next sample on a step curve", () => {
    const [a] = drawn(stack([[1, 3]], { curve: "step" }), 100, 4);
    expect(a?.[0]?.slice(0, 6)).toEqual([0, 75, 100, 75, 100, 25]);
  });

  it("draws a reversed x right to left", () => {
    const [a] = drawn(stack([[0, 1]], { reverse: true }), 100, 1);
    expect(a).toEqual([[100, 100, 0, 0, 0, 100, 100, 100]]);
  });

  it("reduces 4,320 samples in three layers per pixel column, keeping each peak, the layers sharing their edges", () => {
    const n = 4_320;
    const spike = (at: number) => Array.from({ length: n }, (_, i) => (i === at ? 20 : 10));
    const m = model(stack([spike(1_000), spike(2_000), spike(3_000)]));
    const paths = areaPaths(areaOf(m), frame(m, 276, 100, 100));
    const [a, b, c] = paths.map((d) => shapes(d)[0] ?? []);
    for (const pts of [a, b, c]) {
      expect((pts ?? []).length / 2).toBeLessThan(2 * 4 * 277);
    }
    // The stack is 30 tall, 40 at each spike: on 100 px up to 100, 60 px.
    const ys = (pts: number[] | undefined) => (pts ?? []).filter((_, k) => k % 2 === 1);
    expect(Math.min(...ys(c))).toBe(60);
    // Layer b's bottom is layer a's top raised by its 1 px gap, point for point.
    // A shape runs along its top to the plot's right edge, then back.
    const split = (pts: number[] = []) => {
      const k = pts.findIndex((v, j) => j % 2 === 0 && v === 276) + 2;
      return [pts.slice(0, k), pts.slice(k)] as const;
    };
    const [aTop] = split(a);
    const [, bBottom] = split(b);
    const back: number[] = [];
    for (let k = bBottom.length - 2; k >= 0; k -= 2) {
      back.push(bBottom[k] ?? 0, (bBottom[k + 1] ?? 0) + 1);
    }
    expect(back).toEqual(aTop);
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

describe("bars", () => {
  const barModel = (series: (number | null)[][]) =>
    model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
          series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
        },
      ],
    });
  const barFrame = (m: Model, lo: number, hi: number, width = 100): Frame => ({
    width,
    height: 48,
    dpr: 1,
    x: m.x,
    xAt: position("linear", lo, hi, 0, width),
    yAt: (v) => v,
  });
  const barOf = (m: Model) => m.marks[0] as BarModel;

  it("draws each bar from 0 to its value, centred on its row", () => {
    const m = barModel([[40, 100]]);
    const f = barFrame(m, 0, 100);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 0, right: 40, top: 4, bottom: 20 },
    ]);
    expect(barPaths(barOf(m), [12, 36], 16, f)).toEqual([
      { slot: 1, d: "M0 4H40V20H0ZM0 28H100V44H0Z" },
    ]);
  });

  it("draws a negative value leftward from 0, and nothing for 0 or a gap", () => {
    const m = barModel([[-20, 0, null]]);
    const f = barFrame(m, -50, 50);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 30, right: 50, top: 4, bottom: 20 },
    ]);
    expect(barSegments(barOf(m), 1, f, 36, 16)).toEqual([undefined]);
    expect(barSegments(barOf(m), 2, f, 36, 16)).toEqual([undefined]);
  });

  it("draws a series' bars below 0 in its below slot, and keeps one path without it", () => {
    const spec = (below?: 2 | 4) =>
      model({
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["a", "b", "c"],
            series: [
              {
                name: "Change",
                slot: 3,
                ...(below === undefined ? {} : { below }),
                x: [20, -10, 0],
              },
            ],
          },
        ],
      });
    const f = barFrame(spec(), -50, 50);
    expect(barPaths(barOf(spec(4)), [12, 36, 60], 16, f)).toEqual([
      { slot: 3, d: "M50 4H70V20H50Z" },
      { slot: 4, d: "M40 28H50V44H40Z" },
    ]);
    expect(barPaths(barOf(spec(3 as 2)), [12, 36, 60], 16, f)).toEqual([
      { slot: 3, d: "M50 4H70V20H50ZM40 28H50V44H40Z" },
    ]);
    expect(barPaths(barOf(spec()), [12, 36, 60], 16, f)).toEqual([
      { slot: 3, d: "M50 4H70V20H50ZM40 28H50V44H40Z" },
    ]);
    expect(barOf(spec()).series[0]?.below).toBe(3);
  });

  it("stacks series from 0, each beyond another 1 px short unless under 3 px", () => {
    const m = barModel([
      [30, 30],
      [20, 2],
      [-10, null],
    ]);
    const f = barFrame(m, -20, 80);
    const at = (v: number) => f.xAt(v);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: at(0), right: at(30), top: 4, bottom: 20 },
      { left: at(30) + 1, right: at(50), top: 4, bottom: 20 },
      { left: at(-10), right: at(0), top: 4, bottom: 20 },
    ]);
    // The 2-unit segment is 2 px, under 3, so it keeps its length and no gap.
    expect(barSegments(barOf(m), 1, f, 36, 16)[1]).toEqual({
      left: at(30),
      right: at(32),
      top: 28,
      bottom: 44,
    });
    expect(barReach(barOf(m), 0)).toEqual({ lo: -10, hi: 50 });
  });

  const grouped = (series: (number | null)[][]) =>
    model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
          arrange: "group",
          series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
        },
      ],
    });

  it("groups series as 12 px bars one under another, 1 px apart, each from 0", () => {
    const m = grouped([[30], [-10], [null], [20]]);
    const f = barFrame(m, -20, 80);
    const at = (v: number) => f.xAt(v);
    // Four 12 px bars and three 1 px gaps are 51 px, centred on the row's 30.
    expect(barBlock(barOf(m), 16)).toBe(51);
    expect(barSegments(barOf(m), 0, f, 30, 16)).toEqual([
      { left: at(0), right: at(30), top: 5, bottom: 17 },
      { left: at(-10), right: at(0), top: 18, bottom: 30 },
      undefined,
      { left: at(0), right: at(20), top: 44, bottom: 56 },
    ]);
    expect(barCentre(barOf(m), 3, 30, 16)).toBe(49.5);
    expect(barReach(barOf(m), 0)).toEqual({ lo: -10, hi: 30 });
  });

  it("stacks each row's shares to the full width, and draws nothing in a row whose total is 0", () => {
    const m = model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["a", "b"],
          arrange: "share",
          series: [
            { name: "p", x: [30, 0] },
            { name: "q", x: [10, null] },
          ],
        },
      ],
    });
    const f = barFrame(m, 0, 1, 200);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 0, right: 150, top: 4, bottom: 20 },
      { left: 151, right: 200, top: 4, bottom: 20 },
    ]);
    expect(barSegments(barOf(m), 1, f, 36, 16)).toEqual([undefined, undefined]);
    expect(barReach(barOf(m), 0)).toEqual({ lo: 0, hi: 1 });
  });

  it("draws one series grouped as a plain bar", () => {
    const m = grouped([[40]]);
    expect(barOf(m).arrange).toBe("stack");
    expect(barBlock(barOf(m), 16)).toBe(16);
    expect(barSegments(barOf(m), 0, barFrame(m, 0, 100), 12, 16)).toEqual([
      { left: 0, right: 40, top: 4, bottom: 20 },
    ]);
  });

  const split = (series: (number | null)[][]) =>
    model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
          arrange: "split",
          series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
        },
      ],
    });
  // Two 92 px panels 16 px apart, each 0 to 50 along its first 80 px.
  const panelled = (m: Model): Frame => ({
    ...barFrame(m, 0, 50, 200),
    panels: [0, 108].map((left) => ({
      left,
      right: left + 92,
      at: (v: number) => left + position("linear", 0, 50, 0, 80)(v),
    })),
  });

  it("draws each split series' bar from 0 in its own panel, a whole bar thick", () => {
    const m = split([
      [25, null],
      [50, 10],
    ]);
    const f = panelled(m);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 0, right: 40, top: 4, bottom: 20 },
      { left: 108, right: 188, top: 4, bottom: 20 },
    ]);
    expect(barSegments(barOf(m), 1, f, 36, 16)).toEqual([
      undefined,
      { left: 108, right: 124, top: 28, bottom: 44 },
    ]);
    expect(barReach(barOf(m), 0)).toEqual({ lo: 0, hi: 50 });
  });

  it("folds a split with no panels into 12 px bars one under another, as a group", () => {
    const m = split([[25], [50]]);
    const f = barFrame(m, 0, 50, 100);
    // Two 12 px bars and the 1 px between them are 25 px, centred on the row's 30.
    expect(barBlock(barOf(m), 16)).toBe(25);
    expect(barSegments(barOf(m), 0, f, 30, 16)).toEqual([
      { left: 0, right: 50, top: 18, bottom: 30 },
      { left: 0, right: 100, top: 31, bottom: 43 },
    ]);
    expect(barCentre(barOf(m), 1, 30, 16)).toBe(36.5);
  });

  const diverging = (series: (number | null)[][], left: number, centre: boolean) =>
    model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
          arrange: "diverge",
          left,
          centre,
          series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
        },
      ],
    });

  it("stacks the left series leftward from the centre's half, the rest rightward, each beyond another 1 px short", () => {
    const m = diverging([[10], [15], [20], [30], [25]], 2, true);
    // 0 at 40 px, 1 px a unit: the centre spans -10 to 10.
    const f = barFrame(m, -40, 70, 110);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 5, right: 14, top: 4, bottom: 20 },
      { left: 15, right: 29, top: 4, bottom: 20 },
      { left: 30, right: 50, top: 4, bottom: 20 },
      { left: 51, right: 80, top: 4, bottom: 20 },
      { left: 81, right: 105, top: 4, bottom: 20 },
    ]);
    expect(barReach(barOf(m), 0)).toEqual({ lo: -35, hi: 65 });
  });

  it("meets at 0 with no centre, the right side giving the gap, and skips a 0 and a gap", () => {
    const m = diverging(
      [
        [10, 0],
        [20, null],
        [30, 30],
      ],
      1,
      false,
    );
    const f = barFrame(m, -10, 50, 60);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 0, right: 10, top: 4, bottom: 20 },
      { left: 11, right: 30, top: 4, bottom: 20 },
      { left: 31, right: 60, top: 4, bottom: 20 },
    ]);
    // Nothing on the left, so the first right bar starts at 0 itself.
    expect(barSegments(barOf(m), 1, f, 36, 16)).toEqual([
      undefined,
      undefined,
      { left: 10, right: 40, top: 28, bottom: 44 },
    ]);
    expect(barReach(barOf(m), 1)).toEqual({ lo: 0, hi: 30 });
  });

  it("starts both sides at 0 when the centre series has no value", () => {
    const m = diverging([[10], [null], [30]], 1, true);
    const f = barFrame(m, -10, 50, 60);
    expect(barSegments(barOf(m), 0, f, 12, 16)).toEqual([
      { left: 0, right: 10, top: 4, bottom: 20 },
      undefined,
      { left: 11, right: 40, top: 4, bottom: 20 },
    ]);
  });

  it("draws one series split as a plain bar", () => {
    const m = split([[40]]);
    expect(barOf(m).arrange).toBe("stack");
    expect(barSegments(barOf(m), 0, barFrame(m, 0, 100), 12, 16)).toEqual([
      { left: 0, right: 40, top: 4, bottom: 20 },
    ]);
  });
});
