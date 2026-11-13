/**
 * load-more.ts — `enhanceLoadMore()` adds a list's next page at one edge:
 * after its last row from the list's foot, or before a feed's first entry
 * from its head. A press turns the button busy, puts the page in, focuses
 * the first item it added and says how many came; a page that fails is
 * said and the button reads Retry.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { rollText } from "../../core/roll/roll.js";
import { announce } from "../../feedback/announce/announce.js";
import { focusOn, landing } from "../list-row/row.js";

export interface LoadMorePage {
  /** The items to add, in their order: rows, a feed's entries and its day
   *  separators, or a group's heading and list. After a list's groups, an
   *  `li` continues the last group's list and a heading or list goes after
   *  the last group. An item already in the list, such as a row a keyed
   *  list drew, stays where it is. */
  readonly items: Iterable<Element>;
  /** Whether another page is left after this one. */
  readonly more: boolean;
  /** The button's words from now on, such as "Show the last 3". Default:
   *  the words it had. */
  readonly label?: string;
}

export interface LoadMoreWords {
  /** Said once a page is in, for its `n` rows or entries. Default "1 more
   *  row", "20 more rows" at the end; "1 older message", "20 older
   *  messages" at the start. */
  readonly count?: (n: number) => string;
  /** The button's words while a page loads. Default "Loading…". */
  readonly busy?: string;
  /** Said when a page fails. Default "The next page did not load." */
  readonly failed?: string;
  /** The button's words after a page failed. Default "Retry". */
  readonly retry?: string;
}

/** `"end"` adds a page after the last row; `"start"` before the first. */
export type LoadMoreEdge = "start" | "end";

export interface LoadMoreOptions {
  /** Loads the next page. Its signal aborts with the module's, and a page
   *  that comes after that is dropped. */
  readonly load: (signal: AbortSignal) => Promise<LoadMorePage>;
  /** Where the items go. Default: at `"end"`, the list the button's
   *  `li.cp-list-foot` ends, or what its `div.cp-list-foot` follows: a
   *  table, or a panel holding one, takes them in its last body, and a
   *  list's groups, side by side or in one element, at their end; at
   *  `"start"`, the element after its `.cp-feed-head`. */
  readonly list?: Element;
  /** Default `"end"`. */
  readonly edge?: LoadMoreEdge;
  readonly words?: LoadMoreWords;
  /** Ends a load under way and the button's wiring, and puts it at rest. */
  readonly signal?: AbortSignal;
}

/** Items that mark a place in a list rather than stand for a thing. */
const MARKS = ".cp-feed-day, .cp-since, .cp-list-foot";
const ROWS = `li:not(${MARKS}), tr`;

const counts: Record<LoadMoreEdge, (n: number) => string> = {
  end: (n) => (n === 1 ? "1 more row" : `${String(n)} more rows`),
  start: (n) => (n === 1 ? "1 older message" : `${String(n)} older messages`),
};

/** The rows and entries among `items`: an item, or each row inside a group. */
function rowsIn(items: readonly Element[]): number {
  let n = 0;
  for (const el of items) {
    if (el.matches("li, tr")) {
      n += el.matches(MARKS) ? 0 : 1;
    } else {
      n += el.querySelectorAll(ROWS).length;
    }
  }
  return n;
}

/** Where a page goes: `put` adds its items at the edge, in their order,
 *  but those already in the list; `edgeRow` is the row at that edge. */
interface Place {
  readonly put: (items: readonly Element[]) => void;
  readonly edgeRow: () => Element;
}

/** The row at `edge` of `list`, inside a group when its item is one. */
function edgeOf(list: Element, edge: LoadMoreEdge): Element {
  const items = [...list.children].filter((el) => !el.matches(MARKS));
  const el = (edge === "start" ? items[0] : items.at(-1)) ?? list;
  if (el === list || el.matches("li, tr")) {
    return el;
  }
  const rows = [...el.querySelectorAll(ROWS)];
  return (edge === "start" ? rows[0] : rows.at(-1)) ?? el;
}

function inList(list: Element, edge: LoadMoreEdge): Place {
  return {
    put(items) {
      const fresh = items.filter((el) => !list.contains(el));
      const foot = list.querySelector(":scope > .cp-list-foot");
      if (edge === "start") {
        list.prepend(...fresh);
      } else if (foot === null) {
        list.append(...fresh);
      } else {
        foot.before(...fresh);
      }
    },
    edgeRow: () => edgeOf(list, edge),
  };
}

// A table with only its head has no body for rows to go in.
function inTable(table: HTMLTableElement): Place {
  const last = (): HTMLTableSectionElement | undefined => table.tBodies[table.tBodies.length - 1];
  return {
    put(items) {
      (last() ?? table.createTBody()).append(...items.filter((el) => !table.contains(el)));
    },
    edgeRow: () => {
      const body = last();
      return body?.rows[body.rows.length - 1] ?? body ?? table;
    },
  };
}

/** The groups a `div.cp-list-foot` follows, each a heading and its list:
 *  side by side before the foot when `before` is the last list, else
 *  inside `before`. A page's `li` goes into the last list, continuing its
 *  group, and anything else after the last group. */
