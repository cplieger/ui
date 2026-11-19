import { afterEach, describe, expect, it, vi } from "vitest";

import { writer } from "../../data/scale/format.js";

import { bytes, count, date, duration, number, percent, relative } from "./format.js";

const NB = "\u00A0";
const NOW = Date.parse("2026-11-11T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const pageLang = document.documentElement.lang;

afterEach(() => {
  document.documentElement.lang = pageLang;
  vi.useRealTimers();
});

describe("bytes", () => {
  // The unit is picked after rounding, so a value never reads 1,000 of a unit below another.
  it.each([
    [999, "999 byte"],
    [1_000, "1.0 kB"],
    [999_949, "999.9 kB"],
    [999_950, "1.0 MB"],
    [999_949_999, "999.9 MB"],
    [999_950_000, "1.0 GB"],
    [999_960_000, "1.0 GB"],
    [999_949_999_999, "999.9 GB"],
    [999_950_000_000, "1.0 TB"],
    [999_949_999_999_999, "999.9 TB"],
    [999_950_000_000_000, "1.0 PB"],
    [999_950_000_000_000_000, "1,000.0 PB"],
    [2_000_000_000_000_000_000, "2,000.0 PB"],
  ])("writes %d bytes as %s", (n, want) => {
    expect(bytes(n, "decimal", "en")).toBe(want.replace(" ", NB));
  });

  it("rounds whole bytes at no fraction digit under the same rule", () => {
    expect(bytes(999.4, "decimal", "en")).toBe(`999${NB}byte`);
    expect(bytes(999.5, "decimal", "en")).toBe(`1.0${NB}kB`);
  });

  it("writes zero unsigned, and a negative size by its magnitude", () => {
    expect(bytes(0, "decimal", "en")).toBe(`0${NB}byte`);
    expect(bytes(-0, "decimal", "en")).toBe(`0${NB}byte`);
    expect(bytes(-0.4, "decimal", "en")).toBe(`0${NB}byte`);
    expect(bytes(-999_950, "decimal", "en")).toBe(`-1.0${NB}MB`);
  });

  it("takes its unit words from the platform, in the locale", () => {
    expect(bytes(999_950, "decimal", "de")).toBe(`1,0${NB}MB`);
    expect(bytes(1_000, "decimal", "fr")).toBe("1,0\u202Fko");
  });

  it("writes a value that is not finite without throwing", () => {
    expect(bytes(Number.NaN, "decimal", "en")).toMatch(/NaN/u);
    expect(bytes(Number.POSITIVE_INFINITY, "decimal", "en")).toMatch(/∞/u);
  });

  it("is decimal by default", () => {
    expect(bytes(536_870_912, undefined, "en")).toBe(`536.9${NB}MB`);
  });
});

describe("bytes in binary units", () => {
  // IEC 80000-13: a kibibyte is 1,024 bytes; the same pick-after-rounding rule.
  it.each([
    [1_023, "1,023 byte"],
    [1_024, "1.0 KiB"],
    [1_048_524, "1,023.9 KiB"],
    [1_048_525, "1.0 MiB"],
    [402_653_184, "384.0 MiB"],
    [536_870_912, "512.0 MiB"],
    [4_294_967_296, "4.0 GiB"],
    [25_769_803_776, "24.0 GiB"],
    [1_099_511_627_776, "1.0 TiB"],
    [1_125_899_906_842_624, "1.0 PiB"],
    [2_305_843_009_213_693_952, "2,048.0 PiB"],
  ])("writes %d bytes as %s", (n, want) => {
    expect(bytes(n, "binary", "en")).toBe(want.replace(" ", NB));
  });

  it("rounds whole bytes at no fraction digit under the same rule", () => {
    expect(bytes(1_023.4, "binary", "en")).toBe(`1,023${NB}byte`);
    expect(bytes(1_023.5, "binary", "en")).toBe(`1.0${NB}KiB`);
  });

  it("writes zero unsigned, and a negative size by its magnitude", () => {
    expect(bytes(-0, "binary", "en")).toBe(`0${NB}byte`);
    expect(bytes(-1_048_525, "binary", "en")).toBe(`-1.0${NB}MiB`);
  });

  it("writes the IEC symbol in every language, with the locale's digits and spacing", () => {
    expect(bytes(536_870_912, "binary", "de")).toBe(`512,0${NB}MiB`);
    expect(bytes(536_870_912, "binary", "fr")).toBe("512,0\u202FMiB");
    expect(bytes(512, "binary", "de")).toBe(`512${NB}Byte`);
  });

  it("writes a value that is not finite without throwing", () => {
    expect(bytes(Number.NaN, "binary", "en")).toMatch(/NaN/u);
    expect(bytes(Number.POSITIVE_INFINITY, "binary", "en")).toMatch(/∞/u);
  });
});

describe("percent", () => {
  it("writes two significant digits, so no share above 0 reads 0%", () => {
    expect([0.509, 0.3, 0.023, 0.0041, 1e-9, 0].map((v) => percent(v, "en"))).toEqual([
      "51%",
      "30%",
      "2.3%",
      "0.41%",
      "0.0000001%",
      "0%",
    ]);
  });

  it("never writes a share below 1 as 100%, cutting three digits toward 0", () => {
    expect([0.99, 0.9949, 0.9951, 0.9999, 0.999_999_9, 1].map((v) => percent(v, "en"))).toEqual([
      "99%",
      "99%",
      "99.5%",
      "99.9%",
      "99.9%",
      "100%",
    ]);
  });

  it("writes in the locale's own percent form, and never signs a zero", () => {
    expect(percent(0.509, "fr")).toMatch(/^51\s%$/u);
    expect(percent(-0, "en")).toBe("0%");
  });

  it("writes in the page's language when given none", () => {
    document.documentElement.lang = "de";
    expect(percent(0.509)).toBe(`51${NB}%`);
  });
});

describe("number", () => {
  it("writes in the locale's digits and grouping", () => {
    expect(number(1234.5, undefined, "en")).toBe("1,234.5");
    expect(number(1234.5, undefined, "de")).toBe("1.234,5");
    expect(number(1234.5, undefined, "fr")).toBe("1\u202F234,5");
  });

  it("never signs a zero", () => {
    expect(number(-0, undefined, "en")).toBe("0");
    expect(number(0, { signDisplay: "always" }, "en")).toBe("0");
    expect(number(5, { signDisplay: "always" }, "en")).toBe("+5");
    expect(number(-0.0001, { maximumFractionDigits: 2 }, "en")).toBe("0");
  });

  it("binds a unit style's number to its unit, and writes other styles as Intl does", () => {
    const km = { style: "unit", unit: "kilometer" } as const;
    expect(number(5, km, "en")).toBe(`5${NB}km`);
    expect(number(5, km, "sw")).toBe(`km${NB}5`);
    expect(number(1234.5, undefined, "en")).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(number(0.25, { style: "percent" }, "fr")).toBe(
      new Intl.NumberFormat("fr", { style: "percent" }).format(0.25),
    );
  });

  it("is what the chart's scales write", () => {
    for (const locale of ["en", "de", "fr"]) {
      for (const x of [-0, -0.0001, 1234.5, -3]) {
        expect(number(x, undefined, locale)).toBe(writer("number", locale)(x));
      }
      expect(duration(87_000, "short", locale)).toBe(writer("duration", locale)(87));
    }
  });
});

describe("count", () => {
  const runs = { one: "run", other: "runs" };

  it("writes the number and the noun its plural rule picks, joined by a no-break space", () => {
    expect(count(1, runs, "en")).toBe(`1${NB}run`);
    expect(count(3, runs, "en")).toBe(`3${NB}runs`);
    expect(count(0, { one: "message", other: "messages" }, "fr")).toBe(`0${NB}message`);
    expect(count(1, { one: "Lauf", other: "Läufe" }, "de")).toBe(`1${NB}Lauf`);
  });

  it("groups the number as the locale does", () => {
    expect(count(2160, { one: "hour", other: "hours" }, "en-GB")).toBe(`2,160${NB}hours`);
  });
});

describe("duration", () => {
  it.each([
    [0, "0 ms"],
    [400, "400 ms"],
    [87_000, "1 min, 27 sec"],
    [1_100_000, "18 min"],
    [34_200_000, "9 hr, 30 min"],
    [3_576_000, "1 hr"],
    [259_200_000, "3 days"],
  ])("writes %d ms as %s in the short style by default", (ms, want) => {
    // A number keeps its unit; a line may still break between two parts.
    const kept = want.replaceAll(/(\d) /gu, `$1${NB}`);
    expect(duration(ms, undefined, "en")).toBe(kept);
    expect(duration(ms, "short", "en")).toBe(kept);
  });

  it("writes the narrow and long styles by the same rule", () => {
    expect(duration(87_000, "narrow", "en")).toBe("1m 27s");
    expect(duration(87_000, "long", "en")).toBe(`1${NB}minute, 27${NB}seconds`);
    expect(duration(108_000_000, "short", "fr")).toMatch(/^1\u202Fj et 6\u202Fh$/u);
  });

  it("writes a clock under an hour, and hours from one", () => {
    expect(
      [42_000, 845_000, 3_723_000, 90_000_000].map((ms) => duration(ms, "digital", "en")),
    ).toEqual(["0:42", "14:05", "1:02:03", "25:00:00"]);
    expect(duration(42_000, "digital", "de")).toBe("0:42");
  });

  it("shows a second on the clock once it has passed, and keeps a sign", () => {
    expect(duration(41_600, "digital", "en")).toBe("0:41");
    expect(duration(-42_000, "digital", "en")).toBe("-0:42");
    expect(duration(-400, "digital", "en")).toBe("0:00");
  });

  it("refuses a value that is not finite", () => {
    for (const style of ["narrow", "short", "long", "digital"] as const) {
      expect(() => duration(Number.NaN, style, "en")).toThrow(RangeError);
      expect(() => duration(Number.POSITIVE_INFINITY, style, "en")).toThrow(RangeError);
    }
  });
});

describe("date", () => {
  const at = new Date(2026, 10, 19, 18, 40);

  it("writes the date, the time, or both, in the locale", () => {
    expect(date(at, "datetime", "en")).toMatch(
      /^Nov\u00A019,\u00A02026,\u00A06:40[\u00A0\u202F]PM$/u,
    );
    expect(date(at, undefined, "en")).toBe(date(at, "datetime", "en"));
    expect(date(at, "date", "en")).toBe(`Nov${NB}19,${NB}2026`);
    expect(date(at, "date", "de")).toBe("19.11.2026");
    expect(date(at, "date", "fr")).toBe(`19${NB}nov.${NB}2026`);
    expect(date(at, "time", "en")).toMatch(/^6:40[\u00A0\u202F]PM$/u);
    expect(date(at, "time", "de")).toBe("18:40");
    expect(date(at, "time", "fr")).toBe("18:40");
    expect(date(at.getTime(), "date", "de")).toBe("19.11.2026");
  });

  it("writes a near moment's time alone today, else a short date with its time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 30));
    expect(date(new Date(2026, 10, 13, 0, 1), "near", "en-GB")).toBe("00:01");
    expect(date(new Date(2026, 10, 12, 23, 59), "near", "en-GB")).toBe(`12${NB}Nov,${NB}23:59`);
    expect(date(new Date(2026, 10, 12, 9, 30), "near", "en-GB")).toBe(`12${NB}Nov,${NB}09:30`);
    expect(date(new Date(2026, 10, 13, 14, 2), "near", "en-US")).toMatch(/^2:02[\u00A0\u202F]PM$/u);
    expect(date(new Date(2026, 10, 12, 9, 30), "near", "en-US")).toMatch(
      /^Nov\u00A012,\u00A09:30[\u00A0\u202F]AM$/u,
    );
  });

  it("adds the year to a near moment outside the present year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 30));
    expect(date(new Date(2025, 10, 13, 9, 30), "near", "en-GB")).toBe(
      `13${NB}Nov${NB}2025,${NB}09:30`,
    );
  });

  // 2 Jan 2026 is 12 Dey 1404 in the Persian calendar; its new year, 1405, began on 21 March.
  it("decides a near moment's year in the locale's calendar", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 30));
    expect(date(new Date(2026, 0, 2, 9, 30), "near", "fa-IR")).toContain("۱۴۰۴");
    expect(date(new Date(2026, 10, 12, 9, 30), "near", "fa-IR")).not.toContain("۱۴۰۵");
    // The Chinese year turned on 17 Feb 2026, so 2 Jan 2026 is still the year of 2025.
    expect(date(new Date(2026, 0, 2, 9, 30), "near", "zh-u-ca-chinese")).toContain("2025");
  });

  // Reiwa began on 1 May 2019, so 15 January is Heisei 31 in the same Gregorian year.
  it("decides a near moment's year by its era too", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2019, 5, 15, 9, 30));
    expect(date(new Date(2019, 0, 15, 9, 30), "near", "ja-u-ca-japanese")).toContain("平成31");
    expect(date(new Date(2019, 4, 1, 9, 30), "near", "ja-u-ca-japanese")).not.toMatch(/令和|平成/u);
  });

  it("joins every style's parts with no-break spaces", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 19, 9, 30));
    for (const locale of ["en", "de", "fr"]) {
      for (const style of ["date", "time", "datetime", "near"] as const) {
        for (const moment of [at, new Date(2026, 10, 12, 9, 5), new Date(2025, 0, 2, 23, 59)]) {
          expect(date(moment, style, locale)).not.toMatch(/ /u);
        }
      }
    }
  });

  it("throws a RangeError for an invalid date", () => {
    expect(() => date(Number.NaN)).toThrow(RangeError);
    expect(() => date(new Date("soon"), "near")).toThrow(RangeError);
  });
});

