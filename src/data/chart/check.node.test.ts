import { describe, expect, it } from "vitest";

import { MAX_CALENDAR_DAYS, MAX_ROWS } from "../frame/limits.js";

import { check } from "./check.js";
import { chartModel } from "./model.js";
import { noteJoin } from "./notes.js";
import type { ChartSpec } from "./spec.js";
import { noteSentences, ruleSentences } from "./summary.js";
import {
  binsFrame,
  calendar,
  categories,
  events,
  grid,
  points,
  seriesFrame,
  tree,
  unitBins,
} from "./test-helpers/frames.js";
import { chartWords } from "./words.js";

const spec = (v: unknown) => v as ChartSpec;
const build = (v: unknown) => chartModel(spec(v), "en", "UTC");
const en = chartWords();

const HOUR = 3_600_000;
const line = (more: object = {}) => ({
  data: seriesFrame([0, HOUR, 2 * HOUR], [[1, 2, 3]], { unit: "seconds" }),
  mark: { mark: "line" },
  x: { type: "time" },
  ...more,
});

describe("the door's shape", () => {
  it("refuses the old marks list and a spec with neither data nor facets", () => {
    expect(() => check({ marks: [{ mark: "line", x: [0], series: [] }] })).toThrow(
      /mark must be an object/,
    );
    expect(() => check({ mark: { mark: "line" } })).toThrow(
      new TypeError("renderChart: data must be given, or facets whose panels each hold their data"),
    );
  });

  it("refuses data beside facets", () => {
    const data = seriesFrame([0], [[1]]);
    expect(() =>
      check({ data, mark: { mark: "line" }, facets: { panels: [{ key: "a", data }] } }),
    ).toThrow(/data has no place beside facets/);
  });

  it("refuses a mark on a frame type it does not take, naming data.type", () => {
    expect(() => check({ data: seriesFrame([0], [[1]]), mark: { mark: "bar" } })).toThrow(
      /data\.type must be "categories", not "series"/,
    );
    expect(() => check({ data: categories(["a"], [[1]]), mark: { mark: "cell" } })).toThrow(
      /data\.type must be "grid" or "calendar"/,
    );
    expect(() => check({ data: seriesFrame([0], [[1]]), mark: { mark: "flow" } })).toThrow(
      /mark\.mark must be/,
    );
  });

  it("refuses an x.type that contradicts the frame", () => {
    const time = binsFrame([0], [HOUR], [[1]]);
    expect(() => check({ data: time, mark: { mark: "rect" }, x: { type: "linear" } })).toThrow(
      /x\.type must be "time", since data\.axis is "time"/,
    );
    expect(() =>
      check({ data: unitBins([[1]]), mark: { mark: "rect" }, x: { type: "time" } }),
    ).toThrow(/x\.type must be "linear" or "log"/);
    expect(() =>
      check({ data: events({ a: [0] }), mark: { mark: "dot" }, x: { type: "linear" } }),
    ).toThrow(/x\.type must be "time" under a dot mark/);
  });

  it("sets x's type from a bins frame's axis and a dot's instants", () => {
    expect(check({ data: binsFrame([0], [HOUR], [[1]]), mark: { mark: "rect" } }).x?.type).toBe(
      "time",
    );
    expect(check({ data: unitBins([[1]]), mark: { mark: "rect" } }).x?.type).toBeUndefined();
    expect(check({ data: events({ a: [0] }), mark: { mark: "dot" } }).x?.type).toBe("time");
  });
});

describe("keys", () => {
  it("names and slots the frame's keys, the key itself by default", () => {
    const plot = check({
      data: seriesFrame(
        [0, 1],
        [
          [1, 2],
          [3, 4],
        ],
      ),
      mark: { mark: "line", keys: [{ key: "b", name: "Bee", slot: 4 }, { key: "gone" }] },
    });
    const [first] = plot.marks;
    expect(first?.mark === "line" ? first.series : undefined).toEqual([
      { name: "a", y: [1, 2] },
      { name: "Bee", slot: 4, y: [3, 4] },
    ]);
  });

  it("refuses two entries of one key and a field the mark's entries do not take", () => {
    const data = seriesFrame([0], [[1]]);
    expect(() =>
      check({ data, mark: { mark: "line", keys: [{ key: "a" }, { key: "a" }] } }),
    ).toThrow(RangeError);
    expect(() =>
      check({ data: events({ a: [0] }), mark: { mark: "dot", keys: [{ key: "a", slot: 2 }] } }),
    ).toThrow(/mark\.keys\[0\]\.slot has no place on a dot mark/);
    expect(() => check({ data, mark: { mark: "line", keys: [{ key: "a", below: 2 }] } })).toThrow(
      /mark\.keys\[0\]\.below has no place outside a bar mark/,
    );
    expect(() =>
      check({
        data: categories(["x"], [[1], [2]]),
        mark: { mark: "bar", keys: [{ key: "a", below: 2 }] },
      }),
    ).toThrow(/below has no place beside other series/);
  });

  it("needs a slot past the ninth series, naming it", () => {
    const ten = Array.from({ length: 10 }, () => [1]);
    expect(() => check({ data: seriesFrame([0], ten), mark: { mark: "line" } })).toThrow(
      /data\.series\[9\] needs a slot in mark\.keys/,
    );
  });
});