function inGroups(foot: Element, before: Element): Place {
  const side = before.matches("ul, ol");
  const lastList = (): Element | undefined => {
    if (side) {
      const el = foot.previousElementSibling;
      return el?.matches("ul, ol") === true ? el : undefined;
    }
    return [...before.querySelectorAll(":scope > :is(ul, ol)")].at(-1);
  };
  const placed = (el: Element): boolean =>
    side
      ? foot.parentElement?.contains(el) === true &&
        (foot.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
      : before.contains(el);
  return {
    put(items) {
      for (const el of items.filter((item) => !placed(item))) {
        const into = el instanceof HTMLLIElement ? lastList() : undefined;
        if (into !== undefined) {
          into.append(el);
        } else if (side) {
          foot.before(el);
        } else {
          before.append(el);
        }
      }
    },
    edgeRow: () => edgeOf(lastList() ?? before, "end"),
  };
}

function placeOf(button: HTMLButtonElement, edge: LoadMoreEdge): Place | null {
  if (edge === "start") {
    const feed = button.closest(".cp-feed-head")?.nextElementSibling;
    return feed === null || feed === undefined ? null : inList(feed, edge);
  }
  const foot = button.closest(".cp-list-foot");
  if (foot instanceof HTMLLIElement) {
    return foot.parentElement === null ? null : inList(foot.parentElement, edge);
  }
  const before = foot?.previousElementSibling ?? null;
  if (foot === null || before === null) {
    return null;
  }
  const table =
    before instanceof HTMLTableElement ? before : before.querySelector(":scope > table");
  return table instanceof HTMLTableElement ? inTable(table) : inGroups(foot, before);
}

/** Gives `button` the `.cp-roll` its words roll in and the busy spinner,
 *  unless the page wrote them, as every button whose work it confirms has. */
function prepare(button: HTMLButtonElement): void {
  let words = button.querySelector<HTMLElement>(":scope > .cp-roll");
  if (words === null) {
    words = document.createElement("span");
    words.className = "cp-roll";
    for (const node of [...button.childNodes]) {
      if (node instanceof Text) {
        words.append(node.data);
        node.remove();
      }
    }
    words.textContent = words.textContent.trim();
    button.append(words);
  }
  if (button.querySelector(':scope > .cp-icon[data-part="busy"]') === null) {
    const spin = document.createElement("span");
    spin.className = "cp-icon";
    spin.dataset["cpIcon"] = "spinner-arc";
    spin.dataset["part"] = "busy";
    spin.setAttribute("aria-hidden", "true");
    words.before(spin);
  }
}

/**
 * Wires `button`, in a list's `.cp-list-foot` or a feed's `.cp-feed-head`,
 * to add the pages `load` gives at the list's `edge`. Focus moves to the
 * first item a page added while it is still on the button or on the page,
 * and to the edge's row when a last, empty page takes the button away.
 * Throws a TypeError when there is no list to add to.
 */
export function enhanceLoadMore(button: HTMLButtonElement, options: LoadMoreOptions): void {
  const { load, signal } = options;
  const edge = options.edge ?? "end";
  const place = options.list === undefined ? placeOf(button, edge) : inList(options.list, edge);
  if (place === null) {
    throw new TypeError("enhanceLoadMore: the button is in no list's foot or feed's head");
  }
  if (signal?.aborted === true) {
    return;
  }
  const count = options.words?.count ?? counts[edge];
  const retry = options.words?.retry ?? "Retry";
  const failed = options.words?.failed ?? "The next page did not load.";
  const part = button.closest(".cp-list-foot, .cp-feed-head") ?? button;
  prepare(button);
  button.dataset["cpLoadMore"] = edge;
  const cycle = enhanceConfirm(button, {
    busy: options.words?.busy ?? "Loading…",
    done: false,
    ...(signal === undefined ? {} : { signal }),
  });
  const roll = button.querySelector<HTMLElement>(":scope > .cp-roll");
  let label = roll === null ? "" : rollText(roll);
  const life = new AbortController();
  whenAborted(signal, () => {
    life.abort();
  });

  const waiting = (): boolean =>
    button.contains(document.activeElement) || document.activeElement === document.body;

  const page = async (): Promise<boolean> => {
    let next: LoadMorePage;
    try {
      next = await load(life.signal);
    } catch (err) {
      if (!life.signal.aborted) {
        cycle.setRest(retry);
        announce(failed);
      }
      throw err;
    }
    if (life.signal.aborted) {
      return false;
    }
    const items = [...next.items];
    const focus = waiting();
    place.put(items);
    label = next.label ?? label;
    cycle.setRest(label);
    const first = items.find((el) => !el.matches(MARKS) && el.isConnected);
    // A feed puts the reader's place back in its mutation observer's
    // microtask; focus moves after it, so the scroll focus makes is the one
    // that stays, and the feed takes it as the reader's new place.
    await Promise.resolve();
    if (focus && first !== undefined) {
      focusOn(landing(first));
    }
    const n = rowsIn(items);
    if (n > 0) {
      announce(count(n));
    }
    return next.more;
  };

  button.addEventListener(
    "click",
    () => {
      let more = true;
      void cycle
        .run(async () => {
          more = await page();
        })
        .then(
          (ran) => {
            if (!ran || more || life.signal.aborted) {
              return;
            }
            // The edge is read while the foot is in the page, since groups
            // side by side end at it.
            const to = button.contains(document.activeElement) ? place.edgeRow() : undefined;
            part.remove();
            if (to !== undefined) {
              focusOn(landing(to));
            }
          },
          () => undefined,
        );
    },
    until(signal),
  );
}