describe("relative", () => {
  it("picks the largest unit that fits and rounds to it", () => {
    const at = (ago: number): string =>
      relative(NOW - ago, { now: NOW, locale: "en", style: "long" });
    expect([
      at(4 * MIN + 29_000),
      at(100 * MIN),
      at(DAY),
      at(3 * DAY),
      at(15 * DAY),
      at(60 * DAY),
      at(800 * DAY),
    ]).toEqual([
      `4${NB}minutes ago`,
      `2${NB}hours ago`,
      "yesterday",
      `3${NB}days ago`,
      `2${NB}weeks ago`,
      `2${NB}months ago`,
      `2${NB}years ago`,
    ]);
  });

  it("moves to the larger unit before the smaller one's count would reach it", () => {
    const at = (s: number): string =>
      relative(NOW - s * 1000, { now: NOW, locale: "en", style: "long" });
    const ahead = (s: number): string =>
      relative(NOW + s * 1000, { now: NOW, locale: "en", style: "long" });
    expect([at(3569), at(3571), at(84_599), at(86_399), at(561_599), at(561_600)]).toEqual([
      `59${NB}minutes ago`,
      `1${NB}hour ago`,
      `23${NB}hours ago`,
      "yesterday",
      `6${NB}days ago`,
      "last week",
    ]);
    expect([at(24 * 86_400), at(25 * 86_400), at(344 * 86_400), at(346 * 86_400)]).toEqual([
      `3${NB}weeks ago`,
      "last month",
      `11${NB}months ago`,
      "last year",
    ]);
    expect([ahead(3569), ahead(3571)]).toEqual([`in 59${NB}minutes`, `in 1${NB}hour`]);
  });

  it("speaks the locale's words", () => {
    const fr = (ms: number): string =>
      relative(NOW + ms, { now: NOW, locale: "fr", style: "long" });
    expect([fr(-4 * MIN), fr(25 * MIN), fr(-DAY), fr(-10_000)]).toEqual([
      `il y a 4${NB}minutes`,
      `dans 25${NB}minutes`,
      "hier",
      "maintenant",
    ]);
    expect(relative(NOW - 4 * MIN, { now: NOW, locale: "de", style: "short" })).toBe(
      `vor 4${NB}Min.`,
    );
  });

  it("says a time ahead and one under a minute either way", () => {
    const en = (ms: number): string =>
      relative(NOW + ms, { now: NOW, locale: "en", style: "long" });
    expect([en(25 * MIN), en(DAY), en(-59_000), en(59_000)]).toEqual([
      `in 25${NB}minutes`,
      "tomorrow",
      "now",
      "now",
    ]);
  });

  it("gives a number in the compact forms where the long one names the day", () => {
    const day = (style: "long" | "short" | "narrow"): string =>
      relative(NOW - DAY, { now: NOW, locale: "en", style });
    expect([day("long"), day("short"), day("narrow")]).toEqual([
      "yesterday",
      `1${NB}day ago`,
      "1d ago",
    ]);
  });

  it("writes the narrow form by default, as Intl gives it", () => {
    const narrow = (n: number, unit: Intl.RelativeTimeFormatUnit): string =>
      new Intl.RelativeTimeFormat("en", { style: "narrow", numeric: "always" }).format(n, unit);
    const at = (ago: number): string => relative(NOW - ago, { now: NOW, locale: "en" });
    expect([at(15 * MIN), at(3 * HOUR), at(DAY), at(10_000)]).toEqual([
      narrow(-15, "minute"),
      narrow(-3, "hour"),
      narrow(-1, "day"),
      new Intl.RelativeTimeFormat("en", { style: "narrow", numeric: "auto" }).format(0, "second"),
    ]);
    expect(at(15 * MIN)).toBe("15m ago");
  });

  it("counts from the present by default, and refuses an invalid date", () => {
    expect(relative(new Date(Date.now() - 3 * HOUR), { locale: "en", style: "long" })).toBe(
      `3${NB}hours ago`,
    );
    expect(() => relative(new Date("soon"))).toThrow(TypeError);
    expect(() => relative(Number.NaN)).toThrow(TypeError);
  });

  it("counts from a now given as a date as from its ms", () => {
    expect(relative(NOW - 3 * HOUR, { now: new Date(NOW), locale: "en", style: "long" })).toBe(
      `3${NB}hours ago`,
    );
  });

  it("writes in the page's language when given none", () => {
    document.documentElement.lang = "fr";
    expect(relative(NOW - 4 * MIN, { now: NOW, style: "long" })).toBe(`il y a 4${NB}minutes`);
  });
});

