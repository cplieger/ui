/**
 * data-figures.ts — the gallery wiring for the series colours, figures,
 * sparklines, meters, share bars and card links on the Data page.
 */

import { enhanceMeter } from "@cplieger/ui/meter";
import { enhanceShareBar } from "@cplieger/ui/share-bar";
import { renderSparkline, type SparklineOptions } from "@cplieger/ui/sparkline";

const root = document.documentElement;

// The rendered sRGB of an opaque CSS colour, read back through a canvas pixel.
function srgb(colour: string): [number, number, number] {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (ctx === null) {
    return [0, 0, 0];
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// WCAG 2.2 relative luminance.
function luminance(colour: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = srgb(colour).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Each cell names a surface by data-on; its row's swatch is the slot measured on it.
function measureSeries(table: HTMLTableElement): void {
  const probe = document.createElement("span");
  document.body.append(probe);
  for (const cell of table.querySelectorAll<HTMLElement>("td[data-on]")) {
    const swatch = cell.closest("tr")?.querySelector(".cp-swatch");
    if (swatch === null || swatch === undefined) {
      continue;
    }
    probe.style.color = `var(--cp-surface-${cell.dataset["on"] ?? "page"})`;
    const ratio = contrast(getComputedStyle(swatch).backgroundColor, getComputedStyle(probe).color);
    cell.textContent = `${ratio.toFixed(1)}:1`;
  }
  probe.remove();
}

for (const table of document.querySelectorAll<HTMLTableElement>("table[data-series-contrast]")) {
  measureSeries(table);
  // The theme and the accent's hue live on <html>; the slots follow both.
  new MutationObserver(() => {
    measureSeries(table);
  }).observe(root, { attributes: true, attributeFilter: ["data-theme", "style"] });
}

for (const share of document.querySelectorAll<HTMLElement>(".cp-share")) {
  const toggle = document.querySelector<HTMLButtonElement>(
    `[data-share-toggle="${CSS.escape(share.id)}"]`,
  );
  enhanceShareBar(share, toggle === null ? {} : { toggle });
}

// The demo moves twenty copies between the first two rows and back, and the
// bar follows the table it reads.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-share-grab]")) {
  const share = document.getElementById(button.dataset["shareGrab"] ?? "");
  const [best, unlisted] = share?.querySelectorAll("tbody data") ?? [];
  const meta = share?.closest("section")?.querySelector(".cp-meta a");
  if (!(best instanceof HTMLDataElement && unlisted instanceof HTMLDataElement)) {
    continue;
  }
  const move = (from: HTMLDataElement, to: HTMLDataElement): void => {
    for (const [d, n] of [
      [from, Number(from.value) - 20],
      [to, Number(to.value) + 20],
    ] as const) {
      d.value = String(n);
      d.textContent = String(n);
    }
  };
  let grabbed = false;
  button.addEventListener("click", () => {
    if (grabbed) {
      move(best, unlisted);
    } else {
      move(unlisted, best);
    }
    grabbed = !grabbed;
    button.textContent = grabbed ? "Put them back" : "Grab 20 upgrades";
    if (meta !== null && meta !== undefined) {
      meta.textContent = `${String(Math.round((Number(best.value) / 659) * 100))}% on the best`;
    }
  });
}

// A seeded walk, so every capture of the page draws the same lines.
function walk(seed: number): (from: number, step: number, lo: number, hi: number) => number {
  let state = seed;
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return (from, step, lo, hi) => Math.min(hi, Math.max(lo, from + (next() - 0.5) * 2 * step));
}

const MINUTES = 360;
const RESTART = 110;
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const unit = (u: string) => (n: number) => `${whole.format(n)}\u00A0${u}`;
const series = [
  { name: "live", start: 8, step: 0.3, lo: 4, hi: 12, whole: true, domain: [0, 12] },
  { name: "active", start: 5, step: 0.3, lo: 0, hi: 9, whole: true, domain: [0, 12] },
  { name: "requests", start: 110, step: 3, lo: 60, hi: 180, whole: true },
  { name: "latency", start: 140, step: 2.5, lo: 110, hi: 260, whole: false, format: unit("ms") },
  { name: "memory", start: 150, step: 0.8, lo: 140, hi: 260, whole: true, format: unit("MB") },
] as const;

// A sparkline in a figure leaves its last value to the figure's number.
function draw(
  host: HTMLElement,
  values: readonly (number | null)[],
  options: SparklineOptions,
): void {
  const number = host.closest(".cp-figure")?.querySelector('[data-part="value"] data');
  if (!(number instanceof HTMLDataElement)) {
    renderSparkline(host, values, options);
    return;
  }
  renderSparkline(host, values, { ...options, last: false });
  const last = values.findLast((v) => v !== null);
  number.value = String(last ?? "");
  number.textContent = last === undefined ? "" : (options.format ?? ((n) => whole.format(n)))(last);
}

const sparks = series.flatMap((s, i) => {
  const hosts = document.querySelectorAll<HTMLElement>(`[data-spark="${s.name}"]`);
  if (hosts.length === 0) {
    return [];
  }
  const move = walk(i + 7);
  let v: number = s.start;
  const sample = (): number => {
    v = move(v, s.step, s.lo, s.hi);
    return s.whole ? Math.round(v) : v;
  };
  const values: (number | null)[] = Array.from({ length: MINUTES }, () => sample());
  if (s.name === "memory") {
    // Gauges reset on a restart, so the minutes before it have no sample.
    values.fill(null, 0, RESTART);
  }
  const options: SparklineOptions = {
    range: "Last 6 hours",
    ...("domain" in s ? { domain: s.domain } : {}),
    ...("format" in s ? { format: s.format } : {}),
  };
  const drawAll = (): void => {
    for (const host of hosts) {
      draw(host, values, options);
    }
  };
  const tick = (): void => {
    values.shift();
    values.push(sample());
    drawAll();
  };
  drawAll();
  return [tick];
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-spark-tick]")) {
  button.addEventListener("click", () => {
    for (const tick of sparks) {
      tick();
    }
  });
}

// A figure that is a button shows or hides the events behind its count.
for (const figure of document.querySelectorAll<HTMLButtonElement>(
  "button.cp-figure[aria-controls]",
)) {
  const list = document.getElementById(figure.getAttribute("aria-controls") ?? "");
  if (list === null) {
    continue;
  }
  figure.addEventListener("click", () => {
    const open = figure.getAttribute("aria-expanded") !== "true";
    figure.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
  });
}

// The demo turns a count from 0 to 1 and back: neutral at 0, warning with a count.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-figure-refuse]")) {
  const name = CSS.escape(button.dataset["figureRefuse"] ?? "");
  const figure = document.querySelector<HTMLElement>(`[data-figure-count="${name}"]`);
  const number = figure?.querySelector('[data-part="value"] data');
  const empty = document.querySelector<HTMLElement>(`[data-figure-empty="${name}"]`);
  const table = document.querySelector<HTMLElement>(`[data-figure-list="${name}"]`);
  const panel = table?.closest(".cp-panel");
  if (!(number instanceof HTMLDataElement) || empty === null || table === null || !panel) {
    continue;
  }
  button.addEventListener("click", () => {
    const count = number.value === "0" ? 1 : 0;
    number.value = String(count);
    number.textContent = String(count);
    figure?.setAttribute("data-tone", count === 0 ? "neutral" : "warning");
    empty.hidden = count !== 0;
    table.hidden = count === 0;
    panel.toggleAttribute("data-flush", count !== 0);
    button.textContent = count === 0 ? "Refuse a post" : "Clear the refusal";
  });
}

for (const meter of document.querySelectorAll<HTMLElement>(".cp-meter")) {
  enhanceMeter(meter);
}

// The demo moves a store's use and writes its words, which name the mark it passed.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-meter-step]")) {
  const meter = document.getElementById(button.dataset["meterStep"] ?? "");
  const host = meter?.closest<HTMLElement>(".cp-meter");
  const words = host?.querySelector('[data-part="words"]');
  if (!(meter instanceof HTMLMeterElement) || !host || !words) {
    continue;
  }
  const unit = host.dataset["meterUnit"] ?? "";
  button.addEventListener("click", () => {
    const value = Math.min(
      Math.max(meter.value + Number(button.dataset["by"]), meter.min),
      meter.max,
    );
    const of = `${String(value)}\u00A0${unit} of ${String(meter.max)}\u00A0${unit}`;
    const passed = value > meter.high ? 90 : value >= meter.low ? 80 : 0;
    meter.value = value;
    meter.textContent = of;
    words.textContent = passed === 0 ? of : `${of}, past the ${String(passed)}% mark`;
  });
}
