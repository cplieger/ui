import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type Chart, type ChartOptions, type ChartSpec } from "./chart.js";
import { AREA_ROOM } from "./draw.js";

const root = document.documentElement;
const MIN = 60_000;
const START = Date.UTC(2026, 10, 11, 7);
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
});

afterEach(() => {
  vi.useRealTimers();
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

const per = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const starts = per(4, (i) => START + i * 15 * MIN);

const bars = (
  a: readonly (number | null)[],
  b: readonly (number | null)[] = [1, 1, 1, 1],
): ChartSpec => ({
  x: { type: "time", domain: [START, START + 60 * MIN] },
  y: { label: "Posts", unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: starts,
      x2: starts.map((s) => s + 15 * MIN),
      series: [
        { name: "Announce", y: a },
        { name: "Path", y: b },
      ],
    },
  ],
});
const full = bars([3, 5, 2, 4]);
const other = bars([9, 9, 9, 9]);
const nothing: ChartSpec = {
  ...bars([0, 0, 0, 0], [0, 0, 0, 0]),
  empty: "No posts in this range.",
};
const broken = {
  ...full,
  marks: [{ mark: "rect", x1: [2, 1], x2: [3, 4], series: [] }],
} as ChartSpec;

interface Built {
  readonly figure: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly life: AbortController;
}

function build(
  attrs: { id?: string; pressed?: boolean; width?: number; lang?: string } = {},
): Built {
  const box = document.createElement("div");
  box.style.inlineSize = `${String(attrs.width ?? 600)}px`;
  document.body.append(box);
  hosts.push(box);
  const id = attrs.id === undefined ? "" : ` id="${attrs.id}"`;
  const lang = attrs.lang === undefined ? "" : ` lang="${attrs.lang}"`;
  box.innerHTML = `<figure class="cp-chart"${id}${lang}><figcaption>Posts by thread kind</figcaption><div class="cp-toolbar"><button class="cp-filter-chip" type="button" aria-pressed="${String(attrs.pressed === true)}" hidden><span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>Table view</button></div></figure>`;
  const figure = box.querySelector("figure") as HTMLElement;
  const life = new AbortController();
  lives.push(life);
  return { figure, toggle: figure.querySelector("button") as HTMLButtonElement, life };
}

function start(spec: ChartSpec | null, b: Built = build(), options: ChartOptions = {}): Chart {
  return renderChart(b.figure, spec, { signal: b.life.signal, toggle: b.toggle, ...options });
}

const get = (figure: HTMLElement, name: string) =>
  figure.querySelector<HTMLElement>(`:scope > [data-part="${name}"]`);
const notice = (words = "Check failed. Retry.") => {
  const el = document.createElement("div");
  el.className = "cp-notice";
  el.dataset["tone"] = "danger";
  el.textContent = words;
  return el;
};

/** What the figure shows: the parts present after the app's toolbar. */
const showing = (figure: HTMLElement) =>
  [...figure.children]
    .filter((c) => c.localName !== "figcaption" && !c.classList.contains("cp-toolbar"))
    .map((c) =>
      c.classList.contains("cp-notice") ? "notice" : (c as HTMLElement).dataset["part"],
    );

interface Expected {
  readonly shows: readonly (string | undefined)[];
  readonly summary: string | RegExp;
  readonly busy: boolean;
  readonly plot: "application" | "img" | null;
  readonly toggle: boolean;
}

function expectState(b: Built, chart: Chart, want: Expected): void {
  expect(showing(b.figure)).toEqual(want.shows);
  if (typeof want.summary === "string") {
    expect(chart.summary).toBe(want.summary);
  } else {
    expect(chart.summary).toMatch(want.summary);
  }
  expect(b.figure.getAttribute("aria-busy")).toBe(String(want.busy));
  const plot = get(b.figure, "plot");
  expect(plot?.getAttribute("role") ?? null).toBe(want.plot);
  expect(plot?.hasAttribute("tabindex") ?? false).toBe(want.plot === "application");
  expect(b.toggle.hidden).toBe(!want.toggle);
}

const loadingState = (): Expected => ({
  shows: ["loading"],
  summary: "",
  busy: true,
  plot: null,
  toggle: false,
});
const readyState: Expected = {
  shows: ["legend", "plot", "table"],
  summary: /^18\u00A0posts, every 15\u00A0min from /u,
  busy: false,
  plot: "application",
  toggle: true,
};
const emptyState: Expected = {
  shows: ["empty"],
  summary: "No posts in this range.",
  busy: false,
  plot: null,
  toggle: false,
};
const failedState: Expected = {
  shows: ["notice"],
  summary: "",
  busy: false,
  plot: null,
  toggle: false,
};

const skeletonShown = (b: Built) =>
  get(b.figure, "loading")?.querySelector(".cp-skeleton") !== null;

describe("the markup a chart builds", () => {
  it("names the figure by its title, describes it by its summary, and keeps the app's toolbar", () => {
    const b = build({ id: "posts-chart" });
    const toolbar = b.figure.querySelector(".cp-toolbar");
    start(full, b);
    const title = b.figure.querySelector('figcaption > [data-part="title"]');
    const summary = b.figure.querySelector('figcaption > [data-part="summary"]');
    expect(title?.textContent).toBe("Posts by thread kind");
    expect(title?.id).toBe("posts-chart-title");
    expect(summary?.id).toBe("posts-chart-summary");
    expect(summary?.hasAttribute("hidden")).toBe(false);
    expect(b.figure.getAttribute("aria-labelledby")).toBe("posts-chart-title");
    expect(b.figure.getAttribute("aria-describedby")).toBe("posts-chart-summary");
    expect(b.figure.querySelector(".cp-toolbar")).toBe(toolbar);
    expect(b.figure.tabIndex).toBe(-1);
  });

  it("gives the plot the application role, its name and its how-to, the SVG hidden", () => {
    const b = build({ id: "posts-chart" });
    start(full, b);
    const plot = get(b.figure, "plot");
    expect(plot?.getAttribute("role")).toBe("application");
    expect(plot?.getAttribute("aria-roledescription")).toBe("chart");
    expect(plot?.getAttribute("tabindex")).toBe("0");
    expect(plot?.getAttribute("aria-label")).toMatch(/^Stacked bar chart, 2 series, /u);
    const howTo = document.getElementById(plot?.getAttribute("aria-describedby") ?? "");
    expect(howTo?.id).toBe("posts-chart-howto");
    expect(howTo?.textContent).toBe("Arrow keys read the values. Tab leaves the chart.");
    expect(howTo?.hidden).toBe(true);
    expect(plot?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(get(b.figure, "legend")?.classList.contains("cp-cluster")).toBe(true);
    const table = get(b.figure, "table");
    expect(table?.hidden).toBe(true);
    expect(table?.matches(".cp-panel[data-flush]")).toBe(true);
  });

  it("generates the ids for a figure that has none, distinct per chart", () => {
    const one = build();
    const two = build();
    start(full, one);
    start(full, two);
    const a = one.figure.getAttribute("aria-labelledby") ?? "";
    expect(a).toMatch(/^cp-chart-\d+-title$/u);
    expect(a).not.toBe(two.figure.getAttribute("aria-labelledby"));
    expect(one.figure.id).toBe("");
  });

  it("writes no style attribute, only CSSOM properties", () => {
    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    const chart = start(full);
    chart.showTable(true);
    chart.showTable(false);
    chart.loading();
    expect(setAttribute.mock.calls.map((call) => call[0])).not.toContain("style");
  });

  it("throws on a figure that holds a live chart, and renders again once it is torn down", () => {
    const b = build();
    start(full, b);
    expect(() => renderChart(b.figure, full)).toThrow(DOMException);
    b.life.abort();
    const again = renderChart(b.figure, other, { toggle: b.toggle });
    expect(b.figure.querySelectorAll('[data-part="plot"]')).toHaveLength(1);
    expect(b.figure.querySelectorAll('[data-part="title"]')).toHaveLength(1);
    expect(again.summary).toMatch(/^40\u00A0posts/u);
    expect(get(b.figure, "plot")?.getAttribute("role")).toBe("application");
  });

  it("throws on a broken spec before it touches the figure", () => {
    const b = build();
    const before = b.figure.innerHTML;
    expect(() => start(broken, b)).toThrow(RangeError);
    expect(b.figure.innerHTML).toBe(before);
    expect(() => start(full, b)).not.toThrow();
  });

  it("throws for a figure with no caption", () => {
    const b = build();
    b.figure.querySelector("figcaption")?.remove();
    expect(() => start(full, b)).toThrow(TypeError);
  });

  it("writes a figure inside lang=fr in French, in an en page", () => {
    const b = build({ lang: "fr" });
    const chart = start(full, b);
    expect(chart.summary).toMatch(/^18\u00A0posts, every 15\u00A0min from \d{1,2}:\d{2} to/u);
    const ticks = [...b.figure.querySelectorAll('svg [data-part="x"] text')].map(
      (t) => t.textContent,
    );
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((t) => /AM|PM/u.test(t ?? ""))).toBe(false);
    chart.showTable(true);
    expect(get(b.figure, "table")?.querySelector("tbody th")?.textContent).toMatch(
      /^\d{1,2}:\d{2} to /u,
    );
  });

  it("has the title alone as its name and the summary as its description", async () => {
    const b = build({ id: "named" });
    const chart = start(full, b);
    await expect.element(b.figure).toHaveAccessibleName("Posts by thread kind");
    await expect.element(b.figure).toHaveAccessibleDescription(chart.summary);
  });

  it("describes an empty chart by its empty words, shown once", async () => {
    const b = build();
    start(nothing, b);
    await expect.element(b.figure).toHaveAccessibleDescription("No posts in this range.");
    expect(b.figure.innerText.split("No posts in this range.")).toHaveLength(2);
  });
});

describe("the lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("loading: a box in the plot's place, the skeleton after 200 ms, busy", () => {
    const b = build();
    const chart = start(null, b);
    expectState(b, chart, loadingState());
    vi.advanceTimersByTime(199);
    expect(skeletonShown(b)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(skeletonShown(b)).toBe(true);
    expectState(b, chart, loadingState());
  });

  it("update before the skeleton paints draws at once, and the skeleton never shows", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(100);
    chart.update(full);
    expectState(b, chart, readyState);
    vi.advanceTimersByTime(1000);
    expect(get(b.figure, "loading")).toBeNull();
  });

  it("update once the skeleton shows waits for its minimum, its summary readable at once", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(300);
    chart.update(full);
    expect(showing(b.figure)).toEqual(["loading"]);
    expect(chart.summary).toMatch(readyState.summary);
    expect(b.figure.getAttribute("aria-busy")).toBe("true");
    vi.advanceTimersByTime(299);
    expect(get(b.figure, "plot")).toBeNull();
    vi.advanceTimersByTime(1);
    expectState(b, chart, readyState);
  });

  it("update once the minimum has passed draws at once", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(700);
    chart.update(full);
    expectState(b, chart, readyState);
  });

  it("two updates inside the minimum draw the second", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(250);
    chart.update(full);
    chart.update(other);
    expect(chart.summary).toMatch(/^40\u00A0posts/u);
    vi.advanceTimersByTime(400);
    expect(chart.summary).toMatch(/^40\u00A0posts/u);
    expect(get(b.figure, "plot")).not.toBeNull();
  });

  it("an update then an error inside the minimum shows the error", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(250);
    chart.update(full);
    const el = notice();
    chart.error(el);
    expect(chart.summary).toBe("");
    vi.advanceTimersByTime(400);
    expectState(b, chart, failedState);
    expect(b.figure.lastElementChild).toBe(el);
  });

  it("an error while loading, before the skeleton, shows the notice in the plot's place", () => {
    const b = build();
    const chart = start(null, b);
    chart.error(notice());
    expectState(b, chart, failedState);
  });

  it("empty: the spec's words, or words.empty, in the plot's place", () => {
    const b = build();
    const chart = start(nothing, b);
    expectState(b, chart, emptyState);
    expect(get(b.figure, "empty")?.textContent).toBe("No posts in this range.");
    expect(get(b.figure, "empty")?.classList.contains("cp-empty")).toBe(true);
    const summary = b.figure.querySelector<HTMLElement>('[data-part="summary"]');
    expect(summary?.hidden).toBe(true);
    expect(summary?.textContent).toBe("No posts in this range.");
    const plain = build();
    const own = start({ ...nothing, empty: undefined } as unknown as ChartSpec, plain, {
      words: { empty: "Rien ici." },
    });
    expect(own.summary).toBe("Rien ici.");
    expect(get(plain.figure, "empty")?.textContent).toBe("Rien ici.");
  });

  it("a broken spec throws in every live state and changes nothing", () => {
    const check = (chart: Chart, b: Built) => {
      const before = b.figure.innerHTML;
      const summary = chart.summary;
      expect(() => {
        chart.update(broken);
      }).toThrow(RangeError);
      expect(b.figure.innerHTML).toBe(before);
      expect(chart.summary).toBe(summary);
    };
    const b = build();
    const chart = start(null, b);
    check(chart, b); // loading
    vi.advanceTimersByTime(250);
    chart.update(full);
    check(chart, b); // settling
    vi.advanceTimersByTime(400);
    check(chart, b); // ready
    chart.error(notice());
    check(chart, b); // refreshFailed
    chart.update(nothing);
    check(chart, b); // empty
    chart.loading();
    chart.error(notice());
    check(chart, b); // failed
  });

  it("loading() while loading keeps the live timing", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(150);
    chart.loading();
    vi.advanceTimersByTime(50);
    expect(skeletonShown(b)).toBe(true);
  });

  it("loading() 100 ms after the paint, then update 50 ms later, keeps the skeleton 400 ms from its paint", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(300);
    chart.loading();
    vi.advanceTimersByTime(50);
    chart.update(full);
    vi.advanceTimersByTime(249);
    expect(skeletonShown(b)).toBe(true);
    vi.advanceTimersByTime(1);
    expectState(b, chart, readyState);
  });

  it("loading() while settling drops the stored item; the deferred render draws nothing", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(250);
    chart.update(full);
    chart.loading();
    expect(chart.summary).toBe("");
    vi.advanceTimersByTime(1000);
    expectState(b, chart, loadingState());
    expect(skeletonShown(b)).toBe(true);
    chart.update(other);
    expect(chart.summary).toMatch(/^40\u00A0posts/u);
    expect(get(b.figure, "plot")).not.toBeNull();
  });

  it("an update after loading() from settling waits for the pending minimum", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(250);
    chart.update(full);
    chart.loading();
    vi.advanceTimersByTime(100);
    chart.update(other);
    expect(get(b.figure, "plot")).toBeNull();
    expect(b.figure.getAttribute("aria-busy")).toBe("true");
    vi.advanceTimersByTime(250);
    expect(chart.summary).toMatch(/^40\u00A0posts/u);
    expect(get(b.figure, "plot")).not.toBeNull();
  });

  it("loading() after a drawing drops it and starts a new timing", () => {
    const b = build();
    const chart = start(full, b);
    chart.loading();
    expectState(b, chart, loadingState());
    expect(get(b.figure, "legend")).toBeNull();
    vi.advanceTimersByTime(200);
    expect(skeletonShown(b)).toBe(true);
    chart.update(other);
    vi.advanceTimersByTime(400);
    expect(chart.summary).toMatch(/^40\u00A0posts/u);
  });

  it("loading() then an error after a good render shows the notice alone", () => {
    const b = build();
    const chart = start(full, b);
    chart.loading();
    vi.advanceTimersByTime(250);
    expect(chart.summary).toBe("");
    chart.error(notice());
    vi.advanceTimersByTime(400);
    expectState(b, chart, failedState);
  });

  it("loading() with the plot focused moves focus to the figure", () => {
    const b = build();
    const chart = start(full, b);
    get(b.figure, "plot")?.focus();
    chart.loading();
    expect(document.activeElement).toBe(b.figure);
  });

  it("an error after a drawing keeps it, with the notice under it", () => {
    const b = build();
    const chart = start(full, b);
    const summary = chart.summary;
    chart.error(notice());
    expectState(b, chart, { ...readyState, shows: ["legend", "plot", "table", "notice"], summary });
    const next = notice("Still failing.");
    chart.error(next);
    expect(b.figure.querySelectorAll(".cp-notice")).toHaveLength(1);
    expect(b.figure.lastElementChild).toBe(next);
    chart.update(other);
    expectState(b, chart, { ...readyState, summary: /^40\u00A0posts/u });
  });

  it("an error after empty keeps the empty words; a showTable there waits for the next ready", () => {
    const b = build();
    const chart = start(nothing, b);
    chart.error(notice());
    expectState(b, chart, { ...emptyState, shows: ["empty", "notice"] });
    chart.showTable(true);
    expect(get(b.figure, "table")).toBeNull();
    chart.update(full);
    expect(get(b.figure, "table")?.hidden).toBe(false);
    expect(get(b.figure, "plot")?.hidden).toBe(true);
    expect(b.toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("an error in failed replaces the notice; an update then draws and removes it", () => {
    const b = build();
    const chart = start(null, b);
    chart.error(notice());
    const next = notice("Still failing.");
    chart.error(next);
    expect(b.figure.querySelectorAll(".cp-notice")).toHaveLength(1);
    expect(b.figure.lastElementChild).toBe(next);
    chart.update(full);
    expectState(b, chart, readyState);
  });

  it("a focused Retry in a notice the chart removes leaves focus on the figure", () => {
    const b = build();
    const chart = start(null, b);
    const el = notice();
    const retry = document.createElement("button");
    el.append(retry);
    chart.error(el);
    retry.focus();
    chart.loading();
    expect(document.activeElement).toBe(b.figure);
  });
});

describe("the teardown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("from loading or settling leaves the caption only, and no draw runs after", () => {
    const b = build();
    const chart = start(null, b);
    vi.advanceTimersByTime(200);
    b.life.abort();
    expectState(b, chart, { shows: [], summary: "", busy: false, plot: null, toggle: false });
    const s = build();
    const settling = start(null, s);
    vi.advanceTimersByTime(250);
    settling.update(full);
    s.life.abort();
    vi.advanceTimersByTime(1000);
    expectState(s, settling, { shows: [], summary: "", busy: false, plot: null, toggle: false });
  });

  it("from empty keeps the empty words, with no plot", () => {
    const b = build();
    const chart = start(nothing, b);
    b.life.abort();
    expectState(b, chart, emptyState);
  });

  it("from failed keeps the notice, with no plot", () => {
    const b = build();
    const chart = start(null, b);
    chart.error(notice());
    b.life.abort();
    expectState(b, chart, failedState);
  });

  it("from ready leaves a static image named by its short description, focus on the figure", () => {
    const b = build();
    const chart = start(full, b);
    const plot = get(b.figure, "plot");
    const name = plot?.getAttribute("aria-label");
    const summary = chart.summary;
    plot?.focus();
    b.life.abort();
    expectState(b, chart, { ...readyState, plot: "img", summary, toggle: false });
    expect(plot?.getAttribute("aria-label")).toBe(name);
    expect(plot?.hasAttribute("aria-roledescription")).toBe(false);
    expect(plot?.hasAttribute("aria-describedby")).toBe(false);
    expect(plot?.querySelector("[id$='-howto']")).toBeNull();
    expect(document.activeElement).toBe(b.figure);
  });

  it("from ready with the table shown keeps the table, the plot and legend hidden", () => {
    const b = build();
    const chart = start(full, b);
    chart.showTable(true);
    b.toggle.focus();
    b.life.abort();
    expect(get(b.figure, "table")?.hidden).toBe(false);
    expect(get(b.figure, "plot")?.hidden).toBe(true);
    expect(get(b.figure, "legend")?.hidden).toBe(true);
    expect(get(b.figure, "plot")?.getAttribute("role")).toBe("img");
    expect(b.toggle.hidden).toBe(true);
    expect(document.activeElement).toBe(b.figure);
  });

  it("from a failed refresh keeps the drawing and its notice", () => {
    const b = build();
    const chart = start(full, b);
    chart.error(notice());
    b.life.abort();
    expect(showing(b.figure)).toEqual(["legend", "plot", "table", "notice"]);
    expect(get(b.figure, "plot")?.getAttribute("role")).toBe("img");
  });

  it("ignores every call after it, without a throw", () => {
    const b = build();
    const chart = start(full, b);
    b.life.abort();
    const before = b.figure.innerHTML;
    const summary = chart.summary;
    expect(() => {
      chart.update(broken);
      chart.update(other);
      chart.error(notice());
      chart.loading();
      chart.showTable(true);
    }).not.toThrow();
    expect(b.figure.innerHTML).toBe(before);
    expect(chart.summary).toBe(summary);
  });

  it("stops following the toggle and the box", async () => {
    vi.useRealTimers();
    const b = build();
    start(full, b);
    b.life.abort();
    b.toggle.hidden = false;
    b.toggle.click();
    expect(b.toggle.getAttribute("aria-pressed")).toBe("false");
    const svg = get(b.figure, "plot")?.querySelector("svg");
    const width = svg?.getAttribute("width");
    (b.figure.parentElement as HTMLElement).style.inlineSize = "400px";
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(svg?.getAttribute("width")).toBe(width);
  });

  it("from an aborted signal draws nothing live", () => {
    const b = build();
    b.life.abort();
    const chart = start(full, b);
    expect(get(b.figure, "plot")?.getAttribute("role")).toBe("img");
    expect(b.toggle.hidden).toBe(true);
    chart.update(other);
    expect(chart.summary).toMatch(/^18\u00A0posts/u);
  });
});

