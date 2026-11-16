import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import type * as Axe from "axe-core";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";

import { frameNames, pageNames } from "./build.js";
import { serve, serveGallery, type Served } from "./serve.js";

const ROOT = resolve(import.meta.dirname, "..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit };
const browsers = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",");
const REFERENCE = (await readdir(join(ROOT, "docs", "system")))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -".html".length));

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
}

const STATES: readonly State[] = [1440, 390].flatMap((width) =>
  (["light", "dark"] as const).map((theme) => ({
    width,
    height: width === 390 ? 844 : 900,
    theme,
  })),
);

interface Found {
  readonly id: string;
  readonly nodes: readonly string[];
}

interface Run {
  readonly passes: number;
  readonly violations: readonly Found[];
  readonly incomplete: readonly Found[];
}

async function open(browser: Browser, url: string, state: State): Promise<Page> {
  const tab = await browser.newPage({ viewport: { width: state.width, height: state.height } });
  await tab.goto(url);
  await tab.evaluate(async (theme) => {
    document.documentElement.dataset["theme"] = theme;
    await document.fonts.ready;
    // Colours are read at rest, after the transitions the theme change starts.
    // A loop or a paused animation never finishes, so it is not waited for.
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((a) => a.finished.catch(() => undefined)),
    );
  }, state.theme);
  return tab;
}

/** Runs `rules` over the page and every frame in it. */
async function check(tab: Page, rules: readonly string[]): Promise<Run> {
  for (const frame of tab.frames()) {
    await frame.addScriptTag({ path: AXE });
  }
  return tab.evaluate(async (values) => {
    const { axe } = window as unknown as { axe: typeof Axe };
    // A frame axe cannot reach would otherwise pass as needs review.
    axe.configure({ checks: [{ id: "frame-tested", options: { isViolation: true } }] });
    const result = await axe.run(document, {
      runOnly: { type: "rule", values: [...values] },
      resultTypes: ["violations", "incomplete"],
    });
    const found = (list: Axe.Result[]): Found[] =>
      list.map((r) => ({ id: r.id, nodes: r.nodes.map((n) => n.target.map(String).join(" >> ")) }));
    return {
      passes: result.passes.length,
      violations: found(result.violations),
      incomplete: found(result.incomplete),
    };
  }, rules);
}

/** Every failure over the states, keyed by rule and state; the other
 *  needs-review results go to the test's annotations. */
async function audit(
  browser: Browser,
  url: string,
  annotate: TestContext["annotate"],
): Promise<Record<string, string[]>> {
  const failed: Record<string, string[]> = {};
  const review = new Map<string, Set<string>>();
  for (const state of STATES) {
    const tab = await open(browser, url, state);
    const run = await check(tab, EVERY);
    await tab.close();
    const at = `${state.theme} ${String(state.width)}`;
    if (run.passes === 0) {
      failed[`no rule passed, ${at}`] = [];
    }
    for (const v of run.violations) {
      (failed[`${v.id}, ${at}`] ??= []).push(...v.nodes);
    }
    for (const i of run.incomplete) {
      if (REVIEW_FAILS.includes(i.id)) {
        (failed[`${i.id} needs review, ${at}`] ??= []).push(...i.nodes);
      } else {
        const nodes = review.get(i.id) ?? new Set();
        review.set(i.id, nodes);
        for (const node of i.nodes) {
          nodes.add(`${at}: ${node}`);
        }
      }
    }
  }
  if (review.size > 0) {
    await annotate(
      `needs review: ${[...review].map(([id, nodes]) => `${id} (${String(nodes.size)})`).join(", ")}`,
      "notice",
      {
        contentType: "application/json",
        body: JSON.stringify(
          Object.fromEntries([...review].map(([id, n]) => [id, [...n]])),
          null,
          1,
        ),
      },
    );
  }
  return failed;
}

let gallery: Served | undefined;
let root: Served | undefined;

beforeAll(async () => {
  [gallery, root] = await Promise.all([serveGallery(), serve(ROOT)]);
}, 60_000);

afterAll(async () => {
  await Promise.all([gallery?.close(), root?.close()]);
});

describe.each(browsers)("axe in %s", (name) => {
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

  it("has every rule of the pinned axe ruled once, and finds a button with no name", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.setContent(
      '<!DOCTYPE html><html lang="en"><title>Check</title><main><h1>Check</h1><button></button></main></html>',
    );
    const run = await check(tab, EVERY);
    const rules = await tab.evaluate(() =>
      (window as unknown as { axe: typeof Axe }).axe.getRules().map((r) => r.ruleId),
    );
    await tab.close();
    const ruled = [...EVERY, ...CONTRAST_MORE, ...OUT];
    expect(new Set(ruled).size).toBe(ruled.length);
    expect(rules.toSorted()).toEqual(ruled.toSorted());
    expect(REVIEW_FAILS.filter((id) => !EVERY.includes(id))).toEqual([]);
    expect(run.violations.map((v) => v.id)).toEqual(["button-name"]);
  });

  it.for([...pageNames, ...frameNames])(
    "finds no violation on the gallery's %s",
    { timeout: 180_000 },
    async (page, { annotate }) => {
      const failed = await audit(
        browser as Browser,
        `${gallery?.origin ?? ""}/${page}.html`,
        annotate,
      );
      expect(failed).toEqual({});
    },
  );

  it.for(REFERENCE)(
    "finds no violation on the reference page %s",
    { timeout: 180_000 },
    async (page, { annotate }) => {
      const failed = await audit(
        browser as Browser,
        `${root?.origin ?? ""}/docs/system/${page}.html`,
        annotate,
      );
      expect(failed).toEqual({});
    },
  );
});
