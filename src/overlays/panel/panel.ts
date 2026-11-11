/**
 * panel.ts — `enhancePanel()` gives a panel of controls in a popover, such as
 * a header status's panel, the focus a non-modal panel needs: focus moves to
 * its first heading, or else its first control, as it opens, and Tab past its
 * last control closes it and moves on from the button that opened it. The
 * popover itself still closes on Escape and on a press outside.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface PanelOptions {
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** `panel` is a `.cp-popover[data-variant="panel"]` opened by a button's
 *  `popovertarget` or `commandfor`. */
export function enhancePanel(panel: HTMLElement, options: PanelOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const tabbable = (): HTMLElement[] =>
    [...panel.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.checkVisibility());
  panel.addEventListener(
    "toggle",
    (e) => {
      if (e.newState !== "open") {
        return;
      }
      const heading = panel.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
      if (heading !== null) {
        if (!heading.hasAttribute("tabindex")) {
          heading.tabIndex = -1;
        }
        heading.focus();
      } else {
        tabbable()[0]?.focus();
      }
    },
    listen,
  );
  panel.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab" || e.shiftKey || !panel.matches(":popover-open")) {
        return;
      }
      if (e.target === tabbable().at(-1)) {
        // Hiding returns focus to the opener, and the key's own move then
        // goes on from there.
        panel.hidePopover();
      }
    },
    listen,
  );
}