describe("the table view toggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("is hidden until ready, and in every state with no drawing", () => {
    const b = build();
    const chart = start(null, b);
    expect(b.toggle.hidden).toBe(true);
    vi.advanceTimersByTime(250);
    chart.update(full);
    expect(b.toggle.hidden).toBe(true); // settling
    vi.advanceTimersByTime(400);
    expect(b.toggle.hidden).toBe(false);
    chart.update(nothing);
    expect(b.toggle.hidden).toBe(true);
    chart.error(notice());
    expect(b.toggle.hidden).toBe(true); // refreshFailed after empty
    chart.loading();
    expect(b.toggle.hidden).toBe(true);
    chart.error(notice());
    expect(b.toggle.hidden).toBe(true); // failed
  });

  it("swaps the plot and legend for the table by its aria-pressed, focus kept on it", () => {
    const b = build();
    start(full, b);
    b.toggle.focus();
    b.toggle.click();
    expect(b.toggle.getAttribute("aria-pressed")).toBe("true");
    expect(get(b.figure, "table")?.hidden).toBe(false);
    expect(get(b.figure, "plot")?.hidden).toBe(true);
    expect(get(b.figure, "legend")?.hidden).toBe(true);
    expect(get(b.figure, "table")?.querySelector("caption")?.textContent).toBe(
      "Posts by thread kind",
    );
    expect(document.activeElement).toBe(b.toggle);
    b.toggle.click();
    expect(b.toggle.getAttribute("aria-pressed")).toBe("false");
    expect(get(b.figure, "table")?.hidden).toBe(true);
    expect(get(b.figure, "plot")?.hidden).toBe(false);
    expect(document.activeElement).toBe(b.toggle);
  });

  it("pressed at the start opens the table when the chart is ready", () => {
    const b = build({ pressed: true });
    const chart = start(null, b);
    expect(get(b.figure, "table")).toBeNull();
    chart.update(full);
    expect(get(b.figure, "table")?.hidden).toBe(false);
    expect(get(b.figure, "plot")?.hidden).toBe(true);
  });

  it("hidden while it holds focus moves focus to the figure", () => {
    const b = build();
    const chart = start(full, b);
    b.toggle.focus();
    chart.update(nothing);
    expect(b.toggle.hidden).toBe(true);
    expect(document.activeElement).toBe(b.figure);
  });

  it("is optional: showTable alone switches the view", () => {
    const b = build();
    const chart = renderChart(b.figure, full, { signal: b.life.signal });
    expect(b.toggle.hidden).toBe(true);
    chart.showTable(true);
    expect(get(b.figure, "table")?.hidden).toBe(false);
    chart.showTable(false);
    expect(get(b.figure, "plot")?.hidden).toBe(false);
  });
});

