import { describe, expect, it } from "vitest";

import type { FrameNote, FrameRef, FrameTreePart } from "../frame/frame.js";
import { writer } from "../scale/format.js";

import { chartModel, stepStops, type LineModel, type Model } from "./model.js";
import type { ChartFrame, ChartSpec } from "./spec.js";
import { namedRows, tableModel, type TableModel } from "./table.js";
import {
  binsFrame,
  boxes,
  calendar as calendarFrame,
  categories,
  events,
  grid,
  ladder,
  named,
  points,
  seriesFrame,
  tree,
} from "./test-helpers/frames.js";
import { chartWords } from "./words.js";

const TZ = "Europe/Paris";
const MIN = 60_000;
// 8:00 AM in Paris on 11 November 2026, UTC+1.
const START = Date.UTC(2026, 10, 11, 7);
const END = START + 360 * MIN;
const words = chartWords();

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const dur = (seconds: number) => writer("duration", "en")(seconds);
const model = (spec: ChartSpec): Model => chartModel(spec, "en", TZ);
const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

type Values = readonly (number | null)[];
type Panel = NonNullable<ChartSpec["facets"]>["panels"][number];
// `frame` with refs and notes keyed by their words.
const marked = <F extends ChartFrame>(
  frame: F,
  refs: readonly (readonly [string, number])[] = [],
  notes: readonly (readonly [number, string])[] = [],
): F => ({
  ...frame,
  ...(refs.length === 0 ? {} : { refs: refs.map(([key, value]): FrameRef => ({ key, value })) }),
  ...(notes.length === 0 ? {} : { notes: notes.map(([at, key]): FrameNote => ({ key, at })) }),
});
// A part of a tree frame, no data for null.
const part = (key: string, value: number | null): FrameTreePart =>
  value === null ? { key } : { key, value };
// A categories frame of `names` and its named series.
const rows = (names: readonly string[], ...series: (readonly [string, Values])[]) =>
  categories(names, [], { series: named(...series) });

// Each part as text, an instant as `<time datetime>text`.
const text = (parts: TableModel["rows"][number]["head"]) =>
  parts
    .map((p) => (typeof p === "string" ? p : `<${new Date(p.at).toISOString()}>${p.text}`))
    .join("");
const iso = (t: number) => `<${new Date(t).toISOString()}>${time(t)}`;
const cells = (t: TableModel) =>
  t.rows.map((r) => [text(r.head), ...r.cells.map((c) => text(c.parts))]);

describe("the table of bars across days", () => {
  // Hourly buckets from 10:00 PM in Paris over three days, so the dates show.
  const from = START + 14 * 60 * MIN;
  const starts = per(3, (i) => from + i * 60 * MIN);
  const t = tableModel(
    model({
      data: binsFrame(
        starts,
        starts.map((s) => s + 60 * MIN),
        [],
        { series: named(["Posts", [1, 2, 3]]) },
      ),
      mark: { mark: "rect" },
      x: { domain: [from - 2 * 24 * 60 * MIN, from + 180 * MIN] },
    }),
    words,
  );
  const full = (ms: number) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: TZ,
    }).format(ms);
  const at = (ms: number, text: string) => `<${new Date(ms).toISOString()}>${text}`;

  it("writes an end's date only when it falls on another day than the start", () => {
    const [a = 0, b = 0, c = 0] = starts;
    expect(t.rows.map((r) => text(r.head))).toEqual([
      `${at(a, full(a))} to ${at(b, time(b))}`,
      `${at(b, full(b))} to ${at(c, full(c))}`,
      `${at(c, full(c))} to ${at(c + 60 * MIN, time(c + 60 * MIN))}`,
    ]);
  });
});

describe("the table of stacked columns", () => {
  // Four hourly buckets from 7:30, so the first crosses the domain's start; the last is open.
  const starts = per(4, (i) => START - 30 * MIN + i * 60 * MIN);
  const t = tableModel(
    model({
      data: binsFrame(
        starts,
        starts.map((s) => s + 60 * MIN),
        [],
        { open: true, series: named(["Announce", [1, 2, 3, 4]], ["Path", [5, null, 7, 8]]) },
      ),
      mark: { mark: "rect" },
      x: { domain: [START, START + 210 * MIN] },
      y: { label: "Posts" },
    }),
    words,
  );

  it("heads a column per series and a Total, with no corner title on a time x", () => {
    expect(t.corner).toBe("");
    expect(t.columns).toEqual([
      { text: "Announce", num: true },
      { text: "Path", num: true },
      { text: "Total", num: true },
    ]);
  });

  it("lists every bucket with its full interval, its instants as times, No data for a gap", () => {
    const at = (i: number) => starts[i] ?? 0;
    expect(cells(t)).toEqual([
      [`${iso(at(0))} to ${iso(at(1))}`, "1", "5", "6"],
      [`${iso(at(1))} to ${iso(at(2))}`, "2", "No data", "2"],
      [`${iso(at(2))} to ${iso(at(3))}`, "3", "7", "10"],
      [`${iso(at(3))} to ${iso(at(3) + 60 * MIN)}, so far`, "4", "8", "12"],
    ]);
    expect(t.rows.every((r) => r.cells.every((c) => c.num))).toBe(true);
  });
});

describe("the table of grouped columns", () => {
  const starts = per(2, (i) => START + i * 60 * MIN);
  const t = tableModel(
    model({
      data: binsFrame(
        starts,
        starts.map((s) => s + 60 * MIN),
        [],
        { series: named(["Announce", [1, 2]], ["Path", [5, null]]) },
      ),
      mark: { mark: "rect", arrange: "group" },
      x: { domain: [START, START + 120 * MIN] },
    }),
    words,
  );

  it("heads a column per series and no Total, and lists each bucket's values", () => {
    expect(t.columns).toEqual([
      { text: "Announce", num: true },
      { text: "Path", num: true },
    ]);
    expect(cells(t)).toEqual([
      [`${iso(START)} to ${iso(START + 60 * MIN)}`, "1", "5"],
      [`${iso(START + 60 * MIN)} to ${iso(START + 120 * MIN)}`, "2", "No data"],
    ]);
  });
});

