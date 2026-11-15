/**
 * layout.ts — where a chart's parts sit in its SVG at a width: gutters, the
 * rule band and y title, the x axis, end labels, a band chart's rows, a bar
 * chart's panels and value labels, a slope's columns and end labels, a
 * scatter's inset axes, a pie's circle, outside labels and hole, a
 * treemap's tiles, heads and labels, and notes.
 * @module
 */

import { widestOf, type Measure } from "../scale/measure.js";
import { position } from "../scale/position.js";

import {
  axisGutter,
  bandAxis,
  bandLimit,
  cutName,
  ruleBand,
  xAxis,
  yAxis,
  type Axis,
  type RuleLabel,
  type Tick,
} from "./axis.js";
import {
  barBlock,
  barCentre,
  barReach,
  boxBlock,
  BUBBLE_RADIUS,
  BUBBLE_RADIUS_NARROW,
  dayBox,
  dotRadius,
  OUTLIER_RADIUS,
  POINT_RADIUS,
  ruleXs,
  SCATTER_RADIUS,
  snap,
  type DayGrid,
  type Frame,
  type Panel,
} from "./geometry.js";
import {
  barsApart,
  dayOf,
  sampleValue,
  thinnestBin,
  type BarModel,
  type BoxModel,
  type CalendarModel,
  type CellModel,
  type Model,
  type PieModel,
  type ScatterModel,
  type SlopeModel,
  type TreeModel,
} from "./model.js";
import { dayFormat, dayPlace, foldSize, monthFirst, weekCount, weekRow } from "./calendar.js";
import { MARKER_RADIUS, NOTE_REM, notePoint, placeNote, wrapNote, type Box } from "./notes.js";
import { rimPoint, sliceAngles, type PieFrame } from "./pie.js";
import { lastSample, lastStack, partAmount, samplePart } from "./readout.js";
import type { Continuous } from "./scales.js";
import { resquarify, squarify, type Row } from "./treemap.js";
import type { Words } from "./words.js";

/** What the page gives the layout, read outside any draw. */
export interface Metrics {
  /** The axis face, and the mono face a band set `mono` names its rows in. */
  readonly measure: Measure;
  readonly mono: Measure;
  /** A line of axis text, in px. */
  readonly lineHeight: number;
  readonly rem: number;
  /** A dot row's height, from `--cp-chart-row`. */
  readonly row: number;
  /** A line of a row's name set above its bar, at `--cp-leading-ui`. */
  readonly nameLine: number;
  /** The group gutters, from `--cp-chart-axis-gutter` and `--cp-chart-label-gutter`. */
  readonly axisGroup: number;
  readonly labelGroup: number;
  /** The plot's height when the spec gives none, from `--cp-chart-height`. */
  readonly height: number;
  /** A donut's total's face, `[data-hole]`, and a line of it in px. */
  readonly hole: Measure;
  readonly holeLine: number;
  readonly dpr: number;
}

/** The gutters a handle has drawn with since its last measure; they only grow. */
export interface Floors {
  readonly axis: number;
  readonly label: number;
}

/** A line of text at `x`, its middle at `y`, anchored at its `start`, `middle` or `end`. */
export interface Text {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  /** A slope's end label's series, a pie's outside label's slice, a tree's
   *  head's group or a tree's tile label's part. */
  readonly series?: number;
  /** A cell chart's column a band x label names. */
  readonly column?: number;
}

/** What a tree's next layout keeps while its names, their order at every
 *  level and the plot's size stay the same: each level's rows. */
export interface TreeKept {
  readonly key: string;
  readonly top: readonly Row[];
  /** Each group's parts' rows, none with one level. */
  readonly inner: readonly (readonly Row[])[];
}

/** A treemap on the plot, in plot px, edges snapped to device px. */
interface TreeFrame {
  /** Each part's tile in part order; undefined for a 0 or no data, which
   *  draws none. */
  readonly tiles: readonly (Box | undefined)[];
  /** Each group's rectangle, its head band included. */
  readonly groups: readonly Box[];
  /** Each group's head band, undefined for a group with no head. */
  readonly bands: readonly (Box | undefined)[];
  /** The tiles' labels, a name and then its value, each `series` its part. */
  readonly labels: readonly Text[];
  readonly kept: TreeKept;
}

