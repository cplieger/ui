/**
 * frame.ts — the script of a gallery frame, a page shown in an `<iframe>` on
 * a card so the library's narrow-width rules apply inside it. It runs the
 * library as an app does and takes the gallery's theme and hue from the
 * card's page by message, since a page opened from a file cannot reach a
 * frame's document.
 */

import { installAnchors } from "@cplieger/ui/anchor";
import { installAnnouncer } from "@cplieger/ui/announce";
import { createHeaderStatus } from "@cplieger/ui/header-status";
import { createIcons } from "@cplieger/ui/icons";
import { enhancePill } from "@cplieger/ui/pill";
import { applyPointerTier, installPointerTier } from "@cplieger/ui/pointer";

applyPointerTier();
installPointerTier();
installAnchors();
installAnnouncer();

const root = document.documentElement;
const icons = createIcons<string>({ base: new URL("icons/svg/", import.meta.url).href });
// In place, so a span keeps its other attributes, such as a toggle's
// data-part="on".
for (const span of document.querySelectorAll<HTMLElement>("[data-cp-icon]")) {
  const image = icons.icon(span.dataset["cpIcon"] ?? "").style.getPropertyValue("--cp-icon-image");
  span.style.setProperty("--cp-icon-image", image);
}

const HUE = /^\d{1,3}$/;
const setHue = (name: string, value: unknown): void => {
  if (typeof value === "string" && HUE.test(value)) {
    root.style.setProperty(name, value);
  } else {
    root.style.removeProperty(name);
  }
};
addEventListener("message", (e: MessageEvent<unknown>) => {
  const look = e.data;
  if (e.source !== parent || typeof look !== "object" || look === null) {
    return;
  }
  const { theme, accent, neutral } = look as Record<string, unknown>;
  if (theme === "light" || theme === "dark") {
    root.dataset["theme"] = theme;
  }
  setHue("--cp-accent-h", accent);
  setHue("--cp-neutral-h", neutral);
});
// The card's page answers with its look; one sent before this ran was lost.
if (parent !== window) {
  parent.postMessage("frame:ready", "*");
}

// The bottom bar's selection slides as an app's router moves aria-current.
for (const nav of document.querySelectorAll<HTMLElement>(".cp-header > .cp-nav")) {
  enhancePill(nav);
}

// A press on a destination shows its screen here, where an app would load it.
// Only a screen titled by its current destination is retitled: the not-found
// page has none, and its heading and nav stay as they are.
const heading = document.querySelector("h1");
const current = document.querySelector(".cp-nav-item[aria-current='page'] .cp-nav-label");
const retitle = heading !== null && current !== null && current.textContent === heading.textContent;
for (const item of document.querySelectorAll<HTMLAnchorElement>(".cp-nav-item")) {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    if (!retitle) {
      return;
    }
    for (const other of document.querySelectorAll(".cp-nav-item")) {
      if (other === item) {
        other.setAttribute("aria-current", "page");
      } else {
        other.removeAttribute("aria-current");
      }
    }
    heading.textContent = item.querySelector(".cp-nav-label")?.textContent ?? "";
    heading.focus();
  });
}

// The template's header status, on a quiet model.
const pill = document.querySelector<HTMLButtonElement>("button.cp-header-status");
const panel = document.getElementById("status");
if (pill !== null && panel !== null) {
  const now = Date.now();
  const banner = document.getElementById("urgent");
  const parts = banner === null ? { button: pill, panel } : { button: pill, panel, banner };
  createHeaderStatus(parts).update({
    conditions: [],
    work: [],
    next: "Next scan 03:00",
    recent: [
      { id: "scan", words: "Library scan finished", at: now - 12 * 60_000 },
      { id: "check", words: "Quick check found 2 releases", at: now - 95 * 60_000 },
    ],
    history: { href: "#", label: "Open activity" },
  });
}
