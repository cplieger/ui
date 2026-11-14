import { describe, expect, it } from "vitest";

import { writer } from "../scale/format.js";
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
const dur = (ms: number) => writer("duration", "en")(ms);
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

  it("names each side's extremes and the totals', a back-to-back bar chart", () => {
    const pyramid: ChartSpec = {
      x: {},
      y: { unit: { one: "age group", other: "age groups" } },
      marks: [
        {
          mark: "bar",
          y: ["90+", "45-50", "0-5"],
          arrange: "mirror",
          series: [
            { name: "Male", x: [210, 2734, 1690] },
            { name: "Female", x: [520, 2690, 1610] },
          ],
        },
      ],
    };
    expect(generatedSummary(model(pyramid), words)).toBe(
      `3${nb}age groups, 2 series. Male: highest 45-50 2,734, lowest 90+ 210. ` +
        "Female: highest 45-50 2,690, lowest 90+ 520. " +
        "Total: highest 45-50 5,424, lowest 90+ 730.",
    );
    expect(shortDescription(model(pyramid), words)).toBe(
      `Back-to-back bar chart, 2 series, 3${nb}age groups`,
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

describe("the summary of a dot plot", () => {
  const degrees = { one: "degree", other: "degrees" };
  const pay: ChartSpec = {
    x: {},
    y: { unit: degrees },
    marks: [
      {
        mark: "point",
        y: ["Doctorate", "Master's", "Less than 9th grade"],
        series: [
          { name: "Women", x: [128_700, 91_000, 29_100] },
          { name: "Men", x: [163_500, null, 43_350] },
          { name: "Other", x: [null, null, null] },
        ],
      },
    ],
  };

  it("counts rows and series, then names each series' highest and lowest row", () => {
    expect(generatedSummary(model(pay), words)).toBe(
      `3${nb}degrees, 3 series. Women: highest Doctorate 128,700, lowest Less than 9th grade 29,100. Men: highest Doctorate 163,500, lowest Less than 9th grade 43,350.`,
    );
    expect(shortDescription(model(pay), words)).toBe(`Dot plot, 3 series, 3${nb}degrees`);
  });

  it("names one series' extremes, and a time x's earliest and latest", () => {
    const one = model({
      x: {},
      marks: [
        { mark: "point", y: ["Japan", "Monaco"], series: [{ name: "Age", x: [49.8, 54.5] }] },
      ],
    });
    expect(generatedSummary(one, words)).toBe(
      "2 categories. Highest Monaco 54.5, lowest Japan 49.8.",
    );
    expect(shortDescription(one, words)).toBe("Dot plot, 2 categories");
    const releases = model({
      x: { type: "time" },
      marks: [
        {
          mark: "point",
          y: ["api", "web"],
          series: [{ name: "Release", x: [START + 90 * MIN, START] }],
        },
      ],
    });
    expect(generatedSummary(releases, words)).toBe(
      `2 categories. Release: earliest web ${time(START)}, latest api ${time(START + 90 * MIN)}.`,
    );
  });

  it("takes the app's words", () => {
    const own = chartWords({
      kind: { dotPlot: "Punktdiagramm" },
      spanSeries: (name, first, last) => `${name}: ${first} bis ${last}.`,
    });
    const releases = model({
      x: { type: "time" },
      marks: [
        { mark: "point", y: ["a", "b"], series: [{ name: "R", x: [START, START + 90 * MIN] }] },
      ],
    });
    expect(generatedSummary(releases, own)).toBe(
      `2 categories. R: a ${time(START)} bis b ${time(START + 90 * MIN)}.`,
    );
    expect(shortDescription(releases, own)).toBe("Punktdiagramm, 2 categories");
  });
});

describe("the summary of band rows alike or alone", () => {
  const bars = (x: (number | null)[][], more: Partial<Extract<Mark, { mark: "bar" }>> = {}) =>
    model({
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["Japan", "Italy", "Spain"].slice(0, x[0]?.length ?? 0),
          ...more,
          series: x.map((v, i) => ({ name: ["Female", "Male"][i] ?? "", x: v })),
        },
      ],
    });

  it("gives the value once when every row holds it, a series or the totals", () => {
    expect(generatedSummary(bars([[40, 40, 40]]), words)).toBe("3 categories. 40 each.");
    expect(generatedSummary(bars([[40, null, 40]]), words)).toBe("3 categories. 40 each.");
    expect(
      generatedSummary(
        model({
          x: { format: "percent" },
          marks: [
            {
              mark: "bar",
              y: ["Item 1", "Item 2"],
              arrange: "diverge",
              left: 1,
              series: [
                { name: "Disagree", x: [0.25, 0.4] },
                { name: "Agree", x: [0.75, 0.6] },
              ],
            },
          ],
        }),
        words,
      ),
    ).toBe(
      "2 categories, 2 series. Disagree: highest Item 2 40%, lowest Item 1 25%. " +
        "Agree: highest Item 1 75%, lowest Item 2 60%. Total: 100% each.",
    );
  });

  it("names the one row holding a value once", () => {
    expect(generatedSummary(bars([[49.9]]), words)).toBe("1 category. Japan 49.9.");
    expect(generatedSummary(bars([[null, 48.6, null]]), words)).toBe("3 categories. Italy 48.6.");
    expect(generatedSummary(bars([[51.1], [48.4]], { arrange: "group" }), words)).toBe(
      "1 category, 2 series. Female: Japan 51.1. Male: Japan 48.4.",
    );
  });

  it("reads a point series, a time x's instants and a link's gaps alike once", () => {
    const point = (x: NonNullable<ChartSpec["x"]>, a: number[], b: number[], link?: "range") =>
      model({
        x,
        marks: [
          {
            mark: "point",
            y: ["api", "web"],
            ...(link === undefined ? {} : { link }),
            series: [
              { name: "Before", x: a },
              { name: "After", x: b },
            ],
          },
        ],
      });
    expect(generatedSummary(point({}, [5, 5], [7, 9]), words)).toBe(
      "2 categories, 2 series. Before: 5 each. After: highest web 9, lowest api 7.",
    );
    expect(
      generatedSummary(point({ type: "time" }, [START, START], [START, START + MIN]), words),
    ).toBe(
      `2 categories, 2 series. Before: ${time(START)} each. ` +
        `After: earliest api ${time(START)}, latest web ${time(START + MIN)}.`,
    );
    expect(generatedSummary(point({}, [1, 3], [11, 13], "range"), words)).toBe(
      "2 categories, 2 series. Before: highest web 3, lowest api 1. " +
        "After: highest web 13, lowest api 11. Gap: 10 each.",
    );
  });

  it("takes the app's words", () => {
    const own = chartWords({
      alike: (name, value) => `${name === "" ? "Alle" : name} je ${value}.`,
      only: (name, row) => `${name === "" ? "Nur" : name} ${row}.`,
    });
    expect(generatedSummary(bars([[40, 40, 40]]), own)).toBe("3 categories. Alle je 40.");
    expect(generatedSummary(bars([[49.9]]), own)).toBe("1 category. Nur Japan 49.9.");
  });
});

describe("the summary of a range or arrow plot", () => {
  const pay = (link: "range" | "arrow"): ChartSpec => ({
    x: {},
    y: { unit: { one: "degree", other: "degrees" } },
    marks: [
      {
        mark: "point",
        y: ["Doctorate", "Master's", "Less than 9th grade", "None"],
        link,
        series: [
          { name: "Women", x: [128_700, 91_000, 29_100, null] },
          { name: "Men", x: [163_500, 144_310, 43_350, 20_000] },
        ],
      },
    ],
  });

  it("names the highest and lowest gap after each series, leaving a row with a gap out", () => {
    expect(generatedSummary(model(pay("range")), words)).toBe(
      `4${nb}degrees, 2 series. Women: highest Doctorate 128,700, lowest Less than 9th grade 29,100. Men: highest Doctorate 163,500, lowest None 20,000. Gap: highest Master's 53,310, lowest Less than 9th grade 14,250.`,
    );
    expect(shortDescription(model(pay("range")), words)).toBe(
      `Range plot, 2 series, 4${nb}degrees`,
    );
  });

  it("names the largest and smallest change with their signs", () => {
    const fell = model({
      x: {},
      marks: [
        {
          mark: "point",
          y: ["Norway", "Chad"],
          link: "arrow",
          series: [
            { name: "2013", x: [5.8, 3] },
            { name: "2023", x: [93, 1.5] },
          ],
        },
      ],
    });
    expect(generatedSummary(fell, words)).toBe(
      "2 categories, 2 series. 2013: highest Norway 5.8, lowest Chad 3. 2023: highest Norway 93, lowest Chad 1.5. Change: highest Norway +87.2, lowest Chad -1.5.",
    );
    expect(shortDescription(fell, words)).toBe("Arrow plot, 2 series, 2 categories");
  });

  it("takes the app's nouns", () => {
    const own = chartWords({ gap: "Écart", kind: { rangePlot: "Intervalle" } });
    expect(generatedSummary(model(pay("range")), own)).toContain("Écart: highest Master's");
    expect(shortDescription(model(pay("range")), own)).toBe(`Intervalle, 2 series, 4${nb}degrees`);
  });
});

describe("the summary of a slope chart", () => {
  const slope = (
    series: readonly { name: string; y: (number | null)[] }[],
    more: readonly Mark[] = [],
  ): ChartSpec => ({
    marks: [{ mark: "slope", x: ["2005", "2015"], series }, ...more],
  });
  const pets = slope([
    { name: "Cats", y: [50, 34] },
    { name: "Dogs", y: [40, 31] },
    { name: "Horses", y: [30, 39] },
    { name: "Mice", y: [null, 44] },
    { name: "Sheep", y: [20, 35] },
    { name: "Goats", y: [10, 25] },
  ]);

  it("gives each series' ends and change, then the largest rise and fall", () => {
    expect(generatedSummary(model(pets), words)).toBe(
      "2005 to 2015, 6 series. Cats: 50 to 34, -16. Dogs: 40 to 31, -9. Horses: 30 to 39, +9. " +
        "Mice: No data to 44. Sheep: 20 to 35, +15. Goats: 10 to 25, +15. " +
        "Largest rise: Sheep +15. Largest fall: Cats -16.",
    );
  });

  it("leaves out the rise when none rose and the fall when none fell, and 0 is neither", () => {
    expect(
      generatedSummary(
        model(
          slope([
            { name: "a", y: [3, 1] },
            { name: "b", y: [2, 2] },
          ]),
        ),
        words,
      ),
    ).toBe("2005 to 2015, 2 series. a: 3 to 1, -2. b: 2 to 2, 0. Largest fall: a -2.");
    expect(generatedSummary(model(slope([{ name: "a", y: [1, 3] }])), words)).toBe(
      "2005 to 2015. a: 1 to 3, +2. Largest rise: a +2.",
    );
  });

  it("says its notes at their column, and names the columns in its short description", () => {
    const noted = slope(
      [{ name: "a", y: [1, 3] }],
      [{ mark: "text", x: "2015", y: 3, text: "New high" }],
    );
    expect(generatedSummary(model(noted), words)).toBe(
      "2005 to 2015. a: 1 to 3, +2. Largest rise: a +2. 2015: New high.",
    );
    expect(shortDescription(model(pets), words)).toBe("Slope chart, 6 series, 2005 to 2015");
  });

  it("takes the app's words", () => {
    const own = chartWords({
      slopeSummary: (range, series) => `[${range}|${series}]`,
      slopeSeries: (name, from, to, change) => `<${name} ${from} ${to} ${change}>`,
      rise: (name, change) => `up ${name} ${change}`,
      fall: (name, change) => `down ${name} ${change}`,
    });
    expect(generatedSummary(model(slope([{ name: "a", y: [1, null] }])), own)).toBe(
      "[2005 to 2015|] <a 1 No data >",
    );
  });
});

describe("a scatter's short description", () => {
  const scatter = (unit?: { one: string; other: string }): ChartSpec => ({
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    marks: [
      {
        mark: "scatter",
        ...(unit === undefined ? {} : { unit }),
        series: [
          { name: "Europe", names: ["Albania", "Andorra"], x: [18_920, 65_928], y: [79.8, 84.1] },
          { name: "Africa", names: ["Chad", "Mali"], x: [1_500, null], y: [53, 59] },
        ],
      },
    ],
  });

  it("names its kind, its series and the dots it draws, in its unit", () => {
    expect(shortDescription(model(scatter({ one: "country", other: "countries" })), words)).toBe(
      `Scatter plot, 2 series, 3${nb}countries`,
    );
  });

  it("counts points without a unit, one in the singular", () => {
    expect(shortDescription(model(scatter()), words)).toBe("Scatter plot, 2 series, 3 points");
    const one = model({
      x: { label: "a" },
      y: { label: "b" },
      marks: [{ mark: "scatter", series: [{ name: "All", names: ["Chad"], x: [1], y: [2] }] }],
    });
    expect(shortDescription(one, words)).toBe("Scatter plot, 1 point");
  });
});

describe("a scatter's summary", () => {
  const countries = { one: "country", other: "countries" };
  const world = (more: readonly Mark[] = []): ChartSpec => ({
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    marks: [
      {
        mark: "scatter",
        unit: countries,
        series: [
          {
            name: "Europe",
            names: ["Albania", "Monaco", "Norway", "Kosovo"],
            x: [18_920, 140_000, 82_000, null],
            y: [79.8, 85.9, 83.2, 79],
          },
          { name: "Africa", names: ["Burundi", "Chad"], x: [900, 1_500], y: [62, 53] },
        ],
      },
      ...more,
    ],
  });

  it("counts the dots and series, then gives each measure's highest and lowest dot", () => {
    expect(generatedSummary(model(world()), words)).toBe(
      `5${nb}countries, 2 series. GDP per capita: highest Monaco 140,000, lowest Burundi 900. Life expectancy: highest Monaco 85.9, lowest Chad 53.`,
    );
  });

  it("gives a tie to the first dot in series order, then in the app's order", () => {
    const tied = model({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            { name: "a", names: ["a1", "a2"], x: [1, 3], y: [2, 2] },
            { name: "b", names: ["b1", "b2"], x: [3, 1], y: [5, 1] },
          ],
        },
      ],
    });
    expect(generatedSummary(tied, words)).toBe(
      "4 points, 2 series. x: highest a2 3, lowest a1 1. y: highest b1 5, lowest b2 1.",
    );
  });

  it("reads one dot once and dots all alike as one value", () => {
    const one = model({
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
      marks: [
        {
          mark: "scatter",
          series: [{ name: "All", names: ["Chad", "Mali"], x: [1_500, 2_000], y: [53, 53] }],
        },
      ],
    });
    expect(generatedSummary(one, words)).toBe(
      "2 points. GDP per capita: highest Mali 2,000, lowest Chad 1,500. Life expectancy: 53 each.",
    );
    const lone = model({
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
      marks: [{ mark: "scatter", series: [{ name: "All", names: ["Chad"], x: [1_500], y: [53] }] }],
    });
    expect(generatedSummary(lone, words)).toBe(
      "1 point. GDP per capita: Chad 1,500. Life expectancy: Chad 53.",
    );
  });

  it("writes a note's place as the dot it joins, or else both its measures", () => {
    const notes: Mark[] = [
      { mark: "text", x: 140_000, y: 85.9, text: "A city-state" },
      { mark: "text", x: 50_000, y: 70, text: "Nobody here" },
    ];
    expect(generatedSummary(model(world(notes)), words)).toMatch(
      / Monaco: A city-state\. GDP per capita 50,000, Life expectancy 70: Nobody here\.$/u,
    );
  });

  it("states no correlation, which an app adds through its summary function", () => {
    const own = summaryOf(
      model({ ...world(), summary: (generated) => `${generated} Richer countries live longer.` }),
      words,
    );
    expect(own).toMatch(/lowest Chad 53\. Richer countries live longer\.$/u);
    expect(generatedSummary(model(world()), words)).not.toMatch(/correlat|trend/iu);
  });
});

