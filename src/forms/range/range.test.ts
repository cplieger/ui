import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceRange } from "./range.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function row(value = "12"): { range: HTMLInputElement; output: HTMLOutputElement; r: HTMLElement } {
  const r = document.createElement("div");
  r.className = "cp-range-row";
  r.style.inlineSize = "300px";
  const range = document.createElement("input");
  range.type = "range";
  range.className = "cp-range";
  range.min = "0";
  range.max = "50";
  range.value = value;
  range.setAttribute("aria-label", "Minimum seeders");
  const output = document.createElement("output");
  r.append(range, output);
  document.body.append(r);
  return { range, output, r };
}

describe("enhanceRange", () => {
  it("fills the track to the thumb and writes the value, in the caller's words", async () => {
    const { range, output } = row("10");
    enhanceRange(range, { output, format: (v) => `${String(v)} seeders`, signal: life.signal });
    expect(range.style.getPropertyValue("--cp-range-fill")).toBe("20%");
    expect(output.value).toBe("10 seeders");
    range.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect([output.value, range.style.getPropertyValue("--cp-range-fill")]).toEqual([
      "11 seeders",
      "22%",
    ]);
  });

  it("shows the value over the thumb while a pointer holds it", async () => {
    const { range, r } = row("25");
    enhanceRange(range, { signal: life.signal });
    const tip = r.querySelector(".cp-range-tip") as HTMLElement;
    expect(tip.textContent).toBe("25");
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(r.hasAttribute("data-cp-held")).toBe(true);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(r.hasAttribute("data-cp-held")).toBe(false);
  });

  it("removes its tip once its signal aborts", () => {
    const { range, r } = row();
    enhanceRange(range, { signal: life.signal });
    life.abort();
    expect(r.querySelector(".cp-range-tip")).toBeNull();
  });
});
