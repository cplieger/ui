import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { layout, type Metrics } from "./layout.js";
import { chartModel } from "./model.js";
import { placeNote, wrapNote } from "./notes.js";
import type { ChartSpec, Mark } from "./spec.js";
import { chartWords } from "./words.js";

// A face 7.5 px a character, digits included.
const width = (t: string) => 7.5 * Array.from(t).length;
const face = measurer(width, 7.5, "en");
const metrics: Metrics = {
  measure: face,
  mono: face,
  lineHeight: 17,
  rem: 16,
  row: 24,
  axisGroup: 0,
  labelGroup: 0,
  height: 200,
  dpr: 1,
};
const lay = (spec: ChartSpec, w = 600) =>
  layout(chartModel(spec, "en", "UTC"), chartWords(), metrics, w, { axis: 0, label: 0 });

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