describe("a bubble chart's summary and short description", () => {
  const world = model({
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    r: { label: "Population", format: { notation: "compact" } },
    marks: [
      {
        mark: "scatter",
        unit: { one: "country", other: "countries" },
        series: [
          {
            name: "Asia",
            names: ["India", "Japan", "Laos"],
            x: [2_500, 48_000, 8_400],
            y: [72, 84.5, 68],
            r: [1_440_000_000, 124_000_000, null],
          },
          { name: "Oceania", names: ["Tuvalu"], x: [5_000], y: [65], r: [9_800] },
        ],
      },
    ],
  });

  it("gives the size's highest and lowest dot after the two measures", () => {
    expect(generatedSummary(world, words)).toBe(
      `3${nb}countries, 2 series. GDP per capita: highest Japan 48,000, lowest India 2,500. Life expectancy: highest Japan 84.5, lowest Tuvalu 65. Population: highest India 1.4B, lowest Tuvalu 9.8K.`,
    );
  });

  it("names it a bubble chart", () => {
    expect(shortDescription(world, words)).toBe(`Bubble chart, 2 series, 3${nb}countries`);
  });
});

describe("a heatmap's short description", () => {
  const week = (x: ChartSpec["x"], y: ChartSpec["y"]): ChartSpec => ({
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    marks: [
      {
        mark: "cell",
        x: per(24, String),
        y: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        values: per(7, () => per(24, () => 1)),
      },
    ],
  });

  it("gives its rows by its columns in the axes' units", () => {
    expect(
      shortDescription(
        model(
          week({ unit: { one: "hour", other: "hours" } }, { unit: { one: "day", other: "days" } }),
        ),
        words,
      ),
    ).toBe(`Heatmap, 7${nb}days by 24${nb}hours`);
  });

  it("gives bare counts where an axis names no unit", () => {
    expect(shortDescription(model(week(undefined, undefined)), words)).toBe("Heatmap, 7 by 24");
  });

  it("takes the app's words for the grid", () => {
    const own = chartWords({
      grid: (rows, columns) => `${rows} × ${columns}`,
      kind: { heatmap: "Carte" },
    });
    expect(shortDescription(model(week(undefined, undefined)), own)).toBe("Carte, 7 × 24");
  });
});

