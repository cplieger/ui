import { afterAll, afterEach, beforeAll } from "vitest";

const root = document.documentElement;
const hosts: HTMLElement[] = [];

/** Links `css/system.css` once for the calling test file, the way an app's
 *  page links it, and after each test removes what `build` added and resets
 *  the theme and pointer. Call it at the file's top level. Linking per test
 *  instead times hooks out under three engines' load. */
export function useSystemSheet(): void {
  let sheet: HTMLLinkElement | undefined;
  beforeAll(async () => {
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = new URL("../../../css/system.css", import.meta.url).href;
    const loaded = new Promise((resolve, reject) => {
      el.addEventListener("load", resolve, { once: true });
      el.addEventListener("error", reject, { once: true });
    });
    document.head.append(el);
    await loaded;
    sheet = el;
  });
  afterEach(() => {
    for (const h of hosts.splice(0)) {
      h.remove();
    }
    root.removeAttribute("data-theme");
    root.removeAttribute("data-pointer");
  });
  afterAll(() => {
    sheet?.remove();
    root.classList.remove("cp");
  });
}

/** Puts static test markup in a fresh host under `.cp` in `theme`. */
export function build(markup: string, theme: "light" | "dark" = "light"): HTMLElement {
  root.classList.add("cp");
  root.setAttribute("data-theme", theme);
  const el = document.createElement("div");
  document.body.append(el);
  hosts.push(el);
  // Static test markup, never caller text.
  el.setHTMLUnsafe(markup);
  return el;
}

/** The first match of `selector` in `el`, failing the test when there is none. */
export function q(el: ParentNode, selector: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

/** The URL the mask of `el`, or of its `pseudo`-element, paints. */
export function maskUrl(el: Element, pseudo?: string): string {
  const image = getComputedStyle(el, pseudo).maskImage;
  return /^url\("?([^")]+)"?\)$/.exec(image)?.[1] ?? image;
}

/** The drawing at `url` in the form the dev server inlines a small asset as
 *  a data URL: single quotes, no space between tags. */
export async function drawing(url: string | URL): Promise<string> {
  const text = await (await fetch(url)).text();
  return text.replaceAll('"', "'").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

/** The drawing of the shipped glyph `name`, in the same form. */
export function shipped(name: string): Promise<string> {
  return drawing(new URL(`../../../icons/svg/${name}.svg`, import.meta.url));
}

/** A colour as the page resolves it, such as `var(--cp-warning-11)`. */
export function resolved(colour: string): string {
  const el = document.createElement("span");
  el.style.color = colour;
  document.body.append(el);
  hosts.push(el);
  return getComputedStyle(el).color;
}

// The rendered sRGB of an opaque CSS colour, read back through a canvas pixel;
// a transparent one (an unresolved token) throws instead of reading as black.
function rgb(colour: string): [number, number, number] {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  if (a !== 255) {
    throw new Error(`${colour} is not opaque`);
  }
  return [r, g, b];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The WCAG 2.2 contrast ratio of two opaque colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
