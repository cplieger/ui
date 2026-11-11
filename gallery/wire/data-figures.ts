/**
 * data-figures.ts — the gallery wiring for the series colours, figures,
 * sparklines, meters, share bars and card links on the Data page.
 */

import { enhanceShareBar } from "@cplieger/ui/share-bar";

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
