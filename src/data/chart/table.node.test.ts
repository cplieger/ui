import { describe, expect, it } from "vitest";

import { writer } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";

import { chartModel, stepStops, type LineModel, type Model } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";
import { namedRows, tableModel, type TableModel } from "./table.js";
import { chartWords } from "./words.js";

const TZ = "Europe/Paris";
const MIN = 60_000;
// 8:00 AM in Paris on 11 November 2026, UTC+1.
const START = Date.UTC(2026, 10, 11, 7);
const END = START + 360 * MIN;
const words = chartWords();

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const dur = (ms: number) => writer("duration", "en")(ms);
const model = (spec: ChartSpec): Model => chartModel(spec, "en", TZ);
const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

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
      x: { type: "time", domain: [from - 2 * 24 * 60 * MIN, from + 180 * MIN] },
      marks: [
        {
          mark: "rect",
          x1: starts,
          x2: starts.map((s) => s + 60 * MIN),
          series: [{ name: "Posts", y: [1, 2, 3] }],
        },
      ],
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
      x: { type: "time", domain: [START, START + 210 * MIN] },
      y: { label: "Posts" },
      marks: [
        {
          mark: "rect",
          x1: starts,
          x2: starts.map((s) => s + 60 * MIN),
          open: true,
          series: [
            { name: "Announce", y: [1, 2, 3, 4] },
            { name: "Path", y: [5, null, 7, 8] },
          ],
        },
      ],
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
      x: { type: "time", domain: [START, START + 120 * MIN] },
      marks: [
        {
          mark: "rect",
          arrange: "group",
          x1: starts,
          x2: starts.map((s) => s + 60 * MIN),
          series: [
            { name: "Announce", y: [1, 2] },
            { name: "Path", y: [5, null] },
          ],
        },
      ],
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
      x: { type: "time", domain: [START, START + 180 * MIN] },
      marks: [
        {
          mark: "rect",
          arrange: "share",
          x1: starts,
          x2: starts.map((s) => s + 60 * MIN),
          series: [
            { name: "Announce", y: [1, 0, 1200] },
            { name: "Path", y: [3, 0, null] },
          ],
        },
      ],
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
  const edges = durationEdges();
  const t = tableModel(
    model({
      x: {
        type: "log",
        format: "duration",
        label: "Time from post to read",
        domain: [1_000, edges.at(-1) ?? 0],
      },
      marks: [
        {
          mark: "rect",
          x1: edges.slice(0, -1),
          x2: edges.slice(1),
          series: [{ name: "Reads", y: edges.slice(1).map(() => 1) }],
        },
        { mark: "rule", x: 42_000, label: "Median" },
        { mark: "rule", x: 18 * MIN, label: "95th percentile" },
      ],
    }),
    words,
  );

  it("heads its bins by the x title and lists the underflow bin as under its edge", () => {
    expect(t.corner).toBe("Time from post to read");
    expect(t.columns).toEqual([{ text: "Reads", num: true }]);
    expect(t.rows).toHaveLength(edges.length - 1);
    expect(cells(t).slice(0, 2)).toEqual([
      [`Under ${dur(1_000)}`, "1"],
      [`${dur(1_000)} to ${dur(2_000)}`, "1"],
    ]);
  });

  it("writes the rules as a sentence after the table", () => {
    expect(t.after).toBe(`Median ${dur(42_000)}. 95th percentile ${dur(18 * MIN)}.`);
  });
});

describe("the table of a step line", () => {
  const x = per(10, (i) => START + i * MIN);
  const spec: ChartSpec = {
    x: { type: "time", domain: [START, END] },
    marks: [
      {
        mark: "line",
        curve: "step",
        x,
        series: [
          { name: "Live", y: [null, null, null, 4, 4, 4, 10, 10, 10, 10] },
          { name: "Active", y: [null, null, null, 0, 0, 2, 2, 2, 2, 6] },
        ],
      },
    ],
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
    const straight = model({
      ...spec,
      marks: [{ ...(spec.marks[0] as Extract<Mark, { mark: "line" }>), curve: "linear" }],
    });
    expect(tableModel(straight, words).rows).toHaveLength(10);
  });
});

