import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type ChartSpec } from "./chart.js";

const H = 3_600_000;
const DAY = 24 * H;
const T = Date.UTC(2026, 10, 2);
const UNIT = { one: "post", other: "posts" };
const MS = { style: "unit", unit: "millisecond", maximumFractionDigits: 0 };
const SCALE = { label: "Load", unit: UNIT, format: "number", zero: true };

// One spec per mark and arrangement, together setting every field the
// chart's spec documents, so a dropped or mistyped field reaches each one.
const SPECS: readonly Record<string, unknown>[] = [
  {
    x: { type: "time", domain: [T, T + 4 * H], reverse: true, format: "number" },
    y: { ...SCALE, domain: [0, 20] },
    height: 160,
    summary: (generated: string) => `${generated} Busy.`,
    empty: "No posts",
    marks: [
      {
        mark: "rect",
        x1: [T, T + H, T + 2 * H],
        x2: [T + H, T + 2 * H, T + 3 * H],
        open: true,
        arrange: "stack",
        shape: "area",
        series: [
          { name: "Posts", slot: 1, y: [3, null, 5] },
          { name: "Replies", y: [1, 2, Number.NaN] },
        ],
      },
      { mark: "rule", y: 4, label: "Goal" },
      { mark: "text", x: T + H, y: 5, text: "Peak", side: "right" },
    ],
  },
  {
    marks: [
      {
        mark: "rect",
        x1: [0, 10],
        x2: [10, 20],
        arrange: "group",
        series: [
          { name: "a", y: [1, 2] },
          { name: "b", y: [2, 1] },
        ],
      },
    ],
  },
  {
    x: { type: "time" },
    y: { zero: false, label: "Memory", format: MS },
    summary: "Memory over the day.",
    marks: [
      {
        mark: "line",
        x: [T, T + H, T + 2 * H],
        curve: "step",
        series: [{ name: "Heap", slot: 3, y: [10, 12, null] }],
      },
      { mark: "text", x: T, y: 10, text: "Start" },
    ],
  },
  {
    y: { format: "percent" },
    marks: [
      {
        mark: "area",
        x: [0, 1, 2],
        curve: "linear",
        arrange: "share",
        series: [
          { name: "a", y: [1, 2, 3] },
          { name: "b", slot: 2, y: [3, 2, 1] },
        ],
      },
    ],
  },
  {
    x: { type: "time", label: "Time" },
    marks: [
      {
        mark: "dot",
        slot: 4,
        unit: UNIT,
        rows: [
          { name: "Ada", x: [T, T + H, T + H] },
          { name: "Bea", x: [] },
        ],
      },
      { mark: "rule", x: T + H, label: "Deploy" },
      { mark: "text", x: T, y: "Ada", text: "First" },
    ],
  },
  {
    x: { label: "Posts", unit: UNIT, format: "integer" },
    y: { mono: true, label: "Agents" },
    marks: [
      {
        mark: "bar",
        y: ["one", "two"],
        labels: true,
        series: [{ name: "Posts", slot: 2, below: 5, x: [4, -2] }],
      },
      { mark: "rule", x: 1, label: "Mean" },
    ],
  },
  {
    marks: [
      {
        mark: "bar",
        y: ["s1", "s2"],
        arrange: "diverge",
        left: 1,
        centre: true,
        series: [
          { name: "No", x: [1, 2] },
          { name: "Neutral", x: [1, 1] },
          { name: "Yes", x: [3, 2] },
        ],
      },
    ],
  },
  {
    marks: [
      {
        mark: "bar",
        y: ["0-9", "10-19"],
        arrange: "mirror",
        series: [
          { name: "Men", x: [4, 5] },
          { name: "Women", x: [5, 4] },
        ],
      },
      { mark: "text", y: "0-9", text: "Young" },
    ],
  },
  {
    x: { type: "log", label: "Pay" },
    marks: [
      {
        mark: "point",
        y: ["BA", "MA"],
        link: "arrow",
        series: [
          { name: "2000", x: [10, 20] },
          { name: "2020", slot: 6, x: [30, null] },
        ],
      },
    ],
  },
  {
    y: { label: "Years", domain: [60, 90] },
    height: 200,
    marks: [
      {
        mark: "slope",
        x: ["1990", "2020"],
        series: [
          { name: "Japan", slot: 1, y: [79, 84] },
          { name: "Chad", y: [null, 53] },
        ],
      },
      { mark: "rule", y: 70, label: "World" },
      { mark: "text", x: "2020", y: 84, text: "Top" },
    ],
  },
  {
    x: { type: "log", label: "GDP", format: "integer", domain: [100, 1e5] },
    y: { label: "Life", zero: true },
    r: { type: "linear", label: "People", domain: [0, 1e9], format: "integer" },
    marks: [
      {
        mark: "scatter",
        unit: { one: "country", other: "countries" },
        series: [
          {
            name: "Europe",
            slot: 1,
            names: ["FR", "DE"],
            x: [4e4, 5e4],
            y: [82, 81],
            r: [6e7, 8e7],
          },
          { name: "Asia", names: ["JP"], x: [3e4], y: [84], r: [0] },
        ],
      },
      { mark: "text", x: 4e4, y: 82, text: "France", side: "below" },
    ],
  },
  {
    colour: {
      type: "diverging",
      steps: 6,
      domain: [-10, 10],
      pivot: 0,
      reverse: true,
      label: "Change",
      unit: UNIT,
      format: "number",
    },
    marks: [
      {
        mark: "cell",
        x: ["Mon", "Tue"],
        y: ["AM", "PM"],
        values: [
          [1, -2],
          [null, 4],
        ],
      },
      { mark: "text", x: "Mon", y: "AM", text: "Low" },
    ],
  },
  {
    x: { type: "log", label: "Size" },
    y: { label: "Time", format: MS },
    colour: { thresholds: [1, 5], label: "Requests" },
    marks: [
      {
        mark: "cell",
        x: { edges: [1, 10, 100] },
        y: { edges: [0, 100, 200] },
        values: [
          [1, 2],
          [3, null],
        ],
      },
    ],
  },
  {
    colour: { steps: 4, label: "Posts", unit: UNIT },
    marks: [
      {
        mark: "cell",
        days: { start: T, values: [1, null, 3, 0, 5, 2, 8, 4, 1], open: true },
        weekStart: 1,
      },
      { mark: "text", x: T + DAY, text: "Tuesday" },
    ],
  },
  {
    x: { type: "linear", label: "Latency", format: MS, zero: true, domain: [0, 1000] },
    marks: [
      {
        mark: "box",
        y: ["/api", "/login"],
        whiskers: "1.5 × IQR",
        series: [
          {
            name: "Before",
            slot: 1,
            low: [10, null],
            q1: [20, null],
            median: [30, null],
            q3: [40, null],
            high: [50, null],
            outliers: [[90], []],
          },
          { name: "After", low: [5, 1], q1: [6, 2], median: [7, 3], q3: [8, 4], high: [9, 5] },
        ],
      },
      { mark: "rule", x: 25, label: "Target" },
    ],
  },
  {
    summary: "Land use.",
    marks: [
      {
        mark: "pie",
        hole: true,
        unit: { one: "km²", other: "km²" },
        format: "integer",
        slices: [
          { name: "Forest", slot: 4, value: 30 },
          { name: "Farm", value: 50 },
          { name: "Water", value: null },
          { name: "Ice", value: 0 },
        ],
      },
    ],
  },
  {
    marks: [
      {
        mark: "tree",
        slot: 2,
        unit: UNIT,
        format: "number",
        nodes: [
          { name: "a", value: 5, slot: 3 },
          { name: "b", value: 3 },
          { name: "c", value: null },
        ],
      },
    ],
  },
  {
    marks: [
      {
        mark: "tree",
        format: MS,
        nodes: [
          {
            name: "Europe",
            slot: 1,
            children: [
              { name: "FR", value: 3 },
              { name: "Other", value: 1 },
            ],
          },
          { name: "Asia", children: [{ name: "Other", value: 4 }] },
        ],
      },
    ],
  },
];

