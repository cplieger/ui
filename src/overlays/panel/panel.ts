/**
 * panel.ts — `enhancePanel()` gives a panel of controls in a popover, such as
 * a header status's panel, the focus a non-modal panel needs: focus moves to
 * its first heading, or else its first control, as it opens, and Tab past its
 * last control, or past its heading when it has none, closes it and moves on
 * from the button that opened it. The popover itself still closes on Escape
 * and on a press outside. A panel with no role is a non-modal dialog named
 * by its heading.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface PanelOptions {
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

let seq = 0;

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
  const heading = (): HTMLElement | null =>
    panel.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
  const named = panel.hasAttribute("aria-label") || panel.hasAttribute("aria-labelledby");
  const title = heading();
  if (!panel.hasAttribute("role")) {
    panel.setAttribute("role", "dialog");
  }
  if (!named && title !== null) {
    if (title.id === "") {
      title.id = `cp-panel-${String(++seq)}-heading`;
    }
    panel.setAttribute("aria-labelledby", title.id);
  }
  const last = (): HTMLElement | null | undefined =>
    [...panel.querySelectorAll<HTMLElement>(TABBABLE)].findLast((el) => el.checkVisibility()) ??
    heading();
  const first = (): HTMLElement | undefined =>
    [...panel.querySelectorAll<HTMLElement>(TABBABLE)].find((el) => el.checkVisibility());
  panel.addEventListener(
    "toggle",
    (e) => {
      if (e.newState !== "open") {
        return;
      }
      const h = heading();
      if (h !== null) {
        if (!h.hasAttribute("tabindex")) {
          h.tabIndex = -1;
        }
        h.focus();
      } else {
        first()?.focus();
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
      if (e.target === last()) {
        // Hiding returns focus to the opener, and the key's own move then
        // goes on from there.
        panel.hidePopover();
      }
    },
    listen,
  );
}
