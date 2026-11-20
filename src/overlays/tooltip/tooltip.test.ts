import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { useSystemSheet } from "../../system/test-helpers/css.js";
import { installTooltips } from "./tooltip.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** vitest.config.ts owns it. */
    glide: (points: readonly { x: number; y: number }[], interval: number) => Promise<void>;
  }
}

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function control(tip: string, label?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "⚙";
  b.dataset["cpTip"] = tip;
  if (label !== undefined) {
    b.setAttribute("aria-label", label);
  }
  const holder = document.createElement("div");
  holder.append(b);
  document.body.append(holder);
  return b;
}

const tip = () => document.querySelector(".cp-tooltip") as HTMLElement;
const showing = () => tip().matches(":popover-open");

describe("installTooltips", () => {
  it("waits the whole delay from the mouse's arrival before showing", () => {
    // The delay is the tooltip's own timer, so a faked clock measures it
    // exactly; a real hover's delivery time varies by engine under load.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      installTooltips({ signal: life.signal, delay: 300 });
      const b = control("Settings", "Settings");
      b.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, composed: true, pointerType: "mouse" }),
      );
      vi.advanceTimersByTime(299);
      expect(showing()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(showing()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the tip at once for keyboard focus, and hides it on Escape and on blur", async () => {
    installTooltips({ signal: life.signal });
    const before = document.createElement("button");
    document.body.append(before);
    const b = control("Refresh the list", "Refresh");
    before.focus();
    await userEvent.keyboard("{Tab}");
    expect(showing()).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(showing()).toBe(false);
    b.blur();
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    b.blur();
    expect(showing()).toBe(false);
  });

  it("describes a control by a tip that says more than its name, and not by one that repeats it", async () => {
    installTooltips({ signal: life.signal });
    const same = control("Settings", "Settings");
    const more = control("Opens the sources you connected", "Sources");
    same.focus({ focusVisible: true });
    expect(same.hasAttribute("aria-describedby")).toBe(false);
    more.focus({ focusVisible: true });
    expect(more.getAttribute("aria-describedby")).toBe(tip().id);
    more.blur();
    expect(more.hasAttribute("aria-describedby")).toBe(false);
  });

  it("names a control without a label by its text, apart from punctuation and case", async () => {
    installTooltips({ signal: life.signal });
    const same = control("On the best: 402, 86%");
    same.textContent = "on the best 402, 86 %";
    const more = control("Save the draft");
    more.textContent = "Save";
    same.focus({ focusVisible: true });
    expect(same.hasAttribute("aria-describedby")).toBe(false);
    more.focus({ focusVisible: true });
    expect(more.getAttribute("aria-describedby")).toBe(tip().id);
    more.textContent = "Save the draft.";
    await expect.poll(() => more.hasAttribute("aria-describedby")).toBe(false);
  });

  it("does not describe a control whose own words, seen or visually hidden, repeat its tip", () => {
    installTooltips({ signal: life.signal });
    const label = document.createElement("label");
    label.dataset["cpTip"] = "Grid";
    label.innerHTML =
      '<input type="radio" name="view"><span class="cp-visually-hidden">Grid</span>';
    document.body.append(label);
    const radio = label.querySelector("input") as HTMLInputElement;
    radio.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    expect(tip().textContent).toBe("Grid");
    expect(label.hasAttribute("aria-describedby")).toBe(false);
    expect(radio.hasAttribute("aria-describedby")).toBe(false);
  });

  it("describes a tipped label's control, not the label, by a tip that says more", () => {
    installTooltips({ signal: life.signal });
    const label = document.createElement("label");
    label.dataset["cpTip"] = "Shows each item as a row";
    label.innerHTML =
      '<input type="radio" name="view"><span class="cp-visually-hidden">List</span>';
    document.body.append(label);
    const radio = label.querySelector("input") as HTMLInputElement;
    radio.focus({ focusVisible: true });
    expect(radio.getAttribute("aria-describedby")).toBe(tip().id);
    expect(label.hasAttribute("aria-describedby")).toBe(false);
    radio.blur();
    expect(radio.hasAttribute("aria-describedby")).toBe(false);
  });

  it("does not describe a tipped label's radio whose aria-label repeats the tip", () => {
    installTooltips({ signal: life.signal });
    const label = document.createElement("label");
    label.dataset["cpTip"] = "Grid";
    label.innerHTML = '<input type="radio" name="view" aria-label="Grid">';
    document.body.append(label);
    const radio = label.querySelector("input") as HTMLInputElement;
    radio.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    expect(radio.hasAttribute("aria-describedby")).toBe(false);
  });

  it("follows a radio an arrow key reaches without :focus-visible, as Safari moves it", () => {
    installTooltips({ signal: life.signal });
    const radios = ["Shows each item as a row", "Shows each item as a tile"].map((words, i) => {
      const label = document.createElement("label");
      label.dataset["cpTip"] = words;
      label.innerHTML = `<input type="radio" name="view"><span class="cp-visually-hidden">${["List", "Grid"][i] ?? ""}</span>`;
      document.body.append(label);
      return label.querySelector("input") as HTMLInputElement;
    });
    const [list, grid] = radios as [HTMLInputElement, HTMLInputElement];
    list.focus({ focusVisible: true });
    // WebKit's arrow handler focuses the next radio inside the keydown's task
    // with no keyboard focus trigger.
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
    );
    grid.focus({ focusVisible: false });
    expect(grid.matches(":focus-visible")).toBe(false);
    expect(showing()).toBe(true);
    expect(tip().textContent).toBe("Shows each item as a tile");
    expect(grid.getAttribute("aria-describedby")).toBe(tip().id);
    expect(list.hasAttribute("aria-describedby")).toBe(false);
  });

  it("toggles the tip with a tap on a control marked for it, and leaves other taps alone", () => {
    installTooltips({ signal: life.signal });
    const b = control("What this means", "Help");
    b.dataset["cpTipToggle"] = "";
    const tap = () => {
      b.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "touch" }),
      );
    };
    tap();
    expect(showing()).toBe(true);
    tap();
    expect(showing()).toBe(false);
    delete b.dataset["cpTipToggle"];
    tap();
    expect(showing()).toBe(false);
  });

  it("toggles the tip of an aria-disabled control with a tap, since the tap runs nothing", () => {
    installTooltips({ signal: life.signal });
    const b = control("Refreshed 10 seconds ago", "Refresh now");
    b.setAttribute("aria-disabled", "true");
    const tap = () => {
      b.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "touch" }),
      );
    };
    tap();
    expect(showing()).toBe(true);
    expect(tip().textContent).toBe("Refreshed 10 seconds ago");
    tap();
    expect(showing()).toBe(false);
    b.setAttribute("aria-disabled", "false");
    tap();
    expect(showing()).toBe(false);
  });

  it("keeps a tapped tip as the finger lifts, and hides it at a second tap or a tap elsewhere", () => {
    installTooltips({ signal: life.signal });
    const b = control("What this means", "Help");
    b.dataset["cpTipToggle"] = "";
    const elsewhere = document.createElement("p");
    elsewhere.textContent = "Seeders";
    document.body.append(elsewhere);
    // A finger's whole tap: it leaves its target after it lifts.
    const tap = (el: Element) => {
      for (const type of ["pointerover", "pointerdown", "pointerup", "pointerout"]) {
        el.dispatchEvent(
          new PointerEvent(type, { bubbles: true, composed: true, pointerType: "touch" }),
        );
      }
    };
    tap(b);
    expect(showing()).toBe(true);
    tap(b);
    expect(showing()).toBe(false);
    tap(b);
    expect(showing()).toBe(true);
    tap(elsewhere);
    expect(showing()).toBe(false);
    delete b.dataset["cpTipToggle"];
    b.setAttribute("aria-disabled", "true");
    tap(b);
    expect(showing()).toBe(true);
    tap(b);
    expect(showing()).toBe(false);
  });

  it("keeps a tapped tip through a tap on the tip itself, and hides it at a second tap on its control or a tap elsewhere", () => {
    installTooltips({ signal: life.signal });
    const b = document.createElement("span");
    b.tabIndex = 0;
    b.textContent = "Seeders";
    b.dataset["cpTip"] = "People sharing the release right now";
    b.dataset["cpTipToggle"] = "";
    const elsewhere = document.createElement("p");
    elsewhere.textContent = "Library";
    document.body.append(b, elsewhere);
    const tap = (el: Element) => {
      for (const type of ["pointerover", "pointerdown", "pointerup", "pointerout"]) {
        el.dispatchEvent(
          new PointerEvent(type, { bubbles: true, composed: true, pointerType: "touch" }),
        );
      }
    };
    // A tap focuses the toggle without :focus-visible.
    b.focus({ focusVisible: false });
    tap(b);
    expect(showing()).toBe(true);
    tap(tip());
    // Chromium and Firefox move the focus off the toggle as the tip takes
    // the tap, and WebKit moves none.
    b.blur();
    expect(showing()).toBe(true);
    tap(b);
    expect(showing()).toBe(false);
    tap(b);
    expect(showing()).toBe(true);
    tap(elsewhere);
    expect(showing()).toBe(false);
  });

  it("cancels a tip waiting on the mouse's rest at Escape", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      installTooltips({ signal: life.signal, delay: 300 });
      const b = control("Opens the sources you connected", "Sources");
      b.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, composed: true, pointerType: "mouse" }),
      );
      vi.advanceTimersByTime(100);
      b.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      vi.advanceTimersByTime(1000);
      expect(showing()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("anchors the tip beside any anchor the control already has", () => {
    installTooltips({ signal: life.signal });
    const b = control("More", "More");
    b.style.setProperty("anchor-name", "--cp-anchor-9");
    b.focus({ focusVisible: true });
    expect(b.style.getPropertyValue("anchor-name")).toBe("--cp-anchor-9, --cp-tip-anchor");
    b.blur();
    expect(b.style.getPropertyValue("anchor-name")).toBe("--cp-anchor-9");
  });

  it("follows its control's words and name while it shows, as a button that changes face", async () => {
    installTooltips({ signal: life.signal });
    const b = control("Send", "Send");
    b.focus({ focusVisible: true });
    b.dataset["cpTip"] = "Stop dictation";
    b.setAttribute("aria-label", "Stop dictation");
    await expect.poll(() => tip().textContent).toBe("Stop dictation");
    expect(showing()).toBe(true);
    expect(b.hasAttribute("aria-describedby")).toBe(false);
    b.dataset["cpTip"] = "Stop dictation and keep the words";
    await expect.poll(() => b.getAttribute("aria-describedby")).toBe(tip().id);
    expect(tip().textContent).toBe("Stop dictation and keep the words");
    b.setAttribute("aria-label", "Stop dictation and keep the words");
    await expect.poll(() => b.hasAttribute("aria-describedby")).toBe(false);
  });

  it("hides once its control's words are removed while it shows", async () => {
    installTooltips({ signal: life.signal });
    const b = control("Grab", "Grab");
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    delete b.dataset["cpTip"];
    await expect.poll(showing).toBe(false);
  });

  it("reads the words at each showing, and removes the tip when its signal aborts", () => {
    installTooltips({ signal: life.signal });
    const b = control("Switch to dark", "Theme");
    b.focus({ focusVisible: true });
    b.blur();
    b.dataset["cpTip"] = "Switch to light";
    b.focus({ focusVisible: true });
    expect(tip().textContent).toBe("Switch to light");
    life.abort();
    expect(document.querySelector(".cp-tooltip")).toBeNull();
  });
});

