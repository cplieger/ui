import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server } from "vitest/browser";

import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type ChartSpec } from "./chart.js";
import { events, grid, named, points, seriesFrame, tree } from "./test-helpers/frames.js";

// A render's cost is its main-thread CPU time over a fixed reference
// workload's, measured beside it, so a loaded runner slows both alike. Each
// case states the cost it measures, and the bound of 1.5 times that passes
// load's noise (up to a fifth) and fails a render that doubles.
const SLACK = 1.5;
// The target is a 2 ms move of script time; this bound leaves room for a
// slow runner and still fails one DOM node per point.
const MOVE_MS = 8;
const MIN = 60_000;
const START = Date.UTC(2026, 10, 9, 13);
const HOURS_72 = 72 * 60 * MIN;
const chromium = server.browser === "chromium";
let sheet: HTMLLinkElement;
const hosts: HTMLElement[] = [];
const lives: AbortController[] = [];

beforeEach(async () => {
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
  document.documentElement.classList.add("cp");
  if (chromium) {
    await cdp().send("Performance.enable", { timeDomain: "threadTicks" });
  }
});

afterEach(async () => {
  if (chromium) {
    await cdp().send("Performance.disable");
  }
  for (const life of lives.splice(0)) {
    life.abort();
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  document.documentElement.classList.remove("cp");
  forgetMeasures();
});

function figure(): HTMLElement {
  const box = document.createElement("div");
  box.style.inlineSize = "1200px";
  document.body.append(box);
  hosts.push(box);
  box.innerHTML = `<figure class="cp-chart"><figcaption>A chart</figcaption></figure>`;
  return box.querySelector("figure") as HTMLElement;
}

interface Metrics {
  readonly metrics: readonly { readonly name: string; readonly value: number }[];
}

// The main thread's CPU time in ms, which a busy runner's other work does
// not inflate as it does wall time.
async function cpu(): Promise<number> {
  const { metrics } = (await cdp().send("Performance.getMetrics")) as Metrics;
  return (metrics.find((m) => m.name === "ThreadTime")?.value ?? Number.NaN) * 1000;
}

const RUNS = 9;

/** Builds and lays out six 4,000-point paths with 240 formatted labels, the
 *  same kinds of work a chart's render does. */
function reference(): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  const ys = Array.from({ length: 4_000 }, (_, i) => Math.sin(i * 0.37) * 100);
  const format = new Intl.NumberFormat("en-GB");
  for (let k = 0; k < 6; k++) {
    let d = "M0 0";
    for (let i = 0; i < ys.length; i++) {
      d += `L${(i / 4).toFixed(2)} ${(ys[i] ?? 0).toFixed(2)}`;
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
    for (let i = 0; i < 40; i++) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = format.format(i * 1234.5);
      svg.append(text);
    }
  }
  svg.getBoundingClientRect();
  svg.remove();
}

/** The median of nine renders' cost, each against the reference run just
 *  before it, after a small chart of the same kind: the first large render
 *  also pays the engine's one-time Intl, font and compile work. */
async function costOf(
  render: () => HTMLElement,
  small?: () => void,
): Promise<{ cost: number; fig: HTMLElement }> {
  small?.();
  reference();
  const costs: number[] = [];
  let fig: HTMLElement | null = null;
  for (let k = 0; k < RUNS; k++) {
    const r0 = await cpu();
    reference();
    const ref = (await cpu()) - r0;
    const t0 = await cpu();
    fig = render();
    costs.push(((await cpu()) - t0) / ref);
  }
  costs.sort((a, b) => a - b);
  return { cost: costs[(RUNS - 1) / 2] ?? Infinity, fig: fig as HTMLElement };
}

async function timed(
  spec: ChartSpec,
  small: ChartSpec,
): Promise<{ cost: number; plot: HTMLElement }> {
  const life = new AbortController();
  lives.push(life);
  const draw = (s: ChartSpec): HTMLElement => {
    const fig = figure();
    renderChart(fig, s, { signal: life.signal });
    return fig;
  };
  const { cost, fig } = await costOf(
    () => draw(spec),
    () => draw(small),
  );
  return { cost, plot: fig.querySelector('[data-part="plot"]') as HTMLElement };
}

const MOVES = 21;

