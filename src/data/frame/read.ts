/**
 * read.ts — the one door frame data passes before an element reads it: each
 * frame checked by the rules chartdata's constructors hold it to, and copied.
 * @module
 */
import { localDay, midnight, withinTime } from "../scale/time.js";
import type {
  EventsFrame,
  Frame,
  FrameBoxes,
  FrameFlowLink,
  FrameMeter,
  FrameNote,
  FramePoints,
  FrameRef,
  FrameSeries,
  FrameTreeGroup,
  FrameTreePart,
  FrameType,
} from "./frame.js";
import { MAX_CALENDAR_DAYS, MAX_MAGNITUDE, MAX_ROWS, MAX_SUB_ROWS, MAX_VALUES } from "./limits.js";

// A field's name, or what builds it, so the entries of a long list build
// theirs only for an error.
type Field = string | (() => string);

const nameOf = (field: Field): string => (typeof field === "string" ? field : field());

const indexed = (field: string, i: number): string => `${field}[${String(i)}]`;

const place =
  (field: Field, i: number, then = "") =>
  (): string =>
    `${indexed(nameOf(field), i)}${then}`;

type Fail = (message: string, type?: ErrorConstructor) => never;

interface List {
  /** The copy of the entry at `i`, read once. */
  readonly each?: (v: unknown, i: number) => unknown;
  readonly most?: number;
  readonly why?: string;
  /** What the list adds to the values count, from its length alone. */
  readonly charge?: (length: number) => number;
  /** The one length the list may have, and the words for why. */
  readonly per?: readonly [number, string];
}

interface Door {
  /** A copy of array `v`, read by index, each entry through `each`. Its one
   *  length read must be a whole number from 0 to `most`, and `per`'s length
   *  if given; `charge` of it joins the values count before an entry is read. */
  readonly list: (v: unknown, field: Field, options?: List) => unknown[];
  readonly add: (n: number, field: Field) => void;
  readonly fail: Fail;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A door whose errors start with `prefix` and whose lists together hold at
 *  most `most` values; one door reads all the frames one element draws. */
export function door(prefix: string, most: number): Door {
  let count = 0;
  const fail: Fail = (message, type = TypeError) => {
    throw new type(`${prefix}: ${message}`);
  };
  const add = (n: number, field: Field): void => {
    count += n;
    if (count > most) {
      fail(
        `${nameOf(field)} must not take the data past ${String(most)} values, its samples, bins, bars, dots, cells, parts, links, refs and notes together`,
        RangeError,
      );
    }
  };
  const list = (v: unknown, field: Field, options: List = {}): unknown[] => {
    if (!Array.isArray(v)) {
      return fail(`${nameOf(field)} must be an array`);
    }
    const {
      each,
      most: limit = most,
      why = "the most values a frame holds",
      charge,
      per,
    } = options;
    // A Proxy over an array may claim any length, NaN included.
    const length: unknown = v.length;
    if (!(
      typeof length === "number" &&
      Number.isInteger(length) &&
      length >= 0 &&
      length <= limit
    )) {
      return fail(
        `${nameOf(field)} must hold at most ${String(limit)} entries, ${why}`,
        RangeError,
      );
    }
    if (per !== undefined && length !== per[0]) {
      fail(`${nameOf(field)} must hold ${String(per[0])} entries, ${per[1]}`);
    }
    if (charge !== undefined) {
      add(charge(length), field);
    }
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) {
      out.push(each === undefined ? v[i] : each(v[i], i));
    }
    return out;
  };
  return { list, add, fail };
}

// Every frame type, so a type the contract adds fails the type check here.
const KINDS = {
  series: true,
  bins: true,
  categories: true,
  boxes: true,
  points: true,
  grid: true,
  calendar: true,
  tree: true,
  flow: true,
  events: true,
  states: true,
  value: true,
} satisfies Record<FrameType, true>;

const isKind = (v: unknown): v is FrameType => typeof v === "string" && Object.hasOwn(KINDS, v);

