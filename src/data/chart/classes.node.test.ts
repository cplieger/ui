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
