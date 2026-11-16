/**
 * jobs.ts — `enhanceJobs()` runs a list of jobs written as list rows: it
 * moves each job's bar, count and phase, stops a job from its Stop button,
 * and ends a job with its outcome and cause.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { localeOf } from "../../core/locale/locale.js";
import { focusOn, landing, rowOf } from "../../data/list-row/row.js";
import { glyph } from "../../foundations/icons/glyph.js";
import type { IconName } from "../../foundations/icons/icons.js";
import { announce } from "../announce/announce.js";

/** The outcome's tone, which picks its glyph. */
export type JobTone = "success" | "warning" | "danger" | "neutral";

/** How a job ended. */
export interface JobEnd {
  /** The outcome in the row's end, such as "Finished" or "Stopped". */
  readonly words: string;
  readonly tone: JobTone;
  /** The body's last line, such as "All 40 done" or "Stopped by you at
   *  12 of 40". */
  readonly cause?: string;
  /** Said politely once the job ends, such as "Fixing timing finished",
   *  since a job ends while the reader is elsewhere. */
  readonly said?: string;
}

/** Each count is given already written in the page's language. */
export interface JobWords {
  /** How far the job is. Default "{done} of {total}". */
  readonly count?: (done: string, total: string) => string;
  /** The outcome of a job stopped from its button. Default "Stopped". */
  readonly stopped?: string;
  /** Its cause, given how far the bar was at the press, or nothing for a
   *  row with no bar. Default "Stopped by you at {count}", or "Stopped by
   *  you". */
  readonly stoppedCause?: (done?: string, total?: string) => string;
  /** Said once a job stops, given its kind. Default "{kind} stopped". */
  readonly said?: (kind: string) => string;
  /** The sentence for a stop that failed, or built from what `stop`
   *  rejected with. Default "The job could not be stopped." */
  readonly stopFailed?: string | ((reason: unknown) => string);
}

export interface JobsOptions {
  /** Stops the job of `row`. Without it the module leaves the rows' Stop
   *  buttons to the host, which calls `end` itself. */
  readonly stop?: (row: HTMLElement, signal: AbortSignal) => Promise<void>;
  /** The language the counts are written in. Default the list's `lang`. */
  readonly locale?: string;
  readonly words?: JobWords;
  /** Ends the wiring and any stop under way, which then writes nothing. */
  readonly signal?: AbortSignal;
}

/** What the host moves; each takes a job's `.cp-list-row` or its `li`. */
export interface Jobs {
  /** Sets the bar to `done` of `total` (default its `max`) and writes the
   *  count from the bar's own value, so the words match the bar. */
  progress(row: Element, done: number, total?: number): void;
  /** Writes the job's phase, such as "Searching providers". */
  phase(row: Element, words: string): void;
  /** Ends the job: its bar, Stop and the lines under the bar go, and its
   *  outcome and cause stay. Focus inside what goes moves to the job's
   *  first part that takes focus, such as its link. */
  end(row: Element, end: JobEnd): void;
}

const GLYPH: Record<JobTone, IconName> = {
  success: "circle-check",
  warning: "triangle-alert",
  danger: "circle-x",
  neutral: "circle-minus",
};

const part = (row: Element, name: string): HTMLElement | null =>
  row.querySelector<HTMLElement>(`[data-part="${name}"]`);

/** The row's body: its first `.cp-cell-stack`, else the kind's parent. */
const bodyOf = (row: Element): Element | null =>
  row.querySelector(":scope > .cp-cell-stack") ?? part(row, "kind")?.parentElement ?? null;

/**
 * Wires `list`, a `.cp-list` of job rows, each a `div.cp-list-row` holding
 * a body with its `[data-part="kind"]` and scope, an optional
 * `[data-part="stop"]` button, a `<progress>` child and a `<small>` of its
 * `[data-part="count"]` and `[data-part="phase"]`. Rows added later, such
 * as a page `enhanceLoadMore` brings, need no call.
 */
