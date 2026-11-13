/**
 * charts.ts — the gallery wiring for the Charts page: grelot's four
 * statistics drawn by the library's chart from seeded data, the other time
 * series, bars and dots by category, their loading, empty and error states,
 * and phone-width frames.
 */

import { durationEdges, renderChart, type Chart, type ChartSpec } from "@cplieger/ui/chart";

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;

// A fixed moment in the page's own time zone, so every capture draws the
// same charts: the ranges end at 2:00 PM and the data at 1:52 PM.
const END = new Date(2026, 10, 11, 14, 0).getTime();
const NOW = END - 8 * MIN;

// Mulberry32: a seeded generator, the same numbers in every engine.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// How busy the agents are at an instant, from 0.12 at night to 1 at noon.
function busy(t: number): number {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 6 || h > 18 ? 0.12 : 0.12 + 0.88 * Math.sin((Math.PI * (h - 6)) / 12);
}

const KINDS = [
  ["Announce", 0.38],
  ["Path", 0.31],
  ["Direct", 0.2],
  ["Cards", 0.11],
] as const;

interface Posts {
  readonly start: number;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
  readonly counts: readonly number[][];
}

// 15-minute buckets over 6 hours, 1-hour ones over longer ranges, the last
// counted only up to now.
function postCounts(hours: number, size = hours <= 6 ? 15 * MIN : HR, quiet = false): Posts {
  const peak = size === HR ? 46 : 14;
  const start = END - hours * HR;
  const starts = Array.from({ length: (hours * HR) / size }, (_, i) => start + i * size);
  const rand = random(hours);
  const counts = KINDS.map(([, share]) =>
    starts.map((t) => {
      const filled = Math.min(1, (NOW - t) / size);
      return quiet ? 0 : Math.round(peak * share * busy(t + size / 2) * filled * (0.5 + rand()));
    }),
  );
  return { start, starts, ends: starts.map((t) => t + size), counts };
}

interface Drawn {
  readonly shape?: "bars" | "area";
  readonly arrange?: "stack" | "group" | "share";
  readonly kinds?: number;
}

function posts({ start, starts, ends, counts }: Posts, drawn: Drawn = {}): ChartSpec {
  const { kinds = KINDS.length, ...rect } = drawn;
  return {
    x: { type: "time", domain: [start, END] },
    y: { label: "Posts", unit: { one: "post", other: "posts" } },
    marks: [
      {
        mark: "rect",
        x1: starts,
        x2: ends,
        open: true,
        ...rect,
        series: KINDS.slice(0, kinds).map(([name], i) => ({
          name,
          slot: (i + 1) as 1 | 2 | 3 | 4,
          y: [...(counts[i] ?? [])],
        })),
      },
    ],
    empty: "No posts in this range.",
  };
}

