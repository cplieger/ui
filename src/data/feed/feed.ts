/**
 * feed.ts — `enhanceFeed()` keeps an open conversation's feed at its newest
 * entry while the reader is there, and keeps their place once they have
 * scrolled up: entries arriving then are counted on the New messages button
 * instead, by the held list at its end edge. It keeps the pinned foot's
 * composer clear of the entries and of the on-screen keyboard.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { enhanceHeldList } from "../held-list/held-list.js";
import { pageScroller, scrollerOf, viewOf } from "../list-row/scroller.js";

export interface FeedOptions {
  /** The `.cp-feed-foot` pinned under the feed, which needs `jump`, since
   *  the held list's line would sit under it. Its height, with the jump's
   *  above it while the jump shows, is the feed's `--cp-feed-foot-size`,
   *  the entries' end scroll margin, and the part of it the on-screen
   *  keyboard covers is its `--cp-keyboard-inset`. */
  readonly foot?: HTMLElement;
  /** The `.cp-feed-jump` button the arrivals are offered on, `hidden` while
   *  none waits. Its words go in its `.cp-roll`, else they are its text.
   *  Without it they are offered on the held list's line after the feed. */
  readonly jump?: HTMLButtonElement;
  /** The offer's words for `n` unseen entries. Default: "1 new message",
   *  "3 new messages". */
  readonly words?: (n: number) => string;
  /** Removes the listeners and observers, drops the count, hides the jump
   *  and clears every property the module set. */
  readonly signal?: AbortSignal;
}

export interface Feed {
  /** Scrolls to the newest entry at once and drops the unseen count. */
  toNewest(): void;
  /** The entries counted since the reader last saw the end. */
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

/**
 * Wires `feed`, a `.cp-feed` of `li.cp-feed-entry` oldest first, at its
 * newest entry, and keeps the place the reader scrolled to, the end or an
 * entry, through every change. Entries appended after the newest while not
 * `aria-busy="true"` are arrivals, counted while the reader is up; an own
 * (`data-own`) one goes to the newest, as do a first load's. Any other entry
 * is a load, never counted. A `foot` with no `jump` throws a `TypeError`.
 */
export function enhanceFeed(
  feed: HTMLOListElement | HTMLUListElement,
  options: FeedOptions = {},
): Feed {
  const { foot, jump, signal } = options;
  if (foot !== undefined && jump === undefined) {
    throw new TypeError("enhanceFeed: a feed with a foot offers its arrivals on its jump");
  }
  if (signal?.aborted === true) {
    return { toNewest: () => undefined, unseen: 0 };
  }
  const listen = until(signal);
  const vv = window.visualViewport;
  const arrivals = enhanceHeldList(feed, {
    edge: "end",
    words: { count: options.words ?? defaultWords },
    ...(jump === undefined ? {} : { jump }),
    ...(signal === undefined ? {} : { signal }),
  });

  let scroller = scrollerOf(feed);
  let place: Place = "end";
  /** The position the feed last scrolled to, so the scroll event it causes
   *  is not taken for the reader's. */
  let wrote: number | null = null;
  /** The position the place was last read at or written to. A scroll since
   *  then that no scroll event has reported yet, such as one that focus
   *  made, is read before the place is put back. */
  let at = scroller.scrollTop;
  /** Whether the feed held an entry after the last batch of changes. */
  let filled = [...feed.children].some(isEntry);

  const size = (): void => {
    if (foot === undefined) {
      return;
    }
    const h =
      jump === undefined || jump.hidden
        ? foot.offsetHeight
        : foot.getBoundingClientRect().bottom - jump.getBoundingClientRect().top;
    feed.style.setProperty(FOOT, `${String(h)}px`);
  };

  // Fires after layout and before paint, so a kept place never flickers.
  // The held list shows and hides the jump, which resizes it.
  const resize = new ResizeObserver(() => {
    size();
    restore();
  });
  resize.observe(feed);
  resize.observe(scroller);
  for (const el of [foot, jump]) {
    if (el !== undefined) {
      resize.observe(el);
    }
  }

  const anchorAt = (): Place => {
    const top = viewOf(scroller).top;
    for (const el of feed.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top) {
        return { el, off: r.top - top };
      }
    }
    return { el: feed, off: feed.getBoundingClientRect().top - top };
  };