describe("a 2D histogram's short description", () => {
  const bins = (
    x: Extract<Mark, { mark: "cell"; values: unknown }>["x"],
    one: string,
    other: string,
  ): ChartSpec => ({
    x: { unit: { one, other } },
    y: { unit: { one: "year", other: "years" } },
    marks: [
      {
        mark: "cell",
        x,
        y: { edges: per(13, (i) => 25 + 5 * i) },
        values: per(12, () => per("edges" in x ? x.edges.length - 1 : x.length, () => 1)),
      },
    ],
  });

  it("names it a 2D histogram with bare bin counts, since a binned axis's unit is its values'", () => {
    expect(
      shortDescription(
        model(bins({ edges: per(21, (i) => 1_000 * (i + 1)) }, "dollar", "dollars")),
        words,
      ),
    ).toBe("2D histogram, 12 by 20");
  });

  it("is a heatmap when one axis names its categories, counted in that axis's unit", () => {
    expect(
      shortDescription(
        model(
          bins(
            per(3, (i) => `Q${String(i + 1)}`),
            "quarter",
            "quarters",
          ),
        ),
        words,
      ),
    ).toBe(`Heatmap, 12 by 3${nb}quarters`);
  });
});

describe("a cell chart's summary", () => {
  const grid = (values: (number | null)[][], over: Partial<ChartSpec> = {}): ChartSpec => ({
    colour: { unit: posts },
    marks: [{ mark: "cell", x: ["2 PM", "3 PM"], y: ["Monday", "Tuesday"], values }],
    ...over,
  });

  it("counts the cells and names the highest and lowest, each with its value", () => {
    expect(
      generatedSummary(
        model(
          grid([
            [4, 57],
            [0, null],
          ]),
        ),
        words,
      ),
    ).toBe(`4 cells. Highest Monday, 3 PM: 57${nb}posts. Lowest Tuesday, 2 PM: 0${nb}posts.`);
  });

  it("names the first cell in reading order on a tie", () => {
    expect(
      generatedSummary(
        model(
          grid([
            [5, 5],
            [5, 5],
          ]),
        ),
        words,
      ),
    ).toBe(`4 cells. Highest Monday, 2 PM: 5${nb}posts. Lowest Monday, 2 PM: 5${nb}posts.`);
  });

  it("reads a binned y's highest bin first, as the plot draws it from the top", () => {
    const spec: ChartSpec = {
      marks: [
        {
          mark: "cell",
          x: { edges: [0, 1, 2] },
          y: { edges: [0, 10, 20] },
          values: [
            [1, 9],
            [9, 1],
          ],
        },
      ],
    };
    expect(generatedSummary(model(spec), words)).toBe(
      "4 cells. Highest 10 to 20, 0 to 1: 9. Lowest 10 to 20, 1 to 2: 1.",
    );
  });

  it("says only the count when every cell is missing", () => {
    expect(
      generatedSummary(
        model(
          grid([
            [null, null],
            [null, null],
          ]),
        ),
        words,
      ),
    ).toBe("4 cells.");
  });

  it("adds no total, which an app whose values add up writes in its own summary", () => {
    expect(
      generatedSummary(
        model(
          grid([
            [1, 2],
            [3, 4],
          ]),
        ),
        words,
      ),
    ).not.toContain("Total");
  });

  it("places a note at the cell it names", () => {
    const spec = grid(
      [
        [1, 2],
        [3, 4],
      ],
      {
        marks: [
          {
            mark: "cell",
            x: ["2 PM", "3 PM"],
            y: ["Monday", "Tuesday"],
            values: [
              [1, 2],
              [3, 4],
            ],
          },
          { mark: "text", x: "3 PM", y: "Tuesday", text: "Release" },
        ],
      },
    );
    expect(generatedSummary(model(spec), words)).toContain("Tuesday, 3 PM: Release.");
  });
});

