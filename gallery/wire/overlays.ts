/**
 * overlays.ts — the gallery's wiring for the overlay and button cards that
 * run on the library.
 */

import { announce, installAnnouncer } from "@cplieger/ui/announce";
import { anchorOf, installAnchors } from "@cplieger/ui/anchor";
import { enhanceConfirm, type Confirm } from "@cplieger/ui/confirm";
import { closeDialog, installDialogs } from "@cplieger/ui/dialog";
import { enhanceContextMenu, enhanceMenu } from "@cplieger/ui/menu";
import { enhanceOverflow } from "@cplieger/ui/overflow";
import { enhancePalette } from "@cplieger/ui/palette";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhancePopconfirm } from "@cplieger/ui/popconfirm";
import { enhanceSelectPanel } from "@cplieger/ui/select-panel";
import { toast } from "@cplieger/ui/toast";
import { enhancePill } from "@cplieger/ui/pill";
import { enhanceToggle } from "@cplieger/ui/toggle";
import { turn } from "@cplieger/ui/turn";

installAnchors();
installAnnouncer();
installDialogs();

// A menu item names what it would do by data-say; a removal is a warning.
const say = (item: HTMLElement): void => {
  const title = item.dataset["say"];
  if (title !== undefined) {
    toast({ kind: item.dataset["tone"] === "danger" ? "warning" : "info", title });
  }
};
// A toolbar's More menu is enhanced by enhanceOverflow, below.
for (const menu of document.querySelectorAll<HTMLElement>(
  ".cp-menu[popover]:not(.cp-overflow > *)",
)) {
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

// A button that confirms in place names its words by data-busy-words and
// data-done-words, and what to announce once done by data-say; its work
// here only waits, data-wait ms or 900.
const confirms = new Map<Element, Confirm>();
const confirmIn = (button: Element, said: string | undefined): void => {
  void confirms
    .get(button)
    ?.run(
      () =>
        new Promise((done) => setTimeout(done, Number(button.getAttribute("data-wait") ?? 900))),
    )
    .then((ok) => {
      if (ok && said !== undefined) {
        announce(said);
      }
    });
};
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-done-words]")) {
  confirms.set(
    b,
    enhanceConfirm(b, {
      busy: b.dataset["busyWords"] ?? "Saving…",
      done: b.dataset["doneWords"] ?? "Saved",
      ...(b.hasAttribute("data-footprint") ? { width: "footprint" as const } : {}),
    }),
  );
  if (!b.hasAttribute("popovertarget")) {
    b.addEventListener("click", () => {
      confirmIn(b, b.dataset["say"]);
    });
  }
}
for (const b of document.querySelectorAll("[data-turn]")) {
  b.addEventListener("click", () => {
    turn(b);
  });
}
for (const b of document.querySelectorAll<HTMLButtonElement>(
  '.cp-toggle:is([data-kind="pin"], [data-kind="favourite"])',
)) {
  enhanceToggle(b);
}
for (const g of document.querySelectorAll<HTMLElement>(".cp-segmented")) {
  enhancePill(g);
}

// A toolbar's buttons marked data-toast only say their words.
for (const bar of document.querySelectorAll<HTMLElement>(".cp-overflow")) {
  enhanceOverflow(bar);
  for (const b of bar.querySelectorAll<HTMLElement>("button[data-toast]")) {
    b.addEventListener("click", () => {
      toast({ kind: "info", title: b.textContent.trim() });
    });
  }
}

