/**
 * held-list.ts — `enhanceHeldList()` keeps a list's rows still while the
 * reader is in it: a change that would add or move rows waits behind a line
 * that offers it, "3 newer rows · Show", and Show puts the rows in their
 * places and moves focus to the first (WCAG 3.2.2). `markKept()` mutes a row
 * the app could not refresh beside the time it is from and the reason.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { announce } from "../../feedback/announce/announce.js";
import { scrollerOf, seenOf } from "../list-row/scroller.js";

export interface HeldListWords {
  /** The offer's count of `n` held rows. Default "1 newer row", "3 newer
   *  rows". */
  readonly count?: (n: number) => string;
  /** The offer's button. Default "Show". */
  readonly show?: string;
}

export interface HeldListOptions {
  /** The element the offer line goes before. Default: the list; for a
   *  tbody, its table's `.cp-panel`, else the table. */
  readonly before?: Element;
  readonly words?: HeldListWords;
  /** How long the count stays the same before it is said, in ms. Default
   *  500. */
  readonly settle?: number;
  /** Drops what is held and removes the line and the listener; a later
   *  change runs at once. */
  readonly signal?: AbortSignal;
}

export interface HeldList {
  /**
   * Runs `apply` now when the reader is not in the list and nothing is
   * held, else holds it behind the offer, counting `rows` (default 1).
   * `apply` adds or moves its rows and may return those it placed, for Show
   * to focus the first.
   */
  change(apply: () => Iterable<Element> | undefined, rows?: number): void;
  /** The rows held now. */
  readonly held: number;
  /** Drops every held change and the line, such as before the app replaces
   *  the list whole. */
  discard(): void;
}

export interface KeptOptions {
  /** The kept line's words for the time the row is from and the reason.
   *  Default "Kept from 03:00: Sonarr walk partial". */
  readonly words?: (time: string, reason: string) => string;
  /** A BCP 47 language tag for the time. Default: the browser's. */
  readonly locale?: string;
}

export interface Kept {
  /** When the row's content is from. */
  readonly from: Date | number;
  /** Why it could not be refreshed, such as "Sonarr walk partial". */
  readonly reason: string;
}

const defaultCount = (n: number): string => (n === 1 ? "1 newer row" : `${String(n)} newer rows`);

const defaultKept = (time: string, reason: string): string => `Kept from ${time}: ${reason}`;

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

let seq = 0;

/** The row `el` stands for: an item's `.cp-list-row`, else `el`. */
function rowOf(el: Element): Element {
  return el instanceof HTMLLIElement ? (el.querySelector(":scope > .cp-list-row") ?? el) : el;
}

/** Focuses `el`, which takes `tabindex="-1"` until it loses focus when it
 *  takes no focus of its own. */
