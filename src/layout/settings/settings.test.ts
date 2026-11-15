import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { guardChanges } from "../../forms/form/form.js";
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
    dispatchEvent(new WheelEvent("wheel"));
    scrollTo(0, 0);
    await vi.waitFor(() => {
      expect(current()).toBe(0);
    });
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
    dispatchEvent(new WheelEvent("wheel"));
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

  it("keeps a pressed category through a key inside the nav in a shadow root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const tall = ' style="min-block-size: 120vh"';
    shadow.innerHTML =
      '<div class="cp-settings"><nav class="cp-settings-nav"><ul class="cp-list">' +
      row("Connections", "#s-con", ' aria-current="location"') +
      row("Checks", "#s-chk") +
      row("Display", "#s-dis") +
      `</ul></nav><form><section id="s-con"${tall}><input></section>` +
      `<section id="s-chk"${tall}><input></section><section id="s-dis"><input></section></form></div>`;
    const form = shadow.querySelector("form") as HTMLFormElement;
    const links = [...shadow.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
    for (const link of links) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
      });
    }
    enhanceSettings(form, { signal: life.signal });
    const current = (): number => links.findIndex((l) => l.hasAttribute("aria-current"));
    const checks = shadow.getElementById("s-chk") as HTMLElement;
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
    links[2]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }),
    );
    checks.scrollIntoView();
    await seen;
    await new Promise(requestAnimationFrame);
    await task();
    expect(current()).toBe(2);
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
    let answer = (): void => undefined;
    const done = save.run(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    type(fields[3] as HTMLInputElement, "dark");
    await vi.waitFor(() => {
      expect(count()).toBe("2 unsaved changes");
    });
    guard.saved({ every: "45" });
    answer();
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
