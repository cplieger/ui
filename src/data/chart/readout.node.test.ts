import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";
import { measurer } from "../scale/measure.js";

import {
  chartModel,
  type AreaModel,
  type BarModel,
  type BoxModel,
  type CellModel,
  type DotModel,
  type LineModel,
  type Model,
  type PointModel,
  type RectModel,
  type ScatterModel,
  type SlopeModel,
} from "./model.js";
import {
  barReading,
  boxReading,
  bucketReading,
  cellReading,
  columnReading,
  overall,
  pointReading,
  postReading,
  readoutWidths,
  rowReading,
  sampleReading,
  scatterReading,
  totalWord,
  type Reading,
} from "./readout.js";
import type { ChartSpec, Mark } from "./spec.js";
import { chartWords } from "./words.js";

const TZ = "Europe/Paris";
const MIN = 60_000;
// 8:00 AM in Paris on 11 November 2026, UTC+1.
const START = Date.UTC(2026, 10, 11, 7);
const words = chartWords();
const nb = "\u00A0";

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const span = (a: number, b: number) => `${time(a)} to ${time(b)}`;

const model = (spec: ChartSpec): Model => chartModel(spec, "en", TZ);
const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

// Posts by kind: 24 buckets of 15 minutes, the last still filling.
const starts = per(24, (i) => START + i * 15 * MIN);
const postsByKind: ChartSpec = {
  x: { type: "time", domain: [START, START + 6 * 60 * MIN] },
  y: { label: "Posts", unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: starts,
      x2: starts.map((t) => t + 15 * MIN),
      open: true,
      series: [
        { name: "Announce", slot: 1, y: per(24, () => 5) },
        { name: "Path", slot: 2, y: per(24, (i) => (i === 13 ? 6 : 4)) },
        { name: "Direct", slot: 3, y: per(24, (i) => (i < 16 ? 3 : 2)) },
        { name: "Cards", slot: 4, y: per(24, (i) => (i < 6 ? 2 : i === 23 ? null : 1)) },
      ],
    },
  ],
};

const chips = (r: Reading | undefined) => r?.entries.map((e) => [e.slot, e.name, e.value]);

describe("the legend row of stacked columns", () => {
  const m = model(postsByKind);
  const rect = m.marks[0] as RectModel;

  it("reads the domain, each series' total and the total with no selection", () => {
    const r = overall(m, words);
    expect(r?.at).toBe(span(START, START + 360 * MIN));
    expect(chips(r)).toEqual([
      [1, "Announce", "120"],
      [2, "Path", "98"],
      [3, "Direct", "64"],
      [4, "Cards", "29"],
    ]);
    expect(r?.total).toBe("311");
  });

  it("reads a bucket's interval, its parts and their total, No data for a gap", () => {
    const r = bucketReading(m, rect, 13, words);
    expect(r.at).toBe(span(starts[13] ?? 0, (starts[13] ?? 0) + 15 * MIN));
    expect(chips(r)?.map((c) => c[2])).toEqual(["5", "6", "3", "1"]);
    expect(r.total).toBe("15");
    const last = bucketReading(m, rect, 23, words);
    expect(last.at).toBe(`${span(starts[23] ?? 0, START + 360 * MIN)}, so far`);
    expect(last.entries[3]?.value).toBe("No data");
    expect(last.total).toBe("11");
  });
});

describe("the legend row of grouped columns", () => {
  const mark = postsByKind.marks[0] as Extract<ChartSpec["marks"][number], { mark: "rect" }>;
  const m = model({ ...postsByKind, marks: [{ ...mark, arrange: "group" }] });
  const rect = m.marks[0] as RectModel;

  it("reads each series' total over the domain and no grand total", () => {
    const r = overall(m, words);
    expect(chips(r)?.map((c) => c[2])).toEqual(["120", "98", "64", "29"]);
    expect(r?.total).toBeUndefined();
  });

  it("reads a bucket's values and no total", () => {
    const r = bucketReading(m, rect, 13, words);
    expect(chips(r)?.map((c) => c[2])).toEqual(["5", "6", "3", "1"]);
    expect(r.total).toBeUndefined();
  });

  it("keeps no width for a total slot", () => {
    expect(
      readoutWidths(
        m,
        words,
        measurer((t) => 7 * t.length, 7, "en"),
      ).total,
    ).toBe(0);
  });
});

describe("the legend row of columns stacked to 100%", () => {
  const mark = postsByKind.marks[0] as Extract<ChartSpec["marks"][number], { mark: "rect" }>;
  const m = model({ ...postsByKind, marks: [{ ...mark, arrange: "share" }] });
  const rect = m.marks[0] as RectModel;

  it("reads each series' share of the grand total and the total with its unit", () => {
    const r = overall(m, words);
    // 120, 98, 64 and 29 of 311.
    expect(chips(r)?.map((c) => c[2])).toEqual(["39%", "32%", "21%", "9%"]);
    expect(r?.total).toBe(`311${nb}posts`);
  });

  it("reads a bucket's shares and its absolute total, No data for a gap", () => {
    const r = bucketReading(m, rect, 13, words);
    // 5, 6, 3 and 1 of 15.
    expect(chips(r)?.map((c) => c[2])).toEqual(["33%", "40%", "20%", "7%"]);
    expect(r.total).toBe(`15${nb}posts`);
    expect(bucketReading(m, rect, 23, words).entries[3]?.value).toBe("No data");
  });

  it("reads a bucket whose total is 0 by its values, since it has no shares", () => {
    const zero = model({
      ...postsByKind,
      marks: [
        {
          ...mark,
          arrange: "share",
          series: mark.series.map((s) => ({
            ...s,
            y: Array.from(s.y, (v, i) => (i === 2 ? 0 : v)),
          })),
        },
      ],
    });
    const r = bucketReading(zero, zero.marks[0] as RectModel, 2, words);
    expect(chips(r)?.map((c) => c[2])).toEqual(["0", "0", "0", "0"]);
    expect(r.total).toBe(`0${nb}posts`);
  });
});

