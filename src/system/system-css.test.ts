import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { cdp, page, server, userEvent } from "vitest/browser";

import { installRadioFocus } from "../core/radio-focus/radio-focus.js";
import { enhanceShareBar } from "../data/share-bar/share-bar.js";
import { enhanceMeter } from "../data/meter/meter.js";
import { enhanceRankedBars } from "../data/ranked-bars/ranked-bars.js";
import { renderSparkline } from "../data/sparkline/sparkline.js";
import { enhanceRange } from "../forms/range/range.js";

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
const readings = new Map<string, [number, number, number]>();
function rgb(colour: string): [number, number, number] {
  const known = readings.get(colour);
  if (known !== undefined) {
    return known;
  }
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
  readings.set(colour, [r, g, b]);
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

// A series slot as the browser resolves it: [lightness 0 to 1, chroma, hue].
function seriesAt(n: number, accentHue: number, accentChroma = 0.137): [number, number, number] {
  root.style.setProperty("--cp-accent-h", String(accentHue));
  root.style.setProperty("--cp-accent-c", String(accentChroma));
  const el = host("");
  el.style.color = `var(--cp-series-${String(n)})`;
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(getComputedStyle(el).color);
  if (m === null) {
    throw new Error(`series ${String(n)} resolved to ${getComputedStyle(el).color}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("css/system.css series slots", () => {
  it("keeps the accent's hue for slot 1 and turns the others as the harmony partners do", () => {
    theme("light");
    // 255 turned by 0, 150, 210, 30, 60, 90, 120, 240 and 270, with 105 moved
    // out of the yellow-greens to 95
    const hues = [255, 45, 95, 285, 315, 345, 15, 135, 165];
    hues.forEach((h, i) => {
      expect(seriesAt(i + 1, 255)[2], `slot ${String(i + 1)}`).toBeCloseTo(h, 3);
    });
    expect(seriesAt(1, 110)[2]).toBeCloseTo(110, 3);
  });

  it("puts odd slots on the bright level and even slots on the deep one, in each theme", () => {
    theme("light");
    expect([1, 2, 3].map((n) => seriesAt(n, 255)[0])).toEqual([0.61, 0.42, 0.61]);
    theme("dark");
    expect([1, 2, 3].map((n) => seriesAt(n, 255)[0])).toEqual([0.8, 0.6, 0.8]);
  });

  it("gives a muted accent's slots chroma 0.11 and caps a vivid accent's at 0.16", () => {
    theme("light");
    expect(seriesAt(1, 30, 0.05)[1]).toBeCloseTo(0.11, 4);
    expect(seriesAt(1, 30, 0.12)[1]).toBeCloseTo(0.144, 4);
    expect(seriesAt(1, 30, 0.2)[1]).toBeCloseTo(0.16, 4);
  });

  for (const t of ["light", "dark"] as const) {
    it(`holds every slot at 3:1 on the page, raised, sunken and overlay surfaces in ${t}`, () => {
      theme(t);
      // Probes built once, so each hue costs one style pass, not one per probe.
      const probes = host("");
      const pairs = ["page", "raised", "sunken", "overlay"].flatMap((s) =>
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const el = document.createElement("span");
          el.style.color = `var(--cp-series-${String(n)})`;
          el.style.backgroundColor = `var(--cp-surface-${s})`;
          probes.append(el);
          return { el, name: `slot ${String(n)} on ${s}` };
        }),
      );
      for (let hue = 0; hue < 360; hue += 15) {
        root.style.setProperty("--cp-accent-h", String(hue));
        for (const { el, name } of pairs) {
          const cs = getComputedStyle(el);
          expect(
            contrast(cs.color, cs.backgroundColor),
            `hue ${String(hue)} ${name}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it("puts a chip's tint and text and a swatch's fill on the slot data-series names", () => {
    theme("light");
    root.style.setProperty("--cp-accent-h", "255");
    const chip = host("cp-chip", { "data-series": "2" }, "span");
    const swatch = host("cp-swatch", { "data-series": "2" }, "span");
    const plain = host("cp-chip", {}, "span");
    const hueOf = (colour: string) => Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(colour)?.[1]);
    expect(hueOf(getComputedStyle(chip).backgroundColor)).toBeCloseTo(45, 3);
    expect(hueOf(getComputedStyle(chip).color)).toBeCloseTo(45, 3);
    expect(hueOf(getComputedStyle(plain).backgroundColor)).toBeCloseTo(255, 3);
    const slot = host("");
    slot.style.color = "var(--cp-series-2)";
    expect(getComputedStyle(swatch).backgroundColor).toBe(getComputedStyle(slot).color);
  });
});

describe("css/system.css share bar", () => {
  function shareBar(rows: string): HTMLElement {
    theme("light");
    const el = build(
      `<div class="cp-share"><table class="cp-table"><tbody>${rows}</tbody></table></div>`,
    );
    el.style.inlineSize = "402px";
    const life = new AbortController();
    onTestFinished(() => {
      life.abort();
    });
    enhanceShareBar(el.querySelector(".cp-share") as HTMLElement, { signal: life.signal });
    return el;
  }
  const row = (series: string, label: string, n: number) =>
    `<tr data-series="${series}"><th><a href="#${label}">${label}</a></th><td><data value="${String(n)}">${String(n)}</data></td></tr>`;

  it("sizes each segment by its share with the surface showing through a 2px gap", () => {
    const el = shareBar(row("1", "best", 300) + row("2", "alt", 100));
    const [a, b] = [...el.querySelectorAll(".cp-share-bar > span")].map((s) =>
      s.getBoundingClientRect(),
    );
    expect((b?.left ?? 0) - (a?.right ?? 0)).toBeCloseTo(2, 1);
    // The 400px left after the gap, shared 300 to 100.
    expect(a?.width).toBeCloseTo(300, 0);
    expect(b?.width).toBeCloseTo(100, 0);
    expect(a?.height).toBe(24);
    expect(getComputedStyle(el.querySelector(".cp-share-bar") as Element).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("keeps a sliver of a tiny share in sight, fills each segment with its slot, and shows an empty whole as a bare track", () => {
    const el = shareBar(row("1", "best", 10_000) + row("3", "alt", 1));
    const [big, tiny] = [...el.querySelectorAll<HTMLElement>(".cp-share-bar > span")];
    expect(tiny?.getBoundingClientRect().width).toBeGreaterThanOrEqual(4);
    const slot = host("");
    slot.style.color = "var(--cp-series-3)";
    expect(getComputedStyle(tiny as Element).backgroundColor).toBe(getComputedStyle(slot).color);
    expect(getComputedStyle(big as Element).backgroundColor).not.toBe(getComputedStyle(slot).color);
    const empty = shareBar(row("1", "none", 0)).querySelector(".cp-share-bar") as HTMLElement;
    const fill = host("");
    fill.style.color = "var(--cp-fill)";
    expect(getComputedStyle(empty).backgroundColor).toBe(getComputedStyle(fill).color);
  });

  it("makes a legend link a chip with no underline, and every chip the hit area of the pointer", () => {
    const el = shareBar(
      row("1", "best", 3) +
        '<tr data-series="2"><th>plain</th><td><data value="1">1</data></td></tr>',
    );
    const chip = el.querySelector(".cp-share-legend a.cp-chip") as HTMLElement;
    const plain = el.querySelector(".cp-share-legend span.cp-chip") as HTMLElement;
    expect(getComputedStyle(chip).textDecorationLine).toBe("none");
    expect(chip.getBoundingClientRect().height).toBe(24);
    expect(plain.getBoundingClientRect().height).toBe(24);
    root.setAttribute("data-pointer", "coarse");
    expect(chip.getBoundingClientRect().height).toBe(44);
    expect(plain.getBoundingClientRect().height).toBe(44);
    expect(getComputedStyle(el.querySelector(".cp-share-legend") as Element).listStyleType).toBe(
      "none",
    );
  });

  it("reads a row's header as a cell of its row, its glyph beside its link's words", () => {
    const el = shareBar(row("1", "best", 3) + row("2", "alt", 1));
    const th = [...el.querySelectorAll<HTMLElement>("tbody th")];
    const td = el.querySelector("tbody td") as HTMLElement;
    for (const p of ["color", "fontSize", "fontWeight", "paddingInlineStart"] as const) {
      expect(getComputedStyle(th[0] as Element)[p], p).toBe(getComputedStyle(td)[p]);
    }
    expect(getComputedStyle(th[0] as Element).borderBlockEndWidth).toBe("1px");
    expect(getComputedStyle(th[1] as Element).borderBlockEndWidth).toBe("0px");
    const link = th[0]?.querySelector("a") as HTMLElement;
    const glyph = document.createElement("span");
    glyph.className = "cp-icon";
    link.prepend(glyph);
    expect(getComputedStyle(link).display).toBe("inline-flex");
    expect(getComputedStyle(link).alignItems).toBe("center");
  });

  it("fills a row's header with its row, hovered or selected", async () => {
    theme("light");
    root.setAttribute("data-pointer", "fine");
    const el = build(
      '<table class="cp-table"><tbody><tr><th scope="row">best</th><td>3</td></tr></tbody></table>',
    );
    const [th, td] = [el.querySelector("th"), el.querySelector("td")] as HTMLElement[];
    const fill = host("");
    fill.style.color = "var(--cp-fill)";
    await userEvent.hover(td as HTMLElement);
    expect(getComputedStyle(td as Element).backgroundColor).toBe(getComputedStyle(fill).color);
    expect(getComputedStyle(th as Element).backgroundColor).toBe(getComputedStyle(fill).color);
    await userEvent.unhover(td as HTMLElement);
    const pick = document.createElement("td");
    pick.dataset["col"] = "select";
    pick.setHTMLUnsafe('<label><input type="checkbox" checked aria-label="Pick"></label>');
    th?.before(pick);
    fill.style.color = "var(--cp-selected)";
    expect(getComputedStyle(th as Element).backgroundColor).toBe(getComputedStyle(fill).color);
  });

  it("shows a segment's tip under a mouse", async () => {
    root.setAttribute("data-pointer", "fine");
    const el = shareBar(row("1", "best", 3) + row("2", "alt", 1));
    await userEvent.hover(el.querySelector(".cp-share-bar > span") as HTMLElement);
    const tip = () => document.querySelector(".cp-tooltip");
    await expect.poll(() => tip()?.matches(":popover-open"), { timeout: 3000 }).toBe(true);
    expect(tip()?.textContent).toBe("best: 3, 75%");
  });
});

describe("css/system.css sparkline", () => {
  function sparkline(values: readonly number[], attrs = "", dir = "ltr"): HTMLElement {
    theme("light");
    const el = build(`<p dir="${dir}">Live <span class="cp-sparkline" ${attrs}></span></p>`);
    const spark = el.querySelector(".cp-sparkline") as HTMLElement;
    renderSparkline(spark, values);
    return spark;
  }
  const box = (el: Element | null) => (el as Element).getBoundingClientRect();
  const slot = (n: number) => {
    const probe = host("");
    probe.style.color = `var(--cp-series-${String(n)})`;
    return getComputedStyle(probe).color;
  };

  it("puts the dot on the last value, inside the sparkline's own box, and the value after it", () => {
    const el = sparkline([0, 10, 5]);
    const plot = box(el.querySelector('[data-part="plot"]'));
    const dot = box(el.querySelector('[data-part="dot"]'));
    expect(plot.width).toBe(96);
    expect(plot.height).toBe(20);
    expect(dot.width).toBe(6);
    expect(dot.left + dot.width / 2).toBeCloseTo(plot.right, 1);
    expect(dot.top + dot.height / 2).toBeCloseTo(plot.top + 10, 1);
    const outer = box(el);
    expect(dot.right).toBeLessThanOrEqual(outer.right);
    const top = sparkline([10, 0]);
    const high = box(top.querySelector('[data-part="plot"]'));
    expect(high.top - box(top).top).toBeGreaterThanOrEqual(3);
    const value = box(el.querySelector('[data-part="last"]'));
    expect(value.left - plot.right).toBeGreaterThanOrEqual(8);
    expect(
      getComputedStyle(el.querySelector('[data-part="last"]') as Element).fontVariantNumeric,
    ).toBe("tabular-nums");
  });

  it("draws in slot 1 by default and in the slot data-series names, its value in ink", () => {
    const plain = sparkline([1, 2]);
    expect(getComputedStyle(plain).color).toBe(slot(1));
    const fourth = sparkline([1, 2], 'data-series="4"');
    const path = fourth.querySelector("path") as SVGPathElement;
    expect(getComputedStyle(fourth).color).toBe(slot(4));
    expect(getComputedStyle(path).fill).toBe("none");
    expect(getComputedStyle(path).strokeWidth).toBe("2px");
    expect(getComputedStyle(path).vectorEffect).toBe("non-scaling-stroke");
    const ink = host("");
    ink.style.color = "var(--cp-ink)";
    expect(getComputedStyle(fourth.querySelector('[data-part="last"]') as Element).color).toBe(
      getComputedStyle(ink).color,
    );
  });

  it("runs left to right, its value after the dot, in a right-to-left page", () => {
    const el = sparkline([0, 10, 5], "", "rtl");
    const plot = box(el.querySelector('[data-part="plot"]'));
    const dot = box(el.querySelector('[data-part="dot"]'));
    expect(dot.left + dot.width / 2).toBeCloseTo(plot.right, 1);
    expect(box(el.querySelector('[data-part="last"]')).left).toBeGreaterThan(plot.right);
  });
});

describe("css/system.css figure", () => {
  const box = (el: Element | null) => (el as Element).getBoundingClientRect();
  const ink = (token: string) => {
    const probe = host("");
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const glyph = (el: Element | null, pseudo: "::before" | "::after") =>
    decodeURIComponent(getComputedStyle(el as Element, pseudo).maskImage);
  function figure(attrs = "", tag = "div", extra = ""): HTMLElement {
    theme("light");
    const end = tag === "a" ? ' href="#x"' : tag === "button" ? ' type="button"' : "";
    const el = build(
      `<div class="cp-grid" style="inline-size: 20rem"><${tag} class="cp-figure"${end} ${attrs}><span data-part="label">Store used</span> <span data-part="value"><data value="85">85</data>&nbsp;<span data-part="unit">%</span></span>${extra}</${tag}></div>`,
    );
    return el.querySelector(".cp-figure") as HTMLElement;
  }

  it("sets the number large under its muted label, with its unit on the number's baseline", () => {
    const fig = figure();
    const label = fig.querySelector('[data-part="label"]') as Element;
    const value = fig.querySelector('[data-part="value"]') as Element;
    const unit = fig.querySelector('[data-part="unit"]') as Element;
    expect(box(value).top).toBeGreaterThanOrEqual(box(label).bottom);
    expect(getComputedStyle(label).fontSize).toBe("13px");
    expect(getComputedStyle(label).color).toBe(ink("--cp-ink-muted"));
    const cs = getComputedStyle(value);
    expect([cs.fontSize, cs.fontWeight, cs.fontVariantNumeric, cs.color]).toEqual([
      "28px",
      "700",
      "tabular-nums",
      ink("--cp-ink"),
    ]);
    expect(getComputedStyle(unit).fontSize).toBe("16px");
    expect(getComputedStyle(unit).color).toBe(ink("--cp-ink-muted"));
    // One baseline: the unit's text bottom sits above the number's by its smaller descent only.
    const number = box(fig.querySelector("data"));
    expect(Math.abs(box(unit).bottom - number.bottom)).toBeLessThan(6);
    expect(box(unit).left).toBeGreaterThan(number.right);
    expect(getComputedStyle(value, "::before").content).toBe("none");
  });

  it("colours a number in its tone and draws a state tone's glyph before it", () => {
    const expected = { success: "m16 9-5.5 5.5L8 12", warning: "m21.73 18", danger: "m15 9-6 6" };
    for (const [tone, path] of Object.entries(expected)) {
      const value = figure(`data-tone="${tone}"`).querySelector('[data-part="value"]') as Element;
      expect(getComputedStyle(value).color, tone).toBe(ink(`--cp-${tone}-11`));
      expect(glyph(value, "::before"), tone).toContain(path);
      const mark = getComputedStyle(value, "::before");
      expect([mark.width, mark.height], tone).toEqual(["24px", "24px"]);
    }
    const neutral = figure('data-tone="neutral"').querySelector('[data-part="value"]') as Element;
    const tone = build('<span data-tone="neutral" style="color: var(--cp-tone-11)"></span>');
    expect(getComputedStyle(neutral).color).toBe(
      getComputedStyle(tone.firstChild as Element).color,
    );
    expect(getComputedStyle(neutral, "::before").content).toBe("none");
  });

  it("puts a sparkline beside the number at the figure's end, in the figure's slot", () => {
    const fig = figure('data-series="4"', "div", '<span class="cp-sparkline"></span>');
    const spark = fig.querySelector(".cp-sparkline") as HTMLElement;
    renderSparkline(spark, [1, 3, 2], { last: false });
    const value = box(fig.querySelector('[data-part="value"]'));
    const line = box(spark);
    expect(line.top).toBeLessThan(value.bottom);
    expect(line.bottom).toBeGreaterThan(value.top);
    expect(box(fig).right - line.right).toBeCloseTo(17, 0);
    expect(getComputedStyle(spark).color).toBe(ink("--cp-series-4"));
    expect(getComputedStyle(fig, "::after").content).toBe("none");
  });

  it("ends a figure that opens something in a chevron, down for a list, turned while it is open", () => {
    const link = figure("", "a");
    expect(glyph(link, "::after")).toContain("m9 18 6-6-6-6");
    expect(getComputedStyle(link).textDecorationLine).toBe("none");
    const chevron = getComputedStyle(link, "::after");
    expect([chevron.width, chevron.height, chevron.backgroundColor]).toEqual([
      "18px",
      "18px",
      ink("--cp-ink-muted"),
    ]);
    const shut = figure('aria-expanded="false"', "button");
    shut.style.setProperty("transition", "none");
    expect(glyph(shut, "::after")).toContain("m6 9 6 6 6-6");
    expect(getComputedStyle(shut, "::after").rotate).toBe("none");
    const open = figure('aria-expanded="true"', "button");
    expect(getComputedStyle(open, "::after").rotate).toBe("180deg");
    expect(getComputedStyle(open).backgroundColor).toBe(ink("--cp-selected"));
    expect(getComputedStyle(open).borderColor).toBe(ink("--cp-border-strong"));
    expect(getComputedStyle(shut).backgroundColor).toBe(ink("--cp-surface-raised"));
  });

  it.skipIf(!emulates)("turns an open figure's chevron at once under reduced motion", async () => {
    await media("prefers-reduced-motion", "reduce");
    const open = figure('aria-expanded="true"', "button");
    const chevron = getComputedStyle(open, "::after");
    expect([chevron.transitionDuration, chevron.rotate]).toEqual(["0s", "180deg"]);
  });

  it("keeps a sparkline and the chevron in their own columns, the chevron last", () => {
    const fig = figure("", "a", '<span class="cp-sparkline"></span>');
    renderSparkline(fig.querySelector(".cp-sparkline") as HTMLElement, [1, 2], { last: false });
    const cols = getComputedStyle(fig).gridTemplateColumns.split(" ");
    expect(cols).toHaveLength(3);
    expect(cols[2]).toBe("18px");
  });

  it("points a link figure's chevron the reading way in a right-to-left page", () => {
    const fig = figure('dir="rtl"', "a");
    expect(getComputedStyle(fig, "::after").scale).toBe("-1 1");
  });

  it("presses a figure that is a button, borders it under a mouse, and rings it on focus", async () => {
    root.setAttribute("data-pointer", "fine");
    const fig = figure("data-cp-pressed", "button");
    fig.style.transition = "none";
    // Firefox keeps the scale as a float32, 0.9700000286.
    expect(new DOMMatrix(getComputedStyle(fig).transform).a).toBeCloseTo(0.97, 6);
    fig.removeAttribute("data-cp-pressed");
    expect(getComputedStyle(fig).borderColor).toBe(ink("--cp-line"));
    await userEvent.hover(fig);
    expect(getComputedStyle(fig).borderColor).toBe(ink("--cp-border-strong"));
    fig.focus({ focusVisible: true });
    expect(getComputedStyle(fig).outlineStyle).toBe("solid");
    expect(getComputedStyle(fig).textAlign).toBe("start");
    // A button fills its grid cell as a tile does.
    expect(box(fig).width).toBe(320);
    root.setAttribute("data-pointer", "coarse");
    expect(getComputedStyle(fig).borderColor).toBe(ink("--cp-line"));
  });

  it("leads a card link's label with its glyph, at the label's own height", () => {
    const plain = figure("", "a").querySelector('[data-part="label"]') as HTMLElement;
    const card = figure("", "a");
    const label = card.querySelector('[data-part="label"]') as HTMLElement;
    label.prepend(
      build('<span class="cp-icon" data-cp-icon="arrow-up"></span>').firstChild as Node,
    );
    const icon = label.querySelector(".cp-icon") as Element;
    expect([box(icon).width, box(icon).height]).toEqual([16, 16]);
    expect(getComputedStyle(icon).backgroundColor).toBe(ink("--cp-ink-muted"));
    const words = document.createRange();
    words.selectNodeContents(label.lastChild as Node);
    expect(words.getBoundingClientRect().left - box(icon).right).toBe(4);
    expect(box(icon).left).toBe(box(card).left + 17);
    // Firefox lays out in 1/60 px, so heights agree to a hundredth.
    expect(box(label).height).toBeCloseTo(box(plain).height, 2);
  });

  it("sets a card link's badges as a row of chips under its number, at the start", () => {
    const chips = '<span class="cp-chip">3 new</span><span class="cp-chip">Kept from 03:00</span>';
    const card = figure("", "a", `<span class="cp-cluster" data-gap="tight">${chips}</span>`);
    const value = card.querySelector('[data-part="value"]') as Element;
    const [first, second] = [...card.querySelectorAll(".cp-chip")] as [Element, Element];
    expect(box(first).top).toBeGreaterThanOrEqual(box(value).bottom);
    expect(box(first).left).toBe(box(value).left);
    expect(box(second).top).toBe(box(first).top);
    expect(box(second).left - box(first).right).toBe(8);
    // The chevron still spans the label and number rows, beside them.
    expect(getComputedStyle(card, "::after").gridRowStart).toBe("1");
    expect(getComputedStyle(card, "::after").gridColumnStart).toBe("2");
  });
});

describe("css/system.css media card", () => {
  const box = (el: Element | null) => (el as Element).getBoundingClientRect();
  const paint = (token: string) => {
    const probe = host("");
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const card = (cover = "", title = "Frieren") =>
    `<a class="cp-media" href="#x"><span class="cp-cover"${cover}><span class="cp-icon" data-cp-icon="tv"></span><span class="cp-chip">Best</span></span><strong data-part="title">${title}</strong><small data-part="meta">2023, 28 episodes</small></a>`;
  function grid(...cards: string[]): HTMLElement {
    theme("light");
    return build(
      `<div class="cp-grid" style="inline-size: 40rem; --cp-grid-min: 9.5rem">${cards.join("")}</div>`,
    );
  }

  it("draws a 2:3 cover over a bold title and its muted facts, the card one link", () => {
    const a = grid(card()).querySelector(".cp-media") as HTMLElement;
    const cover = a.querySelector(".cp-cover") as Element;
    const title = a.querySelector('[data-part="title"]') as Element;
    const meta = a.querySelector('[data-part="meta"]') as Element;
    expect(box(cover).height).toBeCloseTo((box(cover).width * 3) / 2, 0);
    expect(getComputedStyle(cover).borderRadius).toBe("4px");
    expect(box(title).top - box(cover).bottom).toBeCloseTo(8, 2);
    expect(box(meta).top - box(title).bottom).toBeCloseTo(8, 2);
    const t = getComputedStyle(title);
    expect([t.fontSize, t.fontWeight, t.color]).toEqual(["14px", "700", paint("--cp-ink")]);
    const m = getComputedStyle(meta);
    expect([m.fontSize, m.color]).toEqual(["13px", paint("--cp-ink-muted")]);
    expect(getComputedStyle(a).textDecorationLine).toBe("none");
  });

  it("keeps each title under its cover when a neighbour's title wraps", () => {
    const long = "Frieren: Beyond Journey's End, the second season and its specials";
    const [, short] = [...grid(card("", long), card()).querySelectorAll(".cp-media")] as [
      Element,
      Element,
    ];
    const cover = short.querySelector(".cp-cover") as Element;
    expect(box(short.querySelector('[data-part="title"]')).top - box(cover).bottom).toBeCloseTo(
      8,
      2,
    );
  });

  it("fills a stand-in in a harmony colour with its glyph centred, and a chip at the top start", () => {
    for (const n of ["1", "2", "3", "4"]) {
      const cover = grid(card(` data-harmony="${n}"`)).querySelector(".cp-cover") as Element;
      expect(getComputedStyle(cover).backgroundColor, n).toBe(paint(`--cp-harmony-${n}`));
      expect(getComputedStyle(cover).color, n).toBe(paint(`--cp-harmony-${n}-on`));
    }
    const cover = grid(card()).querySelector(".cp-cover") as Element;
    expect(getComputedStyle(cover).backgroundColor).toBe(paint("--cp-harmony-1"));
    const icon = box(cover.querySelector(".cp-icon"));
    expect([icon.width, icon.height]).toEqual([32, 32]);
    const c = box(cover);
    expect(icon.left + 16).toBeCloseTo(c.left + c.width / 2, 0);
    expect(icon.top + 16).toBeCloseTo(c.top + c.height / 2, 0);
    const chip = box(cover.querySelector(".cp-chip"));
    expect([chip.top - c.top, chip.left - c.left]).toEqual([8, 8]);
    const rtl = grid(card(' dir="rtl"')).querySelector(".cp-cover") as Element;
    expect(box(rtl).right - box(rtl.querySelector(".cp-chip")).right).toBe(8);
  });

  it("fills the cover with the work's own image", () => {
    const img =
      '<img alt="" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22/%3E">';
    const a = grid(card()).querySelector(".cp-media") as HTMLElement;
    const cover = a.querySelector(".cp-cover") as Element;
    cover.prepend(build(img).firstChild as Node);
    const pic = cover.querySelector("img") as Element;
    expect(box(pic).toJSON()).toEqual(box(cover).toJSON());
    expect(getComputedStyle(pic).objectFit).toBe("cover");
  });

  it("lifts the cover under a mouse, not a finger, and rings the cover on focus", async () => {
    root.setAttribute("data-pointer", "fine");
    const a = grid(card()).querySelector(".cp-media") as HTMLElement;
    const cover = a.querySelector(".cp-cover") as HTMLElement;
    cover.style.transition = "none";
    expect(getComputedStyle(cover).boxShadow).toBe("none");
    await userEvent.hover(a);
    expect(getComputedStyle(cover).scale).toBe("1.03");
    expect(getComputedStyle(cover).boxShadow).not.toBe("none");
    root.setAttribute("data-pointer", "coarse");
    expect(getComputedStyle(cover).scale).toBe("none");
    a.focus({ focusVisible: true });
    expect(getComputedStyle(a).outlineStyle).toBe("none");
    const ring = getComputedStyle(cover);
    expect([ring.outlineStyle, ring.outlineOffset]).toEqual(["solid", "2px"]);
    expect(ring.outlineColor).toBe(paint("--cp-focus-ring"));
  });

  it.skipIf(!emulates)(
    "keeps a hovered cover's shadow and drops its lift under reduced motion",
    async () => {
      await media("prefers-reduced-motion", "reduce");
      root.setAttribute("data-pointer", "fine");
      const a = grid(card()).querySelector(".cp-media") as HTMLElement;
      const cover = a.querySelector(".cp-cover") as HTMLElement;
      cover.style.transition = "none";
      await userEvent.hover(a);
      expect(getComputedStyle(cover).scale).toBe("none");
      expect(getComputedStyle(cover).boxShadow).not.toBe("none");
    },
  );

  it.skipIf(!emulates)(
    "outlines a stand-in in forced colours, where its fill is gone",
    async () => {
      await media("forced-colors", "active");
      const cover = grid(card()).querySelector(".cp-cover") as Element;
      const cs = getComputedStyle(cover);
      expect([cs.borderStyle, cs.borderWidth]).toEqual(["solid", "1px"]);
      expect(cs.borderColor).toBe(paint("CanvasText"));
    },
  );
});

describe("css/system.css meter", () => {
  const box = (el: Element | null) => (el as Element).getBoundingClientRect();
  const token = (name: string) => {
    const probe = host("");
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  function meter(bars: string, attrs = "", dir = "ltr"): HTMLElement {
    theme("light");
    const el = build(
      `<div dir="${dir}" style="inline-size: 302px"><div class="cp-meter" ${attrs}><div data-part="bar">${bars}</div><small data-part="words">Store</small></div></div>`,
    );
    const m = el.querySelector(".cp-meter") as HTMLElement;
    enhanceMeter(m);
    return m;
  }
  // The element's paint from one screenshot, read back by CSS pixel.
  async function paint(el: Element): Promise<(x: number, y: number) => string> {
    const shot = await page.screenshot({ element: el, base64: true, save: false });
    const png = await (await fetch(`data:image/png;base64,${shot}`)).blob();
    const img = await createImageBitmap(png);
    const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(img, 0, 0);
    const scale = img.width / box(el).width;
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    return (x, y) => {
      const at = (Math.floor(y * scale) * img.width + Math.floor(x * scale)) * 4;
      return px.slice(at, at + 3).join(",");
    };
  }

  it("lays its meters out as one 8px bar, a 2px gap between them, each sized by its range", () => {
    const el = meter('<meter max="12" value="12"></meter><meter max="6" value="3"></meter>');
    const [a, b] = [...el.querySelectorAll("meter")].map(box) as [DOMRect, DOMRect];
    expect([a.width, b.width, a.height, b.height]).toEqual([200, 100, 8, 8]);
    expect(b.left - a.right).toBe(2);
    const cs = getComputedStyle(el.querySelector("meter") as Element);
    expect(cs.borderTopLeftRadius).toBe("2px");
    expect(cs.backgroundColor).toBe(token("--cp-fill"));
  });

  it("paints the fill over the bar's whole height up to the value, from the start side", async () => {
    theme("light");
    const el = build(
      ["ltr", "rtl"]
        .map(
          (dir) =>
            `<div dir="${dir}" class="cp-meter" style="inline-size: 300px"><div data-part="bar"><meter max="100" value="50"></meter></div></div>`,
        )
        .join(""),
    );
    const at = await paint(el);
    for (const [i, m] of [...el.querySelectorAll("meter")].entries()) {
      const top = box(m).top - box(el).top;
      const rows = (x: number) =>
        new Set(Array.from({ length: 8 }, (_, y) => at(x, top + y + 0.5)));
      const [near, far] = i === 0 ? [rows(50), rows(250)] : [rows(250), rows(50)];
      expect(near.size, String(i)).toBe(1);
      expect(far.size, String(i)).toBe(1);
      expect([...near][0], String(i)).not.toBe([...far][0]);
    }
  });

  it("fills in the accent, a series slot or tone, and the warning or danger past low or high", () => {
    const store = '<meter max="500" low="400" high="450" optimum="0" value="300"></meter>';
    const fill = (el: HTMLElement) => getComputedStyle(el.querySelector("meter") as Element).color;
    expect(fill(meter(store))).toBe(token("--cp-accent"));
    expect(fill(meter(store, 'data-series="2"'))).toBe(token("--cp-series-2"));
    expect(fill(meter('<meter max="9" value="1" data-series="5"></meter>'))).toBe(
      token("--cp-series-5"),
    );
    expect(fill(meter(store.replace("300", "420"), 'data-series="2"'))).toBe(
      token("--cp-warning-9"),
    );
    expect(fill(meter(store.replace("300", "470")))).toBe(token("--cp-danger-9"));
  });

  it("draws a level past its optimum's glyph before the words, and none at the optimum", () => {
    const store = '<meter max="500" low="400" high="450" optimum="0" value="300"></meter>';
    const glyph = (el: HTMLElement) =>
      decodeURIComponent(
        getComputedStyle(el.querySelector('[data-part="words"]') as Element, "::before").maskImage,
      );
    expect(glyph(meter(store))).toBe("none");
    expect(glyph(meter(store.replace("300", "420")))).toContain("M12 9v4");
    expect(glyph(meter(store.replace("300", "470")))).toContain("m15 9-6 6");
  });

  it("puts each mark's tick over the bar at its point and its words under it", () => {
    const el = meter(
      '<meter max="10" value="1"></meter><meter max="30" low="15" high="27" value="1"></meter>',
    );
    const bar = box(el.querySelector('[data-part="bar"]'));
    const marks = [...el.querySelectorAll('[data-part="marks"] > span')];
    // 300px of shares after the gap: 75px, the gap, then 225px.
    for (const [i, point] of [77 + 112.5, 77 + 202.5].entries()) {
      const at = box(marks[i] as Element);
      const tick = getComputedStyle(marks[i] as Element, "::before");
      const end = at.bottom - parseFloat(tick.bottom);
      expect(at.left + parseFloat(tick.left) + parseFloat(tick.width) / 2 - bar.left).toBeCloseTo(
        point,
        0,
      );
      expect(at.left - bar.left).toBeCloseTo(point, 0);
      expect(at.top).toBeGreaterThanOrEqual(bar.bottom);
      expect(end).toBeCloseTo(at.top, 1);
      expect(end - parseFloat(tick.height)).toBeLessThanOrEqual(bar.top + 0.01);
    }
    const words = document.createRange();
    words.selectNodeContents(marks[0] as Element);
    const text = words.getBoundingClientRect();
    expect(text.left + text.width / 2 - bar.left).toBeCloseTo(189.5, 0);
    expect(getComputedStyle(marks[0] as Element).fontSize).toBe("13px");
  });

  it("measures marks from the end in a right-to-left page", () => {
    const el = meter('<meter max="100" low="80" value="1"></meter>', "", "rtl");
    const bar = box(el.querySelector('[data-part="bar"]'));
    const mark = box(el.querySelector('[data-part="marks"] > span'));
    expect(bar.right - (mark.left + mark.width / 2)).toBeCloseTo(302 * 0.8, 0);
  });
});

describe("css/system.css ranked bars", () => {
  const box = (el: Element | null) => (el as Element).getBoundingClientRect();
  const slot = (n: number) => {
    const probe = host("");
    probe.style.color = `var(--cp-series-${String(n)})`;
    return getComputedStyle(probe).color;
  };
  function ranked(rows: string, attrs = "", dir = "ltr"): HTMLTableElement {
    theme("light");
    const el = build(
      `<div dir="${dir}" style="inline-size: 400px"><table class="cp-table" ${attrs}><thead><tr><th>Member</th><th data-bar>Sent</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
    const table = el.querySelector("table") as HTMLTableElement;
    enhanceRankedBars(table);
    return table;
  }
  const row = (value: number, attrs = "", cell = "") =>
    `<tr ${attrs}><th>a</th><td data-bar ${cell}><data value="${String(value)}">${String(value)}</data></td></tr>`;
  interface Part {
    readonly number: DOMRect;
    readonly bar: DOMRect;
    readonly fill: Element | null;
  }
  const parts = (table: HTMLTableElement): Part[] =>
    [...table.querySelectorAll("tbody tr")].map((r) => ({
      number: box(r.querySelector("data")),
      bar: box(r.querySelector('[data-part="bar"]')),
      fill: r.querySelector('[data-part="bar"] > span'),
    }));

  it("draws a 6rem bar after each number, the bars on one start, each filled to its share", () => {
    const table = ranked(row(1000) + row(250) + row(1));
    const [top, mid, low] = parts(table) as [Part, Part, Part];
    for (const p of [top, mid, low]) {
      expect([p.bar.width, p.bar.left]).toEqual([96, top.bar.left]);
      expect(p.bar.left - p.number.right).toBeCloseTo(8, 0);
      expect(box(p.fill).left).toBe(p.bar.left);
      expect(box(p.fill).height).toBe(8);
    }
    expect(mid.number.right).toBeCloseTo(top.number.right, 1);
    expect([box(top.fill).width, box(mid.fill).width, box(low.fill).width]).toEqual([96, 24, 2]);
    expect(getComputedStyle(top.fill as Element).borderTopLeftRadius).toBe("2px");
    const cell = table.querySelector("td") as Element;
    expect(getComputedStyle(cell).fontVariantNumeric).toBe("tabular-nums");
    expect(getComputedStyle(cell).whiteSpace).toBe("nowrap");
  });

  it("fills in slot 1, or the slot data-series names on the table, the row or the cell", () => {
    const fill = (table: HTMLTableElement) =>
      parts(table).map((p) => getComputedStyle(p.fill as Element).color);
    expect(fill(ranked(row(4)))).toEqual([slot(1)]);
    expect(fill(ranked(row(4), 'data-series="4"'))).toEqual([slot(4)]);
    expect(fill(ranked(row(4, 'data-series="2"') + row(2, "", 'data-series="3"')))).toEqual([
      slot(2),
      slot(3),
    ]);
  });

  it("puts the bar before the number and fills it from the right in a right-to-left page", () => {
    const [p] = parts(ranked(row(10) + row(40), "", "rtl")) as [Part];
    expect(p.number.left - p.bar.right).toBeCloseTo(8, 0);
    expect(box(p.fill).right).toBe(p.bar.right);
    expect(box(p.fill).width).toBe(24);
  });
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

  it("gives the small buttons inside fields a finger's target", () => {
    theme("light");
    root.dataset["pointer"] = "coarse";
    const el = build(
      '<div style="padding: 40px; inline-size: 20rem"><div class="cp-search"><input class="cp-input" type="search" placeholder="Search" value="x"><button class="cp-button" aria-label="Clear"></button></div></div>' +
        '<div style="padding: 40px; inline-size: 20rem"><div class="cp-input-wrap"><input class="cp-input" type="password"><button class="cp-button" aria-label="Show"></button></div></div>' +
        '<div style="padding: 40px"><div class="cp-stepper"><button class="cp-button" aria-label="Fewer">-</button><input type="number" value="3"><button class="cp-button" aria-label="More">+</button></div></div>',
    );
    for (const b of el.querySelectorAll("button")) {
      b.style.transition = "none";
      const box = b.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      const reach = (44 - box.height) / 2 - 0.5;
      expect(
        document.elementFromPoint(mid, box.top - reach),
        b.getAttribute("aria-label") ?? "",
      ).toBe(b);
    }
  });

  it("keeps its forced-colour rules for a range's track and thumb in every engine", () => {
    // A selector list naming another engine's pseudo-element drops the whole
    // rule, so each engine must keep at least its own thumb rule.
    const forced = [...sheet.sheet!.cssRules].filter(
      (r): r is CSSMediaRule =>
        r instanceof CSSMediaRule && r.conditionText.includes("forced-colors"),
    );
    const selectors = forced.flatMap((m) =>
      [...m.cssRules].map((r) => (r instanceof CSSStyleRule ? r.selectorText : "")),
    );
    expect(selectors.some((t) => /\.cp-range::-(webkit-slider|moz-range)-thumb$/.test(t))).toBe(
      true,
    );
  });

  it("puts a range's tip over its thumb, in a right-to-left page too", () => {
    theme("light");
    for (const dir of ["ltr", "rtl"]) {
      const el = build(
        `<div class="cp-range-row" dir="${dir}" style="inline-size: 300px; margin-block-start: 3rem"><input class="cp-range" type="range" min="0" max="50" value="0" aria-label="Seeders"><output></output></div>`,
      );
      const range = el.querySelector("input") as HTMLInputElement;
      const life = new AbortController();
      enhanceRange(range, { signal: life.signal });
      const tip = el.querySelector(".cp-range-tip") as HTMLElement;
      tip.style.transition = "none";
      const box = range.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const start = dir === "rtl" ? box.right - 9 : box.left + 9;
      expect(Math.abs(t.left + t.width / 2 - start), dir).toBeLessThan(3);
      life.abort();
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
      (el.querySelector("#host") as HTMLElement).focus({ focusVisible: true });
      expect(getComputedStyle(el.querySelector(".cp-affix") as Element).outlineStyle).toBe("solid");
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
    expect(getComputedStyle(clear).visibility).toBe("hidden");
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

  it("draws the header status's glyph by its state, a dot when all is good, and drops the detail on a phone", async () => {
    theme("light");
    const el = build(
      '<header class="cp-header">' +
        ["problem", "offline", "warning", "working", "ok"]
          .map(
            (st) =>
              `<button class="cp-header-status" type="button" data-state="${st}"><span>${st}</span><span data-part="detail">Full check 3/8</span></button>`,
          )
          .join("") +
        "</header>",
    );
    const glyph = (st: string) =>
      decodeURIComponent(
        getComputedStyle(el.querySelector(`[data-state="${st}"]`) as Element, "::before").maskImage,
      );
    expect(glyph("problem")).toContain("m15 9-6 6");
    expect(glyph("warning")).toContain("m21.73 18");
    expect(glyph("ok")).toBe("none");
    const detail = el.querySelector('[data-part="detail"]') as Element;
    expect(getComputedStyle(detail).display).not.toBe("none");
    await page.viewport(390, 800);
    expect(getComputedStyle(detail).display).toBe("none");
  });

  it("draws a destination's badge in the bar's ink, and on its icon's corner in the accent on a phone", async () => {
    theme("light");
    const el = build(
      '<div class="cp-app"><header class="cp-header"><nav class="cp-nav"><a class="cp-nav-item" href="#a"><span class="cp-icon"></span><span class="cp-nav-label">Releases</span><span class="cp-badge">12</span></a></nav><span class="cp-badge" data-variant="quiet">3</span></header></div>',
    );
    const header = getComputedStyle(el.querySelector(".cp-header") as Element);
    const [badge, quiet] = [...el.querySelectorAll(".cp-badge")] as [HTMLElement, HTMLElement];
    expect(getComputedStyle(badge).backgroundColor).toBe(header.color);
    expect(getComputedStyle(badge).color).toBe(header.backgroundColor);
    expect(getComputedStyle(badge).fontSize).toBe("13px");
    expect(getComputedStyle(quiet).backgroundColor).not.toBe(header.color);
    await page.viewport(390, 800);
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    expect(getComputedStyle(badge).backgroundColor).toBe(getComputedStyle(accent).color);
    expect(getComputedStyle(badge).position).toBe("absolute");
    const item = (el.querySelector(".cp-nav-item") as Element).getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    expect(box.left).toBeGreaterThan(item.left + item.width / 2);
    expect(box.top).toBeLessThan(item.top + 8);
  });

  it("rings the account button's avatar in the bar's ink, wider while its menu is open", () => {
    theme("light");
    const el = build(
      '<header class="cp-header"><button class="cp-button cp-account" data-variant="quiet" type="button" aria-label="Account" aria-expanded="false"><span class="cp-avatar" data-size="sm">CP</span></button></header>',
    );
    const button = el.querySelector("button") as HTMLElement;
    const avatar = el.querySelector(".cp-avatar") as HTMLElement;
    avatar.style.transition = "none";
    expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(avatar.getBoundingClientRect().width).toBe(28);
    expect(getComputedStyle(avatar).boxShadow).toMatch(/ 0px 0px 0px 2px$/);
    button.setAttribute("aria-expanded", "true");
    expect(getComputedStyle(avatar).boxShadow).toMatch(/ 0px 0px 0px 3px$/);
  });

  it("colours an avatar by its harmony colour, the first by default", () => {
    theme("light");
    const el = build(
      '<span class="cp-avatar">AB</span><span class="cp-avatar" data-harmony="3">CD</span>',
    );
    const [first, third] = [...el.querySelectorAll(".cp-avatar")] as [Element, Element];
    const harmony = (n: number) => {
      const probe = host("");
      probe.style.color = `var(--cp-harmony-${String(n)})`;
      return getComputedStyle(probe).color;
    };
    expect(getComputedStyle(first).backgroundColor).toBe(harmony(1));
    expect(getComputedStyle(third).backgroundColor).toBe(harmony(3));
    const cs = getComputedStyle(third);
    expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("lays the status panel's sections edge to edge over the panel's own padding", () => {
    theme("light");
    const el = build(
      '<div class="cp-popover cp-status-panel" data-variant="panel" popover><h2>All good</h2><section><strong>Sources</strong><span>Sonarr answered.</span></section></div>',
    );
    const panel = el.querySelector(".cp-popover") as HTMLElement;
    panel.style.transition = "none";
    panel.showPopover();
    const box = panel.getBoundingClientRect();
    const section = (panel.querySelector("section") as Element).getBoundingClientRect();
    expect(box.width).toBe(320);
    expect(Math.round(section.left - box.left)).toBe(1);
    expect(getComputedStyle(panel.querySelector("section") as Element).paddingInlineStart).toBe(
      "16px",
    );
    panel.hidePopover();
  });

  it("runs a listbox's covered options edge to edge, a title over its facts, 2px apart", () => {
    theme("light");
    const option = (title: string) =>
      `<li role="option"><span class="cp-cover" data-harmony="2"><span class="cp-icon"></span></span><strong>${title}</strong><small>2023 · TV</small></li>`;
    const el = build(
      `<div class="cp-popover cp-listbox" popover><ul role="listbox" aria-label="Entries">${option("Hidden")}${option("Frieren")}${option("Mushishi")}</ul><p class="cp-listbox-empty" hidden></p></div>`,
    );
    const popup = el.querySelector(".cp-listbox") as HTMLElement;
    popup.style.transition = "none";
    popup.showPopover();
    const [hidden, first, second] = [...el.querySelectorAll("li")] as [
      HTMLLIElement,
      HTMLLIElement,
      HTMLLIElement,
    ];
    hidden.hidden = true;
    const box = popup.getBoundingClientRect();
    const cover = (first.querySelector(".cp-cover") as Element).getBoundingClientRect();
    expect(Math.round(cover.left - box.left)).toBe(1);
    expect([cover.width, cover.height]).toEqual([32, 48]);
    expect(first.getBoundingClientRect().top - box.top).toBe(1);
    expect(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom).toBe(2);
    const title = (first.querySelector("strong") as Element).getBoundingClientRect();
    const facts = (first.querySelector("small") as Element).getBoundingClientRect();
    expect(facts.top).toBeGreaterThanOrEqual(title.bottom);
    expect(facts.left).toBe(title.left);
    popup.hidePopover();
  });

  it("colours a cover by its harmony colour and fills it with its art", () => {
    theme("light");
    const el = build(
      '<span class="cp-cover"></span><span class="cp-cover" data-harmony="4"><img alt="" width="10" height="10"></span>',
    );
    const [first, fourth] = [...el.querySelectorAll(".cp-cover")] as [HTMLElement, HTMLElement];
    first.style.inlineSize = "4rem";
    fourth.style.inlineSize = "4rem";
    const harmony = (n: number) => {
      const probe = host("");
      probe.style.color = `var(--cp-harmony-${String(n)})`;
      return getComputedStyle(probe).color;
    };
    expect(getComputedStyle(first).backgroundColor).toBe(harmony(1));
    expect(getComputedStyle(fourth).backgroundColor).toBe(harmony(4));
    expect(first.getBoundingClientRect().height).toBe(96);
    const art = (fourth.querySelector("img") as Element).getBoundingClientRect();
    expect([art.width, art.height]).toEqual([64, 96]);
  });

  it("lets a search field grow in an input row beside its button", () => {
    theme("light");
    const el = build(
      '<div class="cp-input-row"><div class="cp-search"><input class="cp-input" placeholder="Title" aria-label="Title"></div><button class="cp-button" type="button">Search</button></div>',
    );
    el.style.inlineSize = "40rem";
    const row = (el.querySelector(".cp-input-row") as Element).getBoundingClientRect();
    const button = (el.querySelector("button") as Element).getBoundingClientRect();
    const search = (el.querySelector(".cp-search") as Element).getBoundingClientRect();
    expect(Math.round(button.right)).toBe(Math.round(row.right));
    expect(Math.round(search.right + 8)).toBe(Math.round(button.left));
  });

  it("moves the header's destinations to a bar at the window's foot on a phone, and leaves room for it", async () => {
    theme("light");
    const el = build(
      '<div class="cp-app"><header class="cp-header"><nav class="cp-nav"><a class="cp-nav-item" href="#a" aria-current="page"><span class="cp-nav-label">Overview</span></a><a class="cp-nav-item" href="#b"><span class="cp-nav-label">Library</span></a></nav></header><main class="cp-main">Main</main></div>',
    );
    const nav = el.querySelector(".cp-nav") as HTMLElement;
    expect(getComputedStyle(nav).position).toBe("static");
    await page.viewport(390, 800);
    expect(getComputedStyle(nav).position).toBe("fixed");
    expect(Math.round(nav.getBoundingClientRect().bottom)).toBe(800);
    const label = el.querySelector(".cp-nav-label") as Element;
    expect(label.getBoundingClientRect().width).toBeGreaterThan(20);
    expect(
      Number.parseFloat(getComputedStyle(el.querySelector(".cp-app") as Element).paddingBlockEnd),
    ).toBeGreaterThanOrEqual(56);
  });

  it("keeps main's content to a measure on a wide window, centred, unless the screen asks for the window", async () => {
    theme("light");
    await page.viewport(1920, 900);
    const el = build(
      '<div class="cp-app"><main class="cp-main"><div id="a">Text</div></main></div><div class="cp-app"><main class="cp-main" data-width="full"><div id="b">Text</div></main></div>',
    );
    const width = (id: string) =>
      (el.querySelector(`#${id}`) as Element).getBoundingClientRect().width;
    expect(width("a")).toBe(1440);
    expect(width("b")).toBeGreaterThan(1800);
  });

  it("turns a theme toggle's drawing over on a change and keeps the ink it sits on", () => {
    theme("light");
    const el = build(
      '<header class="cp-header"><button class="cp-button cp-toggle" data-variant="quiet" data-kind="theme" type="button" aria-pressed="true" data-cp-toggled="on"><span class="cp-icon"></span><span class="cp-icon" data-part="on"></span></button></header>',
    );
    const b = el.querySelector("button") as HTMLElement;
    expect(getComputedStyle(b.querySelector('[data-part="on"]') as Element).animationName).toBe(
      "cp-theme-turn",
    );
    expect(getComputedStyle(b).color).toBe(
      getComputedStyle(el.querySelector("header") as Element).color,
    );
  });

  it("shows the skip link only while it has focus", () => {
    theme("light");
    const el = build('<a class="cp-skip" href="#main">Skip to the content</a>');
    const skip = el.querySelector("a") as HTMLAnchorElement;
    skip.style.transition = "none";
    expect(getComputedStyle(skip).opacity).toBe("0");
    skip.focus({ focusVisible: true });
    expect(getComputedStyle(skip).opacity).toBe("1");
  });

  it("draws a key as a cap in the body font, a combination as its keys' caps, and a menu item's key as words", () => {
    theme("light");
    const el = build(
      '<p><kbd>?</kbd> <kbd><kbd>Ctrl</kbd> <kbd>K</kbd></kbd></p><div class="cp-menu"><button role="menuitem" type="button">Search<kbd>S</kbd></button>' +
        '<button role="menuitem" type="button">Jump<kbd><kbd>Ctrl</kbd> <kbd>K</kbd></kbd></button></div>',
    );
    const [key, combo, ctrl] = [...el.querySelectorAll("p kbd")].map((k) => getComputedStyle(k));
    const body = getComputedStyle(el).fontFamily;
    for (const cap of [key, ctrl]) {
      expect(cap?.fontFamily).toBe(body);
      expect(cap?.fontSize).toBe("13px");
      expect(cap?.borderBlockEndWidth).toBe("2px");
      expect(cap?.borderInlineStartStyle).toBe("solid");
    }
    expect(combo?.borderInlineStartStyle).toBe("none");
    expect(combo?.paddingInlineStart).toBe("0px");
    for (const k of el.querySelectorAll(".cp-menu kbd")) {
      expect(getComputedStyle(k).borderInlineStartStyle).toBe("none");
      expect(getComputedStyle(k).paddingInlineStart).toBe("0px");
    }
    expect(el.querySelectorAll(".cp-menu kbd").length).toBe(4);
  });

  it("ends a palette's action with its keys as muted words, and fills the active action", () => {
    theme("light");
    const el = build(
      '<div class="cp-palette"><ul role="listbox"><li role="option" aria-selected="true"><span>Go to the library</span><kbd>G L</kbd></li><li role="option" aria-selected="false"><span>Open settings</span><kbd>,</kbd></li>' +
        '<li role="option" aria-selected="false"><span>Search</span><kbd><kbd>Ctrl</kbd> <kbd>F</kbd></kbd></li></ul></div>',
    );
    const [on, off, combo] = [...el.querySelectorAll("li")];
    expect((combo as Element).querySelectorAll("kbd kbd").length).toBe(2);
    for (const k of (combo as Element).querySelectorAll("kbd kbd")) {
      expect(getComputedStyle(k).borderInlineStartStyle).toBe("none");
      expect(getComputedStyle(k).paddingInlineStart).toBe("0px");
    }
    const keys = getComputedStyle((off as Element).querySelector("kbd") as Element);
    expect(keys.borderInlineStartStyle).toBe("none");
    expect(keys.paddingInlineStart).toBe("0px");
    expect(keys.fontSize).toBe("13px");
    const kbdBox = ((off as Element).querySelector("kbd") as Element).getBoundingClientRect();
    expect(Math.round(kbdBox.right)).toBe(
      Math.round((off as Element).getBoundingClientRect().right) - 12,
    );
    expect(getComputedStyle(on as Element).backgroundColor).not.toBe(
      getComputedStyle(off as Element).backgroundColor,
    );
  });

  it("sets shortcut groups side by side, each key across from what it does, and the foot under them all", () => {
    theme("light");
    const el = build(
      '<div class="cp-keys" style="inline-size: 30rem"><section><h3>Anywhere</h3><dl><dt>Search</dt><dd><kbd>/</kbd></dd></dl></section><section><h3>Library</h3><dl><dt>Next row</dt><dd><kbd>J</kbd></dd></dl></section><p>Version 3.0.0</p></div>',
    );
    const [a, b] = [...el.querySelectorAll("section")].map((s) => s.getBoundingClientRect());
    expect((b as DOMRect).top).toBe((a as DOMRect).top);
    expect((b as DOMRect).left).toBeGreaterThan((a as DOMRect).right);
    const dt = (el.querySelector("dt") as Element).getBoundingClientRect();
    const dd = (el.querySelector("dd") as Element).getBoundingClientRect();
    expect(Math.abs(dd.top - dt.top)).toBeLessThan(4);
    expect(dd.left).toBeGreaterThan(dt.left);
    const foot = el.querySelector("p") as Element;
    const box = foot.getBoundingClientRect();
    expect(box.top).toBeGreaterThan((a as DOMRect).bottom);
    expect(Math.round(box.width)).toBe(480);
    expect(
      contrast(getComputedStyle(foot).color, getComputedStyle(root).backgroundColor),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("shares a short row between a fitted grid's items, and stacks them when the box is narrow", () => {
    theme("light");
    const el = build(
      '<div class="cp-grid" data-variant="fit" style="inline-size: 64rem"><div>A</div><div>B</div></div><div class="cp-grid" data-variant="fit" style="inline-size: 20rem"><div>A</div><div>B</div></div>',
    );
    const [wide, narrow] = [...el.querySelectorAll(".cp-grid")];
    const [a, b] = [...(wide as Element).children].map((c) => c.getBoundingClientRect());
    expect(Math.abs((a as DOMRect).width - (b as DOMRect).width)).toBeLessThan(1);
    expect((a as DOMRect).width).toBeGreaterThan(400);
    const [c, d] = [...(narrow as Element).children].map((x) => x.getBoundingClientRect());
    expect((d as DOMRect).top).toBeGreaterThan((c as DOMRect).top);
  });

  it("puts a banner's action at its end and keeps its words readable", () => {
    theme("light");
    const el = build(
      '<div class="cp-banner" data-tone="warning" style="inline-size: 40rem"><span>A new version is out.</span><button class="cp-button" type="button">Reload</button></div>',
    );
    const banner = (el.querySelector(".cp-banner") as Element).getBoundingClientRect();
    const button = (el.querySelector("button") as Element).getBoundingClientRect();
    expect(Math.round(banner.right - button.right)).toBe(16);
    const cs = getComputedStyle(el.querySelector(".cp-banner") as Element);
    expect(contrast(cs.color, cs.backgroundColor)).toBeGreaterThanOrEqual(4.5);
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

  it("sets a heading row's line of facts 4px under its title", () => {
    theme("light");
    const el = build(
      '<div class="cp-heading-row"><div><h1>Frieren</h1><p class="cp-meta">28 episodes</p></div></div>',
    );
    const title = (el.querySelector("h1") as HTMLElement).getBoundingClientRect();
    const line = (el.querySelector("p") as HTMLElement).getBoundingClientRect();
    expect(line.top - title.bottom).toBeCloseTo(4, 0);
  });

  it("underlines the current link tab over the strip's line, and keeps its focus ring inside the scroll box", () => {
    theme("light");
    const el = build(
      '<div style="display: flow-root; inline-size: 200px"><nav class="cp-link-tabs" aria-label="Item"><a href="#a" aria-current="page">Episodes</a><a href="#b">Subtitles</a><a href="#c">Timing</a></nav><p>Next</p></div>',
    );
    const nav = el.querySelector("nav") as HTMLElement;
    const [current, other] = [...nav.querySelectorAll<HTMLElement>("a")] as [
      HTMLElement,
      HTMLElement,
    ];
    const mark = getComputedStyle(current, "::after");
    const accent = build('<span style="color: var(--cp-accent)"></span>')
      .firstElementChild as HTMLElement;
    expect(mark.backgroundColor).toBe(getComputedStyle(accent).color);
    expect(getComputedStyle(other, "::after").content).toBe("none");
    expect(getComputedStyle(nav).overflowX).toBe("auto");
    expect(nav.scrollWidth).toBeGreaterThan(nav.clientWidth);
    const box = nav.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    const frame = (nav.parentElement as HTMLElement).getBoundingClientRect();
    const next = (el.querySelector("p") as HTMLElement).getBoundingClientRect();
    expect(mark.blockSize).toBe("2px");
    expect(mark.insetBlockEnd).toBe("-1px");
    // Room for a 2px ring at a 2px offset on every side.
    expect([tab.top - box.top, tab.left - box.left, box.bottom - tab.bottom]).toEqual([
      expect.closeTo(4, 0),
      expect.closeTo(4, 0),
      expect.closeTo(4, 0),
    ]);
    // The margins take that room back: the tabs sit where an unpadded strip
    // with a 1px line under it would put them.
    expect([tab.top, tab.left]).toEqual([
      expect.closeTo(frame.top, 0),
      expect.closeTo(frame.left, 0),
    ]);
    expect(next.top - tab.bottom).toBeCloseTo(1, 0);
    expect(getComputedStyle(current).color).not.toBe(getComputedStyle(other).color);
  });

  it("fills a selected tab itself until the pill is there, then paints the pill only", () => {
    theme("light");
    const strip = (pill: boolean) =>
      `<div class="cp-tabs" role="tablist" aria-label="Item">${pill ? '<span class="cp-pill" aria-hidden="true"></span>' : ""}` +
      '<button class="cp-tab" role="tab" type="button" aria-selected="true">Episodes</button>' +
      '<button class="cp-tab" role="tab" type="button" aria-selected="false">History</button></div>';
    const el = build(strip(false) + strip(true));
    const [bare, slid] = [...el.querySelectorAll<HTMLElement>(".cp-tabs")] as [
      HTMLElement,
      HTMLElement,
    ];
    const fill = (list: HTMLElement) =>
      getComputedStyle(list.querySelector('[aria-selected="true"]') as HTMLElement).backgroundColor;
    const pill = slid.querySelector(".cp-pill") as HTMLElement;
    expect(fill(bare)).not.toBe("rgba(0, 0, 0, 0)");
    expect(fill(slid)).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(pill).backgroundColor).toBe(fill(bare));
    expect(getComputedStyle(pill).position).toBe("absolute");
    expect(getComputedStyle(slid).position).toBe("relative");
    expect(getComputedStyle(slid.querySelector(".cp-tab") as HTMLElement).zIndex).toBe("1");
  });

  it.skipIf(!emulates)(
    "keeps the link tabs' line and the current mark in forced colours",
    async () => {
      theme("light");
      await media("forced-colors", "active");
      const el = build(
        '<nav class="cp-link-tabs" aria-label="Item"><a href="#a" aria-current="page">Episodes</a><a href="#b">Subtitles</a></nav>',
      );
      const nav = el.querySelector("nav") as HTMLElement;
      const mark = getComputedStyle(nav.querySelector("a") as HTMLElement, "::after");
      const system = build('<span style="color: CanvasText"></span>')
        .firstElementChild as HTMLElement;
      const ink = getComputedStyle(system).color;
      expect(getComputedStyle(nav).backgroundImage).toContain(ink);
      expect(mark.backgroundColor).toBe(ink);
      expect(getComputedStyle(nav.querySelector("a") as HTMLElement).forcedColorAdjust).toBe(
        "auto",
      );
    },
  );

  it("divides an accordion's sections, turns an open one's chevron, and pads its content", () => {
    theme("light");
    const el = build(
      '<div class="cp-accordion" style="inline-size: 24rem">' +
        '<details open><summary>Season 1<span class="cp-icon" data-cp-icon="chevron-down"></span></summary><div>28 episodes</div></details>' +
        '<details open data-cp-closing><summary>Season 2<span class="cp-icon" data-cp-icon="chevron-down"></span></summary><div>12 episodes</div></details>' +
        '<details><summary>Specials<span class="cp-icon" data-cp-icon="chevron-down"></span></summary><div>2 specials</div></details></div>',
    );
    const box = el.querySelector(".cp-accordion") as HTMLElement;
    const [open, closing, shut] = [...box.querySelectorAll("details")] as [
      HTMLDetailsElement,
      HTMLDetailsElement,
      HTMLDetailsElement,
    ];
    const chevron = (d: Element) => d.querySelector("summary > .cp-icon") as HTMLElement;
    const summary = open.querySelector("summary") as HTMLElement;
    const body = open.querySelector("div") as HTMLElement;
    const raised = build('<span style="color: var(--cp-surface-raised)"></span>')
      .firstElementChild as HTMLElement;
    expect(getComputedStyle(box).backgroundColor).toBe(getComputedStyle(raised).color);
    expect(getComputedStyle(box).borderTopWidth).toBe("1px");
    expect(getComputedStyle(open).borderTopWidth).toBe("0px");
    expect([closing, shut].map((d) => getComputedStyle(d).borderTopWidth)).toEqual(["1px", "1px"]);
    expect(summary.getBoundingClientRect().height).toBeCloseTo(32, 0);
    expect(getComputedStyle(summary).paddingLeft).toBe("16px");
    expect(getComputedStyle(chevron(open)).rotate).toBe("180deg");
    expect([closing, shut].map((d) => getComputedStyle(chevron(d)).rotate)).toEqual([
      "none",
      "none",
    ]);
    expect(chevron(open).getBoundingClientRect().right).toBeCloseTo(
      summary.getBoundingClientRect().right - 16,
      0,
    );
    const muted = build('<span style="color: var(--cp-ink-muted)"></span>')
      .firstElementChild as HTMLElement;
    expect(getComputedStyle(body).color).toBe(getComputedStyle(muted).color);
    expect(getComputedStyle(body).padding).toBe("0px 16px 16px");
  });

  it("draws an accordion summary's focus ring inside it", async () => {
    theme("light");
    const el = build(
      '<button type="button">Before</button><div class="cp-accordion"><details><summary>Season 1<span class="cp-icon" data-cp-icon="chevron-down"></span></summary><div>28 episodes</div></details></div>',
    );
    (el.querySelector("button") as HTMLElement).focus();
    await userEvent.tab();
    const summary = el.querySelector("summary") as HTMLElement;
    expect(document.activeElement).toBe(summary);
    expect(getComputedStyle(summary).outlineOffset).toBe("-2px");
  });

  it("puts a section's menu button beside its summary, before the chevron, and wraps a long title short of it", () => {
    theme("light");
    const el = build(
      '<div class="cp-accordion" style="inline-size: 16rem"><div class="cp-accordion-section">' +
        '<details><summary>Season 1 with a title too long for one line<span class="cp-icon" data-cp-icon="chevron-down"></span></summary><div>28 episodes</div></details>' +
        '<button class="cp-button" data-variant="quiet" data-size="sm" type="button" aria-label="Season 1 actions"><span class="cp-icon" data-cp-icon="ellipsis"></span></button></div></div>',
    );
    const summary = el.querySelector("summary") as HTMLElement;
    const button = el.querySelector(".cp-button") as HTMLElement;
    const chevron = summary.querySelector(".cp-icon") as HTMLElement;
    const s = summary.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const words = document.createRange();
    words.selectNodeContents(summary.firstChild as Text);
    const lines = [...words.getClientRects()];
    expect(b.top - s.top).toBeCloseTo(3, 0);
    expect(s.right - b.right).toBeCloseTo(40, 0);
    const c = chevron.getBoundingClientRect();
    expect(b.right).toBeLessThan(c.left);
    expect(c.top + c.height / 2).toBeCloseTo(b.top + b.height / 2, 0);
    expect((lines[0] as DOMRect).top - s.top).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map((r) => r.right))).toBeLessThanOrEqual(b.left);
    expect(summary.contains(button)).toBe(false);
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

  it("ends a filter with its quiet count, solid in the accent while on, and fades the wash over 240ms", () => {
    theme("light");
    const el = build(
      '<div class="cp-filter-group" style="inline-size:14rem">' +
        '<button class="cp-filter" type="button" aria-pressed="true">On the best<span class="cp-badge" data-variant="quiet">268</span></button>' +
        '<button class="cp-filter" type="button" aria-pressed="false">Missing<span class="cp-badge" data-variant="quiet">9</span></button></div>',
    );
    const [on, off] = [...el.querySelectorAll<HTMLElement>(".cp-filter")] as [
      HTMLElement,
      HTMLElement,
    ];
    const badge = (f: HTMLElement) => f.querySelector(".cp-badge") as HTMLElement;
    for (const f of [on, off]) {
      f.style.transition = "none";
      badge(f).style.transition = "none";
    }
    const probe = host("");
    probe.style.color = "var(--cp-accent)";
    probe.style.backgroundColor = "var(--cp-fill)";
    expect(getComputedStyle(badge(on)).backgroundColor).toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(badge(off)).backgroundColor).toBe(
      getComputedStyle(probe).backgroundColor,
    );
    expect(Math.round(badge(off).getBoundingClientRect().right)).toBe(
      Math.round(
        off.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(off).paddingRight),
      ),
    );
    off.style.removeProperty("transition");
    expect(getComputedStyle(off).transitionDuration).toBe("0.24s");
  });

  it("marks a late part of the status line in the warning ink with a clock, and spaces its wrapped lines", () => {
    theme("light");
    const el = build(
      '<footer class="cp-status" style="inline-size:12rem"><span>412 entries</span><span data-state="late">Late: the 14:00 check has not run</span></footer>',
    );
    const late = el.querySelector('[data-state="late"]') as HTMLElement;
    const probe = host("");
    probe.style.color = "var(--cp-warning-11)";
    expect(getComputedStyle(late).color).toBe(getComputedStyle(probe).color);
    expect(decodeURIComponent(getComputedStyle(late, "::before").maskImage)).toContain(
      "M12 6v6l4 2",
    );
    const plain = late.previousElementSibling as Element;
    expect(getComputedStyle(plain, "::before").content).toBe("none");
    const status = el.querySelector(".cp-status") as HTMLElement;
    const [first, second] = [...status.children].map((n) => n.getBoundingClientRect()) as [
      DOMRect,
      DOMRect,
    ];
    expect(second.top - first.bottom).toBeGreaterThanOrEqual(4);
    expect(first.top - status.getBoundingClientRect().top).toBeGreaterThanOrEqual(4);
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

  it("keeps a split and a group as wide as their parts inside a form's grid", () => {
    theme("light");
    const el = build(
      '<form class="cp-form" style="inline-size: 30rem"><div class="cp-split" role="group"><button class="cp-button" data-variant="primary" type="button">Grab</button><button class="cp-button" data-variant="primary" type="button" aria-label="More"><span class="cp-icon"></span></button></div><div class="cp-group" role="group"><button class="cp-button" type="button">A</button><button class="cp-button" type="button">B</button></div></form>',
    );
    for (const joined of el.querySelectorAll(".cp-split, .cp-group")) {
      const parts = [...joined.children].reduce(
        (sum, b) => sum + b.getBoundingClientRect().width,
        0,
      );
      expect(joined.getBoundingClientRect().width).toBeCloseTo(parts, 0);
    }
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
    // The tick is the check icon at an icon's size, 18px.
    expect(getComputedStyle(radio as Element, "::after").width).toBe("18px");
  });

  const pressedCheckItem = (): Element =>
    build(
      '<div class="cp-menu" role="menu"><button role="menuitemcheckbox" aria-checked="true" type="button" data-cp-pressed="">Posters</button></div>',
    ).querySelector("button") as Element;

  it("shrinks a pressed menu item's box as a checkbox's", () => {
    theme("light");
    const box = getComputedStyle(pressedCheckItem(), "::before");
    // Firefox keeps the scale as a float32.
    expect(Number(box.scale)).toBeCloseTo(0.88, 6);
    expect(box.rotate).toBe("90deg");
  });

  it.skipIf(!emulates)(
    "neither turns nor shrinks a menu item's box under reduced motion",
    async () => {
      theme("light");
      const item = pressedCheckItem();
      await media("prefers-reduced-motion", "reduce");
      for (const a of document.getAnimations()) {
        a.finish();
      }
      expect(getComputedStyle(item, "::before").scale).toBe("none");
      expect(getComputedStyle(item, "::before").rotate).toBe("none");
    },
  );

  it("stops a context menu zone selecting text under a finger, not under a mouse", () => {
    theme("light");
    const zone = host("", { "data-cp-context": "" });
    zone.textContent = "Frieren";
    root.dataset["pointer"] = "fine";
    expect(getComputedStyle(zone).userSelect).not.toBe("none");
    root.dataset["pointer"] = "coarse";
    expect(getComputedStyle(zone).userSelect).toBe("none");
  });

  it("checks a select panel option with a menu check item's box", () => {
    theme("light");
    const el = build(
      '<div class="cp-select-panel"><ul role="listbox"><li role="option" aria-selected="false">Watch next</li>' +
        '<li role="option" aria-selected="true">Rewatch</li></ul></div>',
    );
    const [off, on] = [...el.querySelectorAll<HTMLElement>("li")] as [HTMLElement, HTMLElement];
    expect(getComputedStyle(off, "::before").borderRadius).toBe("30%");
    expect(getComputedStyle(off, "::after").clipPath).toBe("inset(0px 100% 0px 0px)");
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    expect(getComputedStyle(on, "::before").borderRadius).toBe("50%");
    expect(getComputedStyle(on, "::before").backgroundColor).toBe(getComputedStyle(accent).color);
  });

  it("shrinks a select panel option's box while data-cp-pressed marks it", () => {
    theme("light");
    const [rest, pressed] = [
      ...build(
        '<div class="cp-select-panel"><ul role="listbox"><li role="option" aria-selected="false">Watch next</li>' +
          '<li role="option" aria-selected="false" data-cp-pressed="">Rewatch</li></ul></div>',
      ).querySelectorAll<HTMLElement>("li"),
    ] as [HTMLElement, HTMLElement];
    expect(getComputedStyle(rest, "::before").scale).toBe("none");
    // Firefox keeps the scale as a float32.
    expect(Number(getComputedStyle(pressed, "::before").scale)).toBeCloseTo(0.88, 6);
  });

  it.skipIf(!emulates)(
    "holds a pressed select panel option's box still under reduced motion",
    async () => {
      theme("light");
      const option = build(
        '<div class="cp-select-panel"><ul role="listbox"><li role="option" aria-selected="false" data-cp-pressed="">Rewatch</li></ul></div>',
      ).querySelector("li") as HTMLElement;
      await media("prefers-reduced-motion", "reduce");
      for (const a of document.getAnimations()) {
        a.finish();
      }
      expect(getComputedStyle(option, "::before").scale).toBe("none");
    },
  );

  it("lays out a small confirmation and a select panel only while open", () => {
    theme("light");
    const el = build(
      '<div class="cp-popover" data-variant="confirm" popover><form><p>Remove it?</p></form></div>' +
        '<div class="cp-popover cp-select-panel" popover><form><input></form></div>',
    );
    for (const pop of el.querySelectorAll<HTMLElement>("[popover]")) {
      pop.style.transition = "none";
      expect(getComputedStyle(pop).display).toBe("none");
      pop.showPopover();
      expect(getComputedStyle(pop).display).toBe("grid");
      // The form only groups, so the popover's grid lays out its parts.
      expect(getComputedStyle(pop.querySelector("form") as Element).display).toBe("contents");
      pop.hidePopover();
    }
  });

  it("shows a trigger's filled drawing in the accent while it is on, beside its solid count", () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button"><span class="cp-icon"></span><span class="cp-icon" data-part="on"></span>Filters<span class="cp-badge">2</span></button>',
    );
    const b = el.querySelector("button") as HTMLElement;
    const [off, on] = [...b.querySelectorAll<HTMLElement>(".cp-icon")] as [
      HTMLElement,
      HTMLElement,
    ];
    const shown = () => [off, on].map((i) => getComputedStyle(i).display !== "none");
    expect(shown()).toEqual([true, false]);
    b.setAttribute("data-active", "");
    expect(shown()).toEqual([false, true]);
    const accent = host("");
    accent.style.color = "var(--cp-accent)";
    const ink = host("");
    ink.style.color = "var(--cp-on-accent)";
    expect(getComputedStyle(on).color).toBe(getComputedStyle(accent).color);
    const badge = getComputedStyle(b.querySelector(".cp-badge") as Element);
    expect(badge.backgroundColor).toBe(getComputedStyle(accent).color);
    expect(badge.color).toBe(getComputedStyle(ink).color);
  });

  it("shows a pressed Show button's drawing marked on, which the trigger rule leaves to it", () => {
    theme("light");
    const el = build(
      '<div class="cp-input-wrap"><input class="cp-input" type="text"><button class="cp-button" type="button" aria-pressed="true" aria-label="Show password">' +
        '<span class="cp-icon"></span><span class="cp-icon" data-part="on"></span></button></div>',
    );
    const b = el.querySelector("button") as HTMLElement;
    const shown = () =>
      [...b.querySelectorAll(".cp-icon")].map((i) => getComputedStyle(i).display !== "none");
    expect(shown()).toEqual([false, true]);
    b.setAttribute("aria-pressed", "false");
    expect(shown()).toEqual([true, false]);
  });

  it.skipIf(!emulates)(
    "rounds a checked menu item's box without turning it under reduced motion",
    async () => {
      theme("light");
      // A fresh item each time, so no transition is under way when it is read.
      const box = () =>
        getComputedStyle(
          build(
            '<div class="cp-menu" role="menu"><button role="menuitemcheckbox" aria-checked="true" type="button">Posters</button></div>',
          ).querySelector("button") as Element,
          "::before",
        );
      expect(box().rotate).toBe("90deg");
      await media("prefers-reduced-motion", "reduce");
      const reduced = box();
      expect([reduced.rotate, reduced.borderRadius]).toEqual(["none", "50%"]);
    },
  );

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

  it("sets a confirmation's groups 12px under its words", () => {
    theme("light");
    const d = document.createElement("dialog");
    d.className = "cp-dialog";
    d.dataset["variant"] = "confirm";
    d.innerHTML =
      '<form><div class="cp-dialog-body"><span class="cp-icon"></span><div><h2>Delete?</h2><p>Choose which.</p>' +
      '<fieldset class="cp-choices"><label class="cp-choice"><input type="checkbox"><span>3 files</span></label></fieldset></div></div></form>';
    hosts.push(d as unknown as HTMLElement);
    document.body.append(d);
    d.showModal();
    const words = (d.querySelector("p") as Element).getBoundingClientRect();
    const groups = (d.querySelector("fieldset") as Element).getBoundingClientRect();
    expect(Math.round(groups.top - words.bottom)).toBe(12);
    d.close();
  });

  it.skipIf(!emulates)(
    "dims a refusing dialog once in place of the shake under reduced motion",
    async () => {
      theme("light");
      const d = document.createElement("dialog");
      d.className = "cp-dialog";
      d.setAttribute("data-cp-refused", "");
      hosts.push(d as unknown as HTMLElement);
      document.body.append(d);
      expect(getComputedStyle(d).animationName).toBe("cp-refuse");
      await media("prefers-reduced-motion", "reduce");
      expect(getComputedStyle(d).animationName).toBe("cp-refuse-still");
    },
  );

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

  it("stacks a banner's head, its reasons and its foot, the foot in the tone's ink", () => {
    theme("light");
    const el = build(
      '<div class="cp-banner" data-tone="warning"><strong>Update ready.</strong> Reload to use it. <small>Saved.</small><button class="cp-button" type="button">Reload</button></div>' +
        '<div class="cp-banner" data-tone="warning"><strong><span class="cp-icon"></span>Reachable from the internet</strong><ul><li>It answers on a public address.</li></ul><small>Seen today. <a href="#a">How to limit access</a></small></div>',
    );
    const [plain, reasons] = [...el.querySelectorAll<HTMLElement>(".cp-banner")] as [
      HTMLElement,
      HTMLElement,
    ];
    expect(getComputedStyle(plain).display).toBe("flex");
    expect(getComputedStyle(plain).paddingBlockStart).toBe("8px");
    expect(getComputedStyle(plain.querySelector("strong") as Element).display).toBe("block");
    expect(getComputedStyle(plain.querySelector("small") as Element).color).toBe(
      getComputedStyle(plain).color,
    );
    const box = getComputedStyle(reasons);
    expect([box.display, box.paddingBlockStart, box.paddingInlineStart]).toEqual([
      "grid",
      "12px",
      "16px",
    ]);
    const head = reasons.querySelector("strong") as HTMLElement;
    const list = reasons.querySelector("ul") as HTMLElement;
    expect(list.getBoundingClientRect().top - head.getBoundingClientRect().bottom).toBe(8);
    expect(getComputedStyle(list).paddingInlineStart).toBe("28px");
    expect(getComputedStyle(head).display).toBe("flex");
    const ink = host("");
    ink.style.color = "var(--cp-warning-11)";
    const words = host("");
    words.style.color = "var(--cp-warning-12)";
    const foot = getComputedStyle(reasons.querySelector("small") as Element);
    expect([foot.color, foot.fontSize]).toEqual([getComputedStyle(ink).color, "13px"]);
    expect(getComputedStyle(reasons.querySelector(".cp-icon") as Element).color).toBe(
      getComputedStyle(ink).color,
    );
    expect(box.color).toBe(getComputedStyle(words).color);
  });

  it("flashes a chip's solid at 110% and fades it back to its wash from the first fifth", () => {
    theme("light");
    const el = build('<span class="cp-chip" data-tone="danger" data-cp-flash="">Down</span>');
    const chip = el.querySelector(".cp-chip") as HTMLElement;
    const at = (ms: number) => {
      for (const a of chip.getAnimations()) {
        a.pause();
        a.currentTime = ms;
      }
      return getComputedStyle(chip);
    };
    const solid = host("", { "data-tone": "danger" });
    solid.style.cssText = "background: var(--cp-tone-9); color: var(--cp-tone-on)";
    const wash = host("");
    wash.style.background = "var(--cp-danger-3)";
    // An animated colour reads back in its interpolation space, so compare pixels.
    const solidBg = rgb(getComputedStyle(solid).backgroundColor);
    const on = rgb(getComputedStyle(solid).color);
    expect([rgb(at(0).backgroundColor), rgb(at(0).color)]).toEqual([solidBg, on]);
    expect([rgb(at(162).backgroundColor), at(162).scale]).toEqual([solidBg, "1.1"]);
    expect(rgb(at(600).backgroundColor)).not.toEqual(solidBg);
    expect(Number(at(600).scale)).toBeLessThan(1.1);
    chip.removeAttribute("data-cp-flash");
    expect(getComputedStyle(chip).backgroundColor).toBe(getComputedStyle(wash).backgroundColor);
  });

  it.skipIf(!emulates)("keeps a chip's flash but not its growth under reduced motion", async () => {
    theme("light");
    const el = build('<span class="cp-chip" data-tone="success" data-cp-flash="">Up</span>');
    await media("prefers-reduced-motion", "reduce");
    expect(getComputedStyle(el.querySelector(".cp-chip") as Element).animationName).toBe(
      "cp-chip-flash",
    );
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

  it("gives a done step's link a hit area of the tier's minimum that takes in its number", () => {
    theme("light");
    for (const [tier, min] of [
      ["fine", 24],
      ["coarse", 44],
    ] as const) {
      root.dataset["pointer"] = tier;
      const el = build(
        '<div style="padding: 40px; inline-size: 40rem"><ol class="cp-steps"><li data-state="done"><a href="#a">Account</a></li><li data-state="current" aria-current="step">Sonarr</li></ol></div>',
      );
      const a = el.querySelector("a") as HTMLAnchorElement;
      const box = a.getBoundingClientRect();
      expect(getComputedStyle(a, "::after").height).toBe(`${String(min)}px`);
      const number = getComputedStyle(a.parentElement as Element, "::before");
      const reach = (min - box.height) / 2 - 0.5;
      expect(document.elementFromPoint(box.left + 4, box.top - reach)).toBe(a);
      expect(document.elementFromPoint(box.left + 4, box.top - reach - 2)).not.toBe(a);
      expect(
        document.elementFromPoint(
          box.left - Number.parseFloat(number.width) / 2,
          box.top + box.height / 2,
        ),
      ).toBe(a);
      el.remove();
    }
    delete root.dataset["pointer"];
  });

  it("widens a steps gate, makes its panel the steps' container, and puts the primary at the row's end", () => {
    theme("light");
    const el = build(
      '<main class="cp-gate" data-variant="steps" style="min-block-size: 0"><div class="cp-panel"><div class="cp-stack"><ol class="cp-steps"><li data-state="current" aria-current="step">Account</li><li data-state="todo">Sonarr</li></ol><h1>Step 1 of 2</h1><div data-part="actions"><button class="cp-button" type="button">Back</button><button class="cp-button" data-variant="primary" type="button">Next</button></div></div></div></main>',
    );
    const panel = el.querySelector(".cp-panel") as HTMLElement;
    expect(getComputedStyle(el.querySelector(".cp-gate") as Element).gridTemplateColumns).toBe(
      "448px",
    );
    expect(getComputedStyle(panel).containerType).toBe("inline-size");
    expect(getComputedStyle(el.querySelector(".cp-steps") as Element).marginBlockEnd).toBe("0px");
    const [back, next] = [...el.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
    const row = (el.querySelector('[data-part="actions"]') as HTMLElement).getBoundingClientRect();
    expect([back?.top, Math.round(back?.left ?? 0)]).toEqual([next?.top, Math.round(row.left)]);
    expect(Math.round(next?.right ?? 0)).toBe(Math.round(row.right));
    expect(getComputedStyle(el.querySelector("h1") as Element).fontSize).toBe(
      getComputedStyle(host("", { style: "font-size: var(--cp-text-lg)" })).fontSize,
    );
  });

  it("draws the connection test's glyph and tone by its state, and nothing at rest", () => {
    theme("light");
    const el = build(
      ["idle", "busy", "passed", "failed"]
        .map((s) => `<span class="cp-test-status" data-cp-state="${s}">Words</span>`)
        .join(""),
    );
    const [idle, busy, passed, failed] = [...el.querySelectorAll(".cp-test-status")];
    const before = (e: Element | undefined) => getComputedStyle(e as Element, "::before");
    expect(before(idle).display).toBe("none");
    expect(before(busy).animationName).toBe("cp-spin");
    const tone = (v: string): string => {
      const h = host("");
      h.style.color = `var(${v})`;
      return getComputedStyle(h).color;
    };
    expect(getComputedStyle(passed as Element).color).toBe(tone("--cp-success-11"));
    expect(getComputedStyle(failed as Element).color).toBe(tone("--cp-danger-11"));
    expect(before(passed).maskImage).toMatch(/^url\(/);
    expect(before(passed).maskImage).not.toBe(before(failed).maskImage);
  });

  it("reveals a progress fill to its --cp-progress, and turns it green with its check once done", () => {
    theme("light");
    const el = build(
      '<span class="cp-progress" role="progressbar" aria-label="Check" aria-valuenow="40"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>40%</span>',
    );
    const bar = el.querySelector(".cp-progress") as HTMLElement;
    const fill = el.querySelector(".cp-progress-fill") as HTMLElement;
    fill.style.transition = "none";
    bar.style.setProperty("--cp-progress", "40%");
    const track = (el.querySelector(".cp-progress-track") as HTMLElement).getBoundingClientRect();
    expect([track.width, track.height]).toEqual([224, 8]);
    expect(getComputedStyle(fill).clipPath).toMatch(/^inset\(0px 60% 0px 0px round/);
    // The track comes first, then the check's kept place, then the words.
    const check = getComputedStyle(bar, "::before");
    expect([check.width, check.opacity, check.scale]).toEqual(["18px", "0", "0"]);
    expect(check.maskImage).toMatch(/^url\(/);
    const accent = host("");
    accent.style.color = "var(--cp-accent-9)";
    const success = host("");
    success.style.color = "var(--cp-success-9)";
    const from = (): string => getComputedStyle(fill).getPropertyValue("--cp-progress-from");
    expect(rgb(from())).toEqual(rgb(getComputedStyle(accent).color));
    bar.dataset["state"] = "done";
    expect(rgb(from())).toEqual(rgb(getComputedStyle(success).color));
    expect(rgb(getComputedStyle(fill).getPropertyValue("--cp-progress-to"))).toEqual(
      rgb(getComputedStyle(success).color),
    );
    fill.style.removeProperty("transition");
    // Green waits for the last step's 480ms glide, and the check for green.
    expect(getComputedStyle(fill).transitionDelay).toBe("0s, 0.48s, 0.48s");
    expect(getComputedStyle(bar, "::before").transitionDelay).toBe("0.74s, 0.74s");
  });

  it.skipIf(!emulates)("keeps a progress fill apart from its track in forced colours", async () => {
    theme("light");
    await media("forced-colors", "active");
    const el = build(
      '<span class="cp-progress"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>1 of 2</span>' +
        '<span dir="rtl" class="cp-progress"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>1 of 2</span>',
    );
    const rtl = getComputedStyle(el.querySelector("[dir=rtl] .cp-progress-fill") as Element);
    expect(rtl.backgroundImage).toBe("none");
    const track = getComputedStyle(el.querySelector(".cp-progress-track") as Element);
    const fill = getComputedStyle(el.querySelector(".cp-progress-fill") as Element);
    const system = (colour: string): string => {
      const h = host("");
      h.style.cssText = `forced-color-adjust: none; background: ${colour}`;
      return getComputedStyle(h).backgroundColor;
    };
    expect(fill.backgroundImage).toBe("none");
    expect([fill.backgroundColor, track.backgroundColor]).toEqual([
      system("Highlight"),
      system("Canvas"),
    ]);
    expect(system("Highlight")).not.toBe(system("Canvas"));
    expect(track.outlineStyle).toBe("solid");
  });

  it("puts a progress bar's words under its track in a box too narrow for both", () => {
    theme("light");
    const el = build(
      '<div class="cp-empty"><span class="cp-progress"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>Series 120 of 351</span></div>',
    );
    el.style.inlineSize = "20rem";
    const bar = el.querySelector(".cp-progress") as HTMLElement;
    const track = (el.querySelector(".cp-progress-track") as HTMLElement).getBoundingClientRect();
    expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(
      (el.firstElementChild as HTMLElement).getBoundingClientRect().right,
    );
    expect(bar.getBoundingClientRect().height).toBeGreaterThan(track.height + 8);
    el.style.inlineSize = "40rem";
    expect(bar.getBoundingClientRect().height).toBeLessThan(24);
  });

  it("shrinks a progress bar's track to fit a box narrower than the track", () => {
    theme("light");
    const el = build(
      '<span class="cp-progress"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>Series 120 of 351</span>',
    );
    el.style.inlineSize = "10rem";
    const box = el.getBoundingClientRect();
    const bar = (el.querySelector(".cp-progress") as HTMLElement).getBoundingClientRect();
    const track = (el.querySelector(".cp-progress-track") as HTMLElement).getBoundingClientRect();
    expect(bar.right).toBeLessThanOrEqual(box.right + 0.5);
    expect(track.width).toBeLessThanOrEqual(160.5);
    expect(track.width).toBeGreaterThanOrEqual(80);
  });

  it.skipIf(!emulates)(
    "jumps a progress fill and fades its check in at once under reduced motion",
    async () => {
      theme("light");
      const el = build(
        '<span class="cp-progress" data-state="done"><span class="cp-progress-track"><span class="cp-progress-fill"></span></span>2 of 2</span>',
      );
      await media("prefers-reduced-motion", "reduce");
      const fill = getComputedStyle(el.querySelector(".cp-progress-fill") as Element);
      expect(fill.transitionProperty).not.toMatch(/clip-path/);
      expect(fill.transitionDelay).toMatch(/^0s(, 0s)*$/);
      const check = getComputedStyle(el.querySelector(".cp-progress") as Element, "::before");
      expect(check.transitionProperty).toBe("opacity");
      expect(check.transitionDelay).toBe("0s");
      expect(check.scale).toBe("1");
    },
  );

  it("sizes a skeleton's heading and last lines, and leads an empty state with its glyph or loader", () => {
    theme("light");
    const el = build(
      '<div class="cp-stack"><div class="cp-skeleton" data-variant="heading"></div><div class="cp-skeleton"></div><div class="cp-skeleton" data-variant="last"></div></div>' +
        '<div class="cp-empty"><span class="cp-icon" data-tone="danger"></span><strong>Failed</strong></div>' +
        '<div class="cp-empty"><span class="cp-icon"></span><strong><span class="cp-loader"><span></span></span>Reading</strong></div>',
    );
    el.style.inlineSize = "500px";
    root.classList.add("cp");
    const [heading, line, last] = [...el.querySelectorAll<HTMLElement>(".cp-skeleton")].map(
      (s) => s.getBoundingClientRect().width,
    ) as [number, number, number];
    expect([heading / line, last / line]).toEqual([0.4, 0.85]);
    const [failed, plain] = [...el.querySelectorAll<HTMLElement>(".cp-empty > .cp-icon")] as [
      HTMLElement,
      HTMLElement,
    ];
    const danger = host("");
    danger.style.color = "var(--cp-danger-9)";
    const accent = host("");
    accent.style.color = "var(--cp-accent-9)";
    expect([getComputedStyle(failed).width, getComputedStyle(failed).color]).toEqual([
      "48px",
      getComputedStyle(danger).color,
    ]);
    expect(getComputedStyle(plain).color).toBe(getComputedStyle(accent).color);
    const head = el.querySelector("strong:has(.cp-loader)") as HTMLElement;
    const loader = (head.firstElementChild as HTMLElement).getBoundingClientRect();
    const box = head.getBoundingClientRect();
    expect([getComputedStyle(head).display, getComputedStyle(head).columnGap]).toEqual([
      "flex",
      "8px",
    ]);
    expect(loader.top + loader.height / 2).toBeCloseTo(box.top + box.height / 2, 0);
  });

  it("twirls a loader through the harmony colours", () => {
    theme("light");
    const el = build('<span class="cp-loader" aria-hidden="true"><span></span></span>');
    expect(getComputedStyle(el.querySelector(".cp-loader > span") as Element).animationName).toBe(
      "cp-twirl-loop",
    );
  });
});

describe("css/system.css data tables", () => {
  const resolve = (value: string, property: "color" | "backgroundColor" = "color"): string => {
    const h = host("");
    h.style[property] = value;
    return getComputedStyle(h)[property];
  };

  it("draws a sort button's arrow from the stylesheet, shown on the sorted column and turned over for descending", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><thead><tr>' +
        '<th><button class="cp-sort" type="button">Title</button></th>' +
        '<th aria-sort="ascending"><button class="cp-sort" type="button">Size</button></th>' +
        '<th aria-sort="descending"><button class="cp-sort" type="button">Added</button></th>' +
        "</tr></thead></table>",
    );
    const [off, up, down] = [...el.querySelectorAll(".cp-sort")].map((b) =>
      getComputedStyle(b, "::after"),
    );
    expect(off?.maskImage).toMatch(/^url\(/);
    expect([off?.opacity, up?.opacity, down?.opacity]).toEqual(["0", "1", "1"]);
    expect([up?.rotate, down?.rotate]).toEqual(["none", "180deg"]);
  });

  it("gives a sort button a small control's height, a finger's under a coarse pointer", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><thead><tr><th><button class="cp-sort" type="button">Title</button></th></tr></thead></table>',
    );
    const button = el.querySelector(".cp-sort") as HTMLElement;
    expect(button.getBoundingClientRect().height).toBe(26);
    root.dataset["pointer"] = "coarse";
    expect(button.getBoundingClientRect().height).toBe(44);
  });

  it.skipIf(!emulates)("keeps a sort arrow in the button's ink in forced colours", async () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><thead><tr><th aria-sort="ascending"><button class="cp-sort" type="button">Title</button></th></tr></thead></table>',
    );
    await media("forced-colors", "active");
    const button = el.querySelector(".cp-sort") as HTMLElement;
    expect(getComputedStyle(button, "::after").backgroundColor).toBe(
      resolve("ButtonText", "backgroundColor"),
    );
  });

  it("writes a caption small and muted at the table's start", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><caption>Library, 1 to 4 of 412 entries</caption></table>',
    );
    const caption = getComputedStyle(el.querySelector("caption") as Element);
    expect([caption.color, caption.textAlign]).toEqual([resolve("var(--cp-ink-muted)"), "start"]);
    expect(caption.fontSize).toBe(
      getComputedStyle(host("", { style: "font-size: var(--cp-text-xs)" })).fontSize,
    );
  });

  it("draws a thumbnail as a 2:3 tile in the harmony colour it names, the second by default", () => {
    theme("light");
    const el = build(
      '<span class="cp-thumb"></span><span class="cp-thumb" data-harmony="1"></span><span class="cp-thumb" data-harmony="4"></span>',
    );
    const [plain, one, four] = [...el.querySelectorAll(".cp-thumb")];
    const fill = (e: Element | undefined) => getComputedStyle(e as Element).backgroundColor;
    expect(fill(plain)).toBe(resolve("var(--cp-harmony-2)", "backgroundColor"));
    expect(fill(one)).toBe(resolve("var(--cp-harmony-1)", "backgroundColor"));
    expect(fill(four)).toBe(resolve("var(--cp-harmony-4)", "backgroundColor"));
    expect(getComputedStyle(four as Element).color).toBe(resolve("var(--cp-harmony-4-on)"));
    const box = (plain as Element).getBoundingClientRect();
    expect([box.width, box.height]).toEqual([36, 54]);
  });

  it("lays the filters in force in a wrapping row whose chips arrive still and shrink away", () => {
    theme("light");
    const el = build(
      '<span class="cp-token" id="field-chip"><span>a</span><button type="button"></button></span>' +
        '<div class="cp-active-filters"><span class="cp-token"><span>Kind: TV</span><button type="button"></button></span>' +
        '<span class="cp-token" data-cp-leaving><span>Verdict: Best</span><button type="button"></button></span></div>',
    );
    const row = getComputedStyle(el.querySelector(".cp-active-filters") as Element);
    expect([row.display, row.flexWrap, row.columnGap]).toEqual(["flex", "wrap", "8px"]);
    const [still, leaving] = [...el.querySelectorAll(".cp-active-filters > .cp-token")].map(
      (c) => getComputedStyle(c).animationName,
    );
    expect(getComputedStyle(el.querySelector("#field-chip") as Element).animationName).toBe(
      "cp-token-in",
    );
    expect([still, leaving]).toEqual(["none", "cp-token-out"]);
  });

  it("turns an open row's chevron to point down, in either direction of text", () => {
    theme("light");
    const row = (dir: string, open: string) =>
      `<tr dir="${dir}"><td data-col="expand"><button type="button" aria-expanded="${open}">` +
      '<span class="cp-icon" data-cp-icon="chevron-right"></span></button></td></tr>';
    const el = build(
      `<table class="cp-table"><tbody>${row("ltr", "false")}${row("ltr", "true")}${row("rtl", "true")}</tbody></table>`,
    );
    const turns = [...el.querySelectorAll(".cp-icon")].map((i) => getComputedStyle(i).rotate);
    expect(turns).toEqual(["none", "90deg", "-90deg"]);
  });

  it("gives a detail row its content's height, the padding on the cell's one child", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><tbody><tr data-part="detail"><td>' +
        '<div><p style="margin: 0; line-height: 12px">Same episode</p></div></td></tr></tbody></table>',
    );
    const cell = el.querySelector("td") as Element;
    expect(getComputedStyle(cell.firstElementChild as Element).paddingBlock).toBe("16px 20px");
    expect(cell.getBoundingClientRect().height).toBe(48);
  });

  it("starts a detail row's content in line with its row's first data column", () => {
    theme("light");
    const el = build(
      '<table class="cp-table"><tbody><tr><td data-col="expand">' +
        '<button class="cp-button" data-variant="quiet" data-size="sm" type="button" aria-expanded="true">' +
        '<span class="cp-icon" data-cp-icon="chevron-right"></span></button></td>' +
        "<td><strong>Arid</strong></td></tr>" +
        '<tr data-part="detail"><td colspan="2"><div><p style="margin: 0">Same episode</p></div></td></tr>' +
        "</tbody></table>",
    );
    const title = (el.querySelector("strong") as Element).getBoundingClientRect();
    const fact = (el.querySelector("p") as Element).getBoundingClientRect();
    expect(fact.left).toBe(title.left);
  });

  const historyEvent = (tone: string, more = "") =>
    `<li><span data-part="mark" data-tone="${tone}"><span class="cp-icon" data-cp-icon="plus"></span></span>` +
    `<span><strong>Added</strong> from Sonarr${more}</span><time>today</time></li>`;

  it("heads each day of a history small and muted, the first with no space above", () => {
    theme("light");
    const el = build(
      `<div class="cp-history"><h3>Today</h3><ol>${historyEvent("neutral")}</ol>` +
        `<h3>Last week</h3><ol>${historyEvent("neutral")}</ol></div>`,
    );
    const [first, second] = [...el.querySelectorAll("h3")].map((h) => getComputedStyle(h));
    expect([first?.color, first?.fontWeight]).toEqual([resolve("var(--cp-ink-muted)"), "600"]);
    expect(first?.fontSize).toBe(
      getComputedStyle(host("", { style: "font-size: var(--cp-text-xs)" })).fontSize,
    );
    expect([first?.marginTop, first?.marginBottom]).toEqual(["0px", "8px"]);
    expect(second?.marginTop).toBe("16px");
  });

  it("marks each event with a round in its tone, joined to the next by a line", () => {
    theme("light");
    const el = build(
      `<div class="cp-history"><ol>${historyEvent("success")}${historyEvent("warning")}</ol></div>`,
    );
    const [mark] = [...el.querySelectorAll('[data-part="mark"]')];
    const box = (mark as Element).getBoundingClientRect();
    expect([box.width, box.height]).toEqual([32, 32]);
    const style = getComputedStyle(mark as Element);
    expect(style.borderRadius).toBe("50%");
    expect(style.backgroundColor).toBe(
      getComputedStyle(host("", { "data-tone": "success", style: "background: var(--cp-tone-3)" }))
        .backgroundColor,
    );
    const [joined, last] = [...el.querySelectorAll("li")].map((li) =>
      getComputedStyle(li, "::before"),
    );
    expect([joined?.borderInlineStartWidth, joined?.insetInlineStart, joined?.top]).toEqual([
      "2px",
      "15px",
      "36px",
    ]);
    expect(last?.content).toBe("none");
    const time = getComputedStyle(el.querySelector("time") as Element);
    expect([time.color, time.whiteSpace]).toEqual([resolve("var(--cp-ink-muted)"), "nowrap"]);
  });

  it("turns an open event's chevron down in either direction, back as it starts to close", () => {
    theme("light");
    const more = (open: string, closing = "") =>
      `<details ${open} ${closing}><summary><span class="cp-icon" data-cp-icon="chevron-right"></span>What changed</summary><p>Replaced</p></details>`;
    const el = build(
      `<div class="cp-history"><ol>${historyEvent("success", more(""))}${historyEvent("success", more("open"))}` +
        `${historyEvent("success", more("open", "data-cp-closing"))}</ol>` +
        `<ol dir="rtl">${historyEvent("success", more("open"))}</ol></div>`,
    );
    const turns = [...el.querySelectorAll("summary > .cp-icon")].map(
      (i) => getComputedStyle(i).rotate,
    );
    expect(turns).toEqual(["none", "90deg", "none", "-90deg"]);
    const summary = el.querySelector("summary") as Element;
    expect(getComputedStyle(summary).color).toBe(resolve("var(--cp-accent-11)"));
    const reach = getComputedStyle(summary, "::after");
    expect([reach.position, reach.height]).toEqual(["absolute", "24px"]);
  });

  it("lays facts in a muted label column beside their values, one column on a phone", async () => {
    theme("light");
    const el = build(
      '<dl class="cp-facts"><dt>Path</dt><dd>/media/anime/Frieren</dd><dt>Size</dt><dd>31.4 GB</dd></dl>',
    );
    const list = el.querySelector("dl") as Element;
    const [dt, dd] = [list.querySelector("dt"), list.querySelector("dd")] as Element[];
    const style = getComputedStyle(list);
    expect([style.rowGap, style.columnGap, style.margin]).toEqual(["8px", "20px", "0px"]);
    expect(getComputedStyle(dt as Element).color).toBe(resolve("var(--cp-ink-muted)"));
    expect(getComputedStyle(dd as Element).margin).toBe("0px");
    expect((dd as Element).getBoundingClientRect().top).toBe(
      (dt as Element).getBoundingClientRect().top,
    );
    await page.viewport(390, 800);
    expect((dd as Element).getBoundingClientRect().left).toBe(
      (dt as Element).getBoundingClientRect().left,
    );
    expect(getComputedStyle(dd as Element).marginBlockEnd).toBe("12px");
  });

  it("aligns compared facts' words and notes in their own columns, the word at the list's size", async () => {
    theme("light");
    const fact = (label: string, word: string, note: string) =>
      `<dt>${label}</dt><dd><span class="cp-state" data-tone="success">` +
      `<span class="cp-icon" data-cp-icon="check"></span>${word}</span><small>${note}</small></dd>`;
    const el = build(
      `<dl class="cp-facts" data-variant="compare">${fact("Episode", "Same", "S01E04 in both")}` +
        `${fact("Release group", "Differs", "Timed to a web release")}</dl>`,
    );
    const list = el.querySelector("dl") as Element;
    const words = [...list.querySelectorAll(".cp-state")];
    const notes = [...list.querySelectorAll("small")];
    const left = (e: Element | undefined) => (e as Element).getBoundingClientRect().left;
    expect(left(words[0])).toBe(left(words[1]));
    expect(left(notes[0])).toBe(left(notes[1]));
    expect(left(notes[0])).toBeGreaterThan(left(words[1]));
    expect(getComputedStyle(words[0] as Element).fontSize).toBe(getComputedStyle(list).fontSize);
    expect((words[0]?.querySelector(".cp-icon") as Element).getBoundingClientRect().width).toBe(18);
    expect(getComputedStyle(notes[0] as Element).fontSize).toBe(
      getComputedStyle(host("", { style: "font-size: var(--cp-text-xs)" })).fontSize,
    );
    await page.viewport(390, 800);
    const labels = [...list.querySelectorAll("dt")];
    expect((words[0] as Element).getBoundingClientRect().top).toBeGreaterThanOrEqual(
      (labels[0] as Element).getBoundingClientRect().bottom,
    );
    expect(left(words[0])).toBe(left(labels[0]));
  });

  it("writes an outcome small, its link to the result in the success tone", () => {
    theme("light");
    const el = build('<span class="cp-outcome"><a href="#r">Downloaded</a></span>');
    const outcome = el.querySelector(".cp-outcome") as Element;
    expect(getComputedStyle(outcome).fontSize).toBe(
      getComputedStyle(host("", { style: "font-size: var(--cp-text-sm)" })).fontSize,
    );
    expect(getComputedStyle(outcome.querySelector("a") as Element).color).toBe(
      resolve("var(--cp-success-11)"),
    );
  });

  it("fills the row a keyboard is in, and keeps a selected row's fill", async () => {
    theme("light");
    const el = build(
      '<button type="button" id="start">Start</button><table class="cp-table"><tbody>' +
        '<tr><td>a</td><td data-col="actions"><button class="cp-button" type="button">Grab</button></td></tr>' +
        '<tr><td data-col="select"><label><input type="checkbox" checked></label></td><td>b</td></tr>' +
        "</tbody></table>",
    );
    const [plain, selected] = [...el.querySelectorAll("tr")].map(
      (tr) => tr.cells[0] as HTMLElement,
    );
    const grab = el.querySelector(".cp-button") as HTMLElement;
    const rest = getComputedStyle(grab).backgroundColor;
    expect(getComputedStyle(plain as Element).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    (el.querySelector("#start") as HTMLElement).focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(grab);
    expect(getComputedStyle(plain as Element).backgroundColor).toBe(
      resolve("var(--cp-fill)", "backgroundColor"),
    );
    expect(getComputedStyle(grab).backgroundColor).not.toBe(rest);
    await userEvent.keyboard("{Tab}");
    expect(getComputedStyle(selected as Element).backgroundColor).toBe(
      resolve("var(--cp-selected)", "backgroundColor"),
    );
  });
});
