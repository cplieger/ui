/**
 * readout.ts — what the legend row reads: the whole chart with no
 * selection, or a selected bucket, sample, post or row, and the widths its
 * slots keep so the row never changes size.
 * @module
 */

import { noun, withNoun, writer, type Unit, type WidthKey } from "../scale/format.js";
import type { Measure } from "../scale/measure.js";

import {
  barsApart,
  barTotal,
  bucketTotal,
  cellCount,
  drawnTotal,
  pointLink,
  sampleTotal,
  sampleValue,
  type AreaModel,
  type BarModel,
  type BarSeriesModel,
  type BoxModel,
  type BoxSeriesModel,
  type CalendarModel,
  type CellModel,
  type DataModel,
  type DotModel,
  type Model,
  type PieModel,
  type TreeModel,
  type PointModel,
  type PointSeriesModel,
  type RectModel,
  type SampleModel,
  type ScatterModel,
  type SeriesModel,
  type SlopeModel,
} from "./model.js";
import { classOf } from "./classes.js";
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
  /** The entry of the series or slice chosen, whose chip name turns semibold. */
  readonly chosen?: number;
  /** A cell chart's selected class, whose swatch in the colour key takes
   *  the ring; -1 for a missing cell, whose No data swatch does. */
  readonly swatch?: number;
}

/** The mark the legend row reads: the chart's one data mark. */
export const primaryOf = (model: Model): DataModel | undefined => model.primary;

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
  const count = writer("number", model.locale)(n);
  const unit = model.spec.y?.unit;
  return unit === undefined ? words.categories(count, n) : counted(count, n, unit, model);
}

