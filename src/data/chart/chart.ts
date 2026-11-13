/**
 * chart.ts — `renderChart()` builds a chart with axes inside an app's
 * `<figure class="cp-chart">`: its plot, legend row, summary and table
 * view, through one lifecycle of loading, empty, error and full states.
 * `durationEdges()` gives the duration ladder a histogram bins on.
 * @module
 */

import { whenAborted } from "../../core/lifetime/lifetime.js";
import { localeOf } from "../../core/locale/locale.js";
import { skeletonTiming, type SkeletonTimingController } from "../../feedback/skeleton/skeleton.js";
import { forgetMeasures } from "../scale/measure.js";

import { drawPlot, frameLegend, readMetrics } from "./draw.js";
import { explore } from "./explore.js";
import { layout, type Floors } from "./layout.js";
import { chartModel, type Model } from "./model.js";
import { chipChosen, overall, readoutWidths, totalWord, type Widths } from "./readout.js";
import type { ChartSpec } from "./spec.js";
import { shortDescription, summaryOf } from "./summary.js";
import { syncTable, tableModel } from "./table.js";
import { chartWords, type ChartWords, type Words } from "./words.js";

export { durationEdges } from "../scale/ladder.js";
export type { ChartSpec, Mark } from "./spec.js";
export type { ChartWords } from "./words.js";

export interface ChartOptions {
  /** Tears the chart down to static content: a drawn plot becomes an image. */
  readonly signal?: AbortSignal;
  /** The app's Table view button, a `.cp-filter-chip` written `hidden`. */
  readonly toggle?: HTMLButtonElement;
  /** Default: the `lang` of the figure or its nearest ancestor. */
  readonly locale?: string;
  /** An IANA time zone for time ticks and instants. Default: the page's. */
  readonly timeZone?: string;
  readonly words?: ChartWords;
}

export interface Chart {
  /** Validates `spec` and throws a `RangeError` or `TypeError` naming the
   *  broken rule before anything changes; then draws it, or stores it while
   *  the skeleton keeps its minimum. Ignored once the signal has aborted. */
  update(spec: ChartSpec): void;
  /** Back to the loading state, for a new range: drops the drawing, its
   *  readings, its table and its summary. Ignored once aborted. */
  loading(): void;
  /** Shows the app's `.cp-notice`: in the plot's place unless a good render
   *  came since the last loading(); when one did, under whatever that render
   *  showed, the plot or the empty words. Ignored once aborted. */
  error(notice: HTMLElement): void;
  /** The summary in the current state. It is "" in failed, in loading with
   *  nothing stored, while a stored error waits, and torn down from failed,
   *  loading or settling. */
  readonly summary: string;
  /** Shows the table view (true) or the plot (false), as the toggle does;
   *  remembered until there is a drawing to switch from. */
  showTable(on: boolean): void;
}

type State = "loading" | "settling" | "empty" | "ready" | "failed" | "refreshFailed" | "tornDown";

/** What a call made while loading leaves for the render the timing commits. */
type Item = { readonly model: Model } | { readonly notice: HTMLElement };

/** The skeleton's show delay and minimum, `docs/design-patterns.md` "Loading". */
const SHOW_MS = 200;
const MIN_MS = 400;

/** Figures holding a live chart. */
const live = new WeakSet<HTMLElement>();
/** What a torn-down chart left in its figure, cleared by the next render. */
const leftovers = new WeakMap<HTMLElement, readonly Element[]>();

let seq = 0;

function part<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  name: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.dataset["part"] = name;
  return el;
}

function caption(figure: HTMLElement): { title: HTMLElement; summary: HTMLElement } {
  const cap = figure.querySelector(":scope > figcaption");
  if (cap === null) {
    throw new TypeError("renderChart: the figure needs a <figcaption>, the chart's title");
  }
  let title = cap.querySelector<HTMLElement>(':scope > [data-part="title"]');
  if (title === null) {
    title = part("span", "title");
    title.append(...cap.childNodes);
    cap.append(title);
  }
  let summary = cap.querySelector<HTMLElement>(':scope > [data-part="summary"]');
  if (summary === null) {
    summary = part("p", "summary");
    cap.append(summary);
  }
  return { title, summary };
}

const grow = (floor: Widths | undefined, now: Widths): Widths =>
  floor?.values.length !== now.values.length
    ? now
    : {
        at: Math.max(floor.at, now.at),
        values: now.values.map((v, k) => Math.max(v, floor.values[k] ?? 0)),
        total: Math.max(floor.total, now.total),
      };

