import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { layout, type Metrics } from "./layout.js";
import { chartModel } from "./model.js";
import { nearestStop, noteJoin, placeNote, wrapNote } from "./notes.js";
import { spoken } from "./select.js";
import type { ChartSpec, Mark } from "./spec.js";
import { generatedSummary } from "./summary.js";
import { tableModel } from "./table.js";
import { chartWords } from "./words.js";

// A face 7.5 px a character, digits included.
const width = (t: string) => 7.5 * Array.from(t).length;
const face = measurer(width, 7.5, "en");
const words = chartWords();
const metrics: Metrics = {
  measure: face,
  mono: face,
  lineHeight: 17,
  nameLine: 18,
  rem: 16,
  row: 24,
  axisGroup: 0,
  labelGroup: 0,
  height: 200,
  dpr: 1,
};
const lay = (spec: ChartSpec, w = 600) =>
  layout(chartModel(spec, "en", "UTC"), words, metrics, w, { axis: 0, label: 0 });
// Each text mark's join, in spec order.
const joined = (spec: ChartSpec) => {
  const m = chartModel(spec, "en", "UTC");
  return m.marks.flatMap((t) => (t.kind === "text" ? [noteJoin(m, t) ?? null] : []));
};

describe("wrapNote", () => {
  it("breaks at spaces into lines no wider than the limit", () => {
    expect(wrapNote("Deploy of the new feed reader", 90, width)).toEqual([
      "Deploy of",
      "the new feed",
      "reader",
    ]);
  });

  it("keeps a word wider than the limit on a line of its own", () => {
    expect(wrapNote("a supercalifragilistic b", 60, width)).toEqual([
      "a",
      "supercalifragilistic",
      "b",
    ]);
  });

  it("collapses runs of spaces and trims the ends", () => {
    expect(wrapNote("  one   two  ", 600, width)).toEqual(["one two"]);
  });
});

describe("placeNote", () => {
  it.each([
    ["above", { left: 80, right: 120, top: 76, bottom: 96 }],
    ["below", { left: 80, right: 120, top: 104, bottom: 124 }],
    ["left", { left: 56, right: 96, top: 90, bottom: 110 }],
    ["right", { left: 104, right: 144, top: 90, bottom: 110 }],
  ] as const)("sets the note 4 px off its point %s it", (side, box) => {
    expect(placeNote(100, 100, side, 40, 20, 300, 200)).toEqual({ side, box, fits: true });
  });

  it.each([
    ["above", 10, 100, "below"],
    ["below", 190, 100, "above"],
    ["left", 100, 20, "right"],
    ["right", 100, 280, "left"],
  ] as const)("flips a note %s that would cross that edge", (side, y, x, taken) => {
    const placed = placeNote(x, y, side, 40, 20, 300, 200);
    expect(placed.side).toBe(taken);
    expect(placed.fits).toBe(true);
  });

  it("shifts a note along the edge it would cross, sideways or up and down", () => {
    expect(placeNote(5, 100, "above", 40, 20, 300, 200).box).toEqual({
      left: 0,
      right: 40,
      top: 76,
      bottom: 96,
    });
    expect(placeNote(298, 100, "below", 40, 20, 300, 200).box.right).toBe(300);
    expect(placeNote(100, 195, "right", 40, 20, 300, 200).box).toEqual({
      left: 104,
      right: 144,
      top: 180,
      bottom: 200,
    });
  });

  it("does not fit a note wider than the plot, or taller than its room on both sides", () => {
    expect(placeNote(100, 100, "above", 320, 20, 300, 200).fits).toBe(false);
    expect(placeNote(100, 30, "above", 40, 180, 300, 200).fits).toBe(false);
  });
});

const starts = [0, 900_000, 1_800_000, 2_700_000];
const posts = (more: readonly Mark[], x: ChartSpec["x"] = { type: "time" }): ChartSpec => ({
  x,
  marks: [
    {
      mark: "rect",
      x1: starts,
      x2: starts.map((s) => s + 900_000),
      series: [{ name: "Posts", y: [4, 10, 6, 8] }],
    },
    ...more,
  ],
});