describe("a unit written before its number", () => {
  // Swahili writes the unit first: the space after it binds, while the one
  // before a list word or "ago" still breaks.
  it("binds a byte size's unit to the number after it", () => {
    expect(bytes(999_950, "decimal", "sw")).toBe(`MB${NB}1.0`);
    expect(bytes(-999_950, "decimal", "sw")).toBe(`MB${NB}-1.0`);
    expect(bytes(536_870_912, "binary", "sw")).toBe(`MiB${NB}512.0`);
    expect(bytes(512, "binary", "sw")).toBe(`baiti${NB}512`);
  });

  it("binds each duration unit to its number, and leaves the list word breakable", () => {
    expect(duration(87_000, "short", "sw")).toBe(`dakika${NB}1 na sekunde${NB}27`);
    // Japanese joins its units with a plain space, which stays breakable.
    expect(duration(87_000, "short", "ja")).toBe(`1${NB}分 27${NB}秒`);
  });

  it("binds a relative time's unit to its number, and leaves the word for ago breakable", () => {
    const long = (ms: number, locale: string): string =>
      relative(NOW + ms, { now: NOW, locale, style: "long" });
    expect(long(-4 * MIN, "sw")).toBe(`dakika${NB}4 zilizopita`);
    expect(long(25 * MIN, "sw")).toBe(`baada ya dakika${NB}25`);
    expect(long(-4 * MIN, "en")).toBe(`4${NB}minutes ago`);
    expect(long(-DAY, "sw")).toBe(
      new Intl.RelativeTimeFormat("sw", { numeric: "auto" }).format(-1, "day"),
    );
  });
});

