/**
 * toggle.ts — `enhanceToggle()` makes a button an on and off toggle such as
 * Pin or Favourite: a press flips `aria-pressed`, the stylesheet shows the
 * filled drawing while it is on, and the drawing plays its turn-on or
 * turn-off motion only on a change, never when the page first draws.
 * @module
 */

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

const MOTION = "data-uip-toggled";

/**
 * `button` carries `aria-pressed` and two `.uip-icon`s: the drawing at rest
 * and the one marked `data-uip-part="on"`. A missing `aria-pressed` starts
 * it off.
 */
export function enhanceToggle(button: HTMLButtonElement, options: ToggleOptions = {}): Toggle {
  const { onChange, signal } = options;
  const listen: AddEventListenerOptions = signal === undefined ? {} : { signal };
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
      if (e.target instanceof Element && e.target.closest(".uip-icon") !== null) {
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
