/**
 * data-tables.ts — the gallery's wiring for the data page's table and record
 * cards that run on the library.
 */

import { enhanceActiveFilters } from "@cplieger/ui/active-filters";
import { announce } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceDisclosure } from "@cplieger/ui/disclosure";
import { enhanceMenu } from "@cplieger/ui/menu";
import { skeletonTiming } from "@cplieger/ui/skeleton";
import { createStateHistory } from "@cplieger/ui/state-history";
import { enhanceBatchBar, enhanceRowDetail, enhanceSort } from "@cplieger/ui/table";
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

for (const table of all<HTMLTableElement>('table:has([data-col="expand"] [aria-controls])')) {
  enhanceRowDetail(table);
}

const make = (tag: string, className: string, ...children: (Node | string)[]): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
};

const glyph = (name: string, part?: string): HTMLElement => {
  const node = make("span", "cp-icon");
  node.dataset["cpIcon"] = name;
  if (part !== undefined) {
    node.dataset["part"] = part;
  }
  node.setAttribute("aria-hidden", "true");
  return node;
};

// A row's Download turns into its result in its own cell. The one marked
// data-outcome="fail" fails once, and its Retry then succeeds.
for (const button of all<HTMLButtonElement>("button[data-outcome]")) {
  const cell = button.parentElement;
  if (cell === null) {
    continue;
  }
  let fails = button.dataset["outcome"] === "fail";
  const settle = (outcome: HTMLElement, said: string, politeness?: "assertive"): void => {
    cell.replaceChildren(outcome);
    outcome.querySelector<HTMLElement>("a, button")?.focus();
    announce(said, politeness);
  };
  const download = (b: HTMLButtonElement): void => {
    const cycle = enhanceConfirm(b, { busy: "Downloading…", done: false });
    const load = (): Promise<void> =>
      new Promise((ok, no) =>
        setTimeout(() => {
          if (fails) {
            no(new Error("The provider timed out."));
          } else {
            ok();
          }
        }, 1400),
      );
    b.addEventListener("click", () => {
      cycle.run(load).then(
        (ran) => {
          if (!ran) {
            return;
          }
          const link = make("a", "", glyph("circle-check"), "Downloaded · Pinned");
          link.setAttribute("href", "#table");
          settle(make("span", "cp-outcome", link), "Downloaded and pinned.");
        },
        () => {
          fails = false;
          const retry = make(
            "button",
            "cp-button",
            glyph("refresh-cw"),
            glyph("spinner-arc", "busy"),
            make("span", "cp-roll", "Retry"),
          ) as HTMLButtonElement;
          retry.type = "button";
          retry.dataset["size"] = "sm";
          download(retry);
          const error = make(
            "span",
            "cp-field-error",
            glyph("circle-x"),
            "The provider timed out.",
          );
          settle(
            make("span", "cp-outcome", error, retry),
            "Download failed: the provider timed out.",
            "assertive",
          );
        },
      );
    });
  };
  download(button);
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

for (const details of all<HTMLDetailsElement>(".cp-history details")) {
  enhanceDisclosure(details);
}

const weeksAgo = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const event = (
  tone: string,
  icon: string,
  word: string,
  rest: string,
  weeks: number,
): HTMLElement => {
  const mark = make("span", "", glyph(icon));
  mark.dataset["part"] = "mark";
  mark.dataset["tone"] = tone;
  const time = make("time", "", weeksAgo.format(-weeks, "week")) as HTMLTimeElement;
  time.dateTime = new Date(Date.now() - weeks * 604_800_000).toISOString();
  return make("li", "", mark, make("span", "", make("strong", "", word), rest), time);
};

// Load older names its history by data-load-older. Each press adds a week
// and moves focus to its heading; the second says the history has ended.
for (const button of all<HTMLButtonElement>("button[data-load-older]")) {
  const history = document.getElementById(button.dataset["loadOlder"] ?? "");
  if (history === null) {
    continue;
  }
  let weeks = 1;
  button.addEventListener("click", () => {
    weeks += 1;
    const when = weeksAgo.format(-weeks, "week");
    const day = make("h3", "", when.charAt(0).toUpperCase() + when.slice(1));
    day.tabIndex = -1;
    history.append(
      day,
      make(
        "ol",
        "",
        event("neutral", "search", "Checked", " against SeaDex", weeks),
        event("success", "download", "Grabbed", " a web release", weeks),
      ),
    );
    day.focus();
    announce("2 older events loaded");
    if (weeks === 3) {
      button.replaceWith(make("p", "g-note", "That is the whole history."));
    }
  });
}

// A state history from one letter per check: s answered, w slow, d failed,
// n not checked.
const CHECKS = {
  s: { tone: "success", word: "Answered" },
  w: { tone: "warning", word: "Slow" },
  d: { tone: "danger", word: "Failed" },
  n: { tone: "neutral", word: "Not checked" },
} as const;
const isCheck = (c: string): c is keyof typeof CHECKS => Object.hasOwn(CHECKS, c);
for (const host of all<HTMLElement>("[data-state-history]")) {
  const points = [...(host.dataset["stateHistory"] ?? "")]
    .filter(isCheck)
    .map((state) => ({ state }));
  host.replaceWith(
    createStateHistory(points, { name: host.dataset["name"] ?? "", states: CHECKS }),
  );
}
