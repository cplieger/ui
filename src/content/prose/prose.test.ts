import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

beforeEach(async () => {
  sheet = await link();
  root.classList.add("cp");
  root.setAttribute("data-theme", "light");
});

afterEach(() => {
  sheet.remove();
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  root.classList.remove("cp");
  root.removeAttribute("data-theme");
  root.removeAttribute("data-pointer");
});

function prose(md: string, width = 480): HTMLElement {
  const el = document.createElement("div");
  el.className = "cp-prose";
  el.style.inlineSize = `${String(width)}px`;
  document.body.append(el);
  hosts.push(el);
  renderMarkdown(el, md, { base: "https://example.test/" });
  return el;
}

function q(el: Element, selector: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(selector);
  expect(found, selector).not.toBeNull();
  return found as HTMLElement;
}

const css = (el: Element) => getComputedStyle(el);
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

describe(".cp-prose", () => {
  it("breaks a long inline path anywhere and keeps the mono face", () => {
    const el = prose(`See \`${"src/content/markdown/".repeat(12)}render.ts\` now.`, 240);
    const code = q(el, "p > code");
    expect(css(code).overflowWrap).toBe("anywhere");
    expect(css(code).fontFamily).toContain("Mono");
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
  });

  it("shows a link with no href as body text, and a live one in the accent ink", () => {
    const el = prose("[gone](javascript:alert(1)) and [live](https://example.org/)");
    const [dead, live] = [...el.querySelectorAll("a")];
    expect(dead?.hasAttribute("href")).toBe(false);
    expect(css(dead as Element).color).toBe(css(el).color);
    expect(css(dead as Element).textDecorationLine).toBe("none");
    expect(css(live as Element).color).not.toBe(css(el).color);
    expect(css(live as Element).textDecorationLine).toBe("underline");
  });

  it("sets a withheld link's destination apart in the mono face", () => {
    const el = prose(`[report](https://e.example/collect?d=${"%41".repeat(25)})`);
    const dest = q(el, "a[data-cp-withheld] > [data-part='dest']");
    expect(css(dest).fontFamily).toContain("Mono");
    expect(Number.parseFloat(css(dest).marginInlineStart)).toBeGreaterThan(0);
  });

  it("aligns table cells by data-align", () => {
    const el = prose("| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n");
    const cells = [...el.querySelectorAll("tbody td")];
    expect(cells.map((c) => css(c).textAlign)).toEqual(["start", "center", "end"]);
  });

  it("draws a task item with its box and no bullet", () => {
    const el = prose("- [x] done\n- [ ] todo\n- plain\n");
    const items = [...el.querySelectorAll("li")];
    expect(items.map((li) => css(li).listStyleType)).toEqual(["none", "none", "disc"]);
    const box = q(el, "li > input[type='checkbox']");
    expect(box.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      el.getBoundingClientRect().left,
    );
  });

  it("sets every heading level in the display face at one weight, each no smaller than 13px", () => {
    const el = prose("# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f\n", 480);
    const sizes = [...el.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => {
      expect(css(h).fontWeight).toBe("700");
      return Number.parseFloat(css(h).fontSize);
    });
    expect(sizes).toHaveLength(6);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);
  });

  it("puts more space above a heading than below it", () => {
    const el = prose("Intro.\n\n## Title\n\nBody.\n");
    const h = q(el, "h2");
    expect(Number.parseFloat(css(h).marginBlockStart)).toBeGreaterThan(
      Number.parseFloat(css(q(el, "h2 + p")).marginBlockStart),
    );
  });

  it("stops paragraphs at the prose measure", () => {
    const el = prose("word ".repeat(400), 4000);
    const p = q(el, "p");
    expect(p.getBoundingClientRect().width).toBeLessThan(1000);
  });

  it("mutes the truncation line", () => {
    const el = document.createElement("div");
    el.className = "cp-prose";
    document.body.append(el);
    hosts.push(el);
    renderMarkdown(el, "x".repeat(20), { maxBytes: 10 });
    const line = q(el, "[data-cp-truncated]");
    expect(css(line).color).not.toBe(css(el).color);
  });
});

