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
import { focusableIn, focusOn, rowOf } from "../list-row/row.js";

export interface LoadMorePage {
  /** The items to add, in their order: rows, a feed's entries and its day
   *  separators, or a group's heading and list. An item already in the
   *  list, such as a row a keyed list drew, stays where it is. */
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
   *  `li.cp-list-foot` ends, or the element before its `div.cp-list-foot`;
   *  at `"start"`, the element after its `.cp-feed-head`. */
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

/** Where focus lands on `item`: a feed's entry, read whole, takes it
 *  itself; a row its first part that takes focus, else the row. */
function landing(item: Element): Element {
  const row = rowOf(item);
  return row.matches(".cp-feed-entry") ? row : (focusableIn(row) ?? row);
}

function listOf(button: HTMLButtonElement, edge: LoadMoreEdge): Element | null {
  if (edge === "start") {
    return button.closest(".cp-feed-head")?.nextElementSibling ?? null;
  }
  const foot = button.closest(".cp-list-foot");
  return foot instanceof HTMLLIElement
    ? foot.parentElement
    : (foot?.previousElementSibling ?? null);
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
  const list = options.list ?? listOf(button, edge);
  if (list === null) {
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

  const put = (items: readonly Element[]): void => {
    const fresh = items.filter((el) => el.parentElement !== list);
    const foot = list.querySelector(":scope > .cp-list-foot");
    if (edge === "start") {
      list.prepend(...fresh);
    } else if (foot !== null) {
      foot.before(...fresh);
    } else {
      list.append(...fresh);
    }
  };

  const edgeRow = (): Element => {
    const items = [...list.children].filter((el) => !el.matches(MARKS));
    const el = (edge === "start" ? items[0] : items.at(-1)) ?? list;
    if (el === list || el.matches("li, tr")) {
      return el;
    }
    const rows = [...el.querySelectorAll(ROWS)];
    return (edge === "start" ? rows[0] : rows.at(-1)) ?? el;
  };

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
    put(items);
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
            const had = button.contains(document.activeElement);
            part.remove();
            if (had) {
              focusOn(landing(edgeRow()));
            }
          },
          () => undefined,
        );
    },
    until(signal),
  );
}
