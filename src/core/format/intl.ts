/**
 * intl.ts — the `Intl` writers behind `@cplieger/ui/format` and the chart's
 * scales, each in the locale its caller resolved (`undefined` is Intl's own).
 * @internal
 * @module
 */

/** A noun by plural category, as `Intl.PluralRules` picks it. */
export type Unit = { readonly other: string } & Readonly<
  Partial<Record<Intl.LDMLPluralRule, string>>
>;

/** Which parts of a moment `date` writes; see `docs/core/format.md`. */
export type DateStyle = "date" | "time" | "datetime" | "near";

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

export const numbers = (locale: string | undefined, options: Intl.NumberFormatOptions = {}) =>
  cached(
    `n|${locale ?? ""}|${JSON.stringify(options, optionKey)}`,
    () => new Intl.NumberFormat(locale, options),
  );

/** `display` with no signed zero: "always" is "exceptZero", "auto"
 *  "exceptZero" when `signed` and "negative" when not. */
export function unsignedZero(
  display: Intl.NumberFormatOptions["signDisplay"],
  signed: boolean,
): Intl.NumberFormatOptions["signDisplay"] {
  // Only "always" and "auto" sign a zero; any other value, an invalid one
  // included, reaches Intl as given, which throws a RangeError on the invalid.
  const own = display ?? "auto";
  return own === "always"
    ? "exceptZero"
    : own === "auto"
      ? signed
        ? "exceptZero"
        : "negative"
      : own;
}

type DurationUnit = "days" | "hours" | "minutes" | "seconds";

