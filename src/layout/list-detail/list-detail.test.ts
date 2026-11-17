import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { installDialogs } from "../../overlays/dialog/dialog.js";
import {
  type DetailCloseEvent,
  type DetailOpenEvent,
  enhanceListDetail,
  type ListDetailOptions,
} from "./list-detail.js";

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
  document.documentElement.style.removeProperty("scroll-padding-top");
  document.body.replaceChildren();
  history.replaceState(history.state, "", location.pathname + location.search);
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
      m.api.show(null);
    },
    { signal: life.signal },
  );
  history.pushState({ entry: "entry" }, "");
  m.api.show("entry");
  await played(m.dialog);
  return { ...m, onDismiss };
}

/** A button outside the list and its detail. */
function outsideButton(root: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Elsewhere";
  root.before(button);
  return button;
}

const popped = (): Promise<unknown> =>
  new Promise((r) => {
    addEventListener("popstate", r, { once: true });
  });

describe("enhanceListDetail", () => {
  it("docks the detail beside the list in a wide box and focuses its heading", () => {
    const { root, detail, heading, dialog, api } = mount(1000);
    api.show("entry");
    expect(detail.hidden).toBe(false);
    expect(detail.parentElement).toBe(root);
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  it("docks from a 52rem box and opens the sheet in a box a pixel narrower", () => {
    const at = mount(832);
    at.api.show("entry");
    expect(at.root.hasAttribute("data-cp-docked"), "52rem").toBe(true);
    expect(at.dialog.open, "52rem").toBe(false);
    life.abort();
    life = new AbortController();
    document.body.replaceChildren();
    const under = mount(831);
    under.api.show("entry");
    expect(under.root.hasAttribute("data-cp-docked"), "a pixel under").toBe(false);
    expect(under.dialog.open, "a pixel under").toBe(true);
  });

  it("shows the detail in a labelled, modal, full-height sheet at the inline end in a narrow box", () => {
    const { root, detail, heading, dialog, api } = mount(400);
    api.show("entry", { still: true });
    expect(dialog.matches(":modal")).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe("detail-title");
    expect(dialog.hasAttribute("data-cp-own-close"), "its close requests are its own").toBe(true);
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
    api.show("entry", { still: true });
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
    api.show("entry", { still: true });
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
    api.show("entry");
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
    api.show("entry");
    expect(root.hasAttribute("data-cp-docked")).toBe(true);
  });

  it("opens still in the sheet, then lets its motion return after it paints", async () => {
    const { dialog, api } = mount(400);
    api.show("entry", { still: true });
    expect(dialog.getAnimations(), "no entrance").toHaveLength(0);
    await frames(3);
    expect(dialog.hasAttribute("data-cp-still")).toBe(false);
  });

  it("opens still docked and keeps still after it paints; the next open plays the entrance", async () => {
    const { detail, api } = mount(1000);
    api.show("entry", { still: true });
    await frames(3);
    expect(detail.getAnimations(), "no entrance after the still open").toHaveLength(0);
    api.show(null);
    api.show("entry");
    const names = detail.getAnimations().map((a) => (a as CSSAnimation).animationName);
    expect(names).toEqual(["cp-detail-in"]);
  });

  it("closes back into the box and returns focus to the opener", async () => {
    const { root, opener, detail, dialog, api } = mount(400);
    api.show("entry");
    await played(dialog);
    api.show(null);
    await exited(dialog);
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the detail in the sheet until the sheet's exit has played", async () => {
    const { root, detail, dialog, api } = mount(400);
    api.show("entry");
    await played(dialog);
    api.show(null);
    expect(detail.parentElement, "in the leaving sheet").toBe(dialog);
    expect(detail.hidden, "shown while it leaves").toBe(false);
    await exited(dialog);
    expect(detail.parentElement, "back in the box").toBe(root);
    expect(detail.hidden).toBe(true);
  });

  it("stays open when opened again while the sheet leaves", async () => {
    const { opener, detail, heading, dialog, api } = mount(400);
    api.show("entry");
    await played(dialog);
    api.show(null);
    api.show("entry");
    await played(dialog);
    expect(dialog.open).toBe(true);
    expect(detail.parentElement).toBe(dialog);
    expect(detail.hidden).toBe(false);
    expect(document.activeElement).toBe(heading);
    api.show(null);
    await exited(dialog);
    expect(document.activeElement, "focus back on the first opener").toBe(opener);
  });

  it("leaves a second show() of the same entry where it is and refocuses the heading", () => {
    const { opener, heading, close, api } = mount(1000);
    api.show("entry");
    close.focus();
    api.show("entry");
    expect(document.activeElement).toBe(heading);
    api.show(null);
    expect(document.activeElement).toBe(opener);
  });

  it("names the entry it shows, and says so on its root when it opens, changes and closes", () => {
    const { root, heading, api } = mount(1000);
    const said: string[] = [];
    root.addEventListener("detailopen", (e) => {
      const { key, previous } = (e as DetailOpenEvent).detail;
      said.push(
        `open ${key} from ${String(previous)}, focus ${document.activeElement?.tagName ?? ""}`,
      );
    });
    root.addEventListener("detailclose", (e) => {
      said.push(`close ${(e as DetailCloseEvent).detail.key}`);
    });
    expect(api.key).toBe(null);
    api.show("a");
    api.show("a");
    api.show("b");
    expect(api.key).toBe("b");
    expect(document.activeElement).toBe(heading);
    api.show(null);
    api.show(null);
    expect(api.key).toBe(null);
    expect(said).toEqual(["open a from null, focus A", "open b from a, focus H2", "close b"]);
  });

  it("says detailclose after the sheet has closed, so its listener can move focus out of it", async () => {
    const { root, dialog, api } = mount(400);
    const elsewhere = outsideButton(root);
    api.show("entry");
    await played(dialog);
    const open: boolean[] = [];
    root.addEventListener("detailclose", () => {
      open.push(dialog.open);
      elsewhere.focus();
    });
    api.show(null);
    await exited(dialog);
    expect(open, "one detailclose, with the sheet shut").toEqual([false]);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("says detailclose once per hide, before the detailopen of a show() that keeps the leaving sheet open", async () => {
    const { root, dialog, api } = mount(400);
    const said: string[] = [];
    root.addEventListener("detailopen", (e) => {
      said.push(`open ${(e as DetailOpenEvent).detail.key}`);
    });
    root.addEventListener("detailclose", (e) => {
      said.push(`close ${(e as DetailCloseEvent).detail.key}`);
    });
    api.show("a");
    await played(dialog);
    api.show(null);
    api.show("b");
    await played(dialog);
    api.show(null);
    await exited(dialog);
    expect(said).toEqual(["open a", "close a", "open b", "close b"]);
  });

  it("leaves focus the reader moved out of the detail where it is", () => {
    const { root, api } = mount(1000);
    const elsewhere = outsideButton(root);
    api.show("entry");
    elsewhere.focus();
    api.show(null);
    expect(document.activeElement, "on another control").toBe(elsewhere);
    api.show("entry");
    elsewhere.focus();
    elsewhere.blur();
    api.show(null);
    expect(document.activeElement, "on the page").toBe(document.body);
  });

  /** A part of the page far below the list, and a link to it in the detail. */
  function farPart(m: { root: HTMLElement; detail: HTMLElement }) {
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    const part = document.createElement("h2");
    part.id = "far-part";
    part.textContent = "Far";
    m.root.after(tall, part);
    const link = document.createElement("a");
    link.href = "#far-part";
    link.textContent = "To the far part";
    m.detail.querySelector(".cp-detail-body")!.append(link);
    return { part, link };
  }

  /** Hides the detail on a fragment naming no entry, as a route does. */
  function hideOn(api: { show(key: string | null): void }, keys: Record<string, string> = {}) {
    addEventListener(
      "hashchange",
      () => {
        const key = keys[location.hash];
        api.show(key ?? null);
      },
      { signal: life.signal },
    );
  }

  function closed(root: HTMLElement): Promise<unknown> {
    return new Promise((r) => {
      root.addEventListener("detailclose", r, { once: true });
    });
  }

  it.each([
    ["in the sheet, from a link in the detail", 400, false],
    ["docked, from a link in the detail", 1000, false],
    ["docked, from a link beside the list", 1000, true],
  ])(
    "ends focus %s on the part of the page it went to, its top in view",
    async (_, width, beside) => {
      const m = mount(width);
      const { part, link } = farPart(m);
      if (beside) {
        m.root.before(link);
      }
      hideOn(m.api);
      m.api.show("entry");
      await played(m.dialog);
      const done = closed(m.root);
      await userEvent.click(link);
      await done;
      await exited(m.dialog);
      expect(document.activeElement, "on the part").toBe(part);
      expect(part.getAttribute("tabindex"), "focusable until it loses focus").toBe("-1");
      const top = part.getBoundingClientRect().top;
      expect(top, "its top in the view").toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(innerHeight);
      m.opener.focus();
      expect(part.hasAttribute("tabindex"), "no tab stop left behind").toBe(false);
    },
  );

  it("returns focus to the opener after a link press the page took over", async () => {
    const m = mount(400);
    const { link } = farPart(m);
    link.addEventListener("click", (e) => {
      e.preventDefault();
    });
    m.api.show("entry");
    await played(m.dialog);
    await userEvent.click(link);
    m.api.show(null);
    await exited(m.dialog);
    expect(document.activeElement).toBe(m.opener);
  });

  it("returns focus to the opener on a Close pressed after a link in the sheet the route kept open", async () => {
    const m = mount(400);
    const { link } = farPart(m);
    m.api.show("entry");
    await played(m.dialog);
    await userEvent.click(link);
    expect(m.dialog.open, "the route kept the sheet").toBe(true);
    await userEvent.click(m.close);
    await exited(m.dialog);
    expect(document.activeElement).toBe(m.opener);
  });

  it("returns focus to the opener when a link in the detail showed another entry before the hide", async () => {
    const m = mount(400);
    const { link } = farPart(m);
    // The part the link names is an entry's own row, as a list's row can be.
    hideOn(m.api, { "#far-part": "other" });
    m.api.show("entry");
    await played(m.dialog);
    const shown = new Promise((r) => {
      m.root.addEventListener("detailopen", r, { once: true });
    });
    await userEvent.click(link);
    await shown;
    const done = closed(m.root);
    location.hash = "#gone";
    await done;
    await exited(m.dialog);
    expect(document.activeElement).toBe(m.opener);
  });

  it("refocuses a shown heading still partly in view without scrolling the page", async () => {
    const { root, opener, heading, api } = mount(1000);
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    root.after(tall);
    api.show("entry");
    const box = heading.getBoundingClientRect();
    scrollTo(0, scrollY + box.top + box.height / 2);
    await frames();
    const y = scrollY;
    expect(heading.getBoundingClientRect().top, "the heading's top is above the view").toBeLessThan(
      0,
    );
    expect(heading.getBoundingClientRect().bottom, "its bottom is in it").toBeGreaterThan(0);
    opener.focus({ preventScroll: true });
    api.show("entry");
    await frames();
    expect(document.activeElement).toBe(heading);
    expect(scrollY).toBe(y);
  });

  it("brings back a shown heading entirely out of view, scrolling only as far as its distance out", async () => {
    const { root, opener, heading, api } = mount(1000);
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    root.after(tall);
    api.show("entry");
    scrollTo(0, innerHeight);
    await frames();
    const y = scrollY;
    const out = heading.getBoundingClientRect();
    expect(out.bottom, "the heading is above the view").toBeLessThanOrEqual(0);
    opener.focus({ preventScroll: true });
    api.show("entry");
    await frames();
    expect(document.activeElement).toBe(heading);
    const back = heading.getBoundingClientRect();
    expect(back.top, "the heading's top at the view's top").toBeCloseTo(0, 0);
    expect(y - scrollY, "scrolled by its distance out").toBeCloseTo(-out.top, 0);
  });

  it("counts a heading under the page's scroll padding as out of view, and brings it out from under it", async () => {
    const { root, opener, heading, api } = mount(1000);
    const above = document.createElement("div");
    above.style.blockSize = "100vh";
    root.before(above);
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    root.after(tall);
    // The band a sticky bar covers, which the page keeps clear when it scrolls.
    document.documentElement.style.setProperty("scroll-padding-top", "120px");
    api.show("entry");
    const box = heading.getBoundingClientRect();
    scrollTo(0, scrollY + box.bottom - 60);
    await frames();
    const y = scrollY;
    const under = heading.getBoundingClientRect();
    expect(under.bottom, "the heading is in the view").toBeGreaterThan(0);
    expect(under.bottom, "all of it under the band").toBeLessThanOrEqual(120);
    opener.focus({ preventScroll: true });
    api.show("entry");
    await frames();
    expect(document.activeElement).toBe(heading);
    expect(heading.getBoundingClientRect().top, "its top at the band's edge").toBeCloseTo(120, 0);
    expect(y - scrollY, "scrolled by its distance under the band").toBeCloseTo(120 - under.top, 0);
  });

  it("docks a still show without moving focus or the page, and still focuses the sheet's heading", async () => {
    const { root, api } = mount(1000);
    const above = document.createElement("div");
    above.style.blockSize = "200vh";
    root.before(above);
    (document.activeElement as HTMLElement).blur();
    scrollTo(0, 0);
    await frames();
    api.show("entry", { still: true });
    await frames();
    expect(document.activeElement, "focus at the page's start").toBe(document.body);
    expect(scrollY, "the page stays at its top").toBe(0);
    life.abort();
    life = new AbortController();
    document.body.replaceChildren();
    const narrow = mount(400);
    narrow.api.show("entry", { still: true });
    expect(document.activeElement, "the sheet's heading").toBe(narrow.heading);
  });

  it("returns focus to the link of the entry opened last while the detail stayed docked", () => {
    const { opener, close, api } = mount(1000);
    const other = document.createElement("a");
    other.href = "#other";
    other.textContent = "Other";
    opener.after(other);
    api.show("entry");
    other.focus();
    api.show("entry");
    close.focus();
    api.show("entry");
    api.show(null);
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
    api.show("entry");
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    close.click();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("asks a slow route once for one Escape on a page that runs installDialogs", async () => {
    installDialogs({ signal: life.signal });
    const route = { close: (): void => undefined };
    const onDismiss = vi.fn(() => {
      setTimeout(() => {
        route.close();
      }, 400);
    });
    const m = mount(400, { onDismiss });
    route.close = () => {
      m.api.show(null);
    };
    m.api.show("entry");
    await played(m.dialog);
    expect(document.activeElement).toBe(m.heading);
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 700));
    await exited(m.dialog);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect([m.dialog.open, m.detail.hidden]).toEqual([false, true]);
    expect(document.activeElement).toBe(m.opener);
  });

  it("keeps the sheet open for a route that refuses on a page that runs installDialogs", async () => {
    installDialogs({ signal: life.signal });
    const onDismiss = vi.fn();
    const m = mount(400, { onDismiss });
    m.api.show("entry");
    await played(m.dialog);
    await userEvent.keyboard("{Escape}");
    // Longer than the sheet's 280ms exit in script.
    await new Promise((r) => setTimeout(r, 600));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect([m.dialog.open, m.detail.hidden]).toEqual([true, false]);
    expect(m.detail.parentElement).toBe(m.dialog);
    expect(m.dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => onDismiss.mock.calls.length).toBe(2);
  });

  it("closes the sheet for a route that closes inside onDismiss on a page that runs installDialogs", async () => {
    installDialogs({ signal: life.signal });
    const route = { close: (): void => undefined };
    const onDismiss = vi.fn(() => {
      route.close();
    });
    const m = mount(400, { onDismiss });
    route.close = () => {
      m.api.show(null);
    };
    m.api.show("entry");
    await played(m.dialog);
    await userEvent.keyboard("{Escape}");
    await exited(m.dialog);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect([m.dialog.open, m.detail.hidden]).toEqual([false, true]);
    expect(m.detail.parentElement).toBe(m.root);
    expect(document.activeElement).toBe(m.opener);
  });

  it("keeps a sheet reopened during an exit the engine cut short", async () => {
    installDialogs({ signal: life.signal });
    const route = { close: (): void => undefined };
    const onDismiss = vi.fn(() => {
      route.close();
    });
    const m = mount(400, { onDismiss });
    route.close = () => {
      m.api.show(null);
    };
    m.api.show("entry");
    await played(m.dialog);
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 0));
    // Held, so the reopen lands inside the exit in script on a slow host.
    const exit = m.dialog
      .getAnimations()
      .filter((a) => !(a instanceof CSSTransition || a instanceof CSSAnimation));
    for (const a of exit) {
      a.pause();
    }
    // No user activation between the two, so the engine closes the sheet
    // itself while an exit in script plays on.
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 0));
    m.opener.focus();
    m.api.show("entry");
    for (const a of exit.filter((e) => e.playState === "paused")) {
      a.play();
    }
    await played(m.dialog);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.dialog.open).toBe(true);
    expect(m.detail.parentElement).toBe(m.dialog);
    expect(m.detail.hidden).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes the sheet when it is opened and closed again in one task while it leaves", async () => {
    const { root, opener, detail, dialog, api } = mount(400);
    api.show("entry");
    await played(dialog);
    api.show(null);
    api.show("entry");
    api.show(null);
    await exited(dialog);
    expect([dialog.open, detail.hidden]).toEqual([false, true]);
    expect(detail.parentElement).toBe(root);
    expect(document.activeElement).toBe(opener);
  });

  it("opens no sheet while the list is hidden, and opens it once the list shows", async () => {
    const { root, detail, heading, dialog, api } = mount(400);
    root.hidden = true;
    api.show("entry", { still: true });
    expect(dialog.open, "no sheet over the page").toBe(false);
    expect(detail.parentElement).toBe(root);
    root.hidden = false;
    await frames(3);
    expect(dialog.matches(":modal")).toBe(true);
    expect(detail.parentElement).toBe(dialog);
    expect(document.activeElement).toBe(heading);
  });

  it("shuts an open sheet without dismissing while the list is hidden, and opens it again once it shows", async () => {
    const onDismiss = vi.fn();
    const { root, detail, dialog, api } = mount(400, { onDismiss });
    api.show("entry", { still: true });
    root.hidden = true;
    await frames(3);
    expect(dialog.open, "shut while hidden").toBe(false);
    expect(detail.parentElement).toBe(root);
    root.hidden = false;
    await frames(3);
    expect(dialog.open, "open once shown").toBe(true);
    expect(detail.parentElement).toBe(dialog);
    expect(detail.hidden).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("closes nothing on a press inside the sheet or one that starts inside and ends outside", async () => {
    const onDismiss = vi.fn();
    const { heading, dialog, api } = mount(400, { onDismiss });
    api.show("entry");
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
    api.show("entry");
    const closed = new Promise((r) => {
      dialog.addEventListener("close", r, { once: true });
    });
    dialog.close();
    await closed;
    expect(onDismiss).toHaveBeenCalledTimes(1);
    api.show("entry");
    expect(dialog.open).toBe(true);
  });

  it("leaves a sheet the engine closed shut when the box resizes before its close event", async () => {
    const onDismiss = vi.fn();
    const { root, dialog, api } = mount(400, { onDismiss });
    api.show("entry");
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
    api.show("entry");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await exited(dialog);
    expect(detail.hidden, "Escape").toBe(true);
    api.show("entry");
    close.click();
    await exited(dialog);
    expect(dialog.open, "Close").toBe(false);
    expect(detail.hidden, "Close").toBe(true);
    api.show("entry");
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
    api.show("entry");
    life.abort();
    expect(detail.hidden).toBe(true);
    expect(detail.parentElement).toBe(root);
    expect(root.nextElementSibling).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("puts the detail back at once when the signal aborts while the sheet leaves", async () => {
    const { root, opener, detail, dialog, api } = mount(400);
    const closes = vi.fn();
    root.addEventListener("detailclose", closes);
    api.show("entry");
    await played(dialog);
    api.show(null);
    life.abort();
    expect(closes, "its detailclose").toHaveBeenCalledTimes(1);
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
