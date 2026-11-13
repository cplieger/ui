/**
 * layout.ts — where a chart's parts sit in its SVG at a width: the y gutter
 * and the label gutter, the rule labels' band and the y title above the
 * plot, the x axis under it, the lines' and areas' end labels, a band
 * chart's rows, a bar chart's panels and value labels, a slope's columns
 * and end labels, and the text marks' notes.
 * @module
 */

import type { Measure } from "../scale/measure.js";
import { position } from "../scale/position.js";

import {
  axisGutter,
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
  POINT_RADIUS,
  ruleXs,
  type Frame,
  type Panel,
} from "./geometry.js";
import { barsApart, sampleValue, type BarModel, type Model, type SlopeModel } from "./model.js";
import { MARKER_RADIUS, NOTE_REM, notePoint, placeNote, wrapNote, type Box } from "./notes.js";
import { lastSample, lastStack, samplePart } from "./readout.js";
import type { Continuous } from "./scales.js";
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
  /** A slope's end label's series. */
  readonly series?: number;
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
  /** A slope's end labels moved off their dots' heights, each joined to its dot. */
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
function endTexts(model: Model, words: Words): { text: string; value: number }[] {
  const out: { text: string; value: number }[] = [];
  for (const m of model.marks) {
    if (m.kind === "line") {
      for (const s of m.series) {
        const value = s.y[lastSample(m, s)];
        if (value !== undefined && value !== null) {
          out.push({ text: `${s.name} ${model.yText(value)}`, value });
        }
      }
    } else if (m.kind === "area") {
      const i = lastStack(m);
      let base = 0;
      for (const s of i === -1 ? [] : m.series) {
        const v = sampleValue(m, s, i) ?? 0;
        out.push({ text: `${s.name} ${samplePart(model, m, s, i, words)}`, value: base + v / 2 });
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
): Note[] {
  const out: Note[] = [];
  const max = Math.min(NOTE_REM * metrics.rem, frame.width);
  model.marks.forEach((m, mark) => {
    const at = m.kind === "text" ? notePoint(model, m) : undefined;
    if (m.kind !== "text" || at === undefined) {
      return;
    }
    const x = at.x === undefined ? rowEnd(at.y) : frame.xAt(at.x);
    const y = m.row ? (rows[at.y]?.y ?? 0) : frame.yAt(at.y);
    const texts = wrapNote(m.text, max, metrics.measure.text);
    const w = Math.max(...texts.map(metrics.measure.text));
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
// some in the list below it.
function numberedNotes(notes: readonly Note[], narrow: boolean): boolean {
  return (
    notes.length > 0 &&
    (narrow ||
      notes.some((n, k) => !n.fits || notes.slice(k + 1).some((o) => overlap(n.box, o.box))))
  );
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
      a.members.push(...b.members);
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
    Math.max(0, ...side.map((e) => measure.number(e.text)));
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
 * names' cut read, `width` by default.
 */
export function layout(
  model: Model,
  words: Words,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart = width,
): Layout {
  const slope = model.marks.find((m) => m.kind === "slope");
  if (slope !== undefined) {
    return slopeLayout(model, slope, words, metrics, width, floors, chart);
  }
  const { measure, lineHeight, dpr } = metrics;
  const ctx = { locale: model.locale, timeZone: model.timeZone, measure };
  const band = model.y.type === "band" ? model.y : undefined;
  const mono = band?.mono === true;
  const narrow = chart < NARROW_REM * metrics.rem;
  const bars = model.marks.find((m): m is BarModel => m.kind === "bar");
  const points = model.marks.some((m) => m.kind === "point");
  const mirror = bars?.arrange === "mirror";
  // Under 30rem a name above its bar or its dots leaves the plot the chart's
  // whole width; a mirror's short names stay in the gutter, keeping its rows
  // short.
  const above = narrow && ((bars !== undefined && !mirror) || points);
  // Under 30rem a split's panels would be too thin for their bars, so they
  // fold into one, each row's bars one under another as a group's.
  const panelled = (bars?.arrange === "split" && !narrow) || mirror;
  const thick =
    bars === undefined ? 0 : Math.max(1, metrics.row - (mirror ? MIRROR_SPACE : BAR_SPACE));
  const block =
    bars !== undefined ? (panelled ? thick : barBlock(bars, thick)) : points ? 2 * POINT_RADIUS : 0;
  // Under its name a point row is its dots and a bar's room.
  const barRow =
    points && above
      ? block + BAR_SPACE
      : !points && block > thick
        ? block + BAR_SPACE
        : metrics.row;
  const rowH = above ? metrics.nameLine + NAME_GAP + barRow : barRow;
  const height =
    band === undefined ? (model.spec.height ?? metrics.height) : band.rows.length * rowH;

  let yAx: Axis | undefined;
  let names: string[] = [];
  let widestY = 0;
  if (band === undefined) {
    yAx = yAxis(model.y as Continuous, height, lineHeight, ctx);
    for (const t of yAx.ticks) {
      widestY = Math.max(widestY, t.label?.width ?? 0);
    }
  } else if (!above) {
    const face = mono ? metrics.mono : measure;
    const limit = bandLimit(metrics.axisGroup, chart, metrics.rem);
    names = band.rows.map((n) => cutName(n, limit, face.text));
    widestY = Math.max(0, ...names.map(face.text));
  }
  const axisW = above ? 0 : Math.max(ceil(axisGutter(widestY, metrics.axisGroup)), floors.axis);

  const ends = narrow ? [] : endTexts(model, words);
  const widestEnd = Math.max(0, ...ends.map((e) => measure.number(e.text)));
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
  const inset = points ? POINT_INSET : 0;
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
  const one: Axis = valued
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
      const at = bars?.arrange === "split" ? (xs[0] ?? 0) : Math.max(...xs);
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
    const reach = barReach(bars, t.row);
    const panel = t.series === undefined ? undefined : panels[t.series];
    const end =
      panel !== undefined
        ? panel.at(held(t.value))
        : xAx.at(held(t.series !== undefined ? t.value : t.value < 0 ? reach.lo : reach.hi));
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

  const frame: Frame = { width: plotW, height, dpr, yAt, ...across };

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
