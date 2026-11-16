import { describe, expect, it } from "vitest";

import type { BinsFrame, FrameGridAxis, FrameRef } from "../frame/frame.js";

import { check } from "./check.js";
import {
  rScale as rScaleOf,
  ruleAt,
  xScale as xScaleOf,
  yScale as yScaleOf,
  type Continuous,
} from "./scales.js";
import type { ChartSpec } from "./spec.js";
import {
  binsFrame,
  categories,
  events,
  grid as gridFrame,
  ladder,
  points as pointsFrame,
  seriesFrame,
} from "./test-helpers/frames.js";

const S = 1_000;
const DAY = 86_400_000;
// A duration's seconds.
const D = { s: 1, day: 86_400 } as const;

type Values = readonly (number | null)[];
type Scale = NonNullable<ChartSpec["x"]>;

// A spec's scales, as the chart builds them from its checked plot.
const xScale = (spec: ChartSpec): Continuous => xScaleOf(check(spec));
const yScale = (spec: ChartSpec) => yScaleOf(check(spec));
const rScale = (spec: ChartSpec) => rScaleOf(check(spec));

// Refs keyed r0, r1, ... at `values`, each with a `refs` entry on `axis`.
const ruled = (spec: ChartSpec, axis: "x" | "y" | undefined, ...values: number[]): ChartSpec => {
  const refs: FrameRef[] = values.map((value, i) => ({ key: `r${String(i)}`, value }));
  return {
    ...spec,
    data: { ...spec.data, refs } as NonNullable<ChartSpec["data"]>,
    refs: refs.map((r) => ({ key: r.key, ...(axis === undefined ? {} : { axis }) })),
  } as ChartSpec;
};

// Bins from x1 to x2 on a value x, a series per values list.
const rect = (
  x1: readonly number[],
  x2: readonly number[],
  values: readonly Values[],
  more: Omit<ChartSpec, "data" | "mark" | "facets"> = {},
  data: Partial<BinsFrame> = {},
  mark: object = {},
): ChartSpec =>
  ({
    data: binsFrame(x1, x2, values, { axis: "value", ...data }),
    mark: { mark: "rect", ...mark },
    ...more,
  }) as ChartSpec;

// A line of series per values list over `x`.
const line = (x: readonly number[], values: readonly Values[], more = {}): ChartSpec =>
  ({ data: seriesFrame(x, values), mark: { mark: "line" }, ...more }) as ChartSpec;

// A line with no data, its x the scale `x` alone.
const bare = (x: Scale): ChartSpec => line([], [], { x });

// A histogram of read delays in seconds: the ladder's bins at the default
// retention, and refs at `rules`.
const edges = ladder();
const readDelays = (domain?: readonly [number, number], ...rules: number[]): ChartSpec =>
  ruled(
    rect(
      edges.slice(0, -1),
      edges.slice(1),
      [edges.slice(1).map((_, i) => i + 1)],
      { x: { type: "log", ...(domain === undefined ? {} : { domain }) } },
      { unit: "seconds" },
    ),
    undefined,
    ...rules,
  );

const continuous = (scale: ReturnType<typeof yScale>): Continuous => {
  if (scale.type === "band") {
    throw new Error("expected a continuous scale");
  }
  return scale;
};

