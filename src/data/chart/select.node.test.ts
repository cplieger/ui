import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { measurer } from "../scale/measure.js";

import { layout, type Layout, type Metrics } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import { navigator, rekey, spoken, initial, type Key, type Selection } from "./select.js";
import type { ChartSpec, Mark } from "./spec.js";
import { chartWords } from "./words.js";

const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
const metrics: Metrics = {
  measure: face,
  mono: face,
  lineHeight: 17,
  nameLine: 18,
  rem: 16,
  row: 24,
  axisGroup: 80,
  labelGroup: 0,
  height: 240,
  dpr: 1,
};
const words = chartWords();
const MIN = 60_000;
const START = Date.UTC(2026, 10, 11, 8);
const time = (minute: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    START + minute * MIN,
  );
const span = (a: number, b: number) => `${time(a)} to ${time(b)}`;

interface Built {
  readonly model: Model;
  readonly lay: Layout;
  readonly nav: ReturnType<typeof navigator>;
}

function built(spec: ChartSpec, width = 600): Built {
  const model = chartModel(spec, "en", "UTC");
  const lay = layout(model, words, metrics, width, { axis: 0, label: 0 });
  return { model, lay, nav: navigator(model, lay) };
}

/** Presses `keys` in turn from `sel`, keeping each move; undefined stops it. */
function press(b: Built, sel: Selection, ...keys: Key[]): (Selection | undefined)[] {
  const out: (Selection | undefined)[] = [];
  let at: Selection | undefined = sel;
  for (const k of keys) {
    at = at === undefined ? undefined : b.nav.move(at, k, undefined);
    out.push(at);
  }
  return out;
}

const minutes = (n: number) => Array.from({ length: n }, (_, i) => START + i * MIN);

const stacked = (reverse = false): ChartSpec => ({
  x: { type: "time", domain: [START, START + 60 * MIN], reverse },
  y: { unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: [0, 1, 2, 3].map((i) => START + i * 15 * MIN),
      x2: [1, 2, 3, 4].map((i) => START + i * 15 * MIN),
      series: [
        { name: "Announce", y: [3, 5, 2, 4] },
        { name: "Path", y: [1, 9, null, 1] },
      ],
    },
  ],
});

// Live and Active sampled each minute from 8:00, null until a restart at 8:02.
const step: ChartSpec = {
  x: { type: "time", domain: [START, START + 7 * MIN] },
  y: { label: "Agents" },
  marks: [
    {
      mark: "line",
      curve: "step",
      x: minutes(8),
      series: [
        { name: "Live", y: [null, null, 4, 4, 4, 10, 10, 10] },
        { name: "Active", y: [null, null, 1, 1, 2, 2, 2, 2] },
      ],
    },
  ],
};

const timeline = (rows: { name: string; x: number[] }[], reverse = false): ChartSpec => ({
  x: { type: "time", domain: [START, START + 60 * MIN], reverse },
  y: { type: "band", unit: { one: "agent", other: "agents" } },
  marks: [{ mark: "dot", unit: { one: "post", other: "posts" }, rows }],
});

describe("rect keys", () => {
  const b = built(stacked());

  it("focus starts on the newest bucket", () => {
    expect(initial(b.model)).toEqual({ kind: "rect", i: 3, part: undefined });
  });

  it("Left and Right step a bucket, Home and End take the ends, and nothing moves past them", () => {
    const from: Selection = { kind: "rect", i: 1, part: undefined };
    expect(press(b, from, "ArrowLeft", "ArrowLeft").map((s) => s?.kind === "rect" && s.i)).toEqual([
      0,
      false,
    ]);
    expect(b.nav.move(from, "End", undefined)).toEqual({ kind: "rect", i: 3, part: undefined });
    expect(b.nav.move(from, "Home", undefined)).toEqual({ kind: "rect", i: 0, part: undefined });
    expect(b.nav.move({ kind: "rect", i: 3, part: undefined }, "ArrowRight", undefined)).toBe(
      undefined,
    );
  });

  it("Up and Down move through the stack's segments, Up from the bucket to the bottom one", () => {
    const whole: Selection = { kind: "rect", i: 1, part: undefined };
    expect(press(b, whole, "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      { kind: "rect", i: 1, part: 0 },
      { kind: "rect", i: 1, part: 1 },
      undefined,
    ]);
    expect(b.nav.move(whole, "ArrowDown", undefined)).toEqual({ kind: "rect", i: 1, part: 1 });
  });

  it("Up and Down move through a group's sub-columns left to right, in series order", () => {
    const spec = stacked();
    const [mark] = spec.marks;
    const g = built({
      ...spec,
      marks: [{ ...(mark as Extract<Mark, { mark: "rect" }>), arrange: "group" }],
    });
    const whole: Selection = { kind: "rect", i: 2, part: undefined };
    expect(press(g, whole, "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      { kind: "rect", i: 2, part: 0 },
      { kind: "rect", i: 2, part: 1 },
      undefined,
    ]);
    expect(press(g, { kind: "rect", i: 2, part: 1 }, "ArrowDown", "ArrowDown")).toEqual([
      { kind: "rect", i: 2, part: 0 },
      undefined,
    ]);
    expect(spoken(g.model, whole, words, false)).toBe(`${span(30, 45)}: Announce 2, Path No data.`);
  });

  it("moves through a 100% stack's segments in series order and says shares and the total", () => {
    const spec = stacked();
    const [mark] = spec.marks;
    const s = built({
      ...spec,
      marks: [{ ...(mark as Extract<Mark, { mark: "rect" }>), arrange: "share" }],
    });
    const whole: Selection = { kind: "rect", i: 0, part: undefined };
    expect(press(s, whole, "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      { kind: "rect", i: 0, part: 0 },
      { kind: "rect", i: 0, part: 1 },
      undefined,
    ]);
    expect(spoken(s.model, whole, words, false)).toBe(
      `${span(0, 15)}: Announce 75%, Path 25%. Total 4\u00A0posts.`,
    );
    expect(spoken(s.model, { kind: "rect", i: 1, part: 1 }, words, true)).toBe(
      `${span(15, 30)}: Path 64%.`,
    );
    expect(spoken(s.model, { kind: "rect", i: 2, part: 1 }, words, true)).toBe(
      `${span(30, 45)}: Path No data.`,
    );
  });

  it("says one segment for Up and Down, and the whole bucket again for Left and Right", () => {
    const path: Selection = { kind: "rect", i: 1, part: 1 };
    expect(spoken(b.model, path, words, true)).toBe(`${span(15, 30)}: Path 9.`);
    const left = b.nav.move(path, "ArrowLeft", undefined);
    expect(left).toEqual({ kind: "rect", i: 0, part: 1 });
    expect(spoken(b.model, left as Selection, words, false)).toBe(
      `${span(0, 15)}: Announce 3, Path 1. Total 4.`,
    );
    expect(spoken(b.model, { kind: "rect", i: 2, part: 1 }, words, true)).toBe(
      `${span(30, 45)}: Path No data.`,
    );
  });

  it("runs with the drawing on a reversed x: Right goes left in time, Home is the newest", () => {
    const r = built(stacked(true));
    const from: Selection = { kind: "rect", i: 1, part: undefined };
    expect(r.nav.move(from, "ArrowRight", undefined)).toEqual({
      kind: "rect",
      i: 0,
      part: undefined,
    });
    expect(r.nav.move(from, "Home", undefined)).toEqual({ kind: "rect", i: 3, part: undefined });
  });
});

