import { afterEach, describe, expect, it } from "vitest";
import { server } from "vitest/browser";

const APP_PAGES = ["app.html", "list-detail.html"] as const;

async function parse(name: string): Promise<Document> {
  // As the file ships: the dev server's copy carries its client script.
  const text = await server.commands.readFile(`templates/${name}`);
  return new DOMParser().parseFromString(text, "text/html");
}

/** The names of the page's region or slot comments, in document order. */
function marks(doc: Document, kind: "region" | "slot"): string[] {
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
  const names: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = new RegExp(`^ ${kind}: ([a-z ]+?)(?::|$| -->)`).exec(n.textContent ?? "");
    if (m?.[1]) {
      names.push(m[1].trim());
    }
  }
  return names;
}

/** The element a region comment names: the next element sibling. */
function region(doc: Document, name: string): Element | null {
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent?.startsWith(` region: ${name}`)) {
      let next = n.nextSibling;
      while (next && next.nodeType !== Node.ELEMENT_NODE) {
        next = next.nextSibling;
      }
      return next as Element | null;
    }
  }
  return null;
}

const frames: HTMLIFrameElement[] = [];

afterEach(() => {
  for (const f of frames.splice(0)) {
    f.remove();
  }
});

/** Loads a template in a frame `width` px wide, as it ships. */
async function load(name: string, width: number): Promise<Document> {
  const frame = document.createElement("iframe");
  frame.title = name;
  frame.width = String(width);
  frame.height = "800";
  const loaded = new Promise((resolve) => {
    frame.addEventListener("load", resolve, { once: true });
  });
  frame.src = new URL(`../../templates/${name}`, import.meta.url).href;
  document.body.append(frame);
  frames.push(frame);
  await loaded;
  const doc = frame.contentDocument;
  if (!doc) {
    throw new Error(`${name} did not load`);
  }
  await doc.fonts.ready;
  return doc;
}

describe("the app templates", () => {
  it.each(APP_PAGES)("%s holds no inline style, script or handler", async (name) => {
    const doc = await parse(name);
    expect(doc.querySelectorAll("style, script, [style]")).toHaveLength(0);
    const handlers = [...doc.querySelectorAll("*")].flatMap((el) =>
      el.getAttributeNames().filter((a) => a.startsWith("on")),
    );
    expect(handlers).toEqual([]);
    expect(doc.documentElement.classList.contains("cp")).toBe(true);
    expect(doc.documentElement.lang).toBe("en");
    expect(doc.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(
      "../css/system.css",
    );
  });

  it.each(APP_PAGES)("%s names its regions in the frame's order", async (name) => {
    const doc = await parse(name);
    const regions = marks(doc, "region");
    const expected =
      name === "app.html"
        ? ["skip", "header", "rail", "main", "status"]
        : ["skip", "header", "main", "status"];
    expect(regions).toEqual(expected);
    const classes: Record<string, string> = {
      skip: "cp-skip",
      header: "cp-header",
      rail: "cp-rail",
      main: "cp-main",
      status: "cp-status",
    };
    for (const r of regions) {
      expect(region(doc, r)?.classList.contains(classes[r] ?? "")).toBe(true);
    }
    expect(doc.body.firstElementChild?.matches('a.cp-skip[href="#main"]')).toBe(true);
    expect(doc.querySelector("main")?.matches('.cp-main#main[tabindex="-1"]')).toBe(true);
    expect(doc.querySelector(".cp-app > :last-child")?.matches("footer.cp-status")).toBe(true);
    expect(marks(doc, "slot").slice(0, 3)).toEqual(["brand", "destinations", "toolbar"]);
    expect(doc.querySelectorAll('.cp-nav [aria-current="page"]')).toHaveLength(1);
    expect(doc.querySelectorAll('.cp-main [data-variant="primary"]').length).toBeLessThanOrEqual(1);
  });

  it("list-detail.html holds the list, a hidden detail and its close", async () => {
    const doc = await parse("list-detail.html");
    expect(marks(doc, "slot")).toEqual(
      expect.arrayContaining(["list", "detail", "detail header", "detail body"]),
    );
    const ld = doc.querySelector(".cp-main .cp-list-detail");
    expect(ld?.querySelector(":scope > ul.cp-list > li > a.cp-list-row")).not.toBeNull();
    const detail = ld?.querySelector(":scope > section.cp-detail");
    expect(detail?.hasAttribute("hidden")).toBe(true);
    expect(detail?.querySelector('header > h2[tabindex="-1"]')?.id).toBe(
      detail?.getAttribute("aria-labelledby"),
    );
    expect(detail?.querySelector("header > [data-detail-close]")).not.toBeNull();
    expect(detail?.querySelector(":scope > .cp-detail-body")).not.toBeNull();
  });

  it.each([1600, 820, 390])("app.html lays out its regions at %ipx", async (width) => {
    const doc = await load("app.html", width);
    const view = doc.defaultView;
    if (!view) {
      throw new Error("no window");
    }
    const style = (sel: string): CSSStyleDeclaration => {
      const el = doc.querySelector(sel);
      if (!el) {
        throw new Error(`no ${sel}`);
      }
      return view.getComputedStyle(el);
    };
    expect(style(".cp-app").display).toBe("grid");
    expect(style(".cp-rail").display).toBe(width >= 960 ? "flex" : "none");
    expect(style(".cp-rail-toggle").display === "none").toBe(width >= 960);
    expect(style(".cp-header > .cp-nav").position).toBe(width < 640 ? "fixed" : "static");
    const main = doc.querySelector(".cp-main")?.getBoundingClientRect();
    const status = doc.querySelector(".cp-status")?.getBoundingClientRect();
    expect(status && main && status.top >= main.bottom - 0.5).toBe(true);
    const content = doc.querySelector(".cp-main > .cp-stack")?.getBoundingClientRect();
    expect(content && content.width <= 90 * 16).toBe(true);
  });
});
