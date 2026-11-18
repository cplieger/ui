import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import type * as Axe from "axe-core";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type ElementHandle,
  type JSHandle,
  type Page,
} from "playwright";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";

import { frameNames, pageNames } from "./build.js";
import { serve, serveGallery, type Served } from "./serve.js";

const ROOT = resolve(import.meta.dirname, "..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const ENGINES = { chromium, firefox, webkit } as const satisfies Record<string, BrowserType>;
const BROWSERS = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",");
// Selected by id, each ruled in docs/accessibility.md "axe rules": a tag
// selection drops the experimental rules that test adopted criteria.
const EVERY: readonly string[] = [
  "accesskeys",
  "area-alt",
  "aria-allowed-attr",
  "aria-allowed-role",
  "aria-braille-equivalent",
  "aria-command-name",
  "aria-conditional-attr",
  "aria-deprecated-role",
  "aria-dialog-name",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-input-field-name",
  "aria-meter-name",
  "aria-progressbar-name",
  "aria-prohibited-attr",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-tab-name",
  "aria-text",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-treeitem-name",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "autocomplete-valid",
  "avoid-inline-spacing",
  "blink",
  "button-name",
  "bypass",
  "color-contrast",
  "css-orientation-lock",
  "definition-list",
  "dlitem",
  "document-title",
  "duplicate-id",
  "duplicate-id-active",
  "duplicate-id-aria",
  "empty-heading",
  "empty-table-header",
  "focus-order-semantics",
  "form-field-multiple-labels",
  "frame-focusable-content",
  "frame-tested",
  "frame-title",
  "frame-title-unique",
  "heading-order",
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "identical-links-same-purpose",
  "image-alt",
  "image-redundant-alt",
  "input-button-name",
  "input-image-alt",
  "label",
  "label-content-name-mismatch",
  "label-title-only",
  "landmark-banner-is-top-level",
  "landmark-contentinfo-is-top-level",
  "landmark-main-is-top-level",
  "landmark-no-duplicate-banner",
  "landmark-no-duplicate-contentinfo",
  "landmark-no-duplicate-main",
  "landmark-one-main",
  "landmark-unique",
  "link-in-text-block",
  "link-name",
  "list",
  "listitem",
  "marquee",
  "meta-refresh",
  "meta-refresh-no-exceptions",
  "meta-viewport",
  "meta-viewport-large",
  "nested-interactive",
  "no-autoplay-audio",
  "object-alt",
  "p-as-heading",
  "page-has-heading-one",
  "presentation-role-conflict",
  "region",
  "role-img-alt",
  "scope-attr-valid",
  "scrollable-region-focusable",
  "select-name",
  "server-side-image-map",
  "skip-link",
  "summary-name",
  "svg-img-alt",
  "tabindex",
  "table-duplicate-name",
  "table-fake-caption",
  "target-size",
  "td-has-header",
  "td-headers-attr",
  "th-has-data-cells",
  "valid-lang",
  "video-caption",
];
/** axe's page-level rules, which it runs only on the whole document. */
const PAGE_LEVEL: readonly string[] = ["bypass"];
/** Run only under `prefers-contrast: more`, where the 7:1 pairs hold. */
const CONTRAST_MORE: readonly string[] = ["color-contrast-enhanced"];
const OUT: readonly string[] = [
  "aria-roledescription",
  "audio-caption",
  "hidden-content",
  "landmark-complementary-is-top-level",
];
// axe files these rules' real failures as needs review.
const REVIEW_FAILS: readonly string[] = [
  "aria-braille-equivalent",
  "aria-prohibited-attr",
  "bypass",
  "duplicate-id-aria",
  "frame-title-unique",
  "identical-links-same-purpose",
  "no-autoplay-audio",
];

interface State {
  readonly width: number;
  readonly height: number;
  readonly theme: "light" | "dark";
  readonly contrast?: "more";
}

const STATES: readonly State[] = [1440, 390].flatMap((width) =>
  (["light", "dark"] as const).map((theme) => ({
    width,
    height: width === 390 ? 844 : 900,
    theme,
  })),
);
// docs/design-colour.md "Contrast" holds the 7:1 pairs in both themes.
const MORE: readonly State[] = STATES.filter((s) => s.width === 1440).map((s) => ({
  ...s,
  contrast: "more" as const,
}));
const EVERY_STATE: readonly State[] = [...STATES, ...MORE];

/** The rules a state runs: under more contrast only the 7:1 pairs are new. */
const rulesOf = (state: State): readonly string[] =>
  state.contrast === undefined ? EVERY : CONTRAST_MORE;

const OVERLAY = "[popover], dialog";
// Buttons whose overlay the gallery's script builds on the press (gallery/wire),
// so the page at rest holds nothing to open.
const MADE_ON_PRESS =
  "button[data-ask], button[data-toast], [data-toast-kind], [data-toast-undo], [data-toast-sticky], [data-toast-busy]";

type How = "click" | "keys" | "hover" | "script" | "none";
/** Whether an overlay opened, stayed shut, or has nothing on its page to open it. */
type Shown = "open" | "shut" | "absent";

interface Found {
  readonly id: string;
  /** Each failing node's target, frames joined by ` >> `. */
  readonly nodes: readonly string[];
}

interface Run {
  /** The rules given that axe reported in none of its four lists. */
  readonly unrun: readonly string[];
  /** Whether axe checked part of the page, which skips `PAGE_LEVEL`. */
  readonly scoped: boolean;
  readonly violations: readonly Found[];
  readonly incomplete: readonly Found[];
}

