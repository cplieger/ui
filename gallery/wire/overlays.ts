/**
 * overlays.ts — the gallery's wiring for the overlay and button cards that
 * run on the library.
 */

import { installAnchors } from "@cplieger/ui/anchor";
import { installDialogs } from "@cplieger/ui/dialog";
import { enhanceContextMenu, enhanceMenu } from "@cplieger/ui/menu";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhancePopconfirm } from "@cplieger/ui/popconfirm";
import { enhanceSelectPanel } from "@cplieger/ui/select-panel";
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

for (const pop of document.querySelectorAll<HTMLElement>('.cp-popover[data-variant="confirm"]')) {
  enhancePopconfirm(pop, {
    onConfirm: () => {
      toast({ kind: "success", title: pop.dataset["say"] ?? "Done" });
    },
  });
}

for (const panel of document.querySelectorAll<HTMLElement>(".cp-select-panel")) {
  const trigger = document.querySelector<HTMLElement>(`[popovertarget="${panel.id}"]`);
  const label = trigger?.querySelector('[data-part="label"]');
  const show = (n: number): void => {
    if (trigger !== null && label !== null && label !== undefined) {
      label.textContent = n > 0 ? `Labels: ${String(n)}` : "Labels";
      trigger.toggleAttribute("data-active", n > 0);
    }
  };
  show(panel.querySelectorAll('[aria-selected="true"]').length);
  enhanceSelectPanel(panel, {
    onApply: (chosen) => {
      show(chosen.length);
    },
  });
}

for (const panel of document.querySelectorAll<HTMLElement>("[data-filter-panel]")) {
  enhancePanel(panel);
  const trigger = document.querySelector<HTMLElement>(
    `[popovertarget="${panel.id}"]:not([popovertargetaction])`,
  );
  const badge = trigger?.querySelector<HTMLElement>(".cp-badge");
  const boxes = [...panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const showButton = panel.querySelector("[data-panel-show]");
  const update = (): void => {
    const n = boxes.filter((b) => b.checked).length;
    if (trigger !== null && badge !== null && badge !== undefined) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
      trigger.toggleAttribute("data-active", n > 0);
      trigger.setAttribute("aria-label", n > 0 ? `Filters, ${String(n)} on` : "Filters");
    }
    if (showButton !== null) {
      // The gallery's made-up result counts for none to three filters.
      showButton.textContent = n > 0 ? `Show ${String([0, 33, 42, 51][n])}` : "Show all 412";
    }
  };
  panel.addEventListener("change", update);
  panel.querySelector("[data-panel-clear]")?.addEventListener("click", () => {
    for (const b of boxes) {
      b.checked = false;
    }
    update();
  });
  update();
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
