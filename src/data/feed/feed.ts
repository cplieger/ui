/**
 * feed.ts — `enhanceFeed()` keeps an open conversation's feed at its newest
 * entry while the reader is there, and keeps their place once they have
 * scrolled up: entries arriving then are counted on the New messages button
 * instead. It keeps the pinned foot's composer clear of the entries and of
 * the on-screen keyboard.
 * @module
 */

import { reducedMotion, until, whenAborted } from "../../core/lifetime/lifetime.js";
import { roll } from "../../core/roll/roll.js";
import { announce } from "../../feedback/announce/announce.js";

export interface FeedOptions {
  /** The `.cp-feed-foot` pinned under the feed. Its height is kept as the
   *  scroller's end scroll padding, and the part of it the on-screen
   *  keyboard covers as its `--cp-keyboard-inset`. */
  readonly foot?: HTMLElement;
  /** The `.cp-feed-jump` button, `hidden` until entries arrive while the
   *  reader is scrolled up. Its words go in its `.cp-roll`, else they are
   *  its text. */
  readonly jump?: HTMLButtonElement;
  /** The jump's words for `n` unseen entries. Default: "1 new message",
   *  "3 new messages". */
  readonly words?: (n: number) => string;
  /** Removes the listeners and observers, hides the jump and clears every
   *  property the module set. */
  readonly signal?: AbortSignal;
}

export interface Feed {
  /** Scrolls to the newest entry at once and clears the unseen count. */
  toNewest(): void;
  /** The entries that arrived since the reader last saw the end. */
  readonly unseen: number;
}

/** How near the end, in rem, still counts as at the end. */
const END_REM = 2;
const INSET = "--cp-keyboard-inset";

const defaultWords = (n: number): string =>
  n === 1 ? "1 new message" : `${String(n)} new messages`;

const isEntry = (n: Node | undefined): n is HTMLElement =>
  n instanceof HTMLElement &&
  n.classList.contains("cp-feed-entry") &&
  !n.hasAttribute("data-skeleton");

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function pageScroller(): HTMLElement {
  const root = document.scrollingElement;
  return root instanceof HTMLElement ? root : document.documentElement;
}

