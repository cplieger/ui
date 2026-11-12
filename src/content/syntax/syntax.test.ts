import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, server } from "vitest/browser";

import { highlightInto } from "../highlight/highlight.js";
import { renderMarkdown } from "../markdown/markdown.js";

const root = document.documentElement;
const hosts: HTMLElement[] = [];
let sheet: HTMLLinkElement;

async function link(): Promise<HTMLLinkElement> {
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    el.addEventListener("load", resolve, { once: true });
    el.addEventListener("error", reject, { once: true });
  });
  document.head.append(el);
  await loaded;
  return el;
}

// Media emulation goes through the Chrome DevTools Protocol, which only
// Chromium speaks.
const emulates = server.browser === "chromium";

beforeEach(async () => {
  sheet = await link();
  root.classList.add("cp");
});

afterEach(async () => {
  if (emulates) {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  sheet.remove();
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  root.classList.remove("cp");
  root.removeAttribute("data-theme");
  for (const p of ["--cp-accent-h", "--cp-accent-c"]) {
    root.style.removeProperty(p);
  }
});

function host(className = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  document.body.append(el);
  hosts.push(el);
  return el;
}

// The rendered sRGB of an opaque colour, read back through a canvas pixel.
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

const SAMPLE = [
  "```go",
  "// comment",
  'func main() { x := "s" + 42 }',
  "```",
  "",
  "```json",
  '{"key": 1}',
  "```",
  "",
  "```diff",
  "+added line",
  "-removed line",
  "```",
  "",
].join("\n");

// Every token of every kind, with the code block's surface behind it.
function tokens(): Map<string, { el: HTMLElement; surface: string }> {
  const el = host("cp-prose");
  renderMarkdown(el, SAMPLE);
  const found = new Map<string, { el: HTMLElement; surface: string }>();
  for (const block of el.querySelectorAll<HTMLElement>(".cp-code[data-variant='block']")) {
    const surface = getComputedStyle(block).backgroundColor;
    for (const t of block.querySelectorAll<HTMLElement>("[data-token]")) {
      found.set(t.dataset["token"] ?? "", { el: t, surface });
    }
  }
  return found;
}

const KINDS = ["keyword", "string", "number", "key", "comment", "punctuation"] as const;

describe("the syntax roles", () => {
  for (const t of ["light", "dark"] as const) {
    it(`clears 4.5:1 on the code block's surface for every token kind in ${t}`, () => {
      root.setAttribute("data-theme", t);
      const found = tokens();
      for (const kind of [...KINDS, "inserted", "deleted"]) {
        const token = found.get(kind);
        expect(token, kind).toBeDefined();
        const cs = getComputedStyle(token!.el);
        const behind =
          kind === "inserted" || kind === "deleted" ? cs.backgroundColor : token!.surface;
        expect(contrast(cs.color, behind), kind).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`keeps the fixed hues at 7:1 on the sunken, page and raised surfaces in ${t}`, () => {
      root.setAttribute("data-theme", t);
      const probe = host();
      const ink = (v: string) => {
        probe.style.color = `var(${v})`;
        return getComputedStyle(probe).color;
      };
      for (const surface of ["--cp-surface-sunken", "--cp-surface-page", "--cp-surface-raised"]) {
        const behind = ink(surface);
        for (const role of ["--cp-syntax-string", "--cp-syntax-number", "--cp-syntax-key"]) {
          expect(contrast(ink(role), behind), `${role} on ${surface}`).toBeGreaterThanOrEqual(7);
        }
      }
    });

    it(`keeps the keyword at 4.5:1 on the code block for any accent hue in ${t}`, () => {
      root.setAttribute("data-theme", t);
      root.style.setProperty("--cp-accent-c", "0.09");
      const block = host("cp-code");
      block.dataset["variant"] = "block";
      const word = document.createElement("span");
      word.dataset["token"] = "keyword";
      word.textContent = "func";
      block.append(word);
      for (const hue of [0, 45, 95, 150, 200, 255, 310]) {
        root.style.setProperty("--cp-accent-h", String(hue));
        const cs = getComputedStyle(word);
        expect(
          contrast(cs.color, getComputedStyle(block).backgroundColor),
          `hue ${String(hue)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("sets the keyword in medium weight and the comment in italic", () => {
    root.setAttribute("data-theme", "light");
    const found = tokens();
    expect(getComputedStyle(found.get("keyword")!.el).fontWeight).toBe("500");
    expect(getComputedStyle(found.get("comment")!.el).fontStyle).toBe("italic");
  });

  it("keeps a string apart from a success and a key apart from the accent", () => {
    root.setAttribute("data-theme", "light");
    const found = tokens();
    const probe = host();
    probe.style.color = "var(--cp-success-11)";
    expect(getComputedStyle(found.get("string")!.el).color).not.toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(found.get("key")!.el).color).not.toBe(
      getComputedStyle(found.get("keyword")!.el).color,
    );
  });

  it("colours tokens anywhere inside .cp, outside a code block too", () => {
    root.setAttribute("data-theme", "light");
    const row = host();
    highlightInto(row, 'x = "s"', "py");
    const str = row.querySelector<HTMLElement>("[data-token='string']");
    expect(getComputedStyle(str!).color).not.toBe(getComputedStyle(row).color);
    root.classList.remove("cp");
    expect(getComputedStyle(str!).color).toBe(getComputedStyle(row).color);
  });

  it("fills a changed line across the block's widest line, keeping its sign", () => {
    root.setAttribute("data-theme", "light");
    const el = host("cp-prose");
    el.style.inlineSize = "480px";
    renderMarkdown(el, `\`\`\`diff\n+a\n-${"wide ".repeat(40)}\n\`\`\`\n`);
    const code = el.querySelector<HTMLElement>("pre > code")!;
    const [added, removed] = [...code.querySelectorAll<HTMLElement>("[data-token]")];
    expect(added!.textContent).toBe("+a");
    expect(removed!.textContent?.startsWith("-")).toBe(true);
    const width = (n: Element) => n.getBoundingClientRect().width;
    expect(width(added!)).toBeCloseTo(width(removed!), 0);
    expect(width(added!)).toBeGreaterThan(480);
    expect(added!.getBoundingClientRect().top).toBeLessThan(removed!.getBoundingClientRect().top);
    const lineHeight = removed!.getBoundingClientRect().top - added!.getBoundingClientRect().top;
    expect(lineHeight).toBeLessThan(2 * added!.getBoundingClientRect().height);
  });

  it("keeps a marked changed line at its text's width, its pieces on one row", () => {
    root.setAttribute("data-theme", "light");
    const block = host("cp-code");
    block.dataset["variant"] = "block";
    block.style.inlineSize = "480px";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    block.append(pre);
    highlightInto(code, "-old word\n", "diff", { marks: [{ start: 1, end: 4 }] });
    const pieces = [...code.querySelectorAll<HTMLElement>("[data-token='deleted']")];
    expect(pieces.length).toBeGreaterThan(1);
    const tops = new Set(pieces.map((p) => Math.round(p.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);
    expect(getComputedStyle(pieces[0]!).display).toBe("inline");
  });

  it("keeps its forced-colour rule in every engine", () => {
    const forced = [...sheet.sheet!.cssRules].filter(
      (r): r is CSSMediaRule =>
        r instanceof CSSMediaRule && r.conditionText.includes("forced-colors"),
    );
    const selectors = forced.flatMap((m) =>
      [...m.cssRules].map((r) => (r instanceof CSSStyleRule ? r.selectorText : "")),
    );
    expect(selectors).toContain(".cp :where([data-token])");
  });

  it.skipIf(!emulates)("drops every token to CanvasText in forced colours", async () => {
    root.setAttribute("data-theme", "light");
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const found = tokens();
    const probe = host();
    probe.style.color = "CanvasText";
    for (const kind of [...KINDS, "inserted", "deleted"]) {
      expect(getComputedStyle(found.get(kind)!.el).color, kind).toBe(getComputedStyle(probe).color);
    }
  });
});
