import { describe, expect, it } from "vitest";

import { durationEdges } from "../scale/ladder.js";

import { ruleAt, xScale, yScale, type Continuous } from "./scales.js";
import type { BarMark, ChartSpec, Mark } from "./spec.js";

const S = 1_000;
const DAY = 86_400_000;

const rect = (x1: number[], x2: number[], ...ys: (number | null)[][]): Mark => ({
  mark: "rect",
  x1,
  x2,
  series: ys.map((y, i) => ({ name: `s${String(i)}`, y })),
});

// A histogram of read delays: the ladder's bins at the default retention, two rules.
const edges = durationEdges();
const bins = rect(
  edges.slice(0, -1),
  edges.slice(1),
  edges.slice(1).map((_, i) => i + 1),
);
const readDelays = (domain?: readonly [number, number], ...rules: number[]): ChartSpec => ({
  x: { type: "log", format: "duration", ...(domain === undefined ? {} : { domain }) },
  marks: [bins, ...rules.map((x) => ({ mark: "rule" as const, x, label: "Median" }))],
});

const continuous = (scale: ReturnType<typeof yScale>): Continuous => {
  if (scale.type === "band") {
    throw new Error("expected a continuous scale");
  }
  return scale;
};

describe("xScale", () => {
  it("is linear unless the spec names a type", () => {
    expect(xScale({ x: {}, marks: [] }).type).toBe("linear");
    expect(xScale({ x: { type: "time" }, marks: [] }).type).toBe("time");
  });

  it("spans every x, x1 and x2 and every rule on a linear or time scale", () => {
    const marks: Mark[] = [
      rect([10, 20], [20, 30], [1, 2]),
      { mark: "line", x: [5, 25], series: [{ name: "a", y: [1, 2] }] },
      { mark: "rule", x: 40, label: "Goal" },
    ];
    expect(xScale({ x: {}, marks })).toMatchObject({ lo: 5, hi: 40, passed: false });
    expect(xScale({ x: { type: "time" }, marks })).toMatchObject({ lo: 5, hi: 40 });
    const dots: Mark = {
      mark: "dot",
      rows: [
        { name: "a", x: [3, 50] },
        { name: "b", x: [] },
      ],
    };
    expect(xScale({ x: { type: "time" }, marks: [dots] })).toMatchObject({ lo: 3, hi: 50 });
  });

  it("spans only the positive edges on a log scale, never its rules", () => {
    const scale = xScale(readDelays(undefined, 400, 4 * DAY));
    expect(scale).toMatchObject({ lo: S, hi: 3 * DAY, passed: false });
  });

  it("keeps a passed domain whatever the data holds", () => {
    const marks = [rect([10], [20], [1]), { mark: "rule" as const, x: 90, label: "Far" }];
    expect(xScale({ x: { domain: [0, 50] }, marks })).toMatchObject({
      lo: 0,
      hi: 50,
      passed: true,
    });
  });

  it("knows when every x is an integer", () => {
    expect(xScale({ x: {}, marks: [rect([1, 2], [2, 3], [1, 1])] }).integer).toBe(true);
    expect(xScale({ x: {}, marks: [rect([1, 2.5], [2.5, 3], [1, 1])] }).integer).toBe(false);
  });

  it("widens a linear extent of one value, and spans 0 to 1 with no value", () => {
    const one = { mark: "line" as const, x: [5], series: [{ name: "a", y: [1] }] };
    expect(xScale({ x: {}, marks: [one] })).toMatchObject({ lo: 4, hi: 6 });
    expect(xScale({ x: {}, marks: [] })).toMatchObject({ lo: 0, hi: 1 });
  });
});

