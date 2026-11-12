import { describe, expect, it } from "vitest";

import { formatDuration } from "../scale/format.js";
import { measurer } from "../scale/measure.js";

import { layout, type Layout, type Metrics } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import { navigator, rekey, spoken, initial, type Key, type Selection } from "./select.js";
import type { ChartSpec } from "./spec.js";
import { chartWords } from "./words.js";

const face = measurer((t) => 7.5 * Array.from(t).length, 7.5, "en");
const metrics: Metrics = {
  measure: face,
  mono: face,
  lineHeight: 17,
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
