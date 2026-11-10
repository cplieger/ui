import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceRovingFocus } from "./roving-focus.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function toolbar(words = ["Bold", "Italic", "Link"]): {
  bar: HTMLElement;
  buttons: HTMLButtonElement[];
  after: HTMLButtonElement;
} {
  const before = document.createElement("button");
  before.textContent = "Before";
  const bar = document.createElement("div");
  bar.setAttribute("role", "toolbar");
  const buttons = words.map((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = w;
    return b;
  });
  bar.append(...buttons);
  const after = document.createElement("button");
  after.textContent = "After";
  document.body.append(before, bar, after);
  before.focus();
  return { bar, buttons, after };
}

describe("enhanceRovingFocus", () => {
  it("makes the group one Tab stop at its first item", async () => {
    const { bar, buttons, after } = toolbar();
    enhanceRovingFocus(bar, { signal: life.signal });
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(after);
  });

  it("moves with the arrows, wrapping, and with Home and End, and Tab comes back to the last used", async () => {
    const { bar, buttons } = toolbar();
    enhanceRovingFocus(bar, { signal: life.signal });
    await userEvent.keyboard("{Tab}{ArrowRight}");
    expect(document.activeElement).toBe(buttons[1]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(buttons[2]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(buttons[2]);
    await userEvent.keyboard("{Home}{ArrowRight}{Tab}{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("stops at the ends when told not to wrap, and runs the inline arrows the other way right to left", async () => {
    const { bar, buttons } = toolbar();
    bar.dir = "rtl";
    enhanceRovingFocus(bar, { signal: life.signal, wrap: false });
    await userEvent.keyboard("{Tab}{ArrowRight}");
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("uses the up and down arrows for a vertical group, and skips a disabled item", async () => {
    const { bar, buttons } = toolbar(["One", "Two", "Three"]);
    (buttons[1] as HTMLButtonElement).disabled = true;
    enhanceRovingFocus(bar, { signal: life.signal, orientation: "vertical" });
    await userEvent.keyboard("{Tab}{ArrowRight}");
    expect(document.activeElement).toBe(buttons[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("makes the item a press reached the one Tab returns to, and puts the tab order back when its signal aborts", async () => {
    const { bar, buttons } = toolbar();
    enhanceRovingFocus(bar, { signal: life.signal });
    await userEvent.click(buttons[2] as HTMLElement);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
    life.abort();
    expect(buttons.every((b) => !b.hasAttribute("tabindex"))).toBe(true);
  });
});
