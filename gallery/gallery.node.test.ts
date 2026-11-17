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

// WCAG 2.5.3 Label in Name: an account button is named by the initials it
// shows then ", account", or "Account" alone over an avatar with no text.
// Runs in the page, so it closes over nothing.
const misnamedAccounts = (): string[] =>
  [...document.querySelectorAll<HTMLElement>(".cp-account")].flatMap((b) => {
    const text = b.innerText.trim();
    const name = b.getAttribute("aria-label") ?? "";
    return name === (text === "" ? "Account" : `${text}, account`) ? [] : [`${name} / ${text}`];
  });

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
    "loads %s with no error, every icon painted, nothing wider than a phone and each account button named by its text",
    async (page) => {
      const report: Record<string, unknown> = {};
      for (const width of [1440, 390]) {
        const tab = await (browser as Browser).newPage({ viewport: { width, height: 900 } });
        const errors: string[] = [];
        tab.on("pageerror", (e) => errors.push(e.message));
        await tab.goto(`${origin}/${page}.html`);
        await tab.evaluate(() => document.fonts.ready.then(() => undefined));
        const state = {
          ...(await tab.evaluate(() => ({
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            unpainted: [...document.querySelectorAll<HTMLElement>(".cp-icon")].filter(
              (i) =>
                getComputedStyle(i).getPropertyValue("--cp-icon-image") === "" &&
                i.checkVisibility(),
            ).length,
          }))),
          misnamed: await tab.evaluate(misnamedAccounts),
        };
        if (
          errors.length > 0 ||
          (width === 390 && state.wide) ||
          state.unpainted > 0 ||
          state.misnamed.length > 0
        ) {
          report[String(width)] = { errors, ...state };
        }
        await tab.close();
      }
      expect(report).toEqual({});
    },
    60_000,
  );

  it("names an account button by its initials, or Account alone over an empty avatar", async () => {
    const tab = await (browser as Browser).newPage();
    const button = (name: string, text: string): string =>
      `<button class="cp-button cp-account" type="button" aria-label="${name}"><span class="cp-avatar" data-size="sm">${text}</span></button>`;
    await tab.setContent(
      [
        button("CP, account", "CP"),
        button("C, account", "C"),
        button("Account", ""),
        button("Account", "CP"),
        button("CP, account", ""),
      ].join(""),
    );
    const misnamed = await tab.evaluate(misnamedAccounts);
    await tab.close();
    expect(misnamed).toEqual(["Account / CP", "CP, account / "]);
  });

  it("finds every file the pages ask for", () => {
    expect([...missing]).toEqual([]);
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