// Reads binned as the server bins them, on the duration ladder: each bin
// [edge, next edge), the last closed. The delays are log-normal round a
// 42-second median, with 18 minutes at the 95th percentile.
function reads(n: number, seed: number): ChartSpec {
  const rand = random(seed);
  const edges = durationEdges();
  const last = edges[edges.length - 1] ?? 0;
  const delays: number[] = [];
  while (delays.length < n) {
    const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const ms = Math.round(42 * S * Math.exp(1.974 * z));
    if (ms <= last) {
      delays.push(ms);
    }
  }
  delays.sort((a, b) => a - b);
  const counts = edges.slice(1).map(() => 0);
  for (const d of delays) {
    const above = edges.findIndex((e) => e > d);
    const bin = above === -1 ? counts.length - 1 : above - 1;
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const rank = (q: number): number => delays[Math.ceil(q * delays.length) - 1] ?? 0;
  return {
    x: { type: "log", format: "duration", label: "Time from post to read", domain: [S, last] },
    y: { label: "Reads", unit: { one: "read", other: "reads" } },
    marks: [
      {
        mark: "rect",
        x1: edges.slice(0, -1),
        x2: edges.slice(1),
        series: [{ name: "Reads", y: counts }],
      },
      { mark: "rule", x: rank(0.5), label: "Median" },
      { mark: "rule", x: rank(0.95), label: "95th percentile" },
    ],
    summary: (s) => `${s} 38 still unread.`,
    empty: "No reads in this range.",
  };
}

const READS = new Map([
  [6, 1_204],
  [24, 4_113],
  [72, 10_390],
]);

// Each agent's rate of starting a session; the last eight never post.
const AGENTS = [
  ["lead-ui", 1],
  ["codex-review", 0.8],
  ["kiro-web", 0.7],
  ["gpt-planner", 0.6],
  ["ci-sentinel", 0.55],
  ["test-runner", 0.5],
  ["ui-qa", 0.45],
  ["release-notes", 0.4],
  ["security-audit", 0.35],
  ["deploy-watch", 0.3],
  ["mutation-sweeper", 0.28],
  ["a11y-check", 0.25],
  ["issue-groomer", 0.22],
  ["pr-shepherd", 0.2],
  ["metrics-scout", 0.18],
  ["changelog", 0.15],
  ["dependency-dashboard-keeper", 0.12],
  ["translator-de", 0.1],
  ["design-review", 0.08],
  ["schema-check", 0.06],
  ["cost-watch", 0.04],
  ["docs-bot", 0],
  ["ha-agent", 0],
  ["notes-bot", 0],
  ["link-check", 0],
  ["translator-fr", 0],
  ["backup-check", 0],
  ["calendar-sync", 0],
  ["archive-bot", 0],
] as const;

// An agent posts in sessions, which start more often when the day is busy
// and post about every other minute while they last.
function postTimes(rate: number, from: number, rand: () => number): number[] {
  const times: number[] = [];
  let on = false;
  for (let t = from; t < NOW; t += MIN) {
    on = on ? rand() > 0.08 : rand() < rate * busy(t) * 0.05;
    if (on && rand() < 0.5) {
      times.push(t + Math.floor(rand() * MIN));
    }
  }
  return times;
}

function activity(hours: number): ChartSpec {
  const start = END - hours * HR;
  const rand = random(hours + 100);
  const rows = AGENTS.map(([name, rate]) => ({ name, x: postTimes(rate, start, rand) }));
  rows.sort((a, b) => b.x.length - a.x.length);
  return {
    x: { type: "time", domain: [start, END] },
    y: { type: "band", mono: true, unit: { one: "agent", other: "agents" } },
    marks: [{ mark: "dot", unit: { one: "post", other: "posts" }, rows }],
    empty: "No agent posted in this range.",
  };
}

// Minute samples from a restart 40 minutes in: live agents drift between 4
// and 12, and the active ones follow the day.
function agents(hours: number): ChartSpec {
  const start = END - hours * HR;
  const rand = random(hours + 200);
  const x: number[] = [];
  const live: (number | null)[] = [];
  const active: (number | null)[] = [];
  let l = 8;
  let a = 5;
  for (let t = start; t <= NOW; t += MIN) {
    x.push(t);
    if (t < start + 40 * MIN) {
      live.push(null);
      active.push(null);
      continue;
    }
    if (rand() < 0.1) {
      l = Math.min(12, Math.max(4, l + (rand() < 0.5 + (8 - l) * 0.08 ? 1 : -1)));
    }
    if (rand() < 0.15) {
      a += Math.sign(Math.round(l * busy(t) * 0.8) - a);
    }
    a = Math.min(a, l);
    live.push(l);
    active.push(a);
  }
  return {
    x: { type: "time", domain: [start, END] },
    y: { label: "Agents" },
    marks: [
      {
        mark: "line",
        curve: "step",
        x,
        series: [
          { name: "Live", slot: 1, y: live },
          { name: "Active", slot: 2, y: active },
        ],
      },
    ],
    empty: "No samples in this range.",
  };
}

// Three processes sampled each minute up to now, four minutes unsampled
// after 11:00 AM: the worker climbs until each collection, the cache grows.
function memory(): ChartSpec {
  const start = END - 6 * HR;
  const gap = new Date(2026, 10, 11, 11, 3).getTime();
  const rand = random(300);
  const x: number[] = [];
  const api: (number | null)[] = [];
  const worker: (number | null)[] = [];
  const cache: (number | null)[] = [];
  let heap = 180;
  for (let t = start; t <= NOW; t += MIN) {
    x.push(t);
    if (t >= gap && t < gap + 4 * MIN) {
      api.push(null);
      worker.push(null);
      cache.push(null);
      continue;
    }
    heap = heap > 520 || rand() < 0.01 ? 180 : heap + 4 * rand() * (0.5 + busy(t));
    api.push(Math.round(310 + 160 * busy(t) + 30 * rand()));
    worker.push(Math.round(heap));
    cache.push(Math.round(120 + (90 * (t - start)) / (6 * HR)));
  }
  return {
    x: { type: "time", domain: [start, END] },
    y: { label: "Memory", unit: { one: "MB", other: "MB" } },
    marks: [
      {
        mark: "area",
        x,
        series: [
          { name: "api", slot: 1, y: api },
          { name: "worker", slot: 2, y: worker },
          { name: "cache", slot: 3, y: cache },
        ],
      },
    ],
    empty: "No samples in this range.",
  };
}

// A day's generation every 15 minutes: solar follows the daylight, wind
// drifts, and gas covers the rest of a demand that follows the day.
function energy(): ChartSpec {
  const start = END - 24 * HR;
  const rand = random(400);
  const x: number[] = [];
  const gas: number[] = [];
  const wind: number[] = [];
  const solar: number[] = [];
  let w = 900;
  for (let t = start; t <= NOW; t += 15 * MIN) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const sun = h < 7 || h > 19 ? 0 : Math.round(950 * Math.sin((Math.PI * (h - 7)) / 12));
    w = Math.min(1_400, Math.max(300, w + 120 * (rand() - 0.5)));
    const demand = 2_200 + 900 * busy(t);
    x.push(t);
    solar.push(sun);
    wind.push(Math.round(w));
    gas.push(Math.round(Math.max(250, demand - sun - w)));
  }
  return {
    x: { type: "time", domain: [start, END] },
    y: { label: "Share of generation", unit: { one: "MW", other: "MW" } },
    marks: [
      {
        mark: "area",
        arrange: "share",
        x,
        series: [
          { name: "Gas", slot: 1, y: gas },
          { name: "Wind", slot: 2, y: wind },
          { name: "Solar", slot: 3, y: solar },
        ],
      },
    ],
    empty: "No generation in this range.",
  };
}

