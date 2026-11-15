/**
 * batch-report.ts — `enhanceBatchedAction()` runs work on more items than
 * one press should send: each press sends the next batch, the button names
 * what its next press does, and the `.cp-batch-report` under it sums up the
 * presses and lists each item that did not go.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { localeOf } from "../../core/locale/locale.js";
import { focusOn } from "../../data/list-row/row.js";
import { announce } from "../announce/announce.js";

/** An item a batch could not start. */
export interface BatchMiss {
  /** Such as "Kaiba, episode 4". */
  readonly name: string;
  /** Such as "No provider has Basque subtitles". */
  readonly reason: string;
  /** A muted line after the reason, such as "Checked 6 providers". */
  readonly note?: string;
}

/** What `send` resolves with: how many of the batch started, and the rest. */
export interface BatchAnswer {
  readonly started: number;
  readonly missed?: readonly BatchMiss[];
}

/** Each function is given numbers already written in the page's language. */
export interface BatchWords {
  /** The button's words while batches remain. Default "Start the next
   *  {size}", or "Start the remaining {left}" once one press covers them. */
  readonly next?: (size: string, left: string, last: boolean) => string;
  /** The button's words after the last batch. Default "All {total}
   *  started", or "{started} of {total} started" when some did not. */
  readonly done?: (started: string, total: string, all: boolean) => string;
  /** The button's words while a batch is sent. Default "Starting…". */
  readonly busy?: string;
  /** The report's sum after each press, said politely. Default "Started
   *  {started} of {total}. {left} remain. {missed} couldn't start:". */
  readonly report?: (counts: BatchCounts) => string;
  /** The sentence for a press that failed outright, or built from what
   *  `send` rejected with. Default "The batch could not start." */
  readonly failed?: string | ((reason: unknown) => string);
}

/** The counts so far, in numbers and as the page's language writes them. */
export interface BatchCounts {
  readonly started: number;
  readonly total: number;
  readonly left: number;
  readonly missed: number;
  readonly format: (n: number) => string;
}

export interface BatchOptions {
  /** How many items the action covers, a whole number of at least 1. */
  readonly total: number;
  /** How many items one press sends, a whole number of at least 1. */
  readonly size: number;
  /** Sends `count` items from `offset`, the number sent by earlier presses.
   *  A rejection fails the press: nothing counts as sent, so the next press
   *  sends the same items. */
  readonly send: (offset: number, count: number, signal: AbortSignal) => Promise<BatchAnswer>;
  /** The language the counts are written in. Default the button's `lang`. */
  readonly locale?: string;
  readonly words?: BatchWords;
  /** Ends the wiring and the batch under way. */
  readonly signal?: AbortSignal;
}

function defaultReport({ started, total, left, missed, format }: BatchCounts): string {
  const remain =
    left === 0 ? "None remain." : `${format(left)} ${left === 1 ? "remains" : "remain"}.`;
  const misses = missed === 0 ? "" : ` ${format(missed)} couldn't start:`;
  return `Started ${format(started)} of ${format(total)}. ${remain}${misses}`;
}

const wholeAtLeastOne = (n: number): boolean => Number.isInteger(n) && n >= 1;

/**
 * Wires `button`, which holds a `.cp-roll` with the first press's words,
 * such as "Start the first 100", and a `spinner-arc` busy span, and writes
 * each press's result into `report`, a `.cp-batch-report`. Throws a
 * RangeError when `total` or `size` is not a whole number of at least 1,
 * and a TypeError when the button has no `.cp-roll`.
 */
export function enhanceBatchedAction(
  button: HTMLButtonElement,
  report: HTMLElement,
  options: BatchOptions,
): void {
  const { total, size, signal } = options;
  if (!wholeAtLeastOne(total) || !wholeAtLeastOne(size)) {
    throw new RangeError(
      "enhanceBatchedAction: total and size must be whole numbers of at least 1",
    );
  }
  const words = options.words ?? {};
  const numbers = new Intl.NumberFormat(options.locale ?? localeOf(button));
  const format = (n: number): string => numbers.format(n);
  const life = new AbortController();
  whenAborted(signal, () => {
    life.abort();
  });
  const cycle = enhanceConfirm(button, {
    busy: words.busy ?? "Starting…",
    done: false,
    signal: life.signal,
  });

  let sent = 0;
  let started = 0;
  const missed: BatchMiss[] = [];
  let failedLine: HTMLElement | null = null;

  const nextWords = (left: number): string => {
    const last = left <= size;
    const count = format(Math.min(size, left));
    if (words.next !== undefined) {
      return words.next(count, format(left), last);
    }
    return last ? `Start the remaining ${format(left)}` : `Start the next ${count}`;
  };

  const doneWords = (): string => {
    const all = started === total;
    if (words.done !== undefined) {
      return words.done(format(started), format(total), all);
    }
    return all ? `All ${format(total)} started` : `${format(started)} of ${format(total)} started`;
  };

  const misses = (): HTMLDListElement => {
    const list = document.createElement("dl");
    list.className = "cp-facts";
    list.dataset["variant"] = "compare";
    for (const miss of missed) {
      const name = document.createElement("dt");
      name.textContent = miss.name;
      const value = document.createElement("dd");
      const state = document.createElement("span");
      state.className = "cp-state";
      state.dataset["cpState"] = "failed";
      state.textContent = miss.reason;
      value.append(state);
      if (miss.note !== undefined) {
        const note = document.createElement("small");
        note.textContent = miss.note;
        value.append(note);
      }
      list.append(name, value);
    }
    return list;
  };

  const write = (left: number): void => {
    const counts = { started, total, left, missed: missed.length, format };
    const sum = document.createElement("p");
    sum.textContent = (words.report ?? defaultReport)(counts);
    report.replaceChildren(sum, ...(missed.length === 0 ? [] : [misses()]));
    announce(sum.textContent);
  };

  const fail = (reason: unknown): void => {
    const sentence = words.failed;
    const text =
      typeof sentence === "function"
        ? sentence(reason)
        : (sentence ?? "The batch could not start.");
    failedLine ??= document.createElement("p");
    failedLine.className = "cp-state";
    failedLine.dataset["cpState"] = "failed";
    failedLine.textContent = text;
    report.append(failedLine);
    announce(text, "assertive");
  };

  button.addEventListener(
    "click",
    () => {
      if (sent >= total) {
        return;
      }
      const count = Math.min(size, total - sent);
      failedLine?.remove();
      void cycle
        .run(async () => {
          const answer = await options.send(sent, count, life.signal);
          if (life.signal.aborted) {
            return;
          }
          sent += count;
          started += answer.started;
          missed.push(...(answer.missed ?? []));
          const left = total - sent;
          cycle.setRest(left === 0 ? doneWords() : nextWords(left));
          write(left);
        })
        .then(
          (ran) => {
            if (ran && sent >= total) {
              button.disabled = true;
              focusOn(report);
            }
          },
          (reason: unknown) => {
            if (!life.signal.aborted) {
              fail(reason);
            }
          },
        );
    },
    until(life.signal),
  );
}
