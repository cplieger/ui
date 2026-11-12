import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type Chart, type ChartSpec } from "./chart.js";
import { AREA_ROOM } from "./draw.js";

const root = document.documentElement;
const emulates = server.browser === "chromium";
const MIN = 60_000;
const START = Date.UTC(2026, 10, 11, 8);
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
  root.classList.add("cp");
  const life = new AbortController();
  lives.push(life);
  installAnnouncer({ signal: life.signal });
});

afterEach(async () => {
  if (emulates) {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  for (const life of lives.splice(0)) {
    life.abort();
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  root.classList.remove("cp");
  forgetMeasures();
});

const time = (minute: number) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    START + minute * MIN,
  );
const span = (a: number, b: number) => `${time(a)} to ${time(b)}`;
const nb = "\u00A0";

const bars: ChartSpec = {
  x: { type: "time", domain: [START, START + 60 * MIN] },
  y: { label: "Posts", unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: [0, 15, 30, 45].map((m) => START + m * MIN),
      x2: [15, 30, 45, 60].map((m) => START + m * MIN),
      series: [
        { name: "Announce", y: [12, 3, 5, 2] },
        { name: "Path", y: [9, 1, 4, 1] },
      ],
    },
  ],
};

const step: ChartSpec = {
  x: { type: "time", domain: [START, START + 7 * MIN] },
  y: { label: "Agents" },
  marks: [
    {
      mark: "line",
      curve: "step",
      x: Array.from({ length: 8 }, (_, i) => START + i * MIN),
      series: [
        { name: "Live", y: [null, null, 4, 4, 4, 10, 10, 10] },
        { name: "Active", y: [null, null, 1, 1, 2, 2, 2, 2] },
      ],
    },
  ],
};

const strip = (rows: { name: string; x: number[] }[]): ChartSpec => ({
  x: { type: "time", domain: [START, START + 60 * MIN] },
  y: { type: "band", unit: { one: "agent", other: "agents" } },
  marks: [{ mark: "dot", unit: { one: "post", other: "posts" }, rows }],
});
const agents = strip([
  { name: "lead-ui", x: [10, 20, 40].map((m) => START + m * MIN) },
  { name: "docs-bot", x: [] },
  { name: "ha-agent", x: [5, 38].map((m) => START + m * MIN) },
]);

interface Built {
  readonly figure: HTMLElement;
  readonly plot: HTMLElement;
  readonly legend: HTMLElement;
  readonly life: AbortController;
  readonly chart: Chart;
}

function build(spec: ChartSpec | null, width = 600): Built {
  const box = document.createElement("div");
  box.style.inlineSize = `${String(width)}px`;
  document.body.append(box);
  hosts.push(box);
  box.innerHTML = `<button type="button">Before</button><figure class="cp-chart" lang="en"><figcaption>Posts</figcaption></figure><button type="button">After</button>`;
  const figure = box.querySelector("figure") as HTMLElement;
  const life = new AbortController();
  lives.push(life);
  const chart = renderChart(figure, spec, { signal: life.signal, timeZone: "UTC" });
  return {
    figure,
    get plot() {
      return figure.querySelector<HTMLElement>(':scope > [data-part="plot"]') as HTMLElement;
    },
    legend: figure.querySelector<HTMLElement>(':scope > [data-part="legend"]') as HTMLElement,
    life,
    chart,
  };
}

const polite = () => document.querySelector('[aria-live="polite"]')?.textContent ?? "";
const legendText = (b: Built) =>
  [...b.legend.querySelectorAll("bdi, [data-part='value']")]
    .map((el) => el.textContent)
    .filter((t) => t !== "")
    .join(" · ");
const ring = (b: Built) => b.plot.querySelector('[data-part="ring"]');
const crosshair = (b: Built) => b.plot.querySelector('[data-part="crosshair"]');

function key(el: HTMLElement, name: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

async function says(text: string): Promise<void> {
  await expect.poll(polite).toBe(text);
}

// A pointer event at plot px (x, y), from the plot's drawing area.
function point(
  b: Built,
  type: string,
  x: number,
  y: number,
  pointerType = "mouse",
  target: Element = b.plot,
): void {
  const svg = b.plot.querySelector("svg") as SVGSVGElement;
  const area = svg.querySelector('[data-part="area"]') as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  const left = Number(area.getAttribute("x")) + AREA_ROOM;
  const top = Number(area.getAttribute("y")) + AREA_ROOM;
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: box.left + left + x,
      clientY: box.top + top + y,
      pointerType,
      pointerId: pointerType === "mouse" ? 1 : 7,
      bubbles: type !== "pointerleave",
      cancelable: true,
    }),
  );
}