// A confirmation whose button confirms in place plays that button's cycle.
for (const pop of document.querySelectorAll<HTMLElement>('.cp-popover[data-variant="confirm"]')) {
  enhancePopconfirm(pop, {
    onConfirm: () => {
      const opener = anchorOf(pop);
      if (opener !== null && confirms.has(opener)) {
        confirmIn(opener, pop.dataset["say"]);
      } else {
        toast({ kind: "success", title: pop.dataset["say"] ?? "Done" });
      }
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

const DONE = "done";
const dialogs = [...document.querySelectorAll<HTMLDialogElement>(".cp-dialog")];

// A dialog that does work holds a plain form: its submit does the work, here
// none, and closes the dialog with the submitter's value or "done". It
// listens on the dialog, so a check on the form that refuses the submit by
// preventDefault, such as the upload's, runs first.
for (const d of dialogs) {
  if (d.querySelector(":scope > form")?.getAttribute("method") === "dialog") {
    continue;
  }
  d.addEventListener("submit", (e) => {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const by = e.submitter;
    closeDialog(d, by instanceof HTMLButtonElement && by.value !== "" ? by.value : DONE);
  });
}

// A form dialog opens with what was last saved: its work makes the text
// fields' values their new start, and every close puts the form back to it.
for (const d of document.querySelectorAll<HTMLDialogElement>(".cp-dialog[data-keep-typed]")) {
  d.addEventListener("close", () => {
    const form = d.querySelector("form");
    if (d.returnValue === DONE) {
      for (const f of d.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="file"], [type="checkbox"], [type="radio"]), textarea',
      )) {
        f.defaultValue = f.value;
      }
    }
    form?.reset();
  });
}

// A dialog's data-says is its toast once its own answer closes it.
for (const d of document.querySelectorAll<HTMLDialogElement>(".cp-dialog[data-says]")) {
  d.addEventListener("close", () => {
    const value = d.returnValue;
    if (value !== "" && value !== "cancel") {
      toast({ kind: value === "delete" ? "success" : "info", title: d.dataset["says"] ?? "" });
    }
  });
}

// The delete names how many files the chosen groups hold, and waits for one.
for (const d of document.querySelectorAll<HTMLDialogElement>("[data-grouped]")) {
  const boxes = [...d.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const go = d.querySelector<HTMLButtonElement>('[type="submit"]');
  if (go === null) {
    continue;
  }
  const update = (): void => {
    const n = boxes
      .filter((b) => b.checked)
      .reduce((sum, b) => sum + Number(b.dataset["count"]), 0);
    go.disabled = n === 0;
    go.textContent =
      n === 0 ? "Choose what to delete" : `Delete ${String(n)} ${n === 1 ? "file" : "files"}`;
  };
  d.addEventListener("change", update);
  d.addEventListener("close", () => {
    for (const b of boxes) {
      b.checked = false;
    }
    update();
  });
  update();
}

// The filter sheet stages, as docs/design-patterns.md describes: the foot
// counts what the choice would show, its submit applies it, and any other
// close puts back what was applied. The counts are the gallery's own.
const VERDICTS = new Map([
  ["best", 268],
  ["not", 33],
  ["missing", 9],
]);
const KINDS = new Map([
  ["all", 1],
  ["tv", 0.8],
  ["film", 0.2],
]);
for (const d of document.querySelectorAll<HTMLDialogElement>("[data-filter-sheet]")) {
  const card = d.closest(".card");
  const inputs = [...d.querySelectorAll<HTMLInputElement>("input")];
  const apply = d.querySelector<HTMLButtonElement>("[data-sheet-apply]");
  const opener = card?.querySelector<HTMLElement>("[data-filters-open]");
  const label = opener?.querySelector('[data-part="label"]');
  const clearOut = card?.querySelector<HTMLElement>("[data-filters-clear]");
  if (
    apply === null ||
    opener === null ||
    opener === undefined ||
    label === null ||
    label === undefined ||
    clearOut === null ||
    clearOut === undefined
  ) {
    continue;
  }
  const total = Number(d.dataset["total"]);
  let applied = inputs.map((i) => i.checked);
  const kindOf = (states: readonly boolean[]): string =>
    inputs.find((i, k) => i.name === "kind" && states[k] === true)?.value ?? "all";
  const results = (): number => {
    const now = inputs.map((i) => i.checked);
    const chosen = inputs.filter((i) => i.name === "verdict" && i.checked);
    const n =
      chosen.length === 0
        ? total
        : chosen.reduce((sum, i) => sum + (VERDICTS.get(i.value) ?? 0), 0);
    return Math.round(n * (KINDS.get(kindOf(now)) ?? 1));
  };
  const recount = (): void => {
    const n = results();
    apply.textContent = n === 0 ? "No results" : `Show ${String(n)} results`;
    apply.toggleAttribute("aria-disabled", n === 0);
  };
  const showApplied = (): void => {
    const verdicts = inputs.filter((i, k) => i.name === "verdict" && applied[k] === true).length;
    const n = verdicts + (kindOf(applied) === "all" ? 0 : 1);
    label.textContent = n === 0 ? "Filters" : `Filters, ${String(n)}`;
    opener.toggleAttribute("data-active", n > 0);
    clearOut.hidden = n === 0;
  };
  const clear = (): void => {
    for (const i of inputs) {
      i.checked = i.name === "kind" && i.value === "all";
    }
  };
  d.addEventListener("change", recount);
  d.querySelector("[data-sheet-clear]")?.addEventListener("click", () => {
    clear();
    recount();
  });
  // A choice that shows nothing is not applied: its button only says so.
  apply.addEventListener("click", (e) => {
    if (apply.hasAttribute("aria-disabled")) {
      e.preventDefault();
    }
  });
  d.addEventListener("close", () => {
    if (d.returnValue === "apply") {
      applied = inputs.map((i) => i.checked);
      toast({ kind: "info", title: `Showing ${String(results())} results` });
    } else {
      inputs.forEach((i, k) => {
        i.checked = applied[k] === true;
      });
    }
    showApplied();
    recount();
  });
  clearOut.addEventListener("click", () => {
    clear();
    applied = inputs.map((i) => i.checked);
    showApplied();
    recount();
    opener.focus();
    announce("Filters cleared");
  });
  showApplied();
  recount();
}

// The palette's actions only say what they would do.
const palette = document.getElementById("palette");
if (palette instanceof HTMLDialogElement) {
  enhancePalette(palette, {
    onRun: (option) => {
      toast({ kind: "info", title: option.querySelector("span:not(.cp-icon)")?.textContent ?? "" });
    },
  });
}

// A close command and Escape keep the last returnValue, so each close
// clears it for the next; registered last, after every reader above.
for (const d of dialogs) {
  d.addEventListener("close", () => {
    d.returnValue = "";
  });
}