function label(state: State): string {
  const at = `${state.theme} ${String(state.width)}`;
  return state.contrast === undefined ? at : `${at} more contrast`;
}

type Engine = "chromium" | "firefox" | "webkit";

/** Every failure, keyed by rule and state, and what goes to the annotations. */
class Report {
  readonly failed: Record<string, string[]> = {};
  private readonly review = new Map<string, Set<string>>();
  private readonly scripted: string[] = [];
  private readonly notes: string[] = [];

  fail(key: string, nodes: readonly string[] = []): void {
    (this.failed[key] ??= []).push(...nodes);
  }

  add(run: Run, at: string): void {
    const unrun = run.unrun.filter((id) => !run.scoped || !PAGE_LEVEL.includes(id));
    if (unrun.length > 0) {
      this.fail(`axe did not run, ${at}`, unrun);
    }
    for (const v of run.violations) {
      this.fail(`${v.id}, ${at}`, v.nodes);
    }
    for (const i of run.incomplete) {
      if (REVIEW_FAILS.includes(i.id)) {
        this.fail(`${i.id} needs review, ${at}`, i.nodes);
        continue;
      }
      const nodes = this.review.get(i.id) ?? new Set();
      this.review.set(i.id, nodes);
      for (const node of i.nodes) {
        nodes.add(`${at}: ${node}`);
      }
    }
  }

  /** Records an overlay opened by script, which has no control to open it by. */
  openedByScript(overlay: string): void {
    if (!this.scripted.includes(overlay)) {
      this.scripted.push(overlay);
    }
  }

  /** Records the SVG text in `low`, from `svgText`. */
  svgText(low: readonly string[], at: string): void {
    if (low.length > 0) {
      this.fail(`svg text contrast, ${at}`, low);
    }
  }

  note(text: string): void {
    this.notes.push(text);
  }

  async annotate(annotate: TestContext["annotate"]): Promise<void> {
    for (const text of this.notes) {
      await annotate(text, "notice");
    }
    if (this.review.size > 0) {
      await annotate(
        `needs review: ${[...this.review].map(([id, nodes]) => `${id} (${String(nodes.size)})`).join(", ")}`,
        "notice",
        {
          contentType: "application/json",
          body: JSON.stringify(
            Object.fromEntries([...this.review].map(([id, n]) => [id, [...n]])),
            null,
            1,
          ),
        },
      );
    }
    if (this.scripted.length > 0) {
      await annotate(`opened by script: ${this.scripted.join(", ")}`, "notice");
    }
  }
}

/** Ends every running animation that ends, so colours are read at rest. */
async function settle(tab: Page): Promise<void> {
  await tab.evaluate(async () => {
    // A loop or a paused animation never ends. One with more than 2 s left
    // is a timer, as a toast's countdown, whose end removes the toast.
    const ms = (v: CSSNumberish | null | undefined): number =>
      typeof v === "number" ? v : Number.POSITIVE_INFINITY;
    const left = (a: Animation): number => {
      const t = a.effect?.getComputedTiming();
      return ms(t?.endTime) - ms(t?.localTime ?? 0);
    };
    // WebKit can start an overlay's entrance a frame after it opens, so each
    // round looks again until a frame starts nothing new.
    for (let round = 0; round < 10; round++) {
      await new Promise<number>((ok) => requestAnimationFrame(ok));
      const ending = document
        .getAnimations()
        .filter((a) => a.playState === "running" && left(a) <= 2_000);
      if (ending.length === 0) {
        return;
      }
      for (const a of ending) {
        a.finish();
      }
    }
  });
}

async function open(browser: Browser, url: string, state: State): Promise<Page> {
  const tab = await browser.newPage({
    viewport: { width: state.width, height: state.height },
    ...(state.contrast === undefined ? {} : { contrast: state.contrast }),
  });
  await tab.goto(url);
  await tab.evaluate(async (theme) => {
    document.documentElement.dataset["theme"] = theme;
    await document.fonts.ready;
  }, state.theme);
  await settle(tab);
  return tab;
}

/** Runs `rules` over the page and every frame in it, or over `scope` alone. */
async function check(
  tab: Page,
  rules: readonly string[],
  scope?: JSHandle<Element[]>,
): Promise<Run> {
  for (const frame of tab.frames()) {
    if (!(await frame.evaluate(() => "axe" in window))) {
      await frame.addScriptTag({ path: AXE });
    }
  }
  return tab.evaluate(
    async ([values, within]) => {
      const { axe } = window as unknown as { axe: typeof Axe };
      // A frame axe cannot reach would otherwise pass as needs review.
      axe.configure({ checks: [{ id: "frame-tested", options: { isViolation: true } }] });
      const result = await axe.run(within ?? document, {
        runOnly: { type: "rule", values: [...values] },
        resultTypes: ["violations", "incomplete"],
      });
      const found = (list: Axe.Result[]): Found[] =>
        list.map((r) => ({
          id: r.id,
          nodes: r.nodes.map((n) => n.target.map(String).join(" >> ")),
        }));
      const ran = new Set(
        [result.passes, result.violations, result.incomplete, result.inapplicable].flatMap((l) =>
          l.map((r) => r.id),
        ),
      );
      return {
        unrun: values.filter((id) => !ran.has(id)),
        scoped: within !== undefined,
        violations: found(result.violations),
        incomplete: found(result.incomplete),
      };
    },
    [rules, scope] as const,
  );
}

/** The least ratio WCAG 1.4.3 asks of text, or 1.4.6 under more contrast. */
function least(state: State, large: boolean): number {
  if (state.contrast === undefined) {
    return large ? 3 : 4.5;
  }
  return large ? 4.5 : 7;
}

