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

  // Paris springs forward on 29 March 2026 and falls back on 25 October.
  const HR = 60 * MIN;
  const dated = (t: number) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: TZ,
    }).format(t);
  const across = (lo: number, hi: number): Model =>
    model({
      x: { type: "time", domain: [lo, hi] },
      marks: [{ mark: "line", x: [lo, hi], series: [{ name: "Load", y: [3, 5] }] }],
    });

  it("dates both ends of a domain a whole day long, whose clock times match", () => {
    const day = 24 * HR;
    const m = model({ ...stacked, x: { type: "time", domain: [END - day, END] } });
    expect(shortDescription(m, words)).toBe(
      `Stacked column chart, 2 series, ${dated(END - day)} to ${dated(END)}`,
    );
  });

  it.each([
    ["a 23-hour spring-forward day", Date.UTC(2026, 2, 28, 13), 23],
    ["a 25-hour fall-back day", Date.UTC(2026, 9, 24, 12), 25],
  ])("dates both ends of %s, in the description and the summary", (_, lo, hours) => {
    const hi = lo + hours * HR;
    expect(time(lo)).toBe(time(hi));
    const m = across(lo, hi);
    const range = `${dated(lo)} to ${dated(hi)}`;
    expect(shortDescription(m, words)).toBe(`Line chart, ${range}`);
    expect(generatedSummary(m, words)).toContain(range);
  });

  it("writes only the times of a domain under a day that crosses midnight", () => {
    // 10:00 PM to 4:00 AM in Paris.
    const lo = Date.UTC(2026, 10, 11, 21);
    const hi = lo + 6 * HR;
    expect(shortDescription(across(lo, hi), words)).toBe(`Line chart, ${span(lo, hi)}`);
  });
});

