import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { facetLayout, facetOverall, facetWidths, headFigure, PANEL_HEIGHT } from "./facets.js";
import type { Metrics } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";
import { chartWords } from "./words.js";

const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
const metrics: Metrics = {
  measure: face,
  mono: face,
  hole: face,
  holeLine: 21,
  lineHeight: 17,
  nameLine: 18,
  rem: 16,
  row: 24,
  axisGroup: 0,
  labelGroup: 0,
  height: 240,
  dpr: 1,
};
const words = chartWords();
const model = (spec: ChartSpec): Model => chartModel(spec, "en", "UTC");
const grid = (spec: ChartSpec, width: number) => {
  const m = model(spec);
  if (m.facets === undefined) {
    throw new Error("no facets");
  }
  return facetLayout(m, m.facets, words, metrics, width, { axis: 0, label: 0 });
};

const x = [0, 1, 2, 3];
const line = (name: string, y: (number | null)[]): Mark => ({
  mark: "line",
  x,
  series: [{ name, y }],
});
const lines = (count: number, more: Partial<ChartSpec> = {}): ChartSpec => ({
  y: { format: "percent" },
  marks: [],
  facets: {
    panels: Array.from({ length: count }, (_, k) => ({
      marks: [line(`Region ${String(k + 1)}`, [0.02, 0.04 * (k + 1), 0.03, 0.05])],
    })),
  },
  ...more,
});
const bars = (names: string[]): ChartSpec => ({
  marks: [],
  facets: {
    panels: names.map((name, k) => ({
      name,
      marks: [
        {
          mark: "bar",
          y: ["Coal", "Gas", "Wind"],
          series: [{ name: "Share", x: [k + 1, 2, 3] }],
        },
      ],
    })),
  },
});

