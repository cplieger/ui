import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { layout, type Metrics } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import { initial, spoken } from "./select.js";
import type { ChartSpec, Mark } from "./spec.js";
import { generatedSummary } from "./summary.js";
import { chartWords } from "./words.js";

const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
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
  height: 240,
  dpr: 1,
};
const words = chartWords();
const NOTES = 20_000;

// `list` behind a Proxy counting each read of an element into `reads`, and
// throwing past `most` so a per-note pass fails fast.
function counting<L extends ArrayLike<unknown>>(list: L, reads: { n: number }, most: number): L {
  return new Proxy(list, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key) && ++reads.n > most) {
        throw new Error(`more than ${String(most)} reads`);
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

// Everything a render and one key press read of the model.
function render(model: Model): void {
  const sel = initial(model);
  if (sel === undefined) {
    throw new Error("nothing to select");
  }
  expect(spoken(model, sel, words, false)).not.toBe("");
  expect(generatedSummary(model, words)).not.toBe("");
  expect(layout(model, words, metrics, 800, { axis: 0, label: 0 }).notes).not.toHaveLength(0);
}

const notes = (x: (k: number) => number, y: (k: number) => number): Mark[] =>
  Array.from({ length: NOTES }, (_, k) => ({ mark: "text", x: x(k), y: y(k), text: "a" }));

describe("a note's join", () => {
  it("finds the chart's data mark once, so 20,000 notes before a line read the marks a few times each", () => {
    const spec: ChartSpec = {
      x: {},
      y: {},
      marks: [
        ...notes(
          (k) => k % 100,
          () => 1,
        ),
        {
          mark: "line",
          x: Array.from({ length: 101 }, (_, i) => i),
          series: [{ name: "a", y: Array.from({ length: 101 }, () => 1) }],
        },
      ],
    };
    const model = chartModel(spec, "en", "UTC");
    const reads = { n: 0 };
    const most = 20 * model.marks.length;
    render({ ...model, marks: counting(model.marks, reads, most) });
    expect(reads.n).toBeLessThanOrEqual(most);
  });

  it("finds a rect note's bucket by halving, so 20,000 notes over 20,000 buckets read near n log n ends", () => {
    const BUCKETS = 20_000;
    const x1 = Array.from({ length: BUCKETS }, (_, i) => i * 10);
    const spec: ChartSpec = {
      x: { type: "linear" },
      marks: [
        {
          mark: "rect",
          x1,
          x2: x1.map((s) => s + 10),
          series: [{ name: "a", y: x1.map(() => 1) }],
        },
        ...notes(
          (k) => k * 10 + 5,
          () => 1,
        ),
      ],
    };
    const model = chartModel(spec, "en", "UTC");
    const [rect] = model.marks;
    if (rect?.kind !== "rect") {
      throw new Error("no rect");
    }
    const reads = { n: 0 };
    // Two searches of log2 buckets ends a note, and a few passes over every bucket.
    const most = NOTES * 4 * Math.ceil(Math.log2(BUCKETS)) + 20 * (NOTES + BUCKETS);
    const ends = rect as { x1: ArrayLike<number>; x2: ArrayLike<number> };
    ends.x1 = counting(rect.x1, reads, most);
    ends.x2 = counting(rect.x2, reads, most);
    render(model);
    expect(reads.n).toBeLessThanOrEqual(most);
  });

  it("finds a scatter note's dot by its values, so 20,000 notes over 20,000 dots read each dot a few times", () => {
    const DOTS = 20_000;
    const at = Array.from({ length: DOTS }, (_, i) => i);
    const spec: ChartSpec = {
      x: { type: "linear", label: "Income" },
      y: { type: "linear", label: "Life expectancy" },
      marks: [
        {
          mark: "scatter",
          series: [{ name: "a", names: at.map((i) => `d${String(i)}`), x: at, y: at }],
        },
        ...notes(
          (k) => k,
          (k) => k,
        ),
      ],
    };
    const model = chartModel(spec, "en", "UTC");
    const [scatter] = model.marks;
    if (scatter?.kind !== "scatter") {
      throw new Error("no scatter");
    }
    const reads = { n: 0 };
    const most = 20 * (NOTES + DOTS);
    for (const s of scatter.series) {
      const values = s as { x: readonly (number | null)[]; y: readonly (number | null)[] };
      values.x = counting(s.x, reads, most);
      values.y = counting(s.y, reads, most);
    }
    render(model);
    expect(reads.n).toBeLessThanOrEqual(most);
  });
});
