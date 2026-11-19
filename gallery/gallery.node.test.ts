import { readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type JSHandle,
  type Page,
} from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildGallery, frameNames, pageNames, templateNames } from "./build.js";

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
const SYSTEM_DIR = join(import.meta.dirname, "..", "docs", "system");
const SYSTEM_SCREENS = readdirSync(SYSTEM_DIR).filter((file) => file.endsWith(".html"));

type Marks = { id: string; forms: { range: Range; parents: HTMLElement[] }[] }[];

/** Runs in the page: each aria-required control to judge, with each Range of
 *  its mark that passes the text tests (`requiredWithoutMark` owns the rule). */
const requiredMarks = (): Marks => {
  const root = document.documentElement;
  const start =
    getComputedStyle(root).direction === "rtl" ? root.clientWidth - root.scrollWidth : 0;
  const inScrollArea = (rect: DOMRect): boolean =>
    Math.min(rect.right, start + root.scrollWidth - scrollX) -
      Math.max(rect.left, start - scrollX) >
      1 && Math.min(rect.bottom, root.scrollHeight - scrollY) - Math.max(rect.top, -scrollY) > 1;
  const over = (mark: Element, form: string, field: Element): Marks[number]["forms"] => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(mark, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      nodes.push(node as Text);
    }
    const text = nodes.map((node) => node.data).join("");
    const forms: Marks[number]["forms"] = [];
    for (let at = text.indexOf(form); at >= 0; at = text.indexOf(form, at + 1)) {
      const range = document.createRange();
      const parents = new Set<HTMLElement>();
      let base = 0;
      for (const node of nodes) {
        const end = base + node.data.length;
        if (at < end && base < at + form.length) {
          if (base <= at) {
            range.setStart(node, at - base);
          }
          if (at + form.length <= end) {
            range.setEnd(node, at + form.length - base);
          }
          if (node.parentElement !== null) {
            parents.add(node.parentElement);
          }
        }
        base = end;
      }
      const hidden = [...parents].some((parent) => {
        const away = parent.closest(".cp-visually-hidden");
        return away !== null && field.contains(away);
      });
      if (!hidden && [...range.getClientRects()].some(inScrollArea)) {
        forms.push({ range, parents: [...parents] });
      }
    }
    return forms;
  };
  return [...document.querySelectorAll<HTMLElement>('[aria-required="true"]')].flatMap(
    (control) => {
      const id = control.id !== "" ? control.id : control.outerHTML;
      const field = control.closest(".cp-field");
      if (field === null) {
        return [{ id, forms: [] }];
      }
      const marks: [Element, string][] = [
        ...[...field.querySelectorAll(".cp-help")]
          .filter((help) => help.textContent.trim() === "Required.")
          .map((help): [Element, string] => [help, "Required."]),
        ...[
          ...((control as Partial<HTMLInputElement>).labels ?? []),
          ...field.querySelectorAll(".cp-label"),
        ]
          .filter((label) => label.textContent.includes("(Required)"))
          .map((label): [Element, string] => [label, "(Required)"]),
      ];
      if (!control.checkVisibility()) {
        return marks.length === 0 ? [{ id, forms: [] }] : [];
      }
      return [{ id, forms: marks.flatMap(([mark, form]) => over(mark, form, field)) }];
    },
  );
};

/** Whether form `at`, a [control, form] index into `marks`, puts pixels on the
 *  screen. Turning its text's fill transparent moves no layout and no
 *  background, so only its glyphs can change the screenshot of its box. */
const paints = async (
  tab: Page,
  marks: JSHandle<Marks>,
  at: [number, number],
): Promise<boolean> => {
  const clip = await marks.evaluate((list, [i, j]) => {
    const form = list[i]?.forms[j];
    form?.parents[0]?.scrollIntoView({ block: "center", inline: "center" });
    const rect = form?.range.getBoundingClientRect() ?? new DOMRect();
    const [x, y] = [Math.max(0, Math.floor(rect.left)), Math.max(0, Math.floor(rect.top))];
    return {
      x,
      y,
      width: Math.min(innerWidth, Math.ceil(rect.right)) - x,
      height: Math.min(innerHeight, Math.ceil(rect.bottom)) - y,
    };
  }, at);
  if (clip.width < 1 || clip.height < 1) {
    return false;
  }
  const shot = (): Promise<Buffer> => tab.screenshot({ clip, animations: "disabled" });
  const before = await shot();
  const undo = await marks.evaluateHandle((list, [i, j]) => {
    const fill = "-webkit-text-fill-color";
    const kept = (list[i]?.forms[j]?.parents ?? []).map(
      (el) => [el, el.style.getPropertyValue(fill), el.style.getPropertyPriority(fill)] as const,
    );
    for (const [el] of kept) {
      el.style.setProperty(fill, "transparent", "important");
    }
    return () => {
      for (const [el, value, priority] of kept) {
        el.style.setProperty(fill, value, priority);
      }
    };
  }, at);
  const after = await shot();
  await undo.evaluate((restore) => {
    restore();
  });
  await undo.dispose();
  return !before.equals(after);
};

