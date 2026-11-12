/**
 * frame.ts — the script of a gallery frame, a page shown in an `<iframe>` on
 * a card so the library's narrow-width rules apply inside it. It runs the
 * library as an app does and takes the gallery's theme and hue from the
 * card's page by message, since a page opened from a file cannot reach a
 * frame's document.
 */

import { createIcons } from "@cplieger/ui/icons";
import { applyPointerTier, installPointerTier } from "@cplieger/ui/pointer";

applyPointerTier();
installPointerTier();

const root = document.documentElement;
const icons = createIcons<string>({ base: new URL("icons/svg/", location.href).href });
for (const span of document.querySelectorAll<HTMLElement>("[data-cp-icon]")) {
  span.replaceWith(icons.icon(span.dataset["cpIcon"] ?? ""));
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

// A press on a destination shows its screen here, where an app would load it.
const heading = document.querySelector("h1");
for (const item of document.querySelectorAll<HTMLAnchorElement>(".cp-nav-item")) {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    for (const other of document.querySelectorAll(".cp-nav-item")) {
      if (other === item) {
        other.setAttribute("aria-current", "page");
      } else {
        other.removeAttribute("aria-current");
      }
    }
    if (heading !== null) {
      heading.textContent = item.querySelector(".cp-nav-label")?.textContent ?? "";
    }
  });
}
