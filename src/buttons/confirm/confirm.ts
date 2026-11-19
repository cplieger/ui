/**
 * confirm.ts — `enhanceConfirm()` turns a button into one that confirms its
 * own action in place: it turns busy while the work runs, then green with a
 * check and its done words, then back to rest by itself. Save, Grab and a
 * confirmed Delete all run this cycle. One run goes at a time; a press
 * during the done state ends it and starts the next run.
 * @module
 */

import { roll, rollText } from "../../core/roll/roll.js";

/** How the button's width follows its words. */
export type ConfirmWidth = "glide" | "fixed";

export interface ConfirmOptions {
  /** The words while the work runs, such as "Saving…". */
  readonly busy: string;
  /** The words once it is done, such as "Saved", or false for a button
   *  whose success replaces it, such as Create in a dialog that then shows
   *  what it made: it goes from busy straight back to rest. */
  readonly done: string | false;
  /**
   * `"glide"`: the button glides to each word's width. `"fixed"`: it holds
   * its widest state's width, icon and words, from the moment it is
   * enhanced, each state's content centred in it, so nothing beside it
   * moves. Default: `"fixed"` inside `.cp-split` and a table's actions
   * cell, else `"glide"`.
   */
  readonly width?: ConfirmWidth;
  /** How long the done state shows before the button returns, in ms. Default 1600. */
  readonly hold?: number;
  /** Work that ends sooner than this skips the busy state, in ms. Default 150. */
  readonly busyDelay?: number;
  /** A busy state that shows lasts at least this long, in ms. Default 400. */
  readonly busyMin?: number;
  /** Runs each time the button is back at rest after a run, whether its
   *  done state ran out, its work failed or `signal` ended it. A run started
   *  during the done state goes on without a rest, so this waits for it. */
  readonly onRest?: () => void;
  /** Ends the cycle and puts the button back at rest. */
  readonly signal?: AbortSignal;
}

export interface Confirm {
  /**
   * Runs `work` through the cycle. Resolves true once the button shows its
   * done state, or is back at rest when `done` is false. Resolves false,
   * without calling `work`, while busy (work running or busyMin holding) or
   * after `signal` aborts, and when `signal` aborts before `work` ends. A run
   * in the done state ends it and starts at once; a rejection passes through.
   */
  run(work: () => Promise<unknown>): Promise<boolean>;
  /** Sets the words the button rests on, such as "Retry" after work that
   *  failed: rolled to at once at rest, else as the cycle ends. */
  setRest(text: string): void;
}

const STATE = "data-cp-state";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One state's icon and words, as css/system lays them in a fixed
 *  button's hidden cell. The words are generated content, so the button's
 *  text is only the words it shows. */
function face(button: HTMLElement, icon: string, text: string): HTMLElement {
  const f = document.createElement("span");
  const shown = button.querySelector<HTMLElement>(`:scope > .cp-icon${icon}`);
  if (shown !== null) {
    const copy = document.createElement("span");
    copy.className = shown.className;
    copy.style.cssText = shown.style.cssText;
    f.append(copy);
  }
  f.dataset["words"] = text;
  return f;
}

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
  const { busy, done, onRest, signal } = options;
  const hold = options.hold ?? 1600;
  const busyDelay = options.busyDelay ?? 150;
  const busyMin = options.busyMin ?? 400;
  const width: ConfirmWidth =
    options.width ??
    (button.closest('.cp-split, [data-col="actions"]') !== null ? "fixed" : "glide");
  button.setAttribute("data-cp-confirm", width);

  let rest = rollText(words);
  let cycle = 0;
  let back: ReturnType<typeof setTimeout> | undefined;

  // A fixed button's width is its widest face's, laid out by the browser
  // in the button's own font and spacing, so no width is measured here and
  // a late web font, zoom or text spacing changes it with nothing re-run.
  const faces = width === "fixed" ? document.createElement("span") : null;
  const lay = (): void => {
    faces?.replaceChildren(
      face(button, ":not([data-part])", rest),
      face(button, '[data-part="busy"]', busy),
      ...(done === false ? [] : [face(button, '[data-part="done"]', done)]),
    );
  };
  if (faces !== null) {
    faces.className = "cp-roll";
    faces.dataset["part"] = "faces";
    faces.setAttribute("aria-hidden", "true");
    button.append(faces);
    lay();
  }

  const toRest = (): void => {
    button.removeAttribute(STATE);
    button.removeAttribute("aria-busy");
    roll(words, rest, { down: true });
    onRest?.();
  };

  const show = (state: "busy" | "done", text: string): void => {
    button.setAttribute(STATE, state);
    if (state === "busy") {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
    roll(words, text);
  };

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
      const state = button.getAttribute(STATE);
      if ((state !== null && state !== "done") || signal?.aborted === true) {
        return false;
      }
      const mine = ++cycle;
      clearTimeout(back);
      if (state === null) {
        // Read at the press: a label such as "Grab 3" changes with the
        // selection. During the done state the words are the done words.
        rest = rollText(words);
        lay();
      }
      button.setAttribute(STATE, "pending");
      let shownAt = -1;
      const delay = setTimeout(() => {
        if (mine === cycle) {
          show("busy", busy);
          shownAt = performance.now();
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
      // A timer may fire a little early in some engines, so the hold waits
      // again for what is left.
      for (let left = busyMin - (performance.now() - shownAt); shownAt >= 0 && left > 0;) {
        await wait(left);
        left = busyMin - (performance.now() - shownAt);
      }
      if (mine !== cycle) {
        return false;
      }
      if (done === false) {
        toRest();
        return true;
      }
      show("done", done);
      back = setTimeout(() => {
        if (mine === cycle) {
          toRest();
        }
      }, hold);
      return true;
    },
    setRest(text) {
      rest = text;
      lay();
      if (!button.hasAttribute(STATE)) {
        roll(words, text);
      }
    },
  };
}