describe("the table view on update", () => {
  const timed = (n: number, from: number, y: (i: number) => number): ChartSpec => {
    const x1 = per(n, (i) => START + (from + i) * 15 * MIN);
    return {
      x: { type: "time" },
      marks: [
        {
          mark: "rect",
          x1,
          x2: x1.map((s) => s + 15 * MIN),
          series: [{ name: "Posts", y: per(n, y) }],
        },
      ],
    };
  };
  const rows = (b: Built) => [...(get(b.figure, "table")?.querySelectorAll("tbody tr") ?? [])];

  it("rewrites changed cells in place, appends and removes rows, and keeps the focused cell", () => {
    const pair = new AbortController();
    lives.push(pair);
    installAnnouncer({ signal: pair.signal });
    const b = build();
    const chart = start(
      timed(4, 0, () => 1),
      b,
    );
    chart.showTable(true);
    const [, second, third] = rows(b);
    const cell = second?.querySelector("td");
    const head = third?.querySelector("th");
    head?.setAttribute("tabindex", "-1");
    head?.focus();
    chart.update(timed(4, 1, (i) => (i === 0 ? 7 : 1)));
    const now = rows(b);
    expect(now).toHaveLength(4);
    expect(now[0]).toBe(second);
    expect(now[0]?.querySelector("td")).toBe(cell);
    expect(cell?.textContent).toBe("7");
    expect(now[1]).toBe(third);
    expect(document.activeElement).toBe(head);
    expect(document.querySelector(".cp-live-regions")?.textContent).toBe("");
  });

  it("rebuilds a hidden table on its next show", () => {
    const b = build();
    const chart = start(
      timed(4, 0, () => 1),
      b,
    );
    chart.showTable(true);
    chart.showTable(false);
    chart.update(timed(6, 0, () => 2));
    expect(rows(b)).toHaveLength(4);
    chart.showTable(true);
    expect(rows(b)).toHaveLength(6);
    expect(rows(b)[0]?.querySelector("td")?.textContent).toBe("2");
  });

  it("builds no table until it is first shown", () => {
    const b = build();
    start(full, b);
    expect(get(b.figure, "table")?.querySelector("table")).toBeNull();
  });
});

