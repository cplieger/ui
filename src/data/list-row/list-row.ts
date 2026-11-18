/**
 * list-row.ts — a list row's states that a script sets. `markKept()` mutes
 * a row the app could not refresh beside the time it is from and the
 * reason, in a `.cp-list` or a `.cp-table` alike, and `skeletonListRow()`
 * gives the row standing for one that loads.
 * @module
 */

import { bone } from "../../feedback/skeleton/bone.js";
import { rowOf } from "./row.js";

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

/** The lead's attributes that set its size or shape. */
const LEAD_ATTRS = ["data-part", "data-size", "data-cp-icon-size"] as const;

function bones(from: Element | null | undefined, fallback: number): HTMLElement[] {
  const lines =
    from == null
      ? fallback
      : [...from.children].filter((el) => !(el instanceof HTMLElement && el.hidden)).length;
  return Array.from({ length: lines }, () => bone());
}

/**
 * An item standing for one of `list`'s rows while they load, in their
 * shape, so the list keeps its height when they come: the loaded row's
 * lead, empty and in the skeleton's fill, and a bar per line of its
 * `.cp-cell-stack` and of its end. The list's first loaded `.cp-list-row`
 * gives the shape; with none, `data-row` on the list names it: `media` for
 * a cover beside two lines, or a length every row is tall. Clone it once
 * per row.
 */
export function skeletonListRow(list: HTMLUListElement | HTMLOListElement): HTMLLIElement {
  const loaded = list.querySelector(":scope > li > .cp-list-row:not([data-skeleton])");
  const declared = list.dataset["row"];
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.dataset["skeleton"] = "";
  const lead = loaded?.firstElementChild;
  if (lead != null && !lead.matches(':is(.cp-cell-stack, [data-part="end"])')) {
    const stand = document.createElement("span");
    stand.className = lead.className;
    for (const name of LEAD_ATTRS) {
      const value = lead.getAttribute(name);
      if (value !== null) {
        stand.setAttribute(name, value);
      }
    }
    row.append(stand);
  } else if (loaded == null && declared === "media") {
    const cover = document.createElement("span");
    cover.className = "cp-cover";
    row.append(cover);
  }
  const stack = document.createElement("span");
  stack.className = "cp-cell-stack";
  stack.append(...bones(loaded?.querySelector(":scope > .cp-cell-stack"), 2));
  row.append(stack);
  const end = loaded?.querySelector(':scope > [data-part="end"]');
  if (end != null) {
    const bars = document.createElement("span");
    bars.dataset["part"] = "end";
    bars.append(...bones(end, 0));
    row.append(bars);
  }
  if (loaded == null && declared !== undefined && declared !== "media") {
    row.style.minBlockSize = declared;
  }
  const li = document.createElement("li");
  li.setAttribute("aria-hidden", "true");
  li.append(row);
  return li;
}