describe("histogram keys", () => {
  it("step through the bins and say each with its unit", () => {
    const b = built({
      x: { type: "log", format: "duration", domain: [1_000, 600_000] },
      y: { unit: { one: "read", other: "reads" } },
      marks: [
        {
          mark: "rect",
          x1: [0, 1_000, 60_000],
          x2: [1_000, 60_000, 600_000],
          series: [{ name: "Reads", y: [4, 86, 1] }],
        },
      ],
    });
    const first = b.nav.move({ kind: "rect", i: 2, part: undefined }, "Home", undefined);
    expect(spoken(b.model, first as Selection, words, false)).toBe(
      `Under ${formatDuration(1_000, "en")}: 4\u00A0reads.`,
    );
    const next = b.nav.move(first as Selection, "ArrowRight", undefined);
    expect(spoken(b.model, next as Selection, words, false)).toBe(
      `${formatDuration(1_000, "en")} to ${formatDuration(60_000, "en")}: 86\u00A0reads.`,
    );
  });
});

describe("step line keys", () => {
  const b = built(step);
  const at = (s: Selection | undefined) => (s?.kind === "line" ? s.i : undefined);

  it("stops at the leading gap, the first sample, each change point and the last sample", () => {
    const first = b.nav.move({ kind: "line", i: 7, part: undefined }, "Home", undefined);
    expect(at(first)).toBe(0);
    const rest = press(b, first as Selection, ...Array<Key>(5).fill("ArrowRight"));
    expect(rest.map(at)).toEqual([2, 4, 5, 7, undefined]);
    expect(initial(b.model)).toEqual({ kind: "line", i: 7, part: undefined });
  });

  it("reads the leading gap as one No data stop, and each stop's held values", () => {
    expect(spoken(b.model, { kind: "line", i: 0, part: undefined }, words, false)).toBe(
      `${time(0)}: No data.`,
    );
    expect(spoken(b.model, { kind: "line", i: 4, part: undefined }, words, false)).toBe(
      `${time(4)}: Live 4, Active 2.`,
    );
  });

  it("moves Up and Down through the series by their values at this x", () => {
    const whole: Selection = { kind: "line", i: 5, part: undefined };
    expect(press(b, whole, "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      { kind: "line", i: 5, part: 1 },
      { kind: "line", i: 5, part: 0 },
      undefined,
    ]);
    expect(spoken(b.model, { kind: "line", i: 5, part: 0 }, words, true)).toBe(
      `${time(5)}: Live 10.`,
    );
    expect(b.nav.move({ kind: "line", i: 0, part: undefined }, "ArrowUp", undefined)).toBe(
      undefined,
    );
  });
});

describe("area keys", () => {
  // Gas, Wind and Solar sampled each minute from 8:00, Wind missing at 8:02.
  const b = built({
    x: { type: "time", domain: [START, START + 4 * MIN] },
    y: { unit: { one: "megawatt", other: "megawatts" } },
    marks: [
      {
        mark: "area",
        x: minutes(5),
        series: [
          { name: "Gas", y: [12, 11, 10, 9, 8] },
          { name: "Wind", y: [3, 4, null, 6, 7] },
          { name: "Solar", y: [1, 2, 3, 4, 5] },
        ],
      },
    ],
  });
  const at = (s: Selection | undefined) => (s?.kind === "area" ? s.i : undefined);

  it("focus starts on the newest sample, and Left and Right step each sample", () => {
    const first = initial(b.model);
    expect(first).toEqual({ kind: "area", i: 4, part: undefined });
    const back = press(b, first as Selection, ...Array<Key>(5).fill("ArrowLeft"));
    expect(back.map(at)).toEqual([3, 2, 1, 0, undefined]);
  });

  it("moves Up and Down through the layers in series order, whatever their values", () => {
    const whole: Selection = { kind: "area", i: 0, part: undefined };
    expect(press(b, whole, "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      { kind: "area", i: 0, part: 0 },
      { kind: "area", i: 0, part: 1 },
      { kind: "area", i: 0, part: 2 },
      undefined,
    ]);
    expect(spoken(b.model, { kind: "area", i: 0, part: 1 }, words, true)).toBe(
      `${time(0)}: Wind 3.`,
    );
  });

  it("says each layer and the stack's total, No data at a gap", () => {
    expect(spoken(b.model, { kind: "area", i: 1, part: undefined }, words, false)).toBe(
      `${time(1)}: Gas 11, Wind 4, Solar 2. Total 17.`,
    );
    expect(spoken(b.model, { kind: "area", i: 2, part: undefined }, words, false)).toBe(
      `${time(2)}: Gas 10, Wind No data, Solar 3. Total No data.`,
    );
  });

  it("selects the nearest sample under the pointer", () => {
    const px = b.lay.frame.xAt(START + 1.4 * MIN);
    expect(b.nav.pick(px, 0)).toEqual({ kind: "area", i: 1, part: undefined });
  });
});

describe("Page keys", () => {
  const spec: ChartSpec = {
    x: { type: "time", domain: [START, START + 120 * MIN] },
    marks: [
      { mark: "line", x: minutes(121), series: [{ name: "Live", y: minutes(121).map(() => 1) }] },
    ],
  };
  const b = built(spec);
  const ticks = b.lay.xAxis.ticks.map((t) => t.at);
  const room = (ticks[1] ?? 0) - (ticks[0] ?? 0);
  const px = (i: number) => b.lay.frame.xAt(START + i * MIN);

  it("go to the nearest stop at least one x tick away, and to the end past the last tick", () => {
    expect(ticks.length).toBeGreaterThan(2);
    const next = b.nav.move({ kind: "line", i: 10, part: undefined }, "PageDown", undefined);
    const i = next?.kind === "line" ? next.i : -1;
    expect(px(i) - px(10)).toBeGreaterThanOrEqual(room - 0.5);
    expect(px(i - 1) - px(10)).toBeLessThan(room - 0.5);
    const back = b.nav.move({ kind: "line", i, part: undefined }, "PageUp", undefined);
    expect(back).toEqual({ kind: "line", i: 10, part: undefined });
    expect(b.nav.move({ kind: "line", i: 119, part: undefined }, "PageDown", undefined)).toEqual({
      kind: "line",
      i: 120,
      part: undefined,
    });
    expect(b.nav.move({ kind: "line", i: 120, part: undefined }, "PageDown", undefined)).toBe(
      undefined,
    );
  });

  it("on a step line land on a stop", () => {
    const s = built(step);
    const next = s.nav.move({ kind: "line", i: 0, part: undefined }, "PageDown", undefined);
    expect([2, 4, 5, 7]).toContain(next?.kind === "line" ? next.i : -1);
  });
});

describe("timeline keys", () => {
  const b = built(
    timeline([
      {
        name: "lead-ui",
        x: [START + 10 * MIN, START + 20 * MIN, START + 20 * MIN, START + 40 * MIN],
      },
      { name: "docs-bot", x: [] },
      { name: "ha-agent", x: [START + 5 * MIN, START + 38 * MIN] },
    ]),
  );

  it("focus starts on the first row's last post, or on the row when it is silent", () => {
    expect(initial(b.model)).toEqual({ kind: "dot", row: 0, from: 3, to: 4 });
    const silent = built(
      timeline([
        { name: "docs-bot", x: [] },
        { name: "a", x: [START] },
      ]),
    );
    expect(initial(silent.model)).toEqual({ kind: "row", row: 0 });
  });

  it("Left and Right step each post, tied ones too, and Home and End take the row's ends", () => {
    const first: Selection = { kind: "dot", row: 0, from: 0, to: 1 };
    expect(press(b, first, "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight")).toEqual([
      { kind: "dot", row: 0, from: 1, to: 2 },
      { kind: "dot", row: 0, from: 2, to: 3 },
      { kind: "dot", row: 0, from: 3, to: 4 },
      undefined,
    ]);
    expect(b.nav.move(first, "End", undefined)).toEqual({ kind: "dot", row: 0, from: 3, to: 4 });
    expect(spoken(b.model, first, words, false)).toBe(`lead-ui: ${time(10)}.`);
  });

  it("Up and Down land on a silent row as a row, which Left, Right, Home and End leave alone", () => {
    const silent = b.nav.move(
      { kind: "dot", row: 0, from: 3, to: 4 },
      "ArrowDown",
      START + 40 * MIN,
    );
    expect(silent).toEqual({ kind: "row", row: 1 });
    expect(spoken(b.model, silent as Selection, words, false)).toBe("docs-bot: no posts");
    for (const k of ["ArrowLeft", "ArrowRight", "Home", "End"] as const) {
      expect(b.nav.move(silent as Selection, k, START + 40 * MIN)).toBe(undefined);
    }
  });

  it("leaving a silent row lands on the post nearest the x last selected, or the row's last post", () => {
    const silent: Selection = { kind: "row", row: 1 };
    expect(b.nav.move(silent, "ArrowDown", START + 40 * MIN)).toEqual({
      kind: "dot",
      row: 2,
      from: 1,
      to: 2,
    });
    expect(b.nav.move(silent, "ArrowDown", START + 6 * MIN)).toEqual({
      kind: "dot",
      row: 2,
      from: 0,
      to: 1,
    });
    expect(b.nav.move(silent, "ArrowUp", undefined)).toEqual({
      kind: "dot",
      row: 0,
      from: 3,
      to: 4,
    });
    expect(b.nav.move(silent, "ArrowDown", undefined)).toEqual({
      kind: "dot",
      row: 2,
      from: 1,
      to: 2,
    });
  });

  it("reads a whole row by its count and span", () => {
    expect(spoken(b.model, { kind: "row", row: 0 }, words, false)).toBe(
      `lead-ui: 4\u00A0posts, ${span(10, 40)}.`,
    );
  });
});

