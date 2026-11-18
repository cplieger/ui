import { describe, expect, it, onTestFinished } from "vitest";
import { cdp, page, server, userEvent } from "vitest/browser";

import { build, q, useSystemSheet } from "../../system/test-helpers/css.js";
import { enhanceToggle } from "./toggle.js";

useSystemSheet();

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the tests that need it.
const emulates = server.browser === "chromium";

async function media(name: string, value: string): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
  onTestFinished(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });
}

const bell = (pressed: "true" | "false", attrs = 'data-tone="accent"') =>
  `<button class="cp-button cp-toggle" data-variant="quiet" ${attrs} data-motion="ring" type="button" aria-pressed="${pressed}"><span class="cp-icon" data-cp-icon="bell" aria-hidden="true"></span><span class="cp-icon" data-cp-icon="bell-ring-filled" data-part="on" aria-hidden="true"></span>Notify me</button>`;

const onIcon = (el: ParentNode) => q(el, '.cp-toggle > .cp-icon[data-part="on"]');

const colourOf = (value: string): string => {
  const probe = build("<span></span>").firstElementChild as HTMLElement;
  probe.style.color = value;
  return getComputedStyle(probe).color;
};

const degrees = (value: string): number => {
  const m = /^(-?[\d.e-]+)deg$/.exec(value.trim());
  if (m === null) {
    throw new Error(`not an angle: ${value}`);
  }
  return Number(m[1]);
};

/** The icon's rotate and clapper angle with every animation held at `ms`. */
function at(icon: HTMLElement, ms: number): [rotate: number, clapper: number] {
  for (const a of icon.getAnimations()) {
    a.pause();
    a.currentTime = ms;
  }
  const s = getComputedStyle(icon);
  return [degrees(s.rotate), degrees(s.getPropertyValue("--cp-toggle-clapper"))];
}

/** The angle halfway through one leg from `from` to `to` degrees, eased by
 *  the token `ease` names, from a reference animation. */
function midLeg(ease: string, ms: number, from: number, to: number): number {
  const easing = getComputedStyle(document.documentElement).getPropertyValue(ease).trim();
  const probe = build("<span></span>").firstElementChild as HTMLElement;
  // WebKit computes no rotate on a non-replaced inline box.
  probe.style.display = "inline-block";
  const a = probe.animate([{ rotate: `${String(from)}deg` }, { rotate: `${String(to)}deg` }], {
    duration: ms,
    easing,
  });
  a.pause();
  a.currentTime = ms / 2;
  return degrees(getComputedStyle(probe).rotate);
}

describe("the bell's ring", () => {
  it("swings the body from its crown and the clapper against it, on the picked keyframes", () => {
    const el = build(bell("true"));
    const b = q(el, "button");
    const icon = onIcon(el);
    b.dataset["cpToggled"] = "on";
    const s = getComputedStyle(icon);
    expect(s.animationName).toBe("cp-toggle-ring, cp-toggle-clapper");
    expect(s.transformOrigin).toBe("9px 1.5px");
    expect(
      icon.getAnimations().map((a) => (a.effect as KeyframeEffect).getComputedTiming().endTime),
    ).toEqual([900, 900]);
    const body: [number, number][] = [
      [108, 16],
      [270, -12],
      [423, 8],
      [567, -5],
      [702, 2.5],
      [810, -1],
    ];
    for (const [ms, deg] of body) {
      expect(at(icon, ms)[0], `rotate at ${String(ms)}ms`).toBeCloseTo(deg, 1);
    }
    const clapper: [number, number][] = [
      [144, -11],
      [306, 8],
      [459, -5.5],
      [603, 3.5],
      [738, -1.5],
    ];
    for (const [ms, deg] of clapper) {
      expect(at(icon, ms)[1], `clapper at ${String(ms)}ms`).toBeCloseTo(deg, 1);
    }
    // Halfway through a leg the easing shows: the first on --cp-ease-out,
    // the next on --cp-ease-move.
    expect(at(icon, 54)[0], "rotate at 54ms").toBeCloseTo(midLeg("--cp-ease-out", 108, 0, 16), 1);
    expect(at(icon, 189)[0], "rotate at 189ms").toBeCloseTo(
      midLeg("--cp-ease-move", 162, 16, -12),
      1,
    );
    expect(at(icon, 72)[1], "clapper at 72ms").toBeCloseTo(midLeg("--cp-ease-out", 144, 0, -11), 1);
    expect(at(icon, 225)[1], "clapper at 225ms").toBeCloseTo(
      midLeg("--cp-ease-move", 162, -11, 8),
      1,
    );
    // The clapper layer turns on the pivot: 18 of 24 units below it.
    const reach = (18 * 18) / 24;
    at(icon, 144);
    const [x, y] = getComputedStyle(icon).maskPosition.split(",")[1]?.trim().split(" ") ?? [];
    const rad = (-11 * Math.PI) / 180;
    expect(Number.parseFloat(x ?? "")).toBeCloseTo(-Math.sin(rad) * reach, 1);
    expect(Number.parseFloat(y ?? "")).toBeCloseTo(-(1 - Math.cos(rad)) * reach, 1);
  });

  it("tints under a mouse, as the heart does", async () => {
    const el = build(bell("false"));
    const b = q(el, "button");
    const off = q(el, ".cp-icon:not([data-part])");
    off.style.transition = "none";
    await userEvent.hover(b, { force: true });
    const s = getComputedStyle(off);
    const look = [s.backgroundColor, s.translate];
    await userEvent.unhover(b, { force: true });
    expect(look).toEqual([colourOf("var(--cp-accent)"), "none"]);
  });
});

