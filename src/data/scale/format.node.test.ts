import { describe, expect, it } from "vitest";

import {
  durationRecord,
  instantFormat,
  keepUnit,
  noun,
  spanFormat,
  tickFormat,
  widthKey,
  withNoun,
  writer,
} from "./format.js";

const short = (locale: string, record: Record<string, number>) =>
  new Intl.DurationFormat(locale, { style: "short" }).format(record);

describe("writer", () => {
  it("tells options of NaN or Infinity from null, which Intl reads as 0", () => {
    expect(writer({ maximumFractionDigits: null as never }, "en")(1.5)).toBe("2");
    expect(() => writer({ maximumFractionDigits: Number.NaN }, "en")).toThrow(RangeError);
    expect(() => writer({ maximumFractionDigits: Number.POSITIVE_INFINITY }, "en")).toThrow(
      RangeError,
    );
  });

  it("writes numbers by Intl's default, integers rounded half away from zero, and proportions as percents", () => {
    expect(writer(undefined, "en")(1234.5678)).toBe("1,234.568");
    expect(writer("number", "fr")(1234.5678)).toBe(new Intl.NumberFormat("fr").format(1234.5678));
    expect(writer("integer", "en")(2.5)).toBe("3");
    expect(writer("integer", "en")(-2.5)).toBe("-3");
    expect(writer("integer", "fr")(12345.4)).toBe(
      new Intl.NumberFormat("fr", { maximumFractionDigits: 0 }).format(12345),
    );
    expect(writer("percent", "en")(0.42)).toBe("42%");
    expect(writer("percent", "fr")(0.42)).toBe("42\u00A0%");
  });

  it("passes options to Intl.NumberFormat, uses a function's string, and writes durations", () => {
    const options = { style: "unit", unit: "megabyte" } as const;
    expect(writer(options, "en")(-3)).toBe(new Intl.NumberFormat("en", options).format(-3));
    expect(writer((v) => `v${String(v)}`, "en")(3)).toBe("v3");
    expect(writer("duration", "en")(87)).toBe("1\u00A0min, 27\u00A0sec");
  });

  it("writes a duration's seconds, as a frame carries them", () => {
    expect(writer("duration", "en")(90)).toBe("1\u00A0min, 30\u00A0sec");
    expect(writer("duration", "en")(0.4)).toBe("400\u00A0ms");
    expect(writer("duration", "en")(86_400)).toBe("1\u00A0day");
    expect(widthKey("duration", "en")?.(90)).toBe(widthKey("duration", "en")?.(80));
    expect(widthKey("duration", "en")?.(90)).not.toBe(widthKey("duration", "en")?.(0.09));
  });

  it("writes a value that rounds to 0 without a sign, in every number format", () => {
    expect(writer(undefined, "en")(-0.0001)).toBe("0");
    expect(writer("number", "en")(-0)).toBe("0");
    expect(writer("integer", "en")(-0.4)).toBe("0");
    expect(writer("integer", "en", { digits: [1, 1] })(-0.4)).toBe("0");
    expect(writer("percent", "en")(-0.001)).toBe("0%");
    expect(writer({ maximumFractionDigits: 1 }, "en", { digits: [0, 0] })(-0.01)).toBe("0");
    expect(writer({ style: "unit", unit: "celsius" }, "en")(-0.0001)).toBe("0°C");
    // Swedish writes its minus as U+2212.
    expect(writer(undefined, "sv")(-0.0001)).toBe("0");
    expect(writer(undefined, "sv")(-1)).toBe("\u22121");
    expect(writer("integer", "en")(-0.6)).toBe("-1");
  });

  it("keeps a format's own sign display unless it signs a zero", () => {
    expect(writer({ signDisplay: "always" }, "en")(3)).toBe("+3");
    expect([0, -0, 0.0001, -0.0001].map(writer({ signDisplay: "always" }, "en"))).toEqual([
      "0",
      "0",
      "0",
      "0",
    ]);
    expect(writer({ signDisplay: "auto" }, "en")(-0.0001)).toBe("0");
    expect(writer({ signDisplay: "never" }, "en")(-3)).toBe("3");
    expect(writer({ signDisplay: "exceptZero" }, "en")(3)).toBe("+3");
    expect(writer({ signDisplay: "negative" }, "en", { signed: true })(3)).toBe("3");
  });

  it("passes a sign display Intl does not know to Intl, which throws", () => {
    expect(() => writer({ signDisplay: "exceptzero" as never }, "en")).toThrow(RangeError);
  });
});

