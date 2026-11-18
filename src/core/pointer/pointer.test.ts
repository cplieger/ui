import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPointerTier } from "./pointer.js";

const root = document.documentElement;
const KEY = "pointer-test";

function touchPoints(n: number): void {
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => n });
}

/** The device's answers: every pointer and hover query matches only if listed. */
function device(...matching: string[]): void {
  const real = globalThis.matchMedia.bind(globalThis);
  vi.stubGlobal("matchMedia", (q: string) =>
    /^\(any-(pointer|hover):/.test(q)
      ? ({ matches: matching.includes(q) } as MediaQueryList)
      : real(q),
  );
}

const MOUSE = ["(any-pointer: fine)", "(any-hover: hover)"];

afterEach(() => {
  root.removeAttribute("data-pointer");
  vi.unstubAllGlobals();
  localStorage.removeItem(KEY);
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

describe("applyPointerTier", () => {
  it("guesses fine on a device that reports no touch", () => {
    device(...MOUSE);
    touchPoints(0);
    expect(applyPointerTier()).toBe("fine");
    expect(root.dataset["pointer"]).toBe("fine");
  });

  it("guesses coarse wherever touch is reported and no hovering fine pointer is", () => {
    device("(any-pointer: coarse)");
    touchPoints(0);
    expect(applyPointerTier()).toBe("coarse");
    device();
    touchPoints(5);
    expect(applyPointerTier()).toBe("coarse");
    // a touchscreen laptop whose browser hides the mouse's hover (crbug.com/398065927)
    device("(any-pointer: fine)", "(any-pointer: coarse)");
    expect(applyPointerTier()).toBe("coarse");
  });

  it("guesses fine on a touchscreen with a trackpad or mouse attached, as an iPad on a Magic Keyboard", () => {
    device(...MOUSE, "(any-pointer: coarse)");
    touchPoints(5);
    expect(applyPointerTier()).toBe("fine");
  });

  it("starts on the kept tier over the guess", () => {
    device("(any-pointer: coarse)");
    localStorage.setItem(KEY, "fine");
    expect(applyPointerTier({ storageKey: KEY })).toBe("fine");
  });

  it("ignores a kept value it does not know, and storage that throws", () => {
    device(...MOUSE);
    touchPoints(0);
    localStorage.setItem(KEY, "huge");
    expect(applyPointerTier({ storageKey: KEY })).toBe("fine");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("refused", "SecurityError");
      },
    });
    expect(applyPointerTier({ storageKey: KEY })).toBe("fine");
  });
});