describe("xScale", () => {
  it("is linear unless the spec names a type", () => {
    expect(xScale(bare({})).type).toBe("linear");
    expect(xScale(bare({ type: "time" })).type).toBe("time");
  });

  it("spans every x, x1 and x2 and every x rule on a linear or time scale", () => {
    const bins = ruled(rect([10, 20], [20, 30], [[1, 2]]), "x", 40);
    expect(xScale(bins)).toMatchObject({ lo: 10, hi: 40, passed: false });
    const timeBins = ruled(rect([10, 20], [20, 30], [[1, 2]], {}, { axis: "time" }), "x", 40);
    expect(xScale(timeBins)).toMatchObject({ type: "time", lo: 10, hi: 40 });
    const sampled = ruled(line([5, 25], [[1, 2]]), "x", 40);
    expect(xScale(sampled)).toMatchObject({ lo: 5, hi: 40, passed: false });
    expect(xScale({ ...sampled, x: { type: "time" } })).toMatchObject({ lo: 5, hi: 40 });
    const dots: ChartSpec = { data: events({ a: [3, 50], b: [] }), mark: { mark: "dot" } };
    expect(xScale(dots)).toMatchObject({ type: "time", lo: 3, hi: 50 });
  });

  it("spans only the positive edges on a log scale, never its rules", () => {
    const scale = xScale(readDelays(undefined, 0.4, 4 * D.day));
    expect(scale).toMatchObject({ lo: D.s, hi: 3 * D.day, passed: false });
  });

  it("keeps a passed domain whatever the data holds", () => {
    const spec = ruled(rect([10], [20], [[1]], { x: { domain: [0, 50] } }), "x", 90);
    expect(xScale(spec)).toMatchObject({ lo: 0, hi: 50, passed: true });
  });

  it("knows when every x is an integer", () => {
    expect(xScale(rect([1, 2], [2, 3], [[1, 1]])).integer).toBe(true);
    expect(xScale(rect([1, 2.5], [2.5, 3], [[1, 1]])).integer).toBe(false);
  });

  it("widens a linear extent of one value, and spans 0 to 1 with no value", () => {
    expect(xScale(line([5], [[1]]))).toMatchObject({ lo: 4, hi: 6 });
    expect(xScale(bare({}))).toMatchObject({ lo: 0, hi: 1 });
  });
});

describe("the underflow bin", () => {
  it("draws the read histogram's first bin below the 1 sec low end, as wide as its neighbour", () => {
    const scale = xScale(readDelays([D.s, 3 * D.day]));
    expect(scale.under).toMatchObject({
      mark: 0,
      index: 0,
      x1: 0,
      drawn: "below",
      from: 0.5,
    });
    expect(scale.drawnLo).toBe(0.5);
  });

  it("draws the same with no domain", () => {
    expect(xScale(readDelays()).drawnLo).toBe(0.5);
  });

  it("takes a factor of 2 with no neighbour, and its neighbour's factor when it has one", () => {
    const alone = rect([0], [S], [[3]], { x: { type: "log", domain: [S, 4 * S] } });
    expect(xScale(alone).under?.from).toBe(500);
    const wide = rect([0, S], [S, 3 * S], [[3, 4]], { x: { type: "log" } });
    expect(xScale(wide).under?.from).toBeCloseTo(S / 3, 9);
  });

  it("leaves the bin out under a 10 sec low end, drawing from 10 sec", () => {
    const scale = xScale(readDelays([10 * D.s, 3 * D.day]));
    expect(scale.under?.drawn).toBe("out");
    expect(scale.drawnLo).toBe(10 * D.s);
  });

  it("leaves the bin out under a 1.5 sec low end, from which the 1 to 2 sec bin is cut", () => {
    const scale = xScale(readDelays([1.5, 3 * D.day]));
    expect(scale.under?.drawn).toBe("out");
    expect(scale.drawnLo).toBe(1.5);
  });

  it("cuts a bin whose x2 lies above the low end", () => {
    const spec = rect([0, 2 * S], [2 * S, 5 * S], [[1, 1]], {
      x: { type: "log", domain: [S, 10 * S] },
    });
    expect(xScale(spec).under).toMatchObject({ drawn: "cut", from: S });
  });

  it("throws a RangeError for a second bin whose x1 is 0 or below", () => {
    const one = rect([-5, 0, S], [0, S, 2 * S], [[1, 1, 1]], { x: { type: "log" } });
    expect(() => xScale(one)).toThrow(RangeError);
  });

  it("never treats a bin above 0 as an underflow bin", () => {
    const spec = rect([S], [2 * S], [[1]], { x: { type: "log", domain: [10 * S, 20 * S] } });
    expect(xScale(spec).under).toBeUndefined();
  });
});

describe("ruleAt", () => {
  it("puts the read histogram's 1 sec median on the tick and a 999 ms one at the bin's middle", () => {
    const scale = xScale(readDelays([D.s, 3 * D.day]));
    expect(ruleAt(scale, D.s)).toEqual({ at: D.s });
    expect(ruleAt(scale, 0.999)).toEqual({ at: Math.sqrt(0.5 * 1) });
  });

  it("puts a 400 ms median at the bin's middle with no domain", () => {
    const scale = xScale(readDelays(undefined, 0.4));
    expect(scale.drawnLo).toBe(0.5);
    expect(ruleAt(scale, 0.4)).toEqual({ at: Math.sqrt(0.5 * 1) });
  });

  it("puts a rule outside the domain off the axis at its nearer end", () => {
    const scale = xScale(readDelays([D.s, 3 * D.day]));
    expect(ruleAt(scale, 4 * D.day)).toEqual({ off: "high" });
    expect(ruleAt(scale, -1)).toEqual({ off: "low" });
    const cut = xScale(readDelays([10 * D.s, 3 * D.day]));
    expect(ruleAt(cut, 0.4)).toEqual({ off: "low" });
    expect(ruleAt(xScale(bare({ domain: [0, 10] })), 12)).toEqual({ off: "high" });
  });
});

