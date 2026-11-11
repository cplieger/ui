/**
 * state-history.ts — `createStateHistory()` builds a `.cp-state-history`: a
 * strip of one cell per observation, oldest first, each in its state's
 * tone, with no axis. The strip's name sums the states up in words, a legend
 * pairs each tone with its word, and the same observations open as a table,
 * so colour is never the only channel.
 * @module
 */

import { enhanceDisclosure } from "../../navigation/disclosure/disclosure.js";

/** The tones a state can take, as `data-tone` names them. */
export type StateHistoryTone = "accent" | "danger" | "neutral" | "success" | "warning";

/** A state an observation can be in. */
export interface StateHistoryState {
  readonly tone: StateHistoryTone;
  /** The state in words, such as "Answered", in the legend and the table. */
  readonly word: string;
}

/** One observation: its state's key, and its row's label in the table. */
export interface StateHistoryPoint<K extends string = string> {
  readonly state: K;
  /** Such as a time, "14:02". Default from `words.label`. */
  readonly label?: string;
}

/** The words the element writes. */
export interface StateHistoryWords {
  /** One state's share of the summary. Default "22 answered". */
  readonly tally?: (count: number, word: string) => string;
  /** The summary that opens the table. Default "Show as a table". */
  readonly show?: string;
  /** The table's two column headers. Default "Check" and "State". */
  readonly point?: string;
  readonly state?: string;
  /** A row's label when its point has none, `n` counting from 1 for the
   *  oldest. Default "Check 3", and "Check 25, the latest" for the last. */
  readonly label?: (n: number, latest: boolean) => string;
}

export interface StateHistoryOptions<K extends string> {
  /** Such as "Sonarr, the last 25 checks": the strip's and the table's name. */
  readonly name: string;
  /** Each state's tone and word, in the order the summary and legend list
   *  them. */
  readonly states: Readonly<Record<K, StateHistoryState>>;
  readonly words?: StateHistoryWords;
  /** Stops the table's glide and removes its listener. */
  readonly signal?: AbortSignal;
}

const SVG = "http://www.w3.org/2000/svg";

function make<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  text?: string,
  ...children: Node[]
): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag);
  if (text !== undefined) {
    el.textContent = text;
  }
  el.append(...children);
  return el;
}

/**
 * Builds the strip, its legend and its table from `points`, oldest first.
 * The legend and the summary name only the states that occur. The table
 * lists the newest first and glides open as a disclosure does.
 * @throws {RangeError} when a point names a state `states` lacks.
 */
export function createStateHistory<K extends string>(
  points: readonly StateHistoryPoint<NoInfer<K>>[],
  options: StateHistoryOptions<K>,
): HTMLElement {
  const { name, states, words = {}, signal } = options;
  const tally = words.tally ?? ((n: number, w: string) => `${String(n)} ${w.toLowerCase()}`);
  const label =
    words.label ??
    ((n: number, latest: boolean) =>
      latest ? `Check ${String(n)}, the latest` : `Check ${String(n)}`);
  const counts = new Map<K, number>();
  for (const p of points) {
    if (!Object.hasOwn(states, p.state)) {
      throw new RangeError(`State history: no state named "${p.state}"`);
    }
    counts.set(p.state, (counts.get(p.state) ?? 0) + 1);
  }
  const seen = (Object.keys(states) as K[]).filter((k) => counts.has(k));

  const strip = document.createElementNS(SVG, "svg");
  strip.setAttribute("viewBox", "0 0 100 10");
  strip.setAttribute("preserveAspectRatio", "none");
  strip.setAttribute("role", "img");
  const sum = seen.map((k) => tally(counts.get(k) ?? 0, states[k].word)).join(", ");
  strip.setAttribute("aria-label", sum === "" ? name : `${name}: ${sum}`);
  const w = 100 / points.length;
  points.forEach((p, i) => {
    const cell = document.createElementNS(SVG, "rect");
    cell.setAttribute("x", String(i * w + 0.15));
    cell.setAttribute("width", String(w - 0.3));
    cell.setAttribute("height", "10");
    cell.setAttribute("rx", "0.6");
    cell.dataset["tone"] = states[p.state].tone;
    strip.append(cell);
  });

  const legend = make("div");
  legend.dataset["part"] = "legend";
  for (const k of seen) {
    const key = make("span", states[k].word);
    key.dataset["tone"] = states[k].tone;
    legend.append(key);
  }

  const rows = points.map((p, i) =>
    make(
      "tr",
      undefined,
      make("td", p.label ?? label(i + 1, i === points.length - 1)),
      make("td", states[p.state].word),
    ),
  );
  const table = make(
    "table",
    undefined,
    make(
      "thead",
      undefined,
      make("tr", undefined, make("th", words.point ?? "Check"), make("th", words.state ?? "State")),
    ),
    make("tbody", undefined, ...rows.reverse()),
  );
  table.className = "cp-table";
  table.setAttribute("aria-label", name);
  const panel = make("div", undefined, table);
  panel.className = "cp-panel";
  panel.dataset["flush"] = "";
  const details = make(
    "details",
    undefined,
    make("summary", words.show ?? "Show as a table"),
    panel,
  );
  enhanceDisclosure(details, signal === undefined ? {} : { signal });

  const el = make("div", undefined, strip, legend, details);
  el.className = "cp-state-history";
  return el;
}
