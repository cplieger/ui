/**
 * facets.ts — small multiples: the grid of panels a chart with `facets`
 * draws, each panel its data mark's own plot on the chart's scales.
 * @module
 */

import { drawPlot } from "./draw.js";
import { layout, NARROW_REM, PANEL_GAP, type Floors, type Layout, type Metrics } from "./layout.js";
import type { FacetsModel, Model } from "./model.js";
import { dotsText, overall, partAmount } from "./readout.js";
import type { Words } from "./words.js";

/** A panel's plot height when the spec gives none: half a lone chart's, as
 *  Datawrapper's advice to go small has it. */
export const PANEL_HEIGHT = 120;

/** Each panel's plot border, 1 px a side. */
const BORDER = 2;

// The narrowest plot each mark reads in: two x ticks at the 80 px target;
// a bar beside its value label; Datawrapper's minimum pie column; a
// 24-column grid keeping cells over 6 px.
const MIN_PLOT = new Map<string, number>([
  ["bar", 120],
  ["point", 120],
  ["box", 120],
  ["pie", 120],
  ["cell", 160],
  ["calendar", 160],
]);
const MIN_PLOT_DEFAULT = 112;

// Under 30rem a band panel's names sit above its rows, which needs the
// figure's whole width.
const BANDS = new Set(["bar", "point", "box"]);

export interface PanelPlace {
  readonly lay: Layout;
  readonly column: number;
  readonly row: number;
  /** The panel holds the grid's y gutter, at its left, or its right on a
   *  reversed x. */
  readonly gutter: boolean;
}

export interface FacetLayout {
  readonly columns: number;
  /** The gutter is at the grid's right, under a reversed x. */
  readonly reverse: boolean;
  /** The y gutter's width, in px. */
  readonly gutter: number;
  readonly panels: readonly PanelPlace[];
  readonly gutters: Floors;
}

/**
 * Lays `facets` out in columns of equal plot width across `width`, as many
 * as fit at the mark's narrowest plot, with one y gutter measured over every
 * panel (at least `floors.axis`). `chart` is the figure's width, which the
 * 30rem rule reads.
 */
export function facetLayout(
  model: Model,
  facets: FacetsModel,
  words: Words,
  metrics: Metrics,
  width: number,
  floors: Floors,
  chart = width,
): FacetLayout {
  const inPanel: Metrics = { ...metrics, labelGroup: 0, height: PANEL_HEIGHT };
  const lay = (m: Model, w: number, axis: number) =>
    layout(m, words, inPanel, w, { axis, label: 0 }, chart, undefined, true);
  // Every panel shares the y scale, so its ticks or band names, and the
  // first panel's gutter is every panel's.
  const [first] = facets.panels;
  const gutter =
    first === undefined ? floors.axis : lay(first.model, width, floors.axis).gutters.axis;
  const kind = model.primary?.kind ?? "";
  const narrow = chart < NARROW_REM * metrics.rem;
  const n = facets.panels.length;
  const least = MIN_PLOT.get(kind) ?? MIN_PLOT_DEFAULT;
  const fit = Math.floor((width - gutter + PANEL_GAP) / (least + BORDER + PANEL_GAP));
  const columns = narrow && BANDS.has(kind) ? 1 : Math.max(1, Math.min(n, fit));
  const plotW = Math.max(
    1,
    Math.floor((width - gutter - (columns - 1) * PANEL_GAP) / columns - BORDER),
  );
  const reverse = model.x.reverse;
  const panels = facets.panels.map((p, k): PanelPlace => {
    const column = k % columns;
    const row = Math.floor(k / columns);
    const edge = reverse ? column === columns - 1 : column === 0;
    // The x axis sits under each panel with no panel below it.
    const axis = k + columns >= n;
    const full = lay(p.model, gutter + plotW, gutter);
    const top = full.top;
    return {
      column,
      row,
      gutter: edge,
      lay: {
        ...full,
        height: axis ? full.height : top + full.frame.height,
        yLabels: edge ? full.yLabels : [],
        xLabels: axis ? full.xLabels : [],
        // A title above the plot is y's, said once; one below it is x's.
        titles: full.titles.filter((t) => (t.y < top ? edge && row === 0 : axis)),
        clip: !edge,
        ticks: axis,
      },
    };
  });
  return { columns, reverse, gutter, panels, gutters: { axis: gutter, label: 0 } };
}

/** The one number a panel's own legend row would carry with nothing
 *  selected, or "" for a mark with none: a group, a box plot, a heatmap. */
export function headFigure(model: Model, words: Words): string {
  const m = model.primary;
  const reading = overall(model, words);
  if (m === undefined || reading === undefined) {
    return "";
  }
  switch (m.kind) {
    case "pie":
      return partAmount(model, m, m.total);
    case "scatter":
      return dotsText(model, m, words);
    case "rect":
    case "line":
    case "area":
      return m.kind === "rect" && m.arrange === "group"
        ? ""
        : reading.entries.length === 1
          ? (reading.entries[0]?.value ?? "")
          : (reading.total ?? "");
    default:
      return "";
  }
}

const div = (name: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.dataset["part"] = name;
  return el;
};

/** Draws every panel of `facets`, laid out as `grid`, into `panels`,
 *  keeping the elements of panels it already holds. */
export function drawPanels(
  panels: HTMLElement,
  facets: FacetsModel,
  grid: FacetLayout,
  words: Words,
): void {
  // Panels already drawn stay in place, since a move would blur a focused one.
  while (panels.children.length > facets.panels.length) {
    panels.lastElementChild?.remove();
  }
  while (panels.children.length < facets.panels.length) {
    const panel = div("panel");
    const head = div("head");
    const name = document.createElement("bdi");
    name.dataset["part"] = "name";
    const figure = document.createElement("span");
    figure.dataset["part"] = "figure";
    head.append(name, figure);
    const frame = div("frame");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    frame.append(svg);
    panel.append(head, frame);
    panels.append(panel);
  }
  facets.panels.forEach((p, k) => {
    const place = grid.panels[k];
    const panel = panels.children[k];
    const head = panel?.firstElementChild;
    const svg = panel?.lastElementChild?.firstElementChild;
    if (place === undefined || !(head instanceof HTMLElement)) {
      return;
    }
    const [name, figure] = head.children;
    if (name !== undefined && figure !== undefined) {
      name.textContent = p.name;
      figure.textContent = headFigure(p.model, words);
    }
    // The head sits over the plot, past the gutter its panel holds.
    const inset = place.gutter ? `${String(grid.gutter)}px` : "";
    head.style.paddingLeft = grid.reverse ? "" : inset;
    head.style.paddingRight = grid.reverse ? inset : "";
    if (svg instanceof SVGSVGElement) {
      drawPlot(svg, p.model, place.lay);
    }
  });
  panels.style.gridTemplateColumns = `repeat(${String(grid.columns)}, max-content)`;
  panels.style.gap = `${String(PANEL_GAP)}px`;
}
