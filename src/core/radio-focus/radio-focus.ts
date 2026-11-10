/**
 * radio-focus.ts — `installRadioFocus()` puts `data-uip-focus-ring` on a
 * radio the arrow keys moved focus to when the browser does not match
 * `:focus-visible` there, so the stylesheet still rings it. WebKit's radio
 * arrow handler focuses the next radio without a keyboard focus trigger
 * (`RadioInputType::handleKeydownEvent` calls `setFocusedElement` with
 * default options), so Safari drops the ring on every arrow move. Chromium
 * and Firefox match `:focus-visible` there, and the attribute never appears.
 * @module
 */

export interface RadioFocusOptions {
  /** Ends this call's hold on the listeners. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const ATTR = "data-uip-focus-ring";
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

let holds = 0;
let listening: AbortController | null = null;
let ringed: Element | null = null;

function isRadio(el: unknown): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "radio";
}

/** The focused element, inside open shadow roots too. */
function focused(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

function clear(): void {
  ringed?.removeAttribute(ATTR);
  ringed = null;
}

function listen(signal: AbortSignal): void {
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        !ARROWS.has(e.key) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        !isRadio(e.composedPath()[0])
      ) {
        return;
      }
      // The browser moves focus in the keydown's default action, after
      // every listener has run.
      setTimeout(() => {
        const el = focused();
        if (isRadio(el) && el !== ringed && !el.matches(":focus-visible")) {
          clear();
          el.setAttribute(ATTR, "");
          ringed = el;
        }
      });
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
  document.addEventListener("pointerdown", clear, { capture: true, signal });
  signal.addEventListener("abort", clear, { once: true });
}

/**
 * Starts the repair, once for the page however many parts of it call this.
 * The listeners stay until every caller's signal has aborted; a caller with
 * no signal holds them for the page's life.
 */
export function installRadioFocus(options: RadioFocusOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  holds += 1;
  if (listening === null) {
    listening = new AbortController();
    listen(listening.signal);
  }
  signal?.addEventListener(
    "abort",
    () => {
      holds -= 1;
      if (holds === 0) {
        listening?.abort();
        listening = null;
      }
    },
    { once: true },
  );
}
