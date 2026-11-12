import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";

import { chartModel, type LineModel, type Model } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";
import { stepStops, tableModel, type TableModel } from "./table.js";
import { chartWords } from "./words.js";

const TZ = "Europe/Paris";
const MIN = 60_000;
// 8:00 AM in Paris on 11 November 2026, UTC+1.
const START = Date.UTC(2026, 10, 11, 7);
const END = START + 360 * MIN;
const words = chartWords();

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const dur = (ms: number) => formatDuration(ms, "en");
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

describe("the table of stacked bars", () => {
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