describe("the table of columns stacked to 100%", () => {
  const starts = per(3, (i) => START + i * 60 * MIN);
  const t = tableModel(
    model({
      data: binsFrame(
        starts,
        starts.map((s) => s + 60 * MIN),
        [],
        { series: named(["Announce", [1, 0, 1200]], ["Path", [3, 0, null]]) },
      ),
      mark: { mark: "rect", arrange: "share" },
      x: { domain: [START, START + 180 * MIN] },
    }),
    words,
  );

  it("lists each bucket's shares and its absolute total, a bucket of 0 by its values", () => {
    expect(t.columns.map((c) => c.text)).toEqual(["Announce", "Path", "Total"]);
    const at = (i: number) => starts[i] ?? 0;
    expect(cells(t)).toEqual([
      [`${iso(at(0))} to ${iso(at(1))}`, "25%", "75%", "4"],
      [`${iso(at(1))} to ${iso(at(2))}`, "0", "0", "0"],
      [`${iso(at(2))} to ${iso(at(2) + 60 * MIN)}`, "100%", "No data", "1,200"],
    ]);
  });
});

describe("the table of a histogram", () => {
  const edges = ladder();
  const t = tableModel(
    model({
      data: marked(
        binsFrame(edges.slice(0, -1), edges.slice(1), [], {
          axis: "value",
          unit: "seconds",
          series: named(["Reads", edges.slice(1).map(() => 1)]),
        }),
        [
          ["Median", 42],
          ["95th percentile", 18 * 60],
        ],
      ),
      mark: { mark: "rect" },
      x: { type: "log", label: "Time from post to read", domain: [1, edges.at(-1) ?? 0] },
    }),
    words,
  );

  it("heads its bins by the x title and lists the underflow bin as under its edge", () => {
    expect(t.corner).toBe("Time from post to read");
    expect(t.columns).toEqual([{ text: "Reads", num: true }]);
    expect(t.rows).toHaveLength(edges.length - 1);
    expect(cells(t).slice(0, 2)).toEqual([
      [`Under ${dur(1)}`, "1"],
      [`${dur(1)} to ${dur(2)}`, "1"],
    ]);
  });

  it("writes the rules as a sentence after the table", () => {
    expect(t.after).toBe(`Median ${dur(42)}. 95th percentile ${dur(18 * 60)}.`);
  });
});

describe("the table of a step line", () => {
  const x = per(10, (i) => START + i * MIN);
  const spec: ChartSpec = {
    data: seriesFrame(x, [], {
      series: named(
        ["Live", [null, null, null, 4, 4, 4, 10, 10, 10, 10]],
        ["Active", [null, null, null, 0, 0, 2, 2, 2, 2, 6]],
      ),
    }),
    mark: { mark: "line", curve: "step" },
    x: { type: "time", domain: [START, END] },
  };
  const m = model(spec);

  it("stops at the leading gap, each change point and the last sample", () => {
    expect(stepStops(m.marks[0] as LineModel)).toEqual([0, 3, 5, 6, 9]);
  });

  it("lists one row per stop, a gap as No data", () => {
    expect(cells(tableModel(m, words))).toEqual([
      [iso(x[0] ?? 0), "No data", "No data"],
      [iso(x[3] ?? 0), "4", "0"],
      [iso(x[5] ?? 0), "4", "2"],
      [iso(x[6] ?? 0), "10", "2"],
      [iso(x[9] ?? 0), "10", "6"],
    ]);
  });

  it("stops only at the samples inside the domain", () => {
    const inside = model({ ...spec, x: { type: "time", domain: [x[4] ?? 0, x[7] ?? 0] } });
    expect(stepStops(inside.marks[0] as LineModel)).toEqual([4, 5, 6, 7]);
  });

  it("lists every sample of a straight line", () => {
    const straight = model({ ...spec, mark: { mark: "line", curve: "linear" } });
    expect(tableModel(straight, words).rows).toHaveLength(10);
  });
});

describe("the table of a stacked area", () => {
  const x = per(7, (i) => START + i * MIN);
  const layers = named(
    ["Gas", [990, 1_310, 1_100, 1_000, 1_204, 1_204, 1_204]],
    ["Wind", [410, 600, 1_020, null, 980, 980, 980]],
    ["Solar", [500, 790, 300, 200, 412, 412, 412]],
  );
  const spec = (mark: object = {}, series = layers): ChartSpec =>
    ({
      data: seriesFrame(x, [], { series }),
      mark: { mark: "area", ...mark },
      x: { type: "time", domain: [START, START + 6 * MIN] },
    }) as ChartSpec;

  it("heads a column per layer and a Total, and lists every sample, a gap's total as No data", () => {
    const t = tableModel(model(spec()), words);
    expect(t.columns.map((c) => c.text)).toEqual(["Gas", "Wind", "Solar", "Total"]);
    expect(cells(t).slice(2, 4)).toEqual([
      [iso(x[2] ?? 0), "1,100", "1,020", "300", "2,420"],
      [iso(x[3] ?? 0), "1,000", "No data", "200", "No data"],
    ]);
  });

  it("lists a stepped area's change points and no Total for one series", () => {
    const stepped = tableModel(model(spec({ curve: "step" })), words);
    expect(stepped.rows.map((r) => r.key)).toEqual([0, 1, 2, 3, 4, 6].map((i) => String(x[i])));
    const one = tableModel(model(spec({}, named(["Gas", per(7, () => 1)]))), words);
    expect(one.columns.map((c) => c.text)).toEqual(["Gas"]);
  });
});

