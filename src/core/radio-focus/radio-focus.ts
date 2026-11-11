/**
 * radio-focus.ts — `installRadioFocus()` puts `data-cp-focus-ring` on a
 * radio the arrow keys moved focus to when the browser does not match
 * `:focus-visible` there, so the stylesheet still rings it. WebKit's radio
 * arrow handler focuses the next radio without a keyboard focus trigger
 * (`RadioInputType::handleKeydownEvent` calls `setFocusedElement` with
 * default options), so Safari drops the ring on every arrow move. Chromium
 * and Firefox match `:focus-visible` there, and the attribute never appears.
 * @module
 */

import { shared } from "../lifetime/lifetime.js";

export interface RadioFocusOptions {
  /** Ends this call's hold on the listeners. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const ATTR = "data-cp-focus-ring";
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

let ringed: Element | null = null;

function isRadio(el: unknown): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "radio";
}

function clear(): void {
  ringed?.removeAttribute(ATTR);
  ringed = null;
}

function listen(signal: AbortSignal): void {
  // Set by an arrow keydown on a radio and read by the focusin its default
  // action fires, so the mark lands in the same task: a timer would wait
  // behind a busy page's other tasks while the radio sits unringed.
  let arrow = false;
  document.addEventListener(
    "keydown",
    (e) => {
      arrow =
        ARROWS.has(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && isRadio(e.composedPath()[0]);
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.composedPath()[0];
      if (arrow && isRadio(el) && el !== ringed && !el.matches(":focus-visible")) {
        clear();
        el.setAttribute(ATTR, "");
        ringed = el;
      }
      arrow = false;
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "keyup",
    () => {
      arrow = false;
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "focusout",
    (e) => {
      if (e.composedPath()[0] === ringed) {
        clear();
      }
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "pointerdown",
    () => {
      arrow = false;
      clear();
    },
    { capture: true, signal },
  );
  signal.addEventListener("abort", clear, { once: true });
}

const page = shared((signal) => {
  listen(signal);
});

/**
 * Starts the repair, once for the page however many parts of it call this.
 * The listeners stay until every caller's signal has aborted; a caller with
 * no signal holds them for the page's life.
 */
export function installRadioFocus(options: RadioFocusOptions = {}): void {
  page.install(options);
}
