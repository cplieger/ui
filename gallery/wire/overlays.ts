/**
 * overlays.ts — the gallery's wiring for the overlay and button cards that
 * run on the library.
 */

import { installAnchors } from "@cplieger/ui/anchor";
import { installDialogs } from "@cplieger/ui/dialog";
import { enhanceContextMenu, enhanceMenu } from "@cplieger/ui/menu";
import { toast } from "@cplieger/ui/toast";

installAnchors();
installDialogs();

// A menu item names what it would do by data-say; a removal is a warning.
const say = (item: HTMLElement): void => {
  const title = item.dataset["say"];
  if (title !== undefined) {
    toast({ kind: item.dataset["tone"] === "danger" ? "warning" : "info", title });
  }
};
for (const menu of document.querySelectorAll<HTMLElement>(".cp-menu[popover]")) {
  enhanceMenu(menu, { onSelect: say });
}
// A list marked data-context opens the menu its rows' ⋯ buttons open.
for (const zone of document.querySelectorAll<HTMLElement>("[data-context]")) {
  const id = zone.querySelector("[popovertarget]")?.getAttribute("popovertarget");
  const menu = id === null || id === undefined ? null : document.getElementById(id);
  if (menu !== null) {
    enhanceContextMenu(zone, menu, { onSelect: say });
  }
}

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