describe("the table of an area stacked to 100%", () => {
  const x = per(3, (i) => START + i * MIN);
  const t = tableModel(
    model({
      data: seriesFrame(x, [], {
        series: named(["Gas", [0, 1_500, 700]], ["Wind", [0, 500, null]]),
      }),
      mark: { mark: "area", arrange: "share" },
      x: { type: "time", domain: [START, START + 2 * MIN] },
    }),
    words,
  );

  it("holds the shares the plot shows and the absolute total, a total of 0 by its values", () => {
    expect(t.columns.map((c) => c.text)).toEqual(["Gas", "Wind", "Total"]);
    expect(cells(t)).toEqual([
      [iso(x[0] ?? 0), "0", "0", "0"],
      [iso(x[1] ?? 0), "75%", "25%", "2,000"],
      [iso(x[2] ?? 0), "700", "No data", "No data"],
    ]);
  });
});

describe("the table of a timeline", () => {
  const posts = [START + 10 * MIN, START + 10 * MIN, START + 90 * MIN];
  const t = tableModel(
    model({
      data: events({ "lead-ui": posts, "docs-bot": [], late: [END + MIN] }),
      mark: { mark: "dot" },
      x: { domain: [START, END] },
      y: { type: "band", label: "Agent" },
    }),
    words,
  );

  it("heads the rows by the band's title and the count, first and last", () => {
    expect(t.corner).toBe("Agent");
    expect(t.columns.map((c) => c.text)).toEqual(["Count", "First", "Last"]);
  });

  it("lists every row, a silent one or one with only posts outside the domain as 0 and None", () => {
    expect(cells(t)).toEqual([
      ["lead-ui", "3", iso(posts[0] ?? 0), iso(posts[2] ?? 0)],
      ["docs-bot", "0", "None", "None"],
      ["late", "0", "None", "None"],
    ]);
  });
});

describe("the notes after the table", () => {
  it("follow the refs, each its x and text, and none leaves the sentence out", () => {
    const x = per(3, (i) => START + i * MIN);
    const line = (
      refs: readonly (readonly [string, number])[] = [],
      notes: readonly (readonly [number, string])[] = [],
    ): ChartSpec => ({
      data: marked(seriesFrame(x, [], { series: named(["Live", [1, 2, 3]]) }), refs, notes),
      mark: { mark: "line" },
      x: { type: "time" },
    });
    const t = tableModel(model(line([["Limit", 2]], [[START + MIN, "Deploy"]])), words);
    expect(t.after).toBe(`Limit 2. ${time(START + MIN)}: Deploy.`);
    expect(tableModel(model(line()), words).after).toBe("");
  });
});