describe("the legend row of one series", () => {
  it("reads a column chart's count with its unit, and no total", () => {
    const m = model({
      ...postsByKind,
      marks: [
        {
          ...(postsByKind.marks[0] as RectModel & { mark: "rect" }),
          series: [{ name: "All", y: per(24, () => 1) }],
        },
      ],
    });
    const r = overall(m, words);
    expect(chips(r)).toEqual([[undefined, undefined, `24${nb}posts`]]);
    expect(r?.total).toBeUndefined();
    expect(bucketReading(m, m.marks[0] as RectModel, 0, words).entries[0]?.value).toBe(
      `1${nb}post`,
    );
  });

  it("reads the underflow bin as under its edge, and the domain from under the low end, capitalised", () => {
    const edges = durationEdges();
    const m = model({
      x: { type: "log", format: "duration", domain: [1_000, edges.at(-1) ?? 0] },
      y: { unit: { one: "read", other: "reads" } },
      marks: [
        {
          mark: "rect",
          x1: edges.slice(0, -1),
          x2: edges.slice(1),
          series: [{ name: "Reads", y: edges.slice(1).map(() => 2) }],
        },
      ],
    });
    const rect = m.marks[0] as RectModel;
    expect(overall(m, words)?.at).toBe(
      `Under ${formatDuration(1_000, "en")} to ${formatDuration(edges.at(-1) ?? 0, "en")}`,
    );
    expect(overall(m, words)?.entries[0]?.value).toBe(`32${nb}reads`);
    expect(bucketReading(m, rect, 0, words).at).toBe(`Under ${formatDuration(1_000, "en")}`);
    expect(bucketReading(m, rect, 5, words).at).toBe(
      `${formatDuration(30_000, "en")} to ${formatDuration(60_000, "en")}`,
    );
  });
});

describe("the legend row of a step line", () => {
  const x = per(6, (i) => START + i * MIN);
  const m = model({
    x: { type: "time", domain: [START, START + 10 * MIN] },
    y: { label: "Agents" },
    marks: [
      {
        mark: "line",
        curve: "step",
        x,
        series: [
          { name: "Live", slot: 1, y: [null, 4, 4, 10, 10, 10] },
          { name: "Active", slot: 2, y: [null, 0, 2, 6, 6, null] },
        ],
      },
    ],
  });
  const line = m.marks[0] as LineModel;

  it("reads each series' last value, at the latest of them, with no selection", () => {
    const r = overall(m, words);
    expect(r?.at).toBe(time(x[5] ?? 0));
    expect(chips(r)).toEqual([
      [1, "Live", "10"],
      [2, "Active", "6"],
    ]);
  });

  it("reads a sample's time and values, No data in a gap", () => {
    const r = sampleReading(m, line, 0, words);
    expect(r.at).toBe(time(START));
    expect(chips(r)?.map((c) => c[2])).toEqual(["No data", "No data"]);
  });
});

describe("the legend row of a stacked area", () => {
  const x = per(4, (i) => START + i * MIN);
  const spec = (wind: (number | null)[]): ChartSpec => ({
    x: { type: "time", domain: [START, START + 10 * MIN] },
    marks: [
      {
        mark: "area",
        x,
        series: [
          { name: "Gas", slot: 1, y: [1_204, 1_100, 990, 1_310] },
          { name: "Wind", slot: 2, y: wind },
        ],
      },
    ],
  });
  const m = model(spec([980, 410, 1_020, null]));

  it("reads the last whole stack's values and total with no selection", () => {
    const r = overall(m, words);
    expect(r?.at).toBe(time(x[2] ?? 0));
    expect(chips(r)).toEqual([
      [1, "Gas", "990"],
      [2, "Wind", "1,020"],
    ]);
    expect(r?.total).toBe("2,010");
  });

  it("reads a sample's values and total, No data for both at a gap", () => {
    const area = m.marks[0] as AreaModel;
    expect(sampleReading(m, area, 0, words).total).toBe("2,184");
    const gap = sampleReading(m, area, 3, words);
    expect(chips(gap)?.map((c) => c[2])).toEqual(["1,310", "No data"]);
    expect(gap.total).toBe("No data");
  });

  it("reads No data with no whole stack in the domain", () => {
    const r = overall(model(spec([null, null, null, null])), words);
    expect(r?.at).toBe(span(START, START + 10 * MIN));
    expect(r?.total).toBe("No data");
  });

  it("keeps a total slot as wide as the widest total", () => {
    const m2 = model(spec([980, 410, 1_020, 1_230_000]));
    const measure = measurer((t) => 7 * Array.from(t).length, 7, "en");
    expect(readoutWidths(m2, words, measure).total).toBe(7 * "1,231,310".length);
  });
});

describe("the legend row of an area stacked to 100%", () => {
  const x = per(3, (i) => START + i * MIN);
  const spec = (solar: (number | null)[]): ChartSpec => ({
    x: { type: "time", domain: [START, START + 10 * MIN] },
    y: { unit: { one: "MW", other: "MW" } },
    marks: [
      {
        mark: "area",
        x,
        arrange: "share",
        series: [
          { name: "Gas", slot: 1, y: [0, 1_204, 1_100] },
          { name: "Wind", slot: 2, y: [0, 980, 900] },
          { name: "Solar", slot: 3, y: solar },
        ],
      },
    ],
  });
  const m = model(spec([0, 412, null]));
  const area = m.marks[0] as AreaModel;

  it("reads the last whole stack's shares and its total with the unit, with no selection", () => {
    const r = overall(m, words);
    expect(r?.at).toBe(time(x[1] ?? 0));
    expect(chips(r)).toEqual([
      [1, "Gas", "46%"],
      [2, "Wind", "38%"],
      [3, "Solar", "16%"],
    ]);
    expect(r?.total).toBe(`2,596${nb}MW`);
  });

  it("reads a total of 0 by its values, and a gap by the values there with No data", () => {
    const zero = sampleReading(m, area, 0, words);
    expect(chips(zero)?.map((c) => c[2])).toEqual(["0", "0", "0"]);
    expect(zero.total).toBe(`0${nb}MW`);
    const gap = sampleReading(m, area, 2, words);
    expect(chips(gap)?.map((c) => c[2])).toEqual(["1,100", "900", "No data"]);
    expect(gap.total).toBe("No data");
  });

  it("keeps a value slot as wide as a value read where the stack has no shares", () => {
    const wide = model({
      ...spec([0, 412, null]),
      marks: [
        {
          mark: "area",
          x,
          arrange: "share",
          series: [
            { name: "Gas", slot: 1, y: [0, 1_204, 1_100_000] },
            { name: "Wind", slot: 2, y: [0, 980, 900] },
            { name: "Solar", slot: 3, y: [0, 412, null] },
          ],
        },
      ],
    });
    const measure = measurer((t) => 7 * Array.from(t).length, 7, "en");
    const w = readoutWidths(wide, words, measure);
    expect(w.values).toEqual([7 * "1,100,000".length, 7 * "No data".length, 7 * "No data".length]);
    expect(w.total).toBe(7 * "2,596 MW".length);
  });
});

