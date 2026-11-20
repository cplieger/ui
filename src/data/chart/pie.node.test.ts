import { describe, expect, it } from "vitest";

import { slicePath, sliceRing } from "./geometry.js";
import { chartModel, type PieModel } from "./model.js";
import { sliceAngles, TURN, type Disc } from "./pie.js";
import type { ChartSpec } from "./spec.js";
import { categories } from "./test-helpers/frames.js";

const pie = (values: readonly (number | null)[], hole = false): PieModel => {
  const spec: ChartSpec = {
    data: categories(
      values.map((_, i) => `S${String(i)}`),
      [values],
    ),
    mark: { mark: "pie", hole },
  };
  const m = chartModel(spec, "en", "UTC").marks[0];
  if (m?.kind !== "pie") {
    throw new Error("not a pie");
  }
  return m;
};

const disc: Disc = { cx: 120, cy: 120, r: 100, inner: 0 };

// The path's points, in order: every pair of numbers after a command, an
// arc's end its last two.
function points(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [, cmd = "", args = ""] of d.matchAll(/([MLA])([^MLAZ]*)/gu)) {
    const n = args
      .trim()
      .split(/[\s,]+/u)
      .map(Number);
    const [x = 0, y = 0] = cmd === "A" ? n.slice(5) : n;
    out.push({ x, y });
  }
  return out;
}

// The distance from `p` to the line through the centre at angle `a`.
const fromEdge = (p: { x: number; y: number }, a: number, f = disc): number =>
  Math.abs((p.x - f.cx) * Math.cos(a) + (p.y - f.cy) * Math.sin(a));

describe("sliceAngles", () => {
  it("runs clockwise from 12 o'clock in the app's order, skipping 0 and gaps, to a whole turn", () => {
    const s = sliceAngles(pie([1, 0, 2, null, 1]));
    expect(s.map((x) => x.index)).toEqual([0, 2, 4]);
    expect(s[0]?.from).toBe(0);
    expect(s[0]?.to).toBeCloseTo(TURN / 4, 12);
    expect(s[1]?.from).toBe(s[0]?.to);
    expect(s[1]?.to).toBeCloseTo((3 * TURN) / 4, 12);
    expect(s.at(-1)?.to).toBe(TURN);
  });

  it("ends at a whole turn whatever the values' sum rounds to", () => {
    const s = sliceAngles(pie([0.1, 0.2, 0.3, 1e-9, 7.7]));
    expect(s.at(-1)?.to).toBe(TURN);
  });
});

