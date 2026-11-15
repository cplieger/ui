/**
 * facets.ts — small multiples: the grid of panels a chart with `facets`
 * draws, each panel its data mark's own plot on the chart's scales.
 * @module
 */

import type { Measure } from "../scale/measure.js";

import { colourKey, drawPlot, frameLegend, sizeKey, writeLegend } from "./draw.js";
import { explore, type Explorer } from "./explore.js";
import { layout, NARROW_REM, PANEL_GAP, type Floors, type Layout, type Metrics } from "./layout.js";
import {
  barsApart,
  type FacetsModel,
  type LineModel,
  type Model,
  type ScatterModel,
} from "./model.js";
import {
  chipChosen,
  dotsText,
  overall,
  panelCount,
  partAmount,
  readoutWidths,
  sliceShare,
  totalWord,
  widest,
  type Reading,
  type Widths,
} from "./readout.js";
import { rekey, selectionReading, type Selection } from "./select.js";
import { shortDescription } from "./summary.js";
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

interface PanelPlace {
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
  const kind = model.primary?.kind ?? "";
  // A pie has no axis, so its panels keep no gutter.
  const pie = kind === "pie";
  const gutter = pie
    ? 0
    : first === undefined
      ? floors.axis
      : lay(first.model, width, floors.axis).gutters.axis;
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
  const placed = facets.panels.map((p, k): PanelPlace => {
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
  // All notes switch together, as on a lone plot, and number on across the
  // panels in their order, so the one list under the grid keys every marker.
  const numbered = placed.some((p) => p.lay.numbered);
  let before = 0;
  const panels = placed.map((p): PanelPlace => {
    const notes = p.lay.notes.map((n) => ({ ...n, number: before + n.number }));
    before += notes.length;
    return { ...p, lay: { ...p.lay, notes, numbered: numbered && notes.length > 0 } };
  });
  return {
    columns,
    reverse,
    gutter,
    panels,
    gutters: { axis: pie ? floors.axis : gutter, label: 0 },
  };
}

/** The other panels' data marks drawn behind panel `k` under `context`:
 *  every panel's line or dots but its own. */
function contextOf(facets: FacetsModel, k: number): (LineModel | ScatterModel)[] {
  if (!facets.context) {
    return [];
  }
  return facets.panels.flatMap((p, j) => {
    const m = p.model.primary;
    return j !== k && (m?.kind === "line" || m?.kind === "scatter") ? [m] : [];
  });
}

/** The one number a panel's own legend row would carry at `sel`, or with
 *  none: a one-series panel's value, a stack's total, a pie's selected
 *  slice's share or its total, a scatter's dot count; "" for a mark with
 *  none, a group, a box plot, a heatmap. */
export function headFigure(model: Model, words: Words, sel?: Selection): string {
  const m = model.primary;
  const reading = sel === undefined ? overall(model, words) : selectionReading(model, sel, words);
  if (m === undefined || reading === undefined) {
    return "";
  }
  switch (m.kind) {
    case "pie":
      return sel?.kind === "slice"
        ? sliceShare(model, m, sel.i, words)
        : partAmount(model, m, m.total);
    case "scatter":
      return dotsText(model, m, words);
    case "rect":
    case "line":
    case "area":
    case "bar":
    case "point": {
      if (grouped(model)) {
        return "";
      }
      const [one] = reading.entries;
      return reading.entries.length === 1 && one !== undefined && one.name === undefined
        ? one.value
        : (reading.total ?? "");
    }
    default:
      return "";
  }
}

// Series set side by side have no one number between them.
function grouped(model: Model): boolean {
  const m = model.primary;
  return m?.kind === "rect" ? m.arrange === "group" : m?.kind === "bar" && barsApart(m);
}

// The widest head figure `model` can write, from its legend row's `w`.
function headWidth(model: Model, words: Words, w: Widths, measure: Measure): number {
  const m = model.primary;
  const none = measure.number(headFigure(model, words));
  if (m?.kind === "pie") {
    return w.values.reduce((a, b) => Math.max(a, b), none);
  }
  if (m?.kind === "scatter" || grouped(model)) {
    return none;
  }
  const [one, ...more] = overall(model, words)?.entries ?? [];
  const single = more.length === 0 && one !== undefined && one.name === undefined;
  return Math.max(none, single ? (w.values[0] ?? 0) : w.total);
}

/** The figure's legend row with no selection: the panel count, the x
 *  every panel reads alike or nothing, and blank values, since each panel
 *  has its own. */
export function facetOverall(model: Model, facets: FacetsModel, words: Words): Reading | undefined {
  const all = facets.panels.map((p) => overall(p.model, words));
  const [first] = all;
  if (first === undefined) {
    return undefined;
  }
  return {
    panel: panelCount(model, facets, words),
    at: all.every((r) => r?.at === first.at) ? first.at : "",
    entries: first.entries.map((e) => ({ ...e, value: "" })),
    total: first.total === undefined ? undefined : "",
  };
}

/** The legend row's slot widths over every panel's readings, and the
 *  panel slot's over the count and every panel's name. */
export function facetWidths(
  model: Model,
  facets: FacetsModel,
  words: Words,
  measure: Measure,
): Widths {
  const each = facets.panels.map((p) => readoutWidths(p.model, words, measure));
  const most = (pick: (w: Widths) => number) => each.reduce((a, w) => Math.max(a, pick(w)), 0);
  const slots = most((w) => w.values.length);
  return {
    panel: widest([panelCount(model, facets, words), ...facets.panels.map((p) => p.name)], measure),
    at: most((w) => w.at),
    values: Array.from({ length: slots }, (_, k) => most((w) => w.values[k] ?? 0)),
    total: most((w) => w.total),
  };
}

// `sel` from panel `from` at the same position in panel `to`, keeping a
// chosen series only where `to` holds a series of the same name there.
function across(from: Model, sel: Selection, to: Model): Selection | undefined {
  const s = rekey(from, sel, to);
  if (s === undefined || !("part" in s) || s.part === undefined) {
    return s;
  }
  const name = (m: Model, k: number) => {
    const p = m.primary;
    return p !== undefined && "series" in p ? p.series[k]?.name : undefined;
  };
  return name(from, s.part) === name(to, s.part) ? s : { ...s, part: undefined };
}

interface Item {
  readonly panel: HTMLDivElement;
  readonly name: HTMLElement;
  readonly figure: HTMLElement;
  readonly head: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly explorer: Explorer;
  readonly life: AbortController;
}

/** Small multiples' panels: each panel's plot a region of its own, read
 *  by its own keys, pointer and touch, with one legend row and the
 *  selection synced into every panel that holds its position. */
export interface PanelGrid {
  /** The `[data-part="panels"]` grid, in the lone SVG's place. */
  readonly element: HTMLElement;
  /** `model`'s panels replace the data: each keeps its element and its
   *  selection where its position still is. */
  data(model: Model): void;
  /** Draws `model`'s panels laid out as `grid`, its legend row framed at
   *  `widths` with no selection, then the selection. */
  draw(model: Model, grid: FacetLayout, widths: Widths, metrics: Metrics): void;
  /** Clears the selection; the next focus or arrow brings it back. */
  clear(): void;
  /** Drops the selection and what it would come back as. */
  reset(): void;
  /** Each panel's plot becomes an image named by its label. */
  tearDown(): void;
}

const div = (name: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.dataset["part"] = name;
  return el;
};

/**
 * Builds the panel grid, whose panels read in `legend`, are described by
 * the element `howTo` names, and follow their keys and pointers until
 * `signal` aborts.
 */
export function panelGrid(
  legend: HTMLElement,
  words: Words,
  howTo: string,
  signal: AbortSignal,
): PanelGrid {
  const element = div("panels");
  const items: Item[] = [];
  let facets: FacetsModel | undefined;
  let held: { readonly k: number; readonly sel: Selection } | undefined;
  // Each panel's echo of the held selection, at its own position.
  let echoes: (Selection | undefined)[] = [];

  const modelOf = (k: number): Model | undefined => facets?.panels[k]?.model;

  const writeHeads = (): void => {
    items.forEach((it, j) => {
      const m = modelOf(j);
      it.figure.textContent =
        m === undefined ? "" : headFigure(m, words, held?.k === j ? held.sel : echoes[j]);
      it.panel.toggleAttribute("data-selected", held?.k === j);
    });
  };

  const reading = (): Reading | undefined => {
    if (facets === undefined) {
      return undefined;
    }
    const p = held === undefined ? undefined : facets.panels[held.k];
    if (held === undefined || p === undefined) {
      const first = facets.panels[0]?.model;
      return first === undefined ? undefined : facetOverall(first, facets, words);
    }
    const r = selectionReading(p.model, held.sel, words);
    return r === undefined ? undefined : { ...r, panel: p.name };
  };

  const follow = (k: number, sel: Selection | undefined): void => {
    if (sel === undefined && held?.k !== k) {
      return;
    }
    const before = held?.k;
    held = sel === undefined ? undefined : { k, sel };
    // The selection lives in one panel: a pointer selecting in this one
    // clears the one the keys left in another.
    if (before !== undefined && before !== k) {
      items[before]?.explorer.clear();
    }
    const from = modelOf(k);
    echoes = items.map((it, j) => {
      const to = modelOf(j);
      const s =
        sel === undefined || j === k || from === undefined || to === undefined
          ? undefined
          : across(from, sel, to);
      if (sel !== undefined && j !== k) {
        it.explorer.carry(s);
      }
      it.explorer.echo(s);
      return s;
    });
    const r = reading();
    if (r !== undefined) {
      writeLegend(legend, r);
    }
    writeHeads();
  };

  const add = (): Item => {
    const k = items.length;
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
    element.append(panel);
    const life = new AbortController();
    const explorer = explore(frame, svg, legend, words, AbortSignal.any([signal, life.signal]), {
      name: () => facets?.panels[k]?.name ?? "",
      follow: (sel) => {
        follow(k, sel);
      },
    });
    return { panel, name, figure, head, frame, svg, explorer, life };
  };

  return {
    element,
    data(model) {
      const next = model.facets;
      if (next === undefined) {
        return;
      }
      facets = next;
      while (items.length > next.panels.length) {
        const it = items.pop();
        it?.life.abort();
        it?.panel.remove();
      }
      while (items.length < next.panels.length) {
        items.push(add());
      }
      if (held !== undefined && held.k >= items.length) {
        held = undefined;
      }
      echoes.length = Math.min(echoes.length, items.length);
      next.panels.forEach((p, k) => {
        const it = items[k];
        if (it === undefined) {
          return;
        }
        it.name.textContent = p.name;
        it.frame.setAttribute("role", "application");
        it.frame.setAttribute("aria-roledescription", words.chart);
        it.frame.setAttribute("aria-describedby", howTo);
        it.frame.setAttribute(
          "aria-label",
          words.panelLabel(p.name, shortDescription(p.model, words)),
        );
        it.frame.tabIndex = 0;
        it.explorer.data(p.model);
      });
    },
    draw(model, grid, widths, metrics) {
      const next = model.facets;
      if (next === undefined) {
        return;
      }
      facets = next;
      let head = 0;
      next.panels.forEach((p, k) => {
        const place = grid.panels[k];
        const it = items[k];
        if (place === undefined || it === undefined) {
          return;
        }
        // The head sits over the plot, past the gutter its panel holds.
        const inset = place.gutter ? `${String(grid.gutter)}px` : "";
        it.head.style.paddingLeft = grid.reverse ? "" : inset;
        it.head.style.paddingRight = grid.reverse ? inset : "";
        drawPlot(it.svg, p.model, place.lay, contextOf(next, k));
        head = Math.max(
          head,
          headWidth(
            p.model,
            words,
            readoutWidths(p.model, words, metrics.measure),
            metrics.measure,
          ),
        );
      });
      for (const it of items) {
        it.figure.style.minInlineSize = `${String(Math.ceil(head))}px`;
      }
      element.style.gridTemplateColumns = `repeat(${String(grid.columns)}, max-content)`;
      element.style.gap = `${String(PANEL_GAP)}px`;
      const none = facetOverall(model, next, words);
      const [first] = next.panels;
      if (none !== undefined && first !== undefined) {
        frameLegend(legend, none, widths, totalWord(first.model, words), chipChosen(first.model));
        const lay = grid.panels[0]?.lay;
        const key =
          (lay === undefined ? undefined : sizeKey(first.model, lay)) ??
          colourKey(first.model, words, metrics.measure);
        if (key !== undefined) {
          legend.append(key);
        }
      }
      next.panels.forEach((p, k) => {
        const place = grid.panels[k];
        if (place !== undefined) {
          items[k]?.explorer.drawn(p.model, place.lay);
        }
      });
      writeHeads();
    },
    clear() {
      if (held !== undefined) {
        items[held.k]?.explorer.clear();
      }
    },
    reset() {
      held = undefined;
      echoes = [];
      for (const it of items) {
        it.explorer.reset();
      }
      facets = undefined;
    },
    tearDown() {
      for (const it of items) {
        it.frame.removeAttribute("tabindex");
        it.frame.removeAttribute("aria-roledescription");
        it.frame.removeAttribute("aria-describedby");
        it.frame.setAttribute("role", "img");
      }
    },
  };
}
