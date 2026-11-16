import { describe, expect, it } from "vitest";

import { measurer } from "../scale/measure.js";

import { areaPaths, rectPaths } from "./geometry.js";
import { layout, type Metrics } from "./layout.js";
import { chartModel, type Model, type SeriesModel } from "./model.js";
import type { ChartSpec } from "./spec.js";
import { generatedSummary } from "./summary.js";
import { tableModel } from "./table.js";
import type { FrameSeries } from "../frame/frame.js";
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
const SERIES = 2_000;
const SAMPLES = 2;
// A pass over every value reads each a few times; a total found again for
// each series reads the whole stack once a series, SERIES times this.
const MOST_READS = 20 * SERIES * SAMPLES;

const named = (values: (s: number) => number[]): FrameSeries[] =>
  Array.from({ length: SERIES }, (_, s) => ({ key: `s${String(s)}`, values: values(s) }));
// Past the ninth a series takes no slot of its own, so each takes slot 1.
const keys = Array.from({ length: SERIES }, (_, s) => ({ key: `s${String(s)}`, slot: 1 as const }));

// Builds `spec`'s model, then counts every read of a series' value from it on.
function counted(spec: ChartSpec): { model: Model; reads: () => number } {
  const model = chartModel(spec, "en", "UTC");
  let reads = 0;
  for (const mark of model.marks) {
    if (mark.kind === "area" || mark.kind === "rect") {
      for (const s of mark.series) {
        (s as { y: SeriesModel["y"] }).y = new Proxy(s.y, {
          get(target, key, receiver) {
            if (typeof key === "string" && /^\d+$/.test(key)) {
              reads++;
            }
            return Reflect.get(target, key, receiver) as unknown;
          },
        });
      }
    }
  }
  return { model, reads: () => reads };
}

describe("a stack's totals", () => {
  it.each(["stack", "share"] as const)(
    "are found once, so an area of 2,000 series under %s reads each value a few times",
    (arrange) => {
      const { model, reads } = counted({
        data: {
          type: "series",
          name: "s",
          unit: "count",
          x: [0, 1],
          series: named((s) => [1 + (s % 5), 2]),
        },
        mark: { mark: "area", arrange, keys },
      });
      const [area] = model.marks;
      if (area?.kind !== "area") {
        throw new Error("no area");
      }
      const lay = layout(model, words, metrics, 800, { axis: 0, label: 0 });
      expect(areaPaths(area, lay.projection)).toHaveLength(SERIES);
      expect(generatedSummary(model, words)).not.toBe("");
      expect(tableModel(model, words).rows).toHaveLength(SAMPLES);
      expect(reads()).toBeLessThanOrEqual(MOST_READS);
    },
  );

  it("are found once, so a share rect of 2,000 series reads each value a few times", () => {
    const { model, reads } = counted({
      data: {
        type: "bins",
        name: "b",
        unit: "count",
        axis: "value",
        x1: [0, 1],
        x2: [1, 2],
        series: named((s) => [1 + (s % 5), 2]),
      },
      mark: { mark: "rect", arrange: "share", keys },
    });
    const [rect] = model.marks;
    if (rect?.kind !== "rect") {
      throw new Error("no rect");
    }
    const lay = layout(model, words, metrics, 800, { axis: 0, label: 0 });
    expect(rectPaths(rect, lay.projection)).toHaveLength(SERIES);
    expect(generatedSummary(model, words)).not.toBe("");
    expect(tableModel(model, words).rows).toHaveLength(SAMPLES);
    expect(reads()).toBeLessThanOrEqual(MOST_READS);
  });
});
