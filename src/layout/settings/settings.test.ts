import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { enhanceRovingFocus } from "../../core/roving-focus/roving-focus.js";
import { guardChanges } from "../../forms/form/form.js";
import { enhanceSettings } from "./settings.js";

let life = new AbortController();

afterEach(async () => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
  document.documentElement.style.scrollBehavior = "";
  document.documentElement.style.scrollPaddingTop = "";
  document.documentElement.style.zoom = "";
  document.documentElement.style.transform = "";
  document.documentElement.style.transformOrigin = "";
  scrollTo(0, 0);
  // The next case's press must not meet this scroll's late events, and
  // Firefox may still be gliding from a case's smooth scroll.
  for (let y = Number.NaN, quiet = 0; quiet < 2;) {
    await new Promise(requestAnimationFrame);
    quiet = scrollY === y ? quiet + 1 : 0;
    y = scrollY;
  }
});

const task = (): Promise<void> => new Promise((r) => setTimeout(r));

/** Waits until every scroller in `els` has stopped for three frames. */
async function still(...els: Element[]): Promise<void> {
  const at = (): string =>
    (els.length === 0 ? [document.documentElement] : els).map((el) => el.scrollTop).join(" ");
  for (let y = "", quiet = 0; quiet < 3;) {
    await new Promise(requestAnimationFrame);
    quiet = at() === y ? quiet + 1 : 0;
    y = at();
  }
  await task();
}

/** Resolves at the page's second scroll event, a smooth jump under way, or
 *  at its scrollend, when a slow frame let the jump finish in one. */
const glide = (): Promise<void> =>
  new Promise((resolve) => {
    let n = 0;
    addEventListener(
      "scroll",
      () => {
        n += 1;
        if (n === 2) {
          resolve();
        }
      },
      { signal: life.signal },
    );
    addEventListener(
      "scrollend",
      () => {
        resolve();
      },
      { signal: life.signal, once: true },
    );
  });

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
    '<div class="cp-savebar" role="group" aria-label="Unsaved changes" hidden><span data-part="count"></span><button class="cp-button" type="reset">Discard</button><button class="cp-button" data-variant="primary" type="submit">Save changes</button></div>' +
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

/** Whether the select's picker shows, where the engine can say. */
const open = (select: HTMLSelectElement): boolean =>
  CSS.supports("selector(:open)") && select.matches(":open");

const dots = (links: readonly HTMLAnchorElement[]): string[] =>
  links.map((l) => (l.querySelector(".cp-dot") === null ? "" : (l.textContent ?? "")));

/** Resolves once `el` is in the band the module watches; Chromium may
 *  deliver the module's own observer's entries a task later. */
const entered = (el: Element): Promise<void> =>
  new Promise((resolve) => {
    const probe = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          probe.disconnect();
          resolve();
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    probe.observe(el);
  });

/** Presses the last, short category, whose section never reaches the band,
 *  and waits until the one before it has. */
async function holdLast(links: readonly HTMLAnchorElement[]): Promise<void> {
  const seen = entered(document.getElementById("s-chk") as HTMLElement);
  links[2]?.click();
  await seen;
  await new Promise(requestAnimationFrame);
  await task();
}

/** Moves the first section into the band with no scroll, as a layout
 *  change would, and waits for the module's observer to see it. */
