import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_VALUES } from "../frame/limits.js";
import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type ChartSpec } from "./chart.js";

const H = 3_600_000;
const DAY = 24 * H;
const T = Date.UTC(2026, 10, 2);
const UNIT = { one: "post", other: "posts" };
const MS = { style: "unit", unit: "millisecond", maximumFractionDigits: 0 };
const SCALE = { label: "Load", unit: UNIT, format: "number", zero: true };

// One spec per mark and arrangement, together setting every field the
// chart's spec and its frames document, so a dropped or mistyped field
// reaches each one.
const SPECS: readonly Record<string, unknown>[] = [
  {
    x: { type: "time", domain: [T, T + 4 * H], reverse: true, format: "number" },
    y: { ...SCALE, domain: [0, 20] },
    height: 160,
    summary: (generated: string) => `${generated} Busy.`,
    empty: "No posts",
    data: {
      type: "bins",
      name: "Posts",
      unit: "count",
      axis: "time",
      x1: [T, T + H, T + 2 * H],
      x2: [T + H, T + 2 * H, T + 3 * H],
      open: true,
      domain: [T, T + 3 * H],
      resets: [T + 2 * H],
      series: [
        { key: "posts", values: [3, null, 5] },
        { key: "replies", values: [1, 2, Number.NaN] },
      ],
      refs: [{ key: "goal", value: 4 }],
      notes: [{ key: "peak", at: T + H }],
    },
    mark: {
      mark: "rect",
      arrange: "stack",
      shape: "area",
      keys: [
        { key: "posts", name: "Posts", slot: 1 },
        { key: "replies", name: "Replies" },
      ],
    },
    refs: [{ key: "goal", label: "Goal", axis: "y" }],
    notes: [{ key: "peak", text: "Peak", side: "right" }],
  },
  {
    data: {
      type: "bins",
      name: "Sizes",
      unit: "none",
      axis: "value",
      x1: [0, 10],
      x2: [10, 20],
      series: [
        { key: "a", values: [1.5, 2] },
        { key: "b", values: [2, 0.25] },
      ],
    },
    mark: { mark: "rect", arrange: "group" },
  },
  {
    x: { type: "time" },
    y: { zero: false, label: "Memory", format: MS },
    summary: "Memory over the day.",
    data: {
      type: "series",
      name: "Memory",
      unit: "bytes",
      x: [T, T + H, T + 2 * H],
      resets: [T + H],
      open: true,
      series: [{ key: "heap", values: [10, 12, null] }],
      notes: [{ key: "start", at: T }],
    },
    mark: { mark: "line", curve: "step", keys: [{ key: "heap", name: "Heap", slot: 3 }] },
    notes: [{ key: "start", text: "Start" }],
  },
  {
    y: { format: "percent" },
    data: {
      type: "series",
      name: "Share",
      unit: "ratio",
      x: [0, 1, 2],
      series: [
        { key: "a", values: [1, 2, 3] },
        { key: "b", values: [3, 2, 1] },
      ],
    },
    mark: { mark: "area", curve: "linear", arrange: "share", keys: [{ key: "b", slot: 2 }] },
  },
  {
    x: { type: "time", label: "Time" },
    data: {
      type: "events",
      name: "Posts",
      rows: [
        { key: "ada", at: [T, T + H, T + H] },
        { key: "bea", at: [] },
      ],
      refs: [{ key: "deploy", value: T + H }],
      notes: [{ key: "first", at: T }],
    },
    mark: {
      mark: "dot",
      slot: 4,
      unit: UNIT,
      keys: [
        { key: "ada", name: "Ada" },
        { key: "bea", name: "Bea" },
      ],
    },
    refs: [{ key: "deploy", label: "Deploy" }],
    notes: [{ key: "first", text: "First" }],
  },
  {
    x: { label: "Posts", unit: UNIT, format: "integer" },
    y: { mono: true, label: "Agents" },
    data: {
      type: "categories",
      name: "Posts",
      unit: "count",
      names: ["one", "two"],
      series: [{ key: "posts", values: [4, -2] }],
      refs: [{ key: "mean", value: 1 }],
    },
    mark: {
      mark: "bar",
      labels: true,
      keys: [{ key: "posts", name: "Posts", slot: 2, below: 5 }],
    },
    refs: [{ key: "mean", label: "Mean", axis: "x" }],
  },
  {
    data: {
      type: "categories",
      name: "Answers",
      unit: "count",
      names: ["s1", "s2"],
      series: [
        { key: "No", values: [1, 2] },
        { key: "Neutral", values: [1, 1] },
        { key: "Yes", values: [3, 2] },
      ],
    },
    mark: { mark: "bar", arrange: "diverge", left: 1, centre: true },
  },
  {
    data: {
      type: "categories",
      name: "People",
      unit: "count",
      names: ["0-9", "10-19"],
      series: [
        { key: "Men", values: [4, 5] },
        { key: "Women", values: [5, 4] },
      ],
      notes: [{ key: "young", at: 2 }],
    },
    mark: { mark: "bar", arrange: "mirror" },
    notes: [{ key: "young", text: "Young" }],
  },
  {
    x: { type: "log", label: "Pay" },
    data: {
      type: "categories",
      name: "Pay",
      unit: "none",
      names: ["BA", "MA"],
      series: [
        { key: "2000", values: [10, 20] },
        { key: "2020", values: [30, null] },
      ],
    },
    mark: { mark: "point", link: "arrow", keys: [{ key: "2020", slot: 6 }] },
  },
  {
    y: { label: "Years", domain: [60, 90] },
    height: 200,
    data: {
      type: "categories",
      name: "Life",
      unit: "none",
      names: ["1990", "2020"],
      series: [
        { key: "japan", values: [79, 84] },
        { key: "chad", values: [null, 53] },
      ],
      refs: [{ key: "world", value: 70 }],
      notes: [{ key: "top", at: 84 }],
    },
    mark: {
      mark: "slope",
      keys: [
        { key: "japan", name: "Japan", slot: 1 },
        { key: "chad", name: "Chad" },
      ],
    },
    refs: [{ key: "world", label: "World" }],
    notes: [{ key: "top", text: "Top" }],
  },
  {
    x: { type: "log", label: "GDP", format: "integer", domain: [100, 1e5] },
    y: { label: "Life", zero: true },
    r: { type: "linear", label: "People", domain: [0, 1e9], format: "integer" },
    data: {
      type: "points",
      name: "Countries",
      units: { x: "none", y: "none", r: "none" },
      series: [
        { key: "europe", names: ["FR", "DE"], x: [4e4, 5e4], y: [82, 81], r: [6e7, 8e7] },
        { key: "asia", names: ["JP"], x: [3e4], y: [84], r: [0] },
      ],
      refs: [{ key: "seventy", value: 70 }],
      notes: [{ key: "france", at: 4e4 }],
    },
    mark: {
      mark: "scatter",
      unit: { one: "country", other: "countries" },
      keys: [
        { key: "europe", name: "Europe", slot: 1 },
        { key: "asia", name: "Asia" },
      ],
    },
    refs: [{ key: "seventy", label: "Seventy" }],
    notes: [{ key: "france", text: "France", side: "below" }],
  },
  {
    colour: {
      type: "diverging",
      steps: 6,
      domain: [-10, 10],
      pivot: 0,
      reverse: true,
      label: "Change",
      unit: {
        zero: "posts",
        one: "post",
        two: "posts",
        few: "posts",
        many: "posts",
        other: "posts",
      },
      format: "number",
    },
    data: {
      type: "grid",
      name: "Change",
      unit: "count",
      x: { names: ["Mon", "Tue"] },
      y: { names: ["AM", "PM"] },
      values: [
        [1, -2],
        [null, 4],
      ],
      notes: [{ key: "low", at: 0 }],
    },
    mark: { mark: "cell" },
    notes: [{ key: "low", text: "Low" }],
  },
  {
    x: { type: "log", label: "Size" },
    y: { label: "Time", format: MS },
    colour: { thresholds: [1, 5], label: "Requests" },
    data: {
      type: "grid",
      name: "Requests",
      unit: "count",
      x: { edges: [1, 10, 100] },
      y: { edges: [0, 100, 200] },
      values: [
        [1, 2],
        [3, null],
      ],
      refs: [{ key: "slow", value: 150 }],
    },
    mark: { mark: "cell" },
    refs: [{ key: "slow", label: "Slow", axis: "y" }],
  },
  {
    colour: { steps: 4, label: "Posts", unit: UNIT },
    data: {
      type: "calendar",
      name: "Posts",
      unit: "count",
      zone: "UTC",
      start: T,
      values: [1, null, 3, 0, 5, 2, 8, 4, 1],
      open: true,
      notes: [{ key: "tuesday", at: T + DAY }],
    },
    mark: { mark: "cell", weekStart: 1 },
    notes: [{ key: "tuesday", text: "Tuesday" }],
  },
  {
    x: { type: "linear", label: "Latency", format: MS, zero: true, domain: [0, 1000] },
    data: {
      type: "boxes",
      name: "Latency",
      unit: "none",
      names: ["/api", "/login"],
      series: [
        {
          key: "before",
          low: [10, null],
          q1: [20, null],
          median: [30, null],
          q3: [40, null],
          high: [50, null],
          outliers: [[90], []],
        },
        { key: "after", low: [5, 1], q1: [6, 2], median: [7, 3], q3: [8, 4], high: [9, 5] },
      ],
      refs: [{ key: "target", value: 25 }],
    },
    mark: {
      mark: "box",
      whiskers: "1.5 × IQR",
      keys: [
        { key: "before", name: "Before", slot: 1 },
        { key: "after", name: "After" },
      ],
    },
    refs: [{ key: "target", label: "Target" }],
  },
  {
    summary: "Land use.",
    data: {
      type: "categories",
      name: "Land",
      unit: "none",
      names: ["Forest", "Farm", "Water", "Ice"],
      series: [{ key: "area", values: [30, 50, null, 0] }],
    },
    mark: {
      mark: "pie",
      hole: true,
      unit: { one: "km²", other: "km²" },
      format: "integer",
      keys: [{ key: "Forest", slot: 4 }],
    },
  },
  {
    data: {
      type: "tree",
      name: "Spend",
      unit: "count",
      parts: [
        { key: "a", value: 5 },
        { key: "b", value: 3 },
        { key: "c", value: null },
      ],
    },
    mark: { mark: "tree", slot: 2, unit: UNIT, format: "number", keys: [{ key: "a", slot: 3 }] },
  },
  {
    data: {
      type: "tree",
      name: "Spend",
      unit: "none",
      groups: [
        {
          key: "Europe",
          children: [
            { key: "FR", value: 3 },
            { key: "Other", value: 1 },
          ],
        },
        { key: "Asia", children: [{ key: "Other", value: 4 }] },
      ],
    },
    mark: { mark: "tree", format: MS, keys: [{ key: "Europe", slot: 1 }] },
  },
  {
    y: { format: "percent" },
    mark: {
      mark: "line",
      keys: [
        { key: "north", name: "North" },
        { key: "south", name: "South" },
      ],
    },
    refs: [{ key: "target", label: "Target" }],
    notes: [{ key: "strike", text: "Strike" }],
    facets: {
      unit: UNIT,
      context: true,
      panels: [
        {
          key: "n",
          data: {
            type: "series",
            name: "Share",
            unit: "ratio",
            x: [0, 1, 2],
            series: [{ key: "north", values: [0.02, 0.06, 0.04] }],
            refs: [{ key: "target", value: 0.05 }],
            notes: [{ key: "strike", at: 1 }],
          },
        },
        {
          key: "s",
          name: "Southern",
          data: {
            type: "series",
            name: "Share",
            unit: "ratio",
            x: [0, 1, 2],
            series: [{ key: "south", values: [0.03, 0.01, null] }],
            refs: [{ key: "target", value: 0.05 }],
          },
        },
      ],
    },
  },
];

