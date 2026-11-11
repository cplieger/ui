import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceToggle } from "../toggle/toggle.js";
import { enhanceOverflow } from "./overflow.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

/** A bar `width` px wide of 80px buttons named by `names`, then a 60px
 *  More; the test's own styles stand in for the system's. */
function bar(
  width: number,
  names = ["A", "B", "C"],
): {
  bar: HTMLElement;
  buttons: HTMLButtonElement[];
  more: HTMLButtonElement;
  menu: HTMLElement;
} {
  const root = document.createElement("div");
  root.className = "cp-overflow";
  root.style.cssText = `display: flex; gap: 4px; inline-size: ${String(width)}px`;
  const make = (words: string, w: number): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = `inline-size: ${String(w)}px; flex: none; padding: 0; border: 0`;
    const icon = document.createElement("span");
    icon.className = "cp-icon";
    icon.dataset["cpIcon"] = words.toLowerCase();
    icon.style.setProperty("--cp-icon-image", `url("${words}.svg")`);
    b.append(icon, words);
    return b;
  };
  const buttons = names.map((n) => make(n, 80));
  const more = make("More", 60);
  more.dataset["part"] = "more";
  more.hidden = true;
  more.setAttribute("popovertarget", "more-menu");
  const menu = document.createElement("div");
  menu.id = "more-menu";
  menu.popover = "auto";
  menu.setAttribute("role", "menu");
  root.append(...buttons, more, menu);
  document.body.append(root);
  return { bar: root, buttons, more, menu };
}

const hidden = (buttons: HTMLButtonElement[]): string[] =>
  buttons.filter((b) => b.hidden).map((b) => b.textContent);