describe("the pointer", () => {
  it("selects the bucket under it, or the nearest from a gap or past the ends", () => {
    const b = built(stacked());
    const f = b.lay.frame;
    const at = (v: number) => f.xAt(START + v * MIN);
    expect(b.nav.pick(at(20), 0)).toEqual({ kind: "rect", i: 1, part: undefined });
    expect(b.nav.pick(at(30) + 0.2, f.height)).toEqual({ kind: "rect", i: 2, part: undefined });
    expect(b.nav.pick(-50, 0)).toEqual({ kind: "rect", i: 0, part: undefined });
    expect(b.nav.pick(f.width + 50, 0)).toEqual({ kind: "rect", i: 3, part: undefined });
  });

  it("selects the nearest sample, at both ends of a binary search", () => {
    const b = built(step);
    const f = b.lay.frame;
    expect(b.nav.pick(-10, 0)).toEqual({ kind: "line", i: 0, part: undefined });
    expect(b.nav.pick(f.width + 10, 0)).toEqual({ kind: "line", i: 7, part: undefined });
    expect(b.nav.pick(f.xAt(START + 3.4 * MIN), 0)).toEqual({
      kind: "line",
      i: 3,
      part: undefined,
    });
    expect(b.nav.pick(f.xAt(START + 3.6 * MIN), 0)).toEqual({
      kind: "line",
      i: 4,
      part: undefined,
    });
  });

  it("picks the row under it, then the nearest dot within 40 px, else the row itself", () => {
    const b = built(
      timeline([
        { name: "lead-ui", x: [START + 10 * MIN] },
        { name: "docs-bot", x: [] },
      ]),
    );
    const f = b.lay.frame;
    const dot = f.xAt(START + 10 * MIN);
    expect(b.nav.pick(dot + 39, 12)).toEqual({ kind: "dot", row: 0, from: 0, to: 1 });
    expect(b.nav.pick(dot + 41, 12)).toEqual({ kind: "row", row: 0 });
    expect(b.nav.pick(dot, 30)).toEqual({ kind: "row", row: 1 });
    expect(b.nav.pick(dot, 400)).toEqual({ kind: "row", row: 1 });
  });

  it("picks the dot under it on a reversed x, and the row more than 40 px from every dot", () => {
    const b = built(
      timeline([{ name: "lead-ui", x: [10, 30, 50].map((m) => START + m * MIN) }], true),
    );
    const f = b.lay.frame;
    const at = (m: number) => f.xAt(START + m * MIN);
    expect(at(10)).toBeGreaterThan(at(50));
    expect(b.nav.pick(at(10), 12)).toEqual({ kind: "dot", row: 0, from: 0, to: 1 });
    expect(b.nav.pick(at(30) + 5, 12)).toEqual({ kind: "dot", row: 0, from: 1, to: 2 });
    expect(b.nav.pick(at(50), 12)).toEqual({ kind: "dot", row: 0, from: 2, to: 3 });
    expect(b.nav.pick(at(10) + 41, 12)).toEqual({ kind: "row", row: 0 });
  });

  it("reads posts that share a pixel as their count and span", () => {
    const b = built(
      timeline([
        {
          name: "lead-ui",
          x: [START + 40 * MIN, START + 40 * MIN + 10_000, START + 40 * MIN + 20_000],
        },
      ]),
      140,
    );
    // 80 px of gutter leave 60 px for the hour, a px a minute, so the three posts share one.
    expect(b.lay.frame.width).toBe(60);
    const sel = b.nav.pick(b.lay.frame.xAt(START + 40 * MIN), 12);
    expect(sel).toEqual({ kind: "dot", row: 0, from: 0, to: 3 });
    expect(spoken(b.model, sel as Selection, words, false)).toBe(
      `lead-ui: 3\u00A0posts, ${span(40, 40)}.`,
    );
  });
});

describe("the selection across an update", () => {
  it("stays on its bucket while its x is in the data, and leaves with it", () => {
    const a = built(stacked()).model;
    const moved: ChartSpec = {
      ...stacked(),
      marks: [
        {
          mark: "rect",
          x1: [1, 2, 3].map((i) => START + i * 15 * MIN),
          x2: [2, 3, 4].map((i) => START + i * 15 * MIN),
          series: [
            { name: "Announce", y: [1, 1, 1] },
            { name: "Path", y: [1, 1, 1] },
          ],
        },
      ],
    };
    const b = built(moved).model;
    expect(rekey(a, { kind: "rect", i: 2, part: 1 }, b)).toEqual({ kind: "rect", i: 1, part: 1 });
    expect(rekey(a, { kind: "rect", i: 0, part: undefined }, b)).toBe(undefined);
  });

  it("follows a dot row by its name when the rows come in a new order", () => {
    const rows = [
      { name: "lead-ui", x: [START + 10 * MIN] },
      { name: "docs-bot", x: [] },
    ];
    const a = built(timeline(rows)).model;
    const b = built(timeline([...rows].reverse())).model;
    expect(rekey(a, { kind: "dot", row: 0, from: 0, to: 1 }, b)).toEqual({
      kind: "dot",
      row: 1,
      from: 0,
      to: 1,
    });
    expect(rekey(a, { kind: "row", row: 1 }, b)).toEqual({ kind: "row", row: 0 });
    const gone = built(timeline([{ name: "lead-ui", x: [START + 11 * MIN] }])).model;
    expect(rekey(a, { kind: "dot", row: 0, from: 0, to: 1 }, gone)).toBe(undefined);
  });
});

describe("a note in a reading", () => {
  it("ends a note written as a sentence once", () => {
    const spec = stacked();
    const b = built({
      ...spec,
      marks: [...spec.marks, { mark: "text", x: START + 20 * MIN, y: 4, text: "Deploy done!" }],
    });
    expect(spoken(b.model, { kind: "rect", i: 1, part: undefined }, words, false)).toBe(
      `${span(15, 30)}: Announce 5, Path 9. Total 14. Note: Deploy done!`,
    );
  });

  it("on a step line reads a note at a held sample at the stop holding it, wherever the pointer is in its run", () => {
    const b = built({
      ...step,
      marks: [...step.marks, { mark: "text", x: START + 3 * MIN, y: 4, text: "Restart" }],
    });
    const at = (i: number) => spoken(b.model, { kind: "line", i, part: undefined }, words, false);
    expect(at(2)).toBe(`${time(2)}: Live 4, Active 1. Note: Restart.`);
    expect(at(3)).toBe(`${time(3)}: Live 4, Active 1. Note: Restart.`);
    expect(at(4)).toBe(`${time(4)}: Live 4, Active 2.`);
  });
});

