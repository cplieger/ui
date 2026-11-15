import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { build, q, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

afterEach(async () => {
  await page.viewport(1280, 720);
});

const box = (el: Element) => el.getBoundingClientRect();

const path = (p: string) =>
  `<li><code class="cp-mono">${p.replaceAll("/", "/<wbr>").replace("/<wbr>", "/")}</code></li>`;

const AGENT =
  '<dl class="cp-facts"><dt>Machine</dt><dd>borgcube (kiro-cli)</dd>' +
  '<dt>Paths</dt><dd><ul class="cp-stack" data-gap="tight">' +
  `${path("/workspace/grelot/internal")}${path("/workspace/grelot/web/src/messages")}</ul></dd>` +
  '<dt>Delegates</dt><dd><ul class="cp-stack" data-gap="tight">' +
  "<li>@codex/review</li><li>@codex/ci</li></ul></dd></dl>";

const panel = (width: string) =>
  build(`<div class="cp-panel" style="inline-size: ${width}">${AGENT}</div>`);

describe("facts", () => {
  it("stacks each label over its value in a panel narrower than 24rem", () => {
    const host = panel("16rem");
    const [dt, dd] = [q(host, "dt"), q(host, "dd")];
    expect(box(dd).left).toBe(box(dt).left);
    expect(box(dd).top).toBe(box(dt).bottom);
    expect(getComputedStyle(dd).marginBlockEnd).toBe("12px");
  });

  it("keeps labels and values side by side in a panel of 24rem or more", () => {
    const host = panel("28rem");
    const [dt, dd] = [q(host, "dt"), q(host, "dd")];
    expect(box(dd).top).toBe(box(dt).top);
    expect(box(dd).left).toBeGreaterThan(box(dt).right);
  });

  it("lays a value's list as lines from the value's start, a path breaking only at a slash", () => {
    const host = panel("16rem");
    const list = q(host, "dt + dd > ul");
    const dd = list.parentElement as HTMLElement;
    const lines = [...list.children];
    for (const li of lines) {
      expect(box(li).left).toBe(box(dd).left);
    }
    expect(Math.round(box(lines[1] as Element).top - box(lines[0] as Element).bottom)).toBe(4);
    const long = q(lines[1] as Element, "code");
    expect(long.getClientRects().length).toBeGreaterThan(1);
    // Each folder's name sits on one line: the path breaks only at a <wbr>.
    const range = document.createRange();
    const folders = [...long.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(folders).toHaveLength(5);
    for (const folder of folders) {
      range.selectNodeContents(folder);
      expect(range.getClientRects(), folder.textContent ?? "").toHaveLength(1);
    }
    const p = q(host, ".cp-panel");
    expect(p.scrollWidth).toBeLessThanOrEqual(p.clientWidth);
  });

  it("ends without a margin after its last value, on a phone and in a narrow panel", async () => {
    const host = panel("16rem");
    const values = [...host.querySelectorAll("dd")];
    expect(getComputedStyle(values.at(-1) as Element).marginBlockEnd).toBe("0px");
    await page.viewport(390, 800);
    const plain = build(AGENT);
    const phone = [...plain.querySelectorAll("dd")];
    expect(phone.map((dd) => getComputedStyle(dd).marginBlockEnd)).toEqual(["12px", "12px", "0px"]);
  });

  it("ends a compared list's last word and note without a margin on a phone", async () => {
    await page.viewport(390, 800);
    const fact = (label: string) =>
      `<dt>${label}</dt><dd><span class="cp-state" data-tone="success">Same</span><small>In both</small></dd>`;
    const host = build(
      `<dl class="cp-facts" data-variant="compare">${fact("Episode")}${fact("Group")}</dl>`,
    );
    const [first, last] = [...host.querySelectorAll("dd")];
    expect(getComputedStyle(q(first as Element, "small")).marginBlockEnd).toBe("12px");
    expect(getComputedStyle(q(last as Element, "small")).marginBlockEnd).toBe("0px");
  });

  it("keeps a side panel at its own height beside a longer column", () => {
    const host = build(
      `<div class="cp-side-main" style="inline-size: 60rem"><div class="cp-panel">${AGENT}</div>` +
        '<div style="block-size: 60rem">History</div></div>',
    );
    const [side, main] = [...q(host, ".cp-side-main").children];
    expect(box(side as Element).top).toBe(box(main as Element).top);
    expect(box(side as Element).height).toBeLessThan(box(main as Element).height);
  });
});