describe("the legend row of a timeline", () => {
  const posts = [START + 10 * MIN, START + 10 * MIN, START + 12 * MIN, START + 90 * MIN];
  const m = model({
    x: { type: "time", domain: [START, START + 360 * MIN] },
    y: { type: "band", mono: true, unit: { one: "agent", other: "agents" } },
    marks: [
      {
        mark: "dot",
        unit: { one: "post", other: "posts" },
        rows: [
          { name: "lead-ui", x: posts },
          { name: "docs-bot", x: [] },
        ],
      },
    ],
  });
  const dots = m.marks[0] as DotModel;

  it("reads the count of posts with no selection", () => {
    expect(overall(m, words)?.entries[0]?.value).toBe(`4${nb}posts`);
  });

  it("reads a post's time, or the count and span of posts sharing a pixel", () => {
    expect(postReading(m, dots, 0, 3, 4, words)).toMatchObject({
      at: "lead-ui",
      entries: [{ value: time(posts[3] ?? 0) }],
    });
    expect(postReading(m, dots, 0, 0, 3, words).entries[0]?.value).toBe(
      `3${nb}posts, ${span(posts[0] ?? 0, posts[2] ?? 0)}`,
    );
  });

  it("reads a row as its count and span, and a silent row as no posts", () => {
    expect(rowReading(m, dots, 0, words).entries[0]?.value).toBe(
      `4${nb}posts, ${span(posts[0] ?? 0, posts[3] ?? 0)}`,
    );
    expect(rowReading(m, dots, 1, words)).toMatchObject({
      at: "docs-bot: no posts",
      entries: [{ value: "" }],
    });
  });
});

describe("the legend row's widths", () => {
  // Digits narrower than letters, so a reading's width depends on its words.
  const measure = measurer((t) => 7 * Array.from(t).length, 6, "en");
  const fits = (r: Reading, w: ReturnType<typeof readoutWidths>) => {
    expect(measure.number(r.at)).toBeLessThanOrEqual(w.at);
    r.entries.forEach((e, k) => {
      expect(measure.number(e.value)).toBeLessThanOrEqual(w.values[k] ?? 0);
    });
    expect(measure.number(r.total ?? "")).toBeLessThanOrEqual(w.total);
  };

  it("holds every bucket's reading and the whole chart's", () => {
    const m = model(postsByKind);
    const w = readoutWidths(m, words, measure);
    const rect = m.marks[0] as RectModel;
    for (const i of rect.shown) {
      fits(bucketReading(m, rect, i, words), w);
    }
    const none = overall(m, words);
    if (none !== undefined) {
      fits(none, w);
    }
  });

  it("holds every post, group and row reading of a timeline", () => {
    const rows = per(5, (r) => ({
      name: `agent-${"x".repeat(r)}`,
      x: per(r * 7, (i) => START + i * 13 * MIN),
    }));
    const m = model({
      x: { type: "time" },
      marks: [{ mark: "dot", unit: { one: "post", other: "posts" }, rows }],
    });
    const w = readoutWidths(m, words, measure);
    const dots = m.marks[0] as DotModel;
    dots.rows.forEach((row, r) => {
      fits(rowReading(m, dots, r, words), w);
      for (let i = row.from; i < row.to; i++) {
        for (let j = i + 1; j <= row.to; j++) {
          fits(postReading(m, dots, r, i, j, words), w);
        }
      }
    });
  });

  it("holds a line value on a linear x wider than its extremes and every other value", () => {
    const n = 1_000;
    const y = per(n, (i) => (i === 0 ? 0 : i === n - 1 ? 9_000_000 : i === 2 ? 7_123_456.25 : 50));
    const x = per(n, (i) => (i === 5 ? 5.125 : i));
    const m = model({ x: {}, marks: [{ mark: "line", x, series: [{ name: "a", y }] }] });
    const w = readoutWidths(m, words, measure);
    expect(w.values[0]).toBe(measure.number("7,123,456.25"));
    expect(w.at).toBe(measure.number("5.125"));
    const line = m.marks[0] as LineModel;
    for (let i = 0; i < n; i++) {
      fits(sampleReading(m, line, i, words), w);
    }
  });

  it("holds a duration wider than its extremes, writing one text per duration record", () => {
    const n = 1_000;
    const y = per(n, (i) =>
      i === 0 ? 0 : i === n - 1 ? 9 * 60 * MIN : i === 500 ? 9_420_013 : 100 + i * 9,
    );
    const m = model({
      x: {},
      y: { format: "duration" },
      marks: [{ mark: "line", x: per(n, (i) => i), series: [{ name: "a", y }] }],
    });
    let texts = 0;
    const counting = { ...measure, number: (t: string) => (texts++, measure.number(t)) };
    const w = readoutWidths(m, words, counting);
    expect(w.values[0]).toBe(measure.number(formatDuration(9_420_013, "en")));
    // About a hundred records: 0, 109 to 999 ms, 1 to 9 s, 2 hr 37 min and 9 hr.
    expect(texts).toBeLessThan(150);
    const line = m.marks[0] as LineModel;
    for (let i = 0; i < n; i++) {
      fits(sampleReading(m, line, i, words), w);
    }
  });

  it("holds every sample of a line", () => {
    const x = per(500, (i) => START + i * MIN);
    const m = model({
      x: { type: "time" },
      marks: [
        {
          mark: "line",
          x,
          series: [
            { name: "a", y: x.map((_, i) => (i % 97) * 1.5) },
            { name: "b", y: x.map(() => null) },
          ],
        },
      ],
    });
    const w = readoutWidths(m, words, measure);
    const line = m.marks[0] as LineModel;
    for (let i = 0; i < x.length; i++) {
      fits(sampleReading(m, line, i, words), w);
    }
  });
});