describe("the underflow bin", () => {
  it("draws the read histogram's first bin below the 1 sec low end, as wide as its neighbour", () => {
    const scale = xScale(readDelays([S, 3 * DAY]));
    expect(scale.under).toMatchObject({
      mark: 0,
      index: 0,
      x1: 0,
      drawn: "below",
      from: 500,
    });
    expect(scale.drawnLo).toBe(500);
  });

  it("draws the same with no domain", () => {
    expect(xScale(readDelays()).drawnLo).toBe(500);
  });

  it("takes a factor of 2 with no neighbour, and its neighbour's factor when it has one", () => {
    const alone: ChartSpec = {
      x: { type: "log", domain: [S, 4 * S] },
      marks: [rect([0], [S], [3])],
    };
    expect(xScale(alone).under?.from).toBe(500);
    const wide: ChartSpec = { x: { type: "log" }, marks: [rect([0, S], [S, 3 * S], [3, 4])] };
    expect(xScale(wide).under?.from).toBeCloseTo(S / 3, 9);
  });

  it("leaves the bin out under a 10 sec low end, drawing from 10 sec", () => {
    const scale = xScale(readDelays([10 * S, 3 * DAY]));
    expect(scale.under?.drawn).toBe("out");
    expect(scale.drawnLo).toBe(10 * S);
  });

  it("leaves the bin out under a 1.5 sec low end, from which the 1 to 2 sec bin is cut", () => {
    const scale = xScale(readDelays([1_500, 3 * DAY]));
    expect(scale.under?.drawn).toBe("out");
    expect(scale.drawnLo).toBe(1_500);
  });

  it("cuts a bin whose x2 lies above the low end", () => {
    const spec: ChartSpec = {
      x: { type: "log", domain: [S, 10 * S] },
      marks: [rect([0, 2 * S], [2 * S, 5 * S], [1, 1])],
    };
    expect(xScale(spec).under).toMatchObject({ drawn: "cut", from: S });
  });

  it("throws a RangeError for a second rect whose x1 is 0 or below", () => {
    const one: ChartSpec = {
      x: { type: "log" },
      marks: [rect([-5, 0, S], [0, S, 2 * S], [1, 1, 1])],
    };
    expect(() => xScale(one)).toThrow(RangeError);
  });

  it("never treats a rect above 0 as an underflow bin", () => {
    const spec: ChartSpec = {
      x: { type: "log", domain: [10 * S, 20 * S] },
      marks: [rect([S], [2 * S], [1])],
    };
    expect(xScale(spec).under).toBeUndefined();
  });
});

describe("ruleAt", () => {
  it("puts the read histogram's 1 sec median on the tick and a 999 ms one at the bin's middle", () => {
    const scale = xScale(readDelays([S, 3 * DAY]));
    expect(ruleAt(scale, S)).toEqual({ at: S });
    expect(ruleAt(scale, 999)).toEqual({ at: Math.sqrt(500 * 1_000) });
  });

  it("puts a 400 ms median at the bin's middle with no domain", () => {
    const scale = xScale(readDelays(undefined, 400));
    expect(scale.drawnLo).toBe(500);
    expect(ruleAt(scale, 400)).toEqual({ at: Math.sqrt(500 * 1_000) });
  });

  it("puts a rule outside the domain off the axis at its nearer end", () => {
    const scale = xScale(readDelays([S, 3 * DAY]));
    expect(ruleAt(scale, 4 * DAY)).toEqual({ off: "high" });
    expect(ruleAt(scale, -1)).toEqual({ off: "low" });
    const cut = xScale(readDelays([10 * S, 3 * DAY]));
    expect(ruleAt(cut, 400)).toEqual({ off: "low" });
    expect(ruleAt(xScale({ x: { domain: [0, 10] }, marks: [] }), 12)).toEqual({ off: "high" });
  });
});

