import { afterEach, describe, expect, it } from "vitest";
import { server } from "vitest/browser";

import { createHeaderStatus } from "../navigation/header-status/header-status.js";
import { drawing, maskUrl, shipped } from "./test-helpers/css.js";

const APP_PAGES = ["app.html", "list-detail.html", "settings.html", "not-found.html"] as const;
const GATE_PAGES = [
  "gate.html",
  "gate-steps.html",
  "gate-message.html",
  "accounts-unavailable.html",
] as const;
const SCRIPTLESS_PAGES = ["gate-message.html", "accounts-unavailable.html"] as const;
const isGate = (name: string): boolean => (GATE_PAGES as readonly string[]).includes(name);
const STRICT = "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'";

async function parse(name: string): Promise<Document> {
  // As the file ships: the dev server's copy carries its client script.
  const text = await server.commands.readFile(`templates/${name}`);
  return new DOMParser().parseFromString(text, "text/html");
}

/** The commands a page gives to run: each a bar-less code block's code. */
function commands(root: ParentNode): string[] {
  return [...root.querySelectorAll('.cp-code[data-variant="block"] > pre:only-child > code')].map(
    (code) => code.textContent ?? "",
  );
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

const written: string[] = [];

afterEach(async () => {
  for (const path of written.splice(0)) {
    await server.commands.removeFile(path);
  }
});

/** Loads a template as it ships under `policy`, with a style and a script
 *  probe the policy must refuse, and returns the policy's later refusals. Its
 *  stylesheet, glyphs and faces are the shipped bytes under /shipped/
 *  (vitest.config.ts). A served file: Firefox matches no 'self' source in an
 *  about:srcdoc document. No sandbox: WebKit fires no securitypolicyviolation
 *  in a frame without scripts, so the policy alone keeps them off. The body
 *  loads hidden and shows once the listener is on, so it misses no fetch. */
async function loadStrict(
  name: string,
  policy: string,
): Promise<{ doc: Document; refused: SecurityPolicyViolationEvent[] }> {
  const text = await server.commands.readFile(`templates/${name}`);
  const base = new URL("/shipped/templates/", location.origin).href;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${base}">`;
  const path = `dist/strict/${crypto.randomUUID()}.html`;
  await server.commands.writeFile(
    path,
    text
      .replace("<head>", `<head>${head}`)
      .replace(
        "<body>",
        '<body hidden><p id="probe" style="display: none">probe</p>' +
          "<script>document.documentElement.dataset.ran = '';</script>",
      ),
  );
  written.push(path);
  const frame = document.createElement("iframe");
  frame.title = name;
  frame.width = "390";
  frame.height = "800";
  const loaded = new Promise((resolve) => {
    frame.addEventListener("load", resolve, { once: true });
  });
  frame.src = new URL(path, new URL("../../", import.meta.url)).href;
  document.body.append(frame);
  frames.push(frame);
  await loaded;
  const doc = frame.contentDocument;
  if (!doc) {
    throw new Error(`${name} did not load`);
  }
  const refused: SecurityPolicyViolationEvent[] = [];
  doc.addEventListener("securitypolicyviolation", (e) => refused.push(e));
  doc.body.hidden = false;
  doc.body.getBoundingClientRect();
  return { doc, refused };
}

describe("the page templates", () => {
  it.each([...APP_PAGES, ...GATE_PAGES])(
    "%s holds no inline style, script or handler",
    async (name) => {
      const doc = await parse(name);
      expect(doc.querySelectorAll("style, script, noscript, [style]")).toHaveLength(0);
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
    },
  );

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
    expect(doc.querySelectorAll('.cp-header [aria-current="page"]')).toHaveLength(
      name === "not-found.html" ? 0 : 1,
    );
    expect(doc.querySelectorAll('.cp-main [data-variant="primary"]').length).toBeLessThanOrEqual(1);
  });

  it.each([...APP_PAGES, ...GATE_PAGES])(
    "%s ends with the about line: the version, then the product's own links",
    async (name) => {
      const doc = await parse(name);
      const about = doc.querySelector('[data-part="about"]');
      expect(doc.querySelectorAll('[data-part="about"]')).toHaveLength(1);
      expect(
        about?.matches(
          isGate(name) ? ".cp-gate > p.cp-meta:last-child" : ".cp-status > span.cp-meta:last-child",
        ),
      ).toBe(true);
      if (!isGate(name)) {
        expect(marks(doc, "slot").at(-1)).toBe("about");
      }
      expect(about?.firstElementChild?.matches("span")).toBe(true);
      expect(about?.firstElementChild?.textContent).toMatch(/^Version \d+\.\d+\.\d+$/);
      const links = [...(about?.querySelectorAll(":scope > a") ?? [])];
      expect(links.map((a) => a.firstChild?.textContent)).toEqual(["Source", "Licence"]);
      for (const a of links) {
        expect(a.getAttribute("href")).toMatch(/^https:\/\//);
        expect(a.getAttribute("rel")).toBe("external");
        expect(a.querySelector(":scope > .cp-visually-hidden")?.textContent).toBe(", opens GitHub");
      }
    },
  );

  it.each(APP_PAGES)(
    "%s holds the header status's pill, its empty panel and the urgent part first in main",
    async (name) => {
      const doc = await parse(name);
      const pill = doc.querySelector(".cp-header > .cp-toolbar > button.cp-header-status");
      const panel = pill?.nextElementSibling;
      expect(panel?.matches('.cp-popover.cp-status-panel[data-variant="panel"][popover]')).toBe(
        true,
      );
      expect(pill?.getAttribute("popovertarget")).toBe(panel?.id);
      expect(panel?.childNodes).toHaveLength(0);
      const urgent = doc.querySelector(".cp-main > .cp-stack > :first-child");
      expect(urgent?.matches('div.cp-stack[data-gap="tight"]#urgent[hidden]')).toBe(true);
      expect(urgent?.childNodes).toHaveLength(0);
      expect(marks(doc, "slot")).toEqual(expect.arrayContaining(["header status", "banner"]));
    },
  );

  it("app.html's header status takes createHeaderStatus as its parts", async () => {
    const doc = await parse("app.html");
    const host = document.createElement("div");
    host.className = "cp";
    host.append(
      document.importNode(doc.querySelector(".cp-header") as Element, true),
      document.importNode(doc.querySelector(".cp-main") as Element, true),
    );
    document.body.append(host);
    const button = host.querySelector<HTMLButtonElement>("button.cp-header-status");
    const panel = host.querySelector<HTMLElement>("#status");
    const banner = host.querySelector<HTMLElement>("#urgent");
    if (button === null || panel === null || banner === null) {
      throw new Error("no header status parts");
    }
    const status = createHeaderStatus({ button, panel, banner });
    try {
      status.update({
        conditions: [
          { id: "store", level: "problem", urgent: true, title: "Store full", href: "#store" },
        ],
        work: [],
      });
      expect(button.dataset["state"]).toBe("problem");
      expect(button.textContent).toContain("Store full");
      expect(banner.hidden).toBe(false);
      expect(banner.querySelector('.cp-notice[data-variant="banner"]')?.textContent).toContain(
        "Store full",
      );
      button.click();
      expect(panel.matches(":popover-open")).toBe(true);
      expect(panel.querySelector("h2")?.textContent).toContain("Store full");
      panel.hidePopover();
    } finally {
      status.destroy();
      host.remove();
    }
  });

  it.each([...APP_PAGES, "gate-steps.html"])(
    "%s lets its one h1 take the focus a route change moves",
    async (name) => {
      const doc = await parse(name);
      const h1s = doc.querySelectorAll("main h1");
      expect(h1s).toHaveLength(1);
      expect(h1s[0]?.getAttribute("tabindex")).toBe("-1");
    },
  );

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

  it("not-found.html holds the page's empty state and the one way home", async () => {
    const doc = await parse("not-found.html");
    const page = doc.querySelector('.cp-main > .cp-stack > .cp-empty[data-variant="page"]');
    expect(page?.getAttribute("aria-labelledby")).toBe(page?.querySelector("h1")?.id);
    expect(
      [...(page?.children ?? [])].map(
        (el) => el.tagName.toLowerCase() + (el.className ? `.${el.className}` : ""),
      ),
    ).toEqual(["span.cp-icon", "h1", "p", "a.cp-button"]);
    expect(page?.querySelector(":scope > a")?.getAttribute("data-variant")).toBe("primary");
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
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
    expect(style(".cp-header > .cp-nav").position === "fixed").toBe(width < 640);
    const main = doc.querySelector(".cp-main")?.getBoundingClientRect();
    const status = doc.querySelector(".cp-status")?.getBoundingClientRect();
    expect(status && main && status.top >= main.bottom - 0.5).toBe(true);
    const content = doc.querySelector(".cp-main > .cp-stack")?.getBoundingClientRect();
    expect(content && content.width <= 90 * 16).toBe(true);
    const footer = doc.querySelector(".cp-status");
    const about = doc.querySelector('.cp-status > [data-part="about"]')?.getBoundingClientRect();
    if (!footer || !about) {
      throw new Error("no about line");
    }
    const end =
      footer.getBoundingClientRect().right - parseFloat(view.getComputedStyle(footer).paddingRight);
    expect(about.right).toBeCloseTo(end, 0);
  });

  it("settings.html holds the categories beside the open one's form and its save bar", async () => {
    const doc = await parse("settings.html");
    expect(marks(doc, "slot")).toEqual(
      expect.arrayContaining([
        "categories",
        "category",
        "category heading",
        "errors",
        "groups",
        "save bar",
      ]),
    );
    const rows = doc.querySelectorAll(
      ".cp-settings > nav.cp-settings-nav > ul.cp-list > li > a.cp-list-row",
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(doc.querySelectorAll('.cp-settings-nav [aria-current="page"]')).toHaveLength(1);
    for (const dot of doc.querySelectorAll(".cp-settings-nav .cp-dot")) {
      expect(dot.nextElementSibling?.matches(".cp-visually-hidden")).toBe(true);
      expect(dot.nextElementSibling?.textContent).toBe(", unsaved changes");
    }
    const form = doc.querySelector(".cp-settings > form");
    expect(form?.querySelector(":scope > h2")).not.toBeNull();
    const errors = form?.querySelector(":scope > .cp-notice[data-tone='danger'][hidden]");
    expect(errors?.querySelector('[data-part="body"]')).not.toBeNull();
    expect(
      form?.querySelectorAll(":scope > section > .cp-panel > .cp-setting").length,
    ).toBeGreaterThan(0);
    const bar = form?.lastElementChild;
    expect(bar?.matches('div.cp-savebar[role="group"][aria-label="Unsaved changes"]')).toBe(true);
    expect(bar?.querySelector('[data-part="count"]')).not.toBeNull();
    expect(bar?.querySelector('button[type="reset"]')?.textContent).toBe("Discard");
    expect(bar?.lastElementChild?.matches('button[type="submit"][data-variant="primary"]')).toBe(
      true,
    );
  });

  it.each([1280, 390])(
    "settings.html puts the categories beside the form at %ipx",
    async (width) => {
      const doc = await load("settings.html", width);
      const nav = doc.querySelector(".cp-settings-nav")?.getBoundingClientRect();
      const form = doc.querySelector(".cp-settings > form")?.getBoundingClientRect();
      if (!nav || !form) {
        throw new Error("no categories or form");
      }
      expect(form.left >= nav.right).toBe(width >= 768);
      expect(form.top >= nav.bottom - 0.5).toBe(width < 768);
    },
  );

  it.each(GATE_PAGES)("%s names the gate's three regions", async (name) => {
    const doc = await parse(name);
    expect(marks(doc, "region")).toEqual(["brand", "panel", "foot"]);
    const gate = doc.querySelector("body > main.cp-gate");
    expect(gate?.children).toHaveLength(3);
    expect(region(doc, "brand")?.matches(".cp-gate > .cp-wordmark")).toBe(true);
    expect(
      region(doc, "brand")?.querySelector(":scope > .cp-mark[aria-hidden='true']"),
    ).not.toBeNull();
    expect(region(doc, "panel")?.matches(".cp-gate > section.cp-panel")).toBe(true);
    expect(region(doc, "foot")?.matches('.cp-gate > p.cp-meta[data-part="about"]:last-child')).toBe(
      true,
    );
    expect(doc.title).toMatch(/ · /);
    expect(doc.querySelectorAll('[data-variant="primary"]').length).toBeLessThanOrEqual(1);
  });

  it("gate.html leaves its panel to the account screen", async () => {
    const doc = await parse("gate.html");
    const panel = region(doc, "panel");
    expect(panel?.id).toBe("gate-panel");
    expect(panel?.children).toHaveLength(0);
  });

  it("gate-steps.html marks each step's state in words and holds one step", async () => {
    const doc = await parse("gate-steps.html");
    expect(doc.querySelector("main")?.getAttribute("data-variant")).toBe("steps");
    expect(marks(doc, "slot")).toEqual(["steps", "heading", "notices", "form", "actions"]);
    const steps = [...doc.querySelectorAll(".cp-panel ol.cp-steps > li")];
    const at = steps.findIndex((li) => li.getAttribute("aria-current") === "step");
    expect(doc.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    steps.forEach((li, k) => {
      const state = k < at ? "done" : k === at ? "current" : "todo";
      expect(li.getAttribute("data-state")).toBe(state);
      expect(li.querySelector(":scope > a[href]") !== null).toBe(state === "done");
      const hidden = li.querySelector(".cp-visually-hidden")?.textContent;
      expect(hidden).toBe({ done: ", done", current: " (current step)", todo: undefined }[state]);
    });
    const counted = `Step ${at + 1} of ${steps.length}`;
    expect(doc.querySelector(".cp-steps-compact")?.textContent).toBe(counted);
    const h1 = doc.querySelector(".cp-panel h1");
    expect(h1?.textContent?.startsWith(`${counted}: `)).toBe(true);
    expect(doc.querySelector(".cp-panel")?.getAttribute("aria-labelledby")).toBe(h1?.id);
    const actions = doc.querySelector('form > [data-part="actions"]:last-child');
    expect(actions?.firstElementChild?.matches("a.cp-button[href]")).toBe(true);
    expect(
      actions?.lastElementChild?.matches('button[type="submit"][data-variant="primary"]'),
    ).toBe(true);
  });

  it.each([1280, 390])("gate-steps.html shows the steps or their count at %ipx", async (width) => {
    const doc = await load("gate-steps.html", width);
    const view = doc.defaultView;
    if (!view) {
      throw new Error("no window");
    }
    const shown = (sel: string): boolean => {
      const el = doc.querySelector(sel);
      return el !== null && view.getComputedStyle(el).display !== "none";
    };
    expect(shown(".cp-steps")).toBe(width >= 640);
    expect(shown(".cp-steps-compact")).toBe(width < 640);
    const back = doc.querySelector('[data-part="actions"] > a')?.getBoundingClientRect();
    const next = doc.querySelector('[data-part="actions"] > button')?.getBoundingClientRect();
    const panel = doc.querySelector(".cp-panel")?.getBoundingClientRect();
    expect(back && next && next.left > back.right).toBe(true);
    expect(panel && panel.width <= 28 * 16 + 0.5).toBe(true);
  });

  it("gate.html centres a panel at most 24rem wide", async () => {
    const doc = await load("gate.html", 1280);
    const panel = doc.querySelector(".cp-panel")?.getBoundingClientRect();
    if (!panel) {
      throw new Error("no panel");
    }
    expect(panel.width).toBeLessThanOrEqual(24 * 16 + 0.5);
    expect(Math.abs(panel.left + panel.width / 2 - 640)).toBeLessThan(1);
    const parts = [...doc.querySelectorAll('[data-part="about"] > *')].map((el) =>
      el.getBoundingClientRect(),
    );
    const mid =
      (Math.min(...parts.map((r) => r.left)) + Math.max(...parts.map((r) => r.right))) / 2;
    expect(Math.abs(mid - 640)).toBeLessThan(1);
  });

  it("gate-message.html tells what happened and how to fix it, with no control", async () => {
    const doc = await parse("gate-message.html");
    expect(marks(doc, "slot")).toEqual(["heading", "notices", "facts", "remedies"]);
    expect(doc.querySelectorAll("form, button, input, select, textarea")).toHaveLength(0);
    const panel = region(doc, "panel");
    const h1 = panel?.querySelector("h1");
    expect(panel?.getAttribute("aria-labelledby")).toBe(h1?.id);
    expect(
      panel?.querySelector('.cp-notice[data-tone="danger"] > .cp-icon[data-cp-icon="circle-x"]'),
    ).not.toBeNull();
    expect(panel?.querySelector("dl.cp-facts")).not.toBeNull();
    const remedies = [...(panel?.querySelectorAll(".cp-prose > ol > li") ?? [])];
    expect(remedies.map((li) => commands(li).length)).toEqual([0, 1, 1]);
    expect(commands(panel ?? doc).map((c) => /store (restore|reset)/.exec(c)?.[0])).toEqual([
      "store restore",
      "store reset",
    ]);
    const lead = remedies[0]?.querySelector('.cp-notice[data-tone="warning"]');
    expect(lead?.querySelector('.cp-icon[data-cp-icon="triangle-alert"]')).not.toBeNull();
    expect(region(doc, "foot")?.textContent).toMatch(/\d+\.\d+\.\d+/);
  });

  it("accounts-unavailable.html says sign-in is off and gives the two commands", async () => {
    const doc = await parse("accounts-unavailable.html");
    expect(doc.title).toBe("Accounts unavailable · Release tracker");
    expect(marks(doc, "slot")).toEqual(["heading", "notices", "facts", "remedies"]);
    expect(
      doc.querySelectorAll("form, button, input, select, textarea, a:not([rel])"),
    ).toHaveLength(0);
    const panel = region(doc, "panel");
    const h1 = panel?.querySelector("h1");
    expect(h1?.textContent).toBe("Release tracker cannot open its accounts");
    expect(panel?.getAttribute("aria-labelledby")).toBe(h1?.id);
    const danger = panel?.querySelector('.cp-stack > .cp-notice[data-tone="danger"]');
    expect(danger?.querySelector(':scope > .cp-icon[data-cp-icon="circle-x"]')).not.toBeNull();
    expect(danger?.textContent).toContain("Nobody can sign in");
    const facts = [...(panel?.querySelectorAll("dl.cp-facts > dt") ?? [])].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(facts).toEqual([
      ["Accounts file", "/config/accounts.db"],
      ["Error", "The file cannot be read."],
      ["Backups", "/config/backups/"],
    ]);
    const remedies = [...(panel?.querySelectorAll(".cp-prose > ol > li") ?? [])];
    expect(remedies.map((li) => commands(li))).toEqual([
      ["docker exec release-tracker release-tracker accounts restore <archive>"],
      ["docker exec release-tracker release-tracker accounts reset"],
    ]);
    const reset = remedies[1]?.querySelector(".cp-stack")?.firstElementChild;
    expect(reset?.matches('.cp-notice[data-tone="warning"]')).toBe(true);
    expect(reset?.querySelector('.cp-icon[data-cp-icon="triangle-alert"]')).not.toBeNull();
    for (const pre of panel?.querySelectorAll(".cp-code > pre") ?? []) {
      expect(pre.getAttribute("tabindex")).toBe("0");
    }
  });

  it.each(SCRIPTLESS_PAGES)(
    "%s paints its look and glyphs with no script under a strict policy",
    async (name) => {
      const { doc, refused } = await loadStrict(name, STRICT);
      const view = doc.defaultView;
      if (!view) {
        throw new Error("no window");
      }
      const probe = doc.getElementById("probe");
      if (!probe) {
        throw new Error("no probe");
      }
      expect(view.getComputedStyle(probe).display).not.toBe("none");
      expect(doc.documentElement.hasAttribute("data-ran")).toBe(false);
      for (const family of ["Atkinson Hyperlegible Next", "Atkinson Hyperlegible Mono"]) {
        expect(await doc.fonts.load(`16px "${family}"`)).not.toHaveLength(0);
      }
      await doc.fonts.ready;
      expect([...doc.fonts].filter((f) => f.status === "error")).toEqual([]);
      const gate = doc.querySelector(".cp-gate");
      expect(gate && view.getComputedStyle(gate).display).toBe("grid");
      const icons = [...doc.querySelectorAll(".cp-icon")];
      expect(icons.length).toBeGreaterThan(1);
      for (const icon of icons) {
        const url = new URL(maskUrl(icon), doc.baseURI);
        const name = icon.getAttribute("data-cp-icon") ?? "";
        expect(url.href).toBe(new URL(`/shipped/icons/svg/${name}.svg`, location.origin).href);
        expect(await drawing(url)).toBe(await shipped(name));
      }
      const panel = doc.querySelector(".cp-panel");
      expect(panel && panel.scrollWidth <= panel.clientWidth).toBe(true);
      const pres = [...doc.querySelectorAll<HTMLElement>(".cp-code > pre")];
      expect(pres.length).toBeGreaterThan(0);
      for (const pre of pres) {
        expect(view.getComputedStyle(pre).overflowX).toBe("auto");
        expect(pre.getBoundingClientRect().right).toBeLessThanOrEqual(
          (panel?.getBoundingClientRect().right ?? 0) + 0.5,
        );
      }
      expect(pres.some((pre) => pre.scrollWidth > pre.clientWidth)).toBe(true);
      expect(
        refused
          .filter((e) => /^(img|font)-src/.test(e.effectiveDirective))
          .map((e) => `${e.effectiveDirective} ${e.blockedURI}`),
      ).toEqual([]);
    },
  );
});