describe("the table of a stacked area", () => {
  const x = per(7, (i) => START + i * MIN);
  const spec = (more: Partial<Extract<Mark, { mark: "area" }>> = {}): ChartSpec => ({
    x: { type: "time", domain: [START, START + 6 * MIN] },
    marks: [
      {
        mark: "area",
        x,
        series: [
          { name: "Gas", y: [990, 1_310, 1_100, 1_000, 1_204, 1_204, 1_204] },
          { name: "Wind", y: [410, 600, 1_020, null, 980, 980, 980] },
          { name: "Solar", y: [500, 790, 300, 200, 412, 412, 412] },
        ],
        ...more,
      },
    ],
  });

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
    const one = tableModel(model(spec({ series: [{ name: "Gas", y: per(7, () => 1) }] })), words);
    expect(one.columns.map((c) => c.text)).toEqual(["Gas"]);
  });
});

describe("the table of an area stacked to 100%", () => {
  const x = per(3, (i) => START + i * MIN);
  const t = tableModel(
    model({
      x: { type: "time", domain: [START, START + 2 * MIN] },
      marks: [
        {
          mark: "area",
          x,
          arrange: "share",
          series: [
            { name: "Gas", y: [0, 1_500, 700] },
            { name: "Wind", y: [0, 500, null] },
          ],
        },
      ],
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
      x: { type: "time", domain: [START, END] },
      y: { type: "band", label: "Agent" },
      marks: [
        {
          mark: "dot",
          rows: [
            { name: "lead-ui", x: posts },
            { name: "docs-bot", x: [] },
            { name: "late", x: [END + MIN] },
          ],
        },
      ],
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
  it("follow the rules, each its x and text, and none leaves the sentence out", () => {
    const x = per(3, (i) => START + i * MIN);
    const line = (more: Mark[]): ChartSpec => ({
      x: { type: "time" },
      marks: [{ mark: "line", x, series: [{ name: "Live", y: [1, 2, 3] }] }, ...more],
    });
    const t = tableModel(
      model(
        line([
          { mark: "text", x: START + MIN, y: 2, text: "Deploy" },
          { mark: "rule", y: 2, label: "Limit" },
        ]),
      ),
      words,
    );
    expect(t.after).toBe(`Limit 2. ${time(START + MIN)}: Deploy.`);
    expect(tableModel(model(line([])), words).after).toBe("");
  });
});

describe("the table of a bar chart", () => {
  it("holds a row per category in the app's order and a column per series", () => {
    const t = tableModel(
      model({
        x: {},
        y: { label: "Country" },
        marks: [
          {
            mark: "bar",
            y: ["Holy See", "Monaco"],
            series: [{ name: "Median age", x: [57.4, null] }],
          },
        ],
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
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["Acme", "Brill"],
            series: [
              { name: "Domestic", x: [40, 3] },
              { name: "International", x: [2, null] },
            ],
          },
        ],
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
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["Item 1", "Item 2"],
            arrange: "share",
            series: [
              { name: "No", x: [1250, 0] },
              { name: "Yes", x: [3750, null] },
            ],
          },
        ],
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
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["Item 1"],
            arrange: "diverge",
            left: 1,
            series: [
              { name: "No", x: [12] },
              { name: "Yes", x: [30] },
            ],
          },
        ],
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["No", "Yes", "Total"]);
    expect(cells(t)).toEqual([["Item 1", "12", "30", "42"]]);
  });

  it("has a Total column for mirrored bars", () => {
    const t = tableModel(
      model({
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["45-50"],
            arrange: "mirror",
            series: [
              { name: "Male", x: [2_734_000] },
              { name: "Female", x: [2_690_000] },
            ],
          },
        ],
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["Male", "Female", "Total"]);
    expect(cells(t)).toEqual([["45-50", "2,734,000", "2,690,000", "5,424,000"]]);
  });

  it.each(["group", "split"] as const)("has no Total column for %s bars", (arrange) => {
    const t = tableModel(
      model({
        x: {},
        marks: [
          {
            mark: "bar",
            y: ["Japan"],
            arrange,
            series: [
              { name: "Female", x: [51.1] },
              { name: "Male", x: [48.4] },
            ],
          },
        ],
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
        x: {},
        y: { label: "Degree" },
        marks: [
          {
            mark: "point",
            y: ["Doctorate", "Master's"],
            series: [
              { name: "Women", x: [128_700, 91_000] },
              { name: "Men", x: [163_500, null] },
            ],
          },
        ],
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
        x: { type: "time" },
        marks: [{ mark: "point", y: ["a"], series: [{ name: "Release", x: [START] }] }],
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
          x: {},
          marks: [
            {
              mark: "point",
              y: ["Doctorate", "Master's"],
              link,
              series: [
                { name: "Women", x: [128_700, 91_000] },
                { name: "Men", x: [91_000, null] },
              ],
            },
          ],
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
        y: { label: "Households, %" },
        marks: [
          {
            mark: "slope",
            x: ["2005", "2015"],
            series: [
              { name: "Cats", y: [50, 34] },
              { name: "Horses", y: [30, 39] },
              { name: "Mice", y: [null, 44] },
            ],
          },
          { mark: "rule", y: 40, label: "Target" },
          { mark: "text", x: "2005", y: 50, text: "Peak" },
        ],
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
    expect(t.after).toBe("Target 40. 2005: Peak.");
  });
});

describe("the table of a scatter plot", () => {
  const world = (more: readonly Mark[] = [], domain?: readonly [number, number]): ChartSpec => ({
    x: { label: "GDP per capita", ...(domain === undefined ? {} : { domain }) },
    y: { label: "Life expectancy" },
    marks: [
      {
        mark: "scatter",
        series: [
          {
            name: "Europe",
            names: ["Albania", "Monaco", "Kosovo"],
            x: [18_920, 140_000, null],
            y: [79.8, 85.9, 79],
          },
          { name: "Africa", names: ["Chad", "Mali"], x: [1_500, 2_000], y: [53, Number.NaN] },
        ],
      },
      ...more,
    ],
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
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        marks: [
          { mark: "scatter", series: [{ name: "All", names: ["Chad"], x: [1_500], y: [53] }] },
        ],
      }),
      words,
    );
    expect(t.columns.map((c) => c.text)).toEqual(["GDP per capita", "Life expectancy"]);
    expect(cells(t)).toEqual([["Chad", "1,500", "53"]]);
  });

  it("leaves out a dot outside a passed domain, as the plot does", () => {
    const t = tableModel(model(world([], [0, 100_000])), words);
    expect(t.rows.map((r) => r.key)).toEqual(["Albania", "Kosovo", "Chad", "Mali"]);
  });

  it("follows with its rules and notes, a note placed at the dot it joins", () => {
    const t = tableModel(
      model(
        world([
          { mark: "rule", y: 70, label: "World average" },
          { mark: "text", x: 140_000, y: 85.9, text: "A city-state" },
        ]),
      ),
      words,
    );
    expect(t.after).toBe("World average 70. Monaco: A city-state.");
  });

  it("sets the dots' names, as a band's rows and a slope's series, in their own direction", () => {
    expect(namedRows(model(world()))).toBe(true);
    expect(
      namedRows(
        model({ marks: [{ mark: "slope", x: ["a", "b"], series: [{ name: "s", y: [1, 2] }] }] }),
      ),
    ).toBe(true);
    expect(
      namedRows(
        model({
          x: { type: "time" },
          marks: [{ mark: "line", x: [START], series: [{ name: "s", y: [1] }] }],
        }),
      ),
    ).toBe(false);
  });
});

