import { afterEach, describe, expect, it, vi } from "vitest";

import { enhanceSettings } from "./settings.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
  scrollTo(0, 0);
});

const task = (): Promise<void> => new Promise((r) => setTimeout(r));

const row = (name: string, href: string, current = ""): string =>
  `<li><a class="cp-list-row" href="${href}"${current}><span class="cp-cell-stack">${name}</span></a></li>`;

/** A page of sections, each a category the nav's fragment links name. */
function page(tall = false): {
  form: HTMLFormElement;
  nav: HTMLElement;
  bar: HTMLElement;
  fields: HTMLInputElement[];
  links: HTMLAnchorElement[];
} {
  const height = tall ? ' style="min-block-size: 120vh"' : "";
  const host = document.createElement("div");
  host.innerHTML =
    '<div class="cp-settings"><nav class="cp-settings-nav" aria-label="Settings"><ul class="cp-list" data-surface="plain" data-divider="none" data-density="compact">' +
    row("Connections", "#s-con", ' aria-current="location"') +
    row("Checks", "#s-chk") +
    row("Display", "#s-dis") +
    "</ul></nav><form>" +
    `<section id="s-con"${height}><h2>Connections</h2><input name="url"></section>` +
    `<section id="s-chk"${height}><h2>Checks</h2><input name="every"><input name="retries"></section>` +
    '<section id="s-dis"><h2>Display</h2><input name="theme"></section>' +
    '<div class="cp-savebar" aria-label="Unsaved changes" hidden><span data-part="count"></span><button class="cp-button" type="reset">Discard</button><button class="cp-button" data-variant="primary" type="submit">Save changes</button></div>' +
    "</form></div>";
  document.body.append(host);
  const form = host.querySelector("form") as HTMLFormElement;
  return {
    form,
    nav: host.querySelector("nav") as HTMLElement,
    bar: host.querySelector(".cp-savebar") as HTMLElement,
    fields: [...form.querySelectorAll("input")],
    links: [...host.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")],
  };
}

const dots = (links: readonly HTMLAnchorElement[]): string[] =>
  links.map((l) => (l.querySelector(".cp-dot") === null ? "" : (l.textContent ?? "")));

describe("enhanceSettings", () => {
  it("shows the save bar with its count only while a change waits", () => {
    const { form, bar, fields } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    const count = bar.querySelector('[data-part="count"]');
    s.paint([]);
    expect(bar.hidden).toBe(true);
    s.paint([fields[0] as Element]);
    expect([bar.hidden, count?.textContent]).toEqual([false, "1 unsaved change"]);
    s.paint(fields.slice(0, 3));
    expect(count?.textContent).toBe("3 unsaved changes");
    s.paint([]);
    expect(bar.hidden).toBe(true);
  });

  it("keeps the bar while Save changes plays and recounts once it rests", async () => {
    const { form, bar, fields } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    s.paint(fields.slice(0, 2));
    const save = bar.querySelector('[type="submit"]') as HTMLButtonElement;
    save.setAttribute("data-cp-state", "busy");
    s.paint([]);
    expect([bar.hidden, bar.querySelector('[data-part="count"]')?.textContent]).toEqual([
      false,
      "2 unsaved changes",
    ]);
    save.setAttribute("data-cp-state", "done");
    await task();
    expect(bar.hidden).toBe(false);
    save.removeAttribute("data-cp-state");
    await vi.waitFor(() => {
      expect(bar.hidden).toBe(true);
    });
  });

  it("puts a dot on each category holding a change, read after its name", async () => {
    const { form, fields, links } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    s.paint([fields[1] as Element]);
    expect(dots(links)).toEqual(["", "Checks, unsaved changes", ""]);
    expect(links[1]?.querySelector(".cp-dot")?.hasAttribute("data-cp-added")).toBe(false);
    await task();
    s.paint([fields[1] as Element, fields[3] as Element]);
    expect(dots(links)).toEqual(["", "Checks, unsaved changes", "Display, unsaved changes"]);
    expect(links[1]?.querySelector(".cp-dot")?.hasAttribute("data-cp-added")).toBe(false);
    expect(links[2]?.querySelector(".cp-dot")?.hasAttribute("data-cp-added")).toBe(true);
    expect(links[2]?.querySelector(".cp-dot")?.getAttribute("aria-hidden")).toBe("true");
    s.paint([]);
    expect(dots(links)).toEqual(["", "", ""]);
    expect(links.map((l) => l.querySelector('[data-part="end"]'))).toEqual([null, null, null]);
  });

  it("keeps an end part the app wrote and drops a dot it wrote when nothing waits", () => {
    const { form, links } = page();
    const first = links[0] as HTMLAnchorElement;
    first.insertAdjacentHTML(
      "beforeend",
      '<span data-part="end"><span class="cp-dot" data-tone="accent" aria-hidden="true"></span><span class="cp-visually-hidden">, unsaved changes</span></span>',
    );
    enhanceSettings(form, { signal: life.signal }).paint([]);
    expect(first.querySelector('[data-part="end"]')?.childNodes.length).toBe(0);
  });

  it("gives every change on a page of one category to its current link", () => {
    document.body.innerHTML =
      '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("General", "/settings/general") +
      row("Feeds", "/settings/feeds", ' aria-current="page"') +
      '</ul></nav><form><input name="a"><input name="b"></form></div>';
    const form = document.querySelector("form") as HTMLFormElement;
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    enhanceSettings(form, { signal: life.signal }).paint([...form.querySelectorAll("input")]);
    expect(dots(links)).toEqual(["", "Feeds, unsaved changes"]);
  });

  it("takes the app's words", () => {
    const { form, bar, fields, links, nav } = page();
    enhanceSettings(form, {
      signal: life.signal,
      words: {
        count: (n) => `${String(n)} à enregistrer`,
        unsaved: ", modifiée",
        marked: (name) => `${name} (modifiée)`,
        category: "Catégorie",
      },
    }).paint([fields[0] as Element]);
    expect(bar.querySelector('[data-part="count"]')?.textContent).toBe("1 à enregistrer");
    expect(links[0]?.querySelector(".cp-visually-hidden")?.textContent).toBe(", modifiée");
    expect(nav.querySelector("label")?.textContent).toBe("Catégorie");
    expect(nav.querySelector("option")?.textContent).toBe("Connections (modifiée)");
  });

  it("makes a labelled category select, its changed options marked in words", () => {
    const { form, fields, nav } = page();
    enhanceSettings(form, { signal: life.signal }).paint([fields[3] as Element]);
    const field = nav.querySelector(":scope > .cp-field");
    const select = nav.querySelector<HTMLSelectElement>(".cp-select > select.cp-input");
    expect(field?.querySelector("label.cp-label")?.textContent).toBe("Category");
    expect(select?.labels[0]?.textContent).toBe("Category");
    expect([...(select?.options ?? [])].map((o) => o.text)).toEqual([
      "Connections",
      "Checks",
      "Display, unsaved changes",
    ]);
    expect(select?.selectedIndex).toBe(0);
  });

  it("presses the chosen category's link, so a router or the guard treats it as the link", () => {
    const { form, nav, links } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.dispatchEvent(new PointerEvent("pointerdown"));
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    expect(pressed).toEqual(["#s-dis"]);
    expect(links[2]?.getAttribute("aria-current")).toBe("location");
    expect(select.selectedIndex).toBe(2);
  });

  it("waits for Enter after a key moves the closed select, and Escape or leaving puts it back", () => {
    const { form, nav } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    const key = (k: string): void => {
      select.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    };
    const move = (k: string, to: number): void => {
      key(k);
      select.selectedIndex = to;
      select.dispatchEvent(new Event("change"));
    };
    move("ArrowDown", 1);
    move("ArrowDown", 2);
    expect(pressed).toEqual([]);
    key("Enter");
    expect(pressed).toEqual(["#s-dis"]);
    move("ArrowUp", 1);
    key("Escape");
    expect([pressed.length, select.selectedIndex]).toEqual([1, 2]);
    move("c", 0);
    select.blur();
    expect([pressed.length, select.selectedIndex]).toEqual([1, 2]);
  });

  it("follows the current link the app moves, and puts back a choice the page refused", async () => {
    document.body.innerHTML =
      '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("General", "/settings/general", ' aria-current="page"') +
      row("Feeds", "/settings/feeds") +
      "</ul></nav><form></form></div>";
    const form = document.querySelector("form") as HTMLFormElement;
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    enhanceSettings(form, { signal: life.signal });
    const nav = document.querySelector("nav") as HTMLElement;
    nav.addEventListener("click", (e) => {
      e.preventDefault();
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event("change"));
    expect(select.selectedIndex).toBe(0);
    links[0]?.removeAttribute("aria-current");
    links[1]?.setAttribute("aria-current", "page");
    await vi.waitFor(() => {
      expect(select.selectedIndex).toBe(1);
    });
  });

  it("marks the section in view as current, and keeps a pressed one until the person scrolls", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    (document.getElementById("s-chk") as HTMLElement).scrollIntoView();
    await vi.waitFor(() => {
      expect(current()).toBe(1);
    });
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
    // Chromium may deliver the module's own observer's entries a task later.
    const checks = document.getElementById("s-chk") as HTMLElement;
    const seen = new Promise<void>((resolve) => {
      const probe = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            probe.disconnect();
            resolve();
          }
        },
        { rootMargin: "-20% 0px -60% 0px" },
      );
      probe.observe(checks);
    });
    links[2]?.click();
    expect(current()).toBe(2);
    await seen;
    await new Promise(requestAnimationFrame);
    await task();
    expect(current()).toBe(2);
    dispatchEvent(new WheelEvent("wheel"));
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("reads the categories again on update and removes what it made when its signal ends", () => {
    const { form, fields, nav, links } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    s.paint([fields[3] as Element]);
    nav.querySelector("ul")?.insertAdjacentHTML("beforeend", row("Alerts", "#s-dis"));
    s.update();
    const select = nav.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual([
      "Connections",
      "Checks",
      "Display, unsaved changes",
      "Alerts",
    ]);
    life.abort();
    expect(nav.querySelector(".cp-field")).toBeNull();
    expect(dots(links)).toEqual(["", "", ""]);
  });

  it("finds a category's section in the form's shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("Connections", "#s-con") +
      row("Checks", "#s-chk") +
      '</ul></nav><form><section id="s-con"><input></section><section id="s-chk"><input></section></form></div>';
    const form = shadow.querySelector("form") as HTMLFormElement;
    const links = [...shadow.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    enhanceSettings(form, { signal: life.signal }).paint([
      shadow.querySelectorAll("input")[1] as Element,
    ]);
    expect(dots(links)).toEqual(["", "Checks, unsaved changes"]);
  });

  it("throws without a settings nav", () => {
    const form = document.createElement("form");
    expect(() => enhanceSettings(form)).toThrow(TypeError);
  });
});
