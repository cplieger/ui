import { afterEach, describe, expect, it } from "vitest";

import { localeOf } from "./locale.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("localeOf", () => {
  it("reads the nearest lang, itself first, and gives undefined for none or an empty one", () => {
    const outer = document.createElement("div");
    outer.lang = "fr";
    const inner = document.createElement("span");
    outer.append(inner);
    document.body.append(outer);
    expect(localeOf(inner)).toBe("fr");
    inner.lang = "de-CH";
    expect(localeOf(inner)).toBe("de-CH");
    inner.lang = "";
    expect(localeOf(inner)).toBeUndefined();
    const loose = document.createElement("span");
    expect(localeOf(loose)).toBeUndefined();
  });
});
