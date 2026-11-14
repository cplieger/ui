import { describe, expect, it } from "vitest";

import { classes, classOf, classSteps } from "./classes.js";

describe("the steps each class takes", () => {
  it.each<[number, number[]]>([
    [2, [1, 9]],
    [3, [1, 5, 9]],
    [5, [1, 3, 5, 7, 9]],
    [9, [1, 2, 3, 4, 5, 6, 7, 8, 9]],
  ])("spreads %i sequential classes over the nine steps, both ends included", (n, steps) => {
    expect(classSteps("sequential", n)).toEqual(steps);
  });

  it.each<[number, number[]]>([
    [2, [1, 9]],
    [3, [1, 5, 9]],
    [4, [1, 3, 7, 9]],
    [5, [1, 3, 5, 7, 9]],
    [6, [1, 2, 4, 6, 8, 9]],
    [9, [1, 2, 3, 4, 5, 6, 7, 8, 9]],
  ])("gives %i diverging classes the middle step and arms either side", (n, steps) => {
    expect(classSteps("diverging", n)).toEqual(steps);
  });

  it("swaps a reversed diverging scale's arms", () => {
    expect(classSteps("diverging", 6, true)).toEqual([9, 8, 6, 4, 2, 1]);
  });
});

describe("equal classes", () => {
  it("rounds sequential classes from 0 when no value is below it", () => {
    // 57 / 5 = 11.4, so each class is 20 wide.
    expect(classes({}, [3, 57, 12])).toEqual({
      type: "sequential",
      thresholds: [20, 40, 60, 80],
      steps: [1, 3, 5, 7, 9],
      digits: [0, 0],
    });
  });

  it("starts at a multiple of the width below the least value, widening until they reach the greatest", () => {
    // 10 / 5 = 2 from -4 reaches 6, short of 7; whole data skips 2.5, so 5 from -5.
    expect(classes({}, [-3, 7]).thresholds).toEqual([0, 5, 10, 15]);
    // 10.5 / 5 = 2.1, so 2.5 from -5, which reaches 7.5.
    expect(classes({}, [-3.5, 7]).thresholds).toEqual([-2.5, 0, 2.5, 5]);
  });

  it("keeps a class width of whole data whole", () => {
    expect(classes({}, [0, 1, 3]).thresholds).toEqual([1, 2, 3, 4]);
    expect(classes({ steps: 4 }, [0.12, 0.93]).thresholds).toEqual([0.25, 0.5, 0.75]);
  });

  it("divides a passed domain exactly", () => {
    expect(classes({ steps: 4, domain: [0, 100] }, [3, 7]).thresholds).toEqual([25, 50, 75]);
    expect(classes({ steps: 2, domain: [3, 10] }, []).thresholds).toEqual([6.5]);
    // 0.1 + 0.2 is 0.30000000000000004; the exact division is 0.3.
    expect(classes({ steps: 3, domain: [0.1, 0.7] }, []).thresholds).toEqual([0.3, 0.5]);
  });

  it("spans 0 to 1 with no value, or with every value 0", () => {
    expect(classes({ steps: 2 }, []).thresholds).toEqual([1]);
    expect(classes({ steps: 2 }, [0, 0]).thresholds).toEqual([1]);
  });

  it("writes boundaries free of binary drift", () => {
    expect(classes({ steps: 9 }, [0, 0.87]).thresholds).toEqual([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8,
    ]);
  });

  it("puts a sequential boundary that falls on 0 exactly on 0, so a 0 cell takes the class above", () => {
    // From -0.3 in classes 0.1 wide, the third boundary is 0.
    const c = classes({ steps: 4 }, [-0.3, 0]);
    expect(c.thresholds).toEqual([-0.2, -0.1, 0]);
    expect(Object.is(c.thresholds[2], 0)).toBe(true);
    expect(classOf(c, 0)).toBe(3);
  });

  it("puts a diverging boundary that falls on 0 exactly on 0", () => {
    // Pivot 0.3, half-span 0.4 over 4 classes a side: 0.1 wide, the first boundary 0.3 − 3 × 0.1.
    const d = classes({ type: "diverging", steps: 8, pivot: 0.3 }, [-0.1, 0.7]);
    expect(d.thresholds).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(Object.is(d.thresholds[0], 0)).toBe(true);
  });

  it("starts at the multiple of the width at the least value when the least value is one", () => {
    // 0.03 / 4 = 0.0075, so 0.01 wide from -0.07, which reaches -0.03.
    expect(classes({ steps: 4 }, [-0.07, -0.04]).thresholds).toEqual([-0.06, -0.05, -0.04]);
  });

  it("takes a width the span over steps reaches exactly, though the quotient drifts above it", () => {
    // 0.6 / 6 and 0.3 / 3 are each 0.1 wide, from -0.2 (reaching 0.4) and from -0.1 (reaching 0.2).
    expect(classes({ steps: 6 }, [-0.2, 0.4]).thresholds).toEqual([-0.1, 0, 0.1, 0.2, 0.3]);
    expect(classes({ steps: 3 }, [-0.1, 0.2]).thresholds).toEqual([0, 0.1]);
    // Pivot 0.3, half-span 0.25 over 5 classes: 0.1 wide, the middle class 0.25 to 0.35.
    expect(classes({ type: "diverging", steps: 5, pivot: 0.3 }, [0.05, 0.55]).thresholds).toEqual([
      0.15, 0.25, 0.35, 0.45,
    ]);
  });

  it("keeps a pivot near 0 as an even diverging count's middle boundary among wide classes", () => {
    const d = classes({ type: "diverging", steps: 4, pivot: 0.001 }, [-2e6, 2e6]);
    expect(new Intl.NumberFormat("en").format(d.thresholds[1] ?? Number.NaN)).toBe("0.001");
    expect(classOf(d, 0)).toBe(1);
  });

  it("keeps every figure a boundary's operands state, and none of their binary residue", () => {
    // A passed domain divides exactly: the middle of [-1e12, 1e12 + 1] is 0.5.
    const wide = classes({ steps: 2, domain: [-1e12, 1e12 + 1] }, []);
    expect(wide.thresholds).toEqual([0.5]);
    expect(classOf(wide, 0)).toBe(0);
    // A 13-figure pivot is an even count's middle boundary as sent.
    const pivot = 1e12 + 0.5;
    const big = classes({ type: "diverging", steps: 4, pivot }, [pivot - 1.5e12, pivot + 1.5e12]);
    expect(big.thresholds[1]).toBe(pivot);
    expect(classOf(big, 1e12 + 0.25)).toBe(1);
    // -2999.999 + 3000 is 0.001, though binary leaves 0.0010000000002.
    const near = classes({ steps: 6, domain: [-2999.999, 3000.001] }, []);
    expect(near.thresholds).toEqual([-1999.999, -999.999, 0.001, 1000.001, 2000.001]);
    expect(classOf(near, 0.001)).toBe(3);
    // Width 0.0005 about pivot 0.0007501: the second boundary is 1.5 widths below it.
    const small = classes(
      { type: "diverging", steps: 7, pivot: 0.0007501 },
      [-0.0007864, -0.00037],
    );
    expect(small.thresholds[1]).toBe(1e-7);
  });

  it("reaches a greatest value that drifts past a round boundary", () => {
    // 0.4 + 0.8 is 1.2000000000000002, which six classes 0.2 wide reach.
    expect(classes({ steps: 6 }, [0, 0.4 + 0.8]).thresholds).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("names the fraction digits that write every inferred boundary and the pivot", () => {
    expect(classes({ steps: 4 }, [0.12, 0.93]).digits).toEqual([2, 2]);
    // Half-widths of 0.00025 about 0.0007501.
    const small = classes(
      { type: "diverging", steps: 7, pivot: 0.0007501 },
      [-0.0007864, -0.00037],
    );
    expect(small.digits).toEqual([5, 7]);
    expect(classes({ steps: 2, domain: [3, 10] }, []).digits).toBeUndefined();
    expect(classes({ thresholds: [1] }, []).digits).toBeUndefined();
  });

  it("writes a computed pivot to at most three digits past the spacing's", () => {
    // 260 / 7 is 37.142857142857146, a mean; the classes are 20 wide.
    expect(classes({ type: "diverging", steps: 5, pivot: 260 / 7 }, [12, 70]).digits).toEqual([
      0, 3,
    ]);
  });

  it("names no more digits than the boundaries need", () => {
    // Half of a class 2 wide is 1, so integer counts key as -1, 0, 1.
    expect(classes({ type: "diverging", steps: 3 }, [-3, 3])).toMatchObject({
      thresholds: [-1, 1],
      digits: [0, 0],
    });
    expect(classes({ type: "diverging", steps: 5 }, [-0.3, 0.3])).toMatchObject({
      thresholds: [-0.3, -0.1, 0.1, 0.3],
      digits: [1, 1],
    });
    // A lone boundary at the pivot, or at -1 in classes 0.2 wide.
    expect(classes({ type: "diverging", steps: 2 }, [-0.3, 0.3]).digits).toEqual([0, 0]);
    expect(classes({ steps: 2 }, [-1.2, -0.8])).toMatchObject({
      thresholds: [-1],
      digits: [0, 0],
    });
  });

  it("makes a full-precision pivot an even count's middle boundary as sent", () => {
    for (const c of [
      classes({ type: "diverging", steps: 4, pivot: 2 / 3 }, [-1, 2]),
      classes({ type: "diverging", steps: 4, pivot: 2 / 3, domain: [-1, 2] }, []),
      classes({ type: "diverging", steps: 6, pivot: Math.PI }, [0, 10]),
    ]) {
      const pivot = c.thresholds[Math.floor(c.thresholds.length / 2)] ?? Number.NaN;
      expect(pivot === 2 / 3 || pivot === Math.PI).toBe(true);
      expect(classOf(c, pivot)).toBe(Math.ceil(c.thresholds.length / 2));
    }
  });

  it.each<[string, Parameters<typeof classes>]>([
    ["one value past 2^53", [{}, [-1e16]]],
    ["a span below 1e-300", [{}, [0, 5e-324]]],
    ["a span below the twelfth figure", [{}, [-1e15 - 1, -1e15]]],
    [
      "a diverging pivot past 2^53 at its one value",
      [{ type: "diverging", steps: 4, pivot: 1e16 }, [1e16]],
    ],
    ["a diverging span below 1e-300", [{ type: "diverging" }, [-5e-324, 5e-324]]],
  ])("keeps finite, strictly increasing boundaries for %s", (_, [spec, values]) => {
    const { thresholds } = classes(spec, values);
    expect(thresholds.every(Number.isFinite)).toBe(true);
    expect(thresholds.every((t, k) => k === 0 || t > (thresholds[k - 1] ?? 0))).toBe(true);
  });

  it.each<[string, Parameters<typeof classes>[0]]>([
    ["below the twelfth figure", { domain: [1e16, 1e16 + 2] }],
    ["below 1e-300", { domain: [0, 5e-324] }],
    [
      "about a pivot past 2^53",
      { type: "diverging", steps: 4, pivot: 1e16, domain: [1e16 - 2, 1e16 + 2] },
    ],
  ])("refuses a passed domain %s, too narrow for increasing boundaries", (_, spec) => {
    expect(() => classes(spec, [])).toThrow(
      new RangeError(
        "renderChart: colour.domain is too narrow for its classes' boundaries to strictly increase",
      ),
    );
  });

  it("stays finite and in order at ±1e300, the largest value a chart takes", () => {
    for (const c of [
      classes({}, [-1e300, 1e300]),
      classes({ type: "diverging" }, [-1e300, 1e300]),
      classes({ steps: 9, domain: [-1e300, 1e300] }, []),
    ]) {
      expect(c.thresholds.every(Number.isFinite)).toBe(true);
      expect(c.thresholds.every((t, k) => k === 0 || t > (c.thresholds[k - 1] ?? 0))).toBe(true);
    }
  });

  it("centres an odd diverging count's middle class on the pivot", () => {
    // The half-span is 8, so 5 classes are each at least 3.2 wide: 5.
    expect(classes({ type: "diverging" }, [-8, 3])).toEqual({
      type: "diverging",
      thresholds: [-7.5, -2.5, 2.5, 7.5],
      steps: [1, 3, 5, 7, 9],
      digits: [1, 1],
    });
    expect(classes({ type: "diverging", steps: 3, pivot: 50 }, [20, 90]).thresholds).toEqual([
      25, 75,
    ]);
  });

  it("makes the pivot an even diverging count's middle boundary", () => {
    expect(classes({ type: "diverging", steps: 4 }, [-0.3, 0.45]).thresholds).toEqual([
      -0.25, 0, 0.25,
    ]);
    expect(classes({ type: "diverging", steps: 4, domain: [-1, 3] }, []).thresholds).toEqual([
      -1.5, 0, 1.5,
    ]);
  });

  it("takes passed thresholds as sent, a class more than they hold", () => {
    expect(classes({ thresholds: [10, 100, 1000] }, [5])).toEqual({
      type: "sequential",
      thresholds: [10, 100, 1000],
      steps: [1, 4, 6, 9],
    });
  });
});

describe("the class a value takes", () => {
  const c = classes({ thresholds: [10, 20] }, []);

  it.each<[number, number]>([
    [-5, 0],
    [9.99, 0],
    [10, 1],
    [19, 1],
    [20, 2],
    [1e9, 2],
  ])("puts %d in class %i, a boundary in the class above and the ends open", (v, k) => {
    expect(classOf(c, v)).toBe(k);
  });
});
