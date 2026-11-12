/**
 * layout.ts — where a chart's parts sit in its SVG at a width: the y gutter
 * and the label gutter, the rule labels' band and the y title above the
 * plot, the x axis under it, the lines' and areas' end labels, and the
 * text marks' notes.
 * @module
 */

import type { Measure } from "../scale/measure.js";

import {
  axisGutter,
  bandLimit,
  cutName,
  ruleBand,
  xAxis,
  yAxis,
  type Axis,
  type RuleLabel,
} from "./axis.js";
import type { Frame } from "./geometry.js";
import { sampleValue, type Model } from "./model.js";
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
  /** A band's rows, each name cut to its gutter, `y` its middle in the plot. */
  readonly rows: readonly { readonly name: string; readonly y: number }[];
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
/** Under this many rem a chart draws no end labels, and its notes as numbered markers. */
const NARROW_REM = 30;

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
  const height =
    band === undefined ? (model.spec.height ?? metrics.height) : band.rows.length * metrics.row;

  let yAx: Axis | undefined;
  let names: string[] = [];
  let widestY = 0;
  if (band === undefined) {
    yAx = yAxis(model.y as Continuous, height, lineHeight, ctx);
    for (const t of yAx.ticks) {
      widestY = Math.max(widestY, t.label?.width ?? 0);
    }
  } else {
    const face = mono ? metrics.mono : measure;
    const limit = bandLimit(metrics.axisGroup, chart, metrics.rem);
    names = band.rows.map((n) => cutName(n, limit, face.text));
    widestY = Math.max(0, ...names.map(face.text));
  }
  const axisW = Math.max(ceil(axisGutter(widestY, metrics.axisGroup)), floors.axis);

  const ends = chart >= NARROW_REM * metrics.rem ? endTexts(model, words) : [];
  const widestEnd = Math.max(0, ...ends.map((e) => measure.number(e.text)));
  const labelW = Math.max(
    ends.length > 0 ? ceil(widestEnd + PAD) : 0,
    ceil(metrics.labelGroup),
    floors.label,
  );

  const plotW = Math.max(1, width - axisW - labelW);
  const reverse = model.x.reverse;
  const left = reverse ? labelW : axisW;
  const xAx = xAxis(model.x, plotW, ctx);

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
  const lines = titleLines + bandLines;
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
  const xTitle = model.x.type === "time" ? undefined : model.spec.x.label;
  if (xTitle !== undefined) {
    titles.push({
      text: xTitle,
      x: reverse ? left : left + plotW,
      y: labelTop + mid(xLines),
      anchor: reverse ? "start" : "end",
    });
  }
  const bottom = TICK + 2 + (xLines + (xTitle === undefined ? 0 : 1)) * lineHeight;

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
      const y = (i + 0.5) * metrics.row;
      rows.push({ name, y });
      yLabels.push({ text: name, x: gutterX, y: top + y, anchor: gutterAnchor });
    });
  }

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

  const frame: Frame = { width: plotW, height, dpr, x: model.x, xAt: xAx.at, yAt };
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
    xLabels,
    yLabels,
    titles,
    ruleLabels,
    plotLabels,
    endLabels,
    notes,
    numbered: numberedNotes(notes, chart < NARROW_REM * metrics.rem),
  };
}
