import { describe, expect, it } from "vitest";

import {
  coarserStep,
  decimal,
  linearAxis,
  linearTicks,
  niceStep,
  resolution,
  step,
  type Step,
} from "./linear.js";

// An axis with its step as a number, to compare with literals.
const plain = ({ domain, step: s }: { domain: readonly [number, number]; step: Step }) => ({
  domain,
  step: s.value,
});

describe("steps", () => {
  it("are 1, 2 or 5 times a power of ten, the smallest at or above the minimum", () => {
    expect([52, 17.5, 0.3, 0.05, 5.01, 1, 1000].map((v) => niceStep(v).value)).toEqual([
      100, 20, 0.5, 0.05, 10, 1, 1000,
    ]);
    expect(niceStep(0.05)).toEqual({ lead: 5, exp: -2, value: 0.05 });
  });

  it("compare exactly, so a quotient above a step takes the next", () => {
    expect(niceStep(0.10000000000000002).value).toBe(0.2);
  });

  it("are the nearest double to their decimal at every exponent, never -0", () => {
    expect([decimal(3, -1), decimal(-7, -3), decimal(5, 299), decimal(1, -300)]).toEqual([
      0.3, -0.007, 5e299, 1e-300,
    ]);
    expect(Object.is(decimal(-0, -2), 0)).toBe(true);
  });

  it("are never finer than the twelfth figure of the values, nor than 1e-300", () => {
    expect(resolution(1e16, 1e16)).toBe(1e5);
    expect(resolution(-250, 3)).toBe(1e-9);
    expect(resolution(0, 0)).toBe(1e-300);
    expect(resolution(0, 5e-324)).toBe(1e-300);
  });

  it("move to the next of 1, 2 and 5 when coarser", () => {
    const steps = [step(1, 0), step(2, 0), step(5, 0), step(2, -1), step(5, 1)];
    expect(steps.map((s) => coarserStep(s).value)).toEqual([2, 5, 10, 0.5, 100]);
  });

  it("tick at exact multiples, with no -0", () => {
    const tenth = step(1, -1);
    expect(linearTicks(0, 1, tenth)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(linearTicks(-0.3, 0.25, tenth).map((v) => Object.is(v, -0))).not.toContain(true);
    expect(linearTicks(3, 97, step(2, 1))).toEqual([20, 40, 60, 80]);
  });

  it("tick only inside the domain, though the quotient rounds past an end", () => {
    // 0.1 + 0.2 is above 0.3, so 0.3 is no tick of a domain from it.
    expect(linearTicks(0.1 + 0.2, 0.6, step(1, -1))).toEqual([0.4, 0.5, 0.6]);
    expect(linearTicks(123456789012.4, 123456789013.9, step(1, 0))).toEqual([123456789013]);
  });
});

describe("linearAxis", () => {
  const nice = { nice: true, integer: false };
  const passed = { nice: false, integer: false };
  const axis = (lo: number, hi: number, px: number, spacing: number, o = nice) =>
    plain(linearAxis(lo, hi, px, spacing, o));

  it("nices the domain to the smallest step whose ticks stand 40 px apart", () => {
    expect(axis(0, 312, 240, 40)).toEqual({ domain: [0, 400], step: 100 });
    expect(axis(0, 105, 240, 40)).toEqual({ domain: [0, 120], step: 20 });
  });

  it("takes a coarser step when nicing brings the ticks closer than the target", () => {
    // 50 would nice 0..101 to 0..150, ticks 33 px apart on 100 px.
    expect(axis(0, 101, 100, 40)).toEqual({ domain: [0, 200], step: 100 });
  });

  it("steps at least 1 when every value is an integer", () => {
    expect(axis(0, 3, 240, 40).step).toBe(0.5);
    expect(axis(0, 3, 240, 40, { nice: true, integer: true })).toEqual({
      domain: [0, 3],
      step: 1,
    });
    // A passed domain under 1 wide would hold no whole step.
    expect(axis(0.3, 0.7, 600, 80, { nice: false, integer: true }).step).toBe(0.1);
  });

  it("keeps a passed domain", () => {
    expect(axis(3, 97, 400, 80, passed)).toEqual({ domain: [3, 97], step: 20 });
  });

  it("stops at one interval over the domain when no step meets the target", () => {
    expect(axis(0, 11, 30, 40)).toEqual({ domain: [0, 20], step: 20 });
    // Across a multiple a niced domain spans two steps however wide.
    expect(axis(-1, 1, 60, 40)).toEqual({ domain: [-2, 2], step: 2 });
    expect(axis(-9999990000, 8589480000, 135, 80)).toEqual({ domain: [-2e10, 2e10], step: 2e10 });
  });

  it("takes the exact step a span's quotient names, though the quotient drifts above it", () => {
    // 0.6 / 6 is 0.10000000000000002, and 0.000005 / 5 is 1.0000000000000002e-6.
    expect(axis(-0.2, 0.4, 240, 40)).toEqual({ domain: [-0.2, 0.4], step: 0.1 });
    expect(axis(0, 0.000005, 200, 40)).toEqual({ domain: [0, 0.000005], step: 0.000001 });
    // An end 2.4e-11 past 6, under a billionth of the step, is read as on it.
    expect(axis(0, 6.000000000024, 240, 40)).toEqual({ domain: [0, 6], step: 1 });
  });

  it("ends a domain at a multiple when the data's end drifts past it", () => {
    expect(axis(0, 0.1 + 0.2, 600, 40)).toEqual({ domain: [0, 0.3], step: 0.02 });
    expect(axis(0, 0.4 + 0.8, 240, 40)).toEqual({ domain: [0, 1.2], step: 0.2 });
    expect(axis(-0.1 - 0.2, 0, 240, 40)).toEqual({ domain: [-0.3, 0], step: 0.05 });
  });

  it("holds both ends when the span lies below the twelfth figure", () => {
    for (const [lo, hi] of [
      [1e15, 1e15 + 1],
      [1e12, 1e12 + 0.5],
      [1e16 - 1e5, 1e16 + 1e5],
    ] as const) {
      const { domain, step: s } = axis(lo, hi, 600, 40);
      expect(domain[0] <= lo && hi <= domain[1] && domain[0] < domain[1]).toBe(true);
      expect(s).toBeGreaterThanOrEqual(resolution(lo, hi));
    }
  });

  it("steps at least 1e-300 over a span below it", () => {
    expect(axis(0, 5e-324, 600, 40)).toEqual({ domain: [0, 1e-300], step: 1e-300 });
  });

  it("stays finite at ±1e300, the largest value a chart takes", () => {
    for (const options of [nice, passed]) {
      const { domain, step: s } = axis(-1e300, 1e300, 600, 40, options);
      expect([...domain, s].every(Number.isFinite)).toBe(true);
      expect(domain[0] < domain[1] && s > 0).toBe(true);
    }
  });
});
