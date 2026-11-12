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
import { installRadioFocus } from "../../core/radio-focus/radio-focus.js";

export interface TooltipOptions {
  /** How long a mouse rests on a control before its tip shows, in ms.
   *  Default 500. */
  readonly delay?: number;
  /** Removes the tip and its listeners. */
  readonly signal?: AbortSignal;
}

const TIP = "[data-cp-tip]";
const NAME = "--cp-tip-anchor";

/** What a screen reader focuses for `el`: a tipped label's control. */
function described(el: HTMLElement): HTMLElement {
  return el instanceof HTMLLabelElement ? (el.control ?? el) : el;
}

function target(e: Event): HTMLElement | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t.closest<HTMLElement>(TIP) : null;
}

// Words that differ only in punctuation, spacing or case say the same thing.
function gist(text: string): string {
  return text
    .replaceAll(/[\p{P}\s]+/gu, " ")
    .trim()
    .toLowerCase();
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

  /** Writes `el`'s words into the tip, and describes the control by them
   *  only while they say more than its name: the control's `aria-label`,
   *  else `el`'s, else `el`'s own words, as a label's visually hidden ones.
   *  False when it has none. */
  const write = (el: HTMLElement): boolean => {
    const words = el.dataset["cpTip"] ?? "";
    if (words === "" || !el.isConnected) {
      return false;
    }
    tip.textContent = words;
    const d = described(el);
    const name = d.getAttribute("aria-label") ?? el.getAttribute("aria-label") ?? el.textContent;
    if (gist(name) === gist(words)) {
      if (d.getAttribute("aria-describedby") === tip.id) {
        d.removeAttribute("aria-describedby");
      }
    } else if (!d.hasAttribute("aria-describedby")) {
      d.setAttribute("aria-describedby", tip.id);
    }
    return true;
  };
  // A control that changes face while its tip shows, Send to Cancel, takes
  // the tip with it.
  const watch = new MutationObserver(() => {
    if (shownFor !== null && !write(shownFor)) {
      hide();
    }
  });

  const hide = (): void => {
    clearTimeout(timer);
    watch.disconnect();
    if (shownFor !== null) {
      removeAnchorName(shownFor, NAME);
      const d = described(shownFor);
      if (d.getAttribute("aria-describedby") === tip.id) {
        d.removeAttribute("aria-describedby");
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
    if (!write(el)) {
      return;
    }
    addAnchorName(el, NAME);
    shownFor = el;
    watch.observe(el, {
      attributes: true,
      attributeFilter: ["data-cp-tip", "aria-label"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    const d = described(el);
    if (d !== el) {
      watch.observe(d, { attributes: true, attributeFilter: ["aria-label"] });
    }
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
      // The focused control may sit inside the tipped one, as a radio in
      // its label. Safari's arrow move between radios misses :focus-visible;
      // radio-focus marks it, and its capture listener runs before this one
      // because installTooltips installs it first.
      const el = target(e);
      const focused = e.composedPath()[0];
      if (
        el !== null &&
        focused instanceof Element &&
        focused.matches(":focus-visible, [data-cp-focus-ring]")
      ) {
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
 * It installs `@cplieger/ui/radio-focus` under the same signal.
 */
export function installTooltips(options: TooltipOptions = {}): void {
  installRadioFocus(options.signal === undefined ? {} : { signal: options.signal });
  page.install(options);
}