describe("slicePath", () => {
  it("moves each straight edge 0.5 px into the slice, as wide at the rim as at the centre", () => {
    const from = 0.3;
    const to = 1.6;
    const [start, end, apex] = points(slicePath(disc, from, to));
    // The rim's ends lie on the circle, each 0.5 px off its edge.
    for (const [p, a] of [
      [start, from],
      [end, to],
    ] as const) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(100, 1);
      expect(fromEdge(p ?? { x: 0, y: 0 }, a)).toBeCloseTo(0.5, 1);
    }
    // The edges meet 0.5 px from both lines, on the bisector.
    expect(fromEdge(apex ?? { x: 0, y: 0 }, from)).toBeCloseTo(0.5, 1);
    expect(fromEdge(apex ?? { x: 0, y: 0 }, to)).toBeCloseTo(0.5, 1);
  });

  it("keeps its edges where its rim is under 2 px, touching its neighbours", () => {
    const span = 1.9 / 100;
    const [start, end, apex] = points(slicePath(disc, 1, 1 + span));
    expect(fromEdge(start ?? { x: 0, y: 0 }, 1)).toBeLessThan(0.01);
    expect(fromEdge(end ?? { x: 0, y: 0 }, 1 + span)).toBeLessThan(0.01);
    expect(apex).toEqual({ x: 120, y: 120 });
    // 2.1 px of rim keeps its gaps.
    const [kept] = points(slicePath(disc, 1, 1 + 2.1 / 100));
    expect(fromEdge(kept ?? { x: 0, y: 0 }, 1)).toBeCloseTo(0.5, 1);
  });

  it("stops each edge 0.5 px from the centre past a half turn, joined round it", () => {
    const from = 0.2;
    const to = 0.2 + 4;
    const d = slicePath(disc, from, to);
    const [, , end, start] = points(d);
    for (const p of [end, start]) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(0.5, 1);
    }
    expect(fromEdge(end ?? { x: 0, y: 0 }, to)).toBeCloseTo(0.5, 1);
    expect(fromEdge(start ?? { x: 0, y: 0 }, from)).toBeCloseTo(0.5, 1);
    // The outer arc is the large one.
    expect(d).toMatch(/A100 100 0 1 1/u);
  });

  it("draws a donut's slice to its inner arc, 0.5 px off each edge there too", () => {
    const f = { ...disc, inner: 50 };
    const d = slicePath(f, 1, 2);
    const [, , inEnd, inStart] = points(d);
    for (const [p, a] of [
      [inEnd, 2],
      [inStart, 1],
    ] as const) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(50, 1);
      expect(fromEdge(p ?? { x: 0, y: 0 }, a, f)).toBeCloseTo(0.5, 1);
    }
    // Back along the hole anticlockwise.
    expect(d).toMatch(/A50 50 0 0 0 /u);
  });

  it("closes a donut's slice too thin for its inner arc at the edges' meeting point, outside the hole", () => {
    // 3 px of rim keeps its gaps, which meet 33 px out, past a 20 px hole.
    const f = { ...disc, inner: 20 };
    const span = 0.03;
    const [, , apex] = points(slicePath(f, 1, 1 + span));
    const out = Math.hypot((apex?.x ?? 0) - 120, (apex?.y ?? 0) - 120);
    expect(out).toBeGreaterThan(20);
    expect(out).toBeCloseTo(0.5 / Math.sin(span / 2), 0);
  });

  it("draws a slice of the whole turn as the whole circle, a donut's hole open", () => {
    expect(slicePath(disc, 0, TURN)).toBe("M120 20A100 100 0 1 1 120 220A100 100 0 1 1 120 20Z");
    expect(slicePath({ ...disc, inner: 50 }, 0, TURN)).toBe(
      "M120 20A100 100 0 1 1 120 220A100 100 0 1 1 120 20ZM120 70A50 50 0 1 0 120 170A50 50 0 1 0 120 70Z",
    );
  });

  it("draws a numeric path on a circle too small to hold the 0.5 px gap", () => {
    for (const f of [
      { ...disc, r: 0.4 },
      { ...disc, r: 0.4, inner: 0.2 },
      { ...disc, r: 0 },
    ]) {
      const d = slicePath(f, 0, 6);
      expect(d).not.toContain("NaN");
      expect(sliceRing(f, 0, 6)).not.toContain("NaN");
    }
  });
});

describe("sliceRing", () => {
  it("runs 1 px inside the slice's edges, so its 2 px stroke stays on the slice", () => {
    const from = 0.3;
    const to = 1.6;
    const [start, end, apex] = points(sliceRing(disc, from, to));
    // On a circle 1 px inside the rim, each 1.5 px off its edge: the slice's 0.5 and 1 more.
    for (const [p, a] of [
      [start, from],
      [end, to],
    ] as const) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(99, 1);
      expect(fromEdge(p ?? { x: 0, y: 0 }, a)).toBeCloseTo(1.5, 1);
    }
    expect(fromEdge(apex ?? { x: 0, y: 0 }, from)).toBeCloseTo(1.5, 1);
    expect(fromEdge(apex ?? { x: 0, y: 0 }, to)).toBeCloseTo(1.5, 1);
  });

  it("runs 1 px outside a donut's hole", () => {
    const f = { ...disc, inner: 50 };
    const [, , inEnd, inStart] = points(sliceRing(f, 1, 2));
    for (const [p, a] of [
      [inEnd, 2],
      [inStart, 1],
    ] as const) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(51, 1);
      expect(fromEdge(p ?? { x: 0, y: 0 }, a, f)).toBeCloseTo(1.5, 1);
    }
  });

  it("stops 1.5 px from the centre past a half turn", () => {
    const [, , end, start] = points(sliceRing(disc, 0.2, 4.2));
    for (const p of [end, start]) {
      expect(Math.hypot((p?.x ?? 0) - 120, (p?.y ?? 0) - 120)).toBeCloseTo(1.5, 1);
    }
  });

  it("rings the whole circle 1 px inside it, a donut's hole 1 px outside", () => {
    expect(sliceRing(disc, 0, TURN)).toBe("M120 21A99 99 0 1 1 120 219A99 99 0 1 1 120 21Z");
    expect(sliceRing({ ...disc, inner: 50 }, 0, TURN)).toBe(
      "M120 21A99 99 0 1 1 120 219A99 99 0 1 1 120 21ZM120 69A51 51 0 1 0 120 171A51 51 0 1 0 120 69Z",
    );
  });

  it("rings a slice too thin to hold it on the slice's own edges", () => {
    // 2.5 px of rim: edges 1.5 px in would leave the ring no arc at the 99 px rim.
    const span = 2.5 / 100;
    expect(sliceRing(disc, 1, 1 + span)).toBe(slicePath(disc, 1, 1 + span));
  });
});
