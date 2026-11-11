/**
 * ranked-bars.ts — `enhanceRankedBars()` draws a bar beside each number in a
 * table's `[data-bar]` cells, sized against the largest in its column.
 * @module
 */

import { whenAborted } from "../../core/lifetime/lifetime.js";

export interface RankedBarsOptions {
  /** Removes the bars and stops following the table. */
  readonly signal?: AbortSignal;
}

interface Cell {
  readonly cell: HTMLTableCellElement;
  readonly group: string;
  readonly value: number;
}

function cells(table: HTMLTableElement): Cell[] {
  const out: Cell[] = [];
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      for (const cell of row.cells) {
        const count = cell.querySelector(":scope > data[value]");
        if (!cell.hasAttribute("data-bar") || !(count instanceof HTMLDataElement)) {
          continue;
        }
        const value = count.value.trim() === "" ? Number.NaN : Number(count.value);
        const name = cell.dataset["bar"] ?? "";
        out.push({ cell, group: name === "" ? `#${String(cell.cellIndex)}` : name, value });
      }
    }
  }
  return out;
}

/**
 * Each body cell marked `data-bar` holds its count as a `<data value>`. Its
 * bar is sized against the largest value among the cells of its column, or
 * among every cell sharing its `data-bar` name, such as sent and read posts.
 * A value of 0 or less, or one that is not a number, draws an empty track,
 * so the column still lines up. The bars are not read: the numbers are. They
 * follow every later change to the table.
 */
export function enhanceRankedBars(table: HTMLTableElement, options: RankedBarsOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }

  const draw = (): void => {
    const all = cells(table);
    const largest = new Map<string, number>();
    for (const { group, value } of all) {
      if (value > (largest.get(group) ?? 0)) {
        largest.set(group, value);
      }
    }
    for (const { cell, group, value } of all) {
      let bar = cell.querySelector<HTMLElement>(':scope > [data-part="bar"]');
      if (bar === null) {
        bar = document.createElement("span");
        bar.dataset["part"] = "bar";
        bar.setAttribute("aria-hidden", "true");
        cell.append(bar);
      }
      const max = largest.get(group) ?? 0;
      if (!(value > 0 && max > 0)) {
        bar.replaceChildren();
        continue;
      }
      const fill = bar.firstElementChild ?? bar.appendChild(document.createElement("span"));
      (fill as HTMLElement).style.inlineSize = `${String((value / max) * 100)}%`;
    }
  };

  draw();
  // The bars' own insertion wakes the observer once; it finds them in place,
  // and widths written through style are not watched, so it settles.
  const watch = new MutationObserver(draw);
  watch.observe(table, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["value", "data-bar"],
  });
  whenAborted(signal, () => {
    watch.disconnect();
    for (const bar of table.querySelectorAll('[data-bar] > [data-part="bar"]')) {
      bar.remove();
    }
  });
}
