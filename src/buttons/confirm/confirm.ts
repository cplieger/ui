/**
 * confirm.ts — `enhanceConfirm()` turns a button into one that confirms its
 * own action in place: it turns busy while the work runs, then green with a
 * check and its done words, then back to rest by itself. Save, Grab and a
 * confirmed Delete all run this cycle.
 * @module
 */

import { measureRoll, roll, rollText } from "../../core/roll/roll.js";

/** How the button's width follows its words. */
export type ConfirmWidth = "glide" | "footprint" | "fixed";

export interface ConfirmOptions {
  /** The words while the work runs, such as "Saving…". */
  readonly busy: string;
  /** The words once it is done, such as "Saved". */
  readonly done: string;
  /**
   * `"glide"`: the button glides to each word's width. `"footprint"`: it
   * keeps the widest word's footprint, so the buttons after it never move.
   * `"fixed"`: it holds the widest word's width, as a split button's main
   * action does so its caret never moves. Default: `"fixed"` inside
   * `.cp-split`, `"footprint"` inside a table's actions cell, else `"glide"`.
   */
  readonly width?: ConfirmWidth;
  /** How long the done state shows before the button returns, in ms. Default 1600. */
  readonly hold?: number;
  /** Work that ends sooner than this skips the busy state, in ms. Default 150. */
  readonly busyDelay?: number;
  /** A busy state that shows lasts at least this long, in ms. Default 400. */
  readonly busyMin?: number;
  /** Ends the cycle and puts the button back at rest. */
  readonly signal?: AbortSignal;
}

export interface Confirm {
  /**
   * Runs `work` through the cycle. Resolves true once the button shows its
   * done state. Resolves false without calling `work` while a cycle is
   * already running or after `signal` aborts, and false when `signal`
   * aborts before `work` ends. When `work` rejects, the button returns to
   * rest and the rejection passes through.
   */
  run(work: () => Promise<unknown>): Promise<boolean>;
}

const STATE = "data-cp-state";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `button` holds a `.cp-roll` with its words at rest and, beside its icon at
 * rest, two `.cp-icon`s marked `data-part="busy"` (the spinner-arc) and
 * `data-part="done"` (the check). Throws a TypeError without the
 * `.cp-roll`.
 */
export function enhanceConfirm(button: HTMLButtonElement, options: ConfirmOptions): Confirm {
  const words = button.querySelector<HTMLElement>(".cp-roll");
  if (words === null) {
    throw new TypeError("enhanceConfirm: the button has no .cp-roll");
  }
  const { busy, done, signal } = options;
  const hold = options.hold ?? 1600;
  const busyDelay = options.busyDelay ?? 150;
  const busyMin = options.busyMin ?? 400;
  const width: ConfirmWidth =
    options.width ??
    (button.closest(".cp-split") !== null
      ? "fixed"
      : button.closest('[data-col="actions"]') !== null
        ? "footprint"
        : "glide");
  button.setAttribute("data-cp-confirm", width);

  let rest = rollText(words);
  let cycle = 0;
  let back: ReturnType<typeof setTimeout> | undefined;

  const widest = (): number =>
    Math.max(...[rest, busy, done].map((text) => measureRoll(words, text)));

  /** Holds the footprint or the width the mode asks for, around `text`. */
  const fit = (text: string): void => {
    if (width === "glide") {
      return;
    }
    const most = widest();
    if (width === "fixed") {
      words.style.minInlineSize = `${String(most)}px`;
      return;
    }
    button.style.marginInlineEnd = `${String(most - measureRoll(words, text))}px`;
  };

  const toRest = (): void => {
    button.removeAttribute(STATE);
    button.removeAttribute("aria-busy");
    roll(words, rest, { down: true });
    fit(rest);
  };

  const show = (state: "busy" | "done", text: string): void => {
    button.setAttribute(STATE, state);
    if (state === "busy") {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
    roll(words, text);
    fit(text);
  };

  fit(rest);

  signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(back);
      cycle += 1;
      if (button.hasAttribute(STATE)) {
        toRest();
      }
    },
    { once: true },
  );

  return {
    async run(work) {
      if (button.hasAttribute(STATE) || signal?.aborted === true) {
        return false;
      }
      const mine = ++cycle;
      clearTimeout(back);
      // Read at the press: a label such as "Grab 3" changes with the selection.
      rest = rollText(words);
      button.setAttribute(STATE, "pending");
      let shownAt = -1;
      const delay = setTimeout(() => {
        if (mine === cycle) {
          shownAt = performance.now();
          show("busy", busy);
        }
      }, busyDelay);
      try {
        await work();
      } catch (err) {
        clearTimeout(delay);
        if (mine === cycle) {
          toRest();
        }
        throw err;
      }
      clearTimeout(delay);
      if (shownAt >= 0) {
        await wait(Math.max(0, busyMin - (performance.now() - shownAt)));
      }
      if (mine !== cycle) {
        return false;
      }
      show("done", done);
      back = setTimeout(() => {
        if (mine === cycle) {
          toRest();
        }
      }, hold);
      return true;
    },
  };
}
