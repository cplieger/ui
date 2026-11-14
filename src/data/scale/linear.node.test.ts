import { describe, expect, it } from "vitest";

import { coarserStep, linearAxis, linearTicks, niceStep, resolution } from "./linear.js";

describe("steps", () => {
  it("are 1, 2 or 5 times a power of ten, the smallest at or above the minimum", () => {
    expect(niceStep(52)).toBe(100);
    expect(niceStep(17.5)).toBe(20);
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(0.05)).toBe(0.05);
    expect(niceStep(5.01)).toBe(10);
    expect(niceStep(1)).toBe(1);
  });

  it("take the exact step a span's quotient names, though the quotient drifts above it", () => {
    expect(niceStep((0.4 - -0.2) / 6)).toBe(0.1);
    expect(niceStep(0.000005 / 5)).toBe(0.000001);
    // Compared to twelve figures, so a step 4e-12 above 1 is 1.
    expect(niceStep(1.000000000004)).toBe(1);
  });

  it("are never finer than the twelfth figure of the values, nor than 1e-300", () => {
    expect(resolution(1e16, 1e16)).toBe(1e5);
    expect(resolution(-250, 3)).toBe(1e-9);
    expect(resolution(0, 0)).toBe(1e-300);
    expect(resolution(0, 5e-324)).toBe(1e-300);
  });

  it("move to the next of 1, 2 and 5 when coarser", () => {
    expect([1, 2, 5, 0.2, 50].map(coarserStep)).toEqual([2, 5, 10, 0.5, 100]);
  });

  it("tick at exact multiples, with no -0", () => {
    expect(linearTicks(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(linearTicks(-0.3, 0.25, 0.1).map((v) => Object.is(v, -0))).not.toContain(true);
    expect(linearTicks(3, 97, 20)).toEqual([20, 40, 60, 80]);
  });
});

describe("linearAxis", () => {
  const nice = { nice: true, integer: false };

  it("nices the domain to the smallest step whose ticks stand 40 px apart", () => {
    expect(linearAxis(0, 312, 240, 40, nice)).toEqual({
      domain: [0, 400],
      step: 100,
    });
    expect(linearAxis(0, 105, 240, 40, nice).step).toBe(20);
    expect(linearAxis(0, 105, 240, 40, nice).domain).toEqual([0, 120]);
  });

  it("takes a coarser step when nicing brings the ticks closer than the target", () => {
    // 50 would nice 0..101 to 0..150, ticks 33 px apart on 100 px.
    expect(linearAxis(0, 101, 100, 40, nice)).toMatchObject({ domain: [0, 200], step: 100 });
  });

  it("steps at least 1 when every value is an integer", () => {
    expect(linearAxis(0, 3, 240, 40, nice).step).toBe(0.5);
    expect(linearAxis(0, 3, 240, 40, { nice: true, integer: true })).toEqual({
      domain: [0, 3],
      step: 1,
    });
  });

  it("keeps a passed domain", () => {
    expect(linearAxis(3, 97, 400, 80, { nice: false, integer: false })).toEqual({
      domain: [3, 97],
      step: 20,
    });
  });

  it("stops at one interval over the domain when no step meets the target", () => {
    expect(linearAxis(0, 11, 30, 40, nice)).toEqual({ domain: [0, 20], step: 20 });
  });

  it("holds both ends when the span lies below the twelfth figure", () => {
    for (const [lo, hi] of [
      [1e15, 1e15 + 1],
      [1e12, 1e12 + 0.5],
      [1e16 - 1e5, 1e16 + 1e5],
    ] as const) {
      const { domain, step } = linearAxis(lo, hi, 600, 40, nice);
      expect(domain[0] <= lo && hi <= domain[1] && domain[0] < domain[1]).toBe(true);
      expect(step).toBeGreaterThanOrEqual(resolution(lo, hi));
    }
  });

  it("steps at least 1e-300 over a span below it", () => {
    expect(linearAxis(0, 5e-324, 600, 40, nice)).toEqual({ domain: [0, 1e-300], step: 1e-300 });
  });

  it("keeps a passed domain narrower than its resolution", () => {
    expect(linearAxis(1e16, 1e16 + 2, 600, 40, { nice: false, integer: false })).toEqual({
      domain: [1e16, 1e16 + 2],
      step: 1e5,
    });
  });

  it("stays finite at ±1e300, the largest value a chart takes", () => {
    for (const options of [nice, { nice: false, integer: false }]) {
      const { domain, step } = linearAxis(-1e300, 1e300, 600, 40, options);
      expect([...domain, step].every(Number.isFinite)).toBe(true);
      expect(domain[0] < domain[1] && step > 0).toBe(true);
    }
  });
});
