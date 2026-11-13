import { describe, expect, it } from "vitest";

import { localDay, spansDay, TIME_STEPS, timeStep, timeTicks } from "./time.js";

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

const stepAt = (span: number, px: number) => TIME_STEPS[timeStep(span, px, 80)];

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
    expect(stepAt(6 * HR, 276)).toBe(2 * HR);
    expect(stepAt(24 * HR, 276)).toBe(12 * HR);
    expect(stepAt(72 * HR, 276)).toBe(DAY);
    expect(stepAt(6 * HR, 206)).toBe(3 * HR);
    expect(stepAt(6 * HR, 990)).toBe(30 * MIN);
  });

  it("reaches every increment of the ladder at some width, and the coarsest past it", () => {
    for (const step of TIME_STEPS) {
      expect(stepAt(step * 10, 800)).toBe(step);
    }
    expect(stepAt(365 * DAY, 100)).toBe(7 * DAY);
  });
});

describe("timeTicks", () => {
  // Local midnights in Paris around both 2026 changes, from Intl's offsets.
  const parisSpring = Date.UTC(2026, 2, 28, 23);
  const parisSpringEnd = Date.UTC(2026, 2, 29, 22);
  const parisAutumn = Date.UTC(2026, 9, 24, 22);
  const parisAutumnEnd = Date.UTC(2026, 9, 25, 23);
  const at = (step: number) => TIME_STEPS.indexOf(step);

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
