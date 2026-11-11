import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceChoiceFields } from "./choice.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function cadence(): {
  group: HTMLElement;
  every: HTMLInputElement;
  never: HTMLInputElement;
  minutes: HTMLInputElement;
} {
  const group = document.createElement("fieldset");
  group.className = "cp-choices";
  // Static test markup, never caller text.
  group.setHTMLUnsafe(
    "<legend>Run checks</legend>" +
      '<div class="cp-choice"><input class="cp-radio" type="radio" name="c" id="every" aria-label="Every"><span class="cp-choice-field"><input class="cp-input" id="min" type="number" value="30" aria-label="Minutes"></span></div>' +
      '<label class="cp-choice"><input class="cp-radio" type="radio" name="c" id="never" checked><span>Only when triggered</span></label>',
  );
  document.body.append(group);
  const get = (id: string) => group.querySelector(`#${id}`) as HTMLInputElement;
  return { group, every: get("every"), never: get("never"), minutes: get("min") };
}

describe("enhanceChoiceFields", () => {
  it("keeps a radio's field out of the tab order and unavailable until its radio is chosen", async () => {
    const { group, every, minutes } = cadence();
    enhanceChoiceFields(group, { signal: life.signal });
    expect([minutes.getAttribute("aria-disabled"), minutes.tabIndex]).toEqual(["true", -1]);
    expect(minutes.disabled).toBe(false);
    await userEvent.click(every);
    expect([minutes.getAttribute("aria-disabled"), minutes.tabIndex]).toEqual(["false", 0]);
  });

  it("chooses the radio when its field takes focus, and tells the form as a press would", async () => {
    const { group, every, never, minutes } = cadence();
    let changes = 0;
    group.addEventListener("change", () => (changes += 1));
    enhanceChoiceFields(group, { signal: life.signal });
    // A press reaches a field marked unavailable, which Playwright only sends forced.
    await userEvent.click(minutes, { force: true });
    expect(document.activeElement).toBe(minutes);
    expect([every.checked, never.checked]).toEqual([true, false]);
    expect(changes).toBe(1);
    expect(minutes.getAttribute("aria-disabled")).toBe("false");
  });

  it("removes the state it wrote once its signal aborts", () => {
    const { group, minutes } = cadence();
    enhanceChoiceFields(group, { signal: life.signal });
    life.abort();
    expect(minutes.hasAttribute("aria-disabled")).toBe(false);
    expect(minutes.hasAttribute("tabindex")).toBe(false);
  });
});
