/**
 * summary.ts — a chart's words for a screen reader and for everyone: the
 * plot's short description and the visible summary under the title.
 * @module
 */

import { formatDuration, formatter } from "../scale/format.js";

import {
  barTotal,
  bucketTotal,
  pointLink,
  sampleTotal,
  sampleValue,
  scatterDotAt,
  slopeChange,
  type BarModel,
  type DotModel,
  type Model,
  type PointModel,
  type RectModel,
  type SampleModel,
  type ScatterModel,
  type SeriesModel,
  type SlopeModel,
} from "./model.js";
import {
  bucketText,
  changeText,
  counted,
  domainText,
  dotsText,
  lastSample,
  lastStack,
  linkText,
  dotValue,
  measureText,
  measuresOf,
  primaryOf,
  rowsText,
  totalWord,
} from "./readout.js";
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

const seriesTotal = (m: RectModel, s: SeriesModel): number =>
  m.shown.reduce((n, i) => n + (s.y[i] ?? 0), 0);

function rectSummary(model: Model, m: RectModel, words: Words): string[] {
  const unit = model.spec.y?.unit;
  const total = m.shown.reduce((n, i) => n + bucketTotal(m, i), 0);
  const all = counted(model.amountText(total), total, unit, model);
  const range = domainText(model, words);
  const part = (s: SeriesModel) =>
    m.arrange === "share" && total > 0
      ? model.yText(seriesTotal(m, s) / total)
      : model.amountText(seriesTotal(m, s));
  const parts = m.series.length > 1 ? m.series.map((s) => `${s.name} ${part(s)}`).join(", ") : "";
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
  const closed = m.shown.filter((i) => !(m.open && i === last));
  if (m.arrange === "group") {
    // A group compares series, so its peak is one value, not a bucket's total.
    let peak: { i: number; s: SeriesModel; v: number } | undefined;
    for (const i of closed) {
      for (const s of m.series) {
        const v = s.y[i] ?? 0;
        if (v > (peak?.v ?? 0)) {
          peak = { i, s, v };
        }
      }
    }
    if (peak !== undefined) {
      const n = counted(model.amountText(peak.v), peak.v, unit, model);
      out.push(words.highest(peak.s.name, bucketText(model, m, peak.i, words), n));
    }
    return out;
  }
  let best = -1;
  for (const i of closed) {
    if (best === -1 || bucketTotal(m, i) > bucketTotal(m, best)) {
      best = i;
    }
  }
  if (best !== -1 && bucketTotal(m, best) > 0) {
    const n = bucketTotal(m, best);
    out.push(
      words.busiest(
        bucketText(model, m, best, words),
        counted(model.amountText(n), n, unit, model),
      ),
    );
  }
  return out;
}

// One series' last, low and high over the domain through `lineSeries`;
// `at(i)` is its value at sample `i`, null at a gap, written by `write`.
function seriesSentence(
  m: SampleModel,
  name: string,
  at: (i: number) => number | null,
  last: number,
  write: (v: number) => string,
  words: Words,
): string {
  // A loop, since spreading a long series into Math.min overflows the stack.
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = m.from; i < m.to; i++) {
    const v = at(i);
    if (v !== null) {
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  }
  const text = (v: number | null) => (v === null ? words.noData : write(v));
  return words.lineSeries(
    name,
    text(last === -1 ? null : at(last)),
    text(low <= high ? low : null),
    text(low <= high ? high : null),
  );
}