/** The id of each aria-required control with no mark from step 2 of the forms
 *  pattern on screen: a `.cp-help` reading "Required." or a label holding
 *  "(Required)". A form counts when no text node of its Range sits in a
 *  `.cp-visually-hidden` element of the field, a rect of it in the page's
 *  scroll area is over a pixel each way, and its pixels change when its text's
 *  fill turns transparent. A hidden control needs only the mark's text. */
const requiredWithoutMark = async (tab: Page): Promise<string[]> => {
  const marks = await tab.evaluateHandle(requiredMarks);
  const controls = await marks.evaluate((list) =>
    list.map(({ id, forms }) => [id, forms.length] as const),
  );
  const missing: string[] = [];
  for (const [i, [id, count]] of controls.entries()) {
    let painted = false;
    for (let j = 0; j < count && !painted; j++) {
      painted = await paints(tab, marks, [i, j]);
    }
    if (!painted) {
      missing.push(id);
    }
  }
  await marks.dispose();
  return missing;
};

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

  /** Presses Tab once: whether it reached the page's first tabbable element,
   *  what it reached, and the page's scroll after it. */
  const tabFromStart = async (tab: Page) => {
    await tab.keyboard.press("Tab");
    return tab.evaluate(() => {
      const first = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, summary, [tabindex]",
        ),
      ].find(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(":disabled") &&
          el.checkVisibility() &&
          el.closest("[inert], [hidden], dialog:not([open])") === null,
      );
      return {
        first: first !== undefined && document.activeElement === first,
        at: document.activeElement?.outerHTML.slice(0, 60) ?? "",
        y: scrollY,
      };
    });
  };

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
      | `unseen #${string}`
      | `unseen-chip #${string}`
      | `filter ${string}`
      | `focus #${string}`
      | `resize ${number}`
      | "author"
      | "ctrl-author"
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
      /** An element whose top must sit in the viewport. */
      readonly inView?: string;
      /** The page's scroll before a press on what is shown, and how far the
       *  heading lay outside the viewport: it must be wholly in view, the
       *  page moved by no more than that. */
      readonly reveal?: { readonly y: number; readonly most: number };
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
          const vh = document.documentElement.clientHeight;
          if (w.inView !== undefined) {
            const top = document.querySelector(w.inView)?.getBoundingClientRect().top;
            if (top === undefined || top < 0 || top >= vh) {
              out.push(`${w.inView}'s top at ${String(top)}`);
            }
          }
          if (w.reveal !== undefined) {
            const r = title?.getBoundingClientRect();
            const pad =
              Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            if (r === undefined || r.top < pad - 1 || r.bottom > vh + 1) {
              out.push(`heading at ${String(r?.top)} to ${String(r?.bottom)}`);
            }
            if (w.reveal.most < 0) {
              out.push("the heading was in view before the press");
            } else if (Math.abs(scrollY - w.reveal.y) > w.reveal.most + 1) {
              out.push(
                `page scrolled ${String(scrollY - w.reveal.y)}, past ${String(w.reveal.most)}`,
              );
            }
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
              // scrolls, and focuses its heading. The page leaves 10px of the
              // heading in view below the sticky bar's scroll padding, with the
              // reader's focus on what they press.
              const y = await tab.evaluate(() => {
                (window as unknown as Helpers).cpScroller().scrollTop = 120;
                const bottom = document.getElementById("msg-title")?.getBoundingClientRect().bottom;
                const pad =
                  Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                  0;
                scrollTo(0, (bottom ?? 0) + scrollY - pad - 10);
                return scrollY;
              });
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
            if (before !== undefined && KNOWN[new URL(before.href).hash.slice(1)] !== undefined) {
              // A press on another entry while one is shown replaces the entry.
              want = { ...want, length: before.length };
            }
            await enter(tab, selector);
            break;
          }
          case "unseen":
          case "unseen-chip": {
            const selector =
              verb === "unseen"
                ? `#msg-list a.cp-list-row[href="${arg}"]`
                : `#agent-history a.cp-filter-chip[href="${arg}"]`;
            // The heading lies 200px above the viewport when the reader presses.
            const out = await tab.evaluate(() => {
              const bottom = document.getElementById("msg-title")?.getBoundingClientRect().bottom;
              scrollTo(0, (bottom ?? 0) + scrollY + 200);
              return { y: scrollY };
            });
            await tab.waitForFunction((y) => Math.abs(scrollY - y) <= 1, out.y);
            const most = await tab.evaluate((sel) => {
              document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
              const r = document.getElementById("msg-title")?.getBoundingClientRect();
              // How far the heading lies above the band the sticky bar's scroll padding keeps clear.
              return r === undefined || r.bottom > 0
                ? -1
                : (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                    0) - r.top;
            }, selector);
            want = {
              ...want,
              ...(before === undefined ? {} : { length: before.length }),
              focus: "#msg-title",
              reveal: { y: out.y, most },
            };
            await tab.keyboard.press("Enter");
            break;
          }
          case "author":
            await enter(tab, '#msg-feed header > a[href="#agent-codex"]');
            want = { ...want, focus: focus ?? "#agent-codex", inView: "#agent-codex" };
            break;
          case "ctrl-author": {
            // Opens the agent in another tab, so this page navigates nothing.
            const link = '#msg-feed header > a[href="#agent-codex"]';
            await tab.locator(link).first().focus();
            await tab.keyboard.press("ControlOrMeta+Enter");
            want = { ...want, ...(before === undefined ? {} : { length: before.length }) };
            break;
          }
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
            want = {
              ...want,
              focus: focus ?? before?.closes ?? "body",
              ...(verb === "escape" && focus !== undefined ? { inView: focus } : {}),
            };
            await tab.evaluate(() => {
              (window as unknown as Helpers).cpWatch();
            });
            await (verb === "close"
              ? tab.locator(".cp-detail [data-detail-close]").click()
              : tab.keyboard.press("Escape"));
            break;
          case "back":
            await tab.goBack();
            want = focus === undefined ? want : { ...want, inView: focus };
            break;
          case "forward":
            await tab.goForward();
            break;
        }
        const left = await settle(tab, want);
        if ((verb === "load" || verb === "reload") && want.focus === "body") {
          // Invariant 3: a load moves no focus and no scroll, so Tab starts at the page's start.
          const y = await tab.evaluate(() => scrollY);
          if (verb === "load" && y > 1) {
            left.push(`load scrolled the page to ${String(y)}`);
          }
          const tabbed = await tabFromStart(tab);
          if (!tabbed.first || (verb === "load" && tabbed.y > 1)) {
            left.push(`Tab reached ${tabbed.at} at ${String(tabbed.y)}`);
          }
          // The next step starts from the load's focus again.
          await tab.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
          });
        }
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
        "Back and Forward through the list between two docked conversations, then Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", M],
          ["back", `${M}#c-internal`],
          ["forward", M],
          ["forward", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "the list, a press, a press on another row, Close, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "the list, a press, a press on another row, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["back", M, '#msg-list a[href="#c-announce"]'],
          ["forward", `${M}#c-announce`],
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
          ["author", `${M}#agent-codex`],
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
          ["author", `${M}#agent-codex`],
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
        "a press on the open row and on its chip with its heading out of view, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-internal", `${M}#c-internal`],
          ["unseen #c-internal", `${M}#c-internal`],
          ["unseen-chip #c-internal", `${M}#c-internal`],
          ["close", M, '#agent-history a[href="#c-internal"]'],
          ["back", `${M}#c-internal`],
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
          ["back", "/index.html"],
          ["forward", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
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
        "a phone's press, an author link, Back, Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["author", `${M}#agent-codex`],
          ["back", `${M}#c-marotte`],
          ["close", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a press, Ctrl+Enter on an author link, Back",
        W,
        AFTER,
        [
          ["load messages.html#agent-kiro", `${M}#agent-kiro`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["back", `${M}#agent-kiro`, '#msg-list a[href="#c-marotte"]'],
        ],
      ],
      [
        "a phone's press, Ctrl+Enter on an author link, Back",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["back", M, '#msg-list a[href="#c-marotte"]'],
        ],
      ],
      [
        "a phone's press, Ctrl+Enter on an author link, Escape",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["escape", M, '#msg-list a[href="#c-marotte"]'],
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

    // Each target names this top-level page, so the press navigates it.
    it.each([
      ["no target", null, null],
      ["target=_SELF", "_SELF", null],
      ["target=_top", "_top", null],
      ["target=_Parent", "_Parent", null],
      ["target=the window's name", "md-page", "md-page"],
    ] as const)(
      "replaces the entry on a press on another row while one is open, so Close ends on the list, %s",
      async (_, target, name) => {
        const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
        await tab.goto(`${origin}/index.html`);
        await tab.goto(`${origin}${N}`);
        await wired(tab);
        if (target !== null) {
          await tab.locator('#md a.cp-list-row[href="#md/mushishi"]').evaluate(
            (a, [t, n]) => {
              a.setAttribute("target", t);
              if (n !== null) {
                window.name = n;
              }
            },
            [target, name] as const,
          );
        }
        await press(tab, "#md/frieren");
        await at(tab, `${N}#md/frieren`);
        const opened = await tab.evaluate(() => history.length);
        await press(tab, "#md/mushishi");
        const second = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
        const replaced = await tab.evaluate(() => history.length);
        await closeDetail(tab);
        const closed = await at(tab, N).catch(() => read(tab));
        const length = await tab.evaluate(() => history.length);
        await tab.goForward();
        const forward = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
        await tab.close();
        expect({ second: second.shows, replaced, closed, length, forward: forward.shows }).toEqual({
          second: "Mushishi",
          replaced: opened,
          closed: {
            address: N,
            shows: "nothing",
            current: [],
            focus: "#md/mushishi",
            app: undefined,
          },
          length: opened,
          forward: "Mushishi",
        });
      },
      60_000,
    );

    it("leaves a press on another row to the browser when the page's base opens a new window", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`);
      const opened = await tab.evaluate(() => {
        const base = document.createElement("base");
        base.target = "_blank";
        document.head.append(base);
        return history.length;
      });
      const popup = tab.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
      await press(tab, "#md/mushishi");
      const other = await popup;
      const url = other === null ? null : new URL(other.url());
      await other?.close();
      const stays = await at(tab, `${N}#md/frieren`).catch(() => read(tab));
      const length = await tab.evaluate(() => history.length);
      await tab.close();
      expect({
        popup: url === null ? null : url.pathname + url.hash,
        shows: stays.shows,
        length,
      }).toEqual({
        popup: `${N}#md/mushishi`,
        shows: "Frieren: Beyond Journey's End",
        length: opened,
      });
    }, 60_000);

    it("ends on the list on Back after a press on another row while one is open", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await tab.goBack();
      const back = await at(tab, N).catch(() => read(tab));
      await tab.close();
      expect(back).toEqual({
        address: N,
        shows: "nothing",
        current: [],
        focus: "#md/mushishi",
        app: undefined,
      });
    }, 60_000);

    it("closes onto the list after a deep link and a press on another row, and Back reopens the last", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/frieren`);
      await wired(tab);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`).catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.close();
      expect({
        closed: [closed.address, closed.shows],
        back: back.shows,
        left: left.address,
      }).toEqual({
        closed: [`${N}#detail`, "nothing"],
        back: "Mushishi",
        left: "/index.html",
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
      const loadY = await tab.evaluate(() => scrollY);
      const tabbed = await tabFromStart(tab);
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
        loaded: [loaded.focus, loadY],
        tabbed: [tabbed.first, tabbed.y],
        closed: [closed.address, closed.shows, closed.focus],
        back: [back.address, back.shows, back.app],
        left: left.address,
        forward: [forward.address, forward.shows, forward.app],
      }).toEqual({
        loaded: ["BODY", 0],
        tabbed: [true, 0],
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

    it("ends on the page index's link target, its top in view, when the detail closes", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await tab.locator('nav.g-index a[href="#tabs"]').focus();
      await tab.keyboard.press("Enter");
      const after = await at(tab, `${N}#tabs`, "tabs").catch(() => read(tab));
      const top = await tab.evaluate(() => {
        const r = document.getElementById("tabs")?.getBoundingClientRect();
        return r !== undefined && r.top >= 0 && r.top < innerHeight;
      });
      await tab.close();
      expect({ shows: after.shows, focus: after.focus, top }).toEqual({
        shows: "nothing",
        focus: "tabs",
        top: true,
      });
    }, 60_000);

    /** Loads Mushishi docked, scrolls the page so the heading's bottom sits
     *  `bottom` px below the band the sticky bar's scroll padding keeps clear,
     *  and presses its open row there. */
    const pressShown = async (bottom: number, target?: string) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await at(tab, `${N}#md/mushishi`);
      if (target !== undefined) {
        await tab.locator('#md a.cp-list-row[href="#md/mushishi"]').evaluate((a, t) => {
          a.setAttribute("target", t);
        }, target);
      }
      const before = await tab.evaluate((b) => {
        const r = document.getElementById("md-title")?.getBoundingClientRect();
        scrollTo(
          0,
          (r?.bottom ?? 0) +
            scrollY -
            (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) -
            b,
        );
        return { length: history.length, y: scrollY };
      }, bottom);
      await tab.waitForFunction((y) => Math.abs(scrollY - y) <= 1, before.y);
      const out = await tab.evaluate(() => {
        document
          .querySelector<HTMLElement>('#md a.cp-list-row[href="#md/mushishi"]')
          ?.focus({ preventScroll: true });
        const pad =
          Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        return pad - (document.getElementById("md-title")?.getBoundingClientRect().top ?? 0);
      });
      await tab.keyboard.press("Enter");
      await tab.waitForFunction(() => document.activeElement?.id === "md-title");
      const after = await tab.evaluate(() => {
        const r = document.getElementById("md-title")?.getBoundingClientRect();
        const vh = document.documentElement.clientHeight;
        return {
          length: history.length,
          y: scrollY,
          seen:
            r !== undefined &&
            r.top >=
              (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                0) -
                1 &&
            r.bottom <= vh + 1,
        };
      });
      const state = await read(tab);
      await tab.close();
      return { before, out, after, address: state.address, shows: state.shows };
    };

    it.each([
      ["no target", undefined],
      ["target=_self", "_self"],
    ] as const)(
      "keeps history and the page's scroll on a press on the open row, focusing its heading, %s",
      async (_, target) => {
        // 10px of the heading stays in view.
        const { before, after, address, shows } = await pressShown(10, target);
        expect({ length: after.length, y: after.y, address, shows }).toEqual({
          ...before,
          address: `${N}#md/mushishi`,
          shows: "Mushishi",
        });
      },
      60_000,
    );

    it("brings the heading into view on a press on the open row when none of it is in view", async () => {
      const { before, out, after, address, shows } = await pressShown(-200);
      expect({
        length: after.length,
        seen: after.seen,
        within: out > 0 && Math.abs(after.y - before.y) <= out + 1,
        address,
        shows,
      }).toEqual({
        length: before.length,
        seen: true,
        within: true,
        address: `${N}#md/mushishi`,
        shows: "Mushishi",
      });
    }, 60_000);
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

  // An empty `required` field matches :invalid at rest, and Firefox and WebKit
  // then expose it as an invalid entry before anything was typed (WCAG 2.2
  // 3.3.1), so the composer marks its fields aria-required and checks on send.
  it("reads no field of the messages composer as invalid before anything is typed", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.goto(`${origin}/messages.html`);
    const fields = await tab.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("#msg-compose .cp-input")].map((field) => ({
        name: field.name,
        invalid: field.matches(":invalid") || field.getAttribute("aria-invalid") === "true",
        required: field.getAttribute("aria-required"),
        help: [...(field.closest(".cp-field")?.querySelectorAll(".cp-help") ?? [])].map((help) =>
          help.textContent.trim(),
        ),
      })),
    );
    await tab.close();
    expect(fields).toEqual(
      ["subject", "body"].map((name) => ({
        name,
        invalid: false,
        required: "true",
        help: ["Required."],
      })),
    );
  }, 60_000);

  it("finds each required field that shows no Required mark", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.setContent(`
      <div class="cp-field"><label for="a">A</label><input id="a" aria-required="true"><span class="cp-help">Required.</span></div>
      <div class="cp-field"><label for="b">B (Required)</label><input id="b" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="c">C</label><input id="c" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="d">D</label><input id="d" aria-required="true"><span class="cp-help" hidden>Required.</span></div>
      <div class="cp-field"><label for="e">E</label><input id="e" aria-required="true"><span class="cp-help" style="position:absolute;width:1px;height:1px;overflow:hidden">Required.</span></div>
      <label for="f">F</label><input id="f" aria-required="true">
      <div class="cp-field" hidden><label for="g">G</label><input id="g" aria-required="true"><span class="cp-help">Required.</span></div>
      <div class="cp-field"><label for="h">H</label><input id="h" aria-required="false"></div>
      <div class="cp-field"><label for="i">I <span class="cp-visually-hidden">(Required)</span></label><input id="i" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="j">J</label><input id="j" aria-required="true"><span class="cp-help" style="visibility:hidden">Required.</span></div>
      <div class="cp-field"><label for="k">K</label><input id="k" aria-required="true"><span class="cp-help" style="opacity:0">Required.</span></div>
      <div class="cp-field"><label for="l">L</label><input id="l" aria-required="true"><span class="cp-help" style="position:absolute;left:-9999px">Required.</span></div>
      <div class="cp-field"><label for="m">M</label><input id="m" aria-required="true"><span class="cp-help" style="display:block;clip-path:inset(50%)">Required.</span></div>
      <div class="cp-field"><label for="n">N</label><input id="n" aria-required="true"><span class="cp-help">Not Required.</span></div>
      <div class="cp-field"><label for="o">O</label><input id="o" aria-required="true"><span class="cp-help" style="position:absolute;clip:rect(0 0 0 0)">Required.</span></div>
      <div class="cp-field"><label class="cp-label" for="p">P <span>(Required)</span></label><input id="p" aria-required="true"></div>
      <div class="cp-field"><label for="q">Q</label><input id="q" aria-required="true"><span class="cp-help" style="display:block;content-visibility:hidden">Required.</span></div>
      <div class="cp-field"><label for="r">R</label><input id="r" aria-required="true"><span class="cp-help" style="color:transparent">Required.</span></div>
      <div class="cp-field"><label for="s">S</label><input id="s" aria-required="true"><span class="cp-help" style="filter:opacity(0)">Required.</span></div>
      <div class="cp-field"><label for="t">T</label><input id="t" aria-required="true"><span class="cp-help" style="color:#fff;background:#fff">Required.</span></div>
      <div class="cp-field"><label for="u">U</label><input id="u" aria-required="true"><span class="cp-help" style="position:relative">Required.<span style="position:absolute;inset:-4px;background:#fff"></span></span></div>
      <div class="cp-field"><label for="v">V</label><input id="v" aria-required="true"><span class="cp-help" style="display:block;contain:paint;height:0">Required.</span></div>
      <div class="cp-field"><label class="cp-label" for="w">W (<b>Required</b>)</label><input id="w" aria-required="true"></div>
      <div class="cp-field"><label for="x">X</label><input id="x" aria-required="true"><span class="cp-help">Required<span>.</span></span></div>
      <div class="cp-field"><label for="y">Y Not Required <span class="cp-visually-hidden">(Required)</span></label><input id="y" aria-required="true"></div>`);
    const missing = await requiredWithoutMark(tab);
    await tab.close();
    expect(missing).toEqual([..."cdefijklmno", ..."qrstuv", "y"]);
  }, 60_000);

  it.each([...pageNames, ...templateNames])(
    "shows Required on every required field of %s",
    async (page) => {
      const tab = await (browser as Browser).newPage();
      await tab.goto(`${origin}/${page}.html`);
      const missing = await requiredWithoutMark(tab);
      await tab.close();
      expect(missing).toEqual([]);
    },
    60_000,
  );

  it.each(SYSTEM_SCREENS)(
    "shows Required on every required field of the reference screen %s",
    async (file) => {
      const tab = await (browser as Browser).newPage();
      await tab.goto(pathToFileURL(join(SYSTEM_DIR, file)).href);
      const missing = await requiredWithoutMark(tab);
      await tab.close();
      expect(missing).toEqual([]);
    },
    60_000,
  );

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
