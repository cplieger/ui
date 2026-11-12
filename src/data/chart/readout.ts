/**
 * readout.ts — what the legend row reads: the whole chart with no
 * selection, or a selected bucket, sample, post or row, and the widths its
 * slots keep so the row never changes size.
 * @module
 */

import { noun, withNoun, type Unit } from "../scale/format.js";
import type { Measure } from "../scale/measure.js";

import type { DotModel, LineModel, Model, RectModel, SeriesModel } from "./model.js";
import type { Words } from "./words.js";

/** One legend entry: a series' chip with its value, or a bare value. */
interface Entry {
  readonly slot: number | undefined;
  readonly name: string | undefined;
  readonly value: string;
}

export interface Reading {
  /** The x it reads, or a dot row's name. */
  readonly at: string;
  readonly entries: readonly Entry[];
  /** A stack's total, absent without one. */
  readonly total: string | undefined;
}

/** The mark the legend row reads: the first rect, line or dot. */
type Primary = RectModel | LineModel | DotModel;

export function primaryOf(model: Model): Primary | undefined {
  for (const m of model.marks) {
    if (m.kind !== "rule") {
      return m;
    }
  }
  return undefined;
}

export const counted = (
  value: string,
  count: number,
  unit: Unit | undefined,
  model: Model,
): string => (unit === undefined ? value : withNoun(value, noun(unit, count, model.locale)));

/** The x domain in words, `underRange` when a log x's underflow bin is drawn below it. */
export function domainText(model: Model, words: Words): string {
  const { x, xText } = model;
  return x.under?.drawn === "below"
    ? words.underRange(xText(x.lo), xText(x.hi))
    : words.range(xText(x.lo), xText(x.hi));
}

/** Bucket `i` of `m` in words: its interval, the underflow bin's "under",
 *  and an open last bucket's "so far". */
export function bucketText(model: Model, m: RectModel, i: number, words: Words): string {
  const under = model.x.under;
  const x2 = model.xText(m.x2[i] ?? 0);
  const text =
    under !== undefined && model.marks[under.mark] === m && under.index === i
      ? words.under(x2)
      : words.range(model.xText(m.x1[i] ?? 0), x2);
  return m.open && i === m.x1.length - 1 ? words.soFar(text) : text;
}

const valueOf = (model: Model, v: number | null, words: Words) =>
  v === null ? words.noData : model.yText(v);

// One series' entries, or a bare value with the y unit for a lone series.
function entries(
  model: Model,
  series: readonly SeriesModel[],
  value: (s: SeriesModel) => number | null,
  words: Words,
): Entry[] {
  const unit = model.spec.y?.unit;
  if (series.length === 1) {
    const v = series[0] === undefined ? null : value(series[0]);
    const text = v === null ? words.noData : counted(model.yText(v), v, unit, model);
    return [{ slot: undefined, name: undefined, value: text }];
  }
  return series.map((s) => ({
    slot: s.slot,
    name: s.name,
    value: valueOf(model, value(s), words),
  }));
}

const sum = (s: SeriesModel, shown: readonly number[]) =>
  shown.reduce((n, i) => n + (s.y[i] ?? 0), 0);

/** The last sample inside the domain where series `s` has a value, or -1. */
export function lastSample(m: LineModel, s: SeriesModel): number {
  for (let i = m.to - 1; i >= m.from; i--) {
    if (s.y[i] !== null) {
      return i;
    }
  }
  return -1;
}

const dots = (m: DotModel) => m.rows.reduce((n, r) => n + r.to - r.from, 0);

/** The legend row with no selection: a stack's or a histogram's totals over
 *  the domain, a dot chart's count, a line's last values. */
export function overall(model: Model, words: Words): Reading | undefined {
  const m = primaryOf(model);
  switch (m?.kind) {
    case undefined:
      return undefined;
    case "rect": {
      const all = entries(model, m.series, (s) => sum(s, m.shown), words);
      const total =
        m.series.length > 1
          ? model.yText(m.series.reduce((n, s) => n + sum(s, m.shown), 0))
          : undefined;
      return { at: domainText(model, words), entries: all, total };
    }
    case "line": {
      const last = Math.max(...m.series.map((s) => lastSample(m, s)));
      const at = last === -1 ? domainText(model, words) : model.xText(m.x[last] ?? 0);
      const value = (s: SeriesModel) => {
        const i = lastSample(m, s);
        return i === -1 ? null : (s.y[i] ?? null);
      };
      return { at, entries: entries(model, m.series, value, words), total: undefined };
    }
    case "dot": {
      const n = dots(m);
      const value = counted(model.yText(n), n, m.unit, model);
      return {
        at: domainText(model, words),
        entries: [{ slot: undefined, name: undefined, value }],
        total: undefined,
      };
    }
  }
}

/** Bucket `i` of `m`: its interval, each series' value and a stack's total. */
export function bucketReading(model: Model, m: RectModel, i: number, words: Words): Reading {
  const total =
    m.series.length > 1 ? model.yText(m.series.reduce((n, s) => n + (s.y[i] ?? 0), 0)) : undefined;
  return {
    at: bucketText(model, m, i, words),
    entries: entries(model, m.series, (s) => s.y[i] ?? null, words),
    total,
  };
}