// The mean of 21 moves across the plot, or across one panel's.
async function moveMs(plot: HTMLElement): Promise<number> {
  const box = plot.getBoundingClientRect();
  const t0 = await cpu();
  for (let k = 0; k < MOVES; k++) {
    plot.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: box.left + (box.width * (k + 1)) / (MOVES + 2),
        clientY: box.top + box.height / 2,
        pointerType: "mouse",
        bubbles: true,
      }),
    );
  }
  return ((await cpu()) - t0) / MOVES;
}

const minutes = Array.from({ length: 4_320 }, (_, i) => START + i * MIN);
const stepLine: ChartSpec = {
  x: { type: "time", domain: [START, START + HOURS_72] },
  y: { label: "Agents" },
  data: seriesFrame(minutes, [], {
    series: named(
      ["Live", minutes.map((_, i) => 4 + ((i * 7) % 9))],
      ["Active", minutes.map((_, i) => (i * 5) % 7)],
    ),
  }),
  mark: { mark: "line", curve: "step" },
};

// 8,640 distinct response times, from 100 ms to 90 s.
const durationLine: ChartSpec = {
  ...stepLine,
  y: { label: "Response time" },
  data: seriesFrame(minutes, [], {
    unit: "seconds",
    series: [50, 95].map((p, k) => ({
      key: `p${String(p)}`,
      values: minutes.map((_, i) => (100 + ((i * 7_919 + k * 104_729) % 89_900)) / 1_000),
    })),
  }),
};

// Three layers of 4,320 samples each, a stacked area over 72 hours.
const stackedArea: ChartSpec = {
  x: { type: "time", domain: [START, START + HOURS_72] },
  data: seriesFrame(minutes, [], {
    series: named(
      ["Gas", minutes.map((_, i) => 40 + ((i * 7) % 13))],
      ["Wind", minutes.map((_, i) => 10 + ((i * 5) % 17))],
      ["Solar", minutes.map((_, i) => (i * 3) % 11)],
    ),
  }),
  mark: { mark: "area" },
};

// 20,000 posts over 29 agents, spread unevenly along 72 hours.
const posts = events(
  Object.fromEntries(
    Array.from({ length: 29 }, (_, r) => {
      const n = r < 4 ? 0 : Math.ceil((20_000 * (r + 1)) / 425);
      return [
        `agent-${String(r)}`,
        Array.from({ length: n }, (_, i) => START + Math.floor((i * HOURS_72) / n)),
      ];
    }),
  ),
);
const timeline: ChartSpec = {
  x: { domain: [START, START + HOURS_72] },
  y: { type: "band", mono: true },
  data: posts,
  mark: { mark: "dot" },
};

const few: ChartSpec = {
  ...stepLine,
  data: seriesFrame(minutes.slice(0, 3), [], {
    series: named(["Live", [1, 2, 3]], ["Active", [0, 1, 1]]),
  }),
};
const fewDurations: ChartSpec = {
  ...few,
  data: seriesFrame(minutes.slice(0, 3), [[1, 2, 3]], { unit: "seconds" }),
};
const fewLayers: ChartSpec = {
  ...stackedArea,
  data: seriesFrame(minutes.slice(0, 3), [
    [1, 2, 3],
    [0, 1, 1],
    [1, 1, 1],
  ]),
};
const fewDots: ChartSpec = { ...timeline, data: events({ a: minutes.slice(0, 3) }) };

// 10,000 dots in five series, spread over both axes by two coprime strides.
const scatter: ChartSpec = {
  x: { label: "GDP per capita" },
  y: { label: "Life expectancy" },
  data: points(
    Array.from({ length: 5 }, (_, k) => ({
      key: `Region ${String(k + 1)}`,
      names: Array.from({ length: 2_000 }, (_, i) => `place-${String(k)}-${String(i)}`),
      x: Array.from({ length: 2_000 }, (_, i) => 500 + ((i * 7_919 + k * 104_729) % 99_500)),
      y: Array.from({ length: 2_000 }, (_, i) => 50 + ((i * 6_007 + k * 3_571) % 4_000) / 100),
    })),
  ),
  mark: { mark: "scatter" },
};
const fewPlaces: ChartSpec = {
  ...scatter,
  data: points([{ key: "a", names: ["a", "b"], x: [1, 2], y: [3, 4] }]),
};

