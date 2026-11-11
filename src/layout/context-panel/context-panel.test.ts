import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceContextPanel, type ContextPanelOptions } from "./context-panel.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The stylesheet hides the docked summary and lays out the columns, so the
// tests link it as an app's page does.
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

afterEach(() => {
  life.abort();
  life = new AbortController();
  sheet.remove();
  document.documentElement.classList.remove("cp");
  document.body.replaceChildren();
});

function frames(n = 3): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left === 0) {
        resolve();
      } else {
        requestAnimationFrame(() => step(left - 1));
      }
    };
    step(n);
  });
}

/** A context `width` pixels wide; 44rem is 704px. */
function mount(
  width: number,
  options: Omit<ContextPanelOptions, "signal"> = {},
  open = false,
  parent: HTMLElement = document.body,
) {
  const root = document.createElement("div");
  root.className = "cp-context";
  root.style.inlineSize = `${String(width)}px`;
  const panel = document.createElement("details");
  panel.className = "cp-context-panel";
  panel.open = open;
  const summary = document.createElement("summary");
  summary.textContent = "Reservations, queue and followers";
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Reservations";
  const list = document.createElement("ul");
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = "#kiro";
  link.textContent = "@kiro";
  item.append(link);
  list.append(item);
  section.append(heading, list);
  panel.append(summary, section);
  const main = document.createElement("div");
  main.className = "cp-context-main";
  const send = document.createElement("button");
  send.type = "button";
  send.textContent = "Send";
  main.append(send);
  root.append(panel, main);
  parent.append(root);
  enhanceContextPanel(root, { ...options, signal: life.signal });
  return { root, panel, summary, section, heading, link, main };
}

describe("enhanceContextPanel", () => {
  it("docks the panel open as a 16rem column at the start of a wide box, its summary gone", () => {
    const { root, panel, summary, section, main } = mount(960);
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
    expect(panel.open).toBe(true);
    expect(summary.checkVisibility()).toBe(false);
    expect(section.checkVisibility()).toBe(true);
    const [r, p, m] = [root, panel, main].map((e) => e.getBoundingClientRect()) as [
      DOMRect,
      DOMRect,
      DOMRect,
    ];
    expect(p.right - r.left).toBeCloseTo(256, 0);
    expect(section.getBoundingClientRect().left).toBeCloseTo(r.left, 0);
    expect(p.right).toBeLessThanOrEqual(m.left);
    expect(Math.abs(p.top - m.top)).toBeLessThan(1);
  });

  it("puts the docked panel at the start in right to left", () => {
    const { root, panel, main } = mount(960);
    root.dir = "rtl";
    expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      main.getBoundingClientRect().right,
    );
  });

  it("is a disclosure above the main column in a narrow box, opened and shut by its summary", async () => {
    const { root, panel, summary, main } = mount(480);
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    expect(panel.open).toBe(false);
    expect(summary.checkVisibility()).toBe(true);
    expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      main.getBoundingClientRect().top,
    );
    expect(summary.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
    await userEvent.click(summary);
    expect(panel.open).toBe(true);
    await userEvent.click(summary);
    await expect.poll(() => panel.open).toBe(false);
  });

  it("opens a panel the person shut when it docks, and shuts it again when it undocks", async () => {
    const { root, panel } = mount(480);
    root.style.inlineSize = "960px";
    await frames();
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
    expect(panel.open).toBe(true);
    root.style.inlineSize = "480px";
    await frames();
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    expect(panel.open).toBe(false);
  });

  it("keeps a panel the person opened open across a dock and back", async () => {
    const { root, panel, summary } = mount(480);
    await userEvent.click(summary);
    root.style.inlineSize = "960px";
    await frames();
    root.style.inlineSize = "480px";
    await frames();
    expect(panel.open).toBe(true);
  });

  it("starts docked from a panel shut in the markup and undocks it shut", async () => {
    const { root, panel } = mount(960);
    root.style.inlineSize = "480px";
    await frames();
    expect(panel.open).toBe(false);
  });

  it("keeps the panel open and focus in it when it undocks with focus inside", async () => {
    const { root, panel, link } = mount(960);
    link.focus();
    root.style.inlineSize = "480px";
    await frames();
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    expect(panel.open).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it("moves focus from the summary it hides to the panel's first heading", async () => {
    const { root, summary, heading } = mount(480);
    summary.focus();
    root.style.inlineSize = "960px";
    await frames();
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    life.abort();
    expect(heading.hasAttribute("tabindex")).toBe(false);
  });

  it("stops a shutting glide when it docks, so the docked panel stays open", async () => {
    const { root, panel, summary } = mount(480, {}, true);
    await userEvent.click(summary);
    expect(panel.hasAttribute("data-cp-closing")).toBe(true);
    let shut = 0;
    const watch = new MutationObserver(() => {
      if (!panel.open) {
        shut += 1;
      }
    });
    root.style.inlineSize = "960px";
    await frames();
    watch.observe(panel, { attributes: true, attributeFilter: ["open"] });
    await new Promise((resolve) => setTimeout(resolve, 400));
    watch.disconnect();
    expect(shut, "shut while docked").toBe(0);
    expect(panel.open).toBe(true);
    expect(panel.hasAttribute("data-cp-closing")).toBe(false);
  });

  it("keeps a docked panel open when script shuts it", async () => {
    const { panel } = mount(960);
    panel.open = false;
    await new Promise((resolve) => {
      panel.addEventListener("toggle", resolve, { once: true });
    });
    expect(panel.open).toBe(true);
  });

  it("waits for a hidden box to show before it docks", async () => {
    const hidden = document.createElement("div");
    hidden.hidden = true;
    document.body.append(hidden);
    const { root } = mount(960, {}, false, hidden);
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    hidden.hidden = false;
    await frames();
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
  });

  it("docks from 44rem by default", () => {
    expect(mount(704).root.hasAttribute("data-cp-docked")).toBe(true);
    expect(mount(703).root.hasAttribute("data-cp-docked")).toBe(false);
  });

  it("docks from the width dockAt names", () => {
    const { root } = mount(700, { dockAt: 40 });
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
  });

  it("undocks and stops following the box when the signal aborts", async () => {
    const { root, panel } = mount(960);
    life.abort();
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    expect(panel.open).toBe(false);
    root.style.inlineSize = "1200px";
    await frames();
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
  });

  it("does nothing under a signal that has already aborted", () => {
    const root = document.createElement("div");
    root.className = "cp-context";
    root.style.inlineSize = "960px";
    const panel = document.createElement("details");
    panel.append(document.createElement("summary"));
    root.append(panel);
    document.body.append(root);
    enhanceContextPanel(root, { signal: AbortSignal.abort() });
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
  });

  it("throws a TypeError when the first child is no details with a summary", () => {
    const root = document.createElement("div");
    root.append(document.createElement("div"));
    expect(() => enhanceContextPanel(root)).toThrow(TypeError);
    const bare = document.createElement("div");
    bare.append(document.createElement("details"));
    expect(() => enhanceContextPanel(bare)).toThrow(TypeError);
  });
});
