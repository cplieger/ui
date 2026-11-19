/**
 * format.ts — one way to write a number, a count, a share, a byte size, a
 * duration and a moment, through `Intl` in the page's language.
 * @module
 */

import { localeOf } from "../locale/locale.js";

import {
  clockWords,
  dateWords,
  durationRecord,
  durationWords,
  keepUnit,
  noun,
  numbers,
  relativeWords,
  shares,
  unsignedZero,
  withNoun,
  type DateStyle,
  type Unit,
} from "./intl.js";

export type { DateStyle, Unit } from "./intl.js";

/** How many words a relative time takes: "4 minutes ago", "4 min. ago" or
 *  "4m ago" in English. */
export type RelativeStyle = "long" | "short" | "narrow";

export interface RelativeOptions {
  /** The moment to count from. Default: now. */
  readonly now?: Date | number;
  /** Default "narrow"; "long" for a time inside a sentence. */
  readonly style?: RelativeStyle;
  /** A BCP 47 language tag. Default: the page's language. */
  readonly locale?: string;
}

/** Intl.DurationFormat's three word styles, or a clock ("0:42", "1:02:03"). */
export type DurationStyle = "narrow" | "short" | "long" | "digital";

// Off `globalThis`, so a call in Node or a worker, which has no document,
// writes in the platform's language.
const page = (locale: string | undefined): string | undefined => {
  const doc = (globalThis as { readonly document?: Document }).document;
  return locale ?? (doc === undefined ? undefined : localeOf(doc.documentElement));
};

/**
 * `n` in `locale` (default: the page's language, read at each call, else
 * the platform's) under `Intl.NumberFormat` `options`, never with a signed
 * zero: `signDisplay` "always" writes 0 as "0". An invalid option throws
 * Intl's RangeError.
 */
export function number(n: number, options: Intl.NumberFormatOptions = {}, locale?: string): string {
  return numbers(page(locale), {
    ...options,
    signDisplay: unsignedZero(options.signDisplay, false),
  }).format(n);
}

/** `n` and the noun `unit` gives it by `Intl.PluralRules`, joined by a
 *  no-break space: "3 runs". */
export function count(n: number, unit: Unit, locale?: string): string {
  const l = page(locale);
  return withNoun(number(n, undefined, l), noun(unit, n, l));
}

/** `ratio` of a whole as a percentage of two significant digits, so no
 *  share above 0 reads "0%", and a share below 1 never reads "100%". */
export function percent(ratio: number, locale?: string): string {
  return shares(page(locale))(ratio);
}

const BYTES = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte", "petabyte"] as const;

const byteDigits = (at: number): number => (at === 0 ? 0 : 1);

// The unit is picked from the value as Intl rounds it to print, so a size
// never reads "1,000.0 kB": the pick and the printed digits cannot disagree.
const rounded = (v: number, digits: number): number =>
  Number(
    numbers("en", {
      useGrouping: false,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v),
  );

/**
 * `n` bytes in decimal units with the locale's unit words: whole bytes,
 * else one fraction digit at the largest unit up to a petabyte that keeps
 * the rounded value under 1,000 ("999 byte", "1.0 kB", "999.9 MB"). A
 * negative size keeps its sign; a value that is not finite is written as
 * Intl writes it.
 */
export function bytes(n: number, locale?: string): string {
  const size = Math.abs(n);
  let at = 0;
  while (at < BYTES.length - 1 && size >= 1_000 ** (at + 1)) {
    at++;
  }
  while (at < BYTES.length - 1 && rounded(size / 1_000 ** at, byteDigits(at)) >= 1_000) {
    at++;
  }
  const digits = byteDigits(at);
  return keepUnit(
    numbers(page(locale), {
      style: "unit",
      unit: BYTES[at],
      unitDisplay: "short",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: unsignedZero(undefined, false),
    }).format(n / 1_000 ** at),
  );
}

/**
 * `ms` milliseconds in `style` (default "short"). The word styles write the
 * largest unit and, while its count is under 10, the next one ("1 min, 27
 * sec", "18 min", "0 ms"); "digital" writes a clock, "0:42" under an hour
 * and "1:02:03" from one, its seconds cut toward 0. Throws a RangeError for
 * a value that is not finite.
 */
export function duration(ms: number, style: DurationStyle = "short", locale?: string): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`format: ${String(ms)} is not a duration`);
  }
  const l = page(locale);
  return style === "digital" ? clockWords(ms, l) : durationWords(durationRecord(ms), style, l);
}

/**
 * `at` in `style` (default "datetime"), every part joined by a no-break
 * space: "date" is the medium date, "time" the short time, "datetime" both,
 * and "near" the short time today, else the day, the short month (with the
 * year outside this year) and the time. Throws Intl's RangeError for an
 * invalid date.
 */
export function date(at: Date | number, style: DateStyle = "datetime", locale?: string): string {
  return dateWords(at, style, page(locale));
}

const toMs = (at: Date | number): number => {
  const ms = typeof at === "number" ? at : at.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("format: not a valid date");
  }
  return ms;
};

/** How long ago or ahead `at` is in the locale's words: "4m ago", "in 25m",
 *  "1d ago", or "now" under a minute. Throws a TypeError for an invalid
 *  date. */
export function relative(at: Date | number, options: RelativeOptions = {}): string {
  const { now = Date.now(), style = "narrow", locale } = options;
  return relativeWords(toMs(at), toMs(now), style, page(locale));
}