const plotWidth = (b: Built) =>
  Number(b.plot.querySelector('[data-part="area"]')?.getAttribute("width")) - 2 * AREA_ROOM;

describe("keys on a stacked bar chart", () => {
  it("focus selects the newest bucket and says it", async () => {
    const b = build(bars);
    b.plot.focus();
    await says(`${span(45, 60)}: Announce 2, Path 1. Total 3.`);
    expect(legendText(b)).toBe(`${span(45, 60)} · Announce · 2 · Path · 1 · 3`);
    expect(ring(b)).not.toBe(null);
    expect(crosshair(b)).not.toBe(null);
  });

  it("says each key's move, one segment for Up and Down", async () => {
    const b = build(bars);
    b.plot.focus();
    const cases: [string, string][] = [
      ["Home", `${span(0, 15)}: Announce 12, Path 9. Total 21.`],
      ["ArrowRight", `${span(15, 30)}: Announce 3, Path 1. Total 4.`],
      ["ArrowUp", `${span(15, 30)}: Announce 3.`],
      ["ArrowUp", `${span(15, 30)}: Path 1.`],
      ["ArrowDown", `${span(15, 30)}: Announce 3.`],
      ["ArrowLeft", `${span(0, 15)}: Announce 12, Path 9. Total 21.`],
      ["End", `${span(45, 60)}: Announce 2, Path 1. Total 3.`],
      ["PageUp", ""],
      ["PageDown", `${span(45, 60)}: Announce 2, Path 1. Total 3.`],
    ];
    for (const [name, text] of cases) {
      const e = key(b.plot, name);
      expect(e.defaultPrevented, name).toBe(true);
      if (text !== "") {
        await says(text);
      }
    }
  });

  it("Escape with a selection clears it and is cancelled; with none it passes and focus stays", () => {
    const b = build(bars);
    b.plot.focus();
    expect(ring(b)).not.toBe(null);
    expect(key(b.plot, "Escape").defaultPrevented).toBe(true);
    expect(ring(b)).toBe(null);
    expect(crosshair(b)).toBe(null);
    expect(legendText(b)).toBe(`${span(0, 60)} · Announce · 22 · Path · 15 · 37`);
    expect(key(b.plot, "Escape").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b.plot);
  });

  it("the next arrow after Escape brings the selection back", async () => {
    const b = build(bars);
    b.plot.focus();
    key(b.plot, "Home");
    key(b.plot, "Escape");
    key(b.plot, "ArrowRight");
    await says(`${span(0, 15)}: Announce 12, Path 9. Total 21.`);
    expect(ring(b)).not.toBe(null);
  });

  it("Tab lands on the plot, named by its short description and described by its how-to", async () => {
    const b = build(bars);
    (b.figure.previousElementSibling as HTMLElement).focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(b.plot);
    await expect
      .element(b.plot)
      .toHaveAccessibleName(`Stacked bar chart, 2 series, ${span(0, 60)}`);
    await expect
      .element(b.plot)
      .toHaveAccessibleDescription("Arrow keys read the values. Tab leaves the chart.");
    await says(`${span(45, 60)}: Announce 2, Path 1. Total 3.`);
  });

  it("never cancels Tab, Space or Enter, and Tab leaves the plot", async () => {
    const b = build(bars);
    b.plot.focus();
    for (const name of ["Tab", " ", "Enter"]) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(false);
    }
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).not.toBe(b.plot);
    expect(ring(b)).toBe(null);
  });

  it("keeps the selected bucket across an update while its x is in the data", () => {
    const b = build(bars);
    b.plot.focus();
    key(b.plot, "Home");
    b.chart.update({
      ...bars,
      marks: [
        {
          mark: "rect",
          x1: [0, 15].map((m) => START + m * MIN),
          x2: [15, 30].map((m) => START + m * MIN),
          series: [
            { name: "Announce", y: [13, 1] },
            { name: "Path", y: [9, 1] },
          ],
        },
      ],
    });
    expect(legendText(b)).toBe(`${span(0, 15)} · Announce · 13 · Path · 9 · 22`);
    expect(ring(b)).not.toBe(null);
  });

  it("drops the selection on loading(), and the next focus starts afresh", () => {
    const b = build(bars);
    b.plot.focus();
    key(b.plot, "Home");
    b.chart.loading();
    b.chart.update(bars);
    expect(ring(b)).toBe(null);
    b.plot.focus();
    expect(legendText(b)).toBe(`${span(45, 60)} · Announce · 2 · Path · 1 · 3`);
  });

  it("tears down to the no-selection legend row, deaf to keys and pointers", () => {
    const b = build(bars);
    b.plot.focus();
    key(b.plot, "Home");
    b.life.abort();
    const none = `${span(0, 60)} · Announce · 22 · Path · 15 · 37`;
    expect(legendText(b)).toBe(none);
    expect(ring(b)).toBe(null);
    expect(key(b.plot, "ArrowLeft").defaultPrevented).toBe(false);
    point(b, "pointermove", 10, 10);
    expect(legendText(b)).toBe(none);
    expect(ring(b)).toBe(null);
  });
});

