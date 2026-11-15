/**
 * format.ts — how the chart and the sparkline write numbers, durations,
 * instants and units, each through `Intl` in one locale.
 * @module
 */

import { dateAt, grainBefore, type Grain, type TimeUnit } from "./time.js";

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

// JSON writes NaN and the infinities as null, which Intl reads as 0.
const optionKey = (_: string, v: unknown): unknown =>
  typeof v === "number" && !Number.isFinite(v) ? String(v) : v;

const numbers = (locale: string | undefined, options: Intl.NumberFormatOptions = {}) =>
  cached(
    `n|${locale ?? ""}|${JSON.stringify(options, optionKey)}`,
    () => new Intl.NumberFormat(locale, options),
  );

const PRESETS = {
  number: {},
  integer: { maximumFractionDigits: 0 },
  percent: { style: "percent" },
} as const satisfies Record<string, Intl.NumberFormatOptions>;

const preset = (format: Format | undefined): Intl.NumberFormatOptions | undefined =>
  format === undefined
    ? PRESETS.number
    : typeof format === "string" && format !== "duration"
      ? PRESETS[format]
      : undefined;

/** How `writer` writes beyond its format. */
interface Writing {
  /** The least and most fraction digits "number" and "percent" write (a
   *  percent's counted on the share, so 0.005 has three), such as a linear
   *  axis's ticks; past 100, Intl's most, every value in scientific notation
   *  with its digits up to the most, at most 15 significant figures, and 0
   *  as 0. Any other format keeps its own. */
  readonly digits?: readonly [least: number, most: number];
  /** A sign on every value not written as 0, such as a change. */
  readonly signed?: boolean;
}

// Intl.NumberFormat's fraction-digit limit (ECMA-402 since 2023).
const MOST_DIGITS = 100;

/**
 * The one way the chart and the sparkline write a number: `format` in
 * `locale`, "number" when undefined, never with a signed zero. A number
 * format's own `signDisplay` is kept unless it signs a zero: "always"
 * becomes "exceptZero", and "auto" (the default) "exceptZero" when `signed`
 * and "negative" when not. When `signed`, a duration gets a "+" before a
 * value it writes above 0 ms, and a function's string, as it is, before a
 * positive value's text unless it has one.
 */
export function writer(
  format: Format | undefined,
  locale: string | undefined,
  { digits, signed = false }: Writing = {},
): (value: number) => string {
  if (typeof format === "function" || format === "duration") {
    const write = typeof format === "function" ? format : (v: number) => formatDuration(v, locale);
    // `durationRecord` rounds |v| half up to whole ms, so the plus starts at 0.5.
    const positive = typeof format === "function" ? (v: number) => v > 0 : (v: number) => v >= 0.5;
    return signed
      ? (v) => {
          const text = write(v);
          return positive(v) && !text.startsWith("+") ? `+${text}` : text;
        }
      : write;
  }
  const own: Intl.NumberFormatOptions =
    typeof format === "object" ? format : PRESETS[format ?? "number"];
  const display = own.signDisplay ?? "auto";
  // Only "always" and "auto" sign a zero; any other value, an invalid one
  // included, reaches Intl as given, which throws a RangeError on the invalid.
  const base = {
    ...own,
    signDisplay:
      display === "always"
        ? ("exceptZero" as const)
        : display === "auto"
          ? signed
            ? ("exceptZero" as const)
            : ("negative" as const)
          : display,
  };
  if (
    digits === undefined ||
    (format !== undefined && format !== "number" && format !== "percent")
  ) {
    const nf = numbers(locale, base);
    return (v) => nf.format(v);
  }
  const [least, most] = digits;
  const shift = format === "percent" ? 2 : 0;
  const share = (d: number) => Math.max(0, d - shift);
  const fine = Math.max(least, most);
  if (share(fine) > MOST_DIGITS) {
    // Fifteen figures name the decimal a double was read from. Intl writes 0 as 0E0.
    const zero = numbers(locale, base);
    const figures = (n: number) =>
      numbers(locale, { ...base, notation: "scientific", maximumSignificantDigits: n });
    return (v) => {
      if (v === 0) {
        return zero.format(v);
      }
      const [lead = "", exp = ""] = v.toExponential().split("e");
      // The figures down to the 10^-fine digit, the share's place even under "percent".
      const n = fine + Number(exp) + 1;
      if (n >= 1) {
        return figures(Math.min(15, n)).format(v);
      }
      // Under the 10^-fine digit: rounds half away from 0, as Intl does.
      return n === 0 && Math.abs(Number(lead)) >= 5
        ? figures(1).format(Math.sign(v) * Number(`1e-${fine}`))
        : zero.format(0);
    };
  }
  const nf = numbers(locale, {
    ...base,
    minimumFractionDigits: share(least),
    maximumFractionDigits: share(fine),
  });
  return (v) => nf.format(v);
}

/** A number whose texts under one format all have the same width when every
 *  digit is as wide as another; `NaN` for a value whose text must be written.
 *  A key is an integer under 2^50, so a caller can fold three bits more in. */