describe("enhanceOverflow", () => {
  it("keeps every button and hides More while all of them fit", () => {
    const t = bar(300);
    enhanceOverflow(t.bar, { signal: life.signal });
    expect(hidden(t.buttons)).toEqual([]);
    expect(t.more.hidden).toBe(true);
    expect(t.bar.hasAttribute("data-cp-overflow")).toBe(true);
  });

  it("sends the buttons that do not fit beside More into its menu, in order", async () => {
    // 60 for More, then 4 + 80 fits in 200 and a second 4 + 80 does not.
    const t = bar(200);
    enhanceOverflow(t.bar, { signal: life.signal });
    expect(hidden(t.buttons)).toEqual(["B", "C"]);
    expect(t.more.hidden).toBe(false);
    t.more.click();
    const items = [...t.menu.querySelectorAll('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(["B", "C"]);
    expect(t.menu.matches(":popover-open")).toBe(true);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(items[0]);
    });
  });

  it("copies each icon with its drawing set through the CSSOM", () => {
    const t = bar(200);
    enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    const icon = t.menu.querySelector<HTMLElement>('[role="menuitem"] > .cp-icon');
    expect(icon?.dataset["cpIcon"]).toBe("b");
    expect(icon?.style.getPropertyValue("--cp-icon-image")).toBe(
      t.buttons[1]
        ?.querySelector<HTMLElement>(".cp-icon")
        ?.style.getPropertyValue("--cp-icon-image"),
    );
  });

  it("presses the hidden button when its item is chosen, after the menu closed", async () => {
    const t = bar(200);
    const pressed = vi.fn(() => t.menu.matches(":popover-open"));
    t.buttons[2]?.addEventListener("click", pressed);
    enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    await vi.waitFor(() => {
      expect(t.menu.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(pressed).toHaveBeenCalledOnce();
    expect(pressed).toHaveReturnedWith(false);
    expect(document.activeElement).toBe(t.more);
  });

  it("offers a pressed button as a check item that follows the button", () => {
    const t = bar(200);
    const pin = t.buttons[2];
    if (pin === undefined) {
      throw new Error("no third button");
    }
    pin.setAttribute("aria-pressed", "false");
    enhanceToggle(pin, { signal: life.signal });
    enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    const item = t.menu.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    expect(item?.textContent).toBe("C");
    expect(item?.querySelector(".cp-icon")).toBeNull();
    expect(item?.getAttribute("aria-checked")).toBe("false");
    item?.click();
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(item?.getAttribute("aria-checked")).toBe("true");
    expect(t.menu.matches(":popover-open")).toBe(true);
    expect(pin.hasAttribute("data-cp-toggled")).toBe(false);
  });

  it("puts a check item back when its button refuses the press", () => {
    const t = bar(200);
    const pin = t.buttons[2];
    pin?.setAttribute("aria-pressed", "true");
    enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    const item = t.menu.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    item?.click();
    expect(item?.getAttribute("aria-checked")).toBe("true");
  });

  it("names an item by the button's aria-label, its rest words, its state and tone", () => {
    const t = bar(200);
    const [, b, c] = t.buttons;
    if (b === undefined || c === undefined) {
      throw new Error("no buttons");
    }
    b.setAttribute("aria-label", "Bee");
    b.disabled = true;
    c.dataset["tone"] = "danger";
    const roll = document.createElement("span");
    roll.className = "cp-roll";
    roll.append(document.createElement("span"));
    roll.firstElementChild?.append("Sea");
    c.lastChild?.remove();
    c.append(roll);
    enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    const items = [...t.menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(["Bee", "Sea"]);
    expect(items[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[1]?.dataset["tone"]).toBe("danger");
  });

  it("brings buttons back and hides More as the bar widens, by itself", async () => {
    const t = bar(200);
    enhanceOverflow(t.bar, { signal: life.signal });
    t.bar.style.inlineSize = "300px";
    await vi.waitFor(() => {
      expect(hidden(t.buttons)).toEqual([]);
    });
    expect(t.more.hidden).toBe(true);
  });

  it("closes an open menu whose buttons change, focus back on More", async () => {
    const t = bar(200);
    const o = enhanceOverflow(t.bar, { signal: life.signal });
    t.more.click();
    await vi.waitFor(() => {
      expect(t.menu.contains(document.activeElement)).toBe(true);
    });
    // 248 for all three does not fit; 60 + 84 + 84 for More, A and B does.
    t.bar.style.inlineSize = "240px";
    o.fit();
    expect(hidden(t.buttons)).toEqual(["C"]);
    expect(t.menu.matches(":popover-open")).toBe(false);
    expect(document.activeElement).toBe(t.more);
  });

  it("moves focus from a button that leaves to More, and from More to the last button", () => {
    const t = bar(300);
    const o = enhanceOverflow(t.bar, { signal: life.signal });
    t.buttons[2]?.focus();
    t.bar.style.inlineSize = "200px";
    o.fit();
    expect(document.activeElement).toBe(t.more);
    t.bar.style.inlineSize = "300px";
    o.fit();
    expect(document.activeElement).toBe(t.buttons[2]);
  });

  it("keeps a child that is not a button, and a button the page hid, where they are", () => {
    const t = bar(300);
    const note = document.createElement("span");
    note.style.cssText = "inline-size: 100px; flex: none";
    t.buttons[0]?.after(note);
    const b = t.buttons[1];
    if (b === undefined) {
      throw new Error("no second button");
    }
    b.hidden = true;
    const o = enhanceOverflow(t.bar, { signal: life.signal });
    // 80 + 4 + 100 + 4 + 80 = 268 fits in 300 without More, so nothing moves.
    expect(hidden(t.buttons)).toEqual(["B"]);
    expect(t.more.hidden).toBe(true);
    // In 260, More and the 104 the span keeps leave room for A only.
    t.bar.style.inlineSize = "260px";
    o.fit();
    expect(hidden(t.buttons)).toEqual(["B", "C"]);
    t.more.click();
    expect([...t.menu.children].map((i) => i.textContent)).toEqual(["C"]);
  });

  it("shows every button again and hides More once its signal aborts", () => {
    const t = bar(200);
    enhanceOverflow(t.bar, { signal: life.signal });
    life.abort();
    expect(hidden(t.buttons)).toEqual([]);
    expect(t.more.hidden).toBe(true);
    expect(t.bar.hasAttribute("data-cp-overflow")).toBe(false);
  });

  it("does nothing under a signal that already aborted", () => {
    const t = bar(200);
    life.abort();
    enhanceOverflow(t.bar, { signal: life.signal });
    expect(hidden(t.buttons)).toEqual([]);
    expect(t.bar.hasAttribute("data-cp-overflow")).toBe(false);
  });

  it("throws a TypeError without More or its menu", () => {
    const t = bar(200);
    t.menu.remove();
    expect(() => enhanceOverflow(t.bar)).toThrow(TypeError);
    t.more.remove();
    expect(() => enhanceOverflow(t.bar)).toThrow(TypeError);
  });
});
