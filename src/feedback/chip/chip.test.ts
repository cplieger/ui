import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { flashChip } from "./chip.js";

// The stylesheet's two animations, named as css/system names them, so the
// test needs no css/system.
const CSS = `
.cp-chip[data-cp-flash] { animation: cp-chip-flash 10s linear, cp-chip-pop 10s linear; }
@keyframes cp-chip-flash { 0%, 18% { background: black; } }
@keyframes cp-chip-pop { 18% { scale: 1.1; } }
`;

let style: HTMLStyleElement;

beforeEach(() => {
  style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
});

afterEach(() => {
  style.remove();
  document.body.replaceChildren();
});

function chip(): HTMLElement {
  const el = document.createElement("span");
  el.className = "cp-chip";
  el.textContent = "Up";
  document.body.append(el);
  return el;
}

const flashes = (el: HTMLElement) =>
  el.getAnimations().filter((a): a is CSSAnimation => a instanceof CSSAnimation);

// The flash's own promise chain settles a task after its animations do.
const settled = () => new Promise((resolve) => setTimeout(resolve));

describe("flashChip", () => {
  it("runs both animations and clears its attribute once they end", async () => {
    const el = chip();
    flashChip(el);
    expect(el.hasAttribute("data-cp-flash")).toBe(true);
    const running = flashes(el);
    expect(running.map((a) => a.animationName).sort()).toEqual(["cp-chip-flash", "cp-chip-pop"]);
    running[0]?.finish();
    await settled();
    expect(el.hasAttribute("data-cp-flash")).toBe(true);
    running[1]?.finish();
    await settled();
    expect(el.hasAttribute("data-cp-flash")).toBe(false);
  });

  it("starts a flash in progress again from its solid", () => {
    const el = chip();
    flashChip(el);
    const [flash, pop] = flashes(el);
    for (const a of [flash, pop]) {
      if (a) {
        a.currentTime = 5000;
      }
    }
    flashChip(el);
    const again = flashes(el);
    expect(again[0]).toBe(flash);
    expect(again[1]).toBe(pop);
    expect(again.map((a) => a.currentTime)).toEqual([0, 0]);
  });

  it("flashes again when called as a flash ends", async () => {
    const el = chip();
    flashChip(el);
    for (const a of flashes(el)) {
      a.finish();
    }
    flashChip(el);
    expect(flashes(el)).toHaveLength(2);
    await settled();
    expect(el.hasAttribute("data-cp-flash")).toBe(true);
    expect(flashes(el)).toHaveLength(2);
  });

  it("clears its attribute when the chip is hidden before the flash starts", async () => {
    const el = chip();
    flashChip(el);
    el.style.display = "none";
    expect(getComputedStyle(el).display).toBe("none");
    await settled();
    expect(el.hasAttribute("data-cp-flash")).toBe(false);
    el.style.display = "";
    expect(flashes(el)).toHaveLength(0);
  });
});