describe("the summary of a step area", () => {
  const rect = stacked.marks[0] as Extract<Mark, { mark: "rect" }>;
  const shaped = (more: Partial<Extract<Mark, { mark: "rect" }>>): ChartSpec => ({
    ...stacked,
    marks: [{ ...rect, shape: "area", ...more }],
  });

  it("says what the columns say, the shape changing only the drawing", () => {
    expect(generatedSummary(model(shaped({})), words)).toBe(
      generatedSummary(model(stacked), words),
    );
  });

  it("names a stacked area, a 100% area and an area of one series", () => {
    expect(shortDescription(model(shaped({})), words)).toBe(
      `Stacked area chart, 2 series, ${span(START, END)}`,
    );
    expect(shortDescription(model(shaped({ arrange: "share" })), words)).toBe(
      `100% stacked area chart, 2 series, ${span(START, END)}`,
    );
    const one = shaped({ series: [{ name: "All", y: per(24, () => 1) }] });
    expect(shortDescription(model(one), words)).toBe(`Area chart, ${span(START, END)}`);
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

describe("the summary of columns stacked to 100%", () => {
  const mark = stacked.marks[0] as Extract<Mark, { mark: "rect" }>;
  const share: ChartSpec = { ...stacked, marks: [{ ...mark, arrange: "share" }] };

  it("gives each series' share of the grand total and the busiest bucket's absolute total", () => {
    // 145 and 101 of 246; bucket 13 holds 5 and 9.
    expect(generatedSummary(model(share), words)).toBe(
      `246${nb}posts, every 15${nb}min from ${span(START, END)}: Announce 59%, Path 41%. ` +
        `Busiest: ${span(starts[13] ?? 0, ends[13] ?? 0)}, 14${nb}posts.`,
    );
  });

  it("writes its amounts as numbers whatever format its shares take", () => {
    const tenths: ChartSpec = {
      ...share,
      y: { ...share.y, format: { style: "percent", maximumFractionDigits: 1 } },
    };
    expect(generatedSummary(model(tenths), words)).toContain(
      `246${nb}posts, every 15${nb}min from ${span(START, END)}: Announce 58.9%, Path 41.1%.`,
    );
  });

  it("is a 100% stacked column chart with its series count", () => {
    expect(shortDescription(model(share), words)).toBe(
      `100% stacked column chart, 2 series, ${span(START, END)}`,
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

describe("the summary of a stacked area", () => {
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

  it("says each layer's last, low and high, then the total's, a gap leaving it out", () => {
    expect(generatedSummary(model(spec()), words)).toBe(
      `${span(START, START + 6 * MIN)}, every 1${nb}min. Gas: last 1,204, low 990, high 1,310. ` +
        "Wind: last 980, low 410, high 1,020. Solar: last 412, low 200, high 790. " +
        "Total: last 2,596, low 1,900, high 2,700.",
    );
  });

  it("names a stacked area whatever its curve, and an area of one series", () => {
    expect(shortDescription(model(spec({ curve: "step" })), words)).toBe(
      `Stacked area chart, 3 series, ${span(START, START + 6 * MIN)}`,
    );
    const one = model(spec({ series: [{ name: "Gas", y: per(7, () => 1) }] }));
    expect(shortDescription(one, words)).toBe(`Area chart, ${span(START, START + 6 * MIN)}`);
    expect(generatedSummary(one, words)).not.toContain("Total");
  });
});

describe("the summary of an area stacked to 100%", () => {
  const x = per(3, (i) => START + i * MIN);
  const m = model({
    x: { type: "time", domain: [START, START + 2 * MIN] },
    y: { format: { style: "percent", maximumFractionDigits: 1 } },
    marks: [
      {
        mark: "area",
        x,
        arrange: "share",
        series: [
          { name: "Gas", y: [0, 1, 1_500] },
          { name: "Wind", y: [0, 3, 500] },
        ],
      },
    ],
  });

  it("says each layer's shares where its stack is drawn and the total's amounts", () => {
    expect(generatedSummary(m, words)).toBe(
      `${span(START, START + 2 * MIN)}, every 1${nb}min. Gas: last 75%, low 25%, high 75%. ` +
        "Wind: last 25%, low 25%, high 75%. Total: last 2,000, low 0, high 2,000.",
    );
  });

  it("names a 100% stacked area chart", () => {
    expect(shortDescription(m, words)).toBe(
      `100% stacked area chart, 2 series, ${span(START, START + 2 * MIN)}`,
    );
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

describe("the notes in the summary", () => {
  it("follow the rules, each its x in the readings' format and its text, in spec order", () => {
    const spec: ChartSpec = {
      ...stacked,
      marks: [
        ...stacked.marks,
        { mark: "text", x: starts[3] ?? 0, y: 9, text: "Deploy" },
        { mark: "rule", y: 12, label: "Limit" },
        { mark: "text", x: starts[9] ?? 0, y: 9, text: "Rollback" },
      ],
    };
    expect(generatedSummary(model(spec), words)).toMatch(
      new RegExp(
        `Limit 12\\. ${time(starts[3] ?? 0)}: Deploy\\. ${time(starts[9] ?? 0)}: Rollback\\.$`,
        "u",
      ),
    );
  });

  it("names a timeline note's row before its time", () => {
    const spec: ChartSpec = {
      x: { type: "time", domain: [START, END] },
      marks: [
        { mark: "dot", rows: [{ name: "ana", x: [START + MIN] }] },
        { mark: "text", x: START + 2 * MIN, y: "ana", text: "Paused" },
      ],
    };
    expect(generatedSummary(model(spec), words)).toMatch(
      new RegExp(`ana, ${time(START + 2 * MIN)}: Paused\\.$`, "u"),
    );
  });

  it("include a note outside a passed domain, which is not drawn", () => {
    const spec: ChartSpec = {
      ...stacked,
      marks: [...stacked.marks, { mark: "text", x: END + 60 * MIN, y: 1, text: "Later" }],
    };
    expect(generatedSummary(model(spec), words)).toMatch(/: Later\.$/u);
  });

  it("end a note written as a sentence once", () => {
    const spec: ChartSpec = {
      ...stacked,
      marks: [...stacked.marks, { mark: "text", x: START, y: 1, text: "Deploy of 1.4.0." }],
    };
    expect(generatedSummary(model(spec), words)).toMatch(
      new RegExp(`${time(START)}: Deploy of 1\\.4\\.0\\.$`, "u"),
    );
  });

  it("take the app's words", () => {
    const spec: ChartSpec = {
      ...stacked,
      marks: [...stacked.marks, { mark: "text", x: START, y: 1, text: "Start" }],
    };
    const own = chartWords({ note: (at, text) => `[${at}] ${text}` });
    expect(generatedSummary(model(spec), own)).toMatch(
      new RegExp(`\\[${time(START)}\\] Start$`, "u"),
    );
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

describe("the summary of a bar chart", () => {
  const countries = { one: "country", other: "countries" };
  const ages: ChartSpec = {
    x: {},
    y: { unit: countries },
    marks: [
      {
        mark: "bar",
        y: ["Holy See", "Monaco", "Japan", "Andorra"],
        series: [{ name: "Median age", x: [57.4, 49.8, 49.8, null] }],
      },
    ],
  };
  const firms: ChartSpec = {
    x: {},
    y: { unit: { one: "company", other: "companies" } },
    marks: [
      {
        mark: "bar",
        y: ["Acme", "Brill", "Corda"],
        series: [
          { name: "Domestic", x: [40, 3, 7] },
          { name: "International", x: [2, 22, 2] },
          { name: "Online", x: [null, null, null] },
        ],
      },
    ],
  };

  it("counts the rows, then names the highest and lowest, the first row on a tie", () => {
    expect(generatedSummary(model(ages), words)).toBe(
      `4${nb}countries. Highest Holy See 57.4, lowest Monaco 49.8.`,
    );
  });

  it("signs a diverging bar chart's extremes and names its kind", () => {
    const m = model({
      x: { format: { style: "percent", maximumFractionDigits: 1 } },
      y: { unit: { one: "state", other: "states" } },
      marks: [
        {
          mark: "bar",
          y: ["Utah", "Texas", "Puerto Rico"],
          series: [{ name: "Change", x: [0.16, 0, -0.143] }],
        },
      ],
    });
    expect(generatedSummary(m, words)).toBe(
      `3${nb}states. Highest Utah +16%, lowest Puerto Rico -14.3%.`,
    );
    expect(shortDescription(m, words)).toBe(`Diverging bar chart, 3${nb}states`);
  });

  it("names each series' extremes and the totals', leaving out a series with no value", () => {
    expect(generatedSummary(model(firms), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2. Total: highest Acme 42, lowest Corda 9.",
    );
  });

  it("names each grouped series' extremes and no totals", () => {
    const grouped: ChartSpec = {
      ...firms,
      marks: [{ ...(firms.marks[0] as Extract<Mark, { mark: "bar" }>), arrange: "group" }],
    };
    expect(generatedSummary(model(grouped), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2.",
    );
    expect(shortDescription(model(grouped), words)).toBe(
      `Grouped bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("names each split series' extremes and no totals, a split bar chart at every width", () => {
    const split: ChartSpec = {
      ...firms,
      marks: [{ ...(firms.marks[0] as Extract<Mark, { mark: "bar" }>), arrange: "split" }],
    };
    expect(generatedSummary(model(split), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2.",
    );
    expect(shortDescription(model(split), words)).toBe(
      `Split bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("names each 100% series' highest and lowest share, leaving out a row whose total is 0, and no totals", () => {
    const share: ChartSpec = {
      x: {},
      y: { unit: { one: "company", other: "companies" } },
      marks: [
        {
          mark: "bar",
          y: ["Acme", "Brill", "Corda", "Dune"],
          arrange: "share",
          series: [
            { name: "Domestic", x: [40, 3, 1, 0] },
            { name: "International", x: [10, 1, 3, 0] },
          ],
        },
      ],
    };
    expect(generatedSummary(model(share), words)).toBe(
      `4${nb}companies, 2 series. Domestic: highest Acme 80%, lowest Corda 25%. ` +
        "International: highest Corda 75%, lowest Acme 20%.",
    );
    expect(shortDescription(model(share), words)).toBe(
      `100% stacked bar chart, 2 series, 4${nb}companies`,
    );
  });

  it("names each diverging series' extremes and the totals', a diverging stacked bar chart", () => {
    const likert: ChartSpec = {
      x: { format: "percent" },
      y: { unit: { one: "item", other: "items" } },
      marks: [
        {
          mark: "bar",
          y: ["Item 1", "Item 2"],
          arrange: "diverge",
          left: 1,
          centre: true,
          series: [
            { name: "Disagree", x: [0.25, 0.1] },
            { name: "Neutral", x: [0.2, 0.3] },
            { name: "Agree", x: [0.55, 0.4] },
          ],
        },
      ],
    };
    expect(generatedSummary(model(likert), words)).toBe(
      `2${nb}items, 3 series. Disagree: highest Item 1 25%, lowest Item 2 10%. ` +
        "Neutral: highest Item 2 30%, lowest Item 1 20%. " +
        "Agree: highest Item 1 55%, lowest Item 2 40%. " +
        "Total: highest Item 1 100%, lowest Item 2 80%.",
    );
    expect(shortDescription(model(likert), words)).toBe(
      `Diverging stacked bar chart, 3 series, 2${nb}items`,
    );
  });

  it("says only the count when every value is a gap, in categories without a unit", () => {
    const empty: ChartSpec = {
      x: {},
      marks: [{ mark: "bar", y: ["a", "b"], series: [{ name: "a", x: [null, null] }] }],
    };
    expect(generatedSummary(model(empty), words)).toBe("2 categories.");
  });

  it("is named by its kind, its series count and its row count", () => {
    expect(shortDescription(model(ages), words)).toBe(`Bar chart, 4${nb}countries`);
    expect(shortDescription(model(firms), words)).toBe(
      `Stacked bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("takes the app's words", () => {
    const own = chartWords({
      categories: (n) => `${n} rows`,
      countSummary: (count) => `[${count}]`,
      extremes: (high, low) => `${high} > ${low}`,
    });
    const plain: ChartSpec = { ...ages, y: {} };
    expect(generatedSummary(model(plain), own)).toBe("[4 rows] Holy See 57.4 > Monaco 49.8");
  });
});
