/**
 * nav-feedback.ts — the gallery's wiring for the navigation and feedback
 * cards that run on the library: the header's account menu and its status
 * demo, the jump field, the rail's filters, the content tabs and the
 * accordion.
 */

import { announce, installAnnouncer } from "@cplieger/ui/announce";
import { enhanceCombobox } from "@cplieger/ui/combobox";
import { enhanceDisclosure, groupDisclosures } from "@cplieger/ui/disclosure";
import { enhanceMenu } from "@cplieger/ui/menu";
import { enhanceTabs } from "@cplieger/ui/tabs";
import { toast } from "@cplieger/ui/toast";

installAnnouncer();

// A menu item names the toast it shows by data-say.
for (const menu of document.querySelectorAll<HTMLElement>(".cp-header .cp-menu, #m-season")) {
  enhanceMenu(menu, {
    onSelect: (item) => {
      const title = item.dataset["say"];
      if (title !== undefined) {
        toast({ title });
      }
    },
  });
}

// The worst state that holds, from problems to all good. A change is said
// politely in the button's own words, and the panel's heading follows.
const STATES = [
  { state: "ok", words: "All good" },
  { state: "working", words: "Working: 3" },
  { state: "warning", words: "1 warning" },
  { state: "problem", words: "2 problems", detail: "Full check 3 of 8" },
  { state: "offline", words: "Offline" },
] as const;

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-status-demo]")) {
  const card = button.closest(".card");
  const status = card?.querySelector<HTMLElement>(".cp-header-status");
  const heading = card?.querySelector<HTMLElement>(".cp-status-panel > h2");
  if (status === null || status === undefined) {
    continue;
  }
  let at = 0;
  button.addEventListener("click", () => {
    at = (at + 1) % STATES.length;
    const next = STATES[at] ?? STATES[0];
    status.dataset["state"] = next.state;
    const words = document.createElement("span");
    words.textContent = next.words;
    status.replaceChildren(words);
    if ("detail" in next) {
      const detail = document.createElement("span");
      detail.dataset["part"] = "detail";
      detail.textContent = next.detail;
      status.append(detail);
    }
    if (heading !== null && heading !== undefined) {
      heading.textContent = next.words;
    }
    announce(next.words);
  });
}

// The jump field: one value, its options filtered by what was typed, the
// count or the no-match line said once typing stops.
for (const row of document.querySelectorAll<HTMLElement>("[data-jump]")) {
  const input = row.querySelector<HTMLInputElement>("input");
  const popup = document.getElementById(row.dataset["jump"] ?? "");
  if (input === null || popup === null) {
    continue;
  }
  const listbox = popup.querySelector<HTMLElement>('[role="listbox"]');
  const empty = popup.querySelector<HTMLElement>(".cp-listbox-empty");
  if (listbox === null || empty === null) {
    continue;
  }
  const options = [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
  const matches = (): HTMLElement[] => options.filter((o) => !o.hidden);
  const open = (option: HTMLElement): void => {
    input.value = option.querySelector("strong")?.textContent ?? "";
    toast({ kind: "info", title: `Opened ${input.value}` });
  };
  const combobox = enhanceCombobox(input, listbox, {
    popup,
    empty,
    anchor: row,
    autoActivate: true,
    settle: 500,
    onQuery: (text) => {
      const q = text.trim().toLowerCase();
      for (const o of options) {
        o.hidden = q !== "" && !o.textContent.toLowerCase().includes(q);
      }
      empty.textContent = `No entry matches “${text.trim()}”`;
    },
    onAccept: open,
    onSettle: () => {
      const n = matches().length;
      announce(n > 0 ? `${String(n)} entries` : empty.textContent);
    },
  });
  row.querySelector("[data-jump-go]")?.addEventListener("click", () => {
    const first = matches()[0];
    if (first !== undefined && input.value.trim() !== "") {
      open(first);
      return;
    }
    input.focus();
    combobox.refresh();
  });
}

for (const filter of document.querySelectorAll<HTMLButtonElement>(
  ".cp-filter-group > .cp-filter",
)) {
  filter.addEventListener("click", () => {
    filter.setAttribute("aria-pressed", String(filter.getAttribute("aria-pressed") !== "true"));
  });
}

// data-tabs="manual" marks panels that load once chosen: each choice loads
// its panel again, as an app that fetches it would.
const load = (tab: HTMLElement, panel: HTMLElement | null): void => {
  if (panel === null) {
    return;
  }
  panel.setAttribute("aria-busy", "true");
  panel.textContent = "Loading…";
  setTimeout(() => {
    panel.removeAttribute("aria-busy");
    panel.textContent = `${tab.textContent.trim()}: loaded when selected.`;
  }, 500);
};
for (const list of document.querySelectorAll<HTMLElement>(".cp-tabs[data-tabs]")) {
  enhanceTabs(
    list,
    list.dataset["tabs"] === "manual" ? { activation: "manual", onSelect: load } : {},
  );
}

// data-accordion-mode names the accordion its One at a time and Any number
// choice switches.
for (const mode of document.querySelectorAll<HTMLElement>("[data-accordion-mode]")) {
  const accordion = document.getElementById(mode.dataset["accordionMode"] ?? "");
  if (accordion === null) {
    continue;
  }
  const sections = [...accordion.querySelectorAll("details")];
  const group = sections[0]?.getAttribute("name") ?? accordion.id;
  for (const d of sections) {
    enhanceDisclosure(d);
  }
  mode.addEventListener("change", (e) => {
    const one = e.target instanceof HTMLInputElement && e.target.value === "one";
    groupDisclosures(sections, one ? group : null);
  });
}