/** The nearest box around `feed` that scrolls it now, else the page. */
function scrollerOf(feed: Element): HTMLElement {
  for (let el = feed.parentElement; el !== null; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return pageScroller();
}

/** The top of the part of the viewport `scroller` shows. */
function topOf(scroller: HTMLElement): number {
  return scroller === document.scrollingElement
    ? 0
    : scroller.getBoundingClientRect().top + scroller.clientTop;
}

/**
 * Wires `feed`, a `.cp-feed` whose `li.cp-feed-entry` items run oldest
 * first, and scrolls it to its newest entry at once. The feed's scroller is
 * the nearest box around it that scrolls, found again whenever the feed
 * resizes or a box around it scrolls, so moving the feed into a dialog is
 * followed. An entry the app adds with `data-own`, and anything added while
 * the feed is `aria-busy="true"` or held no entry, scrolls to the newest.
 */
export function enhanceFeed(
  feed: HTMLOListElement | HTMLUListElement,
  options: FeedOptions = {},
): Feed {
  const { foot, jump, signal } = options;
  let unseen = 0;
  if (signal?.aborted === true) {
    return { toNewest: () => undefined, unseen };
  }
  const words = options.words ?? defaultWords;
  const listen = until(signal);
  const vv = window.visualViewport;

  let scroller = scrollerOf(feed);
  /** The scroller's own inline scroll padding, put back when it changes. */
  let padBefore = scroller.style.scrollPaddingBlockEnd;
  let atEnd = true;
  /** A smooth scroll to the newest is under way, so the scrolls it passes
   *  through are not the reader leaving the end. */
  let going = false;
  /** The first child showing at the scroller's top, and its offset there. */
  let anchor: { readonly el: Element; readonly off: number } | null = null;
  const focusable = new Set<HTMLElement>();

  // Fires after layout and before paint, so a kept place never flickers.
  const resize = new ResizeObserver(() => {
    pad();
    keep();
  });
  resize.observe(feed);
  resize.observe(scroller);
  if (foot !== undefined) {
    resize.observe(foot);
  }

  const newest = (): HTMLElement | undefined => [...feed.children].filter(isEntry).at(-1);

  const record = (): void => {
    const top = topOf(scroller);
    for (const el of feed.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top) {
        anchor = { el, off: r.top - top };
        return;
      }
    }
    anchor = null;
  };

  const pad = (): void => {
    if (foot !== undefined) {
      scroller.style.scrollPaddingBlockEnd = `${String(foot.offsetHeight)}px`;
    }
  };

  const adopt = (): void => {
    const now = scrollerOf(feed);
    if (now === scroller) {
      return;
    }
    if (foot !== undefined) {
      scroller.style.scrollPaddingBlockEnd = padBefore;
    }
    resize.unobserve(scroller);
    scroller = now;
    padBefore = now.style.scrollPaddingBlockEnd;
    // Observing inside the observer's own callback raises "ResizeObserver
    // loop completed", so the new scroller is watched from the next frame.
    requestAnimationFrame(() => {
      if (scroller === now && signal?.aborted !== true) {
        resize.observe(now);
      }
    });
    pad();
  };

  const focusNewest = (): void => {
    const el = newest() ?? feed;
    if (!el.hasAttribute("tabindex")) {
      el.tabIndex = -1;
      focusable.add(el);
    }
    el.focus({ preventScroll: true });
  };

  // Hiding the jump while it has focus would drop focus to the page.
  const clear = (): void => {
    unseen = 0;
    if (jump !== undefined && !jump.hidden) {
      const had = jump.contains(document.activeElement);
      jump.hidden = true;
      if (had) {
        focusNewest();
      }
    }
  };

  const show = (n: number): void => {
    unseen = n;
    if (jump === undefined) {
      return;
    }
    const text = words(n);
    const host = jump.querySelector<HTMLElement>(".cp-roll");
    if (jump.hidden || host === null) {
      (host ?? jump).textContent = text;
      jump.hidden = false;
    } else {
      roll(host, text);
    }
    announce(text);
  };

  const toEnd = (smooth: boolean): void => {
    atEnd = true;
    going = smooth;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    clear();
  };

  // After the feed, the foot or the scroller changed size: the reader at
  // the end stays there, and one scrolled up keeps the child they were on
  // where it was.
  const keep = (): void => {
    adopt();
    if (atEnd) {
      toEnd(going);
      return;
    }
    if (anchor?.el.parentElement !== feed) {
      record();
      return;
    }
    const by = anchor.el.getBoundingClientRect().top - topOf(scroller) - anchor.off;
    if (by !== 0) {
      scroller.scrollBy({ top: by, behavior: "instant" });
    }
  };

  const read = (): void => {
    const s = scroller;
    const end = s.scrollHeight - s.scrollTop - s.clientHeight <= END_REM * remPx();
    if (going && !end) {
      return;
    }
    going = false;
    atEnd = end;
    record();
    if (end) {
      clear();
    }
  };

  // Its offset in CSS px holds only at a scale of 1: a pinch zoom also
  // shrinks the visual viewport, and is not a keyboard.
  const inset = (): void => {
    if (foot === undefined || vv === null) {
      return;
    }
    const bottom =
      scroller === document.scrollingElement
        ? innerHeight
        : scroller.getBoundingClientRect().bottom;
    const covered =
      vv.scale === 1 ? Math.max(0, Math.min(bottom, innerHeight) - (vv.offsetTop + vv.height)) : 0;
    if (covered > 0) {
      foot.style.setProperty(INSET, `${String(covered)}px`);
    } else {
      foot.style.removeProperty(INSET);
    }
  };

  const added = new MutationObserver((records) => {
    const fresh = new Set<Node>();
    let busyChanged = false;
    for (const r of records) {
      busyChanged ||= r.type === "attributes";
      for (const n of r.addedNodes) {
        fresh.add(n);
      }
    }
    const kids = [...feed.children];
    const had = kids.some((k) => isEntry(k) && !fresh.has(k));
    // The arrivals are the added children at the feed's end, so entries
    // shown older, at its start, are never counted as new.
    let arrived = 0;
    let own = false;
    for (let i = kids.length - 1; i >= 0 && fresh.has(kids[i] as Node); i -= 1) {
      const k = kids[i];
      if (isEntry(k)) {
        arrived += 1;
        own ||= k.hasAttribute("data-own");
      }
    }
    adopt();
    if (busyChanged || feed.getAttribute("aria-busy") === "true" || !had || own || atEnd) {
      toEnd(going);
      return;
    }
    keep();
    if (arrived > 0) {
      show(unseen + arrived);
    }
  });
  added.observe(feed, { childList: true, attributes: true, attributeFilter: ["aria-busy"] });

  document.addEventListener(
    "scroll",
    (e) => {
      const t = e.target === document ? pageScroller() : e.target;
      if (!(t instanceof Element) || !t.contains(feed)) {
        return;
      }
      adopt();
      inset();
      if (t === scroller) {
        read();
      }
    },
    { ...until(signal, true), passive: true },
  );
  // The reader taking the scroll over ends a smooth scroll to the newest.
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
    document.addEventListener(
      type,
      () => {
        going = false;
      },
      { ...until(signal, true), passive: true },
    );
  }
  addEventListener("resize", keep, listen);
  vv?.addEventListener("resize", inset, listen);
  vv?.addEventListener("scroll", inset, listen);
  jump?.addEventListener(
    "click",
    () => {
      toEnd(!reducedMotion());
      focusNewest();
    },
    listen,
  );

  if (jump !== undefined) {
    jump.hidden = true;
  }
  pad();
  inset();
  toEnd(false);

  whenAborted(signal, () => {
    added.disconnect();
    resize.disconnect();
    if (foot !== undefined) {
      scroller.style.scrollPaddingBlockEnd = padBefore;
      foot.style.removeProperty(INSET);
    }
    for (const el of focusable) {
      el.removeAttribute("tabindex");
    }
    if (jump !== undefined) {
      jump.hidden = true;
    }
  });

  return {
    toNewest() {
      if (signal?.aborted !== true) {
        toEnd(false);
      }
    },
    get unseen() {
      return unseen;
    },
  };
}