describe("the table of a bar chart", () => {
  it("holds a row per category in the app's order and a column per series", () => {
    const t = tableModel(
      model({
        data: rows(["Holy See", "Monaco"], ["Median age", [57.4, null]]),
        mark: { mark: "bar" },
        y: { label: "Country" },
      }),
      words,
    );
    expect(t.corner).toBe("Country");
    expect(t.columns).toEqual([{ text: "Median age", num: true }]);
    expect(cells(t)).toEqual([
      ["Holy See", "57.4"],
      ["Monaco", "No data"],
    ]);
    expect(t.rows.map((r) => r.key)).toEqual(["Holy See", "Monaco"]);
  });

  it("adds a Total column from two series, a gap counting for nothing", () => {
    const t = tableModel(
      model({
        data: rows(["Acme", "Brill"], ["Domestic", [40, 3]], ["International", [2, null]]),
        mark: { mark: "bar" },
      }),
      words,
    );
    expect(t.corner).toBe("");
    expect(t.columns.map((c) => c.text)).toEqual(["Domestic", "International", "Total"]);
    expect(cells(t)).toEqual([
      ["Acme", "40", "2", "42"],
      ["Brill", "3", "No data", "3"],
    ]);
  });

  it("holds a 100% chart's shares and each row's absolute total, a total of 0 by its values", () => {
    const t = tableModel(
      model({
        data: rows(["Item 1", "Item 2"], ["No", [1250, 0]], ["Yes", [3750, null]]),
        mark: { mark: "bar", arrange: "share" },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["No", "Yes", "Total"]);
    expect(cells(t)).toEqual([
      ["Item 1", "25%", "75%", "5,000"],
      ["Item 2", "0", "No data", "0"],
    ]);
  });

  it("has a Total column for diverging bars", () => {
    const t = tableModel(
      model({
        data: rows(["Item 1"], ["No", [12]], ["Yes", [30]]),
        mark: { mark: "bar", arrange: "diverge", left: 1 },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["No", "Yes", "Total"]);
    expect(cells(t)).toEqual([["Item 1", "12", "30", "42"]]);
  });

  it("has a Total column for mirrored bars", () => {
    const t = tableModel(
      model({
        data: rows(["45-50"], ["Male", [2_734_000]], ["Female", [2_690_000]]),
        mark: { mark: "bar", arrange: "mirror" },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["Male", "Female", "Total"]);
    expect(cells(t)).toEqual([["45-50", "2,734,000", "2,690,000", "5,424,000"]]);
  });

  it.each(["group", "split"] as const)("has no Total column for %s bars", (arrange) => {
    const t = tableModel(
      model({
        data: rows(["Japan"], ["Female", [51.1]], ["Male", [48.4]]),
        mark: { mark: "bar", arrange },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["Female", "Male"]);
    expect(cells(t)).toEqual([["Japan", "51.1", "48.4"]]);
  });
});

describe("the table of a point chart", () => {
  it("holds a row per category and a column per series, a gap as No data, no Total", () => {
    const t = tableModel(
      model({
        data: rows(
          ["Doctorate", "Master's"],
          ["Women", [128_700, 91_000]],
          ["Men", [163_500, null]],
        ),
        mark: { mark: "point" },
        y: { label: "Degree" },
      }),
      words,
    );
    expect(t.corner).toBe("Degree");
    expect(t.columns).toEqual([
      { text: "Women", num: true },
      { text: "Men", num: true },
    ]);
    expect(cells(t)).toEqual([
      ["Doctorate", "128,700", "163,500"],
      ["Master's", "91,000", "No data"],
    ]);
    expect(t.rows.map((r) => r.key)).toEqual(["Doctorate", "Master's"]);
  });

  it("writes each instant in its time element on a time x, as words", () => {
    const t = tableModel(
      model({
        data: rows(["a"], ["Release", [START]]),
        mark: { mark: "point" },
        x: { type: "time" },
      }),
      words,
    );
    expect(t.columns).toEqual([{ text: "Release", num: false }]);
    expect(cells(t)).toEqual([["a", iso(START)]]);
  });

  it("adds a range's Gap column and an arrow's signed Change column", () => {
    const plot = (link: "range" | "arrow") =>
      tableModel(
        model({
          data: rows(
            ["Doctorate", "Master's"],
            ["Women", [128_700, 91_000]],
            ["Men", [91_000, null]],
          ),
          mark: { mark: "point", link },
        }),
        words,
      );
    const range = plot("range");
    expect(range.columns.at(-1)).toEqual({ text: "Gap", num: true });
    expect(cells(range)).toEqual([
      ["Doctorate", "128,700", "91,000", "37,700"],
      ["Master's", "91,000", "No data", "No data"],
    ]);
    const arrow = plot("arrow");
    expect(arrow.columns.at(-1)).toEqual({ text: "Change", num: true });
    expect(cells(arrow)[0]?.at(-1)).toBe("-37,700");
  });
});

describe("the table of a slope chart", () => {
  it("holds a row per series, its two ends and its signed change, under the y label", () => {
    const t = tableModel(
      model({
        data: marked(
          rows(["2005", "2015"], ["Cats", [50, 34]], ["Horses", [30, 39]], ["Mice", [null, 44]]),
          [["Target", 40]],
          [[1, "Peak"]],
        ),
        mark: { mark: "slope" },
        y: { label: "Households, %" },
      }),
      words,
    );
    expect(t.corner).toBe("Households, %");
    expect(t.columns).toEqual([
      { text: "2005", num: true },
      { text: "2015", num: true },
      { text: "Change", num: true },
    ]);
    expect(cells(t)).toEqual([
      ["Cats", "50", "34", "-16"],
      ["Horses", "30", "39", "+9"],
      ["Mice", "No data", "44", "No data"],
    ]);
    expect(t.rows.map((r) => r.key)).toEqual(["Cats", "Horses", "Mice"]);
    // A slope has no x place, so its note is said at its plain value.
    expect(t.after).toBe("Target 40. 1: Peak.");
  });
});

describe("the table of a scatter plot", () => {
  const world = (
    domain?: readonly [number, number],
    refs: readonly (readonly [string, number])[] = [],
    notes: readonly (readonly [number, string])[] = [],
  ): ChartSpec => ({
    data: marked(
      points([
        {
          key: "Europe",
          names: ["Albania", "Monaco", "Kosovo"],
          x: [18_920, 140_000, null],
          y: [79.8, 85.9, 79],
        },
        { key: "Africa", names: ["Chad", "Mali"], x: [1_500, 2_000], y: [53, Number.NaN] },
      ]),
      refs,
      notes,
    ),
    mark: { mark: "scatter" },
    x: { label: "GDP per capita", ...(domain === undefined ? {} : { domain }) },
    y: { label: "Life expectancy" },
  });

  it("lists a row per dot in series order, its series, then each measure under its label", () => {
    const t = tableModel(model(world()), words);
    expect(t.corner).toBe("");
    expect(t.columns).toEqual([
      { text: "Series", num: false },
      { text: "GDP per capita", num: true },
      { text: "Life expectancy", num: true },
    ]);
    expect(cells(t)).toEqual([
      ["Albania", "Europe", "18,920", "79.8"],
      ["Monaco", "Europe", "140,000", "85.9"],
      ["Kosovo", "Europe", "No data", "79"],
      ["Chad", "Africa", "1,500", "53"],
      ["Mali", "Africa", "2,000", "No data"],
    ]);
    expect(t.rows.map((r) => r.key)).toEqual(["Albania", "Monaco", "Kosovo", "Chad", "Mali"]);
  });

  it("has no Series column with one series", () => {
    const t = tableModel(
      model({
        data: points([{ key: "All", names: ["Chad"], x: [1_500], y: [53] }]),
        mark: { mark: "scatter" },
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["GDP per capita", "Life expectancy"]);
    expect(cells(t)).toEqual([["Chad", "1,500", "53"]]);
  });

  it("leaves out a dot outside a passed domain, as the plot does", () => {
    const t = tableModel(model(world([0, 100_000])), words);
    expect(t.rows.map((r) => r.key)).toEqual(["Albania", "Kosovo", "Chad", "Mali"]);
  });

  it("follows with its refs and notes, a note at its x measure", () => {
    const t = tableModel(
      model(world(undefined, [["World average", 70]], [[140_000, "A city-state"]])),
      words,
    );
    expect(t.after).toBe("World average 70. GDP per capita 140,000: A city-state.");
  });

  it("sets the dots' names, as a band's rows, a slope's series and a whole's parts, in their own direction", () => {
    expect(namedRows(model(world()))).toBe(true);
    expect(
      namedRows(model({ data: rows(["a", "b"], ["s", [1, 2]]), mark: { mark: "slope" } })),
    ).toBe(true);
    expect(namedRows(model({ data: categories(["Forest"], [[1]]), mark: { mark: "pie" } }))).toBe(
      true,
    );
    expect(
      namedRows(
        model({
          data: tree({ groups: [{ key: "Asia", children: [part("China", 1)] }] }),
          mark: { mark: "tree" },
        }),
      ),
    ).toBe(true);
    expect(
      namedRows(
        model({ data: seriesFrame([START], [[1]]), mark: { mark: "line" }, x: { type: "time" } }),
      ),
    ).toBe(false);
  });
});

describe("the table of a bubble chart", () => {
  it("lists each dot's size last under its label, a missing one as No data", () => {
    const t = tableModel(
      model({
        data: points([
          {
            key: "All",
            names: ["Japan", "Laos", "Monaco"],
            x: [48_000, 8_400, 140_000],
            y: [84.5, 68, 85.9],
            r: [124_000_000, null, 0],
          },
        ]),
        mark: { mark: "scatter" },
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        r: { label: "Population" },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual([
      "GDP per capita",
      "Life expectancy",
      "Population",
    ]);
    expect(cells(t)).toEqual([
      ["Japan", "48,000", "84.5", "124,000,000"],
      ["Laos", "8,400", "68", "No data"],
      ["Monaco", "140,000", "85.9", "0"],
    ]);
  });
});

describe("the table of a cell chart", () => {
  it("is a matrix: a column per x entry, a row per y entry, each value or No data", () => {
    const t = tableModel(
      model({
        data: grid({ names: ["2 PM", "3 PM"] }, { names: ["Monday", "Tuesday"] }, [
          [4, 1200],
          [null, 0],
        ]),
        mark: { mark: "cell" },
        colour: { unit: { one: "post", other: "posts" } },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["2 PM", "3 PM"]);
    expect(cells(t)).toEqual([
      ["Monday", "4", "1,200"],
      ["Tuesday", "No data", "0"],
    ]);
  });

  it("lists a binned y's highest bin first and names both axes in the corner", () => {
    const t = tableModel(
      model({
        data: grid({ edges: [1000, 2000, 5000] }, { edges: [50, 55, 60] }, [
          [1, 2],
          [3, 4],
        ]),
        mark: { mark: "cell" },
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
      }),
      words,
    );
    expect(t.corner).toBe("Life expectancy / GDP per capita");
    expect(t.columns.map((c) => c.text)).toEqual(["1,000 to 2,000", "2,000 to 5,000"]);
    expect(cells(t)).toEqual([
      ["55 to 60", "3", "4"],
      ["50 to 55", "1", "2"],
    ]);
  });

  it("orders its columns as the plot does on a reversed x", () => {
    const t = tableModel(
      model({
        data: grid({ names: ["a", "b"] }, { names: ["r"] }, [[1, 2]]),
        mark: { mark: "cell" },
        x: { reverse: true },
      }),
      words,
    );
    expect(cells(t)).toEqual([["r", "2", "1"]]);
  });
});

describe("the table of a calendar", () => {
  // From midnight of Thursday 1 January 2026 in Paris, ten days.
  const start = Date.UTC(2025, 11, 31, 23);
  const calendar = (weekStart: number, open = false) =>
    tableModel(
      model({
        data: calendarFrame(start, [1, 2, null, 4, 5, 6, 7, 8, 1200, 12], { zone: TZ, open }),
        mark: { mark: "cell", weekStart },
      }),
      words,
    );

  it("has a row per week headed by its first date and a column per weekday from the week's start", () => {
    const t = calendar(1);
    expect(t.columns.map((c) => c.text)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(t.rows.map((r) => r.head)).toEqual([
      [{ at: Date.UTC(2025, 11, 29), text: "Dec 29, 2025", date: true }],
      [{ at: Date.UTC(2026, 0, 5), text: "Jan 5, 2026", date: true }],
    ]);
    expect(t.rows.map((r) => r.cells.map((c) => text(c.parts)))).toEqual([
      ["", "", "", "1", "2", "No data", "4"],
      ["5", "6", "7", "8", "1,200", "12", ""],
    ]);
  });

  it("starts its columns on Sunday for a week from Sunday, and marks an open day so far", () => {
    const t = calendar(7, true);
    expect(t.columns[0]?.text).toBe("Sunday");
    expect(t.rows.map((r) => r.cells.map((c) => text(c.parts)))).toEqual([
      ["", "", "", "", "1", "2", "No data"],
      ["4", "5", "6", "7", "8", "1,200", "12, so far"],
    ]);
  });
});

describe("the table of a calendar at the end of what Date holds", () => {
  it("writes the last week, ending on Saturday 13 September 275760", () => {
    const t = tableModel(
      chartModel(
        { data: calendarFrame(8.64e15 - 86_400_000, [1, 2]), mark: { mark: "cell" } },
        "en",
        "UTC",
      ),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(t.rows.map((r) => r.head)).toEqual([
      [{ at: 8.64e15 - 6 * 86_400_000, text: "Sep 7, 275760", date: true }],
    ]);
    expect(t.rows.map((r) => r.cells.map((c) => text(c.parts)))).toEqual([
      ["", "", "", "", "", "1", "2"],
    ]);
  });
});

describe("the table of a box plot", () => {
  const latency = (more: Record<string, unknown> = {}, two = false): ChartSpec => ({
    y: { label: "Endpoint" },
    mark: { mark: "box", ...more } as ChartSpec["mark"],
    data: marked(
      boxes(
        ["search", "health"],
        [
          {
            key: "Before",
            low: [120, null],
            q1: [180, null],
            median: [240, null],
            q3: [410, null],
            high: [760, null],
            outliers: [[2600, 1100], []],
          },
          ...(two
            ? [
                {
                  key: "After",
                  low: [100, 1],
                  q1: [150, 2],
                  median: [190, 2],
                  q3: [300, 3],
                  high: [600, 4],
                },
              ]
            : []),
        ],
      ),
      [["Target", 500]],
    ),
  });

  it("holds a row per category from Low to High, outliers ascending, then the whiskers and rules", () => {
    const t = tableModel(model(latency({ whiskers: "1.5 × IQR" })), words);
    expect(t.corner).toBe("Endpoint");
    expect(t.columns.map((c) => c.text)).toEqual([
      "Low",
      "Lower quartile",
      "Median",
      "Upper quartile",
      "High",
      "Outliers",
    ]);
    expect(cells(t)).toEqual([
      ["search", "120", "180", "240", "410", "760", "1,100, 2,600"],
      ["health", "No data", "No data", "No data", "No data", "No data", "None"],
    ]);
    expect(t.after).toBe("Whiskers: 1.5 × IQR. Target 500.");
  });

  it("holds a row per category and series from two series up, with a Series column", () => {
    const t = tableModel(model(latency({}, true)), words);
    expect(t.columns[0]?.text).toBe("Series");
    expect(cells(t)).toEqual([
      ["search", "Before", "120", "180", "240", "410", "760", "1,100, 2,600"],
      ["search", "After", "100", "150", "190", "300", "600", "None"],
      ["health", "Before", "No data", "No data", "No data", "No data", "No data", "None"],
      ["health", "After", "1", "2", "2", "3", "4", "None"],
    ]);
    expect(new Set(t.rows.map((r) => r.key)).size).toBe(4);
  });

  it("takes the app's measure names", () => {
    const t = tableModel(model(latency()), chartWords({ boxLabels: { median: "Médiane" } }));
    expect(t.columns.map((c) => c.text)).toContain("Médiane");
    expect(t.columns.map((c) => c.text)).toContain("Low");
  });
});

describe("the table of a pie", () => {
  const land = (unit = true): ChartSpec => ({
    data: categories(["Agriculture", "Forest", "Water"], [[182_637, 106_645, null]]),
    mark: { mark: "pie", ...(unit ? { unit: { other: "km²" } } : {}) },
  });

  it("has a row per slice in the order sent, its value and share, and the whole in its foot", () => {
    const t = tableModel(model(land()), words);
    expect(t.corner).toBe("");
    expect(t.columns.map((c) => c.text)).toEqual(["km²", "Share"]);
    expect(cells(t)).toEqual([
      ["Agriculture", "182,637", "63%"],
      ["Forest", "106,645", "37%"],
      ["Water", "No data", "No data"],
    ]);
    const foot = t.foot;
    expect(
      foot === undefined ? [] : [text(foot.head), ...foot.cells.map((c) => text(c.parts))],
    ).toEqual(["Total", "289,282", "100%"]);
  });

  it("heads the values Value without a unit", () => {
    expect(tableModel(model(land(false)), words).columns[0]?.text).toBe("Value");
  });

  it("has no foot under any other mark", () => {
    const t = tableModel(
      model({ data: seriesFrame([0, 1], [[1, 2]]), mark: { mark: "line" } }),
      words,
    );
    expect(t.foot).toBe(undefined);
  });
});

describe("the table of a treemap", () => {
  // GDP in 2023, bn USD: 62,580 in all.
  const gdp = (india: number | null = 3550): ChartSpec => ({
    data: tree({
      groups: [
        { key: "Asia", children: [part("China", 17_795), part("India", india)] },
        {
          key: "Americas",
          children: [part("United States", 27_361), part("Brazil", 2174), part("Other", 11_700)],
        },
      ],
    }),
    mark: { mark: "tree", unit: { other: "bn USD" } },
  });
  const foot = (t: TableModel) =>
    t.foot === undefined ? [] : [text(t.foot.head), ...t.foot.cells.map((c) => text(c.parts))];

  it("has a group per tbody, its head row its sum and share, then its parts in the order sent", () => {
    const t = tableModel(model(gdp()), words);
    expect(t.columns.map((c) => c.text)).toEqual(["bn USD", "Share"]);
    expect(cells(t)).toEqual([
      ["China", "17,795", "28%"],
      ["India", "3,550", "5.7%"],
      ["United States", "27,361", "44%"],
      ["Brazil", "2,174", "3.5%"],
      ["Other", "11,700", "19%"],
    ]);
    expect(
      t.groups?.map((g) => [
        g.key,
        g.count,
        g.head.scope,
        text(g.head.head),
        ...g.head.cells.map((c) => text(c.parts)),
      ]),
    ).toEqual([
      ["Asia", 2, "rowgroup", "Asia", "21,345", "34%"],
      ["Americas", 3, "rowgroup", "Americas", "41,235", "66%"],
    ]);
    expect(foot(t)).toEqual(["Total", "62,580", "100%"]);
  });

  it("writes a gap No data, its group's sum and the whole without it", () => {
    const t = tableModel(model(gdp(null)), words);
    expect(cells(t)[1]).toEqual(["India", "No data", "No data"]);
    expect(t.groups?.[0]?.head.cells.map((c) => text(c.parts))).toEqual(["17,795", "30%"]);
    expect(foot(t)).toEqual(["Total", "59,030", "100%"]);
  });

  it("has one body of parts with one level, and the whole in its foot", () => {
    const t = tableModel(
      model({
        data: tree({ parts: [part("United States", 3), part("China", 1)] }),
        mark: { mark: "tree" },
      }),
      words,
    );
    expect(t.groups).toBe(undefined);
    expect(t.columns[0]?.text).toBe("Value");
    expect(cells(t)).toEqual([
      ["United States", "3", "75%"],
      ["China", "1", "25%"],
    ]);
    expect(foot(t)).toEqual(["Total", "4", "100%"]);
  });
});

describe("the table of small multiples", () => {
  const line = (
    key: string,
    x: number[],
    values: Values,
    refs: readonly (readonly [string, number])[] = [],
    notes: readonly (readonly [number, string])[] = [],
    unit = "count",
  ): Panel => ({
    key,
    data: marked(seriesFrame(x, [], { unit, series: named([key, values]) }), refs, notes),
  });

  it("gives per-series panels a column each under the panel's name, No data where one has no sample", () => {
    const t = tableModel(
      model({
        mark: { mark: "line" },
        x: { label: "Week" },
        facets: {
          panels: [
            line(
              "North",
              [0, 1, 2],
              [0.02, 0.04, 0.06],
              [["Target", 0.05]],
              [[1, "Strike"]],
              "ratio",
            ),
            line("South", [1, 2, 3], [0.03, 0.05, 0.07], [["Target", 0.05]], [], "ratio"),
          ],
        },
      }),
      words,
    );
    expect(t.corner).toBe("Week");
    expect(t.bands).toBeUndefined();
    expect(t.columns).toEqual([
      { text: "North", num: true },
      { text: "South", num: true },
    ]);
    expect(cells(t)).toEqual([
      ["0", "2%", "No data"],
      ["1", "4%", "3%"],
      ["2", "6%", "5%"],
      ["3", "No data", "7%"],
    ]);
    expect(t.after).toBe("Target 5%. North, 1: Strike.");
  });

  it("reads the chart's refs once after the table, then each panel's own after its name", () => {
    const t = tableModel(
      model({
        mark: { mark: "line" },
        facets: {
          panels: [
            line(
              "North",
              [0, 1],
              [1, 2],
              [
                ["Chart", 1],
                ["Only north", 2],
              ],
            ),
            line(
              "South",
              [0, 1],
              [2, 1],
              [
                ["Chart", 1],
                ["Only south", 3],
              ],
            ),
          ],
        },
      }),
      words,
    );
    expect(t.after).toBe("Chart 1. North, Only north 2. South, Only south 3.");
  });

  const step = (key: string, x: number[], values: Values): Panel => ({
    key,
    data: seriesFrame(x, [], { series: named([key, values]) }),
  });
  const stepTable = (panels: Panel[], x: ChartSpec["x"] = {}) =>
    cells(
      tableModel(model({ mark: { mark: "line", curve: "step" }, x, facets: { panels } }), words),
    );

  it("gives a step-line panel the level its line holds at another panel's change point", () => {
    expect(
      stepTable([
        step("North", [0, 1, 2, 3], [5, 5, 7, 7]),
        step("South", [0, 1, 2, 3], [2, 4, 4, 4]),
      ]),
    ).toEqual([
      ["0", "5", "2"],
      ["1", "5", "4"],
      ["2", "7", "4"],
      ["3", "7", "4"],
    ]);
  });

  it("writes No data where a step-line panel's line draws nothing: before it, in a gap and after it", () => {
    expect(
      stepTable([
        step("North", [1, 2, 3], [5, null, 6]),
        step("South", [0, 1, 1.5, 2, 2.5, 3, 4], [1, 2, 1, 2, 1, 2, 1]),
      ]),
    ).toEqual([
      ["0", "No data", "1"],
      ["1", "5", "2"],
      ["1.5", "No data", "1"],
      ["2", "No data", "2"],
      ["2.5", "No data", "1"],
      ["3", "6", "2"],
      ["4", "No data", "1"],
    ]);
  });

  it("holds a step-line panel's level drawn in from a sample beyond either end of the domain", () => {
    expect(
      stepTable([step("North", [0, 2, 6], [5, 6, 8]), step("South", [1, 3, 4], [1, 2, 1])], {
        domain: [1, 4],
      }),
    ).toEqual([
      ["1", "5", "1"],
      ["2", "6", "1"],
      ["3", "6", "2"],
      ["4", "6", "1"],
    ]);
  });

  const area = (name: string, x: number[], a: Values, b: Values): Panel => ({
    key: name,
    name,
    data: seriesFrame(x, [], { series: named(["A", a], ["B", b]) }),
  });
  const areaTable = (panels: Panel[], arrange: "stack" | "share" = "stack") =>
    cells(
      tableModel(
        model({ mark: { mark: "area", curve: "step", arrange }, facets: { panels } }),
        words,
      ),
    );

  it("holds no layer of a stepped area panel where a gap in any series ends the drawn step", () => {
    expect(
      areaTable([
        area("Germany", [0, 2, 4], [1, 3, null], [2, 2, 5]),
        area("France", [0, 1, 2, 3, 4], [1, 2, 1, 2, 1], [1, 1, 1, 1, 1]),
      ]),
    ).toEqual([
      ["0", "1", "2", "3", "1", "1", "2"],
      ["1", "1", "2", "3", "2", "1", "3"],
      ["2", "3", "2", "5", "1", "1", "2"],
      ["3", "No data", "No data", "No data", "2", "1", "3"],
      ["4", "No data", "5", "No data", "1", "1", "2"],
    ]);
  });

  it("holds no layer of a stepped area panel from a sample that is a gap in any series", () => {
    expect(
      areaTable([
        area("Germany", [0, 2, 4], [1, null, 1], [2, 2, 5]),
        area("France", [0, 1, 2, 3, 4], [1, 2, 1, 2, 1], [1, 1, 1, 1, 1]),
      ]),
    ).toEqual([
      ["0", "1", "2", "3", "1", "1", "2"],
      ["1", "No data", "No data", "No data", "2", "1", "3"],
      ["2", "No data", "2", "No data", "1", "1", "2"],
      ["3", "No data", "No data", "No data", "2", "1", "3"],
      ["4", "1", "5", "6", "1", "1", "2"],
    ]);
  });

  it("holds no share of a stepped share panel up to a sample whose total is 0", () => {
    const t = areaTable(
      [area("North", [0, 10], [1, 0], [1, 0]), area("South", [0, 5, 10], [1, 3, 0], [1, 1, 0])],
      "share",
    );
    expect(t[1]).toEqual(["5", "No data", "No data", "No data", "75%", "25%", "4"]);
  });

  it("holds a stepped share panel's shares only between two samples it draws", () => {
    expect(
      areaTable(
        [
          area("Germany", [0, 2, 4, 6], [1, 0, 1, 1], [1, 0, 3, 1]),
          area("France", [0, 1, 2, 3, 4, 5, 6], [1, 2, 1, 2, 1, 2, 1], [3, 2, 3, 2, 3, 2, 3]),
        ],
        "share",
      ),
    ).toEqual([
      ["0", "50%", "50%", "2", "25%", "75%", "4"],
      ["1", "No data", "No data", "No data", "50%", "50%", "4"],
      ["2", "0", "0", "0", "25%", "75%", "4"],
      ["3", "No data", "No data", "No data", "50%", "50%", "4"],
      ["4", "25%", "75%", "4", "25%", "75%", "4"],
      ["5", "25%", "75%", "4", "50%", "50%", "4"],
      ["6", "50%", "50%", "2", "25%", "75%", "4"],
    ]);
  });

  it("gives each rect bucket its own row, by both edges, where panels' buckets share a start", () => {
    const buckets = (key: string, x1: number[], x2: number[], values: number[]): Panel => ({
      key,
      data: binsFrame(x1, x2, [], { axis: "value", series: named([key, values]) }),
    });
    const t = tableModel(
      model({
        mark: { mark: "rect" },
        facets: {
          panels: [
            buckets("North", [0, 10], [10, 20], [1, 2]),
            buckets("South", [0, 5], [5, 20], [9, 8]),
          ],
        },
      }),
      words,
    );
    expect(cells(t)).toEqual([
      ["0 to 5", "No data", "9"],
      ["0 to 10", "1", "No data"],
      ["5 to 20", "No data", "8"],
      ["10 to 20", "2", "No data"],
    ]);
    expect(new Set(t.rows.map((r) => r.key)).size).toBe(4);
  });

  it("gives per-category panels a column group each over the mark's columns and its Total", () => {
    const panel = (name: string, coal: number[], gas: number[]): Panel => ({
      key: name,
      name,
      data: binsFrame([0, 10], [10, 20], [], {
        axis: "value",
        series: named(["Coal", coal], ["Gas", gas]),
      }),
    });
    const t = tableModel(
      model({
        mark: { mark: "rect" },
        facets: { panels: [panel("Germany", [3, 4], [1, 2]), panel("France", [1, 0], [5, 6])] },
      }),
      words,
    );
    expect(t.bands).toEqual([
      { text: "Germany", span: 3 },
      { text: "France", span: 3 },
    ]);
    expect(t.lead).toBe(0);
    expect(t.columns.map((c) => c.text)).toEqual(["Coal", "Gas", "Total", "Coal", "Gas", "Total"]);
    expect(cells(t).map((r) => r.slice(1))).toEqual([
      ["3", "1", "4", "1", "5", "6"],
      ["4", "2", "6", "0", "6", "6"],
    ]);
  });

  it("keeps a box plot's Series column once, before the panels' groups", () => {
    const box = (name: string, median: number): Panel => ({
      key: name,
      name,
      data: boxes(
        ["search"],
        ["Before", "After"].map((key, k) => ({
          key,
          low: [1],
          q1: [2],
          median: [median + k],
          q3: [8],
          high: [9],
        })),
      ),
    });
    const t = tableModel(
      model({ mark: { mark: "box" }, facets: { panels: [box("EU", 4), box("US", 5)] } }),
      words,
    );
    expect(t.lead).toBe(1);
    expect(t.bands).toEqual([
      { text: "EU", span: 6 },
      { text: "US", span: 6 },
    ]);
    expect(t.columns.map((c) => c.text).slice(0, 2)).toEqual(["Series", "Low"]);
    expect(cells(t)).toEqual([
      ["search", "Before", "1", "2", "4", "8", "9", "None", "1", "2", "5", "8", "9", "None"],
      ["search", "After", "1", "2", "5", "8", "9", "None", "1", "2", "6", "8", "9", "None"],
    ]);
  });

  it("sums each pie in the foot under its own group", () => {
    const pie = (name: string, a: number, b: number): Panel => ({
      key: name,
      name,
      data: categories(["Wind", "Solar"], [[a, b]]),
    });
    const t = tableModel(
      model({ mark: { mark: "pie" }, facets: { panels: [pie("2023", 3, 1), pie("2024", 1, 1)] } }),
      words,
    );
    expect(t.bands?.map((b) => b.text)).toEqual(["2023", "2024"]);
    expect(cells(t)).toEqual([
      ["Wind", "3", "75%", "1", "50%"],
      ["Solar", "1", "25%", "1", "50%"],
    ]);
    expect([text(t.foot?.head ?? []), ...(t.foot?.cells ?? []).map((c) => text(c.parts))]).toEqual([
      "Total",
      "4",
      "100%",
      "2",
      "100%",
    ]);
  });

  it("gives scatter panels a tbody each, headed by the panel's name across every column", () => {
    const dots = (key: string, names: string[]): Panel => ({
      key,
      data: points([{ key, names, x: names.map((_, i) => i + 1), y: names.map((_, i) => 2 * i) }]),
    });
    const t = tableModel(
      model({
        mark: { mark: "scatter" },
        x: { label: "Income" },
        y: { label: "Age" },
        facets: { panels: [dots("Europe", ["Albania", "Monaco"]), dots("Africa", ["Chad"])] },
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["Income", "Age"]);
    expect(t.bands).toBeUndefined();
    expect(
      t.groups?.map((g) => [g.key, text(g.head.head), g.head.scope, g.head.span, g.count]),
    ).toEqual([
      ["Europe", "Europe", "rowgroup", 3, 2],
      ["Africa", "Africa", "rowgroup", 3, 1],
    ]);
    expect(cells(t)).toEqual([
      ["Albania", "1", "0"],
      ["Monaco", "2", "2"],
      ["Chad", "1", "0"],
    ]);
  });
});