describe("the side of a relative time's unit", () => {
  const LENGTHS = {
    year: 365 * DAY,
    month: 30 * DAY,
    week: 7 * DAY,
    day: DAY,
    hour: HOUR,
    minute: MIN,
  };
  type Unit = keyof typeof LENGTHS;
  const ALL = Object.keys(LENGTHS) as Unit[];

  // Intl's own parts for 3 `unit`s, the one space between the number and
  // the literal on `side` made non-breaking.
  const bound = (
    locale: string,
    style: Intl.RelativeTimeFormatStyle,
    ms: number,
    unit: Unit,
    side: "before" | "after",
  ): string => {
    const parts = new Intl.RelativeTimeFormat(locale, { style, numeric: "always" }).formatToParts(
      Math.sign(ms) * 3,
      unit,
    );
    const at = parts.findIndex((p) => p.type !== "literal");
    return parts
      .map((p, i) =>
        side === "before" && i === at - 1
          ? p.value.replace(/ $/u, NB)
          : side === "after" && i === at + 1
            ? p.value.replace(/^ /u, NB)
            : p.value,
      )
      .join("");
  };
  const written = (locale: string, style: Intl.RelativeTimeFormatStyle, ms: number): string =>
    relative(NOW + ms, { now: NOW, locale, style });

  // Their word for "in" is spelt another way in one or two units, which must
  // not read as a unit word: "om" and "om" with a no-break space, "d’aquí a"
  // and "d‘aquí a", "dlm" and "dalam".
  it.each([
    ["sv", "short", ALL],
    ["ca", "narrow", ALL],
    ["id", "short", ["day", "minute"]],
  ] as const)("binds only the unit word in %s %s, ahead", (locale, style, units) => {
    for (const unit of units) {
      expect(written(locale, style, 3 * LENGTHS[unit])).toBe(
        bound(locale, style, 3 * LENGTHS[unit], unit, "after"),
      );
    }
  });

  it.each([
    ["en", "after"],
    ["fr", "after"],
    ["de", "after"],
    ["ja", "after"],
    ["sw", "before"],
  ] as const)("binds the unit word in %s on its own side", (locale, side) => {
    for (const style of ["long", "short", "narrow"] as const) {
      for (const unit of ["week", "hour", "minute"] as const) {
        for (const ms of [-3 * LENGTHS[unit], 3 * LENGTHS[unit]]) {
          expect(written(locale, style, ms)).toBe(bound(locale, style, ms, unit, side));
        }
      }
    }
  });
});

