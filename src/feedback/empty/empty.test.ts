import { describe, expect, it } from "vitest";

import { build, contrast, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const PAGE =
  '<section class="cp-empty" data-variant="page" style="inline-size: 40rem"><span class="cp-icon" data-cp-icon="telescope" aria-hidden="true"></span><h1>This page does not exist</h1><p>The address may be old, or the item was removed.</p><a class="cp-button" data-variant="primary" href="#start">Go to the start</a></section>';

const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return Math.round(r.left + r.width / 2);
};

describe("empty", () => {
  it.each(["light", "dark"] as const)(
    "centres a page's glyph, heading, sentence and link, in %s",
    (theme) => {
      const box = q(build(PAGE, theme), ".cp-empty");
      const cs = getComputedStyle(box);
      expect([cs.display, cs.justifyItems, cs.textAlign, cs.rowGap]).toEqual([
        "grid",
        "center",
        "center",
        "12px",
      ]);
      const block = `${String(Math.round(window.innerHeight * 0.12))}px`;
      expect([
        `${String(Math.round(Number.parseFloat(cs.paddingBlockStart)))}px`,
        `${String(Math.round(Number.parseFloat(cs.paddingBlockEnd)))}px`,
        cs.paddingInlineStart,
        cs.paddingInlineEnd,
      ]).toEqual([block, block, "0px", "0px"]);
      for (const part of [".cp-icon", "h1", "p", "a"]) {
        expect(Math.abs(centre(q(box, part)) - centre(box))).toBeLessThanOrEqual(1);
      }
    },
  );

  it.each(["light", "dark"] as const)(
    "sets a page's heading in ink and its sentence as a muted note, in %s",
    (theme) => {
      const box = q(build(PAGE, theme), ".cp-empty");
      const page = resolved("var(--cp-surface-page)");
      const heading = getComputedStyle(q(box, "h1"));
      const note = getComputedStyle(q(box, "p"));
      expect([heading.color, heading.fontSize]).toEqual([resolved("var(--cp-ink)"), "23px"]);
      expect([note.color, note.fontSize]).toEqual([resolved("var(--cp-ink-muted)"), "13px"]);
      expect(Number.parseFloat(note.lineHeight)).toBeCloseTo(13 * 1.55, 2);
      expect(contrast(heading.color, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(note.color, page)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("draws a page's glyph at 48px in the accent from its name alone", () => {
    const glyph = getComputedStyle(q(build(PAGE), ".cp-icon"));
    expect([glyph.width, glyph.color]).toEqual(["48px", resolved("var(--cp-accent-9)")]);
    expect(glyph.maskImage).not.toBe("none");
  });

  it("keeps a region's empty state at its start with its own padding", () => {
    const el = build(
      '<div class="cp-empty" style="inline-size: 40rem"><span class="cp-icon" data-cp-icon="telescope"></span><strong>Nothing matches</strong><span>Try fewer words.</span></div>',
    );
    const cs = getComputedStyle(q(el, ".cp-empty"));
    expect([cs.justifyItems, cs.textAlign, cs.paddingBlockStart, cs.paddingInlineStart]).toEqual([
      "start",
      "start",
      "32px",
      "24px",
    ]);
  });
});
