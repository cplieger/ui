import { chromium, firefox, webkit, type Browser, type BrowserType } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { frameNames, pageNames, templateNames } from "./build.js";
import { serveGallery, type Served } from "./serve.js";

const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit };
const browsers = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",");

let served: Served | undefined;
let origin = "";

beforeAll(async () => {
  served = await serveGallery();
  origin = served.origin;
}, 60_000);

afterAll(async () => {
  await served?.close();
});

describe.each(browsers)("the gallery in %s", (name) => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    const engine = ENGINES[name];
    if (engine === undefined) {
      throw new TypeError(`unknown browser ${name}`);
    }
    browser = await engine.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  it.each([...pageNames, ...frameNames, ...templateNames])(
    "loads %s with no error, every icon painted and nothing wider than a phone",
    async (page) => {
      const report: Record<string, unknown> = {};
      for (const width of [1440, 390]) {
        const tab = await (browser as Browser).newPage({ viewport: { width, height: 900 } });
        const errors: string[] = [];
        tab.on("pageerror", (e) => errors.push(e.message));
        await tab.goto(`${origin}/${page}.html`);
        await tab.evaluate(() => document.fonts.ready.then(() => undefined));
        const state = await tab.evaluate(() => ({
          wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          unpainted: [...document.querySelectorAll<HTMLElement>(".cp-icon")].filter(
            (i) =>
              getComputedStyle(i).getPropertyValue("--cp-icon-image") === "" &&
              i.checkVisibility({ visibilityProperty: true }),
          ).length,
        }));
        if (errors.length > 0 || (width === 390 && state.wide) || state.unpainted > 0) {
          report[String(width)] = { errors, ...state };
        }
        await tab.close();
      }
      expect(report).toEqual({});
    },
    60_000,
  );

  it("clears every row of a choices set whose legend has a button under the floats, and no other set's", async () => {
    const wrong: string[] = [];
    let floated = 0;
    for (const page of ["forms", "settings", "overlays"]) {
      const tab = await (browser as Browser).newPage();
      await tab.goto(`${origin}/${page}.html`);
      const seen = await tab.evaluate(() => {
        const out = { floated: 0, wrong: [] as string[] };
        for (const set of document.querySelectorAll(".cp-choices")) {
          const legend = set.firstElementChild;
          const button = legend?.nextElementSibling;
          const has = legend?.localName === "legend" && button?.matches(".cp-button") === true;
          out.floated += has ? 1 : 0;
          for (const row of set.children) {
            const want = has && row !== legend && row !== button ? "both" : "none";
            if (getComputedStyle(row).clear !== want) {
              out.wrong.push(`${row.outerHTML.slice(0, 80)}: not ${want}`);
            }
          }
        }
        return out;
      });
      floated += seen.floated;
      wrong.push(...seen.wrong.map((w) => `${page}: ${w}`));
      await tab.close();
    }
    expect(floated).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  }, 60_000);

  // A `:has()` left of a combinator whose last compound names no class, type
  // or attribute makes Chromium restyle the whole page on every insertion,
  // about 9,800 elements here; Chromium's trace counts the elements each
  // restyle visits. How Blink's `:has()` invalidation works:
  // https://blogs.igalia.com/blee/posts/2023/05/31/how-blink-invalidates-styles-when-has-in-use.html
  it.runIf(name === "chromium")(
    "restyles under a tenth of the page, not all of it, once a node is added to a chart",
    async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${origin}/charts.html`);
      // A font load restyles the whole tree in Blink, so the page settles and
      // flushes before the bracketed insertion.
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        void getComputedStyle(document.body).color;
      });
      const cdp = await tab.context().newCDPSession(tab);
      const events: Record<string, unknown>[] = [];
      cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
      const done = new Promise((ok) => cdp.once("Tracing.tracingComplete", ok));
      await cdp.send("Tracing.start", { categories: "devtools.timeline" });
      const page = await tab.evaluate(() => {
        const plot = document.querySelector('.cp-chart > [data-part="plot"]') as Element;
        void getComputedStyle(plot).color;
        console.timeStamp("insert:start");
        plot.append(document.createElement("span"));
        void getComputedStyle(plot).color;
        console.timeStamp("insert:end");
        return document.getElementsByTagName("*").length;
      });
      await cdp.send("Tracing.end");
      await done;
      await tab.close();
      const mark = (message: string): number | undefined =>
        events.find(
          (e) =>
            e["name"] === "TimeStamp" &&
            (e["args"] as { data?: { message?: unknown } } | undefined)?.data?.message === message,
        )?.["ts"] as number | undefined;
      const start = mark("insert:start") ?? Infinity;
      const end = mark("insert:end") ?? -Infinity;
      const counts = events.flatMap((e) => {
        const count = (e["args"] as { elementCount?: unknown } | undefined)?.elementCount;
        const ts = e["ts"] as number;
        return e["name"] === "UpdateLayoutTree" &&
          typeof count === "number" &&
          ts > start &&
          ts < end
          ? [count]
          : [];
      });
      expect(counts).toHaveLength(1);
      expect(counts[0]).toBeLessThan(page / 10);
    },
    60_000,
  );

  it("finds every file the pages ask for", () => {
    expect([...(served?.missing ?? [])]).toEqual([]);
  });

  // docs/design-colour.md "Contrast": secondary text 4.5:1, and 7:1 with more contrast.
  it("draws the layouts page's frame notes at 4.5:1, 7:1 with more contrast", async () => {
    const low: string[] = [];
    let seen = 0;
    for (const contrast of ["no-preference", "more"] as const) {
      for (const theme of ["light", "dark"]) {
        for (const width of [1440, 390]) {
          const tab = await (browser as Browser).newPage({
            viewport: { width, height: 900 },
            contrast,
          });
          await tab.goto(`${origin}/layouts.html`);
          await tab.evaluate(async (t) => {
            document.documentElement.dataset["theme"] = t;
            await new Promise(requestAnimationFrame);
            await Promise.all(
              document
                .getAnimations()
                .filter((a) => a instanceof CSSTransition)
                .map((a) => a.finished.catch(() => undefined)),
            );
          }, theme);
          const ratios = await tab.evaluate(() => {
            const ctx = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
            if (ctx === null) {
              throw new Error("no 2d context");
            }
            const lum = (): number => {
              const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
              const lin = (v: number) =>
                v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
              return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            };
            const paint = (colour: string): void => {
              ctx.fillStyle = colour;
              ctx.fillRect(0, 0, 1, 1);
            };
            return [...document.querySelectorAll<HTMLElement>(".f-box > small")]
              .filter((s) => s.checkVisibility())
              .map((small) => {
                const chain: Element[] = [];
                for (let e = small.parentElement; e; e = e.parentElement) {
                  chain.unshift(e);
                }
                paint("#fff");
                for (const e of chain) {
                  paint(getComputedStyle(e).backgroundColor);
                }
                const bg = lum();
                paint(getComputedStyle(small).color);
                const [hi, lo] = [bg, lum()].sort((x, y) => y - x) as [number, number];
                return { text: small.textContent, ratio: (hi + 0.05) / (lo + 0.05) };
              });
          });
          await tab.close();
          seen += ratios.length;
          const floor = contrast === "more" ? 7 : 4.5;
          for (const { text, ratio } of ratios) {
            if (ratio < floor) {
              low.push(
                `${contrast} ${theme} ${String(width)}: ${String(text)} ${ratio.toFixed(2)}`,
              );
            }
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(low).toEqual([]);
  }, 60_000);

  // WAI-ARIA 1.2 prohibits aria-label on a label, which has no role, so only the label's own text
  // names its radio in every engine.
  it("names the settings page's accent swatches by their labels' own words", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.goto(`${origin}/settings.html`);
    const swatches = await tab.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("input[name='g-accent']")].map((radio) => ({
        words: radio.labels?.[0]?.textContent.trim(),
        labelNamed: radio.labels?.[0]?.hasAttribute("aria-label"),
      })),
    );
    await tab.close();
    expect(swatches).toEqual(
      ["Blue", "Green", "Terracotta", "Violet", "Pink", "Teal"].map((words) => ({
        words,
        labelNamed: false,
      })),
    );
  }, 60_000);

  it("shows a template's destination as a route change, focus on its h1", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${origin}/templates/app.html`);
    const item = tab.locator(".cp-header .cp-nav-item:not([aria-current])").first();
    const label = await item.locator(".cp-nav-label").textContent();
    await item.click();
    const state = await tab.evaluate(() => ({
      heading: document.querySelector("main h1")?.textContent,
      current: document.querySelector(".cp-nav-item[aria-current='page'] .cp-nav-label")
        ?.textContent,
      focused: document.activeElement === document.querySelector("main h1"),
    }));
    await tab.close();
    expect(state).toEqual({ heading: label, current: label, focused: true });
  }, 60_000);

  // WCAG 4.1.3: a result count that follows a choice is a status message, so it reaches a
  // screen reader without focus moving to the button that shows it.
  it("says a staged filter sheet's result count as each choice changes it", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${origin}/overlays.html`);
    await tab.click("[commandfor='d-filters'][command='show-modal']");
    const said = async (choice: string): Promise<string | undefined> => {
      await tab.check(`#d-filters input[value='${choice}']`);
      await tab.waitForTimeout(400);
      return tab.evaluate(() =>
        document.querySelector("#d-filters [data-cp-politeness='polite']")?.textContent.trim(),
      );
    };
    // The gallery's counts: 268 on the best and 33 not, of which films are a fifth.
    const heard = [await said("best"), await said("film")];
    await tab.close();
    expect(heard).toEqual(["301 results", "60 results"]);
  }, 60_000);

  it.each(pageNames)(
    "runs %s's script to its end inside a sandboxed frame, as a preview tab shows it",
    async (page) => {
      const tab = await (browser as Browser).newPage();
      const errors: string[] = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      await tab.goto(`${origin}/framed/${page}`);
      const frame = tab.frames()[1];
      // The marks run last, so a page they reach ran every wiring before them.
      // The module runs to its end before the frame loads, which delays the
      // tab's load that goto waits for: a later look could find nothing more.
      const marked = await frame?.evaluate(() => document.querySelector("[data-build]") !== null);
      await tab.close();
      expect({ errors, marked }).toEqual({ errors: [], marked: true });
    },
    60_000,
  );
});