async function shiftFirstIntoBand(): Promise<void> {
  const first = document.getElementById("s-con") as HTMLElement;
  const seen = entered(first);
  first.style.translate = `0 ${String(innerHeight * 0.3 - first.getBoundingClientRect().bottom)}px`;
  await seen;
  await new Promise(requestAnimationFrame);
  await task();
}

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

  it("gives the form the save bar's height, and takes it back when its signal ends", async () => {
    const { form, bar, fields } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    s.paint([fields[0] as Element]);
    bar.style.blockSize = "90px";
    await vi.waitFor(() => {
      expect(form.style.getPropertyValue("--cp-savebar-size")).toBe("90px");
    });
    life.abort();
    expect(form.style.getPropertyValue("--cp-savebar-size")).toBe("");
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

  it("waits for Enter after a key moves the closed select, and Escape or leaving puts it back", async () => {
    const { form, nav } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect([pressed, select.selectedIndex]).toEqual([[], 2]);
    await userEvent.keyboard("{Enter}");
    await task();
    expect(pressed).toEqual(["#s-dis"]);
    expect(open(select)).toBe(false);
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{Escape}");
    expect([pressed.length, select.selectedIndex]).toEqual([1, 2]);
    await userEvent.keyboard("c");
    expect(select.selectedIndex).toBe(0);
    select.blur();
    expect([pressed.length, select.selectedIndex]).toEqual([1, 2]);
  });

  it("waits for Enter after a letter whose keypress comes a task after its keydown", async () => {
    const { form, nav } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    await new Promise(requestAnimationFrame);
    await task();
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    await task();
    select.dispatchEvent(new KeyboardEvent("keypress", { key: "d", bubbles: true }));
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    await task();
    expect(pressed).toEqual([]);
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(pressed).toEqual(["#s-dis"]);
  });

  it("keeps a key choice waiting for Enter through a repaint", () => {
    const { form, nav, fields } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    s.paint([fields[0] as Element]);
    expect([select.selectedIndex, select.options[0]?.text]).toEqual([
      2,
      "Connections, unsaved changes",
    ]);
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(pressed).toEqual(["#s-dis"]);
  });

  it("keeps a key choice waiting for Enter while the current category moves", async () => {
    const { form, nav, links } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    links[0]?.removeAttribute("aria-current");
    links[1]?.setAttribute("aria-current", "location");
    await task();
    expect(select.selectedIndex).toBe(2);
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(pressed).toEqual(["#s-dis"]);
  });

  it("keeps a key choice on its category when update adds one before it", () => {
    const { form, nav } = page();
    const s = enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    nav.querySelector("ul")?.insertAdjacentHTML("afterbegin", row("Alerts", "#s-alerts"));
    s.update();
    expect(select.options[select.selectedIndex]?.text).toBe("Display");
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(pressed).toEqual(["#s-dis"]);
  });

  it.runIf(server.browser === "chromium")(
    "waits for Enter after a letter Chromium sends as a key and then its character",
    async () => {
      const { form, nav } = page();
      enhanceSettings(form, { signal: life.signal });
      const pressed: string[] = [];
      nav.addEventListener("click", (e) => {
        e.preventDefault();
        pressed.push((e.target as HTMLAnchorElement).hash);
      });
      const select = nav.querySelector("select") as HTMLSelectElement;
      select.focus();
      for (let i = 0; i < 5; i++) {
        select.selectedIndex = 0;
        await cdp().send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "d",
          code: "KeyD",
          windowsVirtualKeyCode: 68,
        });
        await task();
        await cdp().send("Input.dispatchKeyEvent", { type: "char", key: "d", text: "d" });
        await task();
        expect([pressed, select.selectedIndex]).toEqual([[], 2]);
        await cdp().send("Input.dispatchKeyEvent", { type: "keyUp", key: "d", code: "KeyD" });
        select.blur();
        select.focus();
      }
    },
  );

  it("moves at once on a change a task after the key, as a picker the arrows opened commits", async () => {
    const { form, nav } = page();
    enhanceSettings(form, { signal: life.signal });
    const pressed: string[] = [];
    nav.addEventListener("click", (e) => {
      e.preventDefault();
      pressed.push((e.target as HTMLAnchorElement).hash);
    });
    const select = nav.querySelector("select") as HTMLSelectElement;
    select.focus();
    select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await task();
    select.selectedIndex = 1;
    select.dispatchEvent(new Event("change"));
    expect(pressed).toEqual(["#s-chk"]);
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
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("ends a pressed category's hold on a page scroll that no wheel, touch or key made", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    expect(current()).toBe(2);
    scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("keeps a pressed category through its own gliding jump, and ends the hold on a later scroll", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    document.documentElement.style.scrollBehavior = "smooth";
    try {
      const landed = new Promise((r) => {
        addEventListener("scrollend", r, { once: true });
      });
      links[2]?.click();
      await landed;
      await new Promise(requestAnimationFrame);
      await task();
      expect([current(), scrollY > 0]).toEqual([2, true]);
    } finally {
      document.documentElement.style.scrollBehavior = "";
    }
    // Firefox may still glide a scroll made just after the style changes.
    scrollTo({ top: 0, behavior: "instant" });
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("ends the hold of a press at the page's end, which scrolls nothing, on the next scroll", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    const before = scrollY;
    links[2]?.click();
    await new Promise(requestAnimationFrame);
    await task();
    expect([current(), scrollY]).toEqual([2, before]);
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("ends the hold of a press that scrolled nothing on the person's scroll toward its section", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    const before = scrollY;
    links[2]?.click();
    await new Promise(requestAnimationFrame);
    await task();
    expect([current(), scrollY]).toEqual([2, before]);
    const display = document.getElementById("s-dis") as HTMLElement;
    display.insertAdjacentHTML("afterend", '<div style="block-size: 200vh"></div>');
    dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    scrollBy(0, 100);
    await new Promise(requestAnimationFrame);
    await task();
    await shiftFirstIntoBand();
    expect(current()).toBe(0);
  });

  it("keeps a pressed category through a widget's key and a box's own scroll, which leave the page still", async () => {
    const { form, links } = page(true);
    const section = document.getElementById("s-dis") as HTMLElement;
    section.insertAdjacentHTML(
      "beforeend",
      '<div class="cp-cluster"><button type="button">PGS</button><button type="button">VobSub</button></div>' +
        '<textarea rows="2">1\n2\n3\n4\n5\n6\n7\n8</textarea>',
    );
    const group = section.querySelector(".cp-cluster") as HTMLElement;
    enhanceRovingFocus(group, { signal: life.signal });
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    const buttons = [...group.querySelectorAll("button")];
    buttons[1]?.focus();
    const home = new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true });
    buttons[1]?.dispatchEvent(home);
    expect([home.defaultPrevented, document.activeElement]).toEqual([true, buttons[0]]);
    const notes = section.querySelector("textarea") as HTMLTextAreaElement;
    const boxScrolled = new Promise((r) => {
      notes.addEventListener("scroll", r, { once: true });
    });
    notes.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    notes.scrollTop = 40;
    await boxScrolled;
    await shiftFirstIntoBand();
    expect(current()).toBe(2);
  });

  it("keeps a pressed category through keys a field takes, which scroll nothing", async () => {
    const { form, fields, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    const theme = fields[3] as HTMLInputElement;
    for (const key of ["a", "ArrowDown", "Home", " "]) {
      theme.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    await shiftFirstIntoBand();
    expect(current()).toBe(2);
  });

  it("keeps a pressed category through an input during its own gliding jump", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    document.documentElement.style.scrollBehavior = "smooth";
    try {
      const landed = new Promise((r) => {
        addEventListener("scrollend", r, { once: true });
      });
      const moving = new Promise((r) => {
        addEventListener("scroll", r, { once: true });
      });
      links[2]?.click();
      await moving;
      await new Promise(requestAnimationFrame);
      dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      dispatchEvent(new PointerEvent("pointerdown"));
      await landed;
      await new Promise(requestAnimationFrame);
      await task();
      expect([current(), scrollY > 0]).toEqual([2, true]);
    } finally {
      document.documentElement.style.scrollBehavior = "";
    }
    // Firefox may still glide a scroll made just after the style changes.
    scrollTo({ top: 0, behavior: "instant" });
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("keeps a pressed category through a box's scrollend during its own gliding jump", async () => {
    const { form, links } = page(true);
    const box = document.createElement("textarea");
    box.rows = 2;
    box.value = "1\n2\n3\n4\n5\n6\n7\n8";
    document.getElementById("s-dis")?.append(box);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    document.documentElement.style.scrollBehavior = "smooth";
    try {
      const landed = new Promise((r) => {
        document.addEventListener("scrollend", r, { once: true });
      });
      const boxDone = new Promise((r) => {
        box.addEventListener("scrollend", r, { once: true });
      });
      const moving = new Promise((r) => {
        addEventListener("scroll", r, { once: true });
      });
      links[2]?.click();
      await moving;
      box.scrollTop = 40;
      await boxDone;
      await landed;
      await new Promise(requestAnimationFrame);
      await task();
      expect([current(), scrollY > 0, box.scrollTop > 0]).toEqual([2, true, true]);
    } finally {
      document.documentElement.style.scrollBehavior = "";
    }
    // Firefox may still glide a scroll made just after the style changes.
    scrollTo({ top: 0, behavior: "instant" });
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it.each([0, 100])(
    "keeps a pressed short category through its upward jump in a box %ipx below the window's top",
    async (offset) => {
      const host = document.createElement("div");
      host.style.cssText = "position: fixed; inset: 0";
      host.innerHTML =
        `<header style="block-size: ${String(offset)}px"></header>` +
        `<div class="cp-settings" style="block-size: calc(100vh - ${String(offset)}px); overflow-y: auto">` +
        '<nav class="cp-settings-nav"><ul class="cp-list">' +
        row("Connections", "#b-con") +
        row("Checks", "#b-chk") +
        row("Display", "#b-dis") +
        '</ul></nav><form><section id="b-con" style="block-size: 120vh"><input></section>' +
        '<section id="b-chk" style="block-size: 40px"><input></section>' +
        '<section id="b-dis" style="block-size: 120vh"><input></section></form></div>';
      document.body.append(host);
      const box = host.querySelector(".cp-settings") as HTMLElement;
      const links = [...host.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
      enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
      box.scrollTop = box.scrollHeight;
      await still(box);
      links[1]?.click();
      await still(box);
      const checks = document.getElementById("b-chk") as HTMLElement;
      const current = links.findIndex((l) => l.hasAttribute("aria-current"));
      expect([current, Math.round(checks.getBoundingClientRect().top)]).toEqual([1, offset]);
    },
  );

  /** Connections and Display, 120vh each, around a 40px Checks, the
   *  section the cases press; `wrap` gives the box that holds them. */
  const short = (wrap: string, after = ""): { box: HTMLElement; links: HTMLAnchorElement[] } => {
    const host = document.createElement("div");
    host.innerHTML =
      wrap.replace(
        "></div>",
        '><nav class="cp-settings-nav"><ul class="cp-list">' +
          row("Connections", "#b-con") +
          row("Checks", "#b-chk") +
          row("Display", "#b-dis") +
          '</ul></nav><form><section id="b-con" style="block-size: 120vh"><input></section>' +
          '<section id="b-chk" style="block-size: 40px"><input></section>' +
          '<section id="b-dis" style="block-size: 120vh"><input></section></form></div>',
      ) + after;
    document.body.append(host);
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
    return { box: host.querySelector(".cp-settings") as HTMLElement, links };
  };
  /** Presses Checks and waits until its section rests `want` px below the
   *  window's top; resolves to the current link's index. */
  const pressChecks = async (
    links: readonly HTMLAnchorElement[],
    want: number,
    ...scrollers: Element[]
  ): Promise<number> => {
    const checks = document.getElementById("b-chk") as HTMLElement;
    links[1]?.click();
    // A glide under load outlasts any fixed poll, so this waits for the jump
    // to bring Checks within 1px, bounded only by the test's timeout.
    while (Math.abs(checks.getBoundingClientRect().top - want) > 1) {
      await new Promise(requestAnimationFrame);
    }
    await still(document.documentElement, ...scrollers);
    return links.findIndex((l) => l.hasAttribute("aria-current"));
  };

  it("keeps a pressed short category in a box whose border and scroll-padding sit under a header", async () => {
    const { box, links } = short(
      '<div style="position: fixed; inset: 0"><header style="block-size: 100px"></header>' +
        '<div class="cp-settings" style="block-size: calc(100vh - 100px); overflow-y: auto; border-top: 10px solid; scroll-padding-top: 50px"></div></div>',
    );
    box.scrollTop = box.scrollHeight;
    await still(box);
    expect(await pressChecks(links, 160, box)).toBe(1);
  });

  it.each([
    ["10%", "up"],
    ["10%", "down"],
    ["calc(10% + 8px)", "down"],
  ])(
    "keeps a pressed short category through a jump under the root's scroll-padding-top %s, %sward",
    async (padding, dir) => {
      document.documentElement.style.scrollPaddingTop = padding;
      const { links } = short('<div class="cp-settings"></div>');
      if (dir === "up") {
        scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      }
      await still();
      const port = document.documentElement.clientHeight;
      const want = padding === "10%" ? port * 0.1 : port * 0.1 + 8;
      expect(await pressChecks(links, want)).toBe(1);
    },
  );

  it("keeps a pressed short category through a jump in a box whose scroll-padding-top is 10%", async () => {
    const { box, links } = short(
      '<div style="position: fixed; inset: 0"><div class="cp-settings" style="block-size: 100vh; overflow-y: auto; scroll-padding-top: 10%"></div></div>',
    );
    box.scrollTop = box.scrollHeight;
    await still(box);
    expect(await pressChecks(links, box.clientHeight * 0.1, box)).toBe(1);
  });

  it.each([
    ["no", "up"],
    ["no", "down"],
    ["the root's", "up"],
    ["the root's", "down"],
    ["the root's and the box's", "up"],
    ["the root's and the box's", "down"],
  ])(
    "keeps a pressed short category through a jump that scrolls its box and the page, with %s smooth scrolling, %sward",
    async (smooth, dir) => {
      const { box, links } = short(
        '<header style="block-size: 60vh"></header><div class="cp-settings" style="block-size: 80vh; overflow-y: auto"></div>',
        '<footer style="block-size: 150vh"></footer>',
      );
      if (dir === "up") {
        box.scrollTo({ top: box.scrollHeight, behavior: "instant" });
      }
      await still(box);
      if (smooth !== "no") {
        document.documentElement.style.scrollBehavior = "smooth";
      }
      if (smooth === "the root's and the box's") {
        box.style.scrollBehavior = "smooth";
      }
      // Each scroller brings Checks to its own top: the box's, then the window's.
      expect(await pressChecks(links, 0, box)).toBe(1);
    },
  );

  it.each(["its own tree", "a shadow root it is slotted into"])(
    "keeps a pressed short category in a box in %s, and ends the hold when the box scrolls back",
    async (where) => {
      const host = document.createElement("div");
      document.body.append(host);
      const inner =
        '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
        row("Connections", "#b-con") +
        row("Checks", "#b-chk") +
        row("Display", "#b-dis") +
        '</ul></nav><form><section id="b-con" style="block-size: 120vh"><input></section>' +
        '<section id="b-chk" style="block-size: 40px"><input></section>' +
        '<section id="b-dis" style="block-size: 120vh"><input></section></form></div>';
      const scrolling = 'style="block-size: 80vh; overflow-y: auto"';
      if (where === "its own tree") {
        host.innerHTML = `<div id="b-box" ${scrolling}>${inner}</div>`;
      } else {
        host.innerHTML = `<settings-test-pane>${inner}</settings-test-pane>`;
        const pane = host.querySelector("settings-test-pane") as HTMLElement;
        pane.attachShadow({ mode: "open" }).innerHTML =
          `<div id="b-box" ${scrolling}><slot></slot></div>`;
      }
      const box = (host.querySelector("#b-box") ??
        host
          .querySelector("settings-test-pane")
          ?.shadowRoot?.getElementById("b-box")) as HTMLElement;
      const links = [...host.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
      enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
      await still(box);
      const pressed = await pressChecks(links, box.getBoundingClientRect().top, box);
      box.scrollTo({ top: 0, behavior: "instant" });
      await still(box);
      await task();
      const current = links.findIndex((l) => l.hasAttribute("aria-current"));
      expect([pressed, current]).toEqual([1, 0]);
    },
  );

  it("keeps a short category pressed during another press's smooth glide the other way", async () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("Connections", "#b-con") +
      row("Checks", "#b-chk") +
      row("Display", "#b-dis") +
      row("More", "#b-more") +
      '</ul></nav><form><section id="b-con" style="block-size: 120vh"><input></section>' +
      '<section id="b-chk" style="block-size: 40px"><input></section>' +
      '<section id="b-dis" style="block-size: 120vh"><input></section>' +
      '<section id="b-more" style="block-size: 300vh"><input></section></form></div>';
    document.body.append(host);
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
    await still();
    const checks = document.getElementById("b-chk") as HTMLElement;
    const dest = checks.getBoundingClientRect().top + scrollY;
    document.documentElement.style.scrollBehavior = "smooth";
    links[3]?.click();
    // Firefox's last frame toward More then lands beyond Checks' place.
    for (let i = 0; i < 300 && scrollY < dest + 150; i++) {
      await new Promise(requestAnimationFrame);
    }
    expect(await pressChecks(links, 0)).toBe(1);
  });

  it.each([
    ["zoom: 1.5", "down", 1.5, 16],
    ["zoom: 1.5", "up", 1.5, 16],
    ["zoom: 0.8", "down", 0.8, 16],
    ["zoom: 0.8", "up", 0.8, 16],
    // WebKit divides the section's scroll-margin by a transform's scale (16px
    // lands at 12.8), so this case leaves the margin out.
    ["transform: scale(1.25)", "down", 1.25, 0],
    ["transform: scale(1.25)", "up", 1.25, 0],
  ])(
    "keeps a pressed short category in a scrolling box under %s, %sward",
    async (rule, dir, scale, margin) => {
      const { box, links } = short(
        '<div style="position: fixed; inset: 0"><div class="cp-settings" style="block-size: 400px; overflow-y: auto; ' +
          `border-top: 10px solid; scroll-padding-top: 24px; ${rule}"></div></div>`,
      );
      (document.getElementById("b-chk") as HTMLElement).style.scrollMarginTop =
        `${String(margin)}px`;
      if (dir === "up") {
        box.scrollTo({ top: box.scrollHeight, behavior: "instant" });
      }
      await still(box);
      // The border, the box's padding and the section's margin, all scaled.
      const want = box.getBoundingClientRect().top + (10 + 24 + margin) * scale;
      expect(await pressChecks(links, want, box)).toBe(1);
    },
  );

  it.each([
    ["48px", 1.5, 0, "down"],
    ["48px", 1.5, 0, "up"],
    ["48px", 0.8, 16, "down"],
    ["48px", 0.8, 16, "up"],
    ["calc(10% + 8px)", 1.5, 8, "down"],
    ["calc(10% + 8px)", 1.5, 8, "up"],
  ])(
    "keeps a pressed short category through a jump under the root's scroll-padding-top %s and zoom %s, its margin %spx, %sward",
    async (padding, zoom, margin, dir) => {
      const root = document.documentElement;
      // The scrollport in screen pixels, which a zoom on the root leaves as it is.
      const port = root.clientHeight;
      root.style.zoom = String(zoom);
      root.style.scrollPaddingTop = padding;
      const { links } = short('<div class="cp-settings"></div>');
      const checks = document.getElementById("b-chk") as HTMLElement;
      // Short enough to rest above the band, so only the hold marks it.
      checks.style.blockSize = "20px";
      checks.style.scrollMarginTop = `${String(margin)}px`;
      if (dir === "up") {
        scrollTo({ top: root.scrollHeight, behavior: "instant" });
      }
      await still();
      // The root's lengths scale by its zoom; 10% of the scrollport does not.
      const want = padding === "48px" ? (48 + margin) * zoom : port * 0.1 + (8 + margin) * zoom;
      expect(await pressChecks(links, want)).toBe(1);
    },
  );

  it.each(["down", "up"])(
    "keeps a pressed short category through a jump under the root's scroll-padding-top 48px and transform: scale(1.25), %sward",
    async (dir) => {
      const root = document.documentElement;
      root.style.transform = "scale(1.25)";
      root.style.transformOrigin = "0 0";
      root.style.scrollPaddingTop = "48px";
      const { links } = short('<div class="cp-settings"></div>');
      (document.getElementById("b-chk") as HTMLElement).style.blockSize = "20px";
      if (dir === "up") {
        scrollTo({ top: root.scrollHeight, behavior: "instant" });
      }
      await still();
      // A transform, unlike a zoom, leaves the root's scroll-padding as written.
      expect(await pressChecks(links, 48)).toBe(1);
    },
  );

  it("ends the hold when the person's scroll cuts the press's smooth jump short", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    document.documentElement.style.scrollBehavior = "smooth";
    try {
      const gliding = glide();
      links[2]?.click();
      await gliding;
      // The person's own scroll stops the glide, as a wheel or a drag does.
      dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
      scrollTo({ top: Math.round(scrollY / 3), behavior: "instant" });
      await still();
    } finally {
      document.documentElement.style.scrollBehavior = "";
    }
    // Connections is 120vh tall, so it fills the band at any scroll under 80vh.
    expect([scrollY < innerHeight * 0.8, current()]).toEqual([true, 0]);
  });

  it("ends the hold when the person scrolls a smooth jump down back to the top", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    document.documentElement.style.scrollBehavior = "smooth";
    try {
      const gliding = glide();
      links[2]?.click();
      await gliding;
      dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
      scrollTo({ top: 0, behavior: "instant" });
      await still();
    } finally {
      document.documentElement.style.scrollBehavior = "";
    }
    expect([scrollY, current()]).toEqual([0, 0]);
  });

  it("carries a pressed category's hold to its new link when update replaces the links", async () => {
    const { form, nav, links } = page(true);
    const s = enhanceSettings(form, { signal: life.signal });
    await holdLast(links);
    // At the page's end this press scrolls nothing, so it is held at once.
    links[2]?.click();
    await new Promise(requestAnimationFrame);
    await task();
    const ul = nav.querySelector("ul") as HTMLElement;
    ul.innerHTML =
      row("Connections", "#s-con") + row("Checks", "#s-chk") + row("Display", "#s-dis");
    s.update();
    const fresh = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    const current = (): number => fresh.findIndex((l) => l.hasAttribute("aria-current"));
    expect(current()).toBe(2);
    dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("carries the hold through an app that renders its categories again on hashchange", async () => {
    const { form, nav } = page(true);
    const s = enhanceSettings(form, { signal: life.signal });
    const ul = nav.querySelector("ul") as HTMLElement;
    addEventListener(
      "hashchange",
      () => {
        ul.innerHTML =
          row("Connections", "#s-con") + row("Checks", "#s-chk") + row("Display", "#s-dis");
        s.update();
      },
      { signal: life.signal },
    );
    history.replaceState(null, "", location.pathname + location.search);
    const seen = entered(document.getElementById("s-chk") as HTMLElement);
    nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")[2]?.click();
    await seen;
    await new Promise(requestAnimationFrame);
    await task();
    const fresh = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    const current = (): number => fresh.findIndex((l) => l.hasAttribute("aria-current"));
    expect(current()).toBe(2);
    dispatchEvent(new PointerEvent("pointerdown"));
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("keeps a pressed category through its own jump when update shortens the page under it", async () => {
    const { form, nav, links } = page(true);
    const s = enhanceSettings(form, { signal: life.signal });
    // Display's jump ends at the page's end. Before its scroll event, the
    // app drops a row above the form, so the page ends higher than planned.
    links[2]?.click();
    const ul = nav.querySelector("ul") as HTMLElement;
    ul.innerHTML = row("Checks", "#s-chk") + row("Display", "#s-dis");
    s.update();
    await still();
    const fresh = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    expect(fresh.map((l) => l.getAttribute("aria-current"))).toEqual([null, "location"]);
  });

  it("keeps a pressed category through its own jump when update lengthens the page above it", async () => {
    const { form, nav, links } = page(true);
    const s = enhanceSettings(form, { signal: life.signal });
    // Display's jump ends at the page's end. Before its scroll event, the
    // app adds a row above the form, so the section ends lower than planned.
    links[2]?.click();
    const ul = nav.querySelector("ul") as HTMLElement;
    ul.innerHTML =
      row("Connections", "#s-con") +
      row("Account", "#s-acc") +
      row("Checks", "#s-chk") +
      row("Display", "#s-dis");
    s.update();
    await still();
    const fresh = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    expect(fresh.map((l) => l.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      "location",
    ]);
  });

  it("ends the hold when update removes the pressed category, and marks the section in view", async () => {
    const { form, nav, links } = page(true);
    const s = enhanceSettings(form, { signal: life.signal });
    await holdLast(links);
    const ul = nav.querySelector("ul") as HTMLElement;
    ul.innerHTML = row("Connections", "#s-con") + row("Checks", "#s-chk");
    s.update();
    const fresh = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    await vi.waitFor(() => {
      expect(fresh.map((l) => l.getAttribute("aria-current"))).toEqual([null, "location"]);
    });
  });

  it("marks the section in view as soon as a small scroll ends the hold", async () => {
    const { form, links } = page(true);
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    await holdLast(links);
    expect(current()).toBe(2);
    const moved = new Promise((r) => {
      addEventListener("scroll", r, { once: true });
    });
    dispatchEvent(new WheelEvent("wheel", { deltaY: -30 }));
    scrollBy(0, -30);
    await moved;
    await task();
    // Checks still fills the band, so no section crosses its edge.
    expect(current()).toBe(1);
  });

  it("leaves the current category to a router that marks it page, one section shown at a time", async () => {
    const { form, links } = page(true);
    links[0]?.setAttribute("aria-current", "page");
    for (const link of links) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        for (const other of links) {
          const section = document.getElementById(other.hash.slice(1)) as HTMLElement;
          section.hidden = other !== link;
          if (other === link) {
            other.setAttribute("aria-current", "page");
          } else {
            other.removeAttribute("aria-current");
          }
        }
      });
    }
    enhanceSettings(form, { signal: life.signal });
    const currents = (): (string | null)[] => links.map((l) => l.getAttribute("aria-current"));
    links[1]?.click();
    expect(currents()).toEqual([null, "page", null]);
    scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    await task();
    expect(currents()).toEqual([null, "page", null]);
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

  it("follows a scroller in the form's shadow root: the press's own jump keeps the hold, a later scroll ends it", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const tall = ' style="min-block-size: 120vh"';
    shadow.innerHTML =
      '<div class="cp-settings" style="block-size: 80vh; overflow-y: auto"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("Connections", "#s-con", ' aria-current="location"') +
      row("Checks", "#s-chk") +
      row("Display", "#s-dis") +
      `</ul></nav><form><section id="s-con"${tall}><input></section>` +
      `<section id="s-chk"${tall}><input></section><section id="s-dis"><input></section></form></div>`;
    const scroller = shadow.querySelector(".cp-settings") as HTMLElement;
    const form = shadow.querySelector("form") as HTMLFormElement;
    const links = [...shadow.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    for (const link of links) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        shadow.getElementById(link.hash.slice(1))?.scrollIntoView();
      });
    }
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    const seen = entered(shadow.getElementById("s-chk") as HTMLElement);
    links[2]?.click();
    await seen;
    await new Promise(requestAnimationFrame);
    await task();
    expect([current(), scroller.scrollTop > 0]).toEqual([2, true]);
    scroller.scrollTop = 0;
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
  });

  it("finds a section whose fragment does not percent-decode whole, as the browser does", () => {
    const { form, nav, fields } = page();
    nav
      .querySelector("ul")
      ?.insertAdjacentHTML("beforeend", row("Offers", "#50%-off") + row("Sale", "#50% off"));
    form.insertAdjacentHTML(
      "beforeend",
      '<section id="50%-off"><input name="rate"></section><section id="50% off"><input name="sale"></section>',
    );
    const s = enhanceSettings(form, { signal: life.signal });
    const links = [...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    expect(links[4]?.hash).toBe("#50%%20off");
    s.paint([
      form.querySelector('[name="rate"]') as Element,
      form.querySelector('[name="sale"]') as Element,
      fields[1] as Element,
    ]);
    expect(dots(links)).toEqual([
      "",
      "Checks, unsaved changes",
      "",
      "Offers, unsaved changes",
      "Sale, unsaved changes",
    ]);
  });

  it("keeps the current category through a modified or non-primary press, which opens the link elsewhere", () => {
    const { form, links } = page();
    enhanceSettings(form, { signal: life.signal });
    const target = links[2] as HTMLAnchorElement;
    target.addEventListener("click", (e) => {
      e.preventDefault();
    });
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
    }
    expect(links.map((l) => l.getAttribute("aria-current"))).toEqual(["location", null, null]);
    target.click();
    expect(links.map((l) => l.getAttribute("aria-current"))).toEqual([null, null, "location"]);
  });

  it("throws without a settings nav", () => {
    const form = document.createElement("form");
    expect(() => enhanceSettings(form)).toThrow(TypeError);
  });
});

describe("enhanceSettings on the unsaved-changes guard", () => {
  const type = (field: HTMLInputElement, value: string): void => {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const options = (nav: HTMLElement): string[] =>
    [...(nav.querySelector("select") as HTMLSelectElement).options].map((o) => o.text);

  function guarded(): ReturnType<typeof page> & {
    guard: ReturnType<typeof guardChanges>;
    count: () => string | null | undefined;
  } {
    const p = page();
    const settings = enhanceSettings(p.form, { signal: life.signal });
    const guard = guardChanges(p.form, { onChange: settings.paint, signal: life.signal });
    settings.paint(guard.changes());
    return { ...p, guard, count: () => p.bar.querySelector('[data-part="count"]')?.textContent };
  }

  it("paints what the guard reports as the person types, and Discard clears it", async () => {
    const { bar, nav, fields, links, count } = guarded();
    expect(bar.hidden).toBe(true);
    type(fields[1] as HTMLInputElement, "45");
    type(fields[3] as HTMLInputElement, "dark");
    await vi.waitFor(() => {
      expect([bar.hidden, count()]).toEqual([false, "2 unsaved changes"]);
    });
    expect(dots(links)).toEqual(["", "Checks, unsaved changes", "Display, unsaved changes"]);
    expect(options(nav)).toEqual([
      "Connections",
      "Checks, unsaved changes",
      "Display, unsaved changes",
    ]);
    (bar.querySelector('[type="reset"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(bar.hidden).toBe(true);
    });
    expect(dots(links)).toEqual(["", "", ""]);
    expect(options(nav)).toEqual(["Connections", "Checks", "Display"]);
  });

  it("keeps the bar through Save changes' cycle, then shows only what was typed during the save", async () => {
    const { form, bar, fields, links, guard, count } = guarded();
    const button = bar.querySelector('[type="submit"]') as HTMLButtonElement;
    button.innerHTML = '<span class="cp-roll">Save changes</span>';
    const rested = vi.fn();
    const save = enhanceConfirm(button, {
      busy: "Saving…",
      done: "Saved",
      busyDelay: 0,
      hold: 50,
      onRest: rested,
      signal: life.signal,
    });
    type(fields[1] as HTMLInputElement, "45");
    await vi.waitFor(() => {
      expect(count()).toBe("1 unsaved change");
    });
    const { promise, resolve: answer } = Promise.withResolvers<undefined>();
    const done = save.run(() => promise);
    type(fields[3] as HTMLInputElement, "dark");
    await vi.waitFor(() => {
      expect(count()).toBe("2 unsaved changes");
    });
    guard.saved({ every: "45" });
    answer(undefined);
    await done;
    expect([bar.hidden, button.getAttribute("data-cp-state")]).toEqual([false, "done"]);
    expect(dots(links)).toEqual(["", "", "Display, unsaved changes"]);
    await vi.waitFor(() => {
      expect(rested).toHaveBeenCalled();
    });
    expect([bar.hidden, count()]).toEqual([false, "1 unsaved change"]);
    expect(form.querySelector<HTMLInputElement>('[name="every"]')?.defaultValue).toBe("45");
    guard.saved();
    await vi.waitFor(() => {
      expect(bar.hidden).toBe(true);
    });
    expect(dots(links)).toEqual(["", "", ""]);
  });

  it("paints again when the latest values come in, keeping the person's change", async () => {
    const { bar, fields, links, guard, count } = guarded();
    type(fields[1] as HTMLInputElement, "45");
    await vi.waitFor(() => {
      expect(count()).toBe("1 unsaved change");
    });
    expect(guard.rebase({ url: "http://sonarr:8989", every: "60", theme: "light" })).toBe(1);
    expect([bar.hidden, count()]).toEqual([false, "1 unsaved change"]);
    expect(dots(links)).toEqual(["", "Checks, unsaved changes", ""]);
    expect((fields[0] as HTMLInputElement).value).toBe("http://sonarr:8989");
    guard.discard();
    await vi.waitFor(() => {
      expect(bar.hidden).toBe(true);
    });
    expect((fields[1] as HTMLInputElement).value).toBe("60");
  });
});