describe(".cp-code[data-variant=block]", () => {
  it("grows with its lines instead of staying one control tall", () => {
    const el = prose("```go\npackage main\n\nfunc main() {}\n```\n");
    const block = q(el, ".cp-code[data-variant='block']");
    expect(css(block).display).toBe("block");
    expect(block.getBoundingClientRect().height).toBeGreaterThan(80);
    expect(css(q(block, "pre")).whiteSpace).toBe("pre");
  });

  it("scrolls a long line inside its pre and never widens the page", async () => {
    const el = prose(`\`\`\`sh\n${"echo long ".repeat(60)}\n\`\`\`\n`, 320);
    const block = q(el, ".cp-code");
    const pre = q(block, "pre");
    await frame();
    expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
    expect(block.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
  });

  it("puts the label at the bar's start and Copy at its end, both on one row", () => {
    const el = prose("```ts\nconst a = 1;\n```\n");
    const bar = q(el, "[data-part='bar']");
    const [label, copy] = [q(bar, "[data-part='lang']"), q(bar, ".cp-copy")];
    expect(label.textContent).toBe("TypeScript");
    const [b, l, c] = [bar, label, copy].map((x) => x.getBoundingClientRect()) as [
      DOMRect,
      DOMRect,
      DOMRect,
    ];
    expect(l.left - b.left).toBeLessThan(20);
    expect(b.right - c.right).toBeLessThan(10);
    expect(Math.abs(l.top + l.height / 2 - (c.top + c.height / 2))).toBeLessThan(2);
    expect(Number.parseFloat(css(label).fontSize)).toBeGreaterThanOrEqual(13);
  });

  it("draws Copy's glyph and swaps it for the check while done", () => {
    const el = prose("```\nx\n```\n");
    const copy = q(el, ".cp-copy");
    const [glyph, check] = [q(copy, ".cp-icon:not([data-part])"), q(copy, "[data-part='done']")];
    expect(decodeURIComponent(css(glyph).maskImage)).toContain("width='14' height='14' x='8'");
    expect(decodeURIComponent(css(check).maskImage)).toContain("M20 6 9 17l-5-5");
    expect(css(glyph).display).not.toBe("none");
    expect(css(check).display).toBe("none");
    copy.dataset["cpState"] = "done";
    expect(css(glyph).display).toBe("none");
    expect(css(check).display).not.toBe("none");
  });

  it("keeps Copy's hit area at the tier's minimum", () => {
    for (const [tier, min] of [
      ["fine", 24],
      ["coarse", 44],
    ] as const) {
      root.dataset["pointer"] = tier;
      const el = prose("```\nx\n```\n");
      const box = q(el, ".cp-copy").getBoundingClientRect();
      expect(box.height, tier).toBeGreaterThanOrEqual(min);
      expect(box.width, tier).toBeGreaterThanOrEqual(min);
    }
  });

  it("leaves the one-line copy field one control tall", () => {
    const el = document.createElement("div");
    el.className = "cp-code";
    el.append(document.createElement("code"));
    document.body.append(el);
    hosts.push(el);
    expect(css(el).display).toBe("flex");
    expect(el.getBoundingClientRect().height).toBe(32);
  });
});

describe(".cp-table-scroll", () => {
  it("scrolls a wide table inside its own box", async () => {
    const cols = Array.from({ length: 12 }, (_, i) => `column ${String(i)}`);
    const md = `| ${cols.join(" | ")} |\n|${" --- |".repeat(12)}\n| ${cols.join(" | ")} |\n`;
    const el = prose(md, 320);
    const region = q(el, ".cp-table-scroll");
    await frame();
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
    expect(css(region).overflowX).toBe("auto");
  });

  it("is as wide as a table that fits", () => {
    const el = prose("| a | b |\n| --- | --- |\n| 1 | 2 |\n", 480);
    const region = q(el, ".cp-table-scroll");
    expect(region.getBoundingClientRect().width).toBeLessThan(200);
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
  });
});
