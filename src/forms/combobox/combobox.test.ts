import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceCombobox, type ComboboxOptions } from "./combobox.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const WORDS = ["Frieren", "Fruits Basket", "Mushishi", "Monster"];

function combo(options: Partial<ComboboxOptions> = {}): {
  input: HTMLInputElement;
  list: HTMLElement;
  accepted: string[];
  texts: string[];
  form: HTMLFormElement;
  submits: () => number;
} {
  const form = document.createElement("form");
  let submits = 0;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submits += 1;
  });
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Jump to an entry");
  const list = document.createElement("ul");
  list.id = "entries";
  list.className = "cp-popover cp-listbox";
  for (const w of WORDS) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.textContent = w;
    list.append(li);
  }
  form.append(input, list);
  document.body.append(form);
  const accepted: string[] = [];
  const texts: string[] = [];
  enhanceCombobox(input, list, {
    onQuery: (text) => {
      for (const li of list.querySelectorAll<HTMLElement>("li")) {
        li.hidden = text !== "" && !li.textContent.toLowerCase().startsWith(text.toLowerCase());
      }
    },
    onAccept: (o) => accepted.push(o.textContent),
    signal: life.signal,
    ...options,
  });
  return { input, list, accepted, texts, form, submits: () => submits };
}

const open = (list: HTMLElement) => list.matches(":popover-open");
const active = (input: HTMLInputElement) =>
  document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent ?? null;

describe("enhanceCombobox", () => {
  it("writes the combobox pattern's roles and states on the field", () => {
    const { input, list } = combo();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe("entries");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(list.getAttribute("role")).toBe("listbox");
  });

  it("shows the options typing leaves, and closes when none is left", async () => {
    const { input, list } = combo();
    input.focus();
    await userEvent.keyboard("Fr");
    expect(open(list)).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect([...list.querySelectorAll("li:not([hidden])")].map((l) => l.textContent)).toEqual([
      "Frieren",
      "Fruits Basket",
    ]);
    expect(active(input)).toBeNull();
    await userEvent.keyboard("x");
    expect(open(list)).toBe(false);
  });

  it("moves the active option with the arrows, wrapping, while focus stays in the field", async () => {
    const { input, list } = combo();
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect([open(list), active(input)]).toEqual([true, "Frieren"]);
    await userEvent.keyboard("{ArrowUp}");
    expect(active(input)).toBe("Monster");
    await userEvent.keyboard("{ArrowDown}");
    expect(active(input)).toBe("Frieren");
    expect(document.activeElement).toBe(input);
    const selected = [...list.querySelectorAll('[aria-selected="true"]')];
    expect(selected.map((s) => s.textContent)).toEqual(["Frieren"]);
  });

  it("opens with nothing active on Alt+ArrowDown, and closes keeping the text on Alt+ArrowUp", async () => {
    const { input, list } = combo();
    input.focus();
    await userEvent.keyboard("M{Alt>}{ArrowUp}{/Alt}");
    expect([open(list), input.value]).toEqual([false, "M"]);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect([open(list), active(input)]).toEqual([true, null]);
  });

  it("accepts the active option on Enter without submitting the form, and closes", async () => {
    const { input, list, accepted, submits } = combo();
    input.focus();
    await userEvent.keyboard("Mu{ArrowDown}{Enter}");
    expect(accepted).toEqual(["Mushishi"]);
    expect(open(list)).toBe(false);
    expect(submits()).toBe(0);
  });

  it("gives Enter with no active option to onText, or else to the form", async () => {
    const texts: string[] = [];
    const a = combo({ onText: (t) => texts.push(t) });
    a.input.focus();
    await userEvent.keyboard("Fr{Enter}");
    expect([texts, a.submits(), a.accepted]).toEqual([["Fr"], 0, []]);
    document.body.replaceChildren();
    const b = combo();
    b.input.focus();
    await userEvent.keyboard("Fr{Enter}");
    expect(b.submits()).toBe(1);
  });

  it("makes the first option active as typing changes them, with autoActivate", async () => {
    const { input } = combo({ autoActivate: true });
    input.focus();
    await userEvent.keyboard("Mo");
    expect(active(input)).toBe("Monster");
  });

  it("accepts an option on a press and keeps focus in the field", async () => {
    const { input, list, accepted } = combo();
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.click(list.querySelectorAll("li")[2] as HTMLElement);
    expect(accepted).toEqual(["Mushishi"]);
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape keeping the text, then clears the text on a second Escape, and leaves an empty field's Escape alone", async () => {
    const { input, list } = combo();
    input.focus();
    await userEvent.keyboard("Fr");
    const escape = () => {
      const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      input.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(escape()).toBe(true);
    expect([open(list), input.value]).toEqual([false, "Fr"]);
    expect(escape()).toBe(true);
    expect(input.value).toBe("");
    expect(escape()).toBe(false);
  });

  it("closes as focus leaves the field and its list", async () => {
    const { input, list } = combo();
    const other = document.createElement("button");
    document.body.append(other);
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    other.focus();
    expect(open(list)).toBe(false);
  });

  it("skips hidden and unavailable options", async () => {
    const { input, list } = combo();
    (list.children[0] as HTMLElement).setAttribute("aria-disabled", "true");
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(active(input)).toBe("Fruits Basket");
  });

  it("reports the text once typing pauses, once for a burst", async () => {
    const settled: string[] = [];
    const { input } = combo({ onSettle: (t) => settled.push(t), settle: 40 });
    input.focus();
    // A burst in one task, so the test does not depend on how fast keys arrive.
    for (const text of ["M", "Mo", "Mon"]) {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(settled).toEqual([]);
    await expect.poll(() => settled).toEqual(["Mon"]);
  });

  it("keeps an inline list in place with its best match active, and leaves Escape to its holder", async () => {
    const { input, list, form } = combo({ inline: true, autoActivate: true });
    let escapes = 0;
    form.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        escapes += 1;
      }
    });
    expect(list.hasAttribute("popover")).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    input.focus();
    await userEvent.keyboard("M");
    expect(active(input)).toBe("Mushishi");
    await userEvent.keyboard("{Escape}");
    expect(escapes).toBe(1);
    expect(input.value).toBe("M");
    input.blur();
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("removes its attributes and closes once its signal aborts", async () => {
    const { input, list } = combo();
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    life.abort();
    expect(open(list)).toBe(false);
    for (const a of ["role", "aria-expanded", "aria-controls", "aria-activedescendant"]) {
      expect(input.hasAttribute(a), a).toBe(false);
    }
  });
});
