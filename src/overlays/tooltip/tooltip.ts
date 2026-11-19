/**
 * tooltip.ts — a control's short name or hint from its `data-cp-tip`, in one
 * anchor-placed `popover="manual"`. A mouse waits half a second, focus shows
 * it at once, and a finger toggles it on `data-cp-tip-toggle` or
 * `aria-disabled="true"`. An icon-only control keeps its `aria-label`, and a
 * tip that says more than that label describes the control.
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
const STRETCH = "[data-cp-stretch]";
const NAME = "--cp-tip-anchor";

/** What a screen reader focuses for `el`: a tipped label's control. */
function described(el: HTMLElement): HTMLElement {
  return el instanceof HTMLLabelElement ? (el.control ?? el) : el;
}

function target(e: Event): HTMLElement | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t.closest<HTMLElement>(TIP) : null;
}

/** The stretched row action (`@cplieger/ui/list-row`) `e` lands on, whose
 *  box covers its row's other parts. */
function stretchOf(e: Event): Element | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t.closest(STRETCH) : null;
}

/** The tipped element a mouse in `stretch` points at: a part of its row
 *  under the action's box, found by place, else the action's own tip. */
function pointed(stretch: Element, e: PointerEvent): HTMLElement | null {
  const row = stretch.closest("[data-cp-row-action]");
  const part = document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => !stretch.contains(el))
    ?.closest<HTMLElement>(TIP);
  return row !== null && part != null && row.contains(part) ? part : target(e);
}

function within(box: DOMRect, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
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
  // Only a tip the mouse showed hides as the mouse leaves (WCAG 1.4.13).
  let byMouse = false;
  // The mouse is in the gap between the control and the tip it showed.
  let crossing = false;
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
    crossing = false;
    if (tip.matches(":popover-open")) {
      tip.hidePopover();
    }
  };
  const show = (el: HTMLElement, mouse: boolean): void => {
    clearTimeout(timer);
    if (shownFor !== el) {
      hide();
    }
    if (!write(el)) {
      return;
    }
    addAnchorName(el, NAME);
    shownFor = el;
    byMouse = mouse;
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

  // Inside a stretched row action no pointerover tells its row's parts
  // apart, so the mouse's moves there aim at the part under it.
  let aimed: HTMLElement | null = null;

  /** Whether (x, y) is in the strip between the shown control and the tip,
   *  on whichever side the tip sits. */
  const between = (x: number, y: number): boolean => {
    if (shownFor === null) {
      return false;
    }
    const a = shownFor.getBoundingClientRect();
    const b = tip.getBoundingClientRect();
    return (
      x >= Math.min(a.left, b.left) &&
      x <= Math.max(a.right, b.right) &&
      y >= Math.min(a.bottom, b.bottom) &&
      y <= Math.max(a.top, b.top)
    );
  };
  /** The mouse leaving the control or the tip for where `e` puts it: a tip
   *  it showed stays while it crosses the gap and hides anywhere else. The
   *  gap is measured, not a hit-testable layer, so a press there reaches
   *  what lies under it. True while the mouse is in the gap. */
  const leave = (e: PointerEvent): boolean => {
    if (shownFor === null || !byMouse) {
      return false;
    }
    const { clientX: x, clientY: y } = e;
    const offPage = e.type === "pointerout" && e.relatedTarget === null;
    if (!offPage) {
      const onEither =
        within(tip.getBoundingClientRect(), x, y) || within(shownFor.getBoundingClientRect(), x, y);
      crossing = !onEither && between(x, y);
      if (onEither || crossing) {
        return crossing;
      }
    }
    aimed = null;
    hide();
    return false;
  };
  const aim = (e: PointerEvent, el: HTMLElement | null): void => {
    if (el === aimed) {
      return;
    }
    if (aimed !== null && aimed === shownFor && leave(e)) {
      return;
    }
    clearTimeout(timer);
    aimed = el;
    if (el !== null && el !== shownFor) {
      timer = setTimeout(() => {
        show(el, true);
      }, delay);
    }
  };

  const on = { capture: true, signal };
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") {
        return;
      }
      if (crossing && leave(e)) {
        return;
      }
      const stretch = stretchOf(e);
      if (stretch !== null) {
        aim(e, pointed(stretch, e));
      }
    },
    { ...on, passive: true },
  );
  document.addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType !== "mouse") {
        return;
      }
      const at = e.composedPath()[0];
      if (at instanceof Node && tip.contains(at)) {
        crossing = false;
        return;
      }
      const stretch = stretchOf(e);
      if (stretch !== null) {
        aim(e, pointed(stretch, e));
        return;
      }
      const el = target(e);
      if (el === shownFor) {
        crossing = false;
      }
      if (el === null || el === shownFor) {
        return;
      }
      clearTimeout(timer);
      // A rest of the pointer is a length of time, so a timer measures it.
      timer = setTimeout(() => {
        show(el, true);
      }, delay);
    },
    on,
  );
  // A finger leaves its target after every tap, so only a mouse's leaving
  // hides a tip, and a mouse may move onto the tip it shows.
  const into = (to: EventTarget | null, el: Element | null): boolean =>
    to instanceof Node && (el?.contains(to) === true || (shownFor !== null && tip.contains(to)));
  document.addEventListener(
    "pointerout",
    (e) => {
      if (e.pointerType !== "mouse") {
        return;
      }
      const to = e.relatedTarget;
      const from = e.composedPath()[0];
      if (from instanceof Node && tip.contains(from)) {
        if (!(to instanceof Node && tip.contains(to))) {
          leave(e);
        }
        return;
      }
      if (crossing && to === null) {
        leave(e);
        return;
      }
      const stretch = stretchOf(e);
      if (stretch !== null) {
        if (!into(to, stretch)) {
          aim(e, null);
        }
        return;
      }
      const el = target(e);
      if (el !== null && !into(to, el)) {
        if (el === shownFor) {
          leave(e);
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
        show(el, false);
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
      // Escape also cancels a tip still waiting on the mouse's rest.
      if (e.key === "Escape") {
        hide();
      }
    },
    on,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      const at = e.composedPath()[0];
      if (at instanceof Node && tip.contains(at)) {
        return;
      }
      const el = target(e);
      if (e.pointerType === "mouse") {
        hide();
        return;
      }
      if (el?.matches('[data-cp-tip-toggle], [aria-disabled="true"]') === true) {
        if (el === shownFor) {
          hide();
        } else {
          show(el, false);
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
