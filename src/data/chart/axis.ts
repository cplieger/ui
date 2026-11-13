/**
 * axis.ts — a chart's axes at a size: their ticks and labels, the y gutter,
 * band names cut to it, and the rule labels' band above the plot.
 * @module
 */

import { formatter, tickFormat } from "../scale/format.js";
import { boxes, greedy, LABEL_GAP, tooSparse, type Box } from "../scale/labels.js";
import { coarserStep, linearAxis, linearTicks } from "../scale/linear.js";
import { logTickLists } from "../scale/log.js";
import type { Measure } from "../scale/measure.js";
import { position } from "../scale/position.js";
import { localDay, TIME_STEPS, timeStep, timeTicks } from "../scale/time.js";

import type { Continuous } from "./scales.js";

/** The target room between x ticks and between y ticks, in px. */
const X_SPACING = 80;
const Y_SPACING = 40;

/** The pad between the widest y label and the plot. */
const GUTTER_PAD = 8;

interface Label {
  /** One line, or a time's two: the time, then the date. */
  readonly lines: readonly string[];
  /** The widest line, in px. */
  readonly width: number;
  /** Its extent along the axis, in px. */
  readonly box: Box;
}

/** A tick along an axis, with its label if it kept one. */
export interface Tick {
  readonly value: number;
  /** Its position along the axis, in px. */
  readonly at: number;
  /** Absent when the label was dropped for room. */
  readonly label: Label | undefined;
}

export interface Axis {
  /** The axis domain, niced on a linear axis that was not passed one. */
  readonly lo: number;
  readonly hi: number;
  /** Maps a value to its px along the axis. */
  readonly at: (value: number) => number;
  readonly ticks: readonly Tick[];
}

export interface AxisContext {
  readonly locale: string | undefined;
  readonly timeZone: string | undefined;
  readonly measure: Measure;
}

interface Candidate {
  readonly at: number;
  readonly lines: readonly string[];
}

// How one axis lays its labels: along x, each as wide as its widest line and
// kept inside the plot; up y, each `lineHeight` tall per line, centred.
interface Layout {
  readonly length: number;
  readonly lineHeight: number | undefined;
  readonly measure: Measure;
}

// The labels of `candidates`, in order along the axis, and the indices greedy keeps.
function place(
  candidates: readonly Candidate[],
  layout: Layout,
): { labels: Label[]; kept: number[] } {
  const widths = candidates.map((c) =>
    Math.max(0, ...c.lines.map((line) => layout.measure.number(line))),
  );
  const { lineHeight } = layout;
  const placed = boxes(
    candidates.map((c) => c.at),
    lineHeight === undefined ? widths : candidates.map((c) => lineHeight * c.lines.length),
    layout.length,
    lineHeight === undefined,
  );
  const labels = candidates.map((c, i) => ({
    lines: c.lines,
    width: widths[i] ?? 0,
    box: placed[i] ?? { start: 0, end: 0 },
  }));
  return { labels, kept: greedy(placed) };
}

const byPosition = (a: { readonly at: number }, b: { readonly at: number }) => a.at - b.at;

// Ticks at `values`, labelled by `write`, in order along the axis.
function fitted(
  values: readonly number[],
  at: (v: number) => number,
  write: (v: number) => string,
  layout: Layout,
): { ticks: Tick[]; shown: number; clear: boolean } {
  const candidates = values.map((value) => ({ value, at: at(value), lines: [write(value)] }));
  candidates.sort(byPosition);
  const { labels, kept } = place(candidates, layout);
  const keep = new Set(kept);
  const ticks = candidates.map((c, i) => ({
    value: c.value,
    at: c.at,
    label: keep.has(i) ? labels[i] : undefined,
  }));
  return { ticks, shown: kept.length, clear: kept.length === candidates.length };
}

