import { describe, expect, it } from "vitest";

import type {
  BinsFrame,
  CategoriesFrame,
  GridFrame,
  PointsFrame,
  SeriesFrame,
} from "../frame/frame.js";
import {
  MAX_CALENDAR_DAYS,
  MAX_MAGNITUDE,
  MAX_ROWS,
  MAX_SUB_ROWS,
  MAX_VALUES,
} from "../frame/limits.js";
import { localDay, midnight } from "../scale/time.js";

import { check } from "./check.js";
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
import type { ChartSpec } from "./spec.js";
import {
  binsFrame,
  boxes,
  calendar,
  categories,
  events,
  grid,
  points,
  seriesFrame,
  tree,
  unitBins,
} from "./test-helpers/frames.js";

const build = (spec: unknown) => chartModel(spec as ChartSpec, "en", "UTC");

// A million-value spec runs past node's 5 s default on a loaded host.
const MILLION = { timeout: 30_000 };

type Values = readonly (number | null)[];

const index = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// Unit bins from 0 on a value x, a series per values list keyed "a", "b", ....
const rect = (values: readonly Values[], data: Partial<BinsFrame> = {}, mark: object = {}) => ({
  data: unitBins(values, data),
  mark: { mark: "rect", ...mark },
});

// Samples at 0, 1, ..., a series per values list keyed "a", "b", ....
const line = (values: readonly Values[], data: Partial<SeriesFrame> = {}, mark: object = {}) => ({
  data: seriesFrame(index(values[0]?.length ?? 0), values, data),
  mark: { mark: "line", ...mark },
});

const area = (values: readonly Values[], data: Partial<SeriesFrame> = {}, mark: object = {}) => ({
  data: seriesFrame(index(values[0]?.length ?? 0), values, data),
  mark: { mark: "area", ...mark },
});

// One series "a" over names c0, c1, ....
const bars = (values: Values, data: Partial<CategoriesFrame> = {}, mark: object = {}) => ({
  data: categories(
    values.map((_, i) => `c${String(i)}`),
    [values],
    data,
  ),
  mark: { mark: "bar", ...mark },
});

const dots = { data: events({ ana: [0] }), mark: { mark: "dot" } };

const ten = Array.from({ length: 10 }, () => [1]);

