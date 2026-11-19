import { expect, it, onTestFinished } from "vitest";
import { cdp, server } from "vitest/browser";

import { build, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the test that needs it.
it.skipIf(server.browser !== "chromium")(
  "draws the mark between levels in CanvasText in forced colours",
  async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    onTestFinished(async () => {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });
    const nav = build(
      '<nav class="cp-crumbs"><a href="#">Library</a><a href="#">Frieren</a><span aria-current="page">Season 1</span></nav>',
    ).firstElementChild as Element;
    const marks = [...nav.children].map((n) => getComputedStyle(n, "::before").backgroundColor);
    expect(marks.slice(1)).toEqual([resolved("CanvasText"), resolved("CanvasText")]);
  },
);

/** How far a press reaches `a` from its centre, sampled every quarter pixel
 *  along each axis: [width, height]. */
function pressSize(a: HTMLElement): [number, number] {
  const b = a.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const reach = (dx: number, dy: number): number => {
    let d = 0;
    while (
      d < 80 &&
      a.contains(document.elementFromPoint(x + dx * (d + 0.25), y + dy * (d + 0.25)))
    ) {
      d += 0.25;
    }
    return d;
  };
  return [reach(-1, 0) + reach(1, 0) + 0.25, reach(0, -1) + reach(0, 1) + 0.25];
}

it.each([
  ["fine", 24],
  ["coarse", 44],
])("makes each level a %s target of %ipx, its line wrapped or not", (tier, min) => {
  const el = build(
    '<div style="padding: 4rem; inline-size: 9rem"><nav class="cp-crumbs"><a href="#">TV</a><a href="#">Library</a><a href="#">Frieren</a><a href="#">Season 1</a><span aria-current="page">Episode 7</span></nav><p>Under the trail.</p></div>',
  );
  document.documentElement.setAttribute("data-pointer", tier);
  const links = [...el.querySelectorAll<HTMLElement>(".cp-crumbs a")];
  const lines = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
  expect(lines.size).toBeGreaterThan(1);
  for (const a of links) {
    const [w, h] = pressSize(a);
    expect(w, a.textContent).toBeGreaterThanOrEqual(min - 0.5);
    expect(h, a.textContent).toBeGreaterThanOrEqual(min - 0.5);
  }
});
