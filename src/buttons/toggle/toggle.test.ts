import { afterEach, describe, expect, it } from "vitest";

import { enhanceToggle, enhanceToggleGroup } from "./toggle.js";

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

function views(pressed = 0): { group: HTMLElement; buttons: HTMLButtonElement[] } {
  const group = document.createElement("div");
  group.className = "cp-toggle-group";
  group.setAttribute("role", "group");
  const buttons = ["List", "Grid", "Compact"].map((name, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cp-button";
    b.setAttribute("aria-label", name);
    b.setAttribute("aria-pressed", String(i === pressed));
    group.append(b);
    return b;
  });
  document.body.append(group);
  return { group, buttons };
}

describe("enhanceToggleGroup", () => {
  it("presses the one pressed and lets go of the others, reporting it", () => {
    const { group, buttons } = views(0);
    const seen: string[] = [];
    const g = enhanceToggleGroup(group, { onChange: (b) => seen.push(b.ariaLabel ?? "") });
    buttons[2]?.click();
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
    expect(g.pressed).toBe(buttons[2]);
    expect(seen).toEqual(["Compact"]);
  });

  it("keeps the pressed one pressed on a second press, without a change", () => {
    const { group, buttons } = views(1);
    const seen: HTMLButtonElement[] = [];
    enhanceToggleGroup(group, { onChange: (b) => seen.push(b) });
    buttons[1]?.click();
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(seen).toEqual([]);
  });

  it("sets the choice without onChange, and reads none while none is pressed", () => {
    const { group, buttons } = views(-1);
    const seen: HTMLButtonElement[] = [];
    const g = enhanceToggleGroup(group, { onChange: (b) => seen.push(b) });
    expect(g.pressed).toBeNull();
    g.set(buttons[1] as HTMLButtonElement);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(seen).toEqual([]);
  });

  it("ignores a button without aria-pressed, and stops when its signal aborts", () => {
    const { group, buttons } = views(0);
    const other = document.createElement("button");
    group.append(other);
    const life = new AbortController();
    enhanceToggleGroup(group, { signal: life.signal });
    other.click();
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    life.abort();
    buttons[1]?.click();
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
  });
});
