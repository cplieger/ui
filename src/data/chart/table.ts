/**
 * table.ts — a chart's table view: the same data as the plot, one row per
 * bucket, sample, change point, dot row, category, box, slope series,
 * scatter dot, cell row, calendar week, slice or tree's part, a tree's
 * groups each in a `<tbody>` of their own, kept in place across updates.
 * @module
 */

import { writer } from "../scale/format.js";
import { dateAt } from "../scale/time.js";

import { dayFormat, weekCount, weekRow } from "./calendar.js";
import type {
  BarModel,
  BoxModel,
  CalendarModel,
  CellModel,
  Model,
  PieModel,
  TreeModel,
  PointModel,
  RectModel,
  SampleModel,
  ScatterModel,
  SlopeModel,
} from "./model.js";
import {
  barsApart,
  barTotal,
  bucketTotal,
  cellCount,
  pointLink,
  sampleTotal,
  slopeChange,
  stepStops,
} from "./model.js";
import {
  barPart,
  bucketText,
  cellAxisText,
  changeText,
  dotValue,
  linkText,
  measuresOf,
  partText,
  samplePart,
  sliceShare,
  totalWord,
  totalled,
  treeShare,
} from "./readout.js";
import { noteSentences, ruleSentences } from "./summary.js";
import type { Words } from "./words.js";

/** Text, or an instant written in a `<time datetime>`, as a calendar date
 *  (the UTC day of `at`) when `date` is set. HTML's date strings take a
 *  year above 0 with no sign, so an instant before year 1 is its text alone
 *  (https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#dates). */
type Part = string | { readonly at: number; readonly text: string; readonly date?: boolean };

interface Cell {
  readonly parts: readonly Part[];
  readonly num: boolean;
}

interface Row {
  /** The row's x, its dot row's name and place among rows of that name, or
   *  its category's name; unique within its `<tbody>`. */
  readonly key: string;
  readonly head: readonly Part[];
  /** A group's head row's header names its `<tbody>`; any other row's its row. */
  readonly scope?: "rowgroup";
  readonly cells: readonly Cell[];
}

/** A run of a table's rows in a `<tbody>` of its own, after its head row. */
interface Group {
  /** The group's name, unique among the table's groups. */
  readonly key: string;
  readonly head: Row;
  /** How many of the table's rows, in order from the last group's, it holds. */
  readonly count: number;
}