describe("a note in the layout", () => {
  it("sits above its point at the bucket value, wrapped at 12rem, centred", () => {
    const l = lay(
      posts([{ mark: "text", x: 1_350_000, y: 6, text: "Deploy of the new feed reader at last" }]),
    );
    const [note] = l.notes;
    expect(note?.mark).toBe(1);
    expect(note?.point).toEqual({ x: l.frame.xAt(1_350_000), y: l.frame.yAt(6) });
    expect(note?.lines.map((t) => t.text)).toEqual(["Deploy of the new feed", "reader at last"]);
    expect(note?.lines.every((t) => t.anchor === "middle" && t.x === note.point.x)).toBe(true);
    expect(note?.box.bottom).toBe(l.frame.yAt(6) - 4);
    expect(note?.lines[1]?.y).toBe((note?.box.bottom ?? 0) - 17 / 2);
  });

  it("anchors a note on the left at its end and on the right at its start", () => {
    const l = lay(
      posts([
        { mark: "text", x: 1_350_000, y: 5, text: "Left", side: "left" },
        { mark: "text", x: 1_350_000, y: 5, text: "Right", side: "right" },
      ]),
    );
    const x = l.frame.xAt(1_350_000);
    expect(l.notes.map((n) => [n.lines[0]?.anchor, n.lines[0]?.x])).toEqual([
      ["end", x - 4],
      ["start", x + 4],
    ]);
  });

  it("wraps at the plot's width on a plot narrower than 12rem", () => {
    const l = lay(
      posts([{ mark: "text", x: 900_000, y: 4, text: "a b c d e f g h i j k l" }]),
      160,
    );
    expect(l.frame.width).toBeLessThan(192);
    for (const t of l.notes[0]?.lines ?? []) {
      expect(width(t.text)).toBeLessThanOrEqual(l.frame.width);
    }
  });

  it("leaves out a note outside a passed domain, on either axis", () => {
    const spec = (x: number, y: number): ChartSpec => ({
      ...posts([{ mark: "text", x, y, text: "Out" }], { type: "time", domain: [0, 2_700_000] }),
      y: { domain: [0, 12] },
    });
    expect(lay(spec(3_000_000, 4)).notes).toEqual([]);
    expect(lay(spec(900_000, 20)).notes).toEqual([]);
    expect(lay(spec(900_000, 12)).notes).toHaveLength(1);
  });

  it("sits in a timeline's row by its name", () => {
    const l = lay({
      x: { type: "time" },
      marks: [
        {
          mark: "dot",
          rows: [
            { name: "ana", x: [0, 600_000] },
            { name: "bo", x: [300_000] },
          ],
        },
        { mark: "text", x: 300_000, y: "bo", text: "First reply", side: "right" },
      ],
    });
    expect(l.notes[0]?.point).toEqual({ x: l.frame.xAt(300_000), y: l.rows[1]?.y });
  });

  it("is flipped below a point at the plot's top", () => {
    const l = lay({
      ...posts([{ mark: "text", x: 1_350_000, y: 10, text: "Peak" }]),
      y: { domain: [0, 10] },
    });
    expect(l.notes[0]?.box.top).toBe(4);
    expect(l.notes[0]?.fits).toBe(true);
  });
});

describe("nearestStop", () => {
  const xs = [10, 20, 40];

  it.each([
    [14, 0],
    [15, 0],
    [16, 1],
    [30, 1],
    [31, 2],
    [40, 2],
  ])("joins x %d to stop %d, the earlier on a tie", (x, i) => {
    expect(nearestStop(xs, 0, 3, x)).toBe(i);
  });

  it.each([
    [5, 0],
    [4.9, undefined],
    [50, 2],
    [50.1, undefined],
  ])("joins x %d past an end only within half the gap to its neighbour", (x, i) => {
    expect(nearestStop(xs, 0, 3, x)).toBe(i);
  });

  it("joins a lone stop at any x, and none in an empty span", () => {
    expect(nearestStop(xs, 1, 2, 1_000)).toBe(1);
    expect(nearestStop(xs, 1, 1, 20)).toBeUndefined();
  });

  it("reads only the span it is given", () => {
    expect(nearestStop(xs, 1, 3, 10)).toBe(1);
    expect(nearestStop(xs, 1, 3, 9)).toBeUndefined();
  });
});

