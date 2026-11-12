import { describe, expect, it } from "vitest";

import { DURATION_TICKS, durationEdges } from "./ladder.js";

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;
const DAY = 24 * HR;

// The bin of a delay on `edges`: [edge_i, edge_i+1), the last bin closed.
const binOf = (edges: readonly number[], ms: number): number => {
  const last = edges.length - 2;
  for (let i = 0; i <= last; i++) {
    const lo = edges[i] ?? 0;
    const hi = edges[i + 1] ?? 0;
    if (ms >= lo && (ms < hi || (i === last && ms === hi))) {
      return i;
    }
  }
  return -1;
};

describe("durationEdges", () => {
  it("runs in milliseconds from 0 to 3 days by default, 17 edges", () => {
    const edges = durationEdges();
    expect(edges).toEqual([
      0,
      S,
      2 * S,
      5 * S,
      10 * S,
      30 * S,
      MIN,
      2 * MIN,
      5 * MIN,
      10 * MIN,
      30 * MIN,
      HR,
      2 * HR,
      6 * HR,
      12 * HR,
      DAY,
      259_200_000,
    ]);
  });

  it("stops at the first edge at or above maxMs", () => {
    expect(durationEdges(604_800_000).at(-1)).toBe(604_800_000);
    expect(durationEdges(345_600_000).at(-1)).toBe(604_800_000);
    expect(durationEdges(7_776_000_000).at(-1)).toBe(7_776_000_000);
    expect(durationEdges(7_776_000_000).slice(-4)).toEqual([
      604_800_000, 1_209_600_000, 2_592_000_000, 7_776_000_000,
    ]);
    expect(durationEdges(1).slice(-1)).toEqual([S]);
  });

  it("keeps every neighbouring pair of positive edges between a factor of 2 and 3", () => {
    const positive = durationEdges(7_776_000_000).slice(1);
    for (let i = 1; i < positive.length; i++) {
      const factor = (positive[i] ?? 0) / (positive[i - 1] ?? 1);
      expect(factor).toBeGreaterThanOrEqual(2);
      expect(factor).toBeLessThanOrEqual(3);
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 7_776_000_001])(
    "throws a RangeError for %s",
    (maxMs) => {
      expect(() => durationEdges(maxMs)).toThrow(RangeError);
    },
  );

  it("bins every read in exactly one bin, interior edges in the bin they start", () => {
    const week = durationEdges(7 * DAY);
    expect(week.slice(binOf(week, 4 * DAY), binOf(week, 4 * DAY) + 2)).toEqual([3 * DAY, 7 * DAY]);
    // Retention dropped to 72 hours after a read 10 days late was written.
    const edges = durationEdges(Math.max(3 * DAY, 10 * DAY));
    const late = binOf(edges, 10 * DAY);
    expect([edges[late], edges[late + 1]]).toEqual([7 * DAY, 14 * DAY]);
    const fallback = durationEdges();
    const minute = binOf(fallback, MIN);
    expect([fallback[minute], fallback[minute + 1]]).toEqual([MIN, 2 * MIN]);
    const end = binOf(fallback, 3 * DAY);
    expect([fallback[end], fallback[end + 1]]).toEqual([DAY, 3 * DAY]);
  });
});

describe("DURATION_TICKS", () => {
  it("ticks at the units people say, then at every ladder edge above 3 days", () => {
    expect(DURATION_TICKS).toEqual([
      S,
      10 * S,
      MIN,
      10 * MIN,
      HR,
      6 * HR,
      DAY,
      3 * DAY,
      7 * DAY,
      14 * DAY,
      30 * DAY,
      90 * DAY,
    ]);
  });
});
