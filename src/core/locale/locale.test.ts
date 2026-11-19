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

  // HTML reads an invalid lang as an unknown language, never an error.
  it("reads a lang that is not a BCP 47 tag as none, and writes a valid one canonically", () => {
    const el = document.createElement("span");
    document.body.append(el);
    el.lang = "en_US";
    expect(localeOf(el)).toBeUndefined();
    el.lang = "EN-us";
    expect(localeOf(el)).toBe("en-US");
  });
});
