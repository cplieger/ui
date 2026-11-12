import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { durationEdges } from "../scale/ladder.js";
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
import { xScale, yScale, type Continuous } from "./scales.js";
import type { ChartSpec } from "./spec.js";

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;
const DAY = 24 * HR;

// A face 7.5 px a character, so job 2's duration labels run 30 to 52 px.
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
const words = (axis: Axis) => labelled(axis).map((t) => t.label?.lines.join("\n"));

const histogram = (maxMs?: number): ChartSpec => {
  const edges = durationEdges(maxMs);
  return {
    x: { type: "log", format: "duration", domain: [S, edges.at(-1) ?? 0] },
    marks: [
      {
        mark: "rect",
        x1: edges.slice(0, -1),
        x2: edges.slice(1),
        series: [{ name: "Reads", y: edges.slice(1).map(() => 1) }],
      },
    ],
  };
};

const time = (lo: number, hi: number): Continuous =>
  xScale({ x: { type: "time", domain: [lo, hi] }, marks: [] });

// 8:00 AM on 11 November 2026 in Paris (UTC+1).
const eight = Date.UTC(2026, 10, 11, 7);

describe("a duration axis", () => {
  it("places job 2's eight ticks near 15, 63, 100, 149, 186, 224, 253 and 276 px on the phone plot", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    const at = [S, 10 * S, MIN, 10 * MIN, HR, 6 * HR, DAY, 3 * DAY].map((v) =>
      Math.round(axis.at(v)),
    );
    expect(at).toEqual([15, 63, 100, 149, 186, 224, 253, 276]);
  });

  it("thins job 2's ticks at 276 px to 1 sec, 1 min, 1 hr and 3 days", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    expect(axis.ticks.map((t) => t.value)).toEqual([S, MIN, HR, 3 * DAY]);
    expect(words(axis)).toEqual([S, MIN, HR, 3 * DAY].map((v) => formatDuration(v, "en")));
    expect(axis.ticks.at(-1)?.label?.box.end).toBe(276);
    expect(axis.ticks[0]?.label?.box.start).toBe(0);
  });

  it("ends the thinned list at 7 days or 90 days at those retentions, near the positions the design gives", () => {
    const week = xAxis(xScale(histogram(7 * DAY)), 276, ctx());
    expect(week.ticks.map((t) => t.value)).toEqual([S, MIN, HR, 7 * DAY]);
    expect(week.ticks.map((t) => Math.round(t.at))).toEqual([14, 94, 175, 276]);
    const quarter = xAxis(xScale(histogram(90 * DAY)), 276, ctx());
    expect(quarter.ticks.map((t) => t.value)).toEqual([S, MIN, HR, 90 * DAY]);
    expect(quarter.ticks.map((t) => Math.round(t.at))).toEqual([12, 80, 148, 276]);
  });

  it("keeps every tick where they all fit", () => {
    const axis = xAxis(xScale(histogram()), 990, ctx());
    expect(axis.ticks).toHaveLength(8);
    expect(labelled(axis)).toHaveLength(8);
  });

  it("starts the drawing at the underflow bin's drawn edge, with no tick in the extension", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    expect(axis.at(500)).toBe(0);
    expect(Math.min(...axis.ticks.map((t) => t.value))).toBe(S);
  });
});