describe("yScale", () => {
  it("is a band of the dot rows, in the app's order", () => {
    const dots: Mark = {
      mark: "dot",
      rows: [
        { name: "b", x: [] },
        { name: "a", x: [1] },
      ],
    };
    expect(yScale({ x: { type: "time" }, y: { mono: true }, marks: [dots] })).toEqual({
      type: "band",
      rows: ["b", "a"],
      mono: true,
    });
  });

  it("spans every stack's total from zero, a null counting as 0", () => {
    const y = continuous(yScale({ x: {}, marks: [rect([0, 1], [1, 2], [1, 2], [3, null])] }));
    expect(y).toMatchObject({ type: "linear", lo: 0, hi: 4, integer: true });
  });

  describe("a 100% stack", () => {
    const shared = (x1: number[], x2: number[], ...ys: number[][]): Mark => ({
      ...(rect(x1, x2, ...ys) as Extract<Mark, { mark: "rect" }>),
      arrange: "share",
    });
    const share = shared([0, 1], [1, 2], [1, 7], [3, 2]);

    it("spans 0 to 1 as a passed domain, in percent unless y says another format", () => {
      expect(continuous(yScale({ x: {}, marks: [share] }))).toMatchObject({
        lo: 0,
        hi: 1,
        passed: true,
        integer: false,
        format: "percent",
      });
      expect(continuous(yScale({ x: {}, y: { format: "number" }, marks: [share] })).format).toBe(
        "number",
      );
    });

    it("leaves a rule above 1 off the axis, where a stack would stretch to hold it", () => {
      const y = continuous(yScale({ x: {}, marks: [share, { mark: "rule", y: 2, label: "Cap" }] }));
      expect(ruleAt(y, 2)).toEqual({ off: "high" });
      expect(ruleAt(y, 0.5)).toEqual({ at: 0.5 });
    });

    it("refuses a domain and still refuses a negative value", () => {
      expect(() => yScale({ x: {}, y: { domain: [0, 1] }, marks: [share] })).toThrow(
        "renderChart: a 100% stack's y runs 0 to 1, so it takes no domain",
      );
      expect(() => yScale({ x: {}, marks: [shared([0], [1], [1], [-1])] })).toThrow(RangeError);
    });
  });

  it("spans a group's largest single value from zero, not its totals", () => {
    const grouped: Mark = {
      mark: "rect",
      arrange: "group",
      x1: [0, 1],
      x2: [1, 2],
      series: [
        { name: "a", y: [1, 7] },
        { name: "b", y: [3, 2] },
      ],
    };
    expect(continuous(yScale({ x: {}, marks: [grouped] }))).toMatchObject({ lo: 0, hi: 7 });
  });

  it("spans an area's stack totals from zero, leaving out a sample with a gap", () => {
    const stacked: Mark = {
      mark: "area",
      x: [0, 1, 2],
      series: [
        { name: "a", y: [1, 9, 2] },
        { name: "b", y: [3, null, 2] },
      ],
    };
    expect(continuous(yScale({ x: {}, marks: [stacked] }))).toMatchObject({ lo: 0, hi: 4 });
    expect(xScale({ x: {}, marks: [stacked] })).toMatchObject({ lo: 0, hi: 2 });
  });

  it("spans line values and rules, from zero unless zero is false", () => {
    const marks: Mark[] = [
      { mark: "line", x: [0, 1, 2], series: [{ name: "a", y: [5, Number.NaN, 9.5] }] },
      { mark: "rule", y: 12, label: "Cap" },
    ];
    expect(yScale({ x: {}, marks })).toMatchObject({ lo: 0, hi: 12, integer: false });
    expect(yScale({ x: {}, y: { zero: false }, marks })).toMatchObject({ lo: 5, hi: 12 });
  });

  it("spans 0 to 1 when every value is 0", () => {
    expect(yScale({ x: {}, marks: [rect([0], [1], [0])] })).toMatchObject({ lo: 0, hi: 1 });
  });

  it("spans only positive values on a log y", () => {
    const marks: Mark[] = [
      { mark: "line", x: [0, 1, 2], series: [{ name: "a", y: [0, 10, 1_000] }] },
    ];
    expect(yScale({ x: {}, y: { type: "log" }, marks })).toMatchObject({ lo: 10, hi: 1_000 });
  });
});

