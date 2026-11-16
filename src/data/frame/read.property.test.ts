import fc from "fast-check";
import { describe, expect, it } from "vitest";

import bins from "./contract/fixtures/frame-bins.json" with { type: "json" };
import boxes from "./contract/fixtures/frame-boxes.json" with { type: "json" };
import calendar from "./contract/fixtures/frame-calendar.json" with { type: "json" };
import categories from "./contract/fixtures/frame-categories.json" with { type: "json" };
import events from "./contract/fixtures/frame-events.json" with { type: "json" };
import flowStages from "./contract/fixtures/frame-flow-stages.json" with { type: "json" };
import flow from "./contract/fixtures/frame-flow.json" with { type: "json" };
import grid from "./contract/fixtures/frame-grid.json" with { type: "json" };
import points from "./contract/fixtures/frame-points.json" with { type: "json" };
import series from "./contract/fixtures/frame-series.json" with { type: "json" };
import states from "./contract/fixtures/frame-states.json" with { type: "json" };
import treeGroups from "./contract/fixtures/frame-tree-groups.json" with { type: "json" };
import tree from "./contract/fixtures/frame-tree.json" with { type: "json" };
import value from "./contract/fixtures/frame-value.json" with { type: "json" };
import type { FrameType } from "./frame.js";
import { MAX_VALUES } from "./limits.js";
import { door, readFrame } from "./read.js";

const FRAMES: readonly unknown[] = [
  bins,
  boxes,
  calendar,
  categories,
  events,
  flowStages,
  flow,
  grid,
  points,
  series,
  states,
  treeGroups,
  tree,
  value,
];

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

const read = (v: unknown): unknown => readFrame(v, "data", door("test", MAX_VALUES), TYPES);

type Path = readonly (string | number)[];

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

const lists = (frame: unknown): Path[] =>
  paths(frame).filter((path) => Array.isArray(at(frame, path)));

// A field's name as the reader's errors write it: data.series[1].values.
const named = (path: Path): string =>
  ["data", ...path]
    .map((k) => (typeof k === "number" ? `[${String(k)}]` : `.${k}`))
    .join("")
    .slice(1);

const escape = (s: string): string => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const DROP = Symbol("drop");

// `frame` copied, with the field at each path dropped or set; a path through
// a value an earlier change set is skipped, since that value is shared.
function mutate(frame: unknown, changes: readonly (readonly [Path, unknown])[]): unknown {
  const out = structuredClone(frame);
  const own = new Set<unknown>(paths(out).map((p) => at(out, p)));
  own.add(out);
  for (const [path, v] of changes) {
    const parent = path
      .slice(0, -1)
      .reduce<unknown>(
        (o, k) =>
          own.has(o) && typeof o === "object" && o !== null
            ? (o as Record<string | number, unknown>)[k]
            : undefined,
        out,
      );
    const key = path.at(-1);
    if (!own.has(parent) || typeof parent !== "object" || parent === null || key === undefined) {
      continue;
    }
    if (v === DROP) {
      if (Array.isArray(parent) && typeof key === "number") {
        parent.splice(key, 1);
      } else {
        Reflect.deleteProperty(parent, key);
      }
    } else {
      (parent as Record<string | number, unknown>)[key] = v;
    }
  }
  return out;
}

// `list` with every read of an entry throwing, so a reader that walks it
// before refusing it fails by that error.
const unread = <T extends object>(list: T): T =>
  new Proxy(list, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/u.test(key)) {
        throw new Error(`read entry ${key}`);
      }
      return Reflect.get(target, key) as unknown;
    },
  });

// Every stand-in for a list: no array, an array-like of each length no
// array has, a typed array, and an array one entry past the most a frame holds.
const NOT_LISTS: readonly unknown[] = [
  "a",
  1,
  {},
  null,
  unread(new Float64Array([1])),
  unread({ length: 1, 0: "a" }),
  ...[-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e7, 2 ** 32 - 1, 2 ** 32, 4e9].map((length) =>
    unread({ length }),
  ),
  unread(new Array<number>(MAX_VALUES + 2)),
];

const isRefusal = (e: unknown): e is TypeError | RangeError =>
  e instanceof TypeError || e instanceof RangeError;

// The reader's errors name what broke as the subject, before the verb or a
// box's category.
const VERB = / (?:must|has|at) /u;

