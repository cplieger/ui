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

describe("keys on a stacked column chart", () => {
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
      .toHaveAccessibleName(`Stacked column chart, 2 series, ${span(0, 60)}`);
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

describe("keys on a stacked area", () => {
  it("focus says the newest sample with its total, Up and Down each layer in series order", async () => {
    const x = Array.from({ length: 4 }, (_, i) => START + i * MIN);
    const b = build({
      x: { type: "time" },
      marks: [
        {
          mark: "area",
          x,
          series: [
            { name: "Gas", y: [5, 6, 7, 9] },
            { name: "Wind", y: [1, 2, 3, 1] },
          ],
        },
      ],
    });
    expect(legendText(b)).toBe(`${time(3)} · Gas · 9 · Wind · 1 · 10`);
    b.plot.focus();
    await says(`${time(3)}: Gas 9, Wind 1. Total 10.`);
    key(b.plot, "ArrowLeft");
    await says(`${time(2)}: Gas 7, Wind 3. Total 10.`);
    key(b.plot, "ArrowUp");
    await says(`${time(2)}: Gas 7.`);
    key(b.plot, "ArrowUp");
    await says(`${time(2)}: Wind 3.`);
    expect(legendText(b)).toBe(`${time(2)} · Gas · 7 · Wind · 3 · 10`);
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

describe("notes in the readings", () => {
  it("a bucket's reading adds the note its interval holds, the legend row never", async () => {
    const b = build({
      ...bars,
      marks: [...bars.marks, { mark: "text", x: START + 20 * MIN, y: 4, text: "Deploy" }],
    });
    b.plot.focus();
    key(b.plot, "Home");
    await says(`${span(0, 15)}: Announce 12, Path 9. Total 21.`);
    key(b.plot, "ArrowRight");
    await says(`${span(15, 30)}: Announce 3, Path 1. Total 4. Note: Deploy.`);
    expect(legendText(b)).toBe(`${span(15, 30)} · Announce · 3 · Path · 1 · 4`);
    key(b.plot, "ArrowUp");
    await says(`${span(15, 30)}: Announce 3. Note: Deploy.`);
  });

  it("on a step line, the change point holding a note's sample reads it", async () => {
    const b = build({
      ...step,
      marks: [...step.marks, { mark: "text", x: START + 3 * MIN, y: 4, text: "Restart" }],
    });
    b.plot.focus();
    await says(`${time(7)}: Live 10, Active 2.`);
    key(b.plot, "ArrowLeft");
    await says(`${time(5)}: Live 10, Active 2.`);
    key(b.plot, "ArrowLeft");
    await says(`${time(4)}: Live 4, Active 2.`);
    key(b.plot, "ArrowLeft");
    await says(`${time(2)}: Live 4, Active 1. Note: Restart.`);
  });

  it("a silent row's reading adds its note after a full stop, a post's the note nearest it", async () => {
    const b = build({
      ...agents,
      marks: [
        ...agents.marks,
        { mark: "text", x: START + 30 * MIN, y: "docs-bot", text: "Paused" },
        { mark: "text", x: START + 39 * MIN, y: "lead-ui", text: "Release" },
      ],
    });
    b.plot.focus();
    await says(`lead-ui: ${time(40)}. Note: Release.`);
    key(b.plot, "ArrowDown");
    await says("docs-bot: no posts. Note: Paused.");
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

describe("keys and touch on a bar chart", () => {
  const firms: ChartSpec = {
    x: {},
    y: { unit: { one: "company", other: "companies" } },
    marks: [
      {
        mark: "bar",
        y: ["Acme", "Brill", "Corda"],
        series: [
          { name: "Domestic", x: [40, 3, 7] },
          { name: "International", x: [2, 22, 2] },
        ],
      },
    ],
  };
  const plotHeight = (b: Built) =>
    Number(b.plot.querySelector('[data-part="area"]')?.getAttribute("height")) - 2 * AREA_ROOM;

  it("focus selects the first row whole, with no crosshair, and the legend row counts the rows", async () => {
    const b = build(firms);
    expect(legendText(b)).toBe(`3${nb}companies · Domestic · International`);
    b.plot.focus();
    await says("Acme: Domestic 40, International 2. Total 42.");
    expect(legendText(b)).toBe("Acme · Domestic · 40 · International · 2 · 42");
    expect(ring(b)).not.toBe(null);
    expect(crosshair(b)).toBe(null);
  });

  it("says a part for Left and Right, and the whole row for Up and Down", async () => {
    const b = build(firms);
    b.plot.focus();
    const cases: [string, string][] = [
      ["ArrowRight", "Acme: Domestic 40."],
      ["ArrowRight", "Acme: International 2."],
      ["ArrowDown", "Brill: Domestic 3, International 22. Total 25."],
      ["ArrowLeft", "Brill: Domestic 3."],
      ["End", "Corda: Domestic 7, International 2. Total 9."],
      ["PageUp", "Acme: Domestic 40, International 2. Total 42."],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await says(text);
    }
  });

  it("a tap selects the row under it, and a drag never selects", () => {
    const b = build(firms);
    const w = plotWidth(b);
    const h = plotHeight(b);
    point(b, "pointerdown", w * 0.1, h * 0.5, "touch");
    point(b, "pointermove", w * 0.9, h * 0.5, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointerup", w * 0.9, h * 0.5, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointerdown", w * 0.9, h * 0.9, "touch");
    point(b, "pointerup", w * 0.9, h * 0.9, "touch");
    expect(legendText(b)).toBe("Corda · Domestic · 7 · International · 2 · 9");
    expect(crosshair(b)).toBe(null);
  });

  it("a vertical slide the browser does not scroll selects nothing on lift", () => {
    const b = build(firms);
    const w = plotWidth(b);
    const h = plotHeight(b);
    const before = legendText(b);
    point(b, "pointerdown", w * 0.5, h * 0.1, "touch");
    point(b, "pointermove", w * 0.5, h * 0.9, "touch");
    point(b, "pointerup", w * 0.5, h * 0.9, "touch");
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(before);
  });

  it("a tap that jitters under 8 px selects, and a diagonal slide past 8 px does not", () => {
    const b = build(firms);
    const w = plotWidth(b);
    const h = plotHeight(b);
    const before = legendText(b);
    // 7 px across and 7 px down: under 8 on each axis, 9.9 px of travel.
    point(b, "pointerdown", w * 0.5, h * 0.5, "touch");
    point(b, "pointermove", w * 0.5 + 7, h * 0.5 + 7, "touch");
    point(b, "pointerup", w * 0.5 + 7, h * 0.5 + 7, "touch");
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(before);
    point(b, "pointerdown", w * 0.5, h * 0.5, "touch");
    point(b, "pointermove", w * 0.5 + 3, h * 0.5 + 6, "touch");
    point(b, "pointerup", w * 0.5 + 3, h * 0.5 + 6, "touch");
    expect(ring(b)).not.toBe(null);
    expect(legendText(b)).toBe("Brill · Domestic · 3 · International · 22 · 25");
  });

  it("a mouse selects the row under it anywhere across the plot", () => {
    const b = build(firms);
    point(b, "pointermove", plotWidth(b) - 1, plotHeight(b) * 0.5);
    expect(legendText(b)).toBe("Brill · Domestic · 3 · International · 22 · 25");
  });
});

describe("keys and the pointer on a slope chart", () => {
  const pets: ChartSpec = {
    marks: [
      {
        mark: "slope",
        x: ["2005", "2015"],
        series: [
          { name: "Cats", y: [50, 34] },
          { name: "Dogs", y: [40, 31] },
          { name: "Horses", y: [30, null] },
        ],
      },
    ],
  };
  const rings = (b: Built) => (ring(b)?.getAttribute("d") ?? "").split("M").length - 1;
  const chips = (b: Built) =>
    [...b.legend.querySelectorAll(".cp-chip")].map((c) => c.hasAttribute("data-selected"));
  const strong = (b: Built) =>
    [...b.plot.querySelectorAll('[data-part="end"] > text[data-selected]')].map(
      (t) => t.textContent,
    );

  it("focus selects the right column and rings each end there", async () => {
    const b = build(pets);
    expect(legendText(b)).toBe("2015 · Cats · 34 · Dogs · 31 · Horses · No data");
    b.plot.focus();
    await says("2015: Cats 34, Dogs 31, Horses No data.");
    expect(rings(b)).toBe(2);
    expect(crosshair(b)).not.toBe(null);
  });

  it("chooses a series with Up and Down, says its change, and marks it by weight", async () => {
    const b = build(pets);
    // A face that loads late measures the legend row again; compare after it.
    await document.fonts.ready;
    b.plot.focus();
    const widths = () =>
      [...b.legend.querySelectorAll(".cp-chip")].map((c) => c.getBoundingClientRect().width);
    const before = widths();
    expect(key(b.plot, "ArrowUp").defaultPrevented).toBe(true);
    await says("Dogs: 2005 40, 2015 31. Change -9.");
    expect(widths()).toEqual(before);
    expect(
      getComputedStyle(b.legend.querySelectorAll(".cp-chip > bdi")[1] as Element).fontWeight,
    ).toBe("600");
    expect(rings(b)).toBe(2);
    expect(chips(b)).toEqual([false, true, false]);
    expect(strong(b)).toEqual(["Dogs 40", "Dogs 31"]);
    // The chosen line and its ends, drawn again over the others.
    expect(b.plot.querySelectorAll('[data-part="selection"] [data-series="2"]')).toHaveLength(2);
    key(b.plot, "ArrowLeft");
    await says("2005: Cats 50, Dogs 40, Horses 30.");
    expect(legendText(b)).toBe("2005 · Cats · 50 · Dogs · 40 · Horses · 30");
    expect(chips(b)).toEqual([false, true, false]);
    key(b.plot, "Escape");
    expect(chips(b)).toEqual([false, false, false]);
    expect(strong(b)).toEqual([]);
  });

  it("leaves the Page keys to the page", () => {
    const b = build(pets);
    b.plot.focus();
    expect(key(b.plot, "PageUp").defaultPrevented).toBe(false);
    expect(key(b.plot, "PageDown").defaultPrevented).toBe(false);
    expect(key(b.plot, "Home").defaultPrevented).toBe(true);
  });

  it("a mouse selects the nearer column anywhere in the plot's height", () => {
    const b = build(pets);
    point(b, "pointermove", plotWidth(b) * 0.4, 0);
    expect(legendText(b)).toBe("2005 · Cats · 50 · Dogs · 40 · Horses · 30");
    expect(rings(b)).toBe(3);
    point(b, "pointermove", plotWidth(b) * 0.6, 200);
    expect(legendText(b)).toBe("2015 · Cats · 34 · Dogs · 31 · Horses · No data");
  });
});

describe("keys and the pointer on a scatter plot", () => {
  const world: ChartSpec = {
    x: { label: "GDP per capita", domain: [0, 150] },
    y: { label: "Life expectancy", domain: [50, 90] },
    marks: [
      {
        mark: "scatter",
        unit: { one: "country", other: "countries" },
        series: [
          { name: "Europe", names: ["Albania", "Monaco"], x: [19, 140], y: [79.8, 85.9] },
          { name: "Africa", names: ["Chad", "Ghana"], x: [1.6, 6.3], y: [53, 64.1] },
        ],
      },
    ],
  };
  const chips = (b: Built) =>
    [...b.legend.querySelectorAll(".cp-chip")].map((c) => c.hasAttribute("data-selected"));
  // A dot's centre in plot px, from the domains above and the plot's 6 px insets.
  const at = (b: Built, x: number, y: number) => {
    const w = plotWidth(b) - 12;
    const h =
      Number(b.plot.querySelector('[data-part="area"]')?.getAttribute("height")) -
      2 * AREA_ROOM -
      12;
    return { x: 6 + (x / 150) * w, y: 6 + ((90 - y) / 40) * h };
  };

  it("focus selects the first dot in x order, rings it and draws the crosshair to its edge", async () => {
    const b = build(world);
    expect(legendText(b)).toBe(`4${nb}countries · Europe · 2 · Africa · 2`);
    b.plot.focus();
    await says("Chad: Africa, GDP per capita 1.6, Life expectancy 53.");
    expect(legendText(b)).toBe(
      "Chad · GDP per capita 1.6 · Life expectancy 53 · Europe · 2 · Africa · 2",
    );
    expect(chips(b)).toEqual([false, true]);
    expect(ring(b)).not.toBe(null);
    // Two rules, each a move and a line.
    expect(crosshair(b)?.getAttribute("d")?.match(/M/gu)).toHaveLength(2);
  });

  it("walks x order with Left and Right and y order with Up and Down, saying each dot", async () => {
    const b = build(world);
    b.plot.focus();
    const cases: [string, string][] = [
      ["ArrowRight", "Ghana: Africa, GDP per capita 6.3, Life expectancy 64.1."],
      ["ArrowUp", "Albania: Europe, GDP per capita 19, Life expectancy 79.8."],
      ["End", "Monaco: Europe, GDP per capita 140, Life expectancy 85.9."],
      ["ArrowDown", "Albania: Europe, GDP per capita 19, Life expectancy 79.8."],
      ["Home", "Chad: Africa, GDP per capita 1.6, Life expectancy 53."],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await says(text);
    }
    expect(chips(b)).toEqual([false, true]);
  });

  it("a mouse selects the dot within 40 px of its edge and clears the selection beyond it", () => {
    const b = build(world);
    const monaco = at(b, 140, 85.9);
    point(b, "pointermove", monaco.x - 30, monaco.y + 20);
    expect(legendText(b)).toBe(
      "Monaco · GDP per capita 140 · Life expectancy 85.9 · Europe · 2 · Africa · 2",
    );
    expect(chips(b)).toEqual([true, false]);
    point(b, "pointermove", monaco.x - 60, monaco.y + 60);
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(`4${nb}countries · Europe · 2 · Africa · 2`);
  });

  it("a tap selects the nearest dot, a tap far from every dot clears it, and a drag never selects", () => {
    const b = build(world);
    const ghana = at(b, 6.3, 64.1);
    point(b, "pointerdown", ghana.x + 3, ghana.y, "touch");
    point(b, "pointerup", ghana.x + 3, ghana.y, "touch");
    expect(legendText(b)).toBe(
      "Ghana · GDP per capita 6.3 · Life expectancy 64.1 · Europe · 2 · Africa · 2",
    );
    point(b, "pointerdown", plotWidth(b) / 2, 10, "touch");
    point(b, "pointerup", plotWidth(b) / 2, 10, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointerdown", ghana.x - 40, ghana.y, "touch");
    point(b, "pointermove", ghana.x, ghana.y, "touch");
    point(b, "pointerup", ghana.x, ghana.y, "touch");
    expect(ring(b)).toBe(null);
  });
});

describe("keys, the pointer and touch on a heatmap", () => {
  const grid: ChartSpec = {
    colour: { unit: { one: "post", other: "posts" } },
    marks: [
      {
        mark: "cell",
        x: ["2 PM", "3 PM", "4 PM", "5 PM"],
        y: ["Mon", "Tue", "Wed"],
        values: [
          [3, 0, 1, 2],
          [4, null, 6, 7],
          [8, 9, 10, 11],
        ],
      },
    ],
  };
  // Cell (row, column)'s middle in plot px: rows 24 px tall, columns sharing the width.
  const mid = (b: Built, row: number, column: number) => ({
    x: ((column + 0.5) * plotWidth(b)) / 4,
    y: (row + 0.5) * 24,
  });

  it("reads the cell count with no selection and focus selects the top left cell", async () => {
    const b = build(grid);
    expect(legendText(b)).toBe("12 cells");
    b.plot.focus();
    await says(`Mon, 2 PM: 3${nb}posts.`);
    expect(legendText(b)).toBe(`Mon, 2 PM · 3${nb}posts`);
    expect(ring(b)).not.toBe(null);
    expect(crosshair(b)).toBe(null);
  });

  it("walks the grid by cell, saying each place and value, a missing cell No data", async () => {
    const b = build(grid);
    b.plot.focus();
    const cases: [string, string][] = [
      ["ArrowRight", `Mon, 3 PM: 0${nb}posts.`],
      ["ArrowDown", "Tue, 3 PM: No data."],
      ["End", `Tue, 5 PM: 7${nb}posts.`],
      ["ArrowDown", `Wed, 5 PM: 11${nb}posts.`],
      ["Home", `Wed, 2 PM: 8${nb}posts.`],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await says(text);
    }
  });

  it("a mouse selects the cell under it and clears the selection off the grid", () => {
    const b = build(grid);
    const at = mid(b, 2, 1);
    point(b, "pointermove", at.x, at.y);
    expect(legendText(b)).toBe(`Wed, 3 PM · 9${nb}posts`);
    point(b, "pointermove", at.x, 3 * 24 + 4);
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe("12 cells");
  });

  it("a tap selects a cell and a sideways drag moves along the row it began on", () => {
    const b = build(grid);
    const start = mid(b, 1, 0);
    point(b, "pointerdown", start.x, start.y, "touch");
    point(b, "pointerup", start.x, start.y, "touch");
    expect(legendText(b)).toBe(`Tue, 2 PM · 4${nb}posts`);
    point(b, "pointerdown", start.x, start.y, "touch");
    const end = mid(b, 2, 3);
    // The finger drifts down a row as it slides, and the selection keeps to Tue.
    point(b, "pointermove", end.x, end.y, "touch");
    expect(legendText(b)).toBe(`Tue, 5 PM · 7${nb}posts`);
    point(b, "pointerup", end.x, end.y, "touch");
  });
});