describe("units and domains", () => {
  it("defaults the axis the frame's unit is on to its format", () => {
    expect(check(line()).y?.format).toBe("duration");
    expect(check(line({ y: { format: "number" } })).y?.format).toBe("number");
    const ratio = categories(["a"], [[0.5]], { unit: "ratio" });
    expect(check({ data: ratio, mark: { mark: "bar" } }).x?.format).toBe("percent");
    const two = categories(["a", "b"], [[0.5, 0.6]], { unit: "ratio" });
    expect(check({ data: two, mark: { mark: "slope" } }).y?.format).toBe("percent");
    const waits = unitBins([[1]], { unit: "seconds" });
    expect(check({ data: waits, mark: { mark: "rect" } }).x?.format).toBe("duration");
    const cells = grid({ names: ["a"] }, { names: ["b"] }, [[1]], { unit: "seconds" });
    expect(check({ data: cells, mark: { mark: "cell" } }).colour?.format).toBe("duration");
    const p = points([{ key: "a", names: ["n"], x: [1], y: [2] }], {
      units: { x: "seconds", y: "count" },
    });
    const scatter = check({
      data: p,
      mark: { mark: "scatter" },
      x: { label: "X" },
      y: { label: "Y" },
    });
    expect([scatter.x?.format, scatter.y?.format]).toEqual(["duration", undefined]);
    const parts = tree({ parts: [{ key: "a", value: 1 }] }, { unit: "ratio" });
    const [whole] = check({ data: parts, mark: { mark: "tree" } }).marks;
    expect(whole?.mark === "tree" ? whole.format : undefined).toBe("percent");
  });

  it("keeps a share's own y, which writes shares", () => {
    const data = seriesFrame(
      [0, 1],
      [
        [1, 2],
        [3, 4],
      ],
      { unit: "seconds" },
    );
    expect(check({ data, mark: { mark: "area", arrange: "share" } }).y?.format).toBeUndefined();
  });

  it("takes the frame's domain, unless x passes its own", () => {
    const data = seriesFrame([1, 2], [[1, 2]], { domain: [0, 10] });
    expect(check({ data, mark: { mark: "line" } }).x?.domain).toEqual([0, 10]);
    expect(check({ data, mark: { mark: "line" }, x: { domain: [1, 5] } }).x?.domain).toEqual([
      1, 5,
    ]);
  });
});

describe("refs and notes", () => {
  it("draws a ref on the axis the unit is on, or the one its encoding names", () => {
    const data = seriesFrame([0, 1], [[1, 2]], { refs: [{ key: "p95", value: 1.5 }] });
    expect(check({ data, mark: { mark: "line" } }).marks[1]).toEqual({
      mark: "rule",
      y: 1.5,
      label: "p95",
    });
    expect(
      check({ data, mark: { mark: "line" }, refs: [{ key: "p95", label: "Slow", axis: "x" }] })
        .marks[1],
    ).toEqual({ mark: "rule", x: 1.5, label: "Slow" });
    const waits = unitBins([[1, 2]], { refs: [{ key: "median", value: 1 }] });
    expect(check({ data: waits, mark: { mark: "rect" } }).marks[1]).toEqual({
      mark: "rule",
      x: 1,
      label: "median",
    });
  });

  it("refuses a ref axis the mark has no continuous scale for", () => {
    const data = categories(["a"], [[1]], { refs: [{ key: "m", value: 1 }] });
    expect(() => check({ data, mark: { mark: "bar" }, refs: [{ key: "m", axis: "y" }] })).toThrow(
      /refs\[0\]\.axis "y" has no place beside a bar mark/,
    );
  });

  it("gives the refs and notes a chart cannot place in the summary instead", () => {
    const data = categories(["a", "b"], [[1, 2]], {
      refs: [{ key: "target", value: 2 }],
      notes: [{ key: "cut", at: 1 }],
    });
    const model = build({ data, mark: { mark: "pie" }, notes: [{ key: "cut", text: "Cut" }] });
    expect(model.unplaced).toEqual({
      rules: [{ label: "target", value: 2 }],
      notes: [{ text: "Cut", at: 1 }],
    });
    expect(model.marks.map((m) => m.kind)).toEqual(["pie"]);
    expect(ruleSentences(model, en).join(" ")).toContain("target");
    expect(noteSentences(model, en).join(" ")).toContain("Cut");
  });

  it("sets a note at its x on the top edge, joining the stop there", () => {
    const data = seriesFrame([0, 1, 2], [[1, 2, 3]], { notes: [{ key: "deploy", at: 1 }] });
    const model = build({
      data,
      mark: { mark: "line" },
      notes: [{ key: "deploy", side: "below" }],
    });
    const note = model.marks[1];
    expect(note).toEqual({ kind: "text", x: 1, text: "deploy", side: "below" });
    expect(note?.kind === "text" ? noteJoin(model, note) : undefined).toEqual({
      kind: "stop",
      i: 1,
    });
  });

  it("refuses a note at or below 0 on a log x", () => {
    const data = unitBins([[1]], { notes: [{ key: "n", at: 0 }] });
    expect(() =>
      check({ data: { ...data, x1: [1], x2: [2] }, mark: { mark: "rect" }, x: { type: "log" } }),
    ).toThrow(/data\.notes\[0\]\.at must be above 0 on a log x/);
  });

  it("holds every instant of a time x within Date, by its field", () => {
    const data = seriesFrame([0, 1], [[1, 2]], { notes: [{ key: "n", at: 9e15 }] });
    expect(() => check({ data, mark: { mark: "line" }, x: { type: "time" } })).toThrow(
      /data\.notes\[0\]\.at/,
    );
  });
});

