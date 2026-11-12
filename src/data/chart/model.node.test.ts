import { describe, expect, it } from "vitest";

import { chartModel } from "./model.js";
import type { ChartSpec, Mark } from "./spec.js";

const build = (spec: unknown) => chartModel(spec as ChartSpec, "en", "UTC");

const rect = (
  y: readonly (number | null)[],
  more: Partial<Extract<Mark, { mark: "rect" }>> = {},
): Mark => ({
  mark: "rect",
  x1: y.map((_, i) => i),
  x2: y.map((_, i) => i + 1),
  series: [{ name: "a", y }],
  ...more,
});

const line = (
  y: readonly (number | null)[],
  more: Partial<Extract<Mark, { mark: "line" }>> = {},
): Mark => ({
  mark: "line",
  x: y.map((_, i) => i),
  series: [{ name: "a", y }],
  ...more,
});

const ten = Array.from({ length: 10 }, (_, i) => ({ name: `s${String(i)}`, y: [1] }));

describe("spec errors", () => {
  it.each<[string, unknown, ErrorConstructor]>([
    ["a repeated line x", { x: {}, marks: [line([1, 2], { x: [0, 0] })] }, RangeError],
    [
      "a rect x1 that goes back",
      { x: {}, marks: [rect([1, 2], { x1: [1, 0], x2: [2, 1] })] },
      RangeError,
    ],
    [
      "a dot row's x decreasing",
      { x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [2, 1] }] }] },
      RangeError,
    ],
    ["a rect x2 not above its x1", { x: {}, marks: [rect([1], { x2: [0] })] }, RangeError],
    ["a non-finite x", { x: {}, marks: [line([1, 2], { x: [0, Number.NaN] })] }, RangeError],
    [
      "an infinite x2",
      { x: {}, marks: [rect([1], { x2: [Number.POSITIVE_INFINITY] })] },
      RangeError,
    ],
    ["an infinite y", { x: {}, marks: [line([Number.NEGATIVE_INFINITY])] }, RangeError],
    ["a negative y under a rect", { x: {}, marks: [rect([-1])] }, RangeError],
    [
      "a slot of 0",
      { x: {}, marks: [rect([1], { series: [{ name: "a", slot: 0 as 1, y: [1] }] })] },
      RangeError,
    ],
    ["a slot of 10", { x: {}, marks: [{ mark: "dot", slot: 10, rows: [] }] }, RangeError],
    ["a tenth series with no slot", { x: {}, marks: [rect([1], { series: ten })] }, RangeError],
    ["a log domain at 0", { x: { type: "log", domain: [0, 10] }, marks: [rect([1])] }, RangeError],
    [
      "a second rect at 0 or below on a log x",
      { x: { type: "log" }, marks: [rect([1, 1], { x1: [-1, 0], x2: [0, 1] })] },
      RangeError,
    ],
    [
      "a rule at NaN",
      { x: {}, marks: [{ mark: "rule", x: Number.NaN, label: "Median" }] },
      RangeError,
    ],
    [
      "a rule at Infinity",
      { x: {}, marks: [{ mark: "rule", y: Number.POSITIVE_INFINITY, label: "Cap" }] },
      RangeError,
    ],
    [
      "a rect's y domain without 0",
      { x: {}, y: { domain: [1, 5] }, marks: [rect([2])] },
      RangeError,
    ],
    ["a height of 0", { x: {}, height: 0, marks: [] }, RangeError],
    ["a series shorter than its x", { x: {}, marks: [line([1], { x: [0, 1] })] }, TypeError],
    ["dots beside a line", { x: {}, marks: [line([1]), { mark: "dot", rows: [] }] }, TypeError],
    ["a line beside a rect", { x: {}, marks: [rect([1]), line([1])] }, TypeError],
    ["two lines", { x: {}, marks: [line([1]), line([2])] }, TypeError],
    [
      "a second rect after a rule",
      { x: {}, marks: [rect([1]), { mark: "rule", y: 1, label: "Cap" }, rect([2])] },
      TypeError,
    ],
    [
      "a linear y under dots",
      { x: {}, y: { type: "linear" }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "a rule with neither x nor y",
      { x: {}, marks: [{ mark: "rule", label: "Median" }] },
      TypeError,
    ],
    [
      "a rule with both x and y",
      { x: {}, marks: [{ mark: "rule", x: 1, y: 1, label: "Median" }] },
      TypeError,
    ],
    ["zero false under a rect", { x: {}, y: { zero: false }, marks: [rect([1])] }, TypeError],
    [
      "a domain on a band",
      { x: {}, y: { domain: [0, 1] }, marks: [{ mark: "dot", rows: [] }] },
      TypeError,
    ],
    [
      "a curve that is not linear or step",
      { x: {}, marks: [line([1], { curve: "smooth" as "step" })] },
      TypeError,
    ],
    ["a mark that is not one of the four", { x: {}, marks: [{ mark: "area" }] }, TypeError],
    ["marks that are not an array", { x: {}, marks: "rect" }, TypeError],
    [
      "an arrange that is not stack or group",
      { x: {}, marks: [rect([1], { arrange: "side" as "group" })] },
      TypeError,
    ],
    [
      "a series with no name",
      { x: {}, marks: [line([1], { series: [{ y: [1] } as never] })] },
      TypeError,
    ],
    ["a y holding a string", { x: {}, marks: [line(["1" as never])] }, TypeError],
    ["a scale type that does not exist", { x: { type: "utc" }, marks: [] }, TypeError],
    ["a format that does not exist", { x: { format: "bytes" }, marks: [] }, TypeError],
    ["a unit with no other form", { x: {}, y: { unit: { one: "post" } }, marks: [] }, TypeError],
  ])("%s throws its type", (_, spec, type) => {
    expect(() => build(spec)).toThrow(type);
  });

  it("names the rule it breaks", () => {
    expect(() => build({ x: {}, marks: [line([1, 2], { x: [0, 0] })] })).toThrow(
      "renderChart: marks[0].x must strictly increase",
    );
  });

  it("names the one-data-mark rule a second data mark breaks", () => {
    expect(() =>
      build({ x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }, line([1]), rect([1])] }),
    ).toThrow(
      "renderChart: marks[2] is a second data mark beside marks[1]; a chart holds one rect, line or dot mark and any rules",
    );
  });

  it("takes one data mark among any number of rules", () => {
    expect(() =>
      build({
        x: {},
        marks: [
          { mark: "rule", y: 1, label: "Floor" },
          rect([1]),
          { mark: "rule", y: 2, label: "Cap" },
        ],
      }),
    ).not.toThrow();
  });

  it("takes tied dot times and a NaN y as a gap", () => {
    const m = build({
      x: {},
      marks: [line([1, Number.NaN, 3]), { mark: "rule", y: 2, label: "Mid" }],
    });
    const first = m.marks[0];
    expect(first?.kind === "line" ? first.series[0]?.y : undefined).toEqual([1, null, 3]);
    expect(() =>
      build({ x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [1, 1, 2] }] }] }),
    ).not.toThrow();
  });
});

