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

// Words that differ only in punctuation, spacing or case say the same thing.
function gist(text: string): string {
  return text
    .replaceAll(/[\p{P}\s]+/gu, " ")
    .trim()
    .toLowerCase();
}

/** A computed CSS time, which every engine gives in seconds, in ms. */
function ms(time: string): number {
  return Number.parseFloat(time) * 1000;
}

/** `el` and each of its ancestors in the flat tree, through each shadow
 *  host and each slot an open shadow root exposes: `assignedSlot` is null
 *  for a slot in a closed root, so the walk goes to the light-DOM parent. */
function* lineage(el: Element): Generator<Element> {
  for (let n: Element | null = el; n !== null;) {
    yield n;
    const up: Node | null = n.assignedSlot ?? n.parentNode;
    n = up instanceof ShadowRoot ? up.host : up instanceof Element ? up : null;
  }
}

/** Whether `el` is in the page and seen: rendered, visible, and neither
 *  it nor a flat-tree ancestor at opacity 0. Either check saying unseen
 *  wins. checkVisibility walks the flat tree, closed shadow roots
 *  included; the computed-opacity walk catches WebKit's check reporting
 *  seen, a few times in a hundred, an element an ended `forwards` CSS
 *  animation holds at opacity 0. */
function present(el: HTMLElement): boolean {
  if (!el.isConnected || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
    return false;
  }
  for (const n of lineage(el)) {
    if (Number(getComputedStyle(n).opacity) === 0) {
      return false;
    }
  }
  return true;
}

/** The trees `el` is drawn through that the page can observe: the root
 *  of each element of its lineage(). */
function trees(el: HTMLElement): Set<Node> {
  return new Set(Array.from(lineage(el), (n) => n.getRootNode()));
}

/** How a tip opened, which decides what closes it besides Escape: the
 *  mouse leaving the control and the tip, the focus leaving the control,
 *  or a second tap on the control or a tap elsewhere. */
type Opened = "mouse" | "keys" | "tap";