function logAxis(
  scale: Continuous,
  at: (v: number) => number,
  layout: Layout,
  locale: string | undefined,
): Axis {
  const duration = scale.format === "duration";
  const write = formatter(duration ? "duration" : scale.format, locale);
  const lists = logTickLists(scale.lo, scale.hi, duration);
  let chosen: Tick[] = [];
  for (const [n, list] of lists.entries()) {
    const { ticks, clear } = fitted(list, at, write, layout);
    chosen = ticks;
    if (clear || n === lists.length - 1) {
      break;
    }
  }
  return { lo: scale.lo, hi: scale.hi, at, ticks: chosen };
}

function linearAxisAt(
  scale: Continuous,
  spacing: number,
  range: (lo: number, hi: number) => (v: number) => number,
  layout: Layout,
  locale: string | undefined,
): Axis {
  const axis = linearAxis(scale.lo, scale.hi, layout.length, spacing, {
    nice: !scale.passed,
    integer: scale.integer,
  });
  const [lo, hi] = axis.domain;
  const at = range(lo, hi);
  const format = formatter(scale.format, locale);
  const write = scale.absolute ? (v: number) => format(Math.abs(v)) : format;
  for (let step = axis.step; ; step = coarserStep(step)) {
    const values = linearTicks(lo, hi, step);
    const { ticks, shown } = fitted(values, at, write, layout);
    if (!tooSparse(shown, values.length) || values.length <= 1) {
      return { lo, hi, at, ticks };
    }
  }
}

// A time axis's labels at `values`: the date line goes on the first kept
// label and wherever the day changes from the kept label before it, so a
// label dropped for room passes its date on.
function timeLabels(
  values: readonly number[],
  at: (v: number) => number,
  words: ReturnType<typeof tickFormat>,
  layout: Layout,
  timeZone: string | undefined,
): Map<number, Label> {
  let kept = [...values];
  for (;;) {
    const candidates = kept.map((value, k) => {
      const before = kept[k - 1];
      const dated =
        words.time === undefined ||
        before === undefined ||
        localDay(before, timeZone) !== localDay(value, timeZone);
      const lines = [
        ...(words.time === undefined ? [] : [words.time(value)]),
        ...(dated ? [words.date(value)] : []),
      ];
      return { value, at: at(value), lines };
    });
    candidates.sort(byPosition);
    const { labels, kept: next } = place(candidates, layout);
    if (next.length === candidates.length) {
      return new Map(
        candidates.map((c, i) => [
          c.value,
          labels[i] ?? { lines: [], width: 0, box: { start: 0, end: 0 } },
        ]),
      );
    }
    const keep = new Set(next.map((i) => candidates[i]?.value));
    kept = kept.filter((value) => keep.has(value));
  }
}

function timeAxis(
  scale: Continuous,
  at: (v: number) => number,
  layout: Layout,
  ctx: AxisContext,
): Axis {
  const { lo, hi } = scale;
  for (let index = timeStep(hi - lo, layout.length, X_SPACING); ; index++) {
    const step = TIME_STEPS[index] ?? 0;
    const values = timeTicks(lo, hi, index, ctx.timeZone);
    const words = tickFormat(ctx.locale, ctx.timeZone, step);
    const labels = timeLabels(values, at, words, layout, ctx.timeZone);
    if (!tooSparse(labels.size, values.length) || index >= TIME_STEPS.length - 1) {
      const ticks = values.map((value) => ({ value, at: at(value), label: labels.get(value) }));
      return { lo, hi, at, ticks: ticks.sort(byPosition) };
    }
  }
}

/** The x axis of `scale` along `width` px, with the tick labels that fit:
 *  time and linear axes move to a coarser step rather than drop more than
 *  every other label; a log axis takes its first tick list that fits. */