describe("spec errors", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["a repeated line x", line([[1, 2]], { x: [0, 0] }), RangeError],
    ["a bins x1 that goes back", rect([[1, 2]], { x1: [1, 0], x2: [2, 1] }), RangeError],
    [
      "a dot row's instants decreasing",
      { data: events({ a: [2, 1] }), mark: { mark: "dot" } },
      RangeError,
    ],
    ["a bins x2 not above its x1", rect([[1]], { x2: [0] }), RangeError],
    ["a non-finite x", line([[1, 2]], { x: [0, Number.NaN] }), RangeError],
    ["an infinite x2", rect([[1]], { x2: [Number.POSITIVE_INFINITY] }), RangeError],
    ["an infinite value", line([[Number.NEGATIVE_INFINITY]]), RangeError],
    ["a negative value under a rect", rect([[-1]]), RangeError],
    ["a slot of 0", rect([[1]], {}, { keys: [{ key: "a", slot: 0 }] }), RangeError],
    ["a slot of 10", { data: events({}), mark: { mark: "dot", slot: 10 } }, RangeError],
    ["a tenth series with no slot", rect(ten), RangeError],
    [
      "a log domain at 0",
      { ...rect([[1]], { x1: [1], x2: [2] }), x: { type: "log", domain: [0, 10] } },
      RangeError,
    ],
    [
      "a bin at 0 or below on a log x",
      { ...rect([[1, 1]], { x1: [-1, 0], x2: [0, 1] }), x: { type: "log" } },
      RangeError,
    ],
    ["a ref at NaN", line([[1]], { refs: [{ key: "m", value: Number.NaN }] }), RangeError],
    [
      "a ref at Infinity",
      line([[1]], { refs: [{ key: "cap", value: Number.POSITIVE_INFINITY }] }),
      RangeError,
    ],
    ["a rect's y domain without 0", { ...rect([[2]]), y: { domain: [1, 5] } }, RangeError],
    ["a height of 0", { ...line([[1]]), height: 0 }, RangeError],
    ["a height past the most px a plot may be", { ...line([[1]]), height: 1e301 }, RangeError],
    [
      "a format whose unit Intl refuses",
      { ...line([[1]]), y: { format: { style: "unit", unit: "" } } },
      RangeError,
    ],
    [
      "a format option that is a function",
      { ...line([[1]]), y: { format: { style: () => "x" } } },
      TypeError,
    ],
    ["a series shorter than its x", line([[1]], { x: [0, 1] }), TypeError],
    ["the old marks list", { marks: [{ mark: "line", x: [0], series: [] }] }, TypeError],
    ["two marks as a list", { data: seriesFrame([0], [[1]]), mark: [{ mark: "line" }] }, TypeError],
    ["a rule as the mark", { data: seriesFrame([0], [[1]]), mark: { mark: "rule" } }, TypeError],
    ["a linear y under dots", { ...dots, y: { type: "linear" } }, TypeError],
    [
      "a ref axis that is not x or y",
      { ...line([[1]]), refs: [{ key: "m", axis: "z" }] },
      TypeError,
    ],
    [
      "a ref label that is not a string",
      { ...line([[1]]), refs: [{ key: "m", label: 1 }] },
      TypeError,
    ],
    ["a ref with no key", { ...line([[1]]), refs: [{ label: "Median" }] }, TypeError],
    ["zero false under a rect", { ...rect([[1]]), y: { zero: false } }, TypeError],
    ["a domain on a band", { ...dots, y: { domain: [0, 1] } }, TypeError],
    ["a curve that is not linear or step", line([[1]], {}, { curve: "smooth" }), TypeError],
    [
      "a mark the chart does not draw",
      { data: seriesFrame([0], [[1]]), mark: { mark: "flow" } },
      TypeError,
    ],
    ["a repeated area x", area([[1, 2]], { x: [0, 0] }), RangeError],
    ["a negative value under an area", area([[1, -1]]), RangeError],
    ["an infinite value under an area", area([[Number.POSITIVE_INFINITY]]), RangeError],
    ["an area's y domain without 0", { ...area([[2]]), y: { domain: [1, 5] } }, RangeError],
    ["an area series shorter than its x", area([[1]], { x: [0, 1] }), TypeError],
    ["an area curve that is not linear or step", area([[1]], {}, { curve: "smooth" }), TypeError],
    [
      "an area arranged other than stack or share",
      area([[1], [2]], {}, { arrange: "group" }),
      TypeError,
    ],
    ["an area share of one series", area([[1]], {}, { arrange: "share" }), TypeError],
    [
      "an area share with a y domain",
      { ...area([[1], [2]], {}, { arrange: "share" }), y: { domain: [0, 1] } },
      TypeError,
    ],
    [
      "a negative value under an area share",
      area([[1], [-1]], {}, { arrange: "share" }),
      RangeError,
    ],
    ["zero false under an area", { ...area([[1]]), y: { zero: false } }, TypeError],
    ["a log y under an area", { ...area([[1]]), y: { type: "log" } }, TypeError],
    ["a note with no text", { ...line([[1]]), notes: [{ key: "n", text: " " }] }, TypeError],
    [
      "a note's text that is not a string",
      { ...line([[1]]), notes: [{ key: "n", text: 3 }] },
      TypeError,
    ],
    [
      "a note's side that is not one of four",
      { ...line([[1]]), notes: [{ key: "n", side: "top" }] },
      TypeError,
    ],
    ["a note encoding with no key", { ...line([[1]]), notes: [{ text: "Deploy" }] }, TypeError],
    ["a frame note with no at", line([[1]], { notes: [{ key: "n" } as never] }), TypeError],
    [
      "a frame note's at as a name",
      line([[1]], { notes: [{ key: "n", at: "Monday" } as never] }),
      TypeError,
    ],
    [
      "a frame note's at as a boolean",
      line([[1]], { notes: [{ key: "n", at: true } as never] }),
      TypeError,
    ],
    [
      "a frame note's non-finite at",
      line([[1]], { notes: [{ key: "n", at: Number.POSITIVE_INFINITY }] }),
      RangeError,
    ],
    ["a frame note's NaN at", line([[1]], { notes: [{ key: "n", at: Number.NaN }] }), RangeError],
    [
      "a note at 0 on a log x",
      { ...rect([[1]], { x1: [1], x2: [2], notes: [{ key: "n", at: 0 }] }), x: { type: "log" } },
      RangeError,
    ],
    ["a mark that is no object", { data: seriesFrame([0], [[1]]), mark: "rect" }, TypeError],
    [
      "an arrange that is not stack, group or share",
      rect([[1]], {}, { arrange: "side" }),
      TypeError,
    ],
    ["a share of one series", rect([[1]], {}, { arrange: "share" }), TypeError],
    ["a shape that is not bars or area", rect([[1]], {}, { shape: "steps" }), TypeError],
    ["an area grouped", rect([[1]], {}, { shape: "area", arrange: "group" }), TypeError],
    [
      "a series with no key",
      { data: { ...seriesFrame([0], []), series: [{ values: [1] }] }, mark: { mark: "line" } },
      TypeError,
    ],
    ["a value holding a string", line([["1" as never]]), TypeError],
    ["a scale type that does not exist", { ...line([[1]]), x: { type: "utc" } }, TypeError],
    ["a format that does not exist", { ...line([[1]]), x: { format: "bytes" } }, TypeError],
    ["a unit with no other form", { ...line([[1]]), y: { unit: { one: "post" } } }, TypeError],
  ])("%s throws its type", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names a domain that is not an array and a bigint format option", () => {
    const like = { 0: 0, 1: 10, length: 2 };
    for (const axis of ["x", "y"]) {
      expect(() => build({ ...line([[1, 2]]), [axis]: { domain: like } })).toThrow(
        `renderChart: ${axis}.domain must be an array of a low and a high`,
      );
    }
    expect(() => build({ ...line([[1]]), y: { format: { maximumFractionDigits: 1n } } })).toThrow(
      new TypeError(
        "renderChart: y.format.maximumFractionDigits must be a string, a number or a boolean",
      ),
    );
  });

  it("names a unit's form that is not a string or no plural form", () => {
    expect(() => build({ ...line([[1]]), y: { unit: { one: 5, other: "posts" } } })).toThrow(
      new TypeError("renderChart: y.unit.one must be a string"),
    );
    expect(() =>
      build({ ...dots, mark: { mark: "dot", unit: { few: Symbol("a"), other: "x" } } }),
    ).toThrow(new TypeError("renderChart: mark.unit.few must be a string"));
    expect(() =>
      build({ ...line([[1]]), y: { unit: { single: "post", other: "posts" } } }),
    ).toThrow(
      new TypeError(
        "renderChart: y.unit.single is no plural form; a unit takes zero, one, two, few, many and other",
      ),
    );
    const forms = { zero: "a", one: "b", two: "c", few: "d", many: "e", other: "f" };
    expect(build({ ...line([[1]]), y: { unit: forms } }).kind).toBe("line");
  });

  it("names the format Intl refuses and the most px a height may be", () => {
    expect(() => build({ ...line([[1]]), y: { format: { style: "unit", unit: "" } } })).toThrow(
      /^renderChart: y\.format holds options Intl refuses/u,
    );
    expect(() => build({ ...line([[1]]), y: { format: { style: "currency" } } })).toThrow(
      new TypeError(
        "renderChart: y.format holds options Intl refuses: Currency code is required with currency style.",
      ),
    );
    expect(() => build({ ...line([[1]]), height: 40_001 })).toThrow(
      new RangeError("renderChart: height must be a number of px above 0 and at most 40000"),
    );
    expect(build({ ...line([[1]]), height: 40_000 }).spec.height).toBe(40_000);
  });

  it("names the most rows a plot and the most days a calendar may hold", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}`);
    const rows = (n: number) => ({
      data: categories(names(n), [names(n).map(() => 1)]),
      mark: { mark: "bar" },
    });
    expect(MAX_ROWS).toBe(1_000);
    expect(() => build(rows(MAX_ROWS + 1))).toThrow(
      new RangeError(
        `renderChart: data.names must hold at most ${String(MAX_ROWS)} entries, the most rows a band plot holds`,
      ),
    );
    expect(build(rows(MAX_ROWS)).kind).toBe("bar");
    const strip = (n: number) => ({
      data: events(Object.fromEntries(names(n).map((name) => [name, []]))),
      mark: { mark: "dot" },
    });
    expect(() => build(strip(1_001))).toThrow(
      new RangeError(
        "renderChart: data.rows must hold at most 1000 entries, the most rows a strip holds",
      ),
    );
    expect(build(strip(1_000)).kind).toBe("timeline");
    const cells = (x: number, y: number) => ({
      data: grid(
        { names: names(x) },
        { names: names(y) },
        names(y).map(() => names(x).map(() => 1)),
      ),
      mark: { mark: "cell" },
    });
    expect(build(cells(1_001, 1)).kind).toBe("heatmap");
    expect(() => build(cells(1, 1_001))).toThrow(
      new RangeError(
        "renderChart: data.y.names must hold at most 1000 entries, the most rows a band plot holds",
      ),
    );
    expect(MAX_CALENDAR_DAYS).toBe(6_994);
    const days = (n: number, weekStart = 4) => ({
      data: calendar(
        0,
        Array.from({ length: n }, () => 1),
      ),
      mark: { mark: "cell", weekStart },
    });
    expect(() => build(days(MAX_CALENDAR_DAYS + 1))).toThrow(
      new RangeError(
        "renderChart: data.values must hold at most 6994 entries, the most days 1000 weeks hold at any week start",
      ),
    );
    // 1 January 1970 was a Thursday, so from a Friday week start its days
    // begin on a week's seventh day and 6,994 of them fill 1,000 weeks.
    expect(build(days(MAX_CALENDAR_DAYS, 5)).kind).toBe("calendar");
    // Two panels share the thousand weeks: 3,501 days from a Thursday are 501.
    const panels = (n: number) => ({
      mark: { mark: "cell", weekStart: 4 },
      facets: {
        panels: ["p", "q"].map((key) => ({
          key,
          name: key,
          data: calendar(
            0,
            Array.from({ length: n }, () => 1),
          ),
        })),
      },
    });
    expect(() => build(panels(3_501))).toThrow(
      new RangeError(
        "renderChart: the days of a calendar must fit in 500 weeks in each of 2 panels",
      ),
    );
    expect(build(panels(3_500)).kind).toBe("calendar");
  });

  // A series of bars standing apart or of boxes takes a sub-row of each row.
  it("names the most sub-rows a band's series may take, and the most series a slope names", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `r${String(i)}`);
    const ones = (n: number) => names(n).map(() => 1);
    const keys = (k: number) => names(k).map((key) => ({ key, slot: 1 }));
    const grouped = (n: number, k: number, arrange: "group" | "split" | "stack") => ({
      data: {
        ...categories(names(n), []),
        series: names(k).map((key) => ({ key, values: ones(n) })),
      },
      mark: { mark: "bar", arrange, keys: keys(k) },
    });
    const boxed = (n: number, k: number) => {
      const v = ones(n);
      return {
        data: boxes(
          names(n),
          names(k).map((key) => ({ key, low: v, q1: v, median: v, q3: v, high: v })),
        ),
        mark: { mark: "box", keys: keys(k) },
      };
    };
    expect(MAX_SUB_ROWS).toBe(2_500);
    // A box's sub-row is 16px, so chartdata's sub-rows fit in the plot's 40,000px ceiling.
    expect(MAX_SUB_ROWS * 16).toBeLessThanOrEqual(40_000);
    const subRows = new RangeError(
      "renderChart: data.series must take at most 2500 sub-rows, a sub-row per series in each row, since the plot is as tall as its rows",
    );
    for (const spec of [grouped(1_000, 3, "group"), grouped(1_000, 3, "split")]) {
      expect(() => build(spec)).toThrow(subRows);
    }
    expect(() => build(boxed(1_000, 3))).toThrow(
      new RangeError(
        "renderChart: data.series must hold at most 2 entries, a sub-row per series in each of its 1000 names, 2500 at most",
      ),
    );
    expect(build(grouped(1_000, 2, "group")).kind).toBe("groupedBar");
    expect(build(grouped(1_000, 3, "stack")).kind).toBe("stackedBar");
    expect(build(boxed(1_000, 2)).kind).toBe("box");
    const ends = (k: number) => ({
      data: {
        ...categories(["2005", "2015"], []),
        series: index(k).map((s) => ({ key: `s${String(s)}`, values: [s, s + 1] })),
      },
      mark: { mark: "slope", keys: index(k).map((s) => ({ key: `s${String(s)}`, slot: 1 })) },
    });
    expect(() => build(ends(1_001))).toThrow(
      new RangeError(
        "renderChart: data.series must hold at most 1000 entries, the most rows a band plot holds, since a slope draws each series on a line of its own",
      ),
    );
    expect(build(ends(1_000)).kind).toBe("slope");
  });

  const past = (field: string) =>
    new RangeError(
      `renderChart: ${field} must not take the data past 1000000 values, its samples, bins, bars, dots, cells, parts, links, refs and notes together`,
    );

  it("names the field that takes a spec past a million values", MILLION, () => {
    const zeros = (n: number) => new Array<number>(n).fill(0);
    const lines = (n: number, k: number, more: Partial<SeriesFrame> = {}) => ({
      data: seriesFrame(
        index(n),
        index(k).map(() => zeros(n)),
        more,
      ),
      mark: { mark: "line" },
    });
    expect(build(lines(500_000, 2)).kind).toBe("line");
    expect(() => build(lines(333_334, 3))).toThrow(past("data.series"));
    expect(() => build(lines(500_000, 2, { refs: [{ key: "zero", value: 0 }] }))).toThrow(
      past("data.refs"),
    );
  });

  it("names the row that takes a timeline past a million values", MILLION, () => {
    const zeros = (n: number) => new Array<number>(n).fill(0);
    const timeline = (last: number) => ({
      data: events({ a: zeros(600_000), b: zeros(last) }),
      mark: { mark: "dot" },
    });
    expect(build(timeline(400_000)).kind).toBe("timeline");
    expect(() => build(timeline(400_001))).toThrow(past("data.rows[1].at"));
  });

  it("charges no values for the page's words for the frame's keys, refs and notes", MILLION, () => {
    const lines = (n: number, k: number) =>
      seriesFrame(
        index(n),
        index(k).map(() => new Array<number>(n).fill(0)),
      );
    expect(() =>
      check({
        data: lines(500_000, 2),
        mark: { mark: "line" },
        notes: [{ key: "n" }],
        refs: [{ key: "r" }],
      }),
    ).not.toThrow();
    expect(() =>
      check({ data: lines(100_000, 10), mark: { mark: "line", keys: [{ key: "j", slot: 1 }] } }),
    ).not.toThrow();
  });

  it("counts a series with no samples as one value", MILLION, () => {
    const refs = (n: number) => index(n).map((i) => ({ key: `r${String(i)}`, value: 0 }));
    const empty = (n: number) => ({
      data: seriesFrame(
        [],
        index(9).map(() => []),
        { refs: refs(n) },
      ),
      mark: { mark: "line" },
    });
    expect(() => check(empty(MAX_VALUES - 9))).not.toThrow();
    expect(() => check(empty(MAX_VALUES - 8))).toThrow(past("data.refs"));
  });

  it("refuses a list of more entries than a spec holds values, before reading one", () => {
    const most = (field: string, n = 1_000_000, why = "the most values a frame holds") =>
      new RangeError(`renderChart: ${field} must hold at most ${String(n)} entries, ${why}`);
    expect(() => build(line([[]], { x: new Array(1_000_001) }))).toThrow(most("data.x"));
    expect(() =>
      build({
        data: { ...seriesFrame([], []), series: new Array(1_000_001) },
        mark: { mark: "line" },
      }),
    ).toThrow(most("data.series"));
    expect(() => build({ ...line([[1]]), refs: new Array(1_000_001) })).toThrow(most("refs"));
    expect(() =>
      build({ ...line([[1]]), mark: { mark: "line", keys: new Array(1_000_001) } }),
    ).toThrow(most("mark.keys"));
    // A binned axis holds a million bins, on one more edge.
    const edges = (n: number) => ({
      data: grid({ edges: new Array<number>(n) }, { names: ["a"] }, [[]]),
      mark: { mark: "cell" },
    });
    expect(() => build(edges(1_000_002))).toThrow(
      most("data.x.edges", 1_000_001, "a bin per value a frame holds, on one more edge"),
    );
    // A Proxy over an array passes Array.isArray and may claim any length.
    const nan = new Proxy([], {
      get: (target, key) => (key === "length" ? Number.NaN : Reflect.get(target, key)),
    });
    const strip = { data: events({ a: [], b: [0] }), mark: { mark: "dot" } };
    const rows = [{ key: "a", at: nan }, ...strip.data.rows.slice(1)];
    expect(() => build({ ...strip, data: { ...strip.data, rows } })).toThrow(
      most("data.rows[0].at"),
    );
  });

  // An array may lie about its entries after the door has counted them.
  it("builds from the lists as the door read them, once each", () => {
    const values = [1, 2];
    let pulls = 0;
    Object.defineProperty(values, Symbol.iterator, {
      *value() {
        for (let i = 0; i < 1_500_000; i++) {
          pulls++;
          yield 1;
        }
      },
    });
    const own = build({
      data: { ...seriesFrame([0, 1], []), series: [{ key: "a", values }] },
      mark: { mark: "line" },
    });
    expect(own.marks[0]).toMatchObject({ kind: "line", series: [{ y: [1, 2] }] });
    expect(pulls).toBe(0);

    let reads = 0;
    const x = new Proxy([0, 1, 2], {
      get: (target, key) => {
        if (key !== "length") {
          return Reflect.get(target, key) as unknown;
        }
        reads++;
        return reads === 1 ? 3 : 1_000_001;
      },
    });
    const growing = build(line([[1, 2, 3]], { x }));
    expect(growing.marks[0]).toMatchObject({ kind: "line", x: [0, 1, 2] });
    expect(reads).toBe(1);

    let gets = 0;
    const series = {
      key: "a",
      get values(): number[] {
        gets++;
        return gets === 1 ? [1, 2] : new Array<number>(1_500_000).fill(1);
      },
    };
    const swapped = build({
      data: { ...seriesFrame([0, 1], []), series: [series] },
      mark: { mark: "line" },
    });
    expect(swapped.marks[0]).toMatchObject({ kind: "line", series: [{ y: [1, 2] }] });
    expect(gets).toBe(1);
  });

  // A list is charged where it sits, before it is read.
  const counted = (entries: readonly unknown[]) => {
    const read = { n: 0 };
    const list = new Proxy([...entries], {
      get: (target, key) => {
        if (typeof key === "string" && /^\d+$/u.test(key)) {
          read.n++;
        }
        return Reflect.get(target, key) as unknown;
      },
    });
    return { list, read };
  };

  it("reads a list the panels' frames share only up to the ceiling", MILLION, () => {
    for (const mark of ["line", "area"]) {
      const shared = counted(index(181_819));
      const panels = index(11).map((k) => ({
        key: `p${String(k)}`,
        data: { ...seriesFrame([], []), x: shared.list },
      }));
      expect(() => build({ mark: { mark }, facets: { panels } }), mark).toThrow(
        past("facets.panels[5].data.x"),
      );
      expect(shared.read.n, mark).toBe(5 * 181_819);
    }
  });

  it("charges each series' samples before it copies them", MILLION, () => {
    const shared = counted(new Array<number>(500_000).fill(1));
    const data = {
      ...seriesFrame(index(500_000), []),
      series: index(3).map((s) => ({ key: `s${String(s)}`, values: shared.list })),
    };
    expect(() => build({ data, mark: { mark: "line" } })).toThrow(past("data.series"));
    expect(shared.read.n).toBe(0);
    const second = counted(new Array<number>(600_000).fill(0));
    const strip = {
      ...events({}),
      rows: [
        { key: "a", at: new Array<number>(600_000).fill(0) },
        { key: "b", at: second.list },
      ],
    };
    expect(() => build({ data: strip, mark: { mark: "dot" } })).toThrow(past("data.rows[1].at"));
    expect(second.read.n).toBe(0);
  });

  it("counts each tree part as one value", MILLION, () => {
    const parts = index(MAX_VALUES).map((i) => ({ key: `p${String(i)}`, value: 1 }));
    const data = tree({ parts }, { refs: [{ key: "r", value: 1 }] });
    expect(() => check({ data, mark: { mark: "tree" } })).toThrow(past("data.refs"));
  });

  it("refuses a timeline row whose instants are no array", () => {
    const strip = {
      ...events({}),
      rows: [
        { key: "a", at: { length: Number.NaN } },
        { key: "b", at: [0] },
      ],
    };
    expect(() => build({ data: strip, mark: { mark: "dot" } })).toThrow(
      new TypeError("renderChart: data.rows[0].at must be an array"),
    );
  });

  // Each list is a plain array, so a typed array or an object with a length
  // is a TypeError naming its field, whatever its length says.
  it.each<[string, (list: unknown) => unknown, string]>([
    ["a series frame's x", (x) => ({ ...line([]), data: { ...seriesFrame([], []), x } }), "data.x"],
    ["a bins frame's x1", (x1) => rect([[1]], { x1: x1 as number[] }), "data.x1"],
    [
      "a series' values",
      (values) => ({
        data: { ...seriesFrame([0], []), series: [{ key: "a", values }] },
        mark: { mark: "line" },
      }),
      "data.series[0].values",
    ],
    [
      "a categories frame's names",
      (names) => bars([1], { names: names as string[] }),
      "data.names",
    ],
    [
      "a grid's edges",
      (edges) => ({
        data: grid({ edges: edges as number[] }, { names: ["a"] }, [[1]]),
        mark: { mark: "cell" },
      }),
      "data.x.edges",
    ],
    [
      "a points group's names",
      (names) => ({
        data: points([{ key: "a", names: names as string[], x: [1], y: [1] }]),
        mark: { mark: "scatter" },
        x: { label: "x" },
        y: { label: "y" },
      }),
      "data.series[0].names",
    ],
    [
      "an events frame's rows",
      (rows) => ({ data: { ...events({}), rows }, mark: { mark: "dot" } }),
      "data.rows",
    ],
    [
      "a tree's parts",
      (parts) => ({ data: { ...tree({ parts: [] }), parts }, mark: { mark: "tree" } }),
      "data.parts",
    ],
    ["the mark's keys", (keys) => ({ ...line([[1]]), mark: { mark: "line", keys } }), "mark.keys"],
    ["the refs", (refs) => ({ ...line([[1]]), refs }), "refs"],
  ])("refuses %s that is no array", (_, spec, field) => {
    for (const list of [
      new Float64Array([1]),
      { length: 1, 0: "a" },
      { length: 1, 0: 1 },
      ...[-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e7, 2 ** 32].map((length) => ({
        length,
      })),
    ]) {
      expect(() => build(spec(list)), JSON.stringify(list)).toThrow(
        new TypeError(`renderChart: ${field} must be an array`),
      );
    }
  });

  it("refuses a sparse array's hole as the entry it stands for", () => {
    const holes = new Array<number>(2);
    expect(() => build(line([[1, 2]], { x: holes }))).toThrow(
      new TypeError("renderChart: data.x[0] must be a number"),
    );
    expect(() => build(line([holes]))).toThrow(
      new TypeError("renderChart: data.series[0].values[0] must be a number or null"),
    );
    expect(() => build(bars([1], { names: new Array<string>(1) }))).toThrow(
      new TypeError("renderChart: data.names[0] must be a string"),
    );
    expect(() =>
      build({
        data: grid({ edges: new Array<number>(2) }, { names: ["a"] }, [[1]]),
        mark: { mark: "cell" },
      }),
    ).toThrow(new TypeError("renderChart: data.x.edges[0] must be a number"));
  });

  it("names the rule it breaks", () => {
    expect(() => build(line([[1, 2]], { x: [0, 0] }))).toThrow(
      "renderChart: data.x[1] must strictly increase",
    );
  });

  it("draws a frame's notes at their x on the top edge, after its refs", () => {
    const m = build({
      ...rect([[1, 2]], {
        notes: [
          { key: "deploy", at: 0 },
          { key: "fix", at: 1.5 },
        ],
        refs: [{ key: "cap", value: 2 }],
      }),
      notes: [{ key: "fix", text: "Fix", side: "left" }],
    });
    expect(m.kind).toBe("column");
    expect(m.marks.map((k) => k.kind)).toEqual(["rect", "rule", "text", "text"]);
    expect(m.marks[2]).toEqual({ kind: "text", x: 0, text: "deploy", side: "above" });
    expect(m.marks[3]).toEqual({ kind: "text", x: 1.5, text: "Fix", side: "left" });
  });

  it("draws a timeline's note at its instant on the top edge", () => {
    const m = build({
      data: events({ ana: [0], bo: [1] }, { notes: [{ key: "Deploy", at: 1 }] }),
      mark: { mark: "dot" },
    });
    expect(m.marks[1]).toEqual({ kind: "text", x: 1, text: "Deploy", side: "above" });
  });

  it("is empty with notes and no data", () => {
    expect(build(rect([[0]], { notes: [{ key: "n", at: 0.5 }] })).empty).toBe(true);
  });

  it("takes any number of refs beside its one data mark", () => {
    const m = build(
      rect([[1]], {
        refs: [
          { key: "floor", value: 1 },
          { key: "cap", value: 2 },
        ],
      }),
    );
    expect(m.marks.map((k) => k.kind)).toEqual(["rect", "rule", "rule"]);
  });

  it("takes tied dot times and a NaN value as a gap", () => {
    const m = build(line([[1, Number.NaN, 3]], { refs: [{ key: "mid", value: 2 }] }));
    const first = m.marks[0];
    expect(first?.kind === "line" ? first.series[0]?.y : undefined).toEqual([1, null, 3]);
    expect(() => build({ data: events({ a: [1, 1, 2] }), mark: { mark: "dot" } })).not.toThrow();
  });
});

describe("the chart's kind", () => {
  const two = (mark: object, data: Partial<BinsFrame> = {}) => rect([[1], [2]], data, mark);
  const logBins = { x1: [1], x2: [2] };
  it.each<[string, unknown, string | undefined]>([
    ["two series of rects", two({}), "stackedColumn"],
    ["one series of rects", rect([[1]]), "column"],
    ["two series of rects grouped", two({ arrange: "group" }), "groupedColumn"],
    ["one series of rects grouped", rect([[1]], {}, { arrange: "group" }), "column"],
    ["two series of rects stacked to 100%", two({ arrange: "share" }), "shareColumn"],
    [
      "two series of rects grouped on a log x",
      { ...two({ arrange: "group" }, logBins), x: { type: "log" } },
      "histogram",
    ],
    [
      "two series of rects on a time x",
      { ...two({}), data: binsFrame([0], [1], [[1], [2]]) },
      "stackedColumn",
    ],
    ["one series of rects as area", rect([[1]], {}, { shape: "area" }), "area"],
    ["two series of rects as area", two({ shape: "area" }), "stackedArea"],
    [
      "two series of rects as area stacked to 100%",
      two({ shape: "area", arrange: "share" }),
      "shareArea",
    ],
    [
      "rects as area on a log x",
      { ...rect([[1]], logBins, { shape: "area" }), x: { type: "log" } },
      "histogram",
    ],
    ["rects on a log x", { ...rect([[1]], logBins), x: { type: "log" } }, "histogram"],
    ["one area series", area([[1]]), "area"],
    ["two area series", area([[1], [2]]), "stackedArea"],
    ["two stepped area series", area([[1], [2]], {}, { curve: "step" }), "stackedArea"],
    ["two area series stacked to 100%", area([[1], [2]], {}, { arrange: "share" }), "shareArea"],
    ["a line with no curve", line([[1]]), "line"],
    ["a step line", line([[1]], {}, { curve: "step" }), "step"],
    ["dot rows", { data: events({}), mark: { mark: "dot" } }, "timeline"],
  ])("%s is %s", (_, spec, kind) => {
    expect(build(spec).kind).toBe(kind);
  });
});

describe("empty", () => {
  it.each<[string, unknown, boolean]>([
    ["every value null", line([[null, Number.NaN]]), true],
    ["every rect 0", rect([[0, null, 0]]), true],
    ["every row empty", { data: events({ a: [] }), mark: { mark: "dot" } }, true],
    [
      "dots only outside the domain",
      { data: events({ a: [5] }), mark: { mark: "dot" }, x: { domain: [0, 1] } },
      true,
    ],
    ["refs alone", rect([[]], { refs: [{ key: "median", value: 1 }] }), true],
    ["one rect above 0", rect([[0, 1]]), false],
    ["one line value", line([[null, 0]]), false],
    [
      "every area sample 0 or a gap",
      area([
        [0, 1],
        [0, null],
      ]),
      true,
    ],
    [
      "one whole area stack above 0",
      area([
        [0, 1],
        [0, 2],
      ]),
      false,
    ],
  ])("%s: %s", (_, spec, empty) => {
    expect(build(spec).empty).toBe(empty);
  });
});

describe("a rect stacked to 100%", () => {
  const two = (a: Values, b: Values, more: object = {}) => ({
    ...rect([a, b], {}, { arrange: "share" }),
    ...more,
  });

  it("draws each value's share of its bucket, nothing where the total is 0", () => {
    const m = build(two([1, 0, null], [3, 0, 2]));
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
    const m = build(two([1500], [500]));
    expect(m.marks[0]?.kind === "rect" ? m.marks[0].series[0]?.y : undefined).toEqual([1500]);
    expect(m.yText(0.75)).toBe("75%");
    expect(m.amountText(1500)).toBe("1,500");
  });

  it("writes shares in the app's y format when it passes one", () => {
    const m = build(
      two([1], [2], { y: { format: { style: "percent", maximumFractionDigits: 1 } } }),
    );
    expect(m.yText(1 / 3)).toBe("33.3%");
  });

  it("writes amounts in the frame's unit, its shares as percents", () => {
    const m = build({
      ...two([90], [30]),
      data: binsFrame([0], [1], [[90], [30]], { unit: "seconds" }),
    });
    expect(m.yText(0.75)).toBe("75%");
    expect(m.amountText(90).replaceAll(/\s/gu, " ")).toBe("1 min, 30 sec");
  });

  it("names the rule a share of one series breaks", () => {
    expect(() => build(rect([[1]], {}, { arrange: "share" }))).toThrow(
      'renderChart: mark.arrange "share" needs two or more series, since one reads 100% everywhere',
    );
  });
});

describe("an area stacked to 100%", () => {
  const shared = (series: readonly Values[]) => {
    const m = build(area(series, {}, { arrange: "share" }));
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
    const m = build(
      area([
        [0, 1],
        [0, 1],
      ]),
    );
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
    expect(() => build(area([[1]], {}, { arrange: "share" }))).toThrow(
      'renderChart: mark.arrange "share" needs two or more series, since one reads 100% everywhere',
    );
    expect(() => build(area([[1], [2]], {}, { arrange: "group" }))).toThrow(
      'renderChart: mark.arrange must be "stack" or "share"',
    );
  });
});

// Two series "p" and "q" over names c0, c1, ....
const pair = (a: Values, b: Values, mark: object = {}) => ({
  data: {
    ...categories(
      a.map((_, i) => `c${String(i)}`),
      [],
    ),
    series: [
      { key: "p", values: [...a] },
      { key: "q", values: [...b] },
    ],
  },
  mark: { mark: "bar", ...mark },
});

const shareBars = (a: Values, b: Values, mark: object = {}) =>
  pair(a, b, { arrange: "share", ...mark });

describe("the bar mark", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["names that are numbers", bars([1], { names: [1] as never }), TypeError],
    [
      "a series without values",
      { data: { ...categories(["a"], []), series: [{ key: "a" }] }, mark: { mark: "bar" } },
      TypeError,
    ],
    ["values shorter than its names", bars([1], { names: ["a", "b"] }), TypeError],
    ["labels that are not a boolean", bars([1], {}, { labels: 1 }), TypeError],
    ["an arrange it does not draw", bars([1], {}, { arrange: "side" }), TypeError],
    ["an empty name", bars([1], { names: [""] }), RangeError],
    ["a repeated name", bars([1, 2], { names: ["a", "a"] }), RangeError],
    ["an infinite value", bars([Number.POSITIVE_INFINITY]), RangeError],
    ["a log x", { ...bars([1]), x: { type: "log" } }, TypeError],
    ["a time x", { ...bars([1]), x: { type: "time" } }, TypeError],
    ["zero false", { ...bars([1]), x: { zero: false } }, TypeError],
    ["an x domain without 0", { ...bars([2]), x: { domain: [1, 5] } }, RangeError],
    ["a linear y", { ...bars([1]), y: { type: "linear" } }, TypeError],
    ["a y domain", { ...bars([1]), y: { domain: [0, 1] } }, TypeError],
    ["a height", { ...bars([1]), height: 200 }, TypeError],
    ["a height under dot rows", { ...dots, height: 200 }, TypeError],
    [
      "a ref on y",
      { ...bars([1], { refs: [{ key: "cap", value: 1 }] }), refs: [{ key: "cap", axis: "y" }] },
      TypeError,
    ],
    ["a bar on a bins frame", { ...rect([[1]]), mark: { mark: "bar" } }, TypeError],
    ["a share of one series", bars([1], {}, { arrange: "share" }), TypeError],
    ["labels under a share", shareBars([1], [2], { labels: true }), TypeError],
    ["labels off under a share", shareBars([1], [2], { labels: false }), TypeError],
    ["a negative value under a share", shareBars([1], [-2]), RangeError],
    ["a negative value under a split", pair([1], [-2], { arrange: "split" }), RangeError],
    [
      "a negative value under a split of one series",
      bars([1, -2], {}, { arrange: "split" }),
      RangeError,
    ],
    [
      "a below slot that is not a number",
      bars([-1], {}, { keys: [{ key: "a", below: "2" }] }),
      TypeError,
    ],
    ["a below slot of 10", bars([-1], {}, { keys: [{ key: "a", below: 10 }] }), RangeError],
    [
      "a below slot beside another series",
      pair([1], [-2], { keys: [{ key: "q", below: 3 }] }),
      TypeError,
    ],
    ["an x domain under a share", { ...shareBars([1], [2]), x: { domain: [0, 1] } }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the height rule", () => {
    expect(() => build({ ...bars([1]), height: 200 })).toThrow(
      "renderChart: height has no place on a dot, bar, point or box chart, which is as tall as its rows",
    );
  });

  it("keeps the frame's order on a band y, its values, and gaps as null", () => {
    const m = build(bars([3, null, Number.NaN, 1], { names: ["d", "b", "c", "a"] }));
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
    const m = build(pair([1], [2], { labels: false, keys: [{ key: "q", slot: 4 }] }));
    expect(m.kind).toBe("stackedBar");
    expect(m.marks[0]).toMatchObject({ labels: false, series: [{ slot: 1 }, { slot: 4 }] });
  });

  it("is a grouped bar chart from two series, and a plain one grouped with one", () => {
    expect(build(pair([1], [2], { arrange: "group" }))).toMatchObject({
      kind: "groupedBar",
      marks: [{ arrange: "group" }],
    });
    expect(build(bars([1], {}, { arrange: "group" }))).toMatchObject({
      kind: "bar",
      marks: [{ arrange: "stack" }],
    });
  });

  it("is a split bar chart from two series with value labels, and a plain one split with one", () => {
    expect(build(pair([1, 0], [3, 0], { arrange: "split" }))).toMatchObject({
      kind: "splitBar",
      marks: [{ arrange: "split", labels: true }],
    });
    expect(build(bars([1], {}, { arrange: "split" }))).toMatchObject({
      kind: "bar",
      marks: [{ arrange: "stack" }],
    });
  });

  it("names the arrangements a bar draws", () => {
    expect(() => build(bars([1], {}, { arrange: "side" }))).toThrow(
      'renderChart: mark.arrange must be "stack", "group", "share", "split", "diverge" or "mirror"',
    );
  });

  it("is a back-to-back bar chart from exactly two series, with value labels", () => {
    const pyramid = pair([1, 2], [3, 4], { arrange: "mirror" });
    const m = build(pyramid);
    expect(m.kind).toBe("mirrorBar");
    expect(m.marks[0]).toMatchObject({ arrange: "mirror", labels: true });
    expect(build({ ...pyramid, mark: { ...pyramid.mark, labels: false } }).marks[0]).toMatchObject({
      labels: false,
    });
    for (const values of [
      [[1, 2]],
      [
        [1, 2],
        [1, 2],
        [1, 2],
      ],
    ]) {
      expect(() => build({ data: categories(["c0", "c1"], values), mark: pyramid.mark })).toThrow(
        'renderChart: mark.arrange "mirror" needs exactly two series, one each side of its spine',
      );
    }
    expect(() => build(pair([1], [-2], { arrange: "mirror" }))).toThrow(
      "renderChart: a mirrored bar's x cannot be negative",
    );
  });

  const SCALE = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
  const likert = (mark: object = {}, count = 5) => ({
    data: {
      ...categories(["Item 1"], []),
      series: SCALE.slice(0, count).map((key, k) => ({ key, values: [10 + k] })),
    },
    mark: { mark: "bar", arrange: "diverge", left: 2, centre: true, ...mark },
  });

  it("is a diverging stacked bar chart, its left count and centre in the model, no value labels", () => {
    const m = build(likert());
    expect(m.kind).toBe("divergingStackedBar");
    expect(m.marks[0]).toMatchObject({ arrange: "diverge", left: 2, centre: true, labels: false });
    expect(build(likert({ centre: false })).marks[0]).toMatchObject({ left: 2, centre: false });
  });

  it("refuses left and centre outside diverge, and labels under it", () => {
    expect(() => build(bars([1], {}, { left: 1 }))).toThrow(
      'renderChart: mark.left has no place outside arrange "diverge"',
    );
    expect(() => build(bars([1], {}, { centre: true }))).toThrow(
      'renderChart: mark.centre has no place outside arrange "diverge"',
    );
    expect(() => build(likert({ centre: "yes" }))).toThrow(
      "renderChart: mark.centre must be a boolean",
    );
    for (const labels of [true, false]) {
      expect(() => build(likert({ labels }))).toThrow(
        'renderChart: mark.labels has no place under arrange "diverge", whose bars run either side of 0',
      );
    }
  });

  it("needs a series each side of 0, and a third to straddle it with centre", () => {
    expect(() => build(likert({ centre: false, left: 1 }, 1))).toThrow(
      'renderChart: mark.arrange "diverge" needs two or more series, one each side of 0',
    );
    expect(() => build(likert({ left: 1 }, 2))).toThrow(
      'renderChart: mark.arrange "diverge" with centre needs three or more series: left, centre and right',
    );
  });

  it("needs left, a whole number leaving a right series and the centre one", () => {
    expect(() => build(likert({ left: undefined }))).toThrow(TypeError);
    expect(() => build(likert({ left: "2" }))).toThrow(
      'renderChart: mark.left must be a number: how many series lie left of 0 under arrange "diverge"',
    );
    for (const left of [0, 1.5, 4]) {
      expect(() => build(likert({ left }))).toThrow(
        "renderChart: mark.left must be a whole number from 1 to 3, leaving a series to straddle 0 and one right of 0",
      );
    }
    expect(() => build(likert({ left: 5, centre: false }))).toThrow(
      "renderChart: mark.left must be a whole number from 1 to 4, leaving a series right of 0",
    );
    expect(build(likert({ left: 3 })).kind).toBe("divergingStackedBar");
    expect(build(likert({ left: 4, centre: false })).kind).toBe("divergingStackedBar");
  });

  it("is a 100% stacked bar chart from two series, with no value labels", () => {
    const m = build(shareBars([1, 0], [3, 0]));
    expect(m.kind).toBe("shareBar");
    expect(m.marks[0]).toMatchObject({ arrange: "share", labels: false });
    expect(m.amountText(1234.5)).toBe("1,234.5");
  });

  it("is a diverging bar chart from one series with a value below 0, signing every value but 0", () => {
    const m = build({
      data: { ...categories(["a", "b"], []), series: [{ key: "change", values: [0.16, -0.143] }] },
      mark: { mark: "bar", keys: [{ key: "change", name: "Change", slot: 2, below: 5 }] },
      x: { format: "percent" },
    });
    expect(m.kind).toBe("divergingBar");
    expect(m.marks[0]).toMatchObject({ series: [{ name: "Change", slot: 2, below: 5 }] });
    expect([m.xText(0.16), m.xText(-0.143), m.xText(0)]).toEqual(["+16%", "-14%", "0%"]);
    expect(m.amountText(0.16)).toBe("+16%");
  });

  it("stays a bar chart, unsigned, with no value below 0 or with two series", () => {
    const plain = build({ ...bars([0.16, 0, null]), x: { format: "percent" } });
    expect(plain.kind).toBe("bar");
    expect(plain.xText(0.16)).toBe("16%");
    const two = build(pair([3], [-2]));
    expect(two.kind).toBe("stackedBar");
    expect(two.xText(3)).toBe("3");
  });

  it("is empty when every value is 0 or a gap, or there are no rows", () => {
    expect(build(bars([0, null])).empty).toBe(true);
    expect(build(bars([])).empty).toBe(true);
    expect(build(bars([0, 2])).empty).toBe(false);
  });
});

// A series per values list, keyed "a", "b", ..., over names c0, c1, ....
const dotPlot = (
  series: readonly Values[],
  data: Partial<CategoriesFrame> = {},
  mark: object = {},
) => ({
  data: categories(
    (series[0] ?? []).map((_, i) => `c${String(i)}`),
    series,
    data,
  ),
  mark: { mark: "point", ...mark },
});

describe("the point mark", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["names that are numbers", dotPlot([[1]], { names: [1] as never }), TypeError],
    [
      "a series without values",
      { data: { ...categories(["a"], []), series: [{ key: "a" }] }, mark: { mark: "point" } },
      TypeError,
    ],
    ["values shorter than its names", dotPlot([[1]], { names: ["a", "b"] }), TypeError],
    ["an empty name", dotPlot([[1]], { names: [""] }), RangeError],
    ["a repeated name", dotPlot([[1, 2]], { names: ["a", "a"] }), RangeError],
    ["an infinite value", dotPlot([[Number.NEGATIVE_INFINITY]]), RangeError],
    ["a value of 0 on a log x", { ...dotPlot([[0, 4]]), x: { type: "log" } }, RangeError],
    ["a band x", { ...dotPlot([[1]]), x: { type: "band" } }, TypeError],
    ["zero on a log x", { ...dotPlot([[1]]), x: { type: "log", zero: true } }, TypeError],
    ["zero on a time x", { ...dotPlot([[1]]), x: { type: "time", zero: false } }, TypeError],
    ["a linear y", { ...dotPlot([[1]]), y: { type: "linear" } }, TypeError],
    ["a height", { ...dotPlot([[1]]), height: 200 }, TypeError],
    [
      "a ref on y",
      {
        ...dotPlot([[1]], { refs: [{ key: "cap", value: 1 }] }),
        refs: [{ key: "cap", axis: "y" }],
      },
      TypeError,
    ],
    ["a point on a series frame", { ...line([[1]]), mark: { mark: "point" } }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ ...dotPlot([[1]]), x: { type: "log", zero: true } })).toThrow(
      "renderChart: a log x has no zero to hold",
    );
    expect(() => build({ ...dotPlot([[-1, 4]]), x: { type: "log" } })).toThrow(
      "renderChart: a point's x must be above 0 on a log x",
    );
    expect(() => build({ ...dotPlot([[1]]), mark: { mark: "plot" } })).toThrow(
      'renderChart: mark.mark must be "rect", "line", "area", "dot", "bar", "point", "slope", "scatter", "cell", "box", "pie" or "tree"',
    );
  });

  it("keeps the frame's order on a band y, its values and slots, and gaps as null", () => {
    const m = build({
      data: {
        ...categories(["Holy See", "Monaco", "Japan"], []),
        series: [
          { key: "female", values: [60.4, Number.NaN, 51.1] },
          { key: "male", values: [54.5, 53.1, null] },
        ],
      },
      mark: {
        mark: "point",
        keys: [
          { key: "female", name: "Female" },
          { key: "male", name: "Male", slot: 5 },
        ],
      },
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
    expect(build(dotPlot([[null, null]])).empty).toBe(true);
    expect(build(dotPlot([])).empty).toBe(true);
    expect(build({ ...dotPlot([[5, 25]]), x: { domain: [10, 20] } }).empty).toBe(true);
    expect(build({ ...dotPlot([[5, 20]]), x: { domain: [10, 20] } }).empty).toBe(false);
    expect(build(dotPlot([[0, null]])).empty).toBe(false);
  });

  it("writes instants on a time x", () => {
    const at = Date.UTC(2026, 10, 11, 8);
    const m = build({ ...dotPlot([[at, at + 3_600_000]]), x: { type: "time" } });
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
  ] as const)("refuses %s", (_, mark, series) => {
    expect(() => build(dotPlot(series, {}, mark))).toThrow(TypeError);
  });

  it("names the rules it breaks", () => {
    expect(() => build(dotPlot([[1]], {}, { link: "range" }))).toThrow(
      'renderChart: mark.link "range" needs exactly two series, the two ends it joins',
    );
    expect(() => build(dotPlot([[1], [2]], {}, { link: "dumbbell" }))).toThrow(
      'renderChart: mark.link must be "range" or "arrow"',
    );
  });

  it("keeps the link, names the kind, and gives a range's gap and an arrow's change", () => {
    const range = build(dotPlot(two, {}, { link: "range" }));
    const arrow = build(dotPlot(two, {}, { link: "arrow" }));
    const plain = build(dotPlot(two));
    expect([range.kind, arrow.kind, plain.kind]).toEqual(["rangePlot", "arrowPlot", "dotPlot"]);
    const [r, a, d] = [range, arrow, plain].map((m) => m.marks[0] as PointModel);
    expect([r?.link, a?.link, d?.link]).toEqual(["range", "arrow", undefined]);
    // A range's gap is the distance either way; an arrow's change keeps its sign.
    const reversed = build(dotPlot([[163_500], [128_700]], {}, { link: "range" }))
      .marks[0] as PointModel;
    expect(pointLink(reversed, 0)).toBe(34_800);
    expect([0, 1, 2].map((i) => pointLink(r as PointModel, i))).toEqual([34_800, 14_250, null]);
    const back = build(dotPlot([[5.8], [2.1]], {}, { link: "arrow" }));
    expect(pointLink(back.marks[0] as PointModel, 0)).toBeCloseTo(-3.7, 10);
    expect(pointLink(a as PointModel, 2)).toBeNull();
    expect(pointLink(d as PointModel, 0)).toBeNull();
  });
});

describe("refs and notes on bar and point rows", () => {
  const two = (arrange: "split" | "diverge" | "mirror", data: Partial<CategoriesFrame> = {}) => ({
    data: categories(
      ["c0", "c1"],
      [
        [1, 2],
        [3, 4],
      ],
      data,
    ),
    mark: { mark: "bar", arrange, ...(arrange === "diverge" ? { left: 1 } : {}) },
  });
  const goal = (value: number) => ({ refs: [{ key: "goal", value }] });
  const best = { notes: [{ key: "Best", at: 2 }] };

  it.each(["split", "diverge", "mirror"] as const)(
    "refuses a ref below 0 and gives a note in the summary under %s",
    (arrange) => {
      expect(() => build(two(arrange, goal(-1)))).toThrow(
        `renderChart: a rule under arrange "${arrange}" cannot be below 0`,
      );
      const m = build(two(arrange, { ...goal(0), ...best }));
      expect(m.marks.map((k) => k.kind)).toEqual(["bar", "rule"]);
      expect(m.unplaced).toEqual({ rules: [], notes: [{ text: "Best", at: 2 }] });
    },
  );

  it("draws a note at its x under a split of one series, which is a plain bar", () => {
    const one = build(bars([1, 2], best, { arrange: "split" }));
    expect(one.marks[1]).toEqual({ kind: "text", x: 2, text: "Best", side: "above" });
  });

  it("keeps a ref below 0 beside a stack, whose bars run either way", () => {
    const m = build(bars([1, -2], goal(-1)));
    expect(m.marks[1]).toMatchObject({ place: { at: -1 } });
  });

  it("draws a bar's, a point's and a box's note at its x on the top edge", () => {
    const five = [1, 2, 3, 4, 5].map((v) => [v]);
    const [low, q1, median, q3, high] = five as [number[], number[], number[], number[], number[]];
    for (const spec of [
      bars([1, 2], best),
      dotPlot([[1, 2]], best),
      {
        data: boxes(["a"], [{ key: "a", low, q1, median, q3, high }], best),
        mark: { mark: "box" },
      },
    ]) {
      expect(build(spec).marks[1]).toEqual({ kind: "text", x: 2, text: "Best", side: "above" });
    }
  });
});

// Columns 2005 and 2015, a series per values list keyed "a", "b", ....
const slope = (
  series: readonly Values[],
  data: Partial<CategoriesFrame> = {},
  mark: object = {},
) => ({
  data: categories(["2005", "2015"], series, data),
  mark: { mark: "slope", ...mark },
});

describe("the slope mark", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["one column", slope([[1]], { names: ["2005"] }), TypeError],
    ["three columns", slope([[1, 2, 3]], { names: ["a", "b", "c"] }), TypeError],
    ["a column of a number", slope([[1, 2]], { names: ["2005", 2015 as never] }), TypeError],
    ["an empty column name", slope([[1, 2]], { names: ["", "2015"] }), RangeError],
    ["a repeated column name", slope([[1, 2]], { names: ["2005", "2005"] }), RangeError],
    ["a series of one value", slope([[1]]), TypeError],
    ["a series of three values", slope([[1, 2, 3]]), TypeError],
    [
      "two series of one name",
      slope(
        [
          [1, 2],
          [3, 4],
        ],
        {},
        {
          keys: [
            { key: "a", name: "Cats" },
            { key: "b", name: "Cats" },
          ],
        },
      ),
      RangeError,
    ],
    [
      "a repeated series key",
      slope([[1, 2]], {
        series: [
          { key: "a", values: [1, 2] },
          { key: "a", values: [3, 4] },
        ],
      }),
      RangeError,
    ],
    ["an x scale", { ...slope([[1, 2]]), x: {} }, TypeError],
    ["a log y", { ...slope([[1, 2]]), y: { type: "log" } }, TypeError],
    ["a band y", { ...slope([[1, 2]]), y: { type: "band" } }, TypeError],
    [
      "a ref on x",
      {
        ...slope([[1, 2]], { refs: [{ key: "then", value: 0 }] }),
        refs: [{ key: "then", axis: "x" }],
      },
      TypeError,
    ],
    ["an infinite value", slope([[1, Number.POSITIVE_INFINITY]]), RangeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build({ ...slope([[1, 2]]), x: {} })).toThrow(
      "renderChart: a slope takes no x scale; its mark names its two columns",
    );
    expect(() => build(slope([[1, 2]], { names: ["2005", "2005"] }))).toThrow(
      'renderChart: data.names[1] must not repeat "2005"',
    );
    expect(() => build(slope([[1]], { names: ["2005"] }))).toThrow(
      "renderChart: data.names must hold exactly two names, a slope's columns left to right",
    );
    expect(() =>
      build(
        slope(
          [
            [1, 2],
            [3, 4],
          ],
          {},
          { keys: [{ key: "a", name: "b" }] },
        ),
      ),
    ).toThrow("renderChart: mark.keys must give each series of a slope its own name");
  });

  it("takes its columns from the frame's names, its values and slots, and gaps as null", () => {
    const m = build({
      data: {
        ...categories(["2005", "2015"], [], { refs: [{ key: "target", value: 40 }] }),
        series: [
          { key: "cats", values: [50, 34] },
          { key: "dogs", values: [Number.NaN, 31] },
        ],
      },
      mark: {
        mark: "slope",
        keys: [
          { key: "cats", name: "Cats" },
          { key: "dogs", name: "Dogs", slot: 4 },
        ],
      },
    });
    expect(m.marks[0]).toEqual({
      kind: "slope",
      columns: ["2005", "2015"],
      series: [
        { name: "Cats", slot: 1, y: [50, 34] },
        { name: "Dogs", slot: 4, y: [null, 31] },
      ],
    });
    expect(m.marks[1]).toMatchObject({ kind: "rule", axis: "y", value: 40, label: "target" });
    expect(m.kind).toBe("slope");
    expect([m.xText(0), m.xText(1)]).toEqual(["2005", "2015"]);
    expect(m.xSpan(0, 1).map((p) => p.text)).toEqual(["2005", "2015"]);
    expect(m.amountText(34)).toBe("34");
  });

  it("is empty when every end is null", () => {
    expect(build(slope([[null, null]])).empty).toBe(true);
    expect(build(slope([[null, 0]])).empty).toBe(false);
  });

  it("gives its notes in the summary, since its x is no value", () => {
    const m = build({
      ...slope([[1, 2]], { notes: [{ key: "high", at: 1 }] }),
      notes: [{ key: "high", text: "New high" }],
    });
    expect(m.marks.map((k) => k.kind)).toEqual(["slope"]);
    expect(m.unplaced.notes).toEqual([{ text: "New high", at: 1 }]);
  });

  it("takes a chart with no x scale for every other mark too", () => {
    expect(build(line([[1, 2]])).x).toMatchObject({ type: "linear", lo: 0, hi: 1 });
  });
});

interface Group {
  readonly names: readonly string[];
  readonly x: Values;
  readonly y: Values;
  readonly r?: Values;
}

// A points group per entry, keyed "s0", "s1", ...; units of r only when the
// first group has sizes.
const scatter = (groups: readonly Group[], more: object = {}, data: Partial<PointsFrame> = {}) => ({
  data: points(
    groups.map((g, k) => ({
      key: `s${String(k)}`,
      names: [...g.names],
      x: [...g.x],
      y: [...g.y],
      ...(g.r === undefined ? {} : { r: [...g.r] }),
    })),
    data,
  ),
  mark: { mark: "scatter" },
  ...measures,
  ...more,
});

const measures = { x: { label: "GDP per capita" }, y: { label: "Life expectancy" } };
const one = (x: number | null, y: number | null): Group[] => [{ names: ["Japan"], x: [x], y: [y] }];

describe("the scatter mark", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["no x label", scatter(one(1, 2), { x: undefined }), TypeError],
    ["no y label", scatter(one(1, 2), { y: undefined }), TypeError],
    ["an empty label", scatter(one(1, 2), { x: { label: "" } }), TypeError],
    ["names of another length", scatter([{ names: ["a", "b"], x: [1], y: [2] }]), TypeError],
    ["y of another length", scatter([{ names: ["a"], x: [1], y: [2, 3] }]), TypeError],
    ["a name that is not a string", scatter([{ names: [7 as never], x: [1], y: [2] }]), TypeError],
    [
      "a group with no names",
      { ...scatter([]), data: { ...points([]), series: [{ key: "a", x: [1], y: [2] }] } },
      TypeError,
    ],
    ["an empty dot name", scatter([{ names: [""], x: [1], y: [2] }]), RangeError],
    [
      "a dot name repeated in another group",
      scatter([
        { names: ["Japan"], x: [1], y: [2] },
        { names: ["Japan"], x: [3], y: [4] },
      ]),
      RangeError,
    ],
    [
      "a tenth group with no slot",
      scatter(index(10).map((k) => ({ names: [`d${String(k)}`], x: [1], y: [2] }))),
      RangeError,
    ],
    ["a time x", scatter(one(1, 2), { x: { label: "a", type: "time" } }), TypeError],
    ["a time y", scatter(one(1, 2), { y: { label: "b", type: "time" } }), TypeError],
    ["a band y", scatter(one(1, 2), { y: { label: "b", type: "band" } }), TypeError],
    [
      "zero on a log x",
      scatter(one(1, 2), { x: { label: "a", type: "log", zero: true } }),
      TypeError,
    ],
    [
      "zero on a log y",
      scatter(one(1, 2), { y: { label: "b", type: "log", zero: false } }),
      TypeError,
    ],
    ["an infinite x", scatter(one(Number.POSITIVE_INFINITY, 2)), RangeError],
    ["an infinite y", scatter(one(1, Number.NEGATIVE_INFINITY)), RangeError],
    ["an x of 0 on a log x", scatter(one(0, 2), { x: { label: "a", type: "log" } }), RangeError],
    [
      "a negative y on a log y",
      scatter(one(1, -2), { y: { label: "b", type: "log" } }),
      RangeError,
    ],
    [
      "a scatter on a series frame",
      { ...line([[1]]), mark: { mark: "scatter" }, ...measures },
      TypeError,
    ],
    [
      "a unit on x",
      scatter(one(1, 2), { x: { label: "a", unit: { other: "dollars" } } }),
      TypeError,
    ],
    ["a unit on y", scatter(one(1, 2), { y: { label: "b", unit: { other: "years" } } }), TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build(scatter(one(1, 2), { x: undefined }))).toThrow(
      "renderChart: x.label is required on a scatter, whose readings name each measure by it",
    );
    expect(() =>
      build(scatter(one(1, 2), { y: { label: "b", unit: { other: "years" } } })),
    ).toThrow(
      "renderChart: y.unit has no place on a scatter, whose readings name each measure by its label; the mark's unit names the dots",
    );
    expect(() =>
      build(
        scatter([
          { names: ["Japan"], x: [1], y: [2] },
          { names: ["Japan"], x: [3], y: [4] },
        ]),
      ),
    ).toThrow(/^renderChart: data\.series\[1\]\.names\[0\] must not repeat "Japan"/u);
    expect(() => build(scatter(one(1, 2), { x: { label: "a", type: "time" } }))).toThrow(
      "renderChart: a scatter's x is linear or log; a value over time is a line",
    );
  });

  it("keeps each group's dots with their slots, gaps as null, and shows those it places", () => {
    const m = build({
      data: points([
        { key: "europe", names: ["Albania", "Andorra", "Austria"], x: [2, null, 12], y: [8, 9, 7] },
        { key: "asia", names: ["Japan", "Laos"], x: [5, Number.NaN], y: [Number.NaN, 4] },
      ]),
      mark: {
        mark: "scatter",
        unit: { one: "country", other: "countries" },
        keys: [
          { key: "europe", name: "Europe" },
          { key: "asia", name: "Asia", slot: 6 },
        ],
      },
      x: { label: "a", domain: [0, 10] },
      y: { label: "b" },
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
      at: new Map([[2, new Map([[8, { series: 0, i: 0 }]])]]),
    });
    expect(m.kind).toBe("scatter");
    expect(m.empty).toBe(false);
  });

  it("is empty when no dot has both its values", () => {
    expect(build(scatter(one(null, 2))).empty).toBe(true);
    expect(build(scatter(one(0, 0))).empty).toBe(false);
  });

  it("draws a note at its x on the top edge, and its ref on y by default", () => {
    const m = build(
      scatter(one(1, 2), {}, { notes: [{ key: "n", at: 1 }], refs: [{ key: "r", value: 2 }] }),
    );
    expect(m.marks.slice(1)).toMatchObject([
      { kind: "rule", axis: "y", value: 2 },
      { kind: "text", x: 1, text: "n" },
    ]);
  });
});

const sized = { r: { label: "Population" } };
const bubble = (r: Values, x: Values = r.map(() => 1), more: object = sized) =>
  scatter([{ names: r.map((_, i) => `d${String(i)}`), x, y: r.map(() => 2), r }], more);

describe("the scatter mark's sizes", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    [
      "r on one group and not another",
      scatter(
        [
          { names: ["a"], x: [1], y: [2], r: [3] },
          { names: ["b"], x: [1], y: [2] },
        ],
        sized,
      ),
      TypeError,
    ],
    [
      "r of another length",
      scatter([{ names: ["a"], x: [1], y: [2], r: [3, 4] }], sized),
      TypeError,
    ],
    [
      "r with no unit for it",
      scatter([{ names: ["a"], x: [1], y: [2], r: [3] }], sized, {
        units: { x: "none", y: "none" },
      }),
      TypeError,
    ],
    ["no r label", bubble([3], undefined, {}), TypeError],
    ["an r scale beside no r", scatter(one(1, 2), sized), TypeError],
    ["an r scale beside a line", { ...line([[1]]), r: { label: "c" } }, TypeError],
    ["a log r", bubble([3], undefined, { r: { label: "c", type: "log" } }), TypeError],
    ["zero on r", bubble([3], undefined, { r: { label: "c", zero: true } }), TypeError],
    ["reverse on r", bubble([3], undefined, { r: { label: "c", reverse: true } }), TypeError],
    [
      "a unit on r",
      bubble([3], undefined, { r: { label: "c", unit: { other: "people" } } }),
      TypeError,
    ],
    ["a negative r", bubble([-1]), RangeError],
    ["an infinite r", bubble([Number.POSITIVE_INFINITY]), RangeError],
    [
      "an r domain from above 0",
      bubble([3], undefined, { r: { label: "c", domain: [1, 10] } }),
      RangeError,
    ],
    [
      "an r past its passed domain",
      bubble([11], undefined, { r: { label: "c", domain: [0, 10] } }),
      RangeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build(bubble([3], undefined, {}))).toThrow(
      "renderChart: r.label is required on a scatter, whose readings name each measure by it",
    );
    expect(() => build(scatter(one(1, 2), sized))).toThrow(
      "renderChart: an r scale sizes a scatter's dots, and none carries r",
    );
    expect(() => build(bubble([11], undefined, { r: { label: "c", domain: [0, 10] } }))).toThrow(
      "renderChart: a scatter's r must lie inside r.domain",
    );
  });

  it("sizes from 0 to the largest r of a placed dot, or to its passed domain", () => {
    const m = build(bubble([3, 8, 20], [1, 2, null]));
    expect(m.kind).toBe("bubble");
    expect((m.marks[0] as ScatterModel).size).toEqual({ hi: 8, format: undefined });
    const passed = build(bubble([3], undefined, { r: { label: "c", domain: [0, 50] } }));
    expect((passed.marks[0] as ScatterModel).size?.hi).toBe(50);
    // Every size 0 has no high end to reach, so it spans 0 to 1.
    expect((build(bubble([0, 0])).marks[0] as ScatterModel).size?.hi).toBe(1);
  });

  it("writes sizes in seconds as durations when units.r is seconds", () => {
    const m = build(
      scatter([{ names: ["a"], x: [1], y: [2], r: [90] }], sized, {
        units: { x: "none", y: "none", r: "seconds" },
      }),
    );
    expect(m.rText(90).replaceAll(/\s/gu, " ")).toBe("1 min, 30 sec");
  });

  it("shows a bubble of size 0, and not one with no size", () => {
    const m = build(bubble([0, null, Number.NaN, 4]));
    expect((m.marks[0] as ScatterModel).shown).toEqual([[0, 3]]);
    expect(build(bubble([null])).empty).toBe(true);
  });

  it("draws bubbles beside a group with no points and no r, as chartdata sends it", () => {
    const m = build(
      scatter(
        [
          { names: ["a"], x: [1], y: [2], r: [3] },
          { names: [], x: [], y: [] },
        ],
        sized,
      ),
    );
    expect(m.kind).toBe("bubble");
    expect((m.marks[0] as ScatterModel).shown).toEqual([[0], []]);
  });

  it("draws bubbles largest first across every group, ties in group then the frame's order", () => {
    const m = build(
      scatter(
        [
          { names: ["a", "b", "c"], x: [1, 1, 1], y: [1, 1, 1], r: [2, 9, 2] },
          { names: ["d", "e"], x: [1, 1], y: [1, 1], r: [9, 5] },
        ],
        sized,
      ),
    );
    expect((m.marks[0] as ScatterModel).drawn).toEqual([
      { series: 0, i: 1 },
      { series: 1, i: 0 },
      { series: 1, i: 1 },
      { series: 0, i: 0 },
      { series: 0, i: 2 },
    ]);
  });

  it("finds the bubble drawn on top among coincident ones: the smallest", () => {
    const m = build(
      scatter(
        [
          { names: ["small"], x: [1], y: [2], r: [1] },
          { names: ["large"], x: [1], y: [2], r: [9] },
        ],
        sized,
      ),
    );
    expect(scatterDotAt(m.marks[0] as ScatterModel, 1, 2)).toEqual({ series: 0, i: 0 });
  });
});

type Axis = { readonly names: readonly string[] } | { readonly edges: readonly number[] };

// A grid frame on its two axes, every value `fill` unless `values` says.
const cells = (
  x: Axis = { names: ["0 h", "1 h", "2 h"] },
  y: Axis = { names: ["Mon", "Tue"] },
  values?: readonly Values[],
  more: object = {},
) => {
  const count = (a: Axis) => ("edges" in a ? a.edges.length - 1 : a.names.length);
  return {
    data: grid(
      "edges" in x ? { edges: [...x.edges] } : { names: [...x.names] },
      "edges" in y ? { edges: [...y.edges] } : { names: [...y.names] },
      values ?? Array.from({ length: count(y) }, () => Array.from({ length: count(x) }, () => 2)),
    ),
    mark: { mark: "cell" },
    ...more,
  };
};

describe("the cell mark", () => {
  const week = (
    values: readonly Values[] = [
      [3, 0, 1],
      [null, Number.NaN, 7],
    ],
    more: object = {},
  ) => cells(undefined, undefined, values, more);
  const named = (x: unknown, y: unknown = { names: ["Mon", "Tue"] }) => ({
    data: {
      ...grid({ names: ["a"] }, { names: ["b"] }, []),
      x,
      y,
      values: [
        [1, 2, 3],
        [1, 2, 3],
      ],
    },
    mark: { mark: "cell" },
  });

  it.each<[string, unknown, ErrorConstructor]>([
    ["x names that are numbers", named({ names: [1, 2, 3] }), TypeError],
    ["y names that are no array", named({ names: ["a", "b", "c"] }, { names: "Mon" }), TypeError],
    ["a repeated column", named({ names: ["a", "a", "b"] }), RangeError],
    ["an empty row name", named({ names: ["a", "b", "c"] }, { names: ["", "Tue"] }), RangeError],
    ["a row of values too few", week([[1, 2, 3]]), TypeError],
    [
      "a row of another length",
      week([
        [1, 2],
        [1, 2, 3],
      ]),
      TypeError,
    ],
    ["values not rows", { ...week(), data: { ...week().data, values: 3 } }, TypeError],
    [
      "a value that is not a number",
      week([
        [1, "2" as never, 3],
        [1, 2, 3],
      ]),
      TypeError,
    ],
    [
      "an infinite value",
      week([
        [1, Number.POSITIVE_INFINITY, 3],
        [1, 2, 3],
      ]),
      RangeError,
    ],
    ["a linear x", week(undefined, { x: { type: "linear" } }), TypeError],
    ["a linear y", week(undefined, { y: { type: "linear" } }), TypeError],
    ["a domain on its x", week(undefined, { x: { domain: [0, 3] } }), TypeError],
    ["a height", week(undefined, { height: 200 }), TypeError],
    [
      "a ref on x",
      {
        ...week(),
        data: { ...week().data, refs: [{ key: "a", value: 1 }] },
        refs: [{ key: "a", axis: "x" }],
      },
      TypeError,
    ],
    [
      "a ref on y",
      {
        ...week(),
        data: { ...week().data, refs: [{ key: "a", value: 1 }] },
        refs: [{ key: "a", axis: "y" }],
      },
      TypeError,
    ],
    ["a colour scale beside no cell", { ...rect([[1]]), colour: {} }, TypeError],
    ["a colour that is not an object", week(undefined, { colour: 5 }), TypeError],
    ["another colour type", week(undefined, { colour: { type: "qualitative" } }), TypeError],
    ["one step", week(undefined, { colour: { steps: 1 } }), TypeError],
    ["ten steps", week(undefined, { colour: { steps: 10 } }), TypeError],
    ["a fractional step count", week(undefined, { colour: { steps: 4.5 } }), TypeError],
    [
      "steps with thresholds",
      week(undefined, { colour: { steps: 3, thresholds: [1, 2] } }),
      TypeError,
    ],
    [
      "a domain with thresholds",
      week(undefined, { colour: { domain: [0, 9], thresholds: [1] } }),
      TypeError,
    ],
    [
      "a pivot with thresholds",
      week(undefined, { colour: { type: "diverging", pivot: 1, thresholds: [1] } }),
      TypeError,
    ],
    ["thresholds not numbers", week(undefined, { colour: { thresholds: ["1"] } }), TypeError],
    ["no thresholds", week(undefined, { colour: { thresholds: [] } }), RangeError],
    [
      "nine thresholds",
      week(undefined, { colour: { thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9] } }),
      RangeError,
    ],
    ["thresholds out of order", week(undefined, { colour: { thresholds: [1, 3, 2] } }), RangeError],
    ["a repeated threshold", week(undefined, { colour: { thresholds: [1, 1] } }), RangeError],
    [
      "an infinite threshold",
      week(undefined, { colour: { thresholds: [1, Number.POSITIVE_INFINITY] } }),
      RangeError,
    ],
    ["a domain low above high", week(undefined, { colour: { domain: [5, 1] } }), RangeError],
    ["a domain of one value", week(undefined, { colour: { domain: [5, 5] } }), RangeError],
    ["a domain of names", week(undefined, { colour: { domain: ["a", "b"] } }), TypeError],
    ["a pivot on a sequential scale", week(undefined, { colour: { pivot: 0 } }), TypeError],
    ["reverse on a sequential scale", week(undefined, { colour: { reverse: true } }), TypeError],
    [
      "an infinite pivot",
      week(undefined, { colour: { type: "diverging", pivot: Number.NaN } }),
      RangeError,
    ],
    ["a colour label not a string", week(undefined, { colour: { label: 3 } }), TypeError],
    ["another colour format", week(undefined, { colour: { format: "money" } }), TypeError],
    ["a week start beside a grid", { ...week(), mark: { mark: "cell", weekStart: 1 } }, TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("is a heatmap whose x holds its columns from 0 to their count and whose y is a band of its rows", () => {
    const m = build(week());
    expect(m.kind).toBe("heatmap");
    expect([m.x.lo, m.x.hi, m.x.passed]).toEqual([0, 3, true]);
    expect(m.y).toEqual({ type: "band", rows: ["Mon", "Tue"], mono: false });
    expect([0, 1, 2].map((v) => m.xText(v))).toEqual(["0 h", "1 h", "2 h"]);
    expect((m.marks[0] as CellModel).kind).toBe("cell");
  });

  it("reads a NaN as no data and classes the rest from the chart's colour", () => {
    const m = build(week(undefined, { colour: { type: "diverging", steps: 3, pivot: 4 } }));
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
    const none = [null, null, null];
    expect(build(week([none, none])).empty).toBe(true);
    expect(build(week([none, [null, 0, null]])).empty).toBe(false);
  });
});

describe("a cell mark's binned axes", () => {
  const gdp = { edges: [1_000, 2_000, 5_000] };
  const life = { edges: [50, 60, 70] };
  const raw = (x: unknown) => ({
    data: { ...grid({ names: ["a"] }, life, [[1], [1]]), x },
    mark: { mark: "cell" },
  });

  it.each<[string, unknown, ErrorConstructor]>([
    ["an axis neither names nor edges", raw({}), TypeError],
    ["an axis of both names and edges", raw({ names: ["a"], edges: [1, 2] }), TypeError],
    ["edges that are not numbers", raw({ edges: ["1", "2"] }), TypeError],
    ["edges not an array", raw({ edges: 5 }), TypeError],
    ["a single edge", cells({ edges: [1] }, life), RangeError],
    ["edges out of order", cells(gdp, { edges: [50, 70, 60] }), RangeError],
    ["a repeated edge", cells({ edges: [1, 1, 2] }, life), RangeError],
    ["an infinite edge", cells(gdp, { edges: [50, Number.POSITIVE_INFINITY] }), RangeError],
    ["a NaN edge", cells({ edges: [1, Number.NaN] }, life), RangeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("is a 2D histogram when both axes are binned, and a heatmap when one names its categories", () => {
    expect(build(cells(gdp, life)).kind).toBe("histogram2d");
    expect(build(cells({ names: ["a", "b"] }, life)).kind).toBe("heatmap");
    expect(build(cells(gdp, { names: ["a", "b"] })).kind).toBe("heatmap");
  });

  it("keeps each axis's names or edges, and writes a binned x's values as numbers", () => {
    const m = build(cells(gdp, { names: ["Low", "High"] }));
    const c = m.marks[0] as CellModel;
    expect([c.x, c.y]).toEqual([gdp, { names: ["Low", "High"] }]);
    expect(m.xText(2_000)).toBe("2,000");
  });

  it("takes a height on a binned y, which a named y refuses", () => {
    expect(build(cells({ names: ["a", "b"] }, life, undefined, { height: 120 })).spec.height).toBe(
      120,
    );
    expect(() => build(cells(gdp, { names: ["a", "b"] }, undefined, { height: 120 }))).toThrow(
      TypeError,
    );
  });

  it("refuses a binned y whose thinnest bin is under a thousandth of the axis", () => {
    const thin = new RangeError(
      "renderChart: data.y.edges' thinnest bin must be at least 1/1000 of the axis, since the plot grows until it is a row tall",
    );
    for (const edges of [
      [0, 1, 1e9],
      [0, 1, 1e6],
      [0, 999, 1000, 1001],
    ]) {
      expect(() => build(cells({ names: ["a"] }, { edges })), String(edges)).toThrow(thin);
    }
    expect(() =>
      build(cells({ names: ["a"] }, { edges: [1, 1.001, 10] }, undefined, { y: { type: "log" } })),
    ).toThrow(thin);
    expect(build(cells({ names: ["a"] }, { edges: [0, 1, 1000] })).kind).toBe("heatmap");
    expect(
      build(cells({ names: ["a"] }, { edges: [1, 10, 1e300] }, undefined, { y: { type: "log" } }))
        .kind,
    ).toBe("heatmap");
  });

  it("writes a binned x of seconds as durations", () => {
    const m = build({
      ...cells({ edges: [0, 60, 3_600] }, { names: ["a"] }),
      data: grid({ edges: [0, 60, 3_600] }, { names: ["a"] }, [[1, 2]], { unit: "seconds" }),
      x: { format: "duration" },
    });
    expect(m.xText(60).replaceAll(/\s/gu, " ")).toBe("1 min");
    expect(m.colourText(90).replaceAll(/\s/gu, " ")).toBe("1 min, 30 sec");
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
  const order = (spec: unknown) => {
    const m = build(spec);
    return [...cellOrder(m, m.marks[0] as CellModel)];
  };

  it("runs from the top left along each row, a binned y from its highest bin", () => {
    const spec = cells({ names: ["a", "b"] }, { edges: [0, 1, 2] }, [
      [1, 2],
      [3, 4],
    ]);
    expect(order(spec)).toEqual([
      [1, 0],
      [1, 1],
      [0, 0],
      [0, 1],
    ]);
  });

  it("starts each row at its right on a reversed x, as the drawing runs", () => {
    const spec = cells({ names: ["a", "b"] }, { names: ["r"] }, [[1, 2]], { x: { reverse: true } });
    expect(order(spec)).toEqual([
      [0, 1],
      [0, 0],
    ]);
  });
});

describe("a cell chart's colour format", () => {
  it("writes values and boundaries in the colour scale's format", () => {
    const m = build(
      cells({ names: ["a"] }, { names: ["r"] }, [[0.25]], { colour: { format: "percent" } }),
    );
    expect(m.colourText(0.25)).toBe("25%");
  });

  it("writes a frame of ratios in percent by default", () => {
    const spec = cells({ names: ["a"] }, { names: ["r"] }, [[0.25]]);
    const m = build({ ...spec, data: { ...spec.data, unit: "ratio" } });
    expect(m.colourText(0.25)).toBe("25%");
  });
});

describe("the box mark", () => {
  const LATENCY = {
    key: "latency",
    low: [120, 300],
    q1: [180, 900],
    median: [240, 1400],
    q3: [410, 2100],
    high: [760, 4000],
  };
  const latency = (series: object = {}, more: object = {}, names = ["search", "export"]) => ({
    data: boxes(names, [{ ...LATENCY, ...series }]),
    mark: { mark: "box", keys: [{ key: "latency", name: "Latency" }] },
    ...more,
  });
  const whiskers = (w: unknown) => ({ mark: { mark: "box", whiskers: w } });

  it.each<[string, unknown, ErrorConstructor]>([
    ["names of numbers", latency({}, {}, [1, 2] as never), TypeError],
    ["a q1 shorter than its names", latency({ q1: [180] }), TypeError],
    ["outliers not one array per name", latency({ outliers: [[1]] }), TypeError],
    ["outliers of strings", latency({ outliers: [["a"], []] }), TypeError],
    ["a partly null name", latency({ median: [null, 1400] }), TypeError],
    [
      "outliers beside no five numbers",
      latency({
        low: [null, 300],
        q1: [null, 900],
        median: [null, 1400],
        q3: [null, 2100],
        high: [null, 4000],
        outliers: [[5], []],
      }),
      TypeError,
    ],
    ["an empty whiskers", latency({}, whiskers(" ")), TypeError],
    ["whiskers of a number", latency({}, whiskers(1.5)), TypeError],
    ["a time x", latency({}, { x: { type: "time" } }), TypeError],
    ["a band x", latency({}, { x: { type: "band" } }), TypeError],
    ["zero on a log x", latency({}, { x: { type: "log", zero: true } }), TypeError],
    ["a linear y", latency({}, { y: { type: "linear" } }), TypeError],
    ["a height", latency({}, { height: 200 }), TypeError],
    [
      "a ref on y",
      {
        ...latency(),
        data: { ...latency().data, refs: [{ key: "cap", value: 1 }] },
        refs: [{ key: "cap", axis: "y" }],
      },
      TypeError,
    ],
    ["a box on a categories frame", { ...bars([1]), mark: { mark: "box" } }, TypeError],
    ["an empty name", latency({}, {}, ["", "export"]), RangeError],
    ["a repeated name", latency({}, {}, ["a", "a"]), RangeError],
    ["an infinite high", latency({ high: [760, Number.POSITIVE_INFINITY] }), RangeError],
    ["five out of order", latency({ q1: [250, 900] }), RangeError],
    ["an outlier between the whiskers", latency({ outliers: [[500], []] }), RangeError],
    ["an outlier on a whisker's end", latency({ outliers: [[760], []] }), RangeError],
    ["an infinite outlier", latency({ outliers: [[Number.NaN], []] }), RangeError],
    ["a value of 0 on a log x", latency({ low: [0, 300] }, { x: { type: "log" } }), RangeError],
    [
      "an outlier of 0 on a log x",
      latency({ outliers: [[0], []] }, { x: { type: "log" } }),
      RangeError,
    ],
  ])("refuses %s", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rules it breaks", () => {
    expect(() => build(latency({ q1: [250, 900] }))).toThrow(
      'renderChart: data.series[0] at "search" must have low ≤ q1 ≤ median ≤ q3 ≤ high',
    );
    expect(() => build(latency({ outliers: [[500], []] }))).toThrow(
      "renderChart: data.series[0].outliers[0][0] must lie below low or above high, beyond the whiskers",
    );
    expect(() => build(latency({ outliers: [[], [5000]], low: [120, null] }))).toThrow(
      'renderChart: data.series[0] at "export" must have all five numbers',
    );
    expect(() => build(latency({}, { height: 100 }))).toThrow(
      "renderChart: height has no place on a dot, bar, point or box chart, which is as tall as its rows",
    );
  });

  it("keeps each name's five numbers, a gap as null, and sorts its outliers", () => {
    const m = build(
      latency(
        {
          low: [120, null],
          q1: [180, Number.NaN],
          median: [240, null],
          q3: [410, null],
          high: [760, null],
          outliers: [[1100, 20, 2600], []],
        },
        {
          mark: { mark: "box", whiskers: "1.5 × IQR", keys: [{ key: "latency", name: "Latency" }] },
        },
      ),
    );
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

  it("writes a frame of seconds as durations along x", () => {
    const m = build({ ...latency(), data: { ...latency().data, unit: "seconds" } });
    expect(m.amountText(90).replaceAll(/\s/gu, " ")).toBe("1 min, 30 sec");
  });

  it("spans x over every whisker's end and outlier, without 0 unless asked", () => {
    const m = build(latency({ outliers: [[2600], [50]] }));
    expect(m.x.lo).toBeLessThanOrEqual(50);
    expect(m.x.lo).toBeGreaterThan(0);
    expect(m.x.hi).toBeGreaterThanOrEqual(4000);
    expect(build(latency({}, { x: { zero: true } })).x.lo).toBe(0);
    const log = build(latency({}, { x: { type: "log" } }));
    expect([log.x.type, log.x.lo, log.x.hi]).toEqual(["log", 120, 4000]);
  });

  it("is empty when every name's five are gaps", () => {
    const none = {
      low: [null, null],
      q1: [null, null],
      median: [null, null],
      q3: [null, null],
      high: [null, null],
    };
    expect(build(latency(none)).empty).toBe(true);
    expect(build(latency()).empty).toBe(false);
  });

  it("is a box plot whatever its series count", () => {
    const m = build({
      data: boxes(["search", "export"], [LATENCY, { ...LATENCY, key: "after" }]),
      mark: { mark: "box" },
    });
    expect(m.kind).toBe("box");
  });
});

describe("the largest value", () => {
  const two = (more: object = {}, data: Partial<GridFrame> = {}) => ({
    data: grid({ names: ["a", "b"] }, { names: ["r"] }, [[1, 2]], data),
    mark: { mark: "cell" },
    ...more,
  });
  const box = (high: number, outliers?: number[]) => ({
    data: boxes(
      ["search"],
      [
        {
          key: "latency",
          low: [120],
          q1: [180],
          median: [240],
          q3: [410],
          high: [high],
          ...(outliers === undefined ? {} : { outliers: [outliers] }),
        },
      ],
    ),
    mark: { mark: "box" },
  });
  // Each places `v` on a value or colour scale through one check.
  const at: [string, (v: number) => unknown][] = [
    ["a line's x", (v) => line([[1, 2]], { x: [0, v] })],
    ["a line's value", (v) => line([[1, v]])],
    ["a line's value below 0", (v) => line([[1, -v]])],
    ["a bar's value", (v) => bars([1, v])],
    ["a point's value", (v) => dotPlot([[1, v]])],
    ["a scatter's r", (v) => bubble([1, v])],
    ["a box's high", (v) => box(v)],
    ["a box's outlier", (v) => box(760, [v])],
    ["a cell's value", (v) => two({}, { values: [[1, v]] })],
    ["a bin's edge", (v) => two({}, { x: { edges: [0, 1, v] } })],
    ["a calendar's day", (v) => ({ data: calendar(0, [1, v]), mark: { mark: "cell" } })],
    ["an x domain", (v) => ({ ...line([[1, 2]]), x: { domain: [0, v] } })],
    ["a frame's domain", (v) => line([[1, 2]], { domain: [0, v] })],
    ["a colour domain", (v) => two({ colour: { domain: [0, v] } })],
    ["a colour threshold", (v) => two({ colour: { thresholds: [1, v] } })],
    ["a colour pivot", (v) => two({ colour: { type: "diverging", pivot: v } })],
    ["a ref", (v) => line([[1, 2]], { refs: [{ key: "goal", value: v }] })],
    ["a note", (v) => line([[1, 2]], { notes: [{ key: "n", at: v }] })],
  ];

  it.each(at)("takes %s of 1e300", (_, spec) => {
    expect(MAX_MAGNITUDE).toBe(1e300);
    expect(() => build(spec(MAX_MAGNITUDE))).not.toThrow();
  });

  it.each(at)("refuses %s of 1e301 with a RangeError", (_, spec) => {
    expect(() => build(spec(1e301))).toThrow(RangeError);
    expect(() => build(spec(1e301))).toThrow(/ must lie within ±1e300$/);
  });

  it("refuses a stack whose total passes 1e300, though each part is within it", () => {
    const stack = (v: number) => rect([[v], [v]]);
    expect(() => build(stack(5e299))).not.toThrow();
    expect(() => build(stack(6e299))).toThrow(
      new RangeError("renderChart: a stack's total must lie within ±1e300"),
    );
  });

  it("gives one cell value past 2^53 finite, strictly increasing classes", () => {
    const m = build(cells({ names: ["a"] }, { names: ["r"] }, [[-1e16]]));
    const { thresholds } = (m.marks[0] as CellModel).classes;
    expect(
      thresholds.every((t, k) => Number.isFinite(t) && (k === 0 || t > (thresholds[k - 1] ?? 0))),
    ).toBe(true);
  });

  it("refuses a colour domain too narrow for increasing class boundaries", () => {
    expect(() => build(two({ colour: { domain: [1e16, 1e16 + 2] } }))).toThrow(RangeError);
  });

  it("refuses a calendar's start past Date's range with a RangeError", () => {
    expect(() => build({ data: calendar(1e16, [1]), mark: { mark: "cell" } })).toThrow(RangeError);
  });
});

describe("an instant's words on a time x", () => {
  const over = (lo: number, hi: number) =>
    build({ ...line([[1, 2]], { x: [lo, hi] }), x: { type: "time" } });
  // Noon, so the instants keep their minute.
  const newYear = Date.UTC(2026, 0, 1, 12);
  const limit = "must lie within 8.64e15 ms either side of 1970, the range Date holds";

  it("adds the year when the domain's ends lie in different years, and the era before year 1", () => {
    expect(over(newYear, newYear + 10 * 86_400_000).xText(newYear)).toBe("Jan 1, 12:00 PM");
    expect(over(newYear - 86_400_000, newYear + 86_400_000).xText(newYear)).toBe(
      "Jan 1, 2026, 12:00 PM",
    );
    const bc = new Date(newYear).setUTCFullYear(-500);
    expect(over(bc, newYear).xText(bc)).toBe("Jan 1, 501 BC, 12:00 PM");
    expect(
      over(bc, newYear)
        .xSpan(bc, newYear)
        .map((p) => p.text),
    ).toEqual(["Jan 1, 501 BC, 12:00 PM", "Jan 1, 2026 AD, 12:00 PM"]);
    // Two New Year's midnights are years, each with its era before year 1.
    const midnightUtc = Date.UTC(2026, 0, 1);
    const bcYear = new Date(midnightUtc).setUTCFullYear(-500);
    expect(over(bcYear, midnightUtc).xText(bcYear)).toBe("501 BC");
    expect(over(bcYear, midnightUtc).xText(midnightUtc)).toBe("2026 AD");
  });

  it("refuses a time x past what Date holds, naming the limit", () => {
    expect(() => over(0, 8.64e15 + 1)).toThrow(`renderChart: data.x[1] ${limit}`);
    expect(over(-8.64e15, 8.64e15).x.lo).toBe(-8.64e15);
    expect(() =>
      build({
        ...line([[1, 2]], { x: [0, 1], notes: [{ key: "far", at: -1e16 }] }),
        x: { type: "time" },
      }),
    ).toThrow(`renderChart: data.notes[0].at ${limit}`);
    expect(() => build({ data: calendar(1e16, [1]), mark: { mark: "cell" } })).toThrow(
      `renderChart: data.start ${limit}`,
    );
    expect(() =>
      build({
        data: calendar(0, [1], { notes: [{ key: "far", at: 9e15 }] }),
        mark: { mark: "cell" },
      }),
    ).toThrow(`renderChart: data.notes[0].at ${limit}`);
    expect(() =>
      build({ data: calendar(8.64e15 - 86_400_000, [1, 2, 3, 4]), mark: { mark: "cell" } }),
    ).toThrow(`renderChart: the days of a calendar's last week ${limit}`);
    expect(build({ data: calendar(8.64e15 - 86_400_000, [1]), mark: { mark: "cell" } }).x.hi).toBe(
      8.64e15,
    );
  });

  it("names every instant past what Date holds on a time x, whatever its domain", () => {
    const x = { type: "time", domain: [0, 1000] };
    const cases: [unknown, string][] = [
      [
        {
          ...line([[1]], { x: [0], refs: [{ key: "far", value: -9e15 }] }),
          refs: [{ key: "far", axis: "x" }],
          x,
        },
        "data.refs[0].value",
      ],
      [{ data: binsFrame([-9e15, 1], [1, 2], [[1, 2]]), mark: { mark: "rect" }, x }, "data.x1[0]"],
      [{ data: binsFrame([0], [9e15], [[1]]), mark: { mark: "rect" }, x }, "data.x2[0]"],
      [{ ...area([[1, 2]], { x: [0, 9e15] }), x }, "data.x[1]"],
      [{ data: events({ a: [0, 9e15] }), mark: { mark: "dot" }, x }, "data.rows[0].at[1]"],
      [{ ...dotPlot([[9e15]]), x }, "data.series[0].values[0]"],
      [
        { ...cells({ edges: [0, 9e15] }, { names: ["a"] }, [[1]]), x: { type: "time" } },
        "data.x.edges[1]",
      ],
      [{ ...line([[1]], { x: [0] }), x: { type: "time", domain: [-9e15, 0] } }, "x.domain[0]"],
      [{ ...line([[1]], { x: [0], notes: [{ key: "far", at: 9e15 }] }), x }, "data.notes[0].at"],
    ];
    for (const [spec, field] of cases) {
      expect(() => build(spec), field).toThrow(new RangeError(`renderChart: ${field} ${limit}`));
    }
    expect(
      build({ data: binsFrame([-8.64e15], [8.64e15], [[1]]), mark: { mark: "rect" }, x }).x.lo,
    ).toBe(0);
  });

  // 8.64e15 ms is Saturday 13 September 275760, -8.64e15 a Tuesday.
  const days = (start: number, values: number[], locale: string, zone = "UTC") =>
    chartModel(
      { data: calendar(start, values, { zone }), mark: { mark: "cell" } } as ChartSpec,
      locale,
      "UTC",
    );

  it("refuses a calendar whose first week starts before what Date holds, west of UTC too", () => {
    const first = `renderChart: the days of a calendar's first week ${limit}`;
    // A week from Sunday in en starts two days before the Tuesday.
    expect(() => days(-8.64e15, [1], "en")).toThrow(first);
    // New York's first midnight within Date is a Tuesday's, its week from Sunday before it.
    const york = "America/New_York";
    expect(() => days(midnight(localDay(-8.64e15, york) + 1, york), [1], "en", york)).toThrow(
      first,
    );
    expect(() => days(-8.64e15 + 2 * 86_400_000, [1], "en-GB")).toThrow(first);
    expect(days(-8.64e15 + 5 * 86_400_000, [1], "en").x.lo).toBe(-8.64e15 + 5 * 86_400_000);
  });

  it("refuses a calendar whose last week ends after what Date holds, and draws one ending at it", () => {
    // fr's week from Monday puts the Friday's week end on Sunday 14 September.
    expect(() => days(8.64e15 - 86_400_000, [1], "fr")).toThrow(
      `renderChart: the days of a calendar's last week ${limit}`,
    );
    // en's week from Sunday ends on the Saturday, the last day Date holds.
    const m = days(8.64e15 - 86_400_000, [1, 2], "en");
    expect(m.kind).toBe("calendar");
    expect(m.x.hi).toBe(8.64e15 + 86_400_000);
  });
});