function lineSummary(model: Model, m: SampleModel, words: Words): string[] {
  const steps: number[] = [];
  for (let i = m.from + 1; i < m.to; i++) {
    steps.push((m.x[i] ?? 0) - (m.x[i - 1] ?? 0));
  }
  const out = [
    words.lineSummary(domainText(model, words), sizeText(model, evenStep(steps), words)),
  ];
  const yText = (v: number) => model.yText(v);
  for (const s of m.series) {
    // Under "share" a layer's share exists only where its stack is drawn.
    out.push(
      m.kind === "area" && m.arrange === "share"
        ? seriesSentence(m, s.name, (i) => sampleValue(m, s, i), lastStack(m), yText, words)
        : seriesSentence(m, s.name, (i) => s.y[i] ?? null, lastSample(m, s), yText, words),
    );
  }
  if (m.kind === "area" && m.series.length > 1) {
    const at = (i: number) => sampleTotal(m, i);
    const amount = (v: number) => model.amountText(v);
    out.push(seriesSentence(m, words.total, at, lastStack(m), amount, words));
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

// The rows holding the highest and the lowest of `at`, the first in the
// app's order on a tie, and how many rows hold a value; none when every
// row is a gap.
function barExtremes(
  names: readonly string[],
  at: (i: number) => number | null,
): { high: number; low: number; held: number } | undefined {
  let high = -1;
  let low = -1;
  let held = 0;
  names.forEach((_, i) => {
    const v = at(i);
    if (v === null) {
      return;
    }
    held += 1;
    if (high === -1 || v > (at(high) ?? v)) {
      high = i;
    }
    if (low === -1 || v < (at(low) ?? v)) {
      low = i;
    }
  });
  return high === -1 ? undefined : { high, low, held };
}

// One series' extremes in words; name is "" for a chart's one series. A
// lone row or rows all alike read once, since their highest and lowest
// would name one row twice or a tie as an extreme.
function extremesText(
  words: Words,
  name: string,
  e: { high: number; low: number; held: number },
  at: (i: number) => number | null,
  place: (i: number) => string,
  value: (i: number) => string,
  apart: (high: string, low: string) => string,
): string {
  if (e.held === 1) {
    return words.only(name, place(e.high));
  }
  return at(e.high) === at(e.low)
    ? words.alike(name, value(e.high))
    : apart(place(e.high), place(e.low));
}

function barSummary(model: Model, m: BarModel, words: Words): string[] {
  const names = model.y.type === "band" ? model.y.rows : [];
  const several = m.series.length > 1;
  const series = several
    ? words.seriesCount(formatter("number", model.locale)(m.series.length))
    : "";
  const out = [words.countSummary(rowsText(model, words), series)];
  const sentence = (name: string | undefined, at: (i: number) => number | null) => {
    const e = barExtremes(names, at);
    if (e === undefined) {
      return;
    }
    const value = (i: number) => model.xText(at(i) ?? 0);
    const place = (i: number) => `${names[i] ?? ""} ${value(i)}`;
    out.push(
      extremesText(words, name ?? "", e, at, place, value, (high, low) =>
        name === undefined ? words.extremes(high, low) : words.barSeries(name, high, low),
      ),
    );
  };
  for (const s of m.series) {
    // Under "share" a series' share exists only in a row whose total is above 0.
    const share = (i: number) => {
      const v = s.x[i] ?? null;
      const total = barTotal(m, i) ?? 0;
      return v === null || total <= 0 ? null : v / total;
    };
    sentence(several ? s.name : undefined, m.arrange === "share" ? share : (i) => s.x[i] ?? null);
  }
  if (several && (m.arrange === "stack" || m.arrange === "diverge" || m.arrange === "mirror")) {
    sentence(words.total, (i) => barTotal(m, i));
  }
  return out;
}

// The rows and series head, then each series' highest and lowest row, or
// on a time x its earliest and latest, since "highest" reads wrong of an
// instant; one series on a linear or log x through `extremes`; then a
// link's highest and lowest gap or change.
function pointSummary(model: Model, m: PointModel, words: Words): string[] {
  const names = model.y.type === "band" ? model.y.rows : [];
  const several = m.series.length > 1;
  const series = several
    ? words.seriesCount(formatter("number", model.locale)(m.series.length))
    : "";
  const out = [words.countSummary(rowsText(model, words), series)];
  const time = model.x.type === "time";
  for (const s of m.series) {
    const at = (i: number) => s.x[i] ?? null;
    const e = barExtremes(names, at);
    if (e === undefined) {
      continue;
    }
    const value = (i: number) => model.xText(at(i) ?? 0);
    const place = (i: number) => `${names[i] ?? ""} ${value(i)}`;
    out.push(
      extremesText(words, several ? s.name : "", e, at, place, value, (high, low) =>
        time
          ? words.spanSeries(s.name, low, high)
          : several
            ? words.barSeries(s.name, high, low)
            : words.extremes(high, low),
      ),
    );
  }
  const link = (i: number) => pointLink(m, i);
  const e = m.link === undefined ? undefined : barExtremes(names, link);
  if (e !== undefined) {
    const value = (i: number) => linkText(model, m, link(i) ?? 0);
    const place = (i: number) => `${names[i] ?? ""} ${value(i)}`;
    out.push(
      extremesText(words, totalWord(model, words), e, link, place, value, (high, low) =>
        words.barSeries(totalWord(model, words), high, low),
      ),
    );
  }
  return out;
}

// The columns and series head, each series' two ends and change, then the
// largest rise and fall, the first in series order on a tie; a series with
// a missing end has no change to rank.
function slopeSummary(model: Model, m: SlopeModel, words: Words): string[] {
  const n = m.series.length;
  const series = n > 1 ? words.seriesCount(formatter("number", model.locale)(n)) : "";
  const out = [words.slopeSummary(domainText(model, words), series)];
  const end = (v: number | null | undefined) =>
    v === null || v === undefined ? words.noData : model.yText(v);
  let rise: { name: string; v: number } | undefined;
  let fall: { name: string; v: number } | undefined;
  for (const s of m.series) {
    const v = slopeChange(s);
    out.push(
      words.slopeSeries(s.name, end(s.y[0]), end(s.y[1]), v === null ? "" : changeText(model, v)),
    );
    if (v !== null && v > (rise?.v ?? 0)) {
      rise = { name: s.name, v };
    }
    if (v !== null && v < (fall?.v ?? 0)) {
      fall = { name: s.name, v };
    }
  }
  if (rise !== undefined) {
    out.push(words.rise(rise.name, changeText(model, rise.v)));
  }
  if (fall !== undefined) {
    out.push(words.fall(fall.name, changeText(model, fall.v)));
  }
  return out;
}

// The dots and series head, then each measure's highest and lowest dot, the
// first in series order, then the app's order, on a tie. A correlation is a
// statistic, which an app adds through its own summary.
function scatterSummary(model: Model, m: ScatterModel, words: Words): string[] {
  const n = m.series.length;
  const series = n > 1 ? words.seriesCount(formatter("number", model.locale)(n)) : "";
  const out = [words.countSummary(dotsText(model, m, words), series)];
  const dots = m.series.flatMap((s, k) => (m.shown[k] ?? []).map((i) => ({ s, i })));
  const names = dots.map((d) => d.s.names[d.i] ?? "");
  for (const axis of measuresOf(m)) {
    const at = (j: number) => {
      const d = dots[j];
      return d === undefined ? null : dotValue(d.s, axis, d.i);
    };
    const e = barExtremes(names, at);
    if (e === undefined) {
      continue;
    }
    const write = axis === "x" ? model.xText : axis === "y" ? model.yText : model.rText;
    const value = (j: number) => write(at(j) ?? 0);
    const place = (j: number) => `${names[j] ?? ""} ${value(j)}`;
    const label = model.spec[axis]?.label ?? "";
    out.push(
      extremesText(words, label, e, at, place, value, (high, low) =>
        words.barSeries(label, high, low),
      ),
    );
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

/** Each note's sentence, in spec order: its x as the readings write it (a
 *  slope's column name), under a dot mark after its row's name, on a bar or
 *  point chart its row's name alone, on a scatter the name of the dot it
 *  joins or else both its measures. */
export function noteSentences(model: Model, words: Words): string[] {
  const out: string[] = [];
  const m = primaryOf(model);
  for (const t of model.marks) {
    if (t.kind === "text" && m?.kind === "scatter") {
      const d = t.x === undefined ? undefined : scatterDotAt(m, t.x, t.y);
      const at =
        d === undefined
          ? `${measureText(model, "x", t.x ?? null, words)}, ${measureText(model, "y", t.y, words)}`
          : (m.series[d.series]?.names[d.i] ?? "");
      out.push(words.note(at, t.text));
    } else if (t.kind === "text") {
      const row = model.y.type === "band" ? (model.y.rows[t.y] ?? "") : undefined;
      const x = t.x === undefined ? undefined : model.xText(t.x);
      const at =
        row === undefined ? x : m?.kind === "dot" && x !== undefined ? `${row}, ${x}` : row;
      out.push(words.note(at ?? "", t.text));
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
      : m?.kind === "line" || m?.kind === "area"
        ? lineSummary(model, m, words)
        : m?.kind === "dot"
          ? dotSummary(model, m, words)
          : m?.kind === "bar"
            ? barSummary(model, m, words)
            : m?.kind === "point"
              ? pointSummary(model, m, words)
              : m?.kind === "slope"
                ? slopeSummary(model, m, words)
                : m?.kind === "scatter"
                  ? scatterSummary(model, m, words)
                  : [];
  return [...head, ...ruleSentences(model, words), ...noteSentences(model, words)].join(" ");
}

/** The summary the figure shows: the spec's string, its function of the
 *  generated text, or the generated text. */
export function summaryOf(model: Model, words: Words): string {
  const own = model.spec.summary;
  const generated = generatedSummary(model, words);
  return typeof own === "string" ? own : typeof own === "function" ? own(generated) : generated;
}

/** The plot's name: its kind, its series count from two up, and its x
 *  domain, or on a bar or point chart its row count and on a scatter its
 *  dot count, since their x is a value. */
export function shortDescription(model: Model, words: Words): string {
  const m = primaryOf(model);
  const kind = model.kind === undefined ? "" : words.kind[model.kind];
  const n = m === undefined || m.kind === "dot" ? 0 : m.series.length;
  const series = n > 1 ? words.seriesCount(formatter("number", model.locale)(n)) : "";
  const range =
    m?.kind === "bar" || m?.kind === "point"
      ? rowsText(model, words)
      : m?.kind === "scatter"
        ? dotsText(model, m, words)
        : domainText(model, words);
  return words.shortDescription(kind, series, range);
}
