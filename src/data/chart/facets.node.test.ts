import { describe, expect, it } from "vitest";

import type { FrameNote, FrameRef, SeriesFrame } from "../frame/frame.js";
import { measurer } from "../scale/measure.js";

import { facetLayout, facetOverall, facetWidths, headFigure, PANEL_HEIGHT } from "./facets.js";
import type { Metrics } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import type { ChartFrame, ChartSpec, Mark } from "./spec.js";
import {
  binsFrame,
  boxes as boxesFrame,
  calendar,
  categories,
  grid as gridFrame,
  points,
  tree,
  unitBins,
} from "./test-helpers/frames.js";
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

type Panel = NonNullable<ChartSpec["facets"]>["panels"][number];
type Facets = Omit<NonNullable<ChartSpec["facets"]>, "panels">;
type Values = readonly (number | null)[];

const x = [0, 1, 2, 3];
// A share of each sample, one series keyed `key`.
const one = (key: string, values: Values, more: Partial<SeriesFrame> = {}): SeriesFrame => ({
  type: "series",
  name: "s",
  unit: "ratio",
  x,
  series: [{ key, values: [...values] }],
  ...more,
});
// Panels keyed p0, p1, ... of `frames`, under `mark`.
const faceted = (
  mark: Mark,
  frames: readonly ChartFrame[],
  names?: readonly string[],
  more: Omit<ChartSpec, "data" | "mark" | "facets"> = {},
  facets: Facets = {},
): ChartSpec => ({
  mark,
  facets: {
    ...facets,
    panels: frames.map((data, k): Panel => {
      const name = names?.[k];
      return { key: `p${String(k)}`, ...(name === undefined ? {} : { name }), data };
    }),
  },
  ...more,
});
const regions = (count: number, refs?: FrameRef[]): SeriesFrame[] =>
  Array.from({ length: count }, (_, k) =>
    one(`Region ${String(k + 1)}`, [0.02, 0.04 * (k + 1), 0.03, 0.05], refs && { refs }),
  );
