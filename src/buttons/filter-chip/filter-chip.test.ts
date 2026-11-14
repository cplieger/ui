import { describe, expect, it, onTestFinished } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

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

useSystemSheet();

const root = document.documentElement;
const CHECK = '<span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>';
const button = (pressed = false) =>
  `<button class="cp-filter-chip" type="button" aria-pressed="${String(pressed)}">${CHECK}Releases</button>`;
const link = (attrs = "", words = "Releases") =>
  `<a class="cp-filter-chip" href="#releases"${attrs}>${words}</a>`;
// The test's own sheet comes after the system's, so it wins at equal weight.
const STILL = "<style>.cp-filter-chip, .cp-filter-chip::after { transition: none; }</style>";

const box = (el: Element) => el.getBoundingClientRect();
const mark = (el: Element) => getComputedStyle(el, "::after");
const glyph = (el: Element) => drawing(maskUrl(el, "::after"));

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the tests that need it.
const emulates = server.browser === "chromium";

async function media(name: string, value: string): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
  onTestFinished(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });
}

describe("filter chip", () => {
  it("keeps the button raised on a strong edge, its check at no width until pressed", () => {
    const host = build(button() + button(true));
    const [off, on] = [...host.querySelectorAll(".cp-filter-chip")] as [HTMLElement, HTMLElement];
    const cs = getComputedStyle(off);
    expect([cs.borderTopColor, cs.backgroundColor, cs.color]).toEqual([
      resolved("var(--cp-border-strong)"),
      resolved("var(--cp-surface-raised)"),
      resolved("var(--cp-ink)"),
    ]);
    const check = (chip: Element) => getComputedStyle(q(chip, ".cp-icon"));
    expect([check(off).width, check(off).opacity]).toEqual(["0px", "0"]);
    expect(getComputedStyle(on).backgroundColor).toBe(resolved("var(--cp-accent)"));
    expect([check(on).width, check(on).marginInlineEnd]).toEqual(["14px", "4px"]);
  });

  it("draws a link as the same pill, outlined on the page and not underlined", () => {
    const host = build(button() + link());
    const chip = q(host, "button");
    const a = q(host, "a");
    const [b, l] = [getComputedStyle(chip), getComputedStyle(a)];
    for (const prop of [
      "display",
      "height",
      "paddingInlineStart",
      "paddingInlineEnd",
      "borderTopWidth",
      "borderTopLeftRadius",
      "fontSize",
      "fontWeight",
      "color",
    ] as const) {
      expect([prop, l[prop]]).toEqual([prop, b[prop]]);
    }
    expect([l.borderTopColor, l.backgroundColor, l.textDecorationLine]).toEqual([
      resolved("var(--cp-line)"),
      "rgba(0, 0, 0, 0)",
      "none",
    ]);
    expect(box(a).height).toBe(26);
  });

  it("is 44px tall under a finger, as the button is", () => {
    root.setAttribute("data-pointer", "coarse");
    const host = build(button() + link());
    expect([box(q(host, "button")).height, box(q(host, "a")).height]).toEqual([44, 44]);
  });

  it("draws a chevron after an in-app link's words, 4px after them, in the muted ink", async () => {
    const host = build(button() + link());
    const a = q(host, "a");
    const m = mark(a);
    expect([m.content, m.width, m.height]).toEqual(['""', "14px", "14px"]);
    expect(await glyph(a)).toBe(await shipped("chevron-right"));
    expect(m.backgroundColor).toBe(resolved("var(--cp-ink-muted)"));
    // The same words in the button, whose check holds no width: the link is
    // wider by the gap and the mark.
    expect(Math.round(box(a).width - box(q(host, "button")).width)).toBe(18);
  });

  it("draws the external mark for a link whose rel holds external", async () => {
    const host = build(link(' rel="external"') + link(' rel="noopener external"'));
    const [bare, listed] = [...host.querySelectorAll("a")] as [
      HTMLAnchorElement,
      HTMLAnchorElement,
    ];
    const file = await shipped("external-link");
    expect([await glyph(bare), await glyph(listed)]).toEqual([file, file]);
  });

  it("turns the chevron to point the reading way, and leaves the external mark", () => {
    const host = build(`<div dir="rtl">${link()}${link(' rel="external"')}</div>${link()}`);
    const [inApp, out, ltr] = [...host.querySelectorAll("a")] as [
      HTMLAnchorElement,
      HTMLAnchorElement,
      HTMLAnchorElement,
    ];
    expect([mark(inApp).scale, mark(out).scale, mark(ltr).scale]).toEqual(["-1 1", "none", "none"]);
  });

  it("keeps a leaving link's hidden words in its name and out of its size", () => {
    const host = build(
      link(' rel="external"', "AniList") +
        link(' rel="external"', 'AniList<span class="cp-visually-hidden">, opens AniList</span>'),
    );
    const [bare, named] = [...host.querySelectorAll("a")] as [HTMLAnchorElement, HTMLAnchorElement];
    expect(named.textContent).toBe("AniList, opens AniList");
    // Gecko lays the two out a hundred-thousandth of a pixel apart.
    expect(box(named).width).toBeCloseTo(box(bare).width, 2);
    expect(box(named).height).toBeCloseTo(box(bare).height, 2);
  });

  it("shows a link's own glyph, which only the button holds back until pressed", () => {
    const host = build(
      link("", '<span class="cp-icon" data-cp-icon="tv" aria-hidden="true"></span>Sonarr'),
    );
    const icon = getComputedStyle(q(host, ".cp-icon"));
    expect([icon.width, icon.height, icon.opacity]).toEqual(["14px", "14px", "1"]);
  });

  it("fills a link, strengthens its edge and inks its mark under a mouse, not a finger", async () => {
    root.setAttribute("data-pointer", "fine");
    const a = q(build(STILL + link()), "a");
    await userEvent.hover(a);
    const cs = getComputedStyle(a);
    expect([cs.borderTopColor, cs.backgroundColor, mark(a).backgroundColor]).toEqual([
      resolved("var(--cp-border-strong)"),
      resolved("var(--cp-fill)"),
      resolved("var(--cp-ink)"),
    ]);
    root.setAttribute("data-pointer", "coarse");
    expect([cs.borderTopColor, cs.backgroundColor, mark(a).backgroundColor]).toEqual([
      resolved("var(--cp-line)"),
      "rgba(0, 0, 0, 0)",
      resolved("var(--cp-ink-muted)"),
    ]);
    await userEvent.unhover(a);
  });

  it("presses a link as it presses the button", () => {
    const a = q(build(link()), "a");
    a.setAttribute("data-cp-pressed", "");
    expect(getComputedStyle(a).transform).not.toBe("none");
  });

  it.each(["light", "dark"] as const)(
    "keeps a link's words and mark readable on every surface, hovered or not, in %s",
    (theme) => {
      build("", theme);
      // WCAG 2.2: 4.5:1 for the words (1.4.3), 3:1 for the mark (1.4.11).
      for (const surface of ["--cp-surface-page", "--cp-surface-raised", "--cp-fill"]) {
        const under = resolved(`var(${surface})`);
        expect(contrast(resolved("var(--cp-ink)"), under), surface).toBeGreaterThanOrEqual(4.5);
        expect(contrast(resolved("var(--cp-ink-muted)"), under), surface).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.skipIf(!emulates)(
    "draws a link's edge and mark in LinkText in forced colours, hovered too",
    async () => {
      await media("forced-colors", "active");
      root.setAttribute("data-pointer", "fine");
      const host = build(STILL + button() + link());
      const a = q(host, "a");
      expect(getComputedStyle(q(host, "button")).borderTopColor).toBe(resolved("ButtonText"));
      expect([getComputedStyle(a).borderTopColor, mark(a).backgroundColor]).toEqual([
        resolved("LinkText"),
        resolved("LinkText"),
      ]);
      await userEvent.hover(a);
      expect(mark(a).backgroundColor).toBe(resolved("LinkText"));
      await userEvent.unhover(a);
    },
  );
});
