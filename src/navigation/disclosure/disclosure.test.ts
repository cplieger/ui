import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceDisclosure, glideShow } from "./disclosure.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function section(title: string, name?: string): HTMLDetailsElement {
  const d = document.createElement("details");
  if (name !== undefined) {
    d.setAttribute("name", name);
  }
  const s = document.createElement("summary");
  s.textContent = title;
  const body = document.createElement("p");
  body.textContent = "What changed: the interval and the release rules.";
  body.style.blockSize = "120px";
  d.append(s, body);
  document.body.append(d);
  return d;
}

const settle = () => new Promise((r) => setTimeout(r, 400));

describe("enhanceDisclosure", () => {
  it("glides open, its height growing from the summary's to the content's", async () => {
    const d = section("What changed");
    enhanceDisclosure(d, { signal: life.signal });
    const shut = d.getBoundingClientRect().height;
    await userEvent.click(d.querySelector("summary") as HTMLElement);
    expect(d.open).toBe(true);
    const [glide] = d.getAnimations();
    const keys = (glide?.effect as KeyframeEffect).getKeyframes();
    expect(Number.parseFloat(String(keys[0]?.["blockSize"]))).toBeCloseTo(shut, 0);
    expect(Number.parseFloat(String(keys.at(-1)?.["blockSize"]))).toBeGreaterThan(shut + 100);
    await settle();
    expect(d.getAnimations()).toHaveLength(0);
  });

  it("stays open while it glides shut, so its content stays drawn, and shuts at the end", async () => {
    const d = section("What changed");
    enhanceDisclosure(d, { signal: life.signal });
    const summary = d.querySelector("summary") as HTMLElement;
    await userEvent.click(summary);
    await settle();
    await userEvent.click(summary);
    expect(d.open).toBe(true);
    expect(d.hasAttribute("data-cp-closing")).toBe(true);
    await settle();
    expect(d.open).toBe(false);
    expect(d.hasAttribute("data-cp-closing")).toBe(false);
  });

  it("opens a section that shares a name and glides the open one shut, one at a time", async () => {
    const a = section("Sources", "settings");
    const b = section("Languages", "settings");
    for (const d of [a, b]) {
      enhanceDisclosure(d, { signal: life.signal });
    }
    await userEvent.click(a.querySelector("summary") as HTMLElement);
    await settle();
    await userEvent.click(b.querySelector("summary") as HTMLElement);
    expect(b.open).toBe(true);
    await settle();
    expect([a.open, b.open]).toEqual([false, true]);
  });

  it("lets sections without a shared name open together, and gives the name back when its signal aborts", async () => {
    const a = section("One");
    const b = section("Two");
    const named = section("Three", "group");
    for (const d of [a, b, named]) {
      enhanceDisclosure(d, { signal: life.signal });
    }
    await userEvent.click(a.querySelector("summary") as HTMLElement);
    await userEvent.click(b.querySelector("summary") as HTMLElement);
    await settle();
    expect([a.open, b.open]).toEqual([true, true]);
    expect(named.hasAttribute("name")).toBe(false);
    life.abort();
    expect(named.getAttribute("name")).toBe("group");
  });
});

describe("glideShow", () => {
  it("glides an element in from no height, and out to none before it hides", async () => {
    const bar = document.createElement("div");
    bar.textContent = "3 selected";
    bar.style.blockSize = "40px";
    bar.hidden = true;
    document.body.append(bar);
    glideShow(bar, true);
    expect(bar.hidden).toBe(false);
    const keys = (bar.getAnimations()[0]?.effect as KeyframeEffect).getKeyframes();
    expect(keys[0]?.["blockSize"]).toBe("0px");
    glideShow(bar, false);
    expect(bar.hidden).toBe(false);
    await settle();
    expect(bar.hidden).toBe(true);
  });
});
