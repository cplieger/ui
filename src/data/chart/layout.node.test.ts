import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";
import { measurer } from "../scale/measure.js";

import { barSegments } from "./geometry.js";
import { dodge, layout, type Metrics } from "./layout.js";
import { chartModel, type BarModel } from "./model.js";
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

  it("cuts a name to the group's label gutter less its pad, keeping the value whole", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "line",
          x: [0, 1],
          series: [
            { name: "Agents waiting on review", y: [3, 12_345] },
            { name: "Live", y: [1, 4] },
          ],
        },
      ],
    };
    const l = lay(spec, 600, { labelGroup: 80 });
    // 80 - 8 px less " 12,345" leaves 19.5 px, two characters at 7.5 px.
    expect(l.endLabels.map((e) => e.text)).toEqual(["A… 12,345", "Live 4"]);
    expect(l.gutters.label).toBe(80);
    expect(lay(spec, 600).endLabels.map((e) => e.text)).toContain(
      "Agents waiting on review 12,345",
    );
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

  // A label's box along x: "start" runs right from x, "end" left to it.
  const span = (t: { text: string; x: number; anchor: string }) =>
    t.anchor === "end" ? [t.x - 7.5 * t.text.length, t.x] : [t.x, t.x + 7.5 * t.text.length];

  it("writes a value past a passed domain at its bar's cut end, inside the plot", () => {
    const one = (domain: [number, number], x: number[]): ChartSpec => ({
      x: { domain },
      marks: [{ mark: "bar", y: ["a", "b"], series: [{ name: "Age", x }] }],
    });
    const high = lay(one([0, 50], [57.4, 49.8]), 600);
    expect(high.valueLabels.map((t) => t.text)).toEqual(["57.4", "49.8"]);
    expect(high.valueLabels[0]?.x).toBeCloseTo(high.frame.xAt(50) + 4);
    const low = lay(one([-10, 50], [-30, 20]), 600);
    expect(low.valueLabels[0]).toMatchObject({ text: "-30", anchor: "end" });
    expect(low.valueLabels[0]?.x).toBeCloseTo(low.frame.xAt(-10) - 4);
    for (const l of [high, low]) {
      for (const t of l.valueLabels) {
        const [a = 0, b = 0] = span(t);
        expect(a).toBeGreaterThanOrEqual(-1e-6);
        expect(b).toBeLessThanOrEqual(l.frame.width + 1e-6);
      }
    }
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

  const survey = (more: Partial<NonNullable<ChartSpec["x"]>> = {}, labels = true): ChartSpec => ({
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

  it("writes a value past a passed domain at its bar's cut end, inside its own panel", () => {
    const spec: ChartSpec = {
      x: { domain: [0, 30] },
      marks: [
        {
          mark: "bar",
          y: ["Instagram"],
          arrange: "split",
          series: [
            { name: "Daily", x: [43] },
            { name: "Weekly", x: [8] },
          ],
        },
      ],
    };
    const l = lay(spec, 600);
    const panels = l.frame.panels ?? [];
    expect(l.valueLabels.map((t) => t.text)).toEqual(["43", "8"]);
    l.valueLabels.forEach((t, k) => {
      const [a = 0, b = 0] = span(t);
      expect(a).toBeGreaterThanOrEqual(panels[k]?.left ?? Number.NaN);
      expect(b).toBeLessThanOrEqual((panels[k]?.right ?? Number.NaN) + 1e-6);
    });
    expect(l.valueLabels[0]?.x).toBeCloseTo((panels[0]?.at(30) ?? 0) + 4);
    const bars = chartModel(spec, "en", "UTC").marks[0] as BarModel;
    const [daily] = barSegments(bars, 0, l.frame, l.rows[0]?.y ?? 0, l.bar);
    expect(daily?.right).toBeCloseTo(panels[0]?.at(30) ?? Number.NaN);
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

  const pyramid = (more: Partial<NonNullable<ChartSpec["x"]>> = {}, labels = true): ChartSpec => ({
    x: more,
    marks: [
      {
        mark: "bar",
        y: ["90+", "45-50"],
        arrange: "mirror",
        labels,
        series: [
          { name: "Male", x: [12, 40] },
          { name: "Female", x: [20, 36] },
        ],
      },
    ],
  });

  it("sets a mirror's sides back to back around an 8 px spine, on one shared scale", () => {
    const l = lay(pyramid(), 600);
    // "45-50" and its pad make a 46 px gutter, so the 554 px plot holds two
    // 273 px sides and the spine.
    expect(l.frame.width).toBe(554);
    const panels = l.frame.panels ?? [];
    expect(panels.map((p) => [p.left, p.right, p.leftward])).toEqual([
      [0, 273, true],
      [281, 554, false],
    ]);
    expect(panels.map((p) => p.at(0))).toEqual([273, 281]);
    expect((panels[0]?.at(0) ?? 0) - (panels[0]?.at(20) ?? 0)).toBeCloseTo(
      (panels[1]?.at(20) ?? 0) - (panels[1]?.at(0) ?? 0),
    );
    // Rows keep 24 px, their bars the row less 2 px.
    expect(l.frame.height).toBe(2 * 24);
    expect(l.bar).toBe(22);
    expect(l.top).toBe(17 + 4);
    expect(l.heads).toEqual([
      { text: "Male", x: 46 + 273, y: 8.5, anchor: "end" },
      { text: "Female", x: 46 + 281, y: 8.5, anchor: "start" },
    ]);
  });

  it("writes each side's values at its bars' outer ends, both sides keeping the widest label's room", () => {
    const l = lay(pyramid(), 600);
    const panels = l.frame.panels ?? [];
    expect(l.valueLabels.map((t) => t.text)).toEqual(["12", "20", "40", "36"]);
    const [, , male, female] = l.valueLabels;
    expect(male).toMatchObject({ x: (panels[0]?.at(40) ?? 0) - 4, y: 36, anchor: "end" });
    expect(female).toMatchObject({ x: (panels[1]?.at(36) ?? 0) + 4, y: 36, anchor: "start" });
    // "40" and its gap end the larger side; the other side keeps the same room.
    expect((panels[0]?.at(40) ?? 0) - 4 - 15).toBeCloseTo(0);
    expect((panels[1]?.at(40) ?? 0) + 4 + 15).toBeCloseTo(554);
    expect(l.xAxis.ticks).toEqual([]);
  });

  it("keeps a mirror's names in the gutter and its 24 px rows on a phone", () => {
    const l = lay(pyramid(), 320);
    expect(l.left).toBe(46);
    expect(l.frame.height).toBe(2 * 24);
    expect(l.frame.panels).toHaveLength(2);
    expect(l.yLabels.map((t) => [t.text, t.x, t.anchor])).toEqual([
      ["90+", 38, "end"],
      ["45-50", 38, "end"],
    ]);
  });

  it("reads a mirror's axis both ways from the spine when labels are off", () => {
    const l = lay(pyramid({}, false), 600);
    const zeros = l.xAxis.ticks.filter((t) => t.value === 0).map((t) => t.at);
    expect(zeros).toEqual([273, 281]);
    expect(l.xLabels.every((t) => !t.text.startsWith("-"))).toBe(true);
    const top = Math.max(...l.xAxis.ticks.map((t) => t.value));
    const [male, female] = l.frame.panels ?? [];
    const at = (v: number) => l.xAxis.ticks.filter((t) => t.value === v).map((t) => t.at);
    expect(at(top)).toEqual([male?.at(top), female?.at(top)]);
    expect(male?.at(top)).toBeGreaterThanOrEqual(-1e-6);
    expect(female?.at(top)).toBeLessThanOrEqual(554 + 1e-6);
  });

  it("sets the first side on the right on a reversed x", () => {
    const l = lay(pyramid({ reverse: true }), 600);
    const panels = l.frame.panels ?? [];
    expect(panels.map((p) => [p.left, p.leftward])).toEqual([
      [281, false],
      [0, true],
    ]);
    expect(l.heads[0]).toMatchObject({ text: "Male", x: l.left + 281, anchor: "start" });
    expect(l.valueLabels[0]).toMatchObject({ x: (panels[0]?.at(12) ?? 0) + 4, anchor: "start" });
  });
});

describe("a point chart", () => {
  const ages = (x: NonNullable<ChartSpec["x"]> = { label: "Median age" }): ChartSpec => ({
    x,
    marks: [
      {
        mark: "point",
        y: ["Holy See", "Monaco", "Japan"],
        series: [
          { name: "Female", x: [60.4, 54.5, 51.1] },
          { name: "Male", x: [54.5, 51.3, 48.4] },
        ],
      },
    ],
  });

  it("sets a row of --cp-chart-row per category, its name in the gutter, from 30rem up", () => {
    const l = lay(ages(), 600);
    expect(l.frame.height).toBe(3 * 24);
    expect(l.rows.map((r) => r.y)).toEqual([12, 36, 60]);
    expect(l.bar).toBe(0);
    expect(l.gutters.axis).toBe(7.5 * "Holy See".length + 8);
    expect(l.yLabels[2]).toMatchObject({ text: "Japan", anchor: "end", x: l.left - 8, y: 60 });
  });

  it("puts each name above its dots under 30rem, 38 px a row and no gutter", () => {
    const l = lay(ages(), 479);
    expect(l.gutters.axis).toBe(0);
    expect(l.frame.height).toBe(3 * 38);
    // The name's 18 px line, 2 px, then the 10 px dots and 8 px.
    expect(l.rows.map((r) => r.y)).toEqual([25, 63, 101]);
    expect(l.yLabels[1]).toEqual({ text: "Monaco", x: 0, y: 38 + 9, anchor: "start" });
  });

  it("draws an x axis 7 px inside each end with its title, and no value labels", () => {
    const l = lay(ages(), 600);
    expect(l.valueLabels).toEqual([]);
    expect(l.frame.xAt(l.xAxis.lo)).toBeCloseTo(7);
    expect(l.frame.xAt(l.xAxis.hi)).toBeCloseTo(l.frame.width - 7);
    expect(l.xAxis.lo).toBeLessThanOrEqual(48.4);
    expect(l.xAxis.lo).toBeGreaterThan(0);
    for (const t of l.xAxis.ticks) {
      expect(t.at).toBeCloseTo(l.frame.xAt(t.value));
      const box = t.label?.box;
      if (box !== undefined) {
        expect(box.start).toBeGreaterThanOrEqual(7);
        expect(box.end).toBeLessThanOrEqual(l.frame.width - 7);
      }
    }
    expect(l.xLabels.length).toBeGreaterThan(1);
    expect(l.titles).toContainEqual(
      expect.objectContaining({ text: "Median age", x: l.left + l.frame.width, anchor: "end" }),
    );
    expect(l.height).toBeGreaterThan(l.top + l.frame.height);
  });

  it("runs a reversed x from the right, still 7 px inside each end", () => {
    const l = lay(ages({ reverse: true }), 600);
    expect(l.frame.xAt(l.xAxis.lo)).toBeCloseTo(l.frame.width - 7);
    expect(l.frame.xAt(l.xAxis.hi)).toBeCloseTo(7);
  });
});

describe("an x rule's label on bar rows", () => {
  const ruled = (
    arrange: "split" | "mirror" | "diverge" | undefined,
    x: NonNullable<ChartSpec["x"]> = {},
  ): ChartSpec => ({
    x,
    marks: [
      {
        mark: "bar",
        y: ["Instagram", "Facebook"],
        ...(arrange === undefined ? {} : { arrange }),
        ...(arrange === "diverge" ? { left: 1 } : {}),
        series: [
          { name: "Daily", x: [34, 20] },
          { name: "Weekly", x: [8, 43] },
        ],
      },
      { mark: "rule", x: 10, label: "Aim" },
    ],
  });

  it("starts at its line in the first panel under a split, above the heads", () => {
    const l = lay(ruled("split"), 600);
    const first = l.frame.panels?.[0];
    expect(l.ruleLabels[0]).toMatchObject({ text: "Aim 10", x: l.left + (first?.at(10) ?? 0) });
    expect(l.ruleLabels[0]?.y).toBeLessThan(l.heads[0]?.y ?? 0);
    expect(l.top).toBe(2 * 17 + 4);
  });

  it("starts at the folded chart's one line under 30rem", () => {
    const l = lay(ruled("split"), 479);
    expect(l.ruleLabels[0]?.x).toBeCloseTo(l.left + l.frame.xAt(10));
  });

  it("starts at its right-hand line under a mirror, whichever way x runs", () => {
    const l = lay(ruled("mirror"), 600);
    expect(l.ruleLabels[0]?.x).toBe(l.left + (l.frame.panels?.[1]?.at(10) ?? 0));
    const reversed = lay(ruled("mirror", { reverse: true }), 600);
    expect(reversed.ruleLabels[0]?.x).toBe(
      reversed.left + (reversed.frame.panels?.[0]?.at(10) ?? 0),
    );
  });

  it("starts at its right-hand line under a diverge, at +10 or on a reversed x at -10", () => {
    const l = lay(ruled("diverge"), 600);
    expect(l.ruleLabels[0]?.x).toBeCloseTo(l.left + l.frame.xAt(10));
    const reversed = lay(ruled("diverge", { reverse: true }), 600);
    expect(reversed.ruleLabels[0]?.x).toBeCloseTo(reversed.left + reversed.frame.xAt(-10));
    expect(reversed.frame.xAt(-10)).toBeGreaterThan(reversed.frame.xAt(10));
  });

  it("starts at its one line on a stacked bar chart", () => {
    const l = lay(ruled(undefined), 600);
    expect(l.ruleLabels[0]).toMatchObject({ text: "Aim 10", x: l.left + l.frame.xAt(10) });
  });
});

describe("dodge", () => {
  it("keeps labels a step apart or more where they are", () => {
    expect(dodge([40, 10, 70], 18, 0, 100)).toEqual([40, 10, 70]);
  });

  it("moves labels that crowd apart as a group centred on their mean", () => {
    expect(dodge([10, 12], 18, 0, 100)).toEqual([2, 20]);
    expect(dodge([12, 10, 50], 18, 0, 100)).toEqual([20, 2, 50]);
  });

  it("merges a group that its move brings onto the next", () => {
    // 40 and 42 meet at 32 and 50, which crowds 60: all three centre on 142 / 3.
    const mean = 142 / 3;
    expect(dodge([40, 42, 60], 18, 0, 100)).toEqual(
      [mean - 18, mean, mean + 18].map((v) => expect.closeTo(v, 9)),
    );
  });

  it("keeps a group inside its bounds and ties in their order", () => {
    expect(dodge([0, 0], 18, 0, 100)).toEqual([0, 18]);
    expect(dodge([100, 99], 18, 0, 100)).toEqual([100, 82]);
  });
});

describe("a slope chart", () => {
  const slope = (
    ends: readonly (readonly [number | null, number | null])[],
    names = ["Cats", "Dogs", "Horses", "Mice"],
    more: Partial<ChartSpec> = {},
  ): ChartSpec => ({
    marks: [
      {
        mark: "slope",
        x: ["2005", "2015"],
        // Series past the ninth need a slot given; the layout never reads it.
        series: ends.map((y, k) => ({ name: names[k] ?? `s${String(k)}`, slot: 1, y })),
      },
    ],
    ...more,
  });
  const pets = slope([
    [50, 34],
    [40, 4],
    [30, 39],
    [20, 44],
  ]);

  it("sets its columns at the plot's edges, their names above, with no axes", () => {
    const l = lay(pets, 480);
    // "Horses 30" and "Horses 39" are the widest labels, 67.5 px, and the 8 px pad.
    expect(l.gutters).toEqual({ axis: 76, label: 76 });
    expect(l.frame.width).toBe(480 - 76 - 76);
    expect([l.frame.xAt(0), l.frame.xAt(1)]).toEqual([0, 328]);
    expect(l.heads).toEqual([
      { text: "2005", x: 76, y: 8.5, anchor: "start" },
      { text: "2015", x: 76 + 328, y: 8.5, anchor: "end" },
    ]);
    expect(l.top).toBe(17 + 4);
    expect(l.yAxis).toBeUndefined();
    expect([l.xAxis.ticks, l.xLabels, l.yLabels, l.titles]).toEqual([[], [], [], []]);
    expect(l.height).toBe(21 + 240 + 9);
  });

  it("labels each end with its name and value at its dot's height, ending 8 px off the plot", () => {
    const l = lay(pets, 480);
    // y runs from 0 to 50 down the 240 px plot.
    expect([l.frame.yAt(50), l.frame.yAt(0)]).toEqual([0, 240]);
    const y = (v: number) => expect.closeTo(21 + 240 - (v / 50) * 240, 9);
    expect(l.endLabels).toEqual([
      { text: "Cats 50", x: 68, y: y(50), anchor: "end", series: 0 },
      { text: "Dogs 40", x: 68, y: y(40), anchor: "end", series: 1 },
      { text: "Horses 30", x: 68, y: y(30), anchor: "end", series: 2 },
      { text: "Mice 20", x: 68, y: y(20), anchor: "end", series: 3 },
      { text: "Cats 34", x: 412, y: y(34), anchor: "start", series: 0 },
      { text: "Dogs 4", x: 412, y: y(4), anchor: "start", series: 1 },
      { text: "Horses 39", x: 412, y: y(39), anchor: "start", series: 2 },
      { text: "Mice 44", x: 412, y: y(44), anchor: "start", series: 3 },
    ]);
    expect(l.leaders).toEqual([]);
  });

  it("writes the left values alone and the right names and values under 30rem", () => {
    const l = lay(pets, 320);
    expect(l.endLabels.slice(0, 4).map((e) => e.text)).toEqual(["50", "40", "30", "20"]);
    expect(l.endLabels.slice(4).map((e) => e.text)).toEqual([
      "Cats 34",
      "Dogs 4",
      "Horses 39",
      "Mice 44",
    ]);
    // "50" is 15 px and the pad; "Horses 39" 67.5 px and the pad.
    expect(l.gutters).toEqual({ axis: 23, label: 76 });
    expect(l.frame.width).toBe(320 - 23 - 76);
  });

  it("moves crowded labels apart around their mean and joins those moved past 4 px to their dots", () => {
    const l = lay(
      slope([
        [50, 34],
        [40, 33],
        [30, 31],
      ]),
      480,
    );
    const right = l.endLabels.filter((e) => e.anchor === "start");
    const dot = (v: number) => 240 - (v / 50) * 240;
    const mean = (dot(34) + dot(33) + dot(31)) / 3;
    expect(right.map((e) => e.y - 21)).toEqual(
      [mean - 18, mean, mean + 18].map((v) => expect.closeTo(v, 6)),
    );
    const edge = 76 + l.frame.width;
    expect(l.leaders).toEqual([
      {
        from: { x: edge, y: expect.closeTo(21 + dot(34), 9) },
        to: { x: edge + 6, y: right[0]?.y },
      },
      {
        from: { x: edge, y: expect.closeTo(21 + dot(31), 9) },
        to: { x: edge + 6, y: right[2]?.y },
      },
    ]);
  });

  it("grows the plot to 18 px a label on its longer side", () => {
    const many = slope(
      Array.from({ length: 20 }, (_, k) => [k, k] as const),
      [],
    );
    expect(lay(many, 600).frame.height).toBe(360);
    expect(lay(slope([[1, 2]], ["a"], { height: 400 }), 600).frame.height).toBe(400);
  });

  it("cuts a name so each gutter stays within 30 % of the chart", () => {
    const l = lay(slope([[50, 34]], ["A very long series name indeed"]), 480);
    const label = l.endLabels[1]?.text ?? "";
    expect(label).toBe("A very long se… 34");
    expect(l.gutters.label).toBeLessThanOrEqual(0.3 * 480);
  });

  it("draws no label at a null end", () => {
    const l = lay(
      slope([
        [null, 31],
        [40, 33],
      ]),
      480,
    );
    expect(l.endLabels.map((e) => [e.text, e.series])).toEqual([
      ["Dogs 40", 1],
      ["Cats 31", 0],
      ["Dogs 33", 1],
    ]);
  });

  it("keeps the group gutters and the floors as minimums", () => {
    const l = lay(pets, 600, { axisGroup: 100, labelGroup: 90 }, { axis: 0, label: 95 });
    expect(l.gutters).toEqual({ axis: 100, label: 95 });
  });
});

describe("a scatter's layout", () => {
  const countries: ChartSpec = {
    x: { label: "GDP per capita", domain: [0, 100] },
    y: { label: "Life expectancy", domain: [50, 90] },
    marks: [
      {
        mark: "scatter",
        series: [{ name: "All", names: ["Chad", "Monaco"], x: [0, 100], y: [50, 90] }],
      },
    ],
  };

  it("runs both axes 6 px inside the plot, so a dot and its ring at a domain's end draw whole", () => {
    const l = lay(countries, 600);
    // The ring reaches 2 px past a 4 px dot.
    expect(l.frame.xAt(0)).toBeCloseTo(6, 6);
    expect(l.frame.xAt(100)).toBeCloseTo(l.frame.width - 6, 6);
    expect(l.frame.yAt(90)).toBeCloseTo(6, 6);
    expect(l.frame.yAt(50)).toBeCloseTo(l.frame.height - 6, 6);
    expect(l.frame.height).toBe(240);
    // The ticks and their labels move with the axes.
    expect(l.xAxis.ticks[0]?.at).toBeCloseTo(6, 6);
    expect(l.yAxis?.ticks.find((t) => t.value === 90)?.at).toBeCloseTo(6, 6);
    const top = l.yLabels.find((t) => t.text === "90");
    expect(top?.y).toBeCloseTo(l.top + 6, 6);
  });

  it("gives a bubble chart its largest radius by width and runs its axes clear of its largest bubble", () => {
    const sized = (r: number[]): ChartSpec => ({
      ...countries,
      r: { label: "Population", domain: [0, 100] },
      marks: [
        {
          mark: "scatter",
          series: [{ name: "All", names: ["Chad", "Monaco"], x: [0, 100], y: [50, 90], r }],
        },
      ],
    });
    const wide = lay(sized([100, 25]), 600);
    expect(wide.frame.bubble).toBe(24);
    // The largest bubble, at the domain's high end, and its ring's 2 px.
    expect(wide.frame.xAt(0)).toBeCloseTo(26, 6);
    expect(wide.frame.yAt(50)).toBeCloseTo(wide.frame.height - 26, 6);
    const narrow = lay(sized([100, 25]), 300);
    expect(narrow.frame.bubble).toBe(12);
    expect(narrow.frame.xAt(0)).toBeCloseTo(14, 6);
    // The largest drawn bubble is a quarter of the domain's area: half its radius.
    expect(lay(sized([25, 0]), 600).frame.xAt(0)).toBeCloseTo(14, 6);
    expect(lay(countries, 600).frame.bubble).toBeUndefined();
  });

  it("titles y above its gutter and x under its ticks at the right end", () => {
    const l = lay(countries, 600);
    expect(l.titles.map((t) => [t.text, t.anchor])).toEqual([
      ["Life expectancy", "start"],
      ["GDP per capita", "end"],
    ]);
    expect(l.titles[1]?.x).toBe(l.left + l.frame.width);
  });
});

describe("a cell chart's layout", () => {
  const hours = Array.from({ length: 24 }, (_, h) => String(h));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const week = (x: ChartSpec["x"] = {}): ChartSpec => ({
    x,
    marks: [{ mark: "cell", x: hours, y: days, values: days.map(() => hours.map(() => 1)) }],
  });

  it("gives each row the band's row height with its name in the y gutter", () => {
    const l = lay(week(), 400);
    expect(l.frame.height).toBe(7 * 24);
    expect(l.yAxis).toBeUndefined();
    expect(l.yLabels.map((t) => [t.text, t.y - l.top, t.anchor])).toEqual(
      days.map((d, r) => [d, (r + 0.5) * 24, "end"]),
    );
    // "Mon" is 22.5 px and its pad 8.
    expect(l.left).toBe(31);
  });

  it("holds each cell's column and row edges, the columns sharing the plot's width", () => {
    const l = lay(week(), 400);
    const w = 400 - 31;
    expect(l.cells?.ys).toEqual(Array.from({ length: 8 }, (_, r) => r * 24));
    expect(l.cells?.xs.length).toBe(25);
    l.cells?.xs.forEach((x, c) => {
      expect(x).toBeCloseTo((c * w) / 24, 6);
    });
  });

  it("runs a reversed x's columns right to left", () => {
    const l = lay(week({ reverse: true }), 400);
    expect(l.cells?.xs[0]).toBeCloseTo(l.frame.width, 6);
    expect(l.cells?.xs[24]).toBeCloseTo(0, 6);
  });

  it("labels each column under its middle, or every 2nd, 5th or 10th when labels would overlap", () => {
    // 369 px over 24 columns is 15.4 px a column, under two-digit labels and their 8 px gap.
    const wide = lay(week(), 400);
    expect(wide.xLabels.map((t) => t.text)).toEqual(hours.filter((_, h) => h % 2 === 0));
    const middle = (c: number) => wide.left + ((c + 0.5) * wide.frame.width) / 24;
    expect(wide.xLabels[1]?.x).toBeCloseTo(middle(2), 6);
    // 119 px is 5 px a column: every 2nd is 10 px apart, every 5th 25 px.
    expect(lay(week(), 150).xLabels.map((t) => t.text)).toEqual(["0", "5", "10", "15", "20"]);
    // 2.4 px a column: every 10th.
    expect(lay(week(), 89).xLabels.map((t) => t.text)).toEqual(["0", "10", "20"]);
  });

  it("titles x under its labels at the plot's right end", () => {
    const l = lay(week({ label: "Hour" }), 400);
    expect(l.titles.map((t) => [t.text, t.x, t.anchor])).toEqual([
      ["Hour", l.left + l.frame.width, "end"],
    ]);
  });
});

describe("a binned cell chart's layout", () => {
  const binned = (
    x: readonly number[] | readonly string[],
    y: readonly number[],
    more: Partial<ChartSpec> = {},
  ): ChartSpec => {
    const columns = x.length - (typeof x[0] === "number" ? 1 : 0);
    return {
      ...more,
      marks: [
        {
          mark: "cell",
          x:
            typeof x[0] === "number" ? { edges: x as readonly number[] } : (x as readonly string[]),
          y: { edges: y },
          values: y.slice(1).map(() => Array.from({ length: columns }, () => 1)),
        },
      ],
    };
  };
  const life = [50, 55, 60, 65, 70, 75, 80, 85];

  it("puts each column's edges at its bin's edges on the x scale", () => {
    const l = lay(binned([1_000, 2_000, 5_000, 10_000], life, { x: { type: "log" } }), 400);
    const xs = l.cells?.xs ?? [];
    expect(xs).toHaveLength(4);
    expect(xs[0]).toBe(0);
    expect(xs[3]).toBe(l.frame.width);
    // On a log x, 1,000 to 2,000 and 5,000 to 10,000 are the same width.
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeCloseTo((xs[3] ?? 0) - (xs[2] ?? 0), 6);
    expect(l.xLabels.length).toBeGreaterThan(0);
  });

  it("runs a binned y's rows up from the plot's bottom at its edges, in the plot's height", () => {
    const l = lay(binned(["a", "b"], life), 400);
    expect(l.frame.height).toBe(240);
    const ys = l.cells?.ys ?? [];
    expect(ys).toHaveLength(8);
    ys.forEach((y, r) => {
      expect(y).toBeCloseTo(240 - (r * 240) / 7, 6);
    });
    expect(l.rows).toEqual([]);
    expect(l.yAxis).toBeDefined();
  });

  it("keeps a passed height while every bin is a row tall, and grows past it until the thinnest is", () => {
    // Seven bins of 168 px are a row each.
    expect(lay(binned(["a"], life, { height: 168 }), 400).frame.height).toBe(168);
    // Seven bins of 120 px would be 17 px: a 24 px row takes 168.
    expect(lay(binned(["a"], life, { height: 120 }), 400).frame.height).toBe(168);
    // Twelve equal bins of 240 px would be 20 px.
    const twelve = Array.from({ length: 13 }, (_, i) => 20 + 5 * i);
    expect(lay(binned(["a"], twelve), 400).frame.height).toBe(12 * 24);
  });

  it("grows by the thinnest bin on the scale, not the bin count", () => {
    // 0 to 1 is a fortieth of 0 to 40, so it takes 24 × 40 px.
    expect(lay(binned(["a"], [0, 1, 40]), 400).frame.height).toBe(960);
    // On a log y, 1 to 10 and 10 to 100 are halves: 240 px holds them.
    expect(lay(binned(["a"], [1, 10, 100], { y: { type: "log" } }), 400).frame.height).toBe(240);
  });

  it("titles a binned y above the plot, as a continuous y", () => {
    const l = lay(binned(["a"], life, { y: { label: "Life expectancy" } }), 400);
    expect(l.titles.map((t) => t.text)).toEqual(["Life expectancy"]);
  });
});

describe("a box plot", () => {
  const latency = (series = 1): ChartSpec => ({
    x: { label: "Latency" },
    marks: [
      {
        mark: "box",
        y: ["search", "export", "login", "health"],
        series: Array.from({ length: series }, (_, k) => ({
          name: k === 0 ? "Before" : "After",
          low: [120, 300, 40, 1],
          q1: [180, 900, 60, 2],
          median: [240, 1400, 75, 2],
          q3: [410, 2100, 90, 3],
          high: [760, 4000, 130, 4],
        })),
      },
    ],
  });

  it("sets a 24 px row per category with one series, its name in the gutter, from 30rem up", () => {
    const l = lay(latency(), 600);
    expect(l.frame.height).toBe(4 * 24);
    expect(l.rows.map((r) => r.y)).toEqual([12, 36, 60, 84]);
    expect(l.gutters.axis).toBe(7.5 * "health".length + 8);
    expect(l.valueLabels).toEqual([]);
    expect(l.titles).toContainEqual(expect.objectContaining({ text: "Latency", anchor: "end" }));
  });

  it("grows a row by a 16 px sub-row per series, 8 px to spare", () => {
    const l = lay(latency(2), 600);
    expect(l.frame.height).toBe(4 * 40);
    expect(l.rows.map((r) => r.y)).toEqual([20, 60, 100, 140]);
  });

  it("puts each name above its boxes under 30rem: 44 px a row with one series, 60 with two", () => {
    const one = lay(latency(), 320);
    expect(one.gutters.axis).toBe(0);
    expect(one.frame.height).toBe(176);
    expect(one.rows[0]?.y).toBe(18 + 2 + 8);
    expect(one.yLabels[1]).toEqual({ text: "export", x: 0, y: 44 + 9, anchor: "start" });
    expect(lay(latency(2), 320).frame.height).toBe(240);
  });
});