// 2,000 bubbles in five series, sized over four orders of magnitude.
const bubbles: ChartSpec = {
  ...scatter,
  r: { label: "Population" },
  data: points(
    Array.from({ length: 5 }, (_, k) => ({
      key: `Region ${String(k + 1)}`,
      names: Array.from({ length: 400 }, (_, i) => `place-${String(k)}-${String(i)}`),
      x: Array.from({ length: 400 }, (_, i) => 500 + ((i * 7_919 + k * 104_729) % 99_500)),
      y: Array.from({ length: 400 }, (_, i) => 50 + ((i * 6_007 + k * 3_571) % 4_000) / 100),
      r: Array.from({ length: 400 }, (_, i) => 10 ** (3 + ((i * 37 + k * 11) % 400) / 100)),
    })),
  ),
};
const fewBubbles: ChartSpec = {
  ...bubbles,
  data: points([{ key: "a", names: ["a", "b"], x: [1, 2], y: [3, 4], r: [5, 6] }]),
};

// A 2D histogram of 100 by 100 bins, 10,000 cells, every 97th missing.
const edges = Array.from({ length: 101 }, (_, i) => i * 10);
const histogram2d: ChartSpec = {
  x: { label: "Price" },
  y: { label: "Rating" },
  data: grid(
    { edges },
    { edges },
    Array.from({ length: 100 }, (_, r) =>
      Array.from({ length: 100 }, (_, c) =>
        (r * 100 + c) % 97 === 0 ? null : (r * 7 + c * 13) % 50,
      ),
    ),
  ),
  mark: { mark: "cell" },
};
const fewCells: ChartSpec = {
  ...histogram2d,
  data: grid({ edges: [0, 1] }, { edges: [0, 1] }, [[1]]),
};

// A treemap of 1,000 parts in 9 groups of a long tail each.
const countries = Array.from({ length: 9 }, (_, g) => ({
  key: `Region ${String(g + 1)}`,
  children: Array.from({ length: g < 1 ? 112 : 111 }, (_, i) => ({
    key: `Country ${String(g)}-${String(i)}`,
    value: 1e12 / (1 + i + g * 7),
  })),
}));
const treemap: ChartSpec = {
  data: tree({ groups: countries }, { unit: "none" }),
  mark: { mark: "tree", unit: { other: "USD" }, format: { notation: "compact" } },
};
const fewParts: ChartSpec = {
  data: tree({ parts: [{ key: "a", value: 1 }] }),
  mark: { mark: "tree" },
};

// The step line's 8,640 values and the stacked area's three layers of
// 4,320 samples, each split across panels: a figure's budget is summed over
// its panels, since one task draws them all.
const regions = ["North", "South", "East", "West", "Centre", "Coast"];
const hours12 = minutes.slice(0, 1_440);
const linePanels: ChartSpec = {
  x: { type: "time", domain: [START, START + 1_439 * MIN] },
  y: { label: "Agents" },
  mark: { mark: "line", curve: "step" },
  facets: {
    panels: regions.map((key, k) => ({
      key,
      data: seriesFrame(hours12, [], {
        series: named([key, hours12.map((_, i) => 4 + ((i * 7 + k) % 9))]),
      }),
    })),
  },
};
const fewLinePanels: ChartSpec = {
  ...linePanels,
  facets: {
    panels: regions.slice(0, 2).map((key) => ({
      key,
      data: seriesFrame(hours12.slice(0, 3), [], { series: named([key, [1, 2, 3]]) }),
    })),
  },
};
const hours18 = minutes.slice(0, 1_080);
const areaPanels: ChartSpec = {
  x: { type: "time", domain: [START, START + 1_079 * MIN] },
  mark: { mark: "area" },
  facets: {
    panels: regions.slice(0, 4).map((name, k) => ({
      key: name,
      name,
      data: seriesFrame(hours18, [], {
        series: named(
          ["Gas", hours18.map((_, i) => 40 + ((i * 7 + k) % 13))],
          ["Wind", hours18.map((_, i) => 10 + ((i * 5 + k) % 17))],
          ["Solar", hours18.map((_, i) => (i * 3 + k) % 11)],
        ),
      }),
    })),
  },
};
const fewAreaPanels: ChartSpec = {
  ...areaPanels,
  facets: {
    panels: regions.slice(0, 2).map((name) => ({
      key: name,
      name,
      data: seriesFrame(hours18.slice(0, 3), [], {
        series: named(["Gas", [1, 2, 3]], ["Wind", [0, 1, 1]], ["Solar", [1, 1, 1]]),
      }),
    })),
  },
};