/** Sample `i` of `m`: its x and each series' value there. */
export function sampleReading(model: Model, m: LineModel, i: number, words: Words): Reading {
  return {
    at: model.xText(m.x[i] ?? 0),
    entries: entries(model, m.series, (s) => s.y[i] ?? null, words),
    total: undefined,
  };
}

const span = (model: Model, x: ArrayLike<number>, from: number, to: number, words: Words) =>
  words.range(model.xText(x[from] ?? 0), model.xText(x[to - 1] ?? 0));

const bare = (value: string): Entry[] => [{ slot: undefined, name: undefined, value }];

/** The posts `[from, to)` of row `r` that share a pixel: one post's time, or
 *  their count and span. */
export function postReading(
  model: Model,
  m: DotModel,
  r: number,
  from: number,
  to: number,
  words: Words,
): Reading {
  const row = m.rows[r];
  const x = row?.x ?? [];
  const value =
    to - from === 1
      ? model.xText(x[from] ?? 0)
      : `${counted(model.yText(to - from), to - from, m.unit, model)}, ${span(model, x, from, to, words)}`;
  return { at: row?.name ?? "", entries: bare(value), total: undefined };
}

/** Row `r` as a whole: its count and span, or for a silent row the whole of
 *  `words.silentRow`. */
export function rowReading(model: Model, m: DotModel, r: number, words: Words): Reading {
  const row = m.rows[r];
  const name = row?.name ?? "";
  const n = row === undefined ? 0 : row.to - row.from;
  if (row === undefined || n === 0) {
    return { at: words.silentRow(name, m.unit?.other ?? ""), entries: bare(""), total: undefined };
  }
  const value = `${counted(model.yText(n), n, m.unit, model)}, ${span(model, row.x, row.from, row.to, words)}`;
  return { at: name, entries: bare(value), total: undefined };
}

/** The legend's slot widths, in px. */
export interface Widths {
  readonly at: number;
  readonly values: readonly number[];
  readonly total: number;
}

const HALF_HOUR = 1_800_000;
const SAMPLE = 256;

// Indices of `[from, to)` whose x text can differ in width: on a time x one
// per half hour, since every digit is as wide as another; else at most 256
// spread evenly, with the ends.
function spread(model: Model, x: ArrayLike<number>, from: number, to: number): number[] {
  const out: number[] = [];
  if (model.x.type === "time") {
    let last = Number.NaN;
    for (let i = from; i < to; i++) {
      const slot = Math.floor((x[i] ?? 0) / HALF_HOUR);
      if (slot !== last) {
        out.push(i);
        last = slot;
      }
    }
    return out;
  }
  const step = Math.max(1, Math.ceil((to - from) / SAMPLE));
  for (let i = from; i < to; i += step) {
    out.push(i);
  }
  if (to > from) {
    out.push(to - 1);
  }
  return out;
}

// The widest texts of a series' values: the extremes and an even spread.
function valueCandidates(s: SeriesModel, indices: readonly number[]): (number | null)[] {
  const known = s.y.filter((v) => v !== null);
  const lo = known.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  const hi = known.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
  return [...indices.map((i) => s.y[i] ?? null), ...(known.length > 0 ? [lo, hi] : []), null];
}

const widest = (texts: Iterable<string>, measure: Measure): number => {
  let w = 0;
  for (const t of texts) {
    w = Math.max(w, measure.number(t));
  }
  return w;
};

/** Each slot's width over every reading the chart can show, measured by
 *  `measure` with numbers as tabular figures. */
export function readoutWidths(model: Model, words: Words, measure: Measure): Widths {
  const m = primaryOf(model);
  const none = overall(model, words);
  const at = [none?.at ?? ""];
  const values: string[][] = (none?.entries ?? []).map((e) => [e.value]);
  const totals = [none?.total ?? ""];
  const add = (r: Reading) => {
    at.push(r.at);
    r.entries.forEach((e, k) => values[k]?.push(e.value));
    totals.push(r.total ?? "");
  };
  if (m?.kind === "rect") {
    for (const i of m.shown) {
      add(bucketReading(model, m, i, words));
    }
  } else if (m?.kind === "line") {
    const indices = spread(model, m.x, m.from, m.to);
    for (const i of indices) {
      at.push(model.xText(m.x[i] ?? 0));
    }
    const unit = model.spec.y?.unit;
    m.series.forEach((s, k) => {
      for (const v of valueCandidates(s, indices)) {
        values[k]?.push(
          v === null
            ? words.noData
            : m.series.length === 1
              ? counted(model.yText(v), v, unit, model)
              : model.yText(v),
        );
      }
    });
  } else if (m?.kind === "dot") {
    let instant = "";
    m.rows.forEach((row, r) => {
      add(rowReading(model, m, r, words));
      at.push(row.name);
      for (const i of spread(model, row.x, row.from, row.to)) {
        const text = model.xText(row.x[i] ?? 0);
        if (measure.number(text) > measure.number(instant)) {
          instant = text;
        }
      }
    });
    values[0]?.push(instant);
    // Posts that share a pixel read a count and a span: no wider than the
    // largest row's count over the widest instant's span.
    const most = m.rows.reduce((n, row) => Math.max(n, row.to - row.from), 0);
    values[0]?.push(
      `${counted(model.yText(most), most, m.unit, model)}, ${words.range(instant, instant)}`,
    );
  }
  return {
    at: widest(at, measure),
    values: values.map((texts) => widest(texts, measure)),
    total: widest(totals, measure),
  };
}