type Path = readonly (string | number)[];

// Every field name the spec documents, for a field a spec leaves out.
const FIELDS = [
  ..."arrange below centre children colour curve days domain edges empty format height high".split(
    " ",
  ),
  ..."hole label labels left link low mark marks median mono name names nodes open outliers".split(
    " ",
  ),
  ..."pivot q1 q3 r reverse rows series shape side slices slot start steps summary text".split(" "),
  ..."thresholds type unit value values weekStart whiskers x x1 x2 y zero".split(" "),
];

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

// Where an object sits, by its mark's kind and its path past the index.
function shape(spec: unknown, path: Path): string {
  const kind = path[0] === "marks" ? String(at(spec, ["marks", path[1] ?? 0, "mark"])) : "";
  const rest = path[0] === "marks" ? path.slice(2) : path;
  return `${kind}:${rest.map((k) => (typeof k === "number" ? "#" : k)).join(".")}`;
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

function clone(v: unknown): unknown {
  if (typeof v !== "object" || v === null) {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map(clone);
  }
  return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, clone(e)]));
}

const DROP = Symbol("drop");

// Values a mistyped field might hold, near and far from what each expects.
const WRONG: readonly unknown[] = [
  DROP,
  undefined,
  null,
  0,
  -1,
  1.5,
  10,
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
  {},
  { other: 1 },
  { edges: [1] },
  () => "x",
];