describe("yScale", () => {
  it("is a band of the dot rows, in the frame's order", () => {
    const dots: ChartSpec = {
      data: events({ b: [], a: [1] }),
      mark: { mark: "dot" },
      y: { mono: true },
    };
    expect(yScale(dots)).toEqual({ type: "band", rows: ["b", "a"], mono: true });
  });

  it("spans every stack's total from zero, a null counting as 0", () => {
    const y = continuous(
      yScale(
        rect(
          [0, 1],
          [1, 2],
          [
            [1, 2],
            [3, null],
          ],
        ),
      ),
    );
    expect(y).toMatchObject({ type: "linear", lo: 0, hi: 4, integer: true });
  });

  describe("a 100% stack", () => {
    const shared = (
      values: readonly Values[],
      more: Omit<ChartSpec, "data" | "mark" | "facets"> = {},
    ) => rect([0, 1], [1, 2], values, more, {}, { arrange: "share" });
    const share = shared([
      [1, 7],
      [3, 2],
    ]);

    it("spans 0 to 1 as a passed domain, in percent unless y says another format", () => {
      expect(continuous(yScale(share))).toMatchObject({
        lo: 0,
        hi: 1,
        passed: true,
        integer: false,
        format: "percent",
      });
      expect(continuous(yScale({ ...share, y: { format: "number" } })).format).toBe("number");
    });

    it("refuses a domain and still refuses a negative value", () => {
      expect(() => yScale({ ...share, y: { domain: [0, 1] } })).toThrow(
        "renderChart: a 100% stack's y runs 0 to 1, so it takes no domain",
      );
      expect(() =>
        yScale(
          shared([
            [1, 1],
            [-1, 1],
          ]),
        ),
      ).toThrow(RangeError);
    });
  });

  it("spans a group's largest single value from zero, not its totals", () => {
    const grouped = rect(
      [0, 1],
      [1, 2],
      [
        [1, 7],
        [3, 2],
      ],
      {},
      {},
      { arrange: "group" },
    );
    expect(continuous(yScale(grouped))).toMatchObject({ lo: 0, hi: 7 });
  });

  it("spans an area's stack totals from zero, leaving out a sample with a gap", () => {
    const stacked: ChartSpec = {
      data: seriesFrame(
        [0, 1, 2],
        [
          [1, 9, 2],
          [3, null, 2],
        ],
      ),
      mark: { mark: "area" },
    };
    expect(continuous(yScale(stacked))).toMatchObject({ lo: 0, hi: 4 });
    expect(xScale(stacked)).toMatchObject({ lo: 0, hi: 2 });
  });

  it("spans line values and rules, from zero unless zero is false", () => {
    const spec = ruled(line([0, 1, 2], [[5, Number.NaN, 9.5]]), undefined, 12);
    expect(yScale(spec)).toMatchObject({ lo: 0, hi: 12, integer: false });
    expect(yScale({ ...spec, y: { zero: false } })).toMatchObject({ lo: 5, hi: 12 });
  });

  it("spans 0 to 1 when every value is 0", () => {
    expect(yScale(rect([0], [1], [[0]]))).toMatchObject({ lo: 0, hi: 1 });
  });

  it("spans only positive values on a log y", () => {
    const spec = line([0, 1, 2], [[0, 10, 1_000]], { y: { type: "log" } });
    expect(yScale(spec)).toMatchObject({ lo: 10, hi: 1_000 });
  });
});

