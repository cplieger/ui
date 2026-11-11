import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { installAnchors } from "../anchor/anchor.js";
import { enhanceSelectPanel } from "./select-panel.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
    p.hidePopover();
  }
  document.body.replaceChildren();
});

function page(listbox = true): {
  opener: HTMLButtonElement;
  panel: HTMLElement;
  field: HTMLInputElement;
  options: HTMLElement[];
  empty: HTMLElement;
  apply: HTMLButtonElement;
} {
  const root = document.createElement("div");
  // Static test markup, never caller text.
  root.setHTMLUnsafe(
    '<button type="button" id="opener" popovertarget="sp">Labels</button><p id="outside">Elsewhere</p>' +
      '<div class="cp-popover cp-select-panel" popover id="sp" role="dialog" aria-label="Labels"><form>' +
      '<input aria-label="Filter labels">' +
      (listbox
        ? '<ul role="listbox" aria-label="Labels">' +
          '<li role="option" aria-selected="false">Watch next</li>' +
          '<li role="option" aria-selected="true">Rewatch</li>' +
          '<li role="option" aria-selected="false" aria-disabled="true">Dub wanted</li>' +
          '<li role="option" aria-selected="false">Archive</li></ul>'
        : "") +
      '<p data-part="empty" hidden>No label matches.</p><button id="apply">Apply</button></form></div>',
  );
  document.body.append(root);
  return {
    opener: root.querySelector("#opener") as HTMLButtonElement,
    panel: root.querySelector("#sp") as HTMLElement,
    field: root.querySelector("input") as HTMLInputElement,
    options: [...root.querySelectorAll<HTMLElement>('[role="option"]')],
    empty: root.querySelector('[data-part="empty"]') as HTMLElement,
    apply: root.querySelector("#apply") as HTMLButtonElement,
  };
}

const checked = (options: HTMLElement[]): string[] =>
  options.filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.textContent);

const activeOf = (field: HTMLInputElement): string | undefined =>
  document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.textContent;

describe("enhanceSelectPanel", () => {
  it("opens with its field cleared and focused and its first option active", async () => {
    const { opener, panel, field } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    field.value = "left over";
    await userEvent.click(opener);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("");
    expect(activeOf(field)).toBe("Watch next");
    expect(field.getAttribute("role")).toBe("combobox");
    expect(field.getAttribute("aria-controls")).toBe(panel.querySelector("ul")?.id);
    expect(panel.querySelector("ul")?.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("filters the options by their words, and shows its empty words while none matches", async () => {
    const { opener, panel, field, options, empty } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    await userEvent.keyboard("ARCH");
    expect(options.map((o) => o.hidden)).toEqual([true, true, true, false]);
    expect(activeOf(field)).toBe("Archive");
    expect(empty.hidden).toBe(true);
    await userEvent.keyboard("x");
    expect(options.every((o) => o.hidden)).toBe(true);
    expect(empty.hidden).toBe(false);
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("says its empty words as the list goes empty, since focus stays in the field", async () => {
    installAnnouncer({ signal: life.signal });
    const { opener, panel, empty } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    await userEvent.keyboard("zzz");
    expect(empty.hidden).toBe(false);
    await expect
      .poll(() => document.querySelector('[data-cp-politeness="polite"]')?.textContent)
      .toBe("No label matches.");
  });

  it("moves the active option with the arrows, wrapping and skipping a disabled one, and checks it on Enter", async () => {
    const { opener, panel, field, options } = page();
    const applied: string[][] = [];
    enhanceSelectPanel(panel, {
      onApply: (chosen) => applied.push(chosen.map((o) => o.textContent)),
      signal: life.signal,
    });
    await userEvent.click(opener);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOf(field)).toBe("Archive");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeOf(field)).toBe("Watch next");
    await userEvent.keyboard("{ArrowUp}");
    expect(activeOf(field)).toBe("Archive");
    await userEvent.keyboard("{Enter}");
    expect(checked(options)).toEqual(["Rewatch", "Archive"]);
    expect(panel.matches(":popover-open")).toBe(true);
    expect(applied).toEqual([]);
    expect(document.activeElement).toBe(field);
  });

  it("checks a pressed option and keeps focus in the field, and ignores a disabled one", async () => {
    const { opener, panel, field, options } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    await userEvent.click(options[1] as HTMLElement);
    await userEvent.click(options[2] as HTMLElement, { force: true });
    expect(checked(options)).toEqual([]);
    expect(activeOf(field)).toBe("Rewatch");
    expect(document.activeElement).toBe(field);
  });

  it("applies the checked options in order on submit, after closing with focus on the opener", async () => {
    installAnchors({ signal: life.signal });
    const { opener, panel, options, apply } = page();
    const seen: { chosen: string[]; open: boolean; focus: Element | null }[] = [];
    enhanceSelectPanel(panel, {
      onApply: (chosen) =>
        seen.push({
          chosen: chosen.map((o) => o.textContent),
          open: panel.matches(":popover-open"),
          focus: document.activeElement,
        }),
      signal: life.signal,
    });
    await userEvent.click(opener);
    await userEvent.click(options[0] as HTMLElement);
    await userEvent.click(apply);
    expect(seen).toEqual([{ chosen: ["Watch next", "Rewatch"], open: false, focus: opener }]);
    expect(checked(options)).toEqual(["Watch next", "Rewatch"]);
  });

  it("puts back the choice it opened with when Escape or a press outside closes it", async () => {
    const { opener, panel, options } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    await userEvent.click(options[0] as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(panel.matches(":popover-open")).toBe(false);
    expect(checked(options)).toEqual(["Rewatch"]);
    await userEvent.click(opener);
    await userEvent.click(options[3] as HTMLElement);
    await userEvent.click(document.querySelector("#outside") as HTMLElement);
    expect(panel.matches(":popover-open")).toBe(false);
    expect(checked(options)).toEqual(["Rewatch"]);
  });

  it("never applies from Enter in the field while no option matches", async () => {
    const { opener, panel } = page();
    let applied = 0;
    enhanceSelectPanel(panel, { onApply: () => (applied += 1), signal: life.signal });
    await userEvent.click(opener);
    await userEvent.keyboard("zz{Enter}");
    expect(applied).toBe(0);
    expect(panel.matches(":popover-open")).toBe(true);
  });

  it("throws for a panel with no listbox", () => {
    const { panel } = page(false);
    expect(() => {
      enhanceSelectPanel(panel, { onApply: () => undefined });
    }).toThrow(TypeError);
  });

  it("drops the active option and its listeners once its signal aborts", async () => {
    const { opener, panel, field, options } = page();
    enhanceSelectPanel(panel, { onApply: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    life.abort();
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
    expect(options.some((o) => o.hasAttribute("data-cp-active"))).toBe(false);
    await userEvent.keyboard("{ArrowDown}");
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
  });
});
