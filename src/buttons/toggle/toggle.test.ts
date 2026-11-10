import { afterEach, describe, expect, it } from "vitest";

import { enhanceToggle } from "./toggle.js";

afterEach(() => {
  document.body.replaceChildren();
});

function pin(pressed?: "true" | "false"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "cp-button cp-toggle";
  b.dataset["kind"] = "pin";
  b.setAttribute("aria-label", "Pin");
  if (pressed !== undefined) {
    b.setAttribute("aria-pressed", pressed);
  }
  const off = document.createElement("span");
  off.className = "cp-icon";
  const on = document.createElement("span");
  on.className = "cp-icon";
  on.dataset["part"] = "on";
  b.append(off, on);
  document.body.append(b);
  return b;
}

describe("enhanceToggle", () => {
  it("flips aria-pressed on each press and reports the new state", () => {
    const b = pin("false");
    const seen: boolean[] = [];
    const t = enhanceToggle(b, { onChange: (on) => seen.push(on) });
    b.click();
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(t.on).toBe(true);
    b.click();
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(seen).toEqual([true, false]);
  });

  it("starts off without aria-pressed, and keeps a toggle that starts on", () => {
    const b = pin();
    expect(enhanceToggle(b).on).toBe(false);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(enhanceToggle(pin("true")).on).toBe(true);
  });

  it("marks the motion only on a press, never on a toggle that starts on", () => {
    const b = pin("true");
    enhanceToggle(b);
    expect(b.hasAttribute("data-cp-toggled")).toBe(false);
    b.click();
    expect(b.dataset["cpToggled"]).toBe("off");
    b.click();
    expect(b.dataset["cpToggled"]).toBe("on");
  });

  it("clears the motion once the drawing's animation ends", () => {
    const b = pin("false");
    enhanceToggle(b);
    b.click();
    b.querySelector(".cp-icon")?.dispatchEvent(
      new AnimationEvent("animationend", { bubbles: true }),
    );
    expect(b.hasAttribute("data-cp-toggled")).toBe(false);
  });

  it("sets the state without the motion", () => {
    const b = pin("false");
    const t = enhanceToggle(b);
    b.click();
    t.set(false);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.hasAttribute("data-cp-toggled")).toBe(false);
  });

  it("stops listening when its signal aborts", () => {
    const life = new AbortController();
    const b = pin("false");
    enhanceToggle(b, { signal: life.signal });
    life.abort();
    b.click();
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });
});
