/**
 * apply.ts — the one door a chartdata event passes before it changes a drawn
 * frame, read by the rules a frame is read by.
 * @module
 */
import type {
  BinsFrame,
  Frame,
  FrameEventKind,
  FrameType,
  SeriesFrame,
  StatesFrame,
} from "./frame.js";
import { MAX_MAGNITUDE, MAX_VALUES } from "./limits.js";
import { checks, door, MAGNITUDE, readFrame, TYPES, words } from "./read.js";

type Checks = ReturnType<typeof checks>;

type Door = ReturnType<typeof door>;

// Append and replace need columns or bins to add to, a reset a time line.
const TAKES: Readonly<Partial<Record<FrameType, readonly FrameEventKind[]>>> = {
  series: ["append", "replace", "reset", "set"],
  bins: ["append", "replace", "reset", "set"],
  states: ["reset", "set"],
};

const FIELDS = ["x", "x1", "x2", "values", "open", "at", ...Object.keys(TYPES)];

function fieldsOf(kind: FrameEventKind, type: FrameType): readonly string[] {
  switch (kind) {
    case "append":
      return type === "series" ? ["x", "values"] : ["x1", "x2", "values"];
    case "replace":
      return type === "series" ? ["values", "open"] : ["x1", "x2", "values", "open"];
    case "reset":
      return ["at"];
    case "set":
      return [type];
  }
}

const firstAt = (xs: readonly number[], keep: (x: number) => boolean): number => {
  const i = xs.findIndex(keep);
  return i < 0 ? xs.length : i;
};

const resetsFrom = (resets: readonly number[] | undefined, start: number) =>
  resets === undefined ? {} : { resets: resets.filter((r) => r >= start) };

function seriesFrom(f: SeriesFrame, start: number): SeriesFrame {
  const i = firstAt(f.x, (x) => x >= start);
  return {
    ...f,
    x: f.x.slice(i),
    series: f.series.map((s) => ({ ...s, values: s.values.slice(i) })),
    ...resetsFrom(f.resets, start),
  };
}

// The bins ending after `start`, so a bin `start` cuts stays, and the resets.
function binsFrom(f: BinsFrame, start: number): BinsFrame {
  const i = firstAt(f.x2, (x2) => x2 > start);
  return {
    ...f,
    x1: f.x1.slice(i),
    x2: f.x2.slice(i),
    series: f.series.map((s) => ({ ...s, values: s.values.slice(i) })),
    ...resetsFrom(f.resets, start),
  };
}

// readFrame holds a domain to two ends, a low below a high.
const endsOf = (domain: readonly number[]) => domain as readonly [number, number];

function spanOf(domain: readonly number[]): number {
  const [low, high] = endsOf(domain);
  return high - low;
}

// A domain of `span` ending at `end`, which a large `end` can round to no
// span and a wide span can start past the largest magnitude a value may have.
function slid(c: Checks, field: string, span: number, end: number): [number, number] {
  const start = end - span;
  if (!(start < end)) {
    c.fail(
      `${field} must keep the domain's span of ${String(span)}, which it rounds away at ${String(end)}`,
      RangeError,
    );
  }
  if (start < -MAX_MAGNITUDE) {
    c.fail(
      `${field} must not slide the domain's span of ${String(span)} to start below -${MAGNITUDE}`,
      RangeError,
    );
  }
  return [start, end];
}

// The domain an append slides the frame to, ending at `end`: its domain's
// span, else its data's extent from `from` to `to`. A frame with no extent
// has no span to keep, so it takes no domain and drops nothing until it has.
function windowOf(
  c: Checks,
  field: string,
  domain: readonly number[] | undefined,
  from: number | undefined,
  to: number | undefined,
  end: number,
): [number, number] | undefined {
  if (domain !== undefined) {
    return slid(c, field, spanOf(domain), end);
  }
  return from === undefined || to === undefined || !(to > from)
    ? undefined
    : slid(c, field, to - from, end);
}