describe("writer with digits", () => {
  it("writes the fraction digits asked for, a percent's counted on the share", () => {
    expect([0, 0.5, 1].map(writer("number", "en", { digits: [1, 1] }))).toEqual([
      "0.0",
      "0.5",
      "1.0",
    ]);
    expect([0.37, 37.142857142857146].map(writer(undefined, "en", { digits: [0, 3] }))).toEqual([
      "0.37",
      "37.143",
    ]);
    expect(writer("percent", "en", { digits: [3, 3] })(0.005)).toBe("0.5%");
  });

  it("writes past Intl's 100 fraction digits in scientific notation, 0 as 0", () => {
    const write = writer("number", "en", { digits: [103, 103] });
    expect([0, 2.5e-102, 5e-102, 7.5e-102].map(write)).toEqual([
      "0",
      "2.5E-102",
      "5E-102",
      "7.5E-102",
    ]);
    expect(write(1.23456789012345e-102)).toBe("1.2E-102");
    expect(writer("number", "en", { digits: [116, 116] })(1.23456789012345e-102)).toBe(
      "1.23456789012345E-102",
    );
    // A key's pivot keeps its digits up to `most`, as under 100 digits.
    expect(writer(undefined, "en", { digits: [102, 105] })((260 / 7) * 1e-103)).toBe("3.714E-102");
    expect([4e-104, 6e-104, -6e-104].map(write)).toEqual(["0", "1E-103", "-1E-103"]);
    expect(writer("number", "en", { digits: [0, 101] })(1000)).toBe("1E3");
    const share = writer("percent", "en", { digits: [0, 103] });
    expect([0, 1e-103].map(share)).toEqual(["0%", "1E-101%"]);
    // 102 digits on the share are 100 on the percentage, within Intl's limit.
    expect(writer("percent", "en", { digits: [102, 102] })(1e-102)).toBe(`0.${"0".repeat(99)}1%`);
  });

  it("writes a value that rounds to 0 without a minus", () => {
    expect(writer(undefined, "en", { digits: [0, 3] })(-0.0001)).toBe("0");
    expect(writer(undefined, "en", { digits: [1, 4] })(-1e-7)).toBe("0.0");
    expect(writer(undefined, "en", { digits: [0, 3] })(-0.0005)).toBe("-0.001");
    expect(writer("percent", "en", { digits: [0, 3] })(-0.0001)).toBe("0%");
    expect(writer("number", "en", { digits: [1, 1] })(-0)).toBe("0.0");
    expect(writer("number", "en", { digits: [103, 103] })(-0)).toBe("0");
    expect(writer("number", "en", { digits: [103, 103] })(-4e-104)).toBe("0");
  });
});

