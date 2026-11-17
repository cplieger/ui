import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { build, q, resolved, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const root = document.documentElement;
const ABOUT = `<span class="cp-meta" data-part="about">
  <span>Version 3.0.0</span>
  <a href="#source" rel="external">Source<span class="cp-visually-hidden">, opens GitHub</span></a>
  <a href="#licence" rel="external">Licence<span class="cp-visually-hidden">, opens GitHub</span></a>
</span>`;
const status = (width: number) =>
  `<footer class="cp-status" style="width: ${String(width)}px"><span>Data as of <time>14:02</time></span>${ABOUT}</footer>`;
const box = (el: Element) => el.getBoundingClientRect();
// The test's own sheet comes after the system's, so it wins at equal weight.
const STILL = "<style>.cp-meta a { transition: none; }</style>";

describe("the about line", () => {
  it("keeps its links in the line's muted ink at rest", () => {
    const host = build(status(800));
    const link = q(host, 'a[href="#source"]');
    expect(getComputedStyle(link).color).toBe(resolved("var(--cp-ink-muted)"));
    expect(getComputedStyle(link).textDecorationLine).toBe("underline");
  });

  it("inks a link in the accent under a mouse, not a finger", async () => {
    root.setAttribute("data-pointer", "fine");
    const link = q(build(status(800)), 'a[href="#source"]');
    await userEvent.hover(link);
    expect(getComputedStyle(link).color).toBe(resolved("var(--cp-accent-ink)"));
    root.setAttribute("data-pointer", "coarse");
    expect(getComputedStyle(link).color).toBe(resolved("var(--cp-ink-muted)"));
    await userEvent.unhover(link);
  });

  it("inks a link and its underline in the accent when the keyboard reaches it", async () => {
    // Tab from a known place: where focus last stood is the engine's.
    const host = build(`${STILL}<button type="button">Before</button>${status(800)}`);
    const link = q(host, 'a[href="#source"]');
    q(host, "button").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(link);
    expect(getComputedStyle(link).color).toBe(resolved("var(--cp-accent-ink)"));
    expect(getComputedStyle(link).textDecorationColor).toBe(resolved("var(--cp-accent-ink)"));
  });

  it("gives each link the hit area's height under a mouse and a finger", () => {
    const host = build(status(800));
    for (const tier of ["fine", "coarse"] as const) {
      root.setAttribute("data-pointer", tier);
      for (const link of host.querySelectorAll("a")) {
        expect(box(link).height).toBeGreaterThanOrEqual(tier === "fine" ? 24 : 44);
      }
    }
  });

  it.each([800, 220])("ends a status line %ipx wide, on the line it wraps to too", (width) => {
    const footer = q(build(status(width)), ".cp-status");
    const about = q(footer, '[data-part="about"]');
    const end = box(footer).right - parseFloat(getComputedStyle(footer).paddingRight);
    expect(box(about).right).toBeCloseTo(end, 0);
    const first = q(footer, ":scope > span:first-child");
    expect(box(about).top >= box(first).bottom - 0.5).toBe(width < 300);
  });

  it("centres its parts under a gate's panel", () => {
    const host = build(
      `<main class="cp-gate" style="min-block-size: 0"><div class="cp-wordmark"><span class="cp-mark" aria-hidden="true">R</span>Release tracker</div><section class="cp-panel"><h1>Sign in</h1></section>${ABOUT.replace("<span class", "<p class").replace(/<\/span>$/, "</p>")}</main>`,
    );
    const gate = box(q(host, ".cp-gate"));
    const parts = [...q(host, '[data-part="about"]').children].map(box);
    const left = Math.min(...parts.map((r) => r.left));
    const right = Math.max(...parts.map((r) => r.right));
    expect((left + right) / 2).toBeCloseTo(gate.left + gate.width / 2, 0);
  });
});
