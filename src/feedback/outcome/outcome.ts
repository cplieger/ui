/**
 * outcome.ts — `enhanceOutcome()` runs a row's action, such as Download,
 * and settles its cell into the result: a link to what it made, or the
 * failure beside Retry.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { safely } from "../../core/safely/safely.js";
import { glyph, toneGlyph } from "../../foundations/icons/glyph.js";
import { announce } from "../announce/announce.js";

/** What the action made: a link to it and its words, such as
 *  "Downloaded · Pinned". */
export interface OutcomeResult {
  readonly href: string;
  readonly words: string;
}

export interface OutcomeWords {
  /** The button's words while the action runs, such as "Downloading…". */
  readonly busy: string;
  /** Said politely once the action succeeded. Default the result's words. */
  readonly said?: (result: OutcomeResult) => string;
  /** The failure's sentence. Default what `run` rejected with, when it is
   *  an Error with a message, else "The action failed." */
  readonly failed?: (reason: unknown) => string;
  /** Said assertively once the action failed, such as "Download failed: the
   *  provider timed out." Default the failure's sentence. */
  readonly failedSaid?: (reason: unknown) => string;
  /** Retry's words. Default "Retry". */
  readonly retry?: string;
}

export interface OutcomeOptions {
  /** Runs the action. Its signal aborts with the module's. */
  readonly run: (signal: AbortSignal) => Promise<OutcomeResult>;
  readonly words: OutcomeWords;
  /** Ends the wiring and any action under way, which then writes nothing. */
  readonly signal?: AbortSignal;
}

const sentenceOf = (reason: unknown): string =>
  reason instanceof Error && reason.message !== "" ? reason.message : "The action failed.";

let failures = 0;

/**
 * Wires `button`, a row's action holding a `.cp-roll` with its words and
 * its `spinner-arc` busy span. A press runs `run` through the button's
 * busy cycle, then puts a `.cp-outcome` in the button's place. Throws a
 * TypeError without the `.cp-roll`.
 */
export function enhanceOutcome(button: HTMLButtonElement, options: OutcomeOptions): void {
  if (button.querySelector(".cp-roll") === null) {
    throw new TypeError("enhanceOutcome: the button has no .cp-roll");
  }
  const { words } = options;
  const life = new AbortController();
  whenAborted(options.signal, () => {
    life.abort();
  });

  // Focus follows only when it was on what goes, or the swap would drop it
  // to the page; a reader who moved on keeps their place.
  const settle = (from: Element, to: HTMLElement, target: HTMLElement): void => {
    const follow =
      from.contains(document.activeElement) || document.activeElement === document.body;
    from.replaceWith(to);
    if (follow) {
      target.focus();
    }
  };

  const succeed = (from: Element, result: OutcomeResult): void => {
    const link = document.createElement("a");
    link.href = result.href;
    link.append(glyph(toneGlyph("success")), result.words);
    const outcome = document.createElement("span");
    outcome.className = "cp-outcome";
    outcome.append(link);
    settle(from, outcome, link);
    announce(
      safely(
        () => words.said?.(result) ?? result.words,
        () => result.words,
      ),
    );
  };

  const fail = (from: Element, reason: unknown): void => {
    const sentence = safely(
      () => words.failed?.(reason) ?? sentenceOf(reason),
      () => sentenceOf(reason),
    );
    const state = document.createElement("span");
    state.className = "cp-state";
    state.dataset["cpState"] = "failed";
    state.id = `cp-outcome-failed-${String(++failures)}`;
    state.textContent = sentence;
    const retry = document.createElement("button");
    retry.className = "cp-button";
    retry.dataset["size"] = "sm";
    retry.type = "button";
    retry.setAttribute("aria-describedby", state.id);
    const roll = document.createElement("span");
    roll.className = "cp-roll";
    roll.textContent = words.retry ?? "Retry";
    retry.append(glyph("refresh-cw"), glyph("spinner-arc", "busy"), roll);
    const outcome = document.createElement("span");
    outcome.className = "cp-outcome";
    outcome.append(state, retry);
    settle(from, outcome, retry);
    wire(retry, outcome);
    announce(
      safely(
        () => words.failedSaid?.(reason) ?? sentence,
        () => sentence,
      ),
      "assertive",
    );
  };

  // `swap` is what the result replaces: the button itself, or the failed
  // outcome holding Retry.
  function wire(control: HTMLButtonElement, swap: Element): void {
    const cycle = enhanceConfirm(control, { busy: words.busy, done: false, signal: life.signal });
    let result: OutcomeResult | undefined;
    control.addEventListener(
      "click",
      () => {
        cycle
          .run(async () => {
            result = await options.run(life.signal);
          })
          .then(
            (ran) => {
              if (ran && result !== undefined && !life.signal.aborted) {
                succeed(swap, result);
              }
            },
            (reason: unknown) => {
              if (!life.signal.aborted) {
                fail(swap, reason);
              }
            },
          );
      },
      until(life.signal),
    );
  }

  wire(button, button);
}