describe("widthKey", () => {
  const shape = (t: string) => t.replace(/\p{Nd}/gu, "0");
  const values = [
    0, -0, 1, -1, 9, 10, 99.5, 999.4, 1_234.5, -12_345.678, 0.5, 0.05, 0.0004, 0.0005, 1.005,
    9.9996, 71.25, 1e9, 123_456_789.123, -0.0004, -0.4, -0.004,
  ];

  it.each([
    ["en", undefined],
    ["fr", "number"],
    ["de", "integer"],
    ["en", "percent"],
    ["hi", { maximumFractionDigits: 1 }],
    [
      "en",
      { minimumFractionDigits: 2, maximumFractionDigits: 2, trailingZeroDisplay: "stripIfInteger" },
    ],
    ["fr", { style: "currency", currency: "EUR" }],
    ["ar-EG", { useGrouping: "min2" }],
  ] as const)("gives texts of one width one key, in %s with %j", (locale, format) => {
    const key = widthKey(format, locale);
    expect(key).toBeDefined();
    for (const signed of [false, true]) {
      const write = writer(format, locale, { signed });
      const seen = new Map<number, string>();
      for (const v of values) {
        const k = key?.(v) ?? Number.NaN;
        if (!Number.isNaN(k)) {
          const s = seen.get(k) ?? shape(write(v));
          expect(shape(write(v)), String(v)).toBe(s);
          seen.set(k, s);
        }
      }
    }
  });

  it("tells apart texts of another width", () => {
    const key = widthKey(undefined, "en");
    expect(key?.(71.25)).not.toBe(key?.(50));
    expect(key?.(100)).not.toBe(key?.(50));
    expect(key?.(-5)).not.toBe(key?.(5));
    expect(key?.(0)).not.toBe(key?.(1));
    expect(key?.(-0.0001)).toBe(key?.(0));
  });

  // Durations are seconds.
  const SECOND = 1;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const durations = [
    0,
    -0,
    0.000_3,
    -0.000_3,
    0.000_4,
    0.000_5,
    0.000_6,
    0.999_4,
    0.999_6,
    1.234,
    1.456,
    9.999,
    12.345,
    -5,
    59.6,
    9_420.013,
    1_080_000,
    ...Array.from({ length: 1_000 }, (_, i) => i / 1_000),
    ...Array.from({ length: 120 }, (_, i) => (i + 1) * SECOND),
    ...Array.from({ length: 540 }, (_, i) => (1 + Math.floor(i / 60)) * MINUTE + (i % 60) * SECOND),
    ...Array.from({ length: 540 }, (_, i) => (1 + Math.floor(i / 60)) * HOUR + (i % 60) * MINUTE),
    ...Array.from({ length: 216 }, (_, i) => (1 + Math.floor(i / 24)) * DAY + (i % 24) * HOUR),
    ...Array.from({ length: 300 }, (_, i) => (10 + i * 7) * DAY),
  ];

  it.each(["en", "fr", "ru", "pl", "ar", "cy", "ar-EG", "ja"])(
    "gives durations of one width one key, in %s",
    (locale) => {
      const key = widthKey("duration", locale);
      expect(key).toBeDefined();
      for (const signed of [false, true]) {
        const write = writer("duration", locale, { signed });
        const seen = new Map<number, string>();
        for (const v of [...durations, ...durations.map((d) => -d)]) {
          const k = key?.(v) ?? Number.NaN;
          expect(k, String(v)).not.toBeNaN();
          const s = seen.get(k) ?? shape(write(v));
          expect(shape(write(v)), String(v)).toBe(s);
          seen.set(k, s);
        }
      }
    },
  );

  it("keys a duration by its units, each count's digits and plural form, and its sign", () => {
    const key = widthKey("duration", "en");
    expect(key?.(0.1)).toBe(key?.(0.999));
    expect(key?.(2 * SECOND)).toBe(key?.(9 * SECOND));
    expect(key?.(2 * HOUR + 37 * MINUTE)).toBe(key?.(9 * HOUR + 12 * MINUTE));
    expect(key?.(0.099)).not.toBe(key?.(0.1));
    expect(key?.(1 * SECOND)).not.toBe(key?.(2 * SECOND));
    expect(key?.(1.234)).toBe(key?.(1.456));
    expect(key?.(59.6)).toBe(key?.(60));
    expect(key?.(-0.000_3)).toBe(key?.(0));
    expect(key?.(1.234)).not.toBe(key?.(12.345));
    expect(key?.(61)).not.toBe(key?.(60));
    expect(key?.(-5)).not.toBe(key?.(5));
    expect(key?.(0.000_3)).toBe(key?.(0));
    expect(key?.(0.000_6)).not.toBe(key?.(0));
    expect(key?.(Infinity)).toBeNaN();
  });

  it("has none for what it cannot read", () => {
    expect(widthKey((v) => String(v), "en")).toBeUndefined();
    expect(widthKey({ notation: "compact" }, "en")).toBeUndefined();
    expect(widthKey({ maximumSignificantDigits: 2 }, "en")).toBeUndefined();
    expect(
      widthKey({ style: "unit", unit: "megabyte", unitDisplay: "long" }, "en"),
    ).toBeUndefined();
    expect(widthKey(undefined, "en")?.(2 ** 60)).toBeNaN();
  });
});

describe("writer, signed", () => {
  it("signs every value but 0 through Intl, in each preset and a format object", () => {
    expect(writer(undefined, "en", { signed: true })(1.5)).toBe("+1.5");
    expect(writer("number", "en", { signed: true })(-1.5)).toBe("-1.5");
    expect(writer("integer", "en", { signed: true })(2.5)).toBe("+3");
    expect(writer("percent", "en", { signed: true })(-0.143)).toBe("-14%");
    expect(writer("percent", "en", { signed: true })(0)).toBe("0%");
    const options = { style: "unit", unit: "megabyte" } as const;
    expect(writer(options, "en", { signed: true })(3)).toBe(
      new Intl.NumberFormat("en", { ...options, signDisplay: "exceptZero" }).format(3),
    );
    expect(writer({ signDisplay: "always" }, "en", { signed: true })(-0.0001)).toBe("0");
  });

  it("puts a plus before a duration above 0 ms or a positive function's text, and only once", () => {
    expect(writer("duration", "en", { signed: true })(87)).toBe("+1\u00A0min, 27\u00A0sec");
    expect(writer("duration", "en", { signed: true })(-87)).toBe(writer("duration", "en")(-87));
    expect(writer("duration", "en", { signed: true })(0.000_3)).toBe("0\u00A0ms");
    expect(writer("duration", "en", { signed: true })(0.000_4)).toBe("0\u00A0ms");
    expect(writer("duration", "en", { signed: true })(0.000_6)).toBe("+1\u00A0ms");
    expect(writer((v) => `v${String(v)}`, "en", { signed: true })(3)).toBe("+v3");
    expect(writer((v) => `v${String(v)}`, "en", { signed: true })(0.3)).toBe("+v0.3");
    expect(writer((v) => `+${String(v)}`, "en", { signed: true })(3)).toBe("+3");
    expect(writer((v) => String(v), "en", { signed: true })(0)).toBe("0");
  });
});