// The 95th percentile of response time each minute, round 240 ms, with a
// deploy's spike at 10:20 AM and a flushed cache's dip at 12:40 PM.
function latency(): ChartSpec {
  const start = END - 6 * HR;
  const deploy = new Date(2026, 10, 11, 10, 20).getTime();
  const flush = new Date(2026, 10, 11, 12, 40).getTime();
  const rand = random(500);
  const x: number[] = [];
  const p95: number[] = [];
  for (let t = start; t <= NOW; t += MIN) {
    const after = (t - deploy) / MIN;
    const spike = after >= 0 && after < 12 ? 520 * Math.exp(-after / 4) : 0;
    const dip = t >= flush && t < flush + 25 * MIN ? -90 : 0;
    x.push(t);
    p95.push(Math.round(200 + 60 * busy(t) + 30 * rand() + spike + dip));
  }
  const at = (t: number): number => p95[x.indexOf(t)] ?? 0;
  return {
    x: { type: "time", domain: [start, END] },
    y: { label: "Response time", format: "duration" },
    marks: [
      { mark: "line", x, series: [{ name: "95th percentile", slot: 1, y: p95 }] },
      { mark: "rule", y: 500, label: "Target" },
      { mark: "text", x: deploy, y: at(deploy), text: "Deploy of 1.4.0", side: "right" },
      { mark: "text", x: flush, y: at(flush), text: "Cache flushed", side: "below" },
    ],
    empty: "No samples in this range.",
  };
}

const COUNTRIES = [
  ["Monaco", 55.4],
  ["Japan", 49.9],
  ["Italy", 48.4],
  ["Germany", 46.8],
  ["Greece", 46.5],
  ["Portugal", 46.4],
  ["Spain", 45.3],
  ["Finland", 43.3],
  ["France", 42.6],
  ["United Kingdom", 40.8],
  ["China", 39.8],
  ["United States", 38.9],
  ["Brazil", 34.3],
  ["India", 29.5],
  ["Nigeria", 18.6],
] as const;

