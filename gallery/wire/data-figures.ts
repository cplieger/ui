/**
 * data-figures.ts — the gallery wiring for the series colours, figures,
 * sparklines, meters, share bars and card links on the Data page.
 */

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