describe("scale errors", () => {
  const line: Mark = { mark: "line", x: [0, 1], series: [{ name: "a", y: [1, 2] }] };

  it.each<[string, ChartSpec, ErrorConstructor]>([
    ["a band x", { x: { type: "band" }, marks: [] }, TypeError],
    ["a log x domain at 0", { x: { type: "log", domain: [0, 10] }, marks: [] }, RangeError],
    [
      "a log x with no positive value",
      { x: { type: "log" }, marks: [rect([-2], [0], [1])] },
      RangeError,
    ],
    ["a domain low above high", { x: { domain: [5, 1] }, marks: [] }, RangeError],
    [
      "a domain that is not finite",
      { x: { domain: [0, Number.POSITIVE_INFINITY] }, marks: [] },
      RangeError,
    ],
  ])("x: %s throws its type", (_, spec, type) => {
    expect(() => xScale(spec)).toThrow(type);
  });

  it.each<[string, ChartSpec, ErrorConstructor]>([
    [
      "a linear y under dots",
      { x: {}, y: { type: "linear" }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "a domain on a band",
      { x: {}, y: { domain: [0, 1] }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "zero false under a rect",
      { x: {}, y: { zero: false }, marks: [rect([0], [1], [1])] },
      TypeError,
    ],
    [
      "a log y under a rect",
      { x: {}, y: { type: "log" }, marks: [rect([0], [1], [1])] },
      TypeError,
    ],
    [
      "a rect's y domain that leaves out 0",
      { x: {}, y: { domain: [1, 10] }, marks: [rect([0], [1], [1])] },
      RangeError,
    ],
    ["a negative y under a rect", { x: {}, marks: [rect([0], [1], [-1])] }, RangeError],
    [
      "an infinite rect y",
      { x: {}, marks: [rect([0], [1], [Number.POSITIVE_INFINITY])] },
      RangeError,
    ],
    [
      "an infinite line y",
      {
        x: {},
        marks: [{ mark: "line", x: [0], series: [{ name: "a", y: [Number.NEGATIVE_INFINITY] }] }],
      },
      RangeError,
    ],
    ["a band y without dots", { x: {}, y: { type: "band" }, marks: [line] }, TypeError],
  ])("y: %s throws its type", (_, spec, type) => {
    expect(() => yScale(spec)).toThrow(type);
  });
});

describe("a bar chart's scales", () => {
  const bars = (...series: (number | null)[][]): ChartSpec => ({
    x: {},
    marks: [
      {
        mark: "bar",
        y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
        series: series.map((x, k) => ({ name: `s${String(k)}`, x })),
      },
    ],
  });

  it("takes x from 0 to the largest stack, its negatives leftward", () => {
    const x = xScale(bars([3, 1], [4, null]));
    expect([x.lo, x.hi, x.integer]).toEqual([0, 7, true]);
    const signed = xScale(bars([3, -2], [-1, -4]));
    expect([signed.lo, signed.hi]).toEqual([-6, 3]);
  });

  it("takes a group's x from its lowest to its highest single value", () => {
    const spec = bars([3, -2], [4, -5]);
    const grouped = {
      ...spec,
      marks: [{ ...(spec.marks[0] as BarMark), arrange: "group" as const }],
    };
    const x = xScale(grouped);
    expect([x.lo, x.hi]).toEqual([-5, 4]);
  });

  it("holds 0 and its rules when every value is above 0", () => {
    const spec = bars([40, 50]);
    const x = xScale({ ...spec, marks: [...spec.marks, { mark: "rule", x: 60, label: "Target" }] });
    expect([x.lo, x.hi]).toEqual([0, 60]);
  });

  describe("a 100% stack", () => {
    const share = (spec: ChartSpec): ChartSpec => ({
      ...spec,
      marks: [{ ...(spec.marks[0] as BarMark), arrange: "share" as const }, ...spec.marks.slice(1)],
    });

    it("spans 0 to 1 as a passed domain, in percent unless x says another format", () => {
      expect(xScale(share(bars([3, 1], [1, 4])))).toMatchObject({
        lo: 0,
        hi: 1,
        passed: true,
        integer: false,
        format: "percent",
        reverse: false,
      });
      const own = { ...share(bars([3], [1])), x: { format: "number" as const, reverse: true } };
      expect(xScale(own)).toMatchObject({ format: "number", reverse: true });
    });

    it("leaves a rule above 1 off the axis, where a stack would stretch to hold it", () => {
      const spec = share(bars([3], [1]));
      const x = xScale({ ...spec, marks: [...spec.marks, { mark: "rule", x: 2, label: "Cap" }] });
      expect([x.lo, x.hi]).toEqual([0, 1]);
      expect(ruleAt(x, 2)).toEqual({ off: "high" });
    });

    it("refuses a domain and a negative value", () => {
      expect(() => xScale({ ...share(bars([3], [1])), x: { domain: [0, 1] } })).toThrow(
        "renderChart: a 100% stack's x runs 0 to 1, so it takes no domain",
      );
      expect(() => xScale(share(bars([3], [-1])))).toThrow(
        "renderChart: a 100% stack's x cannot be negative",
      );
    });

    it("runs a split's x from 0 to its largest single value, and refuses a negative one", () => {
      const split = (spec: ChartSpec): ChartSpec => ({
        ...spec,
        marks: spec.marks.map((m) => (m.mark === "bar" ? { ...m, arrange: "split" } : m)),
      });
      expect(xScale(split(bars([30, 5], [20, 40])))).toMatchObject({ lo: 0, hi: 40 });
      expect(() => xScale(split(bars([3], [-1])))).toThrow(
        "renderChart: a split bar's x cannot be negative",
      );
    });

    it("runs a mirror's x from 0 to the larger side's largest value", () => {
      const spec = bars([30, 5], [20, 44]);
      const mirror: ChartSpec = {
        ...spec,
        marks: spec.marks.map((m) => (m.mark === "bar" ? { ...m, arrange: "mirror" } : m)),
      };
      expect(xScale(mirror)).toMatchObject({ lo: 0, hi: 44, absolute: false });
    });
  });

  describe("a diverging stack", () => {
    const diverge = (spec: ChartSpec, left: number, centre?: boolean): ChartSpec => ({
      ...spec,
      marks: spec.marks.map((m) =>
        m.mark === "bar"
          ? { ...m, arrange: "diverge", left, ...(centre === undefined ? {} : { centre }) }
          : m,
      ),
    });

    it("reaches from the widest left extent to the widest right one, a centre series half each side", () => {
      const likert = diverge(bars([10, 5], [15, 5], [20, 0], [30, 40], [25, 50]), 2, true);
      // Row 1: 10 + 15 + 20 / 2 left and 20 / 2 + 30 + 25 right; row 2: 10 left, 90 right.
      const x = xScale(likert);
      expect([x.lo, x.hi]).toEqual([-35, 90]);
      expect(x.absolute).toBe(true);
      const plain = xScale(diverge(bars([10, 40], [30, 5], [null, 20]), 1));
      expect([plain.lo, plain.hi]).toEqual([-40, 30]);
    });

    it("holds a rule on both sides and refuses a negative value, whose side comes from its order", () => {
      const spec = diverge(bars([10], [30]), 1);
      const x = xScale({ ...spec, marks: [...spec.marks, { mark: "rule", x: 50, label: "Goal" }] });
      // The rule draws at 50 either side of 0, so each side's extent reaches it.
      expect([x.lo, x.hi]).toEqual([-50, 50]);
      const near = xScale({
        ...spec,
        marks: [...spec.marks, { mark: "rule", x: 5, label: "Aim" }],
      });
      expect([near.lo, near.hi]).toEqual([-10, 30]);
      expect(() => xScale(diverge(bars([10], [-3]), 1))).toThrow(
        "renderChart: a diverging bar's x cannot be negative",
      );
    });

    it("writes signed ticks on every other bar chart", () => {
      expect(xScale(bars([3, -2], [1, 4])).absolute).toBe(false);
    });
  });

  it("names the band y's rows in the app's order", () => {
    expect(yScale(bars([1, 2, 3]))).toEqual({
      type: "band",
      rows: ["c0", "c1", "c2"],
      mono: false,
    });
  });
});

describe("a point chart's scales", () => {
  const points = (x: ChartSpec["x"], ...series: (number | null)[][]): ChartSpec => ({
    x,
    marks: [
      {
        mark: "point",
        y: (series[0] ?? []).map((_, i) => `c${String(i)}`),
        series: series.map((v, k) => ({ name: `s${String(k)}`, x: v })),
      },
    ],
  });

  it("takes x over the values without 0, since no length encodes them", () => {
    const x = xScale(points({}, [38.5, 57.4], [40, null]));
    expect([x.lo, x.hi, x.integer, x.passed]).toEqual([38.5, 57.4, false, false]);
  });

  it("holds 0 with zero true, and a passed domain as it is", () => {
    const zero = xScale(points({ zero: true }, [38.5, 57.4]));
    expect([zero.lo, zero.hi]).toEqual([0, 57.4]);
    const passed = xScale(points({ domain: [40, 50] }, [38.5, 57.4]));
    expect([passed.lo, passed.hi, passed.passed]).toEqual([40, 50, true]);
    const off = xScale(points({ zero: false }, [38.5, 57.4]));
    expect(off.lo).toBe(38.5);
  });

  it("widens one value and takes its rules", () => {
    const one = xScale(points({}, [5]));
    expect([one.lo, one.hi]).toEqual([4, 6]);
    const spec = points({}, [40, 50]);
    const ruled = xScale({
      ...spec,
      marks: [...spec.marks, { mark: "rule", x: 60, label: "Aim" }],
    });
    expect([ruled.lo, ruled.hi]).toEqual([40, 60]);
  });

  it("takes a log x above 0 and a time x over its instants", () => {
    const log = xScale(points({ type: "log" }, [0.0024, 93], [null, 5]));
    expect([log.type, log.lo, log.hi]).toEqual(["log", 0.0024, 93]);
    const time = xScale(points({ type: "time" }, [5 * DAY, DAY], [3 * DAY, null]));
    expect([time.type, time.lo, time.hi]).toEqual(["time", DAY, 5 * DAY]);
  });

  it("takes a band y of its categories", () => {
    expect(yScale(points({}, [1, 2]))).toEqual({ type: "band", rows: ["c0", "c1"], mono: false });
    expect(() => yScale({ ...points({}, [1]), y: { type: "linear" } })).toThrow(
      "renderChart: a point mark's y is a band of its rows",
    );
  });

  it("refuses an infinite value, 0 or below on a log x, and zero off a linear x", () => {
    expect(() => xScale(points({}, [Number.POSITIVE_INFINITY]))).toThrow(
      "renderChart: a point's x cannot be infinite",
    );
    expect(() => xScale(points({ type: "log" }, [0]))).toThrow(
      "renderChart: a point's x must be above 0 on a log x",
    );
    expect(() => xScale(points({ type: "time", zero: true }, [DAY]))).toThrow(
      "renderChart: a time x has no zero to hold",
    );
  });
});