const YEARS = { one: "year", other: "years" } as const;

function ages(): ChartSpec {
  return {
    x: { label: "Median age", unit: YEARS },
    y: { unit: { one: "country", other: "countries" } },
    marks: [
      {
        mark: "bar",
        y: COUNTRIES.map(([name]) => name),
        series: [{ name: "Median age", slot: 1, x: COUNTRIES.map(([, age]) => age) }],
      },
      { mark: "rule", x: 30.5, label: "World" },
    ],
  };
}

// Women's and men's median ages, the same countries without Monaco.
const BY_SEX = [
  ["Japan", 51.4, 48.2],
  ["Italy", 49.5, 46.9],
  ["Germany", 47.9, 45.6],
  ["Greece", 47.7, 45.3],
  ["Portugal", 48, 44.6],
  ["Spain", 46.5, 44.1],
  ["Finland", 44.8, 41.9],
  ["France", 44, 40.9],
  ["United Kingdom", 41.9, 39.7],
  ["China", 40.9, 38.6],
  ["United States", 40, 37.7],
  ["Brazil", 35.3, 33.2],
  ["India", 30, 29],
  ["Nigeria", 18.8, 18.4],
] as const;

function agesBySex(): ChartSpec {
  return {
    x: { label: "Median age", unit: YEARS },
    y: { unit: { one: "country", other: "countries" } },
    marks: [
      {
        mark: "point",
        y: BY_SEX.map(([name]) => name),
        series: [
          { name: "Women", slot: 1, x: BY_SEX.map(([, women]) => women) },
          { name: "Men", slot: 2, x: BY_SEX.map(([, , men]) => men) },
        ],
      },
      { mark: "text", y: "Nigeria", x: 18.8, text: "Half its people are under 19", side: "right" },
    ],
  };
}

// Each agent's posts over 24 hours by thread kind, in KINDS' order.
const AGENT_POSTS = [
  ["lead-ui", [48, 37, 25, 12]],
  ["codex-review", [40, 30, 20, 9]],
  ["kiro-web", [33, 28, 17, 10]],
  ["gpt-planner", [30, 22, 14, 7]],
  ["ci-sentinel", [26, 18, 12, 6]],
  ["test-runner", [21, 17, 9, 5]],
  ["ui-qa", [18, 14, 8, 4]],
  ["release-notes", [15, 11, 7, 3]],
] as const;

function agentKinds(arrange?: "share"): ChartSpec {
  return {
    x: {
      label: arrange === undefined ? "Posts" : "Share of posts",
      unit: { one: "post", other: "posts" },
    },
    y: { mono: true, unit: { one: "agent", other: "agents" } },
    marks: [
      {
        mark: "bar",
        y: AGENT_POSTS.map(([name]) => name),
        ...(arrange === undefined ? {} : { arrange }),
        series: KINDS.map(([name], i) => ({
          name,
          slot: (i + 1) as 1 | 2 | 3 | 4,
          x: AGENT_POSTS.map(([, counts]) => counts[i] ?? null),
        })),
      },
    ],
  };
}

const AGENT_WEEKS = [
  ["lead-ui", 702, 815],
  ["codex-review", 610, 644],
  ["kiro-web", 498, 560],
  ["gpt-planner", 455, 430],
  ["ci-sentinel", 390, 372],
  ["test-runner", 301, 340],
] as const;

function agentWeeks(): ChartSpec {
  return {
    x: { label: "Posts", unit: { one: "post", other: "posts" } },
    y: { mono: true, unit: { one: "agent", other: "agents" } },
    marks: [
      {
        mark: "bar",
        y: AGENT_WEEKS.map(([name]) => name),
        arrange: "group",
        series: [
          { name: "Last week", slot: 2, x: AGENT_WEEKS.map(([, last]) => last) },
          { name: "This week", slot: 1, x: AGENT_WEEKS.map(([, , now]) => now) },
        ],
      },
    ],
  };
}