describe("the pie mark", () => {
  const LAND = ["Agriculture", "Forest", "Water", "Other"];
  const land = (
    mark: object = {},
    values: Values = [182_637, 106_000, null, Number.NaN],
    names = LAND,
    more: object = {},
  ) => ({
    data: categories(names, [values]),
    mark: { mark: "pie", unit: { other: "km²" }, keys: [{ key: "Forest", slot: 5 }], ...mark },
    ...more,
  });

  it("keeps the slices in the frame's order, each in its slot, a gap as null, totalling the rest", () => {
    const model = build(land());
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
    expect(build(land()).kind).toBe("pie");
    const donut = build(land({ hole: true, format: "percent" }));
    expect(donut.kind).toBe("donut");
    expect(donut.amountText(0.5)).toBe("50%");
  });

  it("writes a frame of ratios in percent, unless the mark names a format", () => {
    const ratio = {
      data: categories(["a", "b"], [[0.25, 0.75]], { unit: "ratio" }),
      mark: { mark: "pie" },
    };
    expect(build(ratio).amountText(0.5)).toBe("50%");
    expect(build({ ...ratio, mark: { mark: "pie", format: "number" } }).amountText(0.5)).toBe(
      "0.5",
    );
  });

  it("is empty when every slice is 0 or no data", () => {
    expect(build(land({}, [0, null], ["A", "B"])).empty).toBe(true);
    expect(build(land({}, [], [])).empty).toBe(true);
    expect(build(land()).empty).toBe(false);
  });

  it("takes a height, since its circle is as tall as the plot", () => {
    expect(build(land({}, undefined, undefined, { height: 300 })).spec.height).toBe(300);
  });

  it("refuses scales and a ref's axis, which it has none of", () => {
    expect(() => build(land({}, undefined, undefined, { x: {} }))).toThrow(
      new TypeError("renderChart: a pie takes no x scale; it has no axes"),
    );
    expect(() => build(land({}, undefined, undefined, { y: {} }))).toThrow(
      new TypeError("renderChart: a pie takes no y scale; it has no axes"),
    );
    expect(() =>
      build(land({}, undefined, undefined, { refs: [{ key: "t", axis: "y" }] })),
    ).toThrow(
      new TypeError(
        'renderChart: refs[0].axis "y" has no place beside a pie mark, which has no continuous y scale for a rule',
      ),
    );
  });

  it("refuses slices of the wrong type with a TypeError", () => {
    for (const bad of [
      { ...land(), data: { ...land().data, names: "slices" } },
      land({ hole: "yes" }),
      land({}, ["1" as never], ["A"]),
      land({ keys: [{ key: "A", slot: "1" }] }),
      land({ unit: "km²" }),
      land({ format: "money" }),
      { ...land(), data: categories(["A"], [[1], [2]]) },
    ]) {
      expect(() => build(bad), JSON.stringify(bad)).toThrow(TypeError);
    }
  });

  it("refuses negative, infinite, unnamed and repeated slices with a RangeError", () => {
    const one = (value: number, name = "B", mark: object = {}) =>
      land(mark, [1, value], ["A", name]);
    for (const bad of [
      one(-1),
      one(Number.POSITIVE_INFINITY),
      one(1e301),
      one(1, ""),
      one(2, "A"),
      one(1, "B", { keys: [{ key: "B", slot: 10 }] }),
    ]) {
      expect(() => build(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
    expect(() => build(one(-1))).toThrow(
      "renderChart: data.series[0].values[1] cannot be negative; a slice is a part of the whole",
    );
    expect(() => build(one(2, "A"))).toThrow('renderChart: data.names[1] must not repeat "A"');
  });

  it("refuses a total past what a scale holds", () => {
    expect(() => build(land({}, [1e300, 1e300], ["A", "B"]))).toThrow(
      new RangeError("renderChart: the total of a pie's slices must lie within ±1e300"),
    );
  });
});

describe("the tree mark", () => {
  const regions = (mark: object = {}, groups?: unknown, more: object = {}) => ({
    data: {
      ...tree({ groups: [] }),
      groups: groups ?? [
        {
          key: "Asia",
          children: [
            { key: "China", value: 17.8e12 },
            { key: "Japan", value: 4.2e12 },
            { key: "Other", value: null },
          ],
        },
        {
          key: "Europe",
          children: [
            { key: "Germany", value: 4.5e12 },
            { key: "Other", value: Number.NaN },
          ],
        },
        { key: "Americas", children: [{ key: "United States", value: 27.4e12 }] },
      ],
    },
    mark: { mark: "tree", unit: { other: "USD" }, keys: [{ key: "Europe", slot: 7 }], ...mark },
    ...more,
  });
  const countries = (mark: object = {}, parts?: unknown, more: object = {}) => ({
    data: {
      ...tree({ parts: [] }),
      parts: parts ?? [
        { key: "United States", value: 27.4e12 },
        { key: "China", value: 17.8e12 },
        { key: "Germany", value: 4.5e12 },
        { key: "Chad", value: 0 },
      ],
    },
    mark: { mark: "tree", unit: { other: "USD" }, keys: [{ key: "China", slot: 3 }], ...mark },
    ...more,
  });

  it("sums each group's parts, each part taking its group's slot and a group the series rule's", () => {
    const model = build(regions());
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

  it("fills one level's tiles with the mark's slot, 1 by default, a key's slot picking one out", () => {
    const one = build(countries()).marks[0];
    const slotted = build(countries({ slot: 4 })).marks[0];
    expect(one?.kind === "tree" && one.parts.map((p) => [p.slot, p.group])).toEqual([
      [1, -1],
      [3, -1],
      [1, -1],
      [1, -1],
    ]);
    expect(one?.kind === "tree" && one.groups).toEqual([]);
    expect(slotted?.kind === "tree" && slotted.parts.map((p) => p.slot)).toEqual([4, 3, 4, 4]);
  });

  it("names the top level by its keys' words and the parts in groups as sent", () => {
    const m = build(
      regions({
        keys: [
          { key: "Asia", name: "East" },
          { key: "China", name: "PRC" },
        ],
      }),
    ).marks[0];
    expect(m?.kind === "tree" && [m.groups[0]?.name, m.parts[0]?.name]).toEqual(["East", "China"]);
  });

  it("takes a part with no value as no data", () => {
    const m = build(countries({}, [{ key: "Spain" }, { key: "Italy", value: 2.3e12 }])).marks[0];
    expect(m?.kind === "tree" && m.parts[0]).toEqual({
      name: "Spain",
      slot: 1,
      value: null,
      group: -1,
    });
  });

  it("writes values in its own format and is empty when every part is 0 or no data", () => {
    expect(build(countries({ format: "integer" })).amountText(1.5e3)).toBe("1,500");
    const none = [
      { key: "A", value: 0 },
      { key: "B", value: null },
    ];
    expect(build(countries({}, none)).empty).toBe(true);
    expect(build(regions({}, [{ key: "G", children: none }])).empty).toBe(true);
    expect(build(regions({}, [])).empty).toBe(true);
    expect(build({ data: tree({ parts: [] }), mark: { mark: "tree" } }).empty).toBe(true);
    expect(build(countries()).empty).toBe(false);
  });

  it("refuses scales and gives its refs and notes in the summary", () => {
    expect(() => build(countries({}, undefined, { x: {} }))).toThrow(
      new TypeError("renderChart: a tree takes no x scale; it has no axes"),
    );
    expect(() => build(countries({}, undefined, { y: {} }))).toThrow(
      new TypeError("renderChart: a tree takes no y scale; it has no axes"),
    );
    const m = build({
      ...countries(),
      data: {
        ...countries().data,
        refs: [{ key: "target", value: 1 }],
        notes: [{ key: "n", at: 1 }],
      },
    });
    expect(m.marks.map((k) => k.kind)).toEqual(["tree"]);
    expect(m.unplaced).toEqual({
      rules: [{ label: "target", value: 1 }],
      notes: [{ text: "n", at: 1 }],
    });
  });

  it("refuses mixed levels, a group's parts that are no list and a slot beside groups with a TypeError", () => {
    const cases: [unknown, string][] = [
      [countries({}, "parts"), "data.parts must be an array"],
      [
        { ...countries(), data: { ...countries().data, groups: [] } },
        "data.groups has no place beside data.parts: a tree holds one level of parts or two of groups",
      ],
      [regions({}, [{ key: "G", children: "parts" }]), "data.groups[0].children must be an array"],
      [
        regions({}, [{ children: [{ key: "a", value: 1 }] }]),
        "data.groups[0].key must be a string",
      ],
      [countries({}, [{ key: 3, value: 1 }]), "data.parts[0].key must be a string"],
      [countries({}, [{ key: "A", value: "1" }]), "data.parts[0].value must be a number or null"],
      [regions({ slot: 2 }), "mark.slot has no place beside groups, which take a slot each"],
    ];
    for (const [bad, message] of cases) {
      expect(() => build(bad), message).toThrow(new TypeError(`renderChart: ${message}`));
    }
    for (const bad of [
      countries({ unit: "USD" }),
      countries({ format: "money" }),
      countries({ slot: "1" }),
    ]) {
      expect(() => build(bad), JSON.stringify(bad)).toThrow(TypeError);
    }
  });

  it("refuses negative, infinite, unnamed and repeated siblings with a RangeError", () => {
    const parts = (part: Record<string, unknown>, mark: object = {}) =>
      countries(mark, [{ key: "A", value: 1 }, part]);
    const cases: [unknown, string][] = [
      [
        parts({ key: "B", value: -1 }),
        "data.parts[1].value must be 0 or more, a part of the whole",
      ],
      [parts({ key: "B", value: Number.NEGATIVE_INFINITY }), "data.parts[1].value must be finite"],
      [parts({ key: "B", value: 1e301 }), "data.parts[1].value must lie within ±1e300"],
      [parts({ key: "", value: 1 }), "data.parts[1].key must not be empty"],
      [parts({ key: "A", value: 2 }), 'data.parts[1].key must not repeat "A"'],
      [
        parts({ key: "B", value: 1 }, { keys: [{ key: "B", slot: 10 }] }),
        "mark.keys[0].slot must be 1 to 9",
      ],
      [
        regions({}, [
          {
            key: "G",
            children: [
              { key: "a", value: 1 },
              { key: "a", value: 2 },
            ],
          },
        ]),
        'data.groups[0].children[1].key must not repeat "a"',
      ],
      [regions({}, [{ key: "G", children: [] }]), "data.groups[0].children must hold a part"],
      [
        regions({}, [{ key: "G", children: [{ key: "a", value: -2 }] }]),
        "data.groups[0].children[0].value must be 0 or more, a part of the whole",
      ],
      [
        regions(
          {},
          index(10).map((g) => ({ key: `G${String(g)}`, children: [{ key: "a", value: 1 }] })),
        ),
        "data.groups[9] needs a slot in mark.keys, since series past the ninth take none of their own",
      ],
    ];
    for (const [bad, message] of cases) {
      expect(() => build(bad), message).toThrow(new RangeError(`renderChart: ${message}`));
    }
    // Two groups may each hold an "Other": only siblings must differ.
    expect(() => build(regions())).not.toThrow();
    // Parts of one level take the mark's slot, so a tenth needs none of its own.
    const many = index(30).map((i) => ({ key: `P${String(i)}`, value: i + 1 }));
    expect(build(countries({}, many)).empty).toBe(false);
  });

  it("refuses a total past what a scale holds", () => {
    const big = [
      { key: "A", value: 1e300 },
      { key: "B", value: 1e300 },
    ];
    expect(() => build(countries({}, big))).toThrow(
      new RangeError("renderChart: the total of a tree's nodes must lie within ±1e300"),
    );
  });
});
