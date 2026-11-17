import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
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
    expect([...missing]).toEqual([]);
  });

  describe("the conversation's address", () => {
    const M = "/messages.html";
    /** The conversations the page knows by address, with their titles: the
     *  list's rows, then the first page Show older brings in. */
    const KNOWN: Record<string, string> = {
      "c-internal": "/workspace/grelot/internal",
      "c-announce": "Announcements",
      "c-kiro-codex": "@kiro and @codex",
      "c-ui-data": "/workspace/ui/src/data",
      "c-marotte": "/workspace/marotte/static-src",
      "c-claude-gpt": "@claude and @gpt",
      "c-kiro-gpt": "@kiro and @gpt",
      "c-leads": "@library-reorg-lead and @ui-design-research",
      "c-ci": "/workspace/ci/.github/workflows",
      "c-codex-claude": "@codex and @claude",
      "c-monitoring": "/workspace/monitoring/alerts/rules",
    };
    type Action =
      | `load ${string}`
      | `press #${string}`
      | `chip #${string}`
      | `filter ${string}`
      | `focus #${string}`
      | `resize ${number}`
      | "author"
      | "older"
      | "close"
      | "escape"
      | "back"
      | "forward"
      | "reload";
    /** An action, the address it ends on, and where focus ends when that is the point.
     *  Close and Escape default to the closed row, or the list's tab stop; a chip
     *  that opened the entry takes focus back, as list-detail returns it to its opener. */
    type Step = readonly [Action, string, string?];
    interface Want {
      readonly address: string;
      readonly length?: number;
      readonly focus?: string;
      readonly top?: number;
      readonly scrollY?: number;
    }

    // In every document of the tab: the feed's scroller, and a record of
    // the rows made current from the moment `cpWatch()` is called.
    const helpers = () => {
      Object.assign(window, {
        cpScroller: (): Element => {
          for (let at = document.getElementById("msg-feed")?.parentElement; at;) {
            const y = getComputedStyle(at).overflowY;
            if ((y === "auto" || y === "scroll") && at.scrollHeight > at.clientHeight) {
              return at;
            }
            at = at.parentElement;
          }
          return document.documentElement;
        },
        cpWatch: (): void => {
          const made: string[] = [];
          Object.assign(window, { cpMade: made });
          new MutationObserver((records) => {
            for (const r of records) {
              if (r.target instanceof Element && r.target.hasAttribute("aria-current")) {
                made.push(r.target.getAttribute("href") ?? "");
              }
            }
          }).observe(document.getElementById("msg-list") ?? document, {
            subtree: true,
            attributeFilter: ["aria-current"],
          });
        },
      });
    };
    interface Helpers {
      cpScroller: () => Element;
      cpWatch: () => void;
      cpMade?: string[];
    }

    /** Invariant 1 on the page now, and `want`'s address, history length,
     *  focus, feed scroll and page scroll: each one that does not hold. */
    const broken = (tab: Page, want: Want) =>
      tab.evaluate(
        ({ w, known }) => {
          const out: string[] = [];
          const at = location.pathname + location.hash;
          if (at !== w.address) {
            out.push(`address ${at}`);
          }
          if (w.length !== undefined && history.length !== w.length) {
            out.push(`history.length ${String(history.length)}, was ${String(w.length)}`);
          }
          if (location.pathname !== "/messages.html") {
            return out;
          }
          if (document.querySelector("[data-build]") === null) {
            return [...out, "not wired yet"];
          }
          const title = document.getElementById("msg-title");
          const detail = title?.closest<HTMLElement>(".cp-detail");
          const dialog = document.querySelector<HTMLDialogElement>("#msg + dialog");
          const docked = document.getElementById("msg")?.hasAttribute("data-cp-docked") === true;
          const shown = detail?.hidden === false && (docked || dialog?.open === true);
          const name = known[location.hash.slice(1)];
          if (name === undefined ? shown : !shown || title?.textContent !== name) {
            out.push(`shows ${shown ? (title?.textContent ?? "") : "nothing"}`);
          }
          const rows = [...document.querySelectorAll("#msg-list a.cp-list-row")];
          const current = rows
            .filter((a) => a.hasAttribute("aria-current"))
            .map((a) => a.getAttribute("href"))
            .join(" ");
          const loaded = rows.some((a) => a.getAttribute("href") === location.hash);
          if (current !== (name !== undefined && loaded ? location.hash : "")) {
            out.push(`current "${current}"`);
          }
          const focused = document.activeElement;
          if (w.focus !== undefined && focused?.matches(w.focus) !== true) {
            out.push(`focus on ${focused?.outerHTML.slice(0, 50) ?? "nothing"}`);
          }
          if (w.top !== undefined) {
            const top = (window as unknown as Helpers).cpScroller().scrollTop;
            if (Math.abs(top - w.top) > 1) {
              out.push(`feed scrolled to ${String(top)}`);
            }
          }
          if (w.scrollY !== undefined && Math.abs(scrollY - w.scrollY) > 1) {
            out.push(`page scrolled to ${String(scrollY)}, was ${String(w.scrollY)}`);
          }
          return out;
        },
        { w: want, known: KNOWN },
      );
    /** What still breaks once the page settles: polled up to 5 s, then read again. */
    const settle = async (tab: Page, want: Want): Promise<string[]> => {
      const read = () =>
        broken(tab, want).catch((e: unknown) => [`unreadable: ${String(e).slice(0, 60)}`]);
      let last = await read();
      for (const end = Date.now() + 5000; last.length > 0 && Date.now() < end;) {
        await tab.waitForTimeout(100);
        last = await read();
      }
      await tab.waitForTimeout(300);
      return read();
    };
    const enter = async (tab: Page, selector: string) => {
      await tab.locator(selector).first().focus();
      await tab.keyboard.press("Enter");
    };

    /** Runs `steps` on a tab `width` wide and reports each step that broke an invariant. */
    const run = async (width: number, fresh: boolean, steps: readonly Step[]) => {
      const tab = await (browser as Browser).newPage({ viewport: { width, height: 800 } });
      await tab.addInitScript(helpers);
      if (!fresh) {
        await tab.goto(`${origin}/index.html`);
      }
      const wide = width >= 52 * 16;
      const report: string[] = [];
      for (const [i, [action, address, focus]] of steps.entries()) {
        const [verb = "", arg = ""] = action.split(" ");
        let want: Want = focus === undefined ? { address } : { address, focus };
        const before = await tab
          .evaluate(() => ({
            length: history.length,
            href: location.href,
            hidden: document.querySelector("#msg-title")?.closest<HTMLElement>(".cp-detail")
              ?.hidden,
            // Invariant 2's focus: the closed row, or the list's tab stop when it is not drawn.
            closes:
              document.querySelector(`#msg-list a.cp-list-row[href="${location.hash}"]`) === null
                ? '#msg-list a.cp-list-row[tabindex="0"]'
                : `#msg-list a.cp-list-row[href="${location.hash}"]`,
          }))
          .catch(() => undefined);
        switch (verb) {
          case "load":
          case "reload": {
            await (verb === "load" ? tab.goto(`${origin}/${arg}`) : tab.reload());
            const named = KNOWN[new URL(tab.url()).hash.slice(1)] !== undefined;
            // Invariant 3: docked with focus at the page's start, or in the phone's dialog.
            want = { ...want, focus: focus ?? (wide || !named ? "body" : "#msg-title") };
            break;
          }
          case "press":
          case "chip": {
            const selector =
              verb === "press"
                ? `#msg-list a.cp-list-row[href="${arg}"]`
                : `#agent-history a.cp-filter-chip[href="${arg}"]`;
            if (before?.hidden === false && new URL(before.href).hash === arg) {
              // Invariant 4: a press on what is shown keeps history and both
              // scrolls, and focuses its heading. The page puts the heading out
              // of view with the reader's focus on what they press.
              const y = await tab.evaluate((sel) => {
                (window as unknown as Helpers).cpScroller().scrollTop = 120;
                const top = document.querySelector(sel)?.getBoundingClientRect().top ?? 0;
                scrollTo(0, top + scrollY - 10);
                return scrollY;
              }, selector);
              await tab.waitForFunction(
                (at) =>
                  Math.abs((window as unknown as Helpers).cpScroller().scrollTop - 120) <= 1 &&
                  Math.abs(scrollY - at) <= 1,
                y,
              );
              want = { ...want, length: before.length, focus: "#msg-title", top: 120, scrollY: y };
              await tab.evaluate((sel) => {
                document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
              }, selector);
              await tab.keyboard.press("Enter");
              break;
            }
            await enter(tab, selector);
            break;
          }
          case "author":
            await enter(tab, '#msg-feed header > a[href="#agent-kiro"]');
            break;
          case "filter":
            await enter(tab, `#msg-filters a[data-show="${arg}"]`);
            break;
          case "focus":
            await tab.locator(`#msg-list a.cp-list-row[href="${arg}"]`).focus();
            break;
          case "resize":
            await tab.setViewportSize({ width: Number(arg), height: 800 });
            break;
          case "older": {
            const rows = () => document.querySelectorAll("#msg-list a.cp-list-row").length;
            const had = await tab.evaluate(rows);
            await tab.locator("[data-msg-older-rows]").click();
            await tab
              .waitForFunction(
                (n) => document.querySelectorAll("#msg-list a.cp-list-row").length > n,
                had,
                {
                  timeout: 5000,
                },
              )
              .catch(() => undefined);
            want = { ...want, ...(before === undefined ? {} : { length: before.length }) };
            break;
          }
          case "close":
          case "escape":
            want = { ...want, focus: focus ?? before?.closes ?? "body" };
            await tab.evaluate(() => {
              (window as unknown as Helpers).cpWatch();
            });
            await (verb === "close"
              ? tab.locator(".cp-detail [data-detail-close]").click()
              : tab.keyboard.press("Escape"));
            break;
          case "back":
            await tab.goBack();
            break;
          case "forward":
            await tab.goForward();
            break;
        }
        const left = await settle(tab, want);
        if (verb === "close" || verb === "escape") {
          // Invariant 2: at most one Back, so no entry on the way shows its row.
          const made = await tab
            .evaluate(() => (window as unknown as Helpers).cpMade ?? [])
            .catch(() => []);
          if (made.length > 0) {
            left.push(`made current on the way: ${made.join(" ")}`);
          }
        }
        if (left.length > 0) {
          report.push(`${String(i + 1)} ${action} → ${address}: ${left.join("; ")}`);
        }
      }
      await tab.close();
      return report;
    };

    const W = 1280;
    const P = 390;
    const AFTER = false;
    const FRESH = true;
    it.each<readonly [string, number, boolean, readonly Step[]]>([
      [
        "two presses, then Close, Back and Forward, and a press",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-announce", `${M}#c-announce`],
          ["press #c-kiro-codex", `${M}#c-kiro-codex`],
          ["close", M],
          ["back", `${M}#c-kiro-codex`],
          ["forward", M],
          ["press #c-announce", `${M}#c-announce`],
        ],
      ],
      [
        "Back and Forward between two docked conversations, then Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", `${M}#c-internal`],
          ["forward", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "Close, a press, Close, then Back out of the page",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a load on a conversation a later page brings in, Show older, Close",
        W,
        AFTER,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["older", `${M}#c-ci`],
          ["close", M],
          ["back", `${M}#c-ci`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a load on a conversation a later page brings in, Show older, Close, a press",
        W,
        FRESH,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["older", `${M}#c-ci`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
        ],
      ],
      [
        "a wide load on a conversation, a resize to a phone, Close",
        W,
        AFTER,
        [
          ["load messages.html#c-marotte", `${M}#c-marotte`],
          ["resize 390", `${M}#c-marotte`, "#msg-title"],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "Close, a press, focus moved to another row, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["focus #c-announce", `${M}#c-marotte`, '#msg-list a[href="#c-announce"]'],
          ["back", M, '#msg-list a[href="#c-announce"]'],
        ],
      ],
      [
        "a press, an author link, Back, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["author", `${M}#agent-kiro`],
          ["back", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "an author link, Back, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["author", `${M}#agent-kiro`],
          ["back", `${M}#c-internal`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "a press on the open row and on its chip, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-internal", `${M}#c-internal`],
          ["press #c-internal", `${M}#c-internal`],
          ["chip #c-internal", `${M}#c-internal`],
          ["close", M, '#agent-history a[href="#c-internal"]'],
          ["back", `${M}#c-internal`],
          ["back", "/index.html"],
        ],
      ],
      [
        "Close, a press, a filter that leaves its row out, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["filter Direct", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "a press on the open row, Close, a press",
        W,
        FRESH,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-ui-data", `${M}#c-ui-data`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
        ],
      ],
      [
        "a press, the same row again, a chip to another, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["chip #c-kiro-codex", `${M}#c-kiro-codex`],
          ["close", M, '#agent-history a[href="#c-kiro-codex"]'],
          ["back", `${M}#c-kiro-codex`],
        ],
      ],
      [
        "a reload after a press, then Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["reload", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "two presses on a page that loaded on one, Close, Back and Forward, then a press",
        W,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["close", M],
          ["back", `${M}#c-announce`],
          ["forward", M],
          ["press #c-ui-data", `${M}#c-ui-data`],
        ],
      ],
      [
        "Back out of the page and Forward into it, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", `${M}#c-ui-data`],
          ["back", "/index.html"],
          ["forward", `${M}#c-ui-data`],
          ["close", M],
          ["back", `${M}#c-ui-data`],
        ],
      ],
      [
        "a load on an address that names no conversation, a press, Close",
        W,
        AFTER,
        [
          ["load messages.html#agent-kiro", `${M}#agent-kiro`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["close", `${M}#agent-kiro`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on a conversation, then Close",
        P,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["close", M],
          ["back", `${M}#c-ui-data`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on the list, a press, Back, a press, Escape",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", M, '#msg-list a[href="#c-marotte"]'],
          ["press #c-marotte", `${M}#c-marotte`],
          ["escape", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on a conversation a later page brings in, Close, Show older, a press",
        P,
        FRESH,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["close", M],
          ["older", M],
          ["press #c-ci", `${M}#c-ci`],
          ["close", M],
        ],
      ],
      [
        "a phone's reload after a press, then Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["reload", `${M}#c-marotte`],
          ["close", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's press on a chip, then Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["chip #c-announce", `${M}#c-announce`],
          ["close", M, '#agent-history a[href="#c-announce"]'],
          ["back", "/index.html"],
        ],
      ],
    ])(
      "holds after each step of %s",
      async (_, width, fresh, steps) => {
        expect(await run(width, fresh, steps)).toEqual([]);
      },
      120_000,
    );

    it("keeps the app's own keys in each entry's state through a press, Close and Forward", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: W, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${M}`);
      await tab.waitForFunction(() => document.querySelector("[data-build]") !== null);
      const own = (key: string) =>
        tab.evaluate((k) => {
          history.replaceState({ ...(history.state as object), app: k }, "");
        }, key);
      const read = () =>
        tab.evaluate(() => (history.state as Record<string, unknown> | null)?.["app"]);
      // Close on the docked conversation the page loaded with pushes the list's address.
      await tab.locator(".cp-detail [data-detail-close]").click();
      await tab.waitForFunction(() => location.hash === "");
      await own("list");
      await enter(tab, '#msg-list a.cp-list-row[href="#c-marotte"]');
      await tab.waitForFunction(() => location.hash === "#c-marotte" && history.state !== null);
      await own("marotte");
      await tab.locator(".cp-detail [data-detail-close]").click();
      await tab.waitForFunction(() => location.hash === "");
      const listed = await read();
      await tab.goForward();
      await tab.waitForFunction(() => location.hash === "#c-marotte");
      const forward = await read();
      await tab.close();
      expect({ listed, forward }).toEqual({ listed: "list", forward: "marotte" });
    }, 60_000);
  });

  describe("the master and detail's address", () => {
    const N = "/navigation.html";
    /** The address, what the detail shows, the rows marked current, and the focused row's href. */
    const read = (tab: Page) =>
      tab.evaluate(() => {
        const root = document.getElementById("md");
        const title = document.getElementById("md-title");
        const docked = root?.hasAttribute("data-cp-docked") === true;
        const open = document.querySelector<HTMLDialogElement>("#md + dialog")?.open === true;
        const hidden = title?.closest<HTMLElement>(".cp-detail")?.hidden !== false;
        return {
          address: location.pathname + location.hash,
          shows: !hidden && (docked || open) ? (title?.textContent ?? "") : "nothing",
          current: [...(root?.querySelectorAll("a.cp-list-row[aria-current]") ?? [])].map((a) =>
            a.getAttribute("href"),
          ),
          focus: ((el) => el?.getAttribute("href") ?? (el?.id || el?.tagName))(
            document.activeElement,
          ),
          app: (history.state as Record<string, unknown> | null)?.["app"],
        };
      });
    /** Waits for `address`, a detail at rest (docked, in its open sheet, or
     *  back in the box once the sheet's exit has ended) and, when given, focus
     *  as `read` names it, which the sheet's close event can move last. */
    const at = async (tab: Page, address: string, focus?: string) => {
      await tab.waitForFunction(
        ({ a, f }) => {
          const root = document.getElementById("md");
          const dialog = document.querySelector<HTMLDialogElement>("#md + dialog");
          const detail = document.getElementById("md-title")?.closest<HTMLElement>(".cp-detail");
          if (location.pathname + location.hash !== a || !root || !dialog || !detail) {
            return false;
          }
          if (dialog.getAnimations().length > 0 || dialog.hasAttribute("data-cp-leaving")) {
            return false;
          }
          const home = !detail.hidden && !root.hasAttribute("data-cp-docked") ? dialog : root;
          const el = document.activeElement;
          return (
            detail.parentElement === home &&
            (home === root || dialog.open) &&
            (f === undefined || (el?.getAttribute("href") ?? (el?.id || el?.tagName)) === f)
          );
        },
        { a: address, f: focus },
        { timeout: 5000 },
      );
      return read(tab);
    };
    const press = async (tab: Page, href: string) => {
      await tab.locator(`#md a.cp-list-row[href="${href}"]`).focus();
      await tab.keyboard.press("Enter");
    };
    const closeDetail = (tab: Page) => tab.locator("#md-title ~ [data-detail-close]").click();
    const wired = (tab: Page) =>
      tab.waitForFunction(() => document.querySelector("[data-build]") !== null);

    it("closes after two presses onto the list, focusing the row it closed, and Back reopens it", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`).catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.close();
      expect({ closed, back }).toEqual({
        closed: {
          address: `${N}#detail`,
          shows: "nothing",
          current: [],
          focus: "#md/mushishi",
          app: undefined,
        },
        back: {
          address: `${N}#md/mushishi`,
          shows: "Mushishi",
          current: ["#md/mushishi"],
          focus: "md-title",
          app: undefined,
        },
      });
    }, 60_000);

    it("closes a loaded entry onto the list, focusing its row, and keeps the app's key on it", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await tab.evaluate(() => {
        history.replaceState({ ...(history.state as object), app: "loaded" }, "");
      });
      const loaded = await read(tab);
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`).catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.goForward();
      const forward = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.close();
      expect({
        loaded: loaded.focus,
        closed: [closed.address, closed.shows, closed.focus],
        back: [back.address, back.shows, back.app],
        left: left.address,
        forward: [forward.address, forward.shows, forward.app],
      }).toEqual({
        loaded: "BODY",
        closed: [`${N}#detail`, "nothing", "#md/mushishi"],
        back: [`${N}#md/mushishi`, "Mushishi", "loaded"],
        left: "/index.html",
        forward: [`${N}#md/mushishi`, "Mushishi", "loaded"],
      });
    }, 60_000);

    it("closes onto the list from a phone's load, focusing the row, and Back reopens it", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 390, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      const loaded = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`, "#md/mushishi").catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.close();
      expect({
        loaded: [loaded.shows, loaded.focus],
        closed: [closed.shows, closed.focus],
        back: [back.shows, back.focus],
        left: left.address,
      }).toEqual({
        loaded: ["Mushishi", "md-title"],
        closed: ["nothing", "#md/mushishi"],
        back: ["Mushishi", "md-title"],
        left: "/index.html",
      });
    }, 60_000);

    it("closes onto the list after a wide load moves into the phone's sheet, focusing the row", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await tab.setViewportSize({ width: 390, height: 800 });
      await tab.waitForFunction(
        () => document.querySelector<HTMLDialogElement>("#md + dialog")?.open === true,
      );
      const moved = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`, "#md/mushishi").catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.close();
      expect({
        moved: [moved.shows, moved.focus],
        closed: [closed.shows, closed.focus],
        back: back.shows,
      }).toEqual({
        moved: ["Mushishi", "md-title"],
        closed: ["nothing", "#md/mushishi"],
        back: "Mushishi",
      });
    }, 60_000);

    it("leaves focus and scroll where the page index's link took them when the detail closes", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await tab.locator('nav.g-index a[href="#tabs"]').focus();
      await tab.keyboard.press("Enter");
      const after = await at(tab, `${N}#tabs`).catch(() => read(tab));
      const where = await tab.evaluate(() => {
        const r = document.getElementById("tabs")?.getBoundingClientRect();
        return {
          top: r !== undefined && r.top >= 0 && r.top < innerHeight,
          inList: document.getElementById("md")?.contains(document.activeElement) === true,
        };
      });
      await tab.close();
      expect({ shows: after.shows, ...where }).toEqual({
        shows: "nothing",
        top: true,
        inList: false,
      });
    }, 60_000);

    it("keeps history and the page's scroll on a press on the open row, focusing its heading", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await at(tab, `${N}#md/mushishi`);
      // The row near the viewport's top puts the heading above it, out of view;
      // the reader's focus is on the row there.
      const before = await tab.evaluate(() => {
        const row = document.querySelector('#md a.cp-list-row[href="#md/mushishi"]');
        scrollTo(0, (row?.getBoundingClientRect().top ?? 0) + scrollY - 10);
        return { length: history.length, y: scrollY };
      });
      await tab.waitForFunction((y) => Math.abs(scrollY - y) <= 1, before.y);
      await tab.evaluate(() => {
        document
          .querySelector<HTMLElement>('#md a.cp-list-row[href="#md/mushishi"]')
          ?.focus({ preventScroll: true });
      });
      await tab.keyboard.press("Enter");
      await tab.waitForFunction(() => document.activeElement?.id === "md-title");
      const after = await tab.evaluate(() => ({ length: history.length, y: scrollY }));
      const state = await read(tab);
      await tab.close();
      expect({ ...after, address: state.address, shows: state.shows }).toEqual({
        ...before,
        address: `${N}#md/mushishi`,
        shows: "Mushishi",
      });
    }, 60_000);
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
