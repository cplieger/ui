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
  readonly contrast?: "more";
}

const STATES: readonly State[] = [1440, 390].flatMap((width) =>
  (["light", "dark"] as const).map((theme) => ({
    width,
    height: width === 390 ? 844 : 900,
    theme,
  })),
);
/** Where every overlay and every closed `details` is opened. */
const WIDE: readonly State[] = STATES.filter((s) => s.width === 1440);
const LIGHT_WIDE: State = { width: 1440, height: 900, theme: "light" };
// docs/design-colour.md "Contrast" holds the 7:1 pairs in both themes.
const MORE: readonly State[] = WIDE.map((s) => ({ ...s, contrast: "more" as const }));

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
  readonly nodes: readonly string[];
}

interface Run {
  readonly passes: number;
  readonly violations: readonly Found[];
  readonly incomplete: readonly Found[];
}

function label(state: State): string {
  const at = `${state.theme} ${String(state.width)}`;
  return state.contrast === undefined ? at : `${at} more contrast`;
}

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
    if (run.passes === 0) {
      this.fail(`no rule passed, ${at}`);
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
      return {
        passes: result.passes.length,
        violations: found(result.violations),
        incomplete: found(result.incomplete),
      };
    },
    [rules, scope] as const,
  );
}

/** The page in each state, then each round of its closed `details` opened. */
async function pageStates(browser: Browser, url: string, report: Report): Promise<void> {
  for (const state of [...STATES, ...MORE]) {
    const tab = await open(browser, url, state);
    report.add(
      await check(tab, state.contrast === undefined ? EVERY : CONTRAST_MORE),
      label(state),
    );
    await tab.close();
  }
  const tab = await open(browser, url, LIGHT_WIDE);
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
    report.add(await check(tab, EVERY, opened), `${label(LIGHT_WIDE)} details open`);
  }
  await tab.close();
}

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
  } else if (how === "click") {
    await by.click();
  } else if (how === "keys") {
    await by.focus();
    await tab.keyboard.press("ArrowDown");
  } else {
    await by.hover();
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
 *  time with axe scoped to it. */
async function overlayStates(browser: Browser, url: string, report: Report): Promise<void> {
  for (const state of WIDE) {
    const at = label(state);
    const tab = await open(browser, url, state);
    const overlays = await tab.$$(OVERLAY);
    let opened = 0;
    let absent = 0;
    for (const overlay of overlays) {
      const name = await overlay.evaluate(nameOf);
      if (await overlay.evaluate(isOpen)) {
        opened++;
        report.add(
          await check(tab, EVERY, await overlay.evaluateHandle((o) => [o])),
          `${at} ${name} open at rest`,
        );
        continue;
      }
      const [chain, shown] = await show(tab, overlay, report);
      if (shown === "absent") {
        absent++;
      } else if (shown === "open") {
        opened++;
        await settle(tab);
        report.add(
          await check(tab, EVERY, await overlay.evaluateHandle((o) => [o])),
          `${at} ${name} open`,
        );
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
        report.add(await check(page, EVERY, made as JSHandle<Element[]>), `${at} after ${name}`);
      }
      await page.close();
    }
  }
}

type Pass = (browser: Browser, url: string, report: Report) => Promise<void>;

async function audit(
  browser: Browser,
  url: string,
  annotate: TestContext["annotate"],
  passes: readonly Pass[],
): Promise<Record<string, string[]>> {
  const report = new Report();
  for (const pass of passes) {
    await pass(browser, url, report);
  }
  await report.annotate(annotate);
  return report.failed;
}

/** Pages served by one server, each checked by the same passes. */
export interface Pages {
  readonly name: string;
  /** The test's name, with `%s` for the page. */
  readonly title: string;
  readonly names: readonly string[];
  readonly serve: () => Promise<Served>;
  /** The pages' folder on the server, as `/docs/system`, or "" for its root. */
  readonly path: string;
  readonly passes: readonly Pass[];
}

/**
 * The suite of `groups` in `engine`, skipped when CPLIEGER_BROWSERS does not
 * name it. One file per engine lets CI's shards split the engines' runs.
 * `also` adds tests to the suite.
 */
export function describeAxe(
  engine: "chromium" | "firefox" | "webkit",
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

      it.for(group.names)(group.title, { timeout: 180_000 }, async (page, { annotate }) => {
        const url = `${served?.origin ?? ""}${group.path}/${page}.html`;
        expect(await audit(launched(), url, annotate, group.passes)).toEqual({});
      });
    });
  });
}

const GALLERY = [...pageNames, ...frameNames];
const REFERENCE = (await readdir(join(ROOT, "docs", "system")))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -".html".length));

/** Every gallery page and frame, and every reference page in docs/system. */
export const PAGES: readonly Pages[] = [
  {
    name: "gallery",
    title: "finds no violation on the gallery's %s",
    names: GALLERY,
    serve: serveGallery,
    path: "",
    passes: [pageStates],
  },
  {
    name: "reference",
    title: "finds no violation on the reference page %s",
    names: REFERENCE,
    serve: () => serve(ROOT),
    path: "/docs/system",
    passes: [pageStates, overlayStates],
  },
];

/** Every overlay of every gallery page and frame. */
export const OVERLAYS: readonly Pages[] = [
  {
    name: "gallery",
    title: "finds no violation in any overlay of the gallery's %s",
    names: GALLERY,
    serve: serveGallery,
    path: "",
    passes: [overlayStates],
  },
];

/** Proves the rule lists match the pinned axe and that axe runs at all. */
export function selfTest(browser: () => Browser): void {
  it("has every rule of the pinned axe ruled once, and finds a button with no name", async () => {
    const tab = await browser().newPage();
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
}