const lines = (
  count: number,
  more: Omit<ChartSpec, "data" | "mark" | "facets"> = {},
  facets: Facets = {},
): ChartSpec => faceted({ mark: "line" }, regions(count), undefined, more, facets);
const fuels = (k: number) => categories(["Coal", "Gas", "Wind"], [[k + 1, 2, 3]]);
const bars = (names: string[]): ChartSpec =>
  faceted(
    { mark: "bar" },
    names.map((_, k) => fuels(k)),
    names,
  );

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
    const two = (name?: string): ChartSpec =>
      faceted(
        { mark: "rect" },
        ["A", "B"].map(() =>
          unitBins([
            [1, 2],
            [2, 1],
          ]),
        ),
        name === undefined ? undefined : ["A", "B"].map((n) => `${name} ${n}`),
      );
    expect(model(two("Region")).facets?.panels.map((p) => p.name)).toEqual([
      "Region A",
      "Region B",
    ]);
    expect(() => model(two())).toThrow(
      new TypeError("renderChart: facets.panels[0].name is required on a panel of 2 series"),
    );
  });

  it("names a one-series panel by its series' words in mark.keys", () => {
    const spec = faceted({ mark: "line", keys: [{ key: "Region 2", name: "South" }] }, regions(2));
    expect(model(spec).facets?.panels.map((p) => p.name)).toEqual(["Region 1", "South"]);
  });

  it("refuses an empty or a repeated panel name", () => {
    expect(() => model(bars(["North", ""]))).toThrow(RangeError);
    expect(() => model(bars(["North", "North"]))).toThrow(
      /facets\.panels\[1\]'s name "North" must be unique/,
    );
  });

  it("refuses panels whose series are neither one each nor the same", () => {
    const pair = (a: string, b: string): SeriesFrame => ({
      ...one(a, x),
      series: [
        { key: a, values: x },
        { key: b, values: x },
      ],
    });
    const spec = faceted({ mark: "line" }, [pair("a", "b"), pair("b", "a")], ["A", "B"]);
    expect(() => model(spec)).toThrow(/each hold one series, or all the same series/);
  });

  it("refuses a panel whose frame the mark does not draw", () => {
    const mixed = faceted({ mark: "line" }, [one("A", x), unitBins([[1]])]);
    expect(() => model(mixed)).toThrow(/^renderChart: facets\.panels\[1\]\.data\.type/u);
  });

  it("refuses a timeline or a treemap in a panel", () => {
    const dot: ChartSpec = {
      mark: { mark: "dot" },
      facets: {
        panels: [
          {
            key: "a",
            name: "A",
            data: { type: "events", name: "e", rows: [{ key: "a", at: [1] }] },
          },
        ],
      },
    };
    expect(() => model(dot)).toThrow(/mark\.mark "dot" draws no panels/);
    const trees = faceted({ mark: "tree" }, [tree({ parts: [{ key: "a", value: 1 }] })], ["A"]);
    expect(() => model(trees)).toThrow(/mark\.mark "tree" draws no panels/);
  });

  it("draws a ref every panel holds at one value once, as the chart's, and a panel's own in its panel", () => {
    const target: FrameRef = { key: "target", value: 0.2 };
    const shared = model(
      faceted({ mark: "line" }, regions(2, [target]), undefined, {
        refs: [{ key: "target", label: "Target" }],
      }),
    );
    const rules = (marks: readonly { readonly mark: string }[] = []) =>
      marks.filter((m) => m.mark === "rule");
    expect(rules(shared.spec.marks)).toEqual([{ mark: "rule", y: 0.2, label: "Target" }]);
    expect(shared.spec.facets?.panels.map((p) => rules(p.marks).length)).toEqual([0, 0]);
    // Each panel's plot draws the chart's rule.
    for (const p of shared.facets?.panels ?? []) {
      expect(p.model.marks.filter((m) => m.kind === "rule")).toHaveLength(1);
      expect("hi" in p.model.y ? p.model.y.hi : 0).toBeGreaterThanOrEqual(0.2);
    }
    const [a, b] = regions(2);
    const own = model(
      faceted({ mark: "line" }, [{ ...(a ?? one("a", x)), refs: [target] }, b ?? one("b", x)]),
    );
    expect(rules(own.spec.marks)).toEqual([]);
    expect(own.spec.facets?.panels.map((p) => rules(p.marks).length)).toEqual([1, 0]);
  });

  it("refuses a ref on an axis the panels' mark has no scale for, and gives a pie's in the summary", () => {
    const refs = [{ key: "y", value: 1 }];
    expect(() =>
      model(
        faceted(
          { mark: "bar" },
          [fuels(0), fuels(1)].map((f) => ({ ...f, refs })),
          ["A", "B"],
          { refs: [{ key: "y", axis: "y" }] },
        ),
      ),
    ).toThrow(
      /^renderChart: refs\[0\]\.axis "y" has no place beside a bar mark, which has no continuous y scale/u,
    );
    const pies = model(
      faceted(
        { mark: "pie" },
        ["2023", "2024"].map(() =>
          categories(["a"], [[1]], { refs: [{ key: "Target", value: 1 }] }),
        ),
        ["2023", "2024"],
      ),
    );
    expect(pies.marks.filter((m) => m.kind === "rule")).toEqual([]);
    expect(pies.unplaced.rules).toEqual([{ label: "Target", value: 1 }]);
  });

  it("names a panel's own frame field by its place in the panel", () => {
    const [a] = regions(1);
    const broken = faceted({ mark: "line" }, [a ?? one("a", x), { ...one("B", [1, 2]), x }]);
    expect(() => model(broken)).toThrow(/facets\.panels\[1\]\.data\.series\[0\]\.values/);
  });

  it("refuses a missing, empty or over-long panel list, and a panel without its data", () => {
    expect(() => model({ mark: { mark: "line" }, facets: { panels: [] } })).toThrow(
      new TypeError("renderChart: facets.panels must be a non-empty array, a panel each"),
    );
    expect(() => model(lines(101))).toThrow(RangeError);
    expect(() => model(lines(101))).toThrow(/facets\.panels must hold at most 100 entries/);
    expect(() =>
      model({ mark: { mark: "line" }, facets: { panels: [{ key: "a", name: "A" }] } } as never),
    ).toThrow(/^renderChart: facets\.panels\[0\]\.data must be/u);
  });

  // Each panel draws a plot of its own, so the figure's ceilings are shared out.
  it("shares the figure's height, row, sub-row, week and bin ceilings out among its panels", () => {
    expect(() => model(lines(100, { height: 401 }))).toThrow(
      new RangeError(
        "renderChart: height must be a number of px above 0 and at most 400 in each of 100 panels",
      ),
    );
    expect(model(lines(100, { height: 400 })).spec.height).toBe(400);
    const names = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}`);
    const ones = (n: number) => names(n).map(() => 1);
    const panels = (mark: Mark, frame: ChartFrame): ChartSpec =>
      faceted(
        mark,
        names(10).map(() => frame),
        names(10),
      );
    const rows = (n: number, k = 1) =>
      categories(
        names(n),
        names(k).map(() => ones(n)),
      );
    const group: Mark = { mark: "bar", arrange: "group" };
    expect(() => model(panels(group, rows(101)))).toThrow(
      new RangeError(
        "renderChart: facets.panels[0].data.names must name at most 100 rows in each of 10 panels",
      ),
    );
    expect(model(panels(group, rows(100))).facets?.panels).toHaveLength(10);
    expect(() => model(panels(group, rows(100, 3)))).toThrow(
      new RangeError(
        "renderChart: facets.panels[0].data.series must take at most 250 sub-rows in each of 10 panels, a sub-row per series in each row, since the plot is as tall as its rows",
      ),
    );
    // 1 January 1970 was a Thursday, so with weeks from Thursday 700 days are 100 weeks.
    const week: Mark = { mark: "cell", weekStart: 4 };
    expect(() => model(panels(week, calendar(0, ones(701))))).toThrow(
      new RangeError(
        "renderChart: the days of a calendar must fit in 100 weeks in each of 10 panels",
      ),
    );
    expect(model(panels(week, calendar(0, ones(700)))).facets?.panels).toHaveLength(10);
    const bins = (thinnest: number) =>
      gridFrame({ names: ["a"] }, { edges: [0, thinnest, 1] }, [[1], [2]]);
    expect(() => model(panels({ mark: "cell" }, bins(0.009)))).toThrow(
      new RangeError(
        "renderChart: facets.panels[0].data.y.edges' thinnest bin must be at least 1/100 of the axis in each of 10 panels, since the plot grows until it is a row tall",
      ),
    );
    expect(model(panels({ mark: "cell" }, bins(0.01))).facets?.panels).toHaveLength(10);
  });

  it("counts each panel's values again for every other panel it is drawn behind", () => {
    const samples = (n: number, context?: true): ChartSpec =>
      faceted(
        { mark: "line" },
        Array.from({ length: 100 }, (_, k): SeriesFrame => ({
          ...one(`P${String(k)}`, []),
          x: Array.from({ length: n }, (_, i) => i),
          series: [{ key: `P${String(k)}`, values: Array.from({ length: n }, () => 1) }],
        })),
        undefined,
        {},
        context === undefined ? {} : { context },
      );
    // 100 panels of n samples hold 100 × n values, each drawn again behind
    // the 99 other panels: 10,000 × n in all.
    expect(() => model(samples(101, true))).toThrow(RangeError);
    expect(() => model(samples(101, true))).toThrow(/^renderChart: facets\.context .*1000000/u);
    expect(model(samples(100, true)).facets?.context).toBe(true);
    expect(model(samples(101)).facets?.panels).toHaveLength(100);
  });

  it("draws context behind one-series line or scatter panels only", () => {
    expect(model(lines(2, {}, { context: true })).facets?.context).toBe(true);
    expect(() =>
      model(faceted({ mark: "bar" }, [fuels(0), fuels(1)], ["A", "B"], {}, { context: true })),
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
    const moved = faceted(
      { mark: "bar" },
      [fuels(0), categories(["Coal", "Wind", "Gas"], [[1, 2, 3]])],
      ["A", "B"],
    );
    expect(() => model(moved)).toThrow(
      new TypeError(
        "renderChart: facets.panels[1].data.names must be facets.panels[0]'s; the panels share one band of rows",
      ),
    );
    const boxes = (names: string[]) =>
      boxesFrame(names, [
        { key: "Wait", low: [1, 1], q1: [2, 2], median: [3, 3], q3: [4, 4], high: [5, 5] },
      ]);
    expect(() =>
      model(faceted({ mark: "box" }, [boxes(["x", "y"]), boxes(["x", "z"])], ["A", "B"])),
    ).toThrow(/facets\.panels\[1\]\.data\.names must be facets\.panels\[0\]'s/);
  });

  it("refuses heatmap panels whose axes differ and calendar panels whose days differ", () => {
    const cells = (columns: string[]) =>
      gridFrame({ names: columns }, { names: ["Mon", "Tue"] }, [
        [1, 2],
        [3, 4],
      ]);
    const grids = (second: ChartFrame) =>
      faceted({ mark: "cell" }, [cells(["0h", "1h"]), second], ["A", "B"]);
    expect(() => model(grids(cells(["0h", "1h"])))).not.toThrow();
    expect(() => model(grids(cells(["1h", "0h"])))).toThrow(
      new TypeError(
        "renderChart: facets.panels[1].data.x must be facets.panels[0]'s; the panels share one grid",
      ),
    );
    const start = Date.UTC(2024, 0, 1);
    const days = (from: number, count: number, open?: boolean) =>
      calendar(
        from,
        Array.from({ length: count }, (_, i) => i),
        open === undefined ? {} : { open },
      );
    const calendars = (second: ChartFrame) =>
      faceted({ mark: "cell" }, [days(start, 28), second], ["A", "B"]);
    expect(() => model(calendars(days(start, 28)))).not.toThrow();
    expect(() => model(calendars(days(start + 86_400_000, 28)))).toThrow(
      /facets\.panels\[1\]\.data\.start must be facets\.panels\[0\]'s; the panels share one calendar/,
    );
    expect(() => model(calendars(days(start, 21)))).toThrow(/data\.values\.length must be/);
    expect(() => model(calendars(days(start, 28, true)))).toThrow(/data\.open must be/);
    expect(() =>
      model(calendars({ ...days(start, 28), zone: "Europe/Paris", start: start - 3_600_000 })),
    ).toThrow(/data\.zone must be/);
    expect(() => model(faceted({ mark: "cell" }, [days(start, 28)]))).toThrow(
      new TypeError(
        "renderChart: facets.panels[0].name is required; a cell panel has no series to name it",
      ),
    );
  });

  it("refuses pie panels whose slices differ, even one slice each", () => {
    const pie = (names: string[]) => categories(names, [names.map((_, k) => k + 1)]);
    const pies = (a: string[], b: string[]) =>
      faceted({ mark: "pie" }, [pie(a), pie(b)], ["2023", "2024"]);
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
          "renderChart: facets.panels[1].data.names must be facets.panels[0]'s; the panels share one set of slices",
        ),
      );
    }
  });

  it("gives a series the one slot mark.keys names in every panel", () => {
    const stack = (k: number) =>
      binsFrame([0, 10], [10, 20], [], {
        axis: "value",
        series: [
          { key: "Posts", values: [1, 2 + k] },
          { key: "Replies", values: [3, 4] },
        ],
      });
    const m = model(
      faceted(
        { mark: "rect", keys: [{ key: "Replies", slot: 4 }] },
        [stack(0), stack(1)],
        ["North", "South"],
      ),
    );
    expect(
      m.facets?.panels.map((p) =>
        p.model.primary?.kind === "rect" ? p.model.primary.series.map((s) => s.slot) : [],
      ),
    ).toEqual([
      [1, 4],
      [1, 4],
    ]);
    // Per-series panels may each take a slot, colour highlighting one of them.
    const highlighted = model(
      faceted({ mark: "line", keys: [{ key: "South", slot: 3 }] }, [
        one("North", [1, 2, 3, 4]),
        one("South", [1, 2, 3, 4]),
      ]),
    );
    expect(
      highlighted.facets?.panels.map((p) =>
        p.model.primary?.kind === "line" ? p.model.primary.series[0]?.slot : undefined,
      ),
    ).toEqual([1, 3]);
  });

  it("colours every heatmap panel by one set of classes over every panel's values", () => {
    const cells = (top: number) => gridFrame({ names: ["a", "b"] }, { names: ["c"] }, [[0, top]]);
    const m = model(faceted({ mark: "cell" }, [cells(10), cells(100)], ["Low", "High"]));
    // A lone heatmap of the high panel's values spans the same 0 to 100.
    const lone = model({ data: cells(100), mark: { mark: "cell" } }).primary;
    const classesOf = (p: Model["primary"]) => (p?.kind === "cell" ? p.classes : undefined);
    expect(lone?.kind).toBe("cell");
    for (const p of m.facets?.panels ?? []) {
      expect(classesOf(p.model.primary)).toEqual(classesOf(lone));
    }
  });

  it("sizes every bubble panel on one r scale over every panel's sizes", () => {
    const bubbles = (r: number) =>
      points([{ key: "Towns", names: ["a", "b"], x: [1, 2], y: [1, 2], r: [1, r] }]);
    const m = model(
      faceted({ mark: "scatter" }, [bubbles(10), bubbles(40)], ["North", "South"], {
        x: { label: "Area" },
        y: { label: "People" },
        r: { label: "Jobs" },
      }),
    );
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
    const widths = phone.panels.map((p) => p.lay.projection.width);
    expect(new Set(widths).size).toBe(1);
    expect(phone.gutter + 2 * ((widths[0] ?? 0) + 2) + 16).toBeLessThanOrEqual(288);
    expect(widths[0]).toBeGreaterThanOrEqual(112);
    expect(grid(lines(6), 200).columns).toBe(1);
  });

  it("gives every panel the default panel height", () => {
    for (const p of grid(lines(4), 600).panels) {
      expect(p.lay.projection.height).toBe(PANEL_HEIGHT);
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
    expect(second?.lay.height).toBe((second?.lay.top ?? 0) + (second?.lay.projection.height ?? 0));
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
    const pies = (count: number, more: Omit<ChartSpec, "data" | "mark" | "facets"> = {}) =>
      faceted(
        { mark: "pie" },
        Array.from({ length: count }, (_, k) =>
          categories(["Coal", "Gas", "Wind"], [[3 + k, 2, 1]]),
        ),
        Array.from({ length: count }, (_, k) => String(2020 + k)),
        more,
      );

    it("draw each pie as wide as its plot, at most 240 px, with no gutter and no outside labels", () => {
      const phone = grid(pies(4), 288);
      expect(phone.gutter).toBe(0);
      // Two to a row on a phone: (288 - 16) / 2, less each plot's border.
      expect(phone.columns).toBe(2);
      for (const p of phone.panels) {
        expect(p.lay.projection.width).toBe(134);
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
      expect(p?.lay.projection.height).toBe(100);
      expect(2 * (p?.lay.pie?.r ?? 0)).toBe(100);
    });
  });

  it("fits heatmap panels at 160 px a plot and scatter panels at 112", () => {
    const cells = faceted(
      { mark: "cell" },
      ["A", "B", "C"].map(() => gridFrame({ names: ["a", "b"] }, { names: ["c"] }, [[1, 2]])),
      ["A", "B", "C"],
    );
    // Three 160 px plots, their borders and two gaps take 518 px beside the gutter.
    expect(grid(cells, 600).columns).toBe(3);
    expect(grid(cells, 400).columns).toBe(2);
    const dots = faceted(
      { mark: "scatter" },
      ["A", "B", "C"].map((key) => points([{ key, names: ["a"], x: [1], y: [2] }])),
      undefined,
      { x: { label: "Area" }, y: { label: "People" } },
    );
    const g = grid(dots, 600);
    expect(g.columns).toBe(3);
    for (const p of g.panels) {
      expect(p.lay.projection.width).toBeGreaterThanOrEqual(112);
    }
  });

  describe("numbers notes across the panels", () => {
    const note = (at: number, key: string): FrameNote => ({ key, at });
    const noted = (notes: FrameNote[][]): ChartSpec =>
      faceted(
        { mark: "line" },
        regions(notes.length).map((frame, k) => ({ ...frame, notes: notes[k] ?? [] })),
      );
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
    const stacks = model(
      faceted(
        { mark: "rect" },
        [0, 1].map((k) =>
          unitBins([
            [1, 2 + k],
            [3, 4],
          ]),
        ),
        ["Germany", "France"],
        { x: { domain: [0, 2] } },
      ),
    );
    const bucket = { kind: "rect", i: 1, part: undefined } as const;
    expect(stacks.facets?.panels.map((p) => headFigure(p.model, words))).toEqual(["10", "11"]);
    expect(stacks.facets?.panels.map((p) => headFigure(p.model, words, bucket))).toEqual([
      "6",
      "7",
    ]);
    const pies = model(
      faceted(
        { mark: "pie" },
        [0, 1].map((k) => categories(["Coal", "Wind"], [[1 + k, 3]])),
        ["2023", "2024"],
      ),
    );
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
    const single = model(
      faceted(
        { mark: "line" },
        [one("North", [0.1, 0.2, 0.3, 0.4])],
        undefined,
        {},
        {
          unit: { one: "region", other: "regions" },
        },
      ),
    );
    expect(single.facets && facetOverall(single, single.facets, words)?.panel).toBe(
      "1\u00A0region",
    );
    // Panels whose last samples differ share no x.
    const apart = model(
      faceted({ mark: "line" }, [
        one("North", [0.1, 0.2, 0.3, 0.4]),
        one("South", [0.1, 0.2, 0.3, null]),
      ]),
    );
    expect(apart.facets && facetOverall(apart, apart.facets, words)?.at).toBe("");
  });

  it("measures each slot over every panel, and the panel slot over the count and the names", () => {
    const m = model(
      faceted({ mark: "line" }, [
        one("N", [0.1, 0.2, 0.3, 0.4]),
        one("A long name", [0.1, 0.2, 0.3, 0.123]),
      ]),
    );
    if (m.facets === undefined) {
      throw new Error("no facets");
    }
    const w = facetWidths(m, m.facets, words, face);
    expect(w.panel).toBe(face.number("A long name"));
    expect(w.values[0]).toBeGreaterThanOrEqual(face.number("12.3%"));
  });
});
