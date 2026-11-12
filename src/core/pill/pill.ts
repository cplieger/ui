/**
 * pill.ts — `enhancePill()` slides one raised pill under the chosen segment
 * of a `.cp-segmented`, or the selected tab of a `.cp-tabs`, on a spring,
 * instead of each choice filling on its own. The pill lands without motion
 * when the page first draws and when the group resizes, and slides when the
 * choice changes.
 * @module
 */

import { until } from "../lifetime/lifetime.js";

export interface PillOptions {
  /** Removes the pill and its listeners. */
  readonly signal?: AbortSignal;
}

const STILL = "data-cp-still";
const TAB = ':scope > [role="tab"]';

const isTablist = (group: HTMLElement): boolean => group.getAttribute("role") === "tablist";

/** The selected tab or the label of the checked radio, or null when none is. */
function chosen(group: HTMLElement): HTMLElement | null {
  return isTablist(group)
    ? group.querySelector<HTMLElement>(`${TAB}[aria-selected="true"]`)
    : group.querySelector<HTMLElement>(":scope > label:has(> input:checked)");
}

/**
 * Adds the pill to `group`, a `.cp-segmented` or a `.cp-tabs` tablist, once.
 * It follows a radio's `change` and a tab's `aria-selected`, whatever script
 * sets it.
 */
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
  const selection = new MutationObserver(() => {
    place(false);
  });
  if (isTablist(group)) {
    // A strip held to the width it is given can keep its size while a tab
    // grows, as when its font arrives.
    for (const tab of group.querySelectorAll(TAB)) {
      resize.observe(tab);
    }
    selection.observe(group, { subtree: true, attributeFilter: ["aria-selected"] });
  } else {
    group.addEventListener(
      "change",
      () => {
        place(false);
      },
      listen,
    );
  }
  place(true);

  signal?.addEventListener(
    "abort",
    () => {
      resize.disconnect();
      selection.disconnect();
      cancelAnimationFrame(frame);
      pill.remove();
    },
    { once: true },
  );
}