/** A `svg text` as the contrast check reads it. */
interface Ink {
  /** Its outermost svg's place among the page's, and its own place in that
   *  svg, which a redraw of the svg keeps. */
  readonly key: string;
  readonly name: string;
  /** Its fill in sRGB, 0 to 255, with alpha 0 to 1 after fill-opacity and opacity. */
  readonly rgba: readonly [number, number, number, number];
  /** A wide opaque halo's sRGB, a stroke painted under the fill, which is
   *  then the background of every glyph. */
  readonly halo: readonly [number, number, number] | null;
  readonly large: boolean;
  /** Its box in the screenshot, CSS px. */
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

type Texts = (within?: readonly Element[]) => Map<string, SVGTextElement>;

/**
 * Each visible `svg text` in `scope`, or on the page, whose fill holds less
 * than `least` against what is under its glyphs, as "name: ratio" in page
 * order. Each text not yet measured is scrolled into view with the others
 * then on screen. A screenshot with every fill transparent shows what is
 * behind them, and one per probe colour shows which pixels they cover.
 */
async function svgText(tab: Page, state: State, scope?: JSHandle<Element[]>): Promise<string[]> {
  // A chart draws its text again as new nodes after each font `loading`
  // event, which WebKit fires whenever a sheet changes, Playwright's own
  // per shot included. So texts are found by place, never by node, the one
  // sheet goes in first, and an attribute on the root switches it.
  const keys = await tab.evaluate(
    async ([within, probes]) => {
      const texts: Texts = (inside) => {
        const found = new Map<string, SVGTextElement>();
        const roots = [...document.querySelectorAll("svg")].filter(
          (s) => s.ownerSVGElement === null,
        );
        roots.forEach((root, r) => {
          root.querySelectorAll("text").forEach((t, n) => {
            const b = t.getBoundingClientRect();
            if (
              (inside === undefined || inside.some((w) => w.contains(t))) &&
              t.textContent.trim() !== "" &&
              b.width > 0 &&
              b.height > 0 &&
              t.checkVisibility({ opacityProperty: true, visibilityProperty: true })
            ) {
              found.set(`${String(r)} ${String(n)}`, t);
            }
          });
        });
        return found;
      };
      (window as unknown as { a11yTexts: Texts }).a11yTexts = texts;
      const sheet = document.head.appendChild(document.createElement("style"));
      sheet.id = "a11y-ink";
      // No shot paints a stroke: under a transparent fill Firefox shows what
      // lies inside a glyph, not its halo, so a halo is read from the style,
      // and a narrow stroke is part of the letter, never its background.
      sheet.textContent = [
        `[data-a11y-ink] svg text { transition: none !important; stroke: none !important; }`,
        `[data-a11y-ink="clear"] svg text { fill: transparent !important; }`,
        ...probes.map(
          (p) =>
            `[data-a11y-ink="${p.name}"] svg text { fill: rgb(${p.rgb.join(" ")}) !important; }`,
        ),
      ].join("\n");
      // Fixed and sticky bars, and the scroll positions to restore.
      for (const e of document.querySelectorAll<HTMLElement>("body *:not(svg *)")) {
        if (
          ["fixed", "sticky"].includes(getComputedStyle(e).position) &&
          e.querySelector("svg text") === null
        ) {
          e.dataset["a11yBar"] = "";
        }
        if (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight) {
          e.dataset["a11yScroll"] = `${String(e.scrollLeft)} ${String(e.scrollTop)}`;
        }
      }
      document.documentElement.dataset["a11yScroll"] = `${String(scrollX)} ${String(scrollY)}`;
      await document.fonts.ready;
      return [...texts(within).keys()];
    },
    [scope, PROBES] as const,
  );
  await settle(tab);
  const low = new Map<string, string>();
  const done = new Set<string>();
  for (const next of keys) {
    if (done.has(next)) {
      continue;
    }
    // Scrolling the text, not its svg, also scrolls each box that clips it.
    // It then sits a quarter down, clear of a sticky header, so most of the
    // view is texts still to measure.
    await tab.evaluate(
      ([k, within]) => {
        const t = (window as unknown as { a11yTexts: Texts }).a11yTexts(within).get(k);
        t?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
        const top = t?.getBoundingClientRect().top ?? 0;
        scrollBy({ top: top - innerHeight / 4, behavior: "instant" });
      },
      [next, scope] as const,
    );
    const [clip, inks] = await readInks(tab, next, [...done], scope);
    if (inks.length === 0) {
      done.add(next);
      continue;
    }
    const shots: string[] = [];
    for (const ink of ["clear", ...PROBES.map((p) => p.name), null]) {
      await tab.evaluate((i) => {
        if (i === null) {
          delete document.documentElement.dataset["a11yInk"];
        } else {
          document.documentElement.dataset["a11yInk"] = i;
        }
      }, ink);
      if (ink !== null) {
        // Playwright's `caret: "hide"` adds a sheet a shot.
        shots.push(
          (await tab.screenshot({ clip, scale: "css", caret: "initial" })).toString("base64"),
        );
      }
    }
    const ratios = await measure(tab, shots, inks);
    inks.forEach((ink, i) => {
      const ratio = ratios[i] ?? Number.POSITIVE_INFINITY;
      if (ratio === Number.POSITIVE_INFINITY && ink.key !== next) {
        return;
      }
      done.add(ink.key);
      const want = least(state, ink.large);
      if (ratio === Number.POSITIVE_INFINITY) {
        low.set(ink.key, `${ink.name}: no glyph on screen`);
      } else if (ratio < want) {
        low.set(ink.key, `${ink.name}: ${ratio.toFixed(2)}:1, under ${String(want)}:1`);
      }
    });
  }
  // A later check of the same page reads it where this one found it.
  await tab.evaluate(() => {
    document.getElementById("a11y-ink")?.remove();
    delete document.documentElement.dataset["a11yInk"];
    for (const e of document.querySelectorAll<HTMLElement>("[data-a11y-scroll]")) {
      const [left = 0, top = 0] = (e.dataset["a11yScroll"] ?? "").split(" ").map(Number);
      (e === document.documentElement ? window : e).scrollTo({ left, top, behavior: "instant" });
    }
    for (const e of document.querySelectorAll<HTMLElement>("[data-a11y-bar], [data-a11y-scroll]")) {
      delete e.dataset["a11yBar"];
      delete e.dataset["a11yScroll"];
    }
  });
  return keys.flatMap((k) => {
    const line = low.get(k);
    return line === undefined ? [] : [line];
  });
}

/** Text `next` and the texts on screen that are not in `done`, with the
 *  screenshot box that holds them. */
async function readInks(
  tab: Page,
  next: string,
  done: readonly string[],
  scope?: JSHandle<Element[]>,
): Promise<[{ x: number; y: number; width: number; height: number }, Ink[]]> {
  return tab.evaluate(
    ([n, skip, within]) => {
      const all = (window as unknown as { a11yTexts: Texts }).a11yTexts(within);
      // A fixed or sticky bar, and its shadow, can lie over a text, which
      // it then darkens without hiding.
      const bars = [...document.querySelectorAll("[data-a11y-bar]")].map((e) =>
        e.getBoundingClientRect(),
      );
      const onScreen = (t: SVGTextElement): boolean => {
        const b = t.getBoundingClientRect();
        return (
          b.left >= 0 &&
          b.top >= 0 &&
          b.right <= innerWidth &&
          b.bottom <= innerHeight &&
          bars.every(
            (r) =>
              b.right < r.left - 16 ||
              b.left > r.right + 16 ||
              b.bottom < r.top - 16 ||
              b.top > r.bottom + 16,
          )
        );
      };
      const texts = [...all].filter(([k, t]) => k === n || (!skip.includes(k) && onScreen(t)));
      const boxes = texts.map(([, t]) => t.getBoundingClientRect());
      const x = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.left))));
      const y = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.top))));
      const right = Math.min(innerWidth, Math.ceil(Math.max(...boxes.map((b) => b.right))));
      const bottom = Math.min(innerHeight, Math.ceil(Math.max(...boxes.map((b) => b.bottom))));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const inks = texts.map(([key, t], i) => {
        const css = getComputedStyle(t);
        let alpha = Number(css.fillOpacity);
        for (let e: Element | null = t; e !== null; e = e.parentElement) {
          alpha *= Number(getComputedStyle(e).opacity);
        }
        const srgb = (colour: string): number[] => {
          g?.clearRect(0, 0, 1, 1);
          if (g !== null && CSS.supports("color", colour)) {
            g.fillStyle = colour;
            g.fillRect(0, 0, 1, 1);
          }
          return [...(g?.getImageData(0, 0, 1, 1).data ?? [])];
        };
        const [red = 0, green = 0, blue = 0, a = 0] = srgb(css.fill);
        const [hr = 0, hg = 0, hb = 0, ha = 0] = srgb(css.stroke);
        const size = Number.parseFloat(css.fontSize);
        // WCAG 2.2's contrast ratio, Note 5: a narrow border around a letter
        // is part of the letter, and only a wide one that fills the letters'
        // inner details is background. A quarter of the font size fills them.
        const halo =
          css.paintOrder.startsWith("stroke") &&
          Number.parseFloat(css.strokeWidth) >= size / 4 &&
          ha === 255 &&
          Number(css.strokeOpacity) === 1
            ? ([hr, hg, hb] as const)
            : null;
        const b = boxes[i] ?? new DOMRect();
        const where =
          t.closest(".card")?.querySelector("h2")?.textContent ??
          t.closest("[aria-label]")?.getAttribute("aria-label") ??
          document.title;
        return {
          key,
          name: `${where}: "${t.textContent.trim().slice(0, 40)}"`,
          rgba: [red, green, blue, (a / 255) * alpha] as const,
          halo,
          large: size >= 24 || (size >= 18.66 && Number(css.fontWeight) >= 700),
          box: { x: b.left - x, y: b.top - y, w: b.width, h: b.height },
        };
      });
      return [
        { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
        inks,
      ] as const;
    },
    [next, done, scope] as const,
  );
}