describe("the drawing under update and resize", () => {
  const counts = (top: number): ChartSpec => ({
    x: { type: "time", domain: [START, START + 60 * MIN] },
    marks: [
      {
        mark: "rect",
        x1: starts,
        x2: starts.map((s) => s + 15 * MIN),
        series: [{ name: "Posts", y: [1, 2, top, 3] }],
      },
    ],
  });
  const plotLeft = (b: Built) =>
    Number(get(b.figure, "plot")?.querySelector('[data-part="area"]')?.getAttribute("x")) +
    AREA_ROOM;

  it("keeps a group's left edge when an update widens the top label, read back in px", () => {
    const b = build();
    const group = b.figure.parentElement as HTMLElement;
    group.style.setProperty("--cp-chart-axis-gutter", "8rem");
    const chart = start(counts(9), b);
    expect(plotLeft(b)).toBe(128);
    chart.update(counts(12_345));
    expect(plotLeft(b)).toBe(128);
  });

  it("never narrows its gutter on update", () => {
    const b = build();
    const chart = start(counts(12_345), b);
    const left = plotLeft(b);
    chart.update(counts(9));
    expect(plotLeft(b)).toBe(left);
  });

  const steps: ChartSpec = {
    x: { type: "time", domain: [START, START + 3 * MIN] },
    marks: [
      {
        mark: "line",
        curve: "step",
        x: per(4, (i) => START + i * MIN),
        series: [{ name: "Live", y: [4, 4, 6, 6] }],
      },
    ],
  };
  const area = (b: Built) =>
    get(b.figure, "plot")?.querySelector('[data-part="area"]') as SVGSVGElement;
  const ends = (b: Built) => b.figure.querySelectorAll('svg [data-part="end"] text').length;

  it("draws end labels on a figure 30rem wide, as wide as the stylesheet's plot height takes it", () => {
    const wide = build({ width: 480 });
    start(steps, wide);
    expect(ends(wide)).toBe(1);
    expect(Number(area(wide).getAttribute("height"))).toBe(240 + 2 * AREA_ROOM);
    const narrow = build({ width: 479 });
    start(steps, narrow);
    expect(ends(narrow)).toBe(0);
    expect(Number(area(narrow).getAttribute("height"))).toBe(200 + 2 * AREA_ROOM);
  });

  it("measures afresh on a resize, with no two x labels overlapping", async () => {
    const b = build({ width: 1200 });
    start(counts(9), b);
    const ticks = () => b.figure.querySelectorAll('svg [data-part="x"] text').length;
    const wide = ticks();
    (b.figure.parentElement as HTMLElement).style.inlineSize = "320px";
    await vi.waitFor(() => {
      expect(ticks()).toBeLessThan(wide);
    });
    const boxes = [...b.figure.querySelectorAll('svg [data-part="x"] text')]
      .map((t) => t.getBoundingClientRect())
      .sort((p, q) => p.left - q.left);
    for (let i = 1; i < boxes.length; i++) {
      const [p, q] = [boxes[i - 1], boxes[i]];
      if (p !== undefined && q !== undefined && Math.abs(p.top - q.top) < 1) {
        expect(q.left).toBeGreaterThanOrEqual(p.right);
      }
    }
  });
});

