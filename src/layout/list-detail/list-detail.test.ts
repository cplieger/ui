import { afterEach, describe, expect, it, vi } from "vitest";

import { enhanceListDetail, type ListDetailOptions } from "./list-detail.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function frames(n = 2): Promise<void> {
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

/** A list and its detail in a box `width` pixels wide; 52rem is 832px. */
function mount(width: number, options: Omit<ListDetailOptions, "signal"> = {}) {
  const root = document.createElement("div");
  root.className = "cp-list-detail";
  root.style.inlineSize = `${width}px`;
  const opener = document.createElement("a");
  opener.href = "#entry";
  opener.textContent = "Entry";
  const detail = document.createElement("section");
  detail.className = "cp-detail";
  detail.hidden = true;
  detail.setAttribute("aria-labelledby", "detail-title");
  const header = document.createElement("header");
  const heading = document.createElement("h2");
  heading.id = "detail-title";
  heading.tabIndex = -1;
  heading.textContent = "Entry";
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("data-uip-detail-close", "");
  close.setAttribute("aria-label", "Close");
  header.append(heading, close);
  detail.append(header);
  root.append(opener, detail);
  document.body.append(root);
  opener.focus();
  const api = enhanceListDetail(root, { ...options, signal: life.signal });
  const dialog = root.nextElementSibling as HTMLDialogElement;
  return { root, opener, detail, heading, close, dialog, api };
}

describe("enhanceListDetail", () => {
  it("docks the detail beside the list in a wide box and focuses its heading", () => {
    const { root, detail, heading, dialog, api } = mount(1000);
    api.open();
    expect(detail.hidden).toBe(false);
    expect(detail.parentElement).toBe(root);
    expect(root.hasAttribute("data-uip-docked")).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  it("shows the detail in a labelled modal dialog in a narrow box", () => {
    const { root, detail, heading, dialog, api } = mount(400);
    api.open();
    expect(dialog.open).toBe(true);
    expect(dialog.matches(":modal")).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("detail-title");
    expect(detail.parentElement).toBe(dialog);
    expect(root.hasAttribute("data-uip-docked")).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  it("moves an open detail when the box crosses the docking width, keeping focus in it", async () => {
    const { root, detail, close, dialog, api } = mount(1000);
    api.open();
    close.focus();
    root.style.inlineSize = "400px";
    await frames(3);
    expect(dialog.open, "dialog open when narrow").toBe(true);
    expect(detail.parentElement, "detail in the dialog").toBe(dialog);
    expect(detail.contains(document.activeElement), "focus in the dialog's detail").toBe(true);
    root.style.inlineSize = "1000px";
    await frames(3);
    expect(dialog.open, "dialog closed when wide").toBe(false);
    expect(detail.parentElement, "detail docked").toBe(root);
    expect(detail.contains(document.activeElement), "focus in the docked detail").toBe(true);
  });

  it("docks from the width dockAt names", () => {
    const { root, api } = mount(700, { dockAt: 40 });
    api.open();
    expect(root.hasAttribute("data-uip-docked")).toBe(true);
  });

  it("closes back into the box and returns focus to the opener", () => {
    const { root, opener, detail, dialog, api } = mount(400);
    api.open();
    api.close();
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("leaves a second open() where it is and refocuses the heading", () => {
    const { opener, heading, close, api } = mount(1000);
    api.open();
    close.focus();
    api.open();
    expect(document.activeElement).toBe(heading);
    api.close();
    expect(document.activeElement).toBe(opener);
  });

  it("hands Escape and Close to onDismiss, keeping the dialog open for the route", () => {
    const onDismiss = vi.fn();
    const { close, dialog, api } = mount(400, { onDismiss });
    api.open();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    close.click();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and Close without onDismiss", () => {
    const { detail, close, dialog, api } = mount(400);
    api.open();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(detail.hidden).toBe(true);
    api.open();
    close.click();
    expect(dialog.open).toBe(false);
    expect(detail.hidden).toBe(true);
  });

  it("closes and removes its dialog when the signal aborts", () => {
    const { root, detail, api } = mount(400);
    api.open();
    life.abort();
    expect(detail.hidden).toBe(true);
    expect(root.nextElementSibling).toBeNull();
  });

  it("tears down at once under a signal that has already aborted", () => {
    const root = document.createElement("div");
    const detail = document.createElement("section");
    detail.className = "cp-detail";
    detail.hidden = true;
    root.append(detail);
    document.body.append(root);
    enhanceListDetail(root, { signal: AbortSignal.abort() });
    expect(root.nextElementSibling).toBeNull();
  });

  it("throws a TypeError without a .cp-detail child", () => {
    const root = document.createElement("div");
    expect(() => enhanceListDetail(root)).toThrow(TypeError);
  });
});
