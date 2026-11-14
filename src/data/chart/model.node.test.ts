import { describe, expect, it } from "vitest";

import {
  binOf,
  cellOrder,
  chartModel,
  drawnTotal,
  drawnValue,
  pointLink,
  sampleValue,
  scatterDotAt,
  type BoxModel,
  type CellModel,
  type PointModel,
  type ScatterModel,
} from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";

type Slot = NonNullable<Extract<Mark, { mark: "line" }>["series"][number]["slot"]>;

const build = (spec: unknown) => chartModel(spec as ChartSpec, "en", "UTC");

const rect = (
  y: readonly (number | null)[],
  more: Partial<Extract<Mark, { mark: "rect" }>> = {},
): Mark => ({
  mark: "rect",
  x1: y.map((_, i) => i),
  x2: y.map((_, i) => i + 1),
  series: [{ name: "a", y }],
  ...more,
});

const line = (
  y: readonly (number | null)[],
  more: Partial<Extract<Mark, { mark: "line" }>> = {},
): Mark => ({
  mark: "line",
  x: y.map((_, i) => i),
  series: [{ name: "a", y }],
  ...more,
});

const area = (
  series: readonly (readonly (number | null)[])[],
  more: Partial<Extract<Mark, { mark: "area" }>> = {},
): Mark => ({
  mark: "area",
  x: (series[0] ?? []).map((_, i) => i),
  series: series.map((y, k) => ({ name: `s${String(k)}`, y })),
  ...more,
});

const note = (more: Partial<Extract<Mark, { mark: "text" }>> = {}): Mark => ({
  mark: "text",
  x: 0,
  y: 1,
  text: "Deploy",
  ...more,
});

const dots: Mark = { mark: "dot", rows: [{ name: "ana", x: [0] }] };

const ten = Array.from({ length: 10 }, (_, i) => ({ name: `s${String(i)}`, y: [1] }));

describe("spec errors", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["a repeated line x", { x: {}, marks: [line([1, 2], { x: [0, 0] })] }, RangeError],
    [
      "a rect x1 that goes back",
      { x: {}, marks: [rect([1, 2], { x1: [1, 0], x2: [2, 1] })] },
      RangeError,
    ],
    [
      "a dot row's x decreasing",
      { x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [2, 1] }] }] },
      RangeError,
    ],
    ["a rect x2 not above its x1", { x: {}, marks: [rect([1], { x2: [0] })] }, RangeError],
    ["a non-finite x", { x: {}, marks: [line([1, 2], { x: [0, Number.NaN] })] }, RangeError],
    [
      "an infinite x2",
      { x: {}, marks: [rect([1], { x2: [Number.POSITIVE_INFINITY] })] },
      RangeError,
    ],
    ["an infinite y", { x: {}, marks: [line([Number.NEGATIVE_INFINITY])] }, RangeError],
    ["a negative y under a rect", { x: {}, marks: [rect([-1])] }, RangeError],
    [
      "a slot of 0",
      { x: {}, marks: [rect([1], { series: [{ name: "a", slot: 0 as 1, y: [1] }] })] },
      RangeError,
    ],
    ["a slot of 10", { x: {}, marks: [{ mark: "dot", slot: 10, rows: [] }] }, RangeError],
    ["a tenth series with no slot", { x: {}, marks: [rect([1], { series: ten })] }, RangeError],
    ["a log domain at 0", { x: { type: "log", domain: [0, 10] }, marks: [rect([1])] }, RangeError],
    [
      "a second rect at 0 or below on a log x",
      { x: { type: "log" }, marks: [rect([1, 1], { x1: [-1, 0], x2: [0, 1] })] },
      RangeError,
    ],
    [
      "a rule at NaN",
      { x: {}, marks: [{ mark: "rule", x: Number.NaN, label: "Median" }] },
      RangeError,
    ],
    [
      "a rule at Infinity",
      { x: {}, marks: [{ mark: "rule", y: Number.POSITIVE_INFINITY, label: "Cap" }] },
      RangeError,
    ],
    [
      "a rect's y domain without 0",
      { x: {}, y: { domain: [1, 5] }, marks: [rect([2])] },
      RangeError,
    ],
    ["a height of 0", { x: {}, height: 0, marks: [] }, RangeError],
    ["a height past the most px a plot may be", { x: {}, height: 1e301, marks: [] }, RangeError],
    [
      "a format whose unit Intl refuses",
      { x: {}, y: { format: { style: "unit", unit: "" } }, marks: [] },
      RangeError,
    ],
    [
      "a format option that is a function",
      { x: {}, y: { format: { style: (() => "x") as never } }, marks: [] },
      TypeError,
    ],
    ["a series shorter than its x", { x: {}, marks: [line([1], { x: [0, 1] })] }, TypeError],
    ["dots beside a line", { x: {}, marks: [line([1]), { mark: "dot", rows: [] }] }, TypeError],
    ["a line beside a rect", { x: {}, marks: [rect([1]), line([1])] }, TypeError],
    ["two lines", { x: {}, marks: [line([1]), line([2])] }, TypeError],
    [
      "a second rect after a rule",
      { x: {}, marks: [rect([1]), { mark: "rule", y: 1, label: "Cap" }, rect([2])] },
      TypeError,
    ],
    [
      "a linear y under dots",
      { x: {}, y: { type: "linear" }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "a rule with neither x nor y",
      { x: {}, marks: [{ mark: "rule", label: "Median" }] },
      TypeError,
    ],
    [
      "a rule with both x and y",
      { x: {}, marks: [{ mark: "rule", x: 1, y: 1, label: "Median" }] },
      TypeError,
    ],
    ["zero false under a rect", { x: {}, y: { zero: false }, marks: [rect([1])] }, TypeError],
    [
      "a domain on a band",
      { x: {}, y: { domain: [0, 1] }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "a curve that is not linear or step",
      { x: {}, marks: [line([1], { curve: "smooth" as "step" })] },
      TypeError,
    ],
    ["a mark that is not one of the five", { x: {}, marks: [{ mark: "pie" }] }, TypeError],
    ["a repeated area x", { x: {}, marks: [area([[1, 2]], { x: [0, 0] })] }, RangeError],
    ["a negative y under an area", { x: {}, marks: [area([[1, -1]])] }, RangeError],
    [
      "an infinite y under an area",
      { x: {}, marks: [area([[Number.POSITIVE_INFINITY]])] },
      RangeError,
    ],
    [
      "an area's y domain without 0",
      { x: {}, y: { domain: [1, 5] }, marks: [area([[2]])] },
      RangeError,
    ],
    [
      "an area series shorter than its x",
      { x: {}, marks: [area([[1]], { x: [0, 1] })] },
      TypeError,
    ],
    [
      "an area curve that is not linear or step",
      { x: {}, marks: [area([[1]], { curve: "smooth" as "step" })] },
      TypeError,
    ],
    [
      "an area arranged other than stack or share",
      { x: {}, marks: [area([[1], [2]], { arrange: "group" as "stack" })] },
      TypeError,
    ],
    [
      "an area share of one series",
      { x: {}, marks: [area([[1]], { arrange: "share" })] },
      TypeError,
    ],
    [
      "an area share with a y domain",
      { x: {}, y: { domain: [0, 1] }, marks: [area([[1], [2]], { arrange: "share" })] },
      TypeError,
    ],
    [
      "a negative y under an area share",
      { x: {}, marks: [area([[1], [-1]], { arrange: "share" })] },
      RangeError,
    ],
    ["zero false under an area", { x: {}, y: { zero: false }, marks: [area([[1]])] }, TypeError],
    ["a log y under an area", { x: {}, y: { type: "log" }, marks: [area([[1]])] }, TypeError],
    ["an area beside a line", { x: {}, marks: [area([[1]]), line([1])] }, TypeError],
    ["a note with no text", { x: {}, marks: [line([1]), note({ text: " " })] }, TypeError],
    [
      "a note's text that is not a string",
      { x: {}, marks: [line([1]), note({ text: 3 as unknown as string })] },
      TypeError,
    ],
    [
      "a note's side that is not one of four",
      { x: {}, marks: [line([1]), note({ side: "top" as "above" })] },
      TypeError,
    ],
    [
      "a note with no x",
      { x: {}, marks: [line([1]), { mark: "text", y: 1, text: "Deploy" }] },
      TypeError,
    ],
    [
      "a note with no y",
      { x: {}, marks: [rect([1]), { mark: "text", x: 0.5, text: "Deploy" }] },
      TypeError,
    ],
    ["a note's x as a name", { x: {}, marks: [line([1]), note({ x: "Monday" })] }, TypeError],
    [
      "a note's y as a name off a band",
      { x: {}, marks: [area([[1]]), note({ y: "a" })] },
      TypeError,
    ],
    [
      "a note's x that is not a number or a name",
      { x: {}, marks: [line([1]), note({ x: true as unknown as number })] },
      TypeError,
    ],
    [
      "a note's non-finite x",
      { x: {}, marks: [line([1]), note({ x: Number.POSITIVE_INFINITY })] },
      RangeError,
    ],
    ["a note's NaN y", { x: {}, marks: [line([1]), note({ y: Number.NaN })] }, RangeError],
    [
      "a note at 0 on a log x",
      { x: { type: "log" }, marks: [rect([1], { x1: [1], x2: [2] }), note({ x: 0 })] },
      RangeError,
    ],
    [
      "a note below 0 on a log y",
      { x: {}, y: { type: "log" }, marks: [line([1]), note({ y: -1 })] },
      RangeError,
    ],
    ["a note's row as a number", { x: {}, marks: [dots, note({ y: 0 })] }, TypeError],
    ["a note in no row", { x: {}, marks: [dots, note({ y: "zed" })] }, RangeError],
    ["marks that are not an array", { x: {}, marks: "rect" }, TypeError],
    [
      "an arrange that is not stack, group or share",
      { x: {}, marks: [rect([1], { arrange: "side" as "group" })] },
      TypeError,
    ],
    ["a share of one series", { x: {}, marks: [rect([1], { arrange: "share" })] }, TypeError],
    [
      "a shape that is not bars or area",
      { x: {}, marks: [rect([1], { shape: "steps" as "area" })] },
      TypeError,
    ],
    [
      "an area grouped",
      { x: {}, marks: [rect([1], { shape: "area", arrange: "group" })] },
      TypeError,
    ],
    [
      "a series with no name",
      { x: {}, marks: [line([1], { series: [{ y: [1] } as never] })] },
      TypeError,
    ],
    ["a y holding a string", { x: {}, marks: [line(["1" as never])] }, TypeError],
    ["a scale type that does not exist", { x: { type: "utc" }, marks: [] }, TypeError],
    ["a format that does not exist", { x: { format: "bytes" }, marks: [] }, TypeError],
    ["a unit with no other form", { x: {}, y: { unit: { one: "post" } }, marks: [] }, TypeError],
  ])("%s throws its type", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names a domain that is not an array and a bigint format option", () => {
    const like = { 0: 0, 1: 10, length: 2 };
    for (const axis of ["x", "y"]) {
      expect(() => build({ x: {}, [axis]: { domain: like }, marks: [line([1, 2])] })).toThrow(
        `renderChart: ${axis}.domain must be an array of a low and a high`,
      );
    }
    expect(() => build({ x: {}, y: { format: { maximumFractionDigits: 1n } }, marks: [] })).toThrow(
      new TypeError(
        "renderChart: y.format.maximumFractionDigits must be a string, a number or a boolean",
      ),
    );
  });

  it("names a unit's form that is not a string or no plural form", () => {
    expect(() => build({ x: {}, y: { unit: { one: 5, other: "posts" } }, marks: [] })).toThrow(
      new TypeError("renderChart: y.unit.one must be a string"),
    );
    expect(() =>
      build({ x: {}, marks: [{ mark: "dot", unit: { few: Symbol("a"), other: "x" }, rows: [] }] }),
    ).toThrow(new TypeError("renderChart: marks[0].unit.few must be a string"));
    expect(() =>
      build({ x: {}, y: { unit: { single: "post", other: "posts" } }, marks: [] }),
    ).toThrow(
      new TypeError(
        "renderChart: y.unit.single is no plural form; a unit takes zero, one, two, few, many and other",
      ),
    );
    const forms = { zero: "a", one: "b", two: "c", few: "d", many: "e", other: "f" };
    expect(build({ x: {}, y: { unit: forms }, marks: [line([1])] }).kind).toBe("line");
  });

  it("names the format Intl refuses and the most px a height may be", () => {
    expect(() => build({ x: {}, y: { format: { style: "unit", unit: "" } }, marks: [] })).toThrow(
      /^renderChart: y\.format holds options Intl refuses/u,
    );
    expect(() => build({ x: {}, y: { format: { style: "currency" } }, marks: [] })).toThrow(
      new TypeError(
        "renderChart: y.format holds options Intl refuses: Currency code is required with currency style.",
      ),
    );
    expect(() => build({ x: {}, height: 40_001, marks: [] })).toThrow(
      new RangeError("renderChart: height must be a number of px above 0 and at most 40000"),
    );
    expect(build({ x: {}, height: 40_000, marks: [line([1])] }).spec.height).toBe(40_000);
  });

  it("names the most rows a plot and the most weeks a calendar may hold", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}`);
    const bars = (n: number): Mark => ({
      mark: "bar",
      y: names(n),
      series: [{ name: "a", x: names(n).map(() => 1) }],
    });
    expect(() => build({ marks: [bars(1_001)] })).toThrow(
      new RangeError("renderChart: marks[0].y must name at most 1000 rows"),
    );
    expect(build({ marks: [bars(1_000)] }).kind).toBe("bar");
    const rows = (n: number): Mark => ({
      mark: "dot",
      rows: names(n).map((name) => ({ name, x: [] })),
    });
    expect(() => build({ x: {}, marks: [rows(1_001)] })).toThrow(
      new RangeError("renderChart: marks[0].rows must hold at most 1000 rows"),
    );
    expect(build({ x: {}, marks: [rows(1_000)] }).kind).toBe("timeline");
    const grid = (n: number): Mark => ({
      mark: "cell",
      x: names(n),
      y: names(1),
      values: [names(n).map(() => 1)],
    });
    expect(build({ marks: [grid(1_001)] }).kind).toBe("heatmap");
    expect(() =>
      build({
        marks: [{ mark: "cell", x: ["a"], y: names(1_001), values: names(1_001).map(() => [1]) }],
      }),
    ).toThrow(new RangeError("renderChart: marks[0].y must name at most 1000 rows"));
    // 1 January 1970 was a Thursday, so with weeks from Thursday 7,000 days are 1,000 weeks.
    const days = (n: number): Mark => ({
      mark: "cell",
      weekStart: 4,
      days: { start: 0, values: Array.from({ length: n }, () => 1) },
    });
    expect(() => build({ marks: [days(7_001)] })).toThrow(
      new RangeError("renderChart: the days of a calendar must fit in 1000 weeks"),
    );
    expect(build({ marks: [days(7_000)] }).kind).toBe("calendar");
  });

  // A series of bars standing apart or of boxes takes a sub-row of each row.
  it("names the most sub-rows a band's series may take, and the most series a slope names", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}`);
    const ones = (n: number) => names(n).map(() => 1);
    const bars = (n: number, k: number, arrange: "group" | "split" | "stack"): Mark => ({
      mark: "bar",
      y: names(n),
      arrange,
      series: names(k).map((name) => ({ name, x: ones(n) })),
    });
    const boxes = (n: number, k: number): Mark => {
      const v = ones(n);
      return {
        mark: "box",
        y: names(n),
        series: names(k).map((name) => ({ name, low: v, q1: v, median: v, q3: v, high: v })),
      };
    };
    const subRows = new RangeError(
      "renderChart: marks[0].series must take at most 2500 sub-rows, a sub-row per series in each row, since the plot is as tall as its rows",
    );
    for (const mark of [bars(1_000, 3, "group"), bars(1_000, 3, "split"), boxes(1_000, 3)]) {
      expect(() => build({ marks: [mark] })).toThrow(subRows);
    }
    expect(build({ marks: [bars(1_000, 2, "group")] }).kind).toBe("groupedBar");
    expect(build({ marks: [bars(1_000, 3, "stack")] }).kind).toBe("stackedBar");
    expect(build({ marks: [boxes(1_000, 2)] }).kind).toBe("box");
    const ends = (k: number): Mark => ({
      mark: "slope",
      x: ["2005", "2015"],
      series: Array.from({ length: k }, (_, s) => ({
        name: `s${String(s)}`,
        slot: 1,
        y: [s, s + 1],
      })),
    });
    expect(() => build({ marks: [ends(1_001)] })).toThrow(
      new RangeError(
        "renderChart: marks[0].series must hold at most 1000 series, since each end names every series on a line of its own",
      ),
    );
    expect(build({ marks: [ends(1_000)] }).kind).toBe("slope");
  });

  it("names the field that takes a spec past a million values", () => {
    const zeros = (n: number) => new Array<number>(n).fill(0);
    const past = (field: string) =>
      new RangeError(
        `renderChart: ${field} must not take the spec past 1000000 values, its samples, bars, dots, cells, parts, rules and notes together`,
      );
    const lines = (n: number, k: number): Mark => ({
      mark: "line",
      x: Array.from({ length: n }, (_, i) => i),
      series: Array.from({ length: k }, (_, s) => ({ name: `s${String(s)}`, y: zeros(n) })),
    });
    expect(build({ x: {}, marks: [lines(500_000, 2)] }).kind).toBe("line");
    expect(() => build({ x: {}, marks: [lines(333_334, 3)] })).toThrow(
      past("marks[0].series[2].y"),
    );
    expect(() =>
      build({ x: {}, marks: [lines(500_000, 2), { mark: "rule", y: 0, label: "Zero" }] }),
    ).toThrow(past("marks[1]"));
    const timeline = (last: number): Mark => ({
      mark: "dot",
      rows: [
        { name: "a", x: zeros(600_000) },
        { name: "b", x: zeros(last) },
      ],
    });
    expect(build({ x: {}, marks: [timeline(400_000)] }).kind).toBe("timeline");
    expect(() => build({ x: {}, marks: [timeline(400_001)] })).toThrow(past("marks[0].rows[1].x"));
  });

  it("counts a series with no samples as one value", () => {
    const empty = (k: number): Mark => ({
      mark: "line",
      x: [],
      series: Array.from({ length: k }, (_, s) => ({
        name: `s${String(s)}`,
        slot: ((s % 9) + 1) as Slot,
        y: [],
      })),
    });
    expect(build({ x: {}, marks: [empty(1_000_000)] }).kind).toBe("line");
    expect(() => build({ x: {}, marks: [empty(1_000_001)] })).toThrow(
      new RangeError(
        "renderChart: marks[0].series[1000000].y must not take the spec past 1000000 values, its samples, bars, dots, cells, parts, rules and notes together",
      ),
    );
    const scatter: Mark = {
      mark: "scatter",
      series: Array.from({ length: 1_000_001 }, (_, s) => ({
        name: `s${String(s)}`,
        slot: ((s % 9) + 1) as Slot,
        x: [],
        y: [],
        names: [],
      })),
    };
    expect(() => build({ x: {}, marks: [scatter] })).toThrow("marks[0].series[1000000].names");
  });

  it("builds a stack whose x is an array-like of any length", () => {
    for (const length of [-1, Number.NaN]) {
      const area = build({ x: {}, marks: [{ mark: "area", x: { length }, series: [] }] });
      expect(area.marks[0]).toMatchObject({ kind: "area", totals: [] });
    }
    const bars = build({
      x: {},
      marks: [{ mark: "rect", x1: { length: -1 }, x2: { length: -1 }, series: [] }],
    });
    expect(bars.marks[0]).toMatchObject({ kind: "rect", totals: [] });
    const one = build({
      x: {},
      marks: [
        {
          mark: "area",
          x: { length: 1.9, 0: 0 },
          series: [{ name: "a", y: { length: 1.9, 0: 5 } }],
        },
      ],
    });
    expect(one.marks[0]).toMatchObject({ kind: "area", totals: [5] });
  });

  it("names the rule it breaks", () => {
    expect(() => build({ x: {}, marks: [line([1, 2], { x: [0, 0] })] })).toThrow(
      "renderChart: marks[0].x must strictly increase",
    );
  });

  it("names the one-data-mark rule a second data mark breaks", () => {
    expect(() =>
      build({ x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }, line([1]), rect([1])] }),
    ).toThrow(
      "renderChart: marks[2] is a second data mark beside marks[1]; a chart holds one rect, line, area, dot, bar, point, slope, scatter, cell, box, pie or tree mark and any rules and text marks",
    );
  });

  it("takes text marks beside its one data mark, as rules", () => {
    const m = build({
      x: {},
      marks: [note({ x: 0, y: 1 }), rect([1, 2]), note({ x: 1.5, y: 2, side: "left" })],
    });
    expect(m.kind).toBe("column");
    expect(m.marks[0]).toEqual({
      kind: "text",
      x: 0,
      y: 1,
      row: false,
      text: "Deploy",
      side: "above",
    });
    expect(m.marks[2]).toMatchObject({ x: 1.5, y: 2, side: "left" });
  });

  it("places a note in a timeline's row by its index", () => {
    const m = build({
      x: { type: "time" },
      marks: [
        {
          mark: "dot",
          rows: [
            { name: "ana", x: [0] },
            { name: "bo", x: [1] },
          ],
        },
        note({ x: 1, y: "bo" }),
      ],
    });
    expect(m.marks[1]).toMatchObject({ x: 1, y: 1, row: true });
  });

  it("is empty with notes and no data", () => {
    expect(build({ x: {}, marks: [rect([0]), note({ x: 0.5, y: 0 })] }).empty).toBe(true);
  });

  it("takes one data mark among any number of rules", () => {
    expect(() =>
      build({
        x: {},
        marks: [
          { mark: "rule", y: 1, label: "Floor" },
          rect([1]),
          { mark: "rule", y: 2, label: "Cap" },
        ],
      }),
    ).not.toThrow();
  });

  it("takes tied dot times and a NaN y as a gap", () => {
    const m = build({
      x: {},
      marks: [line([1, Number.NaN, 3]), { mark: "rule", y: 2, label: "Mid" }],
    });
    const first = m.marks[0];
    expect(first?.kind === "line" ? first.series[0]?.y : undefined).toEqual([1, null, 3]);
    expect(() =>
      build({ x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [1, 1, 2] }] }] }),
    ).not.toThrow();
  });
});

