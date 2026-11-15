import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { spoken } from "../../feedback/test-helpers/spoken.js";
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
    await spoken(`${span(45, 60)}: Announce 2, Path 1. Total 3.`);
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
        await spoken(text);
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
    await spoken(`${span(0, 15)}: Announce 12, Path 9. Total 21.`);
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
    await spoken(`${span(45, 60)}: Announce 2, Path 1. Total 3.`);
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
    await spoken(`${time(7)}: Live 10, Active 2.`);
    key(b.plot, "Home");
    await spoken(`${time(0)}: No data.`);
    const stops = [2, 4, 5, 7];
    for (const m of stops) {
      key(b.plot, "ArrowRight");
      await spoken(`${time(m)}: Live ${String(m < 5 ? 4 : 10)}, Active ${String(m < 4 ? 1 : 2)}.`);
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
    await spoken(`${time(3)}: Gas 9, Wind 1. Total 10.`);
    key(b.plot, "ArrowLeft");
    await spoken(`${time(2)}: Gas 7, Wind 3. Total 10.`);
    key(b.plot, "ArrowUp");
    await spoken(`${time(2)}: Gas 7.`);
    key(b.plot, "ArrowUp");
    await spoken(`${time(2)}: Wind 3.`);
    expect(legendText(b)).toBe(`${time(2)} · Gas · 7 · Wind · 3 · 10`);
  });
});