/** The fills a screenshot paints every svg text in, to see which pixels it
 *  covers, as `[data-a11y-ink]` names them. They differ by 255 on every
 *  channel, so one of them is at least 128 from any background. */
const PROBES = [
  { name: "magenta", rgb: [255, 0, 255] },
  { name: "green", rgb: [0, 255, 0] },
] as const;

/** Each ink's least WCAG contrast over the pixels its glyphs cover, or
 *  Infinity where it covers none. `shots` are the clear shot, then one per
 *  probe in `PROBES` order. */
async function measure(
  tab: Page,
  shots: readonly string[],
  inks: readonly Ink[],
): Promise<number[]> {
  return tab.evaluate(
    async ([pngs, list, colours]) => {
      const pixels = await Promise.all(
        pngs.map(async (b64) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(image.width, image.height);
          const g = canvas.getContext("2d", { willReadFrequently: true });
          g?.drawImage(image, 0, 0);
          return {
            w: image.width,
            h: image.height,
            data: g?.getImageData(0, 0, image.width, image.height).data,
          };
        }),
      );
      const [under, ...probes] = pixels;
      // WCAG 2.2's relative luminance of an sRGB colour, 0 to 255 a channel.
      const lum = (rgb: readonly number[]): number => {
        const [r = 0, g = 0, b = 0] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return list.map((ink) => {
        let low = Number.POSITIVE_INFINITY;
        const u = under?.data;
        const shown = probes.flatMap((p, n) =>
          p.data === undefined ? [] : [{ rgb: colours[n] ?? [], data: p.data }],
        );
        if (under === undefined || u === undefined || shown.length !== colours.length) {
          return low;
        }
        const [r, g, b, a] = ink.rgba;
        const x0 = Math.max(0, Math.floor(ink.box.x));
        const y0 = Math.max(0, Math.floor(ink.box.y));
        const x1 = Math.min(under.w, Math.ceil(ink.box.x + ink.box.w));
        const y1 = Math.min(under.h, Math.ceil(ink.box.y + ink.box.h));
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * under.w + x) * 4;
            // The glyph's cover of the pixel, read on the channel where a
            // probe differs most from what is under it. Under half is its
            // antialiased edge.
            const c = shown
              .flatMap(({ rgb, data }) =>
                rgb.map(
                  (v, ch) =>
                    [v - (u[i + ch] ?? 0), (data[i + ch] ?? 0) - (u[i + ch] ?? 0)] as const,
                ),
              )
              .toSorted(([p], [q]) => Math.abs(q) - Math.abs(p))[0];
            if (c === undefined || Math.abs(c[0]) < 96 || c[1] / c[0] < 0.5) {
              continue;
            }
            const bg = ink.halo ?? [0, 1, 2].map((c) => u[i + c] ?? 0);
            const fg = bg.map((v, c) => a * ([r, g, b][c] ?? 0) + (1 - a) * v);
            const [hi = 0, lo = 0] = [lum(fg), lum(bg)].toSorted((p, q) => q - p);
            low = Math.min(low, (hi + 0.05) / (lo + 0.05));
          }
        }
        return low;
      });
    },
    [shots, inks, PROBES.map((p) => p.rgb)] as const,
  );
}

