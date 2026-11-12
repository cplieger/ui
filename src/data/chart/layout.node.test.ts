import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";
import { measurer } from "../scale/measure.js";

import { layout, type Metrics } from "./layout.js";
import { chartModel } from "./model.js";
import type { ChartSpec } from "./spec.js";
import { chartWords } from "./words.js";

// A face 7.5 px a character, digits included.
const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
const metrics = (more: Partial<Metrics> = {}): Metrics => ({
  measure: face,
  mono: face,
  lineHeight: 17,
  rem: 16,
  row: 24,
  axisGroup: 0,
  labelGroup: 0,
  height: 240,
  dpr: 1,
  ...more,
});
const words = chartWords();
const lay = (
  spec: ChartSpec,
  width: number,
  more: Partial<Metrics> = {},
  floors = { axis: 0, label: 0 },
) => layout(chartModel(spec, "en", "UTC"), words, metrics(more), width, floors);

const edges = durationEdges();
const readDelays = (median: number, p95: number): ChartSpec => ({
  x: {
    type: "log",
    format: "duration",
    label: "Time from post to read",
    domain: [1_000, edges.at(-1) ?? 0],
  },
  y: { label: "Reads", unit: { one: "read", other: "reads" } },
  marks: [
    {
      mark: "rect",
      x1: edges.slice(0, -1),
      x2: edges.slice(1),
      series: [{ name: "Reads", y: edges.slice(1).map(() => 3) }],
    },
    { mark: "rule", x: median, label: "Median" },
    { mark: "rule", x: p95, label: "95th percentile" },
  ],
});

const line = (y: (number | null)[][]): ChartSpec => ({
  x: {},
  marks: [
    {
      mark: "line",
      x: (y[0] ?? []).map((_, i) => i),
      series: y.map((values, k) => ({ name: `s${String(k)}`, y: values })),
    },
  ],
});

describe("rule labels", () => {
  it("lays the read histogram's rules on the 276 px phone plot: the median runs right, the 95th percentile ends at its rule on the second line", () => {
    const l = lay(readDelays(42_000, 1_087_000), 80 + 276, { axisGroup: 80 });
    expect(l.frame.width).toBe(276);
    const [median, p95] = l.ruleLabels;
    expect(median?.text).toBe(`Median ${formatDuration(42_000, "en")}`);
    expect(median?.x).toBeCloseTo(80 + l.frame.xAt(42_000), 6);
    expect(p95?.x).toBe(80);
    expect(p95?.y).toBeGreaterThan(median?.y ?? 0);
    // The y title shares the band's first line, so the band is two lines tall.
    expect(l.titles[0]).toMatchObject({ text: "Reads", x: 0, y: median?.y });
    expect(l.top).toBe(2 * 17 + 4);
  });

  it("writes a rule outside the domain as a label flush with its end", () => {
    const l = lay(readDelays(42_000, 4 * 86_400_000), 80 + 276, { axisGroup: 80 });
    const off = l.ruleLabels[1];
    expect(off?.text).toBe(`95th percentile ${formatDuration(4 * 86_400_000, "en")}, off the axis`);
    expect((off?.x ?? 0) + face.number(off?.text ?? "")).toBe(80 + 276);
  });

  it("puts the y title on its own line when a rule's label would touch it", () => {
    const l = lay(readDelays(1_000, 1_000), 300);
    expect(l.titles[0]?.y).toBeLessThan(l.ruleLabels[0]?.y ?? 0);
    expect(l.top).toBe(3 * 17 + 4);
  });
});

describe("gutters", () => {
  it("is the widest y label and its pad, or the group's gutter or the floor when wider", () => {
    const spec = line([[0, 12_345]]);
    const l = lay(spec, 600);
    const widest = Math.max(...l.yLabels.map((t) => face.number(t.text)));
    expect(l.gutters.axis).toBe(Math.ceil(widest + 8));
    expect(lay(spec, 600, { axisGroup: 128 }).gutters.axis).toBe(128);
    expect(lay(spec, 600, {}, { axis: 150, label: 0 }).gutters.axis).toBe(150);
  });

  it("cuts band names to the group gutter, so the gutter is the group's", () => {
    const spec: ChartSpec = {
      x: {},
      y: { type: "band", mono: true },
      marks: [
        {
          mark: "dot",
          rows: [
            { name: "a-very-long-agent-name", x: [1] },
            { name: "b", x: [2] },
          ],
        },
      ],
    };
    const l = lay(spec, 400, { axisGroup: 80 });
    expect(l.gutters.axis).toBe(80);
    expect(l.rows[0]?.name.endsWith("…")).toBe(true);
    expect(face.text(l.rows[0]?.name ?? "")).toBeLessThanOrEqual(72);
    expect(l.frame.height).toBe(2 * 24);
    expect(l.rows.map((r) => r.y)).toEqual([12, 36]);
  });

  it("keeps a column chart's label gutter at the group's, empty", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [{ mark: "rect", x1: [0], x2: [1], series: [{ name: "a", y: [1] }] }],
    };
    const l = lay(spec, 600, { labelGroup: 80 });
    expect(l.gutters.label).toBe(80);
    expect(l.endLabels).toEqual([]);
    expect(l.left + l.frame.width).toBe(600 - 80);
  });
});

