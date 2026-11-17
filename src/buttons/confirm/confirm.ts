/**
 * confirm.ts — `enhanceConfirm()` turns a button into one that confirms its
 * own action in place: it turns busy while the work runs, then green with a
 * check and its done words, then back to rest by itself. Save, Grab and a
 * confirmed Delete all run this cycle. One run goes at a time; a press
 * during the done state ends it and starts the next run.
 * @module
 */

import { afterFontLoads } from "../../core/lifetime/lifetime.js";
import { measureRoll, roll, rollText } from "../../core/roll/roll.js";

/** How the button's width follows its words. */
export type ConfirmWidth = "glide" | "footprint" | "fixed";

export interface ConfirmOptions {
  /** The words while the work runs, such as "Saving…". */
  readonly busy: string;
  /** The words once it is done, such as "Saved", or false for a button
   *  whose success replaces it, such as Create in a dialog that then shows
   *  what it made: it goes from busy straight back to rest. */
  readonly done: string | false;
  /**
   * `"glide"`: the button glides to each word's width. `"footprint"`: it
   * keeps the widest word's footprint, so the buttons after it never move.
   * `"fixed"`: it holds its widest state's width, icon and words, each
   * state's content centred in it and nothing gliding, as a split button's
   * main action does so its caret never moves, and a list's Show more. Default: `"fixed"` inside
   * `.cp-split`, `"footprint"` inside a table's actions cell, else `"glide"`.
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

/** Whether the box holding `button` lines its content up at the end. */
function endAligned(button: HTMLElement): boolean {
  const box = button.parentElement;
  if (box === null) {
    return false;
  }
  const cs = getComputedStyle(box);
  const rtl = cs.direction === "rtl";
  if (cs.display.includes("flex")) {
    const j = cs.justifyContent;
    return j === "end" || j === "flex-end" || j === (rtl ? "left" : "right");
  }
  const t = cs.textAlign;
  return t === "end" || t === (rtl ? "left" : "right");
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
    Math.max(
      ...[rest, busy, ...(done === false ? [] : [done])].map((text) => measureRoll(words, text)),
    );

  /** The widest state's content, its icon and the gap after it included,
   *  read from the computed size an icon keeps while it is not shown. */
  const widestState = (): number => {
    const gap = Number.parseFloat(getComputedStyle(button).columnGap) || 0;
    const lead = (selector: string): number => {
      const icon = button.querySelector(`:scope > .cp-icon${selector}`);
      return icon === null ? 0 : (Number.parseFloat(getComputedStyle(icon).inlineSize) || 0) + gap;
    };
    const states: [string, string][] = [
      [rest, ":not([data-part])"],
      [busy, '[data-part="busy"]'],
      ...(done === false ? [] : ([[done, '[data-part="done"]']] as [string, string][])),
    ];
    return Math.max(...states.map(([text, icon]) => measureRoll(words, text) + lead(icon)));
  };

  /** Holds the footprint or the width the mode asks for, around `text`. */
  const fit = (text: string): void => {
    if (width === "glide") {
      return;
    }
    if (width === "fixed") {
      const cs = getComputedStyle(button);
      const frame = [
        cs.paddingInlineStart,
        cs.paddingInlineEnd,
        cs.borderInlineStartWidth,
        cs.borderInlineEndWidth,
      ].reduce((sum, v) => sum + (Number.parseFloat(v) || 0), 0);
      button.style.minInlineSize = `${String(Math.ceil(widestState() + frame))}px`;
      return;
    }
    const most = widest();
    const slack = `${String(most - measureRoll(words, text))}px`;
    // The slack sits away from the edge its container aligns to, so an
    // end-aligned button, as in a table's actions cell, stays flush there.
    if (endAligned(button)) {
      button.style.marginInlineStart = slack;
    } else {
      button.style.marginInlineEnd = slack;
    }
  };

  /** Fits at once, where no roll runs for the slack to keep pace with: as
   *  the button is enhanced and after a web font loads. */
  const settle = (text: string): void => {
    const was = button.style.transitionProperty;
    button.style.transitionProperty = "none";
    fit(text);
    button.getBoundingClientRect();
    button.style.transitionProperty = was;
  };

  const toRest = (): void => {
    button.removeAttribute(STATE);
    button.removeAttribute("aria-busy");
    roll(words, rest, { down: true });
    fit(rest);
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
    fit(text);
  };

  settle(rest);
  // A web font that loads after this changes every word's width, so the
  // width held from the fallback font's would be wrong.
  if (width !== "glide") {
    afterFontLoads(() => {
      settle(rollText(words));
    }, signal);
  }

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
      if (!button.hasAttribute(STATE)) {
        roll(words, text);
        fit(text);
      }
    },
  };
}
