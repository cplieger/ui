import { describe, expect, it } from "vitest";

import { writer } from "../scale/format.js";
import { measurer } from "../scale/measure.js";

import {
  axisGutter,
  bandLimit,
  cutName,
  ruleBand,
  xAxis,
  yAxis,
  type Axis,
  type AxisContext,
} from "./axis.js";
import { check } from "./check.js";
import { xScale as scaleOf, yScale as yScaleOf, type Continuous } from "./scales.js";
import type { ChartSpec } from "./spec.js";
import { binsFrame, categories, grid, ladder, seriesFrame } from "./test-helpers/frames.js";

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;
const DAY = 24 * HR;
// A duration's seconds.
const D = { s: 1, min: 60, hr: 3_600, day: 86_400 } as const;

// A face 7.5 px a character, so the read histogram's duration labels run 30 to 52 px.
const perChar = (w: number) => (text: string) => w * Array.from(text).length;
const ctx = (locale = "en", w = 7.5): AxisContext => ({
  locale,
  timeZone: "Europe/Paris",
  measure: measurer(perChar(w), w, locale),
});
const fixed = (width: number): AxisContext => ({
  locale: "en",
  timeZone: "Europe/Paris",
  measure: { text: () => width, number: () => width },
});

const labelled = (axis: Axis) => axis.ticks.filter((t) => t.label !== undefined);
// The value between the first two ticks, which run in position order.
const step = (axis: Axis) =>
  Math.abs((axis.ticks[1]?.value ?? Number.NaN) - (axis.ticks[0]?.value ?? Number.NaN));
const words = (axis: Axis) => labelled(axis).map((t) => t.label?.lines.join("\n"));

// A spec's scales, as the chart builds them from its checked plot.
const xScale = (spec: ChartSpec): Continuous => scaleOf(check(spec));
const yScale = (spec: ChartSpec) => yScaleOf(check(spec));

// A line with no data, its x the scale `x` alone.
const bare = (x: NonNullable<ChartSpec["x"]>): ChartSpec => ({
  data: seriesFrame([], []),
  mark: { mark: "line" },
  x,
});

// A line of one series "a" at y 1, 2, ... over `x`.
const line = (x: readonly number[], scale: NonNullable<ChartSpec["x"]> = {}): ChartSpec => ({
  data: seriesFrame(x, [x.map((_, i) => i + 1)]),
  mark: { mark: "line" },
  x: scale,
});

// Unit bins from 0 on a value x, a series per values list.
const bins = (...values: number[][]): ChartSpec => ({
  data: binsFrame([0], [1], values, { axis: "value" }),
  mark: { mark: "rect" },
});

const histogram = (max?: number): ChartSpec => {
  const edges = ladder(max);
  return {
    data: binsFrame(edges.slice(0, -1), edges.slice(1), [edges.slice(1).map(() => 1)], {
      axis: "value",
      unit: "seconds",
    }),
    mark: { mark: "rect" },
    x: { type: "log", domain: [D.s, edges.at(-1) ?? 0] },
  };
};

const time = (lo: number, hi: number): Continuous =>
  xScale(bare({ type: "time", domain: [lo, hi] }));

// 8:00 AM on 11 November 2026 in Paris (UTC+1).
const eight = Date.UTC(2026, 10, 11, 7);

