import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

import { chromium, firefox, webkit, type Browser, type BrowserType } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildGallery, frameNames, pageNames } from "./build.js";

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".vtt": "text/vtt",
  ".webm": "video/webm",
};
const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit };
const browsers = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",");

let out = "";
let origin = "";
let close = (): void => undefined;
const missing = new Set<string>();

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "ui-gallery-"));
  await buildGallery(out);
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    // A page framed the way a preview tab frames it: sandboxed, so at an
    // opaque origin, where reading a stylesheet's rules throws.
    const framed = /^\/framed\/([\w-]+)$/.exec(path);
    if (framed !== null) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<link rel="icon" href="data:,"><iframe sandbox="allow-scripts" src="/${framed[1] ?? ""}.html"></iframe>`,
      );
      return;
    }
    // normalize() of a rooted path cannot climb above it, so the join stays under out.
    const file = join(out, normalize(decodeURIComponent(path)));
    readFile(file).then(
      (body) => {
        // An opaque-origin page fetches its module script and fonts by CORS.
        res.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          "access-control-allow-origin": "*",
        });
        res.end(body);
      },
      () => {
        missing.add(path);
        res.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  close = () => {
    server.close();
  };
}, 60_000);

afterAll(async () => {
  close();
  await rm(out, { recursive: true, force: true });
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
    expect([...missing]).toEqual([]);
  });

  it("closes an open conversation on Back at a phone's width and focuses its row", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 390, height: 800 } });
    await tab.goto(`${origin}/index.html`);
    await tab.goto(`${origin}/messages.html`);
    await tab.waitForFunction(() => document.querySelector("[data-build]") !== null);
    const row = tab.locator("#msg-list a.cp-list-row").nth(1);
    const id = await row.getAttribute("href");
    const shown = () => document.querySelector<HTMLDialogElement>("#msg + dialog")?.open;
    const hidden = () => !document.querySelector<HTMLDialogElement>("#msg + dialog")?.open;
    await row.focus();
    await tab.keyboard.press("Enter");
    await tab.waitForFunction(shown);
    await tab.goBack();
    await tab.waitForFunction(hidden);
    const focused = await tab.evaluate(() => document.activeElement?.getAttribute("href"));

    await row.focus();
    await tab.keyboard.press("Enter");
    await tab.waitForFunction(shown);
    await tab.keyboard.press("Escape");
    await tab.waitForFunction(hidden);
    const closed = new URL(tab.url());
    await tab.goBack();
    const left = new URL(tab.url()).pathname;
    await tab.close();
    expect({ focused, closed: closed.pathname + closed.hash, left }).toEqual({
      focused: id,
      closed: "/messages.html",
      left: "/index.html",
    });
  }, 60_000);

  it("keeps a docked conversation on Back and closes it on Close", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${origin}/index.html`);
    await tab.goto(`${origin}/messages.html`);
    await tab.waitForFunction(() => document.querySelector("[data-build]") !== null);
    const row = tab.locator("#msg-list a.cp-list-row").nth(1);
    await row.focus();
    await tab.keyboard.press("Enter");
    await tab.waitForFunction(() => location.hash !== "");
    const state = () =>
      tab.evaluate(() => ({
        docked: document.getElementById("msg")?.hasAttribute("data-cp-docked") ?? false,
        shown: document.querySelector<HTMLElement>("#msg > .cp-detail")?.hidden === false,
        current: document
          .querySelectorAll("#msg-list a.cp-list-row")[1]
          ?.getAttribute("aria-current"),
      }));
    await tab.goBack();
    await tab.waitForFunction(() => location.hash === "");
    const back = await state();

    await row.focus();
    await tab.keyboard.press("Enter");
    await tab.waitForFunction(() => location.hash !== "");
    await tab.locator("#msg > .cp-detail [data-detail-close]").click();
    await tab.waitForFunction(
      () => document.querySelector<HTMLElement>("#msg > .cp-detail")?.hidden === true,
    );
    const closed = {
      ...(await state()),
      path: new URL(tab.url()).pathname,
      hash: new URL(tab.url()).hash,
    };
    await tab.goBack();
    const left = new URL(tab.url()).pathname;
    await tab.close();
    expect({ back, closed, left }).toEqual({
      back: { docked: true, shown: true, current: "page" },
      closed: { docked: false, shown: false, current: null, path: "/messages.html", hash: "" },
      left: "/index.html",
    });
  }, 60_000);

  it.each([
    ["after a second press", "messages.html", ["#c-announce", "#c-kiro-codex"], "#c-announce"],
    [
      "after a press on a page that loaded on one",
      "messages.html#c-ui-data",
      ["#c-marotte"],
      "#c-ui-data",
    ],
  ])(
    "leaves the address on the list when Close shuts a docked conversation %s",
    async (_, page, presses, again) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}/${page}`);
      await tab.waitForFunction(() => document.querySelector("[data-build]") !== null);
      const row = (href: string) => tab.locator(`#msg-list a.cp-list-row[href="${href}"]`);
      const detail = (hidden: boolean) =>
        tab.waitForFunction(
          (h) => document.querySelector<HTMLElement>("#msg > .cp-detail")?.hidden === h,
          hidden,
          { timeout: 5000 },
        );
      for (const href of presses) {
        await row(href).click();
        await tab.waitForFunction((h) => location.hash === h, href);
      }
      await tab.locator("#msg > .cp-detail [data-detail-close]").click();
      await detail(true);
      const closed = new URL(tab.url()).hash;
      await row(again).click();
      // A press on a link to the address's own hash opens nothing.
      await detail(false).catch(() => undefined);
      const reopened = await tab.evaluate(
        (h) => ({
          shown: document.querySelector<HTMLElement>("#msg > .cp-detail")?.hidden === false,
          current: document
            .querySelector(`#msg-list a.cp-list-row[href="${h}"]`)
            ?.getAttribute("aria-current"),
        }),
        again,
      );
      await tab.close();
      expect({ closed, reopened }).toEqual({
        closed: "",
        reopened: { shown: true, current: "page" },
      });
    },
    60_000,
  );

  it.each(pageNames)(
    "runs %s's script to its end inside a sandboxed frame, as a preview tab shows it",
    async (page) => {
      const tab = await (browser as Browser).newPage();
      const errors: string[] = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      await tab.goto(`${origin}/framed/${page}`);
      const frame = tab.frames()[1];
      // The marks run last, so a page they reach ran every wiring before them.
      const marked = await frame
        ?.waitForFunction(() => document.querySelector("[data-build]") !== null, null, {
          timeout: 10_000,
        })
        .then(
          () => true,
          () => false,
        );
      await tab.close();
      expect({ errors, marked }).toEqual({ errors: [], marked: true });
    },
    60_000,
  );
});
