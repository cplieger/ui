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

/**
 * A row standing for one of `table`'s rows while they load, in their
 * shape, so the table keeps its height when they come: each cell holds a
 * title cell's cover and lines, two lines, or one bar, and its head cell's
 * `data-col` and `data-priority` (a loaded row's, with no head). A loaded
 * body row gives the shapes; with none, `data-row` on the table names
 * them: `media` for a cover in the first column without a `data-col`, or a
 * length every cell is tall. Clone it once per row.
 */
export function skeletonRow(table: HTMLTableElement): HTMLTableRowElement {
  const loaded = [...table.tBodies]
    .flatMap((body) => [...body.rows])
    .find((r) => r.matches(":not([data-skeleton], [data-part])"));
  const heads = [...(table.tHead?.rows[0]?.cells ?? loaded?.cells ?? [])];
  const declared = table.dataset["row"];
  const lead = heads.findIndex((th) => th.dataset["col"] === undefined);
  const row = document.createElement("tr");
  heads.forEach((head, i) => {
    const shape =
      loaded === undefined
        ? declared === "media" && i === lead
          ? "cover"
          : "bar"
        : shapeOf(loaded.cells[i]);
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
