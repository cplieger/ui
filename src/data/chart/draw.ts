/**
 * draw.ts — a chart's SVG and its legend row from a layout: attribute and
 * text writes only, and the metrics a layout needs, read outside any draw.
 * @module
 */

import { fontMeasure, type Measure } from "../scale/measure.js";

import {
  areaPaths,
  arrowPaths,
  barPaths,
  boxPaths,
  barSegments,
  bubblePaths,
  bucketEdges,
  calendarPaths,
  cellBox,
  cellPaths,
  dayBox,
  dotGroups,
  dotPath,
  dotRadius,
  groupEdges,
  hairline,
  linePath,
  num,
  POINT_RADIUS,
  pointAt,
  pointPaths,
  rangePath,
  rectPaths,
  rulePath,
  ruleXs,
  scatterAt,
  scatterPaths,
  SLOPE_RADIUS,
  slopeEnds,
  slopePaths,
  snap,
  type Segment,
  tickPath,
  upright,
} from "./geometry.js";
import { dayPlace } from "./calendar.js";
import type { Layout, Leader, Metrics, Note, Text } from "./layout.js";
import { drawnTotal, drawnValue, sampleValue, type Model } from "./model.js";
import { MARKER_RADIUS } from "./notes.js";
import { primaryOf, type Reading, type Widths } from "./readout.js";
import type { Words } from "./words.js";
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
  // A bar's, a point's and a box's value axis is x, so their gridlines and
  // zero line stand upright, and a scatter's stand both ways; a point
  // chart's, a box plot's and a scatter's zero is only a linear x's.
  const primary = primaryOf(model);
  const bars = primary?.kind === "bar";
  const placed = primary?.kind === "point" || primary?.kind === "box";
  if (bars || placed || primary?.kind === "scatter") {
    for (const t of lay.xAxis.ticks) {
      if (t.value !== 0 || model.x.type !== "linear") {
        grid.push(upright(t.at, f.height, f.dpr));
      }
    }
    if (primary.kind !== "bar") {
      if (model.x.type === "linear" && lay.xAxis.lo <= 0 && lay.xAxis.hi >= 0) {
        zero = upright(f.xAt(0), f.height, f.dpr);
      }
    } else if (lay.xAxis.lo <= 0 && lay.xAxis.hi >= 0) {
      // A mirror's baselines stand in its spine, each just outside its side's bars.
      const spine = primary.arrange === "mirror";
      const ats = f.panels?.map((p) => p.at(0) - (spine && !p.leftward ? 1 : 0)) ?? [f.xAt(0)];
      zero = ats.map((at) => upright(at, f.height, f.dpr)).join("");
    }
  }
  let yZero = "";
  // A cell chart's gaps are its grid, and a binned y's 0 is a bin edge.
  const yTicks = primary?.kind === "cell" ? [] : (lay.yAxis?.ticks ?? []);
  for (const t of yTicks) {
    if (t.value === 0) {
      yZero = hairline(t.at, f.width, f.dpr);
    } else {
      grid.push(hairline(t.at, f.width, f.dpr));
    }
  }
  const y = primary?.kind === "cell" ? undefined : lay.yAxis;
  if (y !== undefined && yZero === "" && y.lo <= 0 && y.hi >= 0) {
    yZero = hairline(f.yAt(0), f.width, f.dpr);
  }
  zero += yZero;
  // Bars and cells fill their rows, and a box's whiskers lie on its row's
  // line, so none draws a row's hairline.
  const rows =
    bars || primary?.kind === "cell" || primary?.kind === "box"
      ? []
      : lay.rows.map((r) => hairline(r.y, f.width, f.dpr));
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
      case "point": {
        const ys = lay.rows.map((r) => r.y);
        // A link lies under its dots, which cover its ends.
        if (m.link === "range") {
          area.append(svgEl("path", { "data-part": "link", d: rangePath(m, ys, f) }));
        } else if (m.link === "arrow") {
          const { shafts, heads } = arrowPaths(m, ys, f);
          area.append(
            svgEl("path", { "data-part": "arrow", d: shafts }),
            svgEl("path", { "data-part": "arrowhead", d: heads }),
          );
        }
        const g = svgEl("g", { "data-part": "point" });
        pointPaths(m, ys, f).forEach((d, k) => {
          g.append(svgEl("path", { "data-series": String(m.series[k]?.slot ?? 1), d }));
        });
        area.append(g);
        break;
      }
      case "box": {
        // Each median tick lies over its box's cut, past its edges.
        const { series, medians } = boxPaths(
          m,
          lay.rows.map((r) => r.y),
          f,
        );
        const parts = (
          part: "whisker" | "box" | "outlier",
          key: "whiskers" | "boxes" | "outliers",
        ) => {
          const g = svgEl("g", { "data-part": part });
          for (const p of series) {
            g.append(svgEl("path", { "data-series": String(p.slot), d: p[key] }));
          }
          return g;
        };
        area.append(
          parts("whisker", "whiskers"),
          parts("box", "boxes"),
          parts("outlier", "outliers"),
          svgEl("path", { "data-part": "median", d: medians }),
        );
        break;
      }
      case "slope": {
        // Every line lies under every end, so no line crosses a dot.
        const { lines, ends } = slopePaths(m, f);
        const g = svgEl("g", { "data-part": "slope" });
        const dots = svgEl("g", { "data-part": "ends" });
        m.series.forEach((s, k) => {
          const slot = String(s.slot);
          g.append(svgEl("path", { "data-series": slot, d: lines[k] ?? "" }));
          dots.append(svgEl("path", { "data-series": slot, d: ends[k] ?? "" }));
        });
        area.append(g, dots);
        break;
      }
      case "scatter": {
        const g = svgEl("g", { "data-part": "scatter" });
        if (m.size === undefined) {
          scatterPaths(m, f).forEach((d, k) => {
            g.append(svgEl("path", { "data-series": String(m.series[k]?.slot ?? 1), d }));
          });
        } else {
          for (const p of bubblePaths(m, f)) {
            g.append(svgEl("path", { "data-series": String(p.slot), d: p.d }));
          }
        }
        area.append(g);
        break;
      }
      case "cell": {
        if (lay.cells === undefined) {
          break;
        }
        const g = svgEl("g", { "data-part": "cell", "data-scale": m.classes.type });
        const { classes, missing } = cellPaths(m, lay.cells, f.dpr);
        for (const c of classes) {
          g.append(svgEl("path", { "data-step": String(c.step), d: c.d }));
        }
        if (missing !== "") {
          g.append(svgEl("path", { "data-part": "missing", d: missing }));
        }
        area.append(g);
        break;
      }
      case "calendar": {
        if (lay.days === undefined) {
          break;
        }
        const g = svgEl("g", { "data-part": "cell", "data-scale": m.classes.type });
        const { classes, missing } = calendarPaths(m, lay.days, f.dpr);
        for (const c of classes) {
          g.append(svgEl("path", { "data-step": String(c.step), d: c.d }));
        }
        if (missing !== "") {
          g.append(svgEl("path", { "data-part": "missing", d: missing }));
        }
        area.append(g);
        break;
      }
      case "rule":
        if ("at" in m.place) {
          const at = m.place.at;
          const d =
            m.axis === "x"
              ? ruleXs(at, f)
                  .map((x) => rulePath("x", x, f))
                  .join("")
              : rulePath("y", f.yAt(at), f);
          area.append(svgEl("path", { "data-part": "rule", d }));
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

const leaderPath = (list: readonly Leader[]): string =>
  list.map((l) => `M${num(l.from.x)} ${num(l.from.y)}L${num(l.to.x)} ${num(l.to.y)}`).join("");

/** Draws `model` laid out as `lay` into `svg`, replacing what it held. */
export function drawPlot(svg: SVGSVGElement, model: Model, lay: Layout): void {
  svg.setAttribute("width", num(lay.width));
  svg.setAttribute("height", num(lay.height));
  svg.setAttribute("viewBox", `0 0 ${num(lay.width)} ${num(lay.height)}`);
  // A band x labels its columns, as a band y its rows, with no tick.
  const primary = primaryOf(model);
  const band = primary?.kind === "cell" && "names" in primary.x;
  const ticks = svgEl("path", {
    "data-part": "ticks",
    transform: `translate(${num(lay.left)} ${num(lay.top + lay.frame.height)})`,
    d: band
      ? ""
      : tickPath(
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
    // Before the plot, so the dots cover the leaders' ends.
    ...(lay.leaders.length > 0
      ? [svgEl("path", { "data-part": "leader", d: leaderPath(lay.leaders) })]
      : []),
    plotArea(model, lay),
    texts("end", lay.endLabels),
  );
}

const ring = (cx: number, cy: number, radius: number): string => {
  const r = Number(num(radius));
  return `M${num(cx - r)} ${num(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0`;
};

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
 *  one, the drawn dot, a row's hairline, a bar row's bar, its bars in each
 *  panel, or the chosen part, a point row's dots or the chosen one, or a
 *  scatter's dot. */
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
  if (sel.kind === "point" && m?.kind === "point") {
    const cy = snap(lay.rows[sel.row]?.y ?? 0, f.dpr) + 0.5;
    return m.series
      .map((_, k) =>
        sel.part === undefined || sel.part === k ? pointAt(m, k, sel.row, f) : undefined,
      )
      .map((at) => (at === undefined ? "" : ring(at, cy, POINT_RADIUS + 1)))
      .join("");
  }
  if (sel.kind === "scatter" && m?.kind === "scatter") {
    const c = scatterAt(m, sel.series, sel.i, f);
    return c === undefined ? "" : ring(c.x, c.y, dotRadius(m, sel.series, sel.i, f) + 1);
  }
  if (sel.kind === "cell" && m?.kind === "cell") {
    return lay.cells === undefined ? "" : outset(cellBox(lay.cells, sel.row, sel.column, f.dpr));
  }
  if (sel.kind === "day" && m?.kind === "calendar") {
    return lay.days === undefined ? "" : outset(dayBox(lay.days, sel.i, f.dpr));
  }
  if (sel.kind === "slope" && m?.kind === "slope") {
    // A chosen series rings both its ends, the whole column each end in it.
    return m.series
      .flatMap((_, k) => {
        const ends = slopeEnds(m, k, f);
        return sel.part === undefined ? [ends[sel.i]] : sel.part === k ? ends : [];
      })
      .map((p) => (p === undefined ? "" : ring(p.x, p.y, SLOPE_RADIUS + 1)))
      .join("");
  }
  const cy = snap(lay.rows[sel.kind === "dot" || sel.kind === "row" ? sel.row : 0]?.y ?? 0, f.dpr);
  if (sel.kind === "row") {
    return `M0 ${num(cy + 0.5)}H${num(f.width)}`;
  }
  const at = nav.crosshair(sel);
  return at === undefined ? "" : ring(at, cy + 0.5, 4);
}

// A scatter dot's crosshair: a rule up from the x axis and one across from
// the y axis, each ending at the dot's edge so neither crosses it.
function scatterHair(model: Model, lay: Layout, sel: Selection): string {
  const m = primaryOf(model);
  const f = lay.frame;
  if (sel.kind !== "scatter" || m?.kind !== "scatter") {
    return "";
  }
  const c = scatterAt(m, sel.series, sel.i, f);
  if (c === undefined) {
    return "";
  }
  const r = dotRadius(m, sel.series, sel.i, f);
  const x = snap(c.x, f.dpr) + 0.5;
  const y = snap(c.y, f.dpr) + 0.5;
  return `M${num(x)} ${num(f.height)}V${num(c.y + r)}M0 ${num(y)}H${num(c.x - r)}`;
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
  // A bar or point row's selection, and a cell's row and column, show by
  // their names' weight too, not by colour alone.
  const bandY = model.y.type === "band";
  // A calendar names its weekdays in every block, so the day's own block's name turns.
  const day =
    sel?.kind === "day" && lay.days !== undefined ? dayPlace(lay.days.weeks, sel.i) : undefined;
  svg.querySelectorAll('[data-part="y"] > text').forEach((name, r) => {
    const row = sel?.kind === "bar" || sel?.kind === "point" || (sel?.kind === "cell" && bandY);
    name.toggleAttribute(
      "data-selected",
      (row && sel.row === r) || (day !== undefined && day.block * 7 + day.row === r),
    );
  });
  svg.querySelectorAll('[data-part="x"] > text').forEach((name, k) => {
    const c = lay.xLabels[k]?.column;
    name.toggleAttribute("data-selected", sel?.kind === "cell" && c === sel.column);
  });
  const chosen = sel?.kind === "slope" ? sel.part : undefined;
  svg.querySelectorAll('[data-part="end"] > text').forEach((label, k) => {
    const s = lay.endLabels[k]?.series;
    label.toggleAttribute("data-selected", s !== undefined && s === chosen);
  });
  if (area === null || sel === undefined) {
    return;
  }
  const g = svgEl("g", { "data-part": "selection" });
  const m = primaryOf(model);
  const s = m?.kind === "slope" && chosen !== undefined ? m.series[chosen] : undefined;
  if (m?.kind === "slope" && s !== undefined) {
    // The chosen series lies over the others where lines cross.
    const { lines, ends } = slopePaths({ ...m, series: [s] }, lay.frame);
    const slot = String(s.slot);
    const line = svgEl("g", { "data-part": "slope" });
    line.append(svgEl("path", { "data-series": slot, d: lines[0] ?? "" }));
    const dots = svgEl("g", { "data-part": "ends" });
    dots.append(svgEl("path", { "data-series": slot, d: ends[0] ?? "" }));
    g.append(line, dots);
  }
  const at = nav.crosshair(sel);
  const hair = at === undefined ? scatterHair(model, lay, sel) : "";
  if (at !== undefined) {
    const x = num(snap(at, lay.frame.dpr) + 0.5);
    g.append(svgEl("path", { "data-part": "crosshair", d: `M${x} 0V${num(lay.frame.height)}` }));
  } else if (hair !== "") {
    g.append(svgEl("path", { "data-part": "crosshair", d: hair }));
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
 * With `chooses`, each chip name keeps the width its chosen weight needs.
 */
export function frameLegend(
  legend: HTMLElement,
  reading: Reading,
  widths: Widths,
  total: string,
  chooses = false,
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
    const name = bdi(e.name);
    if (chooses) {
      name.dataset["name"] = e.name;
    }
    chip.append(swatch, name, value);
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

// The largest of 1, 2 and 5 times a power of ten at or below `v`, above 0.
function roundDown(v: number): number {
  let p = 10 ** Math.floor(Math.log10(v));
  p = p * 10 <= v ? p * 10 : p > v ? p / 10 : p;
  const lead = v / p;
  return p * (lead >= 5 ? 5 : lead >= 2 ? 2 : 1);
}

/**
 * A bubble chart's size key, for the legend row's end: the r label, then a
 * circle for the r domain's high end rounded down to 1, 2 or 5 times a power
 * of ten and one for a quarter of that, each drawn at the size `lay` draws
 * it, with its value. `aria-hidden`, since every reading and the table give
 * each size. Undefined without bubbles.
 */
export function sizeKey(model: Model, lay: Layout): HTMLElement | undefined {
  const m = primaryOf(model);
  const largest = lay.frame.bubble;
  if (m?.kind !== "scatter" || m.size === undefined || largest === undefined) {
    return undefined;
  }
  const { hi } = m.size;
  const top = roundDown(hi);
  const key = span("size");
  key.setAttribute("aria-hidden", "true");
  key.append(model.spec.r?.label ?? "");
  for (const v of [top / 4, top]) {
    const r = largest * Math.sqrt(v / hi);
    // The 1 px outline lies half outside the circle's edge.
    const side = num(2 * r + 1);
    const svg = svgEl("svg", { width: side, height: side, viewBox: `0 0 ${side} ${side}` });
    svg.append(svgEl("circle", { cx: num(r + 0.5), cy: num(r + 0.5), r: num(r) }));
    const value = document.createElement("span");
    value.textContent = model.rText(v);
    key.append(svg, value);
  }
  return key;
}

/** A colour key swatch's size and the room its ring takes past it, in px. */
const SWATCH_W = 24;
const SWATCH_H = 12;
const SWATCH_PAD = 2;
/** The space between two swatches, as between two cells. */
const GAP_PX = 1;
/** The least room between two of the key's labels, in px. */
const KEY_LABEL_GAP = 4;

// The labels of `at` (centres in px) whose `widths` keep KEY_LABEL_GAP
// apart: all, every second from the first, or the first and last.
function thinned(at: readonly number[], widths: readonly number[]): number[] {
  const clear = (keep: readonly number[]) =>
    keep.every((k, j) => {
      const prev = keep[j - 1];
      return (
        prev === undefined ||
        (at[k] ?? 0) - (at[prev] ?? 0) >=
          ((widths[k] ?? 0) + (widths[prev] ?? 0)) / 2 + KEY_LABEL_GAP
      );
    });
  const all = at.map((_, k) => k);
  const second = all.filter((k) => k % 2 === 0);
  const ends = all.length < 2 ? all : [0, all.length - 1];
  return [all, second].find(clear) ?? (clear(ends) ? ends : ends.slice(0, 1));
}

function swatchSvg(width: number): SVGElement {
  const h = num(SWATCH_H + 2 * SWATCH_PAD);
  const w = num(width);
  return svgEl("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
}

// A swatch's ring, 1 px outside its edges as the plot's ring is, shown
// only while its class is selected.
const swatchRing = (x: number): SVGElement =>
  svgEl("rect", {
    "data-part": "ring",
    x: num(x - 1),
    y: num(SWATCH_PAD - 1),
    width: num(SWATCH_W + 2),
    height: num(SWATCH_H + 2),
  });

/**
 * A cell chart's colour key, for the legend row's end: the colour scale's
 * label, a swatch per class in class order with each boundary's value under
 * it (thinned when they would touch), a diverging scale's pivot under the
 * middle swatch for an odd count, and a No data swatch when a cell is
 * missing. `aria-hidden`, since every reading and the table give each value.
 * Undefined without a cell mark, a grid's or a calendar's.
 */
export function colourKey(model: Model, words: Words, measure: Measure): HTMLElement | undefined {
  const m = primaryOf(model);
  if (m?.kind !== "cell" && m?.kind !== "calendar") {
    return undefined;
  }
  const { classes } = m;
  const key = span("key");
  key.setAttribute("aria-hidden", "true");
  const label = model.spec.colour?.label;
  if (label !== undefined && label !== "") {
    const head = span("label");
    head.textContent = label;
    key.append(head);
  }
  const n = classes.steps.length;
  const x = (k: number) => SWATCH_PAD + k * (SWATCH_W + GAP_PX);
  const scale = span("scale");
  const svg = swatchSvg(x(n) - GAP_PX + SWATCH_PAD);
  const g = svgEl("g", { "data-scale": classes.type });
  classes.steps.forEach((step, k) => {
    g.append(
      svgEl("rect", {
        "data-step": String(step),
        x: num(x(k)),
        y: num(SWATCH_PAD),
        width: num(SWATCH_W),
        height: num(SWATCH_H),
      }),
    );
  });
  svg.append(g, ...classes.steps.map((_, k) => swatchRing(x(k))));
  const marks: { at: number; text: string }[] = classes.thresholds.map((t, k) => ({
    at: x(k + 1) - GAP_PX / 2,
    text: model.colourText(t),
  }));
  const pivot = model.spec.colour?.pivot ?? 0;
  if (classes.type === "diverging" && n % 2 === 1 && model.spec.colour?.thresholds === undefined) {
    const middle = (n - 1) / 2;
    marks.splice(middle, 0, { at: x(middle) + SWATCH_W / 2, text: model.colourText(pivot) });
  }
  const labels = span("thresholds");
  const keep = thinned(
    marks.map((t) => t.at),
    marks.map((t) => measure.number(t.text)),
  );
  for (const k of keep) {
    const t = marks[k];
    if (t !== undefined) {
      const el = document.createElement("span");
      el.textContent = t.text;
      // The SVG keeps left-to-right geometry under right-to-left text, as the plot does.
      el.style.left = `${num(t.at)}px`;
      labels.append(el);
    }
  }
  scale.append(svg, labels);
  key.append(scale);
  const missing =
    m.kind === "calendar" ? m.values.includes(null) : m.values.some((row) => row.includes(null));
  if (missing) {
    const none = span("none");
    const box = swatchSvg(SWATCH_W + 2 * SWATCH_PAD);
    box.append(
      svgEl("path", {
        "data-part": "missing",
        d: `M${num(SWATCH_PAD + 0.5)} ${num(SWATCH_PAD + 0.5)}h${num(SWATCH_W - 1)}v${num(SWATCH_H - 1)}h${num(1 - SWATCH_W)}Z`,
      }),
      swatchRing(SWATCH_PAD),
    );
    const text = document.createElement("span");
    text.textContent = words.noData;
    none.append(box, text);
    key.append(none);
  }
  return key;
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
      if (e.name !== undefined) {
        el.parentElement?.toggleAttribute("data-selected", reading.chosen === k);
      }
    }
  });
  const total = values[reading.entries.length];
  if (total !== undefined) {
    total.textContent = reading.total ?? "";
  }
  const rings = legend.querySelectorAll('[data-part="key"] [data-part="ring"]');
  const missing = legend.querySelector('[data-part="none"] [data-part="ring"]');
  rings.forEach((ring, k) => {
    const chosen = ring === missing ? reading.swatch === -1 : reading.swatch === k;
    ring.toggleAttribute("data-selected", chosen);
  });
}
