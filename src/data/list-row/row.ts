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

/** Focuses `el`, which takes `tabindex="-1"` until it loses focus when it
 *  takes no focus of its own. */
export function focusOn(el: Element): void {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  if (!el.matches(FOCUSABLE)) {
    el.tabIndex = -1;
    el.addEventListener(
      "blur",
      () => {
        el.removeAttribute("tabindex");
      },
      { once: true },
    );
  }
  el.focus();
}
