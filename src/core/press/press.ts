/**
 * press.ts — `installPress()` puts `data-cp-pressed` on the button, link or
 * checkbox label a mouse, a finger, a pen or a key is pressing, so a
 * stylesheet draws a press that shows on touch too. `:active` cannot: iOS
 * Safari applies it only under a touchstart listener, and a quick tap holds
 * it for a frame or two.
 * @module
 */

import { shared } from "../lifetime/lifetime.js";

export interface PressOptions {
  /** Ends this call's hold on the listeners. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const ATTR = "data-cp-pressed";

/** What Space activates; Enter activates the same and links. */
const SPACE = [
  'button:not(:disabled, [aria-disabled="true"])',
  '[role="button"]:not([aria-disabled="true"])',
  'summary:not([aria-disabled="true"])',
].join(", ");
const ENTER = `${SPACE}, a[href]:not([aria-disabled="true"])`;
const TOGGLE = 'input:is([type="checkbox"], [type="radio"]):not(:disabled)';
/** A checkbox or radio presses through the label that wraps it. */
const POINTER = `${ENTER}, label:has(${TOGGLE})`;

/** Android shows a touch press after this long (ViewConfiguration.TAP_TIMEOUT),
 *  so a scroll that starts on a control cancels before anything shows. */
const TOUCH_DELAY = 100;
/** A touch that travels further than this is a scroll or a drag
 *  (ViewConfiguration.TOUCH_SLOP is 8dp). */
const SLOP = 8;
/** Blink holds `:active` this long after a tap (kMinimumActiveInterval in
 *  event_handler.cc), so a quick tap still shows its whole press. */
const MIN_HOLD = 150;

const KEY = "key";

type Timer = ReturnType<typeof setTimeout>;

/** The press in progress. */
interface Held {
  readonly el: Element;
  /** The pointer's id, or KEY for Space and Enter. */
  readonly id: number | typeof KEY;
  readonly x: number;
  readonly y: number;
  /** The touch delay, running until the press shows. */
  timer: Timer | undefined;
  shown: boolean;
  /** A mouse dragged it off its element, which hides it until it comes back. */
  away: boolean;
}

/** An element whose press shows. Its timer runs MIN_HOLD from when it showed. */
interface Showing {
  timer: Timer | undefined;
  down: boolean;
}

function origin(e: Event): Element | null {
  const t = e.composedPath()[0];
  return t instanceof Element ? t : null;
}

/** The element a key press activates, or null for a key that presses nothing. */
function keyTarget(e: KeyboardEvent): Element | null {
  if (e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) {
    return null;
  }
  const t = origin(e);
  if (t === null) {
    return null;
  }
  if (e.key === " ") {
    return t.matches(TOGGLE) ? t.closest("label") : t.matches(SPACE) ? t : null;
  }
  return e.key === "Enter" && t.matches(ENTER) ? t : null;
}

/** Starts the document's listeners; the returned function removes them, every
 *  timer and every attribute they set. */
function listen(): () => void {
  const showing = new Map<Element, Showing>();
  let held: Held | null = null;

  const hide = (el: Element): void => {
    const entry = showing.get(el);
    if (entry !== undefined) {
      clearTimeout(entry.timer);
      showing.delete(el);
      el.removeAttribute(ATTR);
    }
  };
  const show = (el: Element): void => {
    clearTimeout(showing.get(el)?.timer);
    const entry: Showing = { timer: undefined, down: true };
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (!entry.down) {
        hide(el);
      }
    }, MIN_HOLD);
    showing.set(el, entry);
    el.setAttribute(ATTR, "");
  };

  const cancel = (): void => {
    const h = held;
    held = null;
    if (h !== null) {
      clearTimeout(h.timer);
      if (h.shown && !h.away) {
        hide(h.el);
      }
    }
  };
  const begin = (el: Element, id: Held["id"], x: number, y: number, delay: number): void => {
    cancel();
    const h: Held = { el, id, x, y, timer: undefined, shown: false, away: false };
    held = h;
    const reveal = (): void => {
      h.timer = undefined;
      h.shown = true;
      show(el);
    };
    if (delay > 0) {
      h.timer = setTimeout(reveal, delay);
    } else {
      reveal();
    }
  };
  /** The press ended as a press: it shows, if a quick tap never showed it,
   *  and hides once it has shown for MIN_HOLD. */
  const finish = (): void => {
    const h = held;
    held = null;
    if (h === null) {
      return;
    }
    clearTimeout(h.timer);
    if (!h.shown) {
      show(h.el);
    }
    const entry = showing.get(h.el);
    if (entry !== undefined) {
      entry.down = false;
      if (entry.timer === undefined) {
        hide(h.el);
      }
    }
  };
  const heldBy = (e: PointerEvent): Held | null => (held?.id === e.pointerId ? held : null);

  const listening = new AbortController();
  const opts = { capture: true, passive: true, signal: listening.signal };
  const on = <K extends keyof DocumentEventMap>(
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
  ): void => {
    document.addEventListener(type, fn, opts);
  };
  on("pointerdown", (e) => {
    const el = e.isPrimary && e.button === 0 ? origin(e)?.closest(POINTER) : null;
    if (el !== null && el !== undefined) {
      begin(el, e.pointerId, e.clientX, e.clientY, e.pointerType === "mouse" ? 0 : TOUCH_DELAY);
    }
  });
  on("pointermove", (e) => {
    const h = heldBy(e);
    if (
      h !== null &&
      e.pointerType !== "mouse" &&
      Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP
    ) {
      cancel();
    }
  });
  on("pointerup", (e) => {
    if (heldBy(e) !== null) {
      finish();
    }
  });
  on("pointercancel", (e) => {
    if (heldBy(e) !== null) {
      cancel();
    }
  });
  on("pointerout", (e) => {
    const h = heldBy(e);
    const to = e.relatedTarget;
    if (
      h?.shown === true &&
      !h.away &&
      e.pointerType === "mouse" &&
      !(to instanceof Node && h.el.contains(to))
    ) {
      h.away = true;
      hide(h.el);
    }
  });
  on("pointerover", (e) => {
    const h = heldBy(e);
    if (h?.away === true && e.composedPath().includes(h.el)) {
      h.away = false;
      show(h.el);
    }
  });
  on("keydown", (e) => {
    const el = keyTarget(e);
    if (el !== null) {
      begin(el, KEY, 0, 0, 0);
      if (e.key === "Enter") {
        finish();
      }
    }
  });
  on("keyup", (e) => {
    if (e.key === " " && held?.id === KEY) {
      finish();
    }
  });
  on("focusout", () => {
    if (held?.id === KEY) {
      cancel();
    }
  });
  // A window that loses focus mid-press may never see its pointerup. Not
  // in capture, where every element's blur passes through the window.
  window.addEventListener("blur", cancel, { passive: true, signal: listening.signal });

  return () => {
    listening.abort();
    clearTimeout(held?.timer);
    held = null;
    for (const el of [...showing.keys()]) {
      hide(el);
    }
  };
}

const page = shared((signal) => {
  signal.addEventListener("abort", listen(), { once: true });
});

/** Set `data-cp-pressed` on whatever is being pressed, by any input. Calls
 *  share one set of listeners, which stays until every call's signal has
 *  aborted and then clears every press it set. */
export function installPress(opts?: PressOptions): void {
  page.install(opts);
}
