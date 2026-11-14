import { describe, expect, it } from "vitest";

import {
  decimalFormatter,
  durationRecord,
  formatDuration,
  formatter,
  instantFormat,
  keepUnit,
  noun,
  signedFormatter,
  spanFormat,
  tickFormat,
  widthKey,
  withNoun,
} from "./format.js";

const short = (locale: string, record: Record<string, number>) =>
  new Intl.DurationFormat(locale, { style: "short" }).format(record);

describe("formatter", () => {
  it("writes numbers by Intl's default, integers rounded half away from zero, and proportions as percents", () => {
    expect(formatter(undefined, "en")(1234.5678)).toBe("1,234.568");
    expect(formatter("number", "fr")(1234.5678)).toBe(
      new Intl.NumberFormat("fr").format(1234.5678),
    );
    expect(formatter("integer", "en")(2.5)).toBe("3");
    expect(formatter("integer", "en")(-2.5)).toBe("-3");
    expect(formatter("integer", "fr")(12345.4)).toBe(
      new Intl.NumberFormat("fr", { maximumFractionDigits: 0 }).format(12345),
    );
    expect(formatter("percent", "en")(0.42)).toBe("42%");
    expect(formatter("percent", "fr")(0.42)).toBe("42\u00A0%");
  });

  it("passes options to Intl.NumberFormat as they are, uses a function's string, and writes durations", () => {
    const options = { style: "unit", unit: "megabyte" } as const;
    expect(formatter(options, "en")(3)).toBe(new Intl.NumberFormat("en", options).format(3));
    expect(formatter((v) => `v${String(v)}`, "en")(3)).toBe("v3");
    expect(formatter("duration", "en")(87_000)).toBe("1\u00A0min, 27\u00A0sec");
  });
});

describe("decimalFormatter", () => {
  it("writes the fraction digits asked for, a percent's counted on the share", () => {
    expect([0, 0.5, 1].map(decimalFormatter("number", "en", 1))).toEqual(["0.0", "0.5", "1.0"]);
    expect([0.37, 37.142857142857146].map(decimalFormatter(undefined, "en", 0, 3))).toEqual([
      "0.37",
      "37.143",
    ]);
    expect(decimalFormatter("percent", "en", 3)(0.005)).toBe("0.5%");
  });

  it("writes past Intl's 100 fraction digits in scientific notation, 0 as 0", () => {
    const write = decimalFormatter("number", "en", 103);
    expect([0, 2.5e-102, 5e-102, 7.5e-102].map(write)).toEqual([
      "0",
      "2.5E-102",
      "5E-102",
      "7.5E-102",
    ]);
    expect(write(1.23456789012345e-102)).toBe("1.23456789012345E-102");
    const share = decimalFormatter("percent", "en", 0, 103);
    expect([0, 1e-103].map(share)).toEqual(["0%", "1E-101%"]);
    // 102 digits on the share are 100 on the percentage, within Intl's limit.
    expect(decimalFormatter("percent", "en", 102)(1e-102)).toBe(`0.${"0".repeat(99)}1%`);
  });
});