function focusOn(el: Element): void {
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

const inPageOrder = (a: Node, b: Node): number =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/**
 * Holds the changes to `list`, a `.cp-list` of `li` rows or a `.cp-table`'s
 * `tbody`, while the reader is in it: focus or the pointer is in the list,
 * or the view has scrolled past its start. Once one change is held, every
 * later one waits behind it, in order, until Show or `discard()`.
 */
export function enhanceHeldList(
  list: HTMLUListElement | HTMLOListElement | HTMLTableSectionElement,
  options: HeldListOptions = {},
): HeldList {
  const { signal, settle = 500 } = options;
  const count = options.words?.count ?? defaultCount;
  const region = list instanceof HTMLTableSectionElement ? (list.closest("table") ?? list) : list;
  const before =
    options.before ?? (region === list ? list : (region.closest(".cp-panel") ?? region));

  const queue: (() => Iterable<Element> | undefined)[] = [];
  let rows = 0;
  let said: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const words = document.createElement("span");
  words.id = `cp-held-${String(++seq)}`;
  const show = document.createElement("button");
  show.type = "button";
  show.className = "cp-button";
  show.dataset["size"] = "sm";
  show.textContent = options.words?.show ?? "Show";
  show.setAttribute("aria-describedby", words.id);
  const line = document.createElement("div");
  line.className = "cp-list-pending";
  line.append(words, show);

  const inList = (): boolean => {
    const active = document.activeElement;
    if ((active !== null && region.contains(active)) || region.matches(":hover")) {
      return true;
    }
    if (region.scrollTop > 0) {
      return true;
    }
    return (
      region.getClientRects().length > 0 &&
      region.getBoundingClientRect().top < seenOf(region).top - 0.5
    );
  };

  // The engine's own scroll anchoring is off for the one write, so it never
  // adds its correction to this one; WebKit has none to add.
  const putLine = (): void => {
    const scroller = scrollerOf(region);
    const top = region.getBoundingClientRect().top;
    const keep = top < seenOf(region).bottom;
    const anchoring = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = "none";
    before.before(line);
    const by = region.getBoundingClientRect().top - top;
    if (keep && by !== 0) {
      scroller.scrollTo({ top: scroller.scrollTop + by, behavior: "instant" });
    }
    scroller.style.overflowAnchor = anchoring;
  };

  const offer = (): void => {
    words.textContent = count(rows);
    if (!line.isConnected) {
      putLine();
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = count(rows);
      if (text !== said) {
        said = text;
        announce(text);
      }
    }, settle);
  };

  /** Drops the held changes and the line, and says whether it had focus. */
  const drop = (): boolean => {
    queue.length = 0;
    rows = 0;
    said = undefined;
    clearTimeout(timer);
    const had = line.contains(document.activeElement);
    line.remove();
    return had;
  };

  show.addEventListener(
    "click",
    () => {
      const placed: Element[] = [];
      for (const apply of queue.splice(0)) {
        placed.push(...(apply() ?? []));
      }
      drop();
      const first = placed.filter((el) => el.isConnected).sort(inPageOrder)[0];
      focusOn(first === undefined ? region : rowOf(first));
    },
    until(signal),
  );

  whenAborted(signal, () => {
    if (drop()) {
      focusOn(region);
    }
  });

  return {
    change(apply, n = 1) {
      if (signal?.aborted === true || (queue.length === 0 && !inList())) {
        apply();
        return;
      }
      queue.push(apply);
      rows += n;
      offer();
    },
    get held() {
      return rows;
    },
    discard() {
      if (drop()) {
        focusOn(region);
      }
    },
  };
}

interface Marked {
  readonly line: HTMLElement;
  readonly hid: readonly HTMLElement[];
}

const marked = new WeakMap<Element, Marked>();

function clock(at: number, locale: string | undefined): string {
  const today = new Date(at).toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(
    locale,
    today ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" },
  ).format(at);
}

/**
 * Marks `row`, an item, a `.cp-list-row` or a `tr`, kept since `kept.from`
 * beside `kept.reason`, in muted ink: the `small` and `.cp-meta` lines of
 * its first `.cp-cell-stack` give way to a `small.cp-kept` line, whose clock
 * the stylesheet draws. The time is the time of day when it is today's, else
 * the date and time. Null marks it fresh again. Throws a TypeError for an
 * invalid date.
 */
export function markKept(row: Element, kept: Kept | null, options: KeptOptions = {}): void {
  const target = rowOf(row);
  const prior = marked.get(target);
  if (kept === null) {
    target.removeAttribute("data-kept");
    if (prior !== undefined) {
      prior.line.remove();
      for (const el of prior.hid) {
        el.hidden = false;
      }
      marked.delete(target);
    }
    return;
  }
  const at = typeof kept.from === "number" ? kept.from : kept.from.getTime();
  if (!Number.isFinite(at)) {
    throw new TypeError("held-list: not a valid date");
  }
  const text = (options.words ?? defaultKept)(clock(at, options.locale), kept.reason);
  target.setAttribute("data-kept", "");
  if (prior !== undefined) {
    prior.line.textContent = text;
    return;
  }
  const line = document.createElement("small");
  line.className = "cp-kept";
  line.textContent = text;
  const stack = target.querySelector(".cp-cell-stack");
  const hid: HTMLElement[] = [];
  if (stack !== null) {
    for (const el of stack.querySelectorAll<HTMLElement>(
      ":scope > :is(small, .cp-meta):not([hidden])",
    )) {
      el.hidden = true;
      hid.push(el);
    }
    stack.append(line);
  } else if (target instanceof HTMLTableRowElement) {
    (target.querySelector(":scope > :is(td, th)") ?? target).append(line);
  } else {
    target.append(line);
  }
  marked.set(target, { line, hid });
}
