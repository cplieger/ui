/**
 * charts.ts — the gallery wiring for the Charts page: grelot's four
 * statistics drawn by the library's chart from seeded data, the other time
 * series, their loading, empty and error states, and phone-width frames.
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

// The tab's group draws its own figures, below.
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

// The tab's four charts share their range: a new one loads all four.
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
