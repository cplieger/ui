/**
 * header-status.ts — `createHeaderStatus()` keeps the header's status pill
 * in step with the app's own model: it computes the state and its words,
 * worst level first, turns the pill offline only after the stream has been
 * down for a while, and says politely when things turn worse or come right.
 * @module
 */

import type { AskOptions } from "../../overlays/ask/ask.js";
import { announce } from "../../feedback/announce/announce.js";

export type StatusLevel = "problem" | "warning";

export interface StatusCondition {
  /** Stable across updates. */
  readonly id: string;
  readonly level: StatusLevel;
  /** Stops the app doing its job or leaves it open. Counted as a problem
   *  whatever its level; its title becomes the pill's words. */
  readonly urgent?: boolean;
  /** The condition's sentence, short enough to name the pill when urgent. */
  readonly title: string;
  readonly reasons?: readonly string[];
  /** When it began; the longest-standing comes first within its level. */
  readonly since?: Date | number;
  readonly seen?: Date | number;
  readonly href?: string;
  readonly docs?: { readonly href: string; readonly label: string };
}

export interface StatusWork {
  readonly id: string;
  /** The work and its scope, "Scanning Sonarr". */
  readonly title: string;
  readonly phase?: string;
  readonly value?: number;
  readonly max?: number;
  /** Waiting to run: shown, never counted as running. */
  readonly queued?: boolean;
  readonly href?: string;
  readonly stop?: { readonly run: () => Promise<void>; readonly ask?: AskOptions };
}

export interface StatusModel {
  readonly starts?: HTMLElement;
  readonly conditions: readonly StatusCondition[];
  readonly work: readonly StatusWork[];
  /** The idle line while nothing runs, "Next scan 03:00". */
  readonly next?: string;
  /** How many run when the app sends only the newest few. */
  readonly workTotal?: number;
  readonly workHref?: string;
  readonly notices?: readonly {
    readonly id: string;
    readonly title: string;
    readonly href?: string;
  }[];
  readonly recent?: readonly {
    readonly id: string;
    readonly words: string;
    readonly at: Date | number;
    readonly href?: string;
  }[];
  readonly history?: { readonly href: string; readonly label: string };
  /** Retry while offline. */
  readonly reconnect?: () => void;
}

export interface StatusWords {
  /** Default "All good". */
  readonly ok: string;
  /** Default "1 problem", "3 problems". */
  readonly problems: (n: number) => string;
  /** Default "1 warning", "2 warnings". */
  readonly warnings: (n: number) => string;
  /** Several items running. Default "Working: 3". */
  readonly working: (n: number) => string;
  /** The one running item. Default its title, then "3/8" when it has a
   *  value and a max. */
  readonly progress: (work: StatusWork) => string;
  /** The detail while the stream is down and not yet offline. Default
   *  "Reconnecting…". */
  readonly reconnecting: string;
  /** Default "Offline". */
  readonly offline: string;
}

export interface HeaderStatusOptions {
  readonly words?: Partial<StatusWords>;
  /** Formats the counts. Default: the page's language. */
  readonly locale?: string;
  /** How long the stream stays down before the pill turns offline, in ms.
   *  Default 10000. */
  readonly offlineAfter?: number;
}

export interface HeaderStatusParts {
  /** The `.cp-header-status` button. */
  readonly button: HTMLButtonElement;
  /** Its `.cp-popover.cp-status-panel`. */
  readonly panel: HTMLElement;
  /** Where urgent conditions stand as the every-screen banner. */
  readonly banner?: HTMLElement;
}

export interface HeaderStatus {
  /** Renders `model`, the whole state each time. */
  update(model: StatusModel): void;
  /** The app's stream dropped (`"lost"`) or came back (`"live"`). */
  connection(state: "live" | "lost"): void;
  /** Stops the offline timer; later calls do nothing. The pill keeps what
   *  it last showed. */
  destroy(): void;
}

type PillState = "offline" | "problem" | "warning" | "working" | "ok";

interface Pill {
  readonly state: PillState;
  readonly words: string;
  readonly detail?: string | undefined;
}

const RANK = { urgent: 0, problem: 1, warning: 2 } as const;

const rankOf = (c: StatusCondition): number => (c.urgent === true ? RANK.urgent : RANK[c.level]);

const time = (d: Date | number | undefined): number =>
  d === undefined ? Number.POSITIVE_INFINITY : +d;

/** Urgent first, then problems, then warnings; the longest-standing first
 *  within a level, so a cause comes before what it causes. */
function conditionOrder(conditions: readonly StatusCondition[]): StatusCondition[] {
  return [...conditions].sort((a, b) => rankOf(a) - rankOf(b) || time(a.since) - time(b.since));
}

const isProblem = (c: StatusCondition): boolean => c.urgent === true || c.level === "problem";

function wordsFor(options: HeaderStatusOptions): StatusWords {
  const n = new Intl.NumberFormat(options.locale);
  const count = (one: string, many: string) => (k: number) =>
    `${n.format(k)} ${k === 1 ? one : many}`;
  return {
    ok: "All good",
    problems: count("problem", "problems"),
    warnings: count("warning", "warnings"),
    working: (k) => `Working: ${n.format(k)}`,
    progress: (w) =>
      w.value !== undefined && w.max !== undefined
        ? `${w.title} ${n.format(w.value)}/${n.format(w.max)}`
        : w.title,
    reconnecting: "Reconnecting…",
    offline: "Offline",
    ...options.words,
  };
}