export type WidthKey = (value: number) => number;

// Past 2^53 a scaled value's last digits are lost, and so is its key.
const EXACT = 2 ** 53;
// A scaled value within this share of itself from a half, but not on one,
// may round either way: Intl rounds the shortest decimal that reads back as
// the value, which the binary product can put on the other side.
const NEAR = 1e-14;

/**
 * The width key of `writer(format, locale)`'s texts, signed or not: for a
 * number its sign, zero, integer digits and fraction digits shown, which fix
 * the text's separators and affixes; for a duration its units, each count's
 * digits and plural form, and whether it is above, below or at 0. Undefined
 * for a function, a notation other than standard, significant-digit or
 * uneven rounding, and a style whose words follow the count, none of which a
 * key can read.
 */
export function widthKey(
  format: Format | undefined,
  locale: string | undefined,
): WidthKey | undefined {
  if (format === "duration") {
    return durationKey(locale);
  }
  const options = typeof format === "object" ? format : preset(format);
  if (options === undefined) {
    return undefined;
  }
  const r = numbers(locale, options).resolvedOptions();
  const counted = r.style === "unit" || (r.style === "currency" && r.currencyDisplay === "name");
  if (
    r.notation !== "standard" ||
    counted ||
    r.maximumSignificantDigits !== undefined ||
    r.roundingPriority !== "auto" ||
    r.roundingIncrement !== 1 ||
    r.roundingMode !== "halfExpand"
  ) {
    return undefined;
  }
  const scale = r.style === "percent" ? 100 : 1;
  const most = r.maximumFractionDigits ?? 3;
  const least = r.minimumFractionDigits ?? 0;
  const unit = 10 ** most;
  const strip = r.trailingZeroDisplay === "stripIfInteger";
  return (v) => {
    const scaled = Math.abs(v) * scale * unit;
    const half = Math.abs((scaled % 1) - 0.5);
    if (!(scaled < EXACT) || (half !== 0 && half < scaled * NEAR)) {
      return Number.NaN;
    }
    const n = Math.round(scaled);
    const whole = Math.floor(n / unit);
    const digits = digitCount(whole);
    let rest = n - whole * unit;
    let shown = rest === 0 ? (strip ? 0 : least) : most;
    while (rest !== 0 && rest % 10 === 0 && shown > least) {
      rest /= 10;
      shown--;
    }
    const sign = n === 0 ? 1 : v < 0 ? 2 : 0;
    return (digits * 32 + shown) * 4 + sign;
  };
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

const FIELDS = ["days", "hours", "minutes", "seconds", "milliseconds"] as const;
const FORMS = ["zero", "one", "two", "few", "many", "other"] as const;

const pluralRules = (locale: string | undefined) =>
  cached(`p|${locale ?? ""}`, () => new Intl.PluralRules(locale));

// The digits of whole number `n`, which with the locale fix its separators.
function digitCount(n: number): number {
  let digits = 1;
  for (let w = n; w >= 10; w = Math.floor(w / 10)) {
    digits++;
  }
  return digits;
}

// A count's text is its digits and its unit's plural form, so a record's
// width is fixed by its units and those, but for a signed writer's "+" on a
// record above 0; a record of zero is written unsigned, so 0.3 writes "0 ms".
function durationKey(locale: string | undefined): WidthKey {
  const rules = pluralRules(locale);
  const forms = new Map<number, number>();
  const count = (n: number) => {
    let form = forms.get(n);
    if (form === undefined) {
      form = FORMS.indexOf(rules.select(n));
      forms.set(n, form);
    }
    return digitCount(n) * FORMS.length + form;
  };
  return (v) => {
    const record = durationRecord(v);
    const at = FIELDS.findIndex((unit) => record[unit] !== undefined);
    const next = FIELDS[at + 1];
    const big = record[FIELDS[at] ?? "milliseconds"] ?? 0;
    if (!Number.isFinite(big)) {
      return Number.NaN;
    }
    const small = next === undefined ? undefined : record[next];
    // `durationRecord` keeps the smaller count under 60, so `rest` is at most 18.
    const rest = small === undefined ? 0 : count(Math.abs(small)) + 1;
    const k = ((count(Math.abs(big)) * 19 + rest) * FIELDS.length + at) * 3;
    return k + (big > 0 ? 1 : big < 0 ? 2 : 0);
  };
}

/** A plain space between a number and the word after it, made non-breaking. */
export const keepUnit = (text: string): string => text.replace(/(\p{Nd}) (?=\p{L})/gu, `$1${NBSP}`);

// `record` in Intl.DurationFormat's `style`.
function durationWords(
  record: Partial<Record<Intl.DurationFormatUnit, number>>,
  style: "short" | "long",
  locale: string | undefined,
): string {
  // The style's "auto" display writes nothing for a lone zero.
  const zero = record.milliseconds === 0;
  const df = cached(
    `d|${locale ?? ""}|${style}|${String(zero)}`,
    () =>
      new Intl.DurationFormat(locale, {
        style,
        ...(zero ? { millisecondsDisplay: "always" as const } : {}),
      }),
  );
  return keepUnit(df.format(record));
}

// `ms` by the duration rule, in the short style.
const formatDuration = (ms: number, locale: string | undefined): string =>
  durationWords(durationRecord(ms), "short", locale);

/** `count` whole grains as a step, "1 month" or "7 days", in the long style,
 *  since the short one's "mth" and French "m." read as minutes. */
export const grainStep = (
  count: number,
  grain: Exclude<Grain, "minute">,
  locale: string | undefined,
): string => durationWords({ [`${grain}s`]: count }, "long", locale);

/** `unit`'s noun for `count` in `locale`. */
export function noun(unit: Unit, count: number, locale: string | undefined): string {
  return unit[pluralRules(locale).select(count)] ?? unit.other;
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

const writes =
  (df: Intl.DateTimeFormat) =>
  (ms: number): string =>
    df.format(dateAt(ms, "an instant the chart writes"));

const HOUR = { hour: "numeric" } as const;
const MINUTE = { hour: "numeric", minute: "2-digit" } as const;
const DAY = { month: "short", day: "numeric" } as const;

/** How much of a date an instant's words carry: its time alone, with its
 *  month and day, with its year too, or with its era as well. */
export type Reach = "time" | "day" | "year" | "era";

const DATE_PARTS: Readonly<Record<Reach, Intl.DateTimeFormatOptions>> = {
  time: {},
  day: DAY,
  year: { ...DAY, year: "numeric" },
  era: { ...DAY, year: "numeric", era: "short" },
};

function grainParts(reach: Reach, grain: Grain): Intl.DateTimeFormatOptions {
  if (grain === "minute") {
    return { ...DATE_PARTS[reach], ...MINUTE };
  }
  if (grain === "day") {
    return DATE_PARTS[reach === "time" ? "day" : reach];
  }
  // A month without its year reads as every March.
  return {
    ...(grain === "month" ? { month: "short" } : {}),
    year: "numeric",
    ...(reach === "era" ? { era: "short" } : {}),
  };
}

/** An instant in the summary, the readings and the table: at a "minute"
 *  grain its hour and minute with as much of its date as `reach` asks; else
 *  the date ("Mar 4", its year as `reach` asks), the month ("Mar 2023") or
 *  the year it starts. */
export function instantFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  reach: Reach,
  grain: Grain = "minute",
): (ms: number) => string {
  return writes(dates(locale, timeZone, grainParts(reach, grain)));
}

/** A written instant and the instant it names. */
interface Written {
  readonly at: number;
  readonly text: string;
}

/** A span as one or two written instants. */
export type Span = readonly [Written] | readonly [Written, Written];

/** A span of instants as `instantFormat` writes them. At a "minute" grain
 *  both ends, the end without its date when it falls on the start's day
 *  ("Nov 10, 12:00 PM" and "1:00 PM"). At a coarser grain an `open` span,
 *  a bucket from `from` up to `to`, ends at the last grain it covers and is
 *  that grain alone when it covers one ("Mar 2023"). */
export function spanFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  reach: Reach,
  grain: Grain = "minute",
): (from: number, to: number, open?: boolean) => Span {
  const at = instantFormat(locale, timeZone, reach, grain);
  const written = (t: number, text = at(t)): Written => ({ at: t, text });
  if (grain !== "minute") {
    return (from, to, open = false) => {
      const end = open ? grainBefore(to, grain, timeZone) : to;
      return end <= from ? [written(from)] : [written(from), written(end)];
    };
  }
  if (reach === "time") {
    return (from, to) => [written(from), written(to)];
  }
  const day = writes(dates(locale, timeZone, DATE_PARTS[reach]));
  const time = writes(dates(locale, timeZone, MINUTE));
  return (from, to) => [written(from), written(to, day(from) === day(to) ? time(to) : at(to))];
}

const TICK_PARTS: Readonly<
  Record<TimeUnit, readonly [Intl.DateTimeFormatOptions | undefined, Intl.DateTimeFormatOptions]>
> = {
  minute: [MINUTE, DAY],
  hour: [HOUR, DAY],
  day: [undefined, DAY],
  month: [{ month: "short" }, { year: "numeric" }],
  year: [undefined, { year: "numeric" }],
};

/** A time tick's two lines for a step of `unit`: `fine`, the time or the
 *  month, absent for a day or a year step, and `coarse`, the date or the
 *  year, which the axis writes at its first tick and where it changes. A
 *  year carries its era when `era` is set. */
export function tickFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  unit: TimeUnit,
  era: boolean,
): {
  readonly fine: ((ms: number) => string) | undefined;
  readonly coarse: (ms: number) => string;
} {
  const [fine, coarse] = TICK_PARTS[unit];
  const year = era && "year" in coarse ? { ...coarse, era: "short" as const } : coarse;
  return {
    fine: fine === undefined ? undefined : writes(dates(locale, timeZone, fine)),
    coarse: writes(dates(locale, timeZone, year)),
  };
}