describe("the chart's kind", () => {
  it.each<[string, ChartSpec, string | undefined]>([
    [
      "two series of rects",
      {
        x: {},
        marks: [
          rect([1], {
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "stackedColumn",
    ],
    ["one series of rects", { x: {}, marks: [rect([1])] }, "column"],
    [
      "two series of rects grouped",
      {
        x: {},
        marks: [
          rect([1], {
            arrange: "group",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "groupedColumn",
    ],
    ["one series of rects grouped", { x: {}, marks: [rect([1], { arrange: "group" })] }, "column"],
    [
      "two series of rects grouped on a log x",
      {
        x: { type: "log" },
        marks: [
          rect([1], {
            x1: [1],
            x2: [2],
            arrange: "group",
            series: [
              { name: "a", y: [1] },
              { name: "b", y: [2] },
            ],
          }),
        ],
      },
      "histogram",
    ],
    [
      "rects on a log x",
      { x: { type: "log" }, marks: [rect([1], { x1: [1], x2: [2] })] },
      "histogram",
    ],
    ["a line with no curve", { x: {}, marks: [line([1])] }, "line"],
    ["a step line", { x: {}, marks: [line([1], { curve: "step" })] }, "step"],
    ["dot rows", { x: {}, marks: [{ mark: "dot", rows: [] }] }, "timeline"],
    ["rules alone", { x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }] }, undefined],
  ])("%s is %s", (_, spec, kind) => {
    expect(build(spec).kind).toBe(kind);
  });
});

describe("empty", () => {
  it.each<[string, ChartSpec, boolean]>([
    ["every value null", { x: {}, marks: [line([null, Number.NaN])] }, true],
    ["every rect 0", { x: {}, marks: [rect([0, null, 0])] }, true],
    ["every row empty", { x: {}, marks: [{ mark: "dot", rows: [{ name: "a", x: [] }] }] }, true],
    [
      "dots only outside the domain",
      { x: { domain: [0, 1] }, marks: [{ mark: "dot", rows: [{ name: "a", x: [5] }] }] },
      true,
    ],
    ["rules alone", { x: {}, marks: [{ mark: "rule", x: 1, label: "Median" }] }, true],
    ["one rect above 0", { x: {}, marks: [rect([0, 1])] }, false],
    ["one line value", { x: {}, marks: [line([null, 0])] }, false],
  ])("%s: %s", (_, spec, empty) => {
    expect(build(spec).empty).toBe(empty);
  });
});
