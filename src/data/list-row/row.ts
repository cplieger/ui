/**
 * row.ts — what the list modules share about a row: which element an item
 * stands for, and where focus lands on a row a module placed.
 * @module
 * @internal
 */

const FOCUSABLE =
  ':is(a[href], button, input, select, textarea, [tabindex]):not(:disabled, input[type="hidden"])';

/** The row `el` stands for: an item's `.cp-list-row`, else `el`. */
export function rowOf(el: Element): Element {
  return el instanceof HTMLLIElement ? (el.querySelector(":scope > .cp-list-row") ?? el) : el;
}

// A control the page does not render, such as one in a closed <details>
// or under [hidden], ignores focus(), so focus would drop to the page.
const takesFocus = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement && el.matches(FOCUSABLE) && el.checkVisibility();

/** The first part of `el` that takes focus, `el` itself first. */
function focusableIn(el: Element): HTMLElement | null {
  if (takesFocus(el)) {
    return el;
  }
  return [...el.querySelectorAll(FOCUSABLE)].find(takesFocus) ?? null;
}

/** Where focus lands on `item`, a row a list module placed: a feed's
 *  entry, read whole, takes it itself; a row its first part that takes
 *  focus, such as its title link, else the row. */
export function landing(item: Element): Element {
  const row = rowOf(item);
  return row.matches(".cp-feed-entry") ? row : (focusableIn(row) ?? row);
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
