/**
 * held-list.ts — `enhanceHeldList()` keeps a list's rows still while the
 * reader is in it (WCAG 3.2.2): at its start edge a change waits behind an
 * offer, "3 newer rows · Show", whose Show puts the rows in and focuses the
 * first; at its end edge a change goes in at once, one below the reader is
 * counted on the offer, and Show goes to the newest row.
 * @module
 */

import { reducedMotion, until, whenAborted } from "../../core/lifetime/lifetime.js";
import { roll } from "../../core/roll/roll.js";
import { announce } from "../../feedback/announce/announce.js";
import { focusOn, rowOf } from "../list-row/row.js";
import { coveredEnd, endUnseen, scrollerOf, seenOf } from "../list-row/scroller.js";

export interface HeldListWords {
  /** The offer's count of `n` rows. Default "1 newer row", "3 newer
   *  rows". */
  readonly count?: (n: number) => string;
  /** The line's button. Default "Show". */
  readonly show?: string;
}

export interface HeldListOptions {
  /** Where the list's new rows go: its start (default), as in a log newest
   *  first, or its end, as in a log oldest first. */
  readonly edge?: "start" | "end";
  /** The element the offer line goes before at the start edge, and after
   *  at the end. Default: the list; for a tbody, its table's `.cp-panel`,
   *  else the table. */
  readonly beside?: Element;
  /** The host's own button for the offer, in place of the line: `hidden`
   *  while nothing waits, its words in its `.cp-roll`, else its whole
   *  text. */
  readonly jump?: HTMLButtonElement;
  readonly words?: HeldListWords;
  /** How long the count stays the same before it is said, in ms. Default
   *  500. */
  readonly settle?: number;
  /** Drops what is held or counted, removes the line, hides the jump, and
   *  removes the listeners and every tabindex the module gave; focus on the
   *  offer moves as Show's would. A later change runs at once, uncounted. */
  readonly signal?: AbortSignal;
}

export interface HeldList {
  /**
   * At the start edge, runs `apply` now when the reader is not in the list
   * and nothing is held, else holds it behind the offer. At the end edge,
   * runs it now and offers it when the last row it returns, else the
   * list's last, ends below what the reader sees. Either way the offer
   * counts `rows` more (default 1). `apply` adds or moves rows and may
   * return those it placed.
   */
  change(apply: () => Iterable<Element> | undefined, rows?: number): void;
  /** The rows held now; at the end edge, those counted and not yet seen. */
  readonly held: number;
  /** Drops what is held or counted and the offer, such as before the app
   *  replaces the list whole. */
  discard(): void;
}

const defaultCount = (n: number): string => (n === 1 ? "1 newer row" : `${String(n)} newer rows`);

let seq = 0;

const inPageOrder = (a: Node, b: Node): number =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

const marginEnd = (el: Element): number =>
  Number.parseFloat(getComputedStyle(el).scrollMarginBlockEnd) || 0;

/**
 * Keeps `list`, a `.cp-list` of `li` rows or a `.cp-table`'s `tbody`, still
 * while the reader is in it. At the start edge the reader is in it while
 * focus or the pointer is in the list or the view has scrolled past its
 * start, and once one change is held every later one waits behind it, in
 * order, until Show or `discard()`. At the end edge nothing waits, and the
 * module scrolls only on Show.
 */