const names = (n: number) => Array.from({ length: n }, (_, i) => `Row ${String(i + 1)}`);
const ages: ChartSpec = {
  x: { unit: { one: "year", other: "years" } },
  marks: [
    {
      mark: "bar",
      y: ["Holy See", "Monaco", "Japan"],
      series: [{ name: "Median age", x: [57.4, 54.5, 49.8] }],
    },
  ],
};
const reach = (reverse = false, rows = 3): ChartSpec => ({
  x: { reverse },
  marks: [
    {
      mark: "bar",
      y: names(rows),
      series: [
        { name: "Domestic", x: Array.from({ length: rows }, (_, i) => i + 1) },
        { name: "International", x: Array.from({ length: rows }, (_, i) => (i === 1 ? null : 2)) },
      ],
    },
  ],
});
const bar = (row: number, part?: number): Selection => ({ kind: "bar", row, part });

describe("bar keys", () => {
  it("focus starts on the first row, whole, and on no rows selects nothing", () => {
    expect(initial(built(ages).model)).toEqual(bar(0));
    const none = built({ x: {}, marks: [{ mark: "bar", y: [], series: [{ name: "a", x: [] }] }] });
    expect(initial(none.model)).toBe(undefined);
  });

  it("Up and Down step a row, Home and End take the ends, and nothing moves past them", () => {
    const b = built(ages);
    expect(press(b, bar(0), "ArrowDown", "ArrowDown", "ArrowDown")).toEqual([
      bar(1),
      bar(2),
      undefined,
    ]);
    expect(b.nav.move(bar(0), "ArrowUp", undefined)).toBe(undefined);
    expect(b.nav.move(bar(0), "End", undefined)).toEqual(bar(2));
    expect(b.nav.move(bar(2), "Home", undefined)).toEqual(bar(0));
    expect(b.nav.move(bar(0), "Home", undefined)).toBe(undefined);
  });

  it("Page keys move ten rows, stopping at the first and last", () => {
    const b = built(reach(false, 25));
    expect(press(b, bar(0), "PageDown", "PageDown", "PageDown", "PageDown")).toEqual([
      bar(10),
      bar(20),
      bar(24),
      undefined,
    ]);
    expect(b.nav.move(bar(14, 1), "PageUp", undefined)).toEqual(bar(4, 1));
    expect(b.nav.move(bar(4), "PageUp", undefined)).toEqual(bar(0));
  });

  it("Left and Right move through the row's parts in series order, and Up and Down keep the part", () => {
    const b = built(reach());
    expect(press(b, bar(0), "ArrowRight", "ArrowRight", "ArrowRight")).toEqual([
      bar(0, 0),
      bar(0, 1),
      undefined,
    ]);
    expect(b.nav.move(bar(0), "ArrowLeft", undefined)).toEqual(bar(0, 1));
    expect(b.nav.move(bar(0, 0), "ArrowLeft", undefined)).toBe(undefined);
    expect(b.nav.move(bar(0, 1), "ArrowDown", undefined)).toEqual(bar(1, 1));
  });

  it("runs with the drawing on a reversed x: Right moves toward the first series", () => {
    const b = built(reach(true));
    expect(b.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, 1));
    expect(b.nav.move(bar(0, 1), "ArrowRight", undefined)).toEqual(bar(0, 0));
  });

  it("moves Right to the next grouped bar in series order on either x direction", () => {
    for (const reverse of [false, true]) {
      const spec = reach(reverse);
      const mark = spec.marks[0] as Extract<Mark, { mark: "bar" }>;
      const b = built({ ...spec, marks: [{ ...mark, arrange: "group" }] });
      expect(b.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, 0));
      expect(b.nav.move(bar(0, 0), "ArrowRight", undefined)).toEqual(bar(0, 1));
      expect(b.nav.move(bar(0), "ArrowLeft", undefined)).toEqual(bar(0, 1));
      expect(spoken(b.model, bar(0), words, false)).toBe("Row 1: Domestic 1, International 2.");
    }
  });

  it("moves Right through a split's panels as drawn, and once folded in series order", () => {
    for (const reverse of [false, true]) {
      const spec = reach(reverse);
      const mark = spec.marks[0] as Extract<Mark, { mark: "bar" }>;
      const split: ChartSpec = { ...spec, marks: [{ ...mark, arrange: "split" }] };
      // A reversed x lays the panels right to left, the first series' at the right.
      const wide = built(split);
      expect(wide.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, reverse ? 1 : 0));
      expect(spoken(wide.model, bar(0), words, false)).toBe("Row 1: Domestic 1, International 2.");
      // Under 30rem the panels fold into bars one under another, as a group's.
      const folded = built(split, 479);
      expect(folded.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, 0));
      expect(folded.nav.move(bar(0, 0), "ArrowRight", undefined)).toEqual(bar(0, 1));
    }
  });

  it("says a 100% row's shares and absolute total, and runs with the drawing on a reversed x", () => {
    for (const reverse of [false, true]) {
      const spec = reach(reverse);
      const mark = spec.marks[0] as Extract<Mark, { mark: "bar" }>;
      const b = built({ ...spec, marks: [{ ...mark, arrange: "share" }] });
      expect(spoken(b.model, bar(0), words, false)).toBe(
        "Row 1: Domestic 33%, International 67%. Total 3.",
      );
      expect(spoken(b.model, bar(0, 1), words, true)).toBe("Row 1: International 67%.");
      expect(b.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, reverse ? 1 : 0));
    }
  });

  it("moves Right through a diverging row left to right as drawn and says its total", () => {
    for (const reverse of [false, true]) {
      const spec = reach(reverse);
      const mark = spec.marks[0] as Extract<Mark, { mark: "bar" }>;
      // Domestic lies left of 0, so it is drawn first from the left, last on a reversed x.
      const b = built({ ...spec, marks: [{ ...mark, arrange: "diverge", left: 1 }] });
      expect(b.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, reverse ? 1 : 0));
      expect(spoken(b.model, bar(0), words, false)).toBe(
        "Row 1: Domestic 1, International 2. Total 3.",
      );
    }
  });

  it("moves Right from a mirror's left side to its right one and says its total", () => {
    for (const reverse of [false, true]) {
      const spec = reach(reverse);
      const mark = spec.marks[0] as Extract<Mark, { mark: "bar" }>;
      // A reversed x sets the first series on the right side.
      const b = built({ ...spec, marks: [{ ...mark, arrange: "mirror" }] });
      expect(b.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, reverse ? 1 : 0));
      expect(b.nav.move(bar(0), "ArrowLeft", undefined)).toEqual(bar(0, reverse ? 0 : 1));
      expect(spoken(b.model, bar(0), words, false)).toBe(
        "Row 1: Domestic 1, International 2. Total 3.",
      );
      // On a phone the sides stay apart.
      const phone = built({ ...spec, marks: [{ ...mark, arrange: "mirror" }] }, 320);
      expect(phone.nav.move(bar(0), "ArrowRight", undefined)).toEqual(bar(0, reverse ? 1 : 0));
    }
  });

  it("one series has no parts for Left and Right to choose", () => {
    const b = built(ages);
    expect(b.nav.move(bar(1), "ArrowLeft", undefined)).toBe(undefined);
    expect(b.nav.move(bar(1), "ArrowRight", undefined)).toBe(undefined);
  });

  it("says a row whole with its total, a part through the segment words, a gap as No data", () => {
    const b = built(reach());
    expect(spoken(b.model, bar(0), words, false)).toBe(
      "Row 1: Domestic 1, International 2. Total 3.",
    );
    expect(spoken(b.model, bar(0, 1), words, true)).toBe("Row 1: International 2.");
    expect(spoken(b.model, bar(1, 1), words, false)).toBe(
      "Row 2: Domestic 2, International No data. Total 2.",
    );
    expect(spoken(b.model, bar(1, 1), words, true)).toBe("Row 2: International No data.");
    expect(spoken(built(ages).model, bar(2), words, false)).toBe("Japan: 49.8\u00A0years.");
  });
});