/** The pill's state and words for `model`, the stream live. */
function pillOf(model: StatusModel, w: StatusWords): Pill {
  const running = model.work.filter((x) => x.queued !== true);
  const total = model.workTotal ?? running.length;
  const [one] = running;
  const work =
    total === 0 ? undefined : total === 1 && one !== undefined ? w.progress(one) : w.working(total);
  const ordered = conditionOrder(model.conditions);
  const problems = ordered.filter(isProblem).length;
  const [first] = ordered;
  if (first?.urgent === true) {
    return {
      state: "problem",
      words: first.title,
      detail: problems > 1 ? w.problems(problems) : work,
    };
  }
  if (problems > 0) {
    return { state: "problem", words: w.problems(problems), detail: work };
  }
  if (ordered.length > 0) {
    return { state: "warning", words: w.warnings(ordered.length), detail: work };
  }
  if (work !== undefined) {
    return { state: "working", words: work };
  }
  return { state: "ok", words: w.ok };
}

/** The level the person is told about: 2 for a problem, 1 for a warning. */
const severity = (conditions: readonly StatusCondition[]): number =>
  conditions.some(isProblem) ? 2 : conditions.length > 0 ? 1 : 0;

function writePill(button: HTMLButtonElement, pill: Pill): void {
  button.dataset["state"] = pill.state;
  let words = button.querySelector<HTMLElement>(":scope > span:not([data-part])");
  if (words === null) {
    words = document.createElement("span");
    button.prepend(words);
  }
  if (words.textContent !== pill.words) {
    words.textContent = pill.words;
  }
  let detail = button.querySelector<HTMLElement>(':scope > [data-part="detail"]');
  if (pill.detail === undefined) {
    detail?.remove();
    return;
  }
  if (detail === null) {
    detail = document.createElement("span");
    detail.dataset["part"] = "detail";
    words.after(detail);
  }
  if (detail.textContent !== pill.detail) {
    detail.textContent = pill.detail;
  }
}

/**
 * Takes over `parts.button`'s state and words. The app calls `update()`
 * with its whole model on every change and `connection()` as its stream
 * drops and returns; the first `update()` is never announced.
 */
export function createHeaderStatus(
  parts: HeaderStatusParts,
  options: HeaderStatusOptions = {},
): HeaderStatus {
  const { button } = parts;
  const { offlineAfter = 10_000 } = options;
  if (!Number.isFinite(offlineAfter) || offlineAfter < 0) {
    throw new RangeError(
      "createHeaderStatus: offlineAfter must be a finite number of ms, 0 or more",
    );
  }
  const w = wordsFor(options);
  let model: StatusModel = { conditions: [], work: [] };
  let link: "live" | "lost" | "offline" = "live";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  let started = false;
  /** What the person was last told: the level, the problems, the ids. */
  let toldLevel = 0;
  let toldProblems = 0;
  let toldIds = new Set<string>();
  /** Trouble was said and the return to all good not yet. */
  let troubled = false;

  const render = (): void => {
    if (link === "offline") {
      writePill(button, { state: "offline", words: w.offline });
      return;
    }
    const pill = pillOf(model, w);
    writePill(button, link === "lost" ? { ...pill, detail: w.reconnecting } : pill);
  };

  const tell = (): void => {
    const ordered = conditionOrder(model.conditions);
    const level = severity(ordered);
    const problems = ordered.filter(isProblem).length;
    const fresh = ordered.filter((c) => !toldIds.has(c.id));
    const newUrgent = fresh.find((c) => c.urgent === true);
    const worse = level > toldLevel || (level === 2 && problems > toldProblems);
    if (newUrgent !== undefined || worse) {
      const cause =
        newUrgent ?? fresh.find((c) => (level === 2 ? isProblem(c) : true)) ?? ordered[0];
      if (cause !== undefined) {
        announce(
          cause.urgent === true
            ? cause.title
            : `${level === 2 ? w.problems(problems) : w.warnings(ordered.length)}: ${cause.title}`,
        );
        troubled = true;
      }
    } else if (troubled && pillOf(model, w).state === "ok") {
      announce(w.ok);
      troubled = false;
    }
    toldLevel = level;
    toldProblems = problems;
    toldIds = new Set(ordered.map((c) => c.id));
  };

  return {
    update(next) {
      if (gone) {
        return;
      }
      model = next;
      render();
      if (!started) {
        started = true;
        const ordered = conditionOrder(model.conditions);
        toldLevel = severity(ordered);
        toldProblems = ordered.filter(isProblem).length;
        toldIds = new Set(ordered.map((c) => c.id));
        return;
      }
      if (link !== "offline") {
        tell();
      }
    },
    connection(state) {
      if (gone) {
        return;
      }
      if (state === "live") {
        clearTimeout(timer);
        timer = undefined;
        const was = link;
        link = "live";
        render();
        if (was === "offline") {
          tell();
        }
        return;
      }
      if (link !== "live") {
        return;
      }
      link = "lost";
      render();
      timer = setTimeout(() => {
        timer = undefined;
        link = "offline";
        render();
        announce(w.offline);
        troubled = true;
      }, offlineAfter);
    },
    destroy() {
      gone = true;
      clearTimeout(timer);
    },
  };
}
