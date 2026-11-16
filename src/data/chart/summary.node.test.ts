import { describe, expect, it } from "vitest";

import type { BinsFrame, FrameNote, FrameRef, FrameSeries, FrameTreePart } from "../frame/frame.js";
import { writer } from "../scale/format.js";

import { chartModel, type Model } from "./model.js";
import type { ChartFrame, ChartSpec } from "./spec.js";
import { generatedSummary, shortDescription, summaryOf } from "./summary.js";
import {
  binsFrame,
  boxes,
  categories,
  events,
  grid,
  ladder,
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
const nb = "\u00A0";

const time = (t: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(t);
const span = (a: number, b: number) => `${time(a)} to ${time(b)}`;
const dur = (seconds: number) => writer("duration", "en")(seconds);
const model = (spec: ChartSpec): Model => chartModel(spec, "en", TZ);
const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

const starts = per(24, (i) => START + i * 15 * MIN);
const ends = starts.map((t) => t + 15 * MIN);
const posts = { one: "post", other: "posts" };

type Values = readonly (number | null)[];
type More = Omit<ChartSpec, "data" | "mark" | "facets">;
// Series keyed by their names, in order.
const named = (...series: (readonly [string, Values])[]): FrameSeries[] =>
  series.map(([key, values]) => ({ key, values: [...values] }));
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

// 24 quarter hours: bucket 13 is the busiest closed one, bucket 23 the open one.
const kinds = named(
  ["Announce", per(24, (i) => (i === 23 ? 30 : 5))],
  ["Path", per(24, (i) => (i === 13 ? 9 : 4))],
);
const quarters = (
  series: FrameSeries[] = kinds,
  mark: object = {},
  data: Partial<BinsFrame> = {},
): ChartSpec =>
  ({
    data: binsFrame(starts, ends, [], { open: true, series, ...data }),
    mark: { mark: "rect", ...mark },
    x: { domain: [START, END] },
    y: { label: "Posts", unit: posts },
  }) as ChartSpec;
const stacked = quarters();

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
    const one = quarters(named(["All", per(24, () => 1)]), {}, { x2, open: false });
    expect(generatedSummary(model(one), words)).toBe(
      `24${nb}posts from ${span(START, END)}. Busiest: ${span(START, START + 10 * MIN)}, 1${nb}post.`,
    );
  });

  it("names no busiest bucket when only the open one has posts", () => {
    const quiet = quarters(named(["All", per(24, (i) => (i === 23 ? 3 : 0))]));
    expect(generatedSummary(model(quiet), words)).toBe(
      `3${nb}posts, every 15${nb}min from ${span(START, END)}.`,
    );
  });

  it("names the kind, the series count and the range", () => {
    expect(shortDescription(model(stacked), words)).toBe(
      `Stacked column chart, 2 series, ${span(START, END)}`,
    );
    const one = quarters(named(["All", per(24, () => 1)]), {}, { open: false });
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
      data: seriesFrame([lo, hi], [], { series: named(["Load", [3, 5]]) }),
      mark: { mark: "line" },
      x: { type: "time", domain: [lo, hi] },
    });

  it("dates both ends of a domain a whole day long, whose clock times match", () => {
    const day = 24 * HR;
    const m = model({ ...stacked, x: { domain: [END - day, END] } });
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
  const shaped = (mark: object, series = kinds): ChartSpec =>
    quarters(series, { shape: "area", ...mark });

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
    const one = shaped({}, named(["All", per(24, () => 1)]));
    expect(shortDescription(model(one), words)).toBe(`Area chart, ${span(START, END)}`);
  });
});

