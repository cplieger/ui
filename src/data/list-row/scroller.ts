/**
 * scroller.ts — where a list scrolls and what of it the reader sees, shared
 * by the held and the virtual list.
 * @module
 * @internal
 */

/** The page's own scroller. */
function pageScroller(): HTMLElement {
  const root = document.scrollingElement;
  return root instanceof HTMLElement ? root : document.documentElement;
}

/** Whether `el` scrolls its own content now. */
function scrolls(el: Element): boolean {
  const y = getComputedStyle(el).overflowY;
  return (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight;
}

/** The nearest box around `el` that scrolls now, else the page. */
export function scrollerOf(el: Element): HTMLElement {
  for (let at = el.parentElement; at !== null; at = at.parentElement) {
    if (scrolls(at)) {
      return at;
    }
  }
  return pageScroller();
}

/** The top and bottom of what `scroller` shows, in viewport px. Its
 *  `scroll-padding-block-start` counts as covered, as by a sticky header. */
export function viewOf(scroller: HTMLElement): { readonly top: number; readonly bottom: number } {
  const pad = Number.parseFloat(getComputedStyle(scroller).scrollPaddingBlockStart) || 0;
  if (scroller === document.scrollingElement) {
    return { top: pad, bottom: innerHeight };
  }
  const top = scroller.getBoundingClientRect().top + scroller.clientTop;
  return { top: top + pad, bottom: top + scroller.clientHeight };
}