describe("the summary of a box plot", () => {
  const latency = (more: Record<string, unknown> = {}, two = false): ChartSpec => ({
    y: { unit: { one: "endpoint", other: "endpoints" } },
    marks: [
      {
        mark: "box",
        y: ["search", "export", "health"],
        series: [
          {
            name: "Latency",
            low: [120, 300, 1],
            q1: [180, 900, 2],
            median: [240, 1400, 2],
            q3: [410, 2100, 3],
            high: [760, 4000, 4],
          },
          ...(two
            ? [
                {
                  name: "After",
                  low: [null, 50, null],
                  q1: [null, 60, null],
                  median: [null, 70, null],
                  q3: [null, 80, null],
                  high: [null, 90, null],
                },
              ]
            : []),
        ],
        ...more,
      },
    ],
  });

  it("names each series' highest and lowest median and widest middle half, then the whiskers", () => {
    expect(generatedSummary(model(latency({ whiskers: "1.5 × IQR" })), words)).toBe(
      `3${nb}endpoints. Latency: highest median export 1,400, lowest median health 2, ` +
        "widest middle half export 900 to 2,100. Whiskers: 1.5 × IQR.",
    );
  });

  it("counts the series, and reads a series with one box whole", () => {
    expect(generatedSummary(model(latency({}, true)), words)).toBe(
      `3${nb}endpoints, 2 series. Latency: highest median export 1,400, lowest median health 2, ` +
        "widest middle half export 900 to 2,100. " +
        "After: export median 70, middle half 60 to 80, whiskers 50 to 90.",
    );
  });

  it("is described by its row count", () => {
    expect(shortDescription(model(latency()), words)).toBe(`Box plot, 3${nb}endpoints`);
    expect(shortDescription(model(latency({}, true)), words)).toBe(
      `Box plot, 2 series, 3${nb}endpoints`,
    );
  });
});
