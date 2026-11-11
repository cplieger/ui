import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceReorder } from "./reorder.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The slide is the stylesheet's transition, so the tests link it as an app
// does.
beforeEach(async () => {
  document.documentElement.classList.add("cp");
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
});

afterEach(async () => {
  life.abort();
  life = new AbortController();
  if (server.browser === "chromium") {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
  sheet.remove();
  document.documentElement.classList.remove("cp");
  document.body.replaceChildren();
});

function item(name: string): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset["name"] = name;
  const row = document.createElement("div");
  row.className = "cp-list-row";
  const handle = document.createElement("span");
  handle.dataset["part"] = "handle";
  handle.setAttribute("aria-hidden", "true");
  handle.textContent = "⋮";
  const rank = document.createElement("span");
  rank.dataset["part"] = "rank";
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.textContent = name;
  const moves = document.createElement("span");
  moves.dataset["part"] = "move";
  for (const way of ["up", "down"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cp-button";
    b.dataset["move"] = way;
    b.setAttribute("aria-label", `Move ${name} ${way}`);
    b.textContent = way;
    moves.append(b);
  }
  row.append(handle, rank, text, moves);
  li.append(row);
  return li;
}

function list(names = ["Japanese", "English", "French"], into: Element = document.body) {
  const ol = document.createElement("ol");
  ol.className = "cp-list cp-reorder";
  ol.setAttribute("aria-label", "Audio languages");
  ol.append(...names.map(item));
  into.append(ol);
  return ol;
}

const order = (ol: Element): string[] =>
  [...ol.children].map((li) => (li as HTMLElement).dataset["name"] ?? "");
const button = (ol: Element, name: string, way: "up" | "down"): HTMLButtonElement =>
  ol.querySelector(`[data-name="${name}"] [data-move="${way}"]`) as HTMLButtonElement;
const ranks = (ol: Element): string[] =>
  [...ol.querySelectorAll('[data-part="rank"]')].map((r) => r.textContent);
const slides = (el: Element): Animation[] =>
  el
    .getAnimations()
    .filter((a) => a instanceof CSSTransition && a.transitionProperty === "translate");

describe("enhanceReorder", () => {
  it("numbers the items and marks the end buttons", () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    expect(ranks(ol)).toEqual(["1", "2", "3"]);
    expect(button(ol, "Japanese", "up").getAttribute("aria-disabled")).toBe("true");
    expect(button(ol, "Japanese", "down").hasAttribute("aria-disabled")).toBe(false);
    expect(button(ol, "French", "down").getAttribute("aria-disabled")).toBe("true");
    expect(button(ol, "French", "up").hasAttribute("aria-disabled")).toBe(false);
  });

  it("moves an item down by one press and keeps focus on the button", async () => {
    const ol = list();
    const onChange = vi.fn<(items: readonly HTMLLIElement[], moved: HTMLLIElement) => void>();
    enhanceReorder(ol, { onChange, signal: life.signal });
    const down = button(ol, "Japanese", "down");
    const blurred = vi.fn();
    down.addEventListener("blur", blurred);
    down.focus();
    await userEvent.keyboard("{Enter}");
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
    expect(document.activeElement).toBe(down);
    expect(blurred).not.toHaveBeenCalled();
    expect(ranks(ol)).toEqual(["1", "2", "3"]);
    expect(button(ol, "Japanese", "up").hasAttribute("aria-disabled")).toBe(false);
    expect(button(ol, "English", "up").getAttribute("aria-disabled")).toBe("true");
    expect(onChange).toHaveBeenCalledOnce();
    const [items, moved] = onChange.mock.calls[0] ?? [];
    expect(items?.map((li) => li.dataset["name"])).toEqual(["English", "Japanese", "French"]);
    expect(moved?.dataset["name"]).toBe("Japanese");
  });

  it("moves an item up under a mouse press", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    await userEvent.click(button(ol, "French", "up"));
    expect(order(ol)).toEqual(["Japanese", "French", "English"]);
  });

  it("does nothing on an end button", async () => {
    const ol = list();
    const onChange = vi.fn();
    enhanceReorder(ol, { onChange, signal: life.signal });
    const up = button(ol, "Japanese", "up");
    up.focus();
    await userEvent.keyboard("{Enter}");
    expect(order(ol)).toEqual(["Japanese", "English", "French"]);
    expect(document.activeElement).toBe(up);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says the new place politely", async () => {
    installAnnouncer({ signal: life.signal });
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    await userEvent.click(button(ol, "English", "up"));
    const polite = document.querySelector('[aria-live="polite"]');
    await expect.poll(() => polite?.textContent).toBe("English, position 1 of 3");
  });

  it("says the app's words and names", async () => {
    installAnnouncer({ signal: life.signal });
    const ol = list();
    enhanceReorder(ol, {
      name: (li) => (li.dataset["name"] ?? "").toUpperCase(),
      words: (name, at, n) => `${name} ${String(at)}/${String(n)}`,
      signal: life.signal,
    });
    await userEvent.click(button(ol, "English", "down"));
    const polite = document.querySelector('[aria-live="polite"]');
    await expect.poll(() => polite?.textContent).toBe("ENGLISH 3/3");
  });

  it("moves the focused item with Alt and an arrow, except in a text field", async () => {
    const ol = list();
    const field = document.createElement("input");
    field.type = "text";
    field.value = "key";
    ol.querySelector('[data-name="English"] .cp-list-row')?.append(field);
    enhanceReorder(ol, { signal: life.signal });
    const down = button(ol, "English", "down");
    down.focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
    expect(document.activeElement).toBe(down);
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
    field.focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
    expect(document.activeElement).toBe(field);
  });

  it("ignores an arrow without Alt, or with another modifier", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    button(ol, "English", "down").focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}");
    expect(order(ol)).toEqual(["Japanese", "English", "French"]);
  });

  it("drags an item by its handle and drops it at the slot it is over", async () => {
    const ol = list();
    const onChange = vi.fn();
    enhanceReorder(ol, { onChange, signal: life.signal });
    const first = ol.children[0] as HTMLLIElement;
    const last = ol.children[2] as HTMLLIElement;
    const handle = first.querySelector('[data-part="handle"]') as HTMLElement;
    // A point fixed in the viewport: a target's own place moves as it slides.
    const at = {
      x: last.getBoundingClientRect().left + 8,
      y: last.getBoundingClientRect().bottom - 2,
    };
    await userEvent.pointer([{ target: handle, keys: "[MouseLeft>]" }, { coords: at }]);
    expect(first.hasAttribute("data-cp-lifted")).toBe(true);
    expect(getComputedStyle(first).translate).not.toBe("none");
    expect(getComputedStyle(first).boxShadow).not.toBe("none");
    expect((ol.children[1] as HTMLElement).style.translate).toMatch(/^0px -\d/);
    await userEvent.pointer({ coords: at, keys: "[/MouseLeft]" });
    expect(first.hasAttribute("data-cp-lifted")).toBe(false);
    expect(order(ol)).toEqual(["English", "French", "Japanese"]);
    expect(ranks(ol)).toEqual(["1", "2", "3"]);
    expect(onChange).toHaveBeenCalledOnce();
    expect([...ol.children].map((li) => (li as HTMLElement).style.translate)).toEqual(["", "", ""]);
  });

  it("keeps a dragged item inside its list", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    const first = ol.children[0] as HTMLLIElement;
    const handle = first.querySelector('[data-part="handle"]') as HTMLElement;
    const below = ol.getBoundingClientRect().bottom + 200;
    await userEvent.pointer([
      { target: handle, keys: "[MouseLeft>]" },
      { coords: { x: 20, y: Math.min(below, innerHeight - 1) } },
    ]);
    expect(first.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      ol.getBoundingClientRect().bottom + 0.5,
    );
    await userEvent.pointer({ keys: "[/MouseLeft]" });
    expect(order(ol)).toEqual(["English", "French", "Japanese"]);
  });

  it("scrolls the scroller while a drag is near its edge", async () => {
    const box = document.createElement("div");
    box.style.overflowY = "auto";
    box.style.blockSize = "160px";
    document.body.append(box);
    const ol = list(
      Array.from({ length: 12 }, (_, i) => `Item ${String(i + 1)}`),
      box,
    );
    enhanceReorder(ol, { signal: life.signal });
    const handle = ol.querySelector('[data-part="handle"]') as HTMLElement;
    await userEvent.pointer([
      { target: handle, keys: "[MouseLeft>]" },
      { target: box, coords: { x: 20, y: 156 } },
    ]);
    await expect.poll(() => box.scrollTop, { timeout: 2000 }).toBeGreaterThan(40);
    await userEvent.pointer({ keys: "[/MouseLeft]" });
    expect(order(ol).indexOf("Item 1")).toBeGreaterThan(1);
  });

  it("slides the others from their old place", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    await userEvent.click(button(ol, "Japanese", "down"));
    const english = ol.children[0] as HTMLElement;
    expect(slides(english)).toHaveLength(1);
    expect(english.style.translate).toBe("");
  });

  it.runIf(server.browser === "chromium")("moves at once under reduced motion", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    await userEvent.click(button(ol, "Japanese", "down"));
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
    expect([...ol.children].flatMap(slides)).toEqual([]);
  });

  it("numbers items the app adds later", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    ol.append(item("German"));
    await expect.poll(() => ranks(ol)).toEqual(["1", "2", "3", "4"]);
    expect(button(ol, "French", "down").hasAttribute("aria-disabled")).toBe(false);
    expect(button(ol, "German", "down").getAttribute("aria-disabled")).toBe("true");
  });

  it("leaves a nested list's items to that list", async () => {
    const outer = list(["Audio", "Subtitles"]);
    enhanceReorder(outer, { signal: life.signal });
    const inner = list(["Japanese", "English"], outer.children[0] as HTMLElement);
    enhanceReorder(inner, { signal: life.signal });
    expect(ranks(inner)).toEqual(["1", "2"]);
    await userEvent.click(button(inner, "Japanese", "down"));
    expect(order(inner)).toEqual(["English", "Japanese"]);
    expect(order(outer)).toEqual(["Audio", "Subtitles"]);
    expect(
      (outer.children[0] as HTMLElement).querySelector(':scope > .cp-list-row [data-part="rank"]')
        ?.textContent,
    ).toBe("1");
  });

  it("stops with its signal", async () => {
    const ol = list();
    enhanceReorder(ol, { signal: life.signal });
    await userEvent.click(button(ol, "Japanese", "down"));
    life.abort();
    expect([...ol.children].map((li) => (li as HTMLElement).style.cssText)).toEqual(["", "", ""]);
    await userEvent.click(button(ol, "Japanese", "down"));
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order(ol)).toEqual(["English", "Japanese", "French"]);
  });

  it("does nothing with a signal already aborted", () => {
    const ol = list();
    life.abort();
    enhanceReorder(ol, { signal: life.signal });
    expect(ranks(ol)).toEqual(["", "", ""]);
  });
});