// `spec` with each of `changes` applied: the field at a path dropped or set.
function mutate(spec: unknown, changes: readonly (readonly [Path, unknown])[]): unknown {
  const out = clone(spec);
  for (const [path, value] of changes) {
    let parent = out as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      const next = parent[key];
      if (typeof next !== "object" || next === null) {
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

// Draws `spec`, reads it key by key, shows its table and updates a second
// chart to it, so every part that reads the spec runs.
function exercise(spec: unknown, timeZone: string): void {
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
    const later = renderChart(two as HTMLElement, SPECS[0] as unknown as ChartSpec, {
      signal: life.signal,
      timeZone,
    });
    later.update(spec as ChartSpec);
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
const FIELD = new RegExp(`\\b(?:${FIELDS.join("|")})\\b`, "u");

function refusedByName(e: unknown): boolean {
  if (!(e instanceof TypeError || e instanceof RangeError) || !e.message.startsWith(PREFIX)) {
    return false;
  }
  return FIELD.test(e.message.slice(PREFIX.length).split(VERB)[0] ?? "");
}

// A run draws two whole figures, so fewer than the shared thousand fit its time limit.
const RUNS = { numRuns: 200 };

const zone = fc.constantFrom("UTC", "America/New_York", "Asia/Kolkata");

describe("a chart spec", () => {
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

  it("with fields dropped or mistyped draws, or throws a TypeError or RangeError naming one", () => {
    const changed = fc.integer({ min: 0, max: SPECS.length - 1 }).chain((k) => {
      const wrong = fc.constantFrom(...WRONG);
      const left = absent(SPECS[k]);
      // A field left out is most often written undefined, which "in" reads as present.
      const change = fc.oneof(
        { arbitrary: fc.tuple(fc.constantFrom(...paths(SPECS[k])), wrong), weight: 3 },
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
        try {
          exercise(spec, timeZone);
          seen.drawn++;
        } catch (e) {
          if (!refusedByName(e)) {
            throw e;
          }
          seen.refused++;
        }
      }),
      RUNS,
    );
    // Both outcomes, or the mutations reach too few fields or too many.
    expect(seen.drawn).toBeGreaterThan(0);
    expect(seen.refused).toBeGreaterThan(0);
  });
});