/** How many dots a scatter shows, in its `unit` or as `words.points`. */
export function dotsText(model: Model, m: ScatterModel, words: Words): string {
  const n = m.shown.reduce((a, d) => a + d.length, 0);
  const count = writer("number", model.locale)(n);
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
 *  arrow's change with its sign on every value not written as 0. */
export function linkText(model: Model, m: PointModel, v: number): string {
  const format = model.x.type === "time" ? "duration" : model.x.format;
  return writer(format, model.locale, { signed: m.link === "arrow" })(v);
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
 *  Up and Down choose while the row reads a column, on a scatter, whose
 *  chips keep their counts while the row reads a dot, and on a pie or a
 *  tree, whose chips keep their shares while the row reads a slice or a
 *  tree's node. */
export function chipChosen(model: Model): boolean {
  const kind = primaryOf(model)?.kind;
  return kind === "slope" || kind === "scatter" || kind === "pie" || kind === "tree";
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
  const count = writer("number", model.locale);
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

/** A slope series' change in the y format, signed on every value not written as 0. */
export function changeText(model: Model, v: number): string {
  return writer(model.y.type === "band" ? undefined : model.y.format, model.locale, {
    signed: true,
  })(v);
}

/** A box's outliers in words through `words.outlierReading`, their count
 *  in `words.outlierUnit`; "" without any. */
function outliersText(model: Model, s: BoxSeriesModel, r: number, words: Words): string {
  const all = s.outliers[r] ?? [];
  const n = all.length;
  if (n === 0) {
    return "";
  }
  const count = counted(writer("number", model.locale)(n), n, words.outlierUnit, model);
  const last = n > 1 ? model.xText(all[n - 1] ?? 0) : "";
  return words.outlierReading(count, model.xText(all[0] ?? 0), last);
}

/** Series `s`'s box in row `r` as a reading says it: its five numbers
 *  through `words.box`, then its outliers, or No data. */
export function boxPart(model: Model, s: BoxSeriesModel, r: number, words: Words): string {
  const b = s.boxes[r] ?? null;
  if (b === null) {
    return words.noData;
  }
  const t = model.xText;
  const five = words.box(t(b.median), t(b.q1), t(b.q3), t(b.low), t(b.high));
  const out = outliersText(model, s, r, words);
  return out === "" ? five : `${five}, ${out}`;
}

// A lone series' four measure slots, the first `first` and the rest blank.
const boxSlots = (first: string): Entry[] =>
  [first, "", "", ""].map((value) => ({ slot: undefined, name: undefined, value }));

/** Row `r` of box mark `m`: its name, then with one series its median,
 *  middle half, whiskers and outlier count each under its `boxLabels`
 *  label, or from two series up a chip per series with its median. */
export function boxReading(model: Model, m: BoxModel, r: number, words: Words): Reading {
  const at = model.y.type === "band" ? (model.y.rows[r] ?? "") : "";
  const t = model.xText;
  if (m.series.length > 1) {
    const all = m.series.map((s) => {
      const b = s.boxes[r] ?? null;
      return { slot: s.slot, name: s.name, value: b === null ? words.noData : t(b.median) };
    });
    return { at, entries: all, total: undefined };
  }
  const s = m.series[0];
  const b = s?.boxes[r] ?? null;
  if (s === undefined || b === null) {
    return { at, entries: boxSlots(words.noData), total: undefined };
  }
  const l = words.boxLabels;
  const n = s.outliers[r]?.length ?? 0;
  return {
    at,
    entries: [
      ...bare(words.measure(l.median, t(b.median))),
      ...bare(words.measure(l.middle, words.range(t(b.q1), t(b.q3)))),
      ...bare(words.measure(l.whiskers, words.range(t(b.low), t(b.high)))),
      ...bare(words.measure(l.outliers, writer("number", model.locale)(n))),
    ],
    total: undefined,
  };
}

/** How many cells a cell chart has, missing ones included, through `words.cells`. */
export function cellsText(model: Model, m: CellModel, words: Words): string {
  const n = cellCount(m.x) * cellCount(m.y);
  return words.cells(writer("number", model.locale)(n), n);
}

/** Column or row `i` of a cell chart's `axis` in words: its category's
 *  name, or its bin's range, after the axis's label through `words.measure`
 *  when it has one and `labelled`. */
export function cellAxisText(
  model: Model,
  m: CellModel,
  axis: "x" | "y",
  i: number,
  words: Words,
  labelled = true,
): string {
  const a = m[axis];
  if ("names" in a) {
    return a.names[i] ?? "";
  }
  const lo = a.edges[i] ?? 0;
  const hi = a.edges[i + 1] ?? 0;
  const range =
    axis === "x"
      ? words.range(...model.xSpan(lo, hi))
      : words.range(model.yText(lo), model.yText(hi));
  const label = model.spec[axis]?.label ?? "";
  return label === "" || !labelled ? range : words.measure(label, range);
}

/** Cell (`row`, `column`)'s place through `words.cellPlace`. */
export const cellPlaceText = (
  model: Model,
  m: CellModel,
  row: number,
  column: number,
  words: Words,
): string =>
  words.cellPlace(
    cellAxisText(model, m, "x", column, words),
    cellAxisText(model, m, "y", row, words),
  );

/** A cell's value in the colour scale's format and unit, a gap as No data. */
export const cellValueText = (model: Model, v: number | null, words: Words): string =>
  v === null ? words.noData : counted(model.colourText(v), v, model.spec.colour?.unit, model);

/** Cell (`row`, `column`) of `m`: its place and its value, with its class's
 *  swatch to ring. */
export function cellReading(
  model: Model,
  m: CellModel,
  row: number,
  column: number,
  words: Words,
): Reading {
  const v = m.values[row]?.[column] ?? null;
  return {
    at: cellPlaceText(model, m, row, column, words),
    entries: bare(cellValueText(model, v, words)),
    total: undefined,
    swatch: v === null ? -1 : classOf(m.classes, v),
  };
}

/** How many days a calendar holds, missing ones included, through `words.days`. */
export function daysText(model: Model, m: CalendarModel, words: Words): string {
  const n = m.values.length;
  return words.days(writer("number", model.locale)(n), n);
}

/** Day `i` of a calendar in words: its date in full, "so far" on an open last day. */
function dayText(model: Model, m: CalendarModel, i: number, words: Words): string {
  const date = model.dateText(m.day + i);
  return m.open && i === m.values.length - 1 ? words.soFar(date) : date;
}

/** Day `i` of `m`: its date and its value, with its class's swatch to ring. */
export function dayReading(model: Model, m: CalendarModel, i: number, words: Words): Reading {
  const v = m.values[i] ?? null;
  return {
    at: dayText(model, m, i, words),
    entries: bare(cellValueText(model, v, words)),
    total: undefined,
    swatch: v === null ? -1 : classOf(m.classes, v),
  };
}

/** A pie's or a tree's part, or its whole, in its mark's unit. */
export const partAmount = (model: Model, m: PieModel | TreeModel, v: number): string =>
  counted(model.amountText(v), v, m.unit, model);

/** Slice `i`'s share of its pie's whole; No data for a gap. */
export function sliceShare(model: Model, m: PieModel, i: number, words: Words): string {
  const v = m.slices[i]?.value ?? null;
  return v === null ? words.noData : model.shareText(m.total > 0 ? v / m.total : 0);
}

// A chip per slice in the clockwise order, each with its share, at every
// selection: the chips name the slices where colour alone would not.
const sliceChips = (model: Model, m: PieModel, words: Words): Entry[] =>
  m.slices.map((s, i) => ({ slot: s.slot, name: s.name, value: sliceShare(model, m, i, words) }));

/** Slice `i` of `m`: its name and value, No data for a gap, with every
 *  slice's chip and its own chosen. */
export function sliceReading(model: Model, m: PieModel, i: number, words: Words): Reading {
  const s = m.slices[i];
  const v = s?.value ?? null;
  return {
    at: `${s?.name ?? ""} ${v === null ? words.noData : partAmount(model, m, v)}`,
    entries: sliceChips(model, m, words),
    total: undefined,
    chosen: i,
  };
}

/** How many slices a pie or parts a tree holds, through `words.parts`. */
export function partsText(model: Model, m: PieModel | TreeModel, words: Words): string {
  const n = m.kind === "pie" ? m.slices.length : m.parts.length;
  return words.parts(writer("number", model.locale)(n), n);
}

/** How many groups a tree holds, through `words.groups`; "" with one level. */
export function groupsText(model: Model, m: TreeModel, words: Words): string {
  const n = m.groups.length;
  return n === 0 ? "" : words.groups(writer("number", model.locale)(n), n);
}

/** A tree's value `v` as a share of its whole. */
export const treeShare = (model: Model, m: TreeModel, v: number): string =>
  model.shareText(m.total > 0 ? v / m.total : 0);

/** A tree's part `i` in words: its group's name and its own through
 *  `words.path`, or its own alone with one level. */
export function partName(m: TreeModel, i: number, words: Words): string {
  const p = m.parts[i];
  const g = p === undefined ? undefined : m.groups[p.group];
  return g === undefined ? (p?.name ?? "") : words.path(g.name, p?.name ?? "");
}

/** A tree's group `i`, or part `i` when not `group`: its name, a part's
 *  through `partName`, and its value and share of the whole, No data for a
 *  part's gap. */
export function treeNode(
  model: Model,
  m: TreeModel,
  group: boolean,
  i: number,
  words: Words,
): { readonly name: string; readonly text: string } {
  const g = group ? m.groups[i] : undefined;
  const v = group ? (g?.value ?? 0) : (m.parts[i]?.value ?? null);
  return {
    name: group ? (g?.name ?? "") : partName(m, i, words),
    text: v === null ? words.noData : `${partAmount(model, m, v)}, ${treeShare(model, m, v)}`,
  };
}

/** A tree's group chips, in group order, each with its share; none with
 *  one level, whose parts share a slot and are named by their labels. */
const groupChips = (model: Model, m: TreeModel): Entry[] =>
  m.groups.map((g) => ({ slot: g.slot, name: g.name, value: treeShare(model, m, g.value) }));

/** A tree's group `i`, or part `i` when not `group`, through `treeNode`,
 *  with every group's chip and the node's own group chosen. */
export function treeReading(
  model: Model,
  m: TreeModel,
  group: boolean,
  i: number,
  words: Words,
): Reading {
  const node = treeNode(model, m, group, i, words);
  const reading = {
    at: `${node.name} ${node.text}`,
    entries: groupChips(model, m),
    total: undefined,
  };
  const chosen = group ? i : (m.parts[i]?.group ?? -1);
  return chosen === -1 ? reading : { ...reading, chosen };
}

/** The legend row with no selection: a rect's series totals over the
 *  domain with a stack's grand total, a dot chart's count, a line's last
 *  values, an area's last whole stack, a bar or point chart's row count,
 *  a slope's right column, a scatter's dot count, blank slots for its
 *  measures and from two series up each one's count, a cell chart's
 *  cell count, a calendar's day count, a box chart's row count, a pie's
 *  total with each slice's share, or a tree's total with each group's. */
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
      const last = m.series.reduce(
        (most, s) => Math.max(most, lastSample(m, s)),
        Number.NEGATIVE_INFINITY,
      );
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
    case "cell":
      // Cells need not add up (a median, a temperature), so the value slot is blank.
      return { at: cellsText(model, m, words), entries: bare(""), total: undefined };
    case "calendar":
      return { at: daysText(model, m, words), entries: bare(""), total: undefined };
    case "box":
      // Distributions do not add up across rows, so the slots are blank.
      return {
        at: rowsText(model, words),
        entries:
          m.series.length === 1
            ? boxSlots("")
            : m.series.map((s) => ({ slot: s.slot, name: s.name, value: "" })),
        total: undefined,
      };
    case "pie":
      return {
        at: `${words.total} ${partAmount(model, m, m.total)}`,
        entries: sliceChips(model, m, words),
        total: undefined,
      };
    case "tree":
      return {
        at: `${words.total} ${partAmount(model, m, m.total)}`,
        entries: groupChips(model, m),
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
// One value of `values` for each text width `key` tells apart, and with
// `noun` for each noun too, nulls skipped; every distinct value the key
// cannot read, since only writing one tells its width.
function widthSamples(
  values: Iterable<number | null>,
  key: WidthKey | undefined,
  noun?: (v: number) => string,
): number[] {
  const byKey = new Map<number, number>();
  const nouns = new Map<string, number>();
  const raw = new Set<number>();
  let negativeZero = false;
  for (const v of values) {
    if (v === null) {
      continue;
    }
    let k = key === undefined ? Number.NaN : key(v);
    if (Number.isNaN(k)) {
      negativeZero ||= Object.is(v, -0);
      raw.add(v);
      continue;
    }
    if (noun !== undefined) {
      const word = noun(v);
      let n = nouns.get(word);
      if (n === undefined) {
        n = nouns.size;
        nouns.set(word, n);
      }
      // A unit has at most six plural nouns.
      k = k * 8 + n;
    }
    if (!byKey.has(k)) {
      byKey.set(k, v);
    }
  }
  return [...byKey.values(), ...raw, ...(negativeZero ? [-0] : [])];
}

// The values `at` gives for `[from, to)`.
function* over<T>(from: number, to: number, at: (i: number) => T) {
  for (let i = from; i < to; i++) {
    yield at(i);
  }
}

// Every width of x text `values` can read: on a time x one instant per
// quarter hour, inside which every zone's local hour and day hold, since
// every digit is as wide as another.
function xTexts(model: Model, values: Iterable<number>): string[] {
  if (model.x.type !== "time") {
    return widthSamples(values, model.widthKeys.x).map((v) => model.xText(v));
  }
  const slots = new Map<number, number>();
  for (const v of values) {
    const slot = Math.floor(v / QUARTER_HOUR);
    if (!slots.has(slot)) {
      slots.set(slot, v);
    }
  }
  return [...slots.values()].map((v) => model.xText(v));
}

// Appends `items` one by one: a call spread of a list the spec sets throws
// past about 125,000 arguments in V8 (source.node.test.ts).
function pushAll<T>(to: T[] | undefined, items: Iterable<T>): void {
  for (const item of items) {
    to?.push(item);
  }
}

// The noun `counted` adds to an amount of `unit`, if any.
const nounOf = (model: Model, unit: Unit | undefined) =>
  unit === undefined ? undefined : (v: number) => noun(unit, v, model.locale);

// Every width of text series `s` of `m` can read, No data included: under
// "share" its shares, and its values where no shares are.
function valueTexts(model: Model, m: SampleModel, s: SeriesModel, words: Words): string[] {
  const out = [words.noData];
  if (m.kind === "area" && m.arrange === "share") {
    const shares = over(m.from, m.to, (i) => sampleValue(m, s, i));
    pushAll(
      out,
      widthSamples(shares, model.widthKeys.y).map((v) => model.yText(v)),
    );
    const unshared = over(m.from, m.to, (i) =>
      drawnTotal(m, i) === null ? (s.y[i] ?? null) : null,
    );
    pushAll(
      out,
      widthSamples(unshared, model.widthKeys.amount).map((v) => model.amountText(v)),
    );
    return out;
  }
  const unit = m.series.length === 1 ? model.spec.y?.unit : undefined;
  const values = widthSamples(
    over(m.from, m.to, (i) => s.y[i] ?? null),
    model.widthKeys.y,
    nounOf(model, unit),
  );
  pushAll(
    out,
    values.map((v) => counted(model.yText(v), v, unit, model)),
  );
  return out;
}

// Every width of stack total `m` can read, No data included.
function totalTexts(model: Model, m: AreaModel, words: Words): string[] {
  const share = m.arrange === "share";
  const totals = widthSamples(
    over(m.from, m.to, (i) => sampleTotal(m, i)),
    share ? model.widthKeys.amount : model.widthKeys.y,
    share ? nounOf(model, model.spec.y?.unit) : undefined,
  );
  return [words.noData, ...totals.map((n) => areaTotal(model, m, n))];
}

// Every width of measure text a scatter's `axis` can read.
function scatterTexts(
  model: Model,
  m: ScatterModel,
  axis: "x" | "y" | "r",
  words: Words,
): string[] {
  const all = function* () {
    for (const [k, s] of m.series.entries()) {
      for (const i of m.shown[k] ?? []) {
        yield dotValue(s, axis, i);
      }
    }
  };
  const texts = widthSamples(all(), model.widthKeys[axis]).map((v) =>
    measureText(model, axis, v, words),
  );
  return texts.length === 0 ? [measureText(model, axis, null, words)] : texts;
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
    const { x } = m;
    pushAll(
      at,
      xTexts(
        model,
        over(m.from, m.to, (i) => x[i] ?? 0),
      ),
    );
    m.series.forEach((s, k) => {
      pushAll(values[k], valueTexts(model, m, s, words));
    });
    if (m.kind === "area" && m.series.length > 1) {
      pushAll(totals, totalTexts(model, m, words));
    }
  } else if (m?.kind === "bar" || m?.kind === "point") {
    for (let r = 0; r < (model.y.type === "band" ? model.y.rows.length : 0); r++) {
      add(m.kind === "bar" ? barReading(model, m, r, words) : pointReading(model, m, r, words));
    }
  } else if (m?.kind === "box") {
    for (let r = 0; r < (model.y.type === "band" ? model.y.rows.length : 0); r++) {
      add(boxReading(model, m, r, words));
    }
  } else if (m?.kind === "slope") {
    add(columnReading(model, m, 0, words));
  } else if (m?.kind === "pie") {
    m.slices.forEach((_, i) => {
      add(sliceReading(model, m, i, words));
    });
  } else if (m?.kind === "tree") {
    m.groups.forEach((_, i) => {
      add(treeReading(model, m, true, i, words));
    });
    m.parts.forEach((_, i) => {
      add(treeReading(model, m, false, i, words));
    });
  } else if (m?.kind === "scatter") {
    m.series.forEach((s, k) => {
      for (const i of m.shown[k] ?? []) {
        at.push(s.names[i] ?? "");
      }
    });
    measuresOf(m).forEach((axis, slot) => {
      pushAll(values[slot], scatterTexts(model, m, axis, words));
    });
  } else if (m?.kind === "cell") {
    // A place joins a column's words to a row's, so the widest of each makes the widest place.
    const widestOf = (axis: "x" | "y") => {
      let text = "";
      let w = -1;
      for (let i = 0; i < cellCount(m[axis]); i++) {
        const t = cellAxisText(model, m, axis, i, words);
        const tw = measure.number(t);
        if (tw > w) {
          text = t;
          w = tw;
        }
      }
      return text;
    };
    at.push(words.cellPlace(widestOf("x"), widestOf("y")));
    const unit = model.spec.colour?.unit;
    const all = function* () {
      for (const row of m.values) {
        yield* row;
      }
    };
    values[0]?.push(words.noData);
    pushAll(
      values[0],
      widthSamples(all(), model.widthKeys.colour, nounOf(model, unit)).map((v) =>
        cellValueText(model, v, words),
      ),
    );
  } else if (m?.kind === "calendar") {
    m.values.forEach((_, i) => at.push(dayText(model, m, i, words)));
    values[0]?.push(words.noData);
    pushAll(
      values[0],
      widthSamples(m.values, model.widthKeys.colour, nounOf(model, model.spec.colour?.unit)).map(
        (v) => cellValueText(model, v, words),
      ),
    );
  } else if (m?.kind === "dot") {
    const posts = function* () {
      for (const row of m.rows) {
        for (let i = row.from; i < row.to; i++) {
          yield row.x[i] ?? 0;
        }
      }
    };
    m.rows.forEach((row, r) => {
      add(rowReading(model, m, r, words));
      at.push(row.name);
    });
    let instant = "";
    let instantW = 0;
    for (const text of xTexts(model, posts())) {
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