const ALL = (length: number): number => length;

// A series or a row is one value at least, as chartdata charges it.
const ONE_AT_LEAST = (length: number): number => Math.max(1, length);

const MAGNITUDE = String(MAX_MAGNITUDE).replace("e+", "e");

const words = (types: readonly string[]): string => {
  const quoted = types.map((t) => JSON.stringify(t));
  return quoted.length < 2
    ? (quoted[0] ?? "a frame type")
    : `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1) ?? ""}`;
};

// The checks every frame's fields share, over one door.
function checks(d: Door) {
  const { list, fail } = d;
  const record = (v: unknown, field: Field): Record<string, unknown> =>
    isRecord(v) ? v : fail(`${nameOf(field)} must be an object`);
  const string = (v: unknown, field: Field): string =>
    typeof v === "string" ? v : fail(`${nameOf(field)} must be a string`);
  const optional = <T>(v: unknown, read: (v: unknown) => T): T | undefined =>
    v === undefined ? undefined : read(v);
  const boolean = (v: unknown, field: Field): boolean =>
    typeof v === "boolean" ? v : fail(`${nameOf(field)} must be a boolean`);
  const finite = (v: unknown, field: Field): number => {
    if (typeof v !== "number") {
      return fail(`${nameOf(field)} must be a number`);
    }
    if (!Number.isFinite(v)) {
      fail(`${nameOf(field)} must be finite`, RangeError);
    }
    if (Math.abs(v) > MAX_MAGNITUDE) {
      fail(`${nameOf(field)} must lie within ±${MAGNITUDE}`, RangeError);
    }
    return v;
  };
  const numbers =
    (field: Field) =>
    (v: unknown, i: number): number =>
      typeof v === "number" && Math.abs(v) <= MAX_MAGNITUDE ? v : finite(v, place(field, i));
  // A value or a gap: null, or NaN from a frame built in TS.
  const gaps =
    (field: Field) =>
    (v: unknown, i: number): number | null => {
      if (
        v === null ||
        (typeof v === "number" && (Math.abs(v) <= MAX_MAGNITUDE || Number.isNaN(v)))
      ) {
        return v;
      }
      return typeof v === "number"
        ? finite(v, place(field, i))
        : fail(`${place(field, i)()} must be a number or null`);
    };
  const ordered = (field: Field, ties: boolean) => {
    let before = Number.NEGATIVE_INFINITY;
    const number = numbers(field);
    return (v: unknown, i: number): number => {
      const n = number(v, i);
      if (ties ? n < before : n <= before) {
        fail(
          `${place(field, i)()} must ${ties ? "never decrease" : "strictly increase"}`,
          RangeError,
        );
      }
      before = n;
      return n;
    };
  };
  // A key no sibling has; empty, as a label value may be, unless `named`.
  const unique = (named: boolean) => {
    const seen = new Set<string>();
    return (v: unknown, field: Field): string => {
      const s = string(v, field);
      if (named && s === "") {
        fail(`${nameOf(field)} must not be empty`, RangeError);
      }
      if (seen.has(s)) {
        fail(`${nameOf(field)} must not repeat ${JSON.stringify(s)}`, RangeError);
      }
      seen.add(s);
      return s;
    };
  };
  const nameList = (v: unknown, field: string, options: List = {}): string[] => {
    const name = unique(true);
    return list(v, field, { ...options, each: (n, i) => name(n, place(field, i)) }) as string[];
  };
  const refs = (v: unknown, field: string): FrameRef[] =>
    list(v, field, {
      charge: ALL,
      each: (r, i) => {
        const o = record(r, place(field, i));
        return {
          key: string(o["key"], place(field, i, ".key")),
          value: finite(o["value"], place(field, i, ".value")),
        };
      },
    }) as FrameRef[];
  const notes = (v: unknown, field: string): FrameNote[] =>
    list(v, field, {
      charge: ALL,
      each: (r, i) => {
        const o = record(r, place(field, i));
        return {
          key: string(o["key"], place(field, i, ".key")),
          at: finite(o["at"], place(field, i, ".at")),
        };
      },
    }) as FrameNote[];
  // A part of a whole, a tree part's or a flow link's: 0 or more, or no
  // data, which chartdata sends as `null` though frame.ts types it `value?: number`.
  const part = (v: unknown, field: Field): number | null => {
    if (v === null || (typeof v === "number" && Number.isNaN(v))) {
      return v;
    }
    if (typeof v !== "number") {
      return fail(`${nameOf(field)} must be a number or null`);
    }
    if (finite(v, field) < 0) {
      fail(`${nameOf(field)} must be 0 or more, a part of the whole`, RangeError);
    }
    return v;
  };
  // Series of a value per entry of a list `n` long, charged as chartdata
  // charges them once that list's `n` is: max(1, n) each.
  const series = (
    v: unknown,
    field: string,
    n: number,
    per: string,
    rows?: List,
  ): FrameSeries[] => {
    const key = unique(false);
    return list(v, field, {
      ...rows,
      charge: (s) => (s === 0 ? 0 : s * Math.max(1, n) - n),
      each: (e, s) => {
        const o = record(e, place(field, s));
        const values = place(field, s, ".values");
        return {
          key: key(o["key"], place(field, s, ".key")),
          values: list(o["values"], values, {
            per: [n, `one per ${per}`],
            each: gaps(values),
          }),
        };
      },
    }) as FrameSeries[];
  };
  return {
    ...d,
    record,
    string,
    optional,
    boolean,
    finite,
    numbers,
    gaps,
    ordered,
    unique,
    nameList,
    refs,
    notes,
    part,
    series,
  };
}

