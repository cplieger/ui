/**
 * table.ts — the parts of a `.cp-table` that need a script. `enhanceSort()`
 * runs its sortable headers, `enhanceBatchBar()` the `.cp-batchbar` over its
 * selection, and `enhanceRowDetail()` the detail row under a row that
 * explains itself.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { reducedMotion, until } from "../../core/lifetime/lifetime.js";
import { glideShow } from "../../navigation/disclosure/disclosure.js";

/** A column's order, as `aria-sort` writes it. */
export type SortOrder = "ascending" | "descending";

/** The words the sort buttons carry and say, each given the column's name. */
export interface SortWords {
  /** A sort button's name, the order its press applies. Default "Sort by
   *  {column}, {order}". */
  readonly sort?: (column: string, order: SortOrder) => string;
  /** Said after a sort. Default "Sorted by {column}, {order}". */
  readonly sorted?: (column: string, order: SortOrder) => string;
}

export interface SortOptions {
  /** After a press has moved `aria-sort`. Given this, the app orders the
   *  rows itself, such as by writing the sort into the URL; without it the
   *  rows are reordered in the page. */
  readonly onSort?: (header: HTMLTableCellElement, order: SortOrder) => void;
  readonly words?: SortWords;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";
const collator = new Intl.Collator(undefined, { numeric: true });

const nameOf = (button: HTMLElement): string => button.textContent.trim();

const keyOf = (row: HTMLTableRowElement, column: number): string => {
  const cell = row.cells[column];
  return cell?.dataset["sort"] ?? cell?.textContent.trim() ?? "";
};

const numeric = (text: string): boolean => text.trim() !== "" && Number.isFinite(Number(text));

function compare(a: string, b: string): number {
  return numeric(a) && numeric(b) ? Number(a) - Number(b) : collator.compare(a, b);
}

interface Group {
  readonly key: string;
  readonly rows: HTMLTableRowElement[];
}

/** A body's rows in groups, each row with the detail rows that follow it,
 *  keyed by the row's cell in `column`. */
function groupsOf(body: HTMLTableSectionElement, column: number): Group[] {
  const groups: Group[] = [];
  for (const row of body.rows) {
    const last = groups.at(-1);
    if (row.dataset["part"] === "detail" && last !== undefined) {
      last.rows.push(row);
    } else {
      groups.push({ key: keyOf(row, column), rows: [row] });
    }
  }
  return groups;
}

function glide(
  rows: readonly HTMLTableRowElement[],
  before: Map<HTMLTableRowElement, number>,
): void {
  if (reducedMotion()) {
    return;
  }
  for (const row of rows) {
    const dy = (before.get(row) ?? 0) - row.getBoundingClientRect().top;
    if (dy !== 0) {
      row.animate([{ translate: `0 ${String(dy)}px` }, { translate: "0 0" }], {
        duration: 260,
        easing: EASE_OUT,
      });
    }
  }
}

/**
 * `table`'s sortable headers are `<th>`s holding a `<button class="cp-sort">`
 * with the column's name, the sorted one marked by `aria-sort`. A press on an
 * unsorted column sorts it ascending, and on the sorted one turns its order.
 * Rows sort by each cell's `data-sort`, or its text, numbers as numbers; a
 * `data-part="detail"` row keeps its place after the row before it.
 */
export function enhanceSort(table: HTMLTableElement, options: SortOptions = {}): void {
  const { onSort, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const sortWords = options.words?.sort ?? ((c, o) => `Sort by ${c}, ${o}`);
  const sortedWords = options.words?.sorted ?? ((c, o) => `Sorted by ${c}, ${o}`);
  const buttons = (): HTMLButtonElement[] => [
    ...table.querySelectorAll<HTMLButtonElement>("th > .cp-sort"),
  ];
  const name = (): void => {
    for (const b of buttons()) {
      const now = b.parentElement?.getAttribute("aria-sort");
      b.setAttribute(
        "aria-label",
        sortWords(nameOf(b), now === "ascending" ? "descending" : "ascending"),
      );
    }
  };

  const reorder = (column: number, order: SortOrder): void => {
    const sign = order === "ascending" ? 1 : -1;
    for (const body of table.tBodies) {
      const groups = groupsOf(body, column);
      const rows = groups.flatMap((g) => g.rows);
      const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
      groups.sort((a, b) => sign * compare(a.key, b.key));
      body.append(...groups.flatMap((g) => g.rows));
      glide(rows, before);
    }
  };

  table.addEventListener(
    "click",
    (e) => {
      const button = e.target instanceof Element ? e.target.closest(".cp-sort") : null;
      const header = button?.parentElement;
      if (
        !(header instanceof HTMLTableCellElement) ||
        header.tagName !== "TH" ||
        !table.contains(header)
      ) {
        return;
      }
      const order: SortOrder =
        header.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
      for (const th of table.querySelectorAll("th[aria-sort]")) {
        th.removeAttribute("aria-sort");
      }
      header.setAttribute("aria-sort", order);
      if (onSort === undefined) {
        reorder(header.cellIndex, order);
      } else {
        onSort(header, order);
      }
      name();
      announce(sortedWords(nameOf(button as HTMLElement), order));
    },
    until(signal),
  );
  name();
}

export interface RowDetailOptions {
  /** Removes the listener and ends a glide at its end state. */
  readonly signal?: AbortSignal;
}

const OPENER = '[data-col="expand"] button[aria-controls]';
const detailGlides = new WeakMap<HTMLElement, Animation>();

function detailOf(table: HTMLTableElement, button: Element): HTMLTableRowElement | undefined {
  const id = button.getAttribute("aria-controls");
  return [...table.rows].find((r) => r.id === id && r.dataset["part"] === "detail");
}

const boxOf = (row: HTMLTableRowElement): HTMLElement | null => {
  const box = row.cells[0]?.firstElementChild;
  return box instanceof HTMLElement ? box : null;
};

/** Glides `row`'s box from the height it shows to open or shut, scaling its
 *  padding with its height so no padded band shows at the ends. */
function glideDetail(row: HTMLTableRowElement, open: boolean): void {
  const box = boxOf(row);
  const from = row.hidden ? 0 : (box?.getBoundingClientRect().height ?? 0);
  row.hidden = false;
  if (box === null) {
    row.hidden = !open;
    return;
  }
  detailGlides.get(box)?.cancel();
  const full = box.getBoundingClientRect().height;
  const style = getComputedStyle(box);
  const start = Number.parseFloat(style.paddingBlockStart);
  const end = Number.parseFloat(style.paddingBlockEnd);
  const at = (f: number): Keyframe => ({
    blockSize: `${String(full * f)}px`,
    paddingBlockStart: `${String(start * f)}px`,
    paddingBlockEnd: `${String(end * f)}px`,
    overflow: "clip",
  });
  const run = box.animate([at(full > 0 ? Math.min(from / full, 1) : 0), at(open ? 1 : 0)], {
    duration: reducedMotion() ? 0 : 240,
    easing: EASE_OUT,
    fill: "forwards",
  });
  detailGlides.set(box, run);
  void run.finished.then(
    () => {
      row.hidden = !open;
      run.cancel();
      detailGlides.delete(box);
    },
    () => undefined,
  );
}

/**
 * Each row of `table` that explains itself has, in its `data-col="expand"`
 * cell, a button whose `aria-controls` names the `<tr data-part="detail">`
 * after it, which holds one cell across the table with one child. A press
 * turns `aria-expanded` and glides that child open or shut, hiding the row
 * once shut. The rows start as their buttons' `aria-expanded` says.
 */
export function enhanceRowDetail(table: HTMLTableElement, options: RowDetailOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  for (const button of table.querySelectorAll(OPENER)) {
    const row = detailOf(table, button);
    if (row !== undefined) {
      row.hidden = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(!row.hidden));
    }
  }
  table.addEventListener(
    "click",
    (e) => {
      const button = e.target instanceof Element ? e.target.closest(OPENER) : null;
      const row = button === null || !table.contains(button) ? undefined : detailOf(table, button);
      if (button === null || row === undefined) {
        return;
      }
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      glideDetail(row, open);
    },
    until(signal),
  );
  signal?.addEventListener(
    "abort",
    () => {
      for (const row of table.rows) {
        const box = boxOf(row);
        if (box !== null) {
          detailGlides.get(box)?.finish();
        }
      }
    },
    { once: true },
  );
}

/** What the batch bar counts. */
export interface BatchSelection {
  /** The rows selected, or every matching row once `everything` is on. */
  readonly count: number;
  /** Whether "Select all" took every row the filters show on every page. */
  readonly everything: boolean;
}

/** The words the bar writes and says. */
export interface BatchBarWords {
  /** The count. Default "{n} selected". */
  readonly count?: (n: number) => string;
  /** Said once nothing is selected. Default "Selection cleared". */
  readonly cleared?: () => string;
  /** The offer of every matching row. Default "Select all {total} entries". */
  readonly every?: (total: number) => string;
  /** The header box's name. Default "Select all {n} entries on this page". */
  readonly page?: (n: number) => string;
  /** A bulk action's words. Default "{word} {n}". */
  readonly action?: (word: string, n: number) => string;
}

export interface BatchBarOptions {
  /** The rows' checkboxes, read at each change, so rows added since count. */
  readonly boxes: () => Iterable<HTMLInputElement>;
  /** The header's select-all box, which focus returns to on a clear. Its
   *  table takes Escape as the bar does. */
  readonly all?: HTMLInputElement;
  /** How many rows the filters show on every page. Default: the boxes. */
  readonly total?: () => number;
  /** After each change to the selection. */
  readonly onChange?: (selection: BatchSelection) => void;
  readonly words?: BatchBarWords;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

export interface BatchBar extends BatchSelection {
  /** Shows the boxes' state, for code that checks, clears, adds or removes
   *  boxes itself, or after a bulk action's confirm is back at rest. */
  sync(): void;
  /** Clears every box and "Select all". */
  clear(): void;
}

const AUTO_OPEN = '[popover]:popover-open:not([popover="manual" i], [popover="hint" i])';

function tell(box: HTMLInputElement): void {
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Writes `text` as `button`'s words: into its `.cp-roll`, or in place of
 *  its own text beside its icons. */
function label(button: HTMLElement, text: string): void {
  const words = button.querySelector<HTMLElement>(".cp-roll");
  if (words !== null) {
    words.replaceChildren(text);
    words.style.removeProperty("inline-size");
    return;
  }
  for (const node of [...button.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.remove();
    }
  }
  button.append(text);
}

/**
 * `bar` is a `.cp-batchbar` holding a `.cp-batch-count`, a
 * `data-batch-clear` button, an optional `data-batch-every` button, and bulk
 * actions marked `data-batch-action` with their word, such as "Grab", which
 * then reads "Grab 3". An action whose `@cplieger/ui/confirm` cycle runs
 * keeps its words until `sync()`. Escape clears while focus is in the bar or
 * the table and no menu or dialog is open.
 */
export function enhanceBatchBar(bar: HTMLElement, options: BatchBarOptions): BatchBar {
  const { boxes, all, onChange, signal } = options;
  const count = bar.querySelector<HTMLElement>(".cp-batch-count");
  const clearButton = bar.querySelector<HTMLButtonElement>("[data-batch-clear]");
  const every = bar.querySelector<HTMLButtonElement>("[data-batch-every]");
  const words = {
    count: options.words?.count ?? ((n: number) => `${String(n)} selected`),
    cleared: options.words?.cleared ?? (() => "Selection cleared"),
    every: options.words?.every ?? ((n: number) => `Select all ${String(n)} entries`),
    page: options.words?.page ?? ((n: number) => `Select all ${String(n)} entries on this page`),
    action: options.words?.action ?? ((w: string, n: number) => `${w} ${String(n)}`),
  };
  let everything = false;
  let wasEverything = false;
  let selected = 0;
  let said: string | undefined;
  let saying = false;

  const say = (): void => {
    if (saying) {
      return;
    }
    saying = true;
    // A select-all press changes each box in turn; one word for all of them.
    queueMicrotask(() => {
      saying = false;
      const text = selected > 0 ? words.count(selected) : words.cleared();
      if (text !== said) {
        said = text;
        announce(text);
      }
    });
  };

  const show = (glides: boolean): void => {
    const group = [...boxes()];
    const on = group.filter((b) => b.checked).length;
    const total = options.total?.() ?? group.length;
    if (on < group.length) {
      everything = false;
    }
    const n = everything ? total : on;
    const changed = n !== selected || everything !== wasEverything;
    selected = n;
    wasEverything = everything;
    if (count !== null) {
      count.textContent = words.count(n);
    }
    all?.setAttribute("aria-label", words.page(group.length));
    if (every !== null) {
      every.hidden = everything || on < group.length || total <= group.length;
      label(every, words.every(total));
    }
    for (const b of bar.querySelectorAll<HTMLElement>("[data-batch-action]")) {
      if (!b.hasAttribute("data-cp-state")) {
        label(b, words.action(b.dataset["batchAction"] ?? "", n));
      }
    }
    if (glides) {
      glideShow(bar, n > 0);
    } else {
      bar.hidden = n === 0;
    }
    if (changed && glides) {
      say();
      onChange?.({ count: n, everything });
    }
  };

  const focusBack = (): void => {
    (all ?? [...boxes()][0])?.focus();
  };

  const clear = (): void => {
    everything = false;
    for (const b of boxes()) {
      if (b.checked && !b.disabled) {
        b.checked = false;
        tell(b);
      }
    }
    show(true);
  };

  const controller: BatchBar = {
    get count() {
      return selected;
    },
    get everything() {
      return everything;
    },
    sync: () => {
      show(true);
    },
    clear,
  };
  show(false);
  said = selected > 0 ? words.count(selected) : words.cleared();
  if (signal?.aborted === true) {
    return controller;
  }

  const listen = until(signal);
  bar.ownerDocument.addEventListener(
    "change",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && [...boxes()].includes(t)) {
        show(true);
      }
    },
    listen,
  );
  every?.addEventListener(
    "click",
    () => {
      everything = true;
      show(true);
      clearButton?.focus();
    },
    listen,
  );
  clearButton?.addEventListener(
    "click",
    () => {
      clear();
      focusBack();
    },
    listen,
  );
  const escape = (e: KeyboardEvent): void => {
    // An open automatic popover takes this Escape to close itself, and a
    // manual menu's own handler has prevented it.
    const open = bar.ownerDocument.querySelector(AUTO_OPEN);
    if (e.key !== "Escape" || e.defaultPrevented || selected === 0 || open !== null) {
      return;
    }
    e.preventDefault();
    clear();
    focusBack();
  };
  for (const zone of [bar, all?.closest("table")]) {
    zone?.addEventListener("keydown", escape, listen);
  }
  return controller;
}
