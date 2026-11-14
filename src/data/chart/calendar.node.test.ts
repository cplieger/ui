import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import {
  dayAt,
  dayFormat,
  dayPlace,
  foldSize,
  isoWeekday,
  monthFirst,
  monthsFrom,
  weekCount,
  weekRow,
} from "./calendar.js";
import { layout, type Metrics } from "./layout.js";
import { chartModel, type CalendarModel } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";
import { generatedSummary, shortDescription } from "./summary.js";
import { chartWords } from "./words.js";

const DAY = 86_400_000;
const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
const metrics: Metrics = {
  measure: face,
  mono: face,
  lineHeight: 17,
  nameLine: 18,
  rem: 16,
  row: 24,
  axisGroup: 80,
  labelGroup: 0,
  height: 240,
  dpr: 1,
};
const words = chartWords();
// 1 January 2026, a Thursday.
const JAN1 = Date.UTC(2026, 0, 1);
const dayNo = (t: number) => Math.floor(t / DAY);

const year = (over: Partial<Extract<Mark, { mark: "cell" }>> = {}, spec: Partial<ChartSpec> = {}) =>
  ({
    marks: [
      {
        mark: "cell",
        days: { start: JAN1, values: Array.from({ length: 365 }, (_, i) => i % 10) },
        weekStart: 1,
        ...over,
      } as Mark,
    ],
    ...spec,
  }) as ChartSpec;

describe("calendar days and weeks", () => {
  it("numbers ISO weekdays from Monday, 1 January 1970 a Thursday", () => {
    expect(isoWeekday(0)).toBe(4);
    expect(isoWeekday(dayNo(Date.UTC(2026, 2, 2)))).toBe(1);
    expect(isoWeekday(dayNo(Date.UTC(2026, 2, 8)))).toBe(7);
    expect(isoWeekday(-1)).toBe(3);
  });

  it("places a day's row from the week's first day", () => {
    const sunday = dayNo(Date.UTC(2026, 2, 8));
    expect(weekRow(sunday, 7)).toBe(0);
    expect(weekRow(sunday + 1, 7)).toBe(1);
    expect(weekRow(sunday, 1)).toBe(6);
  });

  it("counts a year's week columns: 53, or 54 for a leap year starting on the week's last day", () => {
    expect(weekCount(3, 365)).toBe(53);
    expect(weekCount(6, 366)).toBe(54);
    expect(weekCount(0, 7)).toBe(1);
    expect(weekCount(6, 2)).toBe(2);
    expect(weekCount(0, 0)).toBe(0);
  });

  it("folds into 26 weeks, then 13, while a week column would be under 12 px", () => {
    expect(foldSize(53, 636)).toBe(53);
    expect(foldSize(53, 635)).toBe(26);
    expect(foldSize(53, 312)).toBe(26);
    expect(foldSize(53, 311)).toBe(13);
    expect(foldSize(53, 100)).toBe(13);
    expect(foldSize(54, 648)).toBe(54);
    expect(foldSize(5, 30)).toBe(5);
  });

  it("finds a day by its block, column and row, and nothing outside the days", () => {
    const w = { lead: 3, size: 13, days: 365 };
    expect(dayPlace(w, 0)).toEqual({ block: 0, column: 0, row: 3 });
    expect(dayPlace(w, 4)).toEqual({ block: 0, column: 1, row: 0 });
    expect(dayPlace(w, 88)).toEqual({ block: 1, column: 0, row: 0 });
    for (const i of [0, 4, 88, 364]) {
      const p = dayPlace(w, i);
      expect(dayAt(w, p.block, p.column, p.row)).toBe(i);
    }
    expect(dayAt(w, 0, 0, 2)).toBe(-1);
    expect(dayAt(w, 4, 1, 4)).toBe(-1);
    expect(dayAt(w, 0, 13, 0)).toBe(-1);
    expect(dayAt(w, 0, 0, 7)).toBe(-1);
  });

  it("moves a month to the same date, or the month's last day when it has none", () => {
    const day = (y: number, m: number, d: number) => dayNo(Date.UTC(y, m, d));
    expect(monthsFrom(day(2026, 0, 31), 1)).toBe(day(2026, 1, 28));
    expect(monthsFrom(day(2028, 0, 31), 1)).toBe(day(2028, 1, 29));
    expect(monthsFrom(day(2026, 2, 31), -1)).toBe(day(2026, 1, 28));
    expect(monthsFrom(day(2026, 11, 15), 1)).toBe(day(2027, 0, 15));
    expect(monthsFrom(day(2026, 0, 15), -1)).toBe(day(2025, 11, 15));
  });

  it("knows a month's first day and writes a day's own date", () => {
    expect(monthFirst(dayNo(Date.UTC(2026, 4, 1)))).toBe(true);
    expect(monthFirst(dayNo(Date.UTC(2026, 4, 2)))).toBe(false);
    expect(dayFormat("en", { dateStyle: "full" })(dayNo(JAN1))).toBe("Thursday, January 1, 2026");
  });
});