describe("the summary of grouped columns", () => {
  const grouped = quarters(kinds, { arrange: "group" });

  it("names the highest single value of a closed bucket in place of the busiest bucket", () => {
    // The open bucket's Announce 30 is still filling, so Path's 9 is the highest.
    expect(generatedSummary(model(grouped), words)).toBe(
      `246${nb}posts, every 15${nb}min from ${span(START, END)}: Announce 145, Path 101. ` +
        `Highest: Path, ${span(starts[13] ?? 0, ends[13] ?? 0)}, 9${nb}posts.`,
    );
  });

  it("names the busiest bucket of one series grouped, which is a plain column chart", () => {
    const one = quarters(named(["All", per(24, (i) => (i === 4 ? 3 : 1))]), { arrange: "group" });
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
  const share = quarters(kinds, { arrange: "share" });

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

const edges = ladder();
const reads = (
  series: FrameSeries[],
  refs: readonly (readonly [string, number])[] = [],
  low = 1,
): ChartSpec => ({
  data: marked(
    binsFrame(edges.slice(0, -1), edges.slice(1), [], { axis: "value", unit: "seconds", series }),
    refs,
  ),
  mark: { mark: "rect" },
  x: { type: "log", label: "Time from post to read", domain: [low, edges.at(-1) ?? 0] },
  y: { label: "Reads", unit: { one: "read", other: "reads" } },
});
const bins = edges.length - 1;

describe("the summary of a histogram", () => {
  const rules = [
    ["Median", 42],
    ["95th percentile", 18 * 60],
  ] as const;

  it("says the count from under the low end, then each rule", () => {
    const m = model(reads(named(["Reads", per(bins, () => 2)]), rules));
    expect(generatedSummary(m, words)).toBe(
      `32${nb}reads from under ${dur(1)} to ${dur(edges.at(-1) ?? 0)}. ` +
        `Median ${dur(42)}. 95th percentile ${dur(18 * 60)}.`,
    );
    expect(shortDescription(m, words)).toBe(
      `Histogram, under ${dur(1)} to ${dur(edges.at(-1) ?? 0)}`,
    );
  });

  it("adds each series' total after the count when stacked", () => {
    const m = model(
      reads(named(["Direct", per(bins, () => 3)], ["Path", per(bins, () => 1)]), rules.slice(0, 1)),
    );
    expect(generatedSummary(m, words)).toBe(
      `64${nb}reads from under ${dur(1)} to ${dur(edges.at(-1) ?? 0)}. ` +
        `Direct 48, Path 16. Median ${dur(42)}.`,
    );
    expect(shortDescription(m, words)).toBe(
      `Histogram, 2 series, under ${dur(1)} to ${dur(edges.at(-1) ?? 0)}`,
    );
  });

  it("reads a plain range when the underflow bin is not drawn below the low end", () => {
    const m = model(reads(named(["Reads", per(bins, () => 1)]), [], 10));
    expect(generatedSummary(m, words)).toMatch(
      new RegExp(`^12${nb}reads from ${dur(10)} to `, "u"),
    );
  });
});

describe("the summary of a step line", () => {
  const x = per(361, (i) => START + i * MIN);
  const m = model({
    data: seriesFrame(x, [], {
      series: named(
        ["Live", x.map((_, i) => (i < 30 ? null : i < 200 ? 4 : i < 300 ? 12 : 10))],
        ["Active", x.map((_, i) => (i < 100 ? 0 : i < 250 ? 9 : 6))],
      ),
    }),
    mark: { mark: "line", curve: "step" },
    x: { type: "time", domain: [START, END] },
    y: { label: "Agents" },
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
      data: seriesFrame(long, [], {
        series: named(
          ["Load", long.map((_, i) => (i === 7 ? -3 : i === n - 2 ? 40 : i % 10))],
          ["Idle", long.map(() => null)],
        ),
      }),
      mark: { mark: "line" },
      x: { type: "time", domain: [START, START + (n - 1) * MIN] },
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
      data: seriesFrame([START, START + MIN, START + 3 * MIN], [], {
        series: named(["Load", [1, 2, 3]]),
      }),
      mark: { mark: "line" },
      x: { type: "time", domain: [START, END] },
    });
    expect(generatedSummary(uneven, words)).toBe(
      `${span(START, END)}. Load: last 3, low 1, high 3.`,
    );
    expect(shortDescription(uneven, words)).toBe(`Line chart, ${span(START, END)}`);
  });
});

describe("the summary of a stacked area", () => {
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
    const one = model(spec({}, named(["Gas", per(7, () => 1)])));
    expect(shortDescription(one, words)).toBe(`Area chart, ${span(START, START + 6 * MIN)}`);
    expect(generatedSummary(one, words)).not.toContain("Total");
  });
});

