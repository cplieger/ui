import { describe, expect, it, onTestFinished } from "vitest";
import { cdp, server } from "vitest/browser";

import { build, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const STATES = ["idle", "busy", "passed", "done", "failed"] as const;

const before = (el: Element) => getComputedStyle(el, "::before");

// Every property the state and its drawn glyph set, read off both.
function drawing(el: HTMLElement): string[] {
  const cs = getComputedStyle(el);
  const glyph = before(el);
  return [
    cs.display,
    cs.alignItems,
    cs.columnGap,
    cs.color,
    cs.fontSize,
    cs.fontWeight,
    glyph.content,
    glyph.width,
    glyph.height,
    glyph.maskImage,
    glyph.animationName,
    glyph.backgroundColor,
  ];
}

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the tests that need it.
const emulates = server.browser === "chromium";

async function media(name: string, value: string): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
  onTestFinished(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });
}

describe("state", () => {
  it("sets a state word small after its tone's glyph", () => {
    const el = build(
      '<span class="cp-state" data-tone="success"><span class="cp-icon" data-cp-icon="circle-check"></span>Set</span>',
    );
    const state = q(el, ".cp-state");
    const cs = getComputedStyle(state);
    expect([cs.display, cs.fontSize, cs.fontWeight, cs.columnGap]).toEqual([
      "inline-flex",
      "13px",
      "500",
      "4px",
    ]);
    expect(cs.color).toBe(resolved("var(--cp-success-11)"));
    expect(q(el, ".cp-icon").getBoundingClientRect().width).toBe(14);
    expect(before(state).content).toBe("none");
  });

  it("draws a work state's glyph and tone by data-cp-state, and nothing at rest", () => {
    const el = build(
      STATES.map(
        (s) => `<span class="cp-state" data-size="ui" data-cp-state="${s}">Words</span>`,
      ).join(""),
    );
    const [idle, busy, passed, done, failed] = [
      ...el.querySelectorAll<HTMLElement>(".cp-state"),
    ] as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    const muted = resolved("var(--cp-ink-muted)");
    // Each glyph by a line of its drawing in icons/svg, which the dev server
    // inlines into the mask.
    const glyph = (el: Element) => decodeURIComponent(before(el).maskImage);
    expect([before(idle).content, getComputedStyle(idle).color]).toEqual(["none", muted]);
    expect(getComputedStyle(busy).color).toBe(muted);
    expect(before(busy).animationName).toBe("cp-spin");
    expect(glyph(busy)).toContain("M21 12a9 9 0 0 1-9 9");
    expect(getComputedStyle(passed).color).toBe(resolved("var(--cp-success-11)"));
    expect(glyph(passed)).toContain("m16 9-5.5 5.5L8 12");
    expect([getComputedStyle(done).color, before(done).maskImage]).toEqual([
      getComputedStyle(passed).color,
      before(passed).maskImage,
    ]);
    expect(getComputedStyle(failed).color).toBe(resolved("var(--cp-danger-11)"));
    expect(glyph(failed)).toContain("m15 9-6 6");
    expect(before(failed).backgroundColor).toBe(getComputedStyle(failed).color);
  });

  it("reads at the interface's size with a control's glyph when data-size is ui", () => {
    const el = build(
      '<span class="cp-state" data-size="ui" data-cp-state="passed">Connected</span>' +
        '<span class="cp-state" data-cp-state="passed">Uploaded</span>' +
        '<span class="cp-state" data-size="ui" data-tone="danger"><span class="cp-icon"></span>Refused</span>',
    );
    const [line, word, toned] = [...el.querySelectorAll<HTMLElement>(".cp-state")] as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect([getComputedStyle(line).fontSize, before(line).width, before(line).height]).toEqual([
      "14px",
      "18px",
      "18px",
    ]);
    expect([getComputedStyle(word).fontSize, before(word).width]).toEqual(["13px", "14px"]);
    expect(q(toned, ".cp-icon").getBoundingClientRect().width).toBe(18);
  });

  it("takes its work's tone over a data-tone", () => {
    const el = build(
      '<span class="cp-state" data-tone="success" data-cp-state="failed">Not sent.</span>',
    );
    expect(getComputedStyle(q(el, ".cp-state")).color).toBe(resolved("var(--cp-danger-11)"));
  });

  // A confirmed button hides its rest icon while busy or done; an item that
  // takes the same attribute keeps its own.
  it.each(["busy", "done"])("keeps the icons of an item whose work is %s", (s) => {
    const el = build(
      `<div class="cp-list-row" data-cp-state="${s}"><span class="cp-icon" data-cp-icon="file-text"></span>` +
        `<span class="cp-state" data-cp-state="${s}"><span class="cp-icon"></span>Words</span></div>`,
    );
    const shown = [...el.querySelectorAll(".cp-icon")].map((i) => getComputedStyle(i).display);
    expect(shown).not.toContain("none");
  });

  it("draws no glyph for a state it has none for", () => {
    const el = build('<span class="cp-state" data-cp-state="saved">Saved</span>');
    expect(before(q(el, ".cp-state")).content).toBe("none");
  });

  it.each(STATES.flatMap((s) => (["light", "dark"] as const).map((t) => [s, t] as const)))(
    "draws .cp-test-status exactly as a ui-sized state, %s, in %s",
    (s, t) => {
      const el = build(
        `<span class="cp-state" data-size="ui" data-cp-state="${s}">Words</span>` +
          `<span class="cp-test-status" data-cp-state="${s}">Words</span>`,
        t,
      );
      expect(drawing(q(el, ".cp-test-status"))).toEqual(drawing(q(el, ".cp-state")));
    },
  );

  it.skipIf(!emulates)("holds the spinner still under reduced motion", async () => {
    await media("prefers-reduced-motion", "reduce");
    const el = build('<span class="cp-state" data-cp-state="busy">Testing…</span>');
    expect(before(q(el, ".cp-state")).animationName).toBe("none");
  });

  it.skipIf(!emulates)("draws the glyph in the forced text colour", async () => {
    await media("forced-colors", "active");
    const el = build('<span class="cp-state" data-cp-state="failed">Not sent.</span>');
    expect(before(q(el, ".cp-state")).backgroundColor).toBe(resolved("CanvasText"));
  });
});
