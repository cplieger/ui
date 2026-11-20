import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { applyEvent } from "./apply.js";
import type { BinsFrame, Frame, FrameType, SeriesFrame } from "./frame.js";
import { MAX_VALUES } from "./limits.js";

const FIXTURES = join(import.meta.dirname, "contract", "fixtures");

async function fixtures(prefix: string): Promise<(readonly [string, unknown])[]> {
  const names = (await readdir(FIXTURES)).filter((f) => f.startsWith(prefix)).sort();
  return Promise.all(
    names.map(
      async (f) => [f, JSON.parse(await readFile(join(FIXTURES, f), "utf8")) as unknown] as const,
    ),
  );
}

const EVENTS = await fixtures("event-");
const FRAMES = await fixtures("frame-");
const REFUSALS = await fixtures("refusal-");

const copy = <T>(v: T): T => structuredClone(v);
const frame = (name: string): Frame =>
  copy(FRAMES.find(([f]) => f === `frame-${name}.json`)?.[1]) as Frame;
const event = (name: string): Record<string, unknown> =>
  copy(EVENTS.find(([f]) => f === `event-${name}.json`)?.[1]) as Record<string, unknown>;

const escape = (s: string): string => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// The field an error names is its subject, before anything that would extend it.
const naming = (field: string): RegExp =>
  new RegExp(`^applyEvent: ${escape(field)}(?![\\w.[])`, "u");

function refusal(f: () => unknown): Error {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error("applied the event");
}

// frame-series.json: three columns a minute apart in a three-minute domain,
// two series, a reset at its first column, still filling its last.
const SERIES = {
  type: "series",
  name: "wait_seconds",
  unit: "seconds",
  refs: [{ key: "target", value: 0.5 }],
  notes: [{ key: "deploy", at: 1772323260000 }],
} satisfies Partial<SeriesFrame>;

// frame-bins.json: three bins on a value axis from 0 to 5, one series.
const BINS = {
  type: "bins",
  name: "wait_seconds",
  unit: "seconds",
  axis: "value",
} satisfies Partial<BinsFrame>;

// What chartdata's events page says each fixture event makes of the frame
// it changes: the frame named, then the frame expected.
const APPLIED: Readonly<Record<string, readonly [string, unknown]>> = {
  "event-append-bin.json": [
    "bins",
    // The bins span 0 to 5 with no domain, so the extent slides to end at
    // the new bin's end, past every old bin, and is the domain from then on.
    {
      ...BINS,
      x1: [1772323200000],
      x2: [1772409600000],
      series: [{ key: "wait_seconds", values: [4] }],
      domain: [1772409599995, 1772409600000],
    },
  ],
  "event-append-column.json": [
    "series",
    // The domain keeps its 180,000 ms span and slides to end at the new
    // column, which no column lies before and which is complete.
    {
      ...SERIES,
      x: [1772323200000, 1772323260000, 1772323320000, 1772323380000],
      series: [
        { key: "p50", values: [0.1, null, 0.2, 0.7] },
        { key: "p95", values: [0.4, null, 0.9, null] },
      ],
      domain: [1772323200000, 1772323380000],
      resets: [1772323200000],
    },
  ],
  "event-replace-bin.json": [
    "bins",
    {
      ...BINS,
      x1: [0, 1, 1772323200000],
      x2: [1, 2, 1772380000000],
      series: [{ key: "wait_seconds", values: [12, 4, 5] }],
      open: true,
    },
  ],
  "event-replace-column.json": [
    "series",
    {
      ...SERIES,
      x: [1772323200000, 1772323260000, 1772323320000],
      series: [
        { key: "p50", values: [0.1, null, 0.8] },
        { key: "p95", values: [0.4, null, 0.1] },
      ],
      domain: [1772323140000, 1772323320000],
      resets: [1772323200000],
      open: true,
    },
  ],
  "event-reset.json": [
    "bins",
    {
      ...BINS,
      x1: [0, 1, 2],
      x2: [1, 2, 5],
      series: [{ key: "wait_seconds", values: [12, 4, 1] }],
      resets: [1772323200000],
    },
  ],
  "event-set.json": [
    "categories",
    {
      type: "categories",
      name: "runs",
      unit: "count",
      names: ["ok", "failed"],
      series: [{ key: "runs", values: [30, 2] }],
    },
  ],
};