export function xAxis(scale: Continuous, width: number, ctx: AxisContext): Axis {
  const layout = { length: width, lineHeight: undefined, measure: ctx.measure };
  const range = (lo: number, hi: number) =>
    scale.reverse ? position(scale.type, lo, hi, width, 0) : position(scale.type, lo, hi, 0, width);
  switch (scale.type) {
    case "time":
      return timeAxis(scale, range(scale.lo, scale.hi), layout, ctx);
    case "log":
      return logAxis(scale, range(scale.drawnLo, scale.hi), layout, ctx.locale);
    case "linear":
      return linearAxisAt(scale, X_SPACING, range, layout, ctx.locale);
  }
}

/** The y axis of `scale` up `height` px, its labels `lineHeight` px tall. */
export function yAxis(
  scale: Continuous,
  height: number,
  lineHeight: number,
  ctx: AxisContext,
): Axis {
  const layout = { length: height, lineHeight, measure: ctx.measure };
  const range = (lo: number, hi: number) => position(scale.type, lo, hi, height, 0);
  return scale.type === "log"
    ? logAxis(scale, range(scale.lo, scale.hi), layout, ctx.locale)
    : linearAxisAt(scale, Y_SPACING, range, layout, ctx.locale);
}

/** The y gutter: the widest y label and its pad, or the group's
 *  `--cp-chart-axis-gutter` when that is wider. */
export const axisGutter = (widest: number, group: number): number =>
  Math.max(widest + GUTTER_PAD, group);

/** The width a band axis cuts its row names to: the group gutter less its
 *  pad, so a name never widens a shared gutter; with no group gutter, 40 %
 *  of the chart's width, at most 12rem. */
export const bandLimit = (group: number, chartWidth: number, rem: number): number =>
  group > 0 ? group - GUTTER_PAD : Math.min(0.4 * chartWidth, 12 * rem);

let graphemes: Intl.Segmenter | undefined;

/** `name`, or its longest grapheme prefix and an ellipsis, within `limit` px. */
export function cutName(name: string, limit: number, measure: (text: string) => number): string {
  if (measure(name) <= limit) {
    return name;
  }
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const parts = Array.from(graphemes.segment(name), (s) => s.segment);
  let lo = 0;
  let hi = parts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (measure(`${parts.slice(0, mid).join("")}…`) <= limit) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${parts.slice(0, lo).join("")}…`;
}

/** An x rule's label: at its rule's px, or off the axis at an end. */
export type RuleLabel =
  | { readonly at: number; readonly width: number }
  | { readonly off: "low" | "high"; readonly width: number };

interface RuleBand {
  /** Each label's start in px and its line, 0 or 1, in the given order. */
  readonly placed: readonly { readonly start: number; readonly line: 0 | 1 }[];
  /** The band's lines: 0 with no label, else 1 or 2. */
  readonly lines: 0 | 1 | 2;
}

/**
 * Lays x rules' labels in the band above a `width` px plot, in order: each
 * starts at its rule and runs right, or ends at it when it would cross the
 * right edge; an off-axis label sits flush with its end. A label closer than
 * `LABEL_GAP` to one on the first line takes the second, even when it comes
 * as close to one there.
 */
export function ruleBand(labels: readonly RuleLabel[], width: number): RuleBand {
  const lines: Box[][] = [[], []];
  const placed = labels.map((label) => {
    const w = label.width;
    let start: number;
    if ("off" in label) {
      start = label.off === "low" ? 0 : width - w;
    } else {
      start = label.at + w <= width ? label.at : label.at - w;
    }
    start = Math.max(0, Math.min(start, width - w));
    const box = { start, end: start + w };
    const clear = (other: Box) =>
      box.start - other.end >= LABEL_GAP || other.start - box.end >= LABEL_GAP;
    const line: 0 | 1 = lines[0]?.every(clear) === true ? 0 : 1;
    lines[line]?.push(box);
    return { start, line };
  });
  const used = (lines[1]?.length ?? 0) > 0 ? 2 : (lines[0]?.length ?? 0) > 0 ? 1 : 0;
  return { placed, lines: used };
}