type Checks = ReturnType<typeof checks>;

// The span an axis covers: two finite numbers, a low below a high.
function domain(c: Checks, v: unknown, field: string): number[] {
  const ends = c.list(v, field, {
    per: [2, "a low and a high"],
    each: c.numbers(field),
  }) as number[];
  if (!((ends[0] ?? 0) < (ends[1] ?? 0))) {
    c.fail(`${field} must run from a low to a high`, RangeError);
  }
  return ends;
}

// The fields a series and a bins frame share past their x.
function along(c: Checks, o: Record<string, unknown>, f: string) {
  const domainOf = c.optional(o["domain"], (v) => domain(c, v, `${f}.domain`));
  const resets = c.optional(o["resets"], (v) =>
    c.list(v, `${f}.resets`, { each: c.ordered(`${f}.resets`, false) }),
  );
  const open = c.optional(o["open"], (v) => c.boolean(v, `${f}.open`));
  return {
    ...(domainOf === undefined ? {} : { domain: domainOf }),
    ...(resets === undefined ? {} : { resets: resets as number[] }),
    ...(open === undefined ? {} : { open }),
  };
}

function seriesFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const x = c.list(o["x"], `${f}.x`, { charge: ALL, each: c.ordered(`${f}.x`, false) }) as number[];
  return { x, series: c.series(o["series"], `${f}.series`, x.length, "x"), ...along(c, o, f) };
}

function binsFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const axis = o["axis"];
  if (axis !== "time" && axis !== "value") {
    return c.fail(`${f}.axis must be "time" or "value"`);
  }
  const x1 = c.list(o["x1"], `${f}.x1`, {
    charge: ALL,
    each: c.ordered(`${f}.x1`, false),
  }) as number[];
  const x2 = c.list(o["x2"], `${f}.x2`, {
    per: [x1.length, "one per x1"],
    each: c.ordered(`${f}.x2`, true),
  }) as number[];
  x1.forEach((from, i) => {
    if (!((x2[i] ?? 0) > from)) {
      c.fail(`${indexed(`${f}.x2`, i)} must be above its x1, where its bin starts`, RangeError);
    }
  });
  return {
    axis,
    x1,
    x2,
    series: c.series(o["series"], `${f}.series`, x1.length, "bin"),
    ...along(c, o, f),
  };
}

