import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceContextMenu, enhanceMenu } from "./menu.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
    p.hidePopover();
  }
  document.body.replaceChildren();
});

function item(word: string, role = "menuitem"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("role", role);
  b.textContent = word;
  return b;
}

function menu(
  words = ["Edit", "Export", "Archive", "Delete"],
  popover = "auto",
): {
  button: HTMLButtonElement;
  panel: HTMLElement;
  items: HTMLButtonElement[];
} {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Actions";
  button.setAttribute("popovertarget", "actions");
  const panel = document.createElement("div");
  panel.id = "actions";
  panel.popover = popover;
  panel.setAttribute("role", "menu");
  panel.className = "cp-popover cp-menu";
  const items = words.map((w) => item(w));
  panel.append(...items);
  document.body.append(button, panel);
  return { button, panel, items };
}

const open = (p: HTMLElement) => p.matches(":popover-open");

describe("enhanceMenu", () => {
  it("ties the button to its menu and says whether it is open", async () => {
    const { button, panel } = menu();
    enhanceMenu(panel, { signal: life.signal });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-controls")).toBe("actions");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(button);
    expect(open(panel)).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens with focus on the first item, and returns focus to the button on Escape", async () => {
    const { button, panel, items } = menu();
    enhanceMenu(panel, { signal: life.signal });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{Escape}");
    expect(open(panel)).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("opens on ArrowDown at the first item and on ArrowUp at the last", async () => {
    const { button, panel, items } = menu();
    enhanceMenu(panel, { signal: life.signal });
    button.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(open(panel)).toBe(true);
    expect(document.activeElement).toBe(items.at(-1));
    panel.hidePopover();
    button.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("moves between items with the arrows, wrapping, and with Home and End", async () => {
    const { button, panel, items } = menu();
    enhanceMenu(panel, { signal: life.signal });
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items[3]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(items[3]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("jumps by typed letters, and steps through the items one letter starts", async () => {
    const { button, panel, items } = menu(["Edit", "Export", "Archive", "Delete", "Erase"]);
    enhanceMenu(panel, { signal: life.signal });
    await userEvent.click(button);
    await userEvent.keyboard("e");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("e");
    expect(document.activeElement).toBe(items[4]);
    // A pause longer than the typeahead window starts a new search.
    await new Promise((r) => setTimeout(r, 550));
    items[0]?.focus();
    await userEvent.keyboard("er");
    expect(document.activeElement).toBe(items[4]);
  });

  it("chooses an item: closes, gives focus back and tells the host", async () => {
    const chosen: string[] = [];
    const { button, panel, items } = menu();
    enhanceMenu(panel, {
      signal: life.signal,
      onSelect: (i) => chosen.push(i.textContent),
    });
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(chosen).toEqual(["Export"]);
    expect(open(panel)).toBe(false);
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    await userEvent.click(items[2] as HTMLElement);
    expect(chosen).toEqual(["Export", "Archive"]);
  });

  it("lets a disabled item take focus but never run", async () => {
    const chosen: string[] = [];
    const { button, panel, items } = menu();
    (items[1] as HTMLElement).setAttribute("aria-disabled", "true");
    enhanceMenu(panel, {
      signal: life.signal,
      onSelect: (i) => chosen.push(i.textContent),
    });
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{Enter}");
    expect(chosen).toEqual([]);
    expect(open(panel)).toBe(true);
  });

  it("keeps the menu open for check and radio items, checks one radio of a group, and reports each choice", async () => {
    const { button, panel } = menu([]);
    const check = item("Show posters", "menuitemcheckbox");
    check.setAttribute("aria-checked", "false");
    const group = document.createElement("div");
    group.setAttribute("role", "group");
    const [byName, byDate] = [item("By name", "menuitemradio"), item("By date", "menuitemradio")];
    byName.setAttribute("aria-checked", "true");
    byDate.setAttribute("aria-checked", "false");
    group.append(byName, byDate);
    panel.append(check, group);
    const chosen: string[] = [];
    enhanceMenu(panel, {
      signal: life.signal,
      onSelect: (i) => chosen.push(`${i.textContent} ${String(i.getAttribute("aria-checked"))}`),
    });
    await userEvent.click(button);
    await userEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(byDate);
    expect([byName.getAttribute("aria-checked"), byDate.getAttribute("aria-checked")]).toEqual([
      "false",
      "true",
    ]);
    expect(open(panel)).toBe(true);
    expect(chosen).toEqual(["Show posters true", "By date true"]);
  });

  it("closes on a press outside", async () => {
    const { button, panel } = menu();
    enhanceMenu(panel, { signal: life.signal });
    await userEvent.click(button);
    await userEvent.click(document.body, { position: { x: 600, y: 600 } });
    expect(open(panel)).toBe(false);
  });

  it("serves every opener that names it, a row added later included, and sits by the one pressed", async () => {
    const { button, panel } = menu();
    enhanceMenu(panel, { signal: life.signal });
    const later = document.createElement("button");
    later.type = "button";
    later.textContent = "Row actions";
    later.setAttribute("popovertarget", "actions");
    document.body.prepend(later);
    await userEvent.click(later);
    expect(open(panel)).toBe(true);
    expect(later.getAttribute("aria-haspopup")).toBe("menu");
    expect(later.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.style.getPropertyValue("position-anchor")).toBe(
      later.style.getPropertyValue("anchor-name"),
    );
    panel.hidePopover();
    // The toggle event that reports the close runs in a later task.
    await expect.poll(() => later.getAttribute("aria-expanded")).toBe("false");
    button.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(later.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes a manual menu on Escape and on a press outside, but not on its own opener's press", async () => {
    const { button, panel } = menu(["Pin"], "manual");
    enhanceMenu(panel, { signal: life.signal });
    await userEvent.click(button);
    expect(open(panel)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(open(panel)).toBe(false);
    await userEvent.click(button);
    await userEvent.click(document.body, { position: { x: 600, y: 600 } });
    expect(open(panel)).toBe(false);
    await userEvent.click(button);
    await userEvent.click(button);
    expect(open(panel)).toBe(false);
  });

  it("removes its ARIA and closes once its signal aborts", async () => {
    const { button, panel } = menu();
    enhanceMenu(panel, { signal: life.signal });
    await userEvent.click(button);
    life.abort();
    expect(open(panel)).toBe(false);
    expect(button.hasAttribute("aria-haspopup")).toBe(false);
  });
});

describe("one menu that a button and a right click both open", () => {
  it("moves once per key, toggles a check once, and tells the enhancement that opened it", async () => {
    const { button, panel, items } = menu(["Edit", "Export"], "manual");
    const check = item("Pinned", "menuitemcheckbox");
    check.setAttribute("aria-checked", "false");
    panel.append(check);
    const zone = document.createElement("div");
    zone.textContent = "Frieren";
    Object.assign(zone.style, { inlineSize: "300px", blockSize: "100px" });
    document.body.prepend(zone);
    const heard: string[] = [];
    enhanceMenu(panel, {
      signal: life.signal,
      onSelect: (i) => heard.push(`button ${i.textContent}`),
    });
    enhanceContextMenu(zone, panel, {
      signal: life.signal,
      onSelect: (i) => heard.push(`zone ${i.textContent}`),
    });
    await userEvent.click(button);
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("true");
    expect(heard).toEqual(["button Pinned"]);
    await userEvent.keyboard("{Escape}");
    expect(open(panel)).toBe(false);

    zone.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 }),
    );
    expect(open(panel)).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(items[1] as HTMLElement);
    expect(heard).toEqual(["button Pinned", "zone Export"]);
    expect(open(panel)).toBe(false);
  });

  it("keeps the other enhancement working once one's signal aborts", async () => {
    const { panel, items } = menu(["Edit", "Export"], "manual");
    const zone = document.createElement("div");
    zone.textContent = "Frieren";
    document.body.prepend(zone);
    const first = new AbortController();
    enhanceMenu(panel, { signal: first.signal });
    enhanceContextMenu(zone, panel, { signal: life.signal });
    first.abort();
    zone.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 }),
    );
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
  });
});

describe("enhanceContextMenu", () => {
  function zone(): HTMLElement {
    const z = document.createElement("ul");
    const row = document.createElement("li");
    row.textContent = "Frieren";
    row.dataset["name"] = "frieren";
    Object.assign(z.style, { inlineSize: "400px", blockSize: "200px" });
    z.append(row);
    document.body.prepend(z);
    return z;
  }

  it("opens at the pointer on a right click, for the row pressed, with focus on its first item", async () => {
    const { panel, items } = menu(["Pin", "Remove"], "manual");
    const z = zone();
    const for_: string[] = [];
    enhanceContextMenu(z, panel, {
      signal: life.signal,
      onOpen: (t) => for_.push((t as HTMLElement).dataset["name"] ?? ""),
    });
    const row = z.firstElementChild as HTMLElement;
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 30 }),
    );
    expect(open(panel)).toBe(true);
    expect(for_).toEqual(["frieren"]);
    expect(document.activeElement).toBe(items[0]);
    expect(panel.getBoundingClientRect().left).toBeCloseTo(50, 0);
  });

  it("closes on Escape and on a press outside, armed with no timer", () => {
    const { panel } = menu(["Pin"], "manual");
    const z = zone();
    enhanceContextMenu(z, panel, { signal: life.signal });
    const row = z.firstElementChild as HTMLElement;
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 30 }),
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(open(panel)).toBe(false);
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 30 }),
    );
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(open(panel)).toBe(false);
  });

  it("opens on a finger held still, and swallows the click its lift makes", async () => {
    const { panel } = menu(["Pin"], "manual");
    const z = zone();
    enhanceContextMenu(z, panel, { signal: life.signal, hold: 30 });
    const row = z.firstElementChild as HTMLElement;
    let clicked = 0;
    row.addEventListener("click", () => (clicked += 1));
    row.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
      }),
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(open(panel)).toBe(true);
    row.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    row.click();
    expect(clicked).toBe(0);
  });

  it("opens nothing for a finger that moves, which is a scroll", async () => {
    const { panel } = menu(["Pin"], "manual");
    const z = zone();
    enhanceContextMenu(z, panel, { signal: life.signal, hold: 30 });
    const row = z.firstElementChild as HTMLElement;
    row.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
      }),
    );
    row.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientX: 20,
        clientY: 60,
      }),
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(open(panel)).toBe(false);
  });
});