/**
 * Builds a chart inside `figure`, a `<figure class="cp-chart">` the app owns
 * with its `<figcaption>`, whose words become the title. `spec` is null
 * while the first load runs. Throws when `figure` already holds a live
 * chart, since a chart's data changes through `update`, or when `spec`
 * breaks a rule. A figure whose chart was torn down can be rendered again.
 */
export function renderChart(
  figure: HTMLElement,
  spec: ChartSpec | null,
  options: ChartOptions = {},
): Chart {
  if (live.has(figure)) {
    throw new DOMException(
      "renderChart: the figure already holds a live chart",
      "InvalidStateError",
    );
  }
  const { signal, toggle } = options;
  const locale = options.locale ?? localeOf(figure);
  const timeZone = options.timeZone;
  const words: Words = chartWords(options.words);
  const first = spec === null ? undefined : chartModel(spec, locale, timeZone);
  const { title, summary: summaryEl } = caption(figure);
  for (const el of leftovers.get(figure) ?? []) {
    el.remove();
  }
  leftovers.delete(figure);
  live.add(figure);

  const base = figure.id === "" ? `cp-chart-${String(++seq)}` : figure.id;
  title.id = `${base}-title`;
  summaryEl.id = `${base}-summary`;
  figure.setAttribute("aria-labelledby", title.id);
  figure.setAttribute("aria-describedby", summaryEl.id);
  figure.tabIndex = -1;

  const box = part("div", "loading");
  box.setAttribute("aria-hidden", "true");
  const skeleton = document.createElement("div");
  skeleton.className = "cp-skeleton";
  const empty = part("p", "empty");
  empty.className = "cp-empty";
  const legend = part("div", "legend");
  legend.className = "cp-cluster";
  const plot = part("div", "plot");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const howTo = document.createElement("span");
  howTo.id = `${base}-howto`;
  howTo.hidden = true;
  howTo.textContent = words.howTo;
  plot.append(svg, howTo);
  const list = part("ol", "notes");
  const panel = part("div", "table");
  panel.className = "cp-panel";
  panel.dataset["flush"] = "";
  panel.hidden = true;

  const life = new AbortController();
  const explorer = explore(plot, svg, legend, words, life.signal);
  let state: State = "loading";
  // What the good render since the last loading() showed, if one came.
  let shown: "ready" | "empty" | undefined;
  let drawn: Model | undefined;
  let notice: HTMLElement | undefined;
  let summary = "";
  let tableOn = toggle?.getAttribute("aria-pressed") === "true";
  let tableStale = true;
  let plotStale = true;
  let floors: Floors = { axis: 0, label: 0 };
  let widths: Widths | undefined;
  let lastHeight: number | undefined;
  // The chart's width the drawing was laid out at, which the observer's
  // first entry, sent once observing starts, usually repeats.
  let drawnBox: number | undefined;
  // The last drawing numbered its notes, so the list below the plot is shown.
  let listed = false;

  let timing: SkeletonTimingController | undefined;
  let committed = false;
  let pending = false;
  let stored: Item | undefined;

  // Puts the parts present in their order after the app's own content,
  // moving none already placed, since a move would blur a focused part.
  const arrange = (present: readonly (Element | undefined)[]): void => {
    const order = [box, empty, legend, plot, list, panel, notice];
    for (const el of order) {
      if (el !== undefined && !present.includes(el)) {
        el.remove();
      }
    }
    let after: Element | undefined;
    for (const el of order) {
      if (el === undefined || !present.includes(el)) {
        continue;
      }
      if (el.parentElement !== figure) {
        const next = order.slice(order.indexOf(el) + 1).find((n) => n?.parentElement === figure);
        if (after !== undefined) {
          after.after(el);
        } else if (next !== undefined) {
          next.before(el);
        } else {
          figure.append(el);
        }
      }
      after = el;
    }
  };

  // Runs `change`, then moves focus to the figure when the part that held
  // it was removed, hidden or made unfocusable, so it never falls to the body.
  const guard = (change: () => void): void => {
    const active = document.activeElement;
    const watched =
      active instanceof HTMLElement &&
      active !== figure &&
      (figure.contains(active) || active === toggle);
    change();
    if (
      watched &&
      (!active.isConnected ||
        !active.checkVisibility() ||
        (active === plot && !plot.hasAttribute("tabindex")) ||
        document.activeElement !== active)
    ) {
      figure.focus({ preventScroll: true });
    }
  };

  const setSummary = (text: string, visible: boolean): void => {
    summary = text;
    summaryEl.textContent = text;
    summaryEl.hidden = !visible;
  };

  // The plot's border box fills the figure's content box, which the
  // stylesheet's container queries read.
  const chartWidth = (): number => plot.getBoundingClientRect().width;

  const hasDrawing = (): boolean =>
    state === "ready" || (state === "refreshFailed" && shown === "ready");

  const drawGeometry = (): void => {
    if (drawn === undefined) {
      return;
    }
    if (plot.hidden || !plot.isConnected) {
      plotStale = true;
      return;
    }
    plotStale = false;
    const metrics = readMetrics(plot, locale);
    drawnBox = chartWidth();
    const lay = layout(drawn, words, metrics, plot.clientWidth, floors, drawnBox);
    floors = lay.gutters;
    drawPlot(svg, drawn, lay);
    listed = lay.numbered;
    if (listed) {
      const texts = drawn.marks.map((m) => (m.kind === "text" ? m.text : ""));
      list.replaceChildren(
        ...lay.notes.map((n) => {
          const li = document.createElement("li");
          li.textContent = texts[n.mark] ?? "";
          return li;
        }),
      );
      if (list.parentElement !== figure) {
        plot.after(list);
      }
    } else {
      list.remove();
    }
    const none = overall(drawn, words);
    if (none !== undefined) {
      widths = grow(widths, readoutWidths(drawn, words, metrics.measure));
      frameLegend(legend, none, widths, totalWord(drawn, words), chipChosen(drawn));
    }
    explorer.drawn(drawn, lay);
  };

  // Drops the kept gutters and slot widths, then draws now or once shown.
  const measureAfresh = (): void => {
    floors = { axis: 0, label: 0 };
    widths = undefined;
    plotStale = true;
    if (hasDrawing() && !plot.hidden) {
      drawGeometry();
    }
  };

  const showView = (): void => {
    if (drawn === undefined) {
      return;
    }
    if (tableOn) {
      explorer.clear();
    }
    if (tableOn && tableStale) {
      syncTable(panel, tableModel(drawn, words), title.textContent, drawn.y.type === "band");
      tableStale = false;
    }
    panel.hidden = !tableOn;
    legend.hidden = tableOn;
    list.hidden = tableOn;
    plot.hidden = tableOn;
    toggle?.setAttribute("aria-pressed", String(tableOn));
    if (!tableOn && plotStale) {
      drawGeometry();
    }
  };

  const setToggle = (): void => {
    if (toggle !== undefined) {
      toggle.hidden = !hasDrawing();
    }
  };

  // Enters empty or ready with `model`, in the same task.
  const paint = (model: Model): void => {
    figure.setAttribute("aria-busy", "false");
    notice?.remove();
    notice = undefined;
    shown = model.empty ? "empty" : "ready";
    state = shown;
    if (model.empty) {
      explorer.reset();
      drawn = undefined;
      listed = false;
      const text = model.spec.empty ?? words.empty;
      empty.textContent = text;
      setSummary(text, false);
      arrange([empty]);
    } else {
      explorer.data(model);
      drawn = model;
      setSummary(summaryOf(model, words), true);
      plot.setAttribute("role", "application");
      plot.setAttribute("aria-roledescription", words.chart);
      plot.setAttribute("aria-describedby", howTo.id);
      plot.setAttribute("aria-label", shortDescription(model, words));
      plot.tabIndex = 0;
      // The drawing showView makes decides whether the new data numbers its notes.
      listed = false;
      arrange([legend, plot, panel]);
      plotStale = true;
      if (tableOn && !panel.hidden) {
        syncTable(panel, tableModel(model, words), title.textContent, model.y.type === "band");
        tableStale = false;
      } else {
        tableStale = true;
      }
      showView();
    }
    setToggle();
  };

  const fail = (el: HTMLElement): void => {
    figure.setAttribute("aria-busy", "false");
    const old = notice;
    notice = el;
    old?.remove();
    if (state === "ready" || (state === "refreshFailed" && shown === "ready")) {
      state = "refreshFailed";
      arrange([legend, plot, listed ? list : undefined, panel, el]);
    } else if (state === "empty" || (state === "refreshFailed" && shown === "empty")) {
      state = "refreshFailed";
      arrange([empty, el]);
    } else {
      state = "failed";
      explorer.reset();
      drawn = undefined;
      listed = false;
      setSummary("", false);
      arrange([el]);
    }
    setToggle();
  };

  // The timing's one render: whatever is stored when it runs, or nothing.
  const render = (): void => {
    pending = false;
    if (life.signal.aborted || stored === undefined) {
      return;
    }
    const item = stored;
    stored = undefined;
    guard(() => {
      if ("model" in item) {
        paint(item.model);
      } else {
        fail(item.notice);
      }
    });
  };

  const startLoading = (): void => {
    state = "loading";
    shown = undefined;
    explorer.reset();
    drawn = undefined;
    listed = false;
    stored = undefined;
    notice?.remove();
    notice = undefined;
    tableStale = true;
    figure.setAttribute("aria-busy", "true");
    setSummary("", false);
    if (lastHeight !== undefined) {
      box.style.blockSize = `${String(lastHeight)}px`;
    }
    skeleton.remove();
    arrange([box]);
    setToggle();
    committed = false;
    pending = false;
    timing = skeletonTiming(
      () => {
        box.append(skeleton);
      },
      { showDelayMs: SHOW_MS, minVisibleMs: MIN_MS },
    );
  };

  // While loading, `item` waits for the timing's one render: committed now,
  // or drawn at once when that render already ran with nothing stored.
  const store = (item: Item): void => {
    stored = item;
    summary =
      "notice" in item
        ? ""
        : item.model.empty
          ? (item.model.spec.empty ?? words.empty)
          : summaryOf(item.model, words);
  };

  const waiting = (): boolean => pending;

  const offer = (item: Item): void => {
    store(item);
    if (committed && !pending) {
      render();
      return;
    }
    if (!pending) {
      committed = true;
      pending = true;
      timing?.commit(render);
    }
    // commit ran the render at once unless the skeleton's minimum still counts.
    if (waiting()) {
      state = "settling";
    }
  };

  let observed: number | undefined;
  let frame = 0;
  const resize = new ResizeObserver((entries) => {
    const width = entries.at(-1)?.contentRect.width;
    if (width === undefined || width === observed) {
      return;
    }
    observed = width;
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (hasDrawing() && chartWidth() !== drawnBox) {
          measureAfresh();
        }
      });
    }
  });
  resize.observe(figure);

  if (toggle !== undefined) {
    toggle.addEventListener(
      "click",
      () => {
        if (hasDrawing()) {
          handle.showTable(toggle.getAttribute("aria-pressed") !== "true");
        }
      },
      { signal: life.signal },
    );
  }

  // A face may start loading only once a draw lays out its text, so every
  // load the page starts while the chart lives measures it again once the
  // set settles. WebKit fires no loadingdone for such a load, only loading;
  // chart.test.ts "measures the chart again once the face has loaded" pins it.
  let settling = false;
  const onFonts = (): void => {
    if (settling) {
      return;
    }
    settling = true;
    void document.fonts.ready.then(() => {
      settling = false;
      if (!life.signal.aborted) {
        forgetMeasures();
        measureAfresh();
      }
    });
  };
  document.fonts.addEventListener("loading", onFonts, { signal: life.signal });
  if (document.fonts.status === "loading") {
    onFonts();
  }

  const handle: Chart = {
    update(next) {
      if (state === "tornDown") {
        return;
      }
      const model = chartModel(next, locale, timeZone);
      if (state === "loading") {
        guard(() => {
          offer({ model });
        });
      } else if (state === "settling") {
        store({ model });
      } else {
        guard(() => {
          paint(model);
        });
      }
    },
    loading() {
      if (state === "tornDown" || state === "loading") {
        return;
      }
      if (state === "settling") {
        stored = undefined;
        summary = "";
        state = "loading";
        return;
      }
      if (plot.isConnected && !plot.hidden) {
        lastHeight = plot.getBoundingClientRect().height;
      }
      guard(startLoading);
    },
    error(el) {
      if (state === "tornDown") {
        return;
      }
      if (state === "loading") {
        guard(() => {
          offer({ notice: el });
        });
      } else if (state === "settling") {
        store({ notice: el });
      } else {
        guard(() => {
          fail(el);
        });
      }
    },
    get summary() {
      return summary;
    },
    showTable(on) {
      if (state === "tornDown") {
        return;
      }
      tableOn = on;
      if (hasDrawing()) {
        guard(showView);
      }
    },
  };

  if (first === undefined) {
    startLoading();
  } else {
    paint(first);
  }
  whenAborted(signal, () => {
    life.abort();
    resize.disconnect();
    cancelAnimationFrame(frame);
    live.delete(figure);
    guard(() => {
      if (state === "loading" || state === "settling") {
        timing?.cancel();
        stored = undefined;
        summary = "";
        figure.setAttribute("aria-busy", "false");
        arrange([]);
      } else if (hasDrawing()) {
        explorer.reset();
        plot.removeAttribute("tabindex");
        plot.removeAttribute("aria-roledescription");
        plot.removeAttribute("aria-describedby");
        plot.setAttribute("role", "img");
        howTo.remove();
      }
      if (toggle !== undefined) {
        toggle.hidden = true;
      }
      state = "tornDown";
    });
    leftovers.set(
      figure,
      [box, empty, legend, plot, list, panel, notice].filter(
        (el): el is HTMLElement => el?.isConnected === true,
      ),
    );
  });

  return handle;
}
