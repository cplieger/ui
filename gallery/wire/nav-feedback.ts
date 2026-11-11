/**
 * nav-feedback.ts — the gallery's wiring for the navigation and feedback
 * cards that run on the library: the header's account menu and its status
 * demo.
 */

import { announce, installAnnouncer } from "@cplieger/ui/announce";
import { enhanceMenu } from "@cplieger/ui/menu";
import { toast } from "@cplieger/ui/toast";

installAnnouncer();

// A header menu item names the toast it shows by data-say.
for (const menu of document.querySelectorAll<HTMLElement>(".cp-header .cp-menu")) {
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
