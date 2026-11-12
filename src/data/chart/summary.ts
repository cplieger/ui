/**
 * summary.ts — a chart's words for a screen reader and for everyone: the
 * plot's short description and the visible summary under the title.
 * @module
 */

import { formatDuration, formatter } from "../scale/format.js";

import type { DotModel, LineModel, Model, RectModel, SeriesModel } from "./model.js";
import { bucketText, counted, domainText, lastSample, primaryOf } from "./readout.js";
import type { Words } from "./words.js";

/** The one step between every neighbour in `steps`, or undefined when they differ. */
function evenStep(steps: readonly number[]): number | undefined {
  const first = steps[0];
  return first !== undefined && steps.every((s) => s === first) ? first : undefined;
}

// A bucket's or a sample interval's size, a duration on a time x.
function sizeText(model: Model, size: number | undefined, words: Words): string {
  if (size === undefined) {
    return "";
  }
  const text = model.x.type === "time" ? formatDuration(size, model.locale) : model.xText(size);
  return words.every(text);
}

const bucketTotal = (m: RectModel, i: number): number =>
  m.series.reduce((n, s) => n + (s.y[i] ?? 0), 0);

const seriesTotal = (m: RectModel, s: SeriesModel): number =>
  m.shown.reduce((n, i) => n + (s.y[i] ?? 0), 0);

function rectSummary(model: Model, m: RectModel, words: Words): string[] {
  const unit = model.spec.y?.unit;
  const total = m.shown.reduce((n, i) => n + bucketTotal(m, i), 0);
  const all = counted(model.yText(total), total, unit, model);
  const range = domainText(model, words);
  const parts =
    m.series.length > 1
      ? m.series.map((s) => `${s.name} ${model.yText(seriesTotal(m, s))}`).join(", ")
      : "";
  if (model.kind === "histogram") {
    const out = [words.binSummary(all, range)];
    if (parts !== "") {
      out.push(words.binParts(parts));
    }
    return out;
  }
  const every = sizeText(
    model,
    evenStep(m.shown.map((i) => (m.x2[i] ?? 0) - (m.x1[i] ?? 0))),
    words,
  );
  const out = [words.stackSummary(all, every, range, parts)];
  // The open bucket is still filling, so a low count there is not a drop.
  const last = m.x1.length - 1;
  let best = -1;
  for (const i of m.shown) {
    if (!(m.open && i === last) && (best === -1 || bucketTotal(m, i) > bucketTotal(m, best))) {
      best = i;
    }
  }
  if (best !== -1 && bucketTotal(m, best) > 0) {
    const n = bucketTotal(m, best);
    out.push(
      words.busiest(bucketText(model, m, best, words), counted(model.yText(n), n, unit, model)),
    );
  }
  return out;
}

function lineSummary(model: Model, m: LineModel, words: Words): string[] {
  const steps: number[] = [];
  for (let i = m.from + 1; i < m.to; i++) {
    steps.push((m.x[i] ?? 0) - (m.x[i - 1] ?? 0));
  }
  const out = [
    words.lineSummary(domainText(model, words), sizeText(model, evenStep(steps), words)),
  ];
  for (const s of m.series) {
    // A loop, since spreading a long series into Math.min overflows the stack.
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let i = m.from; i < m.to; i++) {
      const v = s.y[i] ?? null;
      if (v !== null) {
        low = Math.min(low, v);
        high = Math.max(high, v);
      }
    }
    const at = lastSample(m, s);
    const text = (v: number | null | undefined) =>
      v === null || v === undefined ? words.noData : model.yText(v);
    out.push(
      words.lineSeries(
        s.name,
        text(at === -1 ? null : s.y[at]),
        text(low <= high ? low : null),
        text(low <= high ? high : null),
      ),
    );
  }
  return out;
}

/** Silent names shown before the rest are counted. */
const NAMED = 5;

function dotSummary(model: Model, m: DotModel, words: Words): string[] {
  const count = formatter("number", model.locale);
  const rows = counted(count(m.rows.length), m.rows.length, model.spec.y?.unit, model);
  const dots = m.rows.reduce((n, r) => n + r.to - r.from, 0);
  const out = [
    words.dotSummary(domainText(model, words), rows, counted(count(dots), dots, m.unit, model)),
  ];
  let most: DotModel["rows"][number] | undefined;
  for (const r of m.rows) {
    if (most === undefined || r.to - r.from > most.to - most.from) {
      most = r;
    }
  }
  if (most !== undefined && most.to > most.from) {
    const n = most.to - most.from;
    out.push(words.most(most.name, counted(count(n), n, m.unit, model)));
  }
  const silent = m.rows.filter((r) => r.to === r.from).map((r) => r.name);
  if (silent.length > 0) {
    const names = silent.slice(0, NAMED).join(", ");
    const rest = silent.length - NAMED;
    out.push(words.silent(rest > 0 ? `${names} ${words.more(count(rest))}` : names));
  }
  return out;
}

/** Each rule's sentence, in spec order. */
export function ruleSentences(model: Model, words: Words): string[] {
  const out: string[] = [];
  for (const m of model.marks) {
    if (m.kind === "rule") {
      out.push(words.rule(m.label, m.axis === "x" ? model.xText(m.value) : model.yText(m.value)));
    }
  }
  return out;
}

/** The summary the chart writes for `model`, before the spec's own `summary`. */
export function generatedSummary(model: Model, words: Words): string {
  const m = primaryOf(model);
  const head =
    m?.kind === "rect"
      ? rectSummary(model, m, words)
      : m?.kind === "line"
        ? lineSummary(model, m, words)
        : m?.kind === "dot"
          ? dotSummary(model, m, words)
          : [];
  return [...head, ...ruleSentences(model, words)].join(" ");
}

/** The summary the figure shows: the spec's string, its function of the
 *  generated text, or the generated text. */
export function summaryOf(model: Model, words: Words): string {
  const own = model.spec.summary;
  const generated = generatedSummary(model, words);
  return typeof own === "string" ? own : typeof own === "function" ? own(generated) : generated;
}

/** The plot's name: its kind, its series count from two up, and its x domain. */
export function shortDescription(model: Model, words: Words): string {
  const m = primaryOf(model);
  const kind = model.kind === undefined ? "" : words.kind[model.kind];
  const n = m === undefined || m.kind === "dot" ? 0 : m.series.length;
  const series = n > 1 ? words.seriesCount(formatter("number", model.locale)(n)) : "";
  return words.shortDescription(kind, series, domainText(model, words));
}