/** One test's work on a page. */
interface Pass {
  readonly name: string;
  readonly run: (browser: Browser, url: string, report: Report) => Promise<void>;
}

const statePass = (state: State): Pass => ({
  name: label(state),
  run: async (browser, url, report) => {
    const tab = await open(browser, url, state);
    report.add(await check(tab, rulesOf(state)), label(state));
    report.svgText(await svgText(tab, state), label(state));
    const hidden = await hiddenErrors(tab);
    if (hidden.length > 0) {
      report.fail(`a field described by the error it hides, ${label(state)}`, hidden);
    }
    const empty = await emptyRequired(tab);
    if (empty.length > 0) {
      report.fail(`a field read as invalid before anything was typed, ${label(state)}`, empty);
    }
    await tab.close();
  },
});

/** Each field whose `aria-describedby` names a hidden `.cp-field-error`. A
 *  description is read from hidden text too (accname 1.2, step 2A), so such
 *  a field says its error while it has none. */
async function hiddenErrors(tab: Page): Promise<string[]> {
  return tab.evaluate(() =>
    [...document.querySelectorAll("[aria-describedby]")].flatMap((field) =>
      (field.getAttribute("aria-describedby") ?? "").split(/\s+/).flatMap((id) => {
        const error = id === "" ? null : document.getElementById(id);
        return error?.classList.contains("cp-field-error") === true && error.hidden
          ? [`#${field.id} names #${id}`]
          : [];
      }),
    ),
  );
}

/** Each empty field marked `required` that the app has not marked invalid.
 *  Firefox and WebKit read a field failing a native constraint as invalid
 *  entry, and Firefox does even under `aria-invalid="false"`, so an empty
 *  `required` field says an error before the person typed anything; a
 *  required field is marked `aria-required="true"` instead. */
async function emptyRequired(tab: Page): Promise<string[]> {
  return tab.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLInputElement>(
        "input[required], select[required], textarea[required]",
      ),
    ]
      .filter((f) => f.validity.valueMissing && f.getAttribute("aria-invalid") !== "true")
      .map((f) => (f.id === "" ? f.outerHTML.slice(0, 80) : `#${f.id}`)),
  );
}

/** Each round of the page's closed `details` opened, in `state`. */
const detailsPass = (state: State): Pass => ({
  name: `${label(state)} details open`,
  run: async (browser, url, report) => {
    const at = `${label(state)} details open`;
    const tab = await open(browser, url, state);
    // Opening one `details` of a name group closes the others, so the n-th
    // closed member of each group opens in round n.
    const rounds = await tab.evaluateHandle(() => {
      const seen = new Map<string, number>();
      const all: HTMLDetailsElement[][] = [];
      for (const d of document.querySelectorAll<HTMLDetailsElement>("details:not([open])")) {
        const n = d.name === "" ? 0 : (seen.get(d.name) ?? -1) + 1;
        seen.set(d.name, n);
        (all[n] ??= []).push(d);
      }
      return all;
    });
    const count = await rounds.evaluate((all) => all.length);
    for (let n = 0; n < count; n++) {
      const opened = await rounds.evaluateHandle((all, i) => {
        const round = all[i] ?? [];
        for (const d of round) {
          d.open = true;
        }
        return round.filter((d) => !round.some((o) => o !== d && o.contains(d)));
      }, n);
      await settle(tab);
      report.add(await check(tab, rulesOf(state), opened), at);
      report.svgText(await svgText(tab, state, opened), at);
    }
    await tab.close();
  },
});