describe("the pointer on a bar chart", () => {
  it("selects the row under it anywhere across the plot's width, or the nearest past the ends", () => {
    const b = built(ages);
    const w = b.lay.frame.width;
    expect(b.nav.pick(0, 24 * 1.5)).toEqual(bar(1));
    expect(b.nav.pick(w, 24 * 1.5)).toEqual(bar(1));
    expect(b.nav.pick(w / 2, 24 * 0.9)).toEqual(bar(0));
    expect(b.nav.pick(w / 2, -40)).toEqual(bar(0));
    expect(b.nav.pick(w / 2, 24 * 9)).toEqual(bar(2));
  });

  it("selects by the row under the name above it on a phone's 44 px rows", () => {
    const b = built(ages, 300);
    expect(b.nav.pick(10, 44 * 1.1)).toEqual(bar(1));
    expect(b.nav.pick(10, 44 * 2.9)).toEqual(bar(2));
  });

  it("draws no crosshair and selects by tap, not by drag", () => {
    const b = built(ages);
    expect(b.nav.crosshair(bar(1))).toBe(undefined);
    expect(b.nav.drags).toBe(false);
    expect(built(stacked()).nav.drags).toBe(true);
  });
});

describe("a bar row across an update", () => {
  it("follows its row by name in a new order, keeps its part, and leaves with the row", () => {
    const a = built(reach()).model;
    const turned: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "bar",
          y: ["Row 3", "Row 1"],
          series: [
            { name: "Domestic", x: [3, 1] },
            { name: "International", x: [2, 2] },
          ],
        },
      ],
    };
    const b = built(turned).model;
    expect(rekey(a, bar(0, 1), b)).toEqual(bar(1, 1));
    expect(rekey(a, bar(2), b)).toEqual(bar(0));
    expect(rekey(a, bar(1), b)).toBe(undefined);
    expect(rekey(a, bar(0, 1), built(ages).model)).toBe(undefined);
  });
});

describe("point keys, pointer and words", () => {
  const point = (row: number, part?: number): Selection => ({ kind: "point", row, part });
  const degrees = (reverse = false, rows = 3): ChartSpec => ({
    x: { reverse },
    y: { unit: { one: "degree", other: "degrees" } },
    marks: [
      {
        mark: "point",
        y: Array.from({ length: rows }, (_, i) => `Degree ${String(i + 1)}`),
        series: [
          { name: "Women", x: Array.from({ length: rows }, (_, i) => (i === 1 ? null : 50 + i)) },
          { name: "Men", x: Array.from({ length: rows }, (_, i) => 40 + i) },
        ],
      },
    ],
  });

  it("focus starts on the first row, whole, and on no rows selects nothing", () => {
    expect(initial(built(degrees()).model)).toEqual(point(0));
    const none = built({ x: {}, marks: [{ mark: "point", y: [], series: [] }] });
    expect(initial(none.model)).toBe(undefined);
  });

  it("steps rows with Up, Down, Home, End and the Page keys, keeping the part", () => {
    const b = built(degrees(false, 25));
    expect(press(b, point(0, 1), "ArrowDown", "End", "ArrowDown", "PageUp", "Home")).toEqual([
      point(1, 1),
      point(24, 1),
      undefined,
      undefined,
      undefined,
    ]);
    expect(b.nav.move(point(24, 1), "PageUp", undefined)).toEqual(point(14, 1));
    expect(b.nav.move(point(3), "PageUp", undefined)).toEqual(point(0));
    expect(b.nav.move(point(3), "Home", undefined)).toEqual(point(0));
  });

  it("moves through a row's dots in series order with Left and Right, on a reversed x too", () => {
    for (const reverse of [false, true]) {
      const b = built(degrees(reverse));
      expect(press(b, point(0), "ArrowRight", "ArrowRight", "ArrowRight")).toEqual([
        point(0, 0),
        point(0, 1),
        undefined,
      ]);
      expect(b.nav.move(point(0), "ArrowLeft", undefined)).toEqual(point(0, 1));
    }
    const one = built({
      x: {},
      marks: [{ mark: "point", y: ["a"], series: [{ name: "a", x: [1] }] }],
    });
    expect(one.nav.move(point(0), "ArrowRight", undefined)).toBe(undefined);
  });

  it("says a row whole, a chosen dot alone, a gap as No data, and one series with its unit", () => {
    const b = built(degrees());
    expect(spoken(b.model, point(0), words, false)).toBe("Degree 1: Women 50, Men 40.");
    expect(spoken(b.model, point(1), words, false)).toBe("Degree 2: Women No data, Men 41.");
    expect(spoken(b.model, point(2, 1), words, true)).toBe("Degree 3: Men 42.");
    expect(spoken(b.model, point(2, 1), words, false)).toBe("Degree 3: Women 52, Men 42.");
    const one = built({
      x: { unit: { one: "year", other: "years" } },
      marks: [{ mark: "point", y: ["Japan"], series: [{ name: "Median", x: [49.8] }] }],
    });
    expect(spoken(one.model, point(0), words, false)).toBe("Japan: 49.8\u00A0years.");
  });

  it("says a range's gap and an arrow's change after the row, and leaves either out at a gap", () => {
    const linked = (link: "range" | "arrow"): ChartSpec => ({
      ...degrees(),
      marks: [{ ...(degrees().marks[0] as Extract<Mark, { mark: "point" }>), link }],
    });
    const range = built(linked("range")).model;
    expect(spoken(range, point(0), words, false)).toBe("Degree 1: Women 50, Men 40. Gap 10.");
    expect(spoken(range, point(1), words, false)).toBe("Degree 2: Women No data, Men 41.");
    expect(spoken(range, point(0, 1), words, true)).toBe("Degree 1: Men 40.");
    const arrow = built(linked("arrow")).model;
    expect(spoken(arrow, point(2), words, false)).toBe("Degree 3: Women 52, Men 42. Change -10.");
    const own = chartWords({ changeReading: (at, parts, change) => `${at} (${change}): ${parts}` });
    expect(spoken(arrow, point(2), own, false)).toBe("Degree 3 (-10): Women 52, Men 42");
  });

  it("selects the row under the pointer across the plot, by tap only, with no crosshair", () => {
    const b = built(degrees());
    expect(b.nav.pick(b.lay.frame.width, 24 * 1.5)).toEqual(point(1));
    expect(b.nav.pick(0, -10)).toEqual(point(0));
    expect(b.nav.pick(0, 24 * 9)).toEqual(point(2));
    expect(built(degrees(), 300).nav.pick(10, 38 * 1.1)).toEqual(point(1));
    expect(b.nav.crosshair(point(1))).toBe(undefined);
    expect(b.nav.drags).toBe(false);
  });

  it("follows its row by name across an update, keeps its part, and leaves with the row", () => {
    const a = built(degrees()).model;
    const turned: ChartSpec = {
      x: {},
      marks: [
        {
          mark: "point",
          y: ["Degree 3", "Degree 1"],
          series: [
            { name: "Women", x: [1, 2] },
            { name: "Men", x: [3, 4] },
          ],
        },
      ],
    };
    const b = built(turned).model;
    expect(rekey(a, point(0, 1), b)).toEqual(point(1, 1));
    expect(rekey(a, point(1), b)).toBe(undefined);
    expect(rekey(a, { kind: "bar", row: 0, part: undefined }, b)).toBe(undefined);
  });
});

