import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhancePill } from "./pill.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const frames = (n = 3) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });

function segmented(checked: number | null = 1): { group: HTMLElement; labels: HTMLLabelElement[] } {
  const group = document.createElement("div");
  group.className = "cp-segmented";
  group.style.display = "inline-flex";
  group.style.gap = "4px";
  const labels = ["System", "Light", "Dark"].map((word, i) => {
    const label = document.createElement("label");
    label.style.padding = `0 ${String(8 + i * 6)}px`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "theme";
    input.checked = i === checked;
    label.append(input, word);
    group.append(label);
    return label;
  });
  document.body.append(group);
  return { group, labels };
}

const pillOf = (group: HTMLElement) => group.querySelector(":scope > .cp-pill") as HTMLElement;
const at = (pill: HTMLElement) =>
  ["x", "y", "w", "h"].map((k) => pill.style.getPropertyValue(`--cp-pill-${k}`));
const box = (l: HTMLElement) =>
  [l.offsetLeft, l.offsetTop, l.offsetWidth, l.offsetHeight].map((n) => `${String(n)}px`);

describe("enhancePill", () => {
  it("puts one hidden-from-readers pill under the chosen segment, landing without motion", async () => {
    const { group, labels } = segmented(1);
    enhancePill(group, { signal: life.signal });
    const pill = pillOf(group);
    expect(pill.getAttribute("aria-hidden")).toBe("true");
    expect(at(pill)).toEqual(box(labels[1] as HTMLElement));
    expect(pill.hasAttribute("data-cp-still")).toBe(true);
    // The resize observer's first call lands it still once more.
    await frames(6);
    expect(pill.hasAttribute("data-cp-still")).toBe(false);
  });

  it("slides to a new choice", async () => {
    const { group, labels } = segmented(1);
    enhancePill(group, { signal: life.signal });
    await frames();
    await userEvent.click(labels[2] as HTMLElement);
    const pill = pillOf(group);
    expect(at(pill)).toEqual(box(labels[2] as HTMLElement));
    expect(pill.hasAttribute("data-cp-still")).toBe(false);
  });

  it("hides the pill while nothing is chosen", () => {
    const { group } = segmented(null);
    enhancePill(group, { signal: life.signal });
    expect(pillOf(group).hidden).toBe(true);
  });

  it("adds the pill once however often it is called", () => {
    const { group } = segmented();
    enhancePill(group, { signal: life.signal });
    enhancePill(group, { signal: life.signal });
    expect(group.querySelectorAll(".cp-pill")).toHaveLength(1);
  });

  it("removes the pill when its signal aborts, and adds none under one already aborted", () => {
    const { group } = segmented();
    enhancePill(group, { signal: life.signal });
    life.abort();
    expect(pillOf(group)).toBeNull();
    enhancePill(group, { signal: AbortSignal.abort() });
    expect(pillOf(group)).toBeNull();
  });
});
