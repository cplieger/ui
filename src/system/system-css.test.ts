import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { cdp, page, server, userEvent } from "vitest/browser";

import { installRadioFocus } from "../core/radio-focus/radio-focus.js";

const root = document.documentElement;
let sheet: HTMLLinkElement;
const hosts: HTMLElement[] = [];

// Linked the way an app links it, so the dev server serves it as a stylesheet.
async function link(file: string): Promise<HTMLLinkElement> {
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = new URL(`../../css/${file}`, import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    el.addEventListener("load", resolve, { once: true });
    el.addEventListener("error", reject, { once: true });
  });
  document.head.append(el);
  await loaded;
  return el;
}

beforeEach(async () => {
  sheet = await link("system.css");
});

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks; Firefox and WebKit skip the tests that need it.
const emulates = server.browser === "chromium";

afterEach(async () => {
  if (emulates) {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  await page.viewport(1280, 720);
  sheet.remove();
  for (const d of document.querySelectorAll("dialog")) {
    d.remove();
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  root.classList.remove("cp");
  root.removeAttribute("data-theme");
  root.removeAttribute("data-pointer");
  for (const p of ["--cp-accent-h", "--cp-accent-c"]) {
    root.style.removeProperty(p);
  }
});

function host(
  className: string,
  attrs: Record<string, string> = {},
  tag: keyof HTMLElementTagNameMap = "div",
): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.body.append(el);
  hosts.push(el);
  return el;
}

// The rendered sRGB of an opaque CSS colour, read back through a canvas pixel;
// a transparent one (an unresolved token) throws instead of reading as black.
function rgb(colour: string): [number, number, number] {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  if (a !== 255) {
    throw new Error(`${colour} is not opaque`);
  }
  return [r, g, b];
}

// WCAG 2.2 relative luminance and contrast ratio.
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function build(markup: string): HTMLElement {
  const el = host("");
  // Static test markup, never caller text.
  el.setHTMLUnsafe(markup);
  return el;
}

const media = (name: string, value: string) =>
  cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });

const theme = (t: "light" | "dark") => {
  root.classList.add("cp");
  root.setAttribute("data-theme", t);
};