describe("keys on a step line", () => {
  it("step through the leading gap, the first sample, each change and the last sample", async () => {
    const b = build(step);
    b.plot.focus();
    await says(`${time(7)}: Live 10, Active 2.`);
    key(b.plot, "Home");
    await says(`${time(0)}: No data.`);
    const stops = [2, 4, 5, 7];
    for (const m of stops) {
      key(b.plot, "ArrowRight");
      await says(`${time(m)}: Live ${String(m < 5 ? 4 : 10)}, Active ${String(m < 4 ? 1 : 2)}.`);
    }
  });
});

describe("keys on a timeline", () => {
  it("focus starts on the first row's last post", async () => {
    const b = build(agents);
    b.plot.focus();
    await says(`lead-ui: ${time(40)}.`);
    expect(legendText(b)).toBe(`lead-ui · ${time(40)}`);
  });

  it("focus on a silent first row selects the row", async () => {
    const b = build(
      strip([
        { name: "docs-bot", x: [] },
        { name: "a", x: [START] },
      ]),
    );
    b.plot.focus();
    await says("docs-bot: no posts");
    expect(crosshair(b)).toBe(null);
    expect(ring(b)).not.toBe(null);
  });

  it("Up and Down land on a silent row, which Left, Right, Home and End leave, then reach the nearest post", async () => {
    const b = build(agents);
    b.plot.focus();
    key(b.plot, "ArrowDown");
    await says("docs-bot: no posts");
    expect(crosshair(b)).toBe(null);
    const before = legendText(b);
    for (const name of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(key(b.plot, name).defaultPrevented).toBe(true);
      expect(legendText(b)).toBe(before);
    }
    key(b.plot, "ArrowDown");
    await says(`ha-agent: ${time(38)}.`);
  });
});

describe("the pointer", () => {
  it("selects the nearest bucket along x anywhere in the plot's height, silently, and a mouse leaving clears it", async () => {
    const b = build(bars);
    const w = plotWidth(b);
    point(b, "pointermove", w * 0.3, 5);
    expect(legendText(b)).toBe(`${span(15, 30)} · Announce · 3 · Path · 1 · 4`);
    expect(crosshair(b)).not.toBe(null);
    await new Promise((r) => setTimeout(r, 150));
    expect(polite()).toBe("");
    point(b, "pointerleave", w * 0.3, 5);
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(`${span(0, 60)} · Announce · 22 · Path · 15 · 37`);
  });

  it("on a silent row, or 40 px from any dot, selects the row with no crosshair", () => {
    const b = build(agents);
    const w = plotWidth(b);
    point(b, "pointermove", w * 0.5, 24 * 1.5);
    expect(legendText(b)).toBe("docs-bot: no posts");
    expect(crosshair(b)).toBe(null);
    expect(ring(b)).not.toBe(null);
    // lead-ui's dots sit at 10, 20 and 40 minutes; 55 minutes is far from them.
    point(b, "pointermove", w * (55 / 60), 12);
    expect(legendText(b)).toBe(`lead-ui · 3${nb}posts, ${span(10, 40)}`);
    expect(crosshair(b)).toBe(null);
  });
});