/** A line from `from` to `to`, in SVG px. */
export interface Leader {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface Layout {
  /** The SVG's size. */
  readonly width: number;
  readonly height: number;
  /** The plot's box in the SVG. */
  readonly left: number;
  readonly top: number;
  readonly frame: Frame;
  readonly xAxis: Axis;
  /** A continuous y's axis; absent on a band and on a slope, which draws none. */
  readonly yAxis: Axis | undefined;
  /** A band's rows, each name cut to its room, `y` the middle of its dot
   *  row, its bars or its points in the plot. */
  readonly rows: readonly { readonly name: string; readonly y: number }[];
  /** A cell chart's column and row edges in plot px, in its columns' and
   *  rows' order, so cell (c, r) spans xs[c] to xs[c + 1] and ys[r] to
   *  ys[r + 1]; a binned y's run up from the plot's bottom. */
  readonly cells: { readonly xs: readonly number[]; readonly ys: readonly number[] } | undefined;
  /** A calendar's days on the plot. */
  readonly days: DayGrid | undefined;
  /** A pie's circle on the plot. */
  readonly pie: PieFrame | undefined;
  /** A donut's total in its hole, in plot px: `words.total` over the value;
   *  absent when the value is wider than the hole less 16 px. */
  readonly hole: { readonly label: Text; readonly total: Text } | undefined;
  /** A treemap's tiles on the plot. */
  readonly tree: TreeFrame | undefined;
  /** A whole bar's thickness, which a group's thinner bars derive from
   *  (`barBlock`); 0 without a bar mark. */
  readonly bar: number;
  /** A bar chart's value labels, in plot px. */
  readonly valueLabels: readonly Text[];
  /** A split or mirrored bar chart's panel names over its panels, or a
   *  slope's column names over its columns, in SVG px. */
  readonly heads: readonly Text[];
  readonly mono: boolean;
  readonly gutters: Floors;
  /** Text outside the plot, in SVG px: tick labels, titles, rule and end labels. */
  readonly xLabels: readonly Text[];
  readonly yLabels: readonly Text[];
  readonly titles: readonly Text[];
  readonly ruleLabels: readonly Text[];
  /** Text inside the plot, in plot px: a y rule's label. */
  readonly plotLabels: readonly Text[];
  readonly endLabels: readonly Text[];
  /** A slope's end labels moved off their dots' heights, each joined to
   *  its dot, or a pie's outside labels, each joined to its slice's rim. */
  readonly leaders: readonly Leader[];
  /** The notes drawn, in spec order: those whose point lies in the plot. */
  readonly notes: readonly Note[];
  /** Every note is drawn as its numbered marker, its words listed below
   *  the plot: under 30rem, or when two notes overlap or one cannot fit. */
  readonly numbered: boolean;
}

/** A text mark's note laid out beside its point, in plot px. */
export interface Note {
  /** The text mark's index in the spec. */
  readonly mark: number;
  readonly point: { readonly x: number; readonly y: number };
  readonly box: Box;
  readonly lines: readonly Text[];
  /** Its box lies inside the plot. */
  readonly fits: boolean;
  /** Its marker's number, 1 up in the order drawn. */
  readonly number: number;
}

/** The room between text and what it labels. */
const PAD = 8;
/** The x tick vectors' length, and the room under them. */
const TICK = 4;
/** Under this many rem a chart draws no end labels, its notes as numbered
 *  markers, and a bar row's or a point row's name on its own line above it. */
const NARROW_REM = 30;
/** A row's bars take its height less this, half above them and half below. */
const BAR_SPACE = 8;
/** A mirrored row's bars take its height less this, so neighbouring rows
 *  stand close and each side's profile reads as one shape. */
const MIRROR_SPACE = 2;
/** The room between a name above a bar and the bar. */
const NAME_GAP = 2;
/** The room between a bar's end and its value label. */
const VALUE_GAP = 4;
/** The room between a row's last bar, or its label, and a note's point there. */
const END_GAP = 4;
/** The room between a split bar chart's panels. */
const PANEL_GAP = 16;
/** The spine between a mirrored bar chart's two sides. */
const SPINE = 8;
/** A point chart's x runs this far inside each end of the plot: the
 *  selection ring's reach, 1 px off a dot with its 2 px stroke, so a dot at
 *  the domain's end draws whole, ring and all, inside the plot's clip. */
const POINT_INSET = POINT_RADIUS + 2;
/** A box plot's x runs this far inside each end of the plot, so an outlier
 *  at the domain's end draws whole, stroke and all, inside the plot's clip. */
const BOX_INSET = OUTLIER_RADIUS + 1;
/** A scatter's x and y run this far inside the plot's edges, by the same
 *  rule, so a dot at a niced domain's end draws whole, clear of the axes;
 *  a bubble chart's by its largest bubble's radius in its place. */
const SCATTER_INSET = SCATTER_RADIUS + 2;

function scatterInset(m: ScatterModel, bubble: number | undefined): number {
  const top = m.drawn[0];
  return bubble === undefined
    ? SCATTER_INSET
    : (top === undefined ? 0 : dotRadius(m, top.series, top.i, { bubble })) + 2;
}

/** A slope's names stay short enough that each gutter is at most this
 *  share of the chart's width. */
const SLOPE_GUTTER = 0.3;
/** A slope's label moved further than this from its dot's height takes a leader. */
const LEADER_AT = 4;
/** The room between a leader's end and its label. */
const LEADER_GAP = 2;

const ceil = (v: number) => Math.ceil(v - 1e-6);

// The end labels' texts and the y value each sits at: a line series' last
// value, or the middle of an area layer's thickness at the last whole stack.
// A name is cut so its label fits `limit`, the value always whole.
function endTexts(
  model: Model,
  words: Words,
  measure: Measure,
  limit: number,
): { text: string; value: number }[] {
  const label = (name: string, value: string) =>
    `${cutName(name, limit - measure.number(` ${value}`), measure.number)} ${value}`;
  const out: { text: string; value: number }[] = [];
  for (const m of model.marks) {
    if (m.kind === "line") {
      for (const s of m.series) {
        const value = s.y[lastSample(m, s)];
        if (value !== undefined && value !== null) {
          out.push({ text: label(s.name, model.yText(value)), value });
        }
      }
    } else if (m.kind === "area") {
      const i = lastStack(m);
      let base = 0;
      for (const s of i === -1 ? [] : m.series) {
        const v = sampleValue(m, s, i) ?? 0;
        out.push({ text: label(s.name, samplePart(model, m, s, i, words)), value: base + v / 2 });
        base += v;
      }
    }
  }
  return out;
}

// Each text mark `notePoint` places, wrapped and placed beside its point;
// `rowEnd` gives the point of a note at its row's end.
function notesOf(
  model: Model,
  metrics: Metrics,
  frame: Frame,
  rows: Layout["rows"],
  rowEnd: (row: number) => number,
  dayPoint?: (t: number) => { readonly x: number; readonly y: number } | undefined,
): Note[] {
  const out: Note[] = [];
  const max = Math.min(NOTE_REM * metrics.rem, frame.width);
  model.marks.forEach((m, mark) => {
    const at = m.kind === "text" ? notePoint(model, m) : undefined;
    if (m.kind !== "text" || at === undefined) {
      return;
    }
    const day = dayPoint === undefined ? undefined : dayPoint(at.x ?? 0);
    if (dayPoint !== undefined && day === undefined) {
      return;
    }
    const x = day?.x ?? (at.x === undefined ? rowEnd(at.y) : frame.xAt(at.x));
    const y = day?.y ?? (m.row ? (rows[at.y]?.y ?? 0) : frame.yAt(at.y));
    const texts = wrapNote(m.text, max, metrics.measure.text);
    const w = widestOf(texts, metrics.measure.text);
    const h = texts.length * metrics.lineHeight;
    const placed = placeNote(x, y, m.side, w, h, frame.width, frame.height);
    const { box, side } = placed;
    const [tx, anchor] =
      side === "left"
        ? [box.right, "end" as const]
        : side === "right"
          ? [box.left, "start" as const]
          : [(box.left + box.right) / 2, "middle" as const];
    out.push({
      mark,
      point: { x, y },
      box,
      lines: texts.map((text, k) => ({
        text,
        x: tx,
        y: box.top + (k + 0.5) * metrics.lineHeight,
        anchor,
      })),
      fits: placed.fits,
      number: out.length + 1,
    });
  });
  return out;
}

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// All notes switch together, so a reader never matches some on the plot and
// some in the list below it. The sweep by left edge tests a box only against
// the kept boxes still crossing that edge: until an overlap they are apart, fit
// the plot and cross one vertical line, so at most plot height / line height
// of them, however many notes pile up.
export function numberedNotes(notes: readonly Note[], narrow: boolean): boolean {
  if (notes.length === 0) {
    return false;
  }
  if (narrow || notes.some((n) => !n.fits)) {
    return true;
  }
  const boxes = notes.map((n) => n.box).sort((a, b) => a.left - b.left);
  let kept: Box[] = [];
  for (const box of boxes) {
    kept = kept.filter((k) => k.right > box.left);
    if (kept.some((k) => overlap(k, box))) {
      return true;
    }
    kept.push(box);
  }
  return false;
}

/** A bar's value label: the value it writes, its row, and the series whose
 *  bar it ends, or none for a stack's total. */
interface BarValue {
  readonly value: number;
  readonly row: number;
  readonly series: number | undefined;
}

// The values a bar chart writes at its bars' ends: each stacked row's total,
// or the value of each bar standing apart or on a mirror's side; none for a
// gap.
function barValues(m: BarModel, rows: number): BarValue[] {
  const out: BarValue[] = [];
  for (let row = 0; row < rows; row++) {
    if (barsApart(m) || m.arrange === "mirror") {
      m.series.forEach((s, k) => {
        const v = s.x[row] ?? null;
        if (v !== null) {
          out.push({ value: v, row, series: k });
        }
      });
      continue;
    }
    let total: number | null = null;
    for (const s of m.series) {
      const v = s.x[row] ?? null;
      if (v !== null) {
        total = (total ?? 0) + v;
      }
    }
    if (total !== null) {
      out.push({ value: total, row, series: undefined });
    }
  }
  return out;
}

// The panels of `m`'s series in series order, `width` px each, left to
// right or on a reversed x right to left, each placing a value `along(v)`
// px from its baseline: a split's 16 px apart with their bars rightward, a
// mirror's either side of its spine with the first side's bars leftward.
function panelsOf(
  m: BarModel,
  width: number,
  reverse: boolean,
  along: (v: number) => number,
): Panel[] {
  const mirror = m.arrange === "mirror";
  const count = m.series.length;
  const gap = mirror ? SPINE : PANEL_GAP;
  return Array.from({ length: count }, (_, k) => {
    const left = (reverse ? count - 1 - k : k) * (width + gap);
    const right = left + width;
    const leftward = mirror ? (k === 0) !== reverse : reverse;
    return {
      left,
      right,
      leftward,
      at: leftward ? (v: number) => right - along(v) : (v: number) => left + along(v),
    };
  });
}

// A tick of an axis drawn rightward from 0, placed in panel `p`, its
// label's box with it.
const inPanel = (t: Tick, p: Panel): Tick =>
  moved(t, (v) => (p.leftward ? p.right - v : p.left + v));

// A tick and its label's box moved along the axis by `at`.
function moved(t: Tick, at: (v: number) => number): Tick {
  const label = t.label;
  if (label === undefined) {
    return { ...t, at: at(t.at) };
  }
  const [a, b] = [at(label.box.start), at(label.box.end)];
  return {
    ...t,
    at: at(t.at),
    label: { ...label, box: { start: Math.min(a, b), end: Math.max(a, b) } },
  };
}

/** Each y rule's label inside the plot, in plot px: at its right end, just
 *  above its line, or at the end of the axis it is off. */
function yRuleLabels(
  model: Model,
  words: Words,
  yAt: (v: number) => number,
  width: number,
  height: number,
  lineHeight: number,
): Text[] {
  const out: Text[] = [];
  for (const r of model.marks) {
    if (r.kind !== "rule" || r.axis !== "y") {
      continue;
    }
    const written = model.yText(r.value);
    out.push(
      "off" in r.place
        ? {
            text: words.offAxis(r.label, written),
            x: width - PAD / 2,
            y: r.place.off === "high" ? lineHeight / 2 : height - lineHeight / 2,
            anchor: "end",
          }
        : {
            text: `${r.label} ${written}`,
            x: width - PAD / 2,
            y: yAt(r.place.at) - lineHeight / 2 - 1,
            anchor: "end",
          },
    );
  }
  return out;
}

/** Centres for labels wanted at `want`, in the same order, each `step`
 *  from the next: labels that would come closer move apart as a group
 *  centred on their wanted mean, kept inside `[lo, hi]`; ties keep their
 *  order. */
export function dodge(want: readonly number[], step: number, lo: number, hi: number): number[] {
  const order = want.map((_, i) => i).sort((a, b) => (want[a] ?? 0) - (want[b] ?? 0) || a - b);
  const groups: { members: number[]; sum: number; top: number }[] = [];
  const place = (g: { members: number[]; sum: number; top: number }) => {
    const span = (g.members.length - 1) * step;
    g.top = Math.min(Math.max(g.sum / g.members.length - span / 2, lo), Math.max(lo, hi - span));
  };
  for (const i of order) {
    const g = { members: [i], sum: want[i] ?? 0, top: 0 };
    place(g);
    groups.push(g);
    for (;;) {
      const b = groups.at(-1);
      const a = groups.at(-2);
      if (a === undefined || b === undefined || a.top + a.members.length * step <= b.top + 1e-6) {
        break;
      }
      for (const member of b.members) {
        a.members.push(member);
      }
      a.sum += b.sum;
      groups.pop();
      place(a);
    }
  }
  const out = want.map(() => 0);
  for (const g of groups) {
    g.members.forEach((i, k) => {
      out[i] = g.top + k * step;
    });
  }
  return out;
}

/**
 * A slope's layout: its columns at the plot's edges with their names above,
 * no axes, and each end's label beside its dot, "{name} {value}" in the
 * gutter on its side, under 30rem the left one the value alone. Names are
 * cut so neither gutter passes 30 % of `chart`; the labels of a side dodge
 * one name line apart, and the plot grows to give each a line.
 */
function slopeLayout(
  model: Model,
  m: SlopeModel,
  words: Words,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart: number,
): Layout {
  const { measure, lineHeight, dpr } = metrics;
  const narrow = chart < NARROW_REM * metrics.rem;
  const limit = SLOPE_GUTTER * chart - PAD;
  const sides = ([0, 1] as const).map((c) =>
    m.series.flatMap((s, series) => {
      const v = s.y[c] ?? null;
      if (v === null) {
        return [];
      }
      const value = model.yText(v);
      if (c === 0 && narrow) {
        return [{ series, v, text: value }];
      }
      const room = limit - measure.number(` ${value}`);
      return [{ series, v, text: `${cutName(s.name, room, measure.number)} ${value}` }];
    }),
  );
  const [left = [], right = []] = sides;
  const widest = (side: readonly { text: string }[]) =>
    widestOf(side, (e) => measure.number(e.text));
  const axisW = Math.max(ceil(axisGutter(widest(left), metrics.axisGroup)), floors.axis);
  const labelW = Math.max(ceil(widest(right) + PAD), ceil(metrics.labelGroup), floors.label);
  const plotW = Math.max(1, width - axisW - labelW);
  const step = metrics.nameLine;
  const height = Math.max(
    model.spec.height ?? metrics.height,
    step * Math.max(left.length, right.length),
  );
  const ctx = { locale: model.locale, timeZone: model.timeZone, measure };
  const yAt = yAxis(model.y as Continuous, height, lineHeight, ctx).at;
  const xAt = position("linear", 0, 1, 0, plotW);
  const top = lineHeight + TICK;
  const endLabels: Text[] = [];
  const leaders: Leader[] = [];
  sides.forEach((side, c) => {
    const want = side.map((e) => Math.min(Math.max(yAt(e.v), 0), height));
    const at = dodge(want, step, 0, height);
    const edge = axisW + xAt(c);
    const out = c === 0 ? -1 : 1;
    side.forEach((e, k) => {
      const y = at[k] ?? 0;
      const dot = want[k] ?? 0;
      endLabels.push({
        text: e.text,
        x: edge + out * PAD,
        y: top + y,
        anchor: c === 0 ? "end" : "start",
        series: e.series,
      });
      if (Math.abs(y - dot) > LEADER_AT) {
        leaders.push({
          from: { x: edge, y: top + dot },
          to: { x: edge + out * (PAD - LEADER_GAP), y: top + y },
        });
      }
    });
  });
  const half = (plotW - PAD) / 2;
  const heads: Text[] = m.columns.map((name, c) => ({
    text: cutName(name, half, measure.text),
    x: axisW + xAt(c),
    y: lineHeight / 2,
    anchor: c === 0 ? "start" : "end",
  }));
  const frame: Frame = { width: plotW, height, dpr, yAt, x: model.x, xAt };
  const notes = notesOf(model, metrics, frame, [], () => 0);
  return {
    width,
    // Half a label's line under the plot holds a label at its bottom edge.
    height: top + height + Math.ceil(lineHeight / 2),
    left: axisW,
    top,
    frame,
    xAxis: { lo: 0, hi: 1, at: xAt, ticks: [] },
    yAxis: undefined,
    rows: [],
    cells: undefined,
    days: undefined,
    pie: undefined,
    hole: undefined,
    tree: undefined,
    mono: false,
    gutters: { axis: axisW, label: labelW },
    bar: 0,
    valueLabels: [],
    heads,
    xLabels: [],
    yLabels: [],
    titles: [],
    ruleLabels: [],
    plotLabels: yRuleLabels(model, words, yAt, plotW, height, lineHeight),
    endLabels,
    leaders,
    notes,
    numbered: numberedNotes(notes, narrow),
  };
}

// A binned y's plot: `height`, or taller until its thinnest bin is a `row`
// tall, as a band's rows are.
function binnedHeight(
  y: Continuous,
  edges: readonly number[],
  height: number,
  row: number,
): number {
  // A float share (5 / 35) leaves 24 / share a hair over its whole px.
  return Math.max(height, Math.ceil(row / thinnestBin(y.type, edges) - 1e-9));
}

/** The space between a calendar's folded blocks. */
const BLOCK_GAP = 16;

// A calendar's week columns of weekday rows, in one block while a week
// column is WEEK_MIN px or more, else in blocks of 26 or 13 weeks
// stacked BLOCK_GAP apart, each under a line of its month names.
function calendarLayout(
  model: Model,
  m: CalendarModel,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart: number,
): Layout {
  const { measure, lineHeight, dpr, row } = metrics;
  const lead = weekRow(m.day, m.weekStart);
  const weekday = dayFormat(model.locale, { weekday: "short" });
  const names = Array.from({ length: 7 }, (_, r) => weekday(m.day - lead + r));
  const widest = widestOf(names, measure.text);
  const axisW = Math.max(ceil(axisGutter(widest, metrics.axisGroup)), floors.axis);
  const labelW = Math.max(ceil(metrics.labelGroup), floors.label);
  const plotW = Math.max(1, width - axisW - labelW);
  const total = weekCount(lead, m.values.length);
  const size = Math.max(1, foldSize(total, plotW));
  const weeks = { lead, size, days: m.values.length };
  const blocks = Math.max(1, Math.ceil(total / size));
  const blockH = lineHeight + 7 * row;
  const tops = Array.from({ length: blocks }, (_, b) => b * (blockH + BLOCK_GAP) + lineHeight);
  const height = blocks * blockH + (blocks - 1) * BLOCK_GAP;
  const grid: DayGrid = { weeks, column: plotW / size, row, tops };
  const month = dayFormat(model.locale, { month: "short" });
  const xLabels: Text[] = [];
  m.values.forEach((_, i) => {
    if (!monthFirst(m.day + i)) {
      return;
    }
    const p = dayPlace(weeks, i);
    const text = month(m.day + i);
    const x = axisW + p.column * grid.column;
    // A month starting in a block's last columns ends at the plot's edge.
    const end = x + measure.text(text) > axisW + plotW;
    xLabels.push({
      text,
      x: end ? axisW + plotW : x,
      y: (tops[p.block] ?? 0) - lineHeight / 2,
      anchor: end ? "end" : "start",
    });
  });
  const yLabels = tops.flatMap((top) =>
    names.map((text, r) => ({
      text,
      x: axisW - PAD,
      y: top + (r + 0.5) * row,
      anchor: "end" as const,
    })),
  );
  const frame: Frame = {
    width: plotW,
    height,
    dpr,
    yAt: (v) => v,
    x: model.x,
    xAt: (v) => v,
  };
  const notes = notesOf(
    model,
    metrics,
    frame,
    [],
    () => 0,
    (t) => {
      const i = dayOf(model, m, t);
      if (i === -1) {
        return undefined;
      }
      const b = dayBox(grid, i, dpr);
      return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    },
  );
  return {
    width,
    height,
    left: axisW,
    top: 0,
    frame,
    xAxis: { lo: model.x.lo, hi: model.x.hi, at: (v) => v, ticks: [] },
    yAxis: undefined,
    rows: [],
    cells: undefined,
    days: grid,
    pie: undefined,
    hole: undefined,
    tree: undefined,
    mono: false,
    gutters: { axis: axisW, label: labelW },
    bar: 0,
    valueLabels: [],
    heads: [],
    xLabels,
    yLabels,
    titles: [],
    ruleLabels: [],
    plotLabels: [],
    endLabels: [],
    leaders: [],
    notes,
    numbered: numberedNotes(notes, chart < NARROW_REM * metrics.rem),
  };
}

/** A pie's outside label column is at most this many rem wide, and at most
 *  PIE_COLUMN of the chart's width. */
const PIE_COLUMN_REM = 12;
const PIE_COLUMN = 0.25;
/** The room a donut's total keeps from its hole's edge, in px, all told. */
const HOLE_ROOM = 16;

/**
 * A pie's layout: its circle centred on the plot, as tall as the plot or as
 * wide as the label columns leave it. From 30rem up each drawn slice's name
 * and share sit in a column on the side its middle angle falls on, dodged
 * a name line each apart, joined to the rim at that angle; when a side's
 * labels cannot fit the plot's height none is drawn and the legend row
 * names the slices, as it does under 30rem.
 */
function pieLayout(
  model: Model,
  m: PieModel,
  words: Words,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart: number,
): Layout {
  const { measure, lineHeight, dpr, nameLine } = metrics;
  const height = model.spec.height ?? metrics.height;
  const slices = sliceAngles(m);
  const step = 2 * nameLine;
  const mids = slices.map((s) => (s.from + s.to) / 2);
  const right = mids.filter((a) => a < Math.PI).length;
  const labelled =
    chart >= NARROW_REM * metrics.rem && Math.max(right, slices.length - right) * step <= height;
  const column = labelled ? Math.min(PIE_COLUMN_REM * metrics.rem, PIE_COLUMN * chart) : 0;
  const r = Math.max(0, Math.min(height, width - 2 * column)) / 2;
  const p: PieFrame = { cx: width / 2, cy: height / 2, r, inner: m.hole ? r / 2 : 0 };
  const endLabels: Text[] = [];
  const leaders: Leader[] = [];
  for (const side of labelled ? [1, -1] : []) {
    const on = mids.flatMap((mid, k) => (mid < Math.PI === (side === 1) ? [k] : []));
    const rims = on.map((k) => rimPoint(p, mids[k] ?? 0, r));
    const want = rims.map((pt) => Math.min(Math.max(pt.y, step / 2), height - step / 2));
    const at = dodge(want, step, step / 2, height - step / 2);
    const edge = p.cx + side * r;
    on.forEach((k, j) => {
      const slice = slices[k];
      const s = slice === undefined ? undefined : m.slices[slice.index];
      const rim = rims[j];
      const y = at[j] ?? 0;
      if (slice === undefined || s === undefined || rim === undefined) {
        return;
      }
      const x = edge + side * PAD;
      const anchor = side === 1 ? "start" : "end";
      const share = model.shareText((s.value ?? 0) / m.total);
      endLabels.push(
        {
          text: cutName(s.name, column - PAD, measure.text),
          x,
          y: y - nameLine / 2,
          anchor,
          series: slice.index,
        },
        { text: share, x, y: y + nameLine / 2, anchor, series: slice.index },
      );
      // Out along the rim's height past the circle, which a level line from
      // a point on its own half never crosses, then to the label.
      const bend = { x: edge + side * LEADER_GAP, y: rim.y };
      leaders.push({ from: rim, to: bend }, { from: bend, to: { x: x - side * LEADER_GAP, y } });
    });
  }
  let hole: Layout["hole"];
  if (m.hole && m.total > 0) {
    const value = partAmount(model, m, m.total);
    const room = 2 * p.inner - HOLE_ROOM;
    if (metrics.hole.number(value) <= room && measure.text(words.total) <= room) {
      const top = p.cy - (lineHeight + metrics.holeLine) / 2;
      hole = {
        label: { text: words.total, x: p.cx, y: top + lineHeight / 2, anchor: "middle" },
        total: {
          text: value,
          x: p.cx,
          y: top + lineHeight + metrics.holeLine / 2,
          anchor: "middle",
        },
      };
    }
  }
  const frame: Frame = { width, height, dpr, yAt: (v) => v, x: model.x, xAt: (v) => v };
  return {
    width,
    height,
    left: 0,
    top: 0,
    frame,
    xAxis: { lo: 0, hi: 1, at: (v) => v, ticks: [] },
    yAxis: undefined,
    rows: [],
    cells: undefined,
    days: undefined,
    pie: p,
    hole,
    tree: undefined,
    mono: false,
    gutters: floors,
    bar: 0,
    valueLabels: [],
    heads: [],
    xLabels: [],
    yLabels: [],
    titles: [],
    ruleLabels: [],
    plotLabels: [],
    endLabels,
    leaders,
    notes: [],
    numbered: false,
  };
}

/** Half the 1 px gap between a tree's parts, and of the 4 px between its groups. */
const PART_INSET = 0.5;
const GROUP_INSET = 2;
/** A group at least HEAD_WIDE by HEAD_TALL px gives its top HEAD_BAND px
 *  to its name, its parts below. */
const HEAD_WIDE = 48;
const HEAD_TALL = 54;
const HEAD_BAND = 18;
/** A part's tile at least this tall carries its name over its value,
 *  TILE_PAD px in from its top-left corner. */
const TILE_LABEL = 40;
const TILE_PAD = 4;
/** A tile's label needs room for this many characters of its name. */
const TILE_CHARS = 4;

let graphemes: Intl.Segmenter | undefined;

const lead = (name: string): string => {
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(graphemes.segment(name), (g) => g.segment)
    .slice(0, TILE_CHARS)
    .join("");
};

const grown = (b: Box, g: number): Box => ({
  left: b.left - g,
  top: b.top - g,
  right: b.right + g,
  bottom: b.bottom + g,
});

// `b` moved `g` in on each axis it spans 2g + 2 px or more of, so no gap
// leaves a tile under 2 px, a thinner one touching its neighbour; kept in
// `within`, which the tiling grew by `g` so the outer edges sit flush.
function inset(b: Box, g: number, within: Box, dpr: number): Box {
  const gx = b.right - b.left >= 2 * g + 2 ? g : 0;
  const gy = b.bottom - b.top >= 2 * g + 2 ? g : 0;
  return {
    left: snap(Math.max(b.left + gx, within.left), dpr),
    top: snap(Math.max(b.top + gy, within.top), dpr),
    right: snap(Math.min(b.right - gx, within.right), dpr),
    bottom: snap(Math.min(b.bottom - gy, within.bottom), dpr),
  };
}

/**
 * A treemap's layout: the groups squarified over the plot in the app's
 * order, then each group's parts over its rectangle below its head band;
 * with one level the parts over the plot. A layout whose `kept` has the
 * same names in the same order and the same size keeps every level's rows,
 * so an update moves tile edges and never reorders tiles.
 */
function treeLayout(
  model: Model,
  m: TreeModel,
  metrics: Metrics,
  width: number,
  floors: Floors,
  kept: TreeKept | undefined,
): Layout {
  const { measure, lineHeight, dpr } = metrics;
  const height = model.spec.height ?? metrics.height;
  const names =
    m.groups.length > 0
      ? m.groups.map((g) => [g.name, m.parts.slice(g.first, g.first + g.count).map((p) => p.name)])
      : m.parts.map((p) => p.name);
  const key = `${String(width)} ${String(height)} ${JSON.stringify(names)}`;
  const keep = kept?.key === key ? kept : undefined;
  const tile = (values: readonly number[], b: Box, rows: readonly Row[] | undefined) =>
    rows === undefined ? squarify(values, b) : { boxes: resquarify(values, b, rows), rows };
  const plot: Box = { left: 0, top: 0, right: width, bottom: height };
  const tiles: (Box | undefined)[] = [];
  const parts = (first: number, count: number, area: Box, rows: readonly Row[] | undefined) => {
    const list = m.parts.slice(first, first + count);
    const t = tile(
      list.map((p) => p.value ?? 0),
      grown(area, PART_INSET),
      rows,
    );
    list.forEach((p, k) => {
      const b = t.boxes[k];
      tiles.push(
        b !== undefined && (p.value ?? 0) > 0 ? inset(b, PART_INSET, area, dpr) : undefined,
      );
    });
    return t.rows;
  };
  const groups: Box[] = [];
  const bands: (Box | undefined)[] = [];
  const heads: Text[] = [];
  const inner: (readonly Row[])[] = [];
  let top: readonly Row[];
  if (m.groups.length > 0) {
    const t = tile(
      m.groups.map((g) => g.value),
      grown(plot, GROUP_INSET),
      keep?.top,
    );
    top = t.rows;
    m.groups.forEach((g, k) => {
      const box = inset(t.boxes[k] ?? plot, GROUP_INSET, plot, dpr);
      groups.push(box);
      const headed = box.right - box.left >= HEAD_WIDE && box.bottom - box.top >= HEAD_TALL;
      bands.push(headed ? { ...box, bottom: box.top + HEAD_BAND } : undefined);
      if (headed) {
        heads.push({
          text: cutName(g.name, box.right - box.left - 2 * TILE_PAD, measure.text),
          x: box.left + TILE_PAD,
          y: box.top + HEAD_BAND / 2,
          anchor: "start",
          series: k,
        });
      }
      const area = headed ? { ...box, top: box.top + HEAD_BAND } : box;
      inner.push(parts(g.first, g.count, area, keep?.inner[k]));
    });
  } else {
    top = parts(0, m.parts.length, plot, keep?.top);
  }
  const labels: Text[] = [];
  tiles.forEach((b, i) => {
    const p = m.parts[i];
    if (b === undefined || p === undefined || p.value === null) {
      return;
    }
    const room = b.right - b.left - 2 * TILE_PAD;
    if (b.bottom - b.top < TILE_LABEL || measure.text(lead(p.name)) > room) {
      return;
    }
    const x = b.left + TILE_PAD;
    const y = b.top + TILE_PAD + lineHeight / 2;
    labels.push({ text: cutName(p.name, room, measure.text), x, y, anchor: "start", series: i });
    // A value is never cut, so one wider than its tile leaves the name alone.
    const value = partAmount(model, m, p.value);
    if (measure.number(value) <= room) {
      labels.push({ text: value, x, y: y + lineHeight, anchor: "start", series: i });
    }
  });
  const frame: Frame = { width, height, dpr, yAt: (v) => v, x: model.x, xAt: (v) => v };
  return {
    width,
    height,
    left: 0,
    top: 0,
    frame,
    xAxis: { lo: 0, hi: 1, at: (v) => v, ticks: [] },
    yAxis: undefined,
    rows: [],
    cells: undefined,
    days: undefined,
    pie: undefined,
    hole: undefined,
    tree: { tiles, groups, bands, labels, kept: { key, top, inner } },
    mono: false,
    gutters: floors,
    bar: 0,
    valueLabels: [],
    heads,
    xLabels: [],
    yLabels: [],
    titles: [],
    ruleLabels: [],
    plotLabels: [],
    endLabels: [],
    leaders: [],
    notes: [],
    numbered: false,
  };
}

/** An x rule's label on the plot: its words and value, or off the axis. */
function ruleText(model: Model, words: Words, label: string, value: number, off: boolean): string {
  const written = model.xText(value);
  return off ? words.offAxis(label, written) : `${label} ${written}`;
}

/**
 * Lays out `model` in a `width` px box. The gutters are the larger of the
 * measured ones, the group's and `floors`; the caller keeps the result's
 * `gutters` as the next update's floors so the plot never moves sideways.
 * `chart` is the chart's own width, which the 30rem rule and the band
 * names' cut read, `width` by default. `kept` is the last layout's
 * `tree.kept`, which a treemap of the same names and size keeps.
 */
export function layout(
  model: Model,
  words: Words,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart = width,
  kept?: TreeKept,
): Layout {
  const slope = model.marks.find((m) => m.kind === "slope");
  if (slope !== undefined) {
    return slopeLayout(model, slope, words, metrics, width, floors, chart);
  }
  const calendar = model.marks.find((m) => m.kind === "calendar");
  if (calendar !== undefined) {
    return calendarLayout(model, calendar, metrics, width, floors, chart);
  }
  const pie = model.marks.find((m) => m.kind === "pie");
  if (pie !== undefined) {
    return pieLayout(model, pie, words, metrics, width, floors, chart);
  }
  const tree = model.marks.find((m) => m.kind === "tree");
  if (tree !== undefined) {
    return treeLayout(model, tree, metrics, width, floors, kept);
  }
  const { measure, lineHeight, dpr } = metrics;
  const ctx = { locale: model.locale, timeZone: model.timeZone, measure };
  const band = model.y.type === "band" ? model.y : undefined;
  const mono = band?.mono === true;
  const narrow = chart < NARROW_REM * metrics.rem;
  const bars = model.marks.find((m): m is BarModel => m.kind === "bar");
  const points = model.marks.some((m) => m.kind === "point");
  const boxes = model.marks.find((m): m is BoxModel => m.kind === "box");
  const scatter = model.marks.find((m) => m.kind === "scatter");
  const cells = model.marks.find((m): m is CellModel => m.kind === "cell");
  const bubble =
    scatter?.size === undefined ? undefined : narrow ? BUBBLE_RADIUS_NARROW : BUBBLE_RADIUS;
  const mirror = bars?.arrange === "mirror";
  // Under 30rem a name above its bar, its dots or its boxes leaves the plot
  // the chart's whole width; a mirror's short names stay in the gutter,
  // keeping its rows short.
  const above = narrow && ((bars !== undefined && !mirror) || points || boxes !== undefined);
  // Under 30rem a split's panels would be too thin for their bars, so they
  // fold into one, each row's bars one under another as a group's.
  const panelled = (bars?.arrange === "split" && !narrow) || mirror;
  const thick =
    bars === undefined ? 0 : Math.max(1, metrics.row - (mirror ? MIRROR_SPACE : BAR_SPACE));
  const block =
    bars !== undefined
      ? panelled
        ? thick
        : barBlock(bars, thick)
      : points
        ? 2 * POINT_RADIUS
        : boxes !== undefined
          ? boxBlock(boxes)
          : 0;
  // Under its name a point row is its dots and a bar's room; a box row of
  // several series grows by a sub-row each.
  const barRow =
    boxes !== undefined
      ? Math.max(metrics.row, block + BAR_SPACE)
      : points && above
        ? block + BAR_SPACE
        : !points && block > thick
          ? block + BAR_SPACE
          : metrics.row;
  const rowH = above ? metrics.nameLine + NAME_GAP + barRow : barRow;
  const yBins = cells !== undefined && "edges" in cells.y ? cells.y.edges : undefined;
  const height =
    band !== undefined
      ? band.rows.length * rowH
      : yBins !== undefined
        ? binnedHeight(
            model.y as Continuous,
            yBins,
            model.spec.height ?? metrics.height,
            metrics.row,
          )
        : (model.spec.height ?? metrics.height);

  let yAx: Axis | undefined;
  let names: string[] = [];
  let widestY = 0;
  if (band === undefined) {
    const yInset = scatter === undefined ? 0 : scatterInset(scatter, bubble);
    const laid = yAxis(model.y as Continuous, Math.max(1, height - 2 * yInset), lineHeight, ctx);
    yAx =
      yInset === 0
        ? laid
        : {
            ...laid,
            at: (v) => yInset + laid.at(v),
            ticks: laid.ticks.map((t) => moved(t, (v) => yInset + v)),
          };
    for (const t of yAx.ticks) {
      widestY = Math.max(widestY, t.label?.width ?? 0);
    }
  } else if (!above) {
    const face = mono ? metrics.mono : measure;
    const limit = bandLimit(metrics.axisGroup, chart, metrics.rem);
    names = band.rows.map((n) => cutName(n, limit, face.text));
    widestY = widestOf(names, face.text);
  }
  const axisW = above ? 0 : Math.max(ceil(axisGutter(widestY, metrics.axisGroup)), floors.axis);

  // A group's label gutter holds every end label, as its axis gutter holds
  // band names, so a long series name never moves one plot off the shared edge.
  const endLimit = metrics.labelGroup > 0 ? metrics.labelGroup - PAD : Number.POSITIVE_INFINITY;
  const ends = narrow ? [] : endTexts(model, words, measure, endLimit);
  const widestEnd = widestOf(ends, (e) => measure.number(e.text));
  const labelW = Math.max(
    ends.length > 0 ? ceil(widestEnd + PAD) : 0,
    ceil(metrics.labelGroup),
    floors.label,
  );

  const plotW = Math.max(1, width - axisW - labelW);
  const reverse = model.x.reverse;
  const left = reverse ? labelW : axisW;
  if (band !== undefined && above) {
    const face = mono ? metrics.mono : measure;
    names = band.rows.map((n) => cutName(n, plotW, face.text));
  }

  // Value labels sit past each bar's end, so x ends short of each side by
  // the widest label there and its gap; they stand in for the x axis.
  const valued = bars?.labels === true;
  const values = valued && band !== undefined ? barValues(bars, band.rows.length) : [];
  const valueTexts = values.map((t) => model.xText(t.value));
  let roomLeft = 0;
  let roomRight = 0;
  values.forEach((t, i) => {
    const w = measure.number(valueTexts[i] ?? "") + VALUE_GAP;
    if (t.value < 0 !== reverse) {
      roomLeft = Math.max(roomLeft, w);
    } else {
      roomRight = Math.max(roomRight, w);
    }
  });
  // Panels share one scale, so each lays the same axis rightward from its
  // baseline along the same width, its labels' room kept at its outer end,
  // and turns it to run its own way.
  const count = panelled ? bars.series.length : 1;
  const gap = mirror ? SPINE : PANEL_GAP;
  const panelW = Math.max(1, (plotW - (count - 1) * gap) / count);
  const flip = reverse && !panelled;
  const inset = points
    ? POINT_INSET
    : boxes !== undefined
      ? BOX_INSET
      : scatter === undefined
        ? 0
        : scatterInset(scatter, bubble);
  if (panelled) {
    roomRight = Math.max(roomLeft, roomRight);
    roomLeft = 0;
  }
  // A note at its row's end needs its point, and a numbered marker round it,
  // on the plot: past each panel's outer end, a diverging row's right end,
  // or the end the bars run to.
  const endRoom = model.marks.some((m) => m.kind === "text" && m.x === undefined)
    ? END_GAP + MARKER_RADIUS
    : 0;
  const endLeft = !panelled && bars?.arrange !== "diverge" && reverse;
  if (endLeft) {
    roomLeft += endRoom;
  } else {
    roomRight += endRoom;
  }
  const shift = valued ? 0 : inset + (endLeft ? endRoom : 0);
  const one: Axis =
    cells !== undefined && "names" in cells.x
      ? bandAxis(cells.x.names, plotW, reverse, measure)
      : valued
        ? {
            lo: model.x.lo,
            hi: model.x.hi,
            at: flip
              ? position("linear", model.x.lo, model.x.hi, panelW - roomRight, roomLeft)
              : position("linear", model.x.lo, model.x.hi, roomLeft, panelW - roomRight),
            ticks: [],
          }
        : xAxis(
            flip === reverse ? model.x : { ...model.x, reverse: flip },
            Math.max(1, panelW - 2 * inset - endRoom),
            ctx,
          );
  const panels = panelled ? panelsOf(bars, panelW, reverse, one.at) : [];
  const xAx: Axis =
    panels[0] === undefined
      ? shift === 0
        ? one
        : {
            ...one,
            at: (v) => shift + one.at(v),
            ticks: one.ticks.map((t) => moved(t, (v) => shift + v)),
          }
      : {
          ...one,
          at: panels[0].at,
          ticks: panels.flatMap((p) => one.ticks.map((t) => inPanel(t, p))),
        };
  const across = { x: model.x, xAt: xAx.at, ...(panels.length > 0 ? { panels } : {}) };

  const xRules = model.marks.filter((m) => m.kind === "rule" && m.axis === "x");
  const ruleTexts: string[] = [];
  const bandLabels: RuleLabel[] = [];
  for (const r of xRules) {
    if (r.kind !== "rule") {
      continue;
    }
    const off = "off" in r.place;
    const text = ruleText(model, words, r.label, r.value, off);
    const w = measure.number(text);
    ruleTexts.push(text);
    if ("off" in r.place) {
      // The band lays out physical ends; a reversed x has its low end at the right.
      const physical = (r.place.off === "low") !== reverse ? "low" : "high";
      bandLabels.push({ off: physical, width: w });
    } else {
      // A rule drawn more than once labels its first panel's line, or its
      // right-hand line on both sides of a spine or a diverging 0.
      const xs = ruleXs(r.place.at, across);
      const at =
        bars?.arrange === "split"
          ? (xs[0] ?? 0)
          : xs.reduce((most, x) => Math.max(most, x), Number.NEGATIVE_INFINITY);
      bandLabels.push({ at, width: w });
    }
  }
  const placed = ruleBand(bandLabels, plotW);
  const yTitle = band === undefined ? model.spec.y?.label : undefined;
  const titleW = yTitle === undefined ? 0 : measure.text(yTitle);
  // The title shares the band's first line unless a label there would touch it.
  const titleClear = placed.placed.every(
    (p, k) =>
      p.line !== 0 ||
      (reverse
        ? left + p.start + (bandLabels[k]?.width ?? 0) + PAD <= width - titleW
        : left + p.start >= titleW + PAD),
  );
  const titleLines = yTitle === undefined ? 0 : titleClear ? 0 : 1;
  const bandLines = Math.max(placed.lines, yTitle === undefined ? 0 : 1 - titleLines);
  const headLine = titleLines + bandLines;
  const lines = headLine + (panels.length > 0 ? 1 : 0);
  const top = lines === 0 ? 0 : lines * lineHeight + TICK;

  const mid = (line: number) => (line + 0.5) * lineHeight;
  const ruleLabels: Text[] = placed.placed.map((p, k) => ({
    text: ruleTexts[k] ?? "",
    x: left + p.start,
    y: mid(titleLines + p.line),
    anchor: "start",
  }));
  const titles: Text[] = [];
  if (yTitle !== undefined) {
    titles.push(
      reverse
        ? { text: yTitle, x: width, y: mid(0), anchor: "end" }
        : { text: yTitle, x: 0, y: mid(0), anchor: "start" },
    );
  }

  // A panel's name over it, cut to its width; the legend row and the table
  // give it whole.
  const heads: Text[] = panels.map((p, k) => ({
    text: cutName(bars?.series[k]?.name ?? "", p.right - p.left, measure.text),
    x: left + (p.leftward ? p.right : p.left),
    y: mid(headLine),
    anchor: p.leftward ? "end" : "start",
  }));

  const xLabels: Text[] = [];
  let xLines = 0;
  const labelTop = top + height + TICK + 2;
  const bandX = cells !== undefined && "names" in cells.x;
  for (const t of xAx.ticks) {
    const label = t.label;
    if (label === undefined) {
      continue;
    }
    xLines = Math.max(xLines, label.lines.length);
    label.lines.forEach((text, k) => {
      xLabels.push({
        text,
        x: left + (label.box.start + label.box.end) / 2,
        y: labelTop + mid(k),
        anchor: "middle",
        ...(bandX ? { column: Math.floor(t.value) } : {}),
      });
    });
  }
  const xTitle = model.x.type === "time" || valued ? undefined : model.spec.x?.label;
  if (xTitle !== undefined) {
    titles.push({
      text: xTitle,
      x: reverse ? left : left + plotW,
      y: labelTop + mid(xLines),
      anchor: reverse ? "start" : "end",
    });
  }
  const bottom = valued ? 0 : TICK + 2 + (xLines + (xTitle === undefined ? 0 : 1)) * lineHeight;

  const yLabels: Text[] = [];
  const rows: { name: string; y: number }[] = [];
  const gutterX = reverse ? left + plotW + PAD : left - PAD;
  const gutterAnchor = reverse ? "start" : "end";
  if (yAx !== undefined) {
    for (const t of yAx.ticks) {
      if (t.label !== undefined) {
        yLabels.push({
          text: t.label.lines[0] ?? "",
          x: gutterX,
          y: top + t.at,
          anchor: gutterAnchor,
        });
      }
    }
  } else {
    names.forEach((name, i) => {
      if (above) {
        const y = i * rowH + metrics.nameLine + NAME_GAP + block / 2;
        rows.push({ name, y });
        yLabels.push(
          reverse
            ? {
                text: name,
                x: left + plotW,
                y: top + i * rowH + metrics.nameLine / 2,
                anchor: "end",
              }
            : { text: name, x: left, y: top + i * rowH + metrics.nameLine / 2, anchor: "start" },
        );
        return;
      }
      const y = (i + 0.5) * rowH;
      rows.push({ name, y });
      yLabels.push({ text: name, x: gutterX, y: top + y, anchor: gutterAnchor });
    });
  }

  const valueLabels: Text[] = [];
  // Each label's bar and the label's outer edge.
  const labelEnds: (BarValue & { readonly edge: number })[] = [];
  // A bar is cut at a passed domain's end (`barSegments`), so what sits at
  // its end is placed from its value held to the domain.
  const held = (v: number) => Math.min(Math.max(v, model.x.lo), model.x.hi);
  values.forEach((t, i) => {
    const at = rows[t.row];
    if (at === undefined || bars === undefined) {
      return;
    }
    const panel = t.series === undefined ? undefined : panels[t.series];
    const reach = t.series === undefined ? barReach(bars, t.row) : undefined;
    const end =
      panel !== undefined
        ? panel.at(held(t.value))
        : xAx.at(held(reach === undefined ? t.value : t.value < 0 ? reach.lo : reach.hi));
    const leftward = panel?.leftward ?? t.value < 0 !== reverse;
    const text = valueTexts[i] ?? "";
    const x = leftward ? end - VALUE_GAP : end + VALUE_GAP;
    const w = measure.number(text);
    labelEnds.push({ ...t, edge: leftward ? x - w : x + w });
    valueLabels.push({
      text,
      x,
      y:
        t.series === undefined || panel !== undefined
          ? at.y
          : barCentre(bars, t.series, at.y, thick),
      anchor: leftward ? "end" : "start",
    });
  });

  const yAt = yAx?.at ?? ((v: number) => v);
  const plotLabels =
    yAx === undefined ? [] : yRuleLabels(model, words, yAt, plotW, height, lineHeight);

  // End labels in the label gutter at their values; a lower one moves
  // down until it clears the one above.
  const sorted = ends
    .map((e) => ({ ...e, y: Math.min(Math.max(yAt(e.value), 0), height) }))
    .sort((a, b) => a.y - b.y);
  let floor = Number.NEGATIVE_INFINITY;
  const endLabels = sorted.map((e) => {
    const y = Math.max(e.y, floor + lineHeight);
    floor = y;
    return {
      text: e.text,
      x: reverse ? left - PAD : left + plotW + PAD,
      y: top + y,
      anchor: reverse ? ("end" as const) : ("start" as const),
    };
  });

  const frame: Frame = {
    width: plotW,
    height,
    dpr,
    yAt,
    ...across,
    ...(bubble === undefined ? {} : { bubble }),
  };

  // A note with no x points 4 px past the outer end of its row's last
  // place: the last panel's bar, a mirror's or a diverging row's right
  // side, or else its farthest bar; past that bar's value label if it has one.
  const rowEnd = (row: number): number => {
    if (bars === undefined) {
      return 0;
    }
    const k = mirror ? panels.findIndex((p) => !p.leftward) : panels.length - 1;
    const panel = panels[k];
    if (panel !== undefined) {
      const label = labelEnds.find((e) => e.row === row && e.series === k);
      const dir = panel.leftward ? -1 : 1;
      return (label?.edge ?? panel.at(held(bars.series[k]?.x[row] ?? 0))) + dir * END_GAP;
    }
    const reach = barReach(bars, row);
    if (bars.arrange === "diverge") {
      return Math.max(xAx.at(held(reach.lo)), xAx.at(held(reach.hi))) + END_GAP;
    }
    // Bars here are 0 or more, so the farthest reaches the row's highest.
    const label = labelEnds.find((e) => e.row === row && e.value === reach.hi);
    return (label?.edge ?? xAx.at(held(reach.hi))) + (reverse ? -END_GAP : END_GAP);
  };
  const notes = notesOf(model, metrics, frame, rows, rowEnd);
  return {
    width,
    height: top + height + bottom,
    left,
    top,
    frame,
    xAxis: xAx,
    yAxis: yAx,
    rows,
    cells:
      cells === undefined
        ? undefined
        : {
            xs:
              "edges" in cells.x
                ? cells.x.edges.map((e) => xAx.at(e))
                : Array.from({ length: cells.x.names.length + 1 }, (_, c) => xAx.at(c)),
            ys:
              yBins?.map((e) => yAt(e)) ??
              Array.from({ length: rows.length + 1 }, (_, r) => r * rowH),
          },
    days: undefined,
    pie: undefined,
    hole: undefined,
    tree: undefined,
    mono,
    gutters: { axis: axisW, label: labelW },
    bar: thick,
    valueLabels,
    heads,
    xLabels,
    yLabels,
    titles,
    ruleLabels,
    plotLabels,
    endLabels,
    leaders: [],
    notes,
    numbered: numberedNotes(notes, narrow),
  };
}
