/**
 * relative-time.ts — a `<time>` that says how long ago, or how far ahead,
 * its moment is, "4 minutes ago" in the locale's words, and keeps itself
 * current. The exact time stays beside it for a screen reader and shows on
 * hover through the tooltip.
 * @module
 */

/** How many words the time takes: "4 minutes ago", "4 min. ago" or "4m ago"
 *  in English. */
export type RelativeStyle = "long" | "short" | "narrow";

export interface FormatRelativeOptions {
  /** The moment to count from, in ms since the epoch. Default: now. */
  readonly now?: number;
  /** Default "long". */
  readonly style?: RelativeStyle;
  /** A BCP 47 language tag. Default: the browser's. */
  readonly locale?: string;
}

export interface RelativeTimeOptions {
  /** Default "long". */
  readonly style?: RelativeStyle;
  /** A BCP 47 language tag. Default: the browser's. */
  readonly locale?: string;
  /** Stops keeping the time current. Its words stay as they last read. */
  readonly signal?: AbortSignal;
}

// Each unit's length in seconds, largest first, as a calendar-free count.
const UNITS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

// The longest delay setTimeout keeps; a longer one fires at once.
const MAX_DELAY = 2 ** 31 - 1;

let formats: Map<string, Intl.RelativeTimeFormat> | undefined;

function formatter(
  locale: string | undefined,
  style: RelativeStyle,
  numeric: "auto" | "always",
): Intl.RelativeTimeFormat {
  formats ??= new Map();
  const key = `${locale ?? ""} ${style} ${numeric}`;
  let f = formats.get(key);
  if (f === undefined) {
    f = new Intl.RelativeTimeFormat(locale, { style, numeric });
    formats.set(key, f);
  }
  return f;
}

function words(at: number, now: number, style: RelativeStyle, locale?: string): string {
  const s = Math.round((at - now) / 1000);
  for (const [unit, n] of UNITS) {
    if (Math.abs(s) >= n) {
      // A compact form reads as a number: "1d ago", never "yesterday".
      const numeric = style === "long" ? "auto" : "always";
      return formatter(locale, style, numeric).format(Math.round(s / n), unit);
    }
  }
  return formatter(locale, style, "auto").format(0, "second");
}

/** The first instant after `now` at which the words for `at` may change. */
function nextChange(at: number, now: number): number {
  // `s` only falls as time passes. `target` is the next value of `s` that
  // reads differently: under a minute, a minute ago; else the next half
  // unit of the rounded value, or where the unit itself changes.
  const s = Math.round((at - now) / 1000);
  let target = -60;
  let bigger = Number.POSITIVE_INFINITY;
  for (const [, n] of UNITS) {
    if (Math.abs(s) >= n) {
      const half = n * Math.round(s / n) - n / 2 - 1;
      target = Math.max(half, s < 0 ? -bigger : n - 1);
      break;
    }
    bigger = n;
  }
  // Math.round reads `target` once (at - now) / 1000 is below target + 0.5.
  return at - (target + 0.5) * 1000 + 1;
}

function toMs(date: Date | number): number {
  const ms = typeof date === "number" ? date : date.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("relative-time: not a valid date");
  }
  return ms;
}

/** How long ago or ahead `date` is in the locale's words: "4 minutes ago",
 *  "in 25 minutes", "yesterday", or "now" under a minute. Throws a
 *  TypeError for an invalid date. */
export function formatRelative(date: Date | number, options: FormatRelativeOptions = {}): string {
  return words(toMs(date), options.now ?? Date.now(), options.style ?? "long", options.locale);
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
  const w = words(entry.at, now, entry.style, entry.locale);
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
  const { signal, style = "long", locale } = options;
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
  const exact = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    at,
  );
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
