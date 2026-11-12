import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server } from "vitest/browser";

import { durationEdges } from "../scale/ladder.js";
import { forgetMeasures } from "../scale/measure.js";

import {
  AREA_ROOM,
  drawPlot,
  drawSelection,
  frameLegend,
  readMetrics,
  writeLegend,
} from "./draw.js";
import { layout, type Layout } from "./layout.js";
import { chartModel, type Model, type RectModel } from "./model.js";
import { bucketReading, overall, readoutWidths } from "./readout.js";
import { navigator } from "./select.js";
import type { ChartSpec } from "./spec.js";
import { chartWords } from "./words.js";

const root = document.documentElement;
const words = chartWords();
const emulates = server.browser === "chromium";
let sheet: HTMLLinkElement;
const hosts: HTMLElement[] = [];

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
});

afterEach(async () => {
  if (emulates) {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  root.classList.remove("cp");
  root.removeAttribute("data-theme");
  root.removeAttribute("data-pointer");
  root.style.removeProperty("font-size");
  forgetMeasures();
});

interface Drawn {
  readonly figure: HTMLElement;
  readonly legend: HTMLElement;
  readonly plot: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly model: Model;
  readonly lay: Layout;
}

function place(width: number, parent?: HTMLElement): HTMLElement {
  const box = parent ?? document.createElement("div");
  if (parent === undefined) {
    box.style.inlineSize = `${String(width)}px`;
    document.body.append(box);
    hosts.push(box);
  }
  return box;
}

// A chart drawn the way the module draws one, into a figure `width` px wide.
function draw(spec: ChartSpec, width = 600, parent?: HTMLElement, lang = "en"): Drawn {
  const box = place(width, parent);
  const figure = document.createElement("figure");
  figure.className = "cp-chart";
  figure.lang = lang;
  const caption = document.createElement("figcaption");
  caption.textContent = "A chart";
  const legend = document.createElement("div");
  legend.className = "cp-cluster";
  legend.dataset["part"] = "legend";
  const plot = document.createElement("div");
  plot.dataset["part"] = "plot";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  plot.append(svg);
  figure.append(caption, legend, plot);
  box.append(figure);
  const model = chartModel(spec, lang, "UTC");
  const metrics = readMetrics(plot, lang);
  const lay = layout(
    model,
    words,
    metrics,
    plot.clientWidth,
    { axis: 0, label: 0 },
    plot.getBoundingClientRect().width,
  );
  drawPlot(svg, model, lay);
  const none = overall(model, words);
  if (none !== undefined) {
    frameLegend(
      legend,
      none,
      readoutWidths(model, words, readMetrics(legend, lang).measure),
      words.total,
    );
  }
  return { figure, legend, plot, svg, model, lay };
}

const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const starts = per(24, (i) => i * 900_000);
const stacked: ChartSpec = {
  x: { type: "time", domain: [0, 24 * 900_000] },
  y: { label: "Posts", unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: starts,
      x2: starts.map((t) => t + 900_000),
      series: [
        { name: "Announce", slot: 1, y: per(24, (i) => 3 + (i % 4)) },
        { name: "Path", slot: 2, y: per(24, (i) => (i === 5 ? null : 2)) },
        { name: "Direct", slot: 4, y: per(24, () => 1) },
      ],
    },
  ],
};

const minutes = per(360, (i) => i * 60_000);
const stepLine: ChartSpec = {
  x: { type: "time", domain: [0, 360 * 60_000] },
  y: { label: "Agents" },
  marks: [
    {
      mark: "line",
      curve: "step",
      x: minutes,
      series: [
        { name: "Live", slot: 1, y: minutes.map((_, i) => (i < 30 ? null : 4 + (i % 7))) },
        { name: "Active", slot: 2, y: minutes.map((_, i) => (i < 30 ? null : i % 5)) },
      ],
    },
  ],
};