describe("keys on a timeline", () => {
  it("focus starts on the first row's last post", async () => {
    const b = build(agents);
    b.plot.focus();
    await spoken(`lead-ui: ${time(40)}.`);
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
    await spoken("docs-bot: no posts");
    expect(crosshair(b)).toBe(null);
    expect(ring(b)).not.toBe(null);
  });

  it("Up and Down land on a silent row, which Left, Right, Home and End leave, then reach the nearest post", async () => {
    const b = build(agents);
    b.plot.focus();
    key(b.plot, "ArrowDown");
    await spoken("docs-bot: no posts");
    expect(crosshair(b)).toBe(null);
    const before = legendText(b);
    for (const name of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(key(b.plot, name).defaultPrevented).toBe(true);
      expect(legendText(b)).toBe(before);
    }
    key(b.plot, "ArrowDown");
    await spoken(`ha-agent: ${time(38)}.`);
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
    await spoken(`${span(0, 15)}: Announce 12, Path 9. Total 21.`);
    key(b.plot, "ArrowRight");
    await spoken(`${span(15, 30)}: Announce 3, Path 1. Total 4. Note: Deploy.`);
    expect(legendText(b)).toBe(`${span(15, 30)} · Announce · 3 · Path · 1 · 4`);
    key(b.plot, "ArrowUp");
    await spoken(`${span(15, 30)}: Announce 3. Note: Deploy.`);
  });

  it("on a step line, the change point holding a note's sample reads it", async () => {
    const b = build({
      ...step,
      marks: [...step.marks, { mark: "text", x: START + 3 * MIN, y: 4, text: "Restart" }],
    });
    b.plot.focus();
    await spoken(`${time(7)}: Live 10, Active 2.`);
    key(b.plot, "ArrowLeft");
    await spoken(`${time(5)}: Live 10, Active 2.`);
    key(b.plot, "ArrowLeft");
    await spoken(`${time(4)}: Live 4, Active 2.`);
    key(b.plot, "ArrowLeft");
    await spoken(`${time(2)}: Live 4, Active 1. Note: Restart.`);
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
    await spoken(`lead-ui: ${time(40)}. Note: Release.`);
    key(b.plot, "ArrowDown");
    await spoken("docs-bot: no posts. Note: Paused.");
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
    await spoken("Acme: Domestic 40, International 2. Total 42.");
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
      await spoken(text);
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

describe("keys and touch on a box plot", () => {
  const latency: ChartSpec = {
    y: { unit: { one: "endpoint", other: "endpoints" } },
    marks: [
      {
        mark: "box",
        y: ["search", "export"],
        series: [
          { name: "Before", low: [1, 3], q1: [2, 4], median: [3, 5], q3: [4, 6], high: [5, 9] },
          { name: "After", low: [1, 2], q1: [2, 3], median: [2, 4], q3: [3, 5], high: [4, 6] },
        ],
      },
    ],
  };
  const plotHeight = (b: Built) =>
    Number(b.plot.querySelector('[data-part="area"]')?.getAttribute("height")) - 2 * AREA_ROOM;

  it("focus selects the first row with a median chip per series, Left and Right say one box, Up and Down the row", async () => {
    const b = build(latency);
    expect(legendText(b)).toBe(`2${nb}endpoints · Before · After`);
    b.plot.focus();
    await spoken(
      "search: Before median 3, middle half 2 to 4, whiskers 1 to 5; After median 2, middle half 2 to 3, whiskers 1 to 4.",
    );
    expect(legendText(b)).toBe("search · Before · 3 · After · 2");
    expect(crosshair(b)).toBe(null);
    const cases: [string, string][] = [
      ["ArrowRight", "search: Before median 3, middle half 2 to 4, whiskers 1 to 5."],
      [
        "ArrowDown",
        "export: Before median 5, middle half 4 to 6, whiskers 3 to 9; After median 4, middle half 3 to 5, whiskers 2 to 6.",
      ],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await spoken(text);
    }
  });

  it("a tap selects the row under it, and a drag never selects", () => {
    const b = build(latency);
    const w = plotWidth(b);
    const h = plotHeight(b);
    point(b, "pointerdown", w * 0.1, h * 0.75, "touch");
    point(b, "pointermove", w * 0.9, h * 0.75, "touch");
    point(b, "pointerup", w * 0.9, h * 0.75, "touch");
    expect(ring(b)).toBe(null);
    point(b, "pointerdown", w * 0.9, h * 0.75, "touch");
    point(b, "pointerup", w * 0.9, h * 0.75, "touch");
    expect(legendText(b)).toBe("export · Before · 5 · After · 4");
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
    await spoken("2015: Cats 34, Dogs 31, Horses No data.");
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
    await spoken("Dogs: 2005 40, 2015 31. Change -9.");
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
    await spoken("2005: Cats 50, Dogs 40, Horses 30.");
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
    await spoken("Chad: Africa, GDP per capita 1.6, Life expectancy 53.");
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
      await spoken(text);
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
    await spoken(`Mon, 2 PM: 3${nb}posts.`);
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
      await spoken(text);
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

describe("keys, the pointer and touch on a pie", () => {
  // Germany's land by use, in km²: 51%, 30%, 14%, 3.2% and 2.3% of 357,580.
  const land = (hole = false): ChartSpec => ({
    marks: [
      {
        mark: "pie",
        hole,
        unit: { other: "km²" },
        slices: [
          { name: "Agriculture", value: 182_637 },
          { name: "Forest", value: 106_645 },
          { name: "Housing & traffic", value: 48_631 },
          { name: "Other land", value: 11_443 },
          { name: "Water", value: 8224 },
        ],
      },
    ],
  });
  const chips =
    "Agriculture · 51% · Forest · 30% · Housing & traffic · 14% · Other land · 3.2% · Water · 2.3%";
  // Plot px at angle `a` clockwise from 12 o'clock, `d` from the centre of
  // the plot, where the pie sits; its diameter is the plot's 240 px height.
  const at = (b: Built, a: number, d: number): [number, number] => [
    plotWidth(b) / 2 + d * Math.sin(a),
    120 - d * Math.cos(a),
  ];
  const chosen = (b: Built) =>
    [...b.legend.querySelectorAll(".cp-chip[data-selected] > bdi")].map((el) => el.textContent);
  const labelled = (b: Built) =>
    [...b.plot.querySelectorAll('[data-part="end"] > text[data-selected]')].map(
      (el) => el.textContent,
    );

  it("reads the total with no selection and focus selects the first slice, ringed, with no crosshair", async () => {
    const b = build(land());
    expect(legendText(b)).toBe(`Total 357,580${nb}km² · ${chips}`);
    b.plot.focus();
    await spoken(`Agriculture: 182,637${nb}km², 51%. Total 357,580${nb}km².`);
    expect(legendText(b)).toBe(`Agriculture 182,637${nb}km² · ${chips}`);
    expect(chosen(b)).toEqual(["Agriculture"]);
    expect(labelled(b)).toEqual(["Agriculture", "51%"]);
    expect(ring(b)).not.toBe(null);
    expect(crosshair(b)).toBe(null);
  });

  it("walks the slices with all four arrows and Home and End, leaving the Page keys to the page", async () => {
    const b = build(land());
    b.plot.focus();
    const cases: [string, string][] = [
      ["ArrowRight", `Forest: 106,645${nb}km², 30%. Total 357,580${nb}km².`],
      ["ArrowDown", `Housing & traffic: 48,631${nb}km², 14%. Total 357,580${nb}km².`],
      ["End", `Water: 8,224${nb}km², 2.3%. Total 357,580${nb}km².`],
      ["ArrowUp", `Other land: 11,443${nb}km², 3.2%. Total 357,580${nb}km².`],
      ["Home", `Agriculture: 182,637${nb}km², 51%. Total 357,580${nb}km².`],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await spoken(text);
    }
    expect(key(b.plot, "PageDown").defaultPrevented).toBe(false);
    expect(chosen(b)).toEqual(["Agriculture"]);
  });

  it("a mouse selects the slice its angle falls in, within 8 px past the rim, and clears beyond", () => {
    const b = build(land());
    // Forest runs from 51% to 81% of the turn.
    point(b, "pointermove", ...at(b, 0.66 * 2 * Math.PI, 127));
    expect(legendText(b)).toBe(`Forest 106,645${nb}km² · ${chips}`);
    expect(chosen(b)).toEqual(["Forest"]);
    point(b, "pointermove", ...at(b, 0.66 * 2 * Math.PI, 129));
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(`Total 357,580${nb}km² · ${chips}`);
    expect(chosen(b)).toEqual([]);
  });

  it("a tap selects a slice, a slide does not, and a tap in a donut's hole clears it", () => {
    const b = build(land(true));
    const [x, y] = at(b, 1, 90);
    point(b, "pointerdown", x, y, "touch");
    point(b, "pointerup", x, y, "touch");
    expect(legendText(b)).toBe(`Agriculture 182,637${nb}km² · ${chips}`);
    const [fx, fy] = at(b, 0.66 * 2 * Math.PI, 90);
    point(b, "pointerdown", fx, fy, "touch");
    point(b, "pointermove", fx + 20, fy, "touch");
    point(b, "pointerup", fx + 20, fy, "touch");
    expect(legendText(b)).toBe(`Agriculture 182,637${nb}km² · ${chips}`);
    const [hx, hy] = at(b, 1, 30);
    point(b, "pointerdown", hx, hy, "touch");
    point(b, "pointerup", hx, hy, "touch");
    expect(ring(b)).toBe(null);
  });
});

describe("keys, the pointer and touch on a treemap", () => {
  // GDP in 2023, bn USD: 62,580 in all, Asia 41%, the Americas 47% and Europe 12%.
  const gdp: ChartSpec = {
    marks: [
      {
        mark: "tree",
        unit: { other: "bn USD" },
        nodes: [
          {
            name: "Asia",
            children: [
              { name: "China", value: 17_795 },
              { name: "Japan", value: 4213 },
              { name: "India", value: 3550 },
            ],
          },
          {
            name: "Americas",
            children: [
              { name: "United States", value: 27_361 },
              { name: "Brazil", value: 2174 },
            ],
          },
          {
            name: "Europe",
            children: [
              { name: "Germany", value: 4456 },
              { name: "France", value: 3031 },
            ],
          },
        ],
      },
    ],
  };
  const chips = "Asia · 41% · Americas · 47% · Europe · 12%";
  const chosen = (b: Built) =>
    [...b.legend.querySelectorAll(".cp-chip[data-selected] > bdi")].map((el) => el.textContent);
  const marked = (b: Built, part: string) =>
    [...b.plot.querySelectorAll(`[data-part="${part}"] > text[data-selected]`)].map(
      (el) => el.textContent,
    );
  // A text's own place on the plot, inside the tile or the head band it names.
  const textAt = (b: Built, part: string, text: string): [number, number] => {
    const el = [...b.plot.querySelectorAll(`[data-part="${part}"] > text`)].find(
      (t) => t.textContent === text,
    );
    return [Number(el?.getAttribute("x")) + 2, Number(el?.getAttribute("y"))];
  };
  // The ring's outline as its first corner and its far corner, in plot px.
  const corners = (b: Built) =>
    (ring(b)?.getAttribute("d") ?? "").match(/-?[\d.]+/gu)?.map(Number) ?? [];

  it("reads the total with no selection and focus selects the first group, ringed, its head marked", async () => {
    const b = build(gdp);
    expect(legendText(b)).toBe(`Total 62,580${nb}bn USD · ${chips}`);
    b.plot.focus();
    await spoken(`Asia: 25,558${nb}bn USD, 41%, 3 parts.`);
    expect(legendText(b)).toBe(`Asia 25,558${nb}bn USD, 41% · ${chips}`);
    expect(chosen(b)).toEqual(["Asia"]);
    expect(marked(b, "head")).toEqual(["Asia"]);
    expect(marked(b, "tile")).toEqual([]);
    expect(ring(b)).not.toBe(null);
    expect(crosshair(b)).toBe(null);
    // A group's ring stands 1 px outside its rectangle, which starts at the plot's corner.
    expect(corners(b).slice(0, 2)).toEqual([-1, -1]);
  });

  it("walks the groups with Up and Down and the parts with Left and Right, leaving the Page keys", async () => {
    const b = build(gdp);
    b.plot.focus();
    const cases: [string, string][] = [
      ["ArrowDown", `Americas: 29,535${nb}bn USD, 47%, 2 parts.`],
      ["ArrowLeft", `Asia, India: 3,550${nb}bn USD, 5.7%.`],
      ["ArrowRight", `Americas, United States: 27,361${nb}bn USD, 44%.`],
      ["End", `Europe, France: 3,031${nb}bn USD, 4.8%.`],
      ["ArrowUp", `Americas: 29,535${nb}bn USD, 47%, 2 parts.`],
      ["Home", `Asia: 25,558${nb}bn USD, 41%, 3 parts.`],
    ];
    for (const [name, text] of cases) {
      expect(key(b.plot, name).defaultPrevented, name).toBe(true);
      await spoken(text);
    }
    expect(key(b.plot, "PageDown").defaultPrevented).toBe(false);
    key(b.plot, "ArrowRight");
    await spoken(`Asia, China: 17,795${nb}bn USD, 28%.`);
    expect(marked(b, "tile")).toEqual(["China", `17,795${nb}bn USD`]);
    expect(marked(b, "head")).toEqual([]);
    expect(chosen(b)).toEqual(["Asia"]);
    // A part's ring stands 1 px inside its tile, at the plot's left edge under Asia's 18 px head.
    expect(corners(b).slice(0, 2)).toEqual([1, 19]);
  });

  it("a mouse selects the tile or the head band under it, and clears beyond every tile's reach", () => {
    const b = build(gdp);
    point(b, "pointermove", ...textAt(b, "tile", "Germany"));
    expect(legendText(b)).toBe(`Europe, Germany 4,456${nb}bn USD, 7.1% · ${chips}`);
    expect(chosen(b)).toEqual(["Europe"]);
    point(b, "pointermove", ...textAt(b, "head", "Americas"));
    expect(legendText(b)).toBe(`Americas 29,535${nb}bn USD, 47% · ${chips}`);
    point(b, "pointermove", -4.5, 100);
    expect(ring(b)).toBe(null);
    expect(legendText(b)).toBe(`Total 62,580${nb}bn USD · ${chips}`);
  });

  it("a tap selects a tile and a slide does not", () => {
    const b = build(gdp);
    const [x, y] = textAt(b, "tile", "China");
    point(b, "pointerdown", x, y, "touch");
    point(b, "pointerup", x, y, "touch");
    expect(legendText(b)).toBe(`Asia, China 17,795${nb}bn USD, 28% · ${chips}`);
    const [gx, gy] = textAt(b, "tile", "Germany");
    point(b, "pointerdown", gx, gy, "touch");
    point(b, "pointermove", gx + 20, gy, "touch");
    point(b, "pointerup", gx + 20, gy, "touch");
    expect(legendText(b)).toBe(`Asia, China 17,795${nb}bn USD, 28% · ${chips}`);
  });
});

describe("keys, the pointer and the synced selection in small multiples", () => {
  const months = Array.from({ length: 6 }, (_, i) => Date.UTC(2024, i, 1));
  const regions: ChartSpec = {
    x: { type: "time", domain: [months[0] ?? 0, months.at(-1) ?? 0] },
    y: { label: "Unemployment", format: "percent" },
    marks: [],
    facets: {
      unit: { one: "region", other: "regions" },
      panels: [
        {
          marks: [
            {
              mark: "line",
              x: months,
              series: [{ name: "North", y: [5, 6, 7, 8, 9, 10].map((v) => v / 100) }],
            },
          ],
        },
        {
          marks: [
            {
              mark: "line",
              x: months,
              series: [{ name: "South", y: [3, 3, 4, 4, 5, 5].map((v) => v / 100) }],
            },
          ],
        },
        // East starts a month late, so it has no January.
        {
          marks: [
            {
              mark: "line",
              x: months.slice(1),
              series: [{ name: "East", y: [2, 2, 2, 2, 2].map((v) => v / 100) }],
            },
          ],
        },
      ],
    },
  };
  // A time domain of months reads its instants to the minute.
  const instant = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const jan = instant.format(months[0]);
  const jun = instant.format(months[5]);
  const frames = (b: Built) => [...b.plot.querySelectorAll<HTMLElement>('[data-part="frame"]')];
  const frame = (b: Built, k: number) => frames(b)[k] as HTMLElement;
  const svgOf = (b: Built, k: number) => frame(b, k).querySelector("svg") as SVGSVGElement;
  const ringIn = (b: Built, k: number) => svgOf(b, k).querySelector('[data-part="ring"]');
  const heads = (b: Built) =>
    [...b.plot.querySelectorAll('[data-part="head"] > [data-part="figure"]')].map(
      (f) => f.textContent,
    );
  const slot = (b: Built) => b.legend.querySelector(':scope > [data-part="panel"]')?.textContent;
  // A pointer event at plot px (x, y) of panel k's drawing area.
  const pointIn = (b: Built, k: number, type: string, x: number, y = 10) => {
    const svg = svgOf(b, k);
    const area = svg.querySelector('[data-part="area"]') as SVGSVGElement;
    const view = svg.viewBox.baseVal;
    const box = svg.getBoundingClientRect();
    frame(b, k).dispatchEvent(
      new PointerEvent(type, {
        clientX: box.left + Number(area.getAttribute("x")) - view.x + AREA_ROOM + x,
        clientY: box.top + Number(area.getAttribute("y")) + AREA_ROOM + y,
        pointerType: "mouse",
        pointerId: 1,
        bubbles: type !== "pointerleave",
      }),
    );
  };

  it("makes each panel's plot a tab stop and an application region, not the plot around them", async () => {
    const b = build(regions);
    expect(b.plot.hasAttribute("role")).toBe(false);
    expect(b.plot.hasAttribute("tabindex")).toBe(false);
    for (const [k, name] of ["North", "South", "East"].entries()) {
      const f = frame(b, k);
      expect(f.getAttribute("role")).toBe("application");
      expect(f.getAttribute("aria-roledescription")).toBe("chart");
      expect(f.tabIndex).toBe(0);
      await expect
        .element(f)
        .toHaveAccessibleName(expect.stringMatching(new RegExp(`^${name}: Line chart, `)));
      await expect
        .element(f)
        .toHaveAccessibleDescription(
          "Arrow keys read the values. Tab moves to the next panel, then out of the chart.",
        );
    }
    expect(legendText(b)).toBe(`3${nb}regions · ${jun}`);
  });

  it("Tab moves from panel to panel in grid order, carrying the selected month, then out", async () => {
    const b = build(regions);
    (b.figure.previousElementSibling as HTMLElement).focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(frame(b, 0));
    await spoken(`North, ${jun}: 10%.`);
    expect(slot(b)).toBe("North");
    key(frame(b, 0), "Home");
    await spoken(`North, ${jan}: 5%.`);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(frame(b, 1));
    await spoken(`South, ${jan}: 3%.`);
    expect(legendText(b)).toBe(`South · ${jan} · 3%`);
    // East has no January, so it makes its own first selection, its newest month.
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(frame(b, 2));
    await spoken(`East, ${jun}: 2%.`);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(frame(b, 1));
    await spoken(`South, ${jun}: 5%.`);
    await userEvent.keyboard("{Tab}{Tab}");
    expect(document.activeElement).toBe(b.figure.nextElementSibling);
    expect(frames(b).map((f) => f.querySelector('[data-part="ring"]'))).toEqual([null, null, null]);
    expect(legendText(b)).toBe(`3${nb}regions · ${jun}`);
  });

  it("syncs the selection into every panel holding its month, with a fainter ring, and the heads follow", () => {
    const b = build(regions);
    expect(heads(b)).toEqual(["10%", "5%", "2%"]);
    frame(b, 0).focus();
    key(frame(b, 0), "Home");
    expect(svgOf(b, 0).hasAttribute("data-synced")).toBe(false);
    expect(ringIn(b, 0)).not.toBeNull();
    expect(svgOf(b, 1).hasAttribute("data-synced")).toBe(true);
    expect(ringIn(b, 1)).not.toBeNull();
    expect(svgOf(b, 1).querySelector('[data-part="crosshair"]')).not.toBeNull();
    expect(svgOf(b, 2).hasAttribute("data-synced")).toBe(false);
    expect(ringIn(b, 2)).toBeNull();
    expect(heads(b)).toEqual(["5%", "3%", "2%"]);
    const selected = [...b.plot.querySelectorAll('[data-part="panel"]')].map((p) =>
      p.hasAttribute("data-selected"),
    );
    expect(selected).toEqual([true, false, false]);
    const synced = getComputedStyle(ringIn(b, 1) as Element);
    const own = getComputedStyle(ringIn(b, 0) as Element);
    expect(synced.strokeWidth).toBe("1px");
    expect(own.strokeWidth).toBe("2px");
    expect(synced.stroke).not.toBe(own.stroke);
    key(frame(b, 0), "Escape");
    expect(frames(b).map((f) => f.querySelector('[data-part="ring"]'))).toEqual([null, null, null]);
    expect(heads(b)).toEqual(["10%", "5%", "2%"]);
    expect(legendText(b)).toBe(`3${nb}regions · ${jun}`);
  });

  it("a mouse selects in the panel under it, clearing the one the keys left elsewhere", () => {
    const b = build(regions);
    frame(b, 0).focus();
    const width =
      Number(svgOf(b, 1).querySelector('[data-part="area"]')?.getAttribute("width")) -
      2 * AREA_ROOM;
    // The second panel's SVG starts at its plot's edge: its first month is at 0.
    pointIn(b, 1, "pointermove", 1);
    expect(legendText(b)).toBe(`South · ${jan} · 3%`);
    expect(svgOf(b, 0).hasAttribute("data-synced")).toBe(true);
    pointIn(b, 1, "pointermove", width - 1);
    expect(legendText(b)).toBe(`South · ${jun} · 5%`);
    pointIn(b, 1, "pointerleave", width + 40);
    expect(legendText(b)).toBe(`3${nb}regions · ${jun}`);
    expect(frames(b).map((f) => f.querySelector('[data-part="ring"]'))).toEqual([null, null, null]);
  });

  it("keeps the legend row's slots as the selection moves between panels", () => {
    const b = build(regions);
    // WebKit lays text out in 1/64 px units, so a slot may round 1/64 px wider.
    const slots = () =>
      [':scope > [data-part="panel"]', ':scope > [data-part="at"]', '[data-part="value"]'].map(
        (q) => b.legend.querySelector(q)?.getBoundingClientRect().right ?? 0,
      );
    const none = slots();
    const height = b.legend.getBoundingClientRect().height;
    frame(b, 2).focus();
    for (const [k, right] of slots().entries()) {
      expect(right).toBeCloseTo(none[k] ?? 0, 1);
    }
    key(frame(b, 2), "Home");
    for (const [k, right] of slots().entries()) {
      expect(right).toBeCloseTo(none[k] ?? 0, 1);
    }
    expect(b.legend.getBoundingClientRect().height).toBe(height);
  });

  it("tears down to an image per panel, moving focus from a focused panel to the figure", () => {
    const b = build(regions);
    frame(b, 1).focus();
    b.life.abort();
    expect(document.activeElement).toBe(b.figure);
    for (const f of frames(b)) {
      expect(f.getAttribute("role")).toBe("img");
      expect(f.hasAttribute("tabindex")).toBe(false);
      expect(f.hasAttribute("aria-roledescription")).toBe(false);
    }
    expect(frames(b).map((f) => f.querySelector('[data-part="ring"]'))).toEqual([null, null, null]);
  });
});
