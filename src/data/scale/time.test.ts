import { describe, expect, it } from "vitest";

import { instantFormat, spanFormat } from "./format.js";
import { grainOf, grainsBetween } from "./time.js";

// Each engine's own time-zone data and date formats, so these run in all three.
const TZ = "Europe/Paris";
const HR = 3_600_000;

// Local midnight of a Paris date: UTC+1 in winter, UTC+2 from the last
// Sunday of March to the last Sunday of October.
const paris = (y: number, m: number, d: number, h = 0, min = 0): number => {
  const summer = Date.UTC(y, 2, 31 - new Date(Date.UTC(y, 2, 31)).getUTCDay(), 1);
  const winter = Date.UTC(y, 9, 31 - new Date(Date.UTC(y, 9, 31)).getUTCDay(), 1);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return guess - (guess - HR >= summer && guess - 2 * HR < winter ? 2 : 1) * HR;
};

describe("the grain a spec's instants fall on", () => {
  it("is a month when every instant is the 1st of a month at local midnight", () => {
    const months = Array.from({ length: 14 }, (_, i) => paris(2023, (i % 12) + 1, 1));
    expect(grainOf(months, TZ)).toBe("month");
  });

  it("is a day when every instant is a local midnight, across a clock change", () => {
    // Paris moves its clocks forward on 29 March 2026, a 23-hour day.
    const days = Array.from({ length: 6 }, (_, i) => paris(2026, 3, 27 + i));
    const [, , before = 0, after = 0] = days;
    expect(after - before).toBe(23 * HR);
    expect(grainOf(days, TZ)).toBe("day");
    expect(grainsBetween(before, after, "day", TZ)).toBe(1);
  });

  it("is a year when every instant is 1 January at local midnight", () => {
    const years = [2015, 2016, 2020].map((y) => paris(y, 1, 1));
    expect(grainOf(years, TZ)).toBe("year");
    expect(grainsBetween(paris(2016, 1, 1), paris(2020, 1, 1), "year", TZ)).toBe(4);
  });

  it("is a minute when one instant falls inside a day", () => {
    const mixed = [paris(2023, 1, 1), paris(2023, 2, 1), paris(2023, 2, 14, 14, 30)];
    expect(grainOf(mixed, TZ)).toBe("minute");
    // UTC midnight is 1:00 AM in Paris, so it is no local day.
    expect(grainOf([Date.UTC(2023, 0, 1), Date.UTC(2023, 1, 1)], TZ)).toBe("minute");
  });

  it("takes a day's first instant where its midnight is skipped", () => {
    // Santiago skipped from 00:00 to 01:00 on 8 September 2024 (UTC-4 to UTC-3).
    const days = [Date.UTC(2024, 8, 7, 4), Date.UTC(2024, 8, 8, 4), Date.UTC(2024, 8, 9, 3)];
    expect(grainOf(days, "America/Santiago")).toBe("day");
  });

  it("counts months on the calendar, whatever their length", () => {
    expect(grainsBetween(paris(2024, 1, 1), paris(2024, 3, 1), "month", TZ)).toBe(2);
    expect(grainsBetween(paris(2023, 11, 1), paris(2024, 2, 1), "month", TZ)).toBe(3);
  });
});

describe("an instant written at its grain", () => {
  it("writes a month and its year, a year alone, or a date", () => {
    expect(instantFormat("en", TZ, "day", "month")(paris(2023, 3, 1))).toBe("Mar 2023");
    expect(instantFormat("en", TZ, "year", "year")(paris(2023, 1, 1))).toBe("2023");
    expect(instantFormat("en", TZ, "day", "day")(paris(2023, 3, 4))).toBe("Mar 4");
    expect(instantFormat("en", TZ, "year", "day")(paris(2023, 3, 4))).toBe("Mar 4, 2023");
    expect(instantFormat("en", TZ, "day")(paris(2023, 3, 4, 14, 15))).toBe("Mar 4, 2:15 PM");
  });

  it("writes a bucket by the units it covers, and a span of instants by its ends", () => {
    const month = spanFormat("en", TZ, "day", "month");
    const texts = (parts: readonly { readonly text: string }[]) => parts.map((p) => p.text);
    expect(texts(month(paris(2023, 3, 1), paris(2023, 4, 1), true))).toEqual(["Mar 2023"]);
    const spring = month(paris(2023, 3, 1), paris(2023, 6, 1), true);
    expect(texts(spring)).toEqual(["Mar 2023", "May 2023"]);
    // Each part keeps the instant it names, to the millisecond.
    expect(spring.map((p) => p.at)).toEqual([paris(2023, 3, 1), paris(2023, 5, 1)]);
    expect(texts(month(paris(2023, 3, 1), paris(2023, 6, 1)))).toEqual(["Mar 2023", "Jun 2023"]);
    const day = spanFormat("en", TZ, "day", "day");
    expect(texts(day(paris(2026, 3, 29), paris(2026, 3, 30), true))).toEqual(["Mar 29"]);
    const minute = spanFormat("en", TZ, "day");
    expect(texts(minute(paris(2026, 3, 29, 14), paris(2026, 3, 29, 15), true))).toEqual([
      "Mar 29, 2:00 PM",
      "3:00 PM",
    ]);
  });
});