describe("a duration axis", () => {
  it("places the read histogram's eight ticks near 15, 63, 100, 149, 186, 224, 253 and 276 px on the phone plot", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    const at = [D.s, 10 * D.s, D.min, 10 * D.min, D.hr, 6 * D.hr, D.day, 3 * D.day].map((v) =>
      Math.round(axis.at(v)),
    );
    expect(at).toEqual([15, 63, 100, 149, 186, 224, 253, 276]);
  });

  it("thins the read histogram's ticks at 276 px to 1 sec, 1 min, 1 hr and 3 days", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    expect(axis.ticks.map((t) => t.value)).toEqual([D.s, D.min, D.hr, 3 * D.day]);
    expect(words(axis)).toEqual(
      [D.s, D.min, D.hr, 3 * D.day].map((v) => writer("duration", "en")(v)),
    );
    expect(axis.ticks.at(-1)?.label?.box.end).toBe(276);
    expect(axis.ticks[0]?.label?.box.start).toBe(0);
  });

  it("ends the thinned list at 7 days or 90 days at those retentions, near 14, 94, 175 and 276 px and 12, 80, 148 and 276 px", () => {
    const week = xAxis(xScale(histogram(7 * D.day)), 276, ctx());
    expect(week.ticks.map((t) => t.value)).toEqual([D.s, D.min, D.hr, 7 * D.day]);
    expect(week.ticks.map((t) => Math.round(t.at))).toEqual([14, 94, 175, 276]);
    const quarter = xAxis(xScale(histogram(90 * D.day)), 276, ctx());
    expect(quarter.ticks.map((t) => t.value)).toEqual([D.s, D.min, D.hr, 90 * D.day]);
    expect(quarter.ticks.map((t) => Math.round(t.at))).toEqual([12, 80, 148, 276]);
  });

  it("keeps every tick where they all fit", () => {
    const axis = xAxis(xScale(histogram()), 990, ctx());
    expect(axis.ticks).toHaveLength(8);
    expect(labelled(axis)).toHaveLength(8);
  });

  it("starts the drawing at the underflow bin's drawn edge, with no tick in the extension", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    expect(axis.at(0.5)).toBe(0);
    expect(Math.min(...axis.ticks.map((t) => t.value))).toBe(D.s);
  });
});

