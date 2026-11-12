import { afterEach, describe, expect, it } from "vitest";

import { renderSparkline } from "./sparkline.js";

afterEach(() => {
  document.body.replaceChildren();
});

function spark(lang = "en"): HTMLElement {
  const box = document.createElement("div");
  box.lang = lang;
  const el = document.createElement("span");
  el.className = "cp-sparkline";
  box.append(el);
  document.body.append(box);
  return el;
}

const svg = (el: HTMLElement) => el.querySelector("svg");
const d = (el: HTMLElement) => el.querySelector("path")?.getAttribute("d");
const dot = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-part="dot"]');
const last = (el: HTMLElement) => el.querySelector<HTMLDataElement>('data[data-part="last"]');

describe("renderSparkline", () => {
  it("spans the plot from the high at the top to the low at the bottom, one step per value", () => {
    const el = spark();
    renderSparkline(el, [4, 8, 6]);
    expect(svg(el)?.getAttribute("viewBox")).toBe("0 0 2 100");
    expect(svg(el)?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg(el)?.getAttribute("aria-hidden")).toBe("true");
    expect(d(el)).toBe("M0 100L1 0L2 50");
    expect(dot(el)?.style.insetInlineStart).toBe("100%");
    expect(dot(el)?.style.insetBlockStart).toBe("50%");
  });

  it("breaks the line at a gap, draws a lone value as a dot, and marks the last value that is not a gap", () => {
    const el = spark();
    renderSparkline(el, [1, null, 3, 5, Number.NaN, 2, null]);
    expect(d(el)).toBe("M0 100L0 100M2 50L3 0M5 75L5 75");
    expect(dot(el)?.style.insetInlineStart).toBe("83.33%");
    expect(dot(el)?.style.insetBlockStart).toBe("75%");
    expect(last(el)?.value).toBe("2");
    expect(el.getAttribute("aria-label")).toBe("Last 2, low 1, high 5");
  });

  it("is an image named by its range, last value, low and high, and writes its last value", () => {
    const el = spark();
    renderSparkline(el, [10, 4, 12, 10], { range: "Last 6 hours" });
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe("Last 6 hours: last 10, low 4, high 12");
    expect(last(el)?.textContent).toBe("10");
    expect(last(el)?.value).toBe("10");
  });

  it("writes its numbers in the page's language, or by the format it is given", () => {
    const el = spark("fr");
    renderSparkline(el, [1234.5, 2000]);
    expect(el.getAttribute("aria-label")).toBe(
      "Last 2\u202F000, low 1\u202F234,5, high 2\u202F000",
    );
    expect(last(el)?.textContent).toBe("2\u202F000");
    renderSparkline(el, [140, 142.25], { format: (n) => `${String(Math.round(n))}\u00A0ms` });
    expect(el.getAttribute("aria-label")).toBe(
      "Last 142\u00A0ms, low 140\u00A0ms, high 142\u00A0ms",
    );
    expect(last(el)?.value).toBe("142.25");
  });

  it("takes other words for the summary and for no data", () => {
    const el = spark();
    const words = {
      summary: (p: { range: string | undefined; last: string; low: string; high: string }) =>
        `${p.range ?? "-"} ${p.last} ${p.low} ${p.high}`,
      empty: (range: string | undefined) => `rien ${range ?? ""}`,
    };
    renderSparkline(el, [3, 1, 2], { range: "1 h", words });
    expect(el.getAttribute("aria-label")).toBe("1 h 2 1 3");
    renderSparkline(el, [], { range: "1 h", words });
    expect(el.getAttribute("aria-label")).toBe("rien 1 h");
  });

  it("draws a shared domain, a value past it at its edge, while the summary keeps the true values", () => {
    const el = spark();
    renderSparkline(el, [5, 10], { domain: [0, 20] });
    expect(d(el)).toBe("M0 75L1 50");
    renderSparkline(el, [-5, 15], { domain: [0, 10] });
    expect(d(el)).toBe("M0 100L1 0");
    expect(el.getAttribute("aria-label")).toBe("Last 15, low -5, high 15");
  });

  it("refuses a domain that is not a finite low to high", () => {
    const el = spark();
    for (const domain of [
      [3, 1],
      [Number.NaN, 1],
      [0, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => {
        renderSparkline(el, [1, 2], { domain });
      }).toThrow(RangeError);
    }
    renderSparkline(el, [1, 2], { domain: [4, 4] });
    expect(d(el)).toBe("M0 50L1 50");
  });

  it("reduces thousands of values per column, keeping each column's low and high", () => {
    const el = spark();
    const values = Array.from({ length: 4_320 }, (_, i) =>
      i === 2_000 ? 100 : i === 3_000 ? -100 : i % 7,
    );
    renderSparkline(el, values);
    const points = (d(el) ?? "").split(/[ML]/u).filter((p) => p !== "");
    expect(points.length).toBeLessThanOrEqual(4 * 512);
    expect(points.length).toBeGreaterThan(512);
    expect(points).toContain("2000 0");
    expect(points).toContain("3000 100");
    expect(points[0]).toBe("0 50");
    expect(points.at(-1)).toBe("4319 50");
  });

  it("draws a flat series across the middle and a single value as a dot at the end", () => {
    const el = spark();
    renderSparkline(el, [3, 3, 3]);
    expect(d(el)).toBe("M0 50L1 50L2 50");
    renderSparkline(el, [7]);
    expect(svg(el)?.getAttribute("viewBox")).toBe("0 0 1 100");
    expect(d(el)).toBe("M1 50L1 50");
    expect(dot(el)?.style.insetInlineStart).toBe("100%");
    expect(el.getAttribute("aria-label")).toBe("Last 7, low 7, high 7");
  });

  it("says no data, with no line, mark or value, when every value is a gap", () => {
    const el = spark();
    renderSparkline(el, [null, Number.NaN], { range: "Last hour" });
    expect(el.getAttribute("aria-label")).toBe("Last hour: no data");
    expect(svg(el)).not.toBeNull();
    expect(el.querySelector("path")).toBeNull();
    expect(dot(el)).toBeNull();
    expect(last(el)).toBeNull();
    renderSparkline(el, []);
    expect(el.getAttribute("aria-label")).toBe("No data");
  });

  it("leaves the value unwritten when told, and replaces what an earlier call drew", () => {
    const el = spark();
    renderSparkline(el, [1, 2]);
    const before = svg(el);
    renderSparkline(el, [2, 1], { last: false });
    expect(before?.isConnected).toBe(false);
    expect(el.querySelectorAll("svg")).toHaveLength(1);
    expect(last(el)).toBeNull();
    expect(el.getAttribute("aria-label")).toBe("Last 1, low 1, high 2");
  });
});