// The 2020 census against 2010, by state.
const CHANGE = [
  ["Utah", 0.184],
  ["Idaho", 0.173],
  ["Texas", 0.159],
  ["North Dakota", 0.158],
  ["Nevada", 0.15],
  ["Colorado", 0.148],
  ["Florida", 0.146],
  ["Ohio", 0.023],
  ["Illinois", -0.001],
  ["Mississippi", -0.002],
  ["West Virginia", -0.032],
  ["Puerto Rico", -0.118],
] as const;

function populationChange(): ChartSpec {
  return {
    x: { format: { style: "percent", maximumFractionDigits: 1 } },
    y: { unit: { one: "state", other: "states" } },
    marks: [
      {
        mark: "bar",
        y: CHANGE.map(([name]) => name),
        series: [{ name: "Change", slot: 1, below: 3, x: CHANGE.map(([, change]) => change) }],
      },
    ],
  };
}

// Shares of adults using each platform daily, weekly or less often.
const PLATFORMS = [
  ["YouTube", [0.54, 0.22, 0.13]],
  ["Facebook", [0.49, 0.14, 0.09]],
  ["Instagram", [0.36, 0.11, 0.08]],
  ["TikTok", [0.24, 0.07, 0.06]],
  ["Snapchat", [0.17, 0.05, 0.05]],
  ["X", [0.12, 0.08, 0.07]],
  ["LinkedIn", [0.06, 0.11, 0.13]],
] as const;

function platforms(): ChartSpec {
  return {
    x: { format: "percent" },
    y: { unit: { one: "platform", other: "platforms" } },
    marks: [
      {
        mark: "bar",
        y: PLATFORMS.map(([name]) => name),
        arrange: "split",
        series: ["Daily", "Weekly", "Less often"].map((name, i) => ({
          name,
          slot: (i + 1) as 1 | 2 | 3,
          x: PLATFORMS.map(([, shares]) => shares[i] ?? null),
        })),
      },
    ],
  };
}

const ANSWERS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

// Bright and deep slots alternate along the bar, so neighbouring answers
// differ in lightness, and the two extremes take the accent's hue and a
// harmony partner's.
const ANSWER_SLOTS = [1, 2, 5, 4, 3] as const;

const STATEMENTS = [
  ["Alerts reach me in time", [0.04, 0.08, 0.16, 0.42, 0.3]],
  ["I would recommend it", [0.05, 0.09, 0.2, 0.36, 0.3]],
  ["Pages load fast enough", [0.06, 0.12, 0.18, 0.38, 0.26]],
  ["I find the setting I need", [0.1, 0.22, 0.24, 0.3, 0.14]],
  ["The docs answer my question", [0.14, 0.26, 0.22, 0.26, 0.12]],
] as const;

function survey(): ChartSpec {
  return {
    x: { format: "percent" },
    y: { unit: { one: "statement", other: "statements" } },
    marks: [
      {
        mark: "bar",
        y: STATEMENTS.map(([name]) => name),
        arrange: "diverge",
        left: 2,
        centre: true,
        series: ANSWERS.map((name, i) => ({
          name,
          slot: ANSWER_SLOTS[i] ?? 1,
          x: STATEMENTS.map(([, shares]) => shares[i] ?? null),
        })),
      },
    ],
  };
}

// France's population by five-year age group in thousands, oldest first.
const AGE_GROUPS = [
  ["100+", 5, 25],
  ["95-99", 40, 140],
  ["90-94", 190, 450],
  ["85-89", 470, 820],
  ["80-84", 760, 1_060],
  ["75-79", 1_180, 1_480],
  ["70-74", 1_680, 1_950],
  ["65-69", 1_840, 2_050],
  ["60-64", 1_990, 2_150],
  ["55-59", 2_120, 2_240],
  ["50-54", 2_180, 2_250],
  ["45-49", 2_060, 2_100],
  ["40-44", 2_060, 2_130],
  ["35-39", 2_050, 2_140],
  ["30-34", 1_960, 2_040],
  ["25-29", 1_860, 1_890],
  ["20-24", 2_000, 1_940],
  ["15-19", 2_140, 2_040],
  ["10-14", 2_130, 2_030],
  ["5-9", 1_970, 1_880],
  ["0-4", 1_790, 1_710],
] as const;

