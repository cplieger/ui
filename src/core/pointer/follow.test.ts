import { afterEach, describe, expect, it, vi } from "vitest";

import { installPointerTier } from "./follow.js";

const root = document.documentElement;
const KEY = "pointer-test";
let follow = new AbortController();

function down(pointerType: string, target: EventTarget = document.body): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType }),
  );
}

function move(pointerType: string): void {
  document.body.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, composed: true, pointerType }),
  );
}

afterEach(() => {
  follow.abort();
  follow = new AbortController();
  root.removeAttribute("data-pointer");
  vi.unstubAllGlobals();
  localStorage.removeItem(KEY);
  document.body.replaceChildren();
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

  it("takes a mouse or trackpad that only hovers as fine, and keeps it", () => {
    installPointerTier({ storageKey: KEY, signal: follow.signal });
    down("touch");
    move("mouse");
    expect([root.dataset["pointer"], localStorage.getItem(KEY)]).toEqual(["fine", "fine"]);
  });

  it.each(["touch", "pen", ""])("leaves the tier alone when a %s pointer moves", (kind) => {
    installPointerTier({ signal: follow.signal });
    down("mouse");
    move(kind);
    expect(root.dataset["pointer"]).toBe("fine");
    down("touch");
    move(kind);
    expect(root.dataset["pointer"]).toBe("coarse");
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
    move("mouse");
    expect(root.dataset["pointer"]).toBe("coarse");
  });

  it("shares one set of listeners, kept until every caller's signal has aborted", () => {
    const part = new AbortController();
    installPointerTier({ storageKey: KEY, signal: follow.signal });
    installPointerTier({ storageKey: "other", signal: part.signal });
    down("touch");
    part.abort();
    down("mouse");
    expect([
      root.dataset["pointer"],
      localStorage.getItem(KEY),
      localStorage.getItem("other"),
    ]).toEqual(["fine", "fine", null]);
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