describe("slope keys, pointer and words", () => {
  const column = (i: number, part?: number): Selection => ({ kind: "slope", i, part });
  const pets = (more: readonly Mark[] = []): ChartSpec => ({
    marks: [
      {
        mark: "slope",
        x: ["2005", "2015"],
        series: [
          { name: "Cats", y: [50, 34] },
          { name: "Dogs", y: [40, 31] },
          { name: "Horses", y: [30, 39] },
          { name: "Mice", y: [null, 31] },
        ],
      },
      ...more,
    ],
  });

  it("focus starts on the right column, whole", () => {
    expect(initial(built(pets()).model)).toEqual(column(1));
  });

  it("moves between the columns with Left, Right, Home and End, keeping the series", () => {
    const b = built(pets());
    expect(press(b, column(1, 2), "ArrowLeft", "ArrowLeft", "End", "Home", "ArrowRight")).toEqual([
      column(0, 2),
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(b.nav.move(column(0, 2), "End", undefined)).toEqual(column(1, 2));
    expect(b.nav.move(column(1), "Home", undefined)).toEqual(column(0));
  });

  it("leaves the Page keys to the page", () => {
    const b = built(pets());
    expect(b.nav.pages).toBe(false);
    expect(b.nav.move(column(0), "PageDown", undefined)).toBe(undefined);
    expect(b.nav.move(column(1), "PageUp", undefined)).toBe(undefined);
    expect(built(stacked()).nav.pages).toBe(true);
  });

  it("moves Up and Down through the series by value at the column, ties in series order", () => {
    const b = built(pets());
    // 2015: Dogs 31 and Mice 31 tie, then Cats 34, then Horses 39.
    expect(press(b, column(1), "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      column(1, 1),
      column(1, 3),
      column(1, 0),
      column(1, 2),
      undefined,
    ]);
    expect(b.nav.move(column(1), "ArrowDown", undefined)).toEqual(column(1, 2));
    // 2005 has no Mice: Horses 30, Dogs 40, Cats 50.
    expect(press(b, column(0), "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      column(0, 2),
      column(0, 1),
      column(0, 0),
      undefined,
    ]);
  });

  it("selects the nearer column anywhere in the plot's height, by drag too", () => {
    const b = built(pets());
    const w = b.lay.frame.width;
    expect(b.nav.pick(w / 2 - 1, 0)).toEqual(column(0));
    expect(b.nav.pick(w / 2 + 1, b.lay.frame.height)).toEqual(column(1));
    expect(b.nav.pick(-20, 100)).toEqual(column(0));
    expect(b.nav.pick(w + 20, 100)).toEqual(column(1));
    expect(b.nav.crosshair(column(0))).toBe(0);
    expect(b.nav.crosshair(column(1))).toBe(w);
    expect(b.nav.drags).toBe(true);
  });

  it("says a column whole and a chosen series' ends and change", () => {
    const b = built(pets());
    expect(spoken(b.model, column(1), words, false)).toBe(
      "2015: Cats 34, Dogs 31, Horses 39, Mice 31.",
    );
    expect(spoken(b.model, column(0), words, false)).toBe(
      "2005: Cats 50, Dogs 40, Horses 30, Mice No data.",
    );
    expect(spoken(b.model, column(0, 1), words, true)).toBe("Dogs: 2005 40, 2015 31. Change -9.");
    expect(spoken(b.model, column(1, 2), words, true)).toBe("Horses: 2005 30, 2015 39. Change +9.");
    expect(spoken(b.model, column(1, 3), words, true)).toBe("Mice: 2005 No data, 2015 31.");
    expect(spoken(b.model, column(1, 0), words, false)).toBe(
      "2015: Cats 34, Dogs 31, Horses 39, Mice 31.",
    );
  });

  it("says a change of 0 with no sign and in the y format", () => {
    const b = built({
      y: { format: "percent" },
      marks: [
        {
          mark: "slope",
          x: ["Before", "After"],
          series: [
            { name: "a", y: [0.5, 0.5] },
            { name: "b", y: [0.25, 0.5] },
          ],
        },
      ],
    });
    expect(spoken(b.model, column(0, 0), words, true)).toBe("a: Before 50%, After 50%. Change 0%.");
    expect(spoken(b.model, column(0, 1), words, true)).toBe(
      "b: Before 25%, After 50%. Change +25%.",
    );
  });

  it("adds a note to its column's reading, whole or a chosen series", () => {
    const note: Mark = { mark: "text", x: "2005", y: 50, text: "Peak" };
    const b = built(pets([note]));
    expect(spoken(b.model, column(0), words, false)).toBe(
      "2005: Cats 50, Dogs 40, Horses 30, Mice No data. Note: Peak.",
    );
    expect(spoken(b.model, column(0, 1), words, true)).toBe(
      "Dogs: 2005 40, 2015 31. Change -9. Note: Peak.",
    );
    expect(spoken(b.model, column(1), words, false)).toBe(
      "2015: Cats 34, Dogs 31, Horses 39, Mice 31.",
    );
  });

  it("keeps its column by name across an update, its series by place, and leaves with the name", () => {
    const a = built(pets()).model;
    const turned = (x: readonly [string, string]): Model =>
      built({
        marks: [{ mark: "slope", x, series: [{ name: "Cats", y: [1, 2] }] }],
      }).model;
    expect(rekey(a, column(1, 0), turned(["2015", "2025"]))).toEqual(column(0, 0));
    expect(rekey(a, column(1, 3), turned(["2005", "2015"]))).toEqual(column(1));
    expect(rekey(a, column(0), turned(["2015", "2025"]))).toBe(undefined);
    expect(rekey(a, { kind: "line", i: 0, part: undefined }, a)).toBe(undefined);
  });
});

describe("scatter keys, pointer and words", () => {
  const dot = (series: number, i: number): Selection => ({ kind: "scatter", series, i });
  // GDP per capita in thousands of dollars against life expectancy in years.
  const world = (more: readonly Mark[] = [], reverse = false): ChartSpec => ({
    x: { label: "GDP per capita", reverse },
    y: { label: "Life expectancy" },
    marks: [
      {
        mark: "scatter",
        series: [
          {
            name: "Europe",
            names: ["Albania", "Monaco", "Norway", "Kosovo"],
            x: [19, 140, 82, null],
            y: [79.8, 85.9, 83.2, 79],
          },
          {
            name: "Africa",
            names: ["Chad", "Ghana", "Kenya"],
            x: [1.6, 6.3, 5.2],
            y: [53, 64.1, 62.7],
          },
        ],
      },
      ...more,
    ],
  });
  const chad = dot(1, 0);
  const kenya = dot(1, 2);
  const ghana = dot(1, 1);
  const albania = dot(0, 0);
  const norway = dot(0, 2);
  const monaco = dot(0, 1);

  it("focus starts on the first dot in x order", () => {
    expect(initial(built(world()).model)).toEqual(chad);
    expect(initial(built(world([], true)).model)).toEqual(chad);
  });

  it("walks every drawn dot in x order with Left and Right, Home and End at its ends", () => {
    const b = built(world());
    const right = press(b, chad, ...Array<Key>(6).fill("ArrowRight"));
    expect(right).toEqual([kenya, ghana, albania, norway, monaco, undefined]);
    expect(press(b, monaco, "ArrowLeft", "ArrowLeft")).toEqual([norway, albania]);
    expect(b.nav.move(ghana, "Home", undefined)).toEqual(chad);
    expect(b.nav.move(ghana, "End", undefined)).toEqual(monaco);
    expect(b.nav.move(chad, "ArrowLeft", undefined)).toBe(undefined);
    expect(b.nav.move(chad, "Home", undefined)).toBe(undefined);
  });

  it("walks y order with Up to the next higher value and Down to the next lower", () => {
    const b = built(world());
    const up = press(b, chad, ...Array<Key>(6).fill("ArrowUp"));
    expect(up).toEqual([kenya, ghana, albania, norway, monaco, undefined]);
    expect(press(b, norway, "ArrowDown", "ArrowDown")).toEqual([albania, ghana]);
    expect(b.nav.move(chad, "ArrowDown", undefined)).toBe(undefined);
  });

  it("runs Left and Right as the drawing does on a reversed x", () => {
    const b = built(world([], true));
    expect(b.nav.move(ghana, "ArrowRight", undefined)).toEqual(kenya);
    expect(b.nav.move(ghana, "ArrowLeft", undefined)).toEqual(albania);
    expect(b.nav.move(ghana, "Home", undefined)).toEqual(monaco);
  });

  it("breaks a tie in x by y, and coincident dots by series, then the app's order", () => {
    const b = built({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            { name: "a", names: ["a1", "a2", "a3"], x: [1, 1, 2], y: [5, 3, 5] },
            { name: "b", names: ["b1"], x: [1], y: [3] },
          ],
        },
      ],
    });
    expect(press(b, dot(0, 1), "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight")).toEqual([
      dot(1, 0),
      dot(0, 0),
      dot(0, 2),
      undefined,
    ]);
    // y order: a2 3, b1 3 (x 1 each), then a1 5 (x 1), a3 5 (x 2).
    expect(press(b, dot(0, 1), "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp")).toEqual([
      dot(1, 0),
      dot(0, 0),
      dot(0, 2),
      undefined,
    ]);
  });

  it("pages to the nearest dot at least one x tick away", () => {
    const xs = Array.from({ length: 21 }, (_, i) => i * 5);
    const b = built({
      x: { label: "x", domain: [0, 100] },
      y: { label: "y" },
      marks: [{ mark: "scatter", series: [{ name: "a", names: xs.map(String), x: xs, y: xs }] }],
    });
    const [first, second] = b.lay.xAxis.ticks.map((t) => t.value);
    const step = (second ?? 0) - (first ?? 0);
    expect(step).toBeGreaterThan(5);
    expect(b.nav.pages).toBe(true);
    expect(b.nav.move(dot(0, 0), "PageDown", undefined)).toEqual(dot(0, step / 5));
    expect(b.nav.move(dot(0, 20), "PageUp", undefined)).toEqual(dot(0, 20 - step / 5));
  });

  it("points at the dot whose edge is nearest within 40 px, taps only, with no crosshair along x", () => {
    const b = built(world());
    const f = b.lay.frame;
    const at = (x: number, y: number) => ({ x: f.xAt(x), y: f.yAt(y) });
    const c = at(1.6, 53);
    expect(b.nav.pick(c.x, c.y)).toEqual(chad);
    // Left of the leftmost dot, so no other is as near: 4 px of radius, then 40 of reach.
    expect(b.nav.pick(c.x - 44, c.y)).toEqual(chad);
    expect(b.nav.pick(c.x - 44.5, c.y)).toBe(undefined);
    expect(b.nav.drags).toBe(false);
    expect(b.nav.crosshair(chad)).toBe(undefined);
  });

  it("points at the dot drawn on top among coincident dots: the later series, then the later dot", () => {
    const b = built({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            { name: "a", names: ["a1", "a2"], x: [1, 1], y: [1, 1] },
            { name: "b", names: ["b1", "b2", "b3"], x: [1, 1, 2], y: [1, 1, 2] },
          ],
        },
      ],
    });
    const f = b.lay.frame;
    expect(b.nav.pick(f.xAt(1), f.yAt(1))).toEqual(dot(1, 1));
    const solo = built({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        { mark: "scatter", series: [{ name: "a", names: ["a1", "a2"], x: [1, 1], y: [1, 1] }] },
      ],
    });
    expect(solo.nav.pick(solo.lay.frame.xAt(1), solo.lay.frame.yAt(1))).toEqual(dot(0, 1));
  });

  it("says a dot's name, its series and both measures", () => {
    const b = built(world());
    expect(spoken(b.model, monaco, words, false)).toBe(
      "Monaco: Europe, GDP per capita 140, Life expectancy 85.9.",
    );
    expect(spoken(b.model, chad, words, true)).toBe(
      "Chad: Africa, GDP per capita 1.6, Life expectancy 53.",
    );
    const one = built({
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
      marks: [{ mark: "scatter", series: [{ name: "All", names: ["Chad"], x: [1.6], y: [53] }] }],
    });
    expect(spoken(one.model, dot(0, 0), words, false)).toBe(
      "Chad: GDP per capita 1.6, Life expectancy 53.",
    );
  });

  it("adds a note to the dot at its values, on top among coincident dots, and to no other", () => {
    const note: Mark = { mark: "text", x: 140, y: 85.9, text: "Richest" };
    const b = built(world([note, { mark: "text", x: 50, y: 70, text: "Nowhere" }]));
    expect(spoken(b.model, monaco, words, false)).toBe(
      "Monaco: Europe, GDP per capita 140, Life expectancy 85.9. Note: Richest.",
    );
    expect(spoken(b.model, norway, words, false)).toBe(
      "Norway: Europe, GDP per capita 82, Life expectancy 83.2.",
    );
    const twins = built({
      x: { label: "x" },
      y: { label: "y" },
      marks: [
        {
          mark: "scatter",
          series: [
            { name: "a", names: ["a1"], x: [1], y: [1] },
            { name: "b", names: ["b1"], x: [1], y: [1] },
          ],
        },
        { mark: "text", x: 1, y: 1, text: "Here" },
      ],
    });
    expect(spoken(twins.model, dot(1, 0), words, false)).toBe("b1: b, x 1, y 1. Note: Here.");
    expect(spoken(twins.model, dot(0, 0), words, false)).toBe("a1: a, x 1, y 1.");
  });

  it("keeps a dot by its name across an update, in any series, and leaves with the name", () => {
    const a = built(world()).model;
    const moved = built({
      x: { label: "GDP per capita" },
      y: { label: "Life expectancy" },
      marks: [
        {
          mark: "scatter",
          series: [
            { name: "Rich", names: ["Monaco", "Norway"], x: [150, 90], y: [86, 83] },
            { name: "Poor", names: ["Kosovo", "Chad"], x: [5, 1.7], y: [79, 53] },
          ],
        },
      ],
    }).model;
    expect(rekey(a, monaco, moved)).toEqual(dot(0, 0));
    expect(rekey(a, chad, moved)).toEqual(dot(1, 1));
    expect(rekey(a, ghana, moved)).toBe(undefined);
    expect(rekey(a, { kind: "line", i: 0, part: undefined }, moved)).toBe(undefined);
  });
});