describe("a time axis", () => {
  it("steps 2 hours over 6 at 276 px, writing the hour and the date at the first tick", () => {
    for (const locale of ["en", "fr"]) {
      const axis = xAxis(time(eight, eight + 6 * HR), 276, ctx(locale));
      expect(step(axis)).toBe(2 * HR);
      const hour = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "Europe/Paris" });
      const day = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "Europe/Paris",
      });
      const values = [0, 2, 4, 6].map((h) => eight + h * HR);
      expect(axis.ticks.map((t) => t.value)).toEqual(values);
      expect(axis.ticks.map((t) => Math.round(t.at))).toEqual([0, 92, 184, 276]);
      expect(axis.ticks.map((t) => t.label?.lines)).toEqual(
        values.map((v, i) => (i === 0 ? [hour.format(v), day.format(v)] : [hour.format(v)])),
      );
    }
  });

  it("steps 12 hours over 24 and a day over 72 at 276 px, a day step writing only the date", () => {
    expect(step(xAxis(time(eight - 18 * HR, eight + 6 * HR), 276, ctx()))).toBe(12 * HR);
    const days = xAxis(time(eight - 66 * HR, eight + 6 * HR), 276, ctx());
    expect(step(days)).toBe(DAY);
    const day = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "Europe/Paris",
    });
    expect(days.ticks.map((t) => t.label?.lines)).toEqual(
      days.ticks.map((t) => [day.format(t.value)]),
    );
  });

  it("steps 3 hours over 6 at 206 px and 30 minutes at 990 px", () => {
    expect(step(xAxis(time(eight, eight + 6 * HR), 206, ctx()))).toBe(3 * HR);
    const wide = xAxis(time(eight, eight + 6 * HR), 990, ctx());
    expect(step(wide)).toBe(30 * MIN);
    expect(wide.ticks).toHaveLength(13);
    const minute = new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
    // The flush first label leaves 8:30 too little room; 9:00 is the next kept.
    expect(wide.ticks[1]?.label).toBeUndefined();
    expect(wide.ticks[2]?.label?.lines).toEqual([minute.format(eight + HR)]);
  });

  it("writes the date wherever the day changes", () => {
    const lo = eight - 2 * DAY + 10 * HR; // 6:00 PM on 9 November
    const axis = xAxis(time(lo, lo + 3 * DAY), 990, ctx());
    expect(step(axis)).toBe(6 * HR);
    const dated = axis.ticks.filter((t) => t.label?.lines.length === 2).map((t) => t.value);
    // The first tick, then each local midnight.
    expect(dated).toEqual([lo, lo + 6 * HR, lo + 30 * HR, lo + 54 * HR]);
  });

  it("passes a dropped label's date to the next label kept", () => {
    const lo = eight - 2 * DAY + 10 * HR;
    // Labels 100 px wide on ticks 82.5 px apart: every other one is kept,
    // and the midnights fall on the dropped ones.
    const axis = xAxis(time(lo, lo + 3 * DAY), 990, fixed(100));
    expect(step(axis)).toBe(6 * HR);
    expect(axis.ticks).toHaveLength(13);
    expect(labelled(axis).map((t) => t.value)).toEqual(
      [0, 12, 24, 36, 48, 60, 72].map((h) => lo + h * HR),
    );
    const dated = axis.ticks.filter((t) => t.label?.lines.length === 2).map((t) => t.value);
    expect(dated).toEqual([lo, lo + 12 * HR, lo + 36 * HR, lo + 60 * HR]);
  });

  it("moves to a coarser step rather than drop more than every other label", () => {
    const axis = xAxis(time(eight, eight + 6 * HR), 276, fixed(200));
    expect(step(axis)).toBe(3 * HR);
  });

  it("keeps every label inside the plot", () => {
    const axis = xAxis(time(eight - 66 * HR, eight + 6 * HR), 276, ctx());
    for (const t of labelled(axis)) {
      expect(t.label?.box.start).toBeGreaterThanOrEqual(0);
      expect(t.label?.box.end).toBeLessThanOrEqual(276);
    }
  });

  it("runs leftward under reverse", () => {
    const axis = xAxis(
      xScale(bare({ type: "time", domain: [eight, eight + 6 * HR], reverse: true })),
      276,
      ctx(),
    );
    expect(axis.at(eight)).toBe(276);
    expect(axis.ticks.map((t) => t.value)).toEqual([6, 4, 2, 0].map((h) => eight + h * HR));
    expect(axis.ticks.at(-1)?.label?.lines).toHaveLength(2);
  });

  it("steps a month over a year, writing the year at the first tick and where it changes", () => {
    const lo = Date.UTC(2026, 0, 15);
    const axis = xAxis(time(lo, lo + 365 * DAY), 990, ctx());
    const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "Europe/Paris" });
    const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Paris" });
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      hourCycle: "h23",
      dateStyle: "short",
      timeStyle: "short",
    });
    const values = axis.ticks.map((t) => t.value);
    expect(values.map((v) => local.format(v))).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        .map((m) => `2026-${String(m).padStart(2, "0")}-01, 00:00`)
        .concat("2027-01-01, 00:00"),
    );
    expect(axis.ticks.map((t) => t.label?.lines)).toEqual(
      values.map((v, i) =>
        i === 0 || i === 11 ? [month.format(v), year.format(v)] : [month.format(v)],
      ),
    );
    expect(words(axis).at(-1)).toBe("Jan\n2027");
  });

  it("steps a decade over 30 years at 276 px, each tick its year alone", () => {
    const axis = xAxis(time(Date.UTC(1996, 0, 1), Date.UTC(2026, 0, 1)), 276, ctx());
    expect(axis.ticks.map((t) => t.value)).toEqual(
      [2000, 2010, 2020].map((y) => Date.UTC(y, 0, 1) - HR),
    );
    expect(words(axis)).toEqual(["2000", "2010", "2020"]);
  });

  it("writes the era on every year of a domain that starts before year 1", () => {
    const year = (y: number) => new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(y);
    const axis = xAxis(time(year(-3000), year(7000)), 990, ctx());
    expect(words(axis)[0]).toBe("2001 BC");
    expect(words(axis)).toContain("1000 AD");
  });

  it("refuses an instant past Date's range with a RangeError naming its field and the limit", () => {
    expect(() => time(0, 1e16)).toThrow(
      new RangeError(
        "renderChart: x.domain[1] must lie within 8.64e15 ms either side of 1970, the range Date holds",
      ),
    );
    expect(words(xAxis(time(-8.64e15, 8.64e15), 990, ctx())).length).toBeGreaterThan(1);
  });
});

