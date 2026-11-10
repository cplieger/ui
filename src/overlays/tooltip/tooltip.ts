/**
 * tooltip.ts — a short name or hint for a control, from its `data-cp-tip`,
 * in one `popover="manual"` placed by CSS anchor positioning. A mouse waits
 * half a second, keyboard focus shows it at once, and a finger toggles it on
 * a control marked `data-cp-tip-toggle`. The tip's words are never the only
 * place they live: an icon-only control keeps its `aria-label`, and a tip
 * that says more than that label describes the control.
 * @module
 */

import { addAnchorName, removeAnchorName } from "../anchor/anchor.js";
import { shared } from "../../core/lifetime/lifetime.js";

export interface TooltipOptions {
  /** How long a mouse rests on a control before its tip shows, in ms.
   *  Default 500. */
  readonly delay?: number;
  /** Removes the tip and its listeners. */
  readonly signal?: AbortSignal;
}

const TIP = "[data-cp-tip]";
const NAME = "--cp-tip-anchor";

function target(e: Event): HTMLElement | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t.closest<HTMLElement>(TIP) : null;
}

function listen(signal: AbortSignal, delay: number): void {
  const tip = document.createElement("div");
  tip.className = "cp-tooltip";
  tip.id = "cp-tooltip";
  tip.popover = "manual";
  tip.setAttribute("role", "tooltip");
  document.body.append(tip);
  let shownFor: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hide = (): void => {
    clearTimeout(timer);
    if (shownFor !== null) {
      removeAnchorName(shownFor, NAME);
      if (shownFor.getAttribute("aria-describedby") === tip.id) {
        shownFor.removeAttribute("aria-describedby");
      }
    }
    shownFor = null;
    if (tip.matches(":popover-open")) {
      tip.hidePopover();
    }
  };
  const show = (el: HTMLElement): void => {
    clearTimeout(timer);
    if (shownFor !== el) {
      hide();
    }
    const words = el.dataset["cpTip"] ?? "";
    if (words === "" || !el.isConnected) {
      return;
    }
    // Read at each showing, so a control that names what its next press
    // does is never stale.
    tip.textContent = words;
    addAnchorName(el, NAME);
    if (el.getAttribute("aria-label") !== words && !el.hasAttribute("aria-describedby")) {
      el.setAttribute("aria-describedby", tip.id);
    }
    shownFor = el;
    if (tip.matches(":popover-open")) {
      // Shown again, so it stays above a modal that opened after it.
      tip.hidePopover();
    }
    tip.showPopover();
  };

  const on = { capture: true, signal };
  document.addEventListener(
    "pointerover",
    (e) => {
      const el = target(e);
      if (e.pointerType !== "mouse" || el === null || el === shownFor) {
        return;
      }
      clearTimeout(timer);
      // A rest of the pointer is a length of time, so a timer measures it.
      timer = setTimeout(() => {
        show(el);
      }, delay);
    },
    on,
  );
  document.addEventListener(
    "pointerout",
    (e) => {
      const el = target(e);
      const to = e.relatedTarget;
      if (el !== null && !(to instanceof Node && el.contains(to))) {
        if (el === shownFor) {
          hide();
        } else {
          clearTimeout(timer);
        }
      }
    },
    on,
  );
  document.addEventListener(
    "focusin",
    (e) => {
      const el = target(e);
      if (el?.matches(":focus-visible") === true) {
        show(el);
      }
    },
    on,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      if (target(e) === shownFor) {
        hide();
      }
    },
    on,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && shownFor !== null) {
        hide();
      }
    },
    on,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = target(e);
      if (e.pointerType === "mouse") {
        hide();
        return;
      }
      if (el?.hasAttribute("data-cp-tip-toggle") === true) {
        if (el === shownFor) {
          hide();
        } else {
          show(el);
        }
      } else {
        hide();
      }
    },
    on,
  );
  signal.addEventListener(
    "abort",
    () => {
      hide();
      tip.remove();
    },
    { once: true },
  );
}

const page = shared<{ readonly delay?: number }>((signal, o) => {
  listen(signal, o.delay ?? 500);
});

/**
 * Starts the tips, once for the page however many parts of it call this.
 * They stay until every caller's signal has aborted; a caller with no
 * signal holds them for the page's life. The first call's `delay` holds.
 */
export function installTooltips(options: TooltipOptions = {}): void {
  page.install(options);
}
