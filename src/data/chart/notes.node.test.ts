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
const posts = (
  more: readonly Mark[],
  x: NonNullable<ChartSpec["x"]> = { type: "time" },
): ChartSpec => ({
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
    x: NonNullable<ChartSpec["x"]> = {},
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

  it("points past a bar cut at a passed domain's end, in its panel or folded", () => {
    const split = bars({ arrange: "split", labels: false }, { domain: [0, 40] });
    // Facebook's Weekly 43 is cut at 40.
    const l = lay(split);
    const last = l.frame.panels?.[1];
    expect(l.notes[0]?.point.x).toBeCloseTo((last?.at(40) ?? 0) + 4);
    expect(l.notes[0]?.point.x).toBeLessThanOrEqual(last?.right ?? Number.NaN);
    const folded = lay(split, 479);
    expect(folded.notes[0]?.point.x).toBeCloseTo(folded.frame.xAt(40) + 4);
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

describe("a note on a slope", () => {
  const slope = (...notes: Mark[]): ChartSpec => ({
    y: { domain: [0, 60] },
    marks: [
      {
        mark: "slope",
        x: ["2005", "2015"],
        series: [
          { name: "Cats", y: [50, 34] },
          { name: "Dogs", y: [40, 31] },
        ],
      },
      ...notes,
    ],
  });

  it("sits at its column's edge and its y, and joins that column", () => {
    const spec = slope(
      { mark: "text", x: "2005", y: 50, text: "Peak" },
      { mark: "text", x: "2015", y: 31, text: "Low" },
    );
    const l = lay(spec);
    expect(l.notes.map((n) => n.point)).toEqual([
      { x: 0, y: l.frame.yAt(50) },
      { x: l.frame.width, y: l.frame.yAt(31) },
    ]);
    expect(joined(spec)).toEqual([
      { kind: "stop", i: 0 },
      { kind: "stop", i: 1 },
    ]);
  });

  it("is left out of the plot and the readings off the y domain, still in the summary and table", () => {
    const spec = slope({ mark: "text", x: "2015", y: 80, text: "Goal" });
    expect(lay(spec).notes).toEqual([]);
    expect(joined(spec)).toEqual([null]);
    const m = chartModel(spec, "en", "UTC");
    expect(spoken(m, { kind: "slope", i: 1, part: undefined }, words, false)).toBe(
      "2015: Cats 34, Dogs 31.",
    );
    expect(generatedSummary(m, words)).toContain("2015: Goal.");
    expect(tableModel(m, words).after).toBe("2015: Goal.");
  });
});

describe("a note on a scatter plot", () => {
  const world = (...notes: Mark[]): ChartSpec => ({
    x: { label: "GDP per capita", domain: [0, 150_000] },
    y: { label: "Life expectancy" },
    marks: [
      {
        mark: "scatter",
        series: [
          {
            name: "Europe",
            names: ["Albania", "Monaco", "Andorra"],
            x: [18_920, 140_000, 140_000],
            y: [79.8, 85.9, 85.9],
          },
          { name: "Asia", names: ["Macau"], x: [140_000], y: [85.9] },
        ],
      },
      ...notes,
    ],
  });

  it("joins the dot at its values, the one drawn on top among coincident dots", () => {
    expect(
      joined(
        world(
          { mark: "text", x: 18_920, y: 79.8, text: "Poorest" },
          { mark: "text", x: 140_000, y: 85.9, text: "Richest" },
        ),
      ),
    ).toEqual([
      { kind: "dot", series: 0, i: 0 },
      { kind: "dot", series: 1, i: 0 },
    ]);
  });

  it("joins the later dot of one series among coincident ones", () => {
    const spec: ChartSpec = {
      ...world(),
      marks: [
        {
          mark: "scatter",
          series: [{ name: "a", names: ["a1", "a2", "a3"], x: [1, 1, 2], y: [1, 1, 2] }],
        },
        { mark: "text", x: 1, y: 1, text: "Two here" },
      ],
    };
    expect(joined(spec)).toEqual([{ kind: "dot", series: 0, i: 1 }]);
  });

  it("joins no dot when none has its values, nor one off the domain", () => {
    expect(
      joined(
        world(
          { mark: "text", x: 18_920, y: 80, text: "Near Albania" },
          { mark: "text", x: 200_000, y: 85.9, text: "Off" },
        ),
      ),
    ).toEqual([null, null]);
  });

  it("is placed by values, so its summary and table are written before any layout", () => {
    const m = chartModel(
      world(
        { mark: "text", x: 140_000, y: 85.9, text: "Richest" },
        { mark: "text", x: 50_000, y: 70, text: "Gap" },
      ),
      "en",
      "UTC",
    );
    const after = "Macau: Richest. GDP per capita 50,000, Life expectancy 70: Gap.";
    expect(generatedSummary(m, words).endsWith(` ${after}`)).toBe(true);
    expect(tableModel(m, words).after).toBe(after);
    expect(spoken(m, { kind: "scatter", series: 1, i: 0 }, words, false)).toBe(
      "Macau: Asia, GDP per capita 140,000, Life expectancy 85.9. Note: Richest.",
    );
    expect(spoken(m, { kind: "scatter", series: 0, i: 1 }, words, false)).toBe(
      "Monaco: Europe, GDP per capita 140,000, Life expectancy 85.9.",
    );
  });
});

describe("a note on a cell chart", () => {
  const grid = (...notes: Mark[]): ChartSpec => ({
    marks: [
      {
        mark: "cell",
        x: ["2 PM", "3 PM", "4 PM"],
        y: ["Monday", "Tuesday"],
        values: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      },
      ...notes,
    ],
  });
  const bins = (...notes: Mark[]): ChartSpec => ({
    marks: [
      {
        mark: "cell",
        x: { edges: [0, 10, 20] },
        y: { edges: [100, 200, 300] },
        values: [
          [1, 2],
          [3, 4],
        ],
      },
      ...notes,
    ],
  });

  it("joins the cell its column's and row's names give", () => {
    expect(joined(grid({ mark: "text", x: "3 PM", y: "Tuesday", text: "Release" }))).toEqual([
      { kind: "cell", row: 1, column: 1 },
    ]);
  });

  it("joins the bin holding each value: a bin from its low edge, the last to its high edge", () => {
    expect(
      joined(
        bins(
          { mark: "text", x: 10, y: 100, text: "a" },
          { mark: "text", x: 20, y: 300, text: "b" },
          { mark: "text", x: 9.9, y: 199, text: "c" },
        ),
      ),
    ).toEqual([
      { kind: "cell", row: 0, column: 1 },
      { kind: "cell", row: 1, column: 1 },
      { kind: "cell", row: 0, column: 0 },
    ]);
  });

  it("leaves a note beyond the edges out of the drawing and of every reading", () => {
    const spec = bins({ mark: "text", x: 25, y: 150, text: "far" });
    expect(joined(spec)).toEqual([null]);
    expect(lay(spec).notes).toEqual([]);
  });

  it("sits mid-cell on a band x and joins that cell's reading", () => {
    const spec = grid({ mark: "text", x: "3 PM", y: "Tuesday", text: "Release" });
    const l = lay(spec);
    const xs = l.cells?.xs ?? [];
    expect(l.notes[0]?.point.x).toBeCloseTo(((xs[1] ?? 0) + (xs[2] ?? 0)) / 2, 6);
    const m = chartModel(spec, "en", "UTC");
    expect(spoken(m, { kind: "cell", row: 1, column: 1 }, words, false)).toBe(
      "Tuesday, 3 PM: 5. Note: Release.",
    );
    expect(spoken(m, { kind: "cell", row: 1, column: 0 }, words, false)).toBe("Tuesday, 2 PM: 4.");
    expect(tableModel(m, words).after).toBe("Tuesday, 3 PM: Release.");
  });

  it("refuses a column name the chart lacks and a number on a band x", () => {
    expect(() =>
      chartModel(grid({ mark: "text", x: "5 PM", y: "Monday", text: "a" }), "en", "UTC"),
    ).toThrow(new RangeError('renderChart: marks[1].x names no column: "5 PM"'));
    expect(() =>
      chartModel(grid({ mark: "text", x: 1, y: "Monday", text: "a" }), "en", "UTC"),
    ).toThrow(new TypeError("renderChart: marks[1].x must name one of the cell chart's columns"));
    expect(() => chartModel(grid({ mark: "text", y: "Monday", text: "a" }), "en", "UTC")).toThrow(
      new TypeError(
        "renderChart: marks[1].x is missing; a note on a cell chart names one of its columns",
      ),
    );
  });
});

describe("a note on a calendar", () => {
  // From midnight of Saturday 28 March 2026 in Paris, the day before the
  // clocks go forward: 28 March is 24 hours long, 29 March 23.
  const TZ = "Europe/Paris";
  const START = Date.UTC(2026, 2, 27, 23);
  const calendar = (...notes: Mark[]): ChartSpec => ({
    marks: [{ mark: "cell", days: { start: START, values: [1, 2, 3, 4] }, weekStart: 1 }, ...notes],
  });
  const joins = (spec: ChartSpec) => {
    const m = chartModel(spec, "en", TZ);
    return m.marks.flatMap((t) => (t.kind === "text" ? [noteJoin(m, t) ?? null] : []));
  };

  it("joins the day holding its instant on the chart's wall clock, across a DST change", () => {
    // 11:30 PM on 29 March and 12:30 AM on 30 March in Paris, an hour apart.
    expect(
      joins(
        calendar(
          { mark: "text", x: Date.UTC(2026, 2, 29, 21, 30), text: "Late" },
          { mark: "text", x: Date.UTC(2026, 2, 29, 22, 30), text: "Early" },
        ),
      ),
    ).toEqual([
      { kind: "day", i: 1 },
      { kind: "day", i: 2 },
    ]);
  });

  it("joins the day's reading and writes the day's date in the summary and after the table", () => {
    const spec = calendar({ mark: "text", x: Date.UTC(2026, 2, 28, 12), text: "Spring" });
    const m = chartModel(spec, "en", TZ);
    expect(spoken(m, { kind: "day", i: 0 }, words, false)).toBe(
      "Saturday, March 28, 2026: 1. Note: Spring.",
    );
    expect(generatedSummary(m, words)).toContain("Saturday, March 28, 2026: Spring.");
    expect(tableModel(m, words).after).toBe("Saturday, March 28, 2026: Spring.");
  });

  it("leaves an instant outside the days out of the drawing, and keeps it in the summary", () => {
    const before = Date.UTC(2026, 2, 27, 22);
    const spec = calendar({ mark: "text", x: before, text: "Before" });
    const m = chartModel(spec, "en", TZ);
    expect(joins(spec)).toEqual([null]);
    expect(layout(m, words, metrics, 600, { axis: 0, label: 0 }).notes).toEqual([]);
    expect(generatedSummary(m, words)).toContain("Friday, March 27, 2026: Before.");
  });

  it("draws a note on its day, at the day's centre", () => {
    const spec = calendar({ mark: "text", x: Date.UTC(2026, 2, 30, 9), text: "Monday" });
    const l = layout(chartModel(spec, "en", TZ), words, metrics, 600, { axis: 0, label: 0 });
    const g = l.days;
    // Monday 30 March starts the second week column; its fill's box is snapped to whole px.
    const p = l.notes[0]?.point;
    expect(Math.abs((p?.x ?? 0) - 1.5 * (g?.column ?? 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((p?.y ?? 0) - ((g?.tops[0] ?? 0) + 12))).toBeLessThanOrEqual(0.5);
  });
});

describe("a note on a box plot", () => {
  const boxes = (note: Mark): ChartSpec => ({
    marks: [
      {
        mark: "box",
        y: ["search", "export"],
        series: [
          { name: "Before", low: [1, 3], q1: [2, 4], median: [3, 5], q3: [4, 6], high: [5, 9] },
          { name: "After", low: [1, 2], q1: [2, 3], median: [2, 4], q3: [3, 5], high: [4, 6] },
        ],
      },
      note,
    ],
  });
  const release: Mark = { mark: "text", x: 6, y: "export", text: "Release 2.1" };

  it("sits along its row at its x and joins the row", () => {
    const l = lay(boxes(release));
    expect(l.notes[0]?.point).toEqual({ x: l.frame.xAt(6), y: l.rows[1]?.y });
    expect(joined(boxes(release))).toEqual([{ kind: "row", row: 1 }]);
  });

  it("joins the row's reading whole and one series' box, and is said at the row's name", () => {
    const m = chartModel(boxes(release), "en", "UTC");
    expect(spoken(m, { kind: "box", row: 1, part: undefined }, words, false)).toMatch(
      /; After median 4, .*\. Note: Release 2\.1\.$/u,
    );
    expect(spoken(m, { kind: "box", row: 1, part: 1 }, words, true)).toBe(
      "export: After median 4, middle half 3 to 5, whiskers 2 to 6. Note: Release 2.1.",
    );
    expect(spoken(m, { kind: "box", row: 0, part: undefined }, words, false)).not.toMatch(/Note/u);
    expect(generatedSummary(m, words)).toMatch(/ export: Release 2\.1\.$/u);
    expect(tableModel(m, words).after).toBe("export: Release 2.1.");
  });
});