export function enhanceHeldList(
  list: HTMLUListElement | HTMLOListElement | HTMLTableSectionElement,
  options: HeldListOptions = {},
): HeldList {
  const { signal, settle = 500, jump } = options;
  const atEnd = options.edge === "end";
  const count = options.words?.count ?? defaultCount;
  const region = list instanceof HTMLTableSectionElement ? (list.closest("table") ?? list) : list;
  const beside =
    options.beside ?? (region === list ? list : (region.closest(".cp-panel") ?? region));
  const listen = until(signal);

  const queue: (() => Iterable<Element> | undefined)[] = [];
  let rows = 0;
  /** At the end edge, the last row counted. */
  let newest: Element | undefined;
  /** Show's smooth scroll to the newest is under way, so a row that arrives
   *  meanwhile is followed rather than counted. */
  let going = false;
  let said: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const given = new Set<HTMLElement>();

  const line = document.createElement("div");
  line.className = "cp-list-pending";
  let words: HTMLElement;
  let button: HTMLButtonElement;
  if (jump === undefined) {
    words = document.createElement("span");
    words.id = `cp-held-${String(++seq)}`;
    button = document.createElement("button");
    button.type = "button";
    button.className = "cp-button";
    button.dataset["size"] = "sm";
    button.textContent = options.words?.show ?? "Show";
    button.setAttribute("aria-describedby", words.id);
    line.append(words, button);
    if (atEnd) {
      line.dataset["edge"] = "end";
    }
  } else {
    button = jump;
    words = jump.querySelector<HTMLElement>(".cp-roll") ?? jump;
    jump.hidden = true;
  }
  const offer = jump ?? line;

  const focus = (el: Element, preventScroll = false): void => {
    if (focusOn(el, { preventScroll }) && el instanceof HTMLElement) {
      given.add(el);
      el.addEventListener("blur", () => given.delete(el), { once: true });
    }
  };

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

  // A row's end scroll margin is the clearance it needs to be seen, such as
  // a pinned foot's height. The end line is left out, since it leaves as
  // the newest row reaches the view's end.
  const below = (el: Element): boolean =>
    el.getClientRects().length > 0 && endUnseen(el, marginEnd(el));

  // The engine's own scroll anchoring is off for the one write, so it never
  // adds its correction to this one; WebKit has none to add.
  const putLine = (): void => {
    const scroller = scrollerOf(region);
    const top = region.getBoundingClientRect().top;
    const keep = top < seenOf(region).bottom;
    const anchoring = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = "none";
    beside.before(line);
    const by = region.getBoundingClientRect().top - top;
    if (keep && by !== 0) {
      scroller.scrollTo({ top: scroller.scrollTop + by, behavior: "instant" });
    }
    scroller.style.overflowAnchor = anchoring;
  };

  // Pinned clear of what covers its scroller's end, such as a bar fixed at
  // the window's foot, which that end padding names.
  const pin = (): void => {
    const covered = coveredEnd(scrollerOf(region));
    line.style.insetBlockEnd = covered > 0 ? `${String(covered)}px` : "";
  };

  const show = (): void => {
    const text = count(rows);
    if (jump !== undefined && !jump.hidden && words !== jump) {
      roll(words, text);
    } else {
      words.textContent = text;
    }
    if (jump !== undefined) {
      jump.hidden = false;
    } else if (!line.isConnected && atEnd) {
      pin();
      beside.after(line);
    } else if (!line.isConnected) {
      putLine();
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = count(rows);
      if (now !== said) {
        said = now;
        announce(now);
      }
    }, settle);
  };

  const last = (): Element | undefined =>
    newest?.isConnected === true ? newest : (list.lastElementChild ?? undefined);

  /** Drops what is held or counted and the offer, and says whether the
   *  offer had focus. */
  const drop = (): boolean => {
    queue.length = 0;
    rows = 0;
    newest = undefined;
    said = undefined;
    clearTimeout(timer);
    const had = offer.contains(document.activeElement);
    if (jump === undefined) {
      line.remove();
    } else {
      jump.hidden = true;
    }
    return had;
  };

  /** Where focus on the offer goes as it leaves, so it never drops to the
   *  page: at the end edge `row`, else the list. */
  const land = (row: Element | undefined): void => {
    if (atEnd && row !== undefined) {
      focus(rowOf(row), true);
    } else {
      focus(region);
    }
  };

  const dropAndLand = (): void => {
    const row = last();
    if (drop()) {
      land(row);
    }
  };

  const putIn = (): void => {
    const placed: Element[] = [];
    for (const apply of queue.splice(0)) {
      placed.push(...(apply() ?? []));
    }
    drop();
    const first = placed.filter((el) => el.isConnected).sort(inPageOrder)[0];
    focus(first === undefined ? region : rowOf(first));
  };

  // The engine's own scroll honours each scroller's end padding and the
  // row's end margin, as `below` counts them, and "nearest" leaves alone a
  // box around the list that shows the row already.
  const reveal = (row: Element, smooth: boolean): void => {
    row.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "instant" });
  };

  const toNewest = (): void => {
    const row = last();
    drop();
    if (row === undefined) {
      focus(region);
      return;
    }
    if (below(row)) {
      going = !reducedMotion();
      reveal(row, going);
    }
    focus(rowOf(row), true);
  };

  button.addEventListener("click", atEnd ? toNewest : putIn, listen);

  if (atEnd) {
    // The reader reaching the newest row, by scrolling or as the view
    // grows, has seen what was counted.
    const seen = (): void => {
      const row = last();
      const reached = row === undefined || !below(row);
      going &&= !reached;
      if (rows > 0 && reached) {
        dropAndLand();
      }
    };
    document.addEventListener("scroll", seen, { ...until(signal, true), passive: true });
    addEventListener(
      "resize",
      () => {
        if (line.isConnected) {
          pin();
        }
        seen();
      },
      listen,
    );
    // The reader taking the scroll over ends Show's scroll to the newest.
    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
      document.addEventListener(
        type,
        () => {
          going = false;
        },
        { ...until(signal, true), passive: true },
      );
    }
  }

  // A focused element whose tabindex goes loses focus to the page, so the
  // tabindex goes before focus leaves the offer, which gives one anew.
  whenAborted(signal, () => {
    for (const el of given) {
      el.removeAttribute("tabindex");
    }
    given.clear();
    dropAndLand();
  });

  const arrive = (apply: () => Iterable<Element> | undefined, n: number): void => {
    const placed = [...(apply() ?? [])].filter((el) => el.isConnected).sort(inPageOrder);
    const row = placed.at(-1) ?? list.lastElementChild;
    if (signal?.aborted === true || row === null || !below(row)) {
      return;
    }
    if (going) {
      reveal(row, true);
      return;
    }
    if (newest?.isConnected !== true || inPageOrder(newest, row) < 0) {
      newest = row;
    }
    rows += n;
    show();
  };

  return {
    change(apply, n = 1) {
      if (atEnd) {
        arrive(apply, n);
      } else if (signal?.aborted === true || (queue.length === 0 && !inList())) {
        apply();
      } else {
        queue.push(apply);
        rows += n;
        show();
      }
    },
    get held() {
      return rows;
    },
    discard: dropAndLand,
  };
}