const isOpen = (o: Element): boolean =>
  o.matches(":popover-open") || (o instanceof HTMLDialogElement && o.open);

const nameOf = (o: Element): string =>
  o.id === "" ? `${o.localName}.${[...o.classList].join(".")}` : `#${o.id}`;

/** How a person opens `o` and the control they use: a visible invoker's
 *  press, its combobox's ArrowDown, a pointer resting on a control with a tip
 *  for the tooltip (none when the page has no such control), else script. */
const invoker = (o: Element): [How, Element | null] => {
  const opens = ["toggle", "show", "show-modal", "show-popover", "toggle-popover"];
  const visible = (list: Iterable<Element>): Element | null =>
    [...list].find((e) => e.checkVisibility()) ?? null;
  const id = CSS.escape(o.id);
  const press =
    o.id === ""
      ? null
      : visible(
          [...document.querySelectorAll(`[popovertarget="${id}"], [commandfor="${id}"]`)].filter(
            (b) =>
              opens.includes(
                b.getAttribute(b.hasAttribute("commandfor") ? "command" : "popovertargetaction") ??
                  "toggle",
              ),
          ),
        );
  if (press !== null) {
    return ["click", press];
  }
  const box = visible(
    [...document.querySelectorAll('[role="combobox"][aria-controls]')].filter((c) => {
      const list = document.getElementById(c.getAttribute("aria-controls") ?? "");
      return list !== null && o.contains(list);
    }),
  );
  if (box !== null) {
    return ["keys", box];
  }
  if (o.getAttribute("role") !== "tooltip") {
    return ["script", null];
  }
  // overlays/tooltip shows its one tip for the [data-cp-tip] under the pointer.
  const tipped = visible(document.querySelectorAll("[data-cp-tip]"));
  return tipped === null ? ["none", null] : ["hover", tipped];
};

/** Opens `overlay`, and first the overlay holding it, the way `invoker`
 *  says. Returns the overlays it opened, innermost last, and how that went. */
async function show(
  tab: Page,
  overlay: ElementHandle<Element>,
  report: Report,
): Promise<[ElementHandle<Element>[], Shown]> {
  const chain: ElementHandle<Element>[] = [];
  const outer = (
    await overlay.evaluateHandle((o, sel) => o.parentElement?.closest(sel) ?? null, OVERLAY)
  ).asElement();
  if (outer !== null && !(await outer.evaluate(isOpen))) {
    const [up, shown] = await show(tab, outer, report);
    chain.push(...up);
    if (shown !== "open") {
      return [chain, shown];
    }
  }
  const plan = await overlay.evaluateHandle(invoker);
  const how = await plan.evaluate(([h]) => h);
  const by = (await plan.evaluateHandle(([, el]) => el)).asElement();
  if (how === "none") {
    return [chain, "absent"];
  }
  if (how === "script" || by === null) {
    report.openedByScript(await overlay.evaluate(nameOf));
    await overlay.evaluate((o) => {
      if (o instanceof HTMLDialogElement) {
        o.showModal();
      } else if (o instanceof HTMLElement) {
        o.showPopover();
      }
    });
  } else {
    // axe 4.13.0's target-size stacks elements with no regard for the top
    // layer, so a popover over the sticky header or the fixed controls reads
    // as covered by them. Its opener at mid-screen keeps it clear of both.
    await by.evaluate((e) => {
      e.scrollIntoView({ block: "center", behavior: "instant" });
    });
    if (how === "click") {
      await by.click();
    } else if (how === "keys") {
      await by.focus();
      await tab.keyboard.press("ArrowDown");
    } else {
      await by.hover();
    }
  }
  const shown = await tab.waitForFunction(isOpen, overlay, { timeout: 3_000 }).then(
    (): Shown => "open",
    (): Shown => "shut",
  );
  chain.push(overlay);
  return [chain, shown];
}

/** Closes `chain` innermost first, by Escape where that answers, and leaves
 *  no focus or pointer on the page to show a tip. */
async function hide(tab: Page, chain: readonly ElementHandle<Element>[]): Promise<void> {
  for (const o of chain.toReversed()) {
    if (await o.evaluate(isOpen)) {
      await tab.keyboard.press("Escape");
    }
    await o.evaluate((el) => {
      if (el instanceof HTMLDialogElement && el.open) {
        el.close();
      } else if (el instanceof HTMLElement && el.matches(":popover-open")) {
        el.hidePopover();
      }
    });
  }
  await tab.mouse.move(0, 0);
  await tab.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await settle(tab);
}

/** Each overlay of the page, then each one a press makes, opened one at a
 *  time in `state` with axe scoped to it. */