// chartdata leaves an empty values list out, so a frame with no series takes
// an event without one.
const valuesOf = (c: Checks, o: Record<string, unknown>, n: number): (number | null)[] =>
  n === 0 && o["values"] === undefined
    ? []
    : (c.list(o["values"], "event.values", {
        per: [n, "one per series"],
        each: c.gaps("event.values"),
      }) as (number | null)[]);

// What chartdata charges the frame once its columns or rows are known.
function charge(d: Door, entries: number, series: number, f: Frame): void {
  d.add(Math.max(1, series) * entries + (f.refs?.length ?? 0) + (f.notes?.length ?? 0), "event");
}

function appendColumn(c: Checks, d: Door, f: SeriesFrame, o: Record<string, unknown>): Frame {
  const x = c.finite(o["x"], "event.x");
  const last = f.x.at(-1);
  if (last !== undefined && !(x > last)) {
    c.fail(`event.x must come after the frame's last x, ${String(last)}`, RangeError);
  }
  const values = valuesOf(c, o, f.series.length);
  const domain = windowOf(c, "event.x", f.domain, f.x[0], last, x);
  const { open: _open, ...rest } = f;
  const kept = domain === undefined ? rest : seriesFrom({ ...rest, domain }, domain[0]);
  charge(d, kept.x.length + 1, f.series.length, f);
  return {
    ...kept,
    x: [...kept.x, x],
    series: kept.series.map((s, i) => ({ ...s, values: [...s.values, values[i] ?? null] })),
  };
}

// `before` is the index of the bin the new one follows, -1 for none.
function bin(
  c: Checks,
  o: Record<string, unknown>,
  f: BinsFrame,
  before: number,
): readonly [number, number] {
  const x1 = c.finite(o["x1"], "event.x1");
  const x2 = c.finite(o["x2"], "event.x2");
  const lastX1 = f.x1[before];
  const lastX2 = f.x2[before];
  if (lastX1 !== undefined && !(x1 > lastX1)) {
    c.fail(`event.x1 must come after the bin before's x1, ${String(lastX1)}`, RangeError);
  }
  if (lastX2 !== undefined && x2 < lastX2) {
    c.fail(`event.x2 must not come before the bin before's x2, ${String(lastX2)}`, RangeError);
  }
  if (!(x2 > x1)) {
    c.fail("event.x2 must be above event.x1, where its bin starts", RangeError);
  }
  return [x1, x2];
}

function appendBin(c: Checks, d: Door, f: BinsFrame, o: Record<string, unknown>): Frame {
  const [x1, x2] = bin(c, o, f, f.x1.length - 1);
  const values = valuesOf(c, o, f.series.length);
  const domain = windowOf(c, "event.x2", f.domain, f.x1[0], f.x2.at(-1), x2);
  const { open: _open, ...rest } = f;
  const kept = domain === undefined ? rest : binsFrom({ ...rest, domain }, domain[0]);
  charge(d, kept.x1.length + 1, f.series.length, f);
  return {
    ...kept,
    x1: [...kept.x1, x1],
    x2: [...kept.x2, x2],
    series: kept.series.map((s, i) => ({ ...s, values: [...s.values, values[i] ?? null] })),
  };
}

const lastSet = <T>(xs: readonly T[], last: number, v: T): T[] => [...xs.slice(0, last), v];

function edges(c: Checks, o: Record<string, unknown>, f: BinsFrame, last: number) {
  const [x1, x2] = bin(c, o, f, last - 1);
  return { x1: lastSet(f.x1, last, x1), x2: lastSet(f.x2, last, x2) };
}

function replace(c: Checks, f: SeriesFrame | BinsFrame, o: Record<string, unknown>): Frame {
  const bins = f.type === "bins" ? (f as BinsFrame) : undefined;
  const last = (bins?.x1 ?? (f as SeriesFrame).x).length - 1;
  const moved = bins === undefined ? {} : edges(c, o, bins, last);
  const values = valuesOf(c, o, f.series.length);
  const open = c.optional(o["open"], (v) => c.boolean(v, "event.open"));
  if (last < 0) {
    c.fail(
      `event has no ${bins === undefined ? "column" : "bin"} to replace, the frame holds none`,
      RangeError,
    );
  }
  const { open: _open, ...rest } = f;
  return {
    ...rest,
    ...moved,
    series: f.series.map((s, i) => ({ ...s, values: lastSet(s.values, last, values[i] ?? null) })),
    ...(open === true ? { open } : {}),
  };
}

