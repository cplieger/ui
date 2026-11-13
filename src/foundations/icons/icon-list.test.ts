import { describe, expect, it, onTestFinished } from "vitest";

import {
  build,
  drawing,
  maskUrl,
  q,
  shipped,
  useSystemSheet,
} from "../../system/test-helpers/css.js";
import { createIcons } from "./icons.js";

useSystemSheet();

describe("the icon list", () => {
  it.each(["circle-check", "circle-x", "triangle-alert", "spinner-arc", "x"])(
    "paints %s from its shipped file on a page that runs no script",
    async (name) => {
      const host = build(`<span class="cp-icon" data-cp-icon="${name}" aria-hidden="true"></span>`);
      const file = await shipped(name);
      expect(file).toContain("<svg");
      expect(await drawing(maskUrl(q(host, ".cp-icon")))).toBe(file);
    },
  );

  it("paints nothing for a name it does not draw", () => {
    const host = build(
      '<span class="cp-icon" data-cp-icon="not-a-glyph" aria-hidden="true"></span>',
    );
    expect(getComputedStyle(q(host, ".cp-icon")).maskImage).toBe("none");
  });

  it("gives way to the URL createIcons sets", () => {
    const host = build("");
    host.append(createIcons({ url: () => "/elsewhere/check.svg" }).icon("check"));
    expect(new URL(maskUrl(q(host, ".cp-icon"))).pathname).toBe("/elsewhere/check.svg");
  });

  it("gives way to an app's own rule for the same name, loaded after it", () => {
    const style = document.createElement("style");
    style.textContent = '[data-cp-icon="check"] { --cp-icon-image: url("/mine/check.svg"); }';
    document.head.append(style);
    onTestFinished(() => {
      style.remove();
    });
    const host = build('<span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>');
    expect(new URL(maskUrl(q(host, ".cp-icon"))).pathname).toBe("/mine/check.svg");
  });
});
