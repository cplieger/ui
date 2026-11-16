import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FrameType } from "./frame.js";
import { MAX_CALENDAR_DAYS, MAX_ROWS, MAX_VALUES } from "./limits.js";
import { door, readFrame } from "./read.js";

const FIXTURES = join(import.meta.dirname, "contract", "fixtures");

const TYPES: readonly FrameType[] = [
  "series",
  "bins",
  "categories",
  "boxes",
  "points",
  "grid",
  "calendar",
  "tree",
  "flow",
  "events",
  "states",
  "value",
];

const read = (v: unknown, types: readonly FrameType[] = TYPES): unknown =>
  readFrame(v, "data", door("test", MAX_VALUES), types);

async function fixtures(prefix: string): Promise<(readonly [string, unknown])[]> {
  const names = (await readdir(FIXTURES)).filter((f) => f.startsWith(prefix)).sort();
  return Promise.all(
    names.map(
      async (f) => [f, JSON.parse(await readFile(join(FIXTURES, f), "utf8")) as unknown] as const,
    ),
  );
}

const FRAMES = await fixtures("frame-");
const REFUSALS = await fixtures("refusal-");
const fixture = (name: string): Record<string, unknown> =>
  structuredClone(FRAMES.find(([f]) => f === `frame-${name}.json`)?.[1]) as Record<string, unknown>;

const escape = (s: string): string => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// The field an error names is its subject, before anything that would extend it.
const naming = (field: string): RegExp => new RegExp(`^test: ${escape(field)}(?![\\w.[])`, "u");

function refusal(f: () => unknown): Error {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error("read the frame");
}

// Every object and array `v` holds, itself included.
function containers(v: unknown, into = new Set<object>()): Set<object> {
  if (typeof v === "object" && v !== null) {
    into.add(v);
    for (const e of Object.values(v)) {
      containers(e, into);
    }
  }
  return into;
}

// `list` behind a proxy that counts the reads of its entries.
function counted<T>(list: T[]): { readonly list: T[]; readonly reads: () => number } {
  let n = 0;
  const proxy = new Proxy(list, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/u.test(key)) {
        n++;
      }
      return Reflect.get(target, key) as unknown;
    },
  });
  return { list: proxy, reads: () => n };
}

const range = (n: number, at = (i: number): unknown => i): unknown[] =>
  Array.from({ length: n }, (_, i) => at(i));

const keyed = (n: number, prefix: string): string[] =>
  range(n, (i) => `${prefix}${String(i)}`) as string[];

