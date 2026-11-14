import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIcons } from "../../foundations/icons/icons.js";

const root = document.documentElement;
const hosts: HTMLElement[] = [];
const CSS = new URL("../../../css/system.css", import.meta.url).href;
const icons = createIcons({ base: CSS.replace(/css\/system\.css$/, "icons/svg/") });
let sheet: HTMLLinkElement;

beforeEach(async () => {
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = CSS;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
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

interface Hero {
  readonly actions?: boolean;
  readonly cover?: boolean;
  readonly kind?: "film" | "tv";
}

// seadex's hero (no actions) and subflux's (the page's actions), one markup.
function hero(width: number, { actions = false, cover = true, kind = "tv" }: Hero = {}): HTMLElement {
  const host = document.createElement("div");
  host.style.inlineSize = `${width}px`;
  const row = document.createElement("header");
  row.className = "cp-heading-row";
  if (cover) {
    const poster = document.createElement("span");
    poster.className = "cp-cover";
    poster.setAttribute("data-harmony", "2");
    poster.append(icons.icon(kind));
    row.append(poster);
  }
  const block = document.createElement("div");
  block.innerHTML =
    "<h1>Frieren: Beyond Journey's End</h1>" +
    '<p data-part="alt-title" lang="ja">葬送のフリーレン</p>' +
    '<p data-part="meta"><span>TV, 2023</span><span>28 episodes</span></p>' +
    '<ul data-part="lines"><li>Sonarr: on the best release</li><li>Radarr: not wanted</li></ul>' +
    '<nav data-part="links" aria-label="Frieren elsewhere"><a href="#releases">Releases</a>' +
    '<a href="https://anilist.co/anime/154587" rel="external">AniList<span class="cp-visually-hidden">, opens AniList</span></a></nav>' +
    '<div class="cp-cluster"><span class="cp-chip" data-tone="success">On the best</span></div>';
  row.append(block);
  if (actions) {
    const bar = document.createElement("div");
    bar.className = "cp-toolbar";
    bar.innerHTML =
      '<button class="cp-button" type="button">Refresh</button>' +
      '<button class="cp-button" data-variant="primary" type="button">Find subtitles</button>';
    row.append(bar);
  }
  host.append(row);
  document.body.append(host);
  hosts.push(host);
  return row;
}

function box(row: HTMLElement, selector: string): DOMRect {
  return (row.querySelector(selector) as HTMLElement).getBoundingClientRect();
}

// The built stylesheet inlines each drawing, so a mark is told by its path.
const CHEVRON_RIGHT = "m9 18 6-6-6-6";
const EXTERNAL_LINK = "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6";

function mask(el: Element): string {
  return decodeURIComponent(getComputedStyle(el, "::after").maskImage);
}

function muted(): string {
  const probe = document.createElement("span");
  probe.style.color = "var(--cp-ink-muted)";
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

describe("heading row with a poster: the item hero", () => {
  it("puts the title block beside the poster from its top, the toolbar at the row's end", () => {
    const row = hero(900, { actions: true });
    const poster = box(row, ".cp-cover");
    const block = box(row, ".cp-cover + div");
    const bar = box(row, ".cp-toolbar");
    expect(poster.width).toBeCloseTo(112, 0);
    expect(poster.height).toBeCloseTo(168, 0);
    expect(block.left - poster.right).toBeCloseTo(24, 0);
    expect(block.top).toBeCloseTo(poster.top, 0);
    expect(bar.top).toBeCloseTo(poster.top, 0);
    expect(bar.right).toBeCloseTo(row.getBoundingClientRect().right, 0);
  });

  it("puts the title block under the poster and the toolbar on its own line on a phone", () => {
    const row = hero(390, { actions: true });
    const poster = box(row, ".cp-cover");
    const block = box(row, ".cp-cover + div");
    const bar = box(row, ".cp-toolbar");
    expect(poster.width).toBeCloseTo(112, 0);
    expect(block.left).toBeCloseTo(poster.left, 0);
    expect(block.top - poster.bottom).toBeCloseTo(12, 0);
    expect(block.width).toBeCloseTo(390, 0);
    expect(bar.top - block.bottom).toBeCloseTo(12, 0);
    expect(bar.left).toBeCloseTo(poster.left, 0);
  });

  it("gives the title block the rest of the row when there are no actions", () => {
    const row = hero(900);
    expect(row.querySelector(".cp-toolbar")).toBeNull();
    expect(box(row, ".cp-cover + div").right).toBeCloseTo(row.getBoundingClientRect().right, 0);
  });

  it("sets the alternative title muted under the title, in its own language, then the facts in a row", () => {
    const row = hero(900);
    const alt = row.querySelector('[data-part="alt-title"]') as HTMLElement;
    expect(alt.matches(":lang(ja)")).toBe(true);
    expect(getComputedStyle(alt).color).toBe(muted());
    expect(alt.getBoundingClientRect().top - box(row, "h1").bottom).toBeCloseTo(2, 0);
    const meta = row.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta.getBoundingClientRect().top - alt.getBoundingClientRect().bottom).toBeCloseTo(8, 0);
    expect(getComputedStyle(meta).color).toBe(muted());
    const [a, b] = [...meta.children].map((s) => s.getBoundingClientRect());
    expect(b.top).toBeCloseTo(a.top, 0);
    expect(b.left - a.right).toBeCloseTo(12, 0);
  });

  it("sets a facts line 4px under a title with no alternative title", () => {
    const row = hero(900);
    row.querySelector('[data-part="alt-title"]')?.remove();
    expect(box(row, '[data-part="meta"]').top - box(row, "h1").bottom).toBeCloseTo(4, 0);
  });

  it("spaces the lines, the links and the chips 12px apart, the lines as a list with no bullets", () => {
    const row = hero(900);
    const lines = row.querySelector('[data-part="lines"]') as HTMLElement;
    expect(getComputedStyle(lines).listStyleType).toBe("none");
    expect(lines.getBoundingClientRect().left).toBeCloseTo(box(row, "h1").left, 0);
    const [l1, l2] = [...lines.children].map((li) => li.getBoundingClientRect());
    expect(l2.top - l1.bottom).toBeCloseTo(2, 0);
    expect(lines.getBoundingClientRect().top - box(row, '[data-part="meta"]').bottom).toBeCloseTo(12, 0);
    expect(box(row, '[data-part="links"]').top - lines.getBoundingClientRect().bottom).toBeCloseTo(12, 0);
    expect(box(row, ".cp-cluster").top - box(row, '[data-part="links"]').bottom).toBeCloseTo(12, 0);
  });

  it("draws a chevron after a link that stays in the app and the external mark after one that leaves", () => {
    const row = hero(900);
    const [inApp, out] = [...row.querySelectorAll<HTMLAnchorElement>('[data-part="links"] > a')];
    expect(mask(inApp as Element)).toContain(CHEVRON_RIGHT);
    expect(mask(out as Element)).toContain(EXTERNAL_LINK);
    expect(mask(out as Element)).not.toContain(CHEVRON_RIGHT);
    expect(getComputedStyle(inApp as Element, "::after").width).toBe("14px");
    expect(out?.textContent).toBe("AniList, opens AniList");
    const words = (out as Element).querySelector(".cp-visually-hidden") as HTMLElement;
    expect(words.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("turns the in-app chevron, and only it, in a right-to-left page", () => {
    const row = hero(900);
    row.setAttribute("dir", "rtl");
    const [inApp, out] = [...row.querySelectorAll('[data-part="links"] > a')];
    expect(getComputedStyle(inApp as Element, "::after").transform).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    expect(getComputedStyle(out as Element, "::after").transform).toBe("none");
  });

  it("makes a link chip a 26px pill under a mouse and 44px under a finger", () => {
    const row = hero(900);
    const chip = row.querySelector('[data-part="links"] > a') as HTMLElement;
    expect(chip.getBoundingClientRect().height).toBeCloseTo(26, 0);
    expect(getComputedStyle(chip).textDecorationLine).toBe("none");
    root.setAttribute("data-pointer", "coarse");
    expect(chip.getBoundingClientRect().height).toBeCloseTo(44, 0);
  });

  it.each(["tv", "film"] as const)("centres the stand-in's %s glyph until a poster loads over it", async (kind) => {
    const row = hero(900, { kind });
    const cover = row.querySelector(".cp-cover") as HTMLElement;
    const glyph = cover.querySelector(`.cp-icon[data-cp-icon="${kind}"]`) as HTMLElement;
    const c = cover.getBoundingClientRect();
    const g = glyph.getBoundingClientRect();
    expect(g.width).toBeCloseTo(32, 0);
    expect(g.left + g.width / 2).toBeCloseTo(c.left + c.width / 2, 0);
    expect(g.top + g.height / 2).toBeCloseTo(c.top + c.height / 2, 0);
    const img = document.createElement("img");
    img.alt = "";
    img.src =
      "data:image/svg+xml," +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3" fill="red"/></svg>');
    cover.prepend(img);
    await img.decode();
    const i = img.getBoundingClientRect();
    expect([i.width, i.height]).toEqual([c.width, c.height]);
    expect(document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)).toBe(img);
  });

  it("lays a heading row with no poster out as before: the toolbar at the end of the title's last line", () => {
    const row = hero(900, { actions: true, cover: false });
    const block = box(row, ":scope > div:first-child");
    const bar = box(row, ".cp-toolbar");
    expect(block.left).toBeCloseTo(row.getBoundingClientRect().left, 0);
    expect(bar.bottom).toBeCloseTo(block.bottom, 0);
    expect(bar.right).toBeCloseTo(row.getBoundingClientRect().right, 0);
  });
});
