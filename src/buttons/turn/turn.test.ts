import { afterEach, describe, expect, it, vi } from "vitest";

import { turn, turnWhile } from "./turn.js";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function refresh(): { button: HTMLButtonElement; icon: HTMLElement } {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Refresh");
  const icon = document.createElement("span");
  icon.className = "cp-icon";
  icon.style.display = "inline-block";
  button.append(icon);
  document.body.append(button);
  return { button, icon };
}

describe("turn", () => {
  it("plays one full turn of the icon", () => {
    const { button, icon } = refresh();
    turn(button);
    const [a] = icon.getAnimations();
    const keys = (a?.effect as KeyframeEffect).getKeyframes();
    expect([keys[0]?.["rotate"], keys.at(-1)?.["rotate"]]).toEqual(["0turn", "1turn"]);
    expect(a?.effect?.getTiming().iterations).toBe(1);
  });

  it("lets a turn already playing finish instead of starting another", () => {
    const { button, icon } = refresh();
    turn(button);
    turn(button);
    expect(icon.getAnimations()).toHaveLength(1);
  });

  it("does nothing on a button without an icon", () => {
    const button = document.createElement("button");
    expect(() => turn(button)).not.toThrow();
  });
});

describe("turnWhile", () => {
  it("turns while the work runs, marked busy, then finishes the turn in progress", async () => {
    const { button, icon } = refresh();
    const work = Promise.withResolvers<number>();
    const finish = work.resolve;
    const run = turnWhile(button, work.promise);
    const [a] = icon.getAnimations();
    expect(a?.effect?.getTiming().iterations).toBe(Infinity);
    expect(button.getAttribute("aria-busy")).toBe("true");
    (a as Animation).currentTime = 1000;
    finish(42);
    await expect(run).resolves.toBe(42);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    // 1000ms into 900ms turns: the second turn finishes, and the icon rests upright.
    expect(a?.effect?.getTiming().iterations).toBe(2);
  });

  it("finishes the turn and clears busy when the work fails", async () => {
    const { button, icon } = refresh();
    const boom = new Error("no answer");
    await expect(turnWhile(button, Promise.reject(boom))).rejects.toBe(boom);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(icon.getAnimations()[0]?.effect?.getTiming().iterations).toBe(1);
  });

  it("pulses instead of turning under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (q: string) => ({ matches: q.includes("reduce") }) as MediaQueryList,
    );
    const { button, icon } = refresh();
    void turnWhile(button, Promise.withResolvers<never>().promise);
    const keys = (icon.getAnimations()[0]?.effect as KeyframeEffect).getKeyframes();
    expect(keys.map((k) => k["opacity"])).toEqual(["1", "0.45", "1"]);
  });
});