function reset(d: Door, f: Frame, at: number): Frame {
  if (f.type === "states") {
    const states = f as StatesFrame;
    if (states.at.includes(at)) {
      return { ...states };
    }
    const i = firstAt(states.at, (v) => v > at);
    charge(d, states.keys.length + 1, 1, f);
    return {
      ...states,
      keys: [...states.keys.slice(0, i), null, ...states.keys.slice(i)],
      at: [...states.at.slice(0, i), at, ...states.at.slice(i)],
    };
  }
  const line = f as SeriesFrame | BinsFrame;
  const resets = line.resets ?? [];
  if (resets.includes(at)) {
    return { ...line };
  }
  if (resets.length >= MAX_VALUES) {
    d.fail(
      `event.at must not take the frame's resets past ${String(MAX_VALUES)} entries, the most values a frame holds`,
      RangeError,
    );
  }
  const i = firstAt(resets, (r) => r > at);
  return { ...line, resets: [...resets.slice(0, i), at, ...resets.slice(i)] };
}

// A frame drawn with a domain keeps its span, ending where the sent frame's
// domain ends; a sent domain drops the columns, bins and resets before it.
function set(c: Checks, drawn: Frame, sent: Frame): Frame {
  if (sent.type !== "series" && sent.type !== "bins") {
    return sent;
  }
  const s = sent as SeriesFrame | BinsFrame;
  if (s.domain === undefined) {
    return sent;
  }
  const [low, high] = endsOf(s.domain);
  const kept = (drawn as SeriesFrame | BinsFrame).domain;
  const domain: [number, number] =
    kept === undefined ? [low, high] : slid(c, `event.${s.type}.domain`, spanOf(kept), high);
  const [start] = domain;
  return s.type === "series"
    ? seriesFrom({ ...(s as SeriesFrame), domain }, start)
    : binsFrom({ ...(s as BinsFrame), domain }, start);
}

/**
 * The frame of `frame`'s type chartdata's `event` makes of drawn `frame`,
 * left unchanged; both share the parts the event keeps, so treat them as
 * read-only. `frame` must be one the chart reads, such as an earlier result:
 * it is not checked. A broken event throws a `TypeError` or `RangeError`,
 * `applyEvent:` then the first field under `event` that breaks a rule;
 * fields the contract does not name are ignored.
 */
export const applyEvent = <F extends Frame>(frame: F, event: unknown): F =>
  applied(frame, event) as F;

function applied(frame: Frame, event: unknown): Frame {
  const d = door("applyEvent", MAX_VALUES);
  const c = checks(d);
  const o = c.record(event, "event");
  c.string(o["key"], "event.key");
  const { type } = frame;
  const kinds = (Object.hasOwn(TAKES, type) ? TAKES[type] : undefined) ?? ["set"];
  const kind = o["kind"];
  if (!(typeof kind === "string" && (kinds as readonly string[]).includes(kind))) {
    return c.fail(
      `event.kind must be ${words(kinds)} on a ${type} frame${typeof kind === "string" ? `, not ${JSON.stringify(kind)}` : ""}`,
    );
  }
  const k = kind as FrameEventKind;
  const fields = fieldsOf(k, type);
  for (const field of FIELDS) {
    if (o[field] !== undefined && !fields.includes(field)) {
      c.fail(`event.${field} has no place in the ${k} event of a ${type} frame`);
    }
  }
  switch (k) {
    case "append":
      return type === "series"
        ? appendColumn(c, d, frame as SeriesFrame, o)
        : appendBin(c, d, frame as BinsFrame, o);
    case "replace":
      return replace(c, frame as SeriesFrame | BinsFrame, o);
    case "reset":
      return reset(d, frame, c.finite(o["at"], "event.at"));
    case "set":
      return set(c, frame, readFrame(o[type], `event.${type}`, d, [type]));
  }
}
