import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceStepper } from "./stepper.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function stepper(
  value = "3",
  step = "1",
): { s: HTMLElement; input: HTMLInputElement; minus: HTMLButtonElement; plus: HTMLButtonElement } {
  const s = document.createElement("div");
  s.className = "cp-stepper";
  s.setAttribute("role", "group");
  s.setAttribute("aria-label", "Parallel checks");
  // Static test markup, never caller text.
  s.setHTMLUnsafe(
    `<button class="cp-button" type="button" data-step="-1" aria-label="Fewer">-</button><input type="number" min="1" max="8" step="${step}" value="${value}" aria-label="Parallel checks"><button class="cp-button" type="button" data-step="1" aria-label="More">+</button>`,
  );
  document.body.append(s);
  const [minus, plus] = [...s.querySelectorAll("button")] as HTMLButtonElement[];
  return {
    s,
    input: s.querySelector("input") as HTMLInputElement,
    minus: minus as HTMLButtonElement,
    plus: plus as HTMLButtonElement,
  };
}

describe("enhanceStepper", () => {
  it("steps by the field's own step within its range, and tells the form at each change", async () => {
    const { s, input, minus, plus } = stepper("3", "2");
    const seen: string[] = [];
    input.addEventListener("change", () => seen.push(input.value));
    enhanceStepper(s, { signal: life.signal });
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(input.value).toBe("7");
    await userEvent.click(minus);
    expect(seen).toEqual(["5", "7", "5"]);
  });

  it("marks the button at the end it cannot pass, and a press of it does nothing", async () => {
    const { s, input, minus, plus } = stepper("7");
    let changes = 0;
    input.addEventListener("change", () => (changes += 1));
    enhanceStepper(s, { signal: life.signal });
    expect(plus.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(plus);
    expect([input.value, plus.getAttribute("aria-disabled")]).toEqual(["8", "true"]);
    // A press reaches a button marked unavailable, which Playwright only sends forced.
    await userEvent.click(plus, { force: true });
    expect([input.value, changes]).toEqual(["8", 1]);
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(minus.getAttribute("aria-disabled")).toBe("true");
    expect(plus.hasAttribute("aria-disabled")).toBe(false);
  });

  it("says each new value through the announcer", async () => {
    installAnnouncer({ signal: life.signal });
    const { s, plus } = stepper("3");
    enhanceStepper(s, { signal: life.signal });
    await userEvent.click(plus);
    const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;
    await expect.poll(polite).toBe("4");
  });

  it("rolls the number over the field while it changes, and a keystroke ends the roll at once", async () => {
    const { s, input, plus } = stepper("3");
    enhanceStepper(s, { signal: life.signal });
    await userEvent.click(plus);
    expect(s.hasAttribute("data-cp-rolling")).toBe(true);
    await expect.poll(() => s.hasAttribute("data-cp-rolling")).toBe(false);
    await userEvent.click(plus);
    expect(s.hasAttribute("data-cp-rolling")).toBe(true);
    input.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(s.hasAttribute("data-cp-rolling")).toBe(false);
  });

  it("removes its roll and the end marks once its signal aborts", async () => {
    const { s, plus } = stepper("8");
    enhanceStepper(s, { signal: life.signal });
    expect(plus.getAttribute("aria-disabled")).toBe("true");
    life.abort();
    expect(s.querySelector(".cp-stepper-show")).toBeNull();
    expect(plus.hasAttribute("aria-disabled")).toBe(false);
  });
});
