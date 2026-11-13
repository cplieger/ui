/**
 * draw.ts — a chart's SVG and its legend row from a layout: attribute and
 * text writes only, and the metrics a layout needs, read outside any draw.
 * @module
 */

import { fontMeasure } from "../scale/measure.js";

import {
  areaPaths,
  barPaths,
  barSegments,
  bucketEdges,
  dotGroups,
  dotPath,
  groupEdges,
  hairline,
  linePath,
  num,
  rectPaths,
  rulePath,
  snap,
  type Segment,
  tickPath,
  upright,
} from "./geometry.js";
import type { Layout, Metrics, Note, Text } from "./layout.js";
import { drawnTotal, drawnValue, sampleValue, type Model } from "./model.js";
import { MARKER_RADIUS } from "./notes.js";
import { primaryOf, type Reading, type Widths } from "./readout.js";
import type { Navigator, Selection } from "./select.js";

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
  // Every read of the plot's style comes before the probe changes the tree,
  // which would make each later read restyle the page.
  const style = getComputedStyle(plot);
  const size = Number.parseFloat(style.fontSize) || 13;
  const read = {
    row: px(style, "--cp-chart-row", 24),
    nameLine: Math.ceil(size * px(style, "--cp-leading-ui", 1.35)),
    axisGroup: px(style, "--cp-chart-axis-gutter", 0),
    labelGroup: px(style, "--cp-chart-label-gutter", 0),
    height: px(style, "--cp-chart-height", 240),
    rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
  };
  const measure = fontMeasure(plot, locale);
  const probe = document.createElement("span");
  probe.dataset["mono"] = "";
  plot.append(probe);
  const mono = fontMeasure(probe, locale);
  probe.remove();
  return {
    measure,
    mono,
    lineHeight: Math.ceil(size * 1.3),
    ...read,
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

// A note's numbered marker at its point, moved in by up to AREA_ROOM px at
// the plot's edge so the area's clip never cuts the circle.
function marker(note: Note, f: Layout["frame"]): SVGElement {
  const r = MARKER_RADIUS;
  const inside = (v: number, hi: number) =>
    Math.min(Math.max(v, r - AREA_ROOM), Math.max(hi + AREA_ROOM - r, r - AREA_ROOM));
  const cx = inside(note.point.x, f.width);
  const cy = inside(note.point.y, f.height);
  const g = svgEl("g", { "data-part": "marker" });
  g.append(svgEl("path", { d: ring(cx, cy, r) }));
  g.append(texts("number", [{ text: String(note.number), x: cx, y: cy, anchor: "middle" }]));
  return g;
}

/** The px the area's clip leaves past each side of the plot: the selection
 *  ring's radius 4 and half its 2 px stroke, which also hold a dot's 3 px
 *  radius and a line's cap, so a mark at the plot's edge draws whole. */
export const AREA_ROOM = 5;

// The plot's marks, in spec order, inside a nested SVG that clips them to
// the plot outset by AREA_ROOM; its user space keeps 0 0 at the plot's corner.
function plotArea(model: Model, lay: Layout): SVGElement {
  const f = lay.frame;
  const w = num(f.width + 2 * AREA_ROOM);
  const h = num(f.height + 2 * AREA_ROOM);
  const area = svgEl("svg", {
    "data-part": "area",
    x: num(lay.left - AREA_ROOM),
    y: num(lay.top - AREA_ROOM),
    width: w,
    height: h,
    viewBox: `${String(-AREA_ROOM)} ${String(-AREA_ROOM)} ${w} ${h}`,
  });
  const grid: string[] = [];
  let zero = "";
  // A bar's value axis is x, so its gridlines and zero line stand upright.
  const bars = primaryOf(model)?.kind === "bar";
  if (bars) {
    for (const t of lay.xAxis.ticks) {
      if (t.value !== 0) {
        grid.push(upright(t.at, f.height, f.dpr));
      }
    }
    if (lay.xAxis.lo <= 0 && lay.xAxis.hi >= 0) {
      const ats = f.panels?.map((p) => p.at(0)) ?? [f.xAt(0)];
      zero = ats.map((at) => upright(at, f.height, f.dpr)).join("");
    }
  }
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
  const rows = bars ? [] : lay.rows.map((r) => hairline(r.y, f.width, f.dpr));
  if (grid.length > 0) {
    area.append(svgEl("path", { "data-part": "grid", d: grid.join("") }));
  }
  if (rows.length > 0) {
    area.append(svgEl("path", { "data-part": "rows", d: rows.join("") }));
  }
  if (zero !== "") {
    area.append(svgEl("path", { "data-part": "zero", d: zero }));
  }
  model.marks.forEach((m, index) => {
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
      case "area": {
        // "area" names the clipping svg, so the layers' group takes "layers".
        const g = svgEl("g", { "data-part": "layers" });
        areaPaths(m, f).forEach((d, k) => {
          g.append(svgEl("path", { "data-series": String(m.series[k]?.slot ?? 1), d }));
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
      case "bar": {
        const g = svgEl("g", { "data-part": "bar" });
        const ys = lay.rows.map((r) => r.y);
        for (const p of barPaths(m, ys, lay.bar, f)) {
          g.append(svgEl("path", { "data-series": String(p.slot), d: p.d }));
        }
        area.append(g);
        break;
      }
      case "rule":
        if ("at" in m.place) {
          const at = m.axis === "x" ? f.xAt(m.place.at) : f.yAt(m.place.at);
          area.append(svgEl("path", { "data-part": "rule", d: rulePath(m.axis, at, f) }));
        }
        break;
      case "text": {
        const note = lay.notes.find((n) => n.mark === index);
        if (note !== undefined) {
          area.append(lay.numbered ? marker(note, f) : texts("note", note.lines));
        }
        break;
      }
    }
  });
  if (lay.valueLabels.length > 0) {
    area.append(texts("value", lay.valueLabels));
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
    texts("head", lay.heads),
    plotArea(model, lay),
    texts("end", lay.endLabels),
  );
}

const ring = (cx: number, cy: number, r: number): string =>
  `M${num(cx - r)} ${num(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0`;

// A rectangle's outline drawn 1 px inside its edges, so its 2 px stroke
// stays on the bar and covers no neighbour.
function inset(left: number, right: number, top: number, bottom: number): string {
  const dx = Math.min(1, (right - left) / 2);
  const dy = Math.min(1, (bottom - top) / 2);
  return `M${num(left + dx)} ${num(top + dy)}H${num(right - dx)}V${num(bottom - dy)}H${num(left + dx)}Z`;
}

// A bar's outline 1 px outside its edges, so its 2 px stroke frames the bar
// and covers none of it.
const outset = (g: Segment): string =>
  `M${num(g.left - 1)} ${num(g.top - 1)}H${num(g.right + 1)}V${num(g.bottom + 1)}H${num(g.left - 1)}Z`;

/** The ring's path for `sel`: the bar or its segment, a group's sub-columns
 *  or the chosen one, each line's point or each layer's top or the chosen
 *  one, the drawn dot, a row's hairline, or a bar row's bar, its bars in
 *  each panel, or the chosen part. */
function ringPath(model: Model, lay: Layout, sel: Selection, nav: Navigator): string {
  const f = lay.frame;
  const m = primaryOf(model);
  if (sel.kind === "rect" && m?.kind === "rect") {
    if (m.arrange === "group") {
      const subs = groupEdges(m, sel.i, f);
      return m.series
        .map((s, k) => {
          const v = s.y[sel.i] ?? 0;
          const sub = subs[k];
          const chosen = sel.part === undefined || sel.part === k;
          return chosen && v > 0 && sub !== undefined
            ? inset(sub.left, sub.right, f.yAt(v), f.yAt(0))
            : "";
        })
        .join("");
    }
    const { left, right } = bucketEdges(m, sel.i, f);
    let base = 0;
    let out = "";
    m.series.forEach((s, k) => {
      const v = drawnValue(m, s, sel.i);
      const lo = base;
      base += Math.max(v, 0);
      if (sel.part === k && v > 0) {
        out = inset(left, right, f.yAt(base), f.yAt(lo));
      }
    });
    if (sel.part === undefined && base > 0) {
      out = inset(left, right, f.yAt(base), f.yAt(0));
    }
    return out;
  }
  if (sel.kind === "area" && m?.kind === "area") {
    if (drawnTotal(m, sel.i) === null) {
      return "";
    }
    const cx = f.xAt(m.x[sel.i] ?? 0);
    let top = 0;
    return m.series
      .map((s, k) => {
        top += sampleValue(m, s, sel.i) ?? 0;
        return sel.part === undefined || sel.part === k ? ring(cx, f.yAt(top), 4) : "";
      })
      .join("");
  }
  if (sel.kind === "line" && m?.kind === "line") {
    const cx = f.xAt(m.x[sel.i] ?? 0);
    return m.series
      .filter((_, k) => sel.part === undefined || sel.part === k)
      .map((s) => s.y[sel.i])
      .filter((v): v is number => v !== null && v !== undefined)
      .map((v) => ring(cx, f.yAt(v), 4))
      .join("");
  }
  if (sel.kind === "bar" && m?.kind === "bar") {
    const cy = lay.rows[sel.row]?.y ?? 0;
    const segs = barSegments(m, sel.row, f, cy, lay.bar).filter(
      (g, k): g is Segment => g !== undefined && (sel.part === undefined || sel.part === k),
    );
    if (segs.length === 0) {
      return "";
    }
    // Panels stand apart, so each bar takes its own ring.
    if (f.panels !== undefined) {
      return segs.map(outset).join("");
    }
    // The whole row rings the box around its bars; a chosen part, that bar.
    const g = segs.reduce((a, b) => ({
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
    }));
    return outset(g);
  }
  const cy = snap(lay.rows[sel.kind === "dot" || sel.kind === "row" ? sel.row : 0]?.y ?? 0, f.dpr);
  if (sel.kind === "row") {
    return `M0 ${num(cy + 0.5)}H${num(f.width)}`;
  }
  const at = nav.crosshair(sel);
  return at === undefined ? "" : ring(at, cy + 0.5, 4);
}

/**
 * Draws `sel`'s crosshair and ring over the plot `drawPlot` drew in `svg`,
 * replacing the last; none with no selection.
 */
export function drawSelection(
  svg: SVGSVGElement,
  model: Model,
  lay: Layout,
  sel: Selection | undefined,
  nav: Navigator,
): void {
  const area = svg.querySelector('[data-part="area"]');
  area?.querySelector('[data-part="selection"]')?.remove();
  // A bar row's selection shows by its name's weight too, not by colour alone.
  svg.querySelectorAll('[data-part="y"] > text').forEach((name, r) => {
    name.toggleAttribute("data-selected", sel?.kind === "bar" && sel.row === r);
  });
  if (area === null || sel === undefined) {
    return;
  }
  const g = svgEl("g", { "data-part": "selection" });
  const at = nav.crosshair(sel);
  if (at !== undefined) {
    const x = num(snap(at, lay.frame.dpr) + 0.5);
    g.append(svgEl("path", { "data-part": "crosshair", d: `M${x} 0V${num(lay.frame.height)}` }));
  }
  const d = ringPath(model, lay, sel, nav);
  if (d !== "") {
    g.append(svgEl("path", { "data-part": "ring", d }));
  }
  area.append(g);
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
