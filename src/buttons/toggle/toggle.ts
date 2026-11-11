/**
 * toggle.ts — `enhanceToggle()` makes a button an on and off toggle such as
 * Pin, Favourite or the theme, playing its drawing's motion only on a
 * change. `enhanceToggleGroup()` keeps one button of a group pressed, as a
 * choice among views is.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface ToggleOptions {
  /** Runs after each press with the new state. */
  readonly onChange?: (on: boolean) => void;
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

export interface Toggle {
  /** Whether the toggle is on. */
  readonly on: boolean;
  /** Sets the state without a press, and without the motion. */
  set(on: boolean): void;
}

const MOTION = "data-cp-toggled";

/**
 * `button` carries `aria-pressed` and two `.cp-icon`s: the drawing at rest
 * and the one marked `data-part="on"`. A missing `aria-pressed` starts
 * it off.
 */
export function enhanceToggle(button: HTMLButtonElement, options: ToggleOptions = {}): Toggle {
  const { onChange, signal } = options;
  const listen = until(signal);
  const state = (): boolean => button.getAttribute("aria-pressed") === "true";
  button.setAttribute("aria-pressed", String(state()));

  button.addEventListener(
    "click",
    () => {
      const on = !state();
      button.setAttribute("aria-pressed", String(on));
      // A second change mid-motion restarts it from the new state.
      button.removeAttribute(MOTION);
      button.getBoundingClientRect();
      button.setAttribute(MOTION, on ? "on" : "off");
      onChange?.(on);
    },
    listen,
  );
  button.addEventListener(
    "animationend",
    (e) => {
      if (e.target instanceof Element && e.target.closest(".cp-icon") !== null) {
        button.removeAttribute(MOTION);
      }
    },
    listen,
  );

  return {
    get on() {
      return state();
    },
    set(on) {
      button.removeAttribute(MOTION);
      button.setAttribute("aria-pressed", String(on));
    },
  };
}

export interface ToggleGroupOptions {
  /** Runs after a press pressed another button, with that button. */
  readonly onChange?: (button: HTMLButtonElement) => void;
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

export interface ToggleGroup {
  /** The pressed button, or null when none is. */
  readonly pressed: HTMLButtonElement | null;
  /** Presses `button`, one of the group's, without a press or `onChange`. */
  set(button: HTMLButtonElement): void;
}

/**
 * `group`, a `.cp-toggle-group`, holds `.cp-button`s with `aria-pressed`. A
 * press on one presses it and lets go of the others; a press on the
 * pressed one keeps it pressed, so one choice always holds.
 */
export function enhanceToggleGroup(
  group: HTMLElement,
  options: ToggleGroupOptions = {},
): ToggleGroup {
  const { onChange, signal } = options;
  const buttons = (): HTMLButtonElement[] => [
    ...group.querySelectorAll<HTMLButtonElement>(":scope > button[aria-pressed]"),
  ];
  const press = (chosen: HTMLButtonElement): void => {
    for (const b of buttons()) {
      b.setAttribute("aria-pressed", String(b === chosen));
    }
  };

  group.addEventListener(
    "click",
    (e) => {
      const b = e.target instanceof Element ? e.target.closest("button") : null;
      if (b?.parentElement !== group || !b.hasAttribute("aria-pressed")) {
        return;
      }
      if (b.getAttribute("aria-pressed") !== "true") {
        press(b);
        onChange?.(b);
      }
    },
    until(signal),
  );

  return {
    get pressed() {
      return buttons().find((b) => b.getAttribute("aria-pressed") === "true") ?? null;
    },
    set: press,
  };
}