describe("the chart's kind", () => {
  it.each<[string, ChartSpec, string | undefined]>([
    [
      "two series of rects",
      {
        x: {},
        marks: [
          rect([1], {
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "stackedColumn",
    ],
    ["one series of rects", { x: {}, marks: [rect([1])] }, "column"],
    [
      "two series of rects grouped",
      {
        x: {},
        marks: [
          rect([1], {
            arrange: "group",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "groupedColumn",
    ],
    ["one series of rects grouped", { x: {}, marks: [rect([1], { arrange: "group" })] }, "column"],
    [
      "two series of rects stacked to 100%",
      {
        x: {},
        marks: [
          rect([1], {
            arrange: "share",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "shareColumn",
    ],
    [
      "two series of rects grouped on a log x",
      {
        x: { type: "log" },
        marks: [
          rect([1], {
            x1: [1],
            x2: [2],
            arrange: "group",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "histogram",
    ],
    ["one series of rects as area", { x: {}, marks: [rect([1], { shape: "area" })] }, "area"],
    [
      "two series of rects as area",
      {
        x: {},
        marks: [
          rect([1], {
            shape: "area",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "stackedArea",
    ],
    [
      "two series of rects as area stacked to 100%",
      {
        x: {},
        marks: [
          rect([1], {
            shape: "area",
            arrange: "share",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "shareArea",
    ],
    [
      "rects as area on a log x",
      { x: { type: "log" }, marks: [rect([1], { x1: [1], x2: [2], shape: "area" })] },
      "histogram",
    ],
    [
      "rects on a log x",
      { x: { type: "log" }, marks: [rect([1], { x1: [1], x2: [2] })] },
      "histogram",
    ],
    ["one area series", { x: {}, marks: [area([[1]])] }, "area"],
    ["two area series", { x: {}, marks: [area([[1], [2]])] }, "stackedArea"],
    [
      "two stepped area series",
      { x: {}, marks: [area([[1], [2]], { curve: "step" })] },
      "stackedArea",
    ],
    [
      "two area series stacked to 100%",
      { x: {}, marks: [area([[1], [2]], { arrange: "share" })] },
      "shareArea",
    ],
    ["a line with no curve", { x: {}, marks: [line([1])] }, "line"],
    ["a step line", { x: {}, marks: [line([1], { curve: "step" })] }, "step"],
    ["dot rows", { x: {}, marks: [{ mark: "dot", rows: [] }] }, "timeline"],
    ["rules alone", { x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }] }, undefined],
  ])("%s is %s", (_, spec, kind) => {
    expect(build(spec).kind).toBe(kind);
  });
});

describe("empty", () => {
  it.each<[string, ChartSpec, boolean]>([
    ["every value null", { x: {}, marks: [line([null, Number.NaN])] }, true],
    ["every rect 0", { x: {}, marks: [rect([0, null, 0])] }, true],
    ["every row empty", { x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [] }] }] }, true],
    [
      "dots only outside the domain",
      { x: { domain: [0, 1] }, marks: [{ mark: "dot", rows: [{ name: "a", x: [5] }] }] },
      true,
    ],
    ["rules alone", { x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }] }, true],
    ["one rect above 0", { x: {}, marks: [rect([0, 1])] }, false],
    ["one line value", { x: {}, marks: [line([null, 0])] }, false],
    [
      "every area sample 0 or a gap",
      {
        x: {},
        marks: [
          area([
            [0, 1],
            [0, null],
          ]),
        ],
      },
      true,
    ],
    [
      "one whole area stack above 0",
      {
        x: {},
        marks: [
          area([
            [0, 1],
            [0, 2],
          ]),
        ],
      },
      false,
    ],
  ])("%s: %s", (_, spec, empty) => {
    expect(build(spec).empty).toBe(empty);
  });
});

describe("a rect stacked to 100%", () => {
  const two = (a: (number | null)[], b: (number | null)[], more = {}) =>
    rect(a, {
      arrange: "share",
      series: [
        { name: "a", y: a },
        { name: "b", y: b },
      ],
      ...more,
    });

  it("draws each value's share of its bucket, nothing where the total is 0", () => {
    const m = build({ x: {}, marks: [two([1, 0, null], [3, 0, 2])] });
    const r = m.marks[0];
    if (r?.kind !== "rect") {
      throw new Error("not a rect");
    }
    const [a, b] = r.series;
    expect([0, 1, 2].map((i) => (a === undefined ? -1 : drawnValue(r, a, i)))).toEqual([
      0.25, 0, 0,
    ]);
    expect([0, 1, 2].map((i) => (b === undefined ? -1 : drawnValue(r, b, i)))).toEqual([
      0.75, 0, 1,
    ]);
  });

  it("keeps the values, writing shares in percent and amounts as numbers", () => {
    const m = build({ x: {}, marks: [two([1500], [500])] });
    expect(m.marks[0]?.kind === "rect" ? m.marks[0].series[0]?.y : undefined).toEqual([1500]);
    expect(m.yText(0.75)).toBe("75%");
    expect(m.amountText(1500)).toBe("1,500");
  });

  it("writes shares in the app's y format when it passes one", () => {
    const m = build({
      x: {},
      y: { format: { style: "percent", maximumFractionDigits: 1 } },
      marks: [two([1], [2])],
    });
    expect(m.yText(1 / 3)).toBe("33.3%");
  });

  it("names the rule a share of one series breaks", () => {
    expect(() => build({ x: {}, marks: [rect([1], { arrange: "share" })] })).toThrow(
      'renderChart: marks[0].arrange "share" needs two or more series, since one reads 100% everywhere',
    );
  });
});

describe("an area stacked to 100%", () => {
  const shared = (series: readonly (readonly (number | null)[])[]) => {
    const m = build({ x: {}, marks: [area(series, { arrange: "share" })] });
    const a = m.marks[0];
    if (a?.kind !== "area") {
      throw new Error("not an area");
    }
    return { m, a };
  };

  it("draws each value's share of its sample, no stack where the total is 0 or a series is a gap", () => {
    const { a } = shared([
      [1, 0, 2, 4],
      [3, 0, null, 4],
    ]);
    const [s0, s1] = a.series;
    expect([0, 1, 2, 3].map((i) => drawnTotal(a, i))).toEqual([4, null, null, 8]);
    expect([0, 1, 2, 3].map((i) => (s0 === undefined ? -1 : sampleValue(a, s0, i)))).toEqual([
      0.25,
      null,
      null,
      0.5,
    ]);
    expect([0, 1, 2, 3].map((i) => (s1 === undefined ? -1 : sampleValue(a, s1, i)))).toEqual([
      0.75,
      null,
      null,
      0.5,
    ]);
  });

  it("keeps a stack of 0 drawn, at its values, when not stacked to 100%", () => {
    const m = build({
      x: {},
      marks: [
        area([
          [0, 1],
          [0, 1],
        ]),
      ],
    });
    const a = m.marks[0];
    if (a?.kind !== "area") {
      throw new Error("not an area");
    }
    expect(drawnTotal(a, 0)).toBe(0);
    expect(a.series[0] === undefined ? -1 : sampleValue(a, a.series[0], 1)).toBe(1);
  });

  it("keeps the values, writing shares in percent and amounts as numbers", () => {
    const { m, a } = shared([[1500], [500]]);
    expect(a.series[0]?.y).toEqual([1500]);
    expect(m.y).toMatchObject({ lo: 0, hi: 1, passed: true });
    expect(m.yText(0.75)).toBe("75%");
    expect(m.amountText(1500)).toBe("1,500");
  });

  it("names the rule a share of one series breaks", () => {
    expect(() => build({ x: {}, marks: [area([[1]], { arrange: "share" })] })).toThrow(
      'renderChart: marks[0].arrange "share" needs two or more series, since one reads 100% everywhere',
    );
    expect(() =>
      build({ x: {}, marks: [area([[1], [2]], { arrange: "group" as "stack" })] }),
    ).toThrow('renderChart: marks[0].arrange must be "stack" or "share"');
  });
});

const bars = (
  values: readonly (number | null)[],
  more: Partial<Extract<Mark, { mark: "bar" }>> = {},
): Mark => ({
  mark: "bar",
  y: values.map((_, i) => `c${String(i)}`),
  series: [{ name: "a", x: values }],
  ...more,
});

const shareBars = (
  a: (number | null)[],
  b: (number | null)[],
  more: Partial<Extract<Mark, { mark: "bar" }>> = {},
): Mark => ({
  mark: "bar",
  y: a.map((_, i) => `c${String(i)}`),
  arrange: "share",
  series: [
    { name: "p", x: a },
    { name: "q", x: b },
  ],
  ...more,
});

describe("the bar mark", () => {
  it.each([
    ["a y of numbers", { x: {}, marks: [bars([1], { y: [1] as unknown as string[] })] }, TypeError],
    [
      "a series without x",
      { x: {}, marks: [{ mark: "bar", y: ["a"], series: [{ name: "a" }] }] },
      TypeError,
    ],
    ["an x shorter than its y", { x: {}, marks: [bars([1], { y: ["a", "b"] })] }, TypeError],
    [
      "labels that are not a boolean",
      { x: {}, marks: [bars([1], { labels: 1 as unknown as boolean })] },
      TypeError,
    ],
    [
      "an arrange it does not draw",
      { x: {}, marks: [bars([1], { arrange: "side" as "stack" })] },
      TypeError,
    ],
    ["an empty name", { x: {}, marks: [bars([1], { y: [""] })] }, RangeError],
    ["a repeated name", { x: {}, marks: [bars([1, 2], { y: ["a", "a"] })] }, RangeError],
    ["an infinite x", { x: {}, marks: [bars([Number.POSITIVE_INFINITY])] }, RangeError],
    ["a log x", { x: { type: "log" }, marks: [bars([1])] }, TypeError],
    ["a time x", { x: { type: "time" }, marks: [bars([1])] }, TypeError],
    ["zero false", { x: { zero: false }, marks: [bars([1])] }, TypeError],
    ["an x domain without 0", { x: { domain: [1, 5] }, marks: [bars([2])] }, RangeError],
    ["a linear y", { x: {}, y: { type: "linear" }, marks: [bars([1])] }, TypeError],
    ["a y domain", { x: {}, y: { domain: [0, 1] }, marks: [bars([1])] }, TypeError],
    ["a height", { x: {}, height: 200, marks: [bars([1])] }, TypeError],
    [
      "a height under dot rows",
      { x: {}, height: 200, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    ["a y rule", { x: {}, marks: [bars([1]), { mark: "rule", y: 1, label: "Cap" }] }, TypeError],
    ["a bar beside a rect", { x: {}, marks: [rect([1]), bars([1])] }, TypeError],
    ["a share of one series", { x: {}, marks: [bars([1], { arrange: "share" })] }, TypeError],
    ["labels under a share", { x: {}, marks: [shareBars([1], [2], { labels: true })] }, TypeError],
    [
      "labels off under a share",
      { x: {}, marks: [shareBars([1], [2], { labels: false })] },
      TypeError,
    ],
    ["a negative x under a share", { x: {}, marks: [shareBars([1], [-2])] }, RangeError],
    [
      "a negative x under a split",
      { x: {}, marks: [shareBars([1], [-2], { arrange: "split" })] },
      RangeError,
    ],
    [
      "a negative x under a split of one series",
      { x: {}, marks: [bars([1, -2], { arrange: "split" })] },
      RangeError,
    ],
    [
      "a below slot that is not a number",
      {
        x: {},
        marks: [
          { mark: "bar", y: ["a"], series: [{ name: "a", below: "2" as unknown as 2, x: [-1] }] },
        ],
      },
      TypeError,
    ],
    [
      "a below slot of 10",
      {
        x: {},
        marks: [{ mark: "bar", y: ["a"], series: [{ name: "a", below: 10 as 2, x: [-1] }] }],
      },
      RangeError,
    ],
    [
      "a below slot beside another series",
      {
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["a"],
            series: [
              { name: "p", x: [1] },
              { name: "q", below: 3, x: [-2] },
            ],
          },
        ],
      },
      TypeError,
    ],
    [
      "an x domain under a share",
      { x: { domain: [0, 1] }, marks: [shareBars([1], [2])] },
      TypeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the height rule", () => {
    expect(() => build({ x: {}, height: 200, marks: [bars([1])] })).toThrow(
      "renderChart: height has no place on a dot, bar, point or box chart, which is as tall as its rows",
    );
  });

  it("keeps the app's order on a band y, its values, and gaps as null", () => {
    const m = build({
      x: {},
      marks: [bars([3, null, Number.NaN, 1], { y: ["d", "b", "c", "a"] })],
    });
    expect(m.y).toEqual({ type: "band", rows: ["d", "b", "c", "a"], mono: false });
    expect(m.marks[0]).toEqual({
      kind: "bar",
      arrange: "stack",
      left: 0,
      centre: false,
      labels: true,
      series: [{ name: "a", slot: 1, below: 1, x: [3, null, null, 1] }],
    });
    expect(m.kind).toBe("bar");
  });

  it("is a stacked bar chart from two series, with labels off when asked", () => {
    const m = build({
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["a"],
          labels: false,
          series: [
            { name: "p", x: [1] },
            { name: "q", slot: 4, x: [2] },
          ],
        },
      ],
    });
    expect(m.kind).toBe("stackedBar");
    expect(m.marks[0]).toMatchObject({ labels: false, series: [{ slot: 1 }, { slot: 4 }] });
  });

  it("is a grouped bar chart from two series, and a plain one grouped with one", () => {
    const two = (n: number): Mark => ({
      mark: "bar",
      y: ["a"],
      arrange: "group",
      series: [
        { name: "p", x: [1] },
        { name: "q", x: [2] },
      ].slice(0, n),
    });
    expect(build({ x: {}, marks: [two(2)] })).toMatchObject({
      kind: "groupedBar",
      marks: [{ arrange: "group" }],
    });
    expect(build({ x: {}, marks: [two(1)] })).toMatchObject({
      kind: "bar",
      marks: [{ arrange: "stack" }],
    });
  });

  it("is a split bar chart from two series with value labels, and a plain one split with one", () => {
    expect(
      build({ x: {}, marks: [shareBars([1, 0], [3, 0], { arrange: "split" })] }),
    ).toMatchObject({ kind: "splitBar", marks: [{ arrange: "split", labels: true }] });
    expect(build({ x: {}, marks: [bars([1], { arrange: "split" })] })).toMatchObject({
      kind: "bar",
      marks: [{ arrange: "stack" }],
    });
  });

  it("names the arrangements a bar draws", () => {
    expect(() => build({ x: {}, marks: [bars([1], { arrange: "side" as "stack" })] })).toThrow(
      'renderChart: marks[0].arrange must be "stack", "group", "share", "split", "diverge" or "mirror"',
    );
  });

  it("is a back-to-back bar chart from exactly two series, with value labels", () => {
    const pyramid = shareBars([1, 2], [3, 4], { arrange: "mirror" });
    const m = build({ x: {}, marks: [pyramid] });
    expect(m.kind).toBe("mirrorBar");
    expect(m.marks[0]).toMatchObject({ arrange: "mirror", labels: true });
    expect(build({ x: {}, marks: [{ ...pyramid, labels: false }] }).marks[0]).toMatchObject({
      labels: false,
    });
    for (const series of [
      [{ name: "a", x: [1, 2] }],
      [0, 1, 2].map((k) => ({ name: `s${String(k)}`, x: [1, 2] })),
    ]) {
      expect(() => build({ x: {}, marks: [{ ...pyramid, series }] })).toThrow(
        'renderChart: marks[0].arrange "mirror" needs exactly two series, one each side of its spine',
      );
    }
    expect(() => build({ x: {}, marks: [shareBars([1], [-2], { arrange: "mirror" })] })).toThrow(
      "renderChart: a mirrored bar's x cannot be negative",
    );
  });

  const likert = (more: Partial<Extract<Mark, { mark: "bar" }>> = {}, count = 5): Mark => ({
    mark: "bar",
    y: ["Item 1"],
    arrange: "diverge",
    left: 2,
    centre: true,
    series: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
      .slice(0, count)
      .map((name, k) => ({ name, x: [10 + k] })),
    ...more,
  });

  it("is a diverging stacked bar chart, its left count and centre in the model, no value labels", () => {
    const m = build({ x: {}, marks: [likert()] });
    expect(m.kind).toBe("divergingStackedBar");
    expect(m.marks[0]).toMatchObject({ arrange: "diverge", left: 2, centre: true, labels: false });
    expect(build({ x: {}, marks: [likert({ centre: false })] }).marks[0]).toMatchObject({
      left: 2,
      centre: false,
    });
  });

  it("refuses left and centre outside diverge, and labels under it", () => {
    expect(() => build({ x: {}, marks: [bars([1], { left: 1 })] })).toThrow(
      'renderChart: marks[0].left has no place outside arrange "diverge"',
    );
    expect(() => build({ x: {}, marks: [bars([1], { centre: true })] })).toThrow(
      'renderChart: marks[0].centre has no place outside arrange "diverge"',
    );
    expect(() =>
      build({ x: {}, marks: [likert({ centre: "yes" as unknown as boolean })] }),
    ).toThrow("renderChart: marks[0].centre must be a boolean");
    for (const labels of [true, false]) {
      expect(() => build({ x: {}, marks: [likert({ labels })] })).toThrow(
        'renderChart: marks[0].labels has no place under arrange "diverge", whose bars run either side of 0',
      );
    }
  });

  it("needs a series each side of 0, and a third to straddle it with centre", () => {
    expect(() => build({ x: {}, marks: [likert({ centre: false, left: 1 }, 1)] })).toThrow(
      'renderChart: marks[0].arrange "diverge" needs two or more series, one each side of 0',
    );
    expect(() => build({ x: {}, marks: [likert({ left: 1 }, 2)] })).toThrow(
      'renderChart: marks[0].arrange "diverge" with centre needs three or more series: left, centre and right',
    );
  });

  it("needs left, a whole number leaving a right series and the centre one", () => {
    const { left: _, ...none } = likert() as Extract<Mark, { mark: "bar" }>;
    expect(() => build({ x: {}, marks: [none] })).toThrow(TypeError);
    expect(() => build({ x: {}, marks: [likert({ left: "2" as unknown as number })] })).toThrow(
      'renderChart: marks[0].left must be a number: how many series lie left of 0 under arrange "diverge"',
    );
    for (const left of [0, 1.5, 4]) {
      expect(() => build({ x: {}, marks: [likert({ left })] })).toThrow(
        "renderChart: marks[0].left must be a whole number from 1 to 3, leaving a series to straddle 0 and one right of 0",
      );
    }
    expect(() => build({ x: {}, marks: [likert({ left: 5, centre: false })] })).toThrow(
      "renderChart: marks[0].left must be a whole number from 1 to 4, leaving a series right of 0",
    );
    expect(build({ x: {}, marks: [likert({ left: 3 })] }).kind).toBe("divergingStackedBar");
    expect(build({ x: {}, marks: [likert({ left: 4, centre: false })] }).kind).toBe(
      "divergingStackedBar",
    );
  });

  it("is a 100% stacked bar chart from two series, with no value labels", () => {
    const m = build({ x: {}, marks: [shareBars([1, 0], [3, 0])] });
    expect(m.kind).toBe("shareBar");
    expect(m.marks[0]).toMatchObject({ arrange: "share", labels: false });
    expect(m.amountText(1234.5)).toBe("1,234.5");
  });

  it("is a diverging bar chart from one series with a value below 0, signing every value but 0", () => {
    const m = build({
      x: { format: "percent" },
      marks: [
        {
          mark: "bar",
          y: ["a", "b"],
          series: [{ name: "Change", slot: 2, below: 5, x: [0.16, -0.143] }],
        },
      ],
    });
    expect(m.kind).toBe("divergingBar");
    expect(m.marks[0]).toMatchObject({ series: [{ slot: 2, below: 5 }] });
    expect([m.xText(0.16), m.xText(-0.143), m.xText(0)]).toEqual(["+16%", "-14%", "0%"]);
    expect(m.amountText(0.16)).toBe("+16%");
  });

  it("stays a bar chart, unsigned, with no value below 0 or with two series", () => {
    const plain = build({ x: { format: "percent" }, marks: [bars([0.16, 0, null])] });
    expect(plain.kind).toBe("bar");
    expect(plain.xText(0.16)).toBe("16%");
    const two = build({
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["a"],
          series: [
            { name: "p", x: [3] },
            { name: "q", x: [-2] },
          ],
        },
      ],
    });
    expect(two.kind).toBe("stackedBar");
    expect(two.xText(3)).toBe("3");
  });

  it("is empty when every value is 0 or a gap, or there are no rows", () => {
    expect(build({ x: {}, marks: [bars([0, null])] }).empty).toBe(true);
    expect(build({ x: {}, marks: [bars([])] }).empty).toBe(true);
    expect(build({ x: {}, marks: [bars([0, 2])] }).empty).toBe(false);
  });

  it("takes a note on a row by its name and an x rule", () => {
    const m = build({
      x: {},
      marks: [
        bars([1, 2]),
        { mark: "rule", x: 1.5, label: "Target" },
        { mark: "text", x: 2, y: "c1", text: "Best" },
      ],
    });
    expect(m.marks[2]).toMatchObject({ kind: "text", x: 2, y: 1, row: true });
    expect(() =>
      build({ x: {}, marks: [bars([1]), { mark: "text", x: 1, y: "zz", text: "No" }] }),
    ).toThrow(RangeError);
  });
});

const points = (
  series: readonly (readonly (number | null)[])[],
  more: Partial<Extract<Mark, { mark: "point" }>> = {},
): Mark => ({
  mark: "point",
  y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
  series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
  ...more,
});

describe("the point mark", () => {
  it.each([
    [
      "a y of numbers",
      { x: {}, marks: [points([[1]], { y: [1] as unknown as string[] })] },
      TypeError,
    ],
    [
      "a series without x",
      { x: {}, marks: [{ mark: "point", y: ["a"], series: [{ name: "a" }] }] },
      TypeError,
    ],
    ["an x shorter than its y", { x: {}, marks: [points([[1]], { y: ["a", "b"] })] }, TypeError],
    ["an empty name", { x: {}, marks: [points([[1]], { y: [""] })] }, RangeError],
    ["a repeated name", { x: {}, marks: [points([[1, 2]], { y: ["a", "a"] })] }, RangeError],
    ["an infinite x", { x: {}, marks: [points([[Number.NEGATIVE_INFINITY]])] }, RangeError],
    ["a value of 0 on a log x", { x: { type: "log" }, marks: [points([[0, 4]])] }, RangeError],
    ["a band x", { x: { type: "band" }, marks: [points([[1]])] }, TypeError],
    ["zero on a log x", { x: { type: "log", zero: true }, marks: [points([[1]])] }, TypeError],
    ["zero on a time x", { x: { type: "time", zero: false }, marks: [points([[1]])] }, TypeError],
    ["a linear y", { x: {}, y: { type: "linear" }, marks: [points([[1]])] }, TypeError],
    ["a height", { x: {}, height: 200, marks: [points([[1]])] }, TypeError],
    [
      "a y rule",
      { x: {}, marks: [points([[1]]), { mark: "rule", y: 1, label: "Cap" }] },
      TypeError,
    ],
    ["a point beside a bar", { x: {}, marks: [bars([1]), points([[1]])] }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ x: { type: "log", zero: true }, marks: [points([[1]])] })).toThrow(
      "renderChart: a log x has no zero to hold",
    );
    expect(() => build({ x: { type: "log" }, marks: [points([[-1, 4]])] })).toThrow(
      "renderChart: a point's x must be above 0 on a log x",
    );
    expect(() => build({ x: {}, marks: [{ mark: "plot" }] })).toThrow(
      'renderChart: marks[0].mark must be "rect", "line", "area", "dot", "bar", "point", "slope", "scatter", "cell", "box", "pie", "tree", "rule" or "text"',
    );
  });

  it("keeps the app's order on a band y, its values and slots, and gaps as null", () => {
    const m = build({
      x: {},
      marks: [
        {
          mark: "point",
          y: ["Holy See", "Monaco", "Japan"],
          series: [
            { name: "Female", x: [60.4, Number.NaN, 51.1] },
            { name: "Male", slot: 5, x: [54.5, 53.1, null] },
          ],
        },
      ],
    });
    expect(m.y).toEqual({ type: "band", rows: ["Holy See", "Monaco", "Japan"], mono: false });
    expect(m.marks[0]).toEqual({
      kind: "point",
      series: [
        { name: "Female", slot: 1, x: [60.4, null, 51.1] },
        { name: "Male", slot: 5, x: [54.5, 53.1, null] },
      ],
    });
    expect(m.kind).toBe("dotPlot");
    expect(m.amountText(51.1)).toBe("51.1");
  });

  it("is empty when every value is a gap or outside the domain", () => {
    expect(build({ x: {}, marks: [points([[null, null]])] }).empty).toBe(true);
    expect(build({ x: {}, marks: [points([])] }).empty).toBe(true);
    expect(build({ x: { domain: [10, 20] }, marks: [points([[5, 25]])] }).empty).toBe(true);
    expect(build({ x: { domain: [10, 20] }, marks: [points([[5, 20]])] }).empty).toBe(false);
    expect(build({ x: {}, marks: [points([[0, null]])] }).empty).toBe(false);
  });

  it("writes instants on a time x", () => {
    const at = Date.UTC(2026, 10, 11, 8);
    const m = build({ x: { type: "time" }, marks: [points([[at, at + 3_600_000]])] });
    expect(m.amountText(at)).toBe(m.xText(at));
    expect(m.xText(at)).toContain("8:00");
  });
});

describe("a point mark's link", () => {
  const two = [
    [128_700, 29_100, null],
    [163_500, 43_350, 50],
  ];

  it.each([
    ["a link it does not draw", { link: "line" }, [[1], [2]]],
    ["a range of one series", { link: "range" }, [[1]]],
    ["an arrow of three series", { link: "arrow" }, [[1], [2], [3]]],
  ] as const)("refuses %s", (_, more, series) => {
    expect(() => build({ x: {}, marks: [points(series, more as never)] })).toThrow(TypeError);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ x: {}, marks: [points([[1]], { link: "range" })] })).toThrow(
      'renderChart: marks[0].link "range" needs exactly two series, the two ends it joins',
    );
    expect(() =>
      build({ x: {}, marks: [points([[1], [2]], { link: "dumbbell" as "range" })] }),
    ).toThrow('renderChart: marks[0].link must be "range" or "arrow"');
  });

  it("keeps the link, names the kind, and gives a range's gap and an arrow's change", () => {
    const range = build({ x: {}, marks: [points(two, { link: "range" })] });
    const arrow = build({ x: {}, marks: [points(two, { link: "arrow" })] });
    const dots = build({ x: {}, marks: [points(two)] });
    expect([range.kind, arrow.kind, dots.kind]).toEqual(["rangePlot", "arrowPlot", "dotPlot"]);
    const [r, a, d] = [range, arrow, dots].map((m) => m.marks[0] as PointModel);
    expect([r?.link, a?.link, d?.link]).toEqual(["range", "arrow", undefined]);
    // A range's gap is the distance either way; an arrow's change keeps its sign.
    const reversed = build({
      x: {},
      marks: [points([[163_500], [128_700]], { link: "range" })],
    }).marks[0] as PointModel;
    expect(pointLink(reversed, 0)).toBe(34_800);
    expect([0, 1, 2].map((i) => pointLink(r as PointModel, i))).toEqual([34_800, 14_250, null]);
    const back = build({ x: {}, marks: [points([[5.8], [2.1]], { link: "arrow" })] });
    expect(pointLink(back.marks[0] as PointModel, 0)).toBeCloseTo(-3.7, 10);
    expect(pointLink(a as PointModel, 2)).toBeNull();
    expect(pointLink(d as PointModel, 0)).toBeNull();
  });
});

describe("rules and notes on bar and point rows", () => {
  const two = (arrange: "split" | "diverge" | "mirror"): Mark => ({
    mark: "bar",
    y: ["c0", "c1"],
    arrange,
    ...(arrange === "diverge" ? { left: 1 } : {}),
    series: [
      { name: "p", x: [1, 2] },
      { name: "q", x: [3, 4] },
    ],
  });
  const goal = (x: number): Mark => ({ mark: "rule", x, label: "Goal" });
  const at = (more: Partial<Extract<Mark, { mark: "text" }>>): Mark => ({
    mark: "text",
    y: "c1",
    text: "Best",
    ...more,
  });

  it.each(["split", "diverge", "mirror"] as const)(
    "refuses a rule below 0 and a note's x under %s",
    (arrange) => {
      expect(() => build({ x: {}, marks: [two(arrange), goal(-1)] })).toThrow(
        `renderChart: a rule under arrange "${arrange}" cannot be below 0`,
      );
      expect(() => build({ x: {}, marks: [two(arrange), at({ x: 2 })] })).toThrow(
        `renderChart: marks[1].x has no place under arrange "${arrange}"; the note sits at its row's end`,
      );
      expect(() => build({ x: {}, marks: [two(arrange), { mark: "text", text: "Best" }] })).toThrow(
        "renderChart: marks[1].y is missing; a note needs a y naming its row on this chart",
      );
    },
  );

  it("sets a note with no x on its row under a split, diverging or mirrored bar", () => {
    for (const arrange of ["split", "diverge", "mirror"] as const) {
      const m = build({ x: {}, marks: [two(arrange), goal(0), at({})] });
      expect(m.marks[2]).toMatchObject({ kind: "text", x: undefined, y: 1, row: true });
    }
    // A split of one series draws a plain bar, and its note still sits at the row's end.
    const one = build({ x: {}, marks: [bars([1, 2], { arrange: "split" }), at({})] });
    expect(one.marks[1]).toMatchObject({ x: undefined, y: 1 });
  });

  it("keeps a rule below 0 beside a stack, whose bars run either way", () => {
    const m = build({ x: {}, marks: [bars([1, -2]), goal(-1)] });
    expect(m.marks[1]).toMatchObject({ place: { at: -1 } });
  });

  it.each([
    ["a bar note without x", [bars([1, 2]), at({})], TypeError],
    ["a point note without x", [points([[1, 2]]), at({})], TypeError],
    ["a point note naming no row", [points([[1, 2]]), at({ x: 1, y: "zz" })], RangeError],
    ["a point note's x as a name", [points([[1, 2]]), at({ x: "c0" })], TypeError],
  ] as const)("refuses %s", (_, marks, type) => {
    expect(() => build({ x: {}, marks: [...marks] })).toThrow(type);
  });

  it("places a point note along its row by its x", () => {
    const m = build({ x: {}, marks: [points([[1, 2]]), at({ x: 1.5 })] });
    expect(m.marks[1]).toMatchObject({ kind: "text", x: 1.5, y: 1, row: true });
  });
});

const slope = (
  series: readonly (readonly (number | null)[])[],
  more: Record<string, unknown> = {},
): Mark =>
  ({
    mark: "slope",
    x: ["2005", "2015"],
    series: series.map((y, k) => ({ name: `s${String(k)}`, y })),
    ...more,
  }) as Mark;

describe("the slope mark", () => {
  it.each([
    ["one column", { marks: [slope([[1, 2]], { x: ["2005"] })] }, TypeError],
    ["three columns", { marks: [slope([[1, 2]], { x: ["a", "b", "c"] })] }, TypeError],
    ["a column of a number", { marks: [slope([[1, 2]], { x: ["2005", 2015] })] }, TypeError],
    ["an empty column name", { marks: [slope([[1, 2]], { x: ["", "2015"] })] }, RangeError],
    ["a repeated column name", { marks: [slope([[1, 2]], { x: ["2005", "2005"] })] }, RangeError],
    ["a series of one value", { marks: [slope([[1]])] }, TypeError],
    ["a series of three values", { marks: [slope([[1, 2, 3]])] }, TypeError],
    [
      "an empty series name",
      { marks: [{ mark: "slope", x: ["a", "b"], series: [{ name: "", y: [1, 2] }] }] },
      RangeError,
    ],
    [
      "a repeated series name",
      {
        marks: [
          {
            mark: "slope",
            x: ["a", "b"],
            series: [
              { name: "Cats", y: [1, 2] },
              { name: "Cats", y: [3, 4] },
            ],
          },
        ],
      },
      RangeError,
    ],
    ["an x scale", { x: {}, marks: [slope([[1, 2]])] }, TypeError],
    ["a log y", { y: { type: "log" }, marks: [slope([[1, 2]])] }, TypeError],
    ["a band y", { y: { type: "band" }, marks: [slope([[1, 2]])] }, TypeError],
    ["an x rule", { marks: [slope([[1, 2]]), { mark: "rule", x: 0, label: "Then" }] }, TypeError],
    ["an infinite value", { marks: [slope([[1, Number.POSITIVE_INFINITY]])] }, RangeError],
    ["a slope beside a line", { x: {}, marks: [line([1, 2]), slope([[1, 2]])] }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ x: {}, marks: [slope([[1, 2]])] })).toThrow(
      "renderChart: a slope takes no x scale; its mark names its two columns",
    );
    expect(() => build({ marks: [slope([[1, 2]], { x: ["2005", "2005"] })] })).toThrow(
      'renderChart: marks[0].x must name two different columns, never ""',
    );
  });

  it("takes its columns from the mark, its values and slots, and gaps as null", () => {
    const m = build({
      marks: [
        {
          mark: "slope",
          x: ["2005", "2015"],
          series: [
            { name: "Cats", y: [50, 34] },
            { name: "Dogs", slot: 4, y: [Number.NaN, 31] },
          ],
        },
        { mark: "rule", y: 40, label: "Target" },
      ],
    });
    expect(m.marks[0]).toEqual({
      kind: "slope",
      columns: ["2005", "2015"],
      series: [
        { name: "Cats", slot: 1, y: [50, 34] },
        { name: "Dogs", slot: 4, y: [null, 31] },
      ],
    });
    expect(m.kind).toBe("slope");
    expect([m.xText(0), m.xText(1)]).toEqual(["2005", "2015"]);
    expect(m.xSpan(0, 1)).toEqual(["2005", "2015"]);
    expect(m.amountText(34)).toBe("34");
  });

  it("is empty when every end is null", () => {
    expect(build({ marks: [slope([[null, null]])] }).empty).toBe(true);
    expect(build({ marks: [slope([[null, 0]])] }).empty).toBe(false);
  });

  it("takes a note naming one of its columns, at that column's x", () => {
    const m = build({
      marks: [slope([[1, 2]]), { mark: "text", x: "2015", y: 2, text: "New high" }],
    });
    expect(m.marks[1]).toMatchObject({ kind: "text", x: 1, y: 2, row: false });
    const note = (x: unknown) =>
      build({ marks: [slope([[1, 2]]), { mark: "text", x, y: 1, text: "a" } as Mark] });
    expect(() => note(1)).toThrow(
      new TypeError("renderChart: marks[1].x must name one of the slope's two columns"),
    );
    expect(() => note("2025")).toThrow(
      new RangeError('renderChart: marks[1].x names no column: "2025"'),
    );
    expect(() => note(undefined)).toThrow(
      new TypeError(
        "renderChart: marks[1].x is missing; a note on a slope names one of its two columns",
      ),
    );
    expect(() =>
      build({ marks: [slope([[1, 2]]), { mark: "text", x: "2005", text: "a" }] }),
    ).toThrow(TypeError);
    expect(() =>
      build({ marks: [slope([[1, 2]]), { mark: "text", x: "2005", y: "a", text: "a" }] }),
    ).toThrow(TypeError);
  });

  it("takes a chart with no x scale for every other mark too", () => {
    expect(build({ marks: [line([1, 2])] }).x).toMatchObject({ type: "linear", lo: 0, hi: 1 });
  });
});

const scatter = (
  series: readonly {
    readonly names: readonly unknown[];
    readonly x: readonly (number | null)[];
    readonly y: readonly (number | null)[];
    readonly r?: readonly (number | null)[];
  }[],
  more: Record<string, unknown> = {},
): Mark =>
  ({
    mark: "scatter",
    series: series.map((s, k) => ({ name: `s${String(k)}`, ...s })),
    ...more,
  }) as Mark;

const measures = { x: { label: "GDP per capita" }, y: { label: "Life expectancy" } };
const one = (x: number | null, y: number | null) => [{ names: ["Japan"], x: [x], y: [y] }];

describe("the scatter mark", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["no x label", { y: { label: "b" }, marks: [scatter(one(1, 2))] }, TypeError],
    ["no y label", { x: { label: "a" }, marks: [scatter(one(1, 2))] }, TypeError],
    ["an empty label", { ...measures, x: { label: "" }, marks: [scatter(one(1, 2))] }, TypeError],
    [
      "names of another length",
      { ...measures, marks: [scatter([{ names: ["a", "b"], x: [1], y: [2] }])] },
      TypeError,
    ],
    [
      "y of another length",
      { ...measures, marks: [scatter([{ names: ["a"], x: [1], y: [2, 3] }])] },
      TypeError,
    ],
    [
      "a name that is not a string",
      { ...measures, marks: [scatter([{ names: [7], x: [1], y: [2] }])] },
      TypeError,
    ],
    [
      "a series with no names",
      { ...measures, marks: [{ mark: "scatter", series: [{ name: "a", x: [1], y: [2] }] }] },
      TypeError,
    ],
    [
      "an empty dot name",
      { ...measures, marks: [scatter([{ names: [""], x: [1], y: [2] }])] },
      RangeError,
    ],
    [
      "a dot name repeated in another series",
      {
        ...measures,
        marks: [
          scatter([
            { names: ["Japan"], x: [1], y: [2] },
            { names: ["Japan"], x: [3], y: [4] },
          ]),
        ],
      },
      RangeError,
    ],
    [
      "a tenth series with no slot",
      {
        ...measures,
        marks: [
          scatter(
            Array.from({ length: 10 }, (_, k) => ({ names: [`d${String(k)}`], x: [1], y: [2] })),
          ),
        ],
      },
      RangeError,
    ],
    [
      "a time x",
      { ...measures, x: { label: "a", type: "time" }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "a time y",
      { ...measures, y: { label: "b", type: "time" }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "a band y",
      { ...measures, y: { label: "b", type: "band" }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "zero on a log x",
      { ...measures, x: { label: "a", type: "log", zero: true }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "zero on a log y",
      { ...measures, y: { label: "b", type: "log", zero: false }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "an infinite x",
      { ...measures, marks: [scatter(one(Number.POSITIVE_INFINITY, 2))] },
      RangeError,
    ],
    [
      "an infinite y",
      { ...measures, marks: [scatter(one(1, Number.NEGATIVE_INFINITY))] },
      RangeError,
    ],
    [
      "an x of 0 on a log x",
      { ...measures, x: { label: "a", type: "log" }, marks: [scatter(one(0, 2))] },
      RangeError,
    ],
    [
      "a negative y on a log y",
      { ...measures, y: { label: "b", type: "log" }, marks: [scatter(one(1, -2))] },
      RangeError,
    ],
    ["a scatter beside a line", { ...measures, marks: [line([1]), scatter(one(1, 2))] }, TypeError],
    [
      "a unit on x",
      { ...measures, x: { label: "a", unit: { other: "dollars" } }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
    [
      "a unit on y",
      { ...measures, y: { label: "b", unit: { other: "years" } }, marks: [scatter(one(1, 2))] },
      TypeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ y: { label: "b" }, marks: [scatter(one(1, 2))] })).toThrow(
      "renderChart: x.label is required on a scatter, whose readings name each measure by it",
    );
    expect(() =>
      build({
        ...measures,
        y: { label: "b", unit: { other: "years" } },
        marks: [scatter(one(1, 2))],
      }),
    ).toThrow(
      "renderChart: y.unit has no place on a scatter, whose readings name each measure by its label; the mark's unit names the dots",
    );
    expect(() =>
      build({
        ...measures,
        marks: [
          scatter([
            { names: ["Japan"], x: [1], y: [2] },
            { names: ["Japan"], x: [3], y: [4] },
          ]),
        ],
      }),
    ).toThrow('renderChart: marks[0] must name each dot once across its series, never ""');
    expect(() =>
      build({ ...measures, x: { label: "a", type: "time" }, marks: [scatter(one(1, 2))] }),
    ).toThrow("renderChart: a scatter's x is linear or log; a value over time is a line");
  });

  it("keeps each series' dots with their slots, gaps as null, and shows those it places", () => {
    const m = build({
      x: { label: "a", domain: [0, 10] },
      y: { label: "b" },
      marks: [
        {
          mark: "scatter",
          unit: { one: "country", other: "countries" },
          series: [
            {
              name: "Europe",
              names: ["Albania", "Andorra", "Austria"],
              x: [2, null, 12],
              y: [8, 9, 7],
            },
            {
              name: "Asia",
              slot: 6,
              names: ["Japan", "Laos"],
              x: [5, Number.NaN],
              y: [Number.NaN, 4],
            },
          ],
        },
      ],
    });
    expect(m.marks[0]).toEqual({
      kind: "scatter",
      unit: { one: "country", other: "countries" },
      series: [
        {
          name: "Europe",
          slot: 1,
          names: ["Albania", "Andorra", "Austria"],
          x: [2, null, 12],
          y: [8, 9, 7],
          r: undefined,
        },
        {
          name: "Asia",
          slot: 6,
          names: ["Japan", "Laos"],
          x: [5, null],
          y: [null, 4],
          r: undefined,
        },
      ],
      // Andorra has no x, Austria lies past the passed x domain, Japan has no y and Laos no x.
      shown: [[0], []],
      size: undefined,
      drawn: [{ series: 0, i: 0 }],
    });
    expect(m.kind).toBe("scatter");
    expect(m.empty).toBe(false);
  });

  it("is empty when no dot has both its values", () => {
    expect(build({ ...measures, marks: [scatter(one(null, 2))] }).empty).toBe(true);
    expect(build({ ...measures, marks: [scatter(one(0, 0))] }).empty).toBe(false);
  });

  it("places a note at values on both of its scales", () => {
    const m = build({ ...measures, marks: [scatter(one(1, 2)), note({ x: 1, y: 2 })] });
    expect(m.marks[1]).toMatchObject({ kind: "text", x: 1, y: 2, row: false });
    expect(() =>
      build({ ...measures, marks: [scatter(one(1, 2)), note({ x: "Japan", y: 2 })] }),
    ).toThrow(TypeError);
  });
});

const sized = { ...measures, r: { label: "Population" } };
const bubble = (r: readonly (number | null)[], x: readonly (number | null)[] = r.map(() => 1)) =>
  scatter([{ names: r.map((_, i) => `d${String(i)}`), x, y: r.map(() => 2), r }]);

describe("the scatter mark's sizes", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    [
      "r on one series and not another",
      {
        ...sized,
        marks: [
          scatter([
            { names: ["a"], x: [1], y: [2], r: [3] },
            { names: ["b"], x: [1], y: [2] },
          ]),
        ],
      },
      TypeError,
    ],
    [
      "r of another length",
      { ...sized, marks: [scatter([{ names: ["a"], x: [1], y: [2], r: [3, 4] }])] },
      TypeError,
    ],
    ["no r label", { ...measures, marks: [bubble([3])] }, TypeError],
    ["an r scale beside no r", { ...sized, marks: [scatter(one(1, 2))] }, TypeError],
    ["an r scale beside a line", { r: { label: "c" }, marks: [line([1])] }, TypeError],
    ["a log r", { ...measures, r: { label: "c", type: "log" }, marks: [bubble([3])] }, TypeError],
    ["zero on r", { ...measures, r: { label: "c", zero: true }, marks: [bubble([3])] }, TypeError],
    [
      "reverse on r",
      { ...measures, r: { label: "c", reverse: true }, marks: [bubble([3])] },
      TypeError,
    ],
    [
      "a unit on r",
      { ...measures, r: { label: "c", unit: { other: "people" } }, marks: [bubble([3])] },
      TypeError,
    ],
    ["a negative r", { ...sized, marks: [bubble([-1])] }, RangeError],
    ["an infinite r", { ...sized, marks: [bubble([Number.POSITIVE_INFINITY])] }, RangeError],
    [
      "an r domain from above 0",
      { ...measures, r: { label: "c", domain: [1, 10] }, marks: [bubble([3])] },
      RangeError,
    ],
    [
      "an r past its passed domain",
      { ...measures, r: { label: "c", domain: [0, 10] }, marks: [bubble([11])] },
      RangeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ ...measures, marks: [bubble([3])] })).toThrow(
      "renderChart: r.label is required on a scatter, whose readings name each measure by it",
    );
    expect(() => build({ ...sized, marks: [scatter(one(1, 2))] })).toThrow(
      "renderChart: an r scale sizes a scatter's dots, and none carries r",
    );
    expect(() =>
      build({ ...measures, r: { label: "c", domain: [0, 10] }, marks: [bubble([11])] }),
    ).toThrow("renderChart: a scatter's r must lie inside r.domain");
  });

  it("sizes from 0 to the largest r of a placed dot, or to its passed domain", () => {
    const m = build({ ...sized, marks: [bubble([3, 8, 20], [1, 2, null])] });
    expect(m.kind).toBe("bubble");
    expect((m.marks[0] as ScatterModel).size).toEqual({ hi: 8, format: undefined });
    const passed = build({ ...measures, r: { label: "c", domain: [0, 50] }, marks: [bubble([3])] });
    expect((passed.marks[0] as ScatterModel).size?.hi).toBe(50);
    // Every size 0 has no high end to reach, so it spans 0 to 1.
    expect((build({ ...sized, marks: [bubble([0, 0])] }).marks[0] as ScatterModel).size?.hi).toBe(
      1,
    );
  });

  it("shows a bubble of size 0, and not one with no size", () => {
    const m = build({ ...sized, marks: [bubble([0, null, Number.NaN, 4])] });
    expect((m.marks[0] as ScatterModel).shown).toEqual([[0, 3]]);
    expect(build({ ...sized, marks: [bubble([null])] }).empty).toBe(true);
  });

  it("draws bubbles largest first across every series, ties in series then the app's order", () => {
    const m = build({
      ...sized,
      marks: [
        scatter([
          { names: ["a", "b", "c"], x: [1, 1, 1], y: [1, 1, 1], r: [2, 9, 2] },
          { names: ["d", "e"], x: [1, 1], y: [1, 1], r: [9, 5] },
        ]),
      ],
    });
    expect((m.marks[0] as ScatterModel).drawn).toEqual([
      { series: 0, i: 1 },
      { series: 1, i: 0 },
      { series: 1, i: 1 },
      { series: 0, i: 0 },
      { series: 0, i: 2 },
    ]);
  });

  it("joins a note to the bubble drawn on top among coincident ones: the smallest", () => {
    const m = build({
      ...sized,
      marks: [
        scatter([
          { names: ["small"], x: [1], y: [2], r: [1] },
          { names: ["large"], x: [1], y: [2], r: [9] },
        ]),
      ],
    });
    expect(scatterDotAt(m.marks[0] as ScatterModel, 1, 2)).toEqual({ series: 0, i: 0 });
  });
});

describe("the cell mark", () => {
  const cell = (more: Partial<Extract<Mark, { mark: "cell" }>> = {}): Mark => ({
    mark: "cell",
    x: ["0 h", "1 h", "2 h"],
    y: ["Mon", "Tue"],
    values: [
      [3, 0, 1],
      [null, Number.NaN, 7],
    ],
    ...more,
  });

  it.each<[string, unknown, ErrorConstructor]>([
    ["x not names", { marks: [cell({ x: [1, 2] as never })] }, TypeError],
    ["y not names", { marks: [cell({ y: "Mon" as never })] }, TypeError],
    ["a repeated column", { marks: [cell({ x: ["a", "a", "b"] })] }, RangeError],
    ["an empty row name", { marks: [cell({ y: ["", "Tue"] })] }, RangeError],
    ["a row of values too few", { marks: [cell({ values: [[1, 2, 3]] })] }, TypeError],
    [
      "a row of another length",
      {
        marks: [
          cell({
            values: [
              [1, 2],
              [1, 2, 3],
            ],
          }),
        ],
      },
      TypeError,
    ],
    ["values not rows", { marks: [cell({ values: 3 as never })] }, TypeError],
    [
      "a value that is not a number",
      {
        marks: [
          cell({
            values: [
              [1, "2", 3],
              [1, 2, 3],
            ] as never,
          }),
        ],
      },
      TypeError,
    ],
    [
      "an infinite value",
      {
        marks: [
          cell({
            values: [
              [1, Number.POSITIVE_INFINITY, 3],
              [1, 2, 3],
            ],
          }),
        ],
      },
      RangeError,
    ],
    ["a linear x", { x: { type: "linear" }, marks: [cell()] }, TypeError],
    ["a linear y", { y: { type: "linear" }, marks: [cell()] }, TypeError],
    ["a domain on its x", { x: { domain: [0, 3] }, marks: [cell()] }, TypeError],
    ["a height", { height: 200, marks: [cell()] }, TypeError],
    ["an x rule", { marks: [cell(), { mark: "rule", x: 1, label: "a" }] }, TypeError],
    ["a y rule", { marks: [cell(), { mark: "rule", y: 1, label: "a" }] }, TypeError],
    ["a colour scale beside no cell", { colour: {}, marks: [rect([1])], x: {} }, TypeError],
    ["a colour that is not an object", { colour: 5, marks: [cell()] }, TypeError],
    ["another colour type", { colour: { type: "qualitative" }, marks: [cell()] }, TypeError],
    ["one step", { colour: { steps: 1 }, marks: [cell()] }, TypeError],
    ["ten steps", { colour: { steps: 10 }, marks: [cell()] }, TypeError],
    ["a fractional step count", { colour: { steps: 4.5 }, marks: [cell()] }, TypeError],
    [
      "steps with thresholds",
      { colour: { steps: 3, thresholds: [1, 2] }, marks: [cell()] },
      TypeError,
    ],
    [
      "a domain with thresholds",
      { colour: { domain: [0, 9], thresholds: [1] }, marks: [cell()] },
      TypeError,
    ],
    [
      "a pivot with thresholds",
      { colour: { type: "diverging", pivot: 1, thresholds: [1] }, marks: [cell()] },
      TypeError,
    ],
    ["thresholds not numbers", { colour: { thresholds: ["1"] }, marks: [cell()] }, TypeError],
    ["no thresholds", { colour: { thresholds: [] }, marks: [cell()] }, RangeError],
    [
      "nine thresholds",
      { colour: { thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, marks: [cell()] },
      RangeError,
    ],
    ["thresholds out of order", { colour: { thresholds: [1, 3, 2] }, marks: [cell()] }, RangeError],
    ["a repeated threshold", { colour: { thresholds: [1, 1] }, marks: [cell()] }, RangeError],
    [
      "an infinite threshold",
      { colour: { thresholds: [1, Number.POSITIVE_INFINITY] }, marks: [cell()] },
      RangeError,
    ],
    ["a domain low above high", { colour: { domain: [5, 1] }, marks: [cell()] }, RangeError],
    ["a domain of one value", { colour: { domain: [5, 5] }, marks: [cell()] }, RangeError],
    ["a domain of names", { colour: { domain: ["a", "b"] }, marks: [cell()] }, TypeError],
    ["a pivot on a sequential scale", { colour: { pivot: 0 }, marks: [cell()] }, TypeError],
    ["reverse on a sequential scale", { colour: { reverse: true }, marks: [cell()] }, TypeError],
    [
      "an infinite pivot",
      { colour: { type: "diverging", pivot: Number.NaN }, marks: [cell()] },
      RangeError,
    ],
    ["a colour label not a string", { colour: { label: 3 }, marks: [cell()] }, TypeError],
    ["another colour format", { colour: { format: "money" }, marks: [cell()] }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("is a heatmap when written with days: undefined, as its check reads it", () => {
    const m = build({ marks: [{ ...cell(), days: undefined }] });
    expect(m.kind).toBe("heatmap");
    expect([m.x.lo, m.x.hi]).toEqual([0, 3]);
    expect(m.y).toEqual({ type: "band", rows: ["Mon", "Tue"], mono: false });
    expect((m.marks[0] as CellModel).kind).toBe("cell");
  });

  it("is a heatmap whose x holds its columns from 0 to their count and whose y is a band of its rows", () => {
    const m = build({ marks: [cell()] });
    expect(m.kind).toBe("heatmap");
    expect([m.x.lo, m.x.hi, m.x.passed]).toEqual([0, 3, true]);
    expect(m.y).toEqual({ type: "band", rows: ["Mon", "Tue"], mono: false });
    expect([0, 1, 2].map((v) => m.xText(v))).toEqual(["0 h", "1 h", "2 h"]);
  });

  it("reads a NaN as no data and classes the rest from the chart's colour", () => {
    const m = build({ colour: { type: "diverging", steps: 3, pivot: 4 }, marks: [cell()] });
    const c = m.marks[0] as CellModel;
    expect(c.values).toEqual([
      [3, 0, 1],
      [null, null, 7],
    ]);
    // The half-span is 4, so 3 classes are each at least 8/3 wide: 5.
    expect(c.classes).toEqual({
      type: "diverging",
      thresholds: [1.5, 6.5],
      steps: [1, 5, 9],
      digits: [1, 1],
    });
  });

  it("is empty when every value is missing, and not when one is 0", () => {
    const none = [
      [null, null, null],
      [null, null, null],
    ];
    expect(build({ marks: [cell({ values: none })] }).empty).toBe(true);
    expect(build({ marks: [cell({ values: [none[0] ?? [], [null, 0, null]] })] }).empty).toBe(
      false,
    );
  });
});

describe("a cell mark's binned axes", () => {
  const bins = (
    x: Extract<Mark, { mark: "cell"; values: unknown }>["x"],
    y: Extract<Mark, { mark: "cell"; values: unknown }>["y"],
  ): Mark => {
    const columns = "edges" in x ? x.edges.length - 1 : x.length;
    const rows = "edges" in y ? y.edges.length - 1 : y.length;
    return {
      mark: "cell",
      x,
      y,
      values: Array.from({ length: rows }, () => Array.from({ length: columns }, () => 2)),
    };
  };
  const gdp = { edges: [1_000, 2_000, 5_000] };
  const life = { edges: [50, 60, 70] };

  it.each<[string, Mark, ErrorConstructor]>([
    ["an axis neither names nor edges", bins({} as never, life), TypeError],
    ["edges that are not numbers", bins({ edges: ["1", "2"] } as never, life), TypeError],
    ["edges not an array", bins(gdp, { edges: 5 } as never), TypeError],
    ["a single edge", bins({ edges: [1] }, life), RangeError],
    ["edges out of order", bins(gdp, { edges: [50, 70, 60] }), RangeError],
    ["a repeated edge", bins({ edges: [1, 1, 2] }, life), RangeError],
    ["an infinite edge", bins(gdp, { edges: [50, Number.POSITIVE_INFINITY] }), RangeError],
    ["a NaN edge", bins({ edges: [1, Number.NaN] }, life), RangeError],
  ])("refuses %s", (_, mark, type) => {
    expect(() => build({ marks: [mark] })).toThrow(type);
  });

  it("is a 2D histogram when both axes are binned, and a heatmap when one names its categories", () => {
    expect(build({ marks: [bins(gdp, life)] }).kind).toBe("histogram2d");
    expect(build({ marks: [bins(["a", "b"], life)] }).kind).toBe("heatmap");
    expect(build({ marks: [bins(gdp, ["a", "b"])] }).kind).toBe("heatmap");
  });

  it("keeps each axis's names or edges, and writes a binned x's values as numbers", () => {
    const m = build({ marks: [bins(gdp, ["Low", "High"])] });
    const c = m.marks[0] as CellModel;
    expect([c.x, c.y]).toEqual([gdp, { names: ["Low", "High"] }]);
    expect(m.xText(2_000)).toBe("2,000");
  });

  it("takes a height on a binned y, which a named y refuses", () => {
    expect(build({ height: 120, marks: [bins(["a", "b"], life)] }).spec.height).toBe(120);
    expect(() => build({ height: 120, marks: [bins(gdp, ["a", "b"])] })).toThrow(TypeError);
  });

  it("refuses a binned y whose thinnest bin is under a thousandth of the axis", () => {
    const thin = new RangeError(
      "renderChart: marks[0].y.edges' thinnest bin must be at least 1/1000 of the axis, since the plot grows until it is a row tall",
    );
    for (const edges of [
      [0, 1, 1e9],
      [0, 1, 1e6],
      [0, 999, 1000, 1001],
    ]) {
      expect(() => build({ marks: [bins(["a"], { edges })] }), String(edges)).toThrow(thin);
    }
    expect(() =>
      build({ y: { type: "log" }, marks: [bins(["a"], { edges: [1, 1.001, 10] })] }),
    ).toThrow(thin);
    expect(build({ marks: [bins(["a"], { edges: [0, 1, 1000] })] }).kind).toBe("heatmap");
    expect(
      build({ y: { type: "log" }, marks: [bins(["a"], { edges: [1, 10, 1e300] })] }).kind,
    ).toBe("heatmap");
  });
});

describe("binOf", () => {
  const edges = [0, 10, 20, 50];

  it("puts a value in the bin from its low edge, the last bin to its high edge too", () => {
    expect([0, 9.99, 10, 49, 50].map((v) => binOf(edges, v))).toEqual([0, 0, 1, 2, 2]);
  });

  it("puts a value past either edge, or NaN, in no bin", () => {
    expect([-0.1, 50.1, Number.NaN].map((v) => binOf(edges, v))).toEqual([-1, -1, -1]);
  });
});

describe("a cell chart's reading order", () => {
  const order = (spec: ChartSpec) => {
    const m = build(spec);
    return [...cellOrder(m, m.marks[0] as CellModel)];
  };

  it("runs from the top left along each row, a binned y from its highest bin", () => {
    const spec: ChartSpec = {
      marks: [
        {
          mark: "cell",
          x: ["a", "b"],
          y: { edges: [0, 1, 2] },
          values: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
    };
    expect(order(spec)).toEqual([
      [1, 0],
      [1, 1],
      [0, 0],
      [0, 1],
    ]);
  });

  it("starts each row at its right on a reversed x, as the drawing runs", () => {
    const spec: ChartSpec = {
      x: { reverse: true },
      marks: [{ mark: "cell", x: ["a", "b"], y: ["r"], values: [[1, 2]] }],
    };
    expect(order(spec)).toEqual([
      [0, 1],
      [0, 0],
    ]);
  });
});

describe("a cell chart's colour format", () => {
  it("writes values and boundaries in the colour scale's format", () => {
    const m = build({
      colour: { format: "percent" },
      marks: [{ mark: "cell", x: ["a"], y: ["r"], values: [[0.25]] }],
    });
    expect(m.colourText(0.25)).toBe("25%");
  });
});

describe("the box mark", () => {
  const latency = (more: Record<string, unknown> = {}, series: Record<string, unknown> = {}) => ({
    mark: "box",
    y: ["search", "export"],
    series: [
      {
        name: "Latency",
        low: [120, 300],
        q1: [180, 900],
        median: [240, 1400],
        q3: [410, 2100],
        high: [760, 4000],
        ...series,
      },
    ],
    ...more,
  });

  it.each([
    ["a y of numbers", { marks: [latency({ y: [1, 2] })] }, TypeError],
    ["a q1 shorter than its y", { marks: [latency({}, { q1: [180] })] }, TypeError],
    [
      "outliers not one array per category",
      { marks: [latency({}, { outliers: [[1]] })] },
      TypeError,
    ],
    ["outliers of strings", { marks: [latency({}, { outliers: [["a"], []] })] }, TypeError],
    ["a partly null category", { marks: [latency({}, { median: [null, 1400] })] }, TypeError],
    ["an empty whiskers", { marks: [latency({ whiskers: " " })] }, TypeError],
    ["whiskers of a number", { marks: [latency({ whiskers: 1.5 })] }, TypeError],
    ["a time x", { x: { type: "time" }, marks: [latency()] }, TypeError],
    ["a band x", { x: { type: "band" }, marks: [latency()] }, TypeError],
    ["zero on a log x", { x: { type: "log", zero: true }, marks: [latency()] }, TypeError],
    ["a linear y", { y: { type: "linear" }, marks: [latency()] }, TypeError],
    ["a height", { height: 200, marks: [latency()] }, TypeError],
    ["a y rule", { marks: [latency(), { mark: "rule", y: 1, label: "Cap" }] }, TypeError],
    [
      "a box beside a bar",
      { marks: [latency(), { mark: "bar", y: ["a"], series: [{ name: "a", x: [1] }] }] },
      TypeError,
    ],
    ["an empty name", { marks: [latency({ y: ["", "export"] })] }, RangeError],
    ["a repeated name", { marks: [latency({ y: ["a", "a"] })] }, RangeError],
    [
      "an infinite high",
      { marks: [latency({}, { high: [760, Number.POSITIVE_INFINITY] })] },
      RangeError,
    ],
    ["five out of order", { marks: [latency({}, { q1: [250, 900] })] }, RangeError],
    [
      "an outlier between the whiskers",
      { marks: [latency({}, { outliers: [[500], []] })] },
      RangeError,
    ],
    [
      "an outlier on a whisker's end",
      { marks: [latency({}, { outliers: [[760], []] })] },
      RangeError,
    ],
    ["an infinite outlier", { marks: [latency({}, { outliers: [[Number.NaN], []] })] }, RangeError],
    [
      "a value of 0 on a log x",
      { x: { type: "log" }, marks: [latency({}, { low: [0, 300] })] },
      RangeError,
    ],
    [
      "an outlier of 0 on a log x",
      { x: { type: "log" }, marks: [latency({}, { outliers: [[0], []] })] },
      RangeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ marks: [latency({}, { q1: [250, 900] })] })).toThrow(
      'renderChart: marks[0].series[0] at "search" must have low ≤ q1 ≤ median ≤ q3 ≤ high',
    );
    expect(() => build({ marks: [latency({}, { outliers: [[500], []] })] })).toThrow(
      'renderChart: marks[0].series[0] at "search"\'s outliers must lie beyond its whiskers, below low or above high',
    );
    expect(() =>
      build({ marks: [latency({}, { outliers: [[], [5000]], low: [120, null] })] }),
    ).toThrow('renderChart: marks[0].series[0] at "export" must have all five numbers');
    expect(() => build({ height: 100, marks: [latency()] })).toThrow(
      "renderChart: height has no place on a dot, bar, point or box chart, which is as tall as its rows",
    );
  });

  it("keeps each category's five numbers, a gap as null, and sorts its outliers", () => {
    const m = build({
      marks: [
        latency(
          { whiskers: "1.5 × IQR" },
          {
            low: [120, null],
            q1: [180, Number.NaN],
            median: [240, null],
            q3: [410, null],
            high: [760, null],
            outliers: [[1100, 20, 2600], []],
          },
        ),
      ],
    });
    expect(m.y).toEqual({ type: "band", rows: ["search", "export"], mono: false });
    expect(m.marks[0] as BoxModel).toEqual({
      kind: "box",
      whiskers: "1.5 × IQR",
      series: [
        {
          name: "Latency",
          slot: 1,
          boxes: [{ low: 120, q1: 180, median: 240, q3: 410, high: 760 }, null],
          outliers: [[20, 1100, 2600], []],
        },
      ],
    });
    expect(m.kind).toBe("box");
    expect(m.amountText(240)).toBe("240");
  });

  it("spans x over every whisker's end and outlier, without 0 unless asked", () => {
    const m = build({ marks: [latency({}, { outliers: [[2600], [50]] })] });
    expect(m.x.lo).toBeLessThanOrEqual(50);
    expect(m.x.lo).toBeGreaterThan(0);
    expect(m.x.hi).toBeGreaterThanOrEqual(4000);
    expect(build({ x: { zero: true }, marks: [latency()] }).x.lo).toBe(0);
    const log = build({ x: { type: "log" }, marks: [latency()] });
    expect([log.x.type, log.x.lo, log.x.hi]).toEqual(["log", 120, 4000]);
  });

  it("is empty when every category's five are gaps", () => {
    const none = {
      low: [null, null],
      q1: [null, null],
      median: [null, null],
      q3: [null, null],
      high: [null, null],
    };
    expect(build({ marks: [latency({}, none)] }).empty).toBe(true);
    expect(build({ marks: [latency()] }).empty).toBe(false);
  });

  it("is a box plot whatever its series count", () => {
    const two = latency({}, {});
    const series = (two.series as Record<string, unknown>[])[0] ?? {};
    const m = build({ marks: [{ ...two, series: [series, { ...series, name: "After" }] }] });
    expect(m.kind).toBe("box");
  });
});

describe("the largest value", () => {
  const grid = (more: Record<string, unknown> = {}) => ({
    mark: "cell",
    x: ["a", "b"],
    y: ["r"],
    values: [[1, 2]],
    ...more,
  });
  const box = (high: number, outliers?: number[]) => ({
    mark: "box",
    y: ["search"],
    series: [
      {
        name: "Latency",
        low: [120],
        q1: [180],
        median: [240],
        q3: [410],
        high: [high],
        ...(outliers === undefined ? {} : { outliers: [outliers] }),
      },
    ],
  });
  // Each places `v` on a value or colour scale through one check.
  const at: [string, (v: number) => unknown][] = [
    ["a line's x", (v) => ({ x: { type: "linear" }, marks: [line([1, 2], { x: [0, v] })] })],
    ["a line's y", (v) => ({ x: {}, marks: [line([1, v])] })],
    ["a line's y below 0", (v) => ({ x: {}, marks: [line([1, -v])] })],
    ["a bar's x", (v) => ({ x: {}, marks: [bars([1, v])] })],
    ["a point's x", (v) => ({ x: {}, marks: [points([[1, v]])] })],
    ["a scatter's r", (v) => ({ ...sized, marks: [bubble([1, v])] })],
    ["a box's high", (v) => ({ marks: [box(v)] })],
    ["a box's outlier", (v) => ({ marks: [box(760, [v])] })],
    ["a cell's value", (v) => ({ marks: [grid({ values: [[1, v]] })] })],
    ["a bin's edge", (v) => ({ marks: [grid({ x: { edges: [0, 1, v] } })] })],
    [
      "a calendar's day",
      (v) => ({ marks: [{ mark: "cell", days: { start: 0, values: [1, v] } }] }),
    ],
    ["an x domain", (v) => ({ x: { type: "linear", domain: [0, v] }, marks: [line([1, 2])] })],
    ["a colour domain", (v) => ({ colour: { domain: [0, v] }, marks: [grid()] })],
    ["a colour threshold", (v) => ({ colour: { thresholds: [1, v] }, marks: [grid()] })],
    ["a colour pivot", (v) => ({ colour: { type: "diverging", pivot: v }, marks: [grid()] })],
    ["a rule", (v) => ({ x: {}, marks: [line([1, 2]), { mark: "rule", y: v, label: "Goal" }] })],
    ["a note", (v) => ({ x: {}, marks: [line([1, 2]), note({ y: v })] })],
  ];

  it.each(at)("takes %s of 1e300", (_, spec) => {
    expect(() => build(spec(1e300))).not.toThrow();
  });

  it.each(at)("refuses %s of 1e301 with a RangeError", (_, spec) => {
    expect(() => build(spec(1e301))).toThrow(RangeError);
    expect(() => build(spec(1e301))).toThrow(/ must lie within ±1e300$/);
  });

  it("refuses a stack whose total passes 1e300, though each part is within it", () => {
    const stack = (v: number) => ({
      x: {},
      marks: [
        rect([v], {
          series: [
            { name: "a", y: [v] },
            { name: "b", y: [v] },
          ],
        }),
      ],
    });
    expect(() => build(stack(5e299))).not.toThrow();
    expect(() => build(stack(6e299))).toThrow(
      new RangeError("renderChart: a stack's total must lie within ±1e300"),
    );
  });

  it("gives one cell value past 2^53 finite, strictly increasing classes", () => {
    const m = build({ marks: [grid({ x: ["a"], values: [[-1e16]] })] });
    const { thresholds } = (m.marks[0] as CellModel).classes;
    expect(
      thresholds.every((t, k) => Number.isFinite(t) && (k === 0 || t > (thresholds[k - 1] ?? 0))),
    ).toBe(true);
  });

  it("refuses a colour domain too narrow for increasing class boundaries", () => {
    expect(() => build({ colour: { domain: [1e16, 1e16 + 2] }, marks: [grid()] })).toThrow(
      RangeError,
    );
  });

  it("refuses a calendar's start past Date's range with a RangeError", () => {
    expect(() => build({ marks: [{ mark: "cell", days: { start: 1e16, values: [1] } }] })).toThrow(
      RangeError,
    );
  });
});

describe("an instant's words on a time x", () => {
  const over = (lo: number, hi: number) =>
    build({ x: { type: "time" }, marks: [line([1, 2], { x: [lo, hi] })] });
  const newYear = Date.UTC(2026, 0, 1);

  it("adds the year when the domain's ends lie in different years, and the era before year 1", () => {
    expect(over(newYear, newYear + 10 * 86_400_000).xText(newYear)).toBe("Jan 1, 12:00 AM");
    expect(over(newYear - 86_400_000, newYear + 86_400_000).xText(newYear)).toBe(
      "Jan 1, 2026, 12:00 AM",
    );
    const bc = new Date(newYear).setUTCFullYear(-500);
    expect(over(bc, newYear).xText(bc)).toBe("Jan 1, 501 BC, 12:00 AM");
    expect(over(bc, newYear).xSpan(bc, newYear)).toEqual([
      "Jan 1, 501 BC, 12:00 AM",
      "Jan 1, 2026 AD, 12:00 AM",
    ]);
  });

  it("refuses a time x past what Date holds, naming the limit", () => {
    expect(() => over(0, 8.64e15 + 1)).toThrow(
      "renderChart: marks[0].x[1] must lie within 8.64e15 ms either side of 1970, the range Date holds",
    );
    expect(over(-8.64e15, 8.64e15).x.lo).toBe(-8.64e15);
    expect(() =>
      build({
        x: { type: "time" },
        marks: [line([1, 2], { x: [0, 1] }), { mark: "text", x: -1e16, y: 1, text: "far" }],
      }),
    ).toThrow(
      "renderChart: marks[1].x must lie within 8.64e15 ms either side of 1970, the range Date holds",
    );
    expect(() => build({ marks: [{ mark: "cell", days: { start: 1e16, values: [1] } }] })).toThrow(
      "renderChart: a calendar's days.start must lie within 8.64e15 ms either side of 1970",
    );
    expect(() =>
      build({
        marks: [
          { mark: "cell", days: { start: 0, values: [1] } },
          { mark: "text", x: 9e15, text: "far" },
        ],
      }),
    ).toThrow("renderChart: marks[1].x must lie within 8.64e15 ms");
    expect(() =>
      build({
        marks: [{ mark: "cell", days: { start: 8.64e15 - 86_400_000, values: [1, 2, 3, 4] } }],
      }),
    ).toThrow(
      "renderChart: the days of a calendar's last week must lie within 8.64e15 ms either side of 1970, the range Date holds",
    );
    expect(
      build({ marks: [{ mark: "cell", days: { start: 8.64e15 - 86_400_000, values: [1] } }] }).x.hi,
    ).toBe(8.64e15);
  });

  it("names every instant past what Date holds on a time x, whatever its domain", () => {
    const limit = "must lie within 8.64e15 ms either side of 1970, the range Date holds";
    const x = { type: "time", domain: [0, 1000] };
    const cases: [unknown, string][] = [
      [{ x, marks: [line([1]), { mark: "rule", x: -9e15, label: "far" }] }, "marks[1].x"],
      [{ x, marks: [rect([1, 2], { x1: [-9e15, 1], x2: [1, 2] })] }, "marks[0].x1[0]"],
      [{ x, marks: [rect([1], { x1: [0], x2: [9e15] })] }, "marks[0].x2[0]"],
      [{ x, marks: [area([[1, 2]], { x: [0, 9e15] })] }, "marks[0].x[1]"],
      [
        { x, marks: [{ mark: "dot", rows: [{ name: "a", x: [0, 9e15] }] }] },
        "marks[0].rows[0].x[1]",
      ],
      [
        { x, marks: [{ mark: "point", y: ["a"], series: [{ name: "s", x: [9e15] }] }] },
        "marks[0].series[0].x[0]",
      ],
      [
        {
          x: { type: "time" },
          marks: [{ mark: "cell", x: { edges: [0, 9e15] }, y: ["a"], values: [[1]] }],
        },
        "marks[0].x.edges[1]",
      ],
      [{ x: { type: "time", domain: [-9e15, 0] }, marks: [] }, "x.domain[0]"],
      [{ x, marks: [line([1]), note({ x: 9e15 })] }, "marks[1].x"],
    ];
    for (const [spec, field] of cases) {
      expect(() => build(spec)).toThrow(new RangeError(`renderChart: ${field} ${limit}`));
    }
    expect(build({ x, marks: [rect([1], { x1: [-8.64e15], x2: [8.64e15] })] }).x.lo).toBe(0);
  });

  // 8.64e15 ms is Saturday 13 September 275760, -8.64e15 a Tuesday.
  const days = (start: number, values: number[], locale: string, timeZone: string) =>
    chartModel({ marks: [{ mark: "cell", days: { start, values } }] }, locale, timeZone);

  it("refuses a calendar whose first week starts before what Date holds, west of UTC too", () => {
    const first =
      "renderChart: the days of a calendar's first week must lie within 8.64e15 ms either side of 1970, the range Date holds";
    // A week from Sunday in en starts two days before the Tuesday.
    expect(() => days(-8.64e15, [1], "en", "UTC")).toThrow(first);
    // New York's wall clock puts -8.64e15 on the Monday before it.
    expect(() => days(-8.64e15, [1], "en", "America/New_York")).toThrow(first);
    expect(() => days(-8.64e15 + 2 * 86_400_000, [1], "en-GB", "UTC")).toThrow(first);
    expect(days(-8.64e15 + 5 * 86_400_000, [1], "en", "UTC").x.lo).toBe(-8.64e15 + 5 * 86_400_000);
  });

  it("refuses a calendar whose last week ends after what Date holds, and draws one ending at it", () => {
    // fr's week from Monday puts the Friday's week end on Sunday 14 September.
    expect(() => days(8.64e15 - 86_400_000, [1], "fr", "UTC")).toThrow(
      "renderChart: the days of a calendar's last week must lie within 8.64e15 ms either side of 1970, the range Date holds",
    );
    // en's week from Sunday ends on the Saturday, the last day Date holds.
    const m = days(8.64e15 - 86_400_000, [1, 2], "en", "UTC");
    expect(m.kind).toBe("calendar");
    expect(m.x.hi).toBe(8.64e15 + 86_400_000);
  });
});

describe("the pie mark", () => {
  const land = (more: Record<string, unknown> = {}, slices?: unknown) => ({
    mark: "pie",
    unit: { other: "km²" },
    slices: slices ?? [
      { name: "Agriculture", value: 182_637 },
      { name: "Forest", slot: 5, value: 106_000 },
      { name: "Water", value: null },
      { name: "Other", value: Number.NaN },
    ],
    ...more,
  });

  it("keeps the slices in the app's order, each in its slot, a gap as null, totalling the rest", () => {
    const model = build({ marks: [land()] });
    const m = model.marks[0];
    expect(m?.kind).toBe("pie");
    if (m?.kind !== "pie") {
      return;
    }
    expect(m.slices).toEqual([
      { name: "Agriculture", slot: 1, value: 182_637 },
      { name: "Forest", slot: 5, value: 106_000 },
      { name: "Water", slot: 3, value: null },
      { name: "Other", slot: 4, value: null },
    ]);
    expect(m.total).toBe(288_637);
    expect(m.hole).toBe(false);
    expect(model.amountText(m.total)).toBe("288,637");
    expect(model.shareText(182_637 / 288_637)).toBe("63%");
  });

  it("is a pie chart, or with a hole a donut chart, and writes values in its own format", () => {
    expect(build({ marks: [land()] }).kind).toBe("pie");
    const donut = build({ marks: [land({ hole: true, format: "percent" })] });
    expect(donut.kind).toBe("donut");
    expect(donut.amountText(0.5)).toBe("50%");
  });

  it("is empty when every slice is 0 or no data", () => {
    const zero = [
      { name: "A", value: 0 },
      { name: "B", value: null },
    ];
    expect(build({ marks: [land({}, zero)] }).empty).toBe(true);
    expect(build({ marks: [land({}, [])] }).empty).toBe(true);
    expect(build({ marks: [land()] }).empty).toBe(false);
  });

  it("takes a height, since its circle is as tall as the plot", () => {
    expect(build({ height: 300, marks: [land()] }).spec.height).toBe(300);
  });

  it("refuses scales, rules and notes, which have no axis to sit on", () => {
    expect(() => build({ x: {}, marks: [land()] })).toThrow(
      new TypeError("renderChart: a pie takes no x scale; it has no axes"),
    );
    expect(() => build({ y: {}, marks: [land()] })).toThrow(
      new TypeError("renderChart: a pie takes no y scale; it has no axes"),
    );
    expect(() => build({ marks: [land(), { mark: "rule", y: 1, label: "Target" }] })).toThrow(
      new TypeError(
        "renderChart: marks[1] is a rule mark beside a pie, which has no scale to place it on",
      ),
    );
    expect(() => build({ marks: [{ mark: "text", x: 1, y: 1, text: "Note" }, land()] })).toThrow(
      new TypeError(
        "renderChart: marks[0] is a text mark beside a pie, which has no scale to place it on",
      ),
    );
    expect(() => build({ marks: [land(), rect([1])] })).toThrow(TypeError);
  });

  it("refuses slices of the wrong type with a TypeError", () => {
    for (const bad of [
      land({}, "slices"),
      land({ hole: "yes" }),
      land({}, [{ value: 1 }]),
      land({}, [{ name: "A", value: "1" }]),
      land({}, [{ name: "A", value: 1, slot: "1" }]),
      land({ unit: "km²" }),
      land({ format: "money" }),
    ]) {
      expect(() => build({ marks: [bad] }), JSON.stringify(bad)).toThrow(TypeError);
    }
  });

  it("refuses negative, infinite, unnamed and repeated slices with a RangeError", () => {
    const one = (slice: Record<string, unknown>) => land({}, [{ name: "A", value: 1 }, slice]);
    for (const bad of [
      one({ name: "B", value: -1 }),
      one({ name: "B", value: Number.POSITIVE_INFINITY }),
      one({ name: "B", value: 1e301 }),
      one({ name: "", value: 1 }),
      one({ name: "A", value: 2 }),
      one({ name: "B", value: 1, slot: 10 }),
    ]) {
      expect(() => build({ marks: [bad] }), JSON.stringify(bad)).toThrow(RangeError);
    }
    expect(() => build({ marks: [one({ name: "B", value: -1 })] })).toThrow(
      "renderChart: marks[0].slices[1].value cannot be negative; a slice is a part of the whole",
    );
    expect(() => build({ marks: [one({ name: "A", value: 2 })] })).toThrow(
      'renderChart: marks[0].slices must name each slice once, never ""',
    );
  });

  it("refuses a total past what a scale holds", () => {
    const big = [
      { name: "A", value: 1e300 },
      { name: "B", value: 1e300 },
    ];
    expect(() => build({ marks: [land({}, big)] })).toThrow(
      new RangeError("renderChart: the total of a pie's slices must lie within ±1e300"),
    );
  });
});

describe("the tree mark", () => {
  const regions = (more: Record<string, unknown> = {}, nodes?: unknown) => ({
    mark: "tree",
    unit: { other: "USD" },
    nodes: nodes ?? [
      {
        name: "Asia",
        children: [
          { name: "China", value: 17.8e12 },
          { name: "Japan", value: 4.2e12 },
          { name: "Other", value: null },
        ],
      },
      {
        name: "Europe",
        slot: 7,
        children: [
          { name: "Germany", value: 4.5e12 },
          { name: "Other", value: Number.NaN },
        ],
      },
      { name: "Americas", children: [{ name: "United States", value: 27.4e12 }] },
    ],
    ...more,
  });
  const countries = (more: Record<string, unknown> = {}) =>
    regions(more, [
      { name: "United States", value: 27.4e12 },
      { name: "China", slot: 3, value: 17.8e12 },
      { name: "Germany", value: 4.5e12 },
      { name: "Chad", value: 0 },
    ]);

  it("sums each group's parts, each part taking its group's slot and a group the series rule's", () => {
    const model = build({ marks: [regions()] });
    const m = model.marks[0];
    expect(m?.kind).toBe("tree");
    if (m?.kind !== "tree") {
      return;
    }
    expect(m.groups).toEqual([
      { name: "Asia", slot: 1, value: 22e12, first: 0, count: 3 },
      { name: "Europe", slot: 7, value: 4.5e12, first: 3, count: 2 },
      { name: "Americas", slot: 3, value: 27.4e12, first: 5, count: 1 },
    ]);
    expect(m.parts).toEqual([
      { name: "China", slot: 1, value: 17.8e12, group: 0 },
      { name: "Japan", slot: 1, value: 4.2e12, group: 0 },
      { name: "Other", slot: 1, value: null, group: 0 },
      { name: "Germany", slot: 7, value: 4.5e12, group: 1 },
      { name: "Other", slot: 7, value: null, group: 1 },
      { name: "United States", slot: 3, value: 27.4e12, group: 2 },
    ]);
    expect(m.total).toBe(53.9e12);
    expect(model.kind).toBe("treemap");
    expect(model.amountText(m.total)).toBe("53,900,000,000,000");
  });

  it("fills one level's tiles with the mark's slot, 1 by default, a part's own slot picking it out", () => {
    const one = build({ marks: [countries()] }).marks[0];
    const slotted = build({ marks: [countries({ slot: 4 })] }).marks[0];
    expect(one?.kind === "tree" && one.parts.map((p) => [p.slot, p.group])).toEqual([
      [1, -1],
      [3, -1],
      [1, -1],
      [1, -1],
    ]);
    expect(one?.kind === "tree" && one.groups).toEqual([]);
    expect(slotted?.kind === "tree" && slotted.parts.map((p) => p.slot)).toEqual([4, 3, 4, 4]);
  });

  it("takes a node written with children: undefined as a part, as its check does", () => {
    const parts = (more: Record<string, unknown> = {}) =>
      build({
        marks: [
          regions({}, [
            { name: "Spain", value: 1.6e12, children: undefined, ...more },
            { name: "Italy", value: 2.3e12 },
          ]),
        ],
      }).marks[0];
    const plain = parts();
    const slotted = parts({ slot: 5 });
    expect(plain?.kind === "tree" && plain.parts[0]).toEqual({
      name: "Spain",
      slot: 1,
      value: 1.6e12,
      group: -1,
    });
    expect(plain?.kind === "tree" && plain.groups).toEqual([]);
    expect(slotted?.kind === "tree" && slotted.parts.map((p) => p.slot)).toEqual([5, 1]);
  });

  it("writes values in its own format and is empty when every part is 0 or no data", () => {
    expect(build({ marks: [countries({ format: "integer" })] }).amountText(1.5e3)).toBe("1,500");
    const none = [
      { name: "A", value: 0 },
      { name: "B", value: null },
    ];
    expect(build({ marks: [regions({}, none)] }).empty).toBe(true);
    expect(build({ marks: [regions({}, [{ name: "G", children: none }])] }).empty).toBe(true);
    expect(build({ marks: [regions({}, [])] }).empty).toBe(true);
    expect(build({ marks: [countries()] }).empty).toBe(false);
  });

  it("refuses scales, rules and notes, which have no axis to sit on", () => {
    expect(() => build({ x: {}, marks: [countries()] })).toThrow(
      new TypeError("renderChart: a tree takes no x scale; it has no axes"),
    );
    expect(() => build({ y: {}, marks: [countries()] })).toThrow(
      new TypeError("renderChart: a tree takes no y scale; it has no axes"),
    );
    expect(() => build({ marks: [countries(), { mark: "rule", x: 1, label: "Target" }] })).toThrow(
      new TypeError(
        "renderChart: marks[1] is a rule mark beside a tree, which has no scale to place it on",
      ),
    );
    expect(() =>
      build({ marks: [{ mark: "text", x: 1, y: 1, text: "Note" }, countries()] }),
    ).toThrow(
      new TypeError(
        "renderChart: marks[0] is a text mark beside a tree, which has no scale to place it on",
      ),
    );
    expect(() => build({ marks: [countries(), rect([1])] })).toThrow(TypeError);
  });

  it("refuses a third level, mixed levels, empty groups and slots on grouped parts with a TypeError", () => {
    const group = (children: unknown, more: Record<string, unknown> = {}) => ({
      name: "G",
      children,
      ...more,
    });
    const cases: [unknown, string][] = [
      [regions({}, "nodes"), "marks[0].nodes must be an array"],
      [
        regions({}, [{ name: "A" }]),
        "marks[0].nodes[0] must hold a value or children, not both or neither",
      ],
      [
        regions({}, [group([{ name: "a", value: 1 }], { value: 1 })]),
        "marks[0].nodes[0] must hold a value or children, not both or neither",
      ],
      [
        regions({}, [group([{ name: "a", children: [{ name: "x", value: 1 }] }])]),
        "marks[0].nodes[0].children[0] cannot hold children; a tree has two levels at most",
      ],
      [
        regions({}, [{ name: "A", value: 1 }, group([{ name: "a", value: 1 }])]),
        "marks[0].nodes must be all parts or all groups",
      ],
      [regions({}, [group([])]), "marks[0].nodes[0].children must hold a part"],
      [regions({}, [group("parts")]), "marks[0].nodes[0].children must be an array"],
      [regions({}, [group([{ name: "a" }])]), "marks[0].nodes[0].children[0] must hold a value"],
      [
        regions({}, [group([{ name: "a", slot: 2, value: 1 }])]),
        "marks[0].nodes[0].children[0].slot has no place inside a group, whose slot its parts take",
      ],
      [regions({ slot: 2 }), "marks[0].slot has no place beside groups, which take a slot each"],
      [regions({}, [{ value: 1 }]), "marks[0].nodes[0] must have a name"],
      [
        regions({}, [group([{ name: 3, value: 1 }])]),
        "marks[0].nodes[0].children[0] must have a name",
      ],
      [
        regions({}, [{ name: "A", value: "1" }]),
        "marks[0].nodes[0].value must be a number or null",
      ],
    ];
    for (const [bad, message] of cases) {
      expect(() => build({ marks: [bad] }), message).toThrow(
        new TypeError(`renderChart: ${message}`),
      );
    }
    for (const bad of [
      countries({ unit: "USD" }),
      countries({ format: "money" }),
      countries({ slot: "1" }),
    ]) {
      expect(() => build({ marks: [bad] }), JSON.stringify(bad)).toThrow(TypeError);
    }
  });

  it("refuses negative, infinite, unnamed and repeated siblings with a RangeError", () => {
    const parts = (part: Record<string, unknown>) => regions({}, [{ name: "A", value: 1 }, part]);
    const cases: [unknown, string][] = [
      [
        parts({ name: "B", value: -1 }),
        "marks[0].nodes[1].value cannot be negative; a part is a part of the whole",
      ],
      [
        parts({ name: "B", value: Number.NEGATIVE_INFINITY }),
        "marks[0].nodes[1].value cannot be infinite",
      ],
      [parts({ name: "B", value: 1e301 }), "marks[0].nodes[1].value must lie within ±1e300"],
      [parts({ name: "", value: 1 }), 'marks[0].nodes must name each node once, never ""'],
      [parts({ name: "A", value: 2 }), 'marks[0].nodes must name each node once, never ""'],
      [parts({ name: "B", slot: 10, value: 1 }), "marks[0].nodes[1].slot must be 1 to 9"],
      [
        regions({}, [
          {
            name: "G",
            children: [
              { name: "a", value: 1 },
              { name: "a", value: 2 },
            ],
          },
        ]),
        'marks[0].nodes[0].children must name each part once, never ""',
      ],
      [
        regions({}, [{ name: "G", children: [{ name: "a", value: -2 }] }]),
        "marks[0].nodes[0].children[0].value cannot be negative; a part is a part of the whole",
      ],
      [
        regions(
          {},
          Array.from({ length: 10 }, (_, g) => ({
            name: `G${String(g)}`,
            children: [{ name: "a", value: 1 }],
          })),
        ),
        "marks[0].nodes[9] needs a slot, since series past the ninth take none of their own",
      ],
    ];
    for (const [bad, message] of cases) {
      expect(() => build({ marks: [bad] }), message).toThrow(
        new RangeError(`renderChart: ${message}`),
      );
    }
    // Two groups may each hold an "Other": only siblings must differ.
    expect(() => build({ marks: [regions()] })).not.toThrow();
    // Parts of one level take the mark's slot, so a tenth needs none of its own.
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `P${String(i)}`, value: i + 1 }));
    expect(build({ marks: [regions({}, many)] }).empty).toBe(false);
  });

  it("refuses a total past what a scale holds", () => {
    const big = [
      { name: "A", value: 1e300 },
      { name: "B", value: 1e300 },
    ];
    expect(() => build({ marks: [regions({}, big)] })).toThrow(
      new RangeError("renderChart: the total of a tree's nodes must lie within ±1e300"),
    );
  });
});
