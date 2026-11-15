import { expect, it, onTestFinished } from "vitest";
import { cdp, server } from "vitest/browser";

import { build, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const root = document.documentElement;
const SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentcolor" d="M4 4h16v16H4z"/></svg>';
const IMG = (scheme: string) =>
  `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'/%3E" alt="" data-cp-scheme="${scheme}">`;
const PAIR = `<span class="cp-mark">${IMG("light")}${IMG("dark")}</span>`;
const header = (mark: string) =>
  `<header class="cp-header"><a class="cp-wordmark" href="#">${mark}<span class="cp-hidden-narrow">Release tracker</span></a></header>`;
const gate = (mark: string) =>
  `<main class="cp-gate"><div class="cp-wordmark">${mark}Release tracker</div></main>`;

/** Which of a mark's light and dark images shows. */
const shown = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLImageElement>("img[data-cp-scheme]")]
    .filter((img) => getComputedStyle(img).display !== "none")
    .map((img) => img.dataset["cpScheme"]);

const size = (el: Element) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.width), Math.round(r.height)];
};

it("keeps the letter's fill when the mark holds a letter", () => {
  const mark = q(build(header('<span class="cp-mark" aria-hidden="true">R</span>')), ".cp-mark");
  expect(getComputedStyle(mark).backgroundColor).toBe(resolved("var(--cp-shell-ink)"));
});

it.each(["light", "dark"] as const)(
  "draws an inline svg in the shell's ink in the header, with no fill, in %s",
  (theme) => {
    const host = build(header(`<span class="cp-mark">${SVG}</span>`), theme);
    const mark = q(host, ".cp-mark");
    expect(getComputedStyle(mark).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(q(host, "svg")).color).toBe(resolved("var(--cp-shell-ink)"));
    expect(size(q(host, "svg"))).toEqual([24, 24]);
  },
);

it.each(["light", "dark"] as const)(
  "draws an inline svg on a gate page in the name's ink, at the gate's size, in %s",
  (theme) => {
    const host = build(gate(`<span class="cp-mark">${SVG}</span>`), theme);
    expect(getComputedStyle(q(host, ".cp-mark")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(q(host, "svg")).color).toBe(
      getComputedStyle(q(host, ".cp-wordmark")).color,
    );
    expect(size(q(host, "svg"))).toEqual([36, 36]);
  },
);

it("fits an image to the mark's box at the image's own aspect ratio", () => {
  const host = build(header(`<span class="cp-mark">${IMG("light")}</span>`));
  const img = q(host, "img");
  expect(size(img)).toEqual([24, 24]);
  expect(getComputedStyle(img).objectFit).toBe("contain");
});

it.each(["light", "dark"] as const)(
  "shows a single image with no scheme at the mark's size in the header and on a gate, in %s",
  (theme) => {
    const single = `<span class="cp-mark">${IMG("light").replace(' data-cp-scheme="light"', "")}</span>`;
    const inHeader = q(build(header(single), theme), "img");
    expect(getComputedStyle(inHeader).display).not.toBe("none");
    expect(size(inHeader)).toEqual([24, 24]);
    const onGate = q(build(gate(single), theme), "img");
    expect(getComputedStyle(onGate).display).not.toBe("none");
    expect(size(onGate)).toEqual([36, 36]);
  },
);

it.each(["light", "dark"] as const)("shows only the image pinned by data-theme=%s", (theme) => {
  expect(shown(build(header(PAIR), theme))).toEqual([theme]);
});

it("follows the nearest pin when a pinned part sits in a page pinned the other way", () => {
  const host = build(`<section class="cp" data-theme="dark">${gate(PAIR)}</section>`, "light");
  expect(shown(host)).toEqual(["dark"]);
  const back = build(`<section class="cp" data-theme="light">${gate(PAIR)}</section>`, "dark");
  expect(shown(back)).toEqual(["light"]);
  const deep = build(
    `<section class="cp" data-theme="dark"><div class="cp" data-theme="light">${gate(PAIR)}</div></section>`,
    "light",
  );
  expect(shown(deep)).toEqual(["light"]);
});

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the test that needs it.
it.skipIf(server.browser !== "chromium").each(["light", "dark"] as const)(
  "follows the system's %s scheme on a page with no pin",
  async (scheme) => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
    onTestFinished(async () => {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });
    const host = build(header(PAIR));
    root.removeAttribute("data-theme");
    expect(shown(host)).toEqual([scheme]);
  },
);