describe("the legend row of a bar chart", () => {
  const ages = (unit?: { one: string; other: string }): ChartSpec => ({
    x: { unit: { one: "year", other: "years" } },
    ...(unit === undefined ? {} : { y: { unit } }),
    marks: [
      {
        mark: "bar",
        y: ["Holy See", "Monaco", "Japan"],
        series: [{ name: "Median age", x: [57.4, null, 49.8] }],
      },
    ],
  });
  const firms: ChartSpec = {
    x: {},
    y: { unit: { one: "company", other: "companies" } },
    marks: [
      {
        mark: "bar",
        y: ["Acme", "Brill"],
        series: [
          { name: "Domestic", slot: 1, x: [40, 3] },
          { name: "International", slot: 3, x: [2, null] },
        ],
      },
    ],
  };

  it("reads the row count in the y unit, or as categories, with a blank value", () => {
    expect(overall(model(ages({ one: "country", other: "countries" })), words)).toEqual({
      at: `3${nb}countries`,
      entries: [{ slot: undefined, name: undefined, value: "" }],
      total: undefined,
    });
    expect(overall(model(ages()), words)?.at).toBe("3 categories");
    const one: ChartSpec = {
      x: {},
      marks: [{ mark: "bar", y: ["Japan"], series: [{ name: "Median age", x: [49.8] }] }],
    };
    expect(overall(model(one), words)?.at).toBe("1 category");
  });

  it("names the series of a stack with their value and total slots blank", () => {
    expect(overall(model(firms), words)).toEqual({
      at: `2${nb}companies`,
      entries: [
        { slot: 1, name: "Domestic", value: "" },
        { slot: 3, name: "International", value: "" },
      ],
      total: "",
    });
  });

  it("reads a row's value with the x unit, or No data for a gap", () => {
    const m = model(ages());
    const bar = m.marks[0] as BarModel;
    expect(barReading(m, bar, 0, words).entries[0]?.value).toBe(`57.4${nb}years`);
    expect(barReading(m, bar, 1, words)).toMatchObject({ at: "Monaco", total: undefined });
    expect(barReading(m, bar, 1, words).entries[0]?.value).toBe("No data");
  });

  it("signs a diverging bar's readings but 0's", () => {
    const m = model({
      x: { format: { style: "percent", maximumFractionDigits: 1 } },
      marks: [
        {
          mark: "bar",
          y: ["Utah", "Texas", "Puerto Rico"],
          series: [{ name: "Change", x: [0.16, 0, -0.143] }],
        },
      ],
    });
    const bar = m.marks[0] as BarModel;
    expect([0, 1, 2].map((r) => barReading(m, bar, r, words).entries[0]?.value)).toEqual([
      "+16%",
      "0%",
      "-14.3%",
    ]);
  });

  it("reads a stacked row's parts and total, a gap counting for nothing", () => {
    const m = model(firms);
    const bar = m.marks[0] as BarModel;
    expect(barReading(m, bar, 1, words)).toEqual({
      at: "Brill",
      entries: [
        { slot: 1, name: "Domestic", value: "3" },
        { slot: 3, name: "International", value: "No data" },
      ],
      total: "3",
    });
  });

  const grouped: ChartSpec = {
    ...firms,
    marks: [{ ...(firms.marks[0] as Extract<Mark, { mark: "bar" }>), arrange: "group" }],
  };

  it("reads a grouped row's values with no total, and names the series with no total slot", () => {
    const m = model(grouped);
    const bar = m.marks[0] as BarModel;
    expect(barReading(m, bar, 0, words)).toEqual({
      at: "Acme",
      entries: [
        { slot: 1, name: "Domestic", value: "40" },
        { slot: 3, name: "International", value: "2" },
      ],
      total: undefined,
    });
    expect(overall(m, words)?.total).toBeUndefined();
  });

  it("reads a split row's values with no total, and names the series with no total slot", () => {
    const split: ChartSpec = {
      ...firms,
      marks: [{ ...(firms.marks[0] as Extract<Mark, { mark: "bar" }>), arrange: "split" }],
    };
    const m = model(split);
    const bar = m.marks[0] as BarModel;
    expect(barReading(m, bar, 0, words)).toEqual({
      at: "Acme",
      entries: [
        { slot: 1, name: "Domestic", value: "40" },
        { slot: 3, name: "International", value: "2" },
      ],
      total: undefined,
    });
    expect(overall(m, words)?.total).toBeUndefined();
  });

  it("reads a mirrored row's two sides and its total", () => {
    const m = model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["45-50", "90+"],
          arrange: "mirror",
          series: [
            { name: "Male", x: [2_734_000, null] },
            { name: "Female", x: [2_690_000, 520_000] },
          ],
        },
      ],
    });
    const bars = m.marks[0] as BarModel;
    const r = barReading(m, bars, 0, words);
    expect(r?.entries.map((e) => `${e.name} ${e.value}`)).toEqual([
      "Male 2,734,000",
      "Female 2,690,000",
    ]);
    expect(r?.total).toBe("5,424,000");
    expect(barReading(m, bars, 1, words)?.entries.map((e) => e.value)).toEqual([
      "No data",
      "520,000",
    ]);
  });

  it("reads a diverging row's values in series order and its total", () => {
    const m = model({
      x: { format: "percent" },
      marks: [
        {
          mark: "bar",
          y: ["Item 3"],
          arrange: "diverge",
          left: 2,
          centre: true,
          series: [
            { name: "Strongly disagree", x: [0.1] },
            { name: "Disagree", x: [0.15] },
            { name: "Neutral", x: [0.2] },
            { name: "Agree", x: [0.3] },
            { name: "Strongly agree", x: [0.25] },
          ],
        },
      ],
    });
    const r = barReading(m, m.marks[0] as BarModel, 0, words);
    expect(r?.entries.map((e) => `${e.name} ${e.value}`)).toEqual([
      "Strongly disagree 10%",
      "Disagree 15%",
      "Neutral 20%",
      "Agree 30%",
      "Strongly agree 25%",
    ]);
    expect(r?.total).toBe("100%");
  });

  const shared = (rows: (number | null)[][]): ChartSpec => ({
    x: { unit: { one: "respondent", other: "respondents" } },
    marks: [
      {
        mark: "bar",
        y: rows.map((_, i) => `Item ${String(i + 1)}`),
        arrange: "share",
        series: [
          { name: "No", slot: 1, x: rows.map((r) => r[0] ?? null) },
          { name: "Yes", slot: 2, x: rows.map((r) => r[1] ?? null) },
        ],
      },
    ],
  });

  it("reads a 100% row's shares and its absolute total in the x unit", () => {
    const m = model(shared([[34, 66]]));
    expect(barReading(m, m.marks[0] as BarModel, 0, words)).toEqual({
      at: "Item 1",
      entries: [
        { slot: 1, name: "No", value: "34%" },
        { slot: 2, name: "Yes", value: "66%" },
      ],
      total: `100${nb}respondents`,
    });
    expect(overall(m, words)?.total).toBe("");
  });

  it("reads a 100% row whose total is 0 by its values, and a gap as No data", () => {
    const m = model(shared([[0, null]]));
    expect(barReading(m, m.marks[0] as BarModel, 0, words)).toEqual({
      at: "Item 1",
      entries: [
        { slot: 1, name: "No", value: "0" },
        { slot: 2, name: "Yes", value: "No data" },
      ],
      total: `0${nb}respondents`,
    });
  });

  it("keeps slots as wide as every row's reading and the whole chart's", () => {
    const measure = measurer((t) => 7 * Array.from(t).length, 6, "en");
    const m = model(firms);
    const w = readoutWidths(m, words, measure);
    const bar = m.marks[0] as BarModel;
    for (const r of [0, 1]) {
      const reading = barReading(m, bar, r, words);
      expect(measure.number(reading.at)).toBeLessThanOrEqual(w.at);
      reading.entries.forEach((e, k) => {
        expect(measure.number(e.value)).toBeLessThanOrEqual(w.values[k] ?? 0);
      });
      expect(measure.number(reading.total ?? "")).toBeLessThanOrEqual(w.total);
    }
    expect(measure.number(overall(m, words)?.at ?? "")).toBeLessThanOrEqual(w.at);
  });
});

