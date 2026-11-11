/**
 * data-tables.ts — the gallery's wiring for the data page's table and record
 * cards that run on the library.
 */

import { enhanceActiveFilters } from "@cplieger/ui/active-filters";
import { announce } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceMenu } from "@cplieger/ui/menu";
import { skeletonTiming } from "@cplieger/ui/skeleton";
import { enhanceBatchBar, enhanceSort } from "@cplieger/ui/table";
import { toast } from "@cplieger/ui/toast";

const all = <E extends Element>(selector: string, root: ParentNode = document): E[] => [
  ...root.querySelectorAll<E>(selector),
];

/** The gallery's stand-in for a request: under a second. */
const work = (): Promise<void> => new Promise((done) => setTimeout(done, 900));

for (const table of all<HTMLTableElement>("table:has(.cp-sort)")) {
  enhanceSort(table);
}

// A bar names its group of boxes by data-batch and the rows matching on
// every page by data-total.
for (const bar of all<HTMLElement>(".cp-batchbar[data-batch]")) {
  const group = CSS.escape(bar.dataset["batch"] ?? "");
  const header = document.querySelector<HTMLInputElement>(`input[data-select-all="${group}"]`);
  const batch = enhanceBatchBar(bar, {
    boxes: () => all<HTMLInputElement>(`input[data-group="${group}"]`),
    ...(header === null ? {} : { all: header }),
    total: () => Number(bar.dataset["total"]),
  });
  for (const button of all<HTMLButtonElement>("[data-batch-action]", bar)) {
    const grab = enhanceConfirm(button, { busy: "Grabbing…", done: "Grabbed", onRest: batch.sync });
    button.addEventListener("click", () => {
      const n = batch.count;
      void grab.run(work).then((ran) => {
        if (ran) {
          announce(`${String(n)} grabbed`);
        }
      });
    });
  }
}

// A row's Grab answers in its own cell, with no toast.
for (const button of all<HTMLButtonElement>("button[data-grab]")) {
  const grab = enhanceConfirm(button, { busy: "Grabbing…", done: "Grabbed" });
  const title = button.closest("tr")?.querySelector("a")?.textContent ?? "";
  button.addEventListener("click", () => {
    void grab.run(work).then((ran) => {
      if (ran) {
        announce(`${title} grabbed`);
      }
    });
  });
}

// One menu serves every row's ⋯; an item names its toast by data-say.
for (const menu of all<HTMLElement>(".cp-menu[popover]")) {
  enhanceMenu(menu, {
    onSelect: (item) => {
      const title = item.dataset["say"];
      if (title !== undefined) {
        toast({ kind: item.dataset["tone"] === "danger" ? "warning" : "info", title });
      }
    },
  });
}

// A row of filters names its count by data-count and the titles matching
// none by data-total. The gallery makes up a count for the filters left,
// and Put them back restores the chips the page opened with.
for (const row of all<HTMLElement>(".cp-active-filters[data-count]")) {
  const count = document.getElementById(row.dataset["count"] ?? "");
  if (count === null) {
    continue;
  }
  const total = Number(row.dataset["total"]);
  const counted = (n: number): string =>
    n === 0
      ? `${String(total)} titles`
      : `${String(Math.round(total / (n + 1)) + 3)} of ${String(total)}`;
  const active = enhanceActiveFilters(row, {
    count,
    onChange: (values) => {
      active.setCount(counted(values.length));
    },
  });
  const start = all<HTMLElement>(":scope > .cp-token", row).map((c) => c.cloneNode(true));
  row
    .closest(".card")
    ?.querySelector("[data-reset-filters]")
    ?.addEventListener("click", () => {
      for (const c of all(":scope > .cp-token", row)) {
        c.remove();
      }
      row.querySelector("[data-filters-clear]")?.before(...start.map((c) => c.cloneNode(true)));
      active.sync();
      active.setCount(counted(active.values.length));
    });
}

// Show loading stands for a load of 1.4 seconds: the skeleton, then the rows.
for (const button of all<HTMLButtonElement>("button[data-load]")) {
  const table = document.getElementById(button.dataset["load"] ?? "");
  const body = table instanceof HTMLTableElement ? table.tBodies[0] : undefined;
  if (table === null || body === undefined) {
    continue;
  }
  button.addEventListener("click", () => {
    if (table.hasAttribute("aria-busy")) {
      return;
    }
    const rows = [...body.rows];
    const columns = rows[0]?.cells.length ?? 0;
    table.setAttribute("aria-busy", "true");
    const load = skeletonTiming(() => {
      body.replaceChildren(
        ...rows.map(() => {
          const tr = document.createElement("tr");
          for (let i = 0; i < columns; i++) {
            const bone = document.createElement("span");
            bone.className = "cp-skeleton";
            tr.insertCell().append(bone);
          }
          return tr;
        }),
      );
    });
    setTimeout(() => {
      load.commit(() => {
        body.replaceChildren(...rows);
        table.removeAttribute("aria-busy");
      });
    }, 1400);
  });
}
