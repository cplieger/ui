/**
 * format.ts — how the chart and the sparkline write numbers, durations,
 * instants and units, each through `Intl` in one locale.
 * @module
 */

/** How a scale writes its values; see `docs/data/chart.md` "Formats". */
export type Format =
  | "number"
  | "integer"
  | "percent"
  | "duration"
  | Intl.NumberFormatOptions
  | ((value: number) => string);

/** A noun by plural category, as `Intl.PluralRules` picks it. */
export type Unit = { readonly other: string } & Readonly<
  Partial<Record<Intl.LDMLPluralRule, string>>
>;

const NBSP = "\u00A0";

// Intl objects are slow to build and a chart writes thousands of values.
const cache = new Map<string, unknown>();

function cached<T>(key: string, make: () => T): T {
  let hit = cache.get(key) as T | undefined;
  if (hit === undefined) {
    hit = make();
    cache.set(key, hit);
  }
  return hit;
}

const numbers = (locale: string | undefined, options: Intl.NumberFormatOptions = {}) =>
  cached(
    `n|${locale ?? ""}|${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(locale, options),
  );

/** The writer `format` names, in `locale`; "number" when it is undefined. */
export function formatter(
  format: Format | undefined,
  locale: string | undefined,
): (value: number) => string {
  if (typeof format === "function") {
    return format;
  }
  if (typeof format === "object") {
    const nf = numbers(locale, format);
    return (v) => nf.format(v);
  }
  switch (format) {
    case undefined:
    case "number": {
      const nf = numbers(locale);
      return (v) => nf.format(v);
    }
    case "integer": {
      const nf = numbers(locale, { maximumFractionDigits: 0 });
      return (v) => nf.format(v);
    }
    case "percent": {
      const nf = numbers(locale, { style: "percent" });
      return (v) => nf.format(v);
    }
    case "duration":
      return (v) => formatDuration(v, locale);
  }
}

type DurationUnit = "days" | "hours" | "minutes" | "seconds";

const UNITS = [
  ["days", 86_400_000],
  ["hours", 3_600_000],
  ["minutes", 60_000],
  ["seconds", 1_000],
] as const satisfies readonly (readonly [DurationUnit, number])[];

/**
 * The record `ms` is written from: milliseconds under one second; else the
 * largest unit and, while its count is under 10, the next one, each whole and
 * a zero dropped. Rounding carries, so 59_600 is one minute.
 */
export function durationRecord(ms: number): Partial<Record<DurationUnit | "milliseconds", number>> {
  const sign = ms < 0 ? -1 : 1;
  const abs = Math.round(Math.abs(ms));
  const at = UNITS.findIndex(([, size]) => abs >= size);
  if (at === -1) {
    return { milliseconds: sign * abs || 0 };
  }
  const [big, bigSize] = UNITS[at] ?? UNITS[0];
  const next = UNITS[at + 1];
  if (abs / bigSize >= 10 || next === undefined) {
    const count = Math.round(abs / bigSize);
    const up = UNITS[at - 1];
    // A carry past the next unit up, such as 23.6 hours to a day, starts over there.
    return up !== undefined && count * bigSize >= up[1]
      ? durationRecord(sign * count * bigSize)
      : { [big]: sign * count };
  }
  const [small, smallSize] = next;
  const total = Math.round(abs / smallSize);
  const per = bigSize / smallSize;
  const whole = Math.floor(total / per);
  const rest = total - whole * per;
  return whole >= 10
    ? durationRecord(sign * whole * bigSize)
    : rest === 0
      ? { [big]: sign * whole }
      : { [big]: sign * whole, [small]: sign * rest };
}

/** A plain space between a number and the word after it, made non-breaking. */
export const keepUnit = (text: string): string => text.replace(/(\p{Nd}) (?=\p{L})/gu, `$1${NBSP}`);

/** `ms` by the duration rule, in `Intl.DurationFormat`'s short style. */
export function formatDuration(ms: number, locale: string | undefined): string {
  const record = durationRecord(ms);
  // The style's "auto" display writes nothing for a lone zero.
  const zero = record.milliseconds === 0;
  const df = cached(
    `d|${locale ?? ""}|${String(zero)}`,
    () =>
      new Intl.DurationFormat(locale, {
        style: "short",
        ...(zero ? { millisecondsDisplay: "always" as const } : {}),
      }),
  );
  return keepUnit(df.format(record));
}

/** `unit`'s noun for `count` in `locale`. */
export function noun(unit: Unit, count: number, locale: string | undefined): string {
  const rules = cached(`p|${locale ?? ""}`, () => new Intl.PluralRules(locale));
  return unit[rules.select(count)] ?? unit.other;
}

/** A written number and its noun, joined by a non-breaking space. */
export const withNoun = (value: string, word: string): string => `${value}${NBSP}${word}`;

const dates = (
  locale: string | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
) =>
  cached(
    `t|${locale ?? ""}|${timeZone ?? ""}|${JSON.stringify(options)}`,
    () =>
      new Intl.DateTimeFormat(locale, timeZone === undefined ? options : { ...options, timeZone }),
  );

const HOUR = { hour: "numeric" } as const;
const MINUTE = { hour: "numeric", minute: "2-digit" } as const;
const DAY = { month: "short", day: "numeric" } as const;

/** An instant in the summary, the readings and the table: its hour and
 *  minute, with its month and day when `days` is set. */
export function instantFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  days: boolean,
): (ms: number) => string {
  const df = dates(locale, timeZone, days ? { ...DAY, ...MINUTE } : MINUTE);
  return (ms) => df.format(ms);
}

/** Both ends of a span of instants as `instantFormat` writes them, the end
 *  without its date when it falls on the start's day ("Nov 10, 12:00 PM" and
 *  "1:00 PM"). */
export function spanFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  days: boolean,
): (from: number, to: number) => readonly [string, string] {
  const at = instantFormat(locale, timeZone, days);
  if (!days) {
    return (from, to) => [at(from), at(to)];
  }
  const day = dates(locale, timeZone, DAY);
  const time = dates(locale, timeZone, MINUTE);
  return (from, to) => [at(from), day.format(from) === day.format(to) ? time.format(to) : at(to)];
}

/** A time tick's two lines for ticks `stepMs` apart: `time`, absent for a
 *  step of a day or more, and `date`, which the axis writes at its first tick
 *  and where the day changes. */
export function tickFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  stepMs: number,
): { readonly time: ((ms: number) => string) | undefined; readonly date: (ms: number) => string } {
  const day = dates(locale, timeZone, DAY);
  const date = (ms: number): string => day.format(ms);
  if (stepMs >= 86_400_000) {
    return { time: undefined, date };
  }
  const tf = dates(locale, timeZone, stepMs >= 3_600_000 ? HOUR : MINUTE);
  return { time: (ms) => tf.format(ms), date };
}
