import { expect, it } from "vitest";

import { build, contrast, q, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const FIELD = `<div class="cp-field"><label class="cp-label" for="key">API key <span class="cp-required">(Required)</span></label><input class="cp-input" id="key" aria-required="true"><span class="cp-help">Required.</span></div>`;

// docs/design-patterns.md "Forms" step 2: the mark is secondary text, so
// 4.5:1 (WCAG 2.2 SC 1.4.3) on every surface a field sits on.
it.each(["light", "dark"] as const)(
  "draws the Required marks shown and at 4.5:1 on every surface in %s",
  (theme) => {
    for (const surface of ["page", "raised", "sunken", "overlay"]) {
      const host = build(FIELD, theme);
      host.style.backgroundColor = `var(--cp-surface-${surface})`;
      const under = getComputedStyle(host).backgroundColor;
      for (const mark of [".cp-required", ".cp-help"]) {
        const style = getComputedStyle(q(host, mark));
        const where = `${mark} on ${surface}`;
        expect([style.opacity, style.visibility], where).toEqual(["1", "visible"]);
        expect(contrast(style.color, under), where).toBeGreaterThanOrEqual(4.5);
      }
    }
  },
);
