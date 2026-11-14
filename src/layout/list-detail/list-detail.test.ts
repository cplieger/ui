import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceListDetail, type ListDetailOptions } from "./list-detail.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The stylesheet draws the sheet and its motion, so the tests link it as an
// app's page does.
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

/** Waits for what `el` is playing now, which a loaded engine can stretch
 *  past any fixed wait. */
async function played(el: Element): Promise<void> {
  await Promise.allSettled(el.getAnimations().map((a) => a.finished));
  await new Promise((r) => setTimeout(r, 0));
}

/** Waits out the sheet's exit: Chromium closes the dialog at once and plays
 *  the exit in CSS, Firefox and WebKit play it in script and then close. */
async function exited(dialog: HTMLDialogElement): Promise<void> {
  if (dialog.open) {
    await new Promise((r) => {
      dialog.addEventListener("close", r, { once: true });
    });
  }
  await played(dialog);
}

/** A list and its detail in a box `width` pixels wide; 52rem is 832px. */
function mount(width: number, options: Omit<ListDetailOptions, "signal"> = {}) {
  const root = document.createElement("div");
  root.className = "cp-list-detail";
  root.style.inlineSize = `${String(width)}px`;
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
  close.setAttribute("data-detail-close", "");
  close.setAttribute("aria-label", "Close");
  close.textContent = "Close";
  header.append(heading, close);
  const body = document.createElement("div");
  body.className = "cp-detail-body";
  body.textContent = "Details";
  detail.append(header, body);
  root.append(opener, detail);
  document.body.append(root);
  opener.focus();
  const api = enhanceListDetail(root, { ...options, signal: life.signal });
  const dialog = root.nextElementSibling as HTMLDialogElement;
  return { root, opener, detail, heading, close, dialog, api };
}

/** A detail opened by a route over a real history entry, as the doc's
 *  recipe has it: Back pops the entry and the route closes the detail. */
async function routed(width: number) {
  const onDismiss = vi.fn(() => {
    history.back();
  });
  const m = mount(width, { onDismiss });
  addEventListener(
    "popstate",
    () => {
      m.api.close();
    },
    { signal: life.signal },
  );
  history.pushState({ entry: "entry" }, "");
  m.api.open();
  await played(m.dialog);
  return { ...m, onDismiss };
}

const popped = (): Promise<unknown> =>
  new Promise((r) => {
    addEventListener("popstate", r, { once: true });
  });

