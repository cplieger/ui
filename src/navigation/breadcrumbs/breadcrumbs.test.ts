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