export interface TableModel {
  readonly corner: string;
  readonly columns: readonly { readonly text: string; readonly num: boolean }[];
  readonly rows: readonly Row[];
  /** A tree's groups, which split `rows` into a `<tbody>` each; one
   *  `<tbody>` for every row without them. */
  readonly groups?: readonly Group[];
  /** A pie's or a tree's Total row, in the table's `<tfoot>`. */
  readonly foot?: Row;
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

// A row per category and a column per series, each value as the readings
// write it, an instant in its `<time>`, then a link's Gap or Change.
function pointTable(model: Model, m: PointModel, words: Words, after: string): TableModel {
  const names = model.y.type === "band" ? model.y.rows : [];
  // Instants are words, not figures to align.
  const num = model.x.type !== "time";
  const rows = names.map((name, i): Row => {
    const cells: Cell[] = m.series.map((s) => {
      const v = s.x[i] ?? null;
      return { parts: v === null ? [words.noData] : timed(model, (t) => t.xText(v)), num };
    });
    if (m.link !== undefined) {
      const v = pointLink(m, i);
      cells.push({ parts: [v === null ? words.noData : linkText(model, m, v)], num: true });
    }
    return { key: name, head: [name], cells };
  });
  const columns = m.series.map((s) => ({ text: s.name, num }));
  if (m.link !== undefined) {
    columns.push({ text: totalWord(model, words), num: true });
  }
  return { corner: model.spec.y?.label ?? "", columns, rows, after };
}

// A slope's unit is one series' change, so a row is a series, its two ends
// and the change, and the corner names the measure, which no axis writes.
function slopeTable(model: Model, m: SlopeModel, words: Words, after: string): TableModel {
  const end = (v: number | null | undefined) =>
    v === null || v === undefined ? words.noData : model.yText(v);
  const rows = m.series.map((s): Row => {
    const v = slopeChange(s);
    return {
      key: s.name,
      head: [s.name],
      cells: [
        { parts: [end(s.y[0])], num: true },
        { parts: [end(s.y[1])], num: true },
        { parts: [v === null ? words.noData : changeText(model, v)], num: true },
      ],
    };
  });
  return {
    corner: model.spec.y?.label ?? "",
    columns: [...m.columns.map((text) => ({ text, num: true })), { text: words.change, num: true }],
    rows,
    after,
  };
}

// A row per dot in series order, then the app's order, its name the head,
// its series from two up, then each measure under its label, a bubble's
// size last; a gap reads No data. A dot outside a passed domain is left
// out, as the plot leaves it.
function scatterTable(model: Model, m: ScatterModel, words: Words, after: string): TableModel {
  const several = m.series.length > 1;
  // Only a passed domain leaves a dot out: a bubble with no size holds no
  // extent, so it may lie past an inferred one and is still listed.
  const inside = (v: number | null | undefined, scale: Model["x"] | Model["y"]) =>
    v === null ||
    v === undefined ||
    scale.type === "band" ||
    !scale.passed ||
    (v >= scale.lo && v <= scale.hi);
  const value = (v: number | null, text: (v: number) => string) =>
    v === null ? words.noData : text(v);
  const write = { x: model.xText, y: model.yText, r: model.rText };
  const rows = m.series.flatMap((s) =>
    s.names.flatMap((name, i): Row[] => {
      if (!inside(s.x[i], model.x) || !inside(s.y[i], model.y)) {
        return [];
      }
      const cells: Cell[] = measuresOf(m).map((axis) => ({
        parts: [value(dotValue(s, axis, i), write[axis])],
        num: true,
      }));
      return [
        {
          key: name,
          head: [name],
          cells: several ? [{ parts: [s.name], num: false }, ...cells] : cells,
        },
      ];
    }),
  );
  const columns = measuresOf(m).map((axis) => ({
    text: model.spec[axis]?.label ?? "",
    num: true,
  }));
  return {
    corner: "",
    columns: several ? [{ text: words.series, num: false }, ...columns] : columns,
    rows,
    after,
  };
}

// A matrix as the plot draws it: a column per x entry, a row per y entry
// from the top (a binned y's highest bin first), each value in the colour
// scale's format, the axes' labels in the corner.
function cellTable(model: Model, m: CellModel, words: Words, after: string): TableModel {
  const rows = cellCount(m.y);
  const order = Array.from({ length: rows }, (_, k) => ("edges" in m.y ? rows - 1 - k : k));
  const xs = Array.from({ length: cellCount(m.x) }, (_, c) => c);
  const columns = (model.x.reverse ? xs.reverse() : xs).map((c) => ({
    text: cellAxisText(model, m, "x", c, words, false),
    num: true,
    c,
  }));
  const corner = [model.spec.y?.label, model.spec.x?.label]
    .filter((l): l is string => l !== undefined && l !== "")
    .join(" / ");
  return {
    corner,
    columns: columns.map(({ text, num }) => ({ text, num })),
    rows: order.map((r): Row => {
      const head = cellAxisText(model, m, "y", r, words, false);
      return {
        key: head,
        head: [head],
        cells: columns.map(({ c }) => {
          const v = m.values[r]?.[c] ?? null;
          return { parts: [v === null ? words.noData : model.colourText(v)], num: true };
        }),
      };
    }),
    after,
  };
}

// A row per slice in the app's order, its value bare under the unit's
// plural, then its share, and the whole in the foot.
function pieTable(model: Model, m: PieModel, words: Words, after: string): TableModel {
  const rows = m.slices.map((s, i): Row => ({
    key: s.name,
    head: [s.name],
    cells: [
      { parts: [s.value === null ? words.noData : model.amountText(s.value)], num: true },
      { parts: [sliceShare(model, m, i, words)], num: true },
    ],
  }));
  return {
    corner: "",
    columns: [
      { text: m.unit?.other ?? words.value, num: true },
      { text: words.share, num: true },
    ],
    rows,
    foot: {
      key: "",
      head: [words.total],
      cells: [
        { parts: [model.amountText(m.total)], num: true },
        { parts: [model.shareText(1)], num: true },
      ],
    },
    after,
  };
}

// A row per part in the app's order, its value bare under the unit's
// plural, then its share of the whole; with two levels each group's parts
// after its own head row, its sum and share; the whole in the foot.
function treeTable(model: Model, m: TreeModel, words: Words, after: string): TableModel {
  const amounts = (v: number | null): Cell[] => [
    { parts: [v === null ? words.noData : model.amountText(v)], num: true },
    { parts: [v === null ? words.noData : treeShare(model, m, v)], num: true },
  ];
  const rows = m.parts.map((p): Row => ({ key: p.name, head: [p.name], cells: amounts(p.value) }));
  const groups = m.groups.map((g): Group => ({
    key: g.name,
    head: { key: "", head: [g.name], scope: "rowgroup", cells: amounts(g.value) },
    count: g.count,
  }));
  return {
    corner: "",
    columns: [
      { text: m.unit?.other ?? words.value, num: true },
      { text: words.share, num: true },
    ],
    rows,
    ...(groups.length > 0 ? { groups } : {}),
    foot: {
      key: "",
      head: [words.total],
      cells: [
        { parts: [model.amountText(m.total)], num: true },
        { parts: [model.shareText(1)], num: true },
      ],
    },
    after,
  };
}

// A row per category, or per category and series from two series up with a
// Series column, its five numbers Low to High and its outliers ascending.
function boxTable(model: Model, m: BoxModel, words: Words, after: string): TableModel {
  const names = model.y.type === "band" ? model.y.rows : [];
  const several = m.series.length > 1;
  const l = words.boxLabels;
  const rows = names.flatMap((name, i) =>
    m.series.map((s): Row => {
      const b = s.boxes[i] ?? null;
      const five = b === null ? [] : [b.low, b.q1, b.median, b.q3, b.high];
      const cells: Cell[] = Array.from({ length: 5 }, (_, k) => {
        const v = five[k];
        return { parts: [v === undefined ? words.noData : model.xText(v)], num: true };
      });
      const out = s.outliers[i] ?? [];
      cells.push({
        parts: [out.length === 0 ? words.none : out.map((v) => model.xText(v)).join(", ")],
        num: true,
      });
      return {
        key: several ? `${name}\u0000${s.name}` : name,
        head: [name],
        cells: several ? [{ parts: [s.name], num: false }, ...cells] : cells,
      };
    }),
  );
  const columns = [l.low, l.q1, l.median, l.q3, l.high, l.outliers].map((text) => ({
    text,
    num: true,
  }));
  return {
    corner: model.spec.y?.label ?? "",
    columns: several ? [{ text: words.series, num: false }, ...columns] : columns,
    rows,
    after,
  };
}

const DAY = 86_400_000;

// A row per week column, headed by its first date, and a column per weekday
// from the week's start; a place outside the days is an empty cell.
function calendarTable(model: Model, m: CalendarModel, words: Words, after: string): TableModel {
  const lead = weekRow(m.day, m.weekStart);
  const weekday = dayFormat(model.locale, { weekday: "long" });
  const date = dayFormat(model.locale, { dateStyle: "medium" });
  const first = m.day - lead;
  return {
    corner: "",
    columns: Array.from({ length: 7 }, (_, r) => ({ text: weekday(first + r), num: true })),
    rows: Array.from({ length: weekCount(lead, m.values.length) }, (_, w): Row => {
      const start = first + 7 * w;
      return {
        key: String(start),
        head: [{ at: start * DAY, text: date(start), date: true }],
        cells: Array.from({ length: 7 }, (_, r): Cell => {
          const i = 7 * w + r - lead;
          if (i < 0 || i >= m.values.length) {
            return { parts: [""], num: true };
          }
          const v = m.values[i] ?? null;
          const text = v === null ? words.noData : model.colourText(v);
          return {
            parts: [m.open && i === m.values.length - 1 && v !== null ? words.soFar(text) : text],
            num: true,
          };
        }),
      };
    }),
    after,
  };
}

/** Whether the table's row heads are the app's names, each set in a `<bdi>`
 *  so a right-to-left name keeps its place: a band's rows, a slope's series,
 *  a scatter's dots, a pie's slices or a treemap's groups and parts. */
export const namedRows = (model: Model): boolean => {
  const kind = model.primary?.kind;
  return (
    model.y.type === "band" ||
    kind === "slope" ||
    kind === "scatter" ||
    kind === "pie" ||
    kind === "tree"
  );
};

/** What the table view shows for `model`. */
export function tableModel(model: Model, words: Words): TableModel {
  const m = model.primary;
  const whiskers =
    m?.kind === "box" && m.whiskers !== undefined ? [words.whiskersNote(m.whiskers)] : [];
  const after = [...whiskers, ...ruleSentences(model, words), ...noteSentences(model, words)].join(
    " ",
  );
  if (m === undefined) {
    return { corner: "", columns: [], rows: [], after };
  }
  if (m.kind === "dot") {
    const count = writer("number", model.locale);
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
  if (m.kind === "point") {
    return pointTable(model, m, words, after);
  }
  if (m.kind === "slope") {
    return slopeTable(model, m, words, after);
  }
  if (m.kind === "scatter") {
    return scatterTable(model, m, words, after);
  }
  if (m.kind === "cell") {
    return cellTable(model, m, words, after);
  }
  if (m.kind === "calendar") {
    return calendarTable(model, m, words, after);
  }
  if (m.kind === "box") {
    return boxTable(model, m, words, after);
  }
  if (m.kind === "pie") {
    return pieTable(model, m, words, after);
  }
  if (m.kind === "tree") {
    return treeTable(model, m, words, after);
  }
  const columns = m.series.map((s) => ({ text: s.name, num: true }));
  if (m.kind === "rect" ? totalled(m) : m.kind === "area" && m.series.length > 1) {
    columns.push({ text: words.total, num: true });
  }
  return {
    corner: model.spec.x?.label ?? "",
    columns,
    rows: m.kind === "rect" ? rectRows(model, m, words) : lineRows(model, m, words),
    after,
  };
}

function write(el: HTMLElement, parts: readonly Part[], isolate: boolean): void {
  const text = (s: string): Node | string => {
    if (!isolate) {
      return s;
    }
    const bdi = document.createElement("bdi");
    bdi.textContent = s;
    return bdi;
  };
  const nodes = document.createDocumentFragment();
  for (const p of parts) {
    if (typeof p === "string") {
      nodes.append(text(p));
      continue;
    }
    const at = dateAt(p.at, "renderChart: an instant the table writes");
    if (at.getUTCFullYear() < 1) {
      nodes.append(text(p.text));
      continue;
    }
    const time = document.createElement("time");
    const iso = at.toISOString().replace(/^\+/u, "");
    time.dateTime = p.date === true ? iso.slice(0, iso.indexOf("T")) : iso;
    time.textContent = p.text;
    nodes.append(time);
  }
  el.replaceChildren(nodes);
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
  th.scope = row.scope ?? "row";
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
    const children = document.createRange();
    children.selectNodeContents(fresh);
    el.replaceChildren(children.extractContents());
  }
}

// Writes `foot` as the table's `<tfoot>` row, its cells rewritten in place.
function syncFoot(table: HTMLTableElement, foot: Row | undefined, named: boolean): void {
  if (foot === undefined) {
    table.tFoot?.remove();
    return;
  }
  const fresh = bodyRow(foot, named);
  const tr = table.tFoot?.rows[0];
  if (tr === undefined) {
    table.createTFoot().append(fresh);
    return;
  }
  [...tr.cells].forEach((cell, k) => {
    const now = fresh.cells[k];
    if (now !== undefined) {
      rewrite(cell, now);
    }
  });
}

// Each `<tbody>` of `t` with its rows: a group's head row first, or one
// `<tbody>` keyed "" for every row.
function bodiesOf(t: TableModel): { readonly key: string; readonly rows: readonly Row[] }[] {
  if (t.groups === undefined) {
    return [{ key: "", rows: t.rows }];
  }
  let from = 0;
  return t.groups.map((g) => {
    const rows = [g.head, ...t.rows.slice(from, from + g.count)];
    from += g.count;
    return { key: g.key, rows };
  });
}

// Puts `rows` in `body` by key: changed cells rewritten in place, new rows
// inserted and rows that left removed.
function syncRows(body: HTMLTableSectionElement, rows: readonly Row[], named: boolean): void {
  // Rows that left go first, so no kept row is moved, which would blur it.
  const keys = new Set(rows.map((r) => r.key));
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
  for (const row of rows) {
    const fresh = bodyRow(row, named);
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

// Puts `t`'s `<tbody>`s after `table`'s head by key, as `syncRows` puts rows.
function syncBodies(table: HTMLTableElement, t: TableModel, named: boolean): void {
  const bodies = bodiesOf(t);
  const keys = new Set(bodies.map((b) => b.key));
  const old = new Map<string, HTMLTableSectionElement>();
  for (const tb of [...table.tBodies]) {
    const key = tb.dataset["key"] ?? "";
    if (keys.has(key)) {
      old.set(key, tb);
    } else {
      tb.remove();
    }
  }
  let after: Element | null = table.tHead;
  for (const b of bodies) {
    let tb = old.get(b.key);
    if (tb === undefined) {
      tb = document.createElement("tbody");
      if (b.key !== "") {
        tb.dataset["key"] = b.key;
      }
    }
    syncRows(tb, b.rows, named);
    if (after?.nextElementSibling !== tb) {
      after?.after(tb);
    }
    after = tb;
  }
}

/**
 * Shows `t` in `panel`, the chart's `.cp-panel`, its caption `title`. A
 * table with the same columns keeps its rows: changed cells are rewritten
 * in place, new rows inserted and rows that left removed.
 */
export function syncTable(panel: HTMLElement, t: TableModel, title: string, named: boolean): void {
  let table = panel.querySelector("table");
  if (table?.dataset["head"] !== headSignature(t)) {
    table = document.createElement("table");
    table.className = "cp-table";
    table.dataset["head"] = headSignature(t);
    const caption = table.createCaption();
    caption.textContent = title;
    const head = table.createTHead().insertRow();
    head.append(cornerCell(t.corner));
    for (const c of t.columns) {
      head.append(headCell(c.text, c.num));
    }
    // Filled before it is shown, so its rows cost no layout.
    syncBodies(table, t, named);
    panel.querySelector("table")?.remove();
    panel.prepend(table);
  } else {
    const caption = table.caption;
    if (caption !== null && caption.textContent !== title) {
      caption.textContent = title;
    }
    syncBodies(table, t, named);
  }
  syncFoot(table, t.foot, named);
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
