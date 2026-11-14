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
