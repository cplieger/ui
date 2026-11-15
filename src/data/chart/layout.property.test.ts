import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { numberedNotes, type Note } from "./layout.js";
import type { Box } from "./notes.js";

const note = (box: Box): Note => ({
  mark: 0,
  point: { x: box.left, y: box.top },
  box,
  lines: [],
  fits: true,
  number: 1,
});

// Small integer edges, so ties, touching edges and zero-size boxes are common.
const box = fc
  .record({
    left: fc.integer({ min: 0, max: 12 }),
    top: fc.integer({ min: 0, max: 12 }),
    width: fc.integer({ min: 0, max: 5 }),
    height: fc.integer({ min: 0, max: 5 }),
  })
  .map(({ left, top, width, height }) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  }));

// Two boxes overlap when their open intervals meet on both axes; touching
// edges are apart.
const meet = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;

describe("numberedNotes", () => {
  it("numbers the notes exactly when some two of them overlap", () => {
    fc.assert(
      fc.property(fc.array(box, { maxLength: 24 }), (boxes) => {
        const overlapping = boxes.some((a, i) =>
          boxes
            .slice(i + 1)
            .some(
              (b) =>
                meet(a.left, a.right, b.left, b.right) && meet(a.top, a.bottom, b.top, b.bottom),
            ),
        );
        expect(numberedNotes(boxes.map(note), false)).toBe(overlapping);
      }),
    );
  });
});
