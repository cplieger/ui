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
   *  feed's `--cp-feed-foot-size`, the entries' end scroll margin, and the
   *  part of it the on-screen keyboard covers as its `--cp-keyboard-inset`. */
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
const FOOT = "--cp-feed-foot-size";

/** Where the reader is: at the end, or this child of the feed (the feed
 *  itself when none shows) this far below the scroller's top. */
type Place = "end" | { readonly el: Element; readonly off: number };

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
 * Wires `feed`, a `.cp-feed` of `li.cp-feed-entry` oldest first, at its
 * newest entry, and keeps the place the reader scrolled to, the end or an
 * entry, through every change. Entries appended after the newest while not
 * `aria-busy="true"` are arrivals, counted while the reader is up; an own
 * (`data-own`) one goes to the newest, as do a first load's. Any other entry
 * is a load, never counted.
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
  let place: Place = "end";
  /** A smooth scroll to the newest is under way, so the scrolls it passes
   *  through are not the reader leaving the end. */
  let going = false;
  /** The position the feed last scrolled to, so the scroll event it causes
   *  is not taken for the reader's. */
  let wrote: number | null = null;
  const focusable = new Set<HTMLElement>();
  /** Whether the feed held an entry after the last batch of changes. */
  let held = [...feed.children].some(isEntry);

  const size = (): void => {
    if (foot !== undefined) {
      feed.style.setProperty(FOOT, `${String(foot.offsetHeight)}px`);
    }
  };

  // Fires after layout and before paint, so a kept place never flickers.
  const resize = new ResizeObserver(() => {
    size();
    restore();
  });
  resize.observe(feed);
  resize.observe(scroller);
  if (foot !== undefined) {
    resize.observe(foot);
  }

  const newest = (): HTMLElement | undefined => [...feed.children].filter(isEntry).at(-1);

  const anchorAt = (): Place => {
    const top = topOf(scroller);
    for (const el of feed.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top) {
        return { el, off: r.top - top };
      }
    }
    return { el: feed, off: feed.getBoundingClientRect().top - top };
  };

  const resolve = (): void => {
    const now = scrollerOf(feed);
    if (now === scroller) {
      return;
    }
    resize.unobserve(scroller);
    scroller = now;
    wrote = null;
    // Observing inside the observer's own callback raises "ResizeObserver
    // loop completed", so the new scroller is watched from the next frame.
    requestAnimationFrame(() => {
      if (scroller === now && signal?.aborted !== true) {
        resize.observe(now);
      }
    });
  };

  // On the page, what follows the feed is not its end: the end is the
  // foot's place under the last entry, where the sticky foot rests.
  const gap = (): number =>
    scroller === document.scrollingElement
      ? feed.getBoundingClientRect().bottom + (foot?.offsetHeight ?? 0) - innerHeight
      : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

  const write = (top: number, smooth: boolean): void => {
    scroller.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
    wrote = smooth ? null : scroller.scrollTop;
  };

  // The one step that scrolls for the feed, run after anything that can
  // move its entries. The end is only ever scrolled down to, since on the
  // page a negative gap means the end already shows. With its child gone,
  // as after a refill, the scroll position is the place. A hidden feed is
  // put back once it shows, in the scroller it shows in.
  const restore = (): void => {
    if (feed.getClientRects().length === 0) {
      return;
    }
    resolve();
    if (place === "end") {
      const by = gap();
      if (by > 0) {
        write(scroller.scrollTop + by, going);
      } else {
        going = false;
      }
      return;
    }
    const { el, off } = place;
    if (el !== feed && el.parentElement !== feed) {
      place = anchorAt();
      return;
    }
    const by = el.getBoundingClientRect().top - topOf(scroller) - off;
    if (by !== 0) {
      write(scroller.scrollTop + by, false);
    }
  };

  const read = (): void => {
    const own = wrote !== null && scroller.scrollTop === wrote;
    wrote = null;
    const end = gap() <= END_REM * remPx();
    if (own || (going && !end)) {
      return;
    }
    going = false;
    place = end ? "end" : anchorAt();
    if (end) {
      clear();
    }
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
    place = "end";
    going = smooth;
    clear();
    restore();
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
    if (own) {
      toEnd(going);
      return;
    }
    if (arrived > 0 && place !== "end") {
      show(unseen + arrived);
    }
    restore();
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
      resolve();
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
  addEventListener("resize", restore, listen);
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
  size();
  inset();
  restore();

  whenAborted(signal, () => {
    added.disconnect();
    resize.disconnect();
    feed.style.removeProperty(FOOT);
    foot?.style.removeProperty(INSET);
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
