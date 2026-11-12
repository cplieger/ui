import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

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
    // The rest is measured from the pointer's arrival to the tip's opening, so
    // a busy machine that slows the hover cannot make it look early. Both are
    // read from performance.now() as they run: under load Firefox gave an
    // automated pointerover a timeStamp 1.1s after the toggle it caused. The
    // window's capture listener runs before the tooltip's, which starts the
    // timer; one millisecond allows for the clock's rounding.
    let arrived = 0;
    let opened = 0;
    const over = (e: PointerEvent): void => {
      if (e.target === b) {
        arrived ||= performance.now();
      }
    };
    window.addEventListener("pointerover", over, { capture: true, signal: life.signal });
    tip().addEventListener("toggle", (e) => {
      if (e.newState === "open") {
        opened ||= performance.now();
      }
    });
    await userEvent.hover(b);
    await expect.poll(showing, { timeout: 3000 }).toBe(true);
    expect(arrived).toBeGreaterThan(0);
    expect(opened - arrived).toBeGreaterThanOrEqual(299);
    expect(tip().textContent).toBe("Settings");
    expect(tip().getAttribute("role")).toBe("tooltip");
    await userEvent.unhover(b);
    expect(showing()).toBe(false);
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
