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
 * the text's separators and affixes; for a duration the record it writes
 * and whether its count is above, below or at 0. Undefined for a function,
 * a notation other than standard, significant-digit or uneven rounding, and
 * a style whose words follow the count, none of which a key can read.
 */
export function widthKey(
  format: Format | undefined,
  locale: string | undefined,
): WidthKey | undefined {
  if (format === "duration") {
    return durationKey;
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
    let digits = 1;
    for (let w = whole; w >= 10; w = Math.floor(w / 10)) {
      digits++;
    }
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

// The text is the record's alone but for a signed writer's "+" on a record
// above 0; a record of zero is written unsigned, so 0.3 writes "0 ms".
function durationKey(v: number): number {
  const record = durationRecord(v);
  const at = FIELDS.findIndex((unit) => record[unit] !== undefined);
  const next = FIELDS[at + 1];
  const big = record[FIELDS[at] ?? "milliseconds"] ?? 0;
  // `* 60` holds the smaller count, which `durationRecord` keeps under 60.
  const small = next === undefined ? 0 : (record[next] ?? 0);
  const k = ((Math.abs(big) * 60 + Math.abs(small)) * FIELDS.length + at) * 3;
  const key = k + (big > 0 ? 1 : big < 0 ? 2 : 0);
  return key < 2 ** 50 ? key : Number.NaN;
}

/** A plain space between a number and the word after it, made non-breaking. */
export const keepUnit = (text: string): string => text.replace(/(\p{Nd}) (?=\p{L})/gu, `$1${NBSP}`);

// `ms` by the duration rule, in Intl.DurationFormat's short style.
function formatDuration(ms: number, locale: string | undefined): string {
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
