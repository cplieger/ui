import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { installDialogs } from "../dialog/dialog.js";
import { enhancePalette, type PaletteOptions } from "./palette.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

function page(options: Partial<PaletteOptions> = {}): {
  opener: HTMLButtonElement;
  dialog: HTMLDialogElement;
  field: HTMLInputElement;
  empty: HTMLElement;
  ran: string[];
} {
  const root = document.createElement("div");
  // Static test markup, never caller text.
  root.setHTMLUnsafe(
    '<button type="button" id="opener" commandfor="palette" command="show-modal">Open</button>' +
      '<dialog class="cp-dialog cp-palette" id="palette" aria-label="Command palette">' +
      '<div class="cp-palette-field"><input aria-label="Search actions"></div>' +
      '<ul role="listbox" aria-label="Actions">' +
      '<li role="option"><span>Go to the library</span><kbd>G L</kbd></li>' +
      '<li role="option"><span>Go to releases</span><kbd>G R</kbd></li>' +
      '<li role="option"><span>Open settings</span></li></ul>' +
      '<p data-part="empty" hidden>No action matches.</p></dialog>',
  );
  document.body.append(root);
  const dialog = root.querySelector("dialog") as HTMLDialogElement;
  const ran: string[] = [];
  installDialogs({ signal: life.signal });
  enhancePalette(dialog, {
    onRun: (o) => ran.push(o.querySelector("span")?.textContent ?? ""),
    signal: life.signal,
    ...options,
  });
  return {
    opener: root.querySelector("#opener") as HTMLButtonElement,
    dialog,
    field: root.querySelector("input") as HTMLInputElement,
    empty: root.querySelector('[data-part="empty"]') as HTMLElement,
    ran,
  };
}

const shown = (dialog: HTMLDialogElement): string[] =>
  [...dialog.querySelectorAll<HTMLElement>('[role="option"]:not([hidden]) > span')].map(
    (s) => s.textContent,
  );
const active = (field: HTMLInputElement): string | undefined =>
  document.getElementById(field.getAttribute("aria-activedescendant") ?? "")?.querySelector("span")
    ?.textContent;

describe("enhancePalette", () => {
  it("opens on Ctrl+K with its field focused, every action shown and the first active", async () => {
    const { dialog, field } = page();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("role")).toBe("combobox");
    expect(field.getAttribute("aria-expanded")).toBe("true");
    expect(shown(dialog)).toEqual(["Go to the library", "Go to releases", "Open settings"]);
    expect(active(field)).toBe("Go to the library");
  });

  it("narrows by an action's words, not its keys, and runs the active one on Enter", async () => {
    const { opener, dialog, field, ran } = page();
    await userEvent.click(opener);
    await userEvent.keyboard("go");
    expect(shown(dialog)).toEqual(["Go to the library", "Go to releases"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(active(field)).toBe("Go to releases");
    await userEvent.keyboard("{Enter}");
    expect(ran).toEqual(["Go to releases"]);
    await expect.poll(() => dialog.open).toBe(false);
    await userEvent.click(opener);
    await userEvent.keyboard("gl");
    expect(shown(dialog)).toEqual([]);
  });

  it("runs an action pressed, and opens again with its field empty", async () => {
    const { opener, dialog, field, ran } = page();
    await userEvent.click(opener);
    await userEvent.keyboard("set");
    await userEvent.click(dialog.querySelector('[role="option"]:not([hidden])') as HTMLElement);
    expect(ran).toEqual(["Open settings"]);
    await expect.poll(() => dialog.open).toBe(false);
    await userEvent.click(opener);
    expect(field.value).toBe("");
    expect(shown(dialog)).toHaveLength(3);
  });

  it("shows and says its empty words while nothing matches", async () => {
    installAnnouncer({ signal: life.signal });
    const { opener, dialog, empty } = page();
    await userEvent.click(opener);
    await userEvent.keyboard("zzz");
    expect(empty.hidden).toBe(false);
    await expect
      .poll(() => dialog.querySelector('[data-cp-politeness="polite"]')?.textContent)
      .toBe("No action matches.");
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(empty.hidden).toBe(true);
  });

  it("closes on Escape, giving focus back to its opener", async () => {
    const { opener, dialog } = page();
    await userEvent.click(opener);
    await userEvent.keyboard("go{Escape}");
    await expect.poll(() => dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("leaves Ctrl+K alone while another dialog is open, and with no key", async () => {
    const other = document.createElement("dialog");
    document.body.append(other);
    const { dialog } = page();
    other.showModal();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(dialog.open).toBe(false);
    other.close();
    life.abort();
    life = new AbortController();
    const second = page({ key: null });
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(second.dialog.open).toBe(false);
  });

  it("throws without a field or a listbox", () => {
    const d = document.createElement("dialog");
    expect(() => enhancePalette(d, { onRun: () => undefined })).toThrow(TypeError);
  });
});