describe("widthKey", () => {
  const shape = (t: string) => t.replace(/\p{Nd}/gu, "0");
  const values = [
    0, -0, 1, -1, 9, 10, 99.5, 999.4, 1_234.5, -12_345.678, 0.5, 0.05, 0.0004, 0.0005, 1.005,
    9.9996, 71.25, 1e9, 123_456_789.123,
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
      const write = (signed ? signedFormatter : formatter)(format, locale);
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
  });

  it("keys a duration by the record it writes and its sign", () => {
    const key = widthKey("duration", "en");
    expect(key).toBeDefined();
    const durations = [
      0, -0, 0.3, -0.3, 1, 999.4, 999.6, 1_000, 1_234, 1_456, 9_999, 12_345, -5_000, 59_600, 60_000,
      61_000, 599_000, 3_723_000, 9_420_013, 82_800_000, 1_080_000_000,
    ];
    for (const signed of [false, true]) {
      const write = (signed ? signedFormatter : formatter)("duration", "en");
      const seen = new Map<number, string>();
      for (const v of durations) {
        const k = key?.(v) ?? Number.NaN;
        expect(k, String(v)).not.toBeNaN();
        const text = seen.get(k) ?? write(v);
        expect(write(v), String(v)).toBe(text);
        seen.set(k, text);
      }
    }
    expect(key?.(1_234)).toBe(key?.(1_456));
    expect(key?.(59_600)).toBe(key?.(60_000));
    expect(key?.(-0.3)).toBe(key?.(0));
    expect(key?.(1_234)).not.toBe(key?.(12_345));
    expect(key?.(61_000)).not.toBe(key?.(60_000));
    expect(key?.(-5_000)).not.toBe(key?.(5_000));
    expect(key?.(0.3)).not.toBe(key?.(0));
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

describe("signedFormatter", () => {
  it("signs every value but 0 through Intl, in each preset and a format object", () => {
    expect(signedFormatter(undefined, "en")(1.5)).toBe("+1.5");
    expect(signedFormatter("number", "en")(-1.5)).toBe("-1.5");
    expect(signedFormatter("integer", "en")(2.5)).toBe("+3");
    expect(signedFormatter("percent", "en")(-0.143)).toBe("-14%");
    expect(signedFormatter("percent", "en")(0)).toBe("0%");
    const options = { style: "unit", unit: "megabyte" } as const;
    expect(signedFormatter(options, "en")(3)).toBe(
      new Intl.NumberFormat("en", { ...options, signDisplay: "exceptZero" }).format(3),
    );
    expect(signedFormatter({ signDisplay: "always" }, "en")(0)).toBe("+0");
  });

  it("puts a plus before a positive duration's or function's text, and only once", () => {
    expect(signedFormatter("duration", "en")(87_000)).toBe("+1\u00A0min, 27\u00A0sec");
    expect(signedFormatter("duration", "en")(-87_000)).toBe(formatDuration(-87_000, "en"));
    expect(signedFormatter((v) => `v${String(v)}`, "en")(3)).toBe("+v3");
    expect(signedFormatter((v) => `+${String(v)}`, "en")(3)).toBe("+3");
    expect(signedFormatter((v) => String(v), "en")(0)).toBe("0");
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
    for (const [ms, record] of [
      [87_000, { minutes: 1, seconds: 27 }],
      [1_087_000, { minutes: 18 }],
      [108_000_000, { days: 1, hours: 6 }],
      [400, { milliseconds: 400 }],
    ] as const) {
      expect(formatDuration(ms, "en")).toBe(
        short("en", record).replaceAll(/(\d) (?=\p{L})/gu, "$1\u00A0"),
      );
      expect(formatDuration(ms, "fr")).toBe(short("fr", record));
    }
    expect(formatDuration(87_000, "en")).toBe("1\u00A0min, 27\u00A0sec");
    expect(formatDuration(108_000_000, "fr")).toMatch(/^1\u202Fj et 6\u202Fh$/u);
    expect(formatDuration(87_000, "fr")).toMatch(/^1\u00A0min et 27\u202Fs$/u);
  });

  it("writes zero as zero milliseconds", () => {
    expect(formatDuration(0, "en")).toBe("0\u00A0ms");
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
      expect(instantFormat(locale, "Europe/Paris", false)(at)).toBe(
        intl(locale, { hour: "numeric", minute: "2-digit" }),
      );
      expect(instantFormat(locale, "Europe/Paris", true)(at)).toBe(
        intl(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      );
    }
    expect(instantFormat("en", "UTC", false)(at)).toBe("2:15 PM");
  });

  it("writes a span's end without the date its start already says, and with it on another day", () => {
    const full = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
    const paris = (locale: string, ms: number, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...options, timeZone: "Europe/Paris" }).format(ms);
    // 11:00 PM in Paris, then midnight, the next day.
    const late = Date.UTC(2026, 10, 11, 22);
    for (const locale of ["en", "fr"]) {
      const span = spanFormat(locale, "Europe/Paris", true);
      expect(span(at, at + 3_600_000)).toEqual([
        intl(locale, full),
        paris(locale, at + 3_600_000, { hour: "numeric", minute: "2-digit" }),
      ]);
      expect(span(late, late + 3_600_000)).toEqual([
        paris(locale, late, full),
        paris(locale, late + 3_600_000, full),
      ]);
      expect(spanFormat(locale, "Europe/Paris", false)(at, at + 3_600_000)).toEqual([
        intl(locale, { hour: "numeric", minute: "2-digit" }),
        paris(locale, at + 3_600_000, { hour: "numeric", minute: "2-digit" }),
      ]);
    }
  });

  it("writes an hour tick's first line as the hour, a shorter step's with minutes, a day step's as none", () => {
    for (const locale of ["en", "fr"]) {
      const hours = tickFormat(locale, "Europe/Paris", 3_600_000);
      expect(hours.time?.(at)).toBe(intl(locale, { hour: "numeric" }));
      expect(hours.date(at)).toBe(intl(locale, { month: "short", day: "numeric" }));
      expect(tickFormat(locale, "Europe/Paris", 900_000).time?.(at)).toBe(
        intl(locale, { hour: "numeric", minute: "2-digit" }),
      );
      expect(tickFormat(locale, "Europe/Paris", 86_400_000).time).toBeUndefined();
    }
  });
});
