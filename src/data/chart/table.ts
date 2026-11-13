/**
 * table.ts — a chart's table view: the same data as the plot, one row per
 * bucket, sample, change point, dot row or category, kept in place across
 * updates.
 * @module
 */

import { formatter } from "../scale/format.js";

import type { BarModel, Model, RectModel, SampleModel } from "./model.js";
import { barsApart, barTotal, bucketTotal, sampleTotal } from "./model.js";
import { barPart, bucketText, partText, primaryOf, samplePart, totalled } from "./readout.js";
import { noteSentences, ruleSentences } from "./summary.js";
import type { Words } from "./words.js";

/** Text, or an instant written in a `<time datetime>`. */
type Part = string | { readonly at: number; readonly text: string };

interface Cell {
  readonly parts: readonly Part[];
  readonly num: boolean;
}

interface Row {
  /** The row's x, its dot row's name and place among rows of that name, or
   *  its category's name. */
  readonly key: string;
  readonly head: readonly Part[];
  readonly cells: readonly Cell[];
}

export interface TableModel {
  readonly corner: string;
  readonly columns: readonly { readonly text: string; readonly num: boolean }[];
  readonly rows: readonly Row[];
  /** The rules' and notes' sentences after the table. */
  readonly after: string;
}

// Private-use characters stand in for instants while the words place them.
const MARK = 0xe000;
const MARKS = /([\uE000-\uF8FF])/u;

/** `write`'s text with each instant it writes kept as a part of its own. */
function timed(model: Model, write: (m: Model) => string): Part[] {
  if (model.x.type !== "time") {
    return [write(model)];
  }
  const at: { at: number; text: string }[] = [];
  const mark = (v: number, text: string): string => {
    at.push({ at: v, text });
    return String.fromCodePoint(MARK + at.length - 1);
  };
  const marked: Model = {
    ...model,
    xText: (v) => mark(v, model.xText(v)),
    xSpan: (from, to) => {
      const [a, b] = model.xSpan(from, to);
      return [mark(from, a), mark(to, b)];
    },
  };
  return write(marked)
    .split(MARKS)
    .filter((s) => s !== "")
    .map((s) => (s.length === 1 ? (at[(s.codePointAt(0) ?? 0) - MARK] ?? s) : s));
}

const isStop = (m: SampleModel, i: number): boolean =>
  i === m.from || i === m.to - 1 || m.series.some((s) => s.y[i] !== s.y[i - 1]);

/** The samples a step line's table lists and its keys stop at: the first
 *  and last inside the domain, and each where any series changes value or
 *  turns to or from a gap. */
export function stepStops(m: SampleModel): number[] {
  const out: number[] = [];
  for (let i = m.from; i < m.to; i++) {
    if (isStop(m, i)) {
      out.push(i);
    }
  }
  return out;
}

/** The stop holding sample `i` of a step line inside its domain: the last of
 *  `stepStops` at or before it. */
export function stepStopAt(m: SampleModel, i: number): number {
  let k = i;
  while (k > m.from && !isStop(m, k)) {
    k--;
  }
  return k;
}

function rectRows(model: Model, m: RectModel, words: Words): Row[] {
  const total = totalled(m);
  return m.shown.map((i) => {
    const cells: Cell[] = m.series.map((s) => ({
      parts: [partText(model, m, s, i, words)],
      num: true,
    }));
    if (total) {
      cells.push({ parts: [model.amountText(bucketTotal(m, i))], num: true });
    }
    return {
      key: String(m.x1[i]),
      head: timed(model, (t) => bucketText(t, m, i, words)),
      cells,
    };
  });
}

function lineRows(model: Model, m: SampleModel, words: Words): Row[] {
  const indices = m.step
    ? stepStops(m)
    : Array.from({ length: m.to - m.from }, (_, k) => m.from + k);
  return indices.map((i) => {
    const cells: Cell[] = m.series.map((s) => ({
      parts: [samplePart(model, m, s, i, words)],
      num: true,
    }));
    if (m.kind === "area" && m.series.length > 1) {
      const total = sampleTotal(m, i);
      cells.push({
        parts: [total === null ? words.noData : model.amountText(total)],
        num: true,
      });
    }
    return { key: String(m.x[i]), head: timed(model, (t) => t.xText(m.x[i] ?? 0)), cells };
  });
}

// A row per category, a column per series, and from two stacked series up
// a Total, under "share" the absolute total the shares hide; none for bars
// standing apart.
function barTable(model: Model, m: BarModel, words: Words, after: string): TableModel {
  const names = model.y.type === "band" ? model.y.rows : [];
  const withTotal = m.series.length > 1 && !barsApart(m);
  const rows = names.map((name, i): Row => {
    const cells: Cell[] = m.series.map((s) => ({
      parts: [barPart(model, m, s, i, words)],
      num: true,
    }));
    if (withTotal) {
      const total = barTotal(m, i);
      cells.push({
        parts: [total === null ? words.noData : model.amountText(total)],
        num: true,
      });
    }
    return { key: name, head: [name], cells };
  });
  const columns = m.series.map((s) => ({ text: s.name, num: true }));
  if (withTotal) {
    columns.push({ text: words.total, num: true });
  }
  return { corner: model.spec.y?.label ?? "", columns, rows, after };
}