describe("readFrame", () => {
  it.each(FRAMES)("reads %s to an equal copy that shares nothing with it", (_, frame) => {
    const copy = read(frame);
    expect(copy).toStrictEqual(frame);
    const given = containers(frame);
    expect([...containers(copy)].filter((o) => given.has(o))).toEqual([]);
  });

  // chartdata's refusal fixtures name chartdata's own fields; this is what
  // the page names for each, with the error it throws.
  const NAMED: Readonly<Record<string, readonly [string, ErrorConstructor]>> = {
    "refusal-bin.json": ["data.x2[1]", RangeError],
    "refusal-duplicate.json": ["data.names[1]", RangeError],
    "refusal-empty.json": ["data.names[0]", RangeError],
    "refusal-finite.json": ["data.series[0].values[0]", RangeError],
    "refusal-length.json": ["data.series[0].values", TypeError],
    "refusal-limit.json": ["data.names", RangeError],
    "refusal-magnitude.json": ["data.series[0].values[0]", RangeError],
    "refusal-negative.json": ["data.parts[0].value", RangeError],
    "refusal-order.json": ["data.x[1]", RangeError],
    "refusal-shape.json": ["data.series[0]", TypeError],
  };

  it("names a field for every refusal fixture", () => {
    expect(REFUSALS.map(([f]) => f)).toEqual(Object.keys(NAMED).sort());
  });

  it.each(REFUSALS)("refuses %s by the field at fault", (name, given) => {
    const { frame } = given as { readonly frame: unknown };
    const [field, type] = NAMED[name] ?? ["", Error];
    const e = refusal(() => read(frame));
    expect(e).toBeInstanceOf(type);
    expect(e.message).toMatch(naming(field));
  });

  it("copies only the fields frame.ts names", () => {
    const frame = {
      ...fixture("categories"),
      marks: [],
      series: [{ key: "a", values: [1, 2, 3], y: [1] }],
    };
    expect(read(frame)).toStrictEqual({
      ...fixture("categories"),
      series: [{ key: "a", values: [1, 2, 3] }],
    });
  });

  it("reads a NaN as a gap", () => {
    const frame = fixture("series");
    frame["series"] = [{ key: "p50", values: [Number.NaN, 1, null] }];
    expect(read(frame)).toStrictEqual(frame);
  });

  it("reads a tree part and a flow link with no value as no data", () => {
    const tree = { type: "tree", name: "t", unit: "count", parts: [{ key: "a" }] };
    expect(read(tree)).toStrictEqual(tree);
    const flow = { type: "flow", name: "f", unit: "count", links: [{ from: "a", to: "b" }] };
    expect(read(flow)).toStrictEqual(flow);
  });

  it("reads a tree with neither parts nor groups as an empty whole", () => {
    const tree = { type: "tree", name: "t", unit: "count" };
    expect(read(tree)).toStrictEqual(tree);
  });

  // chartdata's encoding of a sized points group with no points: its empty
  // r is dropped by omitempty while x and y stay.
  it("reads a sized points group with no names and no r as no sizes", () => {
    const empty = { key: "asia", names: [], x: [], y: [] };
    const frame = fixture("points");
    const series = frame["series"] as unknown[];
    expect(read({ ...frame, series: [...series, empty] })).toStrictEqual({
      ...frame,
      series: [...series, { ...empty, r: [] }],
    });
  });

  it("refuses a frame of a type the caller does not draw, by its type", () => {
    const e = refusal(() => read(fixture("flow"), ["series", "bins"]));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toBe('test: data.type must be "series" or "bins", not "flow"');
  });

  type Change = (f: Record<string, unknown>) => void;
  const set =
    (path: readonly (string | number)[], v: unknown): Change =>
    (f) => {
      let o = f as Record<string | number, unknown>;
      for (const k of path.slice(0, -1)) {
        o = o[k] as Record<string | number, unknown>;
      }
      o[path.at(-1) ?? ""] = v;
    };
  const drop =
    (...path: readonly (string | number)[]): Change =>
    (f) => {
      let o = f as Record<string | number, unknown>;
      for (const k of path.slice(0, -1)) {
        o = o[k] as Record<string | number, unknown>;
      }
      Reflect.deleteProperty(o, path.at(-1) ?? "");
    };

  it("refuses a frame that is no object", () => {
    for (const frame of [1, null, [], "series"]) {
      const e = refusal(() => read(frame));
      expect(e).toBeInstanceOf(TypeError);
      expect(e.message).toMatch(naming("data"));
    }
  });

  // Each rule frame.ts and chartdata's constructors state, broken once.
  const RULES: readonly (readonly [string, string, Change, string, ErrorConstructor])[] = [
    ["an unknown type", "series", set(["type"], "pie"), "data.type", TypeError],
    ["a name that is no string", "series", set(["name"], 1), "data.name", TypeError],
    ["a unit that is no string", "series", drop("unit"), "data.unit", TypeError],
    ["a missing x", "series", drop("x"), "data.x", TypeError],
    ["an x that is no number", "series", set(["x", 1], "1"), "data.x[1]", TypeError],
    ["an x that is NaN", "series", set(["x", 0], Number.NaN), "data.x[0]", RangeError],
    ["an x past the magnitude", "series", set(["x", 2], 1e301), "data.x[2]", RangeError],
    ["an x that repeats", "series", set(["x", 1], 1772323200000), "data.x[1]", RangeError],
    [
      "a value that is no number",
      "series",
      set(["series", 0, "values", 1], "1"),
      "data.series[0].values[1]",
      TypeError,
    ],
    [
      "a value of -Infinity",
      "series",
      set(["series", 1, "values", 0], Number.NEGATIVE_INFINITY),
      "data.series[1].values[0]",
      RangeError,
    ],
    ["a series that is no object", "series", set(["series", 1], 1), "data.series[1]", TypeError],
    [
      "a series key that is no string",
      "series",
      set(["series", 0, "key"], 1),
      "data.series[0].key",
      TypeError,
    ],
    [
      "a series key given twice",
      "series",
      set(["series", 1, "key"], "p50"),
      "data.series[1].key",
      RangeError,
    ],
    ["a domain of one number", "series", set(["domain"], [1]), "data.domain", TypeError],
    ["a domain of three numbers", "series", set(["domain"], [1, 2, 3]), "data.domain", TypeError],
    ["a domain from high to low", "series", set(["domain"], [5, 1]), "data.domain", RangeError],
    [
      "a domain end that is infinite",
      "series",
      set(["domain", 1], Number.POSITIVE_INFINITY),
      "data.domain[1]",
      RangeError,
    ],
    ["resets that repeat", "series", set(["resets"], [1, 1]), "data.resets[1]", RangeError],
    ["an open that is no boolean", "series", set(["open"], 1), "data.open", TypeError],
    [
      "a ref value that is infinite",
      "series",
      set(["refs", 0, "value"], Number.POSITIVE_INFINITY),
      "data.refs[0].value",
      RangeError,
    ],
    [
      "a ref key that is no string",
      "series",
      set(["refs", 0, "key"], null),
      "data.refs[0].key",
      TypeError,
    ],
    [
      "a note at NaN",
      "series",
      set(["notes", 0, "at"], Number.NaN),
      "data.notes[0].at",
      RangeError,
    ],
    ["notes that are no array", "series", set(["notes"], {}), "data.notes", TypeError],
    ["an axis neither time nor value", "bins", set(["axis"], "log"), "data.axis", TypeError],
    ["an x2 that decreases", "bins", set(["x2"], [1, 0.5, 5]), "data.x2[1]", RangeError],
    ["an x2 shorter than x1", "bins", set(["x2"], [1, 2]), "data.x2", TypeError],
    [
      "more series than rows",
      "categories",
      set(
        ["series"],
        range(MAX_ROWS + 1, (i) => ({ key: String(i), values: [1, 2, 3] })),
      ),
      "data.series",
      RangeError,
    ],
    [
      "boxes past the sub-rows",
      "boxes",
      (f) => {
        f["names"] = keyed(50, "n");
        const none = range(50, () => null);
        f["series"] = range(51, (i) => ({
          key: String(i),
          low: none,
          q1: none,
          median: none,
          q3: none,
          high: none,
        }));
      },
      "data.series",
      RangeError,
    ],
    [
      "a box out of order",
      "boxes",
      set(["series", 0, "q1", 0], 0.05),
      "data.series[0]",
      RangeError,
    ],
    [
      "an outlier inside the whiskers",
      "boxes",
      set(["series", 0, "outliers", 0, 0], 0.5),
      "data.series[0].outliers[0][0]",
      RangeError,
    ],
    [
      "an outlier that is infinite",
      "boxes",
      set(["series", 0, "outliers", 0, 0], Number.POSITIVE_INFINITY),
      "data.series[0].outliers[0][0]",
      RangeError,
    ],
    [
      "an outlier beside no box",
      "boxes",
      set(["series", 0, "outliers", 1], [3]),
      "data.series[0]",
      TypeError,
    ],
    [
      "outliers short of a list per name",
      "boxes",
      set(["series", 0, "outliers"], [[]]),
      "data.series[0].outliers",
      TypeError,
    ],
    [
      "a point name given twice across groups",
      "points",
      set(["series", 1], { key: "b", names: ["a"], x: [1], y: [1], r: [1] }),
      "data.series[1].names[0]",
      RangeError,
    ],
    [
      "a point name that is empty",
      "points",
      set(["series", 0, "names", 1], ""),
      "data.series[0].names[1]",
      RangeError,
    ],
    [
      "a group with no r beside units.r",
      "points",
      drop("series", 0, "r"),
      "data.series[0].r",
      TypeError,
    ],
    [
      "a group's r with no units.r",
      "points",
      set(["units"], { x: "bytes", y: "seconds" }),
      "data.series[0].r",
      TypeError,
    ],
    ["a negative r", "points", set(["series", 0, "r", 1], -1), "data.series[0].r[1]", RangeError],
    ["units that are no object", "points", set(["units"], "seconds"), "data.units", TypeError],
    ["a unit of x that is no string", "points", set(["units", "x"], 1), "data.units.x", TypeError],
    ["a grid axis of names and edges", "grid", set(["x", "names"], ["a"]), "data.x", TypeError],
    ["a grid axis of neither", "grid", set(["y"], {}), "data.y", TypeError],
    ["a grid axis of one edge", "grid", set(["x"], { edges: [0] }), "data.x.edges", RangeError],
    ["grid edges that repeat", "grid", set(["x", "edges", 2], 6), "data.x.edges[2]", RangeError],
    [
      "a grid y past the rows",
      "grid",
      (f) => {
        f["y"] = { names: keyed(MAX_ROWS + 1, "y") };
        f["values"] = range(MAX_ROWS + 1, () => [1, 1, 1, 1]);
      },
      "data.y.names",
      RangeError,
    ],
    [
      "grid values short of a row per y",
      "grid",
      set(["values"], [[1, 2, 3, 4]]),
      "data.values",
      TypeError,
    ],
    [
      "a grid row short of a value per x",
      "grid",
      set(["values", 1], [1, 2, 3]),
      "data.values[1]",
      TypeError,
    ],
    [
      "a zone no browser knows",
      "calendar",
      set(["zone"], "Mars/Olympus_Mons"),
      "data.zone",
      RangeError,
    ],
    ["a zone that is no string", "calendar", set(["zone"], 0), "data.zone", TypeError],
    [
      "a start that is no midnight",
      "calendar",
      set(["start"], 1772323200000 + 3_600_000),
      "data.start",
      RangeError,
    ],
    ["a start past what Date holds", "calendar", set(["start"], 9e15), "data.start", RangeError],
    [
      "more days than a calendar holds",
      "calendar",
      set(
        ["values"],
        range(MAX_CALENDAR_DAYS + 1, () => 1),
      ),
      "data.values",
      RangeError,
    ],
    [
      "a tree of parts and groups",
      "tree-groups",
      set(["parts"], [{ key: "a", value: 1 }]),
      "data.groups",
      TypeError,
    ],
    [
      "a group with no part",
      "tree-groups",
      set(["groups", 1, "children"], []),
      "data.groups[1].children",
      RangeError,
    ],
    [
      "a group key given twice",
      "tree-groups",
      set(["groups", 1, "key"], "media"),
      "data.groups[1].key",
      RangeError,
    ],
    [
      "a part key given twice in its group",
      "tree-groups",
      set(["groups", 0, "children", 1, "key"], "films"),
      "data.groups[0].children[1].key",
      RangeError,
    ],
    [
      "a part key that is empty",
      "tree",
      set(["parts", 0, "key"], ""),
      "data.parts[0].key",
      RangeError,
    ],
    [
      "a part value that is no number",
      "tree",
      set(["parts", 0, "value"], "1"),
      "data.parts[0].value",
      TypeError,
    ],
    [
      "a link with an empty end",
      "flow",
      set(["links", 0, "from"], ""),
      "data.links[0].from",
      RangeError,
    ],
    [
      "a link from a node to itself",
      "flow",
      set(["links", 0, "to"], "coal"),
      "data.links[0]",
      RangeError,
    ],
    [
      "links in a loop",
      "flow",
      set(["links", 2], { value: 1, from: "power", to: "coal" }),
      "data.links",
      RangeError,
    ],
    [
      "a link joining two nodes again",
      "flow",
      set(["links", 1], { value: 1, from: "coal", to: "power" }),
      "data.links[1]",
      RangeError,
    ],
    ["a negative link", "flow", set(["links", 0, "value"], -1), "data.links[0].value", RangeError],
    [
      "a stage with no stages",
      "flow",
      set(["links", 0, "stage"], "2019"),
      "data.links[0].stage",
      TypeError,
    ],
    [
      "a link naming a node nodes lacks",
      "flow-stages",
      set(["links", 0, "to"], "green"),
      "data.links[0].to",
      RangeError,
    ],
    [
      "a node no link names",
      "flow-stages",
      set(["nodes", 2], { key: "green" }),
      "data.nodes[2]",
      RangeError,
    ],
    [
      "a node key given twice",
      "flow-stages",
      set(["nodes", 1, "key"], "blue"),
      "data.nodes[1].key",
      RangeError,
    ],
    ["one stage", "flow-stages", set(["stages"], ["2019"]), "data.stages", RangeError],
    [
      "a stage name given twice",
      "flow-stages",
      set(["stages", 1], "2019"),
      "data.stages[1]",
      RangeError,
    ],
    [
      "a link leaving the last stage",
      "flow-stages",
      set(["links", 0, "stage"], "2024"),
      "data.links[0].stage",
      RangeError,
    ],
    [
      "a link leaving a stage stages lacks",
      "flow-stages",
      set(["links", 0, "stage"], "2030"),
      "data.links[0].stage",
      RangeError,
    ],
    [
      "a link with no stage among three",
      "flow-stages",
      set(["stages"], ["2019", "2024", "2029"]),
      "data.links[0].stage",
      RangeError,
    ],
    [
      "an instant that goes back",
      "events",
      set(["rows", 0, "at", 1], 1772323100000),
      "data.rows[0].at[1]",
      RangeError,
    ],
    [
      "a row key given twice",
      "events",
      set(["rows", 1, "key"], "web"),
      "data.rows[1].key",
      RangeError,
    ],
    [
      "more rows than a strip holds",
      "events",
      set(
        ["rows"],
        range(MAX_ROWS + 1, (i) => ({ key: String(i), at: [] })),
      ),
      "data.rows",
      RangeError,
    ],
    [
      "observations at one instant",
      "states",
      set(["at", 1], 1772323200000),
      "data.at[1]",
      RangeError,
    ],
    ["fewer instants than keys", "states", set(["at"], [1, 2]), "data.at", TypeError],
    ["a state key that is no string", "states", set(["keys", 0], 1), "data.keys[0]", TypeError],
    [
      "a meter from its max down to its min",
      "value",
      set(["meters", 1, "min"], 1),
      "data.meters[1]",
      RangeError,
    ],
    [
      "a meter value outside its range",
      "value",
      set(["meters", 1, "value"], 2),
      "data.meters[1].value",
      RangeError,
    ],
    [
      "a meter low above its high",
      "value",
      set(["meters", 0, "low"], 0.95),
      "data.meters[0]",
      RangeError,
    ],
    [
      "a meter optimum that is no number",
      "value",
      set(["meters", 0, "optimum"], "1"),
      "data.meters[0].optimum",
      TypeError,
    ],
    [
      "a meter key given twice",
      "value",
      set(["meters", 1, "key"], "en"),
      "data.meters[1].key",
      RangeError,
    ],
  ];

  it.each(RULES)("refuses %s by its field", (_, name, change, field, type) => {
    const frame = fixture(name);
    change(frame);
    const e = refusal(() => read(frame));
    expect(e).toBeInstanceOf(type);
    expect(e.message).toMatch(naming(field));
  });

  it("reads a calendar from a zone's own midnight", () => {
    const frame = {
      ...fixture("calendar"),
      zone: "America/New_York",
      start: Date.UTC(2026, 2, 1, 5),
    };
    expect(read(frame)).toStrictEqual(frame);
  });
});

