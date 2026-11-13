import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server } from "vitest/browser";

import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type ChartSpec } from "./chart.js";

// The targets are a 16 ms render and a 2 ms move of script time; these
// bounds leave room for a slow runner and still fail one DOM node per point.
const RENDER_MS = 50;
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

const RUNS = 3;

// The fastest of three renders, after a small chart of the same kind, so the
// bound measures what the data costs: the first large render also pays the
// engine's one-time Intl, font and compile work, about twice the rest.
async function timed(
  spec: ChartSpec,
  small: ChartSpec,
): Promise<{ ms: number; plot: HTMLElement }> {
  const life = new AbortController();
  lives.push(life);
  renderChart(figure(), small, { signal: life.signal });
  let ms = Infinity;
  let plot: HTMLElement | null = null;
  for (let k = 0; k < RUNS; k++) {
    const fig = figure();
    const t0 = await cpu();
    renderChart(fig, spec, { signal: life.signal });
    ms = Math.min(ms, (await cpu()) - t0);
    plot = fig.querySelector('[data-part="plot"]');
  }
  return { ms, plot: plot as HTMLElement };
}

const MOVES = 21;

// The mean of 21 moves across the plot.
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
  marks: [
    {
      mark: "line",
      curve: "step",
      x: minutes,
      series: [
        { name: "Live", y: minutes.map((_, i) => 4 + ((i * 7) % 9)) },
        { name: "Active", y: minutes.map((_, i) => (i * 5) % 7) },
      ],
    },
  ],
};

// Three layers of 4,320 samples each, a stacked area over 72 hours.
const stackedArea: ChartSpec = {
  x: { type: "time", domain: [START, START + HOURS_72] },
  marks: [
    {
      mark: "area",
      x: minutes,
      series: [
        { name: "Gas", y: minutes.map((_, i) => 40 + ((i * 7) % 13)) },
        { name: "Wind", y: minutes.map((_, i) => 10 + ((i * 5) % 17)) },
        { name: "Solar", y: minutes.map((_, i) => (i * 3) % 11) },
      ],
    },
  ],
};

// 20,000 posts over 29 agents, spread unevenly along 72 hours.
const timeline: ChartSpec = {
  x: { type: "time", domain: [START, START + HOURS_72] },
  y: { type: "band", mono: true },
  marks: [
    {
      mark: "dot",
      rows: Array.from({ length: 29 }, (_, r) => {
        const n = r < 4 ? 0 : Math.ceil((20_000 * (r + 1)) / 425);
        return {
          name: `agent-${String(r)}`,
          x: Array.from({ length: n }, (_, i) => START + Math.floor((i * HOURS_72) / n)),
        };
      }),
    },
  ],
};

const few: ChartSpec = {
  ...stepLine,
  marks: [
    {
      mark: "line",
      curve: "step",
      x: minutes.slice(0, 3),
      series: [
        { name: "Live", y: [1, 2, 3] },
        { name: "Active", y: [0, 1, 1] },
      ],
    },
  ],
};
const fewLayers: ChartSpec = {
  ...stackedArea,
  marks: [
    {
      mark: "area",
      x: minutes.slice(0, 3),
      series: [
        { name: "Gas", y: [1, 2, 3] },
        { name: "Wind", y: [0, 1, 1] },
        { name: "Solar", y: [1, 1, 1] },
      ],
    },
  ],
};
const fewDots: ChartSpec = {
  ...timeline,
  marks: [{ mark: "dot", rows: [{ name: "a", x: minutes.slice(0, 3) }] }],
};

// 10,000 dots in five series, spread over both axes by two coprime strides.
const scatter: ChartSpec = {
  x: { label: "GDP per capita" },
  y: { label: "Life expectancy" },
  marks: [
    {
      mark: "scatter",
      series: Array.from({ length: 5 }, (_, k) => ({
        name: `Region ${String(k + 1)}`,
        names: Array.from({ length: 2_000 }, (_, i) => `place-${String(k)}-${String(i)}`),
        x: Array.from({ length: 2_000 }, (_, i) => 500 + ((i * 7_919 + k * 104_729) % 99_500)),
        y: Array.from({ length: 2_000 }, (_, i) => 50 + ((i * 6_007 + k * 3_571) % 4_000) / 100),
      })),
    },
  ],
};
const fewPlaces: ChartSpec = {
  ...scatter,
  marks: [{ mark: "scatter", series: [{ name: "a", names: ["a", "b"], x: [1, 2], y: [3, 4] }] }],
};

describe("performance", () => {
  it.skipIf(!chromium)("renders a 72-hour step line of 8,640 values within its bound", async () => {
    const { ms, plot } = await timed(stepLine, few);
    expect(ms).toBeLessThan(RENDER_MS);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)(
    "renders a 72-hour stacked area of three layers of 4,320 samples within its bound",
    async () => {
      const { ms, plot } = await timed(stackedArea, fewLayers);
      expect(ms).toBeLessThan(RENDER_MS);
      expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
    },
  );

  it.skipIf(!chromium)("renders a scatter plot of 10,000 dots within its bound", async () => {
    const { ms, plot } = await timed(scatter, fewPlaces);
    expect(plot.querySelectorAll('[data-part="scatter"] > path')).toHaveLength(5);
    expect(ms).toBeLessThan(RENDER_MS);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });

  it.skipIf(!chromium)("renders a timeline of 20,000 dots within its bound", async () => {
    const dots = timeline.marks[0]?.mark === "dot" ? timeline.marks[0].rows : [];
    expect(dots.reduce((n, r) => n + r.x.length, 0)).toBeGreaterThanOrEqual(20_000);
    const { ms, plot } = await timed(timeline, fewDots);
    expect(ms).toBeLessThan(RENDER_MS);
    expect(await moveMs(plot)).toBeLessThan(MOVE_MS);
  });
});