const strip = (names: readonly string[]): ChartSpec => ({
  x: { type: "time", domain: [0, 360 * 60_000] },
  y: { type: "band", mono: true },
  marks: [
    {
      mark: "dot",
      rows: names.map((name, r) => ({ name, x: per(r * 3, (i) => (i + 1) * 3_000_000) })),
    },
  ],
});

// A colour as the page resolves it on an element of the plot, or in `scheme`.
function token(
  at: Element,
  value: string,
  property: "color" | "backgroundColor" = "color",
  scheme?: "light" | "dark",
): string {
  const probe = document.createElement("span");
  probe.style.setProperty("forced-color-adjust", "none");
  if (scheme !== undefined) {
    probe.style.setProperty("color-scheme", scheme);
  }
  probe.style.setProperty(property === "color" ? "color" : "background-color", value);
  (at.closest('[data-part="plot"]') ?? at).append(probe);
  const out = getComputedStyle(probe)[property];
  probe.remove();
  return out;
}

const series = (d: Drawn, part: string) => [
  ...d.svg.querySelectorAll<SVGPathElement>(`[data-part="${part}"] path`),
];

describe("the marks", () => {
  it("fills one path per stacked series in its slot", () => {
    const d = draw(stacked);
    const paths = series(d, "rect");
    expect(paths.map((p) => p.dataset["series"])).toEqual(["1", "2", "4"]);
    for (const p of paths) {
      expect(getComputedStyle(p).fill).toBe(
        token(p, `var(--cp-series-${p.dataset["series"] ?? ""})`),
      );
    }
  });

  it("stacks over a null segment from the segment under it", () => {
    const d = draw(stacked);
    const [announce, path, direct] = series(d, "rect").map((p) => p.getAttribute("d") ?? "");
    const rects = (s: string) => [...s.matchAll(/M[\d.]+ ([\d.]+)H[\d.]+V([\d.]+)/g)];
    expect(rects(announce ?? "")).toHaveLength(24);
    expect(rects(path ?? "")).toHaveLength(23);
    // Bucket 5: Direct sits on Announce, its bottom 1 px above Announce's top.
    const a = rects(announce ?? "")[5];
    const c = rects(direct ?? "")[5];
    expect(Number(c?.[2])).toBeCloseTo(Number(a?.[1]) - 1, 6);
  });

  it("sets a group's series side by side from the baseline, and rings each sub-column or the chosen one", () => {
    const mark = stacked.marks[0] as Extract<ChartSpec["marks"][number], { mark: "rect" }>;
    const d = draw({ ...stacked, marks: [{ ...mark, arrange: "group" }] }, 600);
    const boxes = (p: Element | null | undefined) =>
      [...(p?.getAttribute("d") ?? "").matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)/g)].map((g) =>
        g.slice(1).map(Number),
      );
    const [announce, path, direct] = series(d, "rect").map(boxes);
    // Bucket 5: Path is null, so its slot stays empty between Announce and Direct.
    expect(path).toHaveLength(23);
    const a = announce?.[5] ?? [];
    const c = direct?.[5] ?? [];
    const base = d.lay.frame.yAt(0);
    expect(a[3]).toBeCloseTo(base, 6);
    expect(c[3]).toBeCloseTo(base, 6);
    // Announce 4 stands 4 times as tall as Direct 1, each from the baseline.
    expect(base - (a[1] ?? 0)).toBeCloseTo(4 * (base - (c[1] ?? 0)), 0);
    expect((c[0] ?? 0) - (a[2] ?? 0)).toBeGreaterThan(1);
    const nav = navigator(d.model, d.lay);
    const rings = (part: number | undefined) => {
      drawSelection(d.svg, d.model, d.lay, { kind: "rect", i: 5, part }, nav);
      return boxes(d.svg.querySelector('[data-part="ring"]'));
    };
    // 1 px inside each drawn sub-column, Path's empty slot left out.
    const near = (v: number | undefined) => expect.closeTo(v ?? 0, 1);
    expect(rings(undefined).map((r) => r[0])).toEqual([
      near((a[0] ?? 0) + 1),
      near((c[0] ?? 0) + 1),
    ]);
    expect(rings(2)).toEqual([
      [near((c[0] ?? 0) + 1), near((c[1] ?? 0) + 1), near((c[2] ?? 0) - 1), near(base - 1)],
    ]);
  });

  it("strokes each line 2 px in its slot", () => {
    const d = draw(stepLine);
    const paths = series(d, "line");
    expect(paths.map((p) => p.dataset["series"])).toEqual(["1", "2"]);
    for (const p of paths) {
      const cs = getComputedStyle(p);
      expect(cs.fill).toBe("none");
      expect(cs.strokeWidth).toBe("2px");
      expect(cs.stroke).toBe(token(p, `var(--cp-series-${p.dataset["series"] ?? ""})`));
      expect(p.getAttribute("d")).toMatch(/^M[\d.]+ [\d.]+L/);
    }
  });

  it("draws a dot row as one path of round dots in the mark's slot, rows on hairlines", () => {
    const d = draw(strip(["silent", "lead-ui", "docs"]));
    const g = d.svg.querySelector('[data-part="dot"]');
    expect(g?.getAttribute("data-series")).toBe("1");
    const paths = series(d, "dot");
    expect(paths.map((p) => (p.getAttribute("d")?.match(/h0/g) ?? []).length)).toEqual([0, 3, 6]);
    const dot = getComputedStyle(paths[1] as Element);
    expect(dot.stroke).toBe(token(paths[1] as Element, "var(--cp-series-1)"));
    expect([dot.strokeWidth, dot.strokeLinecap]).toEqual(["6px", "round"]);
    expect(d.svg.querySelector('[data-part="rows"]')?.getAttribute("d")?.match(/M/g)).toHaveLength(
      3,
    );
  });

  it("draws rules 2 px in ink, and a rule outside the domain as its label only", () => {
    const edges = durationEdges();
    const d = draw({
      x: { type: "log", format: "duration", domain: [1_000, edges.at(-1) ?? 0] },
      marks: [
        {
          mark: "rect",
          x1: edges.slice(0, -1),
          x2: edges.slice(1),
          series: [{ name: "Reads", y: edges.slice(1).map(() => 2) }],
        },
        { mark: "rule", x: 42_000, label: "Median" },
        { mark: "rule", x: 4 * 86_400_000, label: "95th percentile" },
      ],
    });
    const rules = [...d.svg.querySelectorAll('[data-part="rule"]')];
    expect(rules).toHaveLength(1);
    const cs = getComputedStyle(rules[0] as Element);
    expect(cs.strokeWidth).toBe("2px");
    expect(cs.stroke).toBe(token(rules[0] as Element, "var(--cp-ink)"));
    const labels = [...d.svg.querySelectorAll('[data-part="rule-label"] text')].map(
      (t) => t.textContent,
    );
    expect(labels[1]).toMatch(/^95th percentile .+, off the axis$/);
  });

  it("cuts rects crossing a passed domain at the plot's edges, over neither gutter", () => {
    const d = draw({ ...stacked, x: { type: "time", domain: [450_000, 23.5 * 900_000] } });
    const area = d.svg.querySelector('[data-part="area"]') as SVGSVGElement;
    for (const p of series(d, "rect")) {
      const box = p.getBBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(d.lay.frame.width + 1e-6);
    }
    expect(Number(area.getAttribute("width"))).toBe(d.lay.frame.width + 2 * AREA_ROOM);
    expect(Number(area.getAttribute("x"))).toBe(d.lay.left - AREA_ROOM);
  });

  it("writes only finite numbers into the drawing, for every mark on every scale", () => {
    const edges = durationEdges();
    const rule = (axis: "x" | "y", v: number) => ({ mark: "rule", [axis]: v, label: "R" }) as const;
    const line = (x: number[], y: (number | null)[]) =>
      ({ mark: "line", x, series: [{ name: "a", y }] }) as const;
    const specs: ChartSpec[] = [
      { ...stacked, marks: [...stacked.marks, rule("x", 900_000), rule("y", 99), rule("x", -5)] },
      {
        x: { type: "log", format: "duration", domain: [1_000, edges.at(-1) ?? 0] },
        marks: [
          {
            mark: "rect",
            x1: edges.slice(0, -1),
            x2: edges.slice(1),
            series: [{ name: "Reads", y: edges.slice(1).map((_, i) => i % 3) }],
          },
          rule("x", 400),
          rule("x", 0),
          rule("x", -1),
          rule("x", 9e12),
        ],
      },
      ...(["linear", "log", "time"] as const).flatMap((type) => [
        {
          x: type === "log" ? { type, domain: [1, 100] as const } : { type },
          y: { type: "log" as const },
          marks: [line([0, 1, 10, 100, 200], [2, 0, -3, null, 8]), rule("y", 0), rule("y", 4)],
        },
        {
          x: { type, reverse: true },
          y: { zero: false },
          marks: [{ ...line([1, 2, 3], [-2, Number.NaN, 5]), curve: "step" as const }],
        },
        {
          x: type === "log" ? { type, domain: [1, 1_000] as const } : { type },
          y: { type: "band" as const },
          marks: [
            {
              mark: "dot" as const,
              rows: [
                { name: "a", x: [0, 1, 1, 50] },
                { name: "b", x: [] },
              ],
            },
            rule("x", 0),
          ],
        },
      ]),
    ];
    for (const spec of specs) {
      const d = draw(spec);
      for (const el of [d.svg, ...d.svg.querySelectorAll("*")]) {
        for (const a of el.attributes) {
          expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/Infinity|NaN/);
        }
      }
    }
  });

  it("clips the marks to the plot's area while the axis labels sit outside it", () => {
    const d = draw(stacked);
    const area = d.svg.querySelector('[data-part="area"]') as SVGSVGElement;
    expect(getComputedStyle(area).overflow).toBe("hidden");
    expect(getComputedStyle(d.svg).overflow).toBe("visible");
  });

  it("puts gridlines in the line colour and the zero line in the strong border", () => {
    const d = draw(stacked);
    const grid = d.svg.querySelector('[data-part="grid"]') as Element;
    const zero = d.svg.querySelector('[data-part="zero"]') as Element;
    expect(getComputedStyle(grid).stroke).toBe(token(grid, "var(--cp-line)"));
    expect(getComputedStyle(zero).stroke).toBe(token(zero, "var(--cp-border-strong)"));
    const text = d.svg.querySelector('[data-part="y"] text') as Element;
    expect(getComputedStyle(text).fill).toBe(token(text, "var(--cp-ink-muted)"));
    expect(getComputedStyle(text).fontSize).toBe("13px");
  });
});