describe("a face that loads after the drawing", () => {
  const strip: ChartSpec = {
    x: { type: "time", domain: [START, START + 60 * MIN] },
    y: { type: "band" },
    marks: [
      {
        mark: "dot",
        unit: { one: "post", other: "posts" },
        rows: [{ name: "lead-ui-agent", x: [START + 10 * MIN] }],
      },
    ],
  };
  const plotLeft = (b: Built) =>
    Number(get(b.figure, "plot")?.querySelector('[data-part="area"]')?.getAttribute("x")) +
    AREA_ROOM;
  const late = (b: Built): Built => {
    (b.figure.parentElement as HTMLElement).style.fontFamily = '"cp-chart-late", serif';
    return b;
  };

  it("measures the chart again once the face has loaded, as a chart drawn after it measures", async () => {
    const url = new URL("../../../fonts/atkinson-hyperlegible-next-latin.woff2", import.meta.url);
    const face = new FontFace("cp-chart-late", `url(${url.href})`);
    await document.fonts.ready;
    document.fonts.add(face);
    try {
      const b = build();
      const chart = start(null, b);
      late(b);
      chart.update(strip);
      const before = plotLeft(b);
      await face.load();
      await document.fonts.ready;
      const after = late(build());
      start(strip, after);
      expect(plotLeft(after)).not.toBe(before);
      await vi.waitFor(() => {
        expect(plotLeft(b)).toBe(plotLeft(after));
      });
    } finally {
      document.fonts.delete(face);
    }
  });
});
