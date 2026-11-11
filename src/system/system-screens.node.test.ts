import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";

import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGES = join(ROOT, "docs", "system");
const IMAGES = join(ROOT, "docs", "images");
const MANIFEST = join(IMAGES, "system-screens.json");

interface Shot {
  readonly image: string;
  readonly page: "library" | "item" | "parts" | "sign-in" | "security" | "settings";
  readonly theme: "light" | "dark";
  readonly pointer: "fine" | "coarse";
  readonly size: readonly [number, number];
  readonly scale?: number;
  /** Captured whole rather than at the viewport's height. */
  readonly full?: boolean;
}

const SHOTS: readonly Shot[] = [
  {
    image: "system-library-dark",
    page: "library",
    theme: "dark",
    pointer: "fine",
    size: [1600, 1000],
  },
  { image: "system-item-light", page: "item", theme: "light", pointer: "fine", size: [1600, 1000] },
  {
    image: "system-parts-light",
    page: "parts",
    theme: "light",
    pointer: "fine",
    size: [1280, 900],
    full: true,
  },
  {
    image: "system-parts-dark",
    page: "parts",
    theme: "dark",
    pointer: "fine",
    size: [1280, 900],
    full: true,
  },
  {
    image: "system-library-phone",
    page: "library",
    theme: "dark",
    pointer: "coarse",
    size: [390, 844],
    scale: 2,
  },
  {
    image: "system-item-tablet",
    page: "item",
    theme: "light",
    pointer: "coarse",
    size: [820, 1180],
  },
  {
    image: "system-sign-in-light",
    page: "sign-in",
    theme: "light",
    pointer: "fine",
    size: [1280, 800],
  },
  {
    image: "system-sign-in-phone",
    page: "sign-in",
    theme: "dark",
    pointer: "coarse",
    size: [390, 844],
    scale: 2,
  },
  {
    image: "system-settings-light",
    page: "settings",
    theme: "light",
    pointer: "fine",
    size: [1440, 900],
  },
  {
    image: "system-security-dark",
    page: "security",
    theme: "dark",
    pointer: "fine",
    size: [1440, 900],
    full: true,
  },
];

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// Serves the package root over HTTP, which the fonts need: Chromium refuses a
// font from a file:// page.
async function serve(): Promise<{ origin: string; close: () => void }> {
  const server = createServer((req, res) => {
    // normalize() of a rooted path cannot climb above it, so the join stays under ROOT.
    const file = join(
      ROOT,
      normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)),
    );
    readFile(file).then(
      (body) => {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      },
      () => res.writeHead(404).end(),
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${String(port)}`, close: () => server.close() };
}

async function capture(): Promise<void> {
  const { origin, close } = await serve();
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const [width, height] = shot.size;
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: shot.scale ?? 1,
      });
      await page.goto(`${origin}/docs/system/${shot.page}.html`);
      // What an app's prepaint script and pointer listener write.
      await page.evaluate(
        ([theme, pointer]) => {
          document.documentElement.dataset["theme"] = theme;
          document.documentElement.dataset["pointer"] = pointer;
          for (const t of document.querySelectorAll('[data-kind="theme"]')) {
            t.setAttribute("aria-pressed", String(theme === "dark"));
          }
          // A static page cannot declare a mixed checkbox; the app's code sets it.
          for (const box of document.querySelectorAll<HTMLInputElement>("[data-mixed]")) {
            box.indeterminate = true;
          }
          return document.fonts.ready.then(() => undefined);
        },
        [shot.theme, shot.pointer] as const,
      );
      await page.screenshot({
        path: join(IMAGES, `${shot.image}.png`),
        animations: "disabled",
        fullPage: shot.full === true,
      });
      await page.close();
    }
  } finally {
    await browser.close();
    close();
  }
}

// What the screenshots are drawn from: the stylesheets, the pages, the fonts
// and the icons.
async function sourcesHash(): Promise<string> {
  const under = async (...dir: string[]) =>
    (await readdir(join(ROOT, ...dir))).sort().map((f) => join(ROOT, ...dir, f));
  const hash = createHash("sha256");
  for (const file of [
    join(ROOT, "css", "system.css"),
    ...(await under("docs", "system")),
    ...(await under("fonts")),
    ...(await under("icons", "svg")),
    ...(await under("icons", "marks")),
  ]) {
    hash.update(file.slice(ROOT.length)).update(await readFile(file));
  }
  return hash.digest("hex");
}

describe("the reference screens", () => {
  it("has a page for every shot that links the shipped stylesheet", async () => {
    for (const page of new Set(SHOTS.map((s) => s.page))) {
      const html = await readFile(join(PAGES, `${page}.html`), "utf8");
      expect(html, page).toContain('href="../../css/system.css"');
      expect(html, page).toMatch(/<html[^>]*class="cp"/);
    }
  });

  it("shows every captured image in the design pages, and every image they show exists", async () => {
    if (process.env["SYSTEM_SCREENS"] === "1") {
      await capture();
      await writeFile(MANIFEST, `${JSON.stringify({ sources: await sourcesHash() }, null, 2)}\n`);
    }
    const docs = await Promise.all(
      [
        "design.md",
        "design-components.md",
        "design-patterns.md",
        "design-settings.md",
        "design-account.md",
      ].map((f) => readFile(join(ROOT, "docs", f), "utf8")),
    );
    const shown = new Set(
      docs.flatMap((doc) =>
        [...doc.matchAll(/\]\(images\/(system-[a-z-]+)\.png\)/g)].map((m) => m[1]),
      ),
    );
    expect([...shown].toSorted()).toEqual(SHOTS.map((s) => s.image).toSorted());
    for (const image of shown) {
      await expect(readFile(join(IMAGES, `${image ?? ""}.png`))).resolves.toBeInstanceOf(Buffer);
    }
  }, 120_000);

  it("were captured from the current stylesheet and pages", async () => {
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as { sources?: unknown };
    expect(manifest.sources, "run npm run system:screens").toBe(await sourcesHash());
  });
});