describe("the stop a note joins", () => {
  const at = (x: number): Mark => ({ mark: "text", x, y: 1, text: "n" });

  it("joins the bucket whose interval holds its x, none in a gap, the last at the domain's end", () => {
    const gappy: ChartSpec = {
      x: { type: "time", domain: [0, 3_600_000] },
      marks: [
        {
          mark: "rect",
          x1: [0, 900_000, 2_700_000],
          x2: [900_000, 1_800_000, 3_600_000],
          series: [{ name: "Posts", y: [1, 2, 3] }],
        },
        at(0),
        at(899_999),
        at(900_000),
        at(2_000_000),
        at(3_600_000),
      ],
    };
    expect(joined(gappy)).toEqual([
      { kind: "stop", i: 0 },
      { kind: "stop", i: 0 },
      { kind: "stop", i: 1 },
      null,
      { kind: "stop", i: 2 },
    ]);
  });

  it("joins a line's or an area's nearest sample, the earlier on a tie, within half a gap past the ends", () => {
    for (const mark of ["line", "area"] as const) {
      const spec: ChartSpec = {
        x: { type: "linear", domain: [0, 60] },
        marks: [
          { mark, x: [10, 20, 40], series: [{ name: "a", y: [1, 2, 3] }] },
          at(15),
          at(16),
          at(5),
          at(4),
          at(50),
          at(51),
        ],
      };
      expect(joined(spec)).toEqual([
        { kind: "stop", i: 0 },
        { kind: "stop", i: 1 },
        { kind: "stop", i: 0 },
        null,
        { kind: "stop", i: 2 },
        null,
      ]);
    }
  });

  it("joins a timeline post in its row by the same rule, or a silent row's selection", () => {
    const spec: ChartSpec = {
      x: { type: "time", domain: [0, 100] },
      marks: [
        {
          mark: "dot",
          rows: [
            { name: "ana", x: [10, 20, 40] },
            { name: "bo", x: [] },
          ],
        },
        { mark: "text", x: 15, y: "ana", text: "tie" },
        { mark: "text", x: 16, y: "ana", text: "after" },
        { mark: "text", x: 51, y: "ana", text: "past" },
        { mark: "text", x: 50, y: "bo", text: "silent" },
      ],
    };
    expect(joined(spec)).toEqual([
      { kind: "post", row: 0, i: 0 },
      { kind: "post", row: 0, i: 1 },
      null,
      { kind: "row", row: 1 },
    ]);
  });

  it("joins nothing outside a passed domain on either axis", () => {
    const spec: ChartSpec = {
      x: { type: "linear", domain: [0, 50] },
      y: { domain: [0, 10] },
      marks: [
        { mark: "line", x: [10, 20, 40], series: [{ name: "a", y: [1, 2, 3] }] },
        { mark: "text", x: 60, y: 1, text: "right" },
        { mark: "text", x: 20, y: 11, text: "high" },
        { mark: "text", x: 20, y: 10, text: "edge" },
      ],
    };
    expect(joined(spec)).toEqual([null, null, { kind: "stop", i: 1 }]);
  });
});

describe("a note on a step curve", () => {
  // Stops at samples 0, 3 and 4: the first, a change and the last.
  const stepped = (mark: "line" | "area", x: number): ChartSpec => ({
    x: { type: "linear", domain: [0, 40] },
    marks: [
      { mark, curve: "step", x: [0, 10, 20, 30, 40], series: [{ name: "a", y: [1, 1, 1, 2, 2] }] },
      { mark: "text", x, y: 1, text: "n" },
    ],
  });

  it.each([
    [20, 0],
    [9, 0],
    [29, 3],
    [40, 4],
  ])("joins x %d to stop %d, the stop holding its nearest sample", (x, i) => {
    for (const mark of ["line", "area"] as const) {
      expect(joined(stepped(mark, x))).toEqual([{ kind: "stop", i }]);
    }
  });
});

describe("a note off an inferred y domain", () => {
  const spec = (y: number): ChartSpec => ({
    x: { type: "linear", domain: [0, 50] },
    marks: [
      { mark: "line", x: [10, 20, 40], series: [{ name: "a", y: [1, 2, 2.6] }] },
      { mark: "text", x: 20, y, text: "Spike" },
    ],
  });

  it("is not drawn and joins no reading, yet is in the summary and the table", () => {
    const m = chartModel(spec(30), "en", "UTC");
    expect(lay(spec(30)).notes).toEqual([]);
    expect(joined(spec(30))).toEqual([null]);
    expect(generatedSummary(m, words)).toContain("20: Spike.");
    expect(tableModel(m, words).after).toContain("20: Spike.");
  });

  it("is not drawn in the room the axis rounds its top up to, as it joins nothing there", () => {
    const l = lay(spec(2.8));
    expect(l.frame.yAt(2.8)).toBeGreaterThanOrEqual(0);
    expect(l.notes).toEqual([]);
    expect(joined(spec(2.8))).toEqual([null]);
  });

  it("is drawn and joins its stop inside the data's extent", () => {
    expect(lay(spec(2)).notes).toHaveLength(1);
    expect(joined(spec(2))).toEqual([{ kind: "stop", i: 1 }]);
  });
});

