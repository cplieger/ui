/**
 * toggle.ts — `enhanceToggle()` makes a button an on and off toggle such as
 * Pin, Favourite or the theme: a press flips `aria-pressed`, the stylesheet
 * shows the drawing marked `data-part="on"` while it is on, and the drawing
 * plays its turn-on or turn-off motion only on a change, never when the page
 * first draws.
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
      // A second change mid-motion restarts it from the new state. A button
      // not drawn, as one pressed from a toolbar's More menu, would end no
      // animation and play it once shown, so it marks none.
      button.removeAttribute(MOTION);
      button.getBoundingClientRect();
      if (button.checkVisibility()) {
        button.setAttribute(MOTION, on ? "on" : "off");
      }
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
