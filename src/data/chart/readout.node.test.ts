import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";
import { measurer } from "../scale/measure.js";

import {
  chartModel,
  type AreaModel,
  type BarModel,
  type DotModel,
  type LineModel,
  type Model,
  type RectModel,
} from "./model.js";
import {
  barReading,
  bucketReading,
  overall,
  postReading,
  readoutWidths,
  rowReading,
  sampleReading,
  type Reading,
} from "./readout.js";
import type { ChartSpec } from "./spec.js";
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