describe("a linear axis", () => {
  it("nices x to ticks 80 px apart", () => {
    const scale = xScale(line([3, 97]));
    const axis = xAxis(scale, 400, ctx());
    expect([axis.lo, axis.hi, step(axis)]).toEqual([0, 100, 20]);
    expect(axis.ticks.map((t) => t.at)).toEqual([0, 80, 160, 240, 320, 400]);
  });

  it("moves to a coarser step when greedy would drop more than every other label", () => {
    const scale = xScale(bare({ domain: [0, 100] }));
    const axis = xAxis(scale, 400, fixed(150));
    expect(step(axis)).toBe(50);
    expect(labelled(axis).map((t) => t.value)).toEqual([0, 100]);
  });

  it("ticks y 40 px apart up from zero", () => {
    const y = yScale(bins([312]));
    if (y.type === "band") {
      throw new Error("expected a linear y");
    }
    const axis = yAxis(y, 240, 16, ctx());
    expect([axis.lo, axis.hi, step(axis)]).toEqual([0, 400, 100]);
    expect(axis.at(0)).toBe(240);
    expect(axis.at(400)).toBe(0);
    expect(labelled(axis)).toHaveLength(5);
    expect(axis.ticks.find((t) => t.value === 100)?.label?.width).toBe(3 * 7.5);
  });

  it("ticks a 100% bar chart's x from 0% to 100% at its passed ends, 80 px apart", () => {
    const scale = xScale({
      data: categories(["a"], [[3], [1]]),
      mark: { mark: "bar", arrange: "share" },
    });
    const axis = xAxis(scale, 400, ctx());
    expect([axis.lo, axis.hi]).toEqual([0, 1]);
    expect(axis.ticks.map((t) => t.at)).toEqual([0, 80, 160, 240, 320, 400]);
    expect(words(axis)).toEqual(["0%", "20%", "40%", "60%", "80%", "100%"]);
  });

  it("writes a diverging bar chart's ticks as distances from 0 both ways", () => {
    const scale = xScale({
      data: categories(["a"], [[0.4], [0.6]], { unit: "ratio" }),
      mark: { mark: "bar", arrange: "diverge", left: 1 },
    });
    const axis = xAxis(scale, 400, ctx());
    expect([axis.lo, axis.hi]).toEqual([-0.4, 0.6]);
    expect(words(axis)).toEqual(["40%", "20%", "0%", "20%", "40%", "60%"]);
  });

  it("steps y at whole numbers when every value is an integer", () => {
    const y = yScale(bins([3]));
    if (y.type === "band") {
      throw new Error("expected a linear y");
    }
    // In px order along the axis, the top first.
    expect(yAxis(y, 240, 16, ctx()).ticks.map((t) => t.value)).toEqual([3, 2, 1, 0]);
  });

  it("ends a stack's y at its round total, though the sum drifts past it", () => {
    // 0.4 + 0.8 is 1.2000000000000002.
    const y = yScale(bins([0.4], [0.8]));
    if (y.type === "band") {
      throw new Error("expected a linear y");
    }
    const axis = yAxis(y, 240, 16, ctx());
    expect([axis.lo, axis.hi]).toEqual([0, 1.2]);
    expect(axis.ticks.map((t) => t.value)).toEqual([1.2, 1, 0.8, 0.6, 0.4, 0.2, 0]);
  });

  it("ticks only inside a passed domain, wherever its ends fall between multiples", () => {
    for (const domain of [
      [123456789012.4, 123456789013.9],
      [1e15 + 24000, 1e15 + 40000],
      [0.1 + 0.2, 0.7],
    ] as const) {
      const axis = xAxis(xScale(bare({ domain })), 600, ctx());
      expect(axis.ticks.length).toBeGreaterThan(0);
      for (const t of axis.ticks) {
        expect(t.value >= domain[0] && t.value <= domain[1]).toBe(true);
        expect(t.at >= 0 && t.at <= 600).toBe(true);
      }
    }
  });

  it("writes every tick with its step's fraction digits", () => {
    const x = [0.1, 1.9];
    const one = (format?: "percent") =>
      xScale(line(x, { domain: [0, 2], ...(format && { format }) }));
    expect(words(xAxis(one(), 400, fixed(10)))).toEqual(["0.0", "0.5", "1.0", "1.5", "2.0"]);
    const fine = xScale(line(x, { domain: [0, 0.0004] }));
    expect(words(xAxis(fine, 400, fixed(10)))).toEqual([
      "0.0000",
      "0.0001",
      "0.0002",
      "0.0003",
      "0.0004",
    ]);
    expect(words(xAxis(one("percent"), 400, fixed(10)))).toEqual([
      "0%",
      "50%",
      "100%",
      "150%",
      "200%",
    ]);
    const share = xScale(line(x, { domain: [0, 0.02], format: "percent" }));
    expect(words(xAxis(share, 400, fixed(10)))).toEqual(["0.0%", "0.5%", "1.0%", "1.5%", "2.0%"]);
  });

  it("writes ticks finer than Intl's 100 fraction digits in scientific notation, 0 as 0", () => {
    const tiny = xScale(line([0, 4e-101], { domain: [0, 4e-101] }));
    expect(words(xAxis(tiny, 400, fixed(10)))).toEqual([
      "0",
      "1E-101",
      "2E-101",
      "3E-101",
      "4E-101",
    ]);
  });

  it("writes a log axis's ticks with the digits each needs", () => {
    const log = xScale(bare({ type: "log", domain: [0.0001, 1] }));
    expect(words(xAxis(log, 400, fixed(10)))).toEqual(
      [1e-4, 1e-3, 1e-2, 1e-1].flatMap((p) => [1, 2, 5].map((m) => String(m * p))).concat("1"),
    );
  });

  it("widens one value from 1e12 by its twelfth figure, the finest step the axis takes", () => {
    const one = (v: number) => xScale(line([v], { type: "linear" }));
    expect([one(100).lo, one(100).hi]).toEqual([99, 101]);
    const axis = xAxis(one(1e16), 400, ctx());
    expect([axis.lo, axis.hi].every(Number.isFinite)).toBe(true);
    expect(axis.lo < 1e16 && 1e16 < axis.hi).toBe(true);
    expect(axis.ticks.length).toBeGreaterThan(1);
  });

  it("spans ±1e300, the largest value a chart takes, with finite ticks in order", () => {
    for (const x of [{ type: "linear", domain: [-1e300, 1e300] }, { type: "linear" }] as const) {
      const scale = xScale(line([-1e300, 1e300], x));
      const axis = xAxis(scale, 400, ctx());
      const values = axis.ticks.map((t) => t.value);
      // Each label writes all 301 digits, so only the tick at 0 fits.
      expect(values).toContain(0);
      expect([axis.lo, axis.hi]).toEqual([-1e300, 1e300]);
      expect(
        values.every((v, k) => Number.isFinite(v) && (k === 0 || v > (values[k - 1] ?? 0))),
      ).toBe(true);
    }
  });
});