async function overlayStates(
  browser: Browser,
  url: string,
  report: Report,
  state: State,
): Promise<void> {
  const at = `${label(state)} overlay`;
  const rules = rulesOf(state);
  const tab = await open(browser, url, state);
  const overlays = await tab.$$(OVERLAY);
  let opened = 0;
  let absent = 0;
  for (const overlay of overlays) {
    const name = await overlay.evaluate(nameOf);
    const alone = await overlay.evaluateHandle((o) => [o]);
    if (await overlay.evaluate(isOpen)) {
      opened++;
      report.add(await check(tab, rules, alone), `${at} ${name} open at rest`);
      report.svgText(await svgText(tab, state, alone), `${at} ${name} open at rest`);
      continue;
    }
    const [chain, shown] = await show(tab, overlay, report);
    if (shown === "absent") {
      absent++;
    } else if (shown === "open") {
      opened++;
      await settle(tab);
      report.add(await check(tab, rules, alone), `${at} ${name} open`);
      report.svgText(await svgText(tab, state, alone), `${at} ${name} open`);
    } else {
      report.fail(`${name} did not open, ${at}`);
    }
    await hide(tab, chain);
  }
  const presses = await tab.locator(MADE_ON_PRESS).filter({ visible: true }).count();
  await tab.close();
  report.note(
    `${at}: ${String(opened)} of ${String(overlays.length)} overlays opened, ${String(absent)} with nothing here to open it, ${String(presses)} presses that make one`,
  );
  // A fresh page each time, since one press's toasts stay open past the next.
  for (let n = 0; n < presses; n++) {
    const page = await open(browser, url, state);
    const button = page.locator(MADE_ON_PRESS).filter({ visible: true }).nth(n);
    const name = `"${(await button.innerText()).trim()}"`;
    const before = await page.evaluateHandle(
      () => new Set(document.querySelectorAll(":popover-open, dialog[open]")),
    );
    await button.click();
    const made = await page
      .waitForFunction(
        (was) => {
          const now = [...document.querySelectorAll(":popover-open, dialog[open]")].filter(
            (o) => !was.has(o),
          );
          return now.length > 0 && now;
        },
        before,
        { timeout: 3_000 },
      )
      .catch(() => null);
    if (made === null) {
      report.fail(`${name} opened nothing, ${at}`);
    } else {
      await settle(page);
      const shown = made as JSHandle<Element[]>;
      report.add(await check(page, rules, shown), `${at} after ${name}`);
      report.svgText(await svgText(page, state, shown), `${at} after ${name}`);
    }
    await page.close();
  }
}

const overlayPass = (state: State): Pass => ({
  name: `${label(state)} overlays`,
  run: (browser, url, report) => overlayStates(browser, url, report, state),
});

const PAGE_PASSES: readonly Pass[] = [
  ...EVERY_STATE.map(statePass),
  ...EVERY_STATE.map(detailsPass),
];
const OVERLAY_PASSES: readonly Pass[] = EVERY_STATE.map(overlayPass);

/** Pages served by one server, each checked by the same passes, one test
 *  per page and pass. */
interface Pages {
  readonly name: string;
  /** The test's name, with `$page` and `$pass.name`. */
  readonly title: string;
  readonly names: readonly string[];
  readonly serve: () => Promise<Served>;
  /** The pages' folder on the server, as `/docs/system`, or "" for its root. */
  readonly path: string;
  readonly passes: readonly Pass[];
  /** Each test's budget in ms. */
  readonly timeout: number;
}

/**
 * The suite of `groups` in `engine`, skipped when CPLIEGER_BROWSERS does not
 * name it. One file per engine lets CI's shards split the engines' runs.
 * `also` adds tests to the suite.
 */
export function describeAxe(
  engine: Engine,
  groups: readonly Pages[],
  also?: (browser: () => Browser) => void,
): void {
  describe.skipIf(!BROWSERS.includes(engine))(`axe in ${engine}`, () => {
    let browser: Browser | undefined;
    const launched = (): Browser => {
      if (browser === undefined) {
        throw new Error(`${engine} did not launch`);
      }
      return browser;
    };

    beforeAll(async () => {
      browser = await ENGINES[engine].launch();
    }, 60_000);

    afterAll(async () => {
      await browser?.close();
    });

    also?.(launched);

    describe.each(groups)("$name", (group) => {
      let served: Served | undefined;

      beforeAll(async () => {
        served = await group.serve();
      }, 60_000);

      afterAll(async () => {
        await served?.close();
      });

      const cases = group.names.flatMap((page) => group.passes.map((pass) => ({ page, pass })));
      it.for(cases)(
        group.title,
        { timeout: group.timeout },
        async ({ page, pass }, { annotate }) => {
          const report = new Report();
          await pass.run(launched(), `${served?.origin ?? ""}${group.path}/${page}.html`, report);
          await report.annotate(annotate);
          expect(report.failed).toEqual({});
        },
      );
    });
  });
}

// Its own files, so CI's shards run its SVG text check beside the other pages.
const CHARTS = "charts";
const GALLERY = [...pageNames, ...frameNames].filter((n) => n !== CHARTS);
const REFERENCE = (await readdir(join(ROOT, "docs", "system")))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -".html".length));

/** Every gallery page and frame but the charts, and every reference page in docs/system. */
export const PAGES: readonly Pages[] = [
  {
    name: "gallery",
    title: "finds no violation on the gallery's $page in $pass.name",
    names: GALLERY,
    serve: serveGallery,
    path: "",
    passes: PAGE_PASSES,
    timeout: 180_000,
  },
  {
    name: "reference",
    title: "finds no violation on the reference page $page in $pass.name",
    names: REFERENCE,
    serve: () => serve(ROOT),
    path: "/docs/system",
    passes: [...PAGE_PASSES, ...OVERLAY_PASSES],
    timeout: 180_000,
  },
];

/** Every overlay of every gallery page and frame but the charts. */
export const OVERLAYS: readonly Pages[] = [
  {
    name: "gallery",
    title: "finds no violation in the gallery's $page in $pass.name",
    names: GALLERY,
    serve: serveGallery,
    path: "",
    passes: OVERLAY_PASSES,
    timeout: 180_000,
  },
];