describe("the page's measures", () => {
  it("reads a dot row 24 px tall under a mouse and a finger, taller at twice the text size", () => {
    const d = draw(strip(["a", "b"]));
    expect(readMetrics(d.plot, "en").row).toBe(24);
    root.dataset["pointer"] = "coarse";
    expect(readMetrics(d.plot, "en").row).toBe(24);
    root.style.fontSize = "32px";
    expect(readMetrics(d.plot, "en").row).toBeCloseTo(45.5, 6);
  });

  it("reads the group gutters, set in rem, back in px", () => {
    const parent = place(800);
    parent.style.setProperty("--cp-chart-axis-gutter", "8rem");
    parent.style.setProperty("--cp-chart-label-gutter", "5rem");
    const d = draw(stacked, 800, parent);
    expect(readMetrics(d.plot, "en")).toMatchObject({ axisGroup: 128, labelGroup: 80 });
  });

  it("takes a 240 px plot, or 200 px under 30rem", () => {
    expect(draw(stacked, 600).lay.frame.height).toBe(240);
    expect(draw(stacked, 400).lay.frame.height).toBe(200);
  });

  it("gives the plot pan-y pinch-zoom and a transparent 1 px border", () => {
    const cs = getComputedStyle(draw(stacked).plot);
    expect(cs.touchAction).toBe("pan-y pinch-zoom");
    expect(cs.borderTopWidth).toBe("1px");
    expect(cs.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("charts in a group", () => {
  const edges = (d: Drawn) => {
    const r = (d.svg.querySelector('[data-part="area"]') as Element).getBoundingClientRect();
    return [r.left, r.right];
  };

  it("share their plots' left and right edges through the group gutters", () => {
    const parent = place(900);
    parent.style.setProperty("--cp-chart-axis-gutter", "8rem");
    parent.style.setProperty("--cp-chart-label-gutter", "5rem");
    const bars = draw(stacked, 900, parent);
    const line = draw(stepLine, 900, parent);
    expect(edges(line)).toEqual(edges(bars));
  });

  it("cut a band name wider than the group gutter, so a strip and a column chart share their left edge", () => {
    const parent = place(600);
    parent.style.setProperty("--cp-chart-axis-gutter", "5rem");
    const bars = draw(stacked, 600, parent);
    const dots = draw(strip(["an-agent-with-a-very-long-name", "b"]), 600, parent);
    expect(edges(dots)[0]).toBe(edges(bars)[0]);
    const name = dots.svg.querySelector('[data-part="y"] text');
    expect(name?.textContent.endsWith("…")).toBe(true);
    expect(name?.hasAttribute("data-mono")).toBe(true);
  });
});

describe("labels", () => {
  const overlaps = (d: Drawn) => {
    const boxes = [...d.svg.querySelectorAll<SVGTextElement>('[data-part="x"] text')]
      .map((t) => t.getBBox())
      .sort((a, b) => a.x - b.x || a.y - b.y);
    return boxes.some((a, i) =>
      boxes.slice(i + 1).some((b) => b.x < a.x + a.width && Math.abs(b.y - a.y) < a.height / 2),
    );
  };

  it("keeps no two x labels overlapping at any width, ticks thinning as it narrows", () => {
    const wide = draw(stepLine, 1200);
    const narrow = draw(stepLine, 320);
    expect(overlaps(wide)).toBe(false);
    expect(overlaps(narrow)).toBe(false);
    expect(narrow.lay.xLabels.length).toBeLessThan(wide.lay.xLabels.length);
  });

  it("labels lines at their ends from 30rem up and drops them under it", () => {
    const wide = draw(stepLine, 600);
    expect(
      [...wide.svg.querySelectorAll('[data-part="end"] text')].map((t) => t.textContent),
    ).toHaveLength(2);
    const end = wide.svg.querySelector('[data-part="end"] text') as Element;
    expect(getComputedStyle(end).fill).toBe(token(end, "var(--cp-ink)"));
    const narrow = draw(stepLine, 400);
    expect(narrow.svg.querySelectorAll('[data-part="end"] text')).toHaveLength(0);
    expect(narrow.lay.gutters.label).toBe(0);
  });

  it("keeps the plot left to right under dir=rtl while the legend row mirrors", () => {
    const box = place(600);
    box.dir = "rtl";
    const d = draw(stacked, 600, box);
    const xs = [...d.svg.querySelectorAll<SVGTextElement>('[data-part="x"] text')].map(
      (t) => t.getBBox().x,
    );
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(d.lay.left).toBe(d.lay.gutters.axis);
    const [first, last] = [d.legend.firstElementChild, d.legend.lastElementChild].map((e) =>
      (e as Element).getBoundingClientRect(),
    );
    expect(first?.left).toBeGreaterThan(last?.left ?? 0);
  });
});

describe("the legend row", () => {
  it("names each series in a chip with its slot's swatch, and the total", () => {
    const d = draw(stacked);
    const chips = [...d.legend.querySelectorAll(".cp-chip")];
    expect(chips.map((c) => c.getAttribute("data-series"))).toEqual(["1", "2", "4"]);
    expect(chips.map((c) => c.querySelector("bdi")?.textContent)).toEqual([
      "Announce",
      "Path",
      "Direct",
    ]);
    const swatch = chips[0]?.querySelector(".cp-swatch") as Element;
    expect(getComputedStyle(swatch).backgroundColor).toBe(
      token(swatch, "var(--cp-series-1)", "backgroundColor"),
    );
    expect(d.legend.querySelector('[data-part="total"]')?.textContent).toBe("Total 178");
  });

  it("keeps its box the same size across every selection", () => {
    const d = draw(stacked, 420);
    const rect = d.model.marks[0] as RectModel;
    const size = () => {
      const r = d.legend.getBoundingClientRect();
      return [r.width, r.height];
    };
    const at = size();
    for (const i of rect.shown) {
      writeLegend(d.legend, bucketReading(d.model, rect, i, words));
      expect(size()).toEqual(at);
    }
  });
});

describe("surfaces", () => {
  it.each(["light", "dark"] as const)(
    "leaves the plot transparent inside .cp-detail in the %s theme",
    (t) => {
      root.dataset["theme"] = t;
      const parent = place(700);
      parent.className = "cp-list-detail";
      const detail = document.createElement("div");
      detail.className = "cp-detail";
      parent.append(detail);
      const d = draw(stacked, 700, detail);
      expect(getComputedStyle(d.svg).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      const filled = [...d.svg.querySelectorAll("path")].filter(
        (p) => getComputedStyle(p).fill !== "none",
      );
      expect(filled.every((p) => p.closest('[data-part="rect"]') !== null)).toBe(true);
    },
  );

  const palettes = ["light", "dark"] as const;
  const themes = ["light", "dark", undefined] as const;
  it.skipIf(!emulates).each(palettes.flatMap((p) => themes.map((t) => [p, t] as const)))(
    "draws the plot on the %s palette's side under forced colours, data-theme %s",
    async (palette, t) => {
      if (t !== undefined) {
        root.dataset["theme"] = t;
      }
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [
          { name: "forced-colors", value: "active" },
          { name: "prefers-color-scheme", value: palette },
        ],
      });
      const page = draw(stacked);
      const parent = place(700);
      parent.className = "cp-list-detail";
      const detail = document.createElement("div");
      detail.className = "cp-detail";
      parent.append(detail);
      const raised = draw(stepLine, 700, detail);
      for (const [d, surface] of [
        [page, "--cp-surface-page"],
        [raised, "--cp-surface-raised"],
      ] as const) {
        const cs = getComputedStyle(d.svg);
        expect(cs.getPropertyValue("forced-color-adjust")).toBe("none");
        expect(cs.backgroundColor).toBe(
          token(d.svg, `var(${surface})`, "backgroundColor", palette),
        );
        expect(getComputedStyle(d.plot).borderTopColor).toBe(token(d.plot, "CanvasText"));
      }
      const parts: [string, string, "fill" | "stroke"][] = [
        ['[data-part="rect"] path[data-series="2"]', "var(--cp-series-2)", "fill"],
        ['[data-part="y"] text', "var(--cp-ink-muted)", "fill"],
        ['[data-part="grid"]', "var(--cp-line)", "stroke"],
        ['[data-part="zero"]', "var(--cp-border-strong)", "stroke"],
        ['[data-part="ticks"]', "var(--cp-line)", "stroke"],
      ];
      for (const [selector, value, prop] of parts) {
        const el = page.svg.querySelector(selector) as Element;
        expect(getComputedStyle(el)[prop], selector).toBe(token(el, value, "color", palette));
      }
      const end = raised.svg.querySelector('[data-part="end"] text') as Element;
      expect(getComputedStyle(end).fill).toBe(token(end, "var(--cp-ink)", "color", palette));
      const line = raised.svg.querySelector('[data-part="line"] path') as Element;
      expect(getComputedStyle(line).stroke).toBe(
        token(line, "var(--cp-series-1)", "color", palette),
      );
    },
  );
});
