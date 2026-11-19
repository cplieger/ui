import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { useSystemSheet } from "../../system/test-helpers/css.js";
import { installTooltips } from "./tooltip.js";

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
  document.body.append(b);
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
  /** Waits well past the tip's wait for a mouse that left, the exit token. */
  const pause = () => new Promise((ok) => setTimeout(ok, 400));

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

  it.each([
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
  ])("hides a mouse's tip at once when its control %s", async (_how, drop) => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = placed({});
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    drop(b);
    await moveTo({ x: 600, y: 450 });
    expect(showing()).toBe(false);
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