describe("a calendar's model", () => {
  const throws = (spec: ChartSpec, type: ErrorConstructor, message: RegExp) => {
    expect(() => chartModel(spec, "en", "UTC")).toThrow(type);
    expect(() => chartModel(spec, "en", "UTC")).toThrow(message);
  };

  it("is a calendar heatmap of its days from the first day's local date", () => {
    const model = chartModel(year(), "en", "UTC");
    const m = model.marks[0] as CalendarModel;
    expect(model.kind).toBe("calendar");
    expect(m.day).toBe(dayNo(JAN1));
    expect(m.weekStart).toBe(1);
    expect(m.open).toBe(false);
    expect(shortDescription(model, words)).toBe("Calendar heatmap, 365 days");
    expect(model.xText(JAN1 + 12 * 3_600_000)).toBe("Thursday, January 1, 2026");
  });

  it("takes the first day's date on the chart's wall clock", () => {
    // Midnight of 2 January in Paris is 11 PM on 1 January in UTC.
    const start = Date.UTC(2026, 0, 1, 23);
    const model = chartModel(year({ days: { start, values: [1] } }), "en", "Europe/Paris");
    expect((model.marks[0] as CalendarModel).day).toBe(dayNo(Date.UTC(2026, 0, 2)));
    expect(model.x.lo).toBe(start);
    expect(model.x.hi).toBe(start + DAY);
  });

  it("is empty with no days or every value null", () => {
    expect(chartModel(year({ days: { start: JAN1, values: [] } }), "en", "UTC").empty).toBe(true);
    expect(
      chartModel(year({ days: { start: JAN1, values: [null, Number.NaN] } }), "en", "UTC").empty,
    ).toBe(true);
    expect(chartModel(year({ days: { start: JAN1, values: [null, 0] } }), "en", "UTC").empty).toBe(
      false,
    );
  });

  it("refuses days beside x, y or values, and a bad week start", () => {
    for (const field of ["x", "y", "values"]) {
      throws(
        year({ [field]: ["a"] } as never),
        TypeError,
        new RegExp(`\\.${field} has no place beside days`),
      );
    }
    for (const weekStart of [0, 8, 1.5, "1"]) {
      throws(year({ weekStart } as never), TypeError, /weekStart must be an ISO weekday/u);
    }
    throws(
      {
        marks: [{ mark: "cell", x: ["a"], y: ["b"], values: [[1]], weekStart: 1 } as never],
      },
      TypeError,
      /weekStart has no place without days/u,
    );
  });

  it("refuses a start that is not a finite number and values that are not numbers or infinite", () => {
    throws(
      year({ days: { start: "x", values: [] } } as never),
      TypeError,
      /days\.start must be a number/u,
    );
    throws(
      year({ days: { start: Number.NaN, values: [] } }),
      RangeError,
      /days\.start must be finite/u,
    );
    throws(
      year({ days: { start: JAN1, values: ["1"] } } as never),
      TypeError,
      /days\.values must be/u,
    );
    throws(
      year({ days: { start: JAN1, values: [Number.POSITIVE_INFINITY] } }),
      RangeError,
      /cannot hold an infinite value/u,
    );
    throws(
      year({ days: { start: JAN1, values: [1], open: 1 } } as never),
      TypeError,
      /days\.open/u,
    );
  });

  it("refuses height, an x or y scale, and rules, and takes a colour scale", () => {
    throws(year({}, { height: 200 }), TypeError, /height has no place on a calendar/u);
    throws(year({}, { x: {} }), TypeError, /a calendar takes no x scale/u);
    throws(year({}, { y: {} }), TypeError, /a calendar takes no y scale/u);
    const rule = (r: Mark) => year({}, { marks: [...year().marks, r] });
    throws(rule({ mark: "rule", x: JAN1, label: "Launch" }), TypeError, /a rule on a calendar/u);
    throws(rule({ mark: "rule", y: 3, label: "Target" }), TypeError, /a rule on a calendar/u);
    expect(
      chartModel(year({}, { colour: { type: "diverging", pivot: 5 } }), "en", "UTC").kind,
    ).toBe("calendar");
  });

  it("takes a note's x as an instant and refuses its y", () => {
    const noted = (t: Mark) => year({}, { marks: [...year().marks, t] });
    throws(
      noted({ mark: "text", x: JAN1, y: 1, text: "A" }),
      TypeError,
      /\.y has no place on a calendar/u,
    );
    throws(
      noted({ mark: "text", x: "Jan", text: "A" }),
      TypeError,
      /\.x must be a number on a calendar/u,
    );
    throws(noted({ mark: "text", text: "A" }), TypeError, /\.x must be a number on a calendar/u);
  });
});

