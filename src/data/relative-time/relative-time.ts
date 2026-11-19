/**
 * relative-time.ts — a `<time>` that says how long ago, or how far ahead,
 * its moment is, "4m ago" in the locale's words, and keeps itself
 * current. The exact time stays beside it for a screen reader and shows on
 * hover through the tooltip.
 * @module
 */

import type { RelativeStyle } from "../../core/format/format.js";
import { dateWords, RELATIVE_UNITS, relativeWords } from "../../core/format/intl.js";
import { localeOf } from "../../core/locale/locale.js";

export interface RelativeTimeOptions {
  /** Default "narrow"; "long" for a time inside a sentence. */
  readonly style?: RelativeStyle;
  /** A BCP 47 language tag. Default: the lang of the time or its nearest
   *  ancestor; with no lang on either, as for a time not yet in the page,
   *  the page's. An empty lang, or one that is not a tag, means the
   *  browser's language. */
  readonly locale?: string;
  /** Stops keeping the time current. Its words stay as they last read. */
  readonly signal?: AbortSignal;
}

// The longest delay setTimeout keeps; a longer one fires at once.
const MAX_DELAY = 2 ** 31 - 1;

/** The first instant after `now` at which the words for `at` may change. */
function nextChange(at: number, now: number): number {
  // `s` only falls as time passes. `target` is the next value of `s` that
  // reads differently: under a minute, a minute ago; else the next half
  // unit of the rounded value, or where the unit itself changes.
  const s = Math.round((at - now) / 1000);
  let target = -60;
  let bigger = Number.POSITIVE_INFINITY;
  for (const [, n, from] of RELATIVE_UNITS) {
    if (Math.abs(s) >= from) {
      const half = n * Math.round(s / n) - n / 2 - 1;
      target = Math.max(half, s < 0 ? -bigger : Math.ceil(from) - 1);
      break;
    }
    bigger = from;
  }
  // Math.round reads `target` once (at - now) / 1000 is below target + 0.5.
  return at - (target + 0.5) * 1000 + 1;
}

interface Entry {
  readonly ref: WeakRef<HTMLTimeElement>;
  readonly at: number;
  readonly style: RelativeStyle;
  readonly locale: string | undefined;
  // Weak too: the text's parent link would keep the time alive.
  readonly text: WeakRef<Text>;
  next: number;
}

// Every enhanced time shares one timer, set to the soonest change. An
// entry holds its time only weakly, so a time the page drops is collected.
let entries: WeakMap<HTMLTimeElement, Entry> | undefined;
let live: Set<Entry> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function write(entry: Entry, now: number): void {
  const text = entry.text.deref();
  const w = relativeWords(entry.at, now, entry.style, entry.locale);
  if (text !== undefined && text.data !== w) {
    text.data = w;
  }
  entry.next = nextChange(entry.at, now);
}

function onVisible(): void {
  if (document.visibilityState === "visible") {
    refresh(true);
  }
}

function refresh(all: boolean): void {
  clearTimeout(timer);
  timer = undefined;
  const now = Date.now();
  let soonest = Number.POSITIVE_INFINITY;
  for (const entry of live ?? []) {
    if (entry.ref.deref() === undefined) {
      live?.delete(entry);
      continue;
    }
    if (all || entry.next <= now) {
      write(entry, now);
    }
    soonest = Math.min(soonest, entry.next);
  }
  if (live === undefined || live.size === 0) {
    live = undefined;
    document.removeEventListener("visibilitychange", onVisible);
    return;
  }
  timer = setTimeout(
    () => {
      refresh(false);
    },
    Math.min(MAX_DELAY, Math.max(0, soonest - now)),
  );
}

/**
 * Writes how long ago `time`'s `datetime` is into it and keeps the words
 * current at the pace its age needs, a minute-old time each minute and a
 * day-old one each day, through one timer for every time. The exact time
 * follows in a visually hidden span and in `data-cp-tip` for the hover. The
 * content is replaced, and a second call on the same time replaces the
 * first. Throws a TypeError when `datetime` does not parse.
 */
export function enhanceRelativeTime(
  time: HTMLTimeElement,
  options: RelativeTimeOptions = {},
): void {
  const {
    signal,
    style = "narrow",
    // Only a time with no `lang` around it takes the page's: an empty or
    // invalid one is an unknown language, as `localeOf` reads it.
    locale = time.closest("[lang]") === null ? localeOf(document.documentElement) : localeOf(time),
  } = options;
  const at = Date.parse(time.dateTime);
  if (Number.isNaN(at)) {
    throw new TypeError(`relative-time: datetime "${time.dateTime}" does not parse`);
  }
  if (signal?.aborted === true) {
    return;
  }
  entries ??= new WeakMap();
  const prior = entries.get(time);
  if (prior !== undefined) {
    live?.delete(prior);
  }
  const exact = dateWords(at, "datetime", locale);
  const text = document.createTextNode("");
  const hidden = document.createElement("span");
  hidden.className = "cp-visually-hidden";
  // The space keeps a screen reader from running the two together.
  hidden.textContent = ` ${exact}`;
  time.replaceChildren(text, hidden);
  time.dataset["cpTip"] = exact;
  const entry: Entry = {
    ref: new WeakRef(time),
    at,
    style,
    locale,
    text: new WeakRef(text),
    next: 0,
  };
  entries.set(time, entry);
  write(entry, Date.now());
  if (live === undefined) {
    live = new Set();
    document.addEventListener("visibilitychange", onVisible);
  }
  live.add(entry);
  refresh(false);
  signal?.addEventListener(
    "abort",
    () => {
      if (live?.delete(entry) === true) {
        refresh(false);
      }
    },
    { once: true },
  );
}
