import { describe, expect, it } from "vitest";

import { localDay, spansDay, TIME_STEPS, timeStep, timeTicks } from "./time.js";

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

const stepAt = (span: number, px: number) => TIME_STEPS[timeStep(span, px, 80)];
const msAt = (span: number, px: number) => stepAt(span, px)?.ms;

// The wall clock of each tick, read back through Intl rather than the module.
const clock = (ticks: readonly number[], timeZone: string) => {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  return ticks.map((t) => dtf.format(t));
};

describe("timeStep", () => {
  it("takes the smallest increment at least 80 px wide, at the phone widths", () => {
    expect(msAt(6 * HR, 276)).toBe(2 * HR);
    expect(msAt(24 * HR, 276)).toBe(12 * HR);
    expect(msAt(72 * HR, 276)).toBe(DAY);
    expect(msAt(6 * HR, 206)).toBe(3 * HR);
    expect(msAt(6 * HR, 990)).toBe(30 * MIN);
  });

  it("reaches every increment of the ladder at some width, and the coarsest past it", () => {
    for (const step of TIME_STEPS) {
      expect(stepAt(step.ms * 10, 800)).toBe(step);
    }
    expect(stepAt(1.7e16, 10)).toBe(TIME_STEPS.at(-1));
  });

  it("climbs from a week to 1, 3 and 6 months, then 1, 2 and 5 times each power of ten years", () => {
    const steps = TIME_STEPS.map((s) => `${String(s.count)} ${s.unit}`);
    expect(steps.slice(steps.indexOf("7 day"))).toEqual([
      "7 day",
      "1 month",
      "3 month",
      "6 month",
      ...[1, 10, 100, 1_000, 10_000, 100_000].flatMap((p) =>
        [1, 2, 5].map((m) => `${String(m * p)} year`),
      ),
    ]);
    expect(stepAt(365 * DAY, 100)).toEqual({ unit: "year", count: 1, ms: 31_556_952_000 });
    expect(stepAt(300 * DAY, 800)).toEqual({ unit: "month", count: 1, ms: 2_629_746_000 });
  });
});