describe("numbered markers", () => {
  const two = (a: number, b: number) =>
    posts([
      { mark: "text", x: a, y: 4, text: "Deploy" },
      { mark: "text", x: b, y: 4, text: "Rollback" },
    ]);

  it("leaves notes on the plot from 30rem up when none overlap and each fits", () => {
    const l = lay(two(450_000, 2_250_000), 480);
    expect(l.numbered).toBe(false);
    expect(l.notes.map((n) => n.number)).toEqual([1, 2]);
  });

  it("numbers every note under 30rem", () => {
    expect(lay(two(450_000, 2_250_000), 479).numbered).toBe(true);
  });

  it("numbers every note when two boxes overlap", () => {
    expect(lay(two(1_350_000, 1_400_000)).numbered).toBe(true);
  });

  it("numbers every note when one cannot fit inside the plot", () => {
    const long = "w".repeat(90);
    const l = lay(posts([{ mark: "text", x: 1_350_000, y: 4, text: long }]));
    expect(l.notes[0]?.fits).toBe(false);
    expect(l.numbered).toBe(true);
  });

  it("numbers the drawn notes in spec order, skipping one left out", () => {
    const l = lay(
      posts(
        [
          { mark: "text", x: 3_000_000, y: 4, text: "Out" },
          { mark: "text", x: 450_000, y: 4, text: "In" },
        ],
        { type: "time", domain: [0, 2_700_000] },
      ),
      320,
    );
    expect(l.notes.map((n) => [n.mark, n.number])).toEqual([[2, 1]]);
    expect(l.numbered).toBe(true);
  });

  it("is off with no notes", () => {
    expect(lay(posts([]), 320).numbered).toBe(false);
  });
});