  // An anchored offset is moved into the new scroller's frame, so the entry
  // goes back to where the reader saw it on screen.
  const resolve = (): void => {
    const now = scrollerOf(feed);
    if (now === scroller) {
      return;
    }
    resize.unobserve(scroller);
    const old = scroller;
    scroller = now;
    wrote = null;
    at = now.scrollTop;
    if (place !== "end") {
      place = old.isConnected
        ? { el: place.el, off: place.off + viewOf(old).top - viewOf(now).top }
        : anchorAt();
    }
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

  const write = (top: number): void => {
    scroller.scrollTo({ top, behavior: "instant" });
    wrote = scroller.scrollTop;
    at = scroller.scrollTop;
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
    if (scroller.scrollTop !== at) {
      read();
    }
    if (place === "end") {
      const by = gap();
      if (by > 0) {
        write(scroller.scrollTop + by);
      }
      return;
    }
    const { el, off } = place;
    if (el !== feed && el.parentElement !== feed) {
      place = anchorAt();
      return;
    }
    const by = el.getBoundingClientRect().top - viewOf(scroller).top - off;
    if (by !== 0) {
      write(scroller.scrollTop + by);
    }
  };

  // Within END_REM of the end the reader is at it, and the feed follows
  // from there, so what was counted counts as seen.
  const read = (): void => {
    const own = wrote !== null && scroller.scrollTop === wrote;
    wrote = null;
    at = scroller.scrollTop;
    if (own) {
      return;
    }
    const end = gap() <= END_REM * remPx();
    place = end ? "end" : anchorAt();
    if (end && arrivals.held > 0) {
      arrivals.discard();
    }
  };

  const toEnd = (): void => {
    place = "end";
    arrivals.discard();
    restore();
  };

  // Its offset in CSS px holds only at a scale of 1: a pinch zoom also
  // shrinks the visual viewport, and is not a keyboard.
  const inset = (): void => {
    if (foot === undefined || vv === null) {
      return;
    }
    const { bottom } = viewOf(scroller);
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
    const was = filled;
    filled = kids.some(isEntry);
    if (busyAt.size === 0) {
      return;
    }
    // Into a feed with no entry, such as the first load, the feed opens.
    if (!was) {
      toEnd();
      return;
    }
    // The arrivals follow the newest entry that was already there, so a
    // list replaced whole, a refill, has none. The person's own entry there
    // was sent, so it is followed even while a load is under way.
    const came: HTMLElement[] = [];
    let own = false;
    if (kids.some((k) => isEntry(k) && !busyAt.has(k))) {
      for (let i = kids.length - 1; i >= 0 && busyAt.has(kids[i] as Node); i -= 1) {
        const k = kids[i];
        if (isEntry(k)) {
          own ||= k.hasAttribute("data-own");
          if (busyAt.get(k) === false) {
            came.push(k);
          }
        }
      }
    }
    if (own) {
      toEnd();
      return;
    }
    restore();
    // Followed to the end, they are seen. The held list is asked only while
    // the reader is up, since on the page the feed's end stops short of an
    // entry's end margin by its focus ring, and it would count them.
    if (came.length > 0 && place !== "end") {
      arrivals.change(() => came, came.length);
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
      resolve();
      inset();
      if (t === scroller) {
        read();
      }
    },
    { ...until(signal, true), passive: true },
  );
  addEventListener("resize", restore, listen);
  vv?.addEventListener("resize", inset, listen);
  vv?.addEventListener("scroll", inset, listen);

  size();
  inset();
  restore();

  whenAborted(signal, () => {
    added.disconnect();
    resize.disconnect();
    feed.style.removeProperty(FOOT);
    foot?.style.removeProperty(INSET);
  });

  return {
    toNewest() {
      if (signal?.aborted !== true) {
        toEnd();
      }
    },
    get unseen() {
      return arrivals.held;
    },
  };
}
