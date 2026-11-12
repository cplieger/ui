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
 * Wires `feed`, a `.cp-feed` of `li.cp-feed-entry` oldest first, in the
 * nearest box that scrolls it (found again as it moves), at its newest entry.
 * Entries appended after the newest while not `aria-busy="true"` are arrivals,
 * followed by a reader at the end, else counted; an own (`data-own`) one there
 * goes to the newest, as do the entries of a feed that had none. Any other
 * entry is a load, which keeps the reader's place and is never counted.
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
  /** Whether the feed held an entry after the last batch of changes. */
  let held = [...feed.children].some(isEntry);

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

  // On the page, what follows the feed is not its end: the end is the
  // foot's place under the last entry, where the sticky foot rests.
  const gap = (): number =>
    scroller === document.scrollingElement
      ? feed.getBoundingClientRect().bottom + (foot?.offsetHeight ?? 0) - innerHeight
      : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

  // A hidden feed, such as one in a detail not yet open, has no end to
  // reach: it goes there once it shows and the observer sees it resize.
  // One wired hidden latched the page, so a call in the turn it shows must
  // find its scroller first, or it would scroll the page.
  const toEnd = (smooth: boolean): void => {
    atEnd = true;
    clear();
    if (feed.getClientRects().length === 0) {
      return;
    }
    adopt();
    going = smooth;
    scroller.scrollTo({ top: scroller.scrollTop + gap(), behavior: smooth ? "smooth" : "instant" });
    // A load at the end is measured against this before any scroll event.
    if (!smooth) {
      record();
    }
  };

  // Puts the child the reader was on back where it was; with that child
  // gone, as after a refill, the scroll position itself is the place.
  const restore = (): void => {
    if (anchor?.el.parentElement !== feed) {
      record();
      return;
    }
    const by = anchor.el.getBoundingClientRect().top - topOf(scroller) - anchor.off;
    if (by !== 0) {
      scroller.scrollBy({ top: by, behavior: "instant" });
    }
  };

  // After the feed, the foot or the scroller changed size: the reader at
  // the end stays there, and one scrolled up keeps their place.
  const keep = (): void => {
    adopt();
    if (atEnd) {
      toEnd(going);
    } else {
      restore();
    }
  };

  // A load moves no one, a reader at the end included, so the end is
  // measured again once the place is kept. A press of the jump still
  // heading to the newest goes on there, and a hidden feed has no place.
  const hold = (): void => {
    if (!going && feed.getClientRects().length > 0) {
      restore();
      atEnd = gap() <= END_REM * remPx();
    }
  };

  const read = (): void => {
    const end = gap() <= END_REM * remPx();
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
    // Each added node, with whether the feed was busy as it went in. Read
    // back from the current state, each aria-busy record's old value is the
    // state before it, so a load marked and unmarked in one task is seen.
    const busyAt = new Map<Node, boolean>();
    let busy = feed.getAttribute("aria-busy") === "true";
    for (const r of [...records].reverse()) {
      if (r.type === "attributes") {
        busy = r.oldValue === "true";
      }
      for (const n of r.addedNodes) {
        if (!busyAt.has(n)) {
          busyAt.set(n, busy);
        }
      }
    }
    const kids = [...feed.children];
    const was = held;
    held = kids.some(isEntry);
    if (busyAt.size === 0) {
      return;
    }
    adopt();
    // Into a feed with no entry, such as the first load, the feed opens.
    if (!was) {
      toEnd(going);
      return;
    }
    // The arrivals follow the newest entry that was already there, so a
    // list replaced whole, a refill, has none. The person's own entry there
    // was sent, so it is followed even while a load is under way.
    let arrived = 0;
    let own = false;
    if (kids.some((k) => isEntry(k) && !busyAt.has(k))) {
      for (let i = kids.length - 1; i >= 0 && busyAt.has(kids[i] as Node); i -= 1) {
        const k = kids[i];
        if (isEntry(k)) {
          own ||= k.hasAttribute("data-own");
          arrived += busyAt.get(k) === false ? 1 : 0;
        }
      }
    }
    if (own || (arrived > 0 && atEnd)) {
      toEnd(going);
      return;
    }
    hold();
    if (arrived > 0) {
      show(unseen + arrived);
    }
  });
  added.observe(feed, {
    childList: true,
    attributes: true,
    attributeFilter: ["aria-busy"],
    attributeOldValue: true,
  });

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