describe("scale errors", () => {
  const plain = line([0, 1], [[1, 2]]);
  const dots: ChartSpec = { data: events({}), mark: { mark: "dot" } };

  it.each<[string, ChartSpec, ErrorConstructor]>([
    ["a band x", bare({ type: "band" }), TypeError],
    ["a log x domain at 0", bare({ type: "log", domain: [0, 10] }), RangeError],
    ["a log x with no positive value", rect([-2], [0], [[1]], { x: { type: "log" } }), RangeError],
    ["a domain low above high", bare({ domain: [5, 1] }), RangeError],
    ["a domain that is not finite", bare({ domain: [0, Number.POSITIVE_INFINITY] }), RangeError],
  ])("x: %s throws its type", (_, spec, type) => {
    expect(() => xScale(spec)).toThrow(type);
  });

  it.each<[string, ChartSpec, ErrorConstructor]>([
    ["a linear y under dots", { ...dots, y: { type: "linear" } }, TypeError],
    ["a domain on a band", { ...dots, y: { domain: [0, 1] } }, TypeError],
    ["zero false under a rect", rect([0], [1], [[1]], { y: { zero: false } }), TypeError],
    ["a log y under a rect", rect([0], [1], [[1]], { y: { type: "log" } }), TypeError],
    [
      "a rect's y domain that leaves out 0",
      rect([0], [1], [[1]], { y: { domain: [1, 10] } }),
      RangeError,
    ],
    ["a negative y under a rect", rect([0], [1], [[-1]]), RangeError],
    ["an infinite rect y", rect([0], [1], [[Number.POSITIVE_INFINITY]]), RangeError],
    ["an infinite line y", line([0], [[Number.NEGATIVE_INFINITY]]), RangeError],
    ["a band y without dots", { ...plain, y: { type: "band" } }, TypeError],
  ])("y: %s throws its type", (_, spec, type) => {
    expect(() => yScale(spec)).toThrow(type);
  });

  it.each<[readonly [number, number]]>([[[1e16 + 2, 1e16 + 6]], [[1e16, 1e16 + 2]], [[0, 5e-324]]])(
    "refuses a passed linear domain %j narrower than its resolution, which holds no tick",
    (domain) => {
      expect(() => xScale({ ...plain, x: { domain } })).toThrow(
        new RangeError("renderChart: x.domain is too narrow for its ticks to tell its ends apart"),
      );
      expect(() => yScale({ ...plain, y: { domain } })).toThrow(
        new RangeError("renderChart: y.domain is too narrow for its ticks to tell its ends apart"),
      );
    },
  );

  it("takes a passed linear domain as wide as its resolution, and any time domain", () => {
    expect(xScale({ ...plain, x: { domain: [1e16, 1e16 + 1e5] } }).hi).toBe(1e16 + 1e5);
    expect(xScale(bare({ type: "time", domain: [1e12, 1e12 + 1] })).hi).toBe(1e12 + 1);
  });
});

