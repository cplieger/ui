import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceRules, type RulesOptions } from "./rules.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function picker(value: string): HTMLElement {
  const s = document.createElement("select");
  s.setAttribute("aria-label", "Language");
  for (const v of ["English", "French", "German"]) {
    s.append(new Option(v, v, false, v === value));
  }
  return s;
}

function rules(): { box: HTMLElement; list: HTMLOListElement; addRule: HTMLButtonElement } {
  const box = document.createElement("div");
  box.className = "cp-rules";
  const list = document.createElement("ol");
  const li = document.createElement("li");
  li.dataset["when"] = "by default";
  li.setAttribute("data-fixed", "");
  const targets = document.createElement("span");
  targets.dataset["part"] = "targets";
  const t = document.createElement("span");
  t.className = "cp-rule-target";
  t.append(picker("English"));
  targets.append(t);
  li.append(targets);
  list.append(li);
  const addRule = document.createElement("button");
  addRule.type = "button";
  addRule.setAttribute("data-add-rule", "");
  addRule.textContent = "Add a rule";
  box.append(list, addRule);
  document.body.append(box);
  return { box, list, addRule };
}

function make(box: HTMLElement, options: Partial<RulesOptions> = {}): number[] {
  const changes: number[] = [];
  enhanceRules(box, {
    max: 3,
    target: () => picker("French"),
    rule: () => {
      const li = document.createElement("li");
      li.dataset["when"] = "when the audio is Japanese";
      const targets = document.createElement("span");
      targets.dataset["part"] = "targets";
      const t = document.createElement("span");
      t.className = "cp-rule-target";
      t.append(picker("German"));
      targets.append(t);
      li.append(targets);
      return li;
    },
    onChange: () => changes.push(1),
    signal: life.signal,
    ...options,
  });
  return changes;
}

const q = <E extends Element>(root: ParentNode, s: string) => root.querySelector(s) as E;

describe("enhanceRules", () => {
  it("gives a rule its +, names it by its rule, and a fixed rule no remove of its own", () => {
    const { box } = rules();
    make(box);
    const add = q<HTMLButtonElement>(box, "[data-add-target]");
    expect([add.getAttribute("aria-label"), add.type]).toEqual([
      "Add another by default",
      "button",
    ]);
    expect(box.querySelector("[data-remove-rule]")).toBeNull();
    expect(q<HTMLButtonElement>(box, "[data-remove-target]").hidden).toBe(true);
  });

  it("adds targets up to max, then marks + unavailable and says why", async () => {
    installAnnouncer({ signal: life.signal });
    const { box } = rules();
    const changes = make(box);
    const add = q<HTMLButtonElement>(box, "[data-add-target]");
    await userEvent.click(add);
    await userEvent.click(add);
    expect(box.querySelectorAll(".cp-rule-target")).toHaveLength(3);
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(add.getAttribute("aria-label")).toBe("Add another by default: 3 is the most");
    await expect
      .poll(() => document.querySelector('[aria-live="polite"]')?.textContent)
      .toBe("3 is the most");
    add.click();
    expect(box.querySelectorAll(".cp-rule-target")).toHaveLength(3);
    expect(changes).toHaveLength(2);
    const removes = [...box.querySelectorAll<HTMLButtonElement>("[data-remove-target]")];
    expect(removes.map((r) => [r.hidden, r.getAttribute("aria-label")])).toEqual([
      [false, "Remove English by default"],
      [false, "Remove French by default"],
      [false, "Remove French by default"],
    ]);
  });

  it("removes a target, moving focus to +, and keeps one per rule", async () => {
    const { box } = rules();
    make(box);
    const add = q<HTMLButtonElement>(box, "[data-add-target]");
    await userEvent.click(add);
    await userEvent.click(
      q<HTMLButtonElement>(box, ".cp-rule-target:last-child [data-remove-target]"),
    );
    expect(box.querySelectorAll(".cp-rule-target")).toHaveLength(1);
    expect(document.activeElement).toBe(add);
    expect(q<HTMLButtonElement>(box, "[data-remove-target]").hidden).toBe(true);
  });

  it("appends a rule with its buttons and focus on its +, and removes one moving focus on", async () => {
    const { box, list, addRule } = rules();
    make(box);
    await userEvent.click(addRule);
    const added = list.lastElementChild as HTMLElement;
    expect(added.dataset["when"]).toBe("when the audio is Japanese");
    expect(document.activeElement).toBe(q(added, "[data-add-target]"));
    const remove = q<HTMLButtonElement>(added, "[data-remove-rule]");
    expect(remove.getAttribute("aria-label")).toBe("Remove the rule when the audio is Japanese");
    await userEvent.click(remove);
    expect(list.children).toHaveLength(1);
    expect(document.activeElement).toBe(q(list, "[data-add-target]"));
  });

  it("renames a target's remove when its picker changes, and stops once its signal aborts", async () => {
    const { box } = rules();
    make(box);
    await userEvent.click(q<HTMLButtonElement>(box, "[data-add-target]"));
    const first = q<HTMLSelectElement>(box, "select");
    await userEvent.selectOptions(first, "German");
    expect(q(box, "[data-remove-target]").getAttribute("aria-label")).toBe(
      "Remove German by default",
    );
    life.abort();
    q<HTMLButtonElement>(box, "[data-add-target]").click();
    expect(box.querySelectorAll(".cp-rule-target")).toHaveLength(2);
  });
});
