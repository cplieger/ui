import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installRadioFocus } from "./radio-focus.js";

const ATTR = "data-uip-focus-ring";
let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function group(): { before: HTMLButtonElement; radios: HTMLInputElement[] } {
  const before = document.createElement("button");
  before.textContent = "Before";
  const box = document.createElement("div");
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", "Theme");
  const radios = ["system", "light", "dark"].map((value) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "theme";
    input.value = value;
    label.append(input, value);
    box.append(label);
    return input;
  });
  (radios[1] as HTMLInputElement).checked = true;
  document.body.append(before, box);
  return { before, radios };
}

const ringed = (el: Element): boolean => el.matches(`:is(:focus-visible, [${ATTR}])`);

const task = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

/** What WebKit does on an arrow key: focus the next radio with no ring. */
async function webkitArrow(from: HTMLInputElement, to: HTMLInputElement): Promise<void> {
  from.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
  );
  to.focus({ focusVisible: false });
  await task();
}

describe("installRadioFocus", () => {
  it("leaves the radio the arrow keys reach ringed in every engine", async () => {
    installRadioFocus({ signal: life.signal });
    const { before, radios } = group();
    before.focus();
    await userEvent.keyboard("{Tab}");
    await userEvent.keyboard("{ArrowLeft}");
    await task();
    const [system] = radios as [HTMLInputElement];
    expect(document.activeElement).toBe(system);
    expect(system.checked).toBe(true);
    expect(ringed(system)).toBe(true);
  });

  it("marks a radio an arrow key focused without :focus-visible", async () => {
    installRadioFocus({ signal: life.signal });
    const [, light, dark] = group().radios as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ];
    light.focus();
    await webkitArrow(light, dark);
    expect(dark.matches(":focus-visible")).toBe(false);
    expect(dark.hasAttribute(ATTR)).toBe(true);
  });

  it("moves the mark to the next radio and clears it when focus leaves", async () => {
    installRadioFocus({ signal: life.signal });
    const { before, radios } = group();
    const [system, light, dark] = radios as [HTMLInputElement, HTMLInputElement, HTMLInputElement];
    light.focus();
    await webkitArrow(light, dark);
    await webkitArrow(dark, system);
    expect([dark.hasAttribute(ATTR), system.hasAttribute(ATTR)]).toEqual([false, true]);
    before.focus();
    expect(system.hasAttribute(ATTR)).toBe(false);
  });

  it("marks nothing for a pointer, a modified arrow or a key on another control", async () => {
    installRadioFocus({ signal: life.signal });
    const { before, radios } = group();
    const [system, light] = radios as [HTMLInputElement, HTMLInputElement];
    await userEvent.click(system);
    await task();
    expect(system.hasAttribute(ATTR)).toBe(false);
    light.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }),
    );
    system.focus({ focusVisible: false });
    await task();
    expect(system.hasAttribute(ATTR)).toBe(false);
    before.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    light.focus({ focusVisible: false });
    await task();
    expect(light.hasAttribute(ATTR)).toBe(false);
  });

  it("clears the mark on a press anywhere", async () => {
    installRadioFocus({ signal: life.signal });
    const { before, radios } = group();
    const [, light, dark] = radios as [HTMLInputElement, HTMLInputElement, HTMLInputElement];
    light.focus();
    await webkitArrow(light, dark);
    before.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(dark.hasAttribute(ATTR)).toBe(false);
  });

  it("keeps listening until every caller's signal has aborted", async () => {
    const first = new AbortController();
    installRadioFocus({ signal: first.signal });
    installRadioFocus({ signal: life.signal });
    const [system, light, dark] = group().radios as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ];
    first.abort();
    light.focus();
    await webkitArrow(light, dark);
    expect(dark.hasAttribute(ATTR)).toBe(true);
    life.abort();
    expect(dark.hasAttribute(ATTR), "aborting clears the mark").toBe(false);
    await webkitArrow(dark, system);
    expect(system.hasAttribute(ATTR)).toBe(false);
  });

  it("does nothing under a signal that has already aborted", async () => {
    installRadioFocus({ signal: AbortSignal.abort() });
    const [, light, dark] = group().radios as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ];
    light.focus();
    await webkitArrow(light, dark);
    expect(dark.hasAttribute(ATTR)).toBe(false);
  });
});
