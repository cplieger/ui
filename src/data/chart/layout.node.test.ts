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
  nameLine: 18,
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

describe("a bar chart", () => {
  const countries: ChartSpec = {
    x: {},
    marks: [
      {
        mark: "bar",
        y: ["Holy See", "Monaco", "Japan"],
        series: [{ name: "Median age", x: [57.4, 54.5, -9] }],
      },
    ],
  };

  it("sets a row of --cp-chart-row per category, its name in the gutter, from 30rem up", () => {
    const l = lay(countries, 600);
    expect(l.frame.height).toBe(3 * 24);
    expect(l.bar).toBe(16);
    expect(l.rows.map((r) => r.y)).toEqual([12, 36, 60]);
    expect(l.gutters.axis).toBe(7.5 * "Holy See".length + 8);
    expect(l.yLabels[0]).toMatchObject({ text: "Holy See", anchor: "end", x: l.left - 8 });
  });

  it("puts each name on its own line above its bar under 30rem, 44 px a row and no gutter", () => {
    const l = lay(countries, 479);
    expect(l.gutters.axis).toBe(0);
    expect(l.left).toBe(0);
    expect(l.frame.height).toBe(3 * 44);
    // The name's 18 px line, 2 px, then the 16 px bar centred in the row's 24 px.
    expect(l.rows.map((r) => r.y)).toEqual([28, 72, 116]);
    expect(l.yLabels[1]).toEqual({ text: "Monaco", x: 0, y: 44 + 9, anchor: "start" });
  });

  it("cuts a name above its bar to the plot's width", () => {
    const long: ChartSpec = {
      x: {},
      marks: [{ mark: "bar", y: ["A very long country name"], series: [{ name: "a", x: [1] }] }],
    };
    const l = lay(long, 100);
    expect((l.yLabels[0]?.text.length ?? 0) * 7.5).toBeLessThanOrEqual(100);
    expect(l.yLabels[0]?.text.endsWith("…")).toBe(true);
  });

  it("writes each value 4 px past its bar's end, x ending short by the widest label each side", () => {
    const l = lay(countries, 600);
    expect(l.xAxis.ticks).toEqual([]);
    expect(l.xLabels).toEqual([]);
    const [holy, , japan] = l.valueLabels;
    // One series with a value below 0 signs every value but 0.
    expect(holy).toMatchObject({ text: "+57.4", anchor: "start", y: 12 });
    expect(japan).toMatchObject({ text: "-9", anchor: "end", y: 60 });
    // "+57.4" and "-9" with their gaps leave the plot at both ends.
    expect(l.frame.xAt(57.4) + 4 + 5 * 7.5).toBeCloseTo(l.frame.width);
    expect(l.frame.xAt(-9) - 4 - 2 * 7.5).toBeCloseTo(0);
    expect(holy?.x).toBeCloseTo(l.frame.xAt(57.4) + 4);
    expect(l.height).toBe(l.top + l.frame.height);
  });

  it("labels a stack's total at the end of its whole bar, none for a row of gaps", () => {
    const l = lay(
      {
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["a", "b"],
            series: [
              { name: "p", x: [2, null] },
              { name: "q", x: [3, null] },
            ],
          },
        ],
      },
      600,
    );
    expect(l.valueLabels.map((t) => t.text)).toEqual(["5"]);
    expect(l.valueLabels[0]?.x).toBeCloseTo(l.frame.xAt(5) + 4);
  });

  it("signs a diverging bar's labels and keeps the widest label's room on each side", () => {
    const l = lay(
      {
        x: { format: "percent" },
        marks: [
          {
            mark: "bar",
            y: ["Utah", "Texas", "Puerto Rico"],
            series: [{ name: "Change", x: [0.16, 0, -0.143] }],
          },
        ],
      },
      600,
    );
    expect(l.valueLabels.map((t) => t.text)).toEqual(["+16%", "0%", "-14%"]);
    // 7.5 px a character and the 4 px gap: "+16%" on the right, "-14%" on the left.
    expect(l.frame.xAt(-0.143) - 4 - 4 * 7.5).toBeCloseTo(0);
    expect(l.frame.xAt(0.16) + 4 + 4 * 7.5).toBeCloseTo(l.frame.width);
    expect(l.valueLabels[2]).toMatchObject({ anchor: "end" });
  });

  const sexes: ChartSpec = {
    x: {},
    marks: [
      {
        mark: "bar",
        y: ["Japan", "Italy"],
        arrange: "group",
        series: [
          { name: "Combined", x: [49.8, 48.4] },
          { name: "Female", x: [51.1, null] },
          { name: "Male", x: [48.4, -3] },
        ],
      },
    ],
  };

  it("makes a grouped row its 12 px bars, the 1 px between them and 8 px, from 30rem up", () => {
    const l = lay(sexes, 600);
    // 3 × 12 + 2 + 8 = 46 px a row, the bars' block centred in it.
    expect(l.frame.height).toBe(2 * 46);
    expect(l.rows.map((r) => r.y)).toEqual([23, 69]);
  });

  it("puts a grouped row's name above its bars under 30rem, 18 + 2 + 38 + 8 px a row", () => {
    const l = lay(sexes, 479);
    expect(l.frame.height).toBe(2 * 66);
    expect(l.rows.map((r) => r.y)).toEqual([18 + 2 + 19, 66 + 18 + 2 + 19]);
  });

  it("writes each grouped bar's value at its own end and across its own bar, none for a gap", () => {
    const l = lay(sexes, 600);
    expect(l.valueLabels.map((t) => t.text)).toEqual(["49.8", "51.1", "48.4", "48.4", "-3"]);
    const [combined, female, male, , below] = l.valueLabels;
    expect(combined?.x).toBeCloseTo(l.frame.xAt(49.8) + 4);
    expect(female?.x).toBeCloseTo(l.frame.xAt(51.1) + 4);
    // Each label sits across its own 12 px bar: the block runs 4 to 42 in the first row.
    expect([combined?.y, female?.y, male?.y]).toEqual([10, 23, 36]);
    expect(below).toMatchObject({ anchor: "end", y: 46 + 36 });
    expect(below?.x).toBeCloseTo(l.frame.xAt(-3) - 4);
    // x reaches the largest single value, not a row's sum.
    expect(l.frame.xAt(51.1) + 4 + 4 * 7.5).toBeCloseTo(l.frame.width);
  });

  it("draws an x axis with its ticks and title when labels are off", () => {
    const off: ChartSpec = {
      x: { label: "Years" },
      marks: [{ mark: "bar", y: ["a", "b"], labels: false, series: [{ name: "a", x: [12, 47] }] }],
    };
    const l = lay(off, 600);
    expect(l.valueLabels).toEqual([]);
    expect(l.xAxis.ticks.map((t) => t.value)).toContain(0);
    expect(l.xLabels.length).toBeGreaterThan(0);
    expect(l.titles.map((t) => t.text)).toEqual(["Years"]);
    expect(l.frame.xAt(0)).toBe(0);
  });

  it("draws a 100% chart's x axis in percent across the whole plot, with no value labels", () => {
    const share: ChartSpec = {
      x: { label: "Answers" },
      marks: [
        {
          mark: "bar",
          y: ["a", "b"],
          arrange: "share",
          series: [
            { name: "No", x: [3, 1] },
            { name: "Yes", x: [1, 1] },
          ],
        },
      ],
    };
    const l = lay(share, 600);
    expect(l.valueLabels).toEqual([]);
    expect(l.xLabels.at(0)?.text).toBe("0%");
    expect(l.xLabels.at(-1)?.text).toBe("100%");
    expect(l.titles.map((t) => t.text)).toEqual(["Answers"]);
    expect([l.frame.xAt(0), l.frame.xAt(1)]).toEqual([0, l.frame.width]);
  });

  const survey = (more: Partial<ChartSpec["x"]> = {}, labels = true): ChartSpec => ({
    x: more,
    marks: [
      {
        mark: "bar",
        y: ["Instagram", "Facebook"],
        arrange: "split",
        labels,
        series: [
          { name: "Daily", x: [34, 20] },
          { name: "Weekly", x: [8, 43] },
          { name: "Never", x: [7, null] },
        ],
      },
    ],
  });

  it("sets a panel per series 16 px apart on one shared scale, each headed by its name", () => {
    const l = lay(survey(), 600);
    // "Instagram" and its pad make a 76 px gutter, so the 524 px plot holds
    // three 164 px panels and two 16 px gaps.
    expect(l.frame.width).toBe(524);
    const panels = l.frame.panels ?? [];
    expect(panels.map((p) => [p.left, p.right])).toEqual([
      [0, 164],
      [180, 344],
      [360, 524],
    ]);
    expect(panels.map((p) => p.at(0))).toEqual([0, 180, 360]);
    for (const p of panels) {
      expect(p.at(20) - p.at(0)).toBeCloseTo(panels[0]?.at(20) ?? 0);
    }
    expect(l.frame.height).toBe(2 * 24);
    expect(l.bar).toBe(16);
    // The heads take one line above the plot.
    expect(l.top).toBe(17 + 4);
    expect(l.heads).toEqual([
      { text: "Daily", x: 76, y: 8.5, anchor: "start" },
      { text: "Weekly", x: 76 + 180, y: 8.5, anchor: "start" },
      { text: "Never", x: 76 + 360, y: 8.5, anchor: "start" },
    ]);
  });

  it("writes each bar's value inside its panel, every panel ending short by the widest label", () => {
    const l = lay(survey(), 600);
    const panels = l.frame.panels ?? [];
    expect(l.valueLabels.map((t) => t.text)).toEqual(["34", "8", "7", "20", "43"]);
    const [daily, weekly, , , most] = l.valueLabels;
    expect(daily).toMatchObject({ x: (panels[0]?.at(34) ?? 0) + 4, y: 12, anchor: "start" });
    expect(weekly).toMatchObject({ x: (panels[1]?.at(8) ?? 0) + 4, y: 12 });
    expect(most).toMatchObject({ x: (panels[1]?.at(43) ?? 0) + 4, y: 36 });
    // "43" and its 4 px gap end the largest bar's panel; every panel keeps that room.
    for (const p of panels) {
      expect(p.at(43) + 4 + 2 * 7.5).toBeCloseTo(p.right);
    }
    expect(l.xAxis.ticks).toEqual([]);
  });

  it("cuts a panel's name to its width", () => {
    const long = survey();
    const bar = long.marks[0];
    if (bar?.mark !== "bar") {
      throw new Error("a bar mark");
    }
    const l = lay(
      {
        ...long,
        marks: [{ ...bar, series: [{ name: "A few times a week", x: [1, 2] }, ...bar.series] }],
      },
      600,
    );
    const head = l.heads[0]?.text ?? "";
    // Four 119 px panels: "A few times a week" is 135 px, so it is cut.
    expect(head.endsWith("…")).toBe(true);
    expect(head.length * 7.5).toBeLessThanOrEqual(119);
  });

  it("folds the panels into one under 30rem, each row's bars one under another, with no heads", () => {
    const l = lay(survey(), 479);
    expect(l.frame.panels).toBeUndefined();
    expect(l.heads).toEqual([]);
    expect(l.top).toBe(0);
    // A name's 18 px line, 2 px, three 12 px bars with 1 px between, and 8 px.
    expect(l.frame.height).toBe(2 * (18 + 2 + 38 + 8));
    const [daily, weekly, never] = l.valueLabels;
    expect([daily?.y, weekly?.y, never?.y]).toEqual([20 + 6, 20 + 19, 20 + 32]);
    expect(daily?.x).toBeCloseTo(l.frame.xAt(34) + 4);
    expect(l.frame.xAt(43) + 4 + 2 * 7.5).toBeCloseTo(l.frame.width);
  });

  it("repeats the x axis in every panel when labels are off", () => {
    const l = lay(survey({ label: "Answers" }, false), 600);
    expect(l.valueLabels).toEqual([]);
    expect(l.xAxis.ticks.filter((t) => t.value === 0).map((t) => t.at)).toEqual([0, 180, 360]);
    const zeros = l.xLabels.filter((t) => t.text === "0");
    expect(zeros).toHaveLength(3);
    expect(l.xLabels.length % 3).toBe(0);
    expect(l.titles.map((t) => t.text)).toEqual(["Answers"]);
    const top = Math.max(...l.xAxis.ticks.map((t) => t.value));
    for (const p of l.frame.panels ?? []) {
      expect(p.at(top)).toBeLessThanOrEqual(p.right + 1e-6);
    }
  });

  it("lays the panels right to left on a reversed x, each bar from its panel's right edge", () => {
    const l = lay(survey({ reverse: true }), 600);
    const panels = l.frame.panels ?? [];
    expect(panels.map((p) => p.left)).toEqual([360, 180, 0]);
    expect(panels.map((p) => p.at(0))).toEqual([524, 344, 164]);
    expect(l.heads[0]).toMatchObject({ text: "Daily", x: l.left + 524, anchor: "end" });
    expect(l.valueLabels[0]).toMatchObject({ x: (panels[0]?.at(34) ?? 0) - 4, anchor: "end" });
  });
});
