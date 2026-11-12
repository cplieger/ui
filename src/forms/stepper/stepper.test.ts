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
    const rolling: boolean[] = [];
    // Read as the press lands, since a slow press can outlast the roll.
    document.addEventListener("click", () => rolling.push(s.hasAttribute("data-cp-rolling")), {
      signal: life.signal,
    });
    await userEvent.click(plus);
    expect(rolling).toEqual([true]);
    await Promise.allSettled(s.getAnimations({ subtree: true }).map((a) => a.finished));
    await new Promise((r) => setTimeout(r, 0));
    expect(s.hasAttribute("data-cp-rolling")).toBe(false);
    // Held mid-roll, so only the keystroke can end it.
    document.addEventListener(
      "click",
      () => {
        for (const a of s.getAnimations({ subtree: true })) {
          a.pause();
        }
      },
      { signal: life.signal },
    );
    await userEvent.click(plus);
    expect(rolling).toEqual([true, true]);
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

  it("moves a number field ten steps on Shift with Up or Down", async () => {
    const { input } = stepper("3");
    input.max = "40";
    enhanceStepper(input.parentElement as HTMLElement, { signal: life.signal });
    input.focus();
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(input.value).toBe("13");
    await userEvent.keyboard("{ArrowDown}");
    expect(input.value).toBe("12");
  });
});

function nudge(value = "+1.25"): {
  s: HTMLElement;
  input: HTMLInputElement;
  button: (label: string) => HTMLButtonElement;
} {
  const s = document.createElement("div");
  s.className = "cp-stepper";
  s.dataset["variant"] = "nudge";
  // Static test markup, never caller text.
  s.setHTMLUnsafe(
    `<button type="button" data-step="-10">-1 s</button><button type="button" data-step="-1">-0.1 s</button><input class="cp-input" value="${value}" inputmode="decimal" data-min="-2" data-max="2" data-step="0.1" aria-label="Offset"><button type="button" data-step="1">+0.1 s</button><button type="button" data-step="10">+1 s</button><button type="button" data-reset="0">Reset</button><button type="button" data-reset>Undo</button>`,
  );
  document.body.append(s);
  return {
    s,
    input: s.querySelector("input") as HTMLInputElement,
    button: (label) =>
      [...s.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement,
  };
}

describe("enhanceStepper with a signed text field", () => {
  it("steps by multiples of its data-step, shows the sign, and keeps within its range", async () => {
    const { s, input, button } = nudge();
    const seen: string[] = [];
    input.addEventListener("change", () => seen.push(input.value));
    enhanceStepper(s, { signal: life.signal });
    await userEvent.click(button("+0.1 s"));
    expect(input.value).toBe("+1.35");
    await userEvent.click(button("-1 s"));
    await userEvent.click(button("-1 s"));
    expect(input.value).toBe("\u22120.65");
    await userEvent.click(button("-1 s"));
    await userEvent.click(button("-1 s"));
    expect(input.value).toBe("\u22122.00");
    expect(button("-1 s").getAttribute("aria-disabled")).toBe("true");
    expect(seen).toEqual(["+1.35", "+0.35", "\u22120.65", "\u22121.65", "\u22122.00"]);
  });

  it("steps on Up and Down, ten steps with Shift", async () => {
    const { s, input } = nudge("0.00");
    enhanceStepper(s, { signal: life.signal });
    input.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(input.value).toBe("+0.10");
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(input.value).toBe("\u22120.90");
  });

  it("resets to its data-reset, or else to the markup's value", async () => {
    const { s, input, button } = nudge();
    enhanceStepper(s, { signal: life.signal });
    await userEvent.click(button("Reset"));
    expect(input.value).toBe("0.00");
    await userEvent.click(button("Undo"));
    expect(input.value).toBe("+1.25");
  });

  it("settles a typed value to its form within the range, and puts back the last for text", async () => {
    const { s, input } = nudge();
    enhanceStepper(s, { format: (v) => `${v.toFixed(1)} s`, signal: life.signal });
    expect(input.value).toBe("1.3 s");
    await userEvent.clear(input);
    await userEvent.type(input, "\u22121,5");
    input.blur();
    expect(input.value).toBe("-1.5 s");
    await userEvent.clear(input);
    await userEvent.type(input, "soon");
    input.blur();
    expect(input.value).toBe("-1.5 s");
    await userEvent.clear(input);
    await userEvent.type(input, "9");
    input.blur();
    expect(input.value).toBe("2.0 s");
  });
});