describe("limits at the door", () => {
  it("refuses a band of more than MAX_ROWS names, naming data.names", () => {
    const names = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `n${String(i)}`);
    const data = categories(names, [names.map(() => 1)]);
    expect(() => check({ data, mark: { mark: "bar" } })).toThrow(RangeError);
    expect(() => check({ data, mark: { mark: "bar" } })).toThrow(/data\.names/);
  });

  it("refuses a calendar of more than MAX_CALENDAR_DAYS days, naming data.values", () => {
    const data = calendar(
      0,
      Array.from({ length: MAX_CALENDAR_DAYS + 1 }, () => 1),
    );
    expect(() => check({ data, mark: { mark: "cell" } })).toThrow(RangeError);
    expect(() => check({ data, mark: { mark: "cell" } })).toThrow(/data\.values/);
  });
});

describe("a calendar's zone", () => {
  it("lays out its days in its frame's zone, whatever the chart's", () => {
    // Midnight of 2026-03-01 in Paris is 23:00 UTC the day before.
    const start = Date.UTC(2026, 1, 28, 23);
    const data = calendar(start, [1, 2], { zone: "Europe/Paris" });
    const model = chartModel(spec({ data, mark: { mark: "cell" } }), "en", "UTC");
    expect(model.timeZone).toBe("Europe/Paris");
    expect(model.xText(start)).toContain("March 1");
  });
});

describe("facets", () => {
  // A panel whose one series has the panel's key.
  const panel = (key: string, values: number[]) => ({
    key,
    data: {
      ...seriesFrame([0, 1], [values], { refs: [{ key: "goal", value: 2 }] }),
      series: [{ key, values }],
    },
  });

  it("names each panel by its key's words, by default", () => {
    const model = build({
      mark: { mark: "line", keys: [{ key: "p", name: "Alpha" }] },
      facets: { panels: [panel("p", [1, 2]), { ...panel("q", [3, 4]), name: "Q" }] },
    });
    expect(model.facets?.panels.map((p) => p.name)).toEqual(["Alpha", "Q"]);
  });

  it("refuses a missing or repeated panel key", () => {
    const mark = { mark: "line" };
    expect(() => check({ mark, facets: { panels: [{ data: seriesFrame([0], [[1]]) }] } })).toThrow(
      /facets\.panels\[0\]\.key must be a string/,
    );
    expect(() =>
      check({ mark, facets: { panels: [panel("p", [1, 2]), panel("p", [3, 4])] } }),
    ).toThrow(/facets\.panels\[1\]\.key "p" must be unique/);
  });

  it("refuses panels of mixed frame types, naming the panel", () => {
    const cells = grid({ names: ["a"] }, { names: ["b"] }, [[1]]);
    expect(() =>
      check({
        mark: { mark: "cell" },
        facets: {
          panels: [
            { key: "g", name: "G", data: cells },
            { key: "k", name: "K", data: calendar(0, [1]) },
          ],
        },
      }),
    ).toThrow(/facets\.panels\[1\]\.data\.type must be "grid"/);
  });

  it("draws a ref every panel holds at one value once, as the chart's", () => {
    const plot = check({
      mark: { mark: "line" },
      facets: { panels: [panel("p", [1, 2]), panel("q", [3, 4])] },
    });
    expect(plot.marks).toEqual([{ mark: "rule", y: 2, label: "goal" }]);
    expect(plot.facets?.panels.map((p) => p.marks.length)).toEqual([1, 1]);
  });

  it("refuses panels whose frames' units differ", () => {
    expect(() =>
      check({
        mark: { mark: "line" },
        facets: {
          panels: [
            panel("p", [1, 2]),
            { key: "q", data: seriesFrame([0, 1], [[3, 4]], { unit: "seconds" }) },
          ],
        },
      }),
    ).toThrow(/facets\.panels\[1\]\.data\.unit must be facets\.panels\[0\]'s/);
  });
});