describe("the legend row of a point chart", () => {
  const degrees = (
    x: NonNullable<ChartSpec["x"]> = {},
    ...series: (number | null)[][]
  ): ChartSpec => ({
    x,
    y: { unit: { one: "degree", other: "degrees" } },
    marks: [
      {
        mark: "point",
        y: ["Doctorate", "Master's"],
        series: series.map((v, k) => ({
          name: k === 0 ? "Women" : "Men",
          slot: (k + 2) as 2,
          x: v,
        })),
      },
    ],
  });
  const pointOf = (m: Model) => m.marks[0] as PointModel;

  it("reads the row count with blank chips and no total", () => {
    const m = model(degrees({}, [128_700, 91_000], [163_500, null]));
    expect(overall(m, words)).toEqual({
      at: `2${nb}degrees`,
      entries: [
        { slot: 2, name: "Women", value: "" },
        { slot: 3, name: "Men", value: "" },
      ],
      total: undefined,
    });
  });

  it("reads a row's values, a gap as No data, and no total", () => {
    const m = model(degrees({}, [128_700, 91_000], [163_500, null]));
    const r = pointReading(m, pointOf(m), 1, words);
    expect(r).toEqual({
      at: "Master's",
      entries: [
        { slot: 2, name: "Women", value: "91,000" },
        { slot: 3, name: "Men", value: "No data" },
      ],
      total: undefined,
    });
  });

  it("reads one series bare with the x unit, and instants on a time x", () => {
    const one = model(degrees({ unit: { one: "dollar", other: "dollars" } }, [1, null]));
    expect(pointReading(one, pointOf(one), 0, words).entries).toEqual([
      { slot: undefined, name: undefined, value: `1${nb}dollar` },
    ]);
    expect(pointReading(one, pointOf(one), 1, words).entries[0]?.value).toBe("No data");
    expect(overall(one, words)?.entries).toEqual([{ slot: undefined, name: undefined, value: "" }]);
    const timed = model(degrees({ type: "time" }, [START, START + 90 * MIN]));
    expect(pointReading(timed, pointOf(timed), 1, words).entries[0]?.value).toBe(
      time(START + 90 * MIN),
    );
  });

  it("keeps slots wide enough for every row's reading", () => {
    const measure = measurer((t) => 7 * Array.from(t).length, 6, "en");
    const m = model(degrees({}, [128_700, 91_000], [163_500, null]));
    const w = readoutWidths(m, words, measure);
    for (const r of [0, 1]) {
      const reading = pointReading(m, pointOf(m), r, words);
      expect(measure.number(reading.at)).toBeLessThanOrEqual(w.at);
      reading.entries.forEach((e, k) => {
        expect(measure.number(e.value)).toBeLessThanOrEqual(w.values[k] ?? 0);
      });
    }
    expect(w.at).toBe(measure.number(`2${nb}degrees`));
  });
});