type Path = readonly (string | number)[];

// A unit's plural forms, named in a message after their unit.
const PLURALS = ["few", "many", "one", "other", "two", "zero"];

// Every field name the spec and its frames document, for a field a spec
// leaves out.
const NAMES = [
  ..."arrange at axis below centre children colour context curve data domain edges empty".split(
    " ",
  ),
  ..."facets format groups height high hole key keys label labels left link low mark".split(" "),
  ..."median mono name names notes open outliers panels parts pivot q1 q3 r refs resets".split(" "),
  ..."reverse rows series shape side slot start steps summary text thresholds type unit".split(" "),
  ..."units value values weekStart whiskers x x1 x2 y zero zone".split(" "),
];
const FIELDS = [...new Set([...NAMES, ...PLURALS])];

// Every place in `v` a field or an element sits.
function paths(v: unknown, at: Path = []): Path[] {
  if (typeof v !== "object" || v === null) {
    return [];
  }
  return Object.keys(v).flatMap((k) => {
    const here = [...at, Array.isArray(v) ? Number(k) : k];
    return [here, ...paths((v as Record<string, unknown>)[k], here)];
  });
}

const at = (v: unknown, path: Path): unknown =>
  path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], v);

// Where an object sits, by its spec's mark and its path, indices aside.
function shape(spec: unknown, path: Path): string {
  const kind = String(at(spec, ["mark", "mark"]));
  return `${kind}:${path.map((k) => (typeof k === "number" ? "#" : k)).join(".")}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// The fields each shape of object holds in any spec.
const FIELDS_AT = new Map<string, Set<string>>();
for (const spec of SPECS) {
  for (const path of [[], ...paths(spec)]) {
    const o = at(spec, path);
    if (isRecord(o)) {
      const key = shape(spec, path);
      const set = FIELDS_AT.get(key) ?? new Set();
      Object.keys(o).forEach((f) => set.add(f));
      FIELDS_AT.set(key, set);
    }
  }
}

// Each field an object of `spec` leaves out that its shape holds elsewhere.
const absent = (spec: unknown): Path[] =>
  [[], ...paths(spec)].flatMap((path) => {
    const o = at(spec, path);
    return isRecord(o)
      ? [...(FIELDS_AT.get(shape(spec, path)) ?? [])]
          .filter((f) => !(f in o))
          .map((f) => [...path, f])
      : [];
  });

// A deep copy of `v`, each object it makes added to `made`.
function clone(v: unknown, made: WeakSet<object>): unknown {
  if (typeof v !== "object" || v === null) {
    return v;
  }
  const copy = Array.isArray(v)
    ? v.map((e) => clone(e, made))
    : Object.fromEntries(Object.entries(v).map(([k, e]) => [k, clone(e, made)]));
  made.add(copy);
  return copy;
}

const DROP = Symbol("drop");

// Values a mistyped field might hold, near and far from what each expects,
// the most px a plot may be among them.
const WRONG: readonly unknown[] = [
  DROP,
  undefined,
  null,
  0,
  -1,
  1.5,
  10,
  40_000,
  1e6,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  9e15,
  -9e15,
  1e301,
  "",
  "x",
  "stack",
  true,
  false,
  [],
  [1],
  ["a"],
  [null],
  { length: Number.NaN },
  { length: -1 },
  { length: 1e7 },
  { length: 1, 0: "a" },
  { length: 1, 0: 1 },
  {},
  { other: 1 },
  { edges: [1] },
  () => "x",
];

// `spec` with each of `changes` applied: the field at a path dropped or set.
// A change writes only into the copy's own objects: one reached through a
// value an earlier change set (a shared list, a wrong value) is SPECS' or
// WRONG's, or a generated value fast-check replays, so it is skipped.
function mutate(spec: unknown, changes: readonly (readonly [Path, unknown])[]): unknown {
  const made = new WeakSet<object>();
  const out = clone(spec, made);
  for (const [path, value] of changes) {
    let parent = out as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      const next = parent[key];
      if (typeof next !== "object" || next === null || !made.has(next)) {
        parent = undefined as never;
        break;
      }
      parent = next as Record<string | number, unknown>;
    }
    const key = path.at(-1);
    if (parent === undefined || key === undefined) {
      continue;
    }
    if (value === DROP) {
      if (Array.isArray(parent) && typeof key === "number") {
        parent.splice(key, 1);
      } else {
        Reflect.deleteProperty(parent, key);
      }
    } else {
      parent[key] = value;
    }
  }
  return out;
}

const hosts: HTMLElement[] = [];
let sheet: HTMLLinkElement;

beforeEach(async () => {
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
  document.documentElement.classList.add("cp");
});

afterEach(() => {
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  document.documentElement.classList.remove("cp");
  forgetMeasures();
});

const KEYS = ["ArrowRight", "ArrowDown", "PageDown", "End", "ArrowLeft", "PageUp", "Home"];

// The elements of `figure` and the subpaths of its paths: a tick, a
// gridline, a bar or a dot each starts one.
function drawnIn(figure: Element | undefined): number {
  if (figure === undefined) {
    return 0;
  }
  let n = figure.querySelectorAll("*").length;
  for (const path of figure.querySelectorAll("[d]")) {
    n += path.getAttribute("d")?.split("M").length ?? 1;
  }
  return n;
}

// Draws `spec`, reads it key by key, shows its table and, unless `again` is
// false, updates a second chart to it, so every part that reads the spec
// runs; returns how many elements the first figure holds, its table's included.
function exercise(spec: unknown, timeZone: string, again = true): number {
  const box = document.createElement("div");
  box.style.inlineSize = "480px";
  document.body.append(box);
  hosts.push(box);
  box.innerHTML = `<figure class="cp-chart" lang="en"><figcaption>Spec</figcaption></figure><figure class="cp-chart" lang="fr"><figcaption>Spec</figcaption></figure>`;
  const [one, two] = box.querySelectorAll("figure");
  const life = new AbortController();
  try {
    const chart = renderChart(one as HTMLElement, spec as ChartSpec, {
      signal: life.signal,
      timeZone,
    });
    const plot = one?.querySelector<HTMLElement>(':scope > [data-part="plot"]');
    plot?.focus();
    for (const key of KEYS) {
      plot?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    chart.showTable(true);
    void chart.summary;
    const drawn = drawnIn(one);
    if (again) {
      const later = renderChart(two as HTMLElement, SPECS[0] as unknown as ChartSpec, {
        signal: life.signal,
        timeZone,
      });
      later.update(spec as ChartSpec);
    }
    return drawn;
  } finally {
    life.abort();
    box.remove();
  }
}

// The chart's own errors start with its name and name what broke as the
// subject, before the verb; an engine's ("undefined is not iterable",
// "Invalid time value") and a backstop's ("a calendar day must lie") do not.
const PREFIX = "renderChart: ";
const VERB = / (?:must|cannot|needs|need|has|holds|is|are) /u;
const FIELD = new RegExp(`\\b(?:${NAMES.join("|")})\\b`, "u");

function refusedByName(e: unknown): boolean {
  if (!(e instanceof TypeError || e instanceof RangeError) || !e.message.startsWith(PREFIX)) {
    return false;
  }
  return FIELD.test(e.message.slice(PREFIX.length).split(VERB)[0] ?? "");
}

// A plot at its tallest, 40,000px, draws about a thousand y ticks, each a
// gridline and a label, and a spec here a few hundred elements more.
const MOST_DRAWN = 3_000;

// Past the plot's own, a value the app sends draws at most this many: a
// grouped bar's, the most measured at about 3.3, is its bar, its label, its
// table cell and a share of its row and the row's head.
const PER_VALUE = 4;

// Every number, string, boolean and null `v` holds, at least the values it sends.
const leaves = (v: unknown): number =>
  typeof v === "object" && v !== null
    ? Object.values(v).reduce<number>((n, x) => n + leaves(x), 0)
    : 1;

const mostDrawn = (spec: unknown): number => MOST_DRAWN + PER_VALUE * leaves(spec);

// A run draws whole figures, about 8 ms alone and 90 ms in a loaded full
// suite, so 200 runs can pass the shared 10 s limit, which fails the test.
// This budget ends the runs at 5 s instead, and the verdict rests on the
// runs made: fewer on a loaded host, never a failure for the time taken.
const BUDGET = fc.interruptAfterTimeLimit(5_000);
const RUNS = { numRuns: 200, plugins: [BUDGET] };
const EACH = { numRuns: 60, plugins: [BUDGET] };

const zone = fc.constantFrom("UTC", "America/New_York", "Asia/Kolkata");

// `list` with every read of an element throwing, so a check that walks or
// copies it before refusing it fails by that error.
const unread = <T extends object>(list: T): T =>
  new Proxy(list, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/u.test(key)) {
        throw new Error(`read element ${key}`);
      }
      // A typed array's length getter needs the array itself as its receiver.
      return Reflect.get(target, key) as unknown;
    },
  });

// A field's name as the chart's errors write it: data.series[1].values.
const named = (path: Path): string =>
  path.map((k, i) => (typeof k === "number" ? `[${String(k)}]` : i === 0 ? k : `.${k}`)).join("");

// Each list a spec holds, a number per entry and one more for a bin's edges.
const lists = (spec: unknown): Path[] =>
  paths(spec).filter((path) => Array.isArray(at(spec, path)));
const MOST_ENTRIES = (path: Path): number => (path.at(-1) === "edges" ? 1_000_001 : 1_000_000);

// Every stand-in for a list: no array, an array-like of each length that is
// no array's, a typed array, and an array one entry past the most a spec holds.
const NOT_LISTS = (path: Path): readonly unknown[] => [
  "a",
  1,
  {},
  unread(new Float64Array([1])),
  unread({ length: 1, 0: "a" }),
  ...[-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e7, 2 ** 32 - 1, 2 ** 32, 4e9].map((length) =>
    unread({ length }),
  ),
  unread(new Array<number>(MOST_ENTRIES(path) + 1)),
];

// Copies of `list` that lie about their entries once read: one whose own
// iterator throws, and one whose length reads 4e9 after its first read.
function liars(list: readonly unknown[]): readonly unknown[] {
  const iterated = [...list];
  Object.defineProperty(iterated, Symbol.iterator, {
    value: () => {
      throw new Error("pulled the iterator");
    },
  });
  let reads = 0;
  const growing = new Proxy([...list], {
    get: (target, key) =>
      key === "length" && reads++ > 0 ? 4e9 : (Reflect.get(target, key) as unknown),
  });
  return [iterated, growing];
}

// The index reads of the list each `share` change spreads, by the change's value.
const READS = new WeakMap<object, { n: number }>();

// Each list with a place it repeats at: the index of the series, row, node or
// mark holding it, or its own in a list of lists.
const repeats = (spec: unknown): (readonly [Path, number])[] =>
  lists(spec).flatMap((path) =>
    path.flatMap((k, j) => (typeof k === "number" ? [[path, j] as const] : [])),
  );

// The change that puts `copies` of the entry at `path[j]` in its list, all
// holding one counted list at `path`, long enough that together they hold
// twice the values a spec takes.
function share(spec: unknown, path: Path, j: number, copies: number): readonly [Path, unknown] {
  const list = at(spec, path) as readonly unknown[];
  const read = { n: 0 };
  const length = Math.min(MOST_ENTRIES(path), Math.ceil((2 * MAX_VALUES) / copies));
  const shared = new Proxy(new Array<unknown>(length).fill(list[0] ?? 0), {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/u.test(key)) {
        read.n++;
      }
      return Reflect.get(target, key) as unknown;
    },
  });
  const tail = path.slice(j + 1);
  const entry = at(spec, path.slice(0, j + 1));
  const copied = Array.from({ length: copies }, () =>
    tail.length === 0 ? shared : mutate(entry, [[tail, shared]]),
  );
  // fast-check prints a failing case, which would spell out every entry.
  const what = `${String(copies)} copies sharing ${named(path)} of ${String(length)}`;
  Object.defineProperty(copied, fc.toStringMethod, { value: () => what });
  READS.set(copied, read);
  return [path.slice(0, j), copied];
}

describe("a chart spec", () => {
  it.each(SPECS.map((_, k) => k))(
    "refuses each list of spec %i given anything but an array within the ceiling, by its name, before reading it",
    (k) => {
      const spec = SPECS[k];
      for (const path of lists(spec)) {
        for (const list of NOT_LISTS(path)) {
          const changed = mutate(spec, [[path, list]]);
          let thrown: unknown;
          try {
            exercise(changed, "UTC");
          } catch (e) {
            thrown = e;
          }
          const what = `${named(path)} given ${Object.prototype.toString.call(list)} of length ${String((list as { length?: unknown }).length)}`;
          expect(thrown, what).toBeInstanceOf(Error);
          expect(thrown instanceof TypeError || thrown instanceof RangeError, what).toBe(true);
          // A cell axis that is an object reads as bins, so its edges are named.
          expect((thrown as Error).message, what).toMatch(
            new RegExp(
              `^${PREFIX}${named(path).replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:\\.edges)?(?![\\w.[])`,
              "u",
            ),
          );
        }
      }
    },
  );

  // The chart builds from its own copy, read once: one length read per list
  // and its entries by index, never by the list's iterator.
  it.each(SPECS.map((_, k) => k))(
    "draws spec %i as written when a list lies about its entries after one read",
    (k) => {
      const spec = SPECS[k];
      const drawn = exercise(spec, "UTC", false);
      for (const path of lists(spec)) {
        for (const liar of liars(at(spec, path) as readonly unknown[])) {
          expect(exercise(mutate(spec, [[path, liar]]), "UTC", false), named(path)).toBe(drawn);
        }
      }
    },
  );

  // Each at a ceiling the check holds: the tallest plot on a fine linear
  // y, on a log y of every decade, and a binned y of a thousand rows.
  it("draws a plot at its tallest in at most MOST_DRAWN elements and subpaths", () => {
    const line = {
      data: {
        type: "series",
        name: "s",
        unit: "none",
        x: [0, 1, 2],
        series: [{ key: "a", values: [0.1, 0.5, 0.2] }],
      },
      mark: { mark: "line" },
    };
    const bins = {
      type: "grid",
      name: "g",
      unit: "count",
      x: { edges: [1, 10, 100] },
      y: { edges: [0, 0.1, 100] },
      values: [
        [1, 2],
        [3, null],
      ],
    };
    for (const spec of [
      { ...line, height: 40_000, y: { domain: [0, 1] } },
      { ...line, height: 40_000, y: { type: "log", label: "a", domain: [1e-300, 1e300] } },
      { ...SPECS[12], height: 40_000, data: bins },
    ]) {
      expect(exercise(spec, "UTC"), JSON.stringify(spec)).toBeLessThanOrEqual(MOST_DRAWN);
    }
  });

  // The panels share the tallest plot out among them, so a grid of them at
  // any height the check takes draws what one tallest plot does beside its
  // values. Context draws each panel's values again behind every other panel,
  // and the check counts each of those as a value too.
  it("draws a grid of the most panels at their tallest within the bound, context included", () => {
    const panels = 100;
    const samples = 2;
    const grid = (height: number, context: boolean) => ({
      height,
      y: { domain: [0, 1] },
      mark: { mark: "line" },
      refs: [{ key: "half", label: "Half" }],
      facets: {
        context,
        panels: Array.from({ length: panels }, (_, k) => ({
          key: `p${String(k)}`,
          data: {
            type: "series",
            name: "s",
            unit: "none",
            x: [0, 1],
            series: [{ key: `P${String(k)}`, values: [0.1, 0.9] }],
            refs: [{ key: "half", value: 0.5 }],
          },
        })),
      },
    });
    const behind = (panels - 1) * panels * samples;
    let drawn = 0;
    for (const height of [400, 40_000]) {
      for (const context of [false, true]) {
        const spec = grid(height, context);
        try {
          const n = exercise(spec, "UTC", false);
          expect(n, `${String(height)} ${String(context)}`).toBeLessThanOrEqual(
            mostDrawn(spec) + (context ? PER_VALUE * behind : 0),
          );
          drawn++;
        } catch (e) {
          if (!refusedByName(e)) {
            throw e;
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });

  // The data marks at their most values for a test's time, one way each
  // value draws: samples a pixel apart, dots, bars and their labels, cells.
  it("draws a spec of many values in at most MOST_DRAWN and PER_VALUE a value", () => {
    const n = 1_000;
    const at = Array.from({ length: n }, (_, i) => i);
    const names = at.map((i) => `n${String(i)}`);
    const wave = at.map((i) => (i % 7) - 3);
    const frame = { name: "f", unit: "none" };
    for (const spec of [
      {
        data: {
          ...frame,
          type: "series",
          x: at,
          series: [
            { key: "a", values: wave },
            { key: "b", values: at },
          ],
        },
        mark: { mark: "line" },
      },
      {
        data: {
          type: "events",
          name: "e",
          rows: names.slice(0, 50).map((key) => ({ key, at: at.slice(0, 40) })),
        },
        mark: { mark: "dot" },
      },
      {
        data: {
          ...frame,
          type: "categories",
          names,
          series: [
            { key: "a", values: at },
            { key: "b", values: wave },
          ],
        },
        mark: { mark: "bar", arrange: "group" },
      },
      {
        x: { label: "x" },
        y: { label: "y" },
        data: {
          type: "points",
          name: "p",
          units: { x: "none", y: "none" },
          series: [{ key: "a", names, x: at, y: wave }],
        },
        mark: { mark: "scatter" },
      },
      {
        data: {
          ...frame,
          type: "grid",
          x: { names: names.slice(0, 10) },
          y: { names: names.slice(0, 100) },
          values: names.slice(0, 100).map(() => wave.slice(0, 10)),
        },
        mark: { mark: "cell" },
      },
    ]) {
      expect(exercise(spec, "UTC"), JSON.stringify(spec).slice(0, 80)).toBeLessThanOrEqual(
        mostDrawn(spec),
      );
    }
  });

  it("sets every documented field in some spec the property mutates", () => {
    const set = new Set([...FIELDS_AT.values()].flatMap((f) => [...f]));
    expect(FIELDS.filter((f) => !set.has(f))).toEqual([]);
  });

  it("draws each spec the property mutates, as written", () => {
    for (const spec of SPECS) {
      expect(() => exercise(spec, "UTC"), JSON.stringify(spec)).not.toThrow();
    }
  });

  // An optional field written undefined is left out, as exactOptionalPropertyTypes
  // cannot hold a JavaScript caller to.
  it("draws each spec with every field it leaves out written undefined", () => {
    for (const spec of SPECS) {
      const filled = mutate(
        spec,
        absent(spec).map((path) => [path, undefined] as const),
      );
      expect(() => exercise(filled, "UTC"), JSON.stringify(spec)).not.toThrow();
    }
  });

  // Each number a spec holds is where a size the chart derives from data
  // starts, a plot's rows or ticks, and its height sets the plot's own.
  it.each(SPECS.map((_, k) => k))(
    "draws spec %i within its bound whatever its numbers, or refuses one by name",
    (k) => {
      const spec = SPECS[k];
      const numbers = paths(spec).filter((path) => typeof at(spec, path) === "number");
      const size = fc
        .tuple(
          fc.constantFrom(1, 2.5, 4, 9),
          fc.integer({ min: -3, max: 16 }),
          fc.constantFrom(1, -1),
        )
        .map(([m, e, sign]) => sign * m * 10 ** e);
      const place = fc.oneof(
        { arbitrary: fc.constant<Path>(["height"]), weight: 1 },
        { arbitrary: fc.constantFrom(...numbers), weight: 3 },
      );
      const changes = fc.array(fc.tuple(place, size), { minLength: 1, maxLength: 3 });
      fc.assert(
        fc.property(changes, (list) => {
          const changed = mutate(spec, list);
          let drawn: number;
          try {
            drawn = exercise(changed, "UTC");
          } catch (e) {
            expect(refusedByName(e), String(e)).toBe(true);
            return;
          }
          expect(drawn, JSON.stringify(changed)).toBeLessThanOrEqual(mostDrawn(changed));
        }),
        EACH,
      );
    },
  );

  it("with fields dropped, mistyped or shared draws within its bound, or throws a TypeError or RangeError naming one", () => {
    const changed = fc.integer({ min: 0, max: SPECS.length - 1 }).chain((k) => {
      const wrong = fc.constantFrom(...WRONG);
      const left = absent(SPECS[k]);
      const spread = repeats(SPECS[k]);
      // A field left out is most often written undefined, which "in" reads as present.
      const change = fc.oneof(
        { arbitrary: fc.tuple(fc.constantFrom(...paths(SPECS[k])), wrong), weight: 3 },
        ...(spread.length === 0
          ? []
          : [
              {
                arbitrary: fc
                  .tuple(fc.constantFrom(...spread), fc.integer({ min: 4, max: 2_000 }))
                  .map(([[path, j], copies]) => share(SPECS[k], path, j, copies)),
                weight: 1,
              },
            ]),
        ...(left.length === 0
          ? []
          : [
              {
                arbitrary: fc.tuple(
                  fc.constantFrom(...left),
                  fc.oneof(fc.constant(undefined), wrong),
                ),
                weight: 2,
              },
            ]),
      );
      return fc.tuple(
        fc.constant(k),
        fc.array(change, {
          minLength: 1,
          maxLength: 3,
        }),
      );
    });
    const seen = { drawn: 0, refused: 0 };
    fc.assert(
      fc.property(changed, zone, ([k, changes], timeZone) => {
        const spec = mutate(SPECS[k], changes);
        const reads = changes.flatMap(([, value]) => {
          const read = READS.get(value as object);
          return read === undefined ? [] : [[value, read] as const];
        });
        reads.forEach(([, read]) => (read.n = 0));
        let drawn: number;
        try {
          drawn = exercise(spec, timeZone);
        } catch (e) {
          if (!refusedByName(e)) {
            throw e;
          }
          seen.refused++;
          return;
        } finally {
          // Each place a shared list sits is charged before it is read.
          for (const [value, read] of reads) {
            expect(read.n, fc.stringify(value)).toBeLessThanOrEqual(MAX_VALUES);
          }
        }
        seen.drawn++;
        expect(drawn, JSON.stringify(spec)).toBeLessThanOrEqual(mostDrawn(spec));
      }),
      RUNS,
    );
    // Both outcomes, or the mutations reach too few fields or too many.
    expect(seen.drawn).toBeGreaterThan(0);
    expect(seen.refused).toBeGreaterThan(0);
  });
});