describe("a time axis", () => {
  it("steps 2 hours over 6 at 276 px, writing the hour and the date at the first tick", () => {
    for (const locale of ["en", "fr"]) {
      const axis = xAxis(time(eight, eight + 6 * HR), 276, ctx(locale));
      expect(axis.step).toBe(2 * HR);
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
    expect(xAxis(time(eight - 18 * HR, eight + 6 * HR), 276, ctx()).step).toBe(12 * HR);
    const days = xAxis(time(eight - 66 * HR, eight + 6 * HR), 276, ctx());
    expect(days.step).toBe(DAY);
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
    expect(xAxis(time(eight, eight + 6 * HR), 206, ctx()).step).toBe(3 * HR);
    const wide = xAxis(time(eight, eight + 6 * HR), 990, ctx());
    expect(wide.step).toBe(30 * MIN);
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
    expect(axis.step).toBe(6 * HR);
    const dated = axis.ticks.filter((t) => t.label?.lines.length === 2).map((t) => t.value);
    // The first tick, then each local midnight.
    expect(dated).toEqual([lo, lo + 6 * HR, lo + 30 * HR, lo + 54 * HR]);
  });

  it("passes a dropped label's date to the next label kept", () => {
    const lo = eight - 2 * DAY + 10 * HR;
    // Labels 100 px wide on ticks 82.5 px apart: every other one is kept,
    // and the midnights fall on the dropped ones.
    const axis = xAxis(time(lo, lo + 3 * DAY), 990, fixed(100));
    expect(axis.step).toBe(6 * HR);
    expect(axis.ticks).toHaveLength(13);
    expect(labelled(axis).map((t) => t.value)).toEqual(
      [0, 12, 24, 36, 48, 60, 72].map((h) => lo + h * HR),
    );
    const dated = axis.ticks.filter((t) => t.label?.lines.length === 2).map((t) => t.value);
    expect(dated).toEqual([lo, lo + 12 * HR, lo + 36 * HR, lo + 60 * HR]);
  });

  it("moves to a coarser step rather than drop more than every other label", () => {
    const axis = xAxis(time(eight, eight + 6 * HR), 276, fixed(200));
    expect(axis.step).toBe(3 * HR);
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
      xScale({ x: { type: "time", domain: [eight, eight + 6 * HR], reverse: true }, marks: [] }),
      276,
      ctx(),
    );
    expect(axis.at(eight)).toBe(276);
    expect(axis.ticks.map((t) => t.value)).toEqual([6, 4, 2, 0].map((h) => eight + h * HR));
    expect(axis.ticks.at(-1)?.label?.lines).toHaveLength(2);
  });
});

describe("a linear axis", () => {
  it("nices x to ticks 80 px apart", () => {
    const scale = xScale({
      x: {},
      marks: [{ mark: "line", x: [3, 97], series: [{ name: "a", y: [1, 2] }] }],
    });
    const axis = xAxis(scale, 400, ctx());
    expect([axis.lo, axis.hi, axis.step]).toEqual([0, 100, 20]);
    expect(axis.ticks.map((t) => t.at)).toEqual([0, 80, 160, 240, 320, 400]);
  });

  it("moves to a coarser step when greedy would drop more than every other label", () => {
    const scale = xScale({ x: { domain: [0, 100] }, marks: [] });
    const axis = xAxis(scale, 400, fixed(150));
    expect(axis.step).toBe(50);
    expect(labelled(axis).map((t) => t.value)).toEqual([0, 100]);
  });

  it("ticks y 40 px apart up from zero", () => {
    const y = yScale({
      x: {},
      marks: [{ mark: "rect", x1: [0], x2: [1], series: [{ name: "a", y: [312] }] }],
    });
    if (y.type === "band") {
      throw new Error("expected a linear y");
    }
    const axis = yAxis(y, 240, 16, ctx());
    expect([axis.lo, axis.hi, axis.step]).toEqual([0, 400, 100]);
    expect(axis.at(0)).toBe(240);
    expect(axis.at(400)).toBe(0);
    expect(labelled(axis)).toHaveLength(5);
    expect(axis.ticks.find((t) => t.value === 100)?.label?.width).toBe(3 * 7.5);
  });

  it("steps y at whole numbers when every value is an integer", () => {
    const y = yScale({
      x: {},
      marks: [{ mark: "rect", x1: [0], x2: [1], series: [{ name: "a", y: [3] }] }],
    });
    if (y.type === "band") {
      throw new Error("expected a linear y");
    }
    // In px order along the axis, the top first.
    expect(yAxis(y, 240, 16, ctx()).ticks.map((t) => t.value)).toEqual([3, 2, 1, 0]);
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
  it("lays job 2's labels at 276 px: the median running right, the 95th percentile ending at its rule on the second line", () => {
    const axis = xAxis(xScale(histogram()), 276, ctx());
    const median = axis.at(42 * S);
    const p95 = axis.at(18 * MIN);
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
