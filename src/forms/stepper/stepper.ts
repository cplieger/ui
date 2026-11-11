/**
 * stepper.ts — `enhanceStepper()` gives a `.cp-stepper` its minus and plus:
 * each press steps the number field by its own `step`, within `min` and
 * `max`, and the number rolls to its new value, up as it grows and down as
 * it shrinks. A button at the end it cannot pass reads as unavailable.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { reducedMotion, until } from "../../core/lifetime/lifetime.js";
import { roll } from "../../core/roll/roll.js";

export interface StepperOptions {
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const ROLLING = "data-cp-rolling";

/**
 * `stepper` holds a number `<input>` and buttons marked `data-step`, how many
 * of the field's steps a press moves: `"-1"` for the minus and `"1"` for the
 * plus. Each change fires `input` and `change` on the field, as typing would,
 * and is said through @cplieger/ui/announce.
 */
export function enhanceStepper(stepper: HTMLElement, options: StepperOptions = {}): void {
  const { signal } = options;
  const input = stepper.querySelector<HTMLInputElement>("input");
  if (input === null || signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const buttons = (): HTMLButtonElement[] => [
    ...stepper.querySelectorAll<HTMLButtonElement>("button[data-step]"),
  ];
  const ends = (): void => {
    const v = input.valueAsNumber;
    for (const b of buttons()) {
      const up = Number(b.dataset["step"]) > 0;
      const limit = up ? input.max : input.min;
      const stuck =
        limit !== "" && !Number.isNaN(v) && (up ? v >= Number(limit) : v <= Number(limit));
      if (stuck) {
        b.setAttribute("aria-disabled", "true");
      } else {
        b.removeAttribute("aria-disabled");
      }
    }
  };

  const show = document.createElement("span");
  show.className = "cp-stepper-show";
  show.setAttribute("aria-hidden", "true");
  const line = document.createElement("span");
  line.className = "cp-roll";
  line.dataset["kind"] = "number";
  show.append(line);
  input.after(show);
  const settle = (): void => {
    stepper.removeAttribute(ROLLING);
  };
  const rollFrom = (before: string, after: string): void => {
    if (reducedMotion()) {
      return;
    }
    Object.assign(show.style, {
      insetInlineStart: `${String(input.offsetLeft)}px`,
      insetBlockStart: `${String(input.offsetTop)}px`,
      inlineSize: `${String(input.offsetWidth)}px`,
      blockSize: `${String(input.offsetHeight)}px`,
    });
    if (!stepper.hasAttribute(ROLLING)) {
      line.replaceChildren(before);
    }
    stepper.setAttribute(ROLLING, "");
    roll(line, after, { down: Number(after) < Number(before) });
    void Promise.all(line.getAnimations({ subtree: true }).map((a) => a.finished)).then(
      () => {
        if (line.lastElementChild?.textContent === input.value) {
          settle();
        }
      },
      () => undefined,
    );
  };

  stepper.addEventListener(
    "click",
    (e) => {
      const b = e.target instanceof Element ? e.target.closest("button[data-step]") : null;
      if (
        !(b instanceof HTMLButtonElement) ||
        !stepper.contains(b) ||
        b.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      const before = input.value;
      try {
        input.stepUp(Number(b.dataset["step"]));
      } catch {
        // A value the field cannot step from, such as text in a number field.
        return;
      }
      if (input.value === before) {
        return;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      rollFrom(before, input.value);
      announce(input.value);
    },
    listen,
  );
  input.addEventListener(
    "input",
    (e) => {
      // Typing ends a roll at once, so the field shows what was typed.
      if (e.isTrusted) {
        settle();
      }
      ends();
    },
    listen,
  );
  signal?.addEventListener(
    "abort",
    () => {
      show.remove();
      settle();
      for (const b of buttons()) {
        b.removeAttribute("aria-disabled");
      }
    },
    { once: true },
  );
  ends();
}
