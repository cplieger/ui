/**
 * pill.ts — `enhancePill()` slides one raised pill under the chosen segment
 * of a `.cp-segmented`, the selected tab of a `.cp-tabs` tablist or the
 * current link of a `nav.cp-tabs`, on a spring, instead of each choice
 * filling on its own. The pill lands without motion when the page first
 * draws and when the group resizes, and slides when the choice changes.
 * @module
 */

import { until } from "../lifetime/lifetime.js";

export interface PillOptions {
  /** Removes the pill and its listeners. */
  readonly signal?: AbortSignal;
}

const STILL = "data-cp-still";
const TAB = ':scope > [role="tab"]';
const LINK = ":scope > a";

type Kind = "tab" | "link" | "radio";

const kindOf = (group: HTMLElement): Kind => {
  if (group.getAttribute("role") === "tablist") {
    return "tab";
  }
  return group.querySelector(LINK) === null ? "radio" : "link";
};

/** The selected tab, the current link or the label of the checked radio,
 *  or null when none is. */
function chosen(group: HTMLElement, kind: Kind): HTMLElement | null {
  switch (kind) {
    case "tab":
      return group.querySelector<HTMLElement>(`${TAB}[aria-selected="true"]`);
    case "link":
      return group.querySelector<HTMLElement>(`${LINK}[aria-current="page"]`);
    case "radio":
      return group.querySelector<HTMLElement>(":scope > label:has(> input:checked)");
  }
}

/**
 * Adds the pill to `group`, a `.cp-segmented`, a `.cp-tabs` tablist or a
 * `nav.cp-tabs` of links, once. It follows a radio's `change`, a tab's
 * `aria-selected` and a link's `aria-current`, whatever script sets it.
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

  const kind = kindOf(group);
  let frame = 0;
  const place = (still: boolean): void => {
    const c = chosen(group, kind);
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
  if (kind !== "radio") {
    // A strip held to the width it is given can keep its size while a tab
    // grows, as when its font arrives.
    for (const tab of group.querySelectorAll(kind === "tab" ? TAB : LINK)) {
      resize.observe(tab);
    }
    selection.observe(group, {
      subtree: true,
      attributeFilter: [kind === "tab" ? "aria-selected" : "aria-current"],
    });
  } else {
    // Listened on the document, after the page's own listeners: a change
    // elsewhere may clear the choice, as a typed date clears a date range's
    // quick range, and setting `checked` fires nothing.
    group.ownerDocument.addEventListener(
      "change",
      () => {
        place(false);
      },
      listen,
    );
    // A reset fires before the controls reset
    // (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#concept-form-reset).
    group.ownerDocument.addEventListener(
      "reset",
      () => {
        setTimeout(() => {
          place(false);
        }, 0);
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