describe("the legend row of a range or arrow plot", () => {
  const plot = (
    link: "range" | "arrow",
    x: NonNullable<ChartSpec["x"]>,
    women: (number | null)[],
    men: (number | null)[],
  ): Model =>
    model({
      x,
      marks: [
        {
          mark: "point",
          y: ["Doctorate", "Master's", "Bachelor's"],
          link,
          series: [
            { name: "Women", x: women },
            { name: "Men", x: men },
          ],
        },
      ],
    });
  const pointOf = (m: Model) => m.marks[0] as PointModel;

  it("keeps a blank Gap or Change slot with no selection", () => {
    for (const link of ["range", "arrow"] as const) {
      const m = plot(link, {}, [128_700, 91_000, 70_000], [163_500, 120_000, 81_000]);
      expect(overall(m, words)?.total).toBe("");
    }
    const m = plot("range", {}, [1, 2, 3], [4, 5, 6]);
    expect(totalWord(m, words)).toBe("Gap");
    expect(totalWord(plot("arrow", {}, [1, 2, 3], [4, 5, 6]), words)).toBe("Change");
    const dots = model({
      x: {},
      marks: [{ mark: "point", y: ["a"], series: [{ name: "A", x: [1] }] }],
    });
    expect(overall(dots, words)?.total).toBeUndefined();
    expect(totalWord(dots, words)).toBe("Total");
  });

  it("reads a range's gap either way round, and No data with a gap at an end", () => {
    const m = plot("range", {}, [128_700, 120_000, null], [163_500, 91_000, 81_000]);
    expect(pointReading(m, pointOf(m), 0, words)).toEqual({
      at: "Doctorate",
      entries: [
        { slot: 1, name: "Women", value: "128,700" },
        { slot: 2, name: "Men", value: "163,500" },
      ],
      total: "34,800",
    });
    expect(pointReading(m, pointOf(m), 1, words).total).toBe("29,000");
    expect(pointReading(m, pointOf(m), 2, words).total).toBe("No data");
  });

  it("reads an arrow's change with its sign, in x's format", () => {
    const pct = { format: { style: "percent", maximumFractionDigits: 1 } } as const;
    const m = plot("arrow", pct, [0.058, 0.5, 0.2], [0.93, 0.463, 0.2]);
    const r = pointReading(m, pointOf(m), 0, words);
    expect(r.entries.map((e) => e.value)).toEqual(["5.8%", "93%"]);
    expect(r.total).toBe("+87.2%");
    expect(pointReading(m, pointOf(m), 1, words).total).toBe("-3.7%");
    expect(pointReading(m, pointOf(m), 2, words).total).toBe("0%");
  });

  it("writes a gap and a change on a time x as durations", () => {
    const later = START + 90 * MIN;
    const range = plot("range", { type: "time" }, [later, START, START], [START, later, START]);
    expect(pointReading(range, pointOf(range), 0, words).total).toBe(
      formatDuration(90 * MIN, "en"),
    );
    const arrow = plot("arrow", { type: "time" }, [later, START, START], [START, later, START]);
    expect(pointReading(arrow, pointOf(arrow), 0, words).total).toBe(
      formatDuration(-90 * MIN, "en"),
    );
    expect(pointReading(arrow, pointOf(arrow), 1, words).total).toBe(
      `+${formatDuration(90 * MIN, "en")}`,
    );
  });

  it("keeps the last slot wide enough for every row's gap", () => {
    const measure = measurer((t) => 7 * Array.from(t).length, 6, "en");
    const m = plot("range", {}, [128_700, 1, null], [163_500, 2, 81_000]);
    const w = readoutWidths(m, words, measure);
    expect(w.total).toBe(measure.number("No data"));
    expect(w.total).toBeGreaterThanOrEqual(measure.number("34,800"));
  });
});

describe("the legend row of a slope chart", () => {
  const pets = (y: ChartSpec["y"], ...series: (number | null)[][]): Model =>
    model({
      ...(y === undefined ? {} : { y }),
      marks: [
        {
          mark: "slope",
          x: ["2005", "2015"],
          series: series.map((ends, k) => ({ name: ["Cats", "Horses"][k] ?? "", y: ends })),
        },
      ],
    });
  const slope = (m: Model) => m.marks[0] as SlopeModel;

  it("reads the right column with no selection, each chip its value there", () => {
    const m = pets(undefined, [50, 34], [null, 39]);
    expect(overall(m, words)).toEqual({
      at: "2015",
      entries: [
        { slot: 1, name: "Cats", value: "34" },
        { slot: 2, name: "Horses", value: "39" },
      ],
      total: undefined,
    });
    expect(columnReading(m, slope(m), 0, words).entries.map((e) => e.value)).toEqual([
      "50",
      "No data",
    ]);
  });

  it("marks a chosen series' chip, and none with one series, whose value is bare with its unit", () => {
    const m = pets(undefined, [50, 34], [30, 39]);
    expect(columnReading(m, slope(m), 0, words, 1)).toMatchObject({ at: "2005", chosen: 1 });
    expect(columnReading(m, slope(m), 0, words)).not.toHaveProperty("chosen");
    const one = pets({ unit: { one: "cat", other: "cats" } }, [50, 34]);
    expect(columnReading(one, slope(one), 1, words, 0)).toEqual({
      at: "2015",
      entries: [{ slot: undefined, name: undefined, value: `34${nb}cats` }],
      total: undefined,
    });
  });

  it("keeps each slot as wide as either column needs", () => {
    const m = pets(undefined, [1_250_000, 34], [null, 39]);
    const measure = measurer((t) => 7 * Array.from(t).length, 7, "en");
    const w = readoutWidths(m, words, measure);
    expect(w.at).toBe(7 * 4);
    expect(w.values).toEqual([7 * "1,250,000".length, 7 * "No data".length]);
  });
});

