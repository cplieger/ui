import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";

import { chartModel, type Model } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";
import { generatedSummary, shortDescription, summaryOf } from "./summary.js";
import { chartWords } from "./words.js";

const TZ = "Europe/Paris";
const MIN = 60_000;
// 8:00 AM in Paris on 11 November 2026, UTC+1.
const START = Date.UTC(2026, 10, 11, 7);
const END = START + 360 * MIN;
const words = chartWords();
const nb = "\u00A0";

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const span = (a: number, b: number) => `${time(a)} to ${time(b)}`;
const dur = (ms: number) => formatDuration(ms, "en");
const model = (spec: ChartSpec): Model => chartModel(spec, "en", TZ);
const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

const starts = per(24, (i) => START + i * 15 * MIN);
const ends = starts.map((t) => t + 15 * MIN);
const posts = { one: "post", other: "posts" };

// 24 quarter hours: bucket 13 is the busiest closed one, bucket 23 the open one.
const stacked: ChartSpec = {
  x: { type: "time", domain: [START, END] },
  y: { label: "Posts", unit: posts },
  marks: [
    {
      mark: "rect",
      x1: starts,
      x2: ends,
      open: true,
      series: [
        { name: "Announce", y: per(24, (i) => (i === 23 ? 30 : 5)) },
        { name: "Path", y: per(24, (i) => (i === 13 ? 9 : 4)) },
      ],
    },
  ],
};

describe("the summary of a column chart", () => {
  it("says the total, the bucket size, the range, each series and the busiest closed bucket", () => {
    expect(generatedSummary(model(stacked), words)).toBe(
      `246${nb}posts, every 15${nb}min from ${span(START, END)}: Announce 145, Path 101. ` +
        `Busiest: ${span(starts[13] ?? 0, ends[13] ?? 0)}, 14${nb}posts.`,
    );
  });

  it("drops the parts for one series and the size for unequal buckets", () => {
    const x2 = [...ends];
    x2[0] = START + 10 * MIN;
    const one: ChartSpec = {
      ...stacked,
      marks: [{ mark: "rect", x1: starts, x2, series: [{ name: "All", y: per(24, () => 1) }] }],
    };
    expect(generatedSummary(model(one), words)).toBe(
      `24${nb}posts from ${span(START, END)}. Busiest: ${span(START, START + 10 * MIN)}, 1${nb}post.`,
    );
  });

  it("names no busiest bucket when only the open one has posts", () => {
    const quiet: ChartSpec = {
      ...stacked,
      marks: [
        {
          mark: "rect",
          x1: starts,
          x2: ends,
          open: true,
          series: [{ name: "All", y: per(24, (i) => (i === 23 ? 3 : 0)) }],
        },
      ],
    };
    expect(generatedSummary(model(quiet), words)).toBe(
      `3${nb}posts, every 15${nb}min from ${span(START, END)}.`,
    );
  });

  it("names the kind, the series count and the range", () => {
    expect(shortDescription(model(stacked), words)).toBe(
      `Stacked column chart, 2 series, ${span(START, END)}`,
    );
    const one: ChartSpec = {
      ...stacked,
      marks: [
        { mark: "rect", x1: starts, x2: ends, series: [{ name: "All", y: per(24, () => 1) }] },
      ],
    };
    expect(shortDescription(model(one), words)).toBe(`Column chart, ${span(START, END)}`);
  });
});

describe("the summary of grouped columns", () => {
  const mark = stacked.marks[0] as Extract<Mark, { mark: "rect" }>;
  const grouped: ChartSpec = { ...stacked, marks: [{ ...mark, arrange: "group" }] };

  it("names the highest single value of a closed bucket in place of the busiest bucket", () => {
    // The open bucket's Announce 30 is still filling, so Path's 9 is the highest.
    expect(generatedSummary(model(grouped), words)).toBe(
      `246${nb}posts, every 15${nb}min from ${span(START, END)}: Announce 145, Path 101. ` +
        `Highest: Path, ${span(starts[13] ?? 0, ends[13] ?? 0)}, 9${nb}posts.`,
    );
  });

  it("names the busiest bucket of one series grouped, which is a plain column chart", () => {
    const one: ChartSpec = {
      ...grouped,
      marks: [
        {
          ...mark,
          arrange: "group",
          series: [{ name: "All", y: per(24, (i) => (i === 4 ? 3 : 1)) }],
        },
      ],
    };
    expect(generatedSummary(model(one), words)).toBe(
      `26${nb}posts, every 15${nb}min from ${span(START, END)}. ` +
        `Busiest: ${span(starts[4] ?? 0, ends[4] ?? 0)}, 3${nb}posts.`,
    );
  });

  it("is a grouped column chart with its series count", () => {
    expect(shortDescription(model(grouped), words)).toBe(
      `Grouped column chart, 2 series, ${span(START, END)}`,
    );
  });
});

const edges = durationEdges();
const reads = (
  series: Extract<Mark, { mark: "rect" }>["series"],
  rules: Mark[] = [],
): ChartSpec => ({
  x: {
    type: "log",
    format: "duration",
    label: "Time from post to read",
    domain: [1_000, edges.at(-1) ?? 0],
  },
  y: { label: "Reads", unit: { one: "read", other: "reads" } },
  marks: [{ mark: "rect", x1: edges.slice(0, -1), x2: edges.slice(1), series }, ...rules],
});
const bins = edges.length - 1;

