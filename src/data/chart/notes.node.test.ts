import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { layout, type Metrics } from "./layout.js";
import { chartModel } from "./model.js";
import { nearestStop, noteJoin, placeNote, wrapNote } from "./notes.js";
import { spoken } from "./select.js";
import type { ChartSpec } from "./spec.js";
import { generatedSummary } from "./summary.js";
import { tableModel } from "./table.js";
import {
  binsFrame,
  boxes,
  calendar as calendarFrame,
  categories,
  events,
  grid as gridFrame,
  points,
  seriesFrame,
} from "./test-helpers/frames.js";
import { chartWords } from "./words.js";

// A face 7.5 px a character, digits included.
const width = (t: string) => 7.5 * Array.from(t).length;
const face = measurer(width, 7.5, "en");
const words = chartWords();
const metrics: Metrics = {
  measure: face,
  mono: face,
  hole: face,
  holeLine: 21,
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
// Each text mark's join, in the frame's note order.
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

interface Note {
  readonly at: number;
  readonly text: string;
  readonly side?: "above" | "below" | "left" | "right";
}

// `spec` with frame notes keyed by their text, and the sides they name.
const noted = (spec: ChartSpec, notes: readonly Note[]): ChartSpec =>
  ({
    ...spec,
    data: {
      ...(spec.data as NonNullable<ChartSpec["data"]>),
      notes: notes.map((n) => ({ key: n.text, at: n.at })),
    },
    notes: notes.flatMap((n) => (n.side === undefined ? [] : [{ key: n.text, side: n.side }])),
  }) as ChartSpec;

const starts = [0, 900_000, 1_800_000, 2_700_000];
const posts = (notes: readonly Note[], x: NonNullable<ChartSpec["x"]> = {}): ChartSpec =>
  noted(
    {
      data: binsFrame(
        starts,
        starts.map((s) => s + 900_000),
        [[4, 10, 6, 8]],
      ),
      mark: { mark: "rect" },
      x,
    },
    notes,
  );

describe("a note in the layout", () => {
  it("sits at its x on the plot's top edge, wrapped at 12rem, centred, set below it with no room above", () => {
    const l = lay(posts([{ at: 1_350_000, text: "Deploy of the new feed reader at last" }]));
    const [note] = l.notes;
    expect(note?.mark).toBe(1);
    expect(note?.point).toEqual({ x: l.projection.xAt(1_350_000), y: 0 });
    expect(note?.lines.map((t) => t.text)).toEqual(["Deploy of the new feed", "reader at last"]);
    expect(note?.lines.every((t) => t.anchor === "middle" && t.x === note.point.x)).toBe(true);
    expect(note?.box.top).toBe(4);
    expect(note?.lines[0]?.y).toBe(4 + 17 / 2);
  });

  it("anchors a note on the left at its end and on the right at its start", () => {
    const l = lay(
      posts([
        { at: 1_350_000, text: "Left", side: "left" },
        { at: 1_350_000, text: "Right", side: "right" },
      ]),
    );
    const x = l.projection.xAt(1_350_000);
    expect(l.notes.map((n) => [n.lines[0]?.anchor, n.lines[0]?.x])).toEqual([
      ["end", x - 4],
      ["start", x + 4],
    ]);
  });

  it("wraps at the plot's width on a plot narrower than 12rem", () => {
    const l = lay(posts([{ at: 900_000, text: "a b c d e f g h i j k l" }]), 160);
    expect(l.projection.width).toBeLessThan(192);
    for (const t of l.notes[0]?.lines ?? []) {
      expect(width(t.text)).toBeLessThanOrEqual(l.projection.width);
    }
  });

  it("leaves out a note outside a passed x domain", () => {
    const spec = (at: number) => posts([{ at, text: "Out" }], { domain: [0, 2_700_000] });
    expect(lay(spec(3_000_000)).notes).toEqual([]);
    expect(lay(spec(-1)).notes).toEqual([]);
    expect(lay(spec(2_700_000)).notes).toHaveLength(1);
  });

  it("sits at its x on a timeline's top edge and joins no post or row, which an x alone does not name", () => {
    const spec = noted(
      { data: events({ ana: [0, 600_000], bo: [300_000] }), mark: { mark: "dot" } },
      [{ at: 300_000, text: "First reply", side: "right" }],
    );
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.projection.xAt(300_000), y: 0 });
    expect(joined(spec)).toEqual([null]);
  });

  it("keeps a note on the side it names, shifted down along the top edge", () => {
    const l = lay(posts([{ at: 1_350_000, text: "Peak", side: "right" }]));
    expect(l.notes[0]?.box).toMatchObject({ left: l.projection.xAt(1_350_000) + 4, top: 0 });
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

// Notes "n0", "n1", ... at `xs`.
const at = (...xs: number[]): Note[] => xs.map((x, i) => ({ at: x, text: `n${String(i)}` }));

describe("the stop a note joins", () => {
  it("joins the bucket whose interval holds its x, none in a gap, the last at the domain's end", () => {
    const gappy = noted(
      {
        data: binsFrame([0, 900_000, 2_700_000], [900_000, 1_800_000, 3_600_000], [[1, 2, 3]]),
        mark: { mark: "rect" },
        x: { domain: [0, 3_600_000] },
      },
      at(0, 899_999, 900_000, 2_000_000, 3_600_000),
    );
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
      const spec = noted(
        {
          data: seriesFrame([10, 20, 40], [[1, 2, 3]]),
          mark: { mark },
          x: { type: "linear", domain: [0, 60] },
        },
        at(15, 16, 5, 4, 50, 51),
      );
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

  it("joins nothing outside a passed x domain", () => {
    const spec = noted(
      {
        data: seriesFrame([10, 20, 40], [[1, 2, 3]]),
        mark: { mark: "line" },
        x: { type: "linear", domain: [0, 50] },
      },
      at(60, 20),
    );
    expect(joined(spec)).toEqual([null, { kind: "stop", i: 1 }]);
  });
});

describe("a note on a step curve", () => {
  // Stops at samples 0, 3 and 4: the first, a change and the last.
  const stepped = (mark: "line" | "area", x: number): ChartSpec =>
    noted(
      {
        data: seriesFrame([0, 10, 20, 30, 40], [[1, 1, 1, 2, 2]]),
        mark: { mark, curve: "step" },
        x: { type: "linear", domain: [0, 40] },
      },
      at(x),
    );

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

describe("a note off an inferred x domain", () => {
  const spec = (x: number): ChartSpec =>
    noted({ data: seriesFrame([10, 20, 40], [[1, 2, 2.6]]), mark: { mark: "line" } }, [
      { at: x, text: "Spike" },
    ]);

  it("is not drawn and joins no reading, yet is in the summary and the table", () => {
    const m = chartModel(spec(60), "en", "UTC");
    expect(lay(spec(60)).notes).toEqual([]);
    expect(joined(spec(60))).toEqual([null]);
    expect(generatedSummary(m, words)).toContain("60: Spike.");
    expect(tableModel(m, words).after).toContain("60: Spike.");
  });

  it("is drawn and joins its stop inside the data's extent", () => {
    expect(lay(spec(20)).notes).toHaveLength(1);
    expect(joined(spec(20))).toEqual([{ kind: "stop", i: 1 }]);
  });
});

describe("numbered markers", () => {
  const two = (a: number, b: number) =>
    posts([
      { at: a, text: "Deploy" },
      { at: b, text: "Rollback" },
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
    const l = lay(posts([{ at: 1_350_000, text: long }]));
    expect(l.notes[0]?.fits).toBe(false);
    expect(l.numbered).toBe(true);
  });

  it("numbers the drawn notes in the frame's order, skipping one left out", () => {
    const l = lay(
      posts(
        [
          { at: 3_000_000, text: "Out" },
          { at: 450_000, text: "In" },
        ],
        { domain: [0, 2_700_000] },
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
  const best: Note = { at: 30, text: "Best", side: "right" };
  const bars = (
    mark: object = {},
    x: NonNullable<ChartSpec["x"]> = {},
    notes: readonly Note[] = [best],
  ): ChartSpec =>
    noted(
      {
        data: categories(
          ["Instagram", "Facebook"],
          [
            [34, 20],
            [8, 43],
          ],
        ),
        mark: {
          mark: "bar",
          keys: [
            { key: "a", name: "Daily" },
            { key: "b", name: "Weekly" },
          ],
          ...mark,
        },
        x,
      },
      notes,
    );
  const ages = (x: NonNullable<ChartSpec["x"]>, note: Note): ChartSpec =>
    noted({ data: categories(["Instagram", "Facebook"], [[40, 60]]), mark: { mark: "point" }, x }, [
      note,
    ]);

  it("sits at its x on the top edge and joins no row, which an x alone does not name", () => {
    const spec = bars();
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.projection.xAt(30), y: 0 });
    expect(joined(spec)).toEqual([null]);
  });

  it("sits at its x on a point chart's top edge, inside the axis's inset", () => {
    const spec = ages({}, { at: 50, text: "Mid" });
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.projection.xAt(50), y: 0 });
    expect(l.projection.xAt(40)).toBeGreaterThan(0);
    expect(joined(spec)).toEqual([null]);
  });

  it("is left out of the plot and the readings off a passed domain, still in the summary", () => {
    const spec = ages({ domain: [30, 70] }, { at: 80, text: "Far" });
    expect(lay(spec).notes).toEqual([]);
    expect(joined(spec)).toEqual([null]);
    expect(generatedSummary(chartModel(spec, "en", "UTC"), words)).toContain("80: Far.");
  });

  it.each([
    ["a split", { arrange: "split" }],
    ["a mirror", { arrange: "mirror" }],
    ["a diverging stack", { arrange: "diverge", left: 1 }],
  ])("has no x place under %s, so the summary and the table give it", (_, mark) => {
    const spec = bars(mark);
    const m = chartModel(spec, "en", "UTC");
    expect(m.marks.map((k) => k.kind)).toEqual(["bar"]);
    expect(m.unplaced.notes).toEqual([{ text: "Best", at: 30 }]);
    expect(lay(spec).notes).toEqual([]);
    expect(generatedSummary(m, words)).toMatch(/ 30: Best\.$/u);
    expect(tableModel(m, words).after).toBe("30: Best.");
    expect(spoken(m, { kind: "bar", row: 1, part: undefined }, words, false)).not.toMatch(/Note/u);
  });

  it("leaves a split's last panel no room past its bar's label", () => {
    const l = lay(bars({ arrange: "split" }));
    const last = l.projection.panels?.[1];
    expect((last?.at(43) ?? 0) + 4 + 15).toBeCloseTo(last?.right ?? 0);
  });

  it("ends a diverging stack's axis at the plot's right edge", () => {
    const l = lay(bars({ arrange: "diverge", left: 1 }));
    const ends = l.xAxis.ticks.map((t) => t.at);
    expect(Math.max(...ends)).toBeCloseTo(l.projection.width);
  });
});

describe("a note on a slope", () => {
  const slope = (...notes: Note[]): ChartSpec =>
    noted(
      {
        data: categories(
          ["2005", "2015"],
          [
            [50, 34],
            [40, 31],
          ],
        ),
        mark: {
          mark: "slope",
          keys: [
            { key: "a", name: "Cats" },
            { key: "b", name: "Dogs" },
          ],
        },
        y: { domain: [0, 60] },
      },
      notes,
    );

  it("has no x place, so it is not drawn and joins no column, and the summary and the table give it", () => {
    const spec = slope({ at: 1, text: "Low" });
    expect(lay(spec).notes).toEqual([]);
    expect(joined(spec)).toEqual([]);
    const m = chartModel(spec, "en", "UTC");
    expect(spoken(m, { kind: "slope", i: 1, part: undefined }, words, false)).toBe(
      "2015: Cats 34, Dogs 31.",
    );
    expect(generatedSummary(m, words)).toContain("1: Low.");
    expect(tableModel(m, words).after).toBe("1: Low.");
  });
});

describe("a note on a scatter plot", () => {
  const world = (...notes: Note[]): ChartSpec =>
    noted(
      {
        data: points([
          {
            key: "Europe",
            names: ["Albania", "Monaco", "Andorra"],
            x: [18_920, 140_000, 140_000],
            y: [79.8, 85.9, 85.9],
          },
          { key: "Asia", names: ["Macau"], x: [140_000], y: [85.9] },
        ]),
        mark: { mark: "scatter" },
        x: { label: "GDP per capita", domain: [0, 150_000] },
        y: { label: "Life expectancy" },
      },
      notes,
    );

  it("sits at its x on the top edge and joins no dot, which an x alone does not name", () => {
    const spec = world({ at: 140_000, text: "Richest" }, { at: 200_000, text: "Off" });
    const l = lay(spec);
    expect(l.notes.map((n) => n.point)).toEqual([{ x: l.projection.xAt(140_000), y: 0 }]);
    expect(joined(spec)).toEqual([null, null]);
  });

  it("writes its x as the x measure in the summary and the table, before any layout", () => {
    const m = chartModel(world({ at: 50_000, text: "Gap" }), "en", "UTC");
    const after = "GDP per capita 50,000: Gap.";
    expect(generatedSummary(m, words).endsWith(` ${after}`)).toBe(true);
    expect(tableModel(m, words).after).toBe(after);
    expect(spoken(m, { kind: "scatter", series: 1, i: 0 }, words, false)).toBe(
      "Macau: Asia, GDP per capita 140,000, Life expectancy 85.9.",
    );
  });
});

describe("a note on a cell chart", () => {
  const grid = (...notes: Note[]): ChartSpec =>
    noted(
      {
        data: gridFrame({ names: ["2 PM", "3 PM", "4 PM"] }, { names: ["Monday", "Tuesday"] }, [
          [1, 2, 3],
          [4, 5, 6],
        ]),
        mark: { mark: "cell" },
      },
      notes,
    );
  const bins = (...notes: Note[]): ChartSpec =>
    noted(
      {
        data: gridFrame({ edges: [0, 10, 20] }, { edges: [100, 200, 300] }, [
          [1, 2],
          [3, 4],
        ]),
        mark: { mark: "cell" },
      },
      notes,
    );

  it("has no x place on a grid of names, so the summary and the table give it", () => {
    const spec = grid({ at: 1, text: "Release" });
    const m = chartModel(spec, "en", "UTC");
    expect(lay(spec).notes).toEqual([]);
    expect(joined(spec)).toEqual([]);
    expect(spoken(m, { kind: "cell", row: 1, column: 1 }, words, false)).toBe("Tuesday, 3 PM: 5.");
    expect(tableModel(m, words).after).toBe("1: Release.");
  });

  it("sits at its x on a binned grid's top edge and joins no cell, which an x alone does not name", () => {
    const spec = bins({ at: 10, text: "a" });
    const l = lay(spec);
    expect(l.notes[0]?.point).toEqual({ x: l.projection.xAt(10), y: 0 });
    expect(joined(spec)).toEqual([null]);
  });

  it("leaves a note beyond the edges out of the drawing and of every reading", () => {
    const spec = bins({ at: 25, text: "far" });
    expect(joined(spec)).toEqual([null]);
    expect(lay(spec).notes).toEqual([]);
  });
});

describe("a note on a calendar", () => {
  // From midnight of Saturday 28 March 2026 in Paris, the day before the
  // clocks go forward: 28 March is 24 hours long, 29 March 23.
  const TZ = "Europe/Paris";
  const START = Date.UTC(2026, 2, 27, 23);
  const calendar = (...notes: Note[]): ChartSpec =>
    noted(
      {
        data: calendarFrame(START, [1, 2, 3, 4], { zone: TZ }),
        mark: { mark: "cell", weekStart: 1 },
      },
      notes,
    );
  // The chart's own wall clock is another zone: the frame's zone sets the days.
  const model = (spec: ChartSpec) => chartModel(spec, "en", "UTC");
  const joins = (spec: ChartSpec) => {
    const m = model(spec);
    return m.marks.flatMap((t) => (t.kind === "text" ? [noteJoin(m, t) ?? null] : []));
  };

  it("joins the day holding its instant in the frame's zone, across a DST change", () => {
    // 11:30 PM on 29 March and 12:30 AM on 30 March in Paris, an hour apart.
    expect(
      joins(
        calendar(
          { at: Date.UTC(2026, 2, 29, 21, 30), text: "Late" },
          { at: Date.UTC(2026, 2, 29, 22, 30), text: "Early" },
        ),
      ),
    ).toEqual([
      { kind: "day", i: 1 },
      { kind: "day", i: 2 },
    ]);
  });

  it("joins the day's reading and writes the day's date in the summary and after the table", () => {
    const m = model(calendar({ at: Date.UTC(2026, 2, 28, 12), text: "Spring" }));
    expect(spoken(m, { kind: "day", i: 0 }, words, false)).toBe(
      "Saturday, March 28, 2026: 1. Note: Spring.",
    );
    expect(generatedSummary(m, words)).toContain("Saturday, March 28, 2026: Spring.");
    expect(tableModel(m, words).after).toBe("Saturday, March 28, 2026: Spring.");
  });

  it("leaves an instant outside the days out of the drawing, and keeps it in the summary", () => {
    const spec = calendar({ at: Date.UTC(2026, 2, 27, 22), text: "Before" });
    const m = model(spec);
    expect(joins(spec)).toEqual([null]);
    expect(layout(m, words, metrics, 600, { axis: 0, label: 0 }).notes).toEqual([]);
    expect(generatedSummary(m, words)).toContain("Friday, March 27, 2026: Before.");
  });

  it("draws a note on its day, at the day's centre", () => {
    const spec = calendar({ at: Date.UTC(2026, 2, 30, 9), text: "Monday" });
    const l = layout(model(spec), words, metrics, 600, { axis: 0, label: 0 });
    const g = l.days;
    // Monday 30 March starts the second week column; its fill's box is snapped to whole px.
    const p = l.notes[0]?.point;
    expect(Math.abs((p?.x ?? 0) - 1.5 * (g?.column ?? 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((p?.y ?? 0) - ((g?.tops[0] ?? 0) + 12))).toBeLessThanOrEqual(0.5);
  });
});

describe("a note on a box plot", () => {
  const release: Note = { at: 6, text: "Release 2.1" };
  const plot = noted(
    {
      data: boxes(
        ["search", "export"],
        [
          { key: "Before", low: [1, 3], q1: [2, 4], median: [3, 5], q3: [4, 6], high: [5, 9] },
          { key: "After", low: [1, 2], q1: [2, 3], median: [2, 4], q3: [3, 5], high: [4, 6] },
        ],
      ),
      mark: { mark: "box" },
    },
    [release],
  );

  it("sits at its x on the top edge and joins no row, which an x alone does not name", () => {
    const l = lay(plot);
    expect(l.notes[0]?.point).toEqual({ x: l.projection.xAt(6), y: 0 });
    expect(joined(plot)).toEqual([null]);
  });

  it("is said in the summary and after the table at its x, and in no row's reading", () => {
    const m = chartModel(plot, "en", "UTC");
    expect(spoken(m, { kind: "box", row: 1, part: 1 }, words, true)).toBe(
      "export: After median 4, middle half 3 to 5, whiskers 2 to 6.",
    );
    expect(generatedSummary(m, words)).toMatch(/ 6: Release 2\.1\.$/u);
    expect(tableModel(m, words).after).toBe("6: Release 2.1.");
  });
});