describe("the duration rule", () => {
  it("splits into the largest unit and, under 10 of it, the next, each whole", () => {
    expect(durationRecord(87_000)).toEqual({ minutes: 1, seconds: 27 });
    expect(durationRecord(1_087_000)).toEqual({ minutes: 18 });
    expect(durationRecord(108_000_000)).toEqual({ days: 1, hours: 6 });
    expect(durationRecord(9 * 86_400_000 + 23 * 3_600_000)).toEqual({ days: 9, hours: 23 });
    expect(durationRecord(12 * 86_400_000 + 20 * 3_600_000)).toEqual({ days: 13 });
    expect(durationRecord(400)).toEqual({ milliseconds: 400 });
    expect(durationRecord(1_500)).toEqual({ seconds: 2 });
  });

  it("drops a next unit that rounds to zero, and carries rounding into the larger unit", () => {
    expect(durationRecord(120_200)).toEqual({ minutes: 2 });
    expect(durationRecord(59_600)).toEqual({ minutes: 1 });
    expect(durationRecord(9_600)).toEqual({ seconds: 10 });
    expect(durationRecord(999.6)).toEqual({ seconds: 1 });
    expect(durationRecord(9 * 3_600_000 + 59.6 * 60_000)).toEqual({ hours: 10 });
    expect(durationRecord(23.6 * 3_600_000)).toEqual({ days: 1 });
    expect(durationRecord(59.7 * 60_000)).toEqual({ hours: 1 });
    expect(durationRecord(-87_000)).toEqual({ minutes: -1, seconds: -27 });
  });

  it("writes each record through Intl.DurationFormat in en and fr, a plain number-unit space made non-breaking", () => {
    for (const [seconds, record] of [
      [87, { minutes: 1, seconds: 27 }],
      [1_087, { minutes: 18 }],
      [108_000, { days: 1, hours: 6 }],
      [0.4, { milliseconds: 400 }],
    ] as const) {
      expect(writer("duration", "en")(seconds)).toBe(
        short("en", record).replaceAll(/(\d) (?=\p{L})/gu, "$1\u00A0"),
      );
      expect(writer("duration", "fr")(seconds)).toBe(short("fr", record));
    }
    expect(writer("duration", "en")(87)).toBe("1\u00A0min, 27\u00A0sec");
    expect(writer("duration", "fr")(108_000)).toMatch(/^1\u202Fj et 6\u202Fh$/u);
    expect(writer("duration", "fr")(87)).toMatch(/^1\u00A0min et 27\u202Fs$/u);
  });

  it("writes zero as zero milliseconds", () => {
    expect(writer("duration", "en")(0)).toBe("0\u00A0ms");
  });
});

describe("words around numbers", () => {
  it("makes only a space between a digit and a word non-breaking", () => {
    expect(keepUnit("1 min, 27 sec")).toBe("1\u00A0min, 27\u00A0sec");
    expect(keepUnit("1\u00A0min et 27\u202Fs")).toBe("1\u00A0min et 27\u202Fs");
    expect(keepUnit("١ د")).toBe("١\u00A0د");
    expect(keepUnit("12 34")).toBe("12 34");
  });

  it("picks a unit's noun by Intl.PluralRules, and joins it with a non-breaking space", () => {
    const posts = { one: "post", other: "posts" };
    expect(noun(posts, 1, "en")).toBe("post");
    expect(noun(posts, 0, "en")).toBe("posts");
    expect(noun({ one: "message", other: "messages" }, 0, "fr")).toBe("message");
    expect(noun({ other: "items" }, 1, "en")).toBe("items");
    expect(withNoun("86", "reads")).toBe("86\u00A0reads");
  });
});