describe("facets: the spec", () => {
  it("takes every panel's data into the chart's one domain", () => {
    const m = model(lines(3));
    const panels = m.facets?.panels ?? [];
    expect(panels.map((p) => p.name)).toEqual(["Region 1", "Region 2", "Region 3"]);
    for (const p of panels) {
      expect(p.model.y).toEqual(m.y);
      expect("hi" in p.model.y ? p.model.y.hi : 0).toBeGreaterThanOrEqual(0.12);
    }
    expect(m.spec.facets).toBeDefined();
    expect(m.empty).toBe(false);
  });

  it("names a panel of several series by its own name, and refuses one without", () => {
    const two = (name?: string): ChartSpec => ({
      marks: [],
      facets: {
        panels: ["A", "B"].map((n) => ({
          ...(name === undefined ? {} : { name: `${name} ${n}` }),
          marks: [
            {
              mark: "rect",
              x1: [0, 1],
              x2: [1, 2],
              series: [
                { name: "Coal", y: [1, 2] },
                { name: "Gas", y: [2, 1] },
              ],
            },
          ],
        })),
      },
    });
    expect(model(two("Region")).facets?.panels.map((p) => p.name)).toEqual([
      "Region A",
      "Region B",
    ]);
    expect(() => model(two())).toThrow(
      new TypeError("renderChart: facets.panels[0].name is required on a panel of 2 series"),
    );
  });

  it("refuses an empty or a repeated panel name", () => {
    expect(() => model(bars(["North", ""]))).toThrow(RangeError);
    expect(() => model(bars(["North", "North"]))).toThrow(
      /facets\.panels\[1\]'s name "North" must be unique/,
    );
  });

  it("refuses panels whose series are neither one each nor the same", () => {
    const spec: ChartSpec = {
      marks: [],
      facets: {
        panels: [
          {
            name: "A",
            marks: [
              {
                mark: "line",
                x,
                series: [
                  { name: "a", y: x },
                  { name: "b", y: x },
                ],
              },
            ],
          },
          {
            name: "B",
            marks: [
              {
                mark: "line",
                x,
                series: [
                  { name: "b", y: x },
                  { name: "a", y: x },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(() => model(spec)).toThrow(/each hold one series, or all the same series/);
  });

  it("refuses data marks of two kinds or two option sets", () => {
    const kinds: ChartSpec = {
      marks: [],
      facets: {
        panels: [
          { marks: [line("A", x)] },
          { marks: [{ mark: "area", x, series: [{ name: "B", y: x }] }] },
        ],
      },
    };
    expect(() => model(kinds)).toThrow(
      /facets\.panels\[1\]\.marks\[0\] is a area mark beside line panels/,
    );
    const options: ChartSpec = {
      marks: [],
      facets: {
        panels: [
          { marks: [line("A", x)] },
          { marks: [{ mark: "line", x, curve: "step", series: [{ name: "B", y: x }] }] },
        ],
      },
    };
    expect(() => model(options)).toThrow(/facets\.panels\[1\]\.marks\[0\]\.curve must be/);
  });

  it("refuses a timeline, a slope or a treemap in a panel", () => {
    const dot: ChartSpec = {
      x: { type: "time" },
      marks: [],
      facets: { panels: [{ name: "A", marks: [{ mark: "dot", rows: [{ name: "a", x: [1] }] }] }] },
    };
    expect(() => model(dot)).toThrow(/is a dot mark, which draws no panels/);
    const tree: ChartSpec = {
      marks: [],
      facets: {
        panels: [{ name: "A", marks: [{ mark: "tree", nodes: [{ name: "a", value: 1 }] }] }],
      },
    };
    expect(() => model(tree)).toThrow(/is a tree mark, which draws no panels/);
  });

  it("holds rules only in the chart's marks, and a rule the panels' mark refuses is refused", () => {
    expect(() => model(lines(2, { marks: [line("C", x)] }))).toThrow(
      /marks\[0\] must be a rule beside facets/,
    );
    expect(() => model(lines(2, { marks: [{ mark: "text", x: 1, y: 1, text: "a" }] }))).toThrow(
      /marks\[0\] must be a rule beside facets/,
    );
    const rule = model(lines(2, { marks: [{ mark: "rule", y: 0.2, label: "Target" }] }));
    for (const p of rule.facets?.panels ?? []) {
      expect(p.model.marks.filter((m) => m.kind === "rule")).toHaveLength(1);
      expect("hi" in p.model.y ? p.model.y.hi : 0).toBeGreaterThanOrEqual(0.2);
    }
    expect(() =>
      model({ ...bars(["A", "B"]), marks: [{ mark: "rule", y: 1, label: "y" }] }),
    ).toThrow(new TypeError("renderChart: a rule on a band y has no value to sit at"));
    const pies: ChartSpec = {
      marks: [{ mark: "rule", x: 1, label: "Target" }],
      facets: {
        panels: ["2023", "2024"].map((name) => ({
          name,
          marks: [{ mark: "pie", slices: [{ name: "a", value: 1 }] }] as Mark[],
        })),
      },
    };
    expect(() => model(pies)).toThrow(/marks\[0\] is a rule mark beside a pie/);
  });

  it("names a panel's own mark by its place in the panel", () => {
    const spec = lines(2);
    const panels = spec.facets?.panels ?? [];
    const broken: ChartSpec = {
      ...spec,
      facets: {
        panels: [
          panels[0] ?? { marks: [] },
          { marks: [{ mark: "line", x, series: [{ name: "B", y: [1, 2] }] }] },
        ],
      },
    };
    expect(() => model(broken)).toThrow(/facets\.panels\[1\]\.marks\[0\]\.series\[0\]\.y/);
  });

  it("refuses a missing, empty or over-long panel list, and a panel without its data", () => {
    expect(() => model({ marks: [], facets: { panels: [] } })).toThrow(
      new TypeError("renderChart: facets.panels must be a non-empty array, a panel each"),
    );
    expect(() => model(lines(101))).toThrow(RangeError);
    expect(() => model(lines(101))).toThrow(/facets\.panels must hold at most 100 entries/);
    expect(() => model({ marks: [], facets: { panels: [{ name: "A", marks: [] }] } })).toThrow(
      new TypeError("renderChart: facets.panels[0].marks must hold one data mark"),
    );
  });

  it("draws context behind one-series line or scatter panels only", () => {
    expect(
      model(lines(2, { facets: { context: true, panels: lines(2).facets?.panels ?? [] } })).facets
        ?.context,
    ).toBe(true);
    expect(() =>
      model({
        ...bars(["A", "B"]),
        facets: { context: true, panels: bars(["A", "B"]).facets?.panels ?? [] },
      }),
    ).toThrow(
      new TypeError("renderChart: facets.context draws behind line or scatter panels only"),
    );
  });

  it("holds height on band panels to their rows", () => {
    expect(() => model({ ...bars(["A", "B"]), height: 100 })).toThrow(
      /height has no place on a dot, bar, point or box chart/,
    );
  });
});

describe("facets: the grid", () => {
  it("fits as many columns as the mark's narrowest plot allows, at most the panel count", () => {
    expect(grid(lines(6), 1000).columns).toBe(6);
    expect(grid(lines(3), 1000).columns).toBe(3);
    const phone = grid(lines(6), 288);
    expect(phone.columns).toBe(2);
    const widths = phone.panels.map((p) => p.lay.frame.width);
    expect(new Set(widths).size).toBe(1);
    expect(phone.gutter + 2 * ((widths[0] ?? 0) + 2) + 16).toBeLessThanOrEqual(288);
    expect(widths[0]).toBeGreaterThanOrEqual(112);
    expect(grid(lines(6), 200).columns).toBe(1);
  });

  it("gives every panel the default panel height", () => {
    for (const p of grid(lines(4), 600).panels) {
      expect(p.lay.frame.height).toBe(PANEL_HEIGHT);
    }
  });

  it("writes y labels in the first column only and x axes under the outer panels", () => {
    // Five panels in two columns: the fourth stands over an empty cell.
    const g = grid(lines(5), 288);
    const at = g.panels.map((p) => ({
      gutter: p.gutter,
      clip: p.lay.clip,
      y: p.lay.yLabels.length > 0,
      x: p.lay.xLabels.length > 0,
      ticks: p.lay.ticks,
    }));
    expect(at.map((p) => p.gutter)).toEqual([true, false, true, false, true]);
    expect(at.map((p) => p.clip)).toEqual([false, true, false, true, false]);
    expect(at.map((p) => p.y)).toEqual([true, false, true, false, true]);
    expect(at.map((p) => p.x)).toEqual([false, false, false, true, true]);
    expect(at.map((p) => p.ticks)).toEqual([false, false, false, true, true]);
    const [first, second] = g.panels;
    expect(second?.lay.height).toBe((second?.lay.top ?? 0) + (second?.lay.frame.height ?? 0));
    expect(first?.lay.left).toBe(g.gutter);
  });

  it("puts the gutter in the last column on a reversed x", () => {
    const g = grid(lines(4, { x: { reverse: true } }), 600);
    expect(g.reverse).toBe(true);
    expect(g.panels.map((p) => p.gutter)).toEqual([false, false, false, true]);
  });

  it("draws no end labels in a panel", () => {
    for (const p of grid(lines(2), 1000).panels) {
      expect(p.lay.endLabels).toEqual([]);
    }
  });

  it("stacks band panels in one column under 30rem", () => {
    expect(grid(bars(["A", "B", "C"]), 1000).columns).toBe(3);
    expect(grid(bars(["A", "B", "C"]), 470).columns).toBe(1);
  });

  describe("numbers notes across the panels", () => {
    const note = (x: number, text: string): Mark => ({ mark: "text", x, y: 0.03, text });
    const noted = (notes: Mark[][]): ChartSpec => {
      const spec = lines(notes.length);
      return {
        ...spec,
        facets: {
          panels: (spec.facets?.panels ?? []).map((p, k) => ({
            marks: [...p.marks, ...(notes[k] ?? [])],
          })),
        },
      };
    };
    const numbers = (g: ReturnType<typeof grid>) =>
      g.panels.map((p) => ({
        numbered: p.lay.numbered,
        numbers: p.lay.notes.map((n) => n.number),
      }));

    it("keeps every note on its plot while none overlaps", () => {
      const g = grid(noted([[note(1, "Strike")], [note(2, "Flood")], []]), 1000);
      expect(numbers(g)).toEqual([
        { numbered: false, numbers: [1] },
        { numbered: false, numbers: [2] },
        { numbered: false, numbers: [] },
      ]);
    });

    it("switches every panel's notes to markers when one panel's overlap, numbered on in panel order", () => {
      const g = grid(
        noted([[note(1, "Strike")], [], [note(2, "Flood"), note(2, "Flood again")]]),
        1000,
      );
      expect(numbers(g)).toEqual([
        { numbered: true, numbers: [1] },
        { numbered: false, numbers: [] },
        { numbered: true, numbers: [2, 3] },
      ]);
    });

    it("numbers them on under 30rem", () => {
      const g = grid(noted([[note(1, "Strike")], [note(2, "Flood")]]), 400);
      expect(numbers(g)).toEqual([
        { numbered: true, numbers: [1] },
        { numbered: true, numbers: [2] },
      ]);
    });
  });
});

describe("facets: the head figure", () => {
  it("is a one-series line's last value and none for a bar's row set", () => {
    const m = model(lines(2));
    expect(m.facets?.panels.map((p) => headFigure(p.model, words))).toEqual(["5%", "5%"]);
    const b = model(bars(["A", "B"]));
    expect(b.facets?.panels.map((p) => headFigure(p.model, words))).toEqual(["", ""]);
  });

  it("follows the selection: a line's value there, a bar's, a stack's total, a pie's slice share", () => {
    const m = model(lines(2));
    const at = { kind: "line", i: 1, part: undefined } as const;
    expect(m.facets?.panels.map((p) => headFigure(p.model, words, at))).toEqual(["4%", "8%"]);
    const b = model(bars(["A", "B"]));
    const row = { kind: "bar", row: 2, part: undefined } as const;
    expect(b.facets?.panels.map((p) => headFigure(p.model, words, row))).toEqual(["3", "3"]);
    const stacks = model({
      x: { domain: [0, 2] },
      marks: [],
      facets: {
        panels: ["Germany", "France"].map((name, k) => ({
          name,
          marks: [
            {
              mark: "rect",
              x1: [0, 1],
              x2: [1, 2],
              series: [
                { name: "Coal", y: [1, 2 + k] },
                { name: "Wind", y: [3, 4] },
              ],
            },
          ],
        })),
      },
    });
    const bucket = { kind: "rect", i: 1, part: undefined } as const;
    expect(stacks.facets?.panels.map((p) => headFigure(p.model, words))).toEqual(["10", "11"]);
    expect(stacks.facets?.panels.map((p) => headFigure(p.model, words, bucket))).toEqual([
      "6",
      "7",
    ]);
    const pies = model({
      marks: [],
      facets: {
        panels: ["2023", "2024"].map((name, k) => ({
          name,
          marks: [
            {
              mark: "pie",
              slices: [
                { name: "Coal", value: 1 + k },
                { name: "Wind", value: 3 },
              ],
            },
          ],
        })),
      },
    });
    const slice = { kind: "slice", i: 0 } as const;
    expect(pies.facets?.panels.map((p) => headFigure(p.model, words))).toEqual(["4", "5"]);
    expect(pies.facets?.panels.map((p) => headFigure(p.model, words, slice))).toEqual([
      "25%",
      "40%",
    ]);
  });
});

describe("facets: the figure's legend row", () => {
  it("counts the panels in their unit or as panels, keeps an x every panel shares and blanks the values", () => {
    const m = model(lines(3));
    if (m.facets === undefined) {
      throw new Error("no facets");
    }
    expect(facetOverall(m, m.facets, words)).toEqual({
      panel: "3 panels",
      at: "3",
      entries: [{ slot: undefined, name: undefined, value: "" }],
      total: undefined,
    });
    const one = model(
      lines(1, {
        facets: {
          unit: { one: "region", other: "regions" },
          panels: [{ marks: [line("North", [0.1, 0.2, 0.3, 0.4])] }],
        },
      }),
    );
    expect(one.facets && facetOverall(one, one.facets, words)?.panel).toBe("1\u00A0region");
    // Panels whose last samples differ share no x.
    const apart = model({
      y: { format: "percent" },
      marks: [],
      facets: {
        panels: [
          { marks: [line("North", [0.1, 0.2, 0.3, 0.4])] },
          { marks: [line("South", [0.1, 0.2, 0.3, null])] },
        ],
      },
    });
    expect(apart.facets && facetOverall(apart, apart.facets, words)?.at).toBe("");
  });

  it("measures each slot over every panel, and the panel slot over the count and the names", () => {
    const m = model({
      y: { format: "percent" },
      marks: [],
      facets: {
        panels: [
          { marks: [line("N", [0.1, 0.2, 0.3, 0.4])] },
          { marks: [line("A long name", [0.1, 0.2, 0.3, 0.123])] },
        ],
      },
    });
    if (m.facets === undefined) {
      throw new Error("no facets");
    }
    const w = facetWidths(m, m.facets, words, face);
    expect(w.panel).toBe(face.number("A long name"));
    expect(w.values[0]).toBeGreaterThanOrEqual(face.number("12.3%"));
  });
});
