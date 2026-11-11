/**
 * roll.ts — `roll()` changes the text of a `.cp-roll` window by sliding the
 * old line out and the new one in, while the window's width glides to the
 * new line's. Words roll up on a spring; a number rolls up when it grows and
 * down when it shrinks, and eases out. Under reduced motion the text changes
 * at once.
 * @module
 */

import { reducedMotion } from "../lifetime/lifetime.js";

export interface RollOptions {
  /** Roll down instead of up, as a number that shrinks does. Default false. */
  readonly down?: boolean;
}

/** The spring every word roll rides, as css/system's --cp-ease-spring. */
const SPRING =
  "linear(0, 0.052, 0.18, 0.347, 0.526, 0.694, 0.839, 0.954, 1.038, 1.091, 1.119, 1.126, 1.119, 1.103, 1.081, 1.059, 1.038, 1.019, 1.005, 0.995, 0.988, 0.985, 0.984, 0.985, 0.987, 0.99, 0.993, 0.995, 0.998, 0.999, 1.001, 1.002, 1)";
const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";

/** The line on show: the window's last child, made from its text if bare. */
function current(host: HTMLElement): HTMLElement {
  const last = host.lastElementChild;
  if (last instanceof HTMLElement) {
    return last;
  }
  const line = document.createElement("span");
  line.textContent = host.textContent;
  host.replaceChildren(line);
  return line;
}

/** The text a roll last settled on or is rolling to. */
export function rollText(host: HTMLElement): string {
  return current(host).textContent;
}

/** `line`'s laid-out width. A pressed button scales to 97%, and a box
 *  measured through that transform would hold its words 3% too narrow. */
function widthOf(line: Element): number {
  const width = Number.parseFloat(getComputedStyle(line).inlineSize);
  return Number.isNaN(width) ? 0 : width;
}

/** The width `text` would take in the window, in pixels, unscaled by any
 *  transform on the page. */
export function measureRoll(host: HTMLElement, text: string): number {
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.visibility = "hidden";
  host.append(probe);
  const width = widthOf(probe);
  probe.remove();
  return width;
}

/**
 * Rolls `host`, a `.cp-roll`, to `text`. A roll that starts while another
 * runs takes over from the line that one was rolling to, so two lines never
 * show side by side. Rolling to the text on show does nothing.
 */
export function roll(host: HTMLElement, text: string, options: RollOptions = {}): void {
  const from = current(host);
  if (from.textContent === text) {
    return;
  }
  for (const stale of [...host.children]) {
    if (stale !== from) {
      stale.remove();
    }
  }
  for (const a of from.getAnimations()) {
    a.cancel();
  }
  const to = document.createElement("span");
  to.textContent = text;
  if (reducedMotion() || !host.isConnected) {
    host.replaceChildren(to);
    host.style.removeProperty("inline-size");
    return;
  }
  const start = widthOf(from);
  host.style.inlineSize = `${String(start)}px`;
  host.append(to);
  const end = widthOf(to);
  // The width transition needs the start width painted first.
  host.getBoundingClientRect();
  host.style.inlineSize = `${String(end)}px`;

  const number = host.dataset["kind"] === "number";
  const timing = { duration: number ? 260 : 360, easing: number ? EASE_OUT : SPRING };
  const sign = options.down === true ? -1 : 1;
  from.animate(
    [
      { translate: "0 0", opacity: 1 },
      { translate: `0 ${String(-110 * sign)}%`, opacity: 0 },
    ],
    { ...timing, fill: "forwards" },
  );
  to.animate(
    [
      { translate: `0 ${String(110 * sign)}%`, opacity: 0 },
      { translate: "0 0", opacity: 1 },
    ],
    timing,
  ).finished.then(
    () => {
      if (host.lastElementChild === to) {
        from.remove();
      }
    },
    // A later roll cancelled this one and has already removed `from`.
    () => undefined,
  );
}