describe("time formats", () => {
  const at = Date.UTC(2026, 10, 11, 14, 15);
  const intl = (locale: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "Europe/Paris" }).format(at);

  it("writes an instant's hour and minute, with its month and day across days, in the zone", () => {
    for (const locale of ["en", "fr"]) {
      expect(instantFormat(locale, "Europe/Paris", "time")(at)).toBe(
        intl(locale, { hour: "numeric", minute: "2-digit" }),
      );
      expect(instantFormat(locale, "Europe/Paris", "day")(at)).toBe(
        intl(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      );
    }
    expect(instantFormat("en", "UTC", "time")(at)).toBe("2:15 PM");
  });

  it("writes a span's end without the date its start already says, and with it on another day", () => {
    const full = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
    const paris = (locale: string, ms: number, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...options, timeZone: "Europe/Paris" }).format(ms);
    // 11:00 PM in Paris, then midnight, the next day.
    const late = Date.UTC(2026, 10, 11, 22);
    for (const locale of ["en", "fr"]) {
      const span = (from: number, to: number) =>
        spanFormat(locale, "Europe/Paris", "day")(from, to).map((p) => p.text);
      expect(span(at, at + 3_600_000)).toEqual([
        intl(locale, full),
        paris(locale, at + 3_600_000, { hour: "numeric", minute: "2-digit" }),
      ]);
      expect(span(late, late + 3_600_000)).toEqual([
        paris(locale, late, full),
        paris(locale, late + 3_600_000, full),
      ]);
      const time = spanFormat(locale, "Europe/Paris", "time")(at, at + 3_600_000);
      expect(time.map((p) => p.text)).toEqual([
        intl(locale, { hour: "numeric", minute: "2-digit" }),
        paris(locale, at + 3_600_000, { hour: "numeric", minute: "2-digit" }),
      ]);
    }
  });

  it("writes an instant's year where the domain's ends lie in different years, its era before year 1", () => {
    const full = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
    const bc = new Date(at).setUTCFullYear(-500);
    for (const locale of ["en", "fr"]) {
      expect(instantFormat(locale, "Europe/Paris", "year")(at)).toBe(
        intl(locale, { ...full, year: "numeric" }),
      );
      expect(instantFormat(locale, "UTC", "era")(bc)).toBe(
        new Intl.DateTimeFormat(locale, {
          ...full,
          year: "numeric",
          era: "short",
          timeZone: "UTC",
        }).format(bc),
      );
      // The same day in two years is two dates, so the end keeps its own.
      const span = spanFormat(locale, "Europe/Paris", "year");
      const later = new Date(at).setUTCFullYear(2027);
      expect(span(at, later)[1]?.text).toBe(
        new Intl.DateTimeFormat(locale, {
          ...full,
          year: "numeric",
          timeZone: "Europe/Paris",
        }).format(later),
      );
    }
    expect(instantFormat("en", "UTC", "era")(bc)).toBe("Nov 11, 501 BC, 2:15 PM");
  });

  it("writes an hour tick's first line as the hour, a shorter step's with minutes, a day step's as none", () => {
    for (const locale of ["en", "fr"]) {
      const hours = tickFormat(locale, "Europe/Paris", "hour", false);
      expect(hours.fine?.(at)).toBe(intl(locale, { hour: "numeric" }));
      expect(hours.coarse(at)).toBe(intl(locale, { month: "short", day: "numeric" }));
      expect(tickFormat(locale, "Europe/Paris", "minute", false).fine?.(at)).toBe(
        intl(locale, { hour: "numeric", minute: "2-digit" }),
      );
      expect(tickFormat(locale, "Europe/Paris", "day", false).fine).toBeUndefined();
    }
  });

  it("writes a month tick as the month over its year, and a year tick as its year alone", () => {
    for (const locale of ["en", "fr"]) {
      const months = tickFormat(locale, "Europe/Paris", "month", false);
      expect(months.fine?.(at)).toBe(intl(locale, { month: "short" }));
      expect(months.coarse(at)).toBe(intl(locale, { year: "numeric" }));
      const years = tickFormat(locale, "Europe/Paris", "year", false);
      expect(years.fine).toBeUndefined();
      expect(years.coarse(at)).toBe(intl(locale, { year: "numeric" }));
    }
    expect(tickFormat("en", "Europe/Paris", "month", false).fine?.(at)).toBe("Nov");
    expect(tickFormat("en", "UTC", "year", true).coarse(new Date(at).setUTCFullYear(-500))).toBe(
      "501 BC",
    );
    expect(tickFormat("en", "UTC", "year", true).coarse(at)).toBe("2026 AD");
  });
});
