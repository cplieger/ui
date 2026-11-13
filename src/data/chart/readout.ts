/**
 * readout.ts — what the legend row reads: the whole chart with no
 * selection, or a selected bucket, sample, post or row, and the widths its
 * slots keep so the row never changes size.
 * @module
 */

import { formatter, noun, withNoun, type Unit } from "../scale/format.js";
import type { Measure } from "../scale/measure.js";

import {
  barsApart,
  barTotal,
  bucketTotal,
  drawnTotal,
  sampleTotal,
  sampleValue,
  type AreaModel,
  type BarModel,
  type BarSeriesModel,
  type DotModel,
  type LineModel,
  type Model,
  type RectModel,
  type SampleModel,
  type SeriesModel,
} from "./model.js";
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

/** The mark the legend row reads: the chart's one rect, line, area, dot or bar. */
type Primary = RectModel | LineModel | AreaModel | DotModel | BarModel;

export function primaryOf(model: Model): Primary | undefined {
  for (const m of model.marks) {
    if (m.kind !== "rule" && m.kind !== "text") {
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
    : words.range(...model.xSpan(x.lo, x.hi));
}

// The legend row's x reading starts its line, so an underflow range reads as
// the bin does ("Under 1 sec to 3 days"), where `underRange` is a clause.
function legendDomain(model: Model, words: Words): string {
  const { x, xText } = model;
  return x.under?.drawn === "below"
    ? words.range(words.under(xText(x.lo)), xText(x.hi))
    : domainText(model, words);
}

/** Bucket `i` of `m` in words: its interval, the underflow bin's "under",
 *  and an open last bucket's "so far". */
export function bucketText(model: Model, m: RectModel, i: number, words: Words): string {
  const under = model.x.under;
  const text =
    under !== undefined && model.marks[under.mark] === m && under.index === i
      ? words.under(model.xText(m.x2[i] ?? 0))
      : words.range(...model.xSpan(m.x1[i] ?? 0, m.x2[i] ?? 0));
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
export function lastSample(m: SampleModel, s: SeriesModel): number {
  for (let i = m.to - 1; i >= m.from; i--) {
    if (s.y[i] !== null) {
      return i;
    }
  }
  return -1;
}

/** The last sample inside the domain where area `m` draws its stack, or -1. */
export function lastStack(m: AreaModel): number {
  for (let i = m.to - 1; i >= m.from; i--) {
    if (drawnTotal(m, i) !== null) {
      return i;
    }
  }
  return -1;
}

/** Series `s`'s value at sample `i` of `m` as the readings and the table
 *  write it: under "share" its share of the total, or its value when the
 *  total is 0 or another series is a gap, which leave no shares. */
export function samplePart(
  model: Model,
  m: SampleModel,
  s: SeriesModel,
  i: number,
  words: Words,
): string {
  const v = s.y[i] ?? null;
  if (v === null) {
    return words.noData;
  }
  if (m.kind === "area" && m.arrange === "share") {
    const total = drawnTotal(m, i);
    return total === null ? model.amountText(v) : model.yText(v / total);
  }
  return model.yText(v);
}

// An area's total in a reading: under "share" with its unit, since the
// shares beside it have none.
function areaTotal(model: Model, m: AreaModel, n: number): string {
  return m.arrange === "share"
    ? counted(model.amountText(n), n, model.spec.y?.unit, model)
    : model.yText(n);
}

// Sample `i`'s stack total in a reading: absent for one series, No data at a gap.
function stackText(model: Model, m: SampleModel, i: number, words: Words): string | undefined {
  if (m.kind !== "area" || m.series.length < 2) {
    return undefined;
  }
  const total = sampleTotal(m, i);
  return total === null ? words.noData : areaTotal(model, m, total);
}

/** Whether a rect reads a total: a stack of two or more series. A group
 *  compares its series, and a total read from one misleads. */
export const totalled = (m: RectModel): boolean => m.series.length > 1 && m.arrange !== "group";

/** Series `s`'s value in bucket `i` as the readings and the table write it:
 *  under "share" its share of the bucket's total, or its value when the
 *  total is 0, which has no shares. */
export function partText(
  model: Model,
  m: RectModel,
  s: SeriesModel,
  i: number,
  words: Words,
): string {
  const v = s.y[i] ?? null;
  if (v === null) {
    return words.noData;
  }
  const total = m.arrange === "share" ? bucketTotal(m, i) : 0;
  return total > 0 ? model.yText(v / total) : model.amountText(v);
}

// A rect's total: under "share" with its unit, since the shares beside it have none.
function totalText(model: Model, m: RectModel, n: number): string {
  return m.arrange === "share"
    ? counted(model.amountText(n), n, model.spec.y?.unit, model)
    : model.yText(n);
}

const dots = (m: DotModel) => m.rows.reduce((n, r) => n + r.to - r.from, 0);

/** A band chart's row count in words: in the y scale's unit, or as categories. */
export function rowsText(model: Model, words: Words): string {
  const n = model.y.type === "band" ? model.y.rows.length : 0;
  const count = formatter("number", model.locale)(n);
  const unit = model.spec.y?.unit;
  return unit === undefined ? words.categories(count) : counted(count, n, unit, model);
}

/** Series `s`'s value in row `i` as the readings and the table write it,
 *  a gap as No data: under "share" its share of the row's total, or its
 *  value when the total is 0, which has no shares. */
export function barPart(
  model: Model,
  m: BarModel,
  s: BarSeriesModel,
  i: number,
  words: Words,
): string {
  const v = s.x[i] ?? null;
  if (v === null) {
    return words.noData;
  }
  const total = m.arrange === "share" ? (barTotal(m, i) ?? 0) : 0;
  return total > 0 ? model.xText(v / total) : model.amountText(v);
}

// A bar row's total in a reading: under "share" with its unit, since the
// shares beside it have none.
function barTotalText(model: Model, m: BarModel, total: number | null, words: Words): string {
  if (total === null) {
    return words.noData;
  }
  return m.arrange === "share"
    ? counted(model.amountText(total), total, model.spec.x.unit, model)
    : model.xText(total);
}

/** Row `r` of bar mark `m`: its name, each series' value or share, and
 *  from two series up the row's total unless its bars stand apart. */
export function barReading(model: Model, m: BarModel, r: number, words: Words): Reading {
  const at = model.y.type === "band" ? (model.y.rows[r] ?? "") : "";
  if (m.series.length === 1) {
    const v = m.series[0]?.x[r] ?? null;
    const unit = model.spec.x.unit;
    const value = v === null ? words.noData : counted(model.xText(v), v, unit, model);
    return { at, entries: bare(value), total: undefined };
  }
  const all = m.series.map((s) => ({
    slot: s.slot,
    name: s.name,
    value: barPart(model, m, s, r, words),
  }));
  const total = barsApart(m) ? undefined : barTotalText(model, m, barTotal(m, r), words);
  return { at, entries: all, total };
}

/** The legend row with no selection: a rect's series totals over the
 *  domain with a stack's grand total, a dot chart's count, a line's last
 *  values, an area's last whole stack, a bar chart's row count. */
export function overall(model: Model, words: Words): Reading | undefined {
  const m = primaryOf(model);
  switch (m?.kind) {
    case undefined:
      return undefined;
    case "rect": {
      const grand = m.series.reduce((n, s) => n + sum(s, m.shown), 0);
      const all =
        m.arrange === "share"
          ? m.series.map((s) => ({
              slot: s.slot,
              name: s.name,
              value:
                grand > 0
                  ? model.yText(sum(s, m.shown) / grand)
                  : model.amountText(sum(s, m.shown)),
            }))
          : entries(model, m.series, (s) => sum(s, m.shown), words);
      const total = totalled(m) ? totalText(model, m, grand) : undefined;
      return { at: legendDomain(model, words), entries: all, total };
    }
    case "area": {
      const last = lastStack(m);
      if (last === -1) {
        return {
          at: legendDomain(model, words),
          entries: entries(model, m.series, () => null, words),
          total: m.series.length > 1 ? words.noData : undefined,
        };
      }
      return sampleReading(model, m, last, words);
    }
    case "line": {
      const last = Math.max(...m.series.map((s) => lastSample(m, s)));
      const at = last === -1 ? legendDomain(model, words) : model.xText(m.x[last] ?? 0);
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
        at: legendDomain(model, words),
        entries: [{ slot: undefined, name: undefined, value }],
        total: undefined,
      };
    }
    case "bar":
      // A category's values need not add up across rows (a median age), so
      // the row has no whole-chart figure to show.
      return {
        at: rowsText(model, words),
        entries:
          m.series.length === 1
            ? bare("")
            : m.series.map((s) => ({ slot: s.slot, name: s.name, value: "" })),
        total: !barsApart(m) && m.series.length > 1 ? "" : undefined,
      };
  }
}

/** Bucket `i` of `m`: its interval, each series' value or share and a
 *  stack's total, none for a group. */
export function bucketReading(model: Model, m: RectModel, i: number, words: Words): Reading {
  const total = totalled(m) ? totalText(model, m, bucketTotal(m, i)) : undefined;
  const all =
    m.series.length > 1
      ? m.series.map((s) => ({
          slot: s.slot,
          name: s.name,
          value: partText(model, m, s, i, words),
        }))
      : entries(model, m.series, (s) => s.y[i] ?? null, words);
  return { at: bucketText(model, m, i, words), entries: all, total };
}

/** Sample `i` of `m`: its x, each series' value or share there and a stack's total. */
export function sampleReading(model: Model, m: SampleModel, i: number, words: Words): Reading {
  const all =
    m.series.length > 1
      ? m.series.map((s) => ({
          slot: s.slot,
          name: s.name,
          value: samplePart(model, m, s, i, words),
        }))
      : entries(model, m.series, (s) => s.y[i] ?? null, words);
  return { at: model.xText(m.x[i] ?? 0), entries: all, total: stackText(model, m, i, words) };
}

const span = (model: Model, x: ArrayLike<number>, from: number, to: number, words: Words) =>
  words.range(...model.xSpan(x[from] ?? 0, x[to - 1] ?? 0));

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

/** Every time zone's offset from UTC is a whole number of quarter hours. */
const QUARTER_HOUR = 900_000;
const SAMPLE = 256;

// Indices of `[from, to)` whose x text can differ in width: on a time x one
// per quarter hour, inside which every zone's local hour and day hold, since
// every digit is as wide as another; else at most 256 spread evenly, with the ends.
function spread(model: Model, x: ArrayLike<number>, from: number, to: number): number[] {
  const out: number[] = [];
  if (model.x.type === "time") {
    let last = Number.NaN;
    for (let i = from; i < to; i++) {
      const slot = Math.floor((x[i] ?? 0) / QUARTER_HOUR);
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

// The least and greatest of `values`, skipping nulls; none when all are.
function extremes(values: Iterable<number | null>): number[] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v !== null) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return lo <= hi ? [lo, hi] : [];
}

// The values `at` gives for `[from, to)`.
function* over(from: number, to: number, at: (i: number) => number | null) {
  for (let i = from; i < to; i++) {
    yield at(i);
  }
}

// The widest texts series `s` of `m` can read: an even spread, the extremes
// (under "share" of its shares and of the values read where no shares are),
// and No data.
function valueTexts(
  model: Model,
  m: SampleModel,
  s: SeriesModel,
  indices: readonly number[],
  words: Words,
): string[] {
  const out = [words.noData];
  if (m.kind === "area" && m.arrange === "share") {
    out.push(...indices.map((i) => samplePart(model, m, s, i, words)));
    out.push(
      ...extremes(over(m.from, m.to, (i) => sampleValue(m, s, i))).map((v) => model.yText(v)),
    );
    const unshared = (i: number) => (drawnTotal(m, i) === null ? (s.y[i] ?? null) : null);
    out.push(...extremes(over(m.from, m.to, unshared)).map((v) => model.amountText(v)));
    return out;
  }
  const write = (v: number) =>
    m.series.length === 1 ? counted(model.yText(v), v, model.spec.y?.unit, model) : model.yText(v);
  const values = [...indices.map((i) => s.y[i] ?? null), ...extremes(s.y)];
  out.push(...values.map((v) => (v === null ? words.noData : write(v))));
  return out;
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
  } else if (m?.kind === "line" || m?.kind === "area") {
    const indices = spread(model, m.x, m.from, m.to);
    for (const i of indices) {
      at.push(model.xText(m.x[i] ?? 0));
    }
    m.series.forEach((s, k) => {
      values[k]?.push(...valueTexts(model, m, s, indices, words));
    });
    if (m.kind === "area" && m.series.length > 1) {
      // The widest totals: the spread's, the extremes, and No data.
      for (const i of indices) {
        totals.push(stackText(model, m, i, words) ?? "");
      }
      const all = extremes(over(m.from, m.to, (i) => sampleTotal(m, i)));
      totals.push(words.noData, ...all.map((n) => areaTotal(model, m, n)));
    }
  } else if (m?.kind === "bar") {
    for (let r = 0; r < (model.y.type === "band" ? model.y.rows.length : 0); r++) {
      add(barReading(model, m, r, words));
    }
  } else if (m?.kind === "dot") {
    // Each post's time, written once per stretch of x in which its width holds.
    const posts = new Map<string, number>();
    m.rows.forEach((row, r) => {
      add(rowReading(model, m, r, words));
      at.push(row.name);
      for (const i of spread(model, row.x, row.from, row.to)) {
        const v = row.x[i] ?? 0;
        const slot = model.x.type === "time" ? String(Math.floor(v / QUARTER_HOUR)) : String(v);
        if (!posts.has(slot)) {
          posts.set(slot, v);
        }
      }
    });
    let instant = "";
    let instantW = 0;
    for (const v of posts.values()) {
      const text = model.xText(v);
      const w = measure.number(text);
      if (w > instantW) {
        instant = text;
        instantW = w;
      }
    }
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
