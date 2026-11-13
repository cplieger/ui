/**
 * readout.ts — what the legend row reads: the whole chart with no
 * selection, or a selected bucket, sample, post or row, and the widths its
 * slots keep so the row never changes size.
 * @module
 */

import { formatter, noun, signedFormatter, withNoun, type Unit } from "../scale/format.js";
import type { Measure } from "../scale/measure.js";

import {
  barsApart,
  barTotal,
  bucketTotal,
  drawnTotal,
  pointLink,
  sampleTotal,
  sampleValue,
  type AreaModel,
  type BarModel,
  type BarSeriesModel,
  type DotModel,
  type LineModel,
  type Model,
  type PointModel,
  type PointSeriesModel,
  type RectModel,
  type SampleModel,
  type ScatterModel,
  type SeriesModel,
  type SlopeModel,
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
  /** A stack's total, or a range plot's gap or an arrow plot's change,
   *  under `totalWord`; absent without one. */
  readonly total: string | undefined;
  /** The entry of the series chosen, whose chip name turns semibold. */
  readonly chosen?: number;
}

/** The mark the legend row reads: the chart's one data mark. */
type Primary =
  RectModel | LineModel | AreaModel | DotModel | BarModel | PointModel | SlopeModel | ScatterModel;

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
  return unit === undefined ? words.categories(count, n) : counted(count, n, unit, model);
}

/** How many dots a scatter shows, in its `unit` or as `words.points`. */
export function dotsText(model: Model, m: ScatterModel, words: Words): string {
  const n = m.shown.reduce((a, d) => a + d.length, 0);
  const count = formatter("number", model.locale)(n);
  return m.unit === undefined ? words.points(count, n) : counted(count, n, m.unit, model);
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
    ? counted(model.amountText(total), total, model.spec.x?.unit, model)
    : model.xText(total);
}

/** Row `r` of bar mark `m`: its name, each series' value or share, and
 *  from two series up the row's total unless its bars stand apart. */
