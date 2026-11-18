import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// WebKit throws on a page's 101st pushState or replaceState in 10 seconds
// (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/History.cpp,
// stateObjectAdded), and the tables make several a case, so each case
// starts once fewer than half that many ran in the last 10 seconds.
const WINDOW = 10_000;
const stamps: number[] = [];
const { pushState, replaceState } = History.prototype;
beforeAll(() => {
  history.pushState = (...args) => {
    stamps.push(performance.now());
    pushState.apply(history, args);
  };
  history.replaceState = (...args) => {
    stamps.push(performance.now());
    replaceState.apply(history, args);
  };
});
afterAll(() => {
  Reflect.deleteProperty(history, "pushState");
  Reflect.deleteProperty(history, "replaceState");
});
beforeEach(async () => {
  const recent = (): number[] => stamps.filter((t) => t > performance.now() - WINDOW);
  for (let r = recent(); r.length >= 50; r = recent()) {
    await new Promise((done) => setTimeout(done, r[r.length - 50]! + WINDOW - performance.now()));
  }
});

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
  document.documentElement.style.removeProperty("overflow-anchor");
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

/** Asserts `actual` is within a pixel of `expected`: WebKit scrolls to whole
 *  pixels, rounding a fractional offset up
 *  (https://github.com/WebKit/WebKit/blob/9fea36ebc8f5d9bd116ccdbc2e7130eeb02217b3/Source/WebCore/page/LocalFrameView.cpp#L3433). */
