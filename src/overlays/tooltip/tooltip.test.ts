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
    // a busy machine that slows the hover cannot make it look early.
    let arrived = 0;
    let opened = 0;
    b.addEventListener("pointerover", (e) => (arrived ||= e.timeStamp));
    tip().addEventListener("toggle", (e) => {
      if (e.newState === "open") {
        opened ||= e.timeStamp;
      }
    });
    await userEvent.hover(b);
    await expect.poll(showing, { timeout: 3000 }).toBe(true);
    expect(opened - arrived).toBeGreaterThanOrEqual(300);
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
