/**
 * sparkline.ts — `renderSparkline()` draws a series of numbers as a
 * word-sized line in a series colour, marks and writes its last value, and
 * names it by its range, last value, low and high.
 * @module
 */

import { localeOf } from "../../core/locale/locale.js";
import { formatter } from "../scale/format.js";
import { reduce } from "../scale/reduce.js";

export interface SparklineSummary {
  /** The options' `range`, when given. */
  readonly range: string | undefined;
  /** The last value, the low and the high, each written by `format`. */
  readonly last: string;
  readonly low: string;
  readonly high: string;
}

export interface SparklineWords {
  /** Default "{range}: last {last}, low {low}, high {high}", or
   *  "Last {last}, low {low}, high {high}" with no range. */
  readonly summary?: (parts: SparklineSummary) => string;
  /** No value to draw. Default "{range}: no data", or "No data". */
  readonly empty?: (range: string | undefined) => string;
}

export interface SparklineOptions {
  /** The span the values cover, in words, such as "Last 6 hours". */
  readonly range?: string;
  /** The low and the high the line spans; sparklines compared in a row
   *  share one. Default: the values' own. A value outside it is drawn at its
   *  edge. Throws a `RangeError` unless both are finite and low ≤ high. */
  readonly domain?: readonly [low: number, high: number];
  /** Writes a value for the last value and the summary. Default: the
   *  page's language, by `Intl.NumberFormat`. */
  readonly format?: (value: number) => string;
  /** Whether the last value is written beside the line. Default true; a
   *  figure whose number is the last value sets false. */
  readonly last?: boolean;
  readonly words?: SparklineWords;
}

const SVG = "http://www.w3.org/2000/svg";
// The viewBox's height; the line spans it from the high (0) to the low.
const TALL = 100;
// More columns than device pixels across the 6rem plot on a 3x screen, so
// the reduction never merges what a pixel would show apart.
const COLUMNS = 512;

const summaryWords = ({ range, last, low, high }: SparklineSummary): string =>
  range === undefined
    ? `Last ${last}, low ${low}, high ${high}`
    : `${range}: last ${last}, low ${low}, high ${high}`;

const emptyWords = (range: string | undefined): string =>
  range === undefined ? "No data" : `${range}: no data`;

const round = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * Draws `values`, evenly spaced over the range, into `host`, a
 * `.cp-sparkline`, replacing what an earlier call drew. A `null` or a
 * non-finite value is a gap in the line. `host` becomes an image named by
 * the summary; the last value is the last one that is not a gap.
 */
export function renderSparkline(
  host: HTMLElement,
  values: readonly (number | null)[],
  options: SparklineOptions = {},
): void {
  const { range, domain, last: showLast = true, words = {} } = options;
  if (
    domain !== undefined &&
    !(Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[0] <= domain[1])
  ) {
    throw new RangeError(`sparkline domain [${String(domain)}] is not a finite low to high`);
  }
  const format = options.format ?? formatter("number", localeOf(host));
  const finite = values.map((v) => (v !== null && Number.isFinite(v) ? v : null));
  const known = finite.filter((v) => v !== null);
  const end = finite.findLastIndex((v) => v !== null);

  const svg = document.createElementNS(SVG, "svg");
  const wide = Math.max(finite.length - 1, 1);
  svg.setAttribute("viewBox", `0 0 ${String(wide)} ${String(TALL)}`);
  // The line stretches to the box; CSS keeps its stroke the same width.
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const plot = document.createElement("span");
  plot.dataset["part"] = "plot";
  plot.append(svg);
  host.setAttribute("role", "img");

  if (known.length === 0) {
    host.setAttribute("aria-label", (words.empty ?? emptyWords)(range));
    host.replaceChildren(plot);
    return;
  }
  // A spread of thousands of values can pass an engine's argument limit.
  const low = known.reduce((a, b) => Math.min(a, b));
  const high = known.reduce((a, b) => Math.max(a, b));
  const [lo, hi] = domain ?? [low, high];
  const x = (i: number): number => (finite.length === 1 ? wide : i);
  const y = (v: number): number =>
    hi === lo ? TALL / 2 : ((hi - Math.min(Math.max(v, lo), hi)) / (hi - lo)) * TALL;

  const xs = finite.map((_, i) => x(i));
  let d = "";
  for (const run of reduce(xs, finite, 0, finite.length, Math.max(1, wide / COLUMNS))) {
    const at = run.map((p) => `${round(p.x)} ${round(y(p.y))}`);
    // A run of one value is a zero-length segment, which its round caps draw as a dot.
    d += `M${at.join("L")}${at.length === 1 ? `L${at[0] ?? ""}` : ""}`;
  }
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);

  const lastValue = finite[end] ?? 0;
  // An SVG circle would stretch with the line, so the mark is a box placed
  // over the plot in percent.
  const dot = document.createElement("span");
  dot.dataset["part"] = "dot";
  dot.style.insetInlineStart = `${round((x(end) / wide) * 100)}%`;
  dot.style.insetBlockStart = `${round((y(lastValue) / TALL) * 100)}%`;
  plot.append(dot);

  const parts = {
    range,
    last: format(lastValue),
    low: format(low),
    high: format(high),
  };
  host.setAttribute("aria-label", (words.summary ?? summaryWords)(parts));
  if (showLast) {
    const text = document.createElement("data");
    text.dataset["part"] = "last";
    text.value = String(lastValue);
    text.textContent = parts.last;
    host.replaceChildren(plot, text);
  } else {
    host.replaceChildren(plot);
  }
}