function pyramid(): ChartSpec {
  return {
    x: {
      format: { notation: "compact", maximumFractionDigits: 1 },
      unit: { one: "person", other: "people" },
    },
    y: { unit: { one: "age group", other: "age groups" } },
    marks: [
      {
        mark: "bar",
        y: AGE_GROUPS.map(([name]) => name),
        arrange: "mirror",
        labels: false,
        series: [
          { name: "Men", slot: 1, x: AGE_GROUPS.map(([, men]) => men * 1_000) },
          { name: "Women", slot: 2, x: AGE_GROUPS.map(([, , women]) => women * 1_000) },
        ],
      },
    ],
  };
}

const DEGREES = [
  ["Doctorate", 128_700, 163_500],
  ["Professional degree", 112_000, 150_300],
  ["Master's", 86_500, 139_810],
  ["Bachelor's", 72_300, 101_700],
  ["Associate", 51_800, 70_200],
  ["Some college", 46_400, 64_000],
  ["High school", 40_600, 56_100],
  ["9th to 12th grade", 31_200, 45_900],
  ["Less than 9th grade", 29_100, 43_350],
] as const;

function pay(): ChartSpec {
  return {
    x: { format: { style: "currency", currency: "USD", maximumFractionDigits: 0 } },
    y: { unit: { one: "degree", other: "degrees" } },
    marks: [
      {
        mark: "point",
        y: DEGREES.map(([name]) => name),
        link: "range",
        series: [
          { name: "Women", slot: 1, x: DEGREES.map(([, women]) => women) },
          { name: "Men", slot: 2, x: DEGREES.map(([, , men]) => men) },
        ],
      },
    ],
  };
}

// Battery and plug-in hybrid cars as a share of new cars sold.
const ELECTRIC = [
  ["Norway", 0.058, 0.93],
  ["Sweden", 0.01, 0.6],
  ["Finland", 0.004, 0.54],
  ["Netherlands", 0.056, 0.48],
  ["Denmark", 0.003, 0.46],
  ["China", 0.001, 0.38],
  ["France", 0.008, 0.25],
  ["Germany", 0.002, 0.24],
  ["United Kingdom", 0.005, 0.24],
  ["United States", 0.006, 0.095],
  ["Italy", 0.001, 0.086],
  ["Japan", 0.009, 0.036],
  ["India", 0, 0.02],
] as const;

function electricCars(): ChartSpec {
  return {
    x: { format: { style: "percent", maximumFractionDigits: 1 } },
    y: { unit: { one: "country", other: "countries" } },
    marks: [
      {
        mark: "point",
        y: ELECTRIC.map(([name]) => name),
        link: "arrow",
        series: [
          { name: "2013", slot: 2, x: ELECTRIC.map(([, then]) => then) },
          { name: "2023", slot: 1, x: ELECTRIC.map(([, , now]) => now) },
        ],
      },
    ],
  };
}

const SPECS = new Map<string, (hours: number) => ChartSpec>([
  ["posts", (hours) => posts(postCounts(hours))],
  ["reads", (hours) => reads(READS.get(hours) ?? 1_204, hours)],
  ["activity", activity],
  ["agents", agents],
]);

function draw(figure: HTMLElement, spec: ChartSpec | null): Chart {
  const toggle = figure.querySelector<HTMLButtonElement>(":scope > .cp-toolbar > .cp-filter-chip");
  return renderChart(figure, spec, toggle === null ? {} : { toggle });
}

function notice(words: string, retry: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "cp-notice";
  box.dataset["tone"] = "danger";
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = "circle-x";
  glyph.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = words;
  const button = document.createElement("button");
  button.className = "cp-button";
  button.dataset["size"] = "sm";
  button.type = "button";
  button.textContent = "Retry";
  button.addEventListener("click", retry);
  box.append(glyph, text, button);
  return box;
}

// An answer takes 700 ms, so the skeleton shows and keeps its minimum.
const later = (run: () => void): void => {
  setTimeout(run, 700);
};

