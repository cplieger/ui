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

/** What `send` resolves with, accounting for every item of the batch: how
 *  many started, the ones refused for good, and how many wait to be sent
 *  again, such as those a full queue or a lost connection held back. */
export interface BatchAnswer {
  readonly started: number;
  readonly missed?: readonly BatchMiss[];
  /** Default 0. They stay in what remains, and the next press sends them. */
  readonly pending?: number;
}

/** Each function is given numbers already written in the page's language. */
export interface BatchWords {
  /** The button's words while items remain, the pending ones among them.
   *  Default "Start the next {size}", or "Start the remaining {left}" once
   *  one press covers them. */
  readonly next?: (size: string, left: string, last: boolean) => string;
  /** The button's words after the last batch. Default "All {total}
   *  started", or "{started} of {total} started" when some did not. */
  readonly done?: (started: string, total: string, all: boolean) => string;
  /** The button's words while a batch is sent. Default "Starting…". */
  readonly busy?: string;
  /** The report's sum after each press, said politely. Default "Started
   *  {started} of {total}. {pending} waiting to be sent again. {left}
   *  remain. {missed} couldn't start:". */
  readonly report?: (counts: BatchCounts) => string;
  /** The sentence for a press that failed outright, or built from what
   *  `send` rejected with. Default "The batch could not start." */
  readonly failed?: string | ((reason: unknown) => string);
}

/** The counts so far, in numbers and as the page's language writes them. */
export interface BatchCounts {
  readonly started: number;
  readonly total: number;
  /** Items never sent yet, the pending ones not among them. */
  readonly left: number;
  /** Items the last press held back, to be sent again. */
  readonly pending: number;
  readonly missed: number;
  readonly format: (n: number) => string;
}

export interface BatchOptions {
  /** How many items the action covers, a whole number of at least 1. */
  readonly total: number;
  /** How many items one press sends, a whole number of at least 1. */
  readonly size: number;
  /** Sends the host's next `count` items, the pending ones first, so the
   *  host keeps the queue. A rejection fails the press and nothing counts,
   *  so the next press sends the same items; so does an answer that does
   *  not account for exactly `count` items, a RangeError. */
  readonly send: (count: number, signal: AbortSignal) => Promise<BatchAnswer>;
  /** The language the counts are written in. Default the button's `lang`. */
  readonly locale?: string;
  readonly words?: BatchWords;
  /** Ends the wiring and the batch under way. */
  readonly signal?: AbortSignal;
}

function defaultReport({ started, total, left, pending, missed, format }: BatchCounts): string {
  const parts = [`Started ${format(started)} of ${format(total)}.`];
  if (pending > 0) {
    parts.push(`${format(pending)} waiting to be sent again.`);
  }
  if (left > 0) {
    parts.push(`${format(left)} ${left === 1 ? "remains" : "remain"}.`);
  } else if (pending === 0) {
    parts.push("None remain.");
  }
  if (missed > 0) {
    parts.push(`${format(missed)} couldn't start:`);
  }
  return parts.join(" ");
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

  /** Items that left the set: started or refused for good. */
  let settled = 0;
  let started = 0;
  let pending = 0;
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
    const counts = { started, total, left: left - pending, pending, missed: missed.length, format };
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
      if (settled >= total) {
        return;
      }
      const count = Math.min(size, total - settled);
      failedLine?.remove();
      void cycle
        .run(async () => {
          const answer = await options.send(count, life.signal);
          if (life.signal.aborted) {
            return;
          }
          const refused = answer.missed ?? [];
          const held = answer.pending ?? 0;
          if (
            [answer.started, held].some((n) => !Number.isInteger(n) || n < 0) ||
            answer.started + refused.length + held !== count
          ) {
            throw new RangeError(
              `enhanceBatchedAction: send answered for ${String(answer.started + refused.length + held)} items of a batch of ${String(count)}`,
            );
          }
          settled += answer.started + refused.length;
          started += answer.started;
          pending = held;
          missed.push(...refused);
          const left = total - settled;
          cycle.setRest(left === 0 ? doneWords() : nextWords(left));
          write(left);
        })
        .then(
          (ran) => {
            if (ran && settled >= total) {
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
