import { afterEach, describe, expect, it } from "vitest";

import { fontMeasure, forgetMeasures } from "./measure.js";

let host: HTMLElement | undefined;

afterEach(() => {
  host?.remove();
  host = undefined;
  forgetMeasures();
});

function make(css: Partial<CSSStyleDeclaration>): HTMLElement {
  host = document.createElement("div");
  Object.assign(host.style, css);
  document.body.append(host);
  return host;
}

describe("fontMeasure", () => {
  it("measures every digit at one width, at least the widest proportional digit", () => {
    const el = make({ font: "16px serif" });
    const m = fontMeasure(el, "en");
    expect(m.number("1111")).toBe(m.number("8888"));
    expect(m.number("1111")).toBeGreaterThanOrEqual(m.text("1111"));
    expect(m.number("8888")).toBeGreaterThanOrEqual(m.text("8888"));
    expect(m.text("posts")).toBeGreaterThan(0);
  });

  it("reads the tabular advance from a probe it removes, and caches per font and locale", () => {
    const el = make({ font: "13px sans-serif" });
    const m = fontMeasure(el, "en");
    expect(el.childNodes).toHaveLength(0);
    expect(fontMeasure(el, "en")).toBe(m);
    expect(fontMeasure(el, "ar-EG")).not.toBe(m);
    el.style.fontSize = "26px";
    const big = fontMeasure(el, "en");
    expect(big).not.toBe(m);
    expect(big.text("posts")).toBeGreaterThan(m.text("posts") * 1.5);
    forgetMeasures();
    el.style.fontSize = "13px";
    expect(fontMeasure(el, "en")).not.toBe(m);
  });

  it("measures in the element's own font", () => {
    const narrow = fontMeasure(make({ font: "13px monospace" }), "en");
    expect(narrow.text("iiii")).toBe(narrow.text("MMMM"));
  });
});
