/**
 * stepper.ts — `enhanceStepper()` gives a `.cp-stepper` its minus and plus:
 * each press steps the number field by its own `step`, within `min` and
 * `max`, and the number rolls to its new value, up as it grows and down as
 * it shrinks. A button at the end it cannot pass reads as unavailable. Its
 * field can instead be text that shows a sign, such as "+1.25", with
 * buttons of several sizes and a Reset.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { reducedMotion, until } from "../../core/lifetime/lifetime.js";
import { roll } from "../../core/roll/roll.js";

export interface StepperOptions {
  /** How a text field shows its value. Default: a sign before it at the
   *  step's or the markup's decimals, whichever is finer, "+1.25", "−1.25"
   *  or "0.00". A number field shows the browser's own. */
  readonly format?: (value: number) => string;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

/** The decimals written in a number such as "0.05" or "+1.25": 2. */
function decimals(text: string): number {
  const m = /[.,](\d+)/.exec(text);
  return m?.[1]?.length ?? 0;
}

/** A typed value, with a "+" or a typographic "−" and a comma for the
 *  point; NaN when it is not a number. */
function parse(text: string): number {
  const t = text.trim().replaceAll("\u2212", "-").replace(",", ".").replace(/^\+/, "");
  return t === "" ? Number.NaN : Number(t);
}

const ROLLING = "data-cp-rolling";

/**
 * `stepper` holds a number `<input>` and buttons whose `data-step` is how
 * many steps a press moves: `"-1"` for the minus, `"1"` for the plus. A
 * text `<input>` takes its range and step from `data-min`, `data-max` and
 * `data-step` and steps on Up and Down. Shift moves ten steps in either field.
 * A `data-reset` button sets the field to that attribute's value, else the
 * markup's. A change fires `input` and `change` and is said through announce.
 */
export function enhanceStepper(stepper: HTMLElement, options: StepperOptions = {}): void {
  const { signal } = options;
  const input = stepper.querySelector<HTMLInputElement>("input");
  if (input === null || signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const numeric = input.type === "number";
  const attr = (name: "min" | "max" | "step"): string =>
    numeric ? input[name] : (input.dataset[name] ?? "");
  const step = Number(attr("step")) || 1;
  // As precise as the step or the markup's value, whichever is finer.
  const places = Math.max(decimals(attr("step")), decimals(input.defaultValue));
  const format =
    options.format ??
    ((v: number) => `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${Math.abs(v).toFixed(places)}`);
  const read = (): number => (numeric ? input.valueAsNumber : parse(input.value));
  const clamp = (v: number): number => {
    const lo = attr("min") === "" ? -Infinity : Number(attr("min"));
    const hi = attr("max") === "" ? Infinity : Number(attr("max"));
    const n = Number(v.toFixed(places));
    return Math.min(hi, Math.max(lo, n));
  };
  let last = numeric ? input.value : format(clamp(Number.isNaN(read()) ? 0 : read()));
  if (!numeric) {
    input.value = last;
  }
  const buttons = (): HTMLButtonElement[] => [
    ...stepper.querySelectorAll<HTMLButtonElement>("button[data-step]"),
  ];
  const ends = (): void => {
    const v = read();
    for (const b of buttons()) {
      const up = Number(b.dataset["step"]) > 0;
      const limit = up ? attr("max") : attr("min");
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
  const rollFrom = (before: string, after: string, down: boolean): void => {
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
    roll(line, after, { down });
    void Promise.all(line.getAnimations({ subtree: true }).map((a) => a.finished)).then(
      () => {
        if (line.lastElementChild?.textContent === input.value) {
          settle();
        }
      },
      () => undefined,
    );
  };

  /** Moves the value by `k` steps, or to a Reset's `to`, as a press does:
   *  tells the form, rolls the text and says it. */
  const move = (k: number | { readonly to: string }): void => {
    const before = input.value;
    const from = read();
    if (numeric) {
      try {
        if (typeof k === "object") {
          input.value = k.to;
        } else {
          input.stepUp(k);
        }
      } catch {
        // A value the field cannot step from, such as text in a number field.
        return;
      }
    } else {
      const to = typeof k === "object" ? parse(k.to) : Number.NaN;
      const base = Number.isNaN(from) ? 0 : from;
      input.value = format(
        clamp(typeof k === "object" ? (Number.isNaN(to) ? 0 : to) : base + k * step),
      );
    }
    if (input.value === before) {
      return;
    }
    last = input.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    rollFrom(before, input.value, read() < from);
    announce(input.value);
  };

  stepper.addEventListener(
    "click",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const b = t?.closest("button[data-step], button[data-reset]");
      if (
        !(b instanceof HTMLButtonElement) ||
        !stepper.contains(b) ||
        b.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      const reset = b.dataset["reset"];
      move(
        reset === undefined
          ? Number(b.dataset["step"])
          : { to: reset === "" ? input.defaultValue : reset },
      );
    },
    listen,
  );
  input.addEventListener(
    "keydown",
    (e) => {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || (numeric && !e.shiftKey)) {
        return;
      }
      e.preventDefault();
      move((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
    },
    listen,
  );
  if (!numeric) {
    // A typed value settles to the field's form, within its range; text that
    // is no number puts back the last value.
    input.addEventListener(
      "change",
      (e) => {
        if (!e.isTrusted) {
          return;
        }
        const v = parse(input.value);
        input.value = Number.isNaN(v) ? last : format(clamp(v));
        last = input.value;
        ends();
      },
      listen,
    );
  }
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
