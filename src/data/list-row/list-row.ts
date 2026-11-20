/**
 * list-row.ts — a list row's states that a script sets. `markKept()` mutes
 * a row the app could not refresh beside the time it is from and the
 * reason, in a `.cp-list` or a `.cp-table` alike. `installRowActions()`
 * makes a row whose one action is a link or a button that action, whole.
 * @module
 */

import { shared } from "../../core/lifetime/lifetime.js";
import { rowOf } from "./row.js";

export interface RowActionsOptions {
  /** Ends the hold this call takes. Default: none, held for the page's life. */
  readonly signal?: AbortSignal;
}

const ROWS = "div.cp-list-row, .cp-table tbody tr, .cp-feed-entry";
const ACTIONS =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="slider"], [role="combobox"], [role="menuitem"], [role="option"]';
const ROW = "data-cp-row-action";
const STRETCH = "data-cp-stretch";

/** The one link or button `row` holds, or null when it holds none, more
 *  than one action, or one that is neither. A popover in the row, such as
 *  a ⋯ menu's, belongs to its opener, so its items are not counted. */
function oneAction(row: Element): Element | null {
  const actions = [...row.querySelectorAll(ACTIONS)].filter((el) => {
    const popover = el.parentElement?.closest("[popover]");
    return popover == null || popover.contains(row);
  });
  const [only] = actions;
  return actions.length === 1 && only?.matches("a[href], button") === true ? only : null;
}

function mark(row: Element): void {
  const only = oneAction(row);
  for (const el of row.querySelectorAll(`[${STRETCH}]`)) {
    if (el !== only) {
      el.removeAttribute(STRETCH);
    }
  }
  row.toggleAttribute(ROW, only !== null);
  only?.setAttribute(STRETCH, "");
}

const rowsIn = (node: Node): Element[] => {
  if (!(node instanceof Element)) {
    return [];
  }
  const own = node.closest(ROWS);
  return [...(own === null ? [] : [own]), ...node.querySelectorAll(ROWS)];
};

const page = shared((signal) => {
  for (const row of document.querySelectorAll(ROWS)) {
    mark(row);
  }
  const watch = new MutationObserver((records) => {
    const rows = new Set<Element>();
    for (const r of records) {
      for (const row of [...rowsIn(r.target), ...[...r.addedNodes].flatMap(rowsIn)]) {
        rows.add(row);
      }
    }
    for (const row of rows) {
      mark(row);
    }
  });
  watch.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "role", "type", "contenteditable"],
  });
  signal.addEventListener("abort", () => {
    watch.disconnect();
  });
});

/**
 * Makes each list row, table body row and feed entry holding exactly one
 * link or button that action whole: the row takes `data-cp-row-action` and
 * the action `data-cp-stretch`, stretched over the row, so a press anywhere
 * follows it and the row takes the row hover and the action's focus ring. A
 * row of two actions or none takes neither. Rows added or changed later are
 * read again; the marks stay until every caller's signal has aborted.
 */
export function installRowActions(options: RowActionsOptions = {}): void {
  page.install(options);
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

const defaultKept = (time: string, reason: string): string => `Kept from ${time}: ${reason}`;

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
    throw new TypeError("list-row: not a valid date");
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