export function barReading(model: Model, m: BarModel, r: number, words: Words): Reading {
  const at = model.y.type === "band" ? (model.y.rows[r] ?? "") : "";
  if (m.series.length === 1) {
    const v = m.series[0]?.x[r] ?? null;
    const unit = model.spec.x?.unit;
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

/** Series `s`'s value in row `i` as the readings and the table write it, a
 *  gap as No data. */
export const pointPart = (model: Model, s: PointSeriesModel, i: number, words: Words): string => {
  const v = s.x[i] ?? null;
  return v === null ? words.noData : model.xText(v);
};

/** `pointLink`'s `v` in x's format, a duration on a time x, and an
 *  arrow's change with its sign on every value but 0. */
export function linkText(model: Model, m: PointModel, v: number): string {
  const format = model.x.type === "time" ? "duration" : model.x.format;
  return (m.link === "arrow" ? signedFormatter : formatter)(format, model.locale)(v);
}

/** The word a reading's `total` follows in the legend row and the table:
 *  a range plot's gap, an arrow plot's change, or a stack's total. */
export function totalWord(model: Model, words: Words): string {
  const m = primaryOf(model);
  const link = m?.kind === "point" ? m.link : undefined;
  return link === "range" ? words.gap : link === "arrow" ? words.change : words.total;
}

/** Row `r` of point mark `m`: its name and each series' value, with no
 *  total, since a row's dots are values compared, not parts; a link's gap
 *  or change in its place, No data with a gap at either end. */
export function pointReading(model: Model, m: PointModel, r: number, words: Words): Reading {
  const at = model.y.type === "band" ? (model.y.rows[r] ?? "") : "";
  if (m.series.length === 1) {
    const v = m.series[0]?.x[r] ?? null;
    const value = v === null ? words.noData : counted(model.xText(v), v, model.spec.x?.unit, model);
    return { at, entries: bare(value), total: undefined };
  }
  const all = m.series.map((s) => ({
    slot: s.slot,
    name: s.name,
    value: pointPart(model, s, r, words),
  }));
  const v = pointLink(m, r);
  const total =
    m.link === undefined ? undefined : v === null ? words.noData : linkText(model, m, v);
  return { at, entries: all, total };
}

/** Column `c` of slope `m`: its name and each series' value there, with
 *  the `chosen` series' chip marked. */
export function columnReading(
  model: Model,
  m: SlopeModel,
  c: number,
  words: Words,
  chosen?: number,
): Reading {
  const reading = {
    at: m.columns[c] ?? "",
    entries: entries(model, m.series, (s) => s.y[c] ?? null, words),
    total: undefined,
  };
  return chosen === undefined || m.series.length < 2 ? reading : { ...reading, chosen };
}

/** Whether a chosen series marks its legend chip: on a slope, whose series
 *  Up and Down choose while the row reads a column, and on a scatter, whose
 *  chips keep their counts while the row reads a dot. */
export function chipChosen(model: Model): boolean {
  const kind = primaryOf(model)?.kind;
  return kind === "slope" || kind === "scatter";
}

/** A scatter dot's value on `axis`, or a bubble's size on "r", with its
 *  scale's label, through `words.measure`. */
export function measureText(
  model: Model,
  axis: "x" | "y" | "r",
  v: number | null,
  words: Words,
): string {
  const write = axis === "x" ? model.xText : axis === "y" ? model.yText : model.rText;
  return words.measure(model.spec[axis]?.label ?? "", v === null ? words.noData : write(v));
}

/** The measures a scatter's dots read: x and y, and a bubble's size. */
export const measuresOf = (m: ScatterModel): readonly ("x" | "y" | "r")[] =>
  m.size === undefined ? ["x", "y"] : ["x", "y", "r"];

/** Dot `i` of `s`'s value on `axis`, `null` for a gap. */
export const dotValue = (s: ScatterModel["series"][number], axis: "x" | "y" | "r", i: number) =>
  (axis === "r" ? s.r?.[i] : s[axis][i]) ?? null;

// A scatter's chips, a dot count per series, a figure that adds up across
// the chart where its measures need not; none with one series.
function dotChips(model: Model, m: ScatterModel): Entry[] {
  const count = formatter("number", model.locale);
  return m.series.length < 2
    ? []
    : m.series.map((s, k) => ({
        slot: s.slot,
        name: s.name,
        value: count(m.shown[k]?.length ?? 0),
      }));
}

/** Dot `i` of series `k` of `m`: its name, each measure with its label, and
 *  the chips' counts with its series' chip marked. */
export function scatterReading(
  model: Model,
  m: ScatterModel,
  k: number,
  i: number,
  words: Words,
): Reading {
  const s = m.series[k];
  const measures = measuresOf(m);
  const reading = {
    at: s?.names[i] ?? "",
    entries: [
      ...measures.flatMap((a) =>
        bare(measureText(model, a, s === undefined ? null : dotValue(s, a, i), words)),
      ),
      ...dotChips(model, m),
    ],
    total: undefined,
  };
  return m.series.length < 2 ? reading : { ...reading, chosen: measures.length + k };
}

/** A slope series' change in the y format, signed on every value but 0. */
export function changeText(model: Model, v: number): string {
  return signedFormatter(model.y.type === "band" ? undefined : model.y.format, model.locale)(v);
}

/** The legend row with no selection: a rect's series totals over the
 *  domain with a stack's grand total, a dot chart's count, a line's last
 *  values, an area's last whole stack, a bar or point chart's row count,
 *  a slope's right column, a scatter's dot count, blank slots for its
 *  measures and from two series up each one's count. */
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
    case "point": {
      // A category's values need not add up across rows (a median age), so
      // the row has no whole-chart figure to show.
      const last = m.kind === "bar" ? !barsApart(m) && m.series.length > 1 : m.link !== undefined;
      return {
        at: rowsText(model, words),
        entries:
          m.series.length === 1
            ? bare("")
            : m.series.map((s) => ({ slot: s.slot, name: s.name, value: "" })),
        total: last ? "" : undefined,
      };
    }
    case "slope":
      return columnReading(model, m, 1, words);
    case "scatter":
      return {
        at: dotsText(model, m, words),
        entries: [...measuresOf(m).flatMap(() => bare("")), ...dotChips(model, m)],
        total: undefined,
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
  return spreadOf(to - from).map((k) => from + k);
}

// At most 256 of the indices [0, n) spread evenly, with the ends.
function spreadOf(n: number): number[] {
  const out: number[] = [];
  const step = Math.max(1, Math.ceil(n / SAMPLE));
  for (let i = 0; i < n; i += step) {
    out.push(i);
  }
  if (n > 0) {
    out.push(n - 1);
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

// The widest measure texts a scatter's `axis` can read: each series' even
// spread of its shown dots and its extremes, as a line's values are found.
function scatterTexts(
  model: Model,
  m: ScatterModel,
  axis: "x" | "y" | "r",
  words: Words,
): string[] {
  const out: string[] = [];
  m.series.forEach((s, k) => {
    const shown = m.shown[k] ?? [];
    const at = (j: number) => dotValue(s, axis, shown[j] ?? 0);
    const picked = [...spreadOf(shown.length).map(at), ...extremes(over(0, shown.length, at))];
    out.push(...picked.map((v) => measureText(model, axis, v, words)));
  });
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
  } else if (m?.kind === "bar" || m?.kind === "point") {
    for (let r = 0; r < (model.y.type === "band" ? model.y.rows.length : 0); r++) {
      add(m.kind === "bar" ? barReading(model, m, r, words) : pointReading(model, m, r, words));
    }
  } else if (m?.kind === "slope") {
    add(columnReading(model, m, 0, words));
  } else if (m?.kind === "scatter") {
    m.series.forEach((s, k) => {
      for (const i of m.shown[k] ?? []) {
        at.push(s.names[i] ?? "");
      }
    });
    measuresOf(m).forEach((axis, slot) => {
      values[slot]?.push(...scatterTexts(model, m, axis, words));
    });
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