const ROWS = "the most rows a band plot holds";

function categoriesFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const names = c.nameList(o["names"], `${f}.names`, { most: MAX_ROWS, why: ROWS, charge: ALL });
  return {
    names,
    series: c.series(o["series"], `${f}.series`, names.length, "name", {
      most: MAX_ROWS,
      why: `${ROWS}, since a slope draws each series on a line of its own`,
    }),
  };
}

const FIVE = ["low", "q1", "median", "q3", "high"] as const;

const isGap = (v: unknown): boolean => v === null || Number.isNaN(v);

// The chart computes no quartile, so each category's five numbers come as
// sent, all or none, in order, with its outliers beyond them.
function boxesFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const names = c.nameList(o["names"], `${f}.names`, { most: MAX_ROWS, why: ROWS, charge: ALL });
  const n = names.length;
  const key = c.unique(false);
  const series = c.list(o["series"], `${f}.series`, {
    ...(n === 0
      ? {}
      : {
          most: Math.floor(MAX_SUB_ROWS / n),
          why: `a sub-row per series in each of its ${String(n)} names, ${String(MAX_SUB_ROWS)} at most`,
        }),
    charge: (s) => (s === 0 ? 0 : s * Math.max(1, n) - n),
    each: (e, s) => {
      const at = indexed(`${f}.series`, s);
      const one = c.record(e, at);
      const boxes: Record<string, unknown> = { key: key(one["key"], `${at}.key`) };
      for (const field of FIVE) {
        boxes[field] = c.list(one[field], `${at}.${field}`, {
          per: [n, "one per name"],
          each: c.gaps(`${at}.${field}`),
        });
      }
      const outliers = c.optional(one["outliers"], (v) =>
        c.list(v, `${at}.outliers`, {
          per: [n, "a list per name"],
          each: (list, i) =>
            c.list(list, place(`${at}.outliers`, i), {
              charge: ALL,
              each: c.numbers(indexed(`${at}.outliers`, i)),
            }),
        }),
      ) as number[][] | undefined;
      names.forEach((name, i) => {
        checkBox(c, boxes, outliers?.[i] ?? [], at, name, i);
      });
      return outliers === undefined ? boxes : { ...boxes, outliers };
    },
  }) as FrameBoxes[];
  return { names, series };
}

function checkBox(
  c: Checks,
  boxes: Record<string, unknown>,
  outliers: readonly number[],
  at: string,
  name: string,
  i: number,
): void {
  const five = FIVE.map((field) => (boxes[field] as readonly (number | null)[])[i] ?? null);
  const where = `${at} at ${JSON.stringify(name)}`;
  const gaps = five.filter(isGap).length;
  if (gaps === FIVE.length) {
    if (outliers.length > 0) {
      c.fail(`${where} has outliers but no five numbers for them to lie beyond`);
    }
    return;
  }
  if (gaps > 0) {
    c.fail(`${where} must have all five numbers, low, q1, median, q3 and high, or none`);
  }
  const [low = 0, , , , high = 0] = five as number[];
  if (five.some((v, k) => k > 0 && (v ?? 0) < (five[k - 1] ?? 0))) {
    c.fail(`${where} must have low ≤ q1 ≤ median ≤ q3 ≤ high`, RangeError);
  }
  outliers.forEach((v, k) => {
    if (v >= low && v <= high) {
      c.fail(
        `${at}.outliers[${String(i)}][${String(k)}] must lie below low or above high, beyond the whiskers`,
        RangeError,
      );
    }
  });
}

