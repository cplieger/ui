/**
 * overlays.ts — the gallery's wiring for the overlay and button cards that
 * run on the library.
 */

import { installDialogs } from "@cplieger/ui/dialog";

installDialogs();

// The shortcut list: ? opens it anywhere outside a field and while no other
// dialog is open.
const keys = document.getElementById("keys");
if (keys instanceof HTMLDialogElement) {
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (
      e.key !== "?" ||
      e.defaultPrevented ||
      (t instanceof Element && t.closest("input, textarea, select, [contenteditable]") !== null) ||
      document.querySelector("dialog:modal") !== null
    ) {
      return;
    }
    keys.showModal();
  });
}