describe("a still bell", () => {
  it("plays nothing on load, nor on a toggle that starts on", () => {
    const el = build(bell("true") + bell("false"));
    const [on, off] = [...el.querySelectorAll<HTMLButtonElement>("button")];
    enhanceToggle(on as HTMLButtonElement);
    enhanceToggle(off as HTMLButtonElement);
    for (const icon of el.querySelectorAll<HTMLElement>(".cp-icon")) {
      expect(icon.getAnimations()).toEqual([]);
      expect(getComputedStyle(icon).animationName).toBe("none");
    }
  });

  it("is still as it turns off", () => {
    const el = build(bell("false"));
    const b = q(el, "button");
    b.dataset["cpToggled"] = "off";
    for (const icon of el.querySelectorAll<HTMLElement>(".cp-icon")) {
      expect(getComputedStyle(icon).animationName).toBe("none");
    }
  });

  it.skipIf(!emulates)("shows the fill alone under reduced motion", async () => {
    await media("prefers-reduced-motion", "reduce");
    const el = build(bell("true"));
    const b = q(el, "button");
    b.dataset["cpToggled"] = "on";
    const s = getComputedStyle(onIcon(el));
    expect([s.animationName, s.backgroundColor]).toEqual(["none", colourOf("var(--cp-accent)")]);
  });
});

/** The icon's pixels from one screenshot, as RGBA bytes. */
async function pixels(el: HTMLElement): Promise<Uint8ClampedArray> {
  const shot = await page.screenshot({ element: el, base64: true, save: false });
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height).data;
}

const furthest = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  expect(a.length).toBe(b.length);
  let most = 0;
  for (let i = 0; i < a.length; i++) {
    most = Math.max(most, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  }
  return most;
};

const svgUrl = (name: string) => new URL(`../../../icons/svg/${name}.svg`, import.meta.url);

async function svg(name: string): Promise<Document> {
  const text = await (await fetch(svgUrl(name))).text();
  return new DOMParser().parseFromString(text, "image/svg+xml");
}

const paths = (doc: Document) =>
  [...doc.querySelectorAll("path")].map((p) => p.outerHTML.replace(/ xmlns="[^"]*"/, ""));

describe("the bell at rest", () => {
  it("draws bell-ring-filled less its two sound arcs, from the body and the clapper", async () => {
    const ring = await svg("bell-ring-filled");
    const arcs = ["M22 8c0-2.3-.8-4.3-2-6", "M4 2C2.8 3.7 2 5.7 2 8"];
    for (const p of [...ring.querySelectorAll("path")]) {
      if (arcs.includes(p.getAttribute("d") ?? "")) {
        p.remove();
      }
    }
    const kept = paths(ring);
    expect(kept).toHaveLength(2);
    const parts = [...paths(await svg("bell-body-filled")), ...paths(await svg("bell-clapper"))];
    expect(parts.toSorted()).toEqual(kept.toSorted());

    const el = build(bell("true"));
    const icon = onIcon(el);
    expect(getComputedStyle(icon).maskImage.match(/url\(/g)).toHaveLength(2);
    const layered = await pixels(icon);
    const one = (url: string) => {
      icon.style.mask = `url("${url}") center / contain no-repeat`;
    };
    one(`data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(ring))}`);
    const reference = await pixels(icon);
    one(svgUrl("bell-ring-filled").href);
    const withArcs = await pixels(icon);
    expect(furthest(layered, reference)).toBeLessThanOrEqual(2);
    expect(furthest(layered, withArcs)).toBeGreaterThan(64);
  });
});

describe("a toggle's icon", () => {
  const kinds = [
    'data-kind="pin" aria-label="Pin"',
    'data-kind="favourite" aria-label="Favourite"',
    'data-kind="theme" aria-label="Theme"',
    'data-motion="ring" data-tone="accent"',
  ];
  const toggle = (attrs: string, words: string) =>
    `<button class="cp-button cp-toggle" data-variant="quiet" ${attrs} type="button" aria-pressed="false"><span class="cp-icon" aria-hidden="true"></span><span class="cp-icon" data-part="on" aria-hidden="true"></span>${words}</button>`;

  for (const pointer of ["fine", "coarse"] as const) {
    it(`sits a whole number of pixels into its button, ${pointer} pointer`, () => {
      document.documentElement.dataset["pointer"] = pointer;
      const el = build(
        `<p>${kinds.map((k) => toggle(k, "")).join("")}</p>` +
          `<p>${kinds.map((k) => toggle(k, "Notify me")).join("")}</p>` +
          `<p>${kinds.map((k) => toggle(`${k} data-size="sm"`, "")).join("")}</p>` +
          `<p>${kinds.map((k) => toggle(`${k} data-size="sm"`, "Notify me")).join("")}</p>` +
          `<header class="cp-header">${kinds.map((k) => toggle(k, "")).join("")}</header>`,
      );
      const off: string[] = [];
      for (const b of el.querySelectorAll<HTMLElement>("button")) {
        for (const pressed of ["false", "true"]) {
          b.setAttribute("aria-pressed", pressed);
          const icon = q(b, pressed === "true" ? '[data-part="on"]' : ".cp-icon:not([data-part])");
          const r = icon.getBoundingClientRect();
          const box = b.getBoundingClientRect();
          const inset = [r.top - box.top, r.left - box.left, r.width, r.height];
          if (!inset.every((v) => Number.isInteger(v))) {
            off.push(`${b.outerHTML.slice(0, 90)} ${pressed}: ${inset.join(" ")}`);
          }
        }
      }
      expect(off).toEqual([]);
    });
  }
});
