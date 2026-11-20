import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";

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

describe("the bottom bar and focus", () => {
  function longPage(): { nav: HTMLElement; rows: HTMLButtonElement[] } {
    const { nav } = header();
    const main = document.createElement("main");
    main.className = "cp-main";
    const rows = Array.from({ length: 30 }, (_, i) => {
      const b = document.createElement("button");
      b.className = "cp-button";
      b.type = "button";
      b.textContent = `Row ${String(i + 1)}`;
      const line = document.createElement("p");
      line.append(b);
      main.append(line);
      return b;
    });
    nav.closest(".cp-app")?.append(main);
    return { nav, rows };
  }

  it("pads the page's end by the bar's height under 40rem", async () => {
    await page.viewport(390, 640);
    const { nav } = longPage();
    const pad = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockEnd);
    expect(pad).toBeGreaterThanOrEqual(nav.getBoundingClientRect().height - 0.5);
  });

  // Gecko scrolls a focused control only when no part of it is in view, so a
  // control partly above the bar may stay partly under it
  // (https://bugzilla.mozilla.org/show_bug.cgi?id=1326943); none stays wholly under it.
  it("never leaves a control Tab reaches wholly under the bar", async () => {
    await page.viewport(390, 640);
    const { nav, rows } = longPage();
    rows[0]?.focus();
    const hidden: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      await userEvent.keyboard("{Tab}");
      const box = document.activeElement?.getBoundingClientRect();
      if (box && box.top >= nav.getBoundingClientRect().top - 0.5) {
        hidden.push(document.activeElement?.textContent ?? "");
      }
    }
    expect(document.activeElement).toBe(rows.at(-1));
    expect(document.scrollingElement?.scrollTop).toBeGreaterThan(0);
    expect(hidden).toEqual([]);
  });

  it("leaves the page's end unpadded at full width, where no bar shows", async () => {
    await page.viewport(1280, 720);
    header();
    expect(getComputedStyle(document.documentElement).scrollPaddingBlockEnd).toBe("auto");
  });
});