describe("applyEvent", () => {
  it("names a frame and its result for every event fixture", () => {
    expect(EVENTS.map(([f]) => f)).toEqual(Object.keys(APPLIED).sort());
  });

  it.each(EVENTS)("applies %s as chartdata's events page says", (name, given) => {
    const [type, expected] = APPLIED[name] ?? ["", undefined];
    const before = frame(type);
    const kept = copy(before);
    expect(applyEvent(before, given)).toStrictEqual(expected);
    expect(before).toStrictEqual(kept);
  });

  it("replaces the column an append added", () => {
    const appended = applyEvent(frame("series"), event("append-column"));
    expect(applyEvent(appended, event("replace-column"))).toStrictEqual({
      ...SERIES,
      x: [1772323200000, 1772323260000, 1772323320000, 1772323380000],
      series: [
        { key: "p50", values: [0.1, null, 0.2, 0.8] },
        { key: "p95", values: [0.4, null, 0.9, 0.1] },
      ],
      domain: [1772323200000, 1772323380000],
      resets: [1772323200000],
      open: true,
    });
  });

  it("replaces the bin an append added, its end moved", () => {
    const appended = applyEvent(frame("bins"), event("append-bin"));
    expect(applyEvent(appended, event("replace-bin"))).toStrictEqual({
      ...BINS,
      x1: [1772323200000],
      x2: [1772380000000],
      series: [{ key: "wait_seconds", values: [5] }],
      domain: [1772409599995, 1772409600000],
      open: true,
    });
  });

  it("drops the columns and resets an append slides out of the domain", () => {
    const at = { ...SERIES, x: [0, 60, 120], domain: [0, 120], resets: [0, 60] };
    const given = {
      ...at,
      series: [
        { key: "p50", values: [1, 2, 3] },
        { key: "p95", values: [4, 5, 6] },
      ],
    } as Frame;
    expect(applyEvent(given, { kind: "append", key: "k", x: 180, values: [7, 8] })).toStrictEqual({
      ...SERIES,
      x: [60, 120, 180],
      series: [
        { key: "p50", values: [2, 3, 7] },
        { key: "p95", values: [5, 6, 8] },
      ],
      domain: [60, 180],
      resets: [60],
    });
  });

  it("slides a frame with no domain by its x extent, its domain from then on", () => {
    const given = {
      ...SERIES,
      x: [0, 60, 120],
      series: [{ key: "p50", values: [1, 2, 3] }],
    } as Frame;
    expect(applyEvent(given, { kind: "append", key: "k", x: 150, values: [4] })).toStrictEqual({
      ...SERIES,
      x: [60, 120, 150],
      series: [{ key: "p50", values: [2, 3, 4] }],
      domain: [30, 150],
    });
  });

  it("keeps a frame's x extent through appends a step apart of any size", () => {
    const given = {
      ...SERIES,
      x: [0, 100],
      series: [{ key: "p50", values: [1, 2] }],
    } as Frame;
    const once = applyEvent(given, { kind: "append", key: "k", x: 101, values: [3] });
    expect(applyEvent(once, { kind: "append", key: "k", x: 200, values: [4] })).toStrictEqual({
      ...SERIES,
      x: [100, 101, 200],
      series: [{ key: "p50", values: [2, 3, 4] }],
      domain: [100, 200],
    });
  });

  it("keeps a bins frame's x extent through appends", () => {
    const given = {
      ...BINS,
      x1: [0, 10],
      x2: [10, 20],
      series: [{ key: "a", values: [1, 2] }],
    } as Frame;
    const once = applyEvent(given, { kind: "append", key: "k", x1: 20, x2: 25, values: [3] });
    expect(once).toStrictEqual({
      ...BINS,
      x1: [0, 10, 20],
      x2: [10, 20, 25],
      series: [{ key: "a", values: [1, 2, 3] }],
      domain: [5, 25],
    });
    expect(
      applyEvent(once, { kind: "append", key: "k", x1: 25, x2: 40, values: [4] }),
    ).toStrictEqual({
      ...BINS,
      x1: [20, 25],
      x2: [25, 40],
      series: [{ key: "a", values: [3, 4] }],
      domain: [20, 40],
    });
  });

  it("grows a frame with no extent until it has a span to keep", () => {
    const appended = [1, 2, 3].reduce<Frame>(
      (f, x) => applyEvent(f, { kind: "append", key: "k", x, values: [x] }),
      { ...SERIES, x: [], series: [{ key: "p50", values: [] }] } as Frame,
    );
    expect(appended).toStrictEqual({
      ...SERIES,
      x: [2, 3],
      series: [{ key: "p50", values: [2, 3] }],
      domain: [2, 3],
    });
    const two = applyEvent({ ...SERIES, x: [1], series: [{ key: "p50", values: [1] }] } as Frame, {
      kind: "append",
      key: "k",
      x: 2,
      values: [2],
    });
    expect(two).toStrictEqual({ ...SERIES, x: [1, 2], series: [{ key: "p50", values: [1, 2] }] });
    const bins = applyEvent(
      { ...BINS, x1: [], x2: [], series: [{ key: "a", values: [] }] } as Frame,
      { kind: "append", key: "k", x1: 0, x2: 10, values: [1] },
    );
    expect(bins).toStrictEqual({
      ...BINS,
      x1: [0],
      x2: [10],
      series: [{ key: "a", values: [1] }],
    });
  });

  // chartdata leaves out an empty values list, so an event to a frame with
  // no series comes without one: these are its marshalled events.
  const NO_SERIES: readonly (readonly [string, Frame, string, unknown])[] = [
    [
      "an append to a series frame",
      { ...SERIES, x: [0, 60], series: [], domain: [0, 120] } as Frame,
      '{"x":180,"key":"k","kind":"append"}',
      { ...SERIES, x: [60, 180], series: [], domain: [60, 180] },
    ],
    [
      "a replace of a series frame's column",
      { ...SERIES, x: [0, 60], series: [], domain: [0, 120] } as Frame,
      '{"open":false,"key":"k","kind":"replace"}',
      { ...SERIES, x: [0, 60], series: [], domain: [0, 120] },
    ],
    [
      "an append to a bins frame",
      { ...BINS, x1: [0, 10], x2: [10, 20], series: [], domain: [0, 20] } as Frame,
      '{"x1":20,"x2":30,"key":"k","kind":"append"}',
      { ...BINS, x1: [10, 20], x2: [20, 30], series: [], domain: [10, 30] },
    ],
    [
      "a replace of a bins frame's bin",
      { ...BINS, x1: [0, 10], x2: [10, 20], series: [], domain: [0, 20] } as Frame,
      '{"x1":10,"x2":25,"open":true,"key":"k","kind":"replace"}',
      { ...BINS, x1: [0, 10], x2: [10, 25], series: [], domain: [0, 20], open: true },
    ],
  ];

  it.each(NO_SERIES)("takes %s with no series and no values", (_, given, wire, expected) => {
    expect(applyEvent(given, JSON.parse(wire))).toStrictEqual(expected);
  });

  it("drops the bins an append slides out of the domain, keeping one it still overlaps", () => {
    const given = {
      ...BINS,
      x1: [0, 10, 20],
      x2: [10, 20, 30],
      series: [{ key: "a", values: [1, 2, 3] }],
      domain: [0, 30],
    } as Frame;
    expect(
      applyEvent(given, { kind: "append", key: "k", x1: 30, x2: 45, values: [4] }),
    ).toStrictEqual({
      ...BINS,
      x1: [10, 20, 30],
      x2: [20, 30, 45],
      series: [{ key: "a", values: [2, 3, 4] }],
      domain: [15, 45],
    });
  });

  it("marks a reset among the frame's resets in order, once", () => {
    const given = frame("series");
    const at = 1772323230000;
    const once = applyEvent(given, { kind: "reset", key: "k", at });
    expect(once).toStrictEqual({ ...given, resets: [1772323200000, at] });
    expect(applyEvent(once, { kind: "reset", key: "k", at })).toStrictEqual(once);
    expect(applyEvent(given, event("reset"))).toStrictEqual(given);
  });

  it("shows a gap in a state history at a reset", () => {
    const given = frame("states");
    expect(applyEvent(given, { kind: "reset", key: "k", at: 1772323230000 })).toStrictEqual({
      type: "states",
      name: "provider_health",
      keys: ["up", null, null, "down"],
      at: [1772323200000, 1772323230000, 1772323260000, 1772323320000],
    });
    expect(applyEvent(given, event("reset"))).toStrictEqual(given);
  });

  it("clips a set frame to the span the drawn frame's domain held", () => {
    const set = {
      kind: "set",
      key: "k",
      series: {
        ...SERIES,
        x: [1772323200000, 1772323260000, 1772323320000, 1772323380000, 1772323440000],
        series: [
          { key: "p50", values: [1, 2, 3, 4, 5] },
          { key: "p95", values: [6, 7, 8, 9, 10] },
        ],
        domain: [1772323200000, 1772323440000],
        resets: [1772323200000, 1772323380000],
      },
    };
    expect(applyEvent(frame("series"), set)).toStrictEqual({
      ...SERIES,
      x: [1772323260000, 1772323320000, 1772323380000, 1772323440000],
      series: [
        { key: "p50", values: [2, 3, 4, 5] },
        { key: "p95", values: [7, 8, 9, 10] },
      ],
      domain: [1772323260000, 1772323440000],
      resets: [1772323380000],
    });
  });

  it("clips a set frame to the span an append gave a frame with no domain", () => {
    const given = {
      ...SERIES,
      x: [0, 50, 100],
      series: [{ key: "p50", values: [1, 2, 3] }],
    } as Frame;
    const appended = applyEvent(given, { kind: "append", key: "k", x: 110, values: [4] });
    const sent = {
      ...SERIES,
      x: [0, 100, 200, 300, 400, 500],
      series: [{ key: "p50", values: [1, 2, 3, 4, 5, 6] }],
      domain: [0, 500],
    };
    expect(applyEvent(appended, { kind: "set", key: "k", series: sent })).toStrictEqual({
      ...SERIES,
      x: [400, 500],
      series: [{ key: "p50", values: [5, 6] }],
      domain: [400, 500],
    });
  });

  it("draws a set frame with no domain as sent", () => {
    const sent = {
      ...SERIES,
      x: [1, 2],
      series: [{ key: "p50", values: [1, 2] }],
    };
    expect(applyEvent(frame("series"), { kind: "set", key: "k", series: sent })).toStrictEqual(
      sent,
    );
  });

  it("ignores a field the contract does not name, such as a read state", () => {
    const given = { ...event("append-column"), state: "partial" };
    expect(applyEvent(frame("series"), given)).toStrictEqual(
      APPLIED["event-append-column.json"]?.[1],
    );
  });

  // chartdata's refusal fixtures name chartdata's own fields; this is what
  // the page names for each, with the error it throws.
  const NAMED: Readonly<Record<string, readonly [string, ErrorConstructor]>> = {
    "refusal-bin.json": ["x2[1]", RangeError],
    "refusal-duplicate.json": ["names[1]", RangeError],
    "refusal-empty.json": ["names[0]", RangeError],
    "refusal-finite.json": ["series[0].values[0]", RangeError],
    "refusal-length.json": ["series[0].values", TypeError],
    "refusal-limit.json": ["names", RangeError],
    "refusal-magnitude.json": ["series[0].values[0]", RangeError],
    "refusal-negative.json": ["parts[0].value", RangeError],
    "refusal-order.json": ["x[1]", RangeError],
    "refusal-shape.json": ["series[0]", TypeError],
  };

  it("names a field for every refusal fixture", () => {
    expect(REFUSALS.map(([f]) => f)).toEqual(Object.keys(NAMED).sort());
  });

  it.each(REFUSALS)("refuses a set of %s as readFrame does, under the event", (name, given) => {
    const { frame: sent } = given as { readonly frame: { readonly type: FrameType } };
    const [field, type] = NAMED[name] ?? ["", Error];
    const e = refusal(() =>
      applyEvent(frame(sent.type), { kind: "set", key: "k", [sent.type]: sent }),
    );
    expect(e).toBeInstanceOf(type);
    expect(e.message).toMatch(naming(`event.${sent.type}.${field}`));
  });

  // An event's own fields broken by each refusal rule an event can break.
  const BROKEN: readonly (readonly [string, string, unknown, string, ErrorConstructor])[] = [
    [
      "finite",
      "series",
      { ...event("append-column"), values: [Infinity, 1] },
      "event.values[0]",
      RangeError,
    ],
    [
      "magnitude",
      "series",
      { ...event("append-column"), values: [1e301, 1] },
      "event.values[0]",
      RangeError,
    ],
    ["length", "series", { ...event("append-column"), values: [1] }, "event.values", TypeError],
    [
      "length",
      "series",
      { ...event("replace-column"), values: [1, 2, 3] },
      "event.values",
      TypeError,
    ],
    ["order", "series", { ...event("append-column"), x: 1772323320000 }, "event.x", RangeError],
    ["order", "bins", { ...event("append-bin"), x1: 2 }, "event.x1", RangeError],
    ["order", "bins", { ...event("append-bin"), x1: 3, x2: 4 }, "event.x2", RangeError],
    ["order", "bins", { ...event("replace-bin"), x1: 1 }, "event.x1", RangeError],
    ["order", "bins", { ...event("replace-bin"), x1: 1.5, x2: 1.8 }, "event.x2", RangeError],
    ["bin", "bins", { ...event("append-bin"), x1: 7, x2: 7 }, "event.x2", RangeError],
    ["bin", "bins", { ...event("replace-bin"), x1: 3, x2: 2.5 }, "event.x2", RangeError],
    ["finite", "series", { ...event("reset"), at: Infinity }, "event.at", RangeError],
    ["finite", "bins", { ...event("append-bin"), x2: Infinity }, "event.x2", RangeError],
  ];

  it.each(BROKEN)(
    "refuses an event breaking the %s rule on a %s frame",
    (_, type, given, field, error) => {
      const e = refusal(() => applyEvent(frame(type), given));
      expect(e).toBeInstanceOf(error);
      expect(e.message).toMatch(naming(field));
    },
  );

  it("refuses an append past the most values a frame holds", () => {
    const n = MAX_VALUES;
    const x = Array.from({ length: n }, (_, i) => i);
    const given = {
      type: "series",
      name: "wait_seconds",
      unit: "seconds",
      x,
      series: [{ key: "a", values: x }],
      domain: [-1e12, n],
    } as Frame;
    const e = refusal(() => applyEvent(given, { kind: "append", key: "k", x: n, values: [1] }));
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toMatch(naming("event"));
  });

  const FULL = Array.from({ length: MAX_VALUES }, (_, i) => i);
  const CAPPED: readonly (readonly [string, Frame])[] = [
    ["series", { ...SERIES, x: [0], series: [{ key: "a", values: [1] }], resets: FULL } as Frame],
    [
      "bins",
      { ...BINS, x1: [0], x2: [1], series: [{ key: "a", values: [1] }], resets: FULL } as Frame,
    ],
  ];

  it.each(CAPPED)("refuses a reset past the most resets a %s frame holds", (_, given) => {
    const e = refusal(() => applyEvent(given, { kind: "reset", key: "k", at: MAX_VALUES }));
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toMatch(naming("event.at"));
    expect(applyEvent(given, { kind: "reset", key: "k", at: 0 })).toStrictEqual(given);
  });

  // A slid domain must still be one a frame holds: a span, its start within
  // the largest magnitude a value may have.
  const SLID: readonly (readonly [string, readonly number[], readonly number[], number])[] = [
    ["loses its span to rounding", [0], [0, 1], 1e20],
    ["starts below -1e300", [-1e300], [0, 1e300], -5e299],
  ];

  it.each(SLID)("refuses an append whose slid domain %s", (_, x, domain, at) => {
    const given = { ...SERIES, x, series: [{ key: "a", values: x.map(() => 1) }], domain } as Frame;
    const e = refusal(() => applyEvent(given, { kind: "append", key: "k", x: at, values: [1] }));
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toMatch(naming("event.x"));
  });

  it("reads a frame type an object inherits as one that takes only a set", () => {
    const given = { type: "constructor" } as unknown as Frame;
    const e = refusal(() => applyEvent(given, { key: "k", kind: "append" }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toMatch(naming("event.kind"));
  });

  // Each wrong shape an event can take, the field it is wrong at, and the
  // frame it is applied to.
  const MISSHAPEN: readonly (readonly [unknown, string, string])[] = [
    [null, "series", "event"],
    [[], "series", "event"],
    ["append", "series", "event"],
    [{ kind: "append", values: [1, 2], x: 1772323380000 }, "series", "event.key"],
    [{ key: "k", kind: "move" }, "series", "event.kind"],
    [{ key: "k" }, "series", "event.kind"],
    [{ key: "k", kind: "append", values: [1, 2] }, "series", "event.x"],
    [{ ...event("append-column"), x: "1" }, "series", "event.x"],
    [{ ...event("append-column"), values: "1" }, "series", "event.values"],
    [{ key: "k", kind: "append", x: 1772323380000 }, "series", "event.values"],
    [{ key: "k", kind: "replace", x1: 2, x2: 6 }, "bins", "event.values"],
    [{ ...event("append-column"), values: [1, "2"] }, "series", "event.values[1]"],
    [{ ...event("append-column"), x1: 1 }, "series", "event.x1"],
    [{ ...event("append-column"), open: true }, "series", "event.open"],
    [{ ...event("append-bin"), x: 1 }, "bins", "event.x"],
    [{ key: "k", kind: "append", x2: 9, values: [1] }, "bins", "event.x1"],
    [{ ...event("replace-column"), open: "yes" }, "series", "event.open"],
    [{ ...event("replace-column"), x1: 1 }, "series", "event.x1"],
    [{ ...event("replace-column"), at: 1 }, "series", "event.at"],
    [{ key: "k", kind: "replace", x2: 9, values: [1] }, "bins", "event.x1"],
    [{ ...event("reset"), at: "now" }, "series", "event.at"],
    [{ key: "k", kind: "reset" }, "series", "event.at"],
    [{ ...event("reset"), values: [1] }, "series", "event.values"],
    [{ ...event("set"), series: frame("series") }, "categories", "event.series"],
    [{ key: "k", kind: "set" }, "categories", "event.categories"],
    [{ ...event("set"), x: 1 }, "categories", "event.x"],
    [{ key: "k", kind: "set", categories: frame("series") }, "categories", "event.categories.type"],
  ];

  it.each(MISSHAPEN)("refuses %j on a %s frame by %s", (given, type, field) => {
    const e = refusal(() => applyEvent(frame(type), given));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toMatch(naming(field));
  });

  // The kinds each frame takes: append and replace need an x axis of
  // columns or bins, a reset a time line. A series or bins frame takes all.
  const TAKES: readonly (readonly [string, readonly string[]])[] = [
    ["states", ["reset", "set"]],
    ["categories", ["set"]],
    ["boxes", ["set"]],
    ["points", ["set"]],
    ["grid", ["set"]],
    ["calendar", ["set"]],
    ["tree", ["set"]],
    ["flow", ["set"]],
    ["events", ["set"]],
    ["value", ["set"]],
  ];

  it.each(TAKES)("refuses on a %s frame every kind but %j", (type, kinds) => {
    for (const kind of ["append", "replace", "reset"].filter((k) => !kinds.includes(k))) {
      const e = refusal(() => applyEvent(frame(type), { key: "k", kind, at: 1, x: 1, values: [] }));
      expect(e, kind).toBeInstanceOf(TypeError);
      expect(e.message, kind).toMatch(naming("event.kind"));
    }
  });

  it("refuses a replace on a frame with no column or bin to replace", () => {
    const empty = { ...SERIES, x: [], series: [] } as Frame;
    const e = refusal(() => applyEvent(empty, { kind: "replace", key: "k", values: [] }));
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toMatch(naming("event"));
  });
});