// A harmony colour as the browser resolves it: [lightness 0 to 1, chroma, hue].
function harmonyAt(n: number, accentHue: number, accentChroma = 0.137): [number, number, number] {
  root.style.setProperty("--cp-accent-h", String(accentHue));
  root.style.setProperty("--cp-accent-c", String(accentChroma));
  const el = host("");
  el.style.color = `var(--cp-harmony-${String(n)})`;
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(getComputedStyle(el).color);
  if (m === null) {
    throw new Error(`harmony ${String(n)} resolved to ${getComputedStyle(el).color}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("css/system.css harmony colours", () => {
  it("leads with the accent's solid and turns its hue 150 and 210 degrees for the partners", () => {
    theme("light");
    const lead = harmonyAt(1, 255);
    const el = host("");
    el.style.color = "var(--cp-accent-9)";
    // Step 9 is 54.8% less the green dip's tail at hue 255.
    const l9 = 0.548 - 0.024 * Math.cos((66 * Math.PI) / 180) ** 4;
    expect(lead[0]).toBeCloseTo(l9, 5);
    expect(lead.slice(1)).toEqual([0.137, 255]);
    expect(getComputedStyle(el).color).toBe(`oklch(${String(lead[0])} 0.137 255)`);
    expect(harmonyAt(2, 255)[2]).toBeCloseTo(45, 3);
    expect(harmonyAt(3, 220)[2]).toBeCloseTo(70, 3);
    expect(harmonyAt(4, 255)[2]).toBeCloseTo(255, 3);
  });

  it("wraps a turn past 360 degrees round to the start of the wheel", () => {
    theme("light");
    expect(harmonyAt(3, 300)[2]).toBeCloseTo(150, 3);
  });

  it("moves a partner out of the yellow-greens, to 95 below 117.5 and to 142 from there", () => {
    theme("light");
    // 320 + 150 = 470, which is 110; 340 + 150 = 490, which is 130.
    expect(harmonyAt(2, 320)[2]).toBeCloseTo(95, 3);
    expect(harmonyAt(2, 340)[2]).toBeCloseTo(142, 3);
    // 327.5 + 150 is 117.5, the first hue of the upper half
    expect(harmonyAt(2, 327.5)[2]).toBeCloseTo(142, 3);
    expect(harmonyAt(2, 310)[2]).toBeCloseTo(100, 3);
  });

  it("lifts a yellow partner above the accent, and keeps the others at its lightness", () => {
    theme("light");
    const [yellowL] = harmonyAt(2, 305);
    const [blueL] = harmonyAt(2, 110);
    // the floor's peak, 50% + 32%, and step 9's 56% for a blue
    expect(yellowL).toBeCloseTo(0.82, 2);
    expect(blueL).toBeCloseTo(0.56, 2);
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      expect(harmonyAt(2, hue)[0]).toBeGreaterThanOrEqual(harmonyAt(1, hue)[0]);
    }
  });

  it("gives a partner a fifth more chroma than the accent, so a muted accent's stay muted, and caps a vivid one's", () => {
    theme("light");
    expect(harmonyAt(2, 255)[1]).toBeCloseTo(0.1644, 3);
    expect(harmonyAt(2, 255, 0.05)[1]).toBeCloseTo(0.06, 3);
    // a cyan partner holds less chroma inside sRGB than a vivid seed asks for
    expect(harmonyAt(3, 350, 0.2)[1]).toBeLessThan(0.107);
  });

  it("inks an orange partner of the default blue in white, as the accent", () => {
    theme("light");
    root.style.setProperty("--cp-accent-h", "255");
    const el = host("");
    el.style.color = "var(--cp-harmony-2-on)";
    expect(rgb(getComputedStyle(el).color)).toEqual([255, 255, 255]);
  });

  for (const t of ["light", "dark"] as const) {
    it(`inks every harmony colour at 4.5:1 or more in ${t}`, () => {
      theme(t);
      for (const hue of [0, 45, 95, 150, 200, 255, 310]) {
        root.style.setProperty("--cp-accent-h", String(hue));
        for (const n of [1, 2, 3, 4]) {
          const el = host("");
          el.style.color = `var(--cp-harmony-${String(n)}-on)`;
          el.style.backgroundColor = `var(--cp-harmony-${String(n)})`;
          const cs = getComputedStyle(el);
          expect(
            contrast(cs.color, cs.backgroundColor),
            `hue ${String(hue)} harmony ${String(n)}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});

describe("css/system.css", () => {
  it("styles nothing and sets no colour scheme until an element opts in with cp", () => {
    root.setAttribute("data-theme", "dark");
    const button = host("plain");
    expect(getComputedStyle(root).colorScheme).toBe("normal");
    expect(getComputedStyle(button).fontFamily).not.toContain("Atkinson");
  });

  it("follows data-theme once html carries cp", () => {
    theme("dark");
    expect(getComputedStyle(root).colorScheme).toBe("dark");
    expect(luminance(rgb(getComputedStyle(root).backgroundColor))).toBeLessThan(0.02);
    theme("light");
    expect(getComputedStyle(root).colorScheme).toBe("light");
    expect(luminance(rgb(getComputedStyle(root).backgroundColor))).toBeGreaterThan(0.85);
  });

  for (const t of ["light", "dark"] as const) {
    it(`gives body text 7:1 on the page in ${t}`, () => {
      theme(t);
      const s = getComputedStyle(root);
      expect(contrast(s.color, s.backgroundColor)).toBeGreaterThanOrEqual(7);
    });

    it(`inks a primary button in black or white at 4.5:1 or more in ${t}, for a yellow accent too`, () => {
      theme(t);
      for (const [h, c] of [
        ["255", "0.13"],
        ["95", "0.12"],
      ] as const) {
        root.style.setProperty("--cp-accent-h", h);
        root.style.setProperty("--cp-accent-c", c);
        const b = getComputedStyle(host("cp-button", { "data-variant": "primary" }));
        expect(["rgb(0, 0, 0)", "rgb(255, 255, 255)"]).toContain(b.color);
        expect(contrast(b.color, b.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`raises a solid's contrast with its ink on hover in ${t}`, () => {
      theme(t);
      const rest = getComputedStyle(host("probe-rest")).getPropertyValue("--cp-accent-9");
      const hover = getComputedStyle(host("probe-hover")).getPropertyValue("--cp-accent-10");
      const ink = getComputedStyle(host("cp-button", { "data-variant": "primary" })).color;
      const solid = (v: string) => {
        const el = host("probe");
        el.style.backgroundColor = v;
        return getComputedStyle(el).backgroundColor;
      };
      expect(contrast(ink, solid(hover))).toBeGreaterThan(contrast(ink, solid(rest)));
    });
  }

  it("resolves tokens against the colour scheme of the element that uses them", () => {
    theme("light");
    const region = host("cp-panel");
    region.style.colorScheme = "dark";
    const inner = document.createElement("div");
    inner.style.backgroundColor = "var(--cp-surface-raised)";
    region.append(inner);
    expect(luminance(rgb(getComputedStyle(inner).backgroundColor))).toBeLessThan(0.02);
  });

  it("colours a chip by its tone", () => {
    theme("light");
    const accent = getComputedStyle(host("cp-chip")).backgroundColor;
    const danger = getComputedStyle(host("cp-chip", { "data-tone": "danger" })).backgroundColor;
    const [ar, , ab] = rgb(accent);
    const [dr, , db] = rgb(danger);
    expect(ab).toBeGreaterThan(ar);
    expect(dr).toBeGreaterThan(db);
  });

  it("leaves elements and widgets as the browser draws them until cp is set", () => {
    const el = build(
      '<a href="#x">link</a><h1>title</h1><pre>pre</pre><span class="cp-icon"></span>',
    );
    const read = () =>
      ["a", "h1", "pre", ".cp-icon"].map((sel) => {
        const cs = getComputedStyle(el.querySelector(sel) as Element);
        return [
          cs.color,
          cs.fontFamily,
          cs.fontSize,
          cs.marginBlockStart,
          cs.backgroundColor,
          cs.maskImage,
          cs.inlineSize,
        ].join("|");
      });
    const styled = read();
    sheet.disabled = true;
    expect(styled).toEqual(read());
  });

  it("sizes controls and rows by the pointer tier", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button">Go</button><table class="cp-table"><tbody><tr><td>x</td></tr></tbody></table>',
    );
    const sizes = () => [
      (el.querySelector(".cp-button") as HTMLElement).getBoundingClientRect().height,
      (el.querySelector("td") as HTMLElement).getBoundingClientRect().height,
    ];
    root.dataset["pointer"] = "fine";
    expect(sizes()).toEqual([32, 36]);
    root.dataset["pointer"] = "coarse";
    expect(sizes()).toEqual([44, 48]);
  });

  it("sizes a segmented control and date and time fields to one control height, level with an input and a button", () => {
    theme("light");
    const el = build(
      '<input class="cp-input" id="t"><button class="cp-button" type="button">Go</button>' +
        '<input class="cp-input" type="date"><input class="cp-input" type="time">' +
        '<div class="cp-segmented"><label>A<input type="radio" name="s" checked></label>' +
        '<label>B<input type="radio" name="s"></label></div>',
    );
    const h = (sel: string) =>
      (el.querySelector(sel) as HTMLElement).getBoundingClientRect().height;
    for (const tier of ["fine", "coarse"]) {
      root.dataset["pointer"] = tier;
      const line = h("#t");
      expect(h(".cp-button")).toBe(line);
      expect(h(".cp-segmented")).toBe(line);
      expect(h('[type="date"]')).toBe(line);
      expect(h('[type="time"]')).toBe(line);
    }
  });

  it("twirls a checked checkbox into an accent circle, holds a dash for some, and keeps its size in a table", () => {
    theme("light");
    root.dataset["pointer"] = "fine";
    const el = build(
      '<i style="background: var(--cp-accent)"></i>' +
        '<input class="cp-checkbox" type="checkbox" checked><input class="cp-checkbox" type="checkbox" id="some">' +
        '<table class="cp-table"><tbody><tr><td data-col="select"><label><input class="cp-checkbox" type="checkbox"></label></td></tr></tbody></table>',
    );
    for (const i of el.querySelectorAll("input")) {
      i.style.transition = "none";
    }
    (el.querySelector("#some") as HTMLInputElement).indeterminate = true;
    const accent = getComputedStyle(el.querySelector("i") as Element).backgroundColor;
    const [on, some, row] = [...el.querySelectorAll("input")] as HTMLInputElement[];
    const cs = getComputedStyle(on as Element);
    expect([cs.backgroundColor, cs.borderRadius, cs.rotate]).toEqual([accent, "50%", "90deg"]);
    expect(getComputedStyle(some as Element).backgroundColor).toBe(accent);
    expect(decodeURIComponent(getComputedStyle(some as Element, "::before").maskImage)).toContain(
      "M7.5 12h9",
    );
    expect((row as Element).getBoundingClientRect().width).toBe(22);
  });

  it("gives a checkbox and a radio a hit area of the tier's minimum around their box", () => {
    theme("light");
    for (const [tier, min] of [
      ["fine", 24],
      ["coarse", 44],
    ] as const) {
      root.dataset["pointer"] = tier;
      const el = build(
        '<div style="padding: 40px"><input class="cp-checkbox" type="checkbox" aria-label="A"></div><div style="padding: 40px"><input class="cp-radio" type="radio" aria-label="B"></div>',
      );
      for (const input of el.querySelectorAll("input")) {
        const box = input.getBoundingClientRect();
        const reach = (min - box.width) / 2 - 0.5;
        expect(document.elementFromPoint(box.right + reach, box.top + box.height / 2)).toBe(input);
        expect(document.elementFromPoint(box.right + reach + 2, box.top + box.height / 2)).not.toBe(
          input,
        );
      }
      el.remove();
    }
  });

  it("fills a chosen radio with the accent", () => {
    theme("light");
    const el = build(
      '<i style="background: var(--cp-accent)"></i><input class="cp-radio" type="radio" name="r" checked>',
    );
    const r = el.querySelector("input") as HTMLInputElement;
    r.style.transition = "none";
    expect(getComputedStyle(r).backgroundColor).toBe(
      getComputedStyle(el.querySelector("i") as Element).backgroundColor,
    );
  });

  it("draws a select's chevron from the stylesheet and keeps its text clear of it", () => {
    theme("light");
    const el = build(
      '<div class="cp-select"><select class="cp-input"><option>Every hour</option></select></div>',
    );
    const wrap = el.querySelector(".cp-select") as Element;
    expect(decodeURIComponent(getComputedStyle(wrap, "::after").maskImage)).toContain(
      "m6 9 6 6 6-6",
    );
    expect(getComputedStyle(wrap.querySelector("select") as Element).paddingInlineEnd).toBe("40px");
  });

  it("keeps a stepper one control tall and as wide as what it holds", () => {
    theme("light");
    for (const tier of ["fine", "coarse"]) {
      root.dataset["pointer"] = tier;
      const el = build(
        '<input class="cp-input" id="line"><div class="cp-field" style="inline-size: 30rem"><div class="cp-stepper"><button class="cp-button" type="button">-</button><input type="number" value="3"><button class="cp-button" type="button">+</button></div></div>',
      );
      const box = (el.querySelector(".cp-stepper") as Element).getBoundingClientRect();
      expect(box.height).toBe(
        (el.querySelector("#line") as Element).getBoundingClientRect().height,
      );
      expect(box.width).toBeLessThan(200);
      // 16px on touch, so iOS does not zoom into the number.
      const size = Number.parseFloat(
        getComputedStyle(el.querySelector(".cp-stepper > input") as Element).fontSize,
      );
      expect(size >= 16).toBe(tier === "coarse");
    }
  });

  it("shows a saved secret's Saved part or its field, never both", () => {
    theme("light");
    const el = build(
      '<div class="cp-secret" data-cp-state="saved"><div data-part="saved">Saved</div><div data-part="edit">Field</div></div>',
    );
    const secret = el.firstElementChild as HTMLElement;
    const shown = () => [...secret.children].map((c) => getComputedStyle(c).display !== "none");
    expect(shown()).toEqual([true, false]);
    secret.dataset["cpState"] = "edit";
    expect(shown()).toEqual([false, true]);
  });

  it("draws the danger glyph for an error written without one, and not twice for one with it", () => {
    theme("light");
    const el = build(
      '<span class="cp-field-error">Bare</span><span class="cp-field-error"><span class="cp-icon"></span>With</span>',
    );
    const [bare, withIcon] = [...el.querySelectorAll(".cp-field-error")];
    expect(decodeURIComponent(getComputedStyle(bare as Element, "::before").maskImage)).toContain(
      "m15 9-6 6",
    );
    expect(getComputedStyle(withIcon as Element, "::before").content).toBe("none");
  });

  it("turns a done Copy green with white words, and keeps the box one control tall", () => {
    theme("light");
    const el = build(
      '<input class="cp-input" id="line"><div class="cp-code"><code>key</code><button class="cp-button cp-copy" type="button" data-cp-state="done">Copy</button></div>',
    );
    const copy = el.querySelector(".cp-copy") as HTMLElement;
    copy.style.transition = "none";
    const cs = getComputedStyle(copy);
    expect(rgb(cs.color)).toEqual([255, 255, 255]);
    expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect((el.querySelector(".cp-code") as Element).getBoundingClientRect().height).toBe(
      (el.querySelector("#line") as Element).getBoundingClientRect().height,
    );
  });

  it("keeps a single line of chosen values one control tall, and draws each chip's remove mark", () => {
    theme("light");
    for (const tier of ["fine", "coarse"]) {
      root.dataset["pointer"] = tier;
      const el = build(
        '<input class="cp-input" id="line"><div class="cp-tokens"><span class="cp-token" data-value="a"><span>a</span><button type="button" aria-label="Remove a"></button></span><input aria-label="Tags"></div>',
      );
      expect((el.querySelector(".cp-tokens") as Element).getBoundingClientRect().height).toBe(
        (el.querySelector("#line") as Element).getBoundingClientRect().height,
      );
      const mark = getComputedStyle(el.querySelector(".cp-token > button") as Element, "::before");
      expect(decodeURIComponent(mark.maskImage)).toContain("M18 6 6 18");
    }
  });

  it("keeps a field with a fixed part one control tall, and rings the whole box for its focused field", () => {
    theme("light");
    for (const tier of ["fine", "coarse"]) {
      root.dataset["pointer"] = tier;
      const el = build(
        '<input class="cp-input" id="line"><div class="cp-affix"><span>https://</span><input class="cp-input" id="host"></div>',
      );
      expect((el.querySelector(".cp-affix") as Element).getBoundingClientRect().height).toBe(
        (el.querySelector("#line") as Element).getBoundingClientRect().height,
      );
    }
  });

  it("shows a search field's clear button only while it holds text, and draws its glass", () => {
    theme("light");
    const el = build(
      '<div class="cp-search"><input class="cp-input" type="search" placeholder="Search" id="q"><button class="cp-button" aria-label="Clear"></button></div>',
    );
    const search = el.querySelector(".cp-search") as Element;
    const clear = el.querySelector("button") as HTMLElement;
    clear.style.transition = "none";
    expect(getComputedStyle(clear).opacity).toBe("0");
    (el.querySelector("#q") as HTMLInputElement).value = "Frieren";
    expect(getComputedStyle(clear).opacity).toBe("1");
    expect(decodeURIComponent(getComputedStyle(search, "::before").maskImage)).toContain(
      "m21 21-4.34-4.34",
    );
  });

  it("grows a text area from three lines to ten, then scrolls", () => {
    theme("light");
    const el = build('<textarea class="cp-input" rows="1"></textarea>');
    const a = el.querySelector("textarea") as HTMLTextAreaElement;
    const lh = Number.parseFloat(getComputedStyle(a).lineHeight);
    const h = () => a.getBoundingClientRect().height;
    expect(h()).toBeGreaterThanOrEqual(lh * 3);
    a.value = "line\n".repeat(30);
    a.style.blockSize = "auto";
    expect(h()).toBeLessThanOrEqual(lh * 10 + 32);
  });

  it("presses a button by data-cp-pressed as well as :active, and never a disabled one", async () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button" data-cp-pressed="">Go</button><button class="cp-button" type="button" data-cp-pressed="" disabled>No</button><button class="cp-button" type="button" data-cp-pressed="" aria-disabled="true">Full</button>',
    );
    const [on, off, full] = [...el.querySelectorAll("button")];
    for (const b of [on, off, full]) {
      (b as HTMLElement).style.transition = "none";
    }
    const scale = (b: Element | undefined) =>
      new DOMMatrix(getComputedStyle(b as Element).transform).a;
    // Firefox keeps the scale as a float32, 0.9700000286.
    expect(scale(on)).toBeCloseTo(0.97, 6);
    expect([scale(off), scale(full)]).toEqual([1, 1]);
  });

  it.skipIf(!emulates)("does not scale a press under reduced motion", async () => {
    theme("light");
    const el = build('<button class="cp-button" type="button" data-cp-pressed="">Go</button>');
    const button = el.querySelector("button") as HTMLElement;
    button.style.transition = "none";
    await media("prefers-reduced-motion", "reduce");
    expect(new DOMMatrix(getComputedStyle(button).transform).a).toBe(1);
  });

  it("keeps a fast second tap on a control a tap, and leaves text fields alone", () => {
    theme("light");
    const el = build(
      '<a href="#t">a</a><button type="button">b</button><label>c <input type="checkbox"></label><details><summary>d</summary></details><select><option>e</option></select><div role="tab">f</div><div role="button">g</div><input type="text">',
    );
    const controls = el.querySelectorAll("a, button, label, summary, select, [role]");
    expect([...controls].map((c) => getComputedStyle(c).touchAction)).toEqual(
      Array(7).fill("manipulation"),
    );
    expect(getComputedStyle(el.querySelector('input[type="text"]') as Element).touchAction).toBe(
      "auto",
    );
  });

  it("centres a gate page's panel in a column at most 24rem wide, inside a 320px window too", async () => {
    theme("light");
    const markup =
      '<main class="cp-gate"><div class="cp-wordmark"><span class="cp-mark">R</span>Release tracker</div>' +
      '<section class="cp-panel"><h1>Sign in</h1><input class="cp-input"></section><p>Lost access?</p></main>';
    await page.viewport(1280, 720);
    const wide = (build(markup).querySelector(".cp-panel") as HTMLElement).getBoundingClientRect();
    expect([wide.width, wide.left + wide.width / 2]).toEqual([384, 640]);
    await page.viewport(320, 700);
    const el = build(markup);
    const narrow = (el.querySelector(".cp-panel") as HTMLElement).getBoundingClientRect();
    expect(narrow.width).toBeLessThan(320);
    expect(
      [...el.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > 320.5),
    ).toEqual([]);
  });

  it("keeps a form's fields at most 32rem wide with its button at the start, and grows an input beside its control", () => {
    theme("light");
    root.dataset["pointer"] = "fine";
    const el = build(
      '<form class="cp-form"><div class="cp-field"><label class="cp-label" for="f">Name</label>' +
        '<div class="cp-input-row"><input class="cp-input" id="f"><button class="cp-button" type="button">Copy</button></div></div>' +
        '<button class="cp-button" type="submit">Save</button></form>',
    );
    const box = (sel: string) => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
    expect(box(".cp-form").width).toBe(512);
    expect(box('[type="submit"]').width).toBeLessThan(200);
    const row = box(".cp-input-row");
    const [input, copy] = [box(".cp-input"), box('[type="button"]')];
    expect(input.width + 8 + copy.width).toBeCloseTo(row.width, 0);
    expect(input.width).toBeGreaterThan(copy.width);
  });

  it("keeps a row's actions on one line and a chip in a cell stack at its own width", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><tbody><tr><td><div class="cp-cell-stack"><span class="cp-chip">Turned off</span><small>after many failed attempts, which is a long line</small></div></td>' +
        '<td data-col="actions"><div class="cp-toolbar"><button class="cp-button" type="button">Turn it back on</button><button class="cp-button" type="button">Change password…</button></div></td></tr></tbody></table>',
    );
    const [a, b] = [...el.querySelectorAll("button")].map((n) => n.getBoundingClientRect().top);
    expect(a).toBe(b);
    const chip = (el.querySelector(".cp-chip") as HTMLElement).getBoundingClientRect().width;
    const line = (el.querySelector("small") as HTMLElement).getBoundingClientRect().width;
    expect(chip).toBeLessThan(line);
  });

  it("gives a heading row's toolbar its own line by the row's width, not the window's", () => {
    theme("light");
    const el = build(
      '<div style="inline-size: 300px"><div class="cp-heading-row"><h2>Sources</h2><div class="cp-toolbar"><button class="cp-button" type="button">Add</button></div></div></div>' +
        '<div style="inline-size: 900px"><div class="cp-heading-row"><h2>Sources</h2><div class="cp-toolbar"><button class="cp-button" type="button">Add</button></div></div></div>',
    );
    const [narrow, wide] = [...el.querySelectorAll<HTMLElement>(".cp-toolbar")].map(
      (t) => getComputedStyle(t).justifyContent,
    );
    expect([narrow, wide]).toEqual(["start", "end"]);
  });

  it("spaces a rule and a heading row in a stack by the stack's gap alone", () => {
    theme("light");
    const el = build(
      '<div class="cp-heading-row"><h1>Out</h1></div><div class="cp-stack"><hr><div class="cp-heading-row"><h2>In</h2></div></div>',
    );
    const margins = (n: Element | null) => {
      const cs = getComputedStyle(n as Element);
      return [cs.marginBlockStart, cs.marginBlockEnd];
    };
    expect(margins(el.querySelector(".cp-stack > hr"))).toEqual(["0px", "0px"]);
    expect(margins(el.querySelector(".cp-stack > .cp-heading-row"))).toEqual(["0px", "0px"]);
    expect(margins(el.querySelector(".cp-heading-row"))[1]).toBe("20px");
  });

  for (const t of ["light", "dark"] as const) {
    it(`draws a switch whose track and thumb clear 3:1 on and off in ${t}`, () => {
      theme(t);
      const el = build(
        '<input class="cp-switch" type="checkbox" role="switch"><input class="cp-switch" type="checkbox" role="switch" checked>',
      );
      const page = getComputedStyle(root).backgroundColor;
      for (const sw of el.querySelectorAll("input")) {
        sw.style.transition = "none";
        const track = getComputedStyle(sw).backgroundColor;
        const thumb = getComputedStyle(sw, "::after").backgroundColor;
        expect(contrast(track, page), `track ${sw.checked ? "on" : "off"}`).toBeGreaterThanOrEqual(
          3,
        );
        expect(contrast(thumb, track), `thumb ${sw.checked ? "on" : "off"}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    });
  }

  it("moves a switch's thumb to the end when on, towards the left in right-to-left, and grows it for a finger", () => {
    theme("light");
    root.dataset["pointer"] = "fine";
    const el = build(
      '<input class="cp-switch" type="checkbox" role="switch" checked><div dir="rtl"><input class="cp-switch" type="checkbox" role="switch" checked></div>',
    );
    const [ltr, rtl] = [...el.querySelectorAll("input")] as HTMLInputElement[];
    const travel = (sw: HTMLInputElement | undefined) => {
      const box = (sw as HTMLInputElement).getBoundingClientRect();
      // The thumb is a pseudo-element with its own transition.
      for (const a of document.getAnimations()) {
        a.finish();
      }
      const tx = Number.parseFloat(getComputedStyle(sw as Element, "::after").translate);
      return [box.width, box.height, tx];
    };
    expect(travel(ltr)).toEqual([44, 24, 20]);
    expect(travel(rtl)).toEqual([44, 24, -20]);
    root.dataset["pointer"] = "coarse";
    expect(travel(ltr)).toEqual([52, 30, 22]);
  });

  it.skipIf(!emulates)("keeps a switch's state in forced colours", async () => {
    theme("light");
    await media("forced-colors", "active");
    const el = build('<input class="cp-switch" type="checkbox" role="switch" checked>');
    const sw = el.querySelector("input") as HTMLInputElement;
    sw.style.transition = "none";
    const cs = getComputedStyle(sw);
    expect(cs.borderStyle).toBe("solid");
    expect(cs.backgroundColor).not.toBe(getComputedStyle(sw, "::after").backgroundColor);
  });

  it("fills the chosen segment and rings it when its radio has keyboard focus", async () => {
    const life = new AbortController();
    onTestFinished(() => life.abort());
    installRadioFocus({ signal: life.signal });
    theme("light");
    const el = build(
      '<div class="cp-segmented" role="radiogroup" aria-label="Theme"><label><input type="radio" name="t" value="s">System</label><label><input type="radio" name="t" value="l" checked>Light</label></div>',
    );
    const [system, light] = [...el.querySelectorAll("label")] as HTMLLabelElement[];
    for (const l of [system, light]) {
      (l as HTMLElement).style.transition = "none";
    }
    const fill = (l: Element | undefined) => getComputedStyle(l as Element).backgroundColor;
    expect(fill(light)).not.toBe(fill(system));
    const radio = (light as HTMLLabelElement).querySelector("input") as HTMLInputElement;
    const box = radio.getBoundingClientRect();
    const label = (light as HTMLLabelElement).getBoundingClientRect();
    expect([box.width, box.height]).toEqual([label.width, label.height]);
    radio.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await new Promise((resolve) => setTimeout(resolve));
    expect((system as HTMLLabelElement).querySelector("input")?.checked).toBe(true);
    expect(fill(system)).not.toBe(fill(light));
    expect(getComputedStyle(system as Element).outlineStyle).toBe("solid");
  });

  it("lays settings categories beside the form, and in a row above it on a narrow screen", async () => {
    theme("light");
    const markup =
      '<div class="cp-settings"><nav class="cp-settings-nav" aria-label="Settings"><a href="#c" aria-current="page">Connections</a><a href="#l">Languages</a><a href="#s">System</a></nav>' +
      '<div><div class="cp-setting"><div><label class="cp-label" for="n">Notifications</label><span class="cp-help">When a check ends</span></div><input class="cp-switch" id="n" type="checkbox" role="switch"></div></div></div>';
    await page.viewport(1280, 720);
    const wide = build(markup);
    const box = (el: HTMLElement, sel: string) =>
      (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
    expect(box(wide, ".cp-settings-nav").right).toBeLessThan(box(wide, ".cp-setting").left);
    const row = box(wide, ".cp-setting");
    expect(box(wide, ".cp-switch").right).toBeCloseTo(row.right, 0);
    await page.viewport(600, 800);
    const narrow = build(markup);
    const links = [...narrow.querySelectorAll(".cp-settings-nav > a")].map(
      (a) => a.getBoundingClientRect().top,
    );
    expect(new Set(links).size).toBe(1);
    expect(box(narrow, ".cp-settings-nav").bottom).toBeLessThanOrEqual(
      box(narrow, ".cp-setting").top,
    );
  });

  it("keeps the save bar in view at the bottom of a long form, and gone while hidden", () => {
    theme("light");
    const el = build(
      '<div class="cp-savebar"><span>3 unsaved changes</span></div><div class="cp-savebar" hidden></div>',
    );
    const [shown, gone] = [...el.querySelectorAll(".cp-savebar")].map((n) => getComputedStyle(n));
    expect([shown?.position, shown?.insetBlockEnd]).toEqual(["sticky", "12px"]);
    expect(gone?.display).toBe("none");
  });

  it("keeps an aria-disabled button under the pointer, so a press on it keeps focus", async () => {
    theme("light");
    const el = build('<button class="cp-button" type="button" aria-disabled="true">Full</button>');
    const b = el.querySelector("button");
    expect(b && getComputedStyle(b).pointerEvents).toBe("auto");
    expect(b && getComputedStyle(b).cursor).toBe("not-allowed");
    b?.focus();
    const r = b?.getBoundingClientRect();
    expect(r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)).toBe(b);
  });

  it.each(["light", "dark"] as const)(
    "raises a plain button off a notice's wash, edged at 3:1, in %s",
    (t) => {
      theme(t);
      const el = build(
        '<div class="cp-notice" data-tone="warning"><span>Lost.</span><button class="cp-button" type="button">Retry</button></div>',
      );
      const notice = el.querySelector(".cp-notice");
      const b = el.querySelector("button");
      const [wash, edge, fill] =
        notice && b
          ? [
              getComputedStyle(notice).backgroundColor,
              getComputedStyle(b).borderTopColor,
              getComputedStyle(b).backgroundColor,
            ]
          : ["", "", ""];
      expect(fill).not.toBe(wash);
      expect(contrast(edge, wash)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(["light", "dark"] as const)(
    "keeps a grey fill findable on a raised surface in %s",
    (t) => {
      theme(t);
      const el = build(
        '<button class="cp-button" type="button">Next</button><span class="probe"></span>',
      );
      const b = el.querySelector("button");
      const probe = el.querySelector<HTMLElement>(".probe");
      probe?.style.setProperty("background-color", "var(--cp-surface-raised)");
      const [fill, raised] =
        b && probe
          ? [getComputedStyle(b).backgroundColor, getComputedStyle(probe).backgroundColor]
          : ["", ""];
      expect(contrast(fill, raised)).toBeGreaterThanOrEqual(1.18);
    },
  );

  it("keeps a plain row action visible on a hovered row, and lets the button's own state fill win", async () => {
    theme("light");
    root.dataset["pointer"] = "fine";
    const el = build(
      '<table class="cp-table"><tbody><tr><td>Frieren</td><td data-col="actions">' +
        '<button class="cp-button" type="button" id="plain">Grab</button>' +
        '<button class="cp-button" type="button" id="done" data-cp-state="done">Grabbed</button>' +
        '<button class="cp-button" data-variant="quiet" type="button" id="quiet">More</button>' +
        "</td></tr></tbody></table>" +
        '<style>.cp-button[data-cp-state="done"] { background: rgb(0, 128, 0); }</style>',
    );
    const fill = (id: string) =>
      getComputedStyle(el.querySelector(`#${id}`) as Element).backgroundColor;
    const cell = el.querySelector("td") as HTMLElement;
    const rest = fill("plain");
    await userEvent.hover(cell);
    const row = getComputedStyle(cell).backgroundColor;
    expect(fill("plain")).not.toBe(row);
    expect(fill("plain")).not.toBe(rest);
    expect(fill("done")).toBe("rgb(0, 128, 0)");
    expect(fill("quiet")).toBe("rgba(0, 0, 0, 0)");
    await userEvent.unhover(cell);
  });

  it("leaves an unavailable quiet button without a fill and greys a plain one", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" data-variant="quiet" type="button" aria-disabled="true" id="qa">Up</button>' +
        '<button class="cp-button" data-variant="quiet" type="button" disabled id="qd">Up</button>' +
        '<button class="cp-button" type="button" disabled id="pd">Save</button>',
    );
    const fill = (id: string) =>
      getComputedStyle(el.querySelector(`#${id}`) as Element).backgroundColor;
    expect(fill("qa")).toBe("rgba(0, 0, 0, 0)");
    expect(fill("qd")).toBe("rgba(0, 0, 0, 0)");
    expect(fill("pd")).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("separates breadcrumb levels with a mark that is not read, pointing the reading way", () => {
    theme("light");
    const el = build(
      '<nav class="cp-crumbs"><a href="#">Library</a><a href="#">Frieren</a><span>Season 1</span></nav><nav class="cp-crumbs" dir="rtl"><a href="#">a</a><span>b</span></nav>',
    );
    const [ltr, rtl] = [...el.querySelectorAll(".cp-crumbs")];
    const mark = (n: Element | null | undefined) => (n ? getComputedStyle(n, "::before") : null);
    const items = ltr ? [...ltr.children] : [];
    expect(items.map((n) => mark(n)?.content)).toEqual(["none", '""', '""']);
    expect(mark(items[1])?.maskImage).toMatch(/^url\(".*svg/);
    expect(ltr?.textContent).toBe("LibraryFrierenSeason 1");
    expect(mark(rtl?.children[1])?.scale).toBe("-1 1");
  });

  it("draws a plain button beside a field at the field's full height", () => {
    theme("light");
    const el = build(
      '<div class="cp-input-row"><input class="cp-input"><button class="cp-button" type="button">Search</button></div>',
    );
    const [f, b] = [el.querySelector("input"), el.querySelector("button")];
    expect(b && getComputedStyle(b).backgroundClip).toBe("border-box");
    expect(b?.getBoundingClientRect().height).toBe(f?.getBoundingClientRect().height);
  });

  it("draws no ring on a heading that takes focus by script, and keeps a control's", () => {
    theme("light");
    const el = build(
      '<h1 tabindex="-1">Step 2 of 3</h1><button class="cp-button" type="button">Next</button>',
    );
    const h = el.querySelector("h1");
    h?.focus();
    expect(h && getComputedStyle(h).outlineStyle).toBe("none");
    const b = el.querySelector("button");
    b?.focus();
    expect(b && getComputedStyle(b).outlineStyle).not.toBe("none");
  });

  it("rings a focused field outside with a gap, like a button, in the field's state colour", () => {
    theme("light");
    const el = build(
      '<input class="cp-input" id="a"><input class="cp-input" id="b" aria-invalid="true"><input class="cp-input" id="c" data-tone="warning"><span class="probe"></span>',
    );
    const probe = el.querySelector<HTMLElement>(".probe");
    const colour = (v: string) => {
      probe?.style.setProperty("color", v);
      return probe ? getComputedStyle(probe).color : "";
    };
    const ring = (id: string) => {
      const f = el.querySelector<HTMLInputElement>(`#${id}`);
      f?.focus();
      const cs = f ? getComputedStyle(f) : null;
      return [cs?.outlineColor, cs?.borderTopColor, parseFloat(cs?.outlineOffset ?? "0")];
    };
    const a = ring("a");
    expect(a[0]).toBe(colour("var(--cp-focus-ring)"));
    expect(a[1]).toBe(colour("var(--cp-focus-ring)"));
    expect(a[2]).toBeGreaterThan(0);
    expect(ring("b")[0]).toBe(colour("var(--cp-danger-9)"));
    expect(ring("c")[0]).toBe(colour("var(--cp-warning-9)"));
  });

  it("presses an icon-only button by its fill, never by scale, and a worded one by scale", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button" data-cp-pressed="">Go</button><button class="cp-button" type="button" aria-label="Settings" data-cp-pressed=""><span class="cp-icon"></span></button>',
    );
    const [worded, icon] = [...el.querySelectorAll("button")].map((b) => {
      b.style.transition = "none";
      return getComputedStyle(b);
    });
    expect(new DOMMatrix(worded?.transform).a).toBeCloseTo(0.97, 6);
    expect(new DOMMatrix(icon?.transform).a).toBe(1);
    expect(icon?.backgroundColor).not.toBe(worded?.backgroundColor);
  });

  it("draws a row's title link in ink without an underline, and the accent under a mouse; a link in a sentence keeps both", async () => {
    theme("light");
    root.dataset["pointer"] = "fine";
    const el = build(
      '<p>See <a href="#" id="s">the guide</a>.</p><div class="cp-cell-stack"><a href="#" id="t">Mushishi</a><span>TV</span></div>' +
        '<span class="probe"></span>',
    );
    const probe = el.querySelector<HTMLElement>(".probe");
    const colour = (v: string) => {
      probe?.style.setProperty("color", v);
      return probe ? getComputedStyle(probe).color : "";
    };
    const link = (id: string) => getComputedStyle(el.querySelector(`#${id}`) as Element);
    expect(link("t").textDecorationColor).toBe("rgba(0, 0, 0, 0)");
    expect(link("t").color).toBe(colour("var(--cp-ink)"));
    expect(link("s").textDecorationColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(link("s").color).toBe(colour("var(--cp-accent-ink)"));
    const title = el.querySelector("#t") as HTMLElement;
    await userEvent.hover(title);
    expect(link("t").color).toBe(colour("var(--cp-accent-ink)"));
    expect(link("t").textDecorationColor).not.toBe("rgba(0, 0, 0, 0)");
    await userEvent.unhover(title);
  });

  it("keeps a segmented choice as wide as its options inside a grid", () => {
    theme("light");
    const el = build(
      '<div style="display:grid;inline-size:40rem"><div class="cp-segmented"><label><input type="radio" name="x" checked>Today</label><label><input type="radio" name="x">7 days</label></div></div>',
    );
    const seg = el.querySelector(".cp-segmented")?.getBoundingClientRect();
    expect(seg && seg.width < 300).toBe(true);
  });

  it("gives a file field's chooser the plain button's fill, centred in the field", () => {
    theme("light");
    const el = build(
      '<input class="cp-input" type="file"><button class="cp-button" type="button">B</button>',
    );
    const f = el.querySelector("input");
    const chooser = f ? getComputedStyle(f, "::file-selector-button") : null;
    const button = el.querySelector("button");
    expect(chooser?.backgroundColor).toBe(button ? getComputedStyle(button).backgroundColor : "");
    expect(f && getComputedStyle(f).alignItems).toBe("center");
  });

  it.each(["light", "dark"] as const)("inks a success solid as the accent's in %s", (t) => {
    theme(t);
    const el = build('<span class="probe"></span><span class="probe2"></span>');
    const [a, b] = [
      el.querySelector<HTMLElement>(".probe"),
      el.querySelector<HTMLElement>(".probe2"),
    ];
    a?.style.setProperty("color", "var(--cp-success-on)");
    b?.style.setProperty("color", "var(--cp-accent-on)");
    const ink = a ? getComputedStyle(a).color : "";
    expect(ink).toBe(b ? getComputedStyle(b).color : "-");
    if (t === "light") {
      expect(ink).toBe("rgb(255, 255, 255)");
    }
  });

  it("starts the rail's content at main's height", () => {
    theme("light");
    const el = build(
      '<div class="cp-app"><header class="cp-header">H</header><nav class="cp-rail"><p>R</p></nav><main class="cp-main"><p>M</p></main></div>',
    );
    const [r, m] = [...el.querySelectorAll("p")].map((p) => p.getBoundingClientRect().top);
    expect(r).toBe(m);
  });

  it("shrinks a field and the button beside it to a narrow column", () => {
    theme("light");
    const el = build(
      '<div style="inline-size:15rem"><div class="cp-field"><label class="cp-label">Search</label><div class="cp-input-row"><span style="display:flex;flex:1;min-inline-size:0"><input class="cp-input" size="40" style="flex:1;min-inline-size:0"></span><button class="cp-button" type="button">Search</button></div></div></div>',
    );
    const row = el.querySelector(".cp-input-row")?.getBoundingClientRect();
    expect(row?.width).toBe(240);
  });

  it("keeps a header link's hidden label inside a nav that scrolls", () => {
    theme("light");
    const el = build(
      '<nav class="cp-nav" style="inline-size:6rem;overflow-x:auto"><a class="cp-nav-item" href="#"><span>A</span><span class="cp-nav-label" style="position:absolute;inset-inline-start:30rem">Library</span></a></nav>',
    );
    const label = el.querySelector(".cp-nav-label");
    expect(label?.parentElement && getComputedStyle(label.parentElement).position).toBe("relative");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  it("gives a header destination a whole control's height under a mouse", () => {
    theme("light");
    document.documentElement.dataset["pointer"] = "fine";
    const el = build(
      '<a class="cp-nav-item" href="#">Library</a><button class="cp-button" type="button">Go</button>',
    );
    const [a, b] = [el.querySelector("a"), el.querySelector("button")];
    expect(a?.getBoundingClientRect().height).toBe(b?.getBoundingClientRect().height);
    delete document.documentElement.dataset["pointer"];
  });

  it("draws a disabled field in the disabled ink on a sunken fill", () => {
    theme("light");
    const el = build(
      '<select class="cp-input" disabled><option>HD</option></select><select class="cp-input"><option>HD</option></select><span class="probe"></span>',
    );
    const [off, on] = [...el.querySelectorAll("select")].map((n) => getComputedStyle(n));
    const probe = el.querySelector<HTMLElement>(".probe");
    probe?.style.setProperty("color", "var(--cp-ink-disabled)");
    probe?.style.setProperty("background-color", "var(--cp-fill)");
    const want = probe ? getComputedStyle(probe) : null;
    expect([off?.color, off?.backgroundColor]).toEqual([want?.color, want?.backgroundColor]);
    expect(on?.color).not.toBe(off?.color);
  });

  it("masks a password in the platform's font, and shows typed text in the body font", () => {
    theme("light");
    const el = build(
      '<input class="cp-input" type="password"><input class="cp-input" type="text">',
    );
    const [pw, text] = [...el.querySelectorAll("input")].map((n) => getComputedStyle(n).fontFamily);
    expect(pw).toBe("system-ui, sans-serif");
    // Chromium quotes a family name with spaces; Firefox and WebKit do not.
    expect(text).toMatch(/^"?Atkinson Hyperlegible Next"?,/);
  });

  it("hides an element with the hidden attribute whatever display its class sets", () => {
    theme("light");
    const el = build(
      '<span class="cp-field-error" hidden>Wrong</span><section class="cp-batchbar" hidden></section><div class="cp-stack" hidden></div><span class="cp-field-error">Shown</span>',
    );
    const shown = [...el.children].map((n) => getComputedStyle(n).display);
    expect(shown).toEqual(["none", "none", "none", "flex"]);
  });

  it("drops low-priority columns under 64rem of container, and mid ones under 44rem", () => {
    theme("light");
    const el = build(
      '<div class="cp-main"><table class="cp-table"><tbody><tr><td>title</td><td data-priority="mid">mid</td><td data-priority="low">low</td></tr></tbody></table></div>',
    );
    const main = el.querySelector(".cp-main") as HTMLElement;
    const shown = () =>
      [...el.querySelectorAll("td")].map((td) => getComputedStyle(td).display !== "none");
    main.style.inlineSize = "1100px";
    expect(shown()).toEqual([true, true, true]);
    main.style.inlineSize = "900px";
    expect(shown()).toEqual([true, true, false]);
    main.style.inlineSize = "600px";
    expect(shown()).toEqual([true, false, false]);
  });

  it("drops the rail under 60rem of viewport", async () => {
    theme("light");
    const rail = build('<aside class="cp-rail">filters</aside>').firstElementChild as HTMLElement;
    await page.viewport(1280, 720);
    expect(getComputedStyle(rail).display).not.toBe("none");
    await page.viewport(800, 720);
    expect(getComputedStyle(rail).display).toBe("none");
  });

  it("keeps a header inside a 320px viewport by wrapping it", async () => {
    theme("light");
    root.dataset["pointer"] = "coarse";
    await page.viewport(320, 700);
    const el = build(
      '<div class="cp-app"><header class="cp-header">' +
        '<a class="cp-wordmark" href="#"><span class="cp-mark">R</span><span class="cp-hidden-narrow">Release tracker</span></a>' +
        '<nav class="cp-nav">' +
        ["Overview", "Library", "Releases"]
          .map(
            (w) =>
              `<a class="cp-nav-item" href="#"><span class="cp-icon"></span><span class="cp-nav-label">${w}</span></a>`,
          )
          .join("") +
        '</nav><div class="cp-toolbar"><span class="cp-chip">Full check 3 of 8</span>' +
        '<button class="cp-button" data-variant="quiet" type="button" aria-label="Theme"><span class="cp-icon"></span></button>'.repeat(
          3,
        ) +
        "</div></header></div>",
    );
    const past = [...el.querySelectorAll("*")].filter(
      (n) => n.getBoundingClientRect().right > 320.5,
    );
    expect(past.map((n) => n.className)).toEqual([]);
    // The toolbar takes a row of its own, under the mark and the destinations.
    const below = (el.querySelector(".cp-wordmark") as HTMLElement).getBoundingClientRect().bottom;
    for (const item of el.querySelectorAll(".cp-toolbar > *")) {
      expect(item.getBoundingClientRect().top).toBeGreaterThanOrEqual(below);
      expect(item.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    }
  });

  for (const t of ["light", "dark"] as const) {
    it(`fills the header with the brand and inks it at 4.5:1 in ${t}`, () => {
      theme(t);
      const cs = getComputedStyle(host("cp-header"));
      expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    });

    it.skipIf(!emulates)(`inks the header at 7:1 with more contrast in ${t}`, async () => {
      theme(t);
      const header = host("cp-header");
      await media("prefers-contrast", "more");
      const cs = getComputedStyle(header);
      expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(7);
    });

    it(`writes a field's error text at 4.5:1 on the page in ${t}`, () => {
      theme(t);
      const error = host("cp-field-error");
      const page = getComputedStyle(root).backgroundColor;
      expect(contrast(getComputedStyle(error).color, page)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.skipIf(!emulates)("borders chips in forced colours", async () => {
    theme("light");
    const chip = host("cp-chip");
    expect(getComputedStyle(chip).borderTopWidth).toBe("0px");
    await media("forced-colors", "active");
    expect(getComputedStyle(chip).borderTopWidth).toBe("1px");
  });

  it("fills a selected row and leaves the others", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><tbody>' +
        '<tr><td data-col="select"><label><input type="checkbox" checked></label></td><td>a</td></tr>' +
        '<tr><td data-col="select"><label><input type="checkbox"></label></td><td>b</td></tr>' +
        "</tbody></table>",
    );
    const [on, off] = [...el.querySelectorAll("tr")].map(
      (tr) => getComputedStyle(tr.cells[1] as HTMLElement).backgroundColor,
    );
    expect(rgb(on ?? "")).not.toEqual(rgb(getComputedStyle(root).backgroundColor));
    expect(off).toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps a disabled quiet button in the header disabled-looking", () => {
    theme("light");
    const el = build(
      '<header class="cp-header"><button class="cp-button" data-variant="quiet" type="button">On</button><button class="cp-button" data-variant="quiet" type="button" disabled>Off</button></header>',
    );
    const [on, off] = [...el.querySelectorAll("button")].map((b) => getComputedStyle(b).color);
    expect(off).not.toBe(on);
  });

  it("runs a view transition at the long duration", async () => {
    theme("light");
    const transition = document.startViewTransition(() => undefined);
    await transition.ready;
    const group = document
      .getAnimations()
      .find(
        (a) =>
          (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
            "::view-transition-group",
          ) === true,
      );
    expect(group?.effect?.getTiming().duration).toBe(360);
    await transition.finished;
  });

  it("sizes h1 to h4 at 23, 19, 16 and 14px", () => {
    theme("light");
    const el = build("<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4>");
    const sizes = ["h1", "h2", "h3", "h4"].map(
      (t) => getComputedStyle(el.querySelector(t) as Element).fontSize,
    );
    expect(sizes).toEqual(["23px", "19px", "16px", "14px"]);
  });

  it("shows hover on a link and a button under a fine pointer and not under a coarse one", async () => {
    theme("light");
    const el = build('<a href="#h">link</a> <button class="cp-button" type="button">Go</button>');
    const a = el.querySelector("a") as HTMLElement;
    const button = el.querySelector("button") as HTMLElement;
    a.style.transition = "none";
    button.style.transition = "none";
    const rest = [
      getComputedStyle(a).textDecorationColor,
      getComputedStyle(button).backgroundColor,
    ];
    const hovered = async () => {
      await userEvent.hover(a);
      const link = getComputedStyle(a).textDecorationColor;
      await userEvent.hover(button);
      const fill = getComputedStyle(button).backgroundColor;
      await userEvent.unhover(button);
      return [link, fill];
    };
    root.dataset["pointer"] = "fine";
    const fine = await hovered();
    expect(fine[0]).not.toBe(rest[0]);
    expect(fine[1]).not.toBe(rest[1]);
    root.dataset["pointer"] = "coarse";
    expect(await hovered()).toEqual(rest);
  });

  it("opens a sheet at the inline end at full height, across the window when compact", async () => {
    theme("light");
    const dialog = document.createElement("dialog");
    dialog.className = "cp-dialog";
    dialog.dataset["variant"] = "sheet";
    dialog.style.transition = "none";
    document.body.append(dialog);
    dialog.showModal();
    const rect = () => dialog.getBoundingClientRect();
    expect([rect().right, rect().width, rect().top, rect().height]).toEqual([
      innerWidth,
      416,
      0,
      innerHeight,
    ]);
    root.dir = "rtl";
    expect(rect().left).toBe(0);
    root.removeAttribute("dir");
    await page.viewport(375, 700);
    expect(rect().width).toBe(375);
    dialog.close();
  });

  it("mirrors a drawing that points along the text in a right-to-left context", () => {
    theme("light");
    const el = build(
      '<span class="cp-icon" data-cp-icon="arrow-right"></span><span class="cp-icon" data-cp-icon="chevron-up"></span>',
    );
    el.dir = "rtl";
    const [along, up] = [...el.querySelectorAll("span")].map((i) => getComputedStyle(i).transform);
    expect(along).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    expect(up).toBe("none");
  });

  it("borders an invalid field in the danger colour", () => {
    theme("light");
    const el = build('<input class="cp-input"><input class="cp-input" aria-invalid="true">');
    const [valid, invalid] = [...el.querySelectorAll("input")].map(
      (i) => getComputedStyle(i).borderTopColor,
    );
    expect(invalid).not.toBe(valid);
  });

  it.skipIf(!emulates)("borders the current destination in forced colours", async () => {
    theme("light");
    const el = build('<a class="cp-nav-item" href="#" aria-current="page">Library</a>');
    await media("forced-colors", "active");
    expect(getComputedStyle(el.firstElementChild as Element).borderTopWidth).toBe("1px");
  });

  it("keeps the page inside a 320px window with a wide table and its hidden actions label", async () => {
    theme("light");
    await page.viewport(320, 700);
    build(
      '<div class="cp-panel" data-flush><table class="cp-table"><thead><tr><th>Title</th><th>Your copy</th>' +
        '<th data-col="actions"><span class="cp-visually-hidden">Actions</span></th></tr></thead>' +
        '<tbody><tr><td>A very long title that keeps going</td><td class="cp-mono">Some.Release.Name.1080p.BluRay.x265</td>' +
        '<td data-col="actions"><button class="cp-button" type="button">Grab</button></td></tr></tbody></table></div>',
    );
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });

  it("gives a lone row action the width of its column", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><tbody>' +
        '<tr><td data-col="actions"><button class="cp-button" type="button">Grab</button></td></tr>' +
        '<tr><td data-col="actions"><button class="cp-button" type="button">Search again</button></td></tr>' +
        "</tbody></table>",
    );
    const [a, b] = [...el.querySelectorAll("button")].map((x) => x.getBoundingClientRect().width);
    expect(a).toBe(b);
  });
});

describe("css/system.css buttons and arrangements", () => {
  for (const t of ["light", "dark"] as const) {
    it(`writes a confirmed button's done words at 4.5:1 on its green in ${t}`, () => {
      theme(t);
      const el = build(
        '<button class="cp-button" data-variant="primary" data-cp-confirm="glide" data-cp-state="done" type="button"><span class="cp-roll">Saved</span></button>',
      );
      const b = el.querySelector("button") as HTMLElement;
      b.style.transition = "none";
      const cs = getComputedStyle(b);
      expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("shows a confirmed button's busy and done drawings only in their state", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" data-cp-confirm="glide" type="button"><span class="cp-icon" data-cp-icon="save"></span><span class="cp-icon" data-part="busy"></span><span class="cp-icon" data-part="done"></span><span class="cp-roll">Save</span></button>',
    );
    const b = el.querySelector("button") as HTMLElement;
    const shown = () =>
      [...b.querySelectorAll(".cp-icon")].map((i) => getComputedStyle(i).display !== "none");
    expect(shown()).toEqual([true, false, false]);
    b.dataset["cpState"] = "busy";
    expect(shown()).toEqual([false, true, false]);
    b.dataset["cpState"] = "done";
    expect(shown()).toEqual([false, false, true]);
    b.dataset["cpState"] = "pending";
    expect(shown()).toEqual([true, false, false]);
  });

  it("keeps a confirmed delete red", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" data-tone="danger" data-cp-confirm="glide" type="button">Delete</button><button class="cp-button" data-tone="danger" data-cp-confirm="glide" data-cp-state="done" type="button">Deleted</button>',
    );
    const [rest, done] = [...el.querySelectorAll("button")] as HTMLElement[];
    for (const b of [rest, done]) {
      (b as HTMLElement).style.transition = "none";
    }
    const tone = host("", { "data-tone": "danger" });
    tone.style.color = "var(--cp-danger-9)";
    expect(getComputedStyle(done as Element).backgroundColor).toBe(getComputedStyle(tone).color);
  });

  it("paints a split button as one shape, its parts clear, and grows the action over its caret while it works", () => {
    theme("light");
    const el = build(
      '<div class="cp-split" role="group"><button class="cp-button" data-variant="primary" type="button">Grab the best</button><button class="cp-button" data-variant="primary" type="button" aria-label="More grab choices"><span class="cp-icon"></span></button></div>',
    );
    const split = el.querySelector(".cp-split") as HTMLElement;
    const [main, caret] = [...split.querySelectorAll("button")] as HTMLElement[];
    for (const n of [split, main, caret]) {
      (n as HTMLElement).style.transition = "none";
    }
    const accent = host("");
    accent.style.color = "var(--cp-tone-9)";
    expect(getComputedStyle(split).backgroundColor).toBe(getComputedStyle(accent).color);
    expect(getComputedStyle(main as Element).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(caret as Element).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const width = split.getBoundingClientRect().width;
    (main as HTMLElement).dataset["cpState"] = "busy";
    expect(getComputedStyle(main as Element).marginInlineEnd).toBe(
      `-${getComputedStyle(caret as Element).inlineSize}`,
    );
    expect(getComputedStyle(caret as Element).visibility).toBe("hidden");
    expect(split.getBoundingClientRect().width).toBeCloseTo(width, 0);
  });

  it("joins a group's buttons with one line and rounds only its outer corners", () => {
    theme("light");
    const el = build(
      '<div class="cp-group" role="group" aria-label="Zoom"><button class="cp-button" type="button">−</button><button class="cp-button" type="button">100%</button><button class="cp-button" type="button">+</button></div>',
    );
    const [a, b, c] = [...el.querySelectorAll("button")].map((n) => getComputedStyle(n));
    expect([a?.borderStartEndRadius, b?.borderStartStartRadius, c?.borderStartStartRadius]).toEqual(
      ["0px", "0px", "0px"],
    );
    expect(a?.borderStartStartRadius).not.toBe("0px");
    expect(c?.borderStartEndRadius).not.toBe("0px");
    expect([a?.borderInlineStartStyle, b?.borderInlineStartStyle]).toEqual(["solid", "solid"]);
    expect(b?.borderInlineStartWidth).toBe("1px");
  });

  it("colours a toggle that is on, and shows its filled drawing only then", () => {
    theme("light");
    const el = build(
      '<button class="cp-button cp-toggle" data-variant="quiet" data-kind="pin" aria-pressed="false" aria-label="Pin" type="button"><span class="cp-icon"></span><span class="cp-icon" data-part="on"></span></button>',
    );
    const b = el.querySelector("button") as HTMLElement;
    b.style.transition = "none";
    const shown = () =>
      [...b.querySelectorAll(".cp-icon")].map((i) => getComputedStyle(i).display !== "none");
    expect(shown()).toEqual([true, false]);
    const off = getComputedStyle(b).color;
    b.setAttribute("aria-pressed", "true");
    expect(shown()).toEqual([false, true]);
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    expect(getComputedStyle(b).color).toBe(getComputedStyle(accent).color);
    expect(getComputedStyle(b).color).not.toBe(off);
  });

  it("makes an icon segmented choice's segments square", () => {
    theme("light");
    const el = build(
      '<div class="cp-segmented" data-variant="icons" role="radiogroup" aria-label="View"><label><input type="radio" name="v" aria-label="List" checked><span class="cp-icon"></span></label><label><input type="radio" name="v" aria-label="Grid"><span class="cp-icon"></span></label></div>',
    );
    const box = (el.querySelector("label") as HTMLElement).getBoundingClientRect();
    expect(box.width).toBeCloseTo(box.height, 0);
  });

  it("wraps a cluster, stacks a side column once the rest would be narrow, and fits a grid's columns to its box", () => {
    theme("light");
    const el = build(
      '<div class="cp-cluster"><span>one</span><span>two</span></div>' +
        '<div class="cp-side-main"><div>side</div><div>main</div></div>' +
        '<div class="cp-grid"><div>a</div><div>b</div><div>c</div></div>',
    );
    const [cluster, side, grid] = [...el.children] as HTMLElement[];
    expect(getComputedStyle(cluster as Element).flexWrap).toBe("wrap");
    (side as HTMLElement).style.inlineSize = "900px";
    const [s1, m1] = [...(side as HTMLElement).children].map((c) => c.getBoundingClientRect());
    expect(s1?.top).toBe(m1?.top);
    (side as HTMLElement).style.inlineSize = "400px";
    const [s2, m2] = [...(side as HTMLElement).children].map((c) => c.getBoundingClientRect());
    expect(m2?.top).toBeGreaterThan(s2?.top ?? 0);
    // 14rem columns and 12px gaps: four fit in 1000px (932px), three in 900px.
    (grid as HTMLElement).style.inlineSize = "1000px";
    expect(getComputedStyle(grid as Element).gridTemplateColumns.split(" ")).toHaveLength(4);
    (grid as HTMLElement).style.inlineSize = "900px";
    expect(getComputedStyle(grid as Element).gridTemplateColumns.split(" ")).toHaveLength(3);
    (grid as HTMLElement).style.inlineSize = "300px";
    expect(getComputedStyle(grid as Element).gridTemplateColumns.split(" ")).toHaveLength(1);
  });

  it("gives a docked list-and-detail two columns, and a native dialog the overlay surface", () => {
    theme("light");
    const el = build(
      '<div class="cp-list-detail"><ul><li>a</li></ul><section class="cp-detail"><header><h2>A</h2></header></section></div>',
    );
    const ld = el.firstElementChild as HTMLElement;
    ld.style.inlineSize = "1000px";
    expect(getComputedStyle(ld).gridTemplateColumns.split(" ")).toHaveLength(1);
    ld.setAttribute("data-cp-docked", "");
    expect(getComputedStyle(ld).gridTemplateColumns.split(" ")).toHaveLength(2);
    const dialog = document.createElement("dialog");
    dialog.className = "cp-dialog";
    hosts.push(dialog as unknown as HTMLElement);
    document.body.append(dialog);
    const overlay = host("");
    overlay.style.color = "var(--cp-surface-overlay)";
    expect(getComputedStyle(dialog).backgroundColor).toBe(getComputedStyle(overlay).color);
  });
});

describe("css/system.css overlays", () => {
  afterEach(() => {
    for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
      p.hidePopover();
    }
  });

  it("places a popover under the button its anchor names, and flips it above near the window's foot", async () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button" id="opener">Actions</button>' +
        '<div class="cp-popover cp-menu" popover id="pop" role="menu"><button role="menuitem" type="button">Edit</button></div>',
    );
    const b = el.querySelector("#opener") as HTMLElement;
    const pop = el.querySelector("#pop") as HTMLElement;
    pop.style.transition = "none";
    b.style.setProperty("anchor-name", "--t-opener");
    pop.style.setProperty("position-anchor", "--t-opener");
    pop.showPopover();
    const below = b.getBoundingClientRect();
    expect(pop.getBoundingClientRect().top).toBeGreaterThanOrEqual(below.bottom);
    pop.hidePopover();
    b.style.position = "fixed";
    b.style.bottom = "4px";
    pop.showPopover();
    await new Promise((r) => requestAnimationFrame(r));
    expect(pop.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      b.getBoundingClientRect().top + 1,
    );
  });

  it("turns a checked menu item's box into an accent circle and shows a radio item's tick only when checked", () => {
    theme("light");
    const el = build(
      '<div class="cp-menu" role="menu"><button role="menuitemcheckbox" aria-checked="true" type="button">Posters</button>' +
        '<button role="menuitemradio" aria-checked="false" type="button">By name</button></div>',
    );
    const [check, radio] = [...el.querySelectorAll("button")] as HTMLElement[];
    const box = getComputedStyle(check as Element, "::before");
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    expect(box.borderRadius).toBe("50%");
    expect(box.backgroundColor).toBe(getComputedStyle(accent).color);
    expect(getComputedStyle(radio as Element, "::after").visibility).toBe("hidden");
    (radio as HTMLElement).setAttribute("aria-checked", "true");
    expect(getComputedStyle(radio as Element, "::after").visibility).toBe("visible");
  });

  it("opens a sheet the window's height at the inline end, and a confirmation narrower than a dialog", () => {
    theme("light");
    const sheet = document.createElement("dialog");
    sheet.className = "cp-dialog";
    sheet.dataset["variant"] = "sheet";
    sheet.style.transition = "none";
    const confirm = document.createElement("dialog");
    confirm.className = "cp-dialog";
    confirm.dataset["variant"] = "confirm";
    hosts.push(sheet as unknown as HTMLElement, confirm as unknown as HTMLElement);
    document.body.append(sheet, confirm);
    sheet.showModal();
    const r = sheet.getBoundingClientRect();
    expect(r.height).toBeCloseTo(innerHeight, 0);
    expect(r.right).toBeCloseTo(document.documentElement.clientWidth, 0);
    sheet.close();
    confirm.showModal();
    expect(confirm.getBoundingClientRect().width).toBeLessThanOrEqual(26 * 16 + 1);
    confirm.close();
  });

  it("stops the page scrolling while a modal dialog is open", () => {
    theme("light");
    const d = document.createElement("dialog");
    d.className = "cp-dialog";
    hosts.push(d as unknown as HTMLElement);
    document.body.append(d);
    expect(getComputedStyle(root).overflow).not.toBe("hidden");
    d.showModal();
    expect(getComputedStyle(root).overflow).toBe("hidden");
    d.close();
    expect(getComputedStyle(root).overflow).not.toBe("hidden");
  });
});

describe("css/system.css feedback and steps", () => {
  it("draws each toast kind's glyph in its tone, and drains a passing toast's line", () => {
    theme("light");
    const el = build(
      '<div class="cp-toast" data-kind="error"><span class="cp-toast-lead"></span><div class="cp-toast-text"><strong>No</strong></div></div>' +
        '<div class="cp-toast" data-kind="success"><span class="cp-toast-lead"></span><div class="cp-toast-text"><strong>Yes</strong></div><span class="cp-toast-time"></span></div>',
    );
    const [error, success] = [...el.querySelectorAll<HTMLElement>(".cp-toast")];
    const lead = (t: HTMLElement | undefined) =>
      getComputedStyle(t?.querySelector(".cp-toast-lead") as Element);
    const danger = host("");
    danger.style.color = "var(--cp-danger-9)";
    expect(lead(error).backgroundColor).toBe(getComputedStyle(danger).color);
    // The dev server inlines each drawing, so the glyphs are told apart, not named.
    expect(lead(error).maskImage).toMatch(/^url\(/);
    expect(lead(error).maskImage).not.toBe(lead(success).maskImage);
    expect(
      getComputedStyle(success?.querySelector(".cp-toast-time") as Element).animationName,
    ).toBe("cp-toast-drain");
  });

  it("puts a tooltip above its control by the anchor the tooltip script names", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button" id="tipped">Go</button><div class="cp-tooltip" popover="manual">Go there</div>',
    );
    const b = el.querySelector("#tipped") as HTMLElement;
    const tip = el.querySelector(".cp-tooltip") as HTMLElement;
    tip.style.transition = "none";
    b.style.setProperty("anchor-name", "--cp-tip-anchor");
    b.style.marginBlockStart = "120px";
    tip.showPopover();
    expect(tip.getBoundingClientRect().bottom).toBeLessThanOrEqual(b.getBoundingClientRect().top);
    tip.hidePopover();
  });

  it("fills the current step, ticks a done one, and hides text from the eye but keeps it for a reader", () => {
    theme("light");
    const el = build(
      '<ol class="cp-steps"><li data-state="done">Account<span class="cp-visually-hidden">, done</span></li><li data-state="current" aria-current="step">Sonarr</li><li data-state="todo">Check</li></ol>',
    );
    const [done, current, todo] = [...el.querySelectorAll("li")].map((l) =>
      getComputedStyle(l, "::before"),
    );
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    expect(current?.backgroundColor).toBe(getComputedStyle(accent).color);
    expect(done?.maskImage).toMatch(/^url\(/);
    expect(todo?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const hidden = el.querySelector(".cp-visually-hidden") as HTMLElement;
    expect([hidden.getBoundingClientRect().width, hidden.getBoundingClientRect().height]).toEqual([
      1, 1,
    ]);
    expect(hidden.textContent).toBe(", done");
  });

  it("twirls a loader through the harmony colours", () => {
    theme("light");
    const el = build('<span class="cp-loader" aria-hidden="true"><span></span></span>');
    expect(getComputedStyle(el.querySelector(".cp-loader > span") as Element).animationName).toBe(
      "cp-twirl-loop",
    );
  });
});