describe("the y gutter", () => {
  it("is the widest label and its 8 px pad, or the group's when wider", () => {
    expect(axisGutter(40, 0)).toBe(48);
    expect(axisGutter(40, 80)).toBe(80);
    expect(axisGutter(90, 80)).toBe(98);
  });

  it("cuts band names to the group gutter less its pad, so the gutter is the group's", () => {
    const mono = perChar(7.8);
    const limit = bandLimit(80, 358, 16);
    expect(limit).toBe(72);
    const cut = cutName("orchestrator-primary", limit, mono);
    expect(cut).toBe("orchestr…");
    expect(axisGutter(mono(cut), 80)).toBe(80);
    expect(cutName("lead-ui", limit, mono)).toBe("lead-ui");
  });

  it("cuts at 40 % of the chart's width, at most 12rem, with no group gutter", () => {
    expect(bandLimit(0, 358, 16)).toBeCloseTo(143.2, 9);
    expect(bandLimit(0, 1_200, 16)).toBe(192);
  });

  it("cuts by grapheme, never inside one", () => {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const perGrapheme = (text: string) => 10 * Array.from(segmenter.segment(text)).length;
    expect(cutName("👩‍💻👩‍💻👩‍💻", 25, perGrapheme)).toBe("👩‍💻…");
    expect(cutName("abc", 5, perGrapheme)).toBe("…");
  });
});

