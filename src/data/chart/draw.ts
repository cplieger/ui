/**
 * draw.ts — a chart's SVG and its legend row from a layout: attribute and
 * text writes only, and the metrics a layout needs, read outside any draw.
 * @module
 */

import { fontMeasure } from "../scale/measure.js";

import {
  dotGroups,
  dotPath,
  hairline,
  linePath,
  num,
  rectPaths,
  rulePath,
  snap,
  tickPath,
} from "./geometry.js";
import type { Layout, Metrics, Text } from "./layout.js";
import type { Model } from "./model.js";
import type { Reading, Widths } from "./readout.js";

const SVG = "http://www.w3.org/2000/svg";

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

const px = (style: CSSStyleDeclaration, name: string, fallback: number): number => {
  const v = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

/**
 * What a layout reads from the page for `plot` (the chart's
 * `[data-part="plot"]`), in `locale`: its fonts, its line, row and plot
 * heights, the group gutters, the root's rem and the device pixel ratio. A
 * layout read, so it runs on a render or a resize, never inside a draw.
 */
export function readMetrics(plot: HTMLElement, locale: string | undefined): Metrics {
  const style = getComputedStyle(plot);
  const size = Number.parseFloat(style.fontSize) || 13;
  const probe = document.createElement("span");
  probe.dataset["mono"] = "";
  plot.append(probe);
  const mono = fontMeasure(probe, locale);
  probe.remove();
  return {
    measure: fontMeasure(plot, locale),
    mono,
    lineHeight: Math.ceil(size * 1.3),
    rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
    row: px(style, "--cp-chart-row", 24),
    axisGroup: px(style, "--cp-chart-axis-gutter", 0),
    labelGroup: px(style, "--cp-chart-label-gutter", 0),
    height: px(style, "--cp-chart-height", 240),
    dpr: window.devicePixelRatio || 1,
  };
}

function texts(part: string, list: readonly Text[], mono = false): SVGElement {
  const g = svgEl("g", { "data-part": part });
  for (const t of list) {
    const text = svgEl("text", { x: num(t.x), y: num(t.y), "text-anchor": t.anchor });
    if (mono) {
      text.setAttribute("data-mono", "");
    }
    text.textContent = t.text;
    g.append(text);
  }
  return g;
}

// The plot's marks, in spec order, inside a nested SVG that clips them to
// the plot's width and to 2 px past its top and bottom, room for a stroke.
function plotArea(model: Model, lay: Layout): SVGElement {
  const f = lay.frame;
  const area = svgEl("svg", {
    "data-part": "area",
    x: num(lay.left),
    y: num(lay.top - 2),
    width: num(f.width),
    height: num(f.height + 4),
    viewBox: `0 -2 ${num(f.width)} ${num(f.height + 4)}`,
  });
  const grid: string[] = [];
  let zero = "";
  for (const t of lay.yAxis?.ticks ?? []) {
    if (t.value === 0) {
      zero = hairline(t.at, f.width, f.dpr);
    } else {
      grid.push(hairline(t.at, f.width, f.dpr));
    }
  }
  if (lay.yAxis !== undefined && zero === "" && lay.yAxis.lo <= 0 && lay.yAxis.hi >= 0) {
    zero = hairline(f.yAt(0), f.width, f.dpr);
  }
  const rows = lay.rows.map((r) => hairline(r.y, f.width, f.dpr));
  if (grid.length > 0) {
    area.append(svgEl("path", { "data-part": "grid", d: grid.join("") }));
  }
  if (rows.length > 0) {
    area.append(svgEl("path", { "data-part": "rows", d: rows.join("") }));
  }
  if (zero !== "") {
    area.append(svgEl("path", { "data-part": "zero", d: zero }));
  }
  for (const m of model.marks) {
    switch (m.kind) {
      case "rect": {
        const g = svgEl("g", { "data-part": "rect" });
        rectPaths(m, f).forEach((d, k) => {
          g.append(svgEl("path", { "data-series": String(m.series[k]?.slot ?? 1), d }));
        });
        area.append(g);
        break;
      }
      case "line": {
        const g = svgEl("g", { "data-part": "line" });
        m.series.forEach((s, k) => {
          g.append(svgEl("path", { "data-series": String(s.slot), d: linePath(m, k, f) }));
        });
        area.append(g);
        break;
      }
      case "dot": {
        const g = svgEl("g", { "data-part": "dot", "data-series": String(m.slot) });
        m.rows.forEach((row, r) => {
          const cy = snap(lay.rows[r]?.y ?? 0, f.dpr) + 0.5;
          g.append(svgEl("path", { d: dotPath(dotGroups(row, f), cy) }));
        });
        area.append(g);
        break;
      }
      case "rule":
        if ("at" in m.place) {
          const at = m.axis === "x" ? f.xAt(m.place.at) : f.yAt(m.place.at);
          area.append(svgEl("path", { "data-part": "rule", d: rulePath(m.axis, at, f) }));
        }
        break;
    }
  }
  if (lay.plotLabels.length > 0) {
    area.append(texts("rule-label", lay.plotLabels));
  }
  return area;
}

/** Draws `model` laid out as `lay` into `svg`, replacing what it held. */
export function drawPlot(svg: SVGSVGElement, model: Model, lay: Layout): void {
  svg.setAttribute("width", num(lay.width));
  svg.setAttribute("height", num(lay.height));
  svg.setAttribute("viewBox", `0 0 ${num(lay.width)} ${num(lay.height)}`);
  const ticks = svgEl("path", {
    "data-part": "ticks",
    transform: `translate(${num(lay.left)} ${num(lay.top + lay.frame.height)})`,
    d: tickPath(
      lay.xAxis.ticks.map((t) => t.at),
      lay.frame.dpr,
    ),
  });
  svg.replaceChildren(
    texts("y", lay.yLabels, lay.mono),
    ticks,
    texts("x", lay.xLabels),
    texts("titles", lay.titles),
    texts("rule-label", lay.ruleLabels),
    plotArea(model, lay),
    texts("end", lay.endLabels),
  );
}

function span(part: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.dataset["part"] = part;
  return el;
}

function bdi(text: string): HTMLElement {
  const el = document.createElement("bdi");
  el.textContent = text;
  return el;
}

/**
 * Builds the legend row's entries for readings shaped like `reading`: the
 * x slot, a chip per named series with its swatch, a bare value for a lone
 * series, and a stack's total, each slot kept at its width in `widths`.
 */
export function frameLegend(
  legend: HTMLElement,
  reading: Reading,
  widths: Widths,
  total: string,
): void {
  const at = span("at");
  at.style.minInlineSize = `${num(widths.at)}px`;
  const parts: HTMLElement[] = [at];
  reading.entries.forEach((e, k) => {
    const value = span("value");
    value.style.minInlineSize = `${num(widths.values[k] ?? 0)}px`;
    if (e.name === undefined) {
      parts.push(value);
      return;
    }
    const chip = document.createElement("span");
    chip.className = "cp-chip";
    chip.dataset["series"] = String(e.slot ?? 1);
    const swatch = document.createElement("span");
    swatch.className = "cp-swatch";
    chip.append(swatch, bdi(e.name), value);
    parts.push(chip);
  });
  if (reading.total !== undefined) {
    const whole = span("total");
    const value = span("value");
    value.style.minInlineSize = `${num(widths.total)}px`;
    whole.append(total, " ", value);
    parts.push(whole);
  }
  legend.replaceChildren(...parts);
  writeLegend(legend, reading);
}

/** Writes `reading` into a legend row `frameLegend` built for its shape. */
export function writeLegend(legend: HTMLElement, reading: Reading): void {
  const at = legend.querySelector('[data-part="at"]');
  at?.replaceChildren(bdi(reading.at));
  const values = legend.querySelectorAll('[data-part="value"]');
  reading.entries.forEach((e, k) => {
    const el = values[k];
    if (el !== undefined) {
      el.textContent = e.value;
    }
  });
  const total = values[reading.entries.length];
  if (total !== undefined) {
    total.textContent = reading.total ?? "";
  }
}