/** The gallery's charts page and its overlays. */
export const CHART_PAGES: readonly Pages[] = [
  {
    name: "gallery",
    title: "finds no violation on the gallery's $page in $pass.name",
    names: [CHARTS],
    serve: serveGallery,
    path: "",
    passes: [...PAGE_PASSES, ...OVERLAY_PASSES],
    // About fifty views of its SVG text a state, up to three seconds each in WebKit.
    timeout: 480_000,
  },
];

const PAGE = '<!DOCTYPE html><html lang="en"><title>Check</title><main><h1>Check</h1>';

/** Proves the rule lists match the pinned axe and that axe runs at all. */
export function selfTest(browser: () => Browser): void {
  it(
    "has every rule of the pinned axe ruled once, runs each, and finds a button with no name",
    { timeout: 60_000 },
    async () => {
      const tab = await browser().newPage();
      await tab.setContent(`${PAGE}<button></button></main></html>`);
      const run = await check(tab, EVERY);
      const part = await check(tab, EVERY, await tab.evaluateHandle(() => [document.body]));
      const rules = await tab.evaluate(() =>
        (window as unknown as { axe: typeof Axe }).axe.getRules().map((r) => r.ruleId),
      );
      await tab.close();
      const ruled = [...EVERY, ...CONTRAST_MORE, ...OUT];
      expect(new Set(ruled).size).toBe(ruled.length);
      expect(rules.toSorted()).toEqual(ruled.toSorted());
      expect(REVIEW_FAILS.filter((id) => !EVERY.includes(id))).toEqual([]);
      expect(run.unrun).toEqual([]);
      expect(part.unrun).toEqual(PAGE_LEVEL);
      expect(run.violations.map((v) => v.id)).toEqual(["button-name"]);
    },
  );

  it(
    "finds a field described by an error it hides, and no other",
    { timeout: 60_000 },
    async () => {
      const tab = await browser().newPage();
      await tab.setContent(
        `${PAGE}<input id="f" aria-label="Name" aria-describedby="f-help f-error"><span id="f-help">Help</span>` +
          '<span class="cp-field-error" id="f-error" hidden>Enter a name</span>' +
          '<input id="g" aria-label="Host" aria-describedby="g-error"><span class="cp-field-error" id="g-error">Shown</span>' +
          '<input id="h" aria-label="Note" aria-describedby="h-help"><span id="h-help" hidden>Hidden help</span></main></html>',
      );
      expect(await hiddenErrors(tab)).toEqual(["#f names #f-error"]);
      await tab.close();
    },
  );

  it(
    "finds an empty required field the app has not marked, and no other",
    { timeout: 60_000 },
    async () => {
      const tab = await browser().newPage();
      await tab.setContent(
        `${PAGE}<form novalidate><input id="a" aria-label="A" required>` +
          '<input id="b" aria-label="B" required value="typed">' +
          '<input id="c" aria-label="C" aria-required="true">' +
          '<input id="d" aria-label="D" required aria-invalid="true">' +
          '<select id="e" aria-label="E" required><option value="">Choose</option></select>' +
          '<textarea id="f" aria-label="F" required aria-invalid="false"></textarea></form></main></html>',
      );
      expect(await emptyRequired(tab)).toEqual(["#a", "#e", "#f"]);
      await tab.close();
    },
  );

  it(
    "measures SVG text against what is behind its glyphs, its halo included, scrolled into view",
    { timeout: 60_000 },
    async () => {
      const tab = await browser().newPage({ viewport: { width: 400, height: 300 } });
      await tab.setContent(
        `${PAGE}<svg width="320" height="120" font-size="16" font-family="sans-serif">` +
          '<rect x="160" width="160" height="120" fill="#222"/>' +
          '<text x="10" y="20" fill="#767676">grey enough</text>' +
          '<text x="10" y="50" fill="#808080">too light</text>' +
          '<text x="170" y="20" fill="#000" stroke="#fff" stroke-width="6" paint-order="stroke">halo</text>' +
          '<text x="170" y="50" fill="#000">no halo</text>' +
          '<text x="10" y="100" font-size="30" opacity="0.4">faded</text>' +
          '<text x="170" y="90" fill="#000" stroke="#fff" stroke-width="2" paint-order="stroke">thin halo</text>' +
          "</svg>" +
          '<svg width="320" height="40" font-size="16" font-family="sans-serif">' +
          '<rect x="60" width="260" height="40" fill="rgb(200 60 200)"/>' +
          '<text x="10" y="25" fill="#595959">half on pink</text></svg>' +
          '<div style="overflow-x: auto; inline-size: 200px">' +
          '<svg width="600" height="40" font-size="16" font-family="sans-serif">' +
          '<text x="520" y="20" fill="#808080">far</text></svg></div></main></html>',
      );
      const named = (low: readonly string[]) => low.map((l) => /"([^"]+)"/.exec(l)?.[1]);
      const light: State = { width: 400, height: 300, theme: "light" };
      const rest = await svgText(tab, light);
      // #595959 holds 7:1 on white and 1.6:1 on the pink. A 2px stroke on
      // 16px text is a narrow border, so "thin halo" is #000 on #222.
      expect(named(rest)).toEqual([
        "too light",
        "no halo",
        "faded",
        "thin halo",
        "half on pink",
        "far",
      ]);
      // #808080 on white is 3.95:1 by WCAG's formula.
      expect(rest.at(-1)).toMatch(/"far": 3\.9[45]:1, under 4\.5:1$/u);
      expect(named(await svgText(tab, { ...light, contrast: "more" }))).toEqual([
        "grey enough",
        "too light",
        "no halo",
        "faded",
        "thin halo",
        "half on pink",
        "far",
      ]);
      await tab.close();
    },
  );
}
