/**
 * skeleton-row.ts — `skeletonRow()`, the row standing for a `.cp-table`
 * row that loads, which the table and a keyed table body both draw.
 * @module
 */

import { bone } from "../../feedback/skeleton/bone.js";

type Shape = "cover" | "title" | "stack" | "bar";

function shapeOf(cell: Element | undefined): Shape {
  const title = cell?.querySelector(":scope > .cp-title-cell");
  if (title != null) {
    return title.querySelector(":scope > .cp-cover") === null ? "title" : "cover";
  }
  return cell?.querySelector(":scope > .cp-cell-stack") == null ? "bar" : "stack";
}

function boneCell(row: HTMLTableRowElement, head: HTMLTableCellElement, shape: Shape): void {
  const cell = row.insertCell();
  cell.colSpan = head.colSpan;
  for (const name of ["col", "priority"]) {
    const value = head.dataset[name];
    if (value !== undefined) {
      cell.dataset[name] = value;
    }
  }
  if (shape === "bar") {
    cell.append(bone());
    return;
  }
  const stack = document.createElement("div");
  stack.className = "cp-cell-stack";
  if (shape === "stack") {
    stack.append(bone(), bone("last"));
    cell.append(stack);
    return;
  }
  // The title's lines sit in one box, as the title's own text does, so the
  // title cell's line budget clips the second bar where it allows one line.
  const lines = document.createElement("span");
  lines.append(bone(), bone("last"));
  stack.append(lines, bone());
  const title = document.createElement("div");
  title.className = "cp-title-cell";
  if (shape === "cover") {
    title.append(bone());
  }
  title.append(stack);
  cell.append(title);
}

/** The cell of `row` that covers column `column`, counting spans. */
function cellAt(row: HTMLTableRowElement, column: number): HTMLTableCellElement | undefined {
  let end = 0;
  for (const cell of row.cells) {
    end += cell.colSpan;
    if (column < end) {
      return cell;
    }
  }
  return undefined;
}

/** Per body column, the head cell over it in the last head row, a cell
 *  spanning columns taken once. A tr's `cells` lacks a cell spanning
 *  down from a row above, so the head is laid out as a grid. */
function headCells(head: HTMLTableSectionElement): HTMLTableCellElement[] {
  const rows = [...head.rows];
  const grid: (HTMLTableCellElement | undefined)[][] = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.cells) {
      while (grid[r]?.[c] !== undefined) {
        c += 1;
      }
      const down = cell.rowSpan === 0 ? rows.length - r : Math.min(cell.rowSpan, rows.length - r);
      for (const line of grid.slice(r, r + down)) {
        for (let k = c; k < c + cell.colSpan; k += 1) {
          line[k] = cell;
        }
      }
      c += cell.colSpan;
    }
  });
  const last = grid.at(-1) ?? [];
  return last.filter(
    (cell, i): cell is HTMLTableCellElement => cell !== undefined && cell !== last[i - 1],
  );
}

/**
 * A row in the shape of `table`'s loaded rows, so it keeps their height:
 * per head column, a cover and lines, two lines or a bar, with the head's
 * `data-col` and `data-priority`. `from`, else the first loaded body row,
 * gives the shapes; with neither, the table's `data-row` does (`media`, or
 * a length). Clone it once per row.
 */
export function skeletonRow(
  table: HTMLTableElement,
  from?: HTMLTableRowElement,
): HTMLTableRowElement {
  const loaded =
    from ??
    [...table.tBodies]
      .flatMap((body) => [...body.rows])
      .find((r) => r.matches(":not([data-skeleton], [data-part])"));
  const heads =
    table.tHead !== null && table.tHead.rows.length > 0
      ? headCells(table.tHead)
      : [...(loaded?.cells ?? [])];
  const declared = table.dataset["row"];
  const lead = heads.findIndex((th) => th.dataset["col"] === undefined);
  const row = document.createElement("tr");
  let column = 0;
  heads.forEach((head, i) => {
    const shape =
      loaded === undefined
        ? declared === "media" && i === lead
          ? "cover"
          : "bar"
        : shapeOf(cellAt(loaded, column));
    column += head.colSpan;
    boneCell(row, head, shape);
  });
  if (row.cells.length === 0) {
    row.insertCell().append(bone());
  }
  if (loaded === undefined && declared !== undefined && declared !== "media") {
    for (const cell of row.cells) {
      cell.style.blockSize = declared;
    }
  }
  row.dataset["skeleton"] = "";
  row.setAttribute("aria-hidden", "true");
  return row;
}
