/**
 * layout.ts — where a chart's parts sit in its SVG at a width: the y gutter
 * and the label gutter, the rule labels' band and the y title above the
 * plot, the x axis under it, the lines' and areas' end labels, a band
 * chart's rows, a bar chart's panels and value labels, and the text marks'
 * notes.
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
import { barBlock, barCentre, barReach, POINT_RADIUS, type Frame, type Panel } from "./geometry.js";
import { barsApart, sampleValue, type BarModel, type Model } from "./model.js";
import { NOTE_REM, notePoint, placeNote, wrapNote, type Box } from "./notes.js";
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
  /** A continuous y's axis; absent on a band. */
  readonly yAxis: Axis | undefined;
  /** A band's rows, each name cut to its room, `y` the middle of its dot
   *  row, its bars or its points in the plot. */
  readonly rows: readonly { readonly name: string; readonly y: number }[];
  /** A whole bar's thickness, which a group's thinner bars derive from
   *  (`barBlock`); 0 without a bar mark. */
  readonly bar: number;
  /** A bar chart's value labels, in plot px. */
  readonly valueLabels: readonly Text[];
  /** A split or mirrored bar chart's panel names over its panels, in SVG px. */
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
/** The room between a split bar chart's panels. */
const PANEL_GAP = 16;
/** The spine between a mirrored bar chart's two sides. */
const SPINE = 8;
/** A point chart's x runs this far inside each end of the plot: the
 *  selection ring's reach, 1 px off a dot with its 2 px stroke, so a dot at
 *  the domain's end draws whole, ring and all, inside the plot's clip. */
const POINT_INSET = POINT_RADIUS + 2;

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

// Each text mark `notePoint` places, wrapped and placed beside its point.
function notesOf(model: Model, metrics: Metrics, frame: Frame, rows: Layout["rows"]): Note[] {
  const out: Note[] = [];
  const max = Math.min(NOTE_REM * metrics.rem, frame.width);
  model.marks.forEach((m, mark) => {
    const at = m.kind === "text" ? notePoint(model, m) : undefined;
    if (m.kind !== "text" || at === undefined) {
      return;
    }
    const x = frame.xAt(at.x);
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
        Math.max(1, panelW - 2 * inset),
        ctx,
      );
  const panels = panelled ? panelsOf(bars, panelW, reverse, one.at) : [];
  // A rule's place reads the first panel's axis.
  const xAx: Axis =
    panels[0] === undefined
      ? inset === 0
        ? one
        : {
            ...one,
            at: (v) => inset + one.at(v),
            ticks: one.ticks.map((t) => moved(t, (v) => inset + v)),
          }
      : {
          ...one,
          at: panels[0].at,
          ticks: panels.flatMap((p) => one.ticks.map((t) => inPanel(t, p))),
        };

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
      bandLabels.push({ at: xAx.at(r.place.at), width: w });
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
  const xTitle = model.x.type === "time" || valued ? undefined : model.spec.x.label;
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
  values.forEach((t, i) => {
    const at = rows[t.row];
    if (at === undefined || bars === undefined) {
      return;
    }
    const reach = barReach(bars, t.row);
    const panel = t.series === undefined ? undefined : panels[t.series];
    const end =
      panel !== undefined
        ? panel.at(t.value)
        : xAx.at(t.series !== undefined ? t.value : t.value < 0 ? reach.lo : reach.hi);
    const leftward = panel?.leftward ?? t.value < 0 !== reverse;
    valueLabels.push({
      text: valueTexts[i] ?? "",
      x: leftward ? end - VALUE_GAP : end + VALUE_GAP,
      y:
        t.series === undefined || panel !== undefined
          ? at.y
          : barCentre(bars, t.series, at.y, thick),
      anchor: leftward ? "end" : "start",
    });
  });

  const yAt = yAx?.at ?? ((v: number) => v);
  const plotLabels: Text[] = [];
  for (const r of model.marks) {
    if (r.kind !== "rule" || r.axis !== "y" || yAx === undefined) {
      continue;
    }
    const written = model.yText(r.value);
    if ("off" in r.place) {
      plotLabels.push({
        text: words.offAxis(r.label, written),
        x: plotW - PAD / 2,
        y: r.place.off === "high" ? lineHeight / 2 : height - lineHeight / 2,
        anchor: "end",
      });
    } else {
      plotLabels.push({
        text: `${r.label} ${written}`,
        x: plotW - PAD / 2,
        y: yAt(r.place.at) - lineHeight / 2 - 1,
        anchor: "end",
      });
    }
  }

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
    x: model.x,
    xAt: xAx.at,
    yAt,
    ...(panels.length > 0 ? { panels } : {}),
  };
  const notes = notesOf(model, metrics, frame, rows);
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
    notes,
    numbered: numberedNotes(notes, narrow),
  };
}