describe("a bar chart's scales", () => {
  // A series per values list keyed a, b, ... over rows c0, c1, ....
  const bars = (mark: object, ...series: Values[]): ChartSpec =>
    ({
      data: categories(
        (series[0] ?? []).map((_, i) => `c${String(i)}`),
        series,
      ),
      mark: { mark: "bar", ...mark },
    }) as ChartSpec;

  it("takes x from 0 to the largest stack, its negatives leftward", () => {
    const x = xScale(bars({}, [3, 1], [4, null]));
    expect([x.lo, x.hi, x.integer]).toEqual([0, 7, true]);
    const signed = xScale(bars({}, [3, -2], [-1, -4]));
    expect([signed.lo, signed.hi]).toEqual([-6, 3]);
  });

  it("takes a group's x from its lowest to its highest single value", () => {
    const x = xScale(bars({ arrange: "group" }, [3, -2], [4, -5]));
    expect([x.lo, x.hi]).toEqual([-5, 4]);
  });

  it("holds 0 and its rules when every value is above 0", () => {
    const x = xScale(ruled(bars({}, [40, 50]), undefined, 60));
    expect([x.lo, x.hi]).toEqual([0, 60]);
  });

  describe("a 100% stack", () => {
    const share = { arrange: "share" };

    it("spans 0 to 1 as a passed domain, in percent unless x says another format", () => {
      expect(xScale(bars(share, [3, 1], [1, 4]))).toMatchObject({
        lo: 0,
        hi: 1,
        passed: true,
        integer: false,
        format: "percent",
        reverse: false,
      });
      const own = { ...bars(share, [3], [1]), x: { format: "number" as const, reverse: true } };
      expect(xScale(own)).toMatchObject({ format: "number", reverse: true });
    });

    it("refuses a domain and a negative value", () => {
      expect(() => xScale({ ...bars(share, [3], [1]), x: { domain: [0, 1] } })).toThrow(
        "renderChart: a 100% stack's x runs 0 to 1, so it takes no domain",
      );
      expect(() => xScale(bars(share, [3], [-1]))).toThrow(
        "renderChart: a 100% stack's x cannot be negative",
      );
    });

    it("runs a split's x from 0 to its largest single value, and refuses a negative one", () => {
      const split = { arrange: "split" };
      expect(xScale(bars(split, [30, 5], [20, 40]))).toMatchObject({ lo: 0, hi: 40 });
      expect(() => xScale(bars(split, [3], [-1]))).toThrow(
        "renderChart: a split bar's x cannot be negative",
      );
    });

    it("runs a mirror's x from 0 to the larger side's largest value", () => {
      expect(xScale(bars({ arrange: "mirror" }, [30, 5], [20, 44]))).toMatchObject({
        lo: 0,
        hi: 44,
        absolute: false,
      });
    });
  });

  describe("a diverging stack", () => {
    const diverge = (left: number, centre?: boolean) => ({
      arrange: "diverge",
      left,
      ...(centre === undefined ? {} : { centre }),
    });

    it("reaches from the widest left extent to the widest right one, a centre series half each side", () => {
      const likert = bars(diverge(2, true), [10, 5], [15, 5], [20, 0], [30, 40], [25, 50]);
      // Row 1: 10 + 15 + 20 / 2 left and 20 / 2 + 30 + 25 right; row 2: 10 left, 90 right.
      const x = xScale(likert);
      expect([x.lo, x.hi]).toEqual([-35, 90]);
      expect(x.absolute).toBe(true);
      const plain = xScale(bars(diverge(1), [10, 40], [30, 5], [null, 20]));
      expect([plain.lo, plain.hi]).toEqual([-40, 30]);
    });

    it("holds a rule on both sides and refuses a negative value, whose side comes from its order", () => {
      const spec = bars(diverge(1), [10], [30]);
      // The rule draws at 50 either side of 0, so each side's extent reaches it.
      const x = xScale(ruled(spec, undefined, 50));
      expect([x.lo, x.hi]).toEqual([-50, 50]);
      const near = xScale(ruled(spec, undefined, 5));
      expect([near.lo, near.hi]).toEqual([-10, 30]);
      expect(() => xScale(bars(diverge(1), [10], [-3]))).toThrow(
        "renderChart: a diverging bar's x cannot be negative",
      );
    });

    it("writes signed ticks on every other bar chart", () => {
      expect(xScale(bars({}, [3, -2], [1, 4])).absolute).toBe(false);
    });
  });

  it("names the band y's rows in the frame's order", () => {
    expect(yScale(bars({}, [1, 2, 3]))).toEqual({
      type: "band",
      rows: ["c0", "c1", "c2"],
      mono: false,
    });
  });
});

