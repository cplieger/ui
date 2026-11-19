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
    expect(showing()).toBe(false);
  });

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

  it("keeps a hover tip while the mouse crosses onto it, and hides it once the mouse leaves both", async () => {
    installTooltips({ signal: life.signal, delay: 100 });
    const b = control("Opens the sources you connected", "Sources");
    b.style.marginBlockStart = "8rem";
    const away = document.createElement("div");
    away.style.blockSize = "2rem";
    document.body.append(away);
    await userEvent.hover(b);
    await expect.poll(showing).toBe(true);
    const box = tip().getBoundingClientRect();
    const gap = b.getBoundingClientRect().top - box.bottom;
    expect(gap).toBeGreaterThan(4);
    await userEvent.hover(tip(), { position: { x: box.width / 2, y: box.height + gap / 2 } });
    expect(showing()).toBe(true);
    await userEvent.hover(tip());
    expect(showing()).toBe(true);
    await userEvent.hover(b);
    expect(showing()).toBe(true);
    await userEvent.hover(tip());
    await userEvent.hover(away);
    expect(showing()).toBe(false);
  });
});
