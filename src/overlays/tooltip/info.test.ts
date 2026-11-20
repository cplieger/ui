import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import {
  build,
  contrast,
  drawing,
  maskUrl,
  q,
  resolved,
  shipped,
  useSystemSheet,
} from "../../system/test-helpers/css.js";
import { installTooltips } from "./tooltip.js";

useSystemSheet();

let life = new AbortController();
afterEach(() => {
  life.abort();
  life = new AbortController();
});

const WORDS = "People sharing the release right now";
const GLYPH = `<span class="cp-info" tabindex="0" role="img" aria-label="About seeders" data-cp-tip="${WORDS}" data-cp-tip-toggle></span>`;

/** The centre of the cap band of `text`'s line: a probe one cap tall,
 *  standing on the baseline, spans it. */
function capCentre(text: HTMLElement): number {
  const probe = document.createElement("span");
  Object.assign(probe.style, { display: "inline-block", inlineSize: "0", blockSize: "1cap" });
  text.append(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return r.top + r.height / 2;
}

function centre(el: Element): number {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

/** What a control's box would paint: fill, border and shadow. */
function chrome(el: Element): string[] {
  const cs = getComputedStyle(el);
  return [
    cs.backgroundColor,
    cs.backgroundImage,
    cs.borderTopStyle,
    cs.borderRightStyle,
    cs.borderBottomStyle,
    cs.borderLeftStyle,
    cs.boxShadow,
  ];
}

const BARE = ["rgba(0, 0, 0, 0)", "none", "none", "none", "none", "none", "none"];

const touch = (el: Element): void => {
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "touch" }),
  );
};

describe("info glyph", () => {
  for (const [label, markup] of [
    ["a line of body text", `<p>Seeders${GLYPH}</p>`],
    ["a state word", `<span class="cp-state" data-tone="danger">Failing${GLYPH}</span>`],
    ["a heading", `<h3>Seeders${GLYPH}</h3>`],
    ["a small line", `<small>Seeders${GLYPH}</small>`],
  ] as const) {
    it(`centres on the cap band of ${label} that holds it`, () => {
      const el = build(markup);
      const glyph = q(el, ".cp-info");
      const text = glyph.parentElement as HTMLElement;
      expect(text.firstChild?.textContent).not.toBe("");
      expect(glyph.getBoundingClientRect().height).toBeCloseTo(
        Number.parseFloat(getComputedStyle(glyph).fontSize),
        1,
      );
      expect(Math.abs(centre(glyph) - capCentre(text))).toBeLessThanOrEqual(0.5);
    });
  }

  it("is the bare glyph in the secondary ink, its tip on focus and a tap, with no box in any state", async () => {
    installTooltips({ signal: life.signal });
    const el = build(`<p>Seeders${GLYPH}</p>`);
    const glyph = q(el, ".cp-info");
    expect(await drawing(maskUrl(glyph, "::before"))).toBe(await shipped("info"));
    expect(getComputedStyle(glyph).color).toBe(resolved("var(--cp-ink-muted)"));
    expect(chrome(glyph)).toEqual(BARE);
    await userEvent.hover(glyph);
    expect(chrome(glyph)).toEqual(BARE);
    expect(getComputedStyle(glyph).color).toBe(resolved("var(--cp-ink-muted)"));
    glyph.focus({ focusVisible: true });
    expect(chrome(glyph)).toEqual(BARE);
    expect(getComputedStyle(glyph).outlineStyle).toBe("solid");
    const tip = q(document, ".cp-tooltip");
    expect(tip.matches(":popover-open")).toBe(true);
    expect(tip.textContent).toBe(WORDS);
    expect(glyph.getAttribute("aria-describedby")).toBe(tip.id);
    glyph.blur();
    expect(tip.matches(":popover-open")).toBe(false);
    touch(glyph);
    expect(tip.matches(":popover-open")).toBe(true);
    expect(chrome(glyph)).toEqual(BARE);
    touch(glyph);
    expect(tip.matches(":popover-open")).toBe(false);
  });

  it("draws no ring when a mouse press focuses it", async () => {
    const el = build(`<p>Seeders${GLYPH}</p>`);
    const glyph = q(el, ".cp-info");
    await userEvent.click(glyph);
    expect(document.activeElement).toBe(glyph);
    expect(getComputedStyle(glyph).outlineStyle).toBe("none");
  });

  for (const [tier, hit] of [
    ["fine", 24],
    ["coarse", 44],
  ] as const) {
    it(`keeps the text's size and gives a ${tier} pointer a ${String(hit)}px target`, () => {
      document.documentElement.dataset["pointer"] = tier;
      const el = build(`<p>Seeders${GLYPH}</p>`);
      const glyph = q(el, ".cp-info");
      const size = glyph.getBoundingClientRect().width;
      expect(size).toBeCloseTo(Number.parseFloat(getComputedStyle(glyph).fontSize), 1);
      const reach = size - 2 * Number.parseFloat(getComputedStyle(glyph, "::after").left);
      expect(reach).toBeCloseTo(hit, 1);
    });
  }

  for (const theme of ["light", "dark"] as const) {
    it(`keeps the glyph at 4.5:1 and its ring at 3:1 on every surface in ${theme}`, async () => {
      const el = build(`<p>Seeders${GLYPH}</p>`, theme);
      const glyph = q(el, ".cp-info");
      glyph.focus({ focusVisible: true });
      expect(await drawing(maskUrl(glyph, "::before"))).toBe(await shipped("info"));
      const cs = getComputedStyle(glyph);
      for (const surface of ["page", "raised", "sunken", "overlay"]) {
        const bg = resolved(`var(--cp-surface-${surface})`);
        expect(contrast(cs.color, bg), `ink on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(cs.outlineColor, bg), `ring on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
