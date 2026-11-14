/**
 * list-row.ts — a list row's states that a script sets. `markKept()` mutes
 * a row the app could not refresh beside the time it is from and the
 * reason, in a `.cp-list` or a `.cp-table` alike.
 * @module
 */

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
