import { describe, expect, it } from "vitest";

import { build, contrast, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const plainBanner = (cls: string) =>
  `<div ${cls} data-tone="warning" style="inline-size: 40rem"><span class="cp-icon" data-cp-icon="wifi-off"></span><span><strong>Connection lost.</strong> Reconnecting in 4 seconds.</span><button class="cp-button" data-size="sm" type="button">Retry now</button></div>`;
const reasonsBanner = (cls: string) =>
  `<div ${cls} data-tone="warning" style="inline-size: 40rem"><strong><span class="cp-icon"></span>Reachable from the internet</strong><ul><li>It answers on a public address.</li></ul><small>Seen today. <a href="#a">How to limit access</a></small></div>`;

const VARIANT = 'class="cp-notice" data-variant="banner"';

describe("notice", () => {
  it("puts a banner's action at its end and keeps its words readable", () => {
    const el = build(plainBanner(VARIANT));
    const banner = q(el, ".cp-notice").getBoundingClientRect();
    const button = q(el, "button").getBoundingClientRect();
    expect(Math.round(banner.right - button.right)).toBe(16);
    const cs = getComputedStyle(q(el, ".cp-notice"));
    expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect([cs.flexWrap, cs.paddingBlockStart, cs.fontSize]).toEqual(["wrap", "8px", "14px"]);
    expect(getComputedStyle(q(el, ".cp-icon")).marginBlockStart).toBe("0px");
  });

  it("stacks a banner's head, its reasons and its foot, the foot in the tone's ink", () => {
    const el = build(
      `<div ${VARIANT} data-tone="warning"><strong>Update ready.</strong> Reload to use it. <small>Saved.</small><button class="cp-button" type="button">Reload</button></div>` +
        reasonsBanner(VARIANT),
    );
    const [plain, reasons] = [...el.querySelectorAll<HTMLElement>(".cp-notice")] as [
      HTMLElement,
      HTMLElement,
    ];
    expect(getComputedStyle(plain).display).toBe("flex");
    expect(getComputedStyle(plain).paddingBlockStart).toBe("8px");
    expect(getComputedStyle(q(plain, "strong")).display).toBe("block");
    expect(getComputedStyle(q(plain, "small")).color).toBe(getComputedStyle(plain).color);
    const box = getComputedStyle(reasons);
    expect([box.display, box.paddingBlockStart, box.paddingInlineStart]).toEqual([
      "grid",
      "12px",
      "16px",
    ]);
    const head = q(reasons, "strong");
    const list = q(reasons, "ul");
    expect(list.getBoundingClientRect().top - head.getBoundingClientRect().bottom).toBe(8);
    expect([getComputedStyle(list).paddingInlineStart, getComputedStyle(list).fontSize]).toEqual([
      "28px",
      "14px",
    ]);
    expect(getComputedStyle(head).display).toBe("flex");
    const ink = resolved("var(--cp-warning-11)");
    const foot = getComputedStyle(q(reasons, "small"));
    expect([foot.color, foot.fontSize]).toEqual([ink, "13px"]);
    expect(getComputedStyle(q(reasons, ".cp-icon")).color).toBe(ink);
    expect(box.color).toBe(resolved("var(--cp-warning-12)"));
  });

  it("keeps a notice's own drawing apart from the banner's", () => {
    const el = build(
      `<div class="cp-notice" data-tone="warning"><span class="cp-icon"></span><span>Rate limited.</span></div>` +
        plainBanner(VARIANT),
    );
    const [notice, banner] = [...el.querySelectorAll<HTMLElement>(".cp-notice")].map((n) =>
      getComputedStyle(n),
    ) as [CSSStyleDeclaration, CSSStyleDeclaration];
    expect(banner.backgroundColor).toBe(notice.backgroundColor);
    expect(notice.paddingBlockStart).toBe("12px");
    expect(notice.alignItems).toBe("start");
    expect(notice.flexWrap).toBe("nowrap");
    expect(Number.parseFloat(notice.borderTopLeftRadius)).toBeGreaterThan(
      Number.parseFloat(banner.borderTopLeftRadius),
    );
  });

  it("gives a notice's links its ink and leaves a banner's in the accent", () => {
    const el = build(
      `<div class="cp-notice" data-tone="danger"><span>Two fields need a fix. <a href="#f">Address</a></span></div>` +
        reasonsBanner(VARIANT),
    );
    const [inNotice, inBanner] = [...el.querySelectorAll("a")].map(
      (a) => getComputedStyle(a).color,
    );
    expect(inNotice).toBe(resolved("var(--cp-danger-12)"));
    expect(inBanner).toBe(resolved("var(--cp-accent-ink)"));
  });

  it("stacks reasons in a notice of one screen too, at the notice's size", () => {
    const el = build(
      '<div class="cp-notice" data-tone="warning" style="inline-size: 32rem"><strong><span class="cp-icon"></span>Restart to apply 2 changes</strong><ul><li>Listen port</li><li>Data folder</li></ul><small>Saved. <a href="#r">Restart now</a></small></div>',
    );
    const box = q(el, ".cp-notice");
    const cs = getComputedStyle(box);
    expect([cs.display, cs.paddingBlockStart, cs.rowGap]).toEqual(["grid", "12px", "8px"]);
    expect(getComputedStyle(q(box, "ul")).fontSize).toBe(cs.fontSize);
    expect(getComputedStyle(q(box, "ul")).paddingInlineStart).toBe("28px");
    expect(getComputedStyle(q(box, "small")).color).toBe(resolved("var(--cp-warning-11)"));
  });

  it("raises a primary link's words off its fill inside a notice", () => {
    const el = build(
      '<div class="cp-notice" data-tone="warning"><span>Update ready.</span><a class="cp-button" data-variant="primary" href="#r">Reload</a></div>',
    );
    const a = getComputedStyle(q(el, "a"));
    expect(contrast(a.color, a.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});