describe("a note on bar and point rows", () => {
  const best: Mark = { mark: "text", y: "Facebook", text: "Best", side: "right" };
  const bars = (
    more: Partial<Extract<Mark, { mark: "bar" }>> = {},
    x: ChartSpec["x"] = {},
    note: Mark = best,
  ): ChartSpec => ({
    x,
    marks: [
      {
        mark: "bar",
        y: ["Instagram", "Facebook"],
        series: [
          { name: "Daily", x: [34, 20] },
          { name: "Weekly", x: [8, 43] },
        ],
        ...more,
      },
      note,
    ],
  });
  // "43" is 15 px, 4 px past its bar; the note's point stands 4 px past it.
  const past = 4 + 15 + 4;

  it("sits along its row at its x and joins the row", () => {
    const spec = bars({}, {}, { mark: "text", x: 30, y: "Facebook", text: "Best" });
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.frame.xAt(30), y: l.rows[1]?.y });
    expect(joined(spec)).toEqual([{ kind: "row", row: 1 }]);
  });

  it("sits along a point row inside the axis's inset", () => {
    const spec: ChartSpec = {
      x: {},
      marks: [
        { mark: "point", y: ["Instagram", "Facebook"], series: [{ name: "Age", x: [40, 60] }] },
        { mark: "text", x: 50, y: "Facebook", text: "Mid" },
      ],
    };
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.frame.xAt(50), y: l.rows[1]?.y });
    expect(joined(spec)).toEqual([{ kind: "row", row: 1 }]);
  });

  it("is left out of the plot and the readings off a passed domain, still in the summary", () => {
    const spec: ChartSpec = {
      x: { domain: [30, 70] },
      marks: [
        { mark: "point", y: ["Instagram", "Facebook"], series: [{ name: "Age", x: [40, 60] }] },
        { mark: "text", x: 80, y: "Facebook", text: "Far" },
      ],
    };
    expect(lay(spec).notes).toEqual([]);
    expect(joined(spec)).toEqual([null]);
    expect(generatedSummary(chartModel(spec, "en", "UTC"), words)).toContain("Facebook: Far.");
  });

  it("points past the last panel's bar and its label under a split", () => {
    const l = lay(bars({ arrange: "split" }));
    const last = l.frame.panels?.[1];
    expect(l.notes[0]?.point).toEqual({ x: (last?.at(43) ?? 0) + past, y: l.rows[1]?.y });
    // Every panel keeps a marker's 10 px past the widest bar's point, so it
    // stands on the plot; with no room right of it the note turns left.
    expect((l.notes[0]?.point.x ?? 0) + 10).toBeCloseTo(l.frame.width);
    expect((l.frame.panels?.[0]?.right ?? 0) - (l.frame.panels?.[0]?.at(43) ?? 0)).toBeCloseTo(
      past + 10,
    );
    expect(l.notes[0]?.box.right).toBeCloseTo((l.notes[0]?.point.x ?? 0) - 4);
  });

  it("leaves the plot's ends alone without a note at a row's end", () => {
    const l = lay(bars({ arrange: "split" }, {}, { mark: "rule", x: 10, label: "Aim" }));
    const last = l.frame.panels?.[1];
    expect((last?.at(43) ?? 0) + 4 + 15).toBeCloseTo(last?.right ?? 0);
  });

  it("points past the last panel's bar alone with labels off, and leftward on a reversed x", () => {
    const off = lay(bars({ arrange: "split", labels: false }));
    expect(off.notes[0]?.point.x).toBe((off.frame.panels?.[1]?.at(43) ?? 0) + 4);
    const reversed = lay(bars({ arrange: "split" }, { reverse: true }));
    const last = reversed.frame.panels?.[1];
    expect(last?.leftward).toBe(true);
    expect(reversed.notes[0]?.point.x).toBe((last?.at(43) ?? 0) - past);
  });

  it("points past the farthest bar of the folded row under 30rem", () => {
    const l = lay(bars({ arrange: "split" }), 479);
    expect(l.frame.panels).toBeUndefined();
    // Numbered under 30rem, the marker still stands at the row's end.
    expect(l.numbered).toBe(true);
    expect(l.notes[0]?.point.x).toBeCloseTo(l.frame.xAt(43) + past);
  });

  it("points past the right side's bar under a mirror, whichever series takes it", () => {
    const l = lay(bars({ arrange: "mirror" }));
    // Facebook's right side is Weekly's 43.
    expect(l.notes[0]?.point.x).toBe((l.frame.panels?.[1]?.at(43) ?? 0) + past);
    const reversed = lay(bars({ arrange: "mirror" }, { reverse: true }));
    // "20" is Daily's label, which takes the right side on a reversed x.
    const right = reversed.frame.panels?.[0];
    expect(right?.leftward).toBe(false);
    expect(reversed.notes[0]?.point.x).toBe((right?.at(20) ?? 0) + past);
  });

  it("points past a diverging row's right end, on either x direction", () => {
    const more = { arrange: "diverge", left: 1 } as const;
    const l = lay(bars(more));
    // Daily's 20 lies left of 0, Weekly's 43 right of it.
    expect(l.notes[0]?.point.x).toBe(l.frame.xAt(43) + 4);
    const reversed = lay(bars(more, { reverse: true }));
    expect(reversed.notes[0]?.point.x).toBe(reversed.frame.xAt(-20) + 4);
    // The axis ends a marker's room short of the plot's right edge.
    const ends = l.xAxis.ticks.map((t) => t.at);
    expect(Math.max(...ends)).toBeLessThanOrEqual(l.frame.width - 14 + 1e-6);
  });

  it("joins its row's reading, whole or one part, and writes the row's name as its at", () => {
    const spec = bars({ arrange: "split" });
    const m = chartModel(spec, "en", "UTC");
    expect(joined(spec)).toEqual([{ kind: "row", row: 1 }]);
    const row = (part: number | undefined) => ({ kind: "bar", row: 1, part }) as const;
    expect(spoken(m, row(undefined), words, false)).toBe(
      "Facebook: Daily 20, Weekly 43. Note: Best.",
    );
    expect(spoken(m, row(1), words, true)).toBe("Facebook: Weekly 43. Note: Best.");
    expect(spoken(m, { kind: "bar", row: 0, part: undefined }, words, false)).toBe(
      "Instagram: Daily 34, Weekly 8.",
    );
    expect(generatedSummary(m, words)).toMatch(/ Facebook: Best\.$/u);
    expect(tableModel(m, words).after).toBe("Facebook: Best.");
  });
});