describe("a cell chart's selection", () => {
  const days = ["Mon", "Tue", "Wed"];
  const hours = ["0", "1", "2", "3"];
  const grid = (over: Partial<ChartSpec> = {}): ChartSpec => ({
    colour: { unit: { one: "post", other: "posts" } },
    marks: [
      {
        mark: "cell",
        x: hours,
        y: days,
        values: [
          [3, 0, 1, 2],
          [4, null, 6, 7],
          [8, 9, 10, 11],
        ],
      },
    ],
    ...over,
  });
  const cell = (row: number, column: number): Selection => ({ kind: "cell", row, column });

  it("starts on the first cell in reading order, the top left", () => {
    expect(initial(built(grid()).model)).toEqual(cell(0, 0));
  });

  it("starts on the top right when x runs right to left", () => {
    expect(initial(built(grid({ x: { reverse: true } })).model)).toEqual(cell(0, 3));
  });

  it("moves by cell with the arrows and to the row's ends with Home and End", () => {
    const b = built(grid());
    expect(press(b, cell(1, 1), "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp")).toEqual([
      cell(1, 2),
      cell(2, 2),
      cell(2, 1),
      cell(1, 1),
    ]);
    expect(press(b, cell(1, 1), "End")).toEqual([cell(1, 3)]);
    expect(press(b, cell(1, 1), "Home")).toEqual([cell(1, 0)]);
  });

  it("stops at the grid's edges", () => {
    const b = built(grid());
    expect(press(b, cell(0, 0), "ArrowUp")).toEqual([undefined]);
    expect(press(b, cell(0, 0), "ArrowLeft")).toEqual([undefined]);
    expect(press(b, cell(2, 3), "ArrowDown")).toEqual([undefined]);
    expect(press(b, cell(2, 3), "ArrowRight")).toEqual([undefined]);
  });

  it("moves Right rightward on a reversed x, as the drawing runs", () => {
    expect(press(built(grid({ x: { reverse: true } })), cell(0, 2), "ArrowRight")).toEqual([
      cell(0, 1),
    ]);
  });

  it("pages ten columns on a band x, held at the row's ends", () => {
    const names = Array.from({ length: 24 }, (_, i) => String(i));
    const b = built({
      marks: [{ mark: "cell", x: names, y: ["a"], values: [names.map((_, i) => i)] }],
    });
    expect(press(b, cell(0, 0), "PageDown", "PageDown", "PageDown", "PageUp")).toEqual([
      cell(0, 10),
      cell(0, 20),
      cell(0, 23),
      cell(0, 13),
    ]);
  });

  it("moves Up to the higher bin on a binned y, whose rows run up from the bottom", () => {
    const b = built({
      marks: [
        {
          mark: "cell",
          x: { edges: [0, 10, 20] },
          y: { edges: [0, 5, 10] },
          values: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
    });
    expect(press(b, cell(0, 0), "ArrowUp", "ArrowUp")).toEqual([cell(1, 0), undefined]);
    expect(initial(b.model)).toEqual(cell(1, 0));
  });

  it("pages one x tick on a binned x", () => {
    const edges = Array.from({ length: 101 }, (_, i) => i);
    const b = built({
      marks: [{ mark: "cell", x: { edges }, y: ["a"], values: [edges.slice(1)] }],
    });
    const next = b.nav.move(cell(0, 0), "PageDown", undefined);
    const ticks = b.lay.xAxis.ticks.map((t) => t.value).sort((p, q) => p - q);
    const step = (ticks[1] ?? 0) - (ticks[0] ?? 0);
    expect(next).toEqual(cell(0, step));
  });

  it("picks the cell under the pointer, the cell past a gap, and nothing off the grid", () => {
    const b = built(grid());
    const xs = b.lay.cells?.xs ?? [];
    const ys = b.lay.cells?.ys ?? [];
    const mid = (a: readonly number[], i: number) => ((a[i] ?? 0) + (a[i + 1] ?? 0)) / 2;
    expect(b.nav.pick(mid(xs, 2), mid(ys, 1))).toEqual(cell(1, 2));
    // The 1 px gap between two cells lies on their shared edge.
    expect(b.nav.pick(xs[2] ?? 0, ys[1] ?? 0)).toEqual(cell(1, 2));
    expect(b.nav.pick(-1, mid(ys, 1))).toBeUndefined();
    expect(b.nav.pick(mid(xs, 0), (ys.at(-1) ?? 0) + 1)).toBeUndefined();
  });

  it("drags along the row it began on and draws no crosshair", () => {
    const b = built(grid());
    expect(b.nav.drags).toBe(true);
    expect(b.nav.alongRow).toBe(true);
    expect(b.nav.crosshair(cell(0, 0))).toBeUndefined();
  });

  it("keeps a cell across an update by its column's and row's names", () => {
    const before = built(grid()).model;
    const after = built({
      marks: [
        {
          mark: "cell",
          x: ["3", "2"],
          y: ["Wed", "Tue"],
          values: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
    }).model;
    expect(rekey(before, cell(1, 2), after)).toEqual(cell(1, 1));
    expect(rekey(before, cell(0, 0), after)).toBeUndefined();
  });

  it("says the cell's place and value, and No data for a missing one", () => {
    const { model } = built(grid());
    expect(spoken(model, cell(1, 2), words, false)).toBe("Tue, 2: 6\u00A0posts.");
    expect(spoken(model, cell(1, 1), words, true)).toBe("Tue, 1: No data.");
    expect(spoken(model, cell(0, 0), words, false)).toBe("Mon, 0: 3\u00A0posts.");
  });
});

describe("a calendar's selection", () => {
  const DAY = 86_400_000;
  // From Thursday 1 January 2026, 66 days, weeks from Monday.
  const JAN1 = Date.UTC(2026, 0, 1);
  const calendar = (values: (number | null)[], open = false): ChartSpec => ({
    colour: { unit: { one: "post", other: "posts" } },
    marks: [{ mark: "cell", days: { start: JAN1, values, open }, weekStart: 1 }],
  });
  const days = (n: number) => Array.from({ length: n }, (_, i) => i % 7);
  const day = (i: number): Selection => ({ kind: "day", i });
  const b = built(calendar(days(66)));

  it("starts on the newest day", () => {
    expect(initial(b.model)).toEqual(day(65));
    expect(initial(built(calendar([])).model)).toBeUndefined();
  });

  it("moves a week with Left and Right, a day with Up and Down, and to the ends with Home and End", () => {
    expect(press(b, day(10), "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp")).toEqual([
      day(17),
      day(10),
      day(11),
      day(10),
    ]);
    expect(press(b, day(10), "Home")).toEqual([day(0)]);
    expect(press(b, day(10), "End")).toEqual([day(65)]);
    expect(press(b, day(3), "ArrowLeft")).toEqual([undefined]);
    expect(press(b, day(0), "ArrowUp")).toEqual([undefined]);
    expect(press(b, day(60), "ArrowRight")).toEqual([undefined]);
    expect(press(b, day(65), "ArrowDown")).toEqual([undefined]);
  });

  it("pages to the same date a month away, the month's last day when it has none, held at the ends", () => {
    // 31 January, then 28 February, then 28 January.
    expect(press(b, day(30), "PageDown", "PageUp")).toEqual([day(58), day(27)]);
    expect(press(b, day(45), "PageDown")).toEqual([day(65)]);
    expect(press(b, day(20), "PageUp")).toEqual([day(0)]);
    expect(press(b, day(0), "PageUp")).toEqual([undefined]);
  });

  it("picks the day under the pointer, and nothing above the weeks or outside the days", () => {
    const g = b.lay.days;
    const at = (column: number, row: number) =>
      b.nav.pick((column + 0.5) * (g?.column ?? 0), (g?.tops[0] ?? 0) + (row + 0.5) * 24);
    // Thursday 1 January is in the first column's fourth row, 8 January the next column's.
    expect(at(0, 3)).toEqual(day(0));
    expect(at(1, 3)).toEqual(day(7));
    expect(at(0, 2)).toBeUndefined();
    expect(b.nav.pick(1, (g?.tops[0] ?? 0) - 1)).toBeUndefined();
    expect(b.nav.alongRow).toBe(true);
  });

  it("keeps a day across an update by its date", () => {
    const later: ChartSpec = {
      marks: [{ mark: "cell", days: { start: JAN1 + 7 * DAY, values: days(66) } }],
    };
    expect(rekey(b.model, day(10), chartModel(later, "en", "UTC"))).toEqual(day(3));
    expect(rekey(b.model, day(3), chartModel(later, "en", "UTC"))).toBeUndefined();
  });

  it("says the day's date and value, so far on an open last day, and No data for a missing one", () => {
    const model = built(calendar([3, null, 1], true)).model;
    expect(spoken(model, day(0), words, false)).toBe("Thursday, January 1, 2026: 3\u00A0posts.");
    expect(spoken(model, day(1), words, false)).toBe("Friday, January 2, 2026: No data.");
    expect(spoken(model, day(2), words, false)).toBe(
      "Saturday, January 3, 2026, so far: 1\u00A0post.",
    );
  });
});