describe("a point chart's scales", () => {
  const points = (x: Scale, ...series: Values[]): ChartSpec => ({
    data: categories(
      (series[0] ?? []).map((_, i) => `c${String(i)}`),
      series,
    ),
    mark: { mark: "point" },
    x,
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
    const x = xScale(ruled(points({}, [40, 50]), undefined, 60));
    expect([x.lo, x.hi]).toEqual([40, 60]);
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

  it("refuses 0 or below on a log x and zero on a time x", () => {
    expect(() => xScale(points({ type: "log" }, [0]))).toThrow(
      "renderChart: a point's x must be above 0 on a log x",
    );
    expect(() => xScale(points({ type: "time", zero: true }, [DAY]))).toThrow(
      "renderChart: a time x has no zero to hold",
    );
  });

  it("refuses an infinite value by its field", () => {
    expect(() => xScale(points({}, [Number.POSITIVE_INFINITY]))).toThrow(
      /^renderChart: data\.series\[0\]\.values\[0\]/u,
    );
  });
});

describe("a slope's scales", () => {
  const slope = (y: ChartSpec["y"], ...series: Values[]): ChartSpec => ({
    data: categories(["Before", "After"], series),
    mark: { mark: "slope" },
    ...(y === undefined ? {} : { y }),
  });

  it("puts its two columns at 0 and 1 of an x it names itself", () => {
    expect(xScale(slope(undefined, [50, 34]))).toMatchObject({
      type: "linear",
      lo: 0,
      hi: 1,
      passed: true,
      reverse: false,
    });
  });

  it("holds 0 on y unless zero is false, as a line's does", () => {
    expect(continuous(yScale(slope(undefined, [50, 34], [30, 39])))).toMatchObject({
      lo: 0,
      hi: 50,
    });
    expect(continuous(yScale(slope({ zero: false }, [50, 34], [30, 39])))).toMatchObject({
      lo: 30,
      hi: 50,
    });
  });

  it("takes a negative end below 0 and a y rule into its extent", () => {
    expect(continuous(yScale(ruled(slope(undefined, [-4, 12]), undefined, 20)))).toMatchObject({
      lo: -4,
      hi: 20,
    });
  });
});

describe("a scatter's scales", () => {
  const scatter = (x: Scale, y: Scale, ...dots: [number | null, number | null][]): ChartSpec => ({
    data: pointsFrame([
      {
        key: "All",
        names: dots.map((_, i) => `d${String(i)}`),
        x: dots.map((d) => d[0]),
        y: dots.map((d) => d[1]),
      },
    ]),
    mark: { mark: "scatter" },
    x: { label: "GDP per capita", ...x },
    y: { label: "Life expectancy", ...y },
  });

  it("holds 0 on neither axis unless zero is true, since a dot's place is its value", () => {
    const spec = scatter({}, {}, [18_000, 79.8], [65_000, 84.1], [null, 90]);
    expect(xScale(spec)).toMatchObject({ type: "linear", lo: 18_000, hi: 65_000 });
    expect(continuous(yScale(spec))).toMatchObject({ type: "linear", lo: 79.8, hi: 84.1 });
    const zeroed = scatter({ zero: true }, { zero: true }, [18_000, 79.8], [65_000, 84.1]);
    expect(xScale(zeroed)).toMatchObject({ lo: 0, hi: 65_000 });
    expect(continuous(yScale(zeroed))).toMatchObject({ lo: 0, hi: 84.1 });
  });

  it("takes log scales of positive values", () => {
    const spec = scatter({ type: "log" }, { type: "log" }, [900, 53], [140_000, 85.9]);
    expect(xScale(spec)).toMatchObject({ type: "log", lo: 900, hi: 140_000 });
    expect(continuous(yScale(spec))).toMatchObject({ type: "log", lo: 53, hi: 85.9 });
  });

  it("takes rules on either axis into its extents, y by default", () => {
    const spec = scatter({}, {}, [10, 50], [20, 60]);
    const both: ChartSpec = {
      ...spec,
      data: {
        ...(spec.data as NonNullable<ChartSpec["data"]>),
        refs: [
          { key: "income", value: 30 },
          { key: "floor", value: 40 },
        ],
      },
      refs: [{ key: "income", label: "Median income", axis: "x" }],
    } as ChartSpec;
    expect(xScale(both)).toMatchObject({ lo: 10, hi: 30 });
    expect(continuous(yScale(both))).toMatchObject({ lo: 40, hi: 60 });
  });
});

describe("a bubble chart's size scale", () => {
  const bubbles = (r: (number | null)[], x: (number | null)[]): ChartSpec => ({
    data: pointsFrame([
      { key: "All", names: r.map((_, i) => `d${String(i)}`), x, y: r.map(() => 70), r },
    ]),
    mark: { mark: "scatter" },
    x: { label: "GDP per capita" },
    y: { label: "Life expectancy" },
    r: { label: "Population", format: "integer" },
  });

  it("runs from 0 to the largest size of a dot it places, in the scale's format", () => {
    expect(rScale(bubbles([5, 40, 90], [1, 2, null]))).toEqual({ hi: 40, format: "integer" });
  });

  it("leaves a dot with no size out of both position extents, since it draws nothing", () => {
    expect(xScale(bubbles([5, null, 7], [10, 500, 20]))).toMatchObject({ lo: 10, hi: 20 });
  });

  it("is absent on plain dots", () => {
    const plain: ChartSpec = {
      data: pointsFrame([{ key: "All", names: ["d"], x: [1], y: [2] }]),
      mark: { mark: "scatter" },
      x: { label: "a" },
      y: { label: "b" },
    };
    expect(rScale(plain)).toBeUndefined();
  });
});

describe("a cell chart's binned scales", () => {
  const values = (rows: number, columns: number) =>
    Array.from({ length: rows }, () => Array.from({ length: columns }, () => 1));
  const gdp = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000];
  const life = [50, 55, 60, 65, 70, 75, 80, 85];
  const grid = (
    more: Omit<ChartSpec, "data" | "mark" | "facets"> = {},
    x: FrameGridAxis = { edges: gdp },
    y: FrameGridAxis = { edges: life },
  ): ChartSpec => {
    const columns = x.edges === undefined ? (x.names?.length ?? 0) : x.edges.length - 1;
    const rows = y.edges === undefined ? (y.names?.length ?? 0) : y.edges.length - 1;
    return { data: gridFrame(x, y, values(rows, columns)), mark: { mark: "cell" }, ...more };
  };

  it("spans each binned axis from its first edge to its last, as a passed domain, unniced", () => {
    const x = xScale(grid({ x: { type: "log" } }));
    expect([x.type, x.lo, x.hi, x.passed, x.integer]).toEqual(["log", 1_000, 50_000, true, true]);
    const y = continuous(yScale(grid({ x: { type: "log" } })));
    expect([y.type, y.lo, y.hi, y.passed, y.integer]).toEqual(["linear", 50, 85, true, true]);
    expect(xScale(grid({}, { edges: [0.5, 1.25, 2] })).integer).toBe(false);
  });

  it("takes a time x of bins and keeps a reversed x", () => {
    const x = xScale(grid({ x: { type: "time", reverse: true } }, { edges: [0, DAY, 2 * DAY] }));
    expect([x.type, x.lo, x.hi, x.reverse]).toEqual(["time", 0, 2 * DAY, true]);
  });

  it("pairs a binned axis with a band of names on the other", () => {
    const days = ["Mon", "Tue"];
    expect(yScale(grid({}, { edges: gdp }, { names: days }))).toEqual({
      type: "band",
      rows: days,
      mono: false,
    });
    const x = xScale(grid({}, { names: ["a", "b", "c"] }));
    expect([x.lo, x.hi]).toEqual([0, 3]);
    expect(continuous(yScale(grid({}, { names: ["a", "b", "c"] }))).lo).toBe(50);
  });

  it("places a rule at its value on a binned axis, and off it past the edges", () => {
    const spec: ChartSpec = {
      ...grid(),
      data: {
        ...(grid().data as NonNullable<ChartSpec["data"]>),
        refs: [
          { key: "a", value: 3_000 },
          { key: "b", value: 90 },
        ],
      },
      refs: [
        { key: "a", axis: "x" },
        { key: "b", axis: "y" },
      ],
    } as ChartSpec;
    expect(ruleAt(xScale(spec), 3_000)).toEqual({ at: 3_000 });
    const y = continuous(yScale(spec));
    expect([y.lo, y.hi]).toEqual([50, 85]);
    expect(ruleAt(y, 90)).toEqual({ off: "high" });
  });

  it.each<[string, ChartSpec, ErrorConstructor]>([
    ["a band type on a binned x", grid({ x: { type: "band" } }), TypeError],
    ["a band type on a binned y", grid({ y: { type: "band" } }), TypeError],
    ["a time y", grid({ y: { type: "time" } }), TypeError],
    ["a domain on a binned x", grid({ x: { domain: [0, 10] } }), TypeError],
    ["a domain on a binned y", grid({ y: { domain: [0, 10] } }), TypeError],
    ["zero on a binned x", grid({ x: { zero: true } }), TypeError],
    ["zero on a binned y", grid({ y: { zero: false } }), TypeError],
    ["an edge at 0 on a log x", grid({ x: { type: "log" } }, { edges: [0, 1, 2] }), RangeError],
    [
      "an edge below 0 on a log y",
      grid({ y: { type: "log" } }, undefined, { edges: [-1, 2] }),
      RangeError,
    ],
    [
      "a linear type on a named y",
      grid({ y: { type: "linear" } }, undefined, { names: ["a"] }),
      TypeError,
    ],
    ["a y rule on a named y", ruled(grid({}, undefined, { names: ["a"] }), "y", 1), TypeError],
  ])("refuses %s", (_, spec, type) => {
    expect(() => {
      xScale(spec);
      yScale(spec);
    }).toThrow(type);
  });
});
