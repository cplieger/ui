import { afterEach, describe, expect, it, vi } from "vitest";

import { measureRoll, roll, rollText } from "./roll.js";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function windowOf(text: string, number = false): HTMLElement {
  const host = document.createElement("span");
  host.className = "cp-roll";
  if (number) {
    host.dataset["uipRoll"] = "number";
  }
  // The stylesheet's window, inline, so the test needs no css/system.
  Object.assign(host.style, {
    display: "inline-grid",
    gridTemplateColumns: "max-content",
    overflow: "hidden",
    blockSize: "1lh",
  });
  host.textContent = text;
  document.body.append(host);
  return host;
}

const settle = (host: HTMLElement) =>
  Promise.all(host.getAnimations({ subtree: true }).map((a) => a.finished));

describe("roll", () => {
  it("slides the new line in and leaves it alone in the window", async () => {
    const host = windowOf("Grab");
    roll(host, "Grabbed");
    const [from, to] = [...host.children] as HTMLElement[];
    expect(from?.textContent).toBe("Grab");
    expect(to?.textContent).toBe("Grabbed");
    await settle(host);
    expect([...host.children].map((c) => c.textContent)).toEqual(["Grabbed"]);
    expect(rollText(host)).toBe("Grabbed");
  });

  it("glides the window to the new line's width", () => {
    const host = windowOf("Grab");
    const wide = measureRoll(host, "Grabbed");
    roll(host, "Grabbed");
    expect(Number.parseFloat(host.style.inlineSize)).toBeCloseTo(wide, 1);
  });

  it("brings the new line up from below, or down from above when it rolls down", () => {
    const up = windowOf("1");
    roll(up, "2");
    const enter = (host: HTMLElement) =>
      (host.lastElementChild as HTMLElement).getAnimations()[0]?.effect as KeyframeEffect;
    expect(enter(up).getKeyframes()[0]?.["translate"]).toMatch(/^0(px)? 110%$/);
    const down = windowOf("2");
    roll(down, "1", { down: true });
    expect(enter(down).getKeyframes()[0]?.["translate"]).toMatch(/^0(px)? -110%$/);
  });

  it("takes over a roll in flight, so two lines never show side by side", async () => {
    const host = windowOf("100", true);
    roll(host, "110");
    roll(host, "120");
    expect(host.children.length).toBe(2);
    expect([...host.children].map((c) => c.textContent)).toEqual(["110", "120"]);
    roll(host, "130");
    expect(host.textContent).not.toContain("100");
    await settle(host);
    expect(host.textContent).toBe("130");
  });

  it("does nothing when the text is already on show", () => {
    const host = windowOf("Saved");
    roll(host, "Saved");
    expect(host.getAnimations({ subtree: true })).toEqual([]);
    expect(host.children.length).toBe(1);
  });

  it("changes the text at once under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (q: string) => ({ matches: q.includes("reduce") }) as MediaQueryList,
    );
    const host = windowOf("Save changes");
    roll(host, "Saved");
    expect(host.getAnimations({ subtree: true })).toEqual([]);
    expect(host.textContent).toBe("Saved");
    expect(host.style.inlineSize).toBe("");
  });

  it("measures a line without leaving anything in the window", () => {
    const host = windowOf("A");
    expect(measureRoll(host, "A much longer line")).toBeGreaterThan(measureRoll(host, "A"));
    expect(host.innerHTML).toBe("A");
  });
});
