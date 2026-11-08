import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPointerTier, installPointerTier } from "./pointer.js";

const root = document.documentElement;
const KEY = "pointer-test";
let follow = new AbortController();

function down(pointerType: string, target: EventTarget = document.body): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType }),
  );
}

function touchPoints(n: number): void {
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => n });
}

function coarseQuery(matches: boolean): void {
  const real = globalThis.matchMedia.bind(globalThis);
  vi.stubGlobal("matchMedia", (q: string) =>
    q === "(any-pointer: coarse)" ? ({ matches } as MediaQueryList) : real(q),
  );
}

afterEach(() => {
  follow.abort();
  follow = new AbortController();
  root.removeAttribute("data-pointer");
  vi.unstubAllGlobals();
  localStorage.removeItem(KEY);
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  document.body.replaceChildren();
});

describe("applyPointerTier", () => {
  it("guesses fine on a device that reports no touch", () => {
    coarseQuery(false);
    touchPoints(0);
    expect(applyPointerTier()).toBe("fine");
    expect(root.dataset["pointer"]).toBe("fine");
  });

  it("guesses coarse wherever touch is reported, by query or by touch points", () => {
    coarseQuery(true);
    touchPoints(0);
    expect(applyPointerTier()).toBe("coarse");
    coarseQuery(false);
    touchPoints(5);
    expect(applyPointerTier()).toBe("coarse");
  });

  it("starts on the kept tier over the guess", () => {
    coarseQuery(true);
    localStorage.setItem(KEY, "fine");
    expect(applyPointerTier({ storageKey: KEY })).toBe("fine");
  });

  it("ignores a kept value it does not know, and storage that throws", () => {
    coarseQuery(false);
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

describe("installPointerTier", () => {
  it.each([
    ["mouse", "fine"],
    ["touch", "coarse"],
    ["pen", "coarse"],
  ])("sets the tier a %s press calls for and keeps it", (kind, tier) => {
    installPointerTier({ storageKey: KEY, signal: follow.signal });
    down(kind);
    expect([root.dataset["pointer"], localStorage.getItem(KEY)]).toEqual([tier, tier]);
  });

  it("follows each new pointer, and leaves the tier alone for an unknown one", () => {
    installPointerTier({ signal: follow.signal });
    down("touch");
    down("mouse");
    expect(root.dataset["pointer"]).toBe("fine");
    down("");
    expect(root.dataset["pointer"]).toBe("fine");
  });

  it("sees a press the page stops", () => {
    installPointerTier({ signal: follow.signal });
    const b = document.createElement("button");
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    document.body.append(b);
    down("touch", b);
    expect(root.dataset["pointer"]).toBe("coarse");
  });

  it("stops following once its signal aborts, and keeps the tier it set", () => {
    installPointerTier({ signal: follow.signal });
    down("touch");
    follow.abort();
    down("mouse");
    expect(root.dataset["pointer"]).toBe("coarse");
  });

  it("keeps following when storage refuses the write", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    installPointerTier({ storageKey: KEY, signal: follow.signal });
    down("touch");
    expect(root.dataset["pointer"]).toBe("coarse");
  });
});