/** What the table view shows for `model`. */
export function tableModel(model: Model, words: Words): TableModel {
  const m = primaryOf(model);
  const after = [...ruleSentences(model, words), ...noteSentences(model, words)].join(" ");
  if (m === undefined) {
    return { corner: "", columns: [], rows: [], after };
  }
  if (m.kind === "dot") {
    const count = formatter("number", model.locale);
    const seen = new Map<string, number>();
    const rows = m.rows.map((r): Row => {
      const n = seen.get(r.name) ?? 0;
      seen.set(r.name, n + 1);
      const silent = r.to === r.from;
      const at = (i: number): Cell => ({
        parts: silent ? [words.none] : timed(model, (t) => t.xText(r.x[i] ?? 0)),
        num: false,
      });
      return {
        key: `${r.name}\u0000${String(n)}`,
        head: [r.name],
        cells: [{ parts: [count(r.to - r.from)], num: true }, at(r.from), at(r.to - 1)],
      };
    });
    return {
      corner: model.spec.y?.label ?? "",
      columns: [
        { text: words.count, num: true },
        { text: words.first, num: false },
        { text: words.last, num: false },
      ],
      rows,
      after,
    };
  }
  if (m.kind === "bar") {
    return barTable(model, m, words, after);
  }
  const columns = m.series.map((s) => ({ text: s.name, num: true }));
  if (m.kind === "rect" ? totalled(m) : m.kind === "area" && m.series.length > 1) {
    columns.push({ text: words.total, num: true });
  }
  return {
    corner: model.spec.x.label ?? "",
    columns,
    rows: m.kind === "rect" ? rectRows(model, m, words) : lineRows(model, m, words),
    after,
  };
}

function write(el: HTMLElement, parts: readonly Part[], isolate: boolean): void {
  const nodes = parts.map((p) => {
    if (typeof p === "string") {
      if (!isolate) {
        return p;
      }
      const bdi = document.createElement("bdi");
      bdi.textContent = p;
      return bdi;
    }
    const time = document.createElement("time");
    time.dateTime = new Date(p.at).toISOString();
    time.textContent = p.text;
    return time;
  });
  el.replaceChildren(...nodes);
}

function headCell(text: string, num: boolean): HTMLElement {
  const th = document.createElement("th");
  th.scope = "col";
  if (num) {
    th.dataset["col"] = "num";
  }
  write(th, [text], true);
  return th;
}

function bodyRow(row: Row, isolate: boolean): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset["key"] = row.key;
  const th = document.createElement("th");
  th.scope = "row";
  write(th, row.head, isolate);
  tr.append(th);
  for (const c of row.cells) {
    const td = document.createElement("td");
    if (c.num) {
      td.dataset["col"] = "num";
    }
    write(td, c.parts, false);
    tr.append(td);
  }
  return tr;
}

// An empty corner is a plain cell, since a header must name something.
function cornerCell(text: string): HTMLTableCellElement {
  if (text === "") {
    return document.createElement("td");
  }
  const th = document.createElement("th");
  th.scope = "col";
  th.textContent = text;
  return th;
}

const headSignature = (t: TableModel): string =>
  JSON.stringify([t.corner, t.columns.map((c) => c.text)]);

// Rewrites `el`'s children only when they differ, so the cell itself, and
// a reader's place on it, stays.
function rewrite(el: Element, fresh: Element): void {
  if (el.innerHTML !== fresh.innerHTML) {
    el.replaceChildren(...fresh.childNodes);
  }
}

/**
 * Shows `t` in `panel`, the chart's `.cp-panel`, its caption `title`. A
 * table with the same columns keeps its rows: changed cells are rewritten
 * in place, new rows inserted and rows that left removed.
 */
export function syncTable(panel: HTMLElement, t: TableModel, title: string, dot: boolean): void {
  let table = panel.querySelector("table");
  if (table?.dataset["head"] !== headSignature(t)) {
    table = document.createElement("table");
    table.className = "cp-table";
    table.dataset["head"] = headSignature(t);
    const caption = table.createCaption();
    caption.textContent = title;
    const head = table.createTHead().insertRow();
    head.append(cornerCell(t.corner), ...t.columns.map((c) => headCell(c.text, c.num)));
    // One append per row, since a long line's rows overflow an argument list.
    const body = table.createTBody();
    for (const r of t.rows) {
      body.append(bodyRow(r, dot));
    }
    panel.querySelector("table")?.remove();
    panel.prepend(table);
  } else {
    const caption = table.caption;
    if (caption !== null && caption.textContent !== title) {
      caption.textContent = title;
    }
    const body = table.tBodies[0] ?? table.createTBody();
    // Rows that left go first, so no kept row is moved, which would blur it.
    const keys = new Set(t.rows.map((r) => r.key));
    const old = new Map<string, HTMLTableRowElement>();
    for (const tr of [...body.rows]) {
      const key = tr.dataset["key"] ?? "";
      if (keys.has(key)) {
        old.set(key, tr);
      } else {
        tr.remove();
      }
    }
    let after: HTMLTableRowElement | null = null;
    for (const row of t.rows) {
      const fresh = bodyRow(row, dot);
      let tr = old.get(row.key);
      if (tr === undefined) {
        tr = fresh;
      } else {
        [...tr.cells].forEach((cell, k) => {
          const now = fresh.cells[k];
          if (now !== undefined) {
            rewrite(cell, now);
          }
        });
      }
      const placed: boolean =
        after === null ? body.firstElementChild === tr : after.nextElementSibling === tr;
      if (!placed) {
        if (after === null) {
          body.prepend(tr);
        } else {
          after.after(tr);
        }
      }
      after = tr;
    }
  }
  let after = panel.querySelector<HTMLElement>('[data-part="after"]');
  if (t.after === "") {
    after?.remove();
  } else {
    if (after === null) {
      after = document.createElement("p");
      after.dataset["part"] = "after";
      panel.append(after);
    }
    if (after.textContent !== t.after) {
      after.textContent = t.after;
    }
  }
}