describe("the page's language", () => {
  it("is the html element's lang, read at each call", () => {
    document.documentElement.lang = "de";
    expect(number(1234.5)).toBe("1.234,5");
    document.documentElement.lang = "fr";
    expect(number(1234.5)).toBe("1\u202F234,5");
  });

  it("is the browser's when the html element's lang is empty", () => {
    document.documentElement.lang = "";
    expect(number(1234.5)).toBe(new Intl.NumberFormat().format(1234.5));
  });

  it("is the browser's when the html element's lang is not a language tag", () => {
    document.documentElement.lang = "en_US";
    expect(number(1234.5)).toBe(new Intl.NumberFormat().format(1234.5));
    expect(() => number(1234.5, undefined, "en_US")).toThrow(RangeError);
  });

  it("gives way to an explicit locale", () => {
    document.documentElement.lang = "de";
    expect(number(1234.5, undefined, "en")).toBe("1,234.5");
    expect(count(3, { one: "run", other: "runs" }, "en")).toBe(`3${NB}runs`);
    expect(bytes(999_950, undefined, "en")).toBe(`1.0${NB}MB`);
  });

  it("is what every writer reads", () => {
    document.documentElement.lang = "de";
    expect(count(1234, { one: "Lauf", other: "Läufe" })).toBe(`1.234${NB}Läufe`);
    expect(bytes(999_950)).toBe(`1,0${NB}MB`);
    expect(duration(3 * HOUR, "long")).toBe(`3${NB}Stunden`);
    expect(date(new Date(2026, 10, 19, 18, 40), "date")).toBe("19.11.2026");
  });
});
