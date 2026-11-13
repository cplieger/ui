/**
 * row.ts — what the list modules share about a row: which element an item
 * stands for, and how focus lands on a row that takes none of its own.
 * @module
 * @internal
 */

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

/** The row `el` stands for: an item's `.cp-list-row`, else `el`. */
export function rowOf(el: Element): Element {
  return el instanceof HTMLLIElement ? (el.querySelector(":scope > .cp-list-row") ?? el) : el;
}

/** The first part of `el` that takes focus, `el` itself first. */
export function focusableIn(el: Element): HTMLElement | null {
  if (el instanceof HTMLElement && el.matches(FOCUSABLE)) {
    return el;
  }
  return el.querySelector<HTMLElement>(FOCUSABLE);
}

/** Focuses `el`, which takes `tabindex="-1"` until it loses focus when it
 *  takes no focus of its own; says whether it gave `el` that tabindex. */
export function focusOn(el: Element, options?: FocusOptions): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  const give = !el.matches(FOCUSABLE);
  if (give) {
    el.tabIndex = -1;
    el.addEventListener(
      "blur",
      () => {
        el.removeAttribute("tabindex");
      },
      { once: true },
    );
  }
  el.focus(options);
  return give;
}