describe("timeTicks", () => {
  // Local midnights in Paris around both 2026 changes, from Intl's offsets.
  const parisSpring = Date.UTC(2026, 2, 28, 23);
  const parisSpringEnd = Date.UTC(2026, 2, 29, 22);
  const parisAutumn = Date.UTC(2026, 9, 24, 22);
  const parisAutumnEnd = Date.UTC(2026, 9, 25, 23);
  const at = (ms: number) => TIME_STEPS.findIndex((s) => s.ms === ms);

  it("steps an hour on local hours: 23 ticks on the spring day, 25 on the autumn one", () => {
    const spring = timeTicks(parisSpring, parisSpringEnd - 1, at(HR), "Europe/Paris");
    expect(spring).toHaveLength(23);
    expect(clock(spring, "Europe/Paris")).not.toContain("02:00");
    expect(clock(spring, "Europe/Paris").every((t) => t.endsWith(":00"))).toBe(true);
    const autumn = timeTicks(parisAutumn, parisAutumnEnd - 1, at(HR), "Europe/Paris");
    expect(autumn).toHaveLength(25);
    expect(clock(autumn, "Europe/Paris").filter((t) => t === "02:00")).toHaveLength(2);
    expect(autumn.slice(1).every((t, i) => t > (autumn[i] ?? t))).toBe(true);
  });

  it("keeps 6-hour ticks on the local multiples of 6 across both changes", () => {
    for (const [lo, hi] of [
      [parisSpring, parisSpringEnd],
      [parisAutumn, parisAutumnEnd],
    ] as const) {
      expect(clock(timeTicks(lo, hi, at(6 * HR), "Europe/Paris"), "Europe/Paris")).toEqual([
        "00:00",
        "06:00",
        "12:00",
        "18:00",
        "00:00",
      ]);
    }
  });

  it("keeps hour ticks on local hours over a winter whose ends share an offset", () => {
    // 1 October 2023 to 1 April 2024 in Paris: both ends on summer time.
    const ticks = timeTicks(
      Date.UTC(2023, 8, 30, 22),
      Date.UTC(2024, 2, 31, 22),
      at(12 * HR),
      "Europe/Paris",
    );
    expect(ticks).toHaveLength(367);
    expect(clock(ticks, "Europe/Paris").every((t) => t === "00:00" || t === "12:00")).toBe(true);
  });

  it("does the same in a southern-hemisphere zone", () => {
    // Sydney falls back on 5 April 2026 and springs forward on 4 October.
    const april = timeTicks(
      Date.UTC(2026, 3, 4, 13),
      Date.UTC(2026, 3, 5, 14) - 1,
      at(HR),
      "Australia/Sydney",
    );
    expect(april).toHaveLength(25);
    const october = timeTicks(
      Date.UTC(2026, 9, 3, 14),
      Date.UTC(2026, 9, 4, 13) - 1,
      at(HR),
      "Australia/Sydney",
    );
    expect(october).toHaveLength(23);
    expect(clock(october, "Australia/Sydney")).not.toContain("02:00");
  });

  it("never ticks at a half hour where a zone moves by half an hour", () => {
    const ticks = timeTicks(
      Date.UTC(2026, 3, 4, 10),
      Date.UTC(2026, 3, 5, 10),
      at(HR),
      "Australia/Lord_Howe",
    );
    // 21:00 on 4 April to 20:00 on 5 April, each local hour once: the half
    // hour repeated at 02:00 holds no hour boundary.
    expect(clock(ticks, "Australia/Lord_Howe").every((t) => t.endsWith(":00"))).toBe(true);
    expect(ticks).toHaveLength(24);
  });

  it("ticks every 15 minutes on the quarter hours of a zone a quarter hour off UTC", () => {
    const ticks = timeTicks(
      Date.UTC(2026, 10, 11, 0),
      Date.UTC(2026, 10, 11, 2),
      at(15 * MIN),
      "Asia/Kathmandu",
    );
    expect(clock(ticks, "Asia/Kathmandu").slice(0, 3)).toEqual(["05:45", "06:00", "06:15"]);
    expect(ticks).toHaveLength(9);
  });

  it("ticks days at local midnight, or the day's first instant when midnight is skipped", () => {
    const days = timeTicks(parisSpring - DAY, parisAutumnEnd, at(DAY), "Europe/Paris");
    expect(clock(days, "Europe/Paris").every((t) => t === "00:00")).toBe(true);
    // Santiago skips from 00:00 to 01:00 on 6 September 2026.
    const chile = timeTicks(
      Date.UTC(2026, 8, 5, 4),
      Date.UTC(2026, 8, 7, 4),
      at(DAY),
      "America/Santiago",
    );
    expect(clock(chile, "America/Santiago")).toEqual(["00:00", "01:00", "00:00"]);
  });

  it("ticks every other day by the day count since 1970, and weeks on Mondays", () => {
    const lo = Date.UTC(2026, 10, 1);
    const two = timeTicks(lo, lo + 10 * DAY, at(2 * DAY), "UTC");
    expect(two.length).toBeGreaterThanOrEqual(5);
    expect(two.every((t) => (t / DAY) % 2 === 0)).toBe(true);
    expect(two.slice(1).map((t, i) => t - (two[i] ?? 0))).toEqual(two.slice(1).map(() => 2 * DAY));
    const weeks = timeTicks(lo, lo + 30 * DAY, at(7 * DAY), "UTC");
    expect(weeks.map((t) => new Date(t).getUTCDay())).toEqual([1, 1, 1, 1, 1]);
  });

  // Each tick's local date, read back through Intl rather than the module.
  const dates = (ticks: readonly number[], timeZone: string) => {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return ticks.map((t) => dtf.format(t));
  };
  const step = (unit: string, count: number) =>
    TIME_STEPS.findIndex((s) => s.unit === unit && s.count === count);

  it("ticks months at the first local midnight of each, from January in steps of 3 and 6", () => {
    // 15 January to 1 December 2026 in Paris: the end falls on a tick.
    const lo = Date.UTC(2026, 0, 15);
    const hi = Date.UTC(2026, 10, 30, 23);
    const months = timeTicks(lo, hi, step("month", 1), "Europe/Paris");
    expect(dates(months, "Europe/Paris")).toEqual(
      ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(
        (m) => `2026-${m}-01, 00:00`,
      ),
    );
    expect(dates(timeTicks(lo, hi, step("month", 3), "Europe/Paris"), "Europe/Paris")).toEqual([
      "2026-04-01, 00:00",
      "2026-07-01, 00:00",
      "2026-10-01, 00:00",
    ]);
    expect(dates(timeTicks(lo, hi, step("month", 6), "Europe/Paris"), "Europe/Paris")).toEqual([
      "2026-07-01, 00:00",
    ]);
    // A domain from a month's midnight holds that tick.
    const april = Date.UTC(2026, 2, 31, 22);
    expect(timeTicks(april, april + 40 * DAY, step("month", 1), "Europe/Paris")[0]).toBe(april);
  });

  it("ticks years on 1 January at multiples of the step, decades and centuries too", () => {
    const lo = Date.UTC(2001, 5, 1);
    const hi = Date.UTC(2030, 0, 1);
    expect(dates(timeTicks(lo, hi, step("year", 5), "UTC"), "UTC")).toEqual(
      [2005, 2010, 2015, 2020, 2025, 2030].map((y) => `${String(y)}-01-01, 00:00`),
    );
    expect(dates(timeTicks(lo, hi, step("year", 2), "Europe/Paris"), "Europe/Paris")).toEqual(
      [
        2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026, 2028, 2030,
      ].map((y) => `${String(y)}-01-01, 00:00`),
    );
    const centuries = timeTicks(
      Date.UTC(1000, 0, 1),
      Date.UTC(2100, 0, 1),
      step("year", 200),
      "UTC",
    );
    expect(centuries.map((t) => new Date(t).getUTCFullYear())).toEqual([
      1000, 1200, 1400, 1600, 1800, 2000,
    ]);
    expect(centuries.every((t) => new Date(t).toISOString().endsWith("-01-01T00:00:00.000Z"))).toBe(
      true,
    );
  });

  it("ticks the years before 100 and before year 1 on their own 1 January", () => {
    const year = (y: number) => new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(y);
    expect(timeTicks(year(-30), year(130), step("year", 50), "UTC")).toEqual(
      [0, 50, 100].map(year),
    );
    expect(localDay(year(50), "UTC")).toBe(year(50) / DAY);
    expect(localDay(year(-500), "UTC")).toBe(year(-500) / DAY);
  });

  it("generates only the ticks it draws over 10,000 years and over all that Date holds", () => {
    const year = (y: number) => new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(y);
    const lo = year(-3000);
    const hi = year(7000);
    const at = timeStep(hi - lo, 800, 80);
    expect(TIME_STEPS[at]).toMatchObject({ unit: "year", count: 1_000 });
    const t0 = performance.now();
    expect(timeTicks(lo, hi, at, "UTC")).toEqual(
      Array.from({ length: 11 }, (_, i) => year(-3000 + 1_000 * i)),
    );
    // Paris keeps local mean time, 9 minutes 21 seconds ahead, before 1891.
    const paris = timeTicks(lo, hi, at, "Europe/Paris");
    expect(paris).toHaveLength(10);
    expect(dates(paris, "Europe/Paris").every((d) => d.endsWith("-01-01, 00:00"))).toBe(true);
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      const all = timeTicks(-8.64e15, 8.64e15, timeStep(1.728e16, 300, 80), zone);
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((t) => t >= -8.64e15 && t <= 8.64e15)).toBe(true);
      expect(dates(all, zone).every((d) => d.endsWith("-01-01, 00:00"))).toBe(true);
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("keeps every tick inside the domain, its ends included", () => {
    const lo = Date.UTC(2026, 10, 11, 7);
    expect(timeTicks(lo, lo + 6 * HR, at(2 * HR), "Europe/Paris")).toEqual([
      lo,
      lo + 2 * HR,
      lo + 4 * HR,
      lo + 6 * HR,
    ]);
    expect(timeTicks(lo + 1, lo + 2 * HR - 1, at(2 * HR), "Europe/Paris")).toEqual([]);
  });
});

describe("spansDay", () => {
  const paris = "Europe/Paris";
  // Paris springs forward on 29 March 2026 and falls back on 25 October.
  const spring = Date.UTC(2026, 2, 28, 13);
  const fall = Date.UTC(2026, 9, 24, 12);

  it.each([
    ["24 hours elapsed", 0, DAY, "UTC", true],
    ["a minute under 24 hours", 0, DAY - MIN, "UTC", false],
    ["a 23-hour spring-forward day", spring, spring + 23 * HR, paris, true],
    ["a minute under that day", spring, spring + 23 * HR - MIN, paris, false],
    ["a 25-hour fall-back day", fall, fall + 25 * HR, paris, true],
    ["24 hours elapsed into the fall-back day", fall, fall + DAY, paris, true],
    [
      "6 hours across midnight",
      Date.UTC(2026, 10, 11, 21),
      Date.UTC(2026, 10, 12, 3),
      paris,
      false,
    ],
  ] as const)("is %s: %s", (_, lo, hi, zone, spans) => {
    expect(spansDay(lo, hi, zone)).toBe(spans);
  });
});

describe("localDay", () => {
  it("counts the local day, which a zone ahead of UTC starts before UTC midnight", () => {
    const t = Date.UTC(2026, 10, 11, 23, 30);
    expect(localDay(t, "UTC")).toBe(Math.floor(t / DAY));
    expect(localDay(t, "Europe/Paris")).toBe(Math.floor(t / DAY) + 1);
  });
});