function nearPixel(actual: number, expected: number, message: string): void {
  expect(Math.abs(actual - expected), message).toBeLessThan(1);
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

  it("says detailclose after the sheet has closed, and a listener's own focus move stands", async () => {
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

  /** A wide box of `rows` row links, opened on a still load, so the opener
   *  is the page, and the detail's entry is the second row. */
  function loaded(rows: number, options: Omit<ListDetailOptions, "signal"> = {}) {
    const m = mount(1000, options);
    m.opener.remove();
    const list = document.createElement("ul");
    const links = Array.from({ length: rows }, (_, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#row-${String(i)}`;
      a.textContent = `Row ${String(i)}`;
      li.append(a);
      list.append(li);
      return a;
    });
    m.root.prepend(list);
    (document.activeElement as HTMLElement | null)?.blur();
    m.api.show("row-1", { still: true });
    m.close.focus();
    return { ...m, list, links };
  }

  it("falls back to the list column's heading, focusable until it loses focus, when no link is drawn", () => {
    const m = loaded(0);
    const heading = document.createElement("h3");
    heading.textContent = "Library";
    m.list.before(heading);
    const column = document.createElement("div");
    column.append(heading, m.list);
    m.root.prepend(column);
    m.api.show(null);
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    outsideButton(m.root).focus();
    expect(heading.hasAttribute("tabindex"), "no tab stop left behind").toBe(false);
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

  it("ends focus on an a element its fragment names by name, as the spec finds the part", async () => {
    const m = mount(400);
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    const part = document.createElement("a");
    part.name = "far-name";
    part.textContent = "Far";
    m.root.after(tall, part);
    const link = document.createElement("a");
    link.href = "#far-name";
    link.textContent = "To the far part";
    m.detail.querySelector(".cp-detail-body")!.append(link);
    hideOn(m.api);
    m.api.show("entry");
    await played(m.dialog);
    const done = closed(m.root);
    await userEvent.click(link);
    await done;
    expect(document.activeElement).toBe(part);
  });

  /** A hide with no navigation in progress, where focus is when it comes,
   *  and what the list draws for focus to return to. */
  type Cause = "route" | "close" | "escape" | "outside";
  type At = "detail" | "page" | "moved";
  type Drawn = "opener" | "entry" | "roving" | "link" | "heading";
  type Ends = Drawn | "moved";

  /** A list column of three row links, or of only its heading, and the
   *  detail on `row-1` with a link to a part of the page far below. With
   *  `opener` the second row showed the entry; otherwise the page did, and
   *  `entry` finds that row only when `drawn` is `entry`. With `above`, a
   *  spacer a window and a half tall starts the page. */
  async function scene(width: number, drawn: Drawn, above = false) {
    const m = mount(
      width,
      drawn === "opener"
        ? {}
        : {
            entry: (key) =>
              drawn === "entry" ? document.querySelector<HTMLElement>(`a[href="#${key}"]`) : null,
          },
    );
    m.opener.remove();
    // The docked detail's hide shortens the box, and scroll anchoring would
    // move the page for it; the rows check the module's own scroll.
    document.documentElement.style.overflowAnchor = "none";
    if (above) {
      const spacer = document.createElement("div");
      spacer.style.blockSize = "150vh";
      document.body.prepend(spacer);
    }
    const column = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = "Library";
    const list = document.createElement("ul");
    const links = (drawn === "heading" ? [] : [0, 1, 2]).map((i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#row-${String(i)}`;
      a.textContent = `Row ${String(i)}`;
      li.append(a);
      list.append(li);
      return a;
    });
    column.append(heading, list);
    m.root.prepend(column);
    if (drawn === "roving") {
      links[2]!.tabIndex = 0;
    }
    const far = farPart(m);
    const elsewhere = outsideButton(m.root);
    if (drawn === "opener") {
      links[1]!.focus();
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    m.api.show("row-1");
    await played(m.dialog);
    const ends: Record<Ends, HTMLElement | undefined> = {
      opener: links[1],
      entry: links[1],
      roving: links[2],
      link: links[0],
      heading,
      moved: elsewhere,
    };
    return { ...m, ...far, elsewhere, ends };
  }
  type Scene = Awaited<ReturnType<typeof scene>>;

  const task = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const put: Record<At, (s: Scene) => void> = {
    detail: () => undefined,
    page: () => {
      (document.activeElement as HTMLElement | null)?.blur();
    },
    moved: (s) => {
      s.elsewhere.focus();
    },
  };
  /** Presses `el` from the keyboard, since a pointer press first scrolls
   *  what it presses into view. */
  const keys = (el: HTMLElement, typed: string): Promise<void> => {
    el.focus({ preventScroll: true });
    return userEvent.keyboard(typed);
  };
  const act: Record<Cause, (s: Scene) => Promise<unknown>> = {
    route: async (s) => {
      s.api.show(null);
    },
    close: (s) => keys(s.close, "{Enter}"),
    escape: () => userEvent.keyboard("{Escape}"),
    outside: () => userEvent.click(document.body, { position: { x: 5, y: 5 } }),
  };

  const DOCK = 1000;
  const SHEET = 400;
  const where = (width: number): string => (width === DOCK ? "docked" : "in the sheet");
  type Row = readonly [string, number, Cause, At, Drawn, Ends];
  const row = (width: number, cause: Cause, at: At, drawn: Drawn, ends: Ends): Row => [
    `${where(width)}, ${cause} with focus ${at} and the ${drawn} drawn, ends on the ${ends}`,
    width,
    cause,
    at,
    drawn,
    ends,
  ];
  const DRAWN: readonly Drawn[] = ["opener", "entry", "roving", "link", "heading"];
  // Escape and a press outside close only the sheet, and the modal sheet
  // keeps focus from moving outside it.
  const ROWS: readonly Row[] = DRAWN.flatMap((d) => [
    row(DOCK, "route", "detail", d, d),
    row(DOCK, "route", "page", d, d),
    row(DOCK, "route", "moved", d, "moved"),
    row(DOCK, "close", "detail", d, d),
    row(SHEET, "route", "detail", d, d),
    row(SHEET, "route", "page", d, d),
    row(SHEET, "close", "detail", d, d),
    row(SHEET, "escape", "detail", d, d),
    row(SHEET, "outside", "detail", d, d),
  ]);

  it.each(ROWS)("after a hide %s, in view", async (_, width, cause, at, drawn, ends) => {
    const s = await scene(width, drawn);
    put[at](s);
    const y = scrollY;
    await act[cause](s);
    await exited(s.dialog);
    const want = s.ends[ends];
    expect(document.activeElement, ends).toBe(want);
    const r = want!.getBoundingClientRect();
    expect(r.bottom > 0 && r.top < innerHeight, "in view").toBe(true);
    expect(scrollY, "the page kept its scroll").toBe(y);
  });

  /** How the navigation the hide comes during, or after, starts: its type
   *  (push, replace, traverse) and its source, or a press that commits
   *  nothing, before the route's hide. */
  type Kind =
    | "press"
    | "beside"
    | "script"
    | "stamped"
    | "intercept-hide"
    | "replace"
    | "back"
    | "kept"
    | "intercepted"
    | "ctrl"
    | "shift"
    | "ctrl-replace"
    | "shift-replace"
    | "prevented"
    | "ctrl-escape"
    | "reopened"
    | "forward";
  /** Where its destination's fragment goes. */
  type Dest =
    "heading" | "link" | "button" | "held" | "top" | "TOP" | "empty" | "nowhere" | "inside";
  type NavEnds = "opener" | "entry" | "dest" | "top";
  const HREF: Record<Dest, string> = {
    heading: "#far-part",
    link: "#far-link",
    button: "#far-button",
    held: "#far-held",
    top: "#top",
    TOP: "#TOP",
    empty: "#",
    nowhere: "#nowhere",
    inside: "#inside",
  };
  const TOPS = new Set<Dest>(["top", "TOP", "empty"]);

  /** The scene at the entry's own address, `#row-1` (for Back, after an
   *  entry at the destination), with a link to it in the detail and every
   *  destination drawn: below the list a heading, a link, a button and a
   *  heading the page keeps focusable, and one element in the detail. With
   *  `top`, a spacer starts the page. */
  async function navScene(width: number, kind: Kind, drawn: Drawn, dest: Dest, top: boolean) {
    if (kind === "back") {
      history.replaceState(history.state, "", HREF[dest]);
      history.pushState(history.state, "", "#row-1");
    } else {
      history.replaceState(history.state, "", "#row-1");
    }
    const s = await scene(width, drawn, top);
    const link = document.createElement("a");
    link.id = "far-link";
    link.href = "#row-0";
    link.textContent = "Far link";
    const button = document.createElement("button");
    button.id = "far-button";
    button.type = "button";
    button.textContent = "Far button";
    const held = document.createElement("h2");
    held.id = "far-held";
    held.tabIndex = -1;
    held.textContent = "Far held";
    s.part.after(link, button, held);
    const inside = document.createElement("span");
    inside.id = "inside";
    inside.textContent = "Inside";
    s.detail.querySelector(".cp-detail-body")!.prepend(inside);
    s.link.href = HREF[dest];
    const targets: Record<Dest, HTMLElement | undefined> = {
      heading: s.part,
      link,
      button,
      held,
      top: undefined,
      TOP: undefined,
      empty: undefined,
      nowhere: undefined,
      inside: undefined,
    };
    return { ...s, target: targets[dest], href: HREF[dest] };
  }
  type NavScene = Awaited<ReturnType<typeof navScene>>;

  /** The route: the entry's address shows it, any other hides it. */
  const route = (s: NavScene): void => {
    hideOn(s.api, { "#row-1": "row-1" });
  };
  const nav = (globalThis as { readonly navigation?: Navigation }).navigation!;
  /** A route on the Navigation API's `intercept()`, which fires no
   *  hashchange, keeping scroll and focus to itself; `then` runs in its
   *  handler after an await. */
  const intercepting = (then?: () => void): void => {
    nav.addEventListener(
      "navigate",
      (e) => {
        if (e.hashChange && e.canIntercept) {
          e.intercept({
            scroll: "manual",
            focusReset: "manual",
            handler: async () => {
              await task();
              then?.();
            },
          });
        }
      },
      { signal: life.signal },
    );
  };
  /** Runs `start`, and waits for the route's hide. */
  const hidesOn = async (s: NavScene, start: () => unknown): Promise<void> => {
    const done = closed(s.root);
    await start();
    await done;
  };
  /** A modifier press, then a router stamping state on the same address, as
   *  grelot keeps its scroll, then the route's hide. */
  const modifiedThenStamped = async (s: NavScene, typed: string): Promise<void> => {
    await keys(s.link, typed);
    await task();
    history.replaceState({ ...(history.state as object | null), scroll: 0 }, "", location.href);
    await task();
    s.api.show(null);
  };
  /** A press the route hides on, then Back, which shows the entry again. */
  const pressThenBack = async (s: NavScene): Promise<void> => {
    route(s);
    await hidesOn(s, () => keys(s.link, "{Enter}"));
    await exited(s.dialog);
    const shown = new Promise((r) => {
      s.root.addEventListener("detailopen", r, { once: true });
    });
    history.back();
    await shown;
    await played(s.dialog);
    await task();
  };
  const go: Record<Kind, (s: NavScene) => Promise<unknown>> = {
    press: (s) => {
      route(s);
      return hidesOn(s, () => keys(s.link, "{Enter}"));
    },
    beside: (s) => {
      s.root.before(s.link);
      route(s);
      return hidesOn(s, () => keys(s.link, "{Enter}"));
    },
    script: (s) => {
      route(s);
      return hidesOn(s, () => {
        location.hash = s.href;
      });
    },
    // The route stamps the entry's state before it hides, as grelot keeps
    // its scroll there.
    stamped: (s) => {
      addEventListener(
        "popstate",
        () => {
          history.replaceState({ ...(history.state as object | null), scroll: 0 }, "");
          s.api.show(null);
        },
        { signal: life.signal },
      );
      return hidesOn(s, () => keys(s.link, "{Enter}"));
    },
    "intercept-hide": (s) => {
      intercepting(() => {
        s.api.show(null);
      });
      return hidesOn(s, () => keys(s.link, "{Enter}"));
    },
    replace: (s) => {
      route(s);
      return hidesOn(s, () => {
        location.replace(s.href);
      });
    },
    back: (s) => {
      route(s);
      return hidesOn(s, () => {
        history.back();
      });
    },
    // The route keeps the detail open on the fragment; a later change hides it.
    kept: async (s) => {
      const changed = new Promise((r) => {
        addEventListener("hashchange", r, { once: true });
      });
      await keys(s.link, "{Enter}");
      await changed;
      await task();
      s.api.show(null);
    },
    // The intercepting route keeps the detail open; a later change hides it.
    intercepted: async (s) => {
      intercepting();
      const done = new Promise((r) => {
        nav.addEventListener("navigatesuccess", r, { once: true });
      });
      await keys(s.link, "{Enter}");
      await done;
      await task();
      await task();
      s.api.show(null);
    },
    ctrl: async (s) => {
      await keys(s.link, "{Control>}{Enter}{/Control}");
      await task();
      s.api.show(null);
    },
    shift: async (s) => {
      await keys(s.link, "{Shift>}{Enter}{/Shift}");
      await task();
      s.api.show(null);
    },
    "ctrl-replace": (s) => modifiedThenStamped(s, "{Control>}{Enter}{/Control}"),
    "shift-replace": (s) => modifiedThenStamped(s, "{Shift>}{Enter}{/Shift}"),
    prevented: async (s) => {
      s.link.addEventListener("click", (e) => {
        e.preventDefault();
      });
      await keys(s.link, "{Enter}");
      s.api.show(null);
    },
    "ctrl-escape": async (s) => {
      await userEvent.click(s.link, { modifiers: ["Control"] });
      await task();
      await userEvent.keyboard("{Escape}");
    },
    // Back shows the entry again with focus on the part the press reached.
    reopened: async (s) => {
      await pressThenBack(s);
      s.api.show(null);
    },
    forward: async (s) => {
      await pressThenBack(s);
      await hidesOn(s, () => {
        history.forward();
      });
    },
  };
  /** The kinds that leave the page's scroll where it was. */
  const STILL = new Set<Kind>([
    "intercepted",
    "ctrl",
    "shift",
    "ctrl-replace",
    "shift-replace",
    "prevented",
    "ctrl-escape",
  ]);

  type NavRow = readonly [string, number, Kind, Dest, Drawn, NavEnds];
  const navRow = (width: number, kind: Kind, dest: Dest, drawn: Drawn, ends: NavEnds): NavRow => [
    `${where(width)}, ${kind} to ${HREF[dest]} with the ${drawn} drawn, ends on the ${ends}`,
    width,
    kind,
    dest,
    drawn,
    ends,
  ];
  /** A committed push to a fragment the route hides during. */
  const target = (dest: Dest): NavEnds =>
    TOPS.has(dest) ? "top" : dest === "nowhere" || dest === "inside" ? "opener" : "dest";
  const DESTS: readonly Dest[] = [
    "heading",
    "link",
    "button",
    "held",
    "top",
    "TOP",
    "empty",
    "nowhere",
    "inside",
  ];
  const SOME: readonly Dest[] = ["heading", "button", "top", "nowhere"];
  const NONE: readonly Kind[] = [
    "replace",
    "back",
    "kept",
    "intercepted",
    "ctrl",
    "shift",
    "ctrl-replace",
    "shift-replace",
    "prevented",
  ];
  const NAV_ROWS: readonly NavRow[] = [
    ...[DOCK, SHEET].flatMap((w) => [
      ...DESTS.map((d) => navRow(w, "press", d, "opener", target(d))),
      ...(["script", "stamped", "intercept-hide"] as const).flatMap((k) =>
        SOME.map((d) => navRow(w, k, d, "opener", target(d))),
      ),
      ...NONE.flatMap((k) => [
        navRow(w, k, "heading", "opener", "opener"),
        navRow(w, k, "top", "opener", "opener"),
        navRow(w, k, "heading", "entry", "entry"),
      ]),
      ...(["heading", "link", "button", "held"] as const).map((d) =>
        navRow(w, "reopened", d, "entry", "entry"),
      ),
      ...(["link", "button"] as const).map((d) => navRow(w, "forward", d, "entry", "entry")),
    ]),
    // A link beside the list is inert behind the modal sheet.
    ...SOME.map((d) => navRow(DOCK, "beside", d, "opener", target(d))),
    navRow(SHEET, "ctrl-escape", "heading", "opener", "opener"),
    navRow(SHEET, "ctrl-escape", "top", "opener", "opener"),
    navRow(SHEET, "ctrl-escape", "heading", "entry", "entry"),
  ];

  it.each(NAV_ROWS)("after a hide %s", async (_, width, kind, dest, drawn, ends) => {
    const s = await navScene(width, kind, drawn, dest, ends === "top");
    if (ends === "top") {
      scrollTo(0, document.documentElement.scrollHeight);
      await frames();
    }
    const y = scrollY;
    await go[kind](s);
    await exited(s.dialog);
    if (ends === "top") {
      expect(scrollY, "the page at its start").toBe(0);
      expect(document.activeElement, "not on the row").not.toBe(s.ends.opener);
      expect(s.detail.contains(document.activeElement), "not in the detail").toBe(false);
      await userEvent.tab();
      expect(document.activeElement, "the next Tab on the page's first control").toBe(s.elsewhere);
      return;
    }
    const want = ends === "dest" ? s.target : s.ends[ends];
    expect(document.activeElement, ends).toBe(want);
    const r = want!.getBoundingClientRect();
    if (ends === "dest") {
      expect(r.top, "its top in view").toBeGreaterThanOrEqual(0);
      expect(r.top).toBeLessThan(innerHeight);
    } else {
      expect(r.bottom > 0 && r.top < innerHeight, "in view").toBe(true);
    }
    if (STILL.has(kind)) {
      expect(scrollY, "the page kept its scroll").toBe(y);
    }
  });

  /** Where the route shows what the address names: in `popstate`, in
   *  `hashchange`, a task after it, or 50 ms after it, as a route that
   *  fetches first. */
  type Timing = "popstate" | "hashchange" | "task" | "late";
  /** How the reader left the first entry before the traversal: by its own
   *  row, by a link in the detail to the second entry, or by a link in the
   *  detail to a part of the page (a link, a button, a held heading). */
  type Before = "row" | "link" | "part-link" | "part-button" | "part-held";
  type Travel = "back" | "forward";
  /** The hide after the traversal: the route's, Close, or the route's after a
   *  press on the third row. */
  type Then = "route" | "close" | "press";
  type ListDraws = "entry" | "roving" | "link" | "heading";
  const TIMINGS: readonly Timing[] = ["popstate", "hashchange", "task", "late"];

  /** Three rows a window and a half apart, `#row-0` to `#row-2`, a list
   *  column drawing them or, with `heading`, only its heading while the rows
   *  sit before the box, parts of the page far below, and a link in the
   *  detail. The route shows the row the address names at `timing`. */
  async function travelScene(width: number, draws: ListDraws, timing: Timing) {
    history.replaceState(history.state, "", "#list");
    const rows = [0, 1, 2].map((i) => {
      const a = document.createElement("a");
      a.href = `#row-${String(i)}`;
      a.textContent = `Row ${String(i)}`;
      return a;
    });
    const m = mount(width, {
      entry: (key) => (draws === "entry" ? (rows.find((a) => a.hash === `#${key}`) ?? null) : null),
    });
    m.opener.remove();
    document.documentElement.style.overflowAnchor = "none";
    const list = document.createElement("ul");
    for (const a of rows) {
      const li = document.createElement("li");
      li.style.marginBlockEnd = "150vh";
      li.append(a);
      list.append(li);
    }
    const column = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = "Library";
    column.append(title);
    if (draws === "heading") {
      m.root.before(list);
    } else {
      column.append(list);
    }
    m.root.prepend(column);
    if (draws === "roving") {
      rows[2]!.tabIndex = 0;
    }
    const tall = document.createElement("div");
    tall.style.blockSize = "300vh";
    const farLink = document.createElement("a");
    farLink.id = "far-link";
    farLink.href = "#elsewhere";
    farLink.textContent = "Far link";
    const farButton = document.createElement("button");
    farButton.id = "far-button";
    farButton.type = "button";
    farButton.textContent = "Far button";
    const farHeld = document.createElement("h2");
    farHeld.id = "far-held";
    farHeld.tabIndex = -1;
    farHeld.textContent = "Far held";
    document.body.append(tall, farLink, farButton, farHeld);
    const link = document.createElement("a");
    link.textContent = "Next";
    m.detail.querySelector(".cp-detail-body")!.append(link);
    const keyOf = (): string | null =>
      /^#row-\d$/.test(location.hash) ? location.hash.slice(1) : null;
    const apply = (): void => {
      const key = keyOf();
      if (key !== m.api.key) {
        m.api.show(key);
      }
    };
    const delay = timing === "task" ? 0 : timing === "late" ? 50 : null;
    // A route that fetches before it shows still hides at once.
    addEventListener(
      timing === "popstate" ? "popstate" : "hashchange",
      () => {
        if (delay === null || keyOf() === null) {
          apply();
        } else {
          setTimeout(apply, delay);
        }
      },
      { signal: life.signal },
    );
    return { ...m, rows, title, link };
  }
  type TravelScene = Awaited<ReturnType<typeof travelScene>>;

  const opened = (root: HTMLElement): Promise<unknown> =>
    new Promise((r) => {
      root.addEventListener("detailopen", r, { once: true });
    });
  /** Presses a row where the reader scrolled to it. */
  const pressRow = async (s: TravelScene, i: number): Promise<void> => {
    s.rows[i]!.scrollIntoView({ block: "center" });
    await frames(1);
    const shown = opened(s.root);
    await keys(s.rows[i]!, "{Enter}");
    await shown;
    await played(s.dialog);
  };
  /** Waits for the traversal's show, then for the page's scroll restoration
   *  and what follows it. */
  const traverse = async (s: TravelScene, step: () => void): Promise<void> => {
    const shown = opened(s.root);
    step();
    await shown;
    await played(s.dialog);
    await frames(3);
    await task();
  };
  const leave: Record<Before, (s: TravelScene) => Promise<void>> = {
    row: (s) => pressRow(s, 1),
    link: async (s) => {
      s.link.href = "#row-1";
      const shown = opened(s.root);
      await keys(s.link, "{Enter}");
      await shown;
    },
    "part-link": (s) => toPart(s, "#far-link"),
    "part-button": (s) => toPart(s, "#far-button"),
    "part-held": (s) => toPart(s, "#far-held"),
  };
  async function toPart(s: TravelScene, href: string): Promise<void> {
    s.link.href = href;
    const done = closed(s.root);
    await keys(s.link, "{Enter}");
    await done;
    await exited(s.dialog);
    expect(document.activeElement, "the part took focus").toBe(document.querySelector(href));
  }

  type TravelRow = readonly [string, number, Before, Travel, Timing, ListDraws, Then];
  const travelRow = (
    width: number,
    before: Before,
    travel: Travel,
    timing: Timing,
    draws: ListDraws,
    then: Then,
  ): TravelRow => [
    `${where(width)}, left by ${before}, ${travel} shown in ${timing}, the ${draws} drawn, then ${then}`,
    width,
    before,
    travel,
    timing,
    draws,
    then,
  ];
  const OTHERS: readonly ListDraws[] = ["roving", "link", "heading"];
  const SOME_TIMES: readonly Timing[] = ["popstate", "late"];
  const TRAVEL_ROWS: readonly TravelRow[] = [
    ...[DOCK, SHEET].flatMap((w) =>
      // A row behind the modal sheet takes no press.
      (w === DOCK ? (["row", "link"] as const) : (["link"] as const)).flatMap((b) =>
        (["back", "forward"] as const).flatMap((t) => [
          ...TIMINGS.map((tm) => travelRow(w, b, t, tm, "entry", "route")),
          ...OTHERS.flatMap((d) => SOME_TIMES.map((tm) => travelRow(w, b, t, tm, d, "route"))),
          ...SOME_TIMES.map((tm) => travelRow(w, b, t, tm, "entry", "close")),
        ]),
      ),
    ),
    ...(["part-link", "part-button", "part-held"] as const).flatMap((b) =>
      [DOCK, SHEET].flatMap((w) =>
        TIMINGS.map((tm) => travelRow(w, b, "back", tm, "entry", "route")),
      ),
    ),
    ...SOME_TIMES.map((tm) => travelRow(DOCK, "row", "back", tm, "entry", "press")),
    travelRow(DOCK, "link", "back", "late", "heading", "press"),
  ];

  it.each(TRAVEL_ROWS)(
    "after a traversal %s",
    async (_, width, before, travel, timing, draws, then) => {
      const s = await travelScene(width, draws, timing);
      await pressRow(s, 0);
      await leave[before](s);
      await traverse(s, () => {
        history.back();
      });
      if (travel === "forward") {
        await traverse(s, () => {
          history.forward();
        });
      }
      const back = travel === "back" ? 0 : 1;
      expect(s.api.key, "the entry the address names").toBe(`row-${String(back)}`);
      expect(document.activeElement, "the traversal's show focuses the heading").toBe(s.heading);
      const h = s.heading.getBoundingClientRect();
      expect(h.top > -1 && h.bottom < innerHeight + 1, "the heading wholly in view").toBe(true);
      if (then === "press") {
        await pressRow(s, 2);
      }
      const done = closed(s.root);
      if (then === "close") {
        await keys(s.close, "{Enter}");
      } else {
        s.api.show(null);
      }
      await done;
      await exited(s.dialog);
      const ends: Record<ListDraws, HTMLElement> = {
        entry: s.rows[back]!,
        roving: s.rows[2]!,
        link: s.rows[0]!,
        heading: s.title,
      };
      const want = then === "press" ? s.rows[2]! : ends[draws];
      expect(document.activeElement, "focus on what the list draws for the entry").toBe(want);
      const r = want.getBoundingClientRect();
      expect(r.bottom > 0 && r.top < innerHeight, "in view").toBe(true);
      if (want !== s.rows[1]) {
        const b = s.rows[1]!.getBoundingClientRect();
        expect(b.bottom <= 0 || b.top >= innerHeight, "the page not at the second row").toBe(true);
      }
    },
  );

  /** How a route answers a new address: it hides at once and shows the
   *  entry in the same task or 50 ms later, as a route that fetches first;
   *  it shows in `hashchange`; or it shows in an `intercept()` handler, at
   *  once or after an await. */
  type Answer = "fetch-now" | "fetch-late" | "hashchange" | "intercept" | "intercept-await";

  /** Three row links a window and a half apart, `#row-0` to `#row-2`, a link
   *  in the detail, and a route answering their addresses as `answer` says.
   *  `entry` finds a row only `withEntry`. */
  async function answered(width: number, answer: Answer, withEntry = true) {
    history.replaceState(history.state, "", "#list");
    const rows = [0, 1, 2].map((i) => {
      const a = document.createElement("a");
      a.href = `#row-${String(i)}`;
      a.textContent = `Row ${String(i)}`;
      return a;
    });
    const m = mount(width, {
      entry: (key) => (withEntry ? (rows.find((a) => a.hash === `#${key}`) ?? null) : null),
    });
    m.opener.remove();
    document.documentElement.style.overflowAnchor = "none";
    const list = document.createElement("ul");
    for (const a of rows) {
      const li = document.createElement("li");
      li.style.marginBlockEnd = "150vh";
      li.append(a);
      list.append(li);
    }
    const column = document.createElement("div");
    column.append(list);
    m.root.prepend(column);
    const link = document.createElement("a");
    link.textContent = "Next";
    m.detail.querySelector(".cp-detail-body")!.append(link);
    const keyOf = (): string | null =>
      /^#row-\d$/.test(location.hash) ? location.hash.slice(1) : null;
    if (answer === "intercept" || answer === "intercept-await") {
      nav.addEventListener(
        "navigate",
        (e) => {
          if (e.hashChange && e.canIntercept) {
            e.intercept({
              handler: async () => {
                if (answer === "intercept-await") {
                  await task();
                }
                const key = keyOf();
                if (key !== m.api.key) {
                  m.api.show(key);
                }
              },
            });
          }
        },
        { signal: life.signal },
      );
    } else {
      addEventListener(
        "hashchange",
        () => {
          const key = keyOf();
          if (key === m.api.key) {
            return;
          }
          if (answer === "hashchange") {
            m.api.show(key);
            return;
          }
          m.api.show(null);
          if (key !== null && answer === "fetch-now") {
            m.api.show(key);
          } else if (key !== null) {
            setTimeout(() => {
              m.api.show(key);
            }, 50);
          }
        },
        { signal: life.signal },
      );
    }
    return { ...m, rows, link };
  }

  /** Presses `a` where the reader scrolled to it, and waits for its show. */
  const pressShows = async (
    s: { root: HTMLElement; dialog: HTMLDialogElement },
    a: HTMLElement,
  ): Promise<void> => {
    a.scrollIntoView({ block: "center" });
    await frames(1);
    const shown = opened(s.root);
    await keys(a, "{Enter}");
    await shown;
    await played(s.dialog);
  };

  it.each(
    [DOCK, SHEET].flatMap((w) =>
      (["fetch-now", "fetch-late"] as const).flatMap((answer) =>
        (["route", "close"] as const).map(
          (then) => [`${where(w)}, ${answer}, then ${then}`, w, answer, then] as const,
        ),
      ),
    ),
  )(
    "after a link in the detail to another entry under a route that hides first, %s, ends on that entry's row",
    async (_, width, answer, then) => {
      const s = await answered(width, answer);
      await pressShows(s, s.rows[0]!);
      s.link.href = "#row-1";
      const shown = opened(s.root);
      await keys(s.link, "{Enter}");
      await shown;
      await played(s.dialog);
      expect(s.api.key).toBe("row-1");
      const done = closed(s.root);
      if (then === "close") {
        await keys(s.close, "{Enter}");
      } else {
        s.api.show(null);
      }
      await done;
      await exited(s.dialog);
      expect(document.activeElement, "on the shown entry's row").toBe(s.rows[1]);
      const r = s.rows[1]!.getBoundingClientRect();
      expect(r.bottom > 0 && r.top < innerHeight, "in view").toBe(true);
      const a = s.rows[0]!.getBoundingClientRect();
      expect(a.bottom <= 0 || a.top >= innerHeight, "the page not at the first row").toBe(true);
    },
  );

  it.each(["fetch-now", "fetch-late"] as const)(
    "after a press on another row docked under a route that hides first, %s, ends on that row",
    async (answer) => {
      const s = await answered(DOCK, answer);
      await pressShows(s, s.rows[0]!);
      await pressShows(s, s.rows[1]!);
      expect(s.api.key).toBe("row-1");
      const done = closed(s.root);
      s.api.show(null);
      await done;
      expect(document.activeElement).toBe(s.rows[1]);
    },
  );

  it.each([
    ["docked", DOCK],
    ["in the sheet", SHEET],
  ] as const)(
    "returns focus to the opener after the same entry is shown again as it hides, %s",
    async (_, width) => {
      const s = await answered(width, "hashchange", false);
      await pressShows(s, s.rows[1]!);
      s.api.show(null);
      s.api.show("row-1");
      await played(s.dialog);
      const done = closed(s.root);
      s.api.show(null);
      await done;
      await exited(s.dialog);
      expect(document.activeElement, "the opener, not the list's first link").toBe(s.rows[1]);
    },
  );

  it.each(
    (["hashchange", "intercept", "intercept-await"] as const).flatMap((answer) =>
      (["back", "back then forward"] as const).map(
        (travel) => [`under a ${answer} route, ${travel}`, answer, travel] as const,
      ),
    ),
  )(
    "moves focus to the heading again when a docked traversal shows another entry, %s",
    async (_, answer, travel) => {
      const s = await answered(DOCK, answer);
      await pressShows(s, s.rows[0]!);
      await pressShows(s, s.rows[1]!);
      expect(document.activeElement).toBe(s.heading);
      const across = async (step: () => void, key: string): Promise<void> => {
        let focused = 0;
        const count = (): void => {
          focused += 1;
        };
        s.heading.addEventListener("focus", count);
        const shown = opened(s.root);
        step();
        await shown;
        await nav.transition?.finished.catch(() => undefined);
        await frames(3);
        await task();
        s.heading.removeEventListener("focus", count);
        expect(s.api.key).toBe(key);
        expect(document.activeElement, "focus on the heading").toBe(s.heading);
        const h = s.heading.getBoundingClientRect();
        expect(h.top > -1 && h.bottom < innerHeight + 1, "the heading wholly in view").toBe(true);
        // Firefox's second focus reset on an awaited intercepted traversal
        // adds one, which the module answers by focusing the heading again.
        expect(focused, "a focus event on the heading").toBeGreaterThanOrEqual(1);
      };
      await across(() => {
        history.back();
      }, "row-0");
      if (travel === "back then forward") {
        await across(() => {
          history.forward();
        }, "row-1");
      }
    },
  );

  it.each([
    ["docked, a link at the top", DOCK, "link"],
    ["in the sheet, a link at the top", SHEET, "link"],
    ["docked, only a main heading at the top", DOCK, "heading"],
    ["in the sheet, only a main heading at the top", SHEET, "heading"],
  ] as const)(
    "after a push to #top, %s, ends there at the page's start",
    async (_, width, first) => {
      const m = mount(width);
      const top = document.createElement(first === "link" ? "a" : "h1");
      top.textContent = "Start";
      if (top instanceof HTMLAnchorElement) {
        top.href = "#start";
      }
      const spacer = document.createElement("div");
      spacer.style.blockSize = "150vh";
      document.body.prepend(top, spacer);
      const link = document.createElement("a");
      link.href = "#top";
      link.textContent = "To the top";
      m.detail.querySelector(".cp-detail-body")!.append(link);
      hideOn(m.api);
      m.api.show("entry");
      await played(m.dialog);
      scrollTo(0, document.documentElement.scrollHeight);
      await frames();
      const done = closed(m.root);
      await keys(link, "{Enter}");
      await done;
      await exited(m.dialog);
      expect(scrollY, "the page at its start").toBe(0);
      expect(document.activeElement).toBe(top);
      if (first === "heading") {
        expect(top.getAttribute("tabindex"), "focusable until it loses focus").toBe("-1");
        m.opener.focus();
        expect(top.hasAttribute("tabindex"), "no tab stop left behind").toBe(false);
      }
    },
  );

  it.each([
    ["docked, an svg figure", DOCK, "svg"],
    ["in the sheet, an svg figure", SHEET, "svg"],
    ["docked, a math formula", DOCK, "math"],
    ["in the sheet, a math formula", SHEET, "math"],
  ] as const)(
    "after a push to a part below the fold, %s, ends on it, its top in view",
    async (_, width, kind) => {
      const m = mount(width);
      const tall = document.createElement("div");
      tall.style.blockSize = "300vh";
      const ns =
        kind === "svg" ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1998/Math/MathML";
      const part = document.createElementNS(ns, kind) as SVGElement | MathMLElement;
      part.id = "far-figure";
      if (part instanceof SVGElement) {
        part.setAttribute("width", "100");
        part.setAttribute("height", "100");
      } else {
        part.append(document.createElementNS(ns, "mi"));
        part.firstElementChild!.textContent = "x";
      }
      m.root.after(tall, part);
      const link = document.createElement("a");
      link.href = "#far-figure";
      link.textContent = "To the figure";
      m.detail.querySelector(".cp-detail-body")!.append(link);
      hideOn(m.api);
      m.api.show("entry");
      await played(m.dialog);
      const done = closed(m.root);
      await keys(link, "{Enter}");
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

  it("ends on the row of the entry a link in the detail showed, not the first entry's opener", async () => {
    const other = document.createElement("a");
    other.href = "#other";
    other.textContent = "Other";
    const m = mount(400, { entry: (key) => (key === "other" ? other : null) });
    m.opener.after(other);
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
    expect(document.activeElement).toBe(other);
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
    nearPixel(back.top, 0, "the heading's top at the view's top");
    nearPixel(y - scrollY, -out.top, "scrolled by its distance out");
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
    nearPixel(heading.getBoundingClientRect().top, 120, "its top at the band's edge");
    nearPixel(y - scrollY, 120 - under.top, "scrolled by its distance under the band");
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
