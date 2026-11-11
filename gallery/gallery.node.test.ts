import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildGallery, pageNames } from "./build.js";

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
    // normalize() of a rooted path cannot climb above it, so the join stays under out.
    const file = join(out, normalize(decodeURIComponent(path)));
    readFile(file).then(
      (body) => {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
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
  it("loads every page with no error, every file found, every icon painted and nothing wider than a phone", async () => {
    const engine = ENGINES[name];
    if (engine === undefined) {
      throw new TypeError(`unknown browser ${name}`);
    }
    const browser = await engine.launch();
    const report: Record<string, unknown> = {};
    try {
      for (const page of pageNames) {
        for (const width of [1440, 390]) {
          const tab = await browser.newPage({ viewport: { width, height: 900 } });
          const errors: string[] = [];
          tab.on("pageerror", (e) => errors.push(e.message));
          await tab.goto(`${origin}/${page}.html`);
          await tab.evaluate(() => document.fonts.ready.then(() => undefined));
          const state = await tab.evaluate(() => ({
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            unpainted: [...document.querySelectorAll<HTMLElement>(".cp-icon")].filter(
              (i) => i.style.getPropertyValue("--cp-icon-image") === "" && i.checkVisibility(),
            ).length,
          }));
          if (errors.length > 0 || (width === 390 && state.wide) || state.unpainted > 0) {
            report[`${page} at ${String(width)}`] = { errors, ...state };
          }
          await tab.close();
        }
      }
    } finally {
      await browser.close();
    }
    expect(report).toEqual({});
    expect([...missing]).toEqual([]);
  }, 240_000);
});
