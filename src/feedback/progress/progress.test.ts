import { describe, expect, it, onTestFinished } from "vitest";
import { cdp, page, server } from "vitest/browser";

import { build, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

// The approved look is the former track and fill markup, so each case draws
// the native bar beside it at the same value.
const bar = (value: number, attrs = "") =>
  `<span class="cp-progress" ${attrs}><progress max="351" value="${String((value / 100) * 351)}" aria-label="Reading the library"></progress><span>Series 120 of 351</span></span>`;
const former = (value: number, attrs = "") =>
  `<span class="cp-progress" ${attrs} style="--cp-progress: ${String(value)}%"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span><span>Series 120 of 351</span></span>`;

const box = (el: Element) => el.getBoundingClientRect();
const stop = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name);

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the tests that need it.
const emulates = server.browser === "chromium";

async function media(name: string, value: string): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
  onTestFinished(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });
}

// An element's paint from one screenshot, read back by CSS pixel as RGB.
async function paint(el: Element): Promise<(x: number, y: number) => [number, number, number]> {
  const shot = await page.screenshot({ element: el, base64: true, save: false });
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  ctx.drawImage(img, 0, 0);
  const scale = img.width / box(el).width;
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  const origin = box(el);
  return (x, y) => {
    const at =
      (Math.floor((y - origin.top) * scale) * img.width + Math.floor((x - origin.left) * scale)) *
      4;
    return [px[at] ?? -1, px[at + 1] ?? -1, px[at + 2] ?? -1];
  };
}

// The colour at each fraction of a bar's width, on its middle row.
function along(at: (x: number, y: number) => [number, number, number], el: Element, xs: number[]) {
  const r = box(el);
  return xs.map((f) => at(r.left + r.width * f, r.top + r.height / 2));
}

const near = (a: [number, number, number][], b: [number, number, number][]) =>
  a.every((c, i) => c.every((v, k) => Math.abs(v - (b[i]?.[k] ?? -99)) <= 3));

describe("progress", () => {
  it("puts the bar first at 224 by 8, then the check's kept place, then the words", () => {
    const wrap = q(build(bar(40)), ".cp-progress");
    const progress = box(q(wrap, "progress"));
    const words = box(q(wrap, ":scope > span"));
    expect([progress.width, progress.height, progress.left]).toEqual([224, 8, box(wrap).left]);
    const check = getComputedStyle(wrap, "::before");
    expect([check.width, check.opacity, check.scale]).toEqual(["18px", "0", "0"]);
    expect(words.left - progress.right).toBe(8 + 18 + 8);
    expect(getComputedStyle(wrap).color).toBe(resolved("var(--cp-ink-muted)"));
  });

  it.each(["light", "dark"] as const)(
    "paints a native bar as the former track and fill, its gradient fixed to the bar, in %s",
    async (theme) => {
      const el = build(
        ["ltr", "rtl"].map((dir) => `<div dir="${dir}">${bar(50)}${former(50)}</div>`).join(""),
        theme,
      );
      const at = await paint(el);
      const xs = [0.1, 0.25, 0.45, 0.6, 0.9];
      for (const dir of ["ltr", "rtl"]) {
        const native = along(at, q(el, `[dir="${dir}"] progress`), xs);
        const approved = along(at, q(el, `[dir="${dir}"] .cp-progress-track`), xs);
        expect(near(native, approved), `${dir}: ${JSON.stringify([native, approved])}`).toBe(true);
      }
    },
  );

  it.each([
    ["the accent", "accent", ""],
    ["its tone", "warning", 'data-tone="warning"'],
  ])("fills from step 9 of %s to a lighter end", (_, tone, attrs) => {
    const el = build(`${bar(40, attrs)}${former(40, attrs)}`);
    const progress = q(el, "progress");
    expect(resolved(stop(progress, "--cp-progress-from"))).toBe(resolved(`var(--cp-${tone}-9)`));
    expect(stop(progress, "--cp-progress-to")).toBe(
      stop(q(el, ".cp-progress-fill"), "--cp-progress-to"),
    );
    expect(stop(progress, "--cp-progress-to")).not.toBe(stop(progress, "--cp-progress-from"));
  });

  it("turns both stops green after the last step's glide, then pops its check in", () => {
    const wrap = q(build(bar(100, 'data-state="done"')), ".cp-progress");
    const progress = q(wrap, "progress");
    const success = resolved("var(--cp-success-9)");
    expect(resolved(stop(progress, "--cp-progress-from"))).toBe(success);
    expect(resolved(stop(progress, "--cp-progress-to"))).toBe(success);
    expect(getComputedStyle(progress).transitionDelay).toBe("0.48s, 0.48s");
    expect(getComputedStyle(wrap, "::before").transitionDelay).toBe("0.74s, 0.74s");
  });

  it("puts the words under the bar in a box too narrow for both", () => {
    const el = build(`<div class="cp-empty">${bar(34)}</div>`);
    el.style.inlineSize = "20rem";
    const wrap = q(el, ".cp-progress");
    expect(box(wrap).right).toBeLessThanOrEqual(box(q(el, ".cp-empty")).right);
    expect(box(wrap).height).toBeGreaterThan(box(q(wrap, "progress")).height + 8);
    el.style.inlineSize = "40rem";
    expect(box(wrap).height).toBeLessThan(24);
  });

  it("shrinks the bar toward its 5rem floor in a box narrower than the bar", () => {
    const el = build(bar(34));
    el.style.inlineSize = "10rem";
    const progress = box(q(el, "progress"));
    expect(box(q(el, ".cp-progress")).right).toBeLessThanOrEqual(box(el).right + 0.5);
    expect(progress.width).toBeLessThanOrEqual(160.5);
    expect(progress.width).toBeGreaterThanOrEqual(80);
  });

  it("leaves a native progress on its own at the row's thin solid bar", () => {
    const progress = getComputedStyle(
      q(build('<progress max="4" value="1"></progress>'), "progress"),
    );
    expect([progress.height, progress.containerType]).toEqual(["6px", "normal"]);
  });

  it.skipIf(!emulates)(
    "fades the colours at once and the check in under reduced motion",
    async () => {
      await media("prefers-reduced-motion", "reduce");
      const wrap = q(build(bar(100, 'data-state="done"')), ".cp-progress");
      const progress = getComputedStyle(q(wrap, "progress"));
      expect(progress.transitionProperty).toBe("--cp-progress-from, --cp-progress-to");
      expect(progress.transitionDelay).toBe("0s, 0s");
      const check = getComputedStyle(wrap, "::before");
      expect([check.transitionProperty, check.transitionDelay, check.scale]).toEqual([
        "opacity",
        "0s",
        "1",
      ]);
    },
  );

  it.skipIf(!emulates)("fills with Highlight on a Canvas track in forced colours", async () => {
    await media("forced-colors", "active");
    const el = build(
      ["ltr", "rtl"].map((dir) => `<div dir="${dir}">${bar(50)}${former(50)}</div>`).join(""),
    );
    const at = await paint(el);
    for (const dir of ["ltr", "rtl"]) {
      const native = along(at, q(el, `[dir="${dir}"] progress`), [0.25, 0.75]);
      const approved = along(at, q(el, `[dir="${dir}"] .cp-progress-track`), [0.25, 0.75]);
      expect(near(native, approved), `${dir}: ${JSON.stringify([native, approved])}`).toBe(true);
      expect(native[0], dir).not.toEqual(native[1]);
      const cs = getComputedStyle(q(el, `[dir="${dir}"] progress`));
      expect([cs.outlineStyle, cs.outlineColor]).toEqual(["solid", resolved("CanvasText")]);
    }
  });
});