function listen(signal: AbortSignal, delay: number): void {
  const tip = document.createElement("div");
  tip.className = "cp-tooltip";
  tip.id = "cp-tooltip";
  tip.popover = "manual";
  tip.setAttribute("role", "tooltip");
  // Its transition-duration resolves the grace token, a calc() or var()
  // in it included, which the custom property's own text does not. It is
  // important so a page's reduced-motion reset that zeroes every
  // transition leaves the wait.
  const grace = document.createElement("div");
  grace.hidden = true;
  grace.style.setProperty("transition-duration", "var(--cp-dur-grace)", "important");
  document.body.append(tip, grace);
  let shownFor: HTMLElement | null = null;
  let opened: Opened = "mouse";
  // The control a mouse rests on, waiting out `delay` before its tip shows.
  let resting: HTMLElement | null = null;
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

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

  // The MutationObserver reports, wherever the control is, any change to
  // the nodes, attributes, classes or inline styles of the trees it is
  // drawn through, and `ends` the end of a CSS transition or CSS
  // animation there, a fade to opacity 0 among them. The
  // IntersectionObserver reports a control in the window that layout hides
  // with no such change, as by a stylesheet rule or a pseudo-class. Any
  // other change, a script animation's end among them, waits for the next
  // listener, each of which asks gone().
  const seen = new IntersectionObserver(() => {
    gone();
  });
  const tree = new MutationObserver(() => {
    gone();
  });
  let ends: AbortController | null = null;

  /** Hides the tip, and leaves a control the mouse rests on to show its own. */
  const close = (): void => {
    clearTimeout(leaveTimer);
    watch.disconnect();
    seen.disconnect();
    tree.disconnect();
    ends?.abort();
    ends = null;
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
  const unrest = (): void => {
    clearTimeout(restTimer);
    resting = null;
  };
  const hide = (): void => {
    unrest();
    close();
  };
  const show = (el: HTMLElement, how: Opened): void => {
    unrest();
    if (shownFor !== el) {
      close();
    }
    clearTimeout(leaveTimer);
    // A control not yet seen, as one focused in the task that opens its
    // popover at opacity 0, shows no tip.
    if (!present(el)) {
      return;
    }
    if (!write(el)) {
      return;
    }
    addAnchorName(el, NAME);
    shownFor = el;
    opened = how;
    seen.observe(el);
    // A MutationObserver does not enter a shadow tree, an end event does
    // not leave one, and a shadow root's own observer misses its host's
    // removal, so every tree the control is drawn through, an open root's
    // slot included, is observed and heard. gone() writes nothing while the
    // control stays, and close() disconnects it first, so no write loops.
    ends?.abort();
    ends = new AbortController();
    for (const root of trees(el)) {
      tree.observe(root, { childList: true, subtree: true, attributes: true });
      for (const type of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) {
        root.addEventListener(type, gone, { capture: true, signal: ends.signal });
      }
    }
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
  // A rest of the pointer is a length of time, so a timer measures it. A
  // keyboard tip stays until blur or Escape, so no rest replaces it.
  const rest = (el: HTMLElement): void => {
    if (el === resting || (shownFor !== null && opened === "keys")) {
      return;
    }
    clearTimeout(restTimer);
    resting = el;
    hear(el);
    restTimer = setTimeout(() => {
      show(el, "mouse");
    }, delay);
  };
  /** The mouse is over the shown control or the tip: the tip stays, and no
   *  control the mouse crossed on the way takes it over. */
  const over = (): void => {
    clearTimeout(leaveTimer);
    unrest();
  };
  /** The mouse left the shown control or the tip. Only a tip the mouse
   *  showed hides for it, once the mouse has been over neither for the
   *  grace token's wait (WCAG 1.4.13). */
  const left = (): void => {
    if (shownFor !== null && opened === "mouse") {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(close, ms(getComputedStyle(grace).transitionDuration));
    }
  };
  const gone = (): void => {
    if (shownFor !== null && !present(shownFor)) {
      hide();
    }
  };

  // Inside a stretched row action no boundary event tells its row's parts
  // apart, so the mouse's moves there aim at the part under it.
  let aimed: HTMLElement | null = null;
  const aim = (el: HTMLElement | null): void => {
    if (el === aimed) {
      return;
    }
    if (aimed !== null && aimed === shownFor) {
      left();
    } else if (aimed !== null && aimed === resting) {
      unrest();
    }
    aimed = el;
    if (el !== null && el === shownFor) {
      over();
    } else if (el !== null) {
      rest(el);
    }
  };

  const on = { capture: true, signal };
  const at = (e: Event): EventTarget | undefined => e.composedPath()[0];
  document.addEventListener(
    "pointermove",
    (e) => {
      gone();
      const stretch = stretchOf(e);
      if (e.pointerType === "mouse" && stretch !== null) {
        aim(pointed(stretch, e));
      }
    },
    { ...on, passive: true },
  );
  document.addEventListener(
    "pointerover",
    (e) => {
      gone();
      if (e.pointerType !== "mouse") {
        return;
      }
      const t = at(e);
      if (t instanceof Node && tip.contains(t)) {
        over();
        return;
      }
      const stretch = stretchOf(e);
      if (stretch !== null) {
        aim(pointed(stretch, e));
        return;
      }
      const el = target(e);
      if (el !== null && el === shownFor) {
        over();
      } else if (el !== null) {
        rest(el);
      }
    },
    on,
  );
  // pointerleave fires for each element the mouse leaves, by the engine's
  // own hit test, and does not bubble, so this capture listener hears it
  // for the control and the tip. It does not leave a shadow tree either,
  // so rest() has each shadow root on a control's host chain hear it too.
  const onLeave = (e: Event): void => {
    gone();
    if (!(e instanceof PointerEvent) || e.pointerType !== "mouse") {
      return;
    }
    const t = at(e);
    if (t === resting) {
      unrest();
    }
    if (shownFor !== null && (t === shownFor || t === tip)) {
      left();
    }
    if (t instanceof Element && t.matches(STRETCH)) {
      aim(null);
    }
  };
  document.addEventListener("pointerleave", onLeave, on);
  const heard = new WeakSet<ShadowRoot>();
  const hear = (el: HTMLElement): void => {
    for (let r = el.getRootNode(); r instanceof ShadowRoot; r = r.host.getRootNode()) {
      if (!heard.has(r)) {
        heard.add(r);
        r.addEventListener("pointerleave", onLeave, on);
      }
    }
  };
  document.addEventListener(
    "focusin",
    (e) => {
      gone();
      // The focused control may sit inside the tipped one, as a radio in
      // its label. Safari's arrow move between radios misses :focus-visible;
      // radio-focus marks it, and its capture listener runs before this one
      // because installTooltips installs it first.
      const el = target(e);
      const focused = at(e);
      if (
        el !== null &&
        focused instanceof Element &&
        focused.matches(":focus-visible, [data-cp-focus-ring]")
      ) {
        show(el, "keys");
      }
    },
    on,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      gone();
      // A tap on the tip moves the focus off its toggle in Chromium and
      // Firefox and not in WebKit, so only a tip focus showed hides on blur.
      if (opened === "keys" && target(e) === shownFor) {
        hide();
      }
    },
    on,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      gone();
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
      gone();
      const t = at(e);
      if (t instanceof Node && tip.contains(t)) {
        return;
      }
      const el = target(e);
      if (e.pointerType === "mouse") {
        if (opened !== "keys" || shownFor === null) {
          hide();
        }
        return;
      }
      if (el?.matches('[data-cp-tip-toggle], [aria-disabled="true"]') === true) {
        if (el === shownFor) {
          hide();
        } else {
          show(el, "tap");
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
      grace.remove();
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
