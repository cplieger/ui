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

  it("refuses band panels whose rows differ, naming the field", () => {
    const [a] = bars(["A", "B"]).facets?.panels ?? [];
    const moved: ChartSpec = {
      marks: [],
      facets: {
        panels: [
          a ?? { marks: [] },
          {
            name: "B",
            marks: [
              {
                mark: "bar",
                y: ["Coal", "Wind", "Gas"],
                series: [{ name: "Share", x: [1, 2, 3] }],
              },
            ],
          },
        ],
      },
    };
    expect(() => model(moved)).toThrow(
      new TypeError(
        "renderChart: facets.panels[1].marks[0].y must be facets.panels[0]'s; the panels share one band of rows",
      ),
    );
    const boxes = (y: string[]): Mark => ({
      mark: "box",
      y,
      series: [{ name: "Wait", low: [1, 1], q1: [2, 2], median: [3, 3], q3: [4, 4], high: [5, 5] }],
    });
    expect(() =>
      model({
        marks: [],
        facets: {
          panels: [
            { name: "A", marks: [boxes(["x", "y"])] },
            { name: "B", marks: [boxes(["x", "z"])] },
          ],
        },
      }),
    ).toThrow(/facets\.panels\[1\]\.marks\[0\]\.y must be facets\.panels\[0\]'s/);
  });

  it("refuses heatmap panels whose axes differ and calendar panels whose days differ", () => {
    const cells = (x: string[] | { edges: number[] }): Mark => ({
      mark: "cell",
      x,
      y: ["Mon", "Tue"],
      values: [
        [1, 2],
        [3, 4],
      ],
    });
    const grids = (second: Mark): ChartSpec => ({
      marks: [],
      facets: {
        panels: [
          { name: "A", marks: [cells(["0h", "1h"])] },
          { name: "B", marks: [second] },
        ],
      },
    });
    expect(() => model(grids(cells(["0h", "1h"])))).not.toThrow();
    expect(() => model(grids(cells(["1h", "0h"])))).toThrow(
      new TypeError(
        "renderChart: facets.panels[1].marks[0].x must be facets.panels[0]'s; the panels share one grid",
      ),
    );
    const start = Date.UTC(2024, 0, 1);
    const days = (from: number, count: number, open?: boolean): Mark => ({
      mark: "cell",
      days: {
        start: from,
        values: Array.from({ length: count }, (_, i) => i),
        ...(open === undefined ? {} : { open }),
      },
    });
    const calendars = (second: Mark): ChartSpec => ({
      marks: [],
      facets: {
        panels: [
          { name: "A", marks: [days(start, 28)] },
          { name: "B", marks: [second] },
        ],
      },
    });
    expect(() => model(calendars(days(start, 28)))).not.toThrow();
    expect(() => model(calendars(days(start + 86_400_000, 28)))).toThrow(
      /facets\.panels\[1\]\.marks\[0\]\.days\.start must be facets\.panels\[0\]'s; the panels share one calendar/,
    );
    expect(() => model(calendars(days(start, 21)))).toThrow(/days\.values\.length must be/);
    expect(() => model(calendars(days(start, 28, true)))).toThrow(/days\.open must be/);
    expect(() => model({ marks: [], facets: { panels: [{ marks: [days(start, 28)] }] } })).toThrow(
      new TypeError(
        "renderChart: facets.panels[0].name is required; a cell panel has no series to name it",
      ),
    );
  });

  it("refuses pie panels whose slices differ, even one slice each", () => {
    const pie = (names: string[]): Mark => ({
      mark: "pie",
      slices: names.map((name, k) => ({ name, value: k + 1 })),
    });
    const pies = (a: string[], b: string[]): ChartSpec => ({
      marks: [],
      facets: {
        panels: [
          { name: "2023", marks: [pie(a)] },
          { name: "2024", marks: [pie(b)] },
        ],
      },
    });
    expect(() => model(pies(["Coal", "Gas"], ["Coal", "Gas"]))).not.toThrow();
    for (const [a, b] of [
      [
        ["Coal", "Gas"],
        ["Gas", "Coal"],
      ],
      [["Coal"], ["Gas"]],
    ]) {
      expect(() => model(pies(a ?? [], b ?? []))).toThrow(
        new TypeError(
          "renderChart: facets.panels must each hold the same slices in the same order",
        ),
      );
    }
  });

  it("colours every heatmap panel by one set of classes over every panel's values", () => {
    const cells = (top: number): Mark => ({
      mark: "cell",
      x: ["a", "b"],
      y: ["c"],
      values: [[0, top]],
    });
    const m = model({
      marks: [],
      facets: {
        panels: [
          { name: "Low", marks: [cells(10)] },
          { name: "High", marks: [cells(100)] },
        ],
      },
    });
    // A lone heatmap of the high panel's values spans the same 0 to 100.
    const lone = model({ marks: [cells(100)] }).primary;
    const classesOf = (p: Model["primary"]) => (p?.kind === "cell" ? p.classes : undefined);
    expect(lone?.kind).toBe("cell");
    for (const p of m.facets?.panels ?? []) {
      expect(classesOf(p.model.primary)).toEqual(classesOf(lone));
    }
  });

  it("sizes every bubble panel on one r scale over every panel's sizes", () => {
    const bubbles = (r: number): Mark => ({
      mark: "scatter",
      series: [{ name: "Towns", names: ["a", "b"], x: [1, 2], y: [1, 2], r: [1, r] }],
    });
    const m = model({
      x: { label: "Area" },
      y: { label: "People" },
      r: { label: "Jobs" },
      marks: [],
      facets: {
        panels: [
          { name: "North", marks: [bubbles(10)] },
          { name: "South", marks: [bubbles(40)] },
        ],
      },
    });
    const his = (m.facets?.panels ?? []).map((p) =>
      p.model.primary?.kind === "scatter" ? p.model.primary.size?.hi : undefined,
    );
    expect(his).toEqual([40, 40]);
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

  it("keeps a bar panel's value labels", () => {
    for (const p of grid(bars(["A", "B"]), 1000).panels) {
      expect(p.lay.valueLabels.map((t) => t.text)).toEqual(expect.arrayContaining(["2", "3"]));
    }
  });

  describe("pie panels", () => {
    const pies = (count: number, more: Partial<ChartSpec> = {}): ChartSpec => ({
      marks: [],
      facets: {
        panels: Array.from({ length: count }, (_, k) => ({
          name: String(2020 + k),
          marks: [
            {
              mark: "pie",
              slices: [
                { name: "Coal", value: 3 + k },
                { name: "Gas", value: 2 },
                { name: "Wind", value: 1 },
              ],
            },
          ],
        })),
      },
      ...more,
    });

    it("draw each pie as wide as its plot, at most 240 px, with no gutter and no outside labels", () => {
      const phone = grid(pies(4), 288);
      expect(phone.gutter).toBe(0);
      // Two to a row on a phone: (288 - 16) / 2, less each plot's border.
      expect(phone.columns).toBe(2);
      for (const p of phone.panels) {
        expect(p.lay.frame.width).toBe(134);
        expect(2 * (p.lay.pie?.r ?? 0)).toBe(134);
        expect(p.lay.endLabels).toEqual([]);
        expect(p.lay.leaders).toEqual([]);
      }
      const wide = grid(pies(1), 1000);
      expect(2 * (wide.panels[0]?.lay.pie?.r ?? 0)).toBe(240);
      expect(wide.panels[0]?.lay.endLabels).toEqual([]);
    });

    it("take a passed height as each pie's plot height", () => {
      const p = grid(pies(2, { height: 100 }), 1000).panels[0];
      expect(p?.lay.frame.height).toBe(100);
      expect(2 * (p?.lay.pie?.r ?? 0)).toBe(100);
    });
  });

  it("fits heatmap panels at 160 px a plot and scatter panels at 112", () => {
    const cells: ChartSpec = {
      marks: [],
      facets: {
        panels: ["A", "B", "C"].map((name) => ({
          name,
          marks: [{ mark: "cell", x: ["a", "b"], y: ["c"], values: [[1, 2]] }] as Mark[],
        })),
      },
    };
    // Three 160 px plots, their borders and two gaps take 518 px beside the gutter.
    expect(grid(cells, 600).columns).toBe(3);
    expect(grid(cells, 400).columns).toBe(2);
    const dots: ChartSpec = {
      x: { label: "Area" },
      y: { label: "People" },
      marks: [],
      facets: {
        panels: ["A", "B", "C"].map((name) => ({
          marks: [{ mark: "scatter", series: [{ name, names: ["a"], x: [1], y: [2] }] }] as Mark[],
        })),
      },
    };
    const g = grid(dots, 600);
    expect(g.columns).toBe(3);
    for (const p of g.panels) {
      expect(p.lay.frame.width).toBeGreaterThanOrEqual(112);
    }
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
