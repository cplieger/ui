/**
 * pill.ts — `enhancePill()` slides one raised pill under the chosen segment
 * of a `.cp-segmented`, on a spring, instead of each segment filling on its
 * own. The pill lands without motion when the page first draws and when the
 * group resizes, and slides when the choice changes.
 * @module
 */

import { until } from "../lifetime/lifetime.js";

export interface PillOptions {
  /** Removes the pill and its listeners. */
  readonly signal?: AbortSignal;
}

const STILL = "data-cp-still";

/** The label of the checked radio, or null when none is. */
function chosen(group: HTMLElement): HTMLElement | null {
  return group.querySelector<HTMLElement>(":scope > label:has(> input:checked)");
}

/** Adds the pill to `group`, a `.cp-segmented`, once. */
export function enhancePill(group: HTMLElement, options: PillOptions = {}): void {
  const { signal } = options;
  const listen = until(signal);
  if (signal?.aborted === true || group.querySelector(":scope > .cp-pill") !== null) {
    return;
  }
  const pill = document.createElement("span");
  pill.className = "cp-pill";
  pill.setAttribute("aria-hidden", "true");
  group.prepend(pill);

  let frame = 0;
  const place = (still: boolean): void => {
    const c = chosen(group);
    pill.hidden = c === null;
    if (c === null) {
      return;
    }
    if (still) {
      pill.setAttribute(STILL, "");
    }
    pill.style.setProperty("--cp-pill-x", `${String(c.offsetLeft)}px`);
    pill.style.setProperty("--cp-pill-y", `${String(c.offsetTop)}px`);
    pill.style.setProperty("--cp-pill-w", `${String(c.offsetWidth)}px`);
    pill.style.setProperty("--cp-pill-h", `${String(c.offsetHeight)}px`);
    if (still) {
      cancelAnimationFrame(frame);
      // Two frames: the still position paints before the transition returns.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          pill.removeAttribute(STILL);
        });
      });
    }
  };

  const resize = new ResizeObserver(() => {
    place(true);
  });
  resize.observe(group);
  group.addEventListener(
    "change",
    () => {
      place(false);
    },
    listen,
  );
  place(true);

  signal?.addEventListener(
    "abort",
    () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      pill.remove();
    },
    { once: true },
  );
}
