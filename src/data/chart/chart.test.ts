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

// Sets the chart's box to `width` and resolves once the chart has drawn at it.
// Observers deliver in the order they were made, so the chart's runs before
// this one and asks for its frame first; this one's frame then runs after it.
async function resize(b: Built, width: number): Promise<void> {
  (b.figure.parentElement as HTMLElement).style.inlineSize = `${String(width)}px`;
  await new Promise<void>((done) => {
    const seen = new ResizeObserver(() => {
      seen.disconnect();
      requestAnimationFrame(() => {
        done();
      });
    });
    seen.observe(b.figure);
  });
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

  it("balances the title's lines and wraps the summary, which update() rewrites, as prose", () => {
    const b = build({ id: "posts-chart" });
    start(full, b);
    const wrap = (part: string) =>
      getComputedStyle(
        b.figure.querySelector(`figcaption > [data-part="${part}"]`) as Element,
      ).getPropertyValue("text-wrap-style");
    expect(wrap("title")).toBe("balance");
    expect(wrap("summary")).toBe("auto");
  });

  it("gives the plot the application role, its name and its how-to, the SVG hidden", () => {
    const b = build({ id: "posts-chart" });
    start(full, b);
    const plot = get(b.figure, "plot");
    expect(plot?.getAttribute("role")).toBe("application");
    expect(plot?.getAttribute("aria-roledescription")).toBe("chart");
    expect(plot?.getAttribute("tabindex")).toBe("0");
    expect(plot?.getAttribute("aria-label")).toMatch(/^Stacked column chart, 2 series, /u);
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
    await resize(b, 400);
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
    const shown = get(b.figure, "table")?.querySelector("table");
    expect(shown?.caption).toBeNull();
    const by = document.getElementById(shown?.getAttribute("aria-labelledby") ?? "");
    expect(by?.textContent).toBe("Posts by thread kind");
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
    expect(document.querySelector("[data-cp-live-regions]")?.textContent).toBe("");
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

  it("writes a pie's Total row in the foot, its cells rewritten in place on update", () => {
    const pie = (forest: number): ChartSpec => ({
      marks: [
        {
          mark: "pie",
          slices: [
            { name: "Agriculture", value: 182_637 },
            { name: "Forest", value: forest },
          ],
        },
      ],
    });
    const b = build();
    const chart = start(pie(106_645), b);
    chart.showTable(true);
    const table = get(b.figure, "table")?.querySelector("table");
    const foot = () => table?.tFoot?.rows[0];
    const row = foot();
    const total = row?.cells[1];
    expect(row?.querySelector("th")?.scope).toBe("row");
    expect([...(row?.cells ?? [])].map((c) => c.textContent)).toEqual(["Total", "289,282", "100%"]);
    expect(
      [...(table?.tBodies[0]?.querySelectorAll("th") ?? [])].map(
        (th) => th.querySelector("bdi")?.textContent,
      ),
    ).toEqual(["Agriculture", "Forest"]);
    chart.update(pie(17_363));
    expect(get(b.figure, "table")?.querySelector("table")).toBe(table);
    expect(foot()).toBe(row);
    expect(foot()?.cells[1]).toBe(total);
    expect(total?.textContent).toBe("200,000");
    expect(table?.tFoot?.rows).toHaveLength(1);
  });

  it("writes a treemap's groups in a tbody each, kept and moved by name on update", () => {
    const tree = (groups: readonly (readonly [string, number])[]): ChartSpec => ({
      marks: [
        {
          mark: "tree",
          nodes: groups.map(([name, value]) => ({
            name,
            children: [
              { name: "A", value },
              { name: "B", value: 1 },
            ],
          })),
        },
      ],
    });
    const b = build();
    const chart = start(
      tree([
        ["Asia", 3],
        ["Europe", 2],
        ["Africa", 1],
      ]),
      b,
    );
    chart.showTable(true);
    const table = get(b.figure, "table")?.querySelector("table");
    const bodies = () => [...(table?.tBodies ?? [])];
    const [asia, europe] = bodies();
    const heads = (tb: HTMLTableSectionElement | undefined) =>
      [...(tb?.querySelectorAll("th") ?? [])].map((th) => `${th.scope} ${th.textContent ?? ""}`);
    expect(bodies()).toHaveLength(3);
    expect(heads(asia)).toEqual(["rowgroup Asia", "row A", "row B"]);
    expect(
      [...(asia?.querySelectorAll("th") ?? [])].map((th) => th.querySelector("bdi")?.textContent),
    ).toEqual(["Asia", "A", "B"]);
    expect([...(asia?.rows[0]?.cells ?? [])].map((c) => c.textContent)).toEqual([
      "Asia",
      "4",
      "44%",
    ]);
    const cell = europe?.rows[1]?.cells[1];
    chart.update(
      tree([
        ["Europe", 7],
        ["Asia", 3],
      ]),
    );
    expect(get(b.figure, "table")?.querySelector("table")).toBe(table);
    expect(bodies()).toHaveLength(2);
    expect(bodies()[0]).toBe(europe);
    expect(bodies()[1]).toBe(asia);
    expect(europe?.rows[1]?.cells[1]).toBe(cell);
    expect(cell?.textContent).toBe("7");
    expect(table?.tHead?.nextElementSibling).toBe(europe);
    expect(table?.lastElementChild).toBe(table?.tFoot);
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

  it("names a range plot's last legend slot Gap and an arrow plot's Change", () => {
    for (const [link, word] of [
      ["range", "Gap"],
      ["arrow", "Change"],
    ] as const) {
      const b = build();
      start(
        {
          x: {},
          marks: [
            {
              mark: "point",
              y: ["Doctorate"],
              link,
              series: [
                { name: "Women", x: [128_700] },
                { name: "Men", x: [163_500] },
              ],
            },
          ],
        },
        b,
      );
      const last = get(b.figure, "legend")?.querySelector('[data-part="total"]');
      expect(last?.textContent.trim()).toBe(word);
    }
  });

  it("keeps the legend's slot widths through an update, and measures them again on a resize", async () => {
    const b = build();
    const chart = start(bars([12_345, 1, 1, 1]), b);
    const slot = () =>
      Number.parseFloat(
        (
          get(b.figure, "legend")?.querySelector(
            '[data-part="total"] [data-part="value"]',
          ) as HTMLElement
        ).style.minInlineSize,
      );
    const wide = slot();
    chart.update(bars([1, 1, 1, 1], [1, 1, 1, 1]));
    expect(slot()).toBe(wide);
    await resize(b, 560);
    expect(slot()).toBeLessThan(wide);
  });

  it("keeps a treemap's rows on an update of the same names, and lays out afresh on new names", () => {
    const gdp = [27.4, 17.8, 4.5, 4.2, 3.7, 3.3, 3, 2.2, 2.1, 1.7, 1.4, 1.2, 1.1, 0.9, 0.5, 0.3];
    const moved = gdp.map((v, i) => (i === 0 ? v * 0.4 : i === 1 ? v * 2.5 : v));
    const tree = (values: readonly number[], prefix = "C"): ChartSpec => ({
      marks: [
        {
          mark: "tree",
          nodes: values.map((value, i) => ({ name: `${prefix}${String(i)}`, value })),
        },
      ],
    });
    const tiles = (b: Built) =>
      b.figure.querySelector('svg [data-part="tree"] path')?.getAttribute("d") ?? "";
    const fresh = build();
    start(tree(moved), fresh);
    const b = build();
    const chart = start(tree(gdp), b);
    const before = tiles(b);
    chart.update(tree(moved));
    // The edges moved, along the rows the first values made, not afresh.
    expect(tiles(b)).not.toBe(before);
    expect(tiles(b)).not.toBe(tiles(fresh));
    chart.update(tree(moved, "D"));
    expect(tiles(b)).toBe(tiles(fresh));
  });

  it("measures afresh on a resize, with no two x labels overlapping", async () => {
    const b = build({ width: 1200 });
    start(counts(9), b);
    const ticks = () => b.figure.querySelectorAll('svg [data-part="x"] text').length;
    const wide = ticks();
    await resize(b, 320);
    expect(ticks()).toBeLessThan(wide);
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

  it("wraps a legend place wider than the figure inside it, on a 2D histogram at a phone's width", () => {
    const b = build({ width: 280 });
    start(
      {
        x: { type: "log", label: "Payload of the request", format: "duration" },
        y: { label: "Response time of the request", format: "duration" },
        marks: [
          {
            mark: "cell",
            x: { edges: [1_000, 2_000, 5_000] },
            y: { edges: [100_000, 200_000, 500_000] },
            values: [
              [1, 2],
              [3, 4],
            ],
          },
        ],
      },
      b,
    );
    const right = b.figure.getBoundingClientRect().right;
    const slots = [...(get(b.figure, "legend")?.children ?? [])];
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.getBoundingClientRect().right).toBeLessThanOrEqual(right + 0.5);
    }
  });
});

describe("the notes", () => {
  const noted = (...notes: [number, number, string][]): ChartSpec => ({
    ...full,
    marks: [...full.marks, ...notes.map(([x, y, text]) => ({ mark: "text" as const, x, y, text }))],
  });
  const one = noted([starts[1] ?? 0, 4, "Deploy"]);
  const two = noted([starts[1] ?? 0, 4, "Deploy"], [starts[2] ?? 0, 2, "Rollback"]);
  const svgNotes = (b: Built) =>
    [...b.figure.querySelectorAll('svg [data-part="note"] text')].map((t) => t.textContent);
  const markers = (b: Built) =>
    [...b.figure.querySelectorAll('svg [data-part="marker"] text')].map((t) => t.textContent);
  const listed = (b: Built) =>
    [...(get(b.figure, "notes")?.querySelectorAll("li") ?? [])].map((li) => li.textContent);

  it("writes a note on the plot from 30rem up, with no list", () => {
    const b = build({ width: 480 });
    start(one, b);
    expect(svgNotes(b)).toEqual(["Deploy"]);
    expect(markers(b)).toEqual([]);
    expect(get(b.figure, "notes")).toBeNull();
  });

  it("numbers every note under 30rem and lists them below the plot, in spec order", () => {
    const b = build({ width: 479 });
    start(two, b);
    expect(svgNotes(b)).toEqual([]);
    expect(markers(b)).toEqual(["1", "2"]);
    expect(showing(b.figure)).toEqual(["legend", "plot", "notes", "table"]);
    expect(get(b.figure, "notes")?.localName).toBe("ol");
    expect(listed(b)).toEqual(["Deploy", "Rollback"]);
  });

  it("numbers every note when two would overlap, on a wide figure", () => {
    const b = build({ width: 600 });
    start(noted([starts[1] ?? 0, 4, "Deploy"], [starts[1] ?? 0, 4, "Same place"]), b);
    expect(markers(b)).toEqual(["1", "2"]);
    expect(listed(b)).toEqual(["Deploy", "Same place"]);
  });

  it("switches to the list on a resize under 30rem and back above it", async () => {
    const b = build({ width: 600 });
    start(one, b);
    await resize(b, 320);
    expect(listed(b)).toEqual(["Deploy"]);
    expect(svgNotes(b)).toEqual([]);
    await resize(b, 600);
    expect(get(b.figure, "notes")).toBeNull();
    expect(svgNotes(b)).toEqual(["Deploy"]);
  });

  it("hides the list with the plot in the table view, which writes the notes after the table", () => {
    const b = build({ width: 320 });
    const chart = start(one, b);
    chart.showTable(true);
    expect(get(b.figure, "notes")?.hidden).toBe(true);
    expect(get(b.figure, "table")?.querySelector('[data-part="after"]')?.textContent).toMatch(
      /: Deploy\.$/u,
    );
    chart.showTable(false);
    expect(get(b.figure, "notes")?.hidden).toBe(false);
  });

  it("keeps the list under a failed refresh and a teardown, and drops it on loading, empty and an update without notes", () => {
    const b = build({ width: 320 });
    const chart = start(one, b);
    chart.error(notice());
    expect(showing(b.figure)).toEqual(["legend", "plot", "notes", "table", "notice"]);
    chart.update(full);
    expect(get(b.figure, "notes")).toBeNull();
    chart.update(one);
    chart.update(nothing);
    expect(showing(b.figure)).toEqual(["empty"]);
    chart.update(one);
    chart.loading();
    expect(showing(b.figure)).toEqual(["loading"]);
    const torn = build({ width: 320 });
    start(one, torn);
    torn.life.abort();
    expect(listed(torn)).toEqual(["Deploy"]);
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
    // A stylesheet face, as an app's is, so its fetch starts at the chart's
    // draw, after the page's fonts settled.
    const url = new URL("../../../fonts/atkinson-hyperlegible-next-latin.woff2", import.meta.url);
    const faces = new CSSStyleSheet();
    // A query of its own, so no cached copy loads the face within the draw.
    url.searchParams.set("late", String(Date.now()));
    faces.replaceSync(`@font-face { font-family: "cp-chart-late"; src: url("${url.href}"); }`);
    try {
      const b = build();
      const chart = start(null, b);
      // The page's own faces settle before the late face is known.
      await vi.waitFor(() => {
        expect(document.fonts.status).toBe("loaded");
      });
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, faces];
      late(b);
      chart.update(strip);
      const before = plotLeft(b);
      const face = () => [...document.fonts].find((f) => f.family.includes("cp-chart-late"));
      await vi.waitFor(() => {
        expect(face()?.status).toBe("loaded");
      });
      // The chart's own wait on the set comes first, so it has run by now.
      await document.fonts.ready;
      const after = late(build());
      start(strip, after);
      expect(plotLeft(after)).not.toBe(before);
      await vi.waitFor(() => {
        expect(plotLeft(b)).toBe(plotLeft(after));
      });
    } finally {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== faces);
    }
  });
});

describe("a scatter plot's notes with the table view on from the start", () => {
  it("writes the note at the dot it joins in the summary and after the table, the plot never laid out", () => {
    const b = build({ pressed: true });
    const chart = start(
      {
        x: { label: "GDP per capita" },
        y: { label: "Life expectancy" },
        marks: [
          {
            mark: "scatter",
            series: [
              {
                name: "Europe",
                names: ["Albania", "Monaco"],
                x: [18_920, 140_000],
                y: [79.8, 85.9],
              },
            ],
          },
          { mark: "text", x: 140_000, y: 85.9, text: "A city-state" },
        ],
      },
      b,
    );
    expect(get(b.figure, "plot")?.hidden).toBe(true);
    expect(get(b.figure, "plot")?.querySelector("svg")?.childElementCount).toBe(0);
    expect(get(b.figure, "table")?.querySelector('[data-part="after"]')?.textContent).toBe(
      "Monaco: A city-state.",
    );
    expect(chart.summary.endsWith(" Monaco: A city-state.")).toBe(true);
    const rows = [...(get(b.figure, "table")?.querySelectorAll("tbody th") ?? [])];
    expect(rows.map((th) => th.querySelector("bdi")?.textContent)).toEqual(["Albania", "Monaco"]);
  });
});

describe("small multiples' panels", () => {
  const months = per(12, (i) => Date.UTC(2024, i, 1));
  const regions = (names: readonly string[]): ChartSpec => ({
    x: { type: "time", domain: [months[0] ?? 0, months.at(-1) ?? 0] },
    y: { format: "percent" },
    marks: [{ mark: "rule", y: 0.05, label: "Target" }],
    facets: {
      unit: { one: "region", other: "regions" },
      panels: names.map((name, k) => ({
        marks: [
          {
            mark: "line",
            x: months,
            series: [{ name, y: months.map((_, i) => 0.03 + 0.001 * i * (k + 1)) }],
          },
        ],
      })),
    },
  });
  const panelsOf = (b: Built) => [
    ...(get(b.figure, "plot")?.querySelectorAll<HTMLElement>('[data-part="panel"]') ?? []),
  ];
  const plotOf = (panel: HTMLElement) => panel.querySelector("svg") as SVGSVGElement;

  it("draws a grid of panels in the plot, each with its head and its own SVG", () => {
    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    const b = build({ width: 600 });
    start(regions(["North", "South", "East", "West"]), b);
    const plot = get(b.figure, "plot");
    expect(plot?.querySelector(':scope > [data-part="panels"]')).not.toBeNull();
    expect(plot?.querySelector(":scope > svg")).toBeNull();
    const panels = panelsOf(b);
    expect(panels.map((p) => p.querySelector('[data-part="name"]')?.textContent)).toEqual([
      "North",
      "South",
      "East",
      "West",
    ]);
    // Panels on one row start their plots at the same height, a column's at the same x.
    const tops = panels.map((p) => plotOf(p).getBoundingClientRect().top);
    expect(new Set(tops).size).toBe(1);
    const widths = panels.slice(1).map((p) => plotOf(p).getBoundingClientRect().width);
    expect(new Set(widths).size).toBe(1);
    // Only the first column writes y labels; every panel draws the target rule.
    expect(
      plotOf(panels[0] as HTMLElement).querySelector('[data-part="y"]')?.childElementCount,
    ).toBeGreaterThan(0);
    expect(
      plotOf(panels[1] as HTMLElement).querySelector('[data-part="y"]')?.childElementCount,
    ).toBe(0);
    expect(setAttribute.mock.calls.map((call) => call[0])).not.toContain("style");
  });

  it("keeps the grid inside the figure at a phone's width, in columns of the left-to-right order", async () => {
    const b = build({ width: 600 });
    start(regions(["North", "South", "East", "West", "Centre", "Coast"]), b);
    await resize(b, 288);
    const panels = panelsOf(b);
    const figure = b.figure.getBoundingClientRect();
    for (const p of panels) {
      const r = p.getBoundingClientRect();
      expect(r.left).toBeGreaterThanOrEqual(figure.left - 0.5);
      expect(r.right).toBeLessThanOrEqual(figure.right + 0.5);
    }
    const [first, second, third] = panels.map((p) => p.getBoundingClientRect());
    expect(second?.top).toBe(first?.top);
    expect(second?.left).toBeGreaterThan(first?.left ?? 0);
    expect(third?.top).toBeGreaterThan(first?.bottom ?? 0);
  });

  it("keeps left-to-right order in a right-to-left page", () => {
    const b = build({ width: 600 });
    b.figure.dir = "rtl";
    start(regions(["North", "South"]), b);
    const [first, second] = panelsOf(b).map((p) => p.getBoundingClientRect());
    expect(second?.left).toBeGreaterThan(first?.left ?? 0);
  });

  it("swaps the grid and the lone SVG as an update adds or drops facets, through loading", () => {
    const b = build();
    const chart = start(full, b);
    const svg = get(b.figure, "plot")?.querySelector(":scope > svg");
    chart.update(regions(["North", "South"]));
    expect(get(b.figure, "plot")?.querySelector(":scope > svg")).toBeNull();
    const panels = panelsOf(b);
    expect(panels).toHaveLength(2);
    chart.update(regions(["North", "South", "East"]));
    const grown = panelsOf(b);
    expect(grown).toHaveLength(3);
    expect(grown[0]).toBe(panels[0]);
    expect(grown[1]).toBe(panels[1]);
    chart.update(full);
    expect(get(b.figure, "plot")?.querySelector(":scope > svg")).toBe(svg);
    expect(get(b.figure, "plot")?.querySelector('[data-part="panels"]')).toBeNull();
    chart.loading();
    expect(get(b.figure, "plot")).toBeNull();
    chart.update(regions(["North"]));
    expect(panelsOf(b)).toHaveLength(1);
  });

  it("tears down to a static image per panel, each named by its label", () => {
    const b = build();
    start(regions(["North", "South"]), b);
    b.life.abort();
    expect(get(b.figure, "plot")?.hasAttribute("role")).toBe(false);
    const frames = panelsOf(b).map((p) => p.querySelector('[data-part="frame"]'));
    expect(frames.map((f) => f?.getAttribute("role"))).toEqual(["img", "img"]);
    expect(frames.map((f) => f?.getAttribute("aria-label")?.split(":")[0])).toEqual([
      "North",
      "South",
    ]);
  });

  it("lists every panel's numbered notes once under the grid, numbered on across the panels", async () => {
    const b = build({ width: 600 });
    const spec = regions(["North", "South", "East"]);
    const noted: ChartSpec = {
      ...spec,
      facets: {
        ...spec.facets,
        panels: (spec.facets?.panels ?? []).map((p, k) => ({
          marks: [
            ...p.marks,
            ...(k === 1
              ? []
              : [{ mark: "text" as const, x: months[3] ?? 0, y: 0.04, text: `Note ${String(k)}` }]),
          ],
        })),
      },
    };
    const chart = start(noted, b);
    const markers = () =>
      [...b.figure.querySelectorAll('svg [data-part="marker"] text')].map((t) => t.textContent);
    const listed = () =>
      [...(get(b.figure, "notes")?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
    expect(markers()).toEqual([]);
    expect(get(b.figure, "notes")).toBeNull();
    await resize(b, 288);
    expect(markers()).toEqual(["1", "2"]);
    expect(listed()).toEqual(["Note 0", "Note 2"]);
    expect(showing(b.figure)).toEqual(["legend", "plot", "notes", "table"]);
    chart.update(regions(["North", "South"]));
    expect(get(b.figure, "notes")).toBeNull();
  });

  // Coal and gas per country, in 15-minute buckets: a per-category form.
  const countries = (shape: "bars" | "area"): ChartSpec => ({
    ...full,
    facets: {
      panels: [
        ["Germany", 2],
        ["France", 1],
      ].map(([name, k]) => ({
        name: String(name),
        marks: [
          {
            mark: "rect",
            shape,
            x1: starts,
            x2: starts.map((s) => s + 15 * MIN),
            series: [
              { name: "Coal", y: starts.map(() => 2 * Number(k)) },
              { name: "Gas", y: starts.map(() => Number(k)) },
            ],
          },
        ],
      })),
    },
    marks: [],
  });
  const box = (svg: SVGSVGElement, part: string) =>
    (svg.querySelector(`[data-part="${part}"]`) as SVGGraphicsElement).getBBox();

  it.each(["bars", "area"] as const)(
    "draws column panels as %s on one y scale, each stack from the same baseline",
    (shape) => {
      const b = build({ width: 600 });
      start(countries(shape), b);
      const [germany, france] = panelsOf(b).map((p) => box(plotOf(p), "rect"));
      expect(
        panelsOf(b).map((p) => plotOf(p).querySelectorAll('[data-part="rect"] > path').length),
      ).toEqual([2, 2]);
      // Totals of 6 and 3 on one scale from 0: one stack twice the other's
      // height, less the 1 px gap between layers.
      expect(Math.abs((germany?.height ?? 0) - 2 * (france?.height ?? 0))).toBeLessThanOrEqual(2);
      expect(germany?.y).toBeLessThan(france?.y ?? 0);
      expect((germany?.y ?? 0) + (germany?.height ?? 0)).toBeCloseTo(
        (france?.y ?? 0) + (france?.height ?? 0),
        0,
      );
      // The shared x puts every bucket at the same place in each panel.
      expect(germany?.x).toBeCloseTo(france?.x ?? -1, 1);
      expect(germany?.width).toBeCloseTo(france?.width ?? -1, 1);
    },
  );

  it.each([
    ["line", "line"],
    ["area", "layers"],
  ] as const)(
    "draws no end labels in %s panels, so each plot reaches its panel's right edge",
    (mark, part) => {
      const series = [
        { name: "Gas", y: [3, 4, 5, 4] },
        { name: "Wind", y: [1, 2, 2, 3] },
      ];
      const lone: ChartSpec = {
        x: { type: "time", domain: [START, START + 45 * MIN] },
        marks: [{ mark, x: starts, series }],
      };
      const alone = build({ width: 600 });
      start(lone, alone);
      const svg = get(alone.figure, "plot")?.querySelector("svg") as SVGSVGElement;
      expect(svg.querySelectorAll('[data-part="end"] > text')).toHaveLength(2);
      const b = build({ width: 600 });
      start(
        {
          ...lone,
          marks: [],
          facets: {
            panels: ["North", "South"].map((name) => ({
              name,
              marks: [{ mark, x: starts, series }],
            })),
          },
        },
        b,
      );
      for (const p of panelsOf(b)) {
        const plot = plotOf(p);
        expect(plot.querySelectorAll('[data-part="end"] text')).toHaveLength(0);
        const drawn = box(plot, part);
        // The plot's own svg runs AREA_ROOM past the plot on each side.
        const area = plot.querySelector('[data-part="area"]') as SVGSVGElement;
        const [vx = 0, , vw = 0] = (plot.getAttribute("viewBox") ?? "").split(" ").map(Number);
        expect(area.x.baseVal.value + area.width.baseVal.value - AREA_ROOM).toBeCloseTo(vx + vw, 1);
        // The last sample sits at the domain's end, the plot's right edge.
        const plotW = area.width.baseVal.value - 2 * AREA_ROOM;
        expect(Math.abs(drawn.x + drawn.width - plotW)).toBeLessThanOrEqual(2);
      }
    },
  );

  // The same three sources per country: the per-category form of a bar panel.
  const mixes: ChartSpec = {
    marks: [],
    facets: {
      unit: { one: "country", other: "countries" },
      panels: [
        ["Germany", [26, 15, 31]],
        ["France", [1, 7, 9]],
        ["Spain", [2, 18, 24]],
      ].map(([name, x]) => ({
        name: String(name),
        marks: [
          {
            mark: "bar" as const,
            y: ["Coal", "Gas", "Wind"],
            series: [{ name: "Share", x: x as number[] }],
          },
        ],
      })),
    },
  };

  it("sets bar panels side by side, then in one column at a phone's width, each with its value labels", async () => {
    const b = build({ width: 600 });
    start(mixes, b);
    const lefts = () => panelsOf(b).map((p) => Math.round(p.getBoundingClientRect().left));
    expect(new Set(lefts()).size).toBe(3);
    await resize(b, 288);
    expect(new Set(lefts()).size).toBe(1);
    const figure = b.figure.getBoundingClientRect();
    for (const p of panelsOf(b)) {
      expect(p.getBoundingClientRect().right).toBeLessThanOrEqual(figure.right + 0.5);
      expect(plotOf(p).querySelectorAll('[data-part="value"] > text')).toHaveLength(3);
    }
  });

  it("draws a pie in each panel as wide as its plot, with no outside labels or leaders", () => {
    const slices = (k: number) => [
      { name: "Coal", value: 3 + k },
      { name: "Gas", value: 2 },
      { name: "Wind", value: 1 },
    ];
    const alone = build({ width: 600 });
    start({ marks: [{ mark: "pie", slices: slices(0) }] }, alone);
    const lone = get(alone.figure, "plot")?.querySelector("svg") as SVGSVGElement;
    expect(lone.querySelectorAll('[data-part="end"] > text').length).toBeGreaterThan(0);
    const b = build({ width: 600 });
    start(
      {
        marks: [],
        facets: {
          panels: [0, 1, 2].map((k) => ({
            name: String(2022 + k),
            marks: [{ mark: "pie" as const, slices: slices(k) }],
          })),
        },
      },
      b,
    );
    for (const p of panelsOf(b)) {
      const plot = plotOf(p);
      expect(plot.querySelectorAll('[data-part="end"] text')).toHaveLength(0);
      expect(plot.querySelector('[data-part="leader"]')).toBeNull();
      const area = plot.querySelector('[data-part="area"]') as SVGSVGElement;
      // Within a pixel: the arcs' bounds are the curves' own.
      expect(
        Math.abs(box(plot, "pie").width - (area.width.baseVal.value - 2 * AREA_ROOM)),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("keys heatmap panels once in the legend row and fills them by the chart's classes", () => {
    const b = build({ width: 600 });
    start(
      {
        marks: [],
        facets: {
          panels: [
            ["Low", 10],
            ["High", 100],
          ].map(([name, top]) => ({
            name: String(name),
            marks: [
              {
                mark: "cell" as const,
                x: ["Mon", "Tue"],
                y: ["Night"],
                values: [[0, Number(top)]],
              },
            ],
          })),
        },
      },
      b,
    );
    expect(get(b.figure, "legend")?.querySelectorAll('[data-part="key"]')).toHaveLength(1);
    const steps = panelsOf(b).map((p) =>
      [...plotOf(p).querySelectorAll('[data-part="cell"] > path[data-step]')].map((c) =>
        Number(c.getAttribute("data-step")),
      ),
    );
    // On one scale from 0 to 100, the low panel's 10 sits in a lower class
    // than the high panel's 100, which takes the top step.
    const [low = [], high = []] = steps;
    expect(Math.max(...low)).toBeLessThan(Math.max(...high));
    expect(Math.min(...low)).toBe(Math.min(...high));
  });

  it("gives the plot back its region and tab stop when an update drops the facets", () => {
    const b = build();
    const chart = start(regions(["North", "South"]), b);
    chart.update(full);
    const plot = get(b.figure, "plot");
    expect(plot?.getAttribute("role")).toBe("application");
    expect(plot?.tabIndex).toBe(0);
    expect(plot?.querySelector('[id$="-howto"]')?.textContent).toBe(
      "Arrow keys read the values. Tab leaves the chart.",
    );
  });
});

describe("instants at the calendar unit every x value falls on", () => {
  const TZ = "Europe/Paris";
  const HR = 3_600_000;
  // Paris is UTC+1 in winter and UTC+2 from late March to late October, so
  // the 1st of April to October is at 10 PM UTC the day before.
  const months = per(60, (i) => Date.UTC(2020, i, 1) - (i % 12 >= 3 && i % 12 <= 9 ? 2 : 1) * HR);
  const monthly: ChartSpec = {
    x: { type: "time", domain: [months[0] ?? 0, months[59] ?? 0] },
    y: { label: "Unemployment", format: "percent" },
    marks: [
      { mark: "line", x: months, series: [{ name: "North", y: per(60, (i) => 0.05 + i / 2000) }] },
    ],
  };
  const summary = (b: Built) =>
    b.figure.querySelector('figcaption > [data-part="summary"]')?.textContent ?? "";

  it("writes monthly samples as months, stepping every 1 month", () => {
    const b = build();
    start(monthly, b, { locale: "en", timeZone: TZ });
    expect(summary(b)).toMatch(/^Jan 2020 to Dec 2024, every 1\u00A0month\. North: last /u);
    expect(get(b.figure, "plot")?.getAttribute("aria-label")).toContain("Jan 2020 to Dec 2024");
    expect(get(b.figure, "legend")?.textContent).toContain("Dec 2024");
    expect(get(b.figure, "legend")?.textContent).not.toContain("12:00");
  });

  it("names each panel's range in months", () => {
    const b = build();
    const line = (name: string) => ({
      marks: [{ mark: "line" as const, x: months, series: [{ name, y: per(60, () => 0.05) }] }],
    });
    start({ ...monthly, marks: [], facets: { panels: [line("North"), line("South")] } }, b, {
      locale: "en",
      timeZone: TZ,
    });
    const frames = b.figure.querySelectorAll('[data-part="frame"]');
    expect(frames[1]?.getAttribute("aria-label")).toMatch(
      /^South: Line chart, .*Jan 2020 to Dec 2024$/u,
    );
  });

  it("writes daily buckets as dates across a clock change, the table keeping each instant", () => {
    // Midnights of 27 March to 3 April 2026: the 29th is 23 hours long.
    const days = per(8, (i) => Date.UTC(2026, 2, 27 + i) - (i < 3 ? 1 : 2) * HR);
    const b = build();
    start(
      {
        x: { type: "time" },
        y: { label: "Posts" },
        marks: [
          {
            mark: "rect",
            x1: days.slice(0, 7),
            x2: days.slice(1),
            series: [{ name: "Posts", y: per(7, (i) => i + 1) }],
          },
        ],
      },
      b,
      { locale: "en", timeZone: TZ },
    );
    expect(summary(b)).toMatch(
      /^28, every 1\u00A0day from Mar 27 to Apr 2\. Busiest: Apr 2, 7\.$/u,
    );
    b.toggle.click();
    const times = [...(get(b.figure, "table")?.querySelectorAll("tbody time") ?? [])];
    expect(times.slice(0, 3).map((t) => t.textContent)).toEqual(["Mar 27", "Mar 28", "Mar 29"]);
    expect(times[2]?.getAttribute("datetime")).toBe("2026-03-28T23:00:00.000Z");
  });

  it("writes yearly samples as years, stepping every 1 year", () => {
    const years = per(10, (i) => Date.UTC(2015 + i, 0, 1) - HR);
    const b = build();
    start(
      {
        x: { type: "time" },
        y: { label: "Members" },
        marks: [
          { mark: "line", x: years, series: [{ name: "Members", y: per(10, (i) => 100 + i) }] },
        ],
      },
      b,
      { locale: "en", timeZone: TZ },
    );
    expect(summary(b)).toMatch(/^2015 to 2024, every 1\u00A0year\. Members: last 109/u);
  });

  it("keeps the minute when one x value falls inside a day", () => {
    const b = build();
    const note = {
      mark: "text" as const,
      x: Date.UTC(2023, 1, 14, 13, 30),
      y: 0.06,
      text: "Strike",
    };
    start({ ...monthly, marks: [...monthly.marks, note] }, b, { locale: "en", timeZone: TZ });
    expect(summary(b)).toMatch(/^Jan 1, 2020, 12:00\sAM to Dec 1, 2024, 12:00\sAM\. /u);
  });
});