describe("the rule label band", () => {
  it("lays the read histogram's labels at 276 px: the median running right, the 95th percentile ending at its rule on the second line", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    const median = axis.at(42 * D.s);
    const p95 = axis.at(18 * D.min);
    expect(Math.round(median)).toBe(93);
    expect(Math.round(p95)).toBe(161);
    const band = ruleBand(
      [
        { at: median, width: 91 },
        { at: p95, width: 150 },
      ],
      276,
    );
    expect(band.placed).toEqual([
      { start: median, line: 0 },
      { start: p95 - 150, line: 1 },
    ]);
    expect(band.lines).toBe(2);
  });

  it("keeps labels 8 px apart on one line", () => {
    expect(
      ruleBand(
        [
          { at: 0, width: 50 },
          { at: 58, width: 50 },
        ],
        276,
      ).lines,
    ).toBe(1);
    expect(
      ruleBand(
        [
          { at: 0, width: 50 },
          { at: 57, width: 50 },
        ],
        276,
      ).lines,
    ).toBe(2);
  });

  it("sets an off-axis label flush with its end", () => {
    expect(ruleBand([{ off: "high", width: 120 }], 276).placed).toEqual([{ start: 156, line: 0 }]);
    expect(ruleBand([{ off: "low", width: 120 }], 276).placed).toEqual([{ start: 0, line: 0 }]);
  });

  it("keeps a label wider than either side of its rule inside the plot, and none means no band", () => {
    expect(ruleBand([{ at: 100, width: 200 }], 276).placed).toEqual([{ start: 0, line: 0 }]);
    expect(ruleBand([{ at: 200, width: 300 }], 276).placed).toEqual([{ start: 0, line: 0 }]);
    expect(ruleBand([], 276).lines).toBe(0);
  });
});

describe("a binned axis", () => {
  const binned = (
    x: readonly number[],
    y: readonly number[],
    type: "linear" | "log",
  ): ChartSpec => ({
    data: grid(
      { edges: [...x] },
      { edges: [...y] },
      y.slice(1).map(() => x.slice(1).map(() => 1)),
    ),
    mark: { mark: "cell" },
    x: { type },
    y: { type },
  });

  it("runs a linear x and y from the first edge to the last, unniced, with ticks of its type between", () => {
    const spec = binned([52, 57, 62, 67, 72, 77, 82], [52, 57, 62, 67, 72, 77, 82], "linear");
    const x = xAxis(xScale(spec), 276, ctx());
    expect([x.lo, x.hi, x.at(52), x.at(82)]).toEqual([52, 82, 0, 276]);
    expect(x.ticks.map((t) => t.value)).toEqual([60, 70, 80]);
    const y = yAxis(yScale(spec) as Continuous, 240, 17, ctx());
    expect([y.lo, y.hi, y.at(52), y.at(82)]).toEqual([52, 82, 240, 0]);
    expect(y.ticks.every((t) => t.value >= 52 && t.value <= 82)).toBe(true);
  });

  it("ticks a log x of bins at its powers of ten between its ends", () => {
    const edges = [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000];
    const x = xAxis(xScale(binned(edges, [0, 1], "log")), 276, ctx());
    expect([x.lo, x.hi, x.at(500), x.at(200_000)]).toEqual([500, 200_000, 0, 276]);
    expect(words(x)).toEqual(["1,000", "10,000", "100,000"]);
  });
});
