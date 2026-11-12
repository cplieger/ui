import { describe, expect, it } from "vitest";

import { boxes, greedy, tooSparse } from "./labels.js";

describe("boxes", () => {
  it("centres each label on its tick", () => {
    expect(boxes([50, 150], [20, 40], 200, false)).toEqual([
      { start: 40, end: 60 },
      { start: 130, end: 170 },
    ]);
  });

  it("keeps flush labels inside the plot, so the end labels never overhang it", () => {
    expect(boxes([0, 100, 200], [30, 30, 30], 200, true)).toEqual([
      { start: 0, end: 30 },
      { start: 85, end: 115 },
      { start: 170, end: 200 },
    ]);
    expect(boxes([10], [40], 30, true)).toEqual([{ start: 0, end: 40 }]);
  });
});

describe("greedy", () => {
  it("drops each label closer than 8 px to the last one kept", () => {
    const placed = boxes([0, 40, 75, 120, 200], [30, 30, 30, 30, 30], 200, true);
    // 0..30, 25..55 (drop), 60..90 (keep: 30 px from 30), 105..135 (keep), 170..200.
    expect(greedy(placed)).toEqual([0, 2, 3, 4]);
  });

  it("keeps a label exactly 8 px from the last kept, and none 7.9 px from it", () => {
    expect(
      greedy([
        { start: 0, end: 10 },
        { start: 18, end: 28 },
      ]),
    ).toEqual([0, 1]);
    expect(
      greedy([
        { start: 0, end: 10 },
        { start: 17.9, end: 28 },
      ]),
    ).toEqual([0]);
  });

  it("is too sparse once fewer than every other label is kept", () => {
    expect(tooSparse(3, 5)).toBe(false);
    expect(tooSparse(2, 5)).toBe(true);
    expect(tooSparse(2, 4)).toBe(false);
    expect(tooSparse(0, 0)).toBe(false);
  });
});
