/**
 * scroller.ts — where a list or a feed scrolls and what of it the reader
 * sees, the one helper the feed and the lists' behaviours share.
 * @module
 * @internal
 */

/** A band of the viewport in px; empty when its bottom is at or above its
 *  top. */
export interface Band {
  readonly top: number;
  readonly bottom: number;
}

/** The page's own scroller. */
export function pageScroller(): HTMLElement {
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

/** The part of a scroller's start its `scroll-padding-block-start` covers,
 *  as a sticky header does. */
function padOf(style: CSSStyleDeclaration): number {
  return Number.parseFloat(style.scrollPaddingBlockStart) || 0;
}

/**
 * Where `scroller` shows its content, in px of the layout viewport, its
 * start padding counted as covered. It moves only with the scroller's own
 * box, never with a pinch zoom's pan or the on-screen keyboard, so an
 * offset from its top keeps a place.
 */
export function viewOf(scroller: HTMLElement): Band {
  const pad = padOf(getComputedStyle(scroller));
  if (scroller === document.scrollingElement) {
    return { top: pad, bottom: innerHeight };
  }
  const top = scroller.getBoundingClientRect().top + scroller.clientTop;
  return { top: top + pad, bottom: top + scroller.clientHeight };
}

/**
 * Where `el` can be seen now: the visual viewport, which a pinch zoom or the
 * on-screen keyboard shrinks, cut by every box around `el` that clips, each
 * one's start padding counted as covered.
 */
export function seenOf(el: Element): Band {
  const vv = window.visualViewport;
  const page = pageScroller();
  const root = getComputedStyle(document.documentElement);
  let top = Math.max(vv?.offsetTop ?? 0, padOf(getComputedStyle(page)));
  let bottom = vv === null ? innerHeight : vv.offsetTop + vv.height;
  for (let at = el.parentElement; at !== null && at !== page; at = at.parentElement) {
    const style = getComputedStyle(at);
    // The body's overflow is the viewport's while the root's is visible.
    const propagated = at === document.body && root.overflowY === "visible";
    if (style.display === "contents" || style.overflowY === "visible" || propagated) {
      continue;
    }
    const box = at.getBoundingClientRect().top + at.clientTop;
    top = Math.max(top, box + (style.overflowY === "clip" ? 0 : padOf(style)));
    bottom = Math.min(bottom, box + at.clientHeight);
  }
  return { top, bottom };
}