describe("the table of a bubble chart", () => {
  it("lists each dot's size last under its label, a missing one as No data", () => {
    const t = tableModel(
      model({
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        r: { label: "Population" },
        marks: [
          {
            mark: "scatter",
            series: [
              {
                name: "All",
                names: ["Japan", "Laos", "Monaco"],
                x: [48_000, 8_400, 140_000],
                y: [84.5, 68, 85.9],
                r: [124_000_000, null, 0],
              },
            ],
          },
        ],
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
        colour: { unit: { one: "post", other: "posts" } },
        marks: [
          {
            mark: "cell",
            x: ["2 PM", "3 PM"],
            y: ["Monday", "Tuesday"],
            values: [
              [4, 1200],
              [null, 0],
            ],
          },
        ],
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
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        marks: [
          {
            mark: "cell",
            x: { edges: [1000, 2000, 5000] },
            y: { edges: [50, 55, 60] },
            values: [
              [1, 2],
              [3, 4],
            ],
          },
        ],
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
        x: { reverse: true },
        marks: [{ mark: "cell", x: ["a", "b"], y: ["r"], values: [[1, 2]] }],
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
        marks: [
          {
            mark: "cell",
            days: { start, values: [1, 2, null, 4, 5, 6, 7, 8, 1200, 12], open },
            weekStart,
          },
        ],
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

describe("the table of a box plot", () => {
  const latency = (more: Record<string, unknown> = {}, two = false): ChartSpec => ({
    y: { label: "Endpoint" },
    marks: [
      {
        mark: "box",
        y: ["search", "health"],
        series: [
          {
            name: "Before",
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
                  name: "After",
                  low: [100, 1],
                  q1: [150, 2],
                  median: [190, 2],
                  q3: [300, 3],
                  high: [600, 4],
                },
              ]
            : []),
        ],
        ...more,
      },
      { mark: "rule", x: 500, label: "Target" },
    ],
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