describe("a scatter's legend row with no selection", () => {
  const scatter = (series: number): Model =>
    chartModel(
      {
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        marks: [
          {
            mark: "scatter",
            unit: { one: "country", other: "countries" },
            series: [
              {
                name: "Europe",
                slot: 2 as const,
                names: ["Albania", "Andorra", "Monaco"],
                x: [1, 2, null],
                y: [3, 4, 5],
              },
              { name: "Africa", slot: 5 as const, names: ["Chad"], x: [6], y: [7] },
            ].slice(0, series),
          },
        ],
      },
      "en",
      "UTC",
    );

  it("reads the dots drawn, blank slots for both measures, and each series' count", () => {
    expect(overall(scatter(2), words)).toEqual({
      at: `3${nb}countries`,
      entries: [
        { slot: undefined, name: undefined, value: "" },
        { slot: undefined, name: undefined, value: "" },
        { slot: 2, name: "Europe", value: "2" },
        { slot: 5, name: "Africa", value: "1" },
      ],
      total: undefined,
    });
  });

  it("has no chip for one series", () => {
    expect(overall(scatter(1), words)?.entries).toHaveLength(2);
    expect(overall(scatter(1), words)?.at).toBe(`2${nb}countries`);
  });
});

describe("a scatter's legend row with a dot selected", () => {
  const world = (series: number): Model =>
    model({
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
      marks: [
        {
          mark: "scatter",
          series: [
            {
              name: "Europe",
              slot: 2 as const,
              names: ["Albania", "Liechtenstein", "Norway"],
              x: [19, 140, 82],
              y: [79.8, 84.3, 83.2],
            },
            { name: "Africa", slot: 5 as const, names: ["Chad"], x: [1.6], y: [53] },
          ].slice(0, series),
        },
      ],
    });
  const scatterOf = (m: Model) => m.marks[0] as ScatterModel;

  it("reads the dot's name, each measure with its label, the chips' counts, its chip chosen", () => {
    const m = world(2);
    expect(scatterReading(m, scatterOf(m), 1, 0, words)).toEqual({
      at: "Chad",
      entries: [
        { slot: undefined, name: undefined, value: "GDP per capita 1.6" },
        { slot: undefined, name: undefined, value: "Life expectancy 53" },
        { slot: 2, name: "Europe", value: "3" },
        { slot: 5, name: "Africa", value: "1" },
      ],
      total: undefined,
      chosen: 3,
    });
  });

  it("chooses no chip with one series, which has none", () => {
    const m = world(1);
    expect(scatterReading(m, scatterOf(m), 0, 2, words)).toEqual({
      at: "Norway",
      entries: [
        { slot: undefined, name: undefined, value: "GDP per capita 82" },
        { slot: undefined, name: undefined, value: "Life expectancy 83.2" },
      ],
      total: undefined,
    });
  });

  it("keeps each slot as wide as its widest reading: the longest name and each measure's", () => {
    const measure = measurer((t) => 7 * Array.from(t).length, 7, "en");
    const w = readoutWidths(world(2), words, measure);
    expect(w.at).toBe(7 * "Liechtenstein".length);
    expect(w.values).toEqual([
      7 * "GDP per capita 140".length,
      7 * "Life expectancy 79.8".length,
      7 * "3".length,
      7 * "1".length,
    ]);
  });

  it("finds each measure's widest reading among thousands of dots, past their extremes", () => {
    const n = 5_000;
    const m = model({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            {
              name: "All",
              names: per(n, (i) => `d${String(i)}`),
              x: per(n, (i) => (i === 2_345 ? 12_345 : i % 10)),
              y: per(n, (i) => (i === 3_001 ? -42 : 1)),
            },
          ],
        },
      ],
    });
    const w = readoutWidths(
      m,
      words,
      measurer((t) => 7 * Array.from(t).length, 7, "en"),
    );
    expect(w.values).toEqual([7 * "x 12,345".length, 7 * "y -42".length]);
  });
  it("holds a value wider than the extremes and every other dot", () => {
    const n = 1_000;
    const x = per(n, (i) => (i === 0 ? 0 : i === n - 1 ? 100 : i === 2 ? 71.25 : 50));
    const m = model({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [{ name: "All", names: per(n, (i) => `d${String(i)}`), x, y: x }],
        },
      ],
    });
    const w = readoutWidths(
      m,
      words,
      measurer((t) => 7 * Array.from(t).length, 7, "en"),
    );
    expect(w.values).toEqual([7 * "x 71.25".length, 7 * "y 71.25".length]);
    const dots = m.marks[0] as ScatterModel;
    for (let i = 0; i < n; i++) {
      scatterReading(m, dots, 0, i, words).entries.forEach((e, k) => {
        expect(7 * Array.from(e.value).length).toBeLessThanOrEqual(w.values[k] ?? 0);
      });
    }
  });

  it("writes every value of a format it cannot key, such as a function's", () => {
    const n = 1_000;
    const m = model({
      x: { label: "x", format: (v) => (v === 7 ? "seven" : String(v)) },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            {
              name: "All",
              names: per(n, (i) => `d${String(i)}`),
              x: per(n, (i) => (i === 3 ? 7 : i === n - 1 ? 100 : i)),
              y: per(n, () => 1),
            },
          ],
        },
      ],
    });
    const w = readoutWidths(
      m,
      words,
      measurer((t) => 7 * Array.from(t).length, 7, "en"),
    );
    expect(w.values[0]).toBe(7 * "x seven".length);
  });
});