// A chart stack draws its own figures, below.
const figures = new Map<string, HTMLElement>();
for (const figure of document.querySelectorAll<HTMLElement>("figure[data-chart]")) {
  if (figure.closest("[data-chart-group]") === null) {
    figures.set(figure.dataset["chart"] ?? "", figure);
  }
}
const charts = new Map<string, Chart>();
const make = (name: string, spec: ChartSpec | null): Chart | undefined => {
  const figure = figures.get(name);
  if (figure === undefined) {
    return undefined;
  }
  const chart = draw(figure, spec);
  charts.set(name, chart);
  return chart;
};

const sixHours = postCounts(6);
make("posts-6", posts(sixHours));
make("posts-72", posts(postCounts(72)));
make("posts-area", posts(sixHours, { shape: "area" }));
make("memory", memory());
make("energy", energy());
make("grouped", posts(postCounts(6, HR), { arrange: "group", kinds: 3 }));
make("share-columns", posts(postCounts(24), { arrange: "share" }));
make("latency", latency());
make("phone-memory", memory());
make("phone-latency", latency());
make("phone-grouped", posts(postCounts(6), { arrange: "group", kinds: 3 }));
make("reads", reads(1_204, 6));
make("ages", ages());
make("agent-kinds", agentKinds());
make("agent-weeks", agentWeeks());
make("agent-shares", agentKinds("share"));
make("population-change", populationChange());
make("platforms", platforms());
make("survey", survey());
make("pyramid", pyramid());
make("ages-by-sex", agesBySex());
make("pay", pay());
make("electric-cars", electricCars());
make("phone-ages", ages());
make("phone-platforms", platforms());
make("phone-ages-by-sex", agesBySex());
make("phone-pay", pay());
make("phone-electric-cars", electricCars());
make("activity", activity(6));
make("agents", agents(6));
make("loading", null);
make("empty", posts(postCounts(6, 15 * MIN, true)));

const firstLoad = make("failed", null);
const loadFails = (): void => {
  firstLoad?.error(
    notice("The samples did not load: the server did not answer.", () => {
      firstLoad.loading();
      later(() => {
        firstLoad.update(agents(6));
      });
    }),
  );
};
const failLoad = (): void => {
  firstLoad?.loading();
  later(loadFails);
};
loadFails();

const refreshed = make("refresh", reads(1_204, 6));
const failRefresh = (): void => {
  refreshed?.error(
    notice("The refresh at 1:52 PM did not answer, so this is the answer from 1:51 PM.", () => {
      refreshed.update(reads(1_204, 6));
    }),
  );
};
failRefresh();

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-chart-fail]")) {
  button.addEventListener(
    "click",
    button.dataset["chartFail"] === "failed" ? failLoad : failRefresh,
  );
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-chart-answer]")) {
  button.addEventListener("click", () => {
    charts.get(button.dataset["chartAnswer"] ?? "")?.update(posts(sixHours));
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-chart-reload]")) {
  button.addEventListener("click", () => {
    charts.get(button.dataset["chartReload"] ?? "")?.loading();
  });
}

// A minute's posts land in the bucket still filling.
const tick = random(42);
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-chart-tick]")) {
  button.addEventListener("click", () => {
    for (const kind of sixHours.counts) {
      const last = kind.length - 1;
      kind[last] = (kind[last] ?? 0) + Math.floor(tick() * 3);
    }
    charts.get(button.dataset["chartTick"] ?? "")?.update(posts(sixHours));
  });
}

// A stack's charts share their range: a new one loads them all.
for (const group of document.querySelectorAll<HTMLElement>("[data-chart-group]")) {
  const tab = [...group.querySelectorAll<HTMLElement>("figure[data-chart]")].flatMap((figure) => {
    const spec = SPECS.get(figure.dataset["chart"] ?? "");
    return spec === undefined ? [] : [{ chart: draw(figure, spec(6)), spec }];
  });
  const range = group.closest(".card")?.querySelector(".cp-segmented");
  range?.addEventListener("change", (e) => {
    const hours = Number((e.target as HTMLInputElement).value);
    for (const { chart } of tab) {
      chart.loading();
    }
    later(() => {
      for (const { chart, spec } of tab) {
        chart.update(spec(hours));
      }
    });
  });
}