describe("readFrame at the values ceiling", () => {
  const ref = (i: number): unknown => ({ key: String(i), value: i });
  const series = (n: number, values: unknown[]): unknown[] =>
    range(n, (i) => ({ key: String(i), values }));
  const head = (type: string): Record<string, unknown> => ({ type, name: "n", unit: "count" });

  // A door's ceiling is its own, so each frame type's count is tested under
  // one cheap enough to fill; the chart's MAX_VALUES is tested below.
  const MOST = 10_000;
  const under = (v: unknown): unknown => readFrame(v, "data", door("test", MOST), TYPES);

  // Each frame type at the ceiling, and the list that takes it one past.
  const CASES: readonly (readonly [
    string,
    (past: <T>(list: T[]) => T[]) => Record<string, unknown>,
    string,
  ])[] = [
    [
      "series",
      (past) => ({ ...head("series"), x: range(100), series: past(series(100, range(100))) }),
      "data.series",
    ],
    [
      "bins",
      (past) => ({
        ...head("bins"),
        axis: "time",
        x1: range(100),
        x2: range(100, (i) => i + 1),
        series: past(series(100, range(100))),
      }),
      "data.series",
    ],
    [
      "categories",
      (past) => ({
        ...head("categories"),
        names: keyed(100, "n"),
        series: series(100, range(100)),
        refs: past([]),
      }),
      "data.refs",
    ],
    [
      "boxes",
      (past) => ({
        ...head("boxes"),
        names: ["a"],
        series: [
          {
            key: "a",
            low: [1],
            q1: [2],
            median: [3],
            q3: [4],
            high: [5],
            outliers: [past(range(MOST - 1, () => 6))],
          },
        ],
      }),
      "data.series[0].outliers[0]",
    ],
    [
      "points",
      (past) => ({
        ...head("points"),
        units: { x: "count", y: "count" },
        series: [
          { key: "a", names: keyed(MOST / 2, "a"), x: range(MOST / 2), y: range(MOST / 2) },
          { key: "b", names: past(keyed(MOST / 2, "b")), x: range(MOST / 2), y: range(MOST / 2) },
        ],
      }),
      "data.series[1].names",
    ],
    [
      "grid",
      (past) => ({
        ...head("grid"),
        x: { names: keyed(100, "x") },
        y: { names: keyed(100, "y") },
        values: range(100, () => range(100)),
        notes: past([]),
      }),
      "data.notes",
    ],
    [
      "calendar",
      (past) => ({
        ...head("calendar"),
        zone: "UTC",
        start: 0,
        values: range(MAX_CALENDAR_DAYS),
        refs: past(range(MOST - MAX_CALENDAR_DAYS, ref)),
      }),
      "data.refs",
    ],
    [
      "tree",
      (past) => ({
        ...head("tree"),
        groups: [
          { key: "g", children: past(range(MOST - 1, (i) => ({ key: String(i), value: 1 }))) },
        ],
      }),
      "data.groups[0].children",
    ],
    [
      "flow",
      (past) => ({
        ...head("flow"),
        links: [{ from: "a", to: "b", value: 1 }],
        refs: past(range(MOST - 1, ref)),
      }),
      "data.refs",
    ],
    [
      "events",
      (past) => ({
        type: "events",
        name: "n",
        rows: range(100, (i) => ({ key: String(i), at: i === 99 ? past(range(100)) : range(100) })),
      }),
      "data.rows[99].at",
    ],
    [
      "states",
      (past) => ({
        type: "states",
        name: "n",
        keys: ["up"],
        at: [0],
        refs: past(range(MOST - 1, ref)),
      }),
      "data.refs",
    ],
    [
      "value",
      (past) => ({
        ...head("value"),
        meters: [{ key: "a", value: 1, min: 0, max: 2 }],
        refs: past(range(MOST - 1, ref)),
      }),
      "data.refs",
    ],
  ];

  // `list` with one entry more, behind a proxy counting the reads of its entries.
  function oneMore(): { readonly past: <T>(list: T[]) => T[]; readonly reads: () => number } {
    let reads = (): number => -1;
    const past = <T>(list: T[]): T[] => {
      const more = [...list, list[0] ?? (ref(0) as T)];
      const proxy = counted(more);
      reads = proxy.reads;
      return proxy.list;
    };
    return { past, reads: () => reads() };
  }

  it.each(CASES)("reads a %s frame of the most values", (_, build) => {
    expect(() => under(build((list) => list))).not.toThrow();
  });

  it.each(CASES)(
    "refuses a %s frame one value past, before reading the list that passes",
    (_, build, field) => {
      const { past, reads } = oneMore();
      const e = refusal(() => under(build(past)));
      expect(e).toBeInstanceOf(RangeError);
      expect(e.message).toMatch(naming(field));
      expect(reads()).toBe(0);
    },
  );

  it("reads a series frame of MAX_VALUES values and refuses one more series", () => {
    const frame = (past: <T>(list: T[]) => T[]): unknown => ({
      ...head("series"),
      x: range(1_000),
      series: past(series(MAX_VALUES / 1_000, range(1_000))),
    });
    expect(() => read(frame((list) => list))).not.toThrow();
    const { past, reads } = oneMore();
    const e = refusal(() => read(frame(past)));
    expect(e.message).toMatch(naming("data.series"));
    expect(reads()).toBe(0);
  });
});