describe("a bubble chart's legend row", () => {
  const world = model({
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    r: { label: "Population", format: { notation: "compact" } },
    marks: [
      {
        mark: "scatter",
        series: [
          {
            name: "Asia",
            slot: 3 as const,
            names: ["Japan", "Laos"],
            x: [48, 8.4],
            y: [84.5, 68],
            r: [124_000_000, null],
          },
          { name: "Europe", slot: 2 as const, names: ["Monaco"], x: [140], y: [85.9], r: [0] },
        ],
      },
    ],
  });
  const bubbleOf = world.marks[0] as ScatterModel;

  it("keeps a blank slot for the size with no selection, and counts the dots with a size", () => {
    expect(overall(world, words)).toEqual({
      at: "2 points",
      entries: [
        { slot: undefined, name: undefined, value: "" },
        { slot: undefined, name: undefined, value: "" },
        { slot: undefined, name: undefined, value: "" },
        { slot: 3, name: "Asia", value: "1" },
        { slot: 2, name: "Europe", value: "1" },
      ],
      total: undefined,
    });
  });

  it("reads a bubble's size after its two measures, its chip after the three", () => {
    expect(scatterReading(world, bubbleOf, 0, 0, words)).toEqual({
      at: "Japan",
      entries: [
        { slot: undefined, name: undefined, value: "GDP per capita 48" },
        { slot: undefined, name: undefined, value: "Life expectancy 84.5" },
        { slot: undefined, name: undefined, value: "Population 124M" },
        { slot: 3, name: "Asia", value: "1" },
        { slot: 2, name: "Europe", value: "1" },
      ],
      total: undefined,
      chosen: 3,
    });
    expect(scatterReading(world, bubbleOf, 1, 0, words).entries[2]?.value).toBe("Population 0");
  });

  it("keeps the size's slot as wide as its widest reading", () => {
    const w = readoutWidths(
      world,
      words,
      measurer((t) => 7 * Array.from(t).length, 7, "en"),
    );
    expect(w.values[2]).toBe(7 * "Population 124M".length);
  });
});

describe("a cell chart's legend row", () => {
  const nb = "\u00A0";
  const hist: ChartSpec = {
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    colour: { unit: { one: "country", other: "countries" } },
    marks: [
      {
        mark: "cell",
        x: { edges: [500, 1000, 2000] },
        y: { edges: [55, 60, 65] },
        values: [
          [3, 12],
          [null, 1],
        ],
      },
    ],
  };
  const cellOf = (m: Model) => m.marks[0] as CellModel;
  const width = (t: string) => 7 * Array.from(t).length;
  const face = measurer(width, 7, "en");

  it("reads the cell count and a blank value with no selection", () => {
    const m = chartModel(hist, "en", TZ);
    expect(overall(m, words)).toEqual({
      at: "4 cells",
      entries: [{ slot: undefined, name: undefined, value: "" }],
      total: undefined,
    });
  });

  it("reads a bin's place through each axis's label and the value in the colour unit", () => {
    const m = chartModel(hist, "en", TZ);
    expect(cellReading(m, cellOf(m), 0, 1, words)).toEqual({
      at: "Life expectancy 55 to 60, GDP per capita 1,000 to 2,000",
      entries: [{ slot: undefined, name: undefined, value: `12${nb}countries` }],
      total: undefined,
      // Integer counts up to 12 take classes 5 wide: 10 to 15 is the third.
      swatch: 2,
    });
  });

  it("reads a missing cell as No data, its swatch the No data one", () => {
    const m = chartModel(hist, "en", TZ);
    const r = cellReading(m, cellOf(m), 1, 0, words);
    expect(r.entries[0]?.value).toBe("No data");
    expect(r.swatch).toBe(-1);
  });

  it("names a category grid's cell by its row, then its column", () => {
    const m = chartModel(
      { marks: [{ mark: "cell", x: ["2 PM"], y: ["Tuesday"], values: [[42]] }] },
      "en",
      TZ,
    );
    expect(cellReading(m, cellOf(m), 0, 0, words).at).toBe("Tuesday, 2 PM");
  });

  it("keeps the slots as wide as the widest place and value", () => {
    const m = chartModel(
      {
        colour: { unit: { one: "post", other: "posts" } },
        marks: [
          {
            mark: "cell",
            x: ["a", "longest"],
            y: ["Wednesday", "Mon"],
            values: [
              [1, 1000],
              [null, 2],
            ],
          },
        ],
      },
      "en",
      TZ,
    );
    const w = readoutWidths(m, words, face);
    expect(w.at).toBe(width("Wednesday, longest"));
    expect(w.values).toEqual([width(`1,000${nb}posts`)]);
  });
});

describe("the legend row of a box plot", () => {
  const latency = (two = false): ChartSpec => ({
    y: { unit: { one: "endpoint", other: "endpoints" } },
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
            outliers: [[1100, 2600], []],
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
      },
    ],
  });
  const boxOf = (m: Model) => m.marks[0] as BoxModel;

  it("reads one series' median, middle half, whiskers and outlier count under their labels", () => {
    const m = model(latency());
    expect(boxReading(m, boxOf(m), 0, words)).toEqual({
      at: "search",
      entries: [
        { slot: undefined, name: undefined, value: "Median 240" },
        { slot: undefined, name: undefined, value: "Middle half 180 to 410" },
        { slot: undefined, name: undefined, value: "Whiskers 120 to 760" },
        { slot: undefined, name: undefined, value: "Outliers 2" },
      ],
      total: undefined,
    });
    expect(boxReading(m, boxOf(m), 1, words).entries.map((e) => e.value)).toEqual([
      "No data",
      "",
      "",
      "",
    ]);
  });

  it("reads a median chip per series from two series up", () => {
    const m = model(latency(true));
    const r = boxReading(m, boxOf(m), 1, words);
    expect(r.entries.map((e) => [e.name, e.value])).toEqual([
      ["Before", "No data"],
      ["After", "2"],
    ]);
  });

  it("with no selection reads the row count and keeps the slots blank", () => {
    expect(overall(model(latency()), words)).toEqual({
      at: `2${nb}endpoints`,
      entries: [0, 1, 2, 3].map(() => ({ slot: undefined, name: undefined, value: "" })),
      total: undefined,
    });
    expect(overall(model(latency(true)), words)?.entries.map((e) => e.value)).toEqual(["", ""]);
  });

  it("keeps each slot at the widest reading of any row", () => {
    const measure = measurer((t) => 7 * Array.from(t).length, 7, "en");
    const w = readoutWidths(model(latency()), words, measure);
    expect(w.values).toEqual([
      7 * "Median 240".length,
      7 * "Middle half 180 to 410".length,
      7 * "Whiskers 120 to 760".length,
      7 * "Outliers 2".length,
    ]);
  });
});