describe("end labels", () => {
  it("labels each line at its last value in the label gutter from 30rem up", () => {
    const l = lay(
      line([
        [1, 5, null],
        [2, 9, 3],
      ]),
      480,
    );
    expect(l.endLabels.map((e) => e.text)).toEqual(["s0 5", "s1 3"]);
    const widest = Math.max(face.number("s0 5"), face.number("s1 3"));
    expect(l.gutters.label).toBe(Math.ceil(widest + 8));
    for (const e of l.endLabels) {
      expect(e.x).toBe(l.left + l.frame.width + 8);
    }
  });

  it("moves a lower end label down until it clears the one above", () => {
    const l = lay(
      line([
        [4, 6],
        [4, 6],
      ]),
      480,
    );
    const [a, b] = l.endLabels;
    expect((b?.y ?? 0) - (a?.y ?? 0)).toBe(17);
  });

  it("draws none under 30rem, where the label gutter measures 0", () => {
    const l = lay(line([[1, 5]]), 479);
    expect(l.endLabels).toEqual([]);
    expect(l.gutters.label).toBe(0);
  });

  it("reads 30rem off the chart's width, which the plot's borders make wider than its drawing", () => {
    const model = chartModel(line([[1, 5]]), "en", "UTC");
    const floors = { axis: 0, label: 0 };
    expect(layout(model, words, metrics(), 478, floors, 480).endLabels).toHaveLength(1);
    expect(layout(model, words, metrics(), 478, floors, 479.5).endLabels).toEqual([]);
  });

  it("moves the y gutter right and the end labels left under reverse", () => {
    const l = lay({ ...line([[1, 5]]), x: { reverse: true } }, 600);
    expect(l.left).toBe(l.gutters.label);
    expect(l.endLabels[0]).toMatchObject({ x: l.left - 8, anchor: "end" });
    expect(l.yLabels[0]).toMatchObject({ x: l.left + l.frame.width + 8, anchor: "start" });
  });
});

describe("an area's end labels", () => {
  const area = (y: (number | null)[][], arrange?: "share"): ChartSpec => ({
    x: {},
    height: 200,
    marks: [
      {
        mark: "area",
        x: (y[0] ?? []).map((_, i) => i),
        ...(arrange === undefined ? {} : { arrange }),
        series: y.map((values, k) => ({ name: `s${String(k)}`, y: values })),
      },
    ],
  });

  it("labels each layer at the middle of its thickness at the last whole stack", () => {
    // The last sample is a gap in s1, so the labels read the one before it.
    const l = lay(
      area([
        [2, 40, 1],
        [2, 60, null],
      ]),
      480,
    );
    expect(l.endLabels.map((e) => e.text)).toEqual(["s1 60", "s0 40"]);
    const [upper, lower] = l.endLabels;
    expect(lower?.y).toBeCloseTo(l.top + l.frame.yAt(20), 6);
    expect(upper?.y).toBeCloseTo(l.top + l.frame.yAt(70), 6);
    expect(lower?.x).toBe(l.left + l.frame.width + 8);
  });

  it("writes shares under share, the middle of each share's thickness on the 0 to 1 axis", () => {
    const l = lay(
      area(
        [
          [1, 1],
          [3, 3],
        ],
        "share",
      ),
      480,
    );
    expect(l.endLabels.map((e) => e.text)).toEqual(["s1 75%", "s0 25%"]);
    expect(l.endLabels[1]?.y).toBeCloseTo(l.top + l.frame.yAt(0.125), 6);
    expect(l.endLabels[0]?.y).toBeCloseTo(l.top + l.frame.yAt(0.625), 6);
  });

  it("moves thin layers' labels apart, the lower one down", () => {
    const l = lay(
      area([
        [1, 1],
        [1, 1],
        [98, 98],
      ]),
      480,
    );
    const ys = l.endLabels.map((e) => e.y);
    expect(l.endLabels.map((e) => e.text)).toEqual(["s2 98", "s1 1", "s0 1"]);
    expect((ys[2] ?? 0) - (ys[1] ?? 0)).toBe(17);
    expect(ys[1]).toBeCloseTo(l.top + l.frame.yAt(1.5), 6);
  });

  it("draws none with no whole stack, nor under 30rem", () => {
    expect(lay(area([[null], [1]]), 480).endLabels).toEqual([]);
    const narrow = lay(area([[1], [2]]), 479);
    expect(narrow.endLabels).toEqual([]);
    expect(narrow.gutters.label).toBe(0);
  });
});

describe("the plot's height", () => {
  it("is the spec's height, or the page's default", () => {
    const spec = line([[1, 2]]);
    expect(lay(spec, 600).frame.height).toBe(240);
    expect(lay(spec, 600, { height: 200 }).frame.height).toBe(200);
    expect(lay({ ...spec, height: 120 }, 600).frame.height).toBe(120);
  });
});