describe("performance", () => {
  it.skipIf(!chromium)("renders a 72-hour step line of 8,640 values within its bound", async () => {
    const { cost, plot } = await timed(stepLine, few);
    expect(cost).toBeLessThan(1.05 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)(
    "renders a 72-hour step line of 8,640 distinct durations within its bound",
    async () => {
      const { cost, plot } = await timed(durationLine, fewDurations);
      expect(cost).toBeLessThan(1.1 * SLACK);
      expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
    },
  );

  it.skipIf(!chromium)(
    "renders a 72-hour stacked area of three layers of 4,320 samples within its bound",
    async () => {
      const { cost, plot } = await timed(stackedArea, fewLayers);
      expect(cost).toBeLessThan(1.3 * SLACK);
      expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
    },
  );

  it.skipIf(!chromium)(
    "renders six line panels of 1,440 values each within the step line's bound",
    async () => {
      const { cost, plot } = await timed(linePanels, fewLinePanels);
      expect(plot.querySelectorAll('[data-part="panel"]')).toHaveLength(6);
      expect(cost).toBeLessThan(1.2 * SLACK);
      const frame = plot.querySelector<HTMLElement>('[data-part="frame"]') as HTMLElement;
      expect(await moveMs(frame)).toBeLessThan(MOVE_MS);
    },
  );

  it.skipIf(!chromium)(
    "renders four stacked area panels of three layers of 1,080 samples within the area's bound",
    async () => {
      const { cost, plot } = await timed(areaPanels, fewAreaPanels);
      expect(plot.querySelectorAll('[data-part="layers"] > path')).toHaveLength(12);
      expect(cost).toBeLessThan(1.6 * SLACK);
      const frame = plot.querySelector<HTMLElement>('[data-part="frame"]') as HTMLElement;
      expect(await moveMs(frame)).toBeLessThan(MOVE_MS);
    },
  );

  it.skipIf(!chromium)("renders a scatter plot of 10,000 dots within its bound", async () => {
    const { cost, plot } = await timed(scatter, fewPlaces);
    expect(plot.querySelectorAll('[data-part="scatter"] > path')).toHaveLength(5);
    expect(cost).toBeLessThan(1.5 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)("renders a bubble chart of 2,000 bubbles within its bound", async () => {
    const { cost, plot } = await timed(bubbles, fewBubbles);
    const paths = [...plot.querySelectorAll('[data-part="scatter"] > path')];
    expect(paths.reduce((n, p) => n + (p.getAttribute("d")?.match(/Z/g) ?? []).length, 0)).toBe(
      2_000,
    );
    expect(cost).toBeLessThan(1.1 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)("renders a 2D histogram of 10,000 cells within its bound", async () => {
    const { cost, plot } = await timed(histogram2d, fewCells);
    // One path per class and one for the missing cells' outlines.
    expect(plot.querySelectorAll('[data-part="cell"] > path')).toHaveLength(6);
    expect(cost).toBeLessThan(1.1 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)("renders a treemap of 1,000 parts within its bound", async () => {
    expect(countries.reduce((n, g) => n + g.children.length, 0)).toBe(1_000);
    const { cost, plot } = await timed(treemap, fewParts);
    // One path per group's slot.
    expect(plot.querySelectorAll('[data-part="tree"] > path')).toHaveLength(9);
    expect(cost).toBeLessThan(1.25 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)("renders a timeline of 20,000 dots within its bound", async () => {
    expect(posts.rows.reduce((n, r) => n + r.at.length, 0)).toBeGreaterThanOrEqual(20_000);
    const { cost, plot } = await timed(timeline, fewDots);
    expect(cost).toBeLessThan(0.9 * SLACK);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });
});

// A line of three points; only ticks generated across the span's days
// could make it cost more than its bound.
describe("a time axis over a long span", () => {
  const year = (y: number) => new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(y);

  it.skipIf(!chromium).each([
    ["10,000 years", year(-3000), year(7000)],
    ["all that Date holds", -8.64e15, 8.64e15],
  ])("renders a line over %s within the render bound", async (_, lo, hi) => {
    const spec: ChartSpec = {
      x: { type: "time", domain: [lo, hi] },
      data: seriesFrame([lo, 0, hi], [[1, 3, 2]]),
      mark: { mark: "line" },
    };
    const { cost, plot } = await timed(spec, spec);
    const fig = plot.closest("figure") as HTMLElement;
    expect(fig.querySelectorAll('[data-part="x"] text').length).toBeGreaterThan(2);
    expect(cost).toBeLessThan(0.55 * SLACK);
  });
});