export function enhanceJobs(list: HTMLElement, options: JobsOptions = {}): Jobs {
  const words = options.words ?? {};
  const numbers = new Intl.NumberFormat(options.locale ?? localeOf(list));
  const format = (n: number): string => numbers.format(n);
  const life = new AbortController();
  whenAborted(options.signal, () => {
    life.abort();
  });

  /** The bar's place written in the list's language, or none without one. */
  const place = (row: Element): readonly [string, string] | null => {
    const bar = row.querySelector(":scope > progress");
    return bar instanceof HTMLProgressElement ? [format(bar.value), format(bar.max)] : null;
  };
  const countWords = (at: readonly [string, string]): string =>
    words.count?.(...at) ?? `${at[0]} of ${at[1]}`;

  const progress = (item: Element, done: number, total?: number): void => {
    const row = rowOf(item);
    const bar = row.querySelector(":scope > progress");
    if (!(bar instanceof HTMLProgressElement)) {
      return;
    }
    if (total !== undefined) {
      bar.max = total;
    }
    bar.value = done;
    const count = part(row, "count");
    const at = place(row);
    if (count !== null && at !== null) {
      count.textContent = countWords(at);
    }
  };

  const phase = (item: Element, text: string): void => {
    const target = part(rowOf(item), "phase");
    if (target !== null) {
      target.textContent = text;
    }
  };

  const end = (item: Element, how: JobEnd): void => {
    const row = rowOf(item);
    row.setAttribute("data-ended", "");
    const bar = row.querySelector(":scope > progress");
    const going = [
      ...row.querySelectorAll(':scope > [data-part="stop"]'),
      ...(bar === null ? [] : [bar, ...row.querySelectorAll(":scope > progress ~ *")]),
    ];
    const hadFocus = going.some((el) => el.contains(document.activeElement));

    const state = document.createElement("span");
    state.className = "cp-state";
    state.dataset["tone"] = how.tone;
    state.append(glyph(GLYPH[how.tone]), how.words);
    let outcome = row.querySelector(':scope > [data-part="end"]');
    if (outcome === null) {
      outcome = document.createElement("span");
      outcome.setAttribute("data-part", "end");
      (bodyOf(row) ?? row.firstElementChild)?.after(outcome);
    }
    outcome.replaceChildren(state);

    const body = bodyOf(row);
    let cause = body?.querySelector(':scope > small[data-part="cause"]') ?? null;
    if (how.cause === undefined) {
      cause?.remove();
    } else if (body !== null) {
      if (cause === null) {
        cause = document.createElement("small");
        cause.setAttribute("data-part", "cause");
        body.append(cause);
      }
      cause.textContent = how.cause;
    }

    // Focus moves before its control goes, or it drops to the body.
    if (hadFocus) {
      const to = landing(row);
      focusOn(going.some((el) => el.contains(to)) ? row : to);
    }
    for (const el of going) {
      el.remove();
    }
    if (how.said !== undefined) {
      announce(how.said);
    }
  };

  const stopping = new WeakSet<Element>();
  const fail = (row: Element, reason: unknown): void => {
    const sentence = words.stopFailed;
    const text =
      typeof sentence === "function"
        ? sentence(reason)
        : (sentence ?? "The job could not be stopped.");
    let line = row.querySelector(':scope > [data-part="stop-failed"]');
    if (line === null) {
      line = document.createElement("small");
      line.className = "cp-state";
      line.setAttribute("data-cp-state", "failed");
      line.setAttribute("data-part", "stop-failed");
      row.append(line);
    }
    line.textContent = text;
    announce(text, "assertive");
  };

  const { stop } = options;
  if (stop !== undefined) {
    list.addEventListener(
      "click",
      (e) => {
        const button = e.target instanceof Element ? e.target.closest('[data-part="stop"]') : null;
        const row = button?.closest(".cp-list-row");
        if (button == null || !(row instanceof HTMLElement) || !list.contains(row)) {
          return;
        }
        if (stopping.has(row) || row.hasAttribute("data-ended")) {
          return;
        }
        stopping.add(row);
        row.querySelector(':scope > [data-part="stop-failed"]')?.remove();
        button.setAttribute("aria-busy", "true");
        const at = place(row);
        const kind = part(row, "kind")?.textContent ?? "The job";
        // Called in the executor, at once, so a stop that throws before it
        // returns a promise fails like one that rejects.
        new Promise<void>((resolve) => {
          resolve(stop(row, life.signal));
        }).then(
          () => {
            stopping.delete(row);
            button.removeAttribute("aria-busy");
            // An end the app wrote while the stop ran is the job's real end.
            if (life.signal.aborted || row.hasAttribute("data-ended")) {
              return;
            }
            end(row, {
              words: words.stopped ?? "Stopped",
              tone: "neutral",
              cause:
                (at === null ? words.stoppedCause?.() : words.stoppedCause?.(...at)) ??
                (at === null ? "Stopped by you" : `Stopped by you at ${countWords(at)}`),
              said: words.said?.(kind) ?? `${kind} stopped`,
            });
          },
          (reason: unknown) => {
            stopping.delete(row);
            button.removeAttribute("aria-busy");
            if (!life.signal.aborted && !row.hasAttribute("data-ended")) {
              fail(row, reason);
            }
          },
        );
      },
      until(life.signal),
    );
  }

  return { progress, phase, end };
}
