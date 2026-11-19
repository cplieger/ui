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
import { MAX_VALUES } from "./limits.js";
import { checks, door, KINDS, readFrame, words } from "./read.js";

type Checks = ReturnType<typeof checks>;

type Door = ReturnType<typeof door>;

// Append and replace need columns or bins to add to, a reset a time line.
const TAKES: Readonly<Partial<Record<FrameType, readonly FrameEventKind[]>>> = {
  series: ["append", "replace", "reset", "set"],
  bins: ["append", "replace", "reset", "set"],
  states: ["reset", "set"],
};

const FIELDS = ["x", "x1", "x2", "values", "open", "at", ...Object.keys(KINDS)];

// The fields an event of `kind` may hold on a frame of `type`.
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

// The columns at or after `start`, and the resets.
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

// The span an axis covers, its domain or else its data's extent.
const spanOf = (domain: readonly number[] | undefined, from: number, to: number): number =>
  domain === undefined ? to - from : (domain[1] ?? 0) - (domain[0] ?? 0);

// A domain of `span` ending at `end`, which a large `end` can round to no span.
function slid(c: Checks, field: string, span: number, end: number): number[] {
  const start = end - span;
  if (!(start < end)) {
    c.fail(
      `${field} must keep the domain's span of ${String(span)}, which it rounds away at ${String(end)}`,
      RangeError,
    );
  }
  return [start, end];
}

const valuesOf = (c: Checks, o: Record<string, unknown>, n: number): (number | null)[] =>
  c.list(o["values"], "event.values", {
    per: [n, "one per series"],
    each: c.gaps("event.values"),
  }) as (number | null)[];

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
  const span = spanOf(f.domain, f.x[0] ?? x, last ?? x);
  const domain = f.domain === undefined ? undefined : slid(c, "event.x", span, x);
  const { open: _open, ...rest } = f;
  const kept = seriesFrom({ ...rest, ...(domain === undefined ? {} : { domain }) }, x - span);
  charge(d, kept.x.length + 1, f.series.length, f);
  return {
    ...kept,
    x: [...kept.x, x],
    series: kept.series.map((s, i) => ({ ...s, values: [...s.values, values[i] ?? null] })),
  };
}

// A bin starts after the last bin starts, ends at or after it ends, and ends
// after it starts; `before` is the bin it follows, if any.
function bin(c: Checks, o: Record<string, unknown>, f: BinsFrame, before: number): number[] {
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
  const [x1 = 0, x2 = 0] = bin(c, o, f, f.x1.length - 1);
  const values = valuesOf(c, o, f.series.length);
  const span = spanOf(f.domain, f.x1[0] ?? x1, f.x2.at(-1) ?? x2);
  const domain = f.domain === undefined ? undefined : slid(c, "event.x2", span, x2);
  const { open: _open, ...rest } = f;
  const kept = binsFrom({ ...rest, ...(domain === undefined ? {} : { domain }) }, x2 - span);
  charge(d, kept.x1.length + 1, f.series.length, f);
  return {
    ...kept,
    x1: [...kept.x1, x1],
    x2: [...kept.x2, x2],
    series: kept.series.map((s, i) => ({ ...s, values: [...s.values, values[i] ?? null] })),
  };
}

function replace(c: Checks, f: SeriesFrame | BinsFrame, o: Record<string, unknown>): Frame {
  const bins = f.type === "bins" ? (f as BinsFrame) : undefined;
  const last = (bins?.x1 ?? (f as SeriesFrame).x).length - 1;
  const edges = bins === undefined ? undefined : bin(c, o, bins, last - 1);
  const values = valuesOf(c, o, f.series.length);
  const open = c.optional(o["open"], (v) => c.boolean(v, "event.open"));
  if (last < 0) {
    c.fail(
      `event has no ${bins === undefined ? "column" : "bin"} to replace, the frame holds none`,
      RangeError,
    );
  }
  const { open: _open, ...rest } = f;
  const at = <T>(xs: readonly T[], v: T): T[] => [...xs.slice(0, last), v];
  return {
    ...rest,
    ...(bins === undefined || edges === undefined
      ? {}
      : { x1: at(bins.x1, edges[0] ?? 0), x2: at(bins.x2, edges[1] ?? 0) }),
    series: f.series.map((s, i) => ({ ...s, values: at(s.values, values[i] ?? null) })),
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
  const [low, high] = s.domain ?? [];
  if (low === undefined || high === undefined) {
    return sent;
  }
  const kept = (drawn as SeriesFrame | BinsFrame).domain;
  const domain =
    kept === undefined ? s.domain : slid(c, `event.${s.type}.domain`, spanOf(kept, 0, 0), high);
  const start = domain?.[0] ?? low;
  return s.type === "series"
    ? seriesFrom({ ...(s as SeriesFrame), ...(domain === undefined ? {} : { domain }) }, start)
    : binsFrom({ ...(s as BinsFrame), ...(domain === undefined ? {} : { domain }) }, start);
}

/**
 * The frame chartdata's `event` makes of drawn `frame`, left unchanged; both
 * share the parts the event keeps, so treat them as read-only. A broken event
 * throws a `TypeError` or `RangeError`, `applyEvent:` then the first field
 * under `event` that breaks a rule; fields the contract does not name are
 * ignored.
 */
export function applyEvent(frame: Frame, event: unknown): Frame {
  const d = door("applyEvent", MAX_VALUES);
  const c = checks(d);
  const o = c.record(event, "event");
  c.string(o["key"], "event.key");
  const { type } = frame;
  const kinds = TAKES[type] ?? ["set"];
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
