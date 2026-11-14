import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceSelectAll } from "./checkbox.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function group(states: readonly ("on" | "off" | "locked")[]): {
  all: HTMLInputElement;
  boxes: HTMLInputElement[];
} {
  const box = (): HTMLInputElement => {
    const b = document.createElement("input");
    b.type = "checkbox";
    b.className = "cp-checkbox";
    return b;
  };
  const all = box();
  all.setAttribute("aria-label", "All of these");
  const boxes = states.map((s) => {
    const b = box();
    b.checked = s === "on";
    b.disabled = s === "locked";
    return b;
  });
  document.body.append(all, ...boxes);
  return { all, boxes };
}

describe("enhanceSelectAll", () => {
  it("shows empty, a dash or checked as none, some or all of the group are on", async () => {
    const { all, boxes } = group(["off", "off"]);
    enhanceSelectAll(all, () => boxes, { signal: life.signal });
    expect([all.checked, all.indeterminate]).toEqual([false, false]);
    await userEvent.click(boxes[0] as HTMLInputElement);
    expect([all.checked, all.indeterminate]).toEqual([false, true]);
    await userEvent.click(boxes[1] as HTMLInputElement);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
  });

  it("checks and clears every box that can change, tells each one, and leaves a disabled one", async () => {
    const { all, boxes } = group(["on", "off", "locked"]);
    const told: number[] = [];
    for (const [i, b] of boxes.entries()) {
      b.addEventListener("change", () => told.push(i));
    }
    enhanceSelectAll(all, () => boxes, { signal: life.signal });
    expect(all.indeterminate).toBe(true);
    await userEvent.click(all);
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
    expect(told).toEqual([1]);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
    await userEvent.click(all);
    expect(boxes.map((b) => b.checked)).toEqual([false, false, false]);
    expect(all.checked).toBe(false);
  });

  it("checks every box of a group of several in one press", async () => {
    const { all, boxes } = group(["off", "off", "off"]);
    const told: number[] = [];
    for (const [i, b] of boxes.entries()) {
      b.addEventListener("change", () => told.push(i));
    }
    enhanceSelectAll(all, () => boxes, { signal: life.signal });
    await userEvent.click(all);
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
    expect(told).toEqual([0, 1, 2]);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
  });

  it("reads the group at each change, and syncs on request after code changes it", async () => {
    const { all, boxes } = group(["on"]);
    const sync = enhanceSelectAll(all, () => boxes, { signal: life.signal });
    expect(all.checked).toBe(true);
    const late = document.createElement("input");
    late.type = "checkbox";
    document.body.append(late);
    boxes.push(late);
    sync();
    expect(all.indeterminate).toBe(true);
    (boxes[0] as HTMLInputElement).checked = false;
    late.checked = false;
    sync();
    expect([all.checked, all.indeterminate]).toEqual([false, false]);
  });

  it("follows a box's press in a shadow root", async () => {
    const { all, boxes } = group(["off", "off"]);
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).append(all, ...boxes);
    enhanceSelectAll(all, () => boxes, { signal: life.signal });
    await userEvent.click(boxes[0] as HTMLInputElement);
    expect([all.checked, all.indeterminate]).toEqual([false, true]);
  });

  it("stops once its signal aborts", async () => {
    const { all, boxes } = group(["off", "off"]);
    enhanceSelectAll(all, () => boxes, { signal: life.signal });
    life.abort();
    await userEvent.click(all);
    expect(boxes.map((b) => b.checked)).toEqual([false, false]);
  });
});
