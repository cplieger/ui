import { chromium, firefox, webkit, type Browser, type BrowserType } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { frameNames, pageNames } from "./build.js";
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

  it.each([...pageNames, ...frameNames])(
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
              getComputedStyle(i).getPropertyValue("--cp-icon-image") === "" && i.checkVisibility(),
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

  it("finds every file the pages ask for", () => {
    expect([...(served?.missing ?? [])]).toEqual([]);
  });

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