describe("a calendar's layout", () => {
  it("lays a year in one block of 53 weeks when each is 12 px or more", () => {
    const model = chartModel(year(), "en", "UTC");
    const lay = layout(model, words, metrics, 900, { axis: 0, label: 0 });
    const g = lay.days;
    expect(g?.weeks).toEqual({ lead: 3, size: 53, days: 365 });
    expect(g?.row).toBe(24);
    expect(g?.tops).toEqual([17]);
    expect(lay.height).toBe(17 + 7 * 24);
    expect(lay.yLabels.map((l) => l.text)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    const months = lay.xLabels.map((l) => l.text);
    expect(months).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
    // January's first day sits in the first column, February's in the fifth.
    expect(lay.xLabels[0]?.x).toBe(lay.left);
    expect(lay.xLabels[1]?.x).toBeCloseTo(lay.left + 4 * (g?.column ?? 0));
  });

  it("folds a year on a phone into four blocks of 13 weeks and a fifth of the last, 16 px apart", () => {
    const model = chartModel(year(), "en", "UTC");
    const lay = layout(model, words, metrics, 320, { axis: 0, label: 0 }, 320);
    const g = lay.days;
    expect(g?.weeks.size).toBe(13);
    expect(g?.tops).toEqual([17, 17 + 185 + 16, 17 + 2 * 201, 17 + 3 * 201, 17 + 4 * 201]);
    expect(lay.height).toBe(5 * 185 + 4 * 16);
    expect(lay.yLabels.length).toBe(35);
    // Each block names the months that start in it, above it.
    const april = lay.xLabels.find((l) => l.text === "Apr");
    expect(april?.y).toBe((g?.tops[1] ?? 0) - 17 / 2);
  });

  it("starts its weeks on the week start it is given", () => {
    const model = chartModel(year({ weekStart: 7 }), "en", "UTC");
    const lay = layout(model, words, metrics, 900, { axis: 0, label: 0 });
    expect(lay.days?.weeks.lead).toBe(4);
    expect(lay.yLabels[0]?.text).toBe("Sun");
  });
});

describe("a calendar's summary", () => {
  const values = [3, 9, null, 1, 9, 1, 12];

  it("counts the days and names the highest and lowest, the earliest on a tie", () => {
    const model = chartModel(
      year(
        { days: { start: JAN1, values } },
        { colour: { unit: { one: "post", other: "posts" } } },
      ),
      "en",
      "UTC",
    );
    expect(generatedSummary(model, words)).toBe(
      "7 days. Highest Wednesday, January 7, 2026: 12\u00A0posts. Lowest Sunday, January 4, 2026: 1\u00A0post.",
    );
  });

  it("leaves an open last day out of the extremes", () => {
    const model = chartModel(year({ days: { start: JAN1, values, open: true } }), "en", "UTC");
    expect(generatedSummary(model, words)).toBe(
      "7 days. Highest Friday, January 2, 2026: 9. Lowest Sunday, January 4, 2026: 1.",
    );
  });
});