// A point's name tells it apart in the readings and the table, so each is
// unique across the frame.
function pointsFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const u = c.record(o["units"], `${f}.units`);
  const r = c.optional(u["r"], (v) => c.string(v, `${f}.units.r`));
  const units = {
    x: c.string(u["x"], `${f}.units.x`),
    y: c.string(u["y"], `${f}.units.y`),
    ...(r === undefined ? {} : { r }),
  };
  const key = c.unique(false);
  const name = c.unique(true);
  const series = c.list(o["series"], `${f}.series`, {
    each: (e, s) => {
      const at = indexed(`${f}.series`, s);
      const one = c.record(e, at);
      const id = key(one["key"], `${at}.key`);
      const names = c.list(one["names"], `${at}.names`, {
        charge: ONE_AT_LEAST,
        each: (v, i) => name(v, place(`${at}.names`, i)),
      }) as string[];
      const per = [names.length, "one per name"] as const;
      const channel = (field: string): (number | null)[] =>
        c.list(one[field], `${at}.${field}`, { per, each: c.gaps(`${at}.${field}`) }) as (
          number | null
        )[];
      const points: FramePoints = { key: id, names, x: channel("x"), y: channel("y") };
      if (r === undefined) {
        if (one["r"] !== undefined) {
          c.fail(`${at}.r has no place without ${f}.units.r, the unit its sizes are in`);
        }
        return points;
      }
      const sizes = channel("r");
      sizes.forEach((v, i) => {
        if (v !== null && v < 0) {
          c.fail(`${at}.r[${String(i)}] must be 0 or more, an area`, RangeError);
        }
      });
      return { ...points, r: sizes };
    },
  }) as FramePoints[];
  return { units, series };
}

// A grid axis names its categories or gives its bins' edges, one more than
// its bins; `charge` is what its entries add to the count.
function gridAxis(
  c: Checks,
  v: unknown,
  field: string,
  rows: boolean,
  charge: (entries: number) => number,
): { readonly axis: { names?: string[]; edges?: number[] }; readonly entries: number } {
  const a = c.record(v, field);
  const names = a["names"];
  const edges = a["edges"];
  if ((names === undefined) === (edges === undefined)) {
    c.fail(
      `${field} must hold names or edges${names === undefined ? "" : ", not both"}, its categories' names or its bins' edges`,
    );
  }
  if (names !== undefined) {
    const list = c.nameList(names, `${field}.names`, {
      ...(rows ? { most: MAX_ROWS, why: ROWS } : {}),
      charge,
    });
    if (list.length === 0) {
      c.fail(`${field}.names must hold a name`, RangeError);
    }
    return { axis: { names: list }, entries: list.length };
  }
  const list = c.list(edges, `${field}.edges`, {
    most: (rows ? MAX_ROWS : MAX_VALUES) + 1,
    why: rows
      ? `${ROWS}, a bin each, on one more edge`
      : "a bin per value a frame holds, on one more edge",
    charge: (n) => charge(Math.max(0, n - 1)),
    each: c.ordered(`${field}.edges`, false),
  }) as number[];
  if (list.length < 2) {
    c.fail(`${field}.edges must hold two or more, a bin's low and high edges`, RangeError);
  }
  return { axis: { edges: list }, entries: list.length - 1 };
}

function gridFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const x = gridAxis(c, o["x"], `${f}.x`, false, ALL);
  const columns = x.entries;
  const y = gridAxis(c, o["y"], `${f}.y`, true, (rows) =>
    rows === 0 ? 0 : rows * Math.max(1, columns) - columns,
  );
  const values = c.list(o["values"], `${f}.values`, {
    per: [y.entries, "one row per y entry"],
    each: (row, r) =>
      c.list(row, place(`${f}.values`, r), {
        per: [columns, "one per x entry"],
        each: c.gaps(indexed(`${f}.values`, r)),
      }),
  }) as (number | null)[][];
  return { x: x.axis, y: y.axis, values };
}

function calendarFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const zone = c.string(o["zone"], `${f}.zone`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    c.fail(
      `${f}.zone must name a time zone the browser knows, not ${JSON.stringify(zone)}`,
      RangeError,
    );
  }
  const start = c.finite(o["start"], `${f}.start`);
  try {
    withinTime(start, `${f}.start`);
  } catch (e) {
    c.fail((e as Error).message, RangeError);
  }
  if (midnight(localDay(start, zone), zone) !== start) {
    c.fail(`${f}.start must be the first instant of a day in ${zone}`, RangeError);
  }
  const values = c.list(o["values"], `${f}.values`, {
    most: MAX_CALENDAR_DAYS,
    why: `the most days ${String(MAX_ROWS)} weeks hold at any week start`,
    charge: ALL,
    each: c.gaps(`${f}.values`),
  }) as (number | null)[];
  const open = c.optional(o["open"], (v) => c.boolean(v, `${f}.open`));
  return { zone, values, start, ...(open === undefined ? {} : { open }) };
}

// A tree's siblings' keys tell them apart in the legend row, the readings and
// the table; two groups may each hold an "Other".
function parts(c: Checks, v: unknown, field: string): FrameTreePart[] {
  const key = c.unique(true);
  return c.list(v, field, {
    charge: ALL,
    each: (e, i) => {
      const one = c.record(e, place(field, i));
      const id = key(one["key"], place(field, i, ".key"));
      const value = one["value"];
      return value === undefined
        ? { key: id }
        : { key: id, value: c.part(value, place(field, i, ".value")) };
    },
  }) as FrameTreePart[];
}

function treeFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const one = o["parts"];
  const two = o["groups"];
  if (one !== undefined && two !== undefined) {
    c.fail(
      `${f}.groups has no place beside ${f}.parts: a tree holds one level of parts or two of groups`,
    );
  }
  if (two === undefined) {
    return one === undefined ? {} : { parts: parts(c, one, `${f}.parts`) };
  }
  const key = c.unique(true);
  const groups = c.list(two, `${f}.groups`, {
    charge: ALL,
    each: (e, i) => {
      const at = indexed(`${f}.groups`, i);
      const group = c.record(e, at);
      const id = key(group["key"], `${at}.key`);
      const children = parts(c, group["children"], `${at}.children`);
      if (children.length === 0) {
        c.fail(`${at}.children must hold a part`, RangeError);
      }
      return { key: id, children };
    },
  }) as FrameTreeGroup[];
  return { groups };
}

function flowFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const stages = c.optional(o["stages"], (v) => c.nameList(v, `${f}.stages`));
  if (stages !== undefined && stages.length < 2) {
    c.fail(`${f}.stages must hold two or more, joined stage to stage`, RangeError);
  }
  const field = `${f}.links`;
  const end = (v: unknown, at: Field): string => {
    const s = c.string(v, at);
    if (s === "") {
      c.fail(`${nameOf(at)} must name a node`, RangeError);
    }
    return s;
  };
  const links = c.list(o["links"], field, {
    charge: ALL,
    each: (e, i) => {
      const one = c.record(e, place(field, i));
      const link: Omit<FrameFlowLink, "value"> & { value?: number | null } = {
        from: end(one["from"], place(field, i, ".from")),
        to: end(one["to"], place(field, i, ".to")),
      };
      const stage = one["stage"];
      if (stage !== undefined) {
        link.stage = c.string(stage, place(field, i, ".stage"));
      }
      const value = one["value"];
      if (value !== undefined) {
        link.value = c.part(value, place(field, i, ".value"));
      }
      return link;
    },
  }) as FrameFlowLink[];
  const nodes = c.optional(o["nodes"], (v) => {
    const key = c.unique(true);
    return c.list(v, `${f}.nodes`, {
      charge: ALL,
      each: (e, i) => ({
        key: key(c.record(e, place(`${f}.nodes`, i))["key"], place(`${f}.nodes`, i, ".key")),
      }),
    }) as { key: string }[];
  });
  if (nodes !== undefined) {
    listed(c, f, nodes, links);
  }
  const joined = new Set<string>();
  links.forEach((link, i) => {
    const stage = linkStage(c, f, place(field, i), link, stages);
    const join = JSON.stringify([link.from, link.to, stage]);
    if (joined.has(join)) {
      c.fail(
        `${indexed(field, i)} must not join ${JSON.stringify(link.from)} to ${JSON.stringify(link.to)} again`,
        RangeError,
      );
    }
    joined.add(join);
  });
  if (stages === undefined) {
    acyclic(c, f, links);
  }
  return {
    ...(nodes === undefined ? {} : { nodes }),
    ...(stages === undefined ? {} : { stages }),
    links,
  };
}