describe("the summary of a histogram", () => {
  const rules: Mark[] = [
    { mark: "rule", x: 42_000, label: "Median" },
    { mark: "rule", x: 18 * MIN, label: "95th percentile" },
  ];

  it("says the count from under the low end, then each rule", () => {
    const m = model(reads([{ name: "Reads", y: per(bins, () => 2) }], rules));
    expect(generatedSummary(m, words)).toBe(
      `32${nb}reads from under ${dur(1_000)} to ${dur(edges.at(-1) ?? 0)}. ` +
        `Median ${dur(42_000)}. 95th percentile ${dur(18 * MIN)}.`,
    );
    expect(shortDescription(m, words)).toBe(
      `Histogram, under ${dur(1_000)} to ${dur(edges.at(-1) ?? 0)}`,
    );
  });

  it("adds each series' total after the count when stacked", () => {
    const m = model(
      reads(
        [
          { name: "Direct", y: per(bins, () => 3) },
          { name: "Path", y: per(bins, () => 1) },
        ],
        rules.slice(0, 1),
      ),
    );
    expect(generatedSummary(m, words)).toBe(
      `64${nb}reads from under ${dur(1_000)} to ${dur(edges.at(-1) ?? 0)}. ` +
        `Direct 48, Path 16. Median ${dur(42_000)}.`,
    );
    expect(shortDescription(m, words)).toBe(
      `Histogram, 2 series, under ${dur(1_000)} to ${dur(edges.at(-1) ?? 0)}`,
    );
  });

  it("reads a plain range when the underflow bin is not drawn below the low end", () => {
    const m = model({
      ...reads([{ name: "Reads", y: per(bins, () => 1) }]),
      x: { type: "log", format: "duration", domain: [10_000, edges.at(-1) ?? 0] },
    });
    expect(generatedSummary(m, words)).toMatch(
      new RegExp(`^12${nb}reads from ${dur(10_000)} to `, "u"),
    );
  });
});

describe("the summary of a step line", () => {
  const x = per(361, (i) => START + i * MIN);
  const m = model({
    x: { type: "time", domain: [START, END] },
    y: { label: "Agents" },
    marks: [
      {
        mark: "line",
        curve: "step",
        x,
        series: [
          { name: "Live", y: x.map((_, i) => (i < 30 ? null : i < 200 ? 4 : i < 300 ? 12 : 10)) },
          { name: "Active", y: x.map((_, i) => (i < 100 ? 0 : i < 250 ? 9 : 6)) },
        ],
      },
    ],
  });

  it("says the range, the sample interval and each series' last, low and high", () => {
    expect(generatedSummary(m, words)).toBe(
      `${span(START, END)}, every 1${nb}min. Live: last 10, low 4, high 12. ` +
        "Active: last 6, low 0, high 9.",
    );
  });

  it("reads the low and high of a 90-day minute line, and No data for a series with none", () => {
    const n = 90 * 24 * 60;
    const long = per(n, (i) => START + i * MIN);
    const big = model({
      x: { type: "time", domain: [START, START + (n - 1) * MIN] },
      marks: [
        {
          mark: "line",
          x: long,
          series: [
            { name: "Load", y: long.map((_, i) => (i === 7 ? -3 : i === n - 2 ? 40 : i % 10)) },
            { name: "Idle", y: long.map(() => null) },
          ],
        },
      ],
    });
    const text = generatedSummary(big, words);
    expect(text).toContain("Load: last 9, low -3, high 40.");
    expect(text).toContain("Idle: last No data, low No data, high No data.");
  });

  it("names a step line and its series", () => {
    expect(shortDescription(m, words)).toBe(`Step line, 2 series, ${span(START, END)}`);
  });

  it("drops the interval when the samples are unevenly spaced, and names a straight line", () => {
    const uneven = model({
      x: { type: "time", domain: [START, END] },
      marks: [
        {
          mark: "line",
          x: [START, START + MIN, START + 3 * MIN],
          series: [{ name: "Load", y: [1, 2, 3] }],
        },
      ],
    });
    expect(generatedSummary(uneven, words)).toBe(
      `${span(START, END)}. Load: last 3, low 1, high 3.`,
    );
    expect(shortDescription(uneven, words)).toBe(`Line chart, ${span(START, END)}`);
  });
});

describe("the summary of a timeline", () => {
  const quiet = ["docs-bot", "ha-agent", "notes-bot", "a", "b", "c", "d"];
  const m = model({
    x: { type: "time", domain: [START, END] },
    y: { type: "band", mono: true, unit: { one: "agent", other: "agents" } },
    marks: [
      {
        mark: "dot",
        unit: posts,
        rows: [
          { name: "lead-ui", x: per(5, (i) => START + i * 30 * MIN) },
          { name: "dev-ui", x: [START + 5 * MIN, START + 9 * MIN] },
          ...quiet.map((name) => ({ name, x: [] })),
          { name: "late", x: [END + MIN] },
        ],
      },
    ],
  });

  it("says the range, the rows and dots, the busiest row and the first five silent ones", () => {
    expect(generatedSummary(m, words)).toBe(
      `${span(START, END)}. 10${nb}agents, 7${nb}posts. Most: lead-ui, 5${nb}posts. ` +
        "None: docs-bot, ha-agent, notes-bot, a, b and 3 more.",
    );
    expect(shortDescription(m, words)).toBe(`Timeline, ${span(START, END)}`);
  });
});

describe("the spec's own summary", () => {
  it("replaces the generated text with a string, or edits it with a function", () => {
    expect(summaryOf(model({ ...stacked, summary: "Posts today." }), words)).toBe("Posts today.");
    const edited = summaryOf(model({ ...stacked, summary: (s) => `${s} 38 still unread.` }), words);
    expect(edited).toBe(`${generatedSummary(model(stacked), words)} 38 still unread.`);
  });

  it("speaks through the app's words", () => {
    const fr = chartWords({ busiest: (range, n) => `Pic : ${range}, ${n}.` });
    expect(generatedSummary(model(stacked), fr)).toMatch(/ Pic : .*, 14\u00A0posts\.$/u);
  });
});