describe("the summary of an area stacked to 100%", () => {
  const x = per(3, (i) => START + i * MIN);
  const m = model({
    data: seriesFrame(x, [], { series: named(["Gas", [0, 1, 1_500]], ["Wind", [0, 3, 500]]) }),
    mark: { mark: "area", arrange: "share" },
    x: { type: "time", domain: [START, START + 2 * MIN] },
    y: { format: { style: "percent", maximumFractionDigits: 1 } },
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
    data: {
      type: "events",
      name: "e",
      rows: [
        { key: "lead-ui", at: per(5, (i) => START + i * 30 * MIN) },
        { key: "dev-ui", at: [START + 5 * MIN, START + 9 * MIN] },
        ...quiet.map((key) => ({ key, at: [] })),
        { key: "late", at: [END + MIN] },
      ],
    },
    mark: { mark: "dot", unit: posts },
    x: { domain: [START, END] },
    y: { type: "band", mono: true, unit: { one: "agent", other: "agents" } },
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
  const noted = (
    notes: readonly (readonly [number, string])[],
    refs: readonly (readonly [string, number])[] = [],
  ): ChartSpec =>
    quarters(
      kinds,
      {},
      {
        refs: refs.map(([key, value]) => ({ key, value })),
        notes: notes.map(([at, key]) => ({ key, at })),
      },
    );

  it("follow the refs, each its x in the readings' format and its text, in the frame's order", () => {
    const spec = noted(
      [
        [starts[3] ?? 0, "Deploy"],
        [starts[9] ?? 0, "Rollback"],
      ],
      [["Limit", 12]],
    );
    expect(generatedSummary(model(spec), words)).toMatch(
      new RegExp(
        `Limit 12\\. ${time(starts[3] ?? 0)}: Deploy\\. ${time(starts[9] ?? 0)}: Rollback\\.$`,
        "u",
      ),
    );
  });

  it("writes a timeline note at its time, which names no row", () => {
    const spec: ChartSpec = {
      data: marked(events({ ana: [START + MIN] }), [], [[START + 2 * MIN, "Paused"]]),
      mark: { mark: "dot" },
      x: { domain: [START, END] },
    };
    expect(generatedSummary(model(spec), words)).toMatch(
      new RegExp(`\\. ${time(START + 2 * MIN)}: Paused\\.$`, "u"),
    );
  });

  it("include a note outside a passed domain, which is not drawn", () => {
    expect(generatedSummary(model(noted([[END + 60 * MIN, "Later"]])), words)).toMatch(
      /: Later\.$/u,
    );
  });

  it("end a note written as a sentence once", () => {
    expect(generatedSummary(model(noted([[START, "Deploy of 1.4.0."]])), words)).toMatch(
      new RegExp(`${time(START)}: Deploy of 1\\.4\\.0\\.$`, "u"),
    );
  });

  it("take the app's words", () => {
    const own = chartWords({ note: (at, text) => `[${at}] ${text}` });
    expect(generatedSummary(model(noted([[START, "Start"]])), own)).toMatch(
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
  const rows = (
    names: readonly string[],
    series: FrameSeries[],
    mark: object = {},
    more: More = {},
    unit = "count",
  ): ChartSpec =>
    ({
      data: categories(names, [], { unit, series }),
      mark: { mark: "bar", ...mark },
      ...more,
    }) as ChartSpec;
  const ages = rows(
    ["Holy See", "Monaco", "Japan", "Andorra"],
    named(["Median age", [57.4, 49.8, 49.8, null]]),
    {},
    { y: { unit: countries } },
  );
  const firms = (arrange?: "group" | "split"): ChartSpec =>
    rows(
      ["Acme", "Brill", "Corda"],
      named(
        ["Domestic", [40, 3, 7]],
        ["International", [2, 22, 2]],
        ["Online", [null, null, null]],
      ),
      arrange === undefined ? {} : { arrange },
      { y: { unit: { one: "company", other: "companies" } } },
    );

  it("counts the rows, then names the highest and lowest, the first row on a tie", () => {
    expect(generatedSummary(model(ages), words)).toBe(
      `4${nb}countries. Highest Holy See 57.4, lowest Monaco 49.8.`,
    );
  });

  it("signs a diverging bar chart's extremes and names its kind", () => {
    const m = model(
      rows(
        ["Utah", "Texas", "Puerto Rico"],
        named(["Change", [0.16, 0, -0.143]]),
        {},
        {
          x: { format: { style: "percent", maximumFractionDigits: 1 } },
          y: { unit: { one: "state", other: "states" } },
        },
      ),
    );
    expect(generatedSummary(m, words)).toBe(
      `3${nb}states. Highest Utah +16%, lowest Puerto Rico -14.3%.`,
    );
    expect(shortDescription(m, words)).toBe(`Diverging bar chart, 3${nb}states`);
  });

  it("names each series' extremes and the totals', leaving out a series with no value", () => {
    expect(generatedSummary(model(firms()), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2. Total: highest Acme 42, lowest Corda 9.",
    );
  });

  it("names each grouped series' extremes and no totals", () => {
    const grouped = firms("group");
    expect(generatedSummary(model(grouped), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2.",
    );
    expect(shortDescription(model(grouped), words)).toBe(
      `Grouped bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("names each split series' extremes and no totals, a split bar chart at every width", () => {
    const split = firms("split");
    expect(generatedSummary(model(split), words)).toBe(
      `3${nb}companies, 3 series. Domestic: highest Acme 40, lowest Brill 3. ` +
        "International: highest Brill 22, lowest Acme 2.",
    );
    expect(shortDescription(model(split), words)).toBe(
      `Split bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("names each 100% series' highest and lowest share, leaving out a row whose total is 0, and no totals", () => {
    const share = rows(
      ["Acme", "Brill", "Corda", "Dune"],
      named(["Domestic", [40, 3, 1, 0]], ["International", [10, 1, 3, 0]]),
      { arrange: "share" },
      { y: { unit: { one: "company", other: "companies" } } },
    );
    expect(generatedSummary(model(share), words)).toBe(
      `4${nb}companies, 2 series. Domestic: highest Acme 80%, lowest Corda 25%. ` +
        "International: highest Corda 75%, lowest Acme 20%.",
    );
    expect(shortDescription(model(share), words)).toBe(
      `100% stacked bar chart, 2 series, 4${nb}companies`,
    );
  });

  it("names each diverging series' extremes and the totals', a diverging stacked bar chart", () => {
    const likert = rows(
      ["Item 1", "Item 2"],
      named(["Disagree", [0.25, 0.1]], ["Neutral", [0.2, 0.3]], ["Agree", [0.55, 0.4]]),
      { arrange: "diverge", left: 1, centre: true },
      { y: { unit: { one: "item", other: "items" } } },
      "ratio",
    );
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
    const pyramid = rows(
      ["90+", "45-50", "0-5"],
      named(["Male", [210, 2734, 1690]], ["Female", [520, 2690, 1610]]),
      { arrange: "mirror" },
      { y: { unit: { one: "age group", other: "age groups" } } },
    );
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
    const empty = rows(["a", "b"], named(["a", [null, null]]));
    expect(generatedSummary(model(empty), words)).toBe("2 categories.");
  });

  it("is named by its kind, its series count and its row count", () => {
    expect(shortDescription(model(ages), words)).toBe(`Bar chart, 4${nb}countries`);
    expect(shortDescription(model(firms()), words)).toBe(
      `Stacked bar chart, 3 series, 3${nb}companies`,
    );
  });

  it("takes the app's words", () => {
    const own = chartWords({
      categories: (n) => `${n} rows`,
      countSummary: (count) => `[${count}]`,
      extremes: (high, low) => `${high} > ${low}`,
    });
    const plain = rows(
      ["Holy See", "Monaco", "Japan", "Andorra"],
      named(["Median age", [57.4, 49.8, 49.8, null]]),
    );
    expect(generatedSummary(model(plain), own)).toBe("[4 rows] Holy See 57.4 > Monaco 49.8");
  });
});

describe("the summary of a dot plot", () => {
  const degrees = { one: "degree", other: "degrees" };
  const dots = (
    names: readonly string[],
    series: FrameSeries[],
    mark: object = {},
    more: More = {},
  ): ChartSpec =>
    ({
      data: categories(names, [], { series }),
      mark: { mark: "point", ...mark },
      ...more,
    }) as ChartSpec;
  const pay = dots(
    ["Doctorate", "Master's", "Less than 9th grade"],
    named(
      ["Women", [128_700, 91_000, 29_100]],
      ["Men", [163_500, null, 43_350]],
      ["Other", [null, null, null]],
    ),
    {},
    { y: { unit: degrees } },
  );

  it("counts rows and series, then names each series' highest and lowest row", () => {
    expect(generatedSummary(model(pay), words)).toBe(
      `3${nb}degrees, 3 series. Women: highest Doctorate 128,700, lowest Less than 9th grade 29,100. Men: highest Doctorate 163,500, lowest Less than 9th grade 43,350.`,
    );
    expect(shortDescription(model(pay), words)).toBe(`Dot plot, 3 series, 3${nb}degrees`);
  });

  it("names one series' extremes, and a time x's earliest and latest", () => {
    const one = model(dots(["Japan", "Monaco"], named(["Age", [49.8, 54.5]])));
    expect(generatedSummary(one, words)).toBe(
      "2 categories. Highest Monaco 54.5, lowest Japan 49.8.",
    );
    expect(shortDescription(one, words)).toBe("Dot plot, 2 categories");
    const releases = model(
      dots(
        ["api", "web"],
        named(["Release", [START + 90 * MIN, START]]),
        {},
        {
          x: { type: "time" },
        },
      ),
    );
    expect(generatedSummary(releases, words)).toBe(
      `2 categories. Release: earliest web ${time(START)}, latest api ${time(START + 90 * MIN)}.`,
    );
  });

  it("takes the app's words", () => {
    const own = chartWords({
      kind: { dotPlot: "Punktdiagramm" },
      spanSeries: (name, first, last) => `${name}: ${first} bis ${last}.`,
    });
    const releases = model(
      dots(["a", "b"], named(["R", [START, START + 90 * MIN]]), {}, { x: { type: "time" } }),
    );
    expect(generatedSummary(releases, own)).toBe(
      `2 categories. R: a ${time(START)} bis b ${time(START + 90 * MIN)}.`,
    );
    expect(shortDescription(releases, own)).toBe("Punktdiagramm, 2 categories");
  });
});

describe("the summary of band rows alike or alone", () => {
  const bars = (x: Values[], mark: object = {}) =>
    model({
      data: categories(["Japan", "Italy", "Spain"].slice(0, x[0]?.length ?? 0), [], {
        series: x.map((v, i) => ({ key: ["Female", "Male"][i] ?? "", values: [...v] })),
      }),
      mark: { mark: "bar", ...mark },
    } as ChartSpec);

  it("gives the value once when every row holds it, a series or the totals", () => {
    expect(generatedSummary(bars([[40, 40, 40]]), words)).toBe("3 categories. 40 each.");
    expect(generatedSummary(bars([[40, null, 40]]), words)).toBe("3 categories. 40 each.");
    expect(
      generatedSummary(
        model({
          data: categories(["Item 1", "Item 2"], [], {
            unit: "ratio",
            series: named(["Disagree", [0.25, 0.4]], ["Agree", [0.75, 0.6]]),
          }),
          mark: { mark: "bar", arrange: "diverge", left: 1 },
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
        data: categories(["api", "web"], [], { series: named(["Before", a], ["After", b]) }),
        mark: { mark: "point", ...(link === undefined ? {} : { link }) },
        x,
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
    data: categories(["Doctorate", "Master's", "Less than 9th grade", "None"], [], {
      series: named(
        ["Women", [128_700, 91_000, 29_100, null]],
        ["Men", [163_500, 144_310, 43_350, 20_000]],
      ),
    }),
    mark: { mark: "point", link },
    y: { unit: { one: "degree", other: "degrees" } },
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
      data: categories(["Norway", "Chad"], [], {
        series: named(["2013", [5.8, 3]], ["2023", [93, 1.5]]),
      }),
      mark: { mark: "point", link: "arrow" },
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
    series: FrameSeries[],
    notes: readonly (readonly [number, string])[] = [],
  ): ChartSpec => ({
    data: marked(categories(["2005", "2015"], [], { series }), [], notes),
    mark: { mark: "slope" },
  });
  const pets = slope(
    named(
      ["Cats", [50, 34]],
      ["Dogs", [40, 31]],
      ["Horses", [30, 39]],
      ["Mice", [null, 44]],
      ["Sheep", [20, 35]],
      ["Goats", [10, 25]],
    ),
  );

  it("gives each series' ends and change, then the largest rise and fall", () => {
    expect(generatedSummary(model(pets), words)).toBe(
      "2005 to 2015, 6 series. Cats: 50 to 34, -16. Dogs: 40 to 31, -9. Horses: 30 to 39, +9. " +
        "Mice: No data to 44. Sheep: 20 to 35, +15. Goats: 10 to 25, +15. " +
        "Largest rise: Sheep +15. Largest fall: Cats -16.",
    );
  });

  it("leaves out the rise when none rose and the fall when none fell, and 0 is neither", () => {
    expect(generatedSummary(model(slope(named(["a", [3, 1]], ["b", [2, 2]]))), words)).toBe(
      "2005 to 2015, 2 series. a: 3 to 1, -2. b: 2 to 2, 0. Largest fall: a -2.",
    );
    expect(generatedSummary(model(slope(named(["a", [1, 3]]))), words)).toBe(
      "2005 to 2015. a: 1 to 3, +2. Largest rise: a +2.",
    );
  });

  it("says its notes at their plain value, a slope having no x place, and names the columns in its short description", () => {
    const noted = slope(named(["a", [1, 3]]), [[1, "New high"]]);
    expect(generatedSummary(model(noted), words)).toBe(
      "2005 to 2015. a: 1 to 3, +2. Largest rise: a +2. 1: New high.",
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
    expect(generatedSummary(model(slope(named(["a", [1, null]]))), own)).toBe(
      "[2005 to 2015|] <a 1 No data >",
    );
  });
});

describe("a scatter's short description", () => {
  const scatter = (unit?: { one: string; other: string }): ChartSpec => ({
    data: points([
      { key: "Europe", names: ["Albania", "Andorra"], x: [18_920, 65_928], y: [79.8, 84.1] },
      { key: "Africa", names: ["Chad", "Mali"], x: [1_500, null], y: [53, 59] },
    ]),
    mark: { mark: "scatter", ...(unit === undefined ? {} : { unit }) },
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
  });

  it("names its kind, its series and the dots it draws, in its unit", () => {
    expect(shortDescription(model(scatter({ one: "country", other: "countries" })), words)).toBe(
      `Scatter plot, 2 series, 3${nb}countries`,
    );
  });

  it("counts points without a unit, one in the singular", () => {
    expect(shortDescription(model(scatter()), words)).toBe("Scatter plot, 2 series, 3 points");
    const one = model({
      data: points([{ key: "All", names: ["Chad"], x: [1], y: [2] }]),
      mark: { mark: "scatter" },
      x: { label: "a" },
      y: { label: "b" },
    });
    expect(shortDescription(one, words)).toBe("Scatter plot, 1 point");
  });
});

describe("a scatter's summary", () => {
  const countries = { one: "country", other: "countries" };
  const world = (notes: readonly (readonly [number, string])[] = []): ChartSpec => ({
    data: marked(
      points([
        {
          key: "Europe",
          names: ["Albania", "Monaco", "Norway", "Kosovo"],
          x: [18_920, 140_000, 82_000, null],
          y: [79.8, 85.9, 83.2, 79],
        },
        { key: "Africa", names: ["Burundi", "Chad"], x: [900, 1_500], y: [62, 53] },
      ]),
      [],
      notes,
    ),
    mark: { mark: "scatter", unit: countries },
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
  });

  it("counts the dots and series, then gives each measure's highest and lowest dot", () => {
    expect(generatedSummary(model(world()), words)).toBe(
      `5${nb}countries, 2 series. GDP per capita: highest Monaco 140,000, lowest Burundi 900. Life expectancy: highest Monaco 85.9, lowest Chad 53.`,
    );
  });

  it("gives a tie to the first dot in series order, then in the app's order", () => {
    const tied = model({
      data: points([
        { key: "a", names: ["a1", "a2"], x: [1, 3], y: [2, 2] },
        { key: "b", names: ["b1", "b2"], x: [3, 1], y: [5, 1] },
      ]),
      mark: { mark: "scatter" },
      x: { label: "x" },
      y: { label: "y" },
    });
    expect(generatedSummary(tied, words)).toBe(
      "4 points, 2 series. x: highest a2 3, lowest a1 1. y: highest b1 5, lowest b2 1.",
    );
  });

  it("reads one dot once and dots all alike as one value", () => {
    const one = model({
      data: points([{ key: "All", names: ["Chad", "Mali"], x: [1_500, 2_000], y: [53, 53] }]),
      mark: { mark: "scatter" },
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
    });
    expect(generatedSummary(one, words)).toBe(
      "2 points. GDP per capita: highest Mali 2,000, lowest Chad 1,500. Life expectancy: 53 each.",
    );
    const lone = model({
      data: points([{ key: "All", names: ["Chad"], x: [1_500], y: [53] }]),
      mark: { mark: "scatter" },
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
    });
    expect(generatedSummary(lone, words)).toBe(
      "1 point. GDP per capita: Chad 1,500. Life expectancy: Chad 53.",
    );
  });

  it("writes a note's place as its x measure, since an x names no dot", () => {
    const notes = [
      [140_000, "A city-state"],
      [50_000, "Nobody here"],
    ] as const;
    expect(generatedSummary(model(world(notes)), words)).toMatch(
      / GDP per capita 140,000: A city-state\. GDP per capita 50,000: Nobody here\.$/u,
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
    data: points([
      {
        key: "Asia",
        names: ["India", "Japan", "Laos"],
        x: [2_500, 48_000, 8_400],
        y: [72, 84.5, 68],
        r: [1_440_000_000, 124_000_000, null],
      },
      { key: "Oceania", names: ["Tuvalu"], x: [5_000], y: [65], r: [9_800] },
    ]),
    mark: { mark: "scatter", unit: { one: "country", other: "countries" } },
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    r: { label: "Population", format: { notation: "compact" } },
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
    data: grid(
      { names: per(24, String) },
      { names: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
      per(7, () => per(24, () => 1)),
    ),
    mark: { mark: "cell" },
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
    x: { readonly edges: number[] } | { readonly names: string[] },
    one: string,
    other: string,
  ): ChartSpec => ({
    data: grid(
      x,
      { edges: per(13, (i) => 25 + 5 * i) },
      per(12, () => per("edges" in x ? x.edges.length - 1 : x.names.length, () => 1)),
    ),
    mark: { mark: "cell" },
    x: { unit: { one, other } },
    y: { unit: { one: "year", other: "years" } },
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
        model(bins({ names: per(3, (i) => `Q${String(i + 1)}`) }, "quarter", "quarters")),
        words,
      ),
    ).toBe(`Heatmap, 12 by 3${nb}quarters`);
  });
});

describe("a cell chart's summary", () => {
  const cells = (
    values: Values[],
    notes: readonly (readonly [number, string])[] = [],
  ): ChartSpec => ({
    data: marked(
      grid({ names: ["2 PM", "3 PM"] }, { names: ["Monday", "Tuesday"] }, values),
      [],
      notes,
    ),
    mark: { mark: "cell" },
    colour: { unit: posts },
  });

  it("counts the cells and names the highest and lowest, each with its value", () => {
    expect(
      generatedSummary(
        model(
          cells([
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
          cells([
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
      data: grid({ edges: [0, 1, 2] }, { edges: [0, 10, 20] }, [
        [1, 9],
        [9, 1],
      ]),
      mark: { mark: "cell" },
    };
    expect(generatedSummary(model(spec), words)).toBe(
      "4 cells. Highest 10 to 20, 0 to 1: 9. Lowest 10 to 20, 1 to 2: 1.",
    );
  });

  it("says only the count when every cell is missing", () => {
    expect(
      generatedSummary(
        model(
          cells([
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
          cells([
            [1, 2],
            [3, 4],
          ]),
        ),
        words,
      ),
    ).not.toContain("Total");
  });

  it("says a note at its plain value, a grid of names having no x place", () => {
    const spec = cells(
      [
        [1, 2],
        [3, 4],
      ],
      [[3, "Release"]],
    );
    expect(generatedSummary(model(spec), words)).toContain(" 3: Release.");
  });
});

describe("the summary of a box plot", () => {
  const latency = (more: Record<string, unknown> = {}, two = false): ChartSpec => ({
    y: { unit: { one: "endpoint", other: "endpoints" } },
    mark: { mark: "box", ...more } as ChartSpec["mark"],
    data: boxes(
      ["search", "export", "health"],
      [
        {
          key: "Latency",
          low: [120, 300, 1],
          q1: [180, 900, 2],
          median: [240, 1400, 2],
          q3: [410, 2100, 3],
          high: [760, 4000, 4],
        },
        ...(two
          ? [
              {
                key: "After",
                low: [null, 50, null],
                q1: [null, 60, null],
                median: [null, 70, null],
                q3: [null, 80, null],
                high: [null, 90, null],
              },
            ]
          : []),
      ],
    ),
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

describe("the summary and short description of a pie", () => {
  const land = (hole = false, water: number | null = 8224): ChartSpec => ({
    data: categories(
      ["Agriculture", "Forest", "Housing & traffic", "Other land", "Water"],
      [[182_637, 106_645, 48_631, 11_443, water]],
    ),
    mark: { mark: "pie", hole, unit: { other: "km²" } },
  });

  it("gives the whole, then each slice's share in the order sent", () => {
    expect(generatedSummary(model(land()), words)).toBe(
      `357,580${nb}km²: Agriculture 51%, Forest 30%, Housing & traffic 14%, Other land 3.2%, Water 2.3%.`,
    );
  });

  it("writes a gap's share as No data, the shares of the values sent", () => {
    expect(generatedSummary(model(land(false, null)), words)).toBe(
      `349,356${nb}km²: Agriculture 52%, Forest 31%, Housing & traffic 14%, Other land 3.3%, Water No data.`,
    );
  });

  it("frames it through partsSummary", () => {
    const own = chartWords({ partsSummary: (total, parts) => `${parts} (${total})` });
    expect(generatedSummary(model(land()), own)).toMatch(
      /^Agriculture 51%, .* \(357,580\u00A0km²\)$/u,
    );
  });

  it("names a pie and a donut by their slice count", () => {
    expect(shortDescription(model(land()), words)).toBe("Pie chart, 5 parts");
    expect(shortDescription(model(land(true)), words)).toBe("Donut chart, 5 parts");
  });
});

describe("the summary of a treemap", () => {
  // GDP in 2023, bn USD: 62,580 in all, Asia 41%, the Americas 47% and Europe 12%.
  const gdp = (us: number | null = 27_361): ChartSpec => ({
    data: tree({
      groups: [
        {
          key: "Asia",
          children: [part("China", 17_795), part("Japan", 4213), part("India", 3550)],
        },
        { key: "Americas", children: [part("United States", us), part("Brazil", 2174)] },
        { key: "Europe", children: [part("Germany", 4456), part("France", 3031)] },
      ],
    }),
    mark: { mark: "tree", unit: { other: "bn USD" } },
  });
  const flat = (values: Values): ChartSpec => ({
    data: tree({ parts: values.map((v, i) => part(`Country ${String(i + 1)}`, v)) }),
    mark: { mark: "tree" },
  });

  it("gives the whole and each group's share in the order sent, then the largest part", () => {
    expect(generatedSummary(model(gdp()), words)).toBe(
      `62,580${nb}bn USD: Asia 41%, Americas 47%, Europe 12%. Largest: Americas, United States 27,361${nb}bn USD, 44%.`,
    );
  });

  it("takes the largest part among those with a value", () => {
    expect(generatedSummary(model(gdp(null)), words)).toBe(
      `35,219${nb}bn USD: Asia 73%, Americas 6.2%, Europe 21%. Largest: Asia, China 17,795${nb}bn USD, 51%.`,
    );
  });

  it("gives one level's five largest parts, largest first, ties in the order sent, then how many more", () => {
    expect(generatedSummary(model(flat([5, 30, 10, null, 20, 10, 0, 25])), words)).toBe(
      "100: Country 2 30%, Country 8 25%, Country 5 20%, Country 3 10%, Country 6 10%, and 3 more.",
    );
    expect(generatedSummary(model(flat([1, 3])), words)).toBe("4: Country 2 75%, Country 1 25%.");
  });

  it("frames the parts through partsSummary, the largest through largest and the path through path", () => {
    const own = chartWords({
      partsSummary: (total, parts) => `${parts} (${total})`,
      largest: (name, value, share) => `Top ${name} = ${value} = ${share}.`,
      path: (group, part) => `${part} in ${group}`,
      more: (n) => `+${n}`,
    });
    expect(generatedSummary(model(gdp()), own)).toBe(
      `Asia 41%, Americas 47%, Europe 12% (62,580${nb}bn USD) Top United States in Americas = 27,361${nb}bn USD = 44%.`,
    );
    expect(generatedSummary(model(flat([1, 1, 1, 1, 1, 1])), own)).toBe(
      "Country 1 17%, Country 2 17%, Country 3 17%, Country 4 17%, Country 5 17%, +1 (6)",
    );
  });
});

describe("the summary of small multiples", () => {
  type Panel = NonNullable<ChartSpec["facets"]>["panels"][number];
  const line = (
    key: string,
    values: Values,
    refs: readonly (readonly [string, number])[] = [],
    notes: readonly (readonly [number, string])[] = [],
    unit = "count",
  ): Panel => ({
    key,
    data: marked(
      seriesFrame([0, 1, 2, 3], [], { series: named([key, values]), unit }),
      refs,
      notes,
    ),
  });
  const regions = { one: "region", other: "regions" };

  it("says the panel count, the shared range once, each panel's series, the refs, then the notes", () => {
    const m = model({
      mark: { mark: "line" },
      refs: [{ key: "target", label: "Target" }],
      facets: {
        unit: regions,
        panels: [
          line("North", [0.042, 0.098, 0.07, 0.061], [["target", 0.05]], [[1, "Strike"]], "ratio"),
          line("South", [0.031, 0.074, 0.05, 0.039], [["target", 0.05]], [], "ratio"),
        ],
      },
    });
    expect(generatedSummary(m, words)).toBe(
      `2${nb}regions. 0 to 3, every 1. North: last 6%, low 4%, high 10%. South: last 4%, low 3%, high 7%. Target 5%. North, 1: Strike.`,
    );
  });

  it("puts a panel's own sentences after its name when they do not start with it", () => {
    const panel = (name: string, coal: number[], gas: number[]): Panel => ({
      key: name,
      name,
      data: binsFrame([0, 10], [10, 20], [], {
        axis: "value",
        series: named(["Coal", coal], ["Gas", gas]),
      }),
    });
    const m = model({
      mark: { mark: "rect" },
      facets: { panels: [panel("Germany", [3, 4], [1, 2]), panel("France", [1, 0], [5, 6])] },
    });
    expect(generatedSummary(m, words)).toBe(
      "2 panels. Germany. 10, every 10 from 0 to 20: Coal 7, Gas 3. Busiest: 10 to 20, 6. France. 12, every 10 from 0 to 20: Coal 1, Gas 11. Busiest: 0 to 10, 6.",
    );
  });

  it("names per-series bar panels whose sentences do not name their series, and says the shared rows once", () => {
    const panel = (name: string, coal: number): Panel => ({
      key: name,
      name,
      data: categories(["Coal", "Gas"], [], { series: named(["Share", [coal, 2]]) }),
    });
    const m = model({
      mark: { mark: "bar" },
      facets: { panels: [panel("2023", 3), panel("2024", 1)] },
    });
    expect(generatedSummary(m, words)).toBe(
      "2 panels. 2 categories. 2023. Highest Coal 3, lowest Gas 2. 2024. Highest Gas 2, lowest Coal 1.",
    );
  });

  it("reads the chart's refs once, then each panel's own after its name, before the notes", () => {
    const m = model({
      mark: { mark: "line" },
      refs: [
        { key: "chart", label: "Chart" },
        { key: "north", label: "Only north" },
        { key: "south", label: "Only south", axis: "x" },
      ],
      facets: {
        panels: [
          line(
            "North",
            [1, 2, 3, 4],
            [
              ["chart", 1],
              ["north", 2],
            ],
            [[1, "Strike"]],
          ),
          line(
            "South",
            [4, 3, 2, 1],
            [
              ["chart", 1],
              ["south", 2],
            ],
          ),
        ],
      },
    });
    expect(generatedSummary(m, words)).toBe(
      "2 panels. 0 to 3, every 1. North: last 4, low 1, high 4. South: last 1, low 1, high 4. Chart 1. North, Only north 2. South, Only south 2. North, 1: Strike.",
    );
    const own = model({
      mark: { mark: "line" },
      refs: [{ key: "cap", label: "Cap" }],
      facets: { panels: [line("North", [1, 2, 3, 4], [["cap", 2]]), line("South", [4, 3, 2, 1])] },
    });
    expect(generatedSummary(own, chartWords({ panelAt: (p, at) => `${at} (${p})` }))).toContain(
      "Cap (North) 2.",
    );
  });

  it("shares nothing in a grid of one, so the panel's series sentence leads and names it once", () => {
    const m = model({ mark: { mark: "line" }, facets: { panels: [line("North", [1, 2, 3, 4])] } });
    expect(generatedSummary(m, words)).toBe(
      "1 panel. North: last 4, low 1, high 4. 0 to 3, every 1.",
    );
  });

  it("writes the summary in the app's words for the head and each panel", () => {
    const own = chartWords({
      facetSummary: (count) => `Panels: ${count}.`,
      panel: (name, sentences) => `[${name}] ${sentences}`,
    });
    const m = model({
      mark: { mark: "pie" },
      facets: {
        panels: ["A", "B"].map((name, k): Panel => ({
          key: name,
          name,
          data: categories(["X", "Y"], [[k + 1, 1]]),
        })),
      },
    });
    expect(generatedSummary(m, own)).toBe(
      "Panels: 2 panels. [A] 2: X 50%, Y 50%. [B] 3: X 67%, Y 33%.",
    );
  });
});