describe("enhanceListDetail", () => {
  it("docks the detail beside the list in a wide box and focuses its heading", () => {
    const { root, detail, heading, dialog, api } = mount(1000);
    api.open();
    expect(detail.hidden).toBe(false);
    expect(detail.parentElement).toBe(root);
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  it("docks from a 52rem box and opens the sheet in a box a pixel narrower", () => {
    const at = mount(832);
    at.api.open();
    expect(at.root.hasAttribute("data-cp-docked"), "52rem").toBe(true);
    expect(at.dialog.open, "52rem").toBe(false);
    life.abort();
    life = new AbortController();
    document.body.replaceChildren();
    const under = mount(831);
    under.api.open();
    expect(under.root.hasAttribute("data-cp-docked"), "a pixel under").toBe(false);
    expect(under.dialog.open, "a pixel under").toBe(true);
  });

  it("shows the detail in a labelled, modal, full-height sheet at the inline end in a narrow box", () => {
    const { root, detail, heading, dialog, api } = mount(400);
    api.open({ still: true });
    expect(dialog.matches(":modal")).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("detail-title");
    expect(detail.parentElement).toBe(dialog);
    expect(root.hasAttribute("data-cp-docked")).toBe(false);
    expect(document.activeElement).toBe(heading);
    const box = dialog.getBoundingClientRect();
    expect(box.top, "top").toBeCloseTo(0, 0);
    expect(box.bottom, "bottom").toBeCloseTo(innerHeight, 0);
    expect(box.right, "inline end").toBeCloseTo(innerWidth, 0);
    expect(box.left, "short of the inline start").toBeGreaterThan(0);
    expect(detail.getBoundingClientRect().height, "detail as tall as the sheet").toBeCloseTo(
      box.height,
      0,
    );
  });

  it("spaces the detail in the sheet as a form dialog spaces its header and body", () => {
    const { detail, heading, api } = mount(400);
    api.open({ still: true });
    const form = document.createElement("dialog");
    form.className = "cp-dialog";
    const inner = document.createElement("form");
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Form";
    header.append(title);
    const body = document.createElement("div");
    body.className = "cp-dialog-body";
    body.textContent = "Body";
    inner.append(header, body);
    form.append(inner);
    document.body.append(form);
    form.show();
    const gap = (above: Element, below: Element | null): number =>
      (below?.getBoundingClientRect().top ?? Number.NaN) - above.getBoundingClientRect().bottom;
    const formGap = gap(header, body);
    const detailHeader = heading.parentElement ?? heading;
    expect(gap(detailHeader, detail.querySelector(".cp-detail-body"))).toBeCloseTo(formGap, 0);
  });

  it("starts a context's content in the sheet where a body's starts", () => {
    const { detail, heading, api } = mount(400);
    api.open({ still: true });
    const body = detail.querySelector(".cp-detail-body");
    const line = document.createElement("p");
    line.textContent = "First";
    body?.replaceChildren(line);
    const top = (): number =>
      line.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
    const inBody = top();
    body?.setAttribute("class", "cp-context");
    expect(top()).toBeCloseTo(inBody, 0);
  });

  it("moves an open detail when the box crosses the docking width, keeping focus in it and playing no motion", async () => {
    const { root, detail, close, dialog, api } = mount(1000);
    api.open();
    await played(detail);
    close.focus();
    root.style.inlineSize = "400px";
    await frames(3);
    expect(dialog.open, "dialog open when narrow").toBe(true);
    expect(detail.parentElement, "detail in the dialog").toBe(dialog);
    expect(detail.contains(document.activeElement), "focus in the dialog's detail").toBe(true);
    expect(dialog.getAnimations(), "the sheet arrives still").toHaveLength(0);
    root.style.inlineSize = "1000px";
    await frames(3);
    expect(dialog.open, "dialog closed when wide").toBe(false);
    expect(detail.parentElement, "detail docked").toBe(root);
    expect(detail.contains(document.activeElement), "focus in the docked detail").toBe(true);
    expect(detail.getAnimations(), "the docked detail arrives still").toHaveLength(0);
    expect(dialog.getAnimations(), "the emptied sheet leaves still").toHaveLength(0);
  });

  it("docks from the width dockAt names", () => {
    const { root, api } = mount(700, { dockAt: 40 });
    api.open();
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
  });

  it("opens still in the sheet, then lets its motion return after it paints", async () => {
    const { dialog, api } = mount(400);
    api.open({ still: true });
    expect(dialog.getAnimations(), "no entrance").toHaveLength(0);
    await frames(3);
    expect(dialog.hasAttribute("data-cp-still")).toBe(false);
  });

  it("opens still docked and keeps still after it paints; the next open plays the entrance", async () => {
    const { detail, api } = mount(1000);
    api.open({ still: true });
    await frames(3);
    expect(detail.getAnimations(), "no entrance after the still open").toHaveLength(0);
    api.close();
    api.open();
    const names = detail.getAnimations().map((a) => (a as CSSAnimation).animationName);
    expect(names).toEqual(["cp-detail-in"]);
  });

  it("closes back into the box and returns focus to the opener", async () => {
    const { root, opener, detail, dialog, api } = mount(400);
    api.open();
    await played(dialog);
    api.close();
    await exited(dialog);
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the detail in the sheet until the sheet's exit has played", async () => {
    const { root, detail, dialog, api } = mount(400);
    api.open();
    await played(dialog);
    api.close();
    expect(detail.parentElement, "in the leaving sheet").toBe(dialog);
    expect(detail.hidden, "shown while it leaves").toBe(false);
    await exited(dialog);
    expect(detail.parentElement, "back in the box").toBe(root);
    expect(detail.hidden).toBe(true);
  });

  it("stays open when opened again while the sheet leaves", async () => {
    const { opener, detail, heading, dialog, api } = mount(400);
    api.open();
    await played(dialog);
    api.close();
    api.open();
    await played(dialog);
    expect(dialog.open).toBe(true);
    expect(detail.parentElement).toBe(dialog);
    expect(detail.hidden).toBe(false);
    expect(document.activeElement).toBe(heading);
    api.close();
    await exited(dialog);
    expect(document.activeElement, "focus back on the first opener").toBe(opener);
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

  it("returns focus to the link of the entry opened last while the detail stayed docked", () => {
    const { opener, close, api } = mount(1000);
    const other = document.createElement("a");
    other.href = "#other";
    other.textContent = "Other";
    opener.after(other);
    api.open();
    other.focus();
    api.open();
    close.focus();
    api.open();
    api.close();
    expect(document.activeElement).toBe(other);
  });

  it.each([
    ["Close", (m: { close: HTMLButtonElement }) => userEvent.click(m.close)],
    ["Escape", () => userEvent.keyboard("{Escape}")],
    ["a press outside", () => userEvent.click(document.body, { position: { x: 5, y: 5 } })],
  ])(
    "goes back on %s, and the route closes the sheet with focus on the row's link",
    async (_, act) => {
      const m = await routed(400);
      const back = popped();
      await act(m);
      await back;
      await exited(m.dialog);
      expect(m.onDismiss).toHaveBeenCalledTimes(1);
      expect(m.dialog.open).toBe(false);
      expect(m.detail.hidden).toBe(true);
      expect(document.activeElement).toBe(m.opener);
    },
  );

  it("closes the sheet on Back, with focus on the row's link", async () => {
    const m = await routed(400);
    const back = popped();
    history.back();
    await back;
    await exited(m.dialog);
    expect(m.onDismiss).not.toHaveBeenCalled();
    expect(m.detail.hidden).toBe(true);
    expect(document.activeElement).toBe(m.opener);
  });

  it("closes the docked detail on Back, with focus on the row's link", async () => {
    const m = await routed(1000);
    const back = popped();
    history.back();
    await back;
    expect(m.detail.hidden).toBe(true);
    expect(document.activeElement).toBe(m.opener);
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

  it("closes nothing on a press inside the sheet or one that starts inside and ends outside", async () => {
    const onDismiss = vi.fn();
    const { heading, dialog, api } = mount(400, { onDismiss });
    api.open();
    await played(dialog);
    await userEvent.click(heading);
    const box = dialog.getBoundingClientRect();
    const inside = { bubbles: true, clientX: box.left + 10, clientY: box.top + 10 };
    const out = { bubbles: true, clientX: 5, clientY: 5 };
    dialog.dispatchEvent(new PointerEvent("pointerdown", inside));
    dialog.dispatchEvent(new MouseEvent("click", out));
    expect(onDismiss).not.toHaveBeenCalled();
    dialog.dispatchEvent(new PointerEvent("pointerdown", out));
    dialog.dispatchEvent(new MouseEvent("click", out));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hands a close the engine makes on its own to onDismiss, and opens the sheet again", async () => {
    const onDismiss = vi.fn();
    const { dialog, api } = mount(400, { onDismiss });
    api.open();
    const closed = new Promise((r) => {
      dialog.addEventListener("close", r, { once: true });
    });
    dialog.close();
    await closed;
    expect(onDismiss).toHaveBeenCalledTimes(1);
    api.open();
    expect(dialog.open).toBe(true);
  });

  it("leaves a sheet the engine closed shut when the box resizes before its close event", async () => {
    const onDismiss = vi.fn();
    const { root, dialog, api } = mount(400, { onDismiss });
    api.open();
    await frames();
    // The close event is a queued task, so a resize frame can run first.
    const held = (e: Event): void => {
      if (e.target === dialog) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("close", held, { capture: true });
    dialog.close();
    root.style.inlineSize = "420px";
    await frames(3);
    window.removeEventListener("close", held, { capture: true });
    expect(dialog.open).toBe(false);
    dialog.dispatchEvent(new Event("close"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, Close and an engine close without onDismiss", async () => {
    const { detail, close, dialog, api } = mount(400);
    api.open();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await exited(dialog);
    expect(detail.hidden, "Escape").toBe(true);
    api.open();
    close.click();
    await exited(dialog);
    expect(dialog.open, "Close").toBe(false);
    expect(detail.hidden, "Close").toBe(true);
    api.open();
    const closed = new Promise((r) => {
      dialog.addEventListener("close", r, { once: true });
    });
    dialog.close();
    await closed;
    await exited(dialog);
    expect(detail.hidden, "engine close").toBe(true);
  });

  it("closes and removes its dialog when the signal aborts", () => {
    const { root, opener, detail, api } = mount(400);
    api.open();
    life.abort();
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(root.nextElementSibling).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("puts the detail back at once when the signal aborts while the sheet leaves", async () => {
    const { root, opener, detail, dialog, api } = mount(400);
    api.open();
    await played(dialog);
    api.close();
    life.abort();
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(root.nextElementSibling).toBeNull();
    expect(document.activeElement).toBe(opener);
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