describe("installTooltips with the system sheet", () => {
  useSystemSheet();
  const still = document.createElement("style");
  still.textContent = ".cp-tooltip { transition: none !important; }";
  beforeAll(() => {
    document.head.append(still);
  });
  afterAll(() => {
    still.remove();
  });

  it("shows a control's tip after a mouse rests on it, and hides it as the mouse leaves", async () => {
    installTooltips({ signal: life.signal, delay: 300 });
    const b = control("Settings", "Settings");
    const away = document.createElement("p");
    away.textContent = "Library";
    document.body.append(away);
    await userEvent.hover(b);
    await expect.poll(showing, { timeout: 3000 }).toBe(true);
    expect(tip().textContent).toBe("Settings");
    expect(tip().getAttribute("role")).toBe("tooltip");
    await userEvent.hover(away);
    await expect.poll(showing).toBe(false);
  });

  /** Moves the mouse to `{x, y}` in the window. */
  const moveTo = (at: { x: number; y: number }) =>
    userEvent.hover(document.body, { position: inBox(document.body, at), force: true });
  /** Waits well past the tip's wait for a mouse that left, the grace token. */
  const pause = () => new Promise((ok) => setTimeout(ok, 500));

  /** The middle of the gap between the open tip and `el`, on whichever side the tip sits. */
  const gapBetween = (el: Element) => {
    const t = tip().getBoundingClientRect();
    const c = el.getBoundingClientRect();
    const above = t.bottom <= c.top;
    return {
      above,
      x: t.left + t.width / 2,
      y: above ? (t.bottom + c.top) / 2 : (c.bottom + t.top) / 2,
    };
  };
  /** `{x, y}` in the window as a position in `el`'s box. */
  const inBox = (el: Element, at: { x: number; y: number }) => {
    const box = el.getBoundingClientRect();
    return { x: at.x - box.left, y: at.y - box.top };
  };

  it.each([
    ["above", "8rem", true],
    ["flipped below", "0", false],
  ])(
    "keeps a hover tip %s its control while the mouse crosses the gap onto it, and hides it once the mouse leaves both",
    async (_side, margin, above) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = control("Opens the sources you connected", "Sources");
      b.style.marginBlockStart = margin;
      const away = document.createElement("div");
      away.style.blockSize = "2rem";
      away.style.marginBlockStart = "6rem";
      document.body.append(away);
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      const gap = gapBetween(b);
      expect(gap.above).toBe(above);
      expect(document.elementFromPoint(gap.x, gap.y)).not.toBe(tip());
      await userEvent.hover(tip());
      await pause();
      expect(showing()).toBe(true);
      await userEvent.hover(b);
      await pause();
      expect(showing()).toBe(true);
      await userEvent.hover(tip());
      await userEvent.hover(away);
      await expect.poll(showing).toBe(false);
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      await moveTo(gap);
      await expect.poll(showing).toBe(false);
    },
  );

  /** A tipped button at a whole-pixel place and size, as `style` sets it. */
  const placed = (style: Partial<CSSStyleDeclaration>) => {
    const b = control("Opens the sources you connected", "Sources");
    Object.assign(b.style, {
      position: "fixed",
      insetBlockStart: "200px",
      insetInlineStart: "100px",
      inlineSize: "100px",
      blockSize: "32px",
      margin: "0",
      padding: "0",
      border: "0",
      ...style,
    });
    return b;
  };

  it.each([
    ["block-end edge", (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.bottom })],
    ["inline-end edge", (r: DOMRect) => ({ x: r.right, y: r.top + r.height / 2 })],
    ["block-start edge", (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top - 1 })],
    ["inline-start edge", (r: DOMRect) => ({ x: r.left - 1, y: r.top + r.height / 2 })],
  ])(
    "hides a mouse's tip once the mouse leaves its control by one pixel through its %s",
    async (_edge, past) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = placed({});
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      const at = past(b.getBoundingClientRect());
      expect(document.elementFromPoint(at.x, at.y)).not.toBe(b);
      await moveTo(at);
      await moveTo({ x: 600, y: 450 });
      await expect.poll(showing).toBe(false);
    },
  );

  it("hides a mouse's tip once the mouse leaves a round control through its corner", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = placed({
      insetInlineStart: "400px",
      inlineSize: "40px",
      blockSize: "40px",
      borderRadius: "50%",
    });
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    const r = b.getBoundingClientRect();
    const corner = { x: r.left + 3, y: r.bottom - 3 };
    expect(document.elementFromPoint(corner.x, corner.y)).not.toBe(b);
    await moveTo(corner);
    await moveTo({ x: 600, y: 450 });
    await expect.poll(showing).toBe(false);
  });

  it("hides a mouse's tip once the mouse leaves the tip by one pixel through its inline-end edge", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = placed({});
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    await userEvent.hover(tip());
    const r = tip().getBoundingClientRect();
    const at = { x: r.right, y: r.top + r.height / 2 };
    // WebKit hit tests the tip's edge snapped to whole pixels, so its
    // first pixel outside can lie past the measured edge.
    while (document.elementFromPoint(at.x, at.y) === tip() && at.x < r.right + 4) {
      at.x += 0.5;
    }
    expect(document.elementFromPoint(at.x, at.y)).not.toBe(tip());
    await moveTo(at);
    await moveTo({ x: r.right + 150, y: r.top + r.height / 2 });
    await expect.poll(showing).toBe(false);
  });

  const drops = [
    [
      "leaves the document",
      (b: HTMLElement) => {
        b.remove();
      },
    ],
    [
      "turns hidden",
      (b: HTMLElement) => {
        b.hidden = true;
      },
    ],
    [
      "turns visibility: hidden",
      (b: HTMLElement) => {
        b.style.visibility = "hidden";
      },
    ],
    [
      "fades to opacity 0",
      (b: HTMLElement) => {
        b.style.opacity = "0";
      },
    ],
    [
      "has its parent turn hidden",
      (b: HTMLElement) => {
        (b.parentElement as HTMLElement).hidden = true;
      },
    ],
    [
      "has its parent turn display: none",
      (b: HTMLElement) => {
        (b.parentElement as HTMLElement).style.display = "none";
      },
    ],
  ] as const;

  it.each(drops)(
    "hides a mouse's tip resting on its control when the control %s, with no further input",
    async (_how, drop) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = placed({});
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      drop(b);
      await expect.poll(showing).toBe(false);
    },
  );

  it.each(drops)(
    "hides a mouse's tip the mouse rests on when its control %s, with no further input",
    async (_how, drop) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = placed({});
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      await userEvent.hover(tip());
      drop(b);
      await expect.poll(showing).toBe(false);
    },
  );

  /** A focusable inline tip toggle inside a line of text. */
  const inline = () => {
    const p = document.createElement("p");
    p.style.marginBlockStart = "8rem";
    p.textContent = "Seeders ";
    const s = document.createElement("span");
    s.tabIndex = 0;
    s.textContent = "12";
    s.dataset["cpTip"] = "People sharing the release right now";
    s.dataset["cpTipToggle"] = "";
    p.append(s);
    document.body.append(p);
    return s;
  };

  it.each([
    ["a button", () => placed({})],
    ["an inline toggle", inline],
  ])(
    "hides a keyboard tip of %s when its control leaves the document, hides or fades, or its parent hides, with no further input",
    async (_kind, make) => {
      installTooltips({ signal: life.signal });
      for (const [, drop] of drops) {
        const b = make();
        b.focus({ focusVisible: true });
        expect(showing()).toBe(true);
        drop(b);
        await expect.poll(showing).toBe(false);
      }
    },
  );

  /** Resolves once an IntersectionObserver reports `el` outside its
   *  scroller, which is when the tooltip's own has reported it too. */
  const outOfView = (el: Element) =>
    new Promise<void>((ok) => {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => !e.isIntersecting)) {
          io.disconnect();
          ok();
        }
      });
      io.observe(el);
    });
  /** The element of `el`'s that is the body's child, across a shadow root. */
  const outer = (el: HTMLElement) => {
    const root = el.getRootNode();
    const top = root instanceof ShadowRoot ? (root.host as HTMLElement) : el;
    return top.closest<HTMLElement>("body > *") ?? top;
  };
  /** A blank taller than the window, to scroll past. */
  const blank = () => {
    const d = document.createElement("div");
    d.style.blockSize = "300vh";
    return d;
  };
  /** Where `el` is put above a blank, how to scroll past it, which
   *  returns the top edge of what shows of the scroller, and how to take
   *  it all away. */
  interface Placed {
    readonly scroll: () => number;
    readonly clear: () => void;
  }
  /** At the top of a short `overflow: auto` box. */
  const inBoxAbove = (el: HTMLElement): Placed => {
    const box = document.createElement("div");
    Object.assign(box.style, { blockSize: "6rem", overflow: "auto", marginBlockStart: "8rem" });
    box.append(outer(el), blank());
    document.body.append(box);
    return {
      scroll: () => {
        box.scrollTop = box.scrollHeight;
        return box.getBoundingClientRect().top;
      },
      clear: () => {
        box.remove();
      },
    };
  };
  /** In the window. */
  const inWindowAbove = (el: HTMLElement): Placed => {
    const own = outer(el);
    const below = blank();
    document.body.append(below);
    return {
      scroll: () => {
        scrollTo(0, own.getBoundingClientRect().bottom + scrollY + innerHeight);
        return 0;
      },
      clear: () => {
        own.remove();
        below.remove();
        scrollTo(0, 0);
      },
    };
  };
  const button = () => control("Opens the sources you connected", "Sources");
  /** A tipped button in a wrapper in an open shadow root. Its tip, which
   *  no anchor in a shadow tree can place, sits in the window's corner. */
  const shadowed = () => {
    const corner = document.createElement("style");
    corner.textContent = ".cp-tooltip { inset: auto 0 0 auto; }";
    const host = document.createElement("div");
    const holder = document.createElement("div");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "⚙";
    b.dataset["cpTip"] = "Opens the sources you connected";
    b.setAttribute("aria-label", "Sources");
    holder.append(b);
    host.attachShadow({ mode: "open" }).append(holder);
    document.body.append(corner, host);
    return b;
  };
  /** Rests the mouse on `el`, by place so a shadow control is reached too,
   *  until its tip shows, then moves it onto the tip. It starts from a
   *  corner, since a move to where the mouse already is sends no event. */
  const onTipOf = async (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    await moveTo({ x: 1, y: 1 });
    await moveTo({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    await expect.poll(showing).toBe(true);
    await userEvent.hover(tip());
  };

  it.each([
    ["a button", "the window", button, inWindowAbove],
    ["an inline toggle", "the window", inline, inWindowAbove],
    ["a button", "an overflow box", button, inBoxAbove],
    ["an inline toggle", "an overflow box", inline, inBoxAbove],
    ["a shadow root's button", "the window", shadowed, inWindowAbove],
    ["a shadow root's button", "an overflow box", shadowed, inBoxAbove],
  ])(
    "hides a keyboard tip of %s scrolled out of %s when its control leaves the document, hides or fades, or its parent hides, with no further input",
    async (_kind, _scroller, make, place) => {
      installTooltips({ signal: life.signal });
      // A mouse over what scrolls or moves gets the engine's own boundary
      // and move events, each of which would run the tooltip's listeners.
      const park = document.createElement("div");
      Object.assign(park.style, {
        position: "fixed",
        insetInlineEnd: "0",
        insetBlockEnd: "0",
        inlineSize: "2rem",
        blockSize: "2rem",
      });
      document.body.append(park);
      await userEvent.hover(park);
      for (const [, drop] of drops) {
        const b = make();
        const { scroll, clear } = place(b);
        b.focus({ focusVisible: true, preventScroll: true });
        expect(showing()).toBe(true);
        const edge = scroll();
        await outOfView(b);
        expect(b.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge);
        await pause();
        drop(b);
        await expect.poll(showing).toBe(false);
        clear();
      }
    },
  );

  it.each(drops)(
    "hides a mouse's tip the mouse rests on when its control, scrolled out of an overflow box, %s, with no further input",
    async (_how, drop) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = button();
      const { scroll } = inBoxAbove(b);
      await userEvent.hover(b);
      await expect.poll(showing).toBe(true);
      await userEvent.hover(tip());
      const edge = scroll();
      await outOfView(b);
      expect(b.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge);
      expect(showing()).toBe(true);
      drop(b);
      await expect.poll(showing).toBe(false);
    },
  );

  it.each(drops)(
    "hides a mouse's tip the mouse rests on when a shadow root's control in view %s, with no further input",
    async (_how, drop) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = shadowed();
      outer(b).style.marginBlockStart = "8rem";
      await onTipOf(b);
      drop(b);
      await expect.poll(showing).toBe(false);
    },
  );

  it("hides a mouse's tip once the mouse leaves a shadow root's control, and shows none for a mouse that left before its rest", async () => {
    installTooltips({ signal: life.signal, delay: 800 });
    const b = shadowed();
    outer(b).style.marginBlockStart = "8rem";
    const r = b.getBoundingClientRect();
    const away = { x: r.right + 200, y: r.top + r.height / 2 };
    await moveTo({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    await expect.poll(showing, { timeout: 3000 }).toBe(true);
    await moveTo(away);
    await expect.poll(showing).toBe(false);
    await moveTo({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    await moveTo(away);
    await new Promise((ok) => setTimeout(ok, 1200));
    expect(showing()).toBe(false);
  });

  it.each([
    ...drops,
    [
      "has its shadow host leave the document",
      (b: HTMLElement) => {
        outer(b).remove();
      },
    ],
  ] as const)(
    "hides a mouse's tip the mouse rests on when a shadow root's control, scrolled out of an overflow box, %s, with no further input",
    async (_how, drop) => {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = shadowed();
      const { scroll } = inBoxAbove(b);
      await onTipOf(b);
      const edge = scroll();
      await outOfView(b);
      expect(b.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge);
      expect(showing()).toBe(true);
      drop(b);
      await expect.poll(showing).toBe(false);
    },
  );

  const frame = () => new Promise(requestAnimationFrame);
  const ends = (el: HTMLElement, type: "transitionend" | "animationend") =>
    new Promise((ok) => {
      el.addEventListener(type, ok, { once: true });
    });

  it.each([
    ["its control", () => placed({}), (b: HTMLElement) => b],
    ["its control's parent", () => placed({}), (b: HTMLElement) => b.parentElement as HTMLElement],
    [
      "a shadow root's control's parent",
      shadowed,
      (b: HTMLElement) => b.parentElement as HTMLElement,
    ],
  ])(
    "hides a keyboard tip once a transition of %s to opacity 0 ends, with no further input",
    async (_who, make, who) => {
      installTooltips({ signal: life.signal });
      const b = make();
      const el = who(b);
      el.style.transition = "opacity 300ms linear";
      // Computes the style from which the transition starts.
      expect(getComputedStyle(el).opacity).toBe("1");
      b.focus({ focusVisible: true });
      expect(showing()).toBe(true);
      const ended = ends(el, "transitionend");
      el.style.opacity = "0";
      await frame();
      expect(showing()).toBe(true);
      await ended;
      await expect.poll(showing).toBe(false);
    },
  );

  it("hides a keyboard tip once an animation of its control's parent to opacity 0 ends, with no further input", async () => {
    installTooltips({ signal: life.signal });
    const sheet = document.createElement("style");
    sheet.textContent = "@keyframes test-out { to { opacity: 0; } }";
    document.body.append(sheet);
    const b = placed({});
    const parent = b.parentElement as HTMLElement;
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    const ended = ends(parent, "animationend");
    parent.style.animation = "test-out 300ms linear forwards";
    await frame();
    expect(showing()).toBe(true);
    await ended;
    await expect.poll(showing).toBe(false);
  });

  it(
    "hides a keyboard tip each time an animation of its control's parent to opacity 0 ends, with no further input",
    { timeout: 60_000 },
    async () => {
      installTooltips({ signal: life.signal });
      const sheet = document.createElement("style");
      sheet.textContent = "@keyframes test-out { to { opacity: 0; } }";
      document.body.append(sheet);
      // WebKit's checkVisibility reports such a parent seen a few times in a
      // hundred, so one fade rarely catches it.
      for (let i = 0; i < 200; i++) {
        const b = placed({});
        const parent = b.parentElement as HTMLElement;
        b.focus({ focusVisible: true });
        expect(showing()).toBe(true);
        const ended = ends(parent, "animationend");
        parent.style.animation = "test-out 30ms linear forwards";
        await ended;
        expect(getComputedStyle(parent).opacity).toBe("0");
        expect(showing(), `fade ${String(i)}`).toBe(false);
        parent.remove();
      }
    },
  );

  it.each([
    [
      "an endless animation of its outline",
      [{ outlineColor: "red" }, { outlineColor: "blue" }],
      { duration: 1000, iterations: Infinity },
    ],
    [
      "a finite animation of its translate",
      [{ translate: "0" }, { translate: "4px" }],
      { duration: 3000 },
    ],
  ])(
    "hides a keyboard tip at once when its control turns opacity 0 under its parent's %s, with no further input",
    async (_what, frames, timing) => {
      installTooltips({ signal: life.signal });
      const b = placed({});
      const parent = b.parentElement as HTMLElement;
      parent.animate(frames, timing);
      b.focus({ focusVisible: true });
      expect(showing()).toBe(true);
      b.style.opacity = "0";
      await expect.poll(showing, { timeout: 1000 }).toBe(false);
    },
  );

  it("keeps a keyboard tip of a control in a popover that the focus reaches part way through its fade-in from opacity 0", async () => {
    installTooltips({ signal: life.signal });
    const pop = document.createElement("div");
    pop.className = "cp-popover";
    pop.popover = "manual";
    // Long enough that no loaded engine's frame steps past its end.
    pop.style.transitionDuration = "2s";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "⚙";
    b.dataset["cpTip"] = "Opens the sources you connected";
    b.setAttribute("aria-label", "Sources");
    pop.append(b);
    document.body.append(pop);
    const ended = ends(pop, "transitionend");
    pop.showPopover();
    while (Number(getComputedStyle(pop).opacity) === 0) {
      await frame();
    }
    expect(Number(getComputedStyle(pop).opacity)).toBeLessThan(1);
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    document.body.append(document.createElement("p"));
    await frame();
    expect(showing()).toBe(true);
    await ended;
    await frame();
    expect(showing()).toBe(true);
  });

  it("shows no tip for a control focused in the task that opens its popover, still at opacity 0, and shows it at a later focus", async () => {
    installTooltips({ signal: life.signal });
    const pop = document.createElement("div");
    pop.className = "cp-popover";
    pop.popover = "manual";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "⚙";
    b.dataset["cpTip"] = "Opens the sources you connected";
    b.setAttribute("aria-label", "Sources");
    const other = document.createElement("button");
    other.type = "button";
    other.textContent = "Other";
    pop.append(b, other);
    document.body.append(pop);
    pop.showPopover();
    expect(getComputedStyle(pop).opacity).toBe("0");
    b.focus({ focusVisible: true });
    expect(showing()).toBe(false);
    await Promise.all(pop.getAnimations({ subtree: true }).map(async (a) => a.finished));
    await frame();
    expect(showing()).toBe(false);
    other.focus({ focusVisible: true });
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
  });

  /** A tipped button in the light DOM, assigned to a slot inside a
   *  wrapper of its host's shadow root, directly or through a slotted
   *  div. */
  const slotted = (deep: boolean, mode: ShadowRootMode = "open") => {
    const host = document.createElement("div");
    const wrap = document.createElement("div");
    wrap.append(document.createElement("slot"));
    host.attachShadow({ mode }).append(wrap);
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "⚙";
    b.dataset["cpTip"] = "Opens the sources you connected";
    b.setAttribute("aria-label", "Sources");
    if (deep) {
      const div = document.createElement("div");
      div.append(b);
      host.append(div);
    } else {
      host.append(b);
    }
    document.body.append(host);
    return { b, wrap };
  };

  it.each([
    ["a slotted button", false],
    ["a button in a slotted div", true],
  ])(
    "hides a keyboard tip of %s once a transition of its slot's shadow wrapper to opacity 0 ends, with no further input",
    async (_kind, deep) => {
      installTooltips({ signal: life.signal });
      const { b, wrap } = slotted(deep);
      wrap.style.transition = "opacity 300ms linear";
      expect(getComputedStyle(wrap).opacity).toBe("1");
      b.focus({ focusVisible: true });
      expect(showing()).toBe(true);
      const ended = ends(wrap, "transitionend");
      wrap.style.opacity = "0";
      await frame();
      expect(showing()).toBe(true);
      await ended;
      await expect.poll(showing).toBe(false);
    },
  );

  it.each([
    ["a slotted button", false],
    ["a button in a slotted div", true],
  ])(
    "hides a keyboard tip of %s at the next microtask once its slot's shadow wrapper turns opacity 0",
    async (_kind, deep) => {
      installTooltips({ signal: life.signal });
      const { b, wrap } = slotted(deep);
      b.focus({ focusVisible: true });
      expect(showing()).toBe(true);
      wrap.style.opacity = "0";
      await Promise.resolve();
      expect(showing()).toBe(false);
    },
  );

  it.each([
    ["a slotted button", false],
    ["a button in a slotted div", true],
  ])(
    "shows no keyboard tip for %s whose slot's wrapper in a closed shadow root is at opacity 0",
    (_kind, deep) => {
      installTooltips({ signal: life.signal });
      const { b, wrap } = slotted(deep, "closed");
      wrap.style.opacity = "0";
      b.focus({ focusVisible: true });
      expect(document.activeElement).toBe(b);
      expect(showing()).toBe(false);
    },
  );

  it.each([
    ["a slotted button", false],
    ["a button in a slotted div", true],
  ])(
    "hides a keyboard tip of %s at the next key once its slot's wrapper in a closed shadow root turns opacity 0",
    async (_kind, deep) => {
      installTooltips({ signal: life.signal });
      const { b, wrap } = slotted(deep, "closed");
      b.focus({ focusVisible: true });
      expect(showing()).toBe(true);
      wrap.style.opacity = "0";
      await userEvent.keyboard("{Shift}");
      expect(document.activeElement).toBe(b);
      expect(showing()).toBe(false);
    },
  );

  it("hides a mouse's tip the mouse rests on when a data attribute on its control's parent hides it by a stylesheet", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const sheet = document.createElement("style");
    sheet.textContent = "[data-shut] { visibility: hidden; }";
    document.body.append(sheet);
    const b = placed({});
    await onTipOf(b);
    (b.parentElement as HTMLElement).dataset["shut"] = "";
    await expect.poll(showing).toBe(false);
  });

  it("hides a mouse's tip the mouse rests on when a checkbox's :checked hides its control in view by a stylesheet", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const sheet = document.createElement("style");
    // The tip sits in the window's corner, shown whatever its anchor does,
    // so no engine's boundary event, as a tip whose anchor layout hid
    // moves or hides under the mouse, runs the listeners.
    sheet.textContent =
      ".gate:checked + div { display: none; } .cp-tooltip { position-area: none; position-visibility: always; inset: auto 0 0 auto; }";
    const gate = document.createElement("input");
    gate.type = "checkbox";
    gate.className = "gate";
    const b = placed({});
    const holder = b.parentElement as HTMLElement;
    holder.before(gate);
    document.body.append(sheet);
    await onTipOf(b);
    gate.checked = true;
    expect(gate.hasAttribute("checked")).toBe(false);
    await expect.poll(showing).toBe(false);
  });

  it("keeps a keyboard tip and the focus through a mouse press on its control", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = control("Opens the sources you connected", "Sources");
    b.style.marginBlockStart = "8rem";
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    await userEvent.click(b);
    await pause();
    expect(document.activeElement).toBe(b);
    expect(showing()).toBe(true);
    expect(tip().textContent).toBe("Opens the sources you connected");
  });

  it("keeps a keyboard tip's words while the mouse rests on another tipped control", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = control("Opens the sources you connected", "Sources");
    b.style.marginBlockStart = "8rem";
    const other = control("Refresh the list", "Refresh");
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    await userEvent.hover(other);
    await pause();
    expect(showing()).toBe(true);
    expect(tip().textContent).toBe("Opens the sources you connected");
    expect(b.getAttribute("aria-describedby")).toBe(tip().id);
  });

  /** Whether the tip shows after a dispatched mouse leaves its control and
   *  reaches the tip `crossing` ms later, on a faked clock that measures
   *  the crossing exactly. */
  const crossed = (crossing: number): boolean => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      installTooltips({ signal: life.signal, delay: 100 });
      const b = control("Opens the sources you connected", "Sources");
      b.style.marginBlockStart = "8rem";
      const mouse = { pointerType: "mouse" };
      const bubbling = { ...mouse, bubbles: true, composed: true };
      b.dispatchEvent(new PointerEvent("pointerover", bubbling));
      vi.advanceTimersByTime(100);
      expect(showing()).toBe(true);
      b.dispatchEvent(new PointerEvent("pointerout", bubbling));
      b.dispatchEvent(new PointerEvent("pointerleave", mouse));
      vi.advanceTimersByTime(crossing);
      tip().dispatchEvent(new PointerEvent("pointerover", bubbling));
      vi.advanceTimersByTime(1000);
      return showing();
    } finally {
      vi.useRealTimers();
    }
  };

  it.each([
    ["the grace token", 250, true, ""],
    ["the grace token", 350, false, ""],
    ["a calc() grace token", 350, true, ":root { --cp-dur-grace: calc(200ms * 2); }"],
    ["a calc() grace token", 450, false, ":root { --cp-dur-grace: calc(200ms * 2); }"],
    ["a page that zeroes every transition", 250, true, "* { transition-duration: 0s !important; }"],
  ])(
    "under %s, a mouse reaching the tip %ims after leaving its control finds it open: %s",
    (_under, crossing, open, css) => {
      const page = document.createElement("style");
      page.textContent = css;
      document.head.append(page);
      try {
        expect(crossed(crossing)).toBe(open);
      } finally {
        page.remove();
      }
    },
  );

  // Media emulation goes through the Chrome DevTools Protocol, which only
  // Chromium speaks.
  it.skipIf(server.browser !== "chromium")(
    "under reduced motion, a mouse reaching the tip 250ms after leaving its control finds it open",
    async () => {
      const features = [{ name: "prefers-reduced-motion", value: "reduce" }];
      await cdp().send("Emulation.setEmulatedMedia", { features });
      onTestFinished(async () => {
        await cdp().send("Emulation.setEmulatedMedia", { features: [] });
      });
      expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
      expect(crossed(250)).toBe(true);
    },
  );

  it("keeps the tip for a mouse crossing the gap onto it in real 1px steps 16ms apart", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = placed({});
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    const c = b.getBoundingClientRect();
    const t = tip().getBoundingClientRect();
    expect(t.bottom).toBeLessThanOrEqual(c.top);
    const x = c.left + c.width / 2;
    const top = Math.ceil(t.bottom) - 1;
    expect(document.elementFromPoint(x, top)).toBe(tip());
    const steps = Array.from({ length: Math.floor(c.top) + 1 - top + 1 }, (_, i) => ({
      x,
      y: Math.floor(c.top) + 1 - i,
    }));
    await server.commands.glide(steps, 16);
    expect(showing()).toBe(true);
    await pause();
    expect(showing()).toBe(true);
  });

  it("keeps the lower of two stacked controls' tip while the mouse crosses the upper one onto it, and gives the upper its own tip after its rest", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const list = document.createElement("ul");
    list.className = "cp-list";
    list.dataset["density"] = "compact";
    list.style.marginBlockStart = "8rem";
    const starts = ["Scan the library now", "Refresh the sources now"].map((words) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cp-button";
      b.dataset["size"] = "sm";
      b.textContent = "Start";
      b.dataset["cpTip"] = words;
      li.append(b);
      list.append(li);
      return b;
    });
    document.body.append(list);
    const [upper, lower] = starts as [HTMLButtonElement, HTMLButtonElement];
    // The moves are dispatched, so a faked clock measures the rests exactly.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      /** The boundary events a mouse moving from `from` onto `to` at `p` fires, in a browser's order. */
      const move = (from: Element, to: Element, p: { x: number; y: number }) => {
        const each = { pointerType: "mouse", clientX: p.x, clientY: p.y };
        from.dispatchEvent(
          new PointerEvent("pointerout", {
            ...each,
            bubbles: true,
            composed: true,
            relatedTarget: to,
          }),
        );
        from.dispatchEvent(new PointerEvent("pointerleave", { ...each, relatedTarget: to }));
        to.dispatchEvent(
          new PointerEvent("pointerover", {
            ...each,
            bubbles: true,
            composed: true,
            relatedTarget: from,
          }),
        );
        to.dispatchEvent(new PointerEvent("pointerenter", { ...each, relatedTarget: from }));
      };
      move(document.body, lower, centre(lower));
      vi.advanceTimersByTime(100);
      expect(showing()).toBe(true);
      expect(tip().textContent).toBe("Refresh the sources now");
      const t = tip().getBoundingClientRect();
      const gap = { x: centre(lower).x, y: (t.bottom + lower.getBoundingClientRect().top) / 2 };
      expect(upper.contains(document.elementFromPoint(gap.x, gap.y))).toBe(true);
      move(lower, upper, gap);
      vi.advanceTimersByTime(50);
      move(upper, tip(), centre(tip()));
      vi.advanceTimersByTime(1000);
      expect(showing()).toBe(true);
      expect(tip().textContent).toBe("Refresh the sources now");
      move(tip(), upper, centre(upper));
      vi.advanceTimersByTime(99);
      expect(tip().textContent).toBe("Refresh the sources now");
      vi.advanceTimersByTime(1);
      expect(showing()).toBe(true);
      expect(tip().textContent).toBe("Scan the library now");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a press in the gap or just past the open tip reach what lies there", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const under = document.createElement("div");
    under.style.paddingBlockStart = "8rem";
    document.body.append(under);
    const b = control("Opens the sources you connected", "Sources");
    under.append(b);
    const heard: EventTarget[] = [];
    under.addEventListener("click", (e) => {
      heard.push(e.target as EventTarget);
    });
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    const gap = gapBetween(b);
    expect(gap.above).toBe(true);
    expect(document.elementFromPoint(gap.x, gap.y)).toBe(under);
    await userEvent.click(under, { position: inBox(under, gap), force: true });
    expect(heard).toEqual([under]);
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    const box = tip().getBoundingClientRect();
    const past = { x: box.left + box.width / 2, y: box.top - 4 };
    expect(document.elementFromPoint(past.x, past.y)).toBe(under);
    await userEvent.click(under, { position: inBox(under, past), force: true });
    expect(heard).toEqual([under, under]);
  });

  it("keeps a tip keyboard focus showed while the mouse crosses it or its control, until blur or Escape", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const before = document.createElement("button");
    document.body.append(before);
    const b = control("Opens the sources you connected", "Sources");
    b.style.marginBlockStart = "8rem";
    const away = document.createElement("div");
    away.style.blockSize = "2rem";
    away.style.marginBlockStart = "6rem";
    document.body.append(away);
    await userEvent.hover(away);
    before.focus();
    await userEvent.keyboard("{Tab}");
    expect(showing()).toBe(true);
    await userEvent.hover(tip());
    await userEvent.hover(away);
    await pause();
    expect(showing()).toBe(true);
    await userEvent.hover(b);
    await userEvent.hover(away);
    await pause();
    expect(showing()).toBe(true);
    b.blur();
    expect(showing()).toBe(false);
    b.focus({ focusVisible: true });
    await userEvent.hover(tip());
    await userEvent.hover(away);
    await pause();
    expect(showing()).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(showing()).toBe(false);
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    await userEvent.hover(tip());
    await userEvent.hover(away);
    await expect.poll(showing).toBe(false);
  });

  it("breaks a word wider than the tip inside its box", () => {
    installTooltips({ signal: life.signal });
    const b = control("Sousou_no_Frieren_S01E01_1080p_WEB_x264_AAC_Multi_Subs.mkv", "File");
    b.style.marginBlockStart = "8rem";
    b.focus({ focusVisible: true });
    expect(showing()).toBe(true);
    expect(tip().scrollWidth).toBeLessThanOrEqual(tip().clientWidth);
  });
});
