import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

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

let base: HTMLLinkElement | null = null;

beforeEach(async () => {
  sheet = await link("system.css");
});

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  await page.viewport(1280, 720);
  sheet.remove();
  base?.remove();
  base = null;
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
      '<a href="#x">link</a><h1>title</h1><pre>pre</pre><span class="uip-icon"></span>',
    );
    const read = () =>
      ["a", "h1", "pre", ".uip-icon"].map((sel) => {
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

  it("presses a button by data-uip-pressed as well as :active, and never a disabled one", async () => {
    theme("light");
    const el = build(
      '<button class="cp-button" type="button" data-uip-pressed="">Go</button><button class="cp-button" type="button" data-uip-pressed="" disabled>No</button>',
    );
    const [on, off] = [...el.querySelectorAll("button")];
    for (const b of [on, off]) {
      (b as HTMLElement).style.transition = "none";
    }
    const scale = (b: Element | undefined) =>
      new DOMMatrix(getComputedStyle(b as Element).transform).a;
    expect([scale(on), scale(off)]).toEqual([0.97, 1]);
    await media("prefers-reduced-motion", "reduce");
    expect(scale(on)).toBe(1);
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
              `<a class="cp-nav-item" href="#"><span class="uip-icon"></span><span class="cp-nav-label">${w}</span></a>`,
          )
          .join("") +
        '</nav><div class="cp-toolbar"><span class="cp-chip">Full check 3 of 8</span>' +
        '<button class="cp-button" data-variant="quiet" type="button" aria-label="Theme"><span class="uip-icon"></span></button>'.repeat(
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
    it(`fills the header with the brand and inks it at 4.5:1, or 7:1 with more contrast, in ${t}`, async () => {
      theme(t);
      const header = host("cp-header");
      const ratio = () => {
        const cs = getComputedStyle(header);
        return contrast(cs.color, cs.backgroundColor);
      };
      expect(ratio()).toBeGreaterThanOrEqual(4.5);
      await media("prefers-contrast", "more");
      expect(ratio()).toBeGreaterThanOrEqual(7);
    });

    it(`writes a field's error text at 4.5:1 on the page in ${t}`, () => {
      theme(t);
      const error = host("cp-field-error");
      const page = getComputedStyle(root).backgroundColor;
      expect(contrast(getComputedStyle(error).color, page)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("borders chips in forced colours", async () => {
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
    dialog.className = "uip-modal";
    const content = document.createElement("div");
    content.className = "cp-sheet";
    dialog.append(content);
    document.body.append(dialog);
    dialog.showModal();
    const rect = () => dialog.getBoundingClientRect();
    expect([rect().right, rect().width, rect().top, rect().height]).toEqual([
      innerWidth,
      384,
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

  it("closes a modal at the exit duration", () => {
    theme("light");
    const dialog = document.createElement("dialog");
    dialog.className = "uip-modal";
    document.body.append(dialog);
    expect(getComputedStyle(dialog).getPropertyValue("--uip-modal-leave-duration")).toBe("120ms");
  });

  it("mirrors a drawing that points along the text in a right-to-left context", () => {
    theme("light");
    const el = build(
      '<span class="uip-icon" data-uip-icon="arrow-right"></span><span class="uip-icon" data-uip-icon="chevron-up"></span>',
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

  it("borders the current destination in forced colours", async () => {
    theme("light");
    const el = build('<a class="cp-nav-item" href="#" aria-current="page">Library</a>');
    await media("forced-colors", "active");
    expect(getComputedStyle(el.firstElementChild as Element).borderTopWidth).toBe("1px");
  });

  it("keeps the page inside a 320px window with a wide table and its hidden actions label", async () => {
    base = await link("ui-primitives.css");
    theme("light");
    await page.viewport(320, 700);
    build(
      '<div class="cp-panel" data-flush><table class="cp-table"><thead><tr><th>Title</th><th>Your copy</th>' +
        '<th data-col="actions"><span class="uip-visually-hidden">Actions</span></th></tr></thead>' +
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