describe("touch", () => {
  it("a tap selects on lift and keeps it through the leave sent after, until a tap outside", () => {
    const b = build(bars);
    const w = plotWidth(b);
    point(b, "pointerdown", w * 0.1, 5, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointerup", w * 0.1, 5, "touch");
    point(b, "pointerout", w * 0.1, 5, "touch");
    point(b, "pointerleave", w * 0.1, 5, "touch");
    expect(legendText(b)).toBe(`${span(0, 15)} · Announce · 12 · Path · 9 · 21`);
    document.body.dispatchEvent(
      new PointerEvent("pointerup", { pointerType: "touch", pointerId: 8, bubbles: true }),
    );
    expect(ring(b)).toBe(null);
  });

  it("a touch the browser cancels for a scroll leaves no selection", () => {
    const b = build(bars);
    point(b, "pointerdown", 20, 5, "touch");
    point(b, "pointermove", 22, 40, "touch");
    point(b, "pointercancel", 22, 40, "touch");
    expect(ring(b)).toBe(null);
  });

  it("a horizontal drag selects only past 8 px, then follows the finger", () => {
    const b = build(bars);
    const w = plotWidth(b);
    point(b, "pointerdown", w * 0.1, 5, "touch");
    point(b, "pointermove", w * 0.1 + 6, 5, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointermove", w * 0.1 + 12, 5, "touch");
    expect(ring(b)).not.toBe(null);
    point(b, "pointermove", w * 0.9, 5, "touch");
    expect(legendText(b)).toBe(`${span(45, 60)} · Announce · 2 · Path · 1 · 3`);
    point(b, "pointerup", w * 0.9, 5, "touch");
    expect(legendText(b)).toBe(`${span(45, 60)} · Announce · 2 · Path · 1 · 3`);
  });

  it("a touch a row off selects that row, and the legend row names it", () => {
    const b = build(agents);
    const w = plotWidth(b);
    point(b, "pointerdown", w * 0.5, 24 * 2.2, "touch");
    point(b, "pointerup", w * 0.5, 24 * 2.2, "touch");
    expect(legendText(b)).toBe(`ha-agent · 2${nb}posts, ${span(5, 38)}`);
  });
});

describe("a selection at the plot's ends", () => {
  const ends: [string, ChartSpec][] = [
    ["a stacked bar", { ...bars, x: { type: "time" } }],
    [
      "a line",
      {
        x: {},
        marks: [{ mark: "line", x: [0, 1, 2, 3], series: [{ name: "Live", y: [4, 9, 2, 7] }] }],
      },
    ],
    [
      "a line reaching the plot's bottom and top",
      {
        x: {},
        marks: [{ mark: "line", x: [0, 1, 2, 3], series: [{ name: "Live", y: [0, 9, 2, 10] }] }],
      },
    ],
    [
      "a dot row",
      {
        x: { type: "time" },
        y: { type: "band" },
        marks: [
          { mark: "dot", rows: [{ name: "lead-ui", x: [0, 10, 20].map((m) => START + m * MIN) }] },
        ],
      },
    ],
  ];

  it.each(ends)("draws %s's ring whole at both ends, inside the area's clip", (_, spec) => {
    const b = build(spec);
    b.plot.focus();
    // The clip is the area's viewBox, in the ring's own user space; a
    // client box would not do, since Firefox's counts the stroke, by a
    // conservative estimate (16 px for this 10 px ring).
    const area = b.plot.querySelector('[data-part="area"]') as SVGSVGElement;
    const clip = area.viewBox.baseVal;
    const stroke = 1;
    for (const name of ["Home", "End"]) {
      key(b.plot, name);
      const box = (ring(b) as SVGGraphicsElement).getBBox();
      expect(box.width).toBeGreaterThan(0);
      expect(box.x - stroke).toBeGreaterThanOrEqual(clip.x - 1e-3);
      expect(box.x + box.width + stroke).toBeLessThanOrEqual(clip.x + clip.width + 1e-3);
      expect(box.y - stroke).toBeGreaterThanOrEqual(clip.y - 1e-3);
      expect(box.y + box.height + stroke).toBeLessThanOrEqual(clip.y + clip.height + 1e-3);
    }
  });
});

describe("forced colours", () => {
  it.skipIf(!emulates)("keeps the crosshair in muted ink and the ring in ink", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const b = build(bars);
    b.plot.focus();
    // A path beside the ring, stroked with the token itself.
    const probe = (value: string) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.style.stroke = value;
      (ring(b)?.parentElement as Element).append(p);
      const out = getComputedStyle(p).stroke;
      p.remove();
      return out;
    };
    expect(getComputedStyle(crosshair(b) as Element).stroke).toBe(probe("var(--cp-ink-muted)"));
    expect(getComputedStyle(ring(b) as Element).stroke).toBe(probe("var(--cp-ink)"));
  });
});