const namesAField = (e: TypeError | RangeError): boolean =>
  /^data(?:\.\w+|\[\d+\])*$/u.test(e.message.slice("test: ".length).split(VERB)[0] ?? "");

describe("readFrame", () => {
  it.each(FRAMES.map((f, k) => [k, f] as const))(
    "refuses each list of fixture %i given anything but an array within the ceiling, by its name, before reading it",
    (_, frame) => {
      for (const path of lists(frame)) {
        for (const stand of NOT_LISTS) {
          let thrown: unknown;
          try {
            read(mutate(frame, [[path, stand]]));
          } catch (e) {
            thrown = e;
          }
          const what = `${named(path)} given ${Object.prototype.toString.call(stand)}`;
          expect(isRefusal(thrown), what).toBe(true);
          expect((thrown as Error).message, what).toMatch(
            new RegExp(`^test: ${escape(named(path))}(?![\\w.[])`, "u"),
          );
        }
      }
    },
  );

  // Values a mistyped field might hold, near and far from what each expects.
  const WRONG: readonly unknown[] = [
    DROP,
    undefined,
    null,
    0,
    -1,
    1.5,
    1e6,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    9e15,
    1e301,
    "",
    "a",
    "series",
    "time",
    true,
    [],
    [1],
    ["a"],
    [null],
    [[]],
    { length: 1, 0: 1 },
    {},
    { key: "a" },
    { names: ["a"] },
    { edges: [0, 1] },
  ];

  it("reads each fixture with fields dropped or mistyped, or refuses it by a field", () => {
    const changed = fc.integer({ min: 0, max: FRAMES.length - 1 }).chain((k) =>
      fc.tuple(
        fc.constant(k),
        fc.array(fc.tuple(fc.constantFrom(...paths(FRAMES[k])), fc.constantFrom(...WRONG)), {
          minLength: 1,
          maxLength: 3,
        }),
      ),
    );
    fc.assert(
      fc.property(changed, ([k, changes]) => {
        const frame = mutate(FRAMES[k], changes);
        try {
          expect(read(frame)).toBeTypeOf("object");
        } catch (e) {
          if (!isRefusal(e) || !e.message.startsWith("test: ")) {
            throw e;
          }
          expect(namesAField(e), e.message).toBe(true);
        }
      }),
    );
  });

  // Each list a fixture repeats in a list of its own, with the index of that place.
  const repeats = (frame: unknown): (readonly [Path, number])[] =>
    lists(frame).flatMap((path) =>
      path.flatMap((k, j) => (typeof k === "number" ? [[path, j] as const] : [])),
    );
  const SHARED = FRAMES.flatMap((frame, k) =>
    repeats(frame).map(([path, j]) => [k, path, j] as const),
  );

  // A run copies up to a million entries, about 25 ms alone, so a loaded
  // host could pass the shared 10 s limit; this budget ends the runs at 3 s,
  // the verdict resting on fewer runs, never failing for the time taken.
  it("copies a list many entries share only as far as the ceiling admits", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SHARED),
        fc.integer({ min: 2, max: 2_000 }),
        ([k, path, j], copies) => {
          const frame = FRAMES[k];
          const list = at(frame, path) as readonly unknown[];
          let reads = 0;
          const length = Math.min(MAX_VALUES, Math.ceil((2 * MAX_VALUES) / copies));
          const shared = new Proxy(new Array<unknown>(length).fill(list[0] ?? 0), {
            get(target, key) {
              if (typeof key === "string" && /^\d+$/u.test(key)) {
                reads++;
              }
              return Reflect.get(target, key) as unknown;
            },
          });
          const entry = at(frame, path.slice(0, j + 1));
          const tail = path.slice(j + 1);
          const many = Array.from({ length: copies }, () =>
            tail.length === 0 ? shared : mutate(entry, [[tail, shared]]),
          );
          let thrown: unknown;
          try {
            read(mutate(frame, [[path.slice(0, j), many]]));
          } catch (e) {
            thrown = e;
          }
          expect(isRefusal(thrown)).toBe(true);
          expect(reads).toBeLessThanOrEqual(MAX_VALUES);
        },
      ),
      { numRuns: 100, plugins: [fc.interruptAfterTimeLimit(3_000)] },
    );
  });
});