const DURATION_UNITS = [
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
  const at = DURATION_UNITS.findIndex(([, size]) => abs >= size);
  if (at === -1) {
    return { milliseconds: sign * abs || 0 };
  }
  const [big, bigSize] = DURATION_UNITS[at] ?? DURATION_UNITS[0];
  const next = DURATION_UNITS[at + 1];
  if (abs / bigSize >= 10 || next === undefined) {
    const count = Math.round(abs / bigSize);
    const up = DURATION_UNITS[at - 1];
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

export const pluralRules = (locale: string | undefined) =>
  cached(`p|${locale ?? ""}`, () => new Intl.PluralRules(locale));

const NUMBER_PARTS = new Set([
  "integer",
  "group",
  "decimal",
  "fraction",
  "minusSign",
  "plusSign",
  "nan",
  "infinity",
]);

/** `parts` joined, a space between a unit and a number on either side of it
 *  made non-breaking: "1.0 MB" and Swahili's "MB 1.0". */
export function bindUnit(parts: readonly Intl.NumberFormatPart[]): string {
  const gap = (a: Intl.NumberFormatPart | undefined, b: Intl.NumberFormatPart | undefined) =>
    a?.type === "unit" && b !== undefined && NUMBER_PARTS.has(b.type);
  return parts
    .map((p, i) =>
      p.type === "literal" &&
      p.value.trim() === "" &&
      (gap(parts[i - 1], parts[i + 1]) || gap(parts[i + 1], parts[i - 1]))
        ? p.value.replaceAll(" ", NBSP)
        : p.value,
    )
    .join("");
}

/** `record` in Intl.DurationFormat's `style`. */
export function durationWords(
  record: Partial<Record<Intl.DurationFormatUnit, number>>,
  style: "narrow" | "short" | "long",
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
  // A literal tagged with a unit sits inside one number-and-unit element; a
  // list literal, such as ", " or Swahili's " na ", has no unit and may break.
  return df
    .formatToParts(record)
    .map((p) =>
      p.type === "literal" && p.unit !== undefined ? p.value.replaceAll(" ", NBSP) : p.value,
    )
    .join("");
}

/** `ms` as a clock, "0:42" under an hour and "1:02:03" from one, its days
 *  folded into hours and its seconds cut toward 0. */
export function clockWords(ms: number, locale: string | undefined): string {
  const sign = ms < 0 ? -1 : 1;
  const s = Math.trunc(Math.abs(ms) / 1_000);
  const hours = Math.trunc(s / 3_600);
  const minutes = Math.trunc(s / 60) % 60;
  const seconds = s % 60;
  // `style: "digital"` writes "00:42" without hours: ECMA-402 makes minutes
  // 2-digit after a numeric hours style, shown or not
  // (https://tc39.es/ecma402/#sec-getdurationunitoptions).
  const df = cached(`c|${locale ?? ""}|${String(hours > 0)}`, () =>
    hours > 0
      ? new Intl.DurationFormat(locale, { style: "digital" })
      : new Intl.DurationFormat(locale, { minutes: "numeric", seconds: "2-digit" }),
  );
  return df.format(
    hours > 0
      ? { hours: sign * hours, minutes: sign * minutes, seconds: sign * seconds }
      : { minutes: sign * minutes, seconds: sign * seconds },
  );
}

/** `unit`'s noun for `count` in `locale`. */
export function noun(unit: Unit, count: number, locale: string | undefined): string {
  return unit[pluralRules(locale).select(count)] ?? unit.other;
}

/** A written number and its noun, joined by a non-breaking space. */
export const withNoun = (value: string, word: string): string => `${value}${NBSP}${word}`;

/**
 * A share of a whole in `locale`: a percentage of two significant digits,
 * each share rounded alone, so no share above 0 reads "0%"; a share below 1
 * that would read as the whole takes three, cut toward 0, so it never reads
 * "100%".
 */
export const shares = (locale: string | undefined): ((share: number) => string) =>
  cached(`s|${locale ?? ""}`, () => {
    const signDisplay = unsignedZero(undefined, false);
    const two = numbers(locale, { style: "percent", maximumSignificantDigits: 2, signDisplay });
    const three = numbers(locale, {
      style: "percent",
      maximumSignificantDigits: 3,
      roundingMode: "trunc",
      signDisplay,
    });
    const whole = two.format(1);
    return (v: number) => {
      const text = two.format(v);
      return v < 1 && text === whole ? three.format(v) : text;
    };
  });

export const dates = (
  locale: string | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
) =>
  cached(
    `t|${locale ?? ""}|${timeZone ?? ""}|${JSON.stringify(options)}`,
    () =>
      new Intl.DateTimeFormat(locale, timeZone === undefined ? options : { ...options, timeZone }),
  );

const DATE_STYLES = {
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
} as const satisfies Record<Exclude<DateStyle, "near">, Intl.DateTimeFormatOptions>;

// A components bag's hour: "numeric" writes en-GB's morning as "9:30" where
// its short time writes "09:30", so take the digits the short time shows.
const hourDigits = (locale: string | undefined): "numeric" | "2-digit" =>
  cached(`h|${locale ?? ""}`, () =>
    dates(locale, undefined, DATE_STYLES.time)
      .formatToParts(new Date(2000, 0, 1, 9, 5))
      .find((part) => part.type === "hour")?.value.length === 2
      ? "2-digit"
      : "numeric",
  );

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// The year as the locale's calendar writes it, era or cycle name included:
// a Persian, Japanese or Chinese year turns on another day than 1 January.
const sameYear = (a: Date, b: Date, locale: string | undefined): boolean => {
  const year = dates(locale, undefined, { year: "numeric" });
  return year.format(a) === year.format(b);
};

function nearParts(at: Date, locale: string | undefined): Intl.DateTimeFormatOptions {
  const now = new Date();
  if (sameDay(at, now)) {
    return DATE_STYLES.time;
  }
  return {
    day: "numeric",
    month: "short",
    ...(sameYear(at, now, locale) ? {} : { year: "numeric" }),
    hour: hourDigits(locale),
    minute: "2-digit",
  };
}

/** `at` in `style`, its plain spaces made non-breaking; throws Intl's
 *  RangeError for an invalid date. */
export function dateWords(at: Date | number, style: DateStyle, locale: string | undefined): string {
  const options = style === "near" ? nearParts(new Date(at), locale) : DATE_STYLES[style];
  return dates(locale, undefined, options).format(at).replaceAll(" ", NBSP);
}

// Each unit's length in seconds, largest first, as a calendar-free count.
const LENGTHS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

/** Each relative unit, its length in seconds and the age it starts at: half
 *  a smaller unit before the smaller's rounded count would reach one of it,
 *  so "60 minutes ago" and "12 months ago" never show. The minute starts at
 *  a minute. */
export const RELATIVE_UNITS = LENGTHS.map(([unit, n], i) => {
  const next = LENGTHS[i + 1]?.[1];
  return [unit, n, next === undefined ? n : (Math.round(n / next) - 0.5) * next] as const;
});

const relativeFormat = (
  locale: string | undefined,
  style: Intl.RelativeTimeFormatStyle,
  numeric: "auto" | "always",
) =>
  cached(
    `r|${locale ?? ""}|${style}|${numeric}`,
    () => new Intl.RelativeTimeFormat(locale, { style, numeric }),
  );

type RelativeParts = readonly Intl.RelativeTimeFormatPart[];

// The indexes of the parts just before and after the number; -1 for a form
// with no number, such as "yesterday".
function besideNumber(parts: RelativeParts): readonly [number, number] {
  const first = parts.findIndex((p) => p.type !== "literal");
  return first === -1
    ? [-1, -1]
    : [first - 1, parts.findLastIndex((p) => p.type !== "literal") + 1];
}

// Which side of the number the unit word sits on, per locale, style and
// direction: of 4 minutes and 4 hours, the side whose literal differs.
const unitSide = (locale: string | undefined, style: Intl.RelativeTimeFormatStyle, past: boolean) =>
  cached(`u|${locale ?? ""}|${style}|${String(past)}`, () => {
    const rf = relativeFormat(locale, style, "always");
    const minute = rf.formatToParts(past ? -4 : 4, "minute");
    const hour = rf.formatToParts(past ? -4 : 4, "hour");
    const [mb, ma] = besideNumber(minute);
    const [hb, ha] = besideNumber(hour);
    return {
      before: minute[mb]?.value !== hour[hb]?.value,
      after: minute[ma]?.value !== hour[ha]?.value,
    };
  });

/** `parts` joined, the space between the number and its unit word made
 *  non-breaking: "4 minutes ago", "il y a 4 minutes", Swahili's "dakika 4
 *  zilizopita". */
function bindRelative(
  parts: RelativeParts,
  side: { readonly before: boolean; readonly after: boolean },
): string {
  const [before, after] = besideNumber(parts);
  return parts
    .map((p, i) =>
      i === before && side.before
        ? p.value.replace(/ $/u, NBSP)
        : i === after && side.after
          ? p.value.replace(/^ /u, NBSP)
          : p.value,
    )
    .join("");
}

/** How long ago or ahead of `now` instant `at` is, both in ms: the largest
 *  unit `RELATIVE_UNITS` lets fit, rounded, its number bound to its unit,
 *  or the locale's "now" under a minute. */
export function relativeWords(
  at: number,
  now: number,
  style: Intl.RelativeTimeFormatStyle,
  locale: string | undefined,
): string {
  const s = Math.round((at - now) / 1000);
  for (const [unit, n, from] of RELATIVE_UNITS) {
    if (Math.abs(s) >= from) {
      // A compact form reads as a number: "1d ago", never "yesterday".
      const numeric = style === "long" ? "auto" : "always";
      const parts = relativeFormat(locale, style, numeric).formatToParts(Math.round(s / n), unit);
      return bindRelative(parts, unitSide(locale, style, s < 0));
    }
  }
  return relativeFormat(locale, style, "auto").format(0, "second");
}
