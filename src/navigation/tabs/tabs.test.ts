import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceTabs } from "./tabs.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const WORDS = ["Episodes", "Subtitles", "History"];

function strip(selected: number | null = 0): {
  list: HTMLElement;
  tabs: HTMLButtonElement[];
  panels: HTMLElement[];
  after: HTMLButtonElement;
} {
  const list = document.createElement("div");
  list.className = "cp-tabs";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Item");
  const panels: HTMLElement[] = [];
  const tabs = WORDS.map((word, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `tab-${String(i)}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${String(i)}`);
    tab.setAttribute("aria-selected", String(i === selected));
    tab.textContent = word;
    list.append(tab);
    const panel = document.createElement("div");
    panel.id = `panel-${String(i)}`;
    panel.setAttribute("role", "tabpanel");
    panel.textContent = word;
    panels.push(panel);
    return tab;
  });
  const after = document.createElement("button");
  after.type = "button";
  after.textContent = "After";
  document.body.append(list, ...panels, after);
  return { list, tabs, panels, after };
}

const chosen = (tabs: HTMLElement[]) => tabs.map((t) => t.getAttribute("aria-selected"));
const shown = (panels: HTMLElement[]) => panels.map((p) => !p.hidden);

describe("enhanceTabs", () => {
  it("starts on the selected tab, the one Tab stop, and hides the other panels", () => {
    const { list, tabs, panels } = strip(1);
    enhanceTabs(list, { signal: life.signal });
    expect(chosen(tabs)).toEqual(["false", "true", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(shown(panels)).toEqual([false, true, false]);
  });

  it("starts on the first tab when none is selected", () => {
    const { list, tabs, panels } = strip(null);
    const tabsApi = enhanceTabs(list, { signal: life.signal });
    expect(tabsApi.selected).toBe(tabs[0]);
    expect(shown(panels)).toEqual([true, false, false]);
  });

  it("selects the tab an arrow, Home or End moves to, and tells onSelect once per change", async () => {
    const { list, tabs, panels } = strip();
    const onSelect = vi.fn();
    enhanceTabs(list, { onSelect, signal: life.signal });
    tabs[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[1]);
    expect(chosen(tabs)).toEqual(["false", "true", "false"]);
    expect(shown(panels)).toEqual([false, true, false]);
    expect(onSelect).toHaveBeenLastCalledWith(tabs[1], panels[1]);
    await userEvent.keyboard("{End}");
    expect(chosen(tabs)).toEqual(["false", "false", "true"]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[0]);
    await userEvent.keyboard("{Home}");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("selects on a press, and a press on the selected tab changes nothing", async () => {
    const { list, tabs, panels } = strip();
    const onSelect = vi.fn();
    enhanceTabs(list, { onSelect, signal: life.signal });
    await userEvent.click(tabs[2] as HTMLElement);
    expect(shown(panels)).toEqual([false, false, true]);
    await userEvent.click(tabs[2] as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("under manual activation moves focus with the arrows and selects on Enter or Space", async () => {
    const { list, tabs, panels } = strip();
    const onSelect = vi.fn();
    enhanceTabs(list, { activation: "manual", onSelect, signal: life.signal });
    tabs[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[1]);
    expect(chosen(tabs)).toEqual(["true", "false", "false"]);
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(shown(panels)).toEqual([false, true, false]);
    expect(onSelect).toHaveBeenLastCalledWith(tabs[1], panels[1]);
    await userEvent.keyboard("{ArrowRight}{ }");
    expect(chosen(tabs)).toEqual(["false", "false", "true"]);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("brings focus back to the selected tab, not the one last arrowed to", async () => {
    const { list, tabs, after } = strip();
    enhanceTabs(list, { activation: "manual", signal: life.signal });
    tabs[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.tab();
    expect(document.activeElement).toBe(after);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("selects through select() without onSelect, and ignores a tab from another list", () => {
    const { list, tabs, panels } = strip();
    const onSelect = vi.fn();
    const api = enhanceTabs(list, { onSelect, signal: life.signal });
    api.select(tabs[2] as HTMLElement);
    expect(api.selected).toBe(tabs[2]);
    expect(shown(panels)).toEqual([false, false, true]);
    const stranger = document.createElement("button");
    stranger.setAttribute("role", "tab");
    document.body.append(stranger);
    api.select(stranger);
    expect(api.selected).toBe(tabs[2]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("scrolls a strip too narrow for its tabs to a tab pressed half out of view", async () => {
    const { list, tabs } = strip();
    list.style.cssText = "display: flex; inline-size: 6rem; overflow-x: auto";
    for (const t of tabs) {
      t.style.cssText = "flex: none; inline-size: 5rem";
    }
    enhanceTabs(list, { signal: life.signal });
    await userEvent.click(tabs[1] as HTMLElement, { position: { x: 4, y: 4 } });
    await vi.waitFor(() => {
      const port = list.getBoundingClientRect();
      expect((tabs[1] as HTMLElement).getBoundingClientRect().right).toBeLessThanOrEqual(
        port.right + 0.5,
      );
    });
  });

  it("scrolls a strip too narrow for its tabs to the one select() picks, never the page", () => {
    const { list, tabs } = strip();
    list.style.cssText = "display: flex; inline-size: 6rem; overflow-x: auto";
    for (const t of tabs) {
      t.style.cssText = "flex: none; inline-size: 5rem";
    }
    const spacer = document.createElement("div");
    spacer.style.blockSize = "300vh";
    document.body.prepend(spacer);
    const page = document.scrollingElement as Element;
    page.scrollTop = 0;
    const api = enhanceTabs(list, { signal: life.signal });
    api.select(tabs[2] as HTMLElement);
    const port = list.getBoundingClientRect();
    const tab = (tabs[2] as HTMLElement).getBoundingClientRect();
    expect(tab.left).toBeGreaterThanOrEqual(port.left - 0.5);
    expect(tab.right).toBeLessThanOrEqual(port.right + 0.5);
    expect(page.scrollTop).toBe(0);
  });

  it("slides a pill under the selected tab, and its signal removes the pill and the keys", async () => {
    const { list, tabs } = strip();
    enhanceTabs(list, { signal: life.signal });
    expect(list.querySelectorAll(":scope > .cp-pill")).toHaveLength(1);
    life.abort();
    expect(list.querySelector(".cp-pill")).toBeNull();
    tabs[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(chosen(tabs)).toEqual(["true", "false", "false"]);
  });
});