// Nodes, when given, list every node a link names and only those.
function listed(
  c: Checks,
  f: string,
  nodes: readonly { key: string }[],
  links: readonly FrameFlowLink[],
): void {
  const named = new Map(nodes.map((n) => [n.key, false]));
  links.forEach((link, i) => {
    for (const side of ["from", "to"] as const) {
      if (!named.has(link[side])) {
        c.fail(
          `${indexed(`${f}.links`, i)}.${side} must name a node ${f}.nodes lists, not ${JSON.stringify(link[side])}`,
          RangeError,
        );
      }
      named.set(link[side], true);
    }
  });
  nodes.forEach((n, i) => {
    if (named.get(n.key) !== true) {
      c.fail(
        `${indexed(`${f}.nodes`, i)} must be a node a link names, not ${JSON.stringify(n.key)}`,
        RangeError,
      );
    }
  });
}

// The stage a link leaves: the first with two stages and none named, none
// in a Sankey diagram, whose nodes are columns of their own.
function linkStage(
  c: Checks,
  f: string,
  at: () => string,
  link: FrameFlowLink,
  stages: readonly string[] | undefined,
): string {
  const { stage } = link;
  if (stages === undefined) {
    if (stage !== undefined) {
      c.fail(`${at()}.stage has no place without ${f}.stages`);
    }
    if (link.from === link.to) {
      c.fail(
        `${at()} must join two nodes, since a node joined to itself has no column`,
        RangeError,
      );
    }
    return "";
  }
  if (stage === undefined || stage === "") {
    if (stages.length === 2) {
      return stages[0] ?? "";
    }
    return c.fail(
      `${at()}.stage must name the stage it leaves, with three stages or more`,
      RangeError,
    );
  }
  const k = stages.indexOf(stage);
  if (k < 0) {
    c.fail(
      `${at()}.stage must name a stage ${f}.stages lists, not ${JSON.stringify(stage)}`,
      RangeError,
    );
  }
  if (k === stages.length - 1) {
    c.fail(`${at()}.stage must not be the last stage, which has no next`, RangeError);
  }
  return stage;
}

// Kahn's sort leaves the nodes on or after a loop unsorted.
function acyclic(c: Checks, f: string, links: readonly FrameFlowLink[]): void {
  const next = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const { from, to } of links) {
    const out = next.get(from);
    if (out === undefined) {
      next.set(from, [to]);
    } else {
      out.push(to);
    }
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
    incoming.set(from, incoming.get(from) ?? 0);
  }
  const ready = [...incoming].filter(([, k]) => k === 0).map(([n]) => n);
  let sorted = 0;
  for (let n = ready.pop(); n !== undefined; n = ready.pop()) {
    sorted++;
    for (const m of next.get(n) ?? []) {
      const k = (incoming.get(m) ?? 0) - 1;
      incoming.set(m, k);
      if (k === 0) {
        ready.push(m);
      }
    }
  }
  if (sorted < incoming.size) {
    c.fail(`${f}.links must not lead from a node back to it, a loop with no column`, RangeError);
  }
}

function eventsFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const key = c.unique(false);
  const rows = c.list(o["rows"], `${f}.rows`, {
    most: MAX_ROWS,
    why: "the most rows a strip holds",
    each: (e, r) => {
      const at = indexed(`${f}.rows`, r);
      const row = c.record(e, at);
      return {
        key: key(row["key"], `${at}.key`),
        at: c.list(row["at"], `${at}.at`, {
          charge: ONE_AT_LEAST,
          each: c.ordered(`${at}.at`, true),
        }),
      };
    },
  }) as EventsFrame["rows"];
  return { rows };
}

function statesFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const keys = c.list(o["keys"], `${f}.keys`, {
    charge: ALL,
    each: (v, i) =>
      v === null || typeof v === "string"
        ? v
        : c.fail(`${indexed(`${f}.keys`, i)} must be a string or null`),
  }) as (string | null)[];
  const at = c.list(o["at"], `${f}.at`, {
    per: [keys.length, "one per key"],
    each: c.ordered(`${f}.at`, false),
  }) as number[];
  return { keys, at };
}

const BOUNDS = ["low", "high", "optimum"] as const;

function valueFrame(c: Checks, o: Record<string, unknown>, f: string) {
  const key = c.unique(false);
  const field = `${f}.meters`;
  const meters = c.list(o["meters"], field, {
    charge: ALL,
    each: (e, i) => {
      const one = c.record(e, place(field, i));
      const id = key(one["key"], place(field, i, ".key"));
      const min = c.finite(one["min"], place(field, i, ".min"));
      const max = c.finite(one["max"], place(field, i, ".max"));
      if (!(min < max)) {
        c.fail(`${indexed(field, i)} must have min below max`, RangeError);
      }
      const inside = (v: unknown, name: string): number => {
        const n = c.finite(v, place(field, i, `.${name}`));
        if (n < min || n > max) {
          c.fail(`${indexed(field, i)}.${name} must lie from min to max`, RangeError);
        }
        return n;
      };
      const meter: FrameMeter = { key: id, value: inside(one["value"], "value"), min, max };
      for (const name of BOUNDS) {
        const v = one[name];
        if (v !== undefined) {
          meter[name] = inside(v, name);
        }
      }
      if (meter.low !== undefined && meter.high !== undefined && meter.low > meter.high) {
        c.fail(`${indexed(field, i)} must have low at or below high`, RangeError);
      }
      return meter;
    },
  }) as FrameMeter[];
  return { meters };
}

const DATA: Readonly<
  Record<FrameType, (c: Checks, o: Record<string, unknown>, f: string) => object>
> = {
  series: seriesFrame,
  bins: binsFrame,
  categories: categoriesFrame,
  boxes: boxesFrame,
  points: pointsFrame,
  grid: gridFrame,
  calendar: calendarFrame,
  tree: treeFrame,
  flow: flowFrame,
  events: eventsFrame,
  states: statesFrame,
  value: valueFrame,
};

// The frames whose values carry no one unit.
const NO_UNIT = new Set<FrameType>(["points", "events", "states"]);

/** A copy of frame `v`, of one of `types`, holding only the fields frame.ts
 *  names, each checked as chartdata's constructors check it and every list
 *  charged to `d` before it is read; throws a `TypeError` or `RangeError`
 *  naming the first field under `field` that breaks a rule. */
export function readFrame(v: unknown, field: string, d: Door, types: readonly FrameType[]): Frame {
  const c = checks(d);
  const o = c.record(v, field);
  const type = o["type"];
  if (!(isKind(type) && types.includes(type))) {
    return c.fail(
      `${field}.type must be ${words(types)}${typeof type === "string" ? `, not ${JSON.stringify(type)}` : ""}`,
    );
  }
  const name = c.string(o["name"], `${field}.name`);
  const unit = NO_UNIT.has(type) ? {} : { unit: c.string(o["unit"], `${field}.unit`) };
  const data = DATA[type](c, o, field);
  const refs = c.optional(o["refs"], (r) => c.refs(r, `${field}.refs`));
  const notes = c.optional(o["notes"], (n) => c.notes(n, `${field}.notes`));
  return {
    type,
    name,
    ...unit,
    ...data,
    ...(refs === undefined ? {} : { refs }),
    ...(notes === undefined ? {} : { notes }),
  } as Frame;
}
