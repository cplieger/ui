import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { enhancePill } from "../../core/pill/pill.js";

let sheet: HTMLLinkElement;
let life = new AbortController();

// The bar is the stylesheet's, so the tests link it, as an app's page does.
beforeAll(async () => {
  document.documentElement.classList.add("cp");
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
});

afterAll(async () => {
  sheet.remove();
  document.documentElement.classList.remove("cp");
  await page.viewport(1280, 720);
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function header(): { nav: HTMLElement; items: HTMLAnchorElement[] } {
  const app = document.createElement("div");
  app.className = "cp-app";
  const head = document.createElement("header");
  head.className = "cp-header";
  const nav = document.createElement("nav");
  nav.className = "cp-nav";
  nav.setAttribute("aria-label", "Main");
  const items = ["Overview", "Library", "Activity"].map((word, i) => {
    const a = document.createElement("a");
    a.className = "cp-nav-item";
    a.href = `#${word}`;
    const label = document.createElement("span");
    label.className = "cp-nav-label";
    label.textContent = word;
    a.append(label);
    if (i === 1) {
      a.setAttribute("aria-current", "page");
    }
    nav.append(a);
    return a;
  });
  head.append(nav);
  app.append(head);
  document.body.append(app);
  enhancePill(nav, { signal: life.signal });
  return { nav, items };
}

const pillOf = (nav: HTMLElement) => nav.querySelector(":scope > .cp-pill") as HTMLElement;

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(r));
  }
};

describe("the bottom bar's selection", () => {
  it("is the pill under 40rem, sliding on a spring, and the current link draws no mark of its own", async () => {
    await page.viewport(360, 720);
    const { nav, items } = header();
    const pill = pillOf(nav);
    expect(getComputedStyle(pill).display).toBe("block");
    await frames(6);
    items[1]?.removeAttribute("aria-current");
    items[2]?.setAttribute("aria-current", "page");
    await Promise.resolve();
    expect(getComputedStyle(pill).transitionProperty).toContain("translate");
    expect(getComputedStyle(items[2] as HTMLElement, "::before").content).toBe("none");
  });

  it("is each link's own fill at full width, with no pill drawn", async () => {
    await page.viewport(1280, 720);
    const { nav, items } = header();
    expect(getComputedStyle(pillOf(nav)).display).toBe("none");
    expect(getComputedStyle(items[1] as HTMLElement).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
