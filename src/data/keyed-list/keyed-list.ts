/**
 * keyed-list.ts — `enhanceKeyedList()` keeps a list's rows keyed through
 * live updates: a row keeps its element while it is drawn, and a reorder
 * keeps focus and the row at the top of the view. A long list draws only
 * the rows in view, in flow between spacers.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { announce } from "../../feedback/announce/announce.js";
import { skeletonListRow } from "../list-row/list-row.js";
import { focusOn, landing } from "../list-row/row.js";
import { scrollerOf, seenOf, viewOf } from "../list-row/scroller.js";
import { skeletonRow } from "../table/skeleton-row.js";

/** A row's key, or `undefined` for a row not loaded yet. */
export type KeyedListKeys = readonly (string | undefined)[];

export interface KeyedListWords {
  /** The count of `n` rows of `of`. Default "5 of 640 titles". */
  readonly count?: (n: number, of: number) => string;
}

export interface KeyedListOptions {
  /** The rows' keys in order; each key once. Its length is the list's. */
  readonly keys: KeyedListKeys;
  /** The host's row for `key`: an `li` in a list, a `tr` in a table body.
   *  Called when the row is first drawn; its element is kept while drawn. */
  readonly row: (key: string, index: number) => HTMLElement;
  /** Draws only the rows in view and `overscan` each side. Default true;
   *  false draws every row. */
  readonly window?: boolean;
  /** Asks for the drawn rows from `start` to `end` (exclusive) that are not
   *  loaded; the host answers with `update()`. */
  readonly need?: (start: number, end: number) => void;
  /** Every row before any filter, for the count. Default: the keys' length. */
  readonly of?: number;
  /** Where the count is written; with none, nothing is written or said. */
  readonly count?: HTMLElement;
  readonly words?: KeyedListWords;
  /** Rows drawn past each edge of the view. Default 5. */
  readonly overscan?: number;
  /** How long a new count stays the same before `reset()` says it, in ms.
   *  Default 500. */
  readonly settle?: number;
  /** Removes the listeners and the observer; the drawn rows stay. */
  readonly signal?: AbortSignal;
}

export interface KeyedListRevealOptions {
  /** Scrolls the row into view. Default true. */
  readonly scroll?: boolean;
}

export interface KeyedList {
  /** A live change: the keys in their new order. A drawn row keeps its
   *  element, the row at the top of the view stays where it was, focus
   *  stays, and the count is written without being said. */
  update(keys: KeyedListKeys, of?: number): void;
  /** A new set of rows, such as after a filter: back to the list's start,
   *  and the count written and said once it settles. */
  reset(keys: KeyedListKeys, of?: number): void;
  /** The drawn row of `key`, where the host patches a live change. */
  rowOf(key: string): HTMLElement | undefined;
  /** Draws `key`'s row at its place, scrolls it into view unless `scroll`
   *  is false, and returns it. A held change takes it with `scroll: false`,
   *  so nothing moves before the reader's Show focuses it. */
  reveal(key: string, options?: KeyedListRevealOptions): HTMLElement | undefined;
  /** How many rows the list has, drawn or not. */
  readonly length: number;
}

type Body = HTMLUListElement | HTMLOListElement | HTMLTableSectionElement;

interface Mark {
  readonly key: string;
  readonly top: number;
}

interface Pass {
  /** The keys' places before this change, for the anchor. */
  readonly before?: ReadonlyMap<string, number>;
  readonly anchor?: boolean;
  /** A departing row that keeps focus until `refocus` moves it, run once
   *  the rows are drawn and before the view is put back. */
  readonly linger?: Element | undefined;
  readonly refocus?: () => void;
  /** A row to draw whether it is in view or not. */
  readonly also?: number | undefined;
  /** The key of the row the view keeps, in place of the first in view. */
  readonly keep?: string;
}

const numbers = new Intl.NumberFormat();

const defaultCount = (n: number, of: number): string =>
  `${numbers.format(n)} of ${numbers.format(of)} titles`;

const clamp = (n: number, low: number, high: number): number => Math.min(Math.max(n, low), high);

/** The first index of the rising `sums` whose value is past `y`, or their
 *  length. */
function past(sums: Float64Array, y: number): number {
  let lo = 0;
  let hi = sums.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sums[mid] ?? 0) > y) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/** The rows a reconcile can leave where they are: a longest increasing
 *  subsequence of `seq`, through `must` when `must` is in it. */
function steady(seq: readonly number[], must: number | undefined): Set<number> {
  if (must === undefined || !seq.includes(must)) {
    return new Set(rising(seq));
  }
  const at = seq.indexOf(must);
  const left = seq.slice(0, at).filter((v) => v < must);
  const right = seq.slice(at + 1).filter((v) => v > must);
  return new Set([...rising(left), must, ...rising(right)]);
}

/** A longest strictly increasing subsequence of `seq`. */
function rising(seq: readonly number[]): number[] {
  const tails: number[] = [];
  const from: number[] = Array.from({ length: seq.length }, () => -1);
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[tails[mid] ?? 0] ?? 0) < v) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    from[i] = lo > 0 ? (tails[lo - 1] ?? -1) : -1;
    tails[lo] = i;
  });
  const out: number[] = [];
  for (let i = tails.at(-1) ?? -1; i !== -1; i = from[i] ?? -1) {
    out.push(seq[i] ?? 0);
  }
  return out.reverse();
}

/**
 * Keeps the rows of `container`, a `ul.cp-list` or `ol.cp-list` of `li`
 * rows or a `.cp-table`'s `tbody`, keyed by `options.keys`. The module owns
 * the container's children but a `.cp-list-foot`, which stays last.
 */
export function enhanceKeyedList(container: Body, options: KeyedListOptions): KeyedList {
  const { row, need, signal, overscan = 5, settle = 500 } = options;
  const windowed = options.window ?? true;
  // Tiles share a line, so a grid's rows have no height of their own: it
  // is drawn whole, and windowed again once it is back to rows.
  const windows = (): boolean => windowed && container.dataset["layout"] !== "grid";
  const table = container instanceof HTMLTableSectionElement;
  const words = options.words?.count ?? defaultCount;
  const counter = options.count;

  let keys: KeyedListKeys = [];
  let at = new Map<string, number>();
  let of: number | undefined;
  const drawn = new Map<string, HTMLElement>();
  const keyOf = new Map<Element, string>();
  const loading = new Map<number, HTMLElement>();
  const sized = new WeakMap<HTMLElement, number>();
  const mids: HTMLElement[] = [];
  // A row's slot is its height, its line included, and the gap before it.
  // A row drawn once keeps its slot by key; the rest take the mean of the
  // rows past the first, which has no line above it.
  const slots = new Map<string, number>();
  const pool = new Map<string, number>();
  let sum = 0;
  // A skeleton takes its rows' shape, so until one is measured its slot is
  // theirs.
  let blank: number | undefined;
  let seed = 3 * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  let gap = 0;
  let fitted = "";
  let sums = new Float64Array(1);
  let stale = true;
  let asked = "";
  let said: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  const soon = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    }
  };
  // A drawn row or the list resizing, such as at a pointer tier change,
  // moves the slots. Drawing inside the observer's own callback resizes
  // what it observes and raises "ResizeObserver loop completed", so it
  // waits a frame.
  const sizes = windowed ? new ResizeObserver(soon) : undefined;

  const spacer = (): HTMLElement => {
    const el = document.createElement(table ? "tr" : "li");
    el.dataset["part"] = "spacer";
    el.setAttribute("aria-hidden", "true");
    if (el instanceof HTMLTableRowElement) {
      el.insertCell();
    }
    return el;
  };
  const head = spacer();
  const tail = spacer();

  const put = (el: Element, name: string, value: string | null): void => {
    if (el.getAttribute(name) === value) {
      return;
    }
    if (value === null) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, value);
    }
  };

  const foot = (): Element | null => container.querySelector(":scope > .cp-list-foot");

  /** A table's column count, from its head or a drawn row. */
  const columns = (): number => {
    const tr =
      container.closest("table")?.tHead?.rows[0] ??
      [...container.children].find((el) => keyOf.has(el));
    let n = 0;
    for (const cell of tr instanceof HTMLTableRowElement ? tr.cells : []) {
      n += cell.colSpan;
    }
    return Math.max(1, n);
  };

  // The first row drawn, never a heading, shapes every skeleton even after
  // it leaves the window. Once its key leaves the list it is retired but
  // still shapes them, until a row of the new keys is drawn. A data-row
  // shape is not kept: a loaded row replaces it.
  let model: { readonly key: string; readonly el: HTMLElement; retired: boolean } | undefined;
  let shape: HTMLElement | undefined;
  const shapes = (el: HTMLElement): boolean =>
    table || el.querySelector(":scope > .cp-list-row") !== null;
  const adopt = (key: string, el: HTMLElement): void => {
    model = { key, el, retired: false };
    shape = undefined;
    blank = undefined;
    loading.clear();
    stale = true;
  };

  const setKeys = (next: KeyedListKeys, total: number | undefined): void => {
    const index = new Map<string, number>();
    next.forEach((key, i) => {
      if (key === undefined) {
        return;
      }
      if (index.has(key)) {
        throw new TypeError(`enhanceKeyedList: the key "${key}" is given twice`);
      }
      index.set(key, i);
    });
    keys = next;
    at = index;
    of = total ?? of;
    if (model !== undefined && !index.has(model.key)) {
      model.retired = true;
    }
    for (const key of slots.keys()) {
      if (!index.has(key)) {
        slots.delete(key);
        sum -= pool.get(key) ?? 0;
        pool.delete(key);
      }
    }
    stale = true;
  };

  /** A slot for a row not drawn yet: the drawn rows' mean, or the last
   *  one known. */
  const guess = (): number => (pool.size > 0 ? sum / pool.size : seed);

  /** `sums[i]` is the sum of the slots before row `i`, `sums[n]` of all. */
  const sumsOf = (): Float64Array => {
    if (stale) {
      const n = keys.length;
      const mean = guess();
      sums = new Float64Array(n + 1);
      for (let i = 0; i < n; i += 1) {
        const key = keys[i];
        sums[i + 1] =
          (sums[i] ?? 0) + (key === undefined ? (blank ?? mean) : (slots.get(key) ?? mean));
      }
      stale = false;
    }
    return sums;
  };

  /** A new gap, text size or pointer tier moves every row, so the slots
   *  kept are dropped. A new width keeps them: a row it wraps anew takes
   *  its slot again when it is drawn. */
  const fit = (): void => {
    const style = getComputedStyle(container);
    const g = Number.parseFloat(style.rowGap) || 0;
    const now = `${getComputedStyle(document.documentElement).fontSize} ${style.getPropertyValue("--cp-control-h-sm")}`;
    if (g !== gap || now !== fitted) {
      gap = g;
      fitted = now;
      seed = guess();
      blank = undefined;
      slots.clear();
      pool.clear();
      sum = 0;
      stale = true;
    }
  };

  const rowFor = (key: string, i: number): HTMLElement => {
    let el = drawn.get(key);
    if (el === undefined) {
      el = row(key, i);
      if (!(table ? el instanceof HTMLTableRowElement : el instanceof HTMLLIElement)) {
        throw new TypeError(`enhanceKeyedList: row() must give a ${table ? "tr" : "li"}`);
      }
      drawn.set(key, el);
      keyOf.set(el, key);
      sizes?.observe(el);
    }
    return el;
  };

  /** A skeleton in `from`'s shape, or in the host's `data-row` shape
   *  without one. A tbody laid out outside a table is a TypeError. */
  const shaped = (from: HTMLElement | undefined): HTMLElement => {
    if (!table) {
      return skeletonListRow(container, from instanceof HTMLLIElement ? from : undefined);
    }
    const t = container.closest("table");
    if (t === null) {
      throw new TypeError("enhanceKeyedList: the tbody is not in a table");
    }
    return skeletonRow(t, from instanceof HTMLTableRowElement ? from : undefined);
  };

  const skeleton = (i: number): HTMLElement => {
    let el = loading.get(i);
    if (el === undefined) {
      if (shape === undefined && model !== undefined) {
        shape = shaped(model.el);
      }
      el = shape === undefined ? shaped(undefined) : (shape.cloneNode(true) as HTMLElement);
      loading.set(i, el);
    }
    return el;
  };

  /** The top of row 0's slot, in px of the viewport. */
  const startOf = (): number => {
    const first = container.firstElementChild;
    if (first !== null && first !== foot()) {
      return first.getBoundingClientRect().top;
    }
    const style = getComputedStyle(container);
    return (
      container.getBoundingClientRect().top +
      container.clientTop +
      (Number.parseFloat(style.paddingBlockStart) || 0) -
      container.scrollTop
    );
  };

  const shown = (): boolean => container.getClientRects().length > 0;

  /** The rows to draw, about `mark`'s row put back at its top when given,
   *  as the draw's correction will. */
  const range = (mark?: Mark): readonly [number, number] => {
    const n = keys.length;
    if (!windows()) {
      return [0, n];
    }
    if (!shown()) {
      return [0, Math.min(n, Math.max(1, overscan))];
    }
    const band = seenOf(container, true);
    const tops = sumsOf();
    const i = mark === undefined ? undefined : at.get(mark.key);
    // A row measured since the last layout moves the slots the page has not
    // taken yet, so the rows' start is read off the kept row, never the page.
    const top =
      mark === undefined || i === undefined || !drawn.has(mark.key)
        ? startOf()
        : mark.top - (tops[i] ?? 0);
    // Row i spans tops[i] to tops[i + 1] - gap below the first child's top.
    const start = clamp(past(tops, band.top - top + gap) - 1 - overscan, 0, n);
    return [start, clamp(past(tops, band.bottom - top) + overscan, start, n)];
  };

  /** The container's child that holds focus, if any. */
  const focused = (): Element | undefined => {
    let el: Element | null = document.activeElement;
    if (el === null || el === container || !container.contains(el)) {
      return undefined;
    }
    while (el !== null && el.parentElement !== container) {
      el = el.parentElement;
    }
    return el ?? undefined;
  };

  /**
   * The row the view keeps across a change: the first one in view whose
   * index moved as most of those in view did, so a row that moved itself
   * is passed over. None at the list's start, so a row put first shows.
   */
  const anchorOf = (before: ReadonlyMap<string, number>): Mark | undefined => {
    if (!shown()) {
      return undefined;
    }
    const band = seenOf(container, true);
    if (startOf() >= band.top - 0.5) {
      return undefined;
    }
    const seen: { readonly key: string; readonly top: number; readonly shift: number }[] = [];
    for (const child of container.children) {
      const key = keyOf.get(child);
      const now = key === undefined ? undefined : at.get(key);
      const was = key === undefined ? undefined : before.get(key);
      if (key === undefined || now === undefined || was === undefined) {
        continue;
      }
      const box = child.getBoundingClientRect();
      if (box.top >= band.bottom) {
        break;
      }
      if (box.bottom > band.top + 0.5) {
        seen.push({ key, top: box.top, shift: now - was });
      }
    }
    const tally = new Map<number, number>();
    for (const { shift } of seen) {
      tally.set(shift, (tally.get(shift) ?? 0) + 1);
    }
    const most = Math.max(...tally.values());
    return seen.find((s) => tally.get(s.shift) === most);
  };

  /**
   * Puts `want` in the container in order, before the foot, moving the
   * fewest children and never `hold`, since a re-inserted node loses focus
   * and hover. `linger` stays until the caller removes it.
   */
  const place = (
    want: readonly HTMLElement[],
    hold: Element | undefined,
    linger: Element | undefined,
  ): void => {
    const order = new Map<Element, number>(want.map((el, i) => [el, i]));
    const end = foot();
    for (const child of [...container.children]) {
      if (!order.has(child) && child !== end && child !== linger) {
        child.remove();
      }
    }
    const present: number[] = [];
    for (const child of container.children) {
      const i = order.get(child);
      if (i !== undefined) {
        present.push(i);
      }
    }
    const keep = steady(present, hold === undefined ? undefined : order.get(hold));
    let next: Node | null = end;
    for (let i = want.length - 1; i >= 0; i -= 1) {
      const el = want[i];
      if (el === undefined) {
        continue;
      }
      if (!keep.has(i) || el.parentNode !== container) {
        container.insertBefore(el, next);
      }
      next = el;
    }
  };

  /** Draws the rows from `start` to `end` and `extra`, and returns the
   *  drawn rows with their indices, in order. */
  const layout = (
    start: number,
    end: number,
    extra: readonly (number | undefined)[],
    linger: Element | undefined,
  ): { readonly el: HTMLElement; readonly i: number }[] => {
    const n = keys.length;
    const wanted = new Set<number>();
    for (let i = start; i < end; i += 1) {
      wanted.add(i);
    }
    for (const i of extra) {
      if (i !== undefined && i >= 0 && i < n) {
        wanted.add(i);
      }
    }
    for (const [key, el] of drawn) {
      const i = at.get(key);
      if (i === undefined || !wanted.has(i)) {
        drawn.delete(key);
        keyOf.delete(el);
        sizes?.unobserve(el);
      }
    }
    for (const [i, el] of loading) {
      if (!wanted.has(i) || keys[i] !== undefined) {
        loading.delete(i);
        el.remove();
      }
    }
    const order = [...wanted].sort((a, b) => a - b);
    // Rows are drawn before any skeleton, so a row that replaces a missing
    // or retired model shapes this pass's skeletons.
    let first: { readonly key: string; readonly el: HTMLElement } | undefined;
    for (const i of order) {
      const key = keys[i];
      if (key === undefined) {
        continue;
      }
      const el = rowFor(key, i);
      if (first === undefined && shapes(el)) {
        first = { key, el };
      }
    }
    if (first !== undefined && (model === undefined || model.retired)) {
      adopt(first.key, first.el);
    }
    const want: HTMLElement[] = [];
    const rows: { el: HTMLElement; i: number }[] = [];
    const tops = sumsOf();
    let mid = 0;
    let next = 0;
    const fill = (from: number, to: number): void => {
      if (to <= from) {
        return;
      }
      let el = from === 0 ? head : to === n ? tail : mids[mid];
      if (el === undefined) {
        el = spacer();
        mids.push(el);
      }
      if (el !== head && el !== tail) {
        mid += 1;
      }
      // A spacer's own line is inside its border-box height, and the gap
      // before it stands for the first of its rows' gaps.
      const px = Math.max(0, (tops[to] ?? 0) - (tops[from] ?? 0) - gap);
      if (sized.get(el) !== px) {
        sized.set(el, px);
        el.style.blockSize = `${String(px)}px`;
      }
      if (el instanceof HTMLTableRowElement) {
        const cell = el.cells[0];
        const span = columns();
        if (cell !== undefined && cell.colSpan !== span) {
          cell.colSpan = span;
        }
      }
      want.push(el);
    };
    for (const i of order) {
      fill(next, i);
      const key = keys[i];
      const el = key === undefined ? skeleton(i) : rowFor(key, i);
      want.push(el);
      rows.push({ el, i });
      next = i + 1;
    }
    fill(next, n);
    place(want, focused(), linger);
    // A row out of the document is missing from the count a screen reader
    // makes, so a windowed row says its place itself.
    const placed = windows();
    const head0 = container.closest("table")?.tHead?.rows.length ?? 0;
    for (const { el, i } of rows) {
      if (keys[i] === undefined) {
        continue;
      }
      if (table) {
        put(el, "aria-rowindex", placed ? String(head0 + i + 1) : null);
      } else {
        put(el, "aria-setsize", placed ? String(n) : null);
        put(el, "aria-posinset", placed ? String(i + 1) : null);
      }
    }
    if (container instanceof HTMLTableSectionElement) {
      const t = container.closest("table");
      const others = t === null ? 0 : t.rows.length - container.rows.length;
      if (t !== null) {
        put(t, "aria-rowcount", placed ? String(others + n) : null);
      }
    }
    put(container, "aria-busy", loading.size > 0 ? "true" : null);
    return rows;
  };

  /** Keeps each drawn row's slot, and says whether one is half a px or
   *  more from the slot it was placed in. */
  const measure = (rows: readonly { readonly el: HTMLElement; readonly i: number }[]): boolean => {
    const placed = sumsOf();
    let moved = false;
    for (const { el, i } of rows) {
      const slot = el.getBoundingClientRect().height + gap;
      moved ||= Math.abs(slot - ((placed[i + 1] ?? 0) - (placed[i] ?? 0))) >= 0.5;
      const key = keys[i];
      const was = key === undefined ? blank : slots.get(key);
      if (slot === was) {
        continue;
      }
      if (key === undefined) {
        blank = slot;
      } else {
        sum += (i > 0 ? slot : 0) - (pool.get(key) ?? 0);
        slots.set(key, slot);
        if (i > 0) {
          pool.set(key, slot);
        } else {
          pool.delete(key);
        }
      }
      stale = true;
    }
    return moved;
  };

  const ask = (rows: readonly { readonly i: number }[]): void => {
    const missing = rows.filter(({ i }) => keys[i] === undefined).map(({ i }) => i);
    const first = missing[0];
    const last = missing.at(-1);
    if (first === undefined || last === undefined) {
      asked = "";
      return;
    }
    const span = `${String(first)}-${String(last + 1)}`;
    if (span !== asked) {
      asked = span;
      need?.(first, last + 1);
    }
  };

  /** The row the last draw kept in view, where it was in the scroller's
   *  view, and the scroller and its offset then. */
  let last:
    | {
        readonly key: string;
        readonly off: number;
        readonly scroller: HTMLElement;
        readonly scroll: number;
      }
    | undefined;

  const markOf = (key: string): Mark | undefined => {
    const el = drawn.get(key);
    return el === undefined ? undefined : { key, top: el.getBoundingClientRect().top };
  };

  const draw = (pass: Pass = {}): void => {
    // The list itself only while its rows overflow it: a list set to scroll
    // whose box grows with its rows moves with the box around it.
    const scroller = scrollerOf(container, true);
    const anchoring = scroller.style.overflowAnchor;
    // The engine's own anchoring would add its correction to this one.
    scroller.style.overflowAnchor = "none";
    let rows: readonly { readonly el: HTMLElement; readonly i: number }[] = [];
    try {
      fit();
      // With no scroll since the last draw, a row that moved moved because
      // one above it changed height, so it goes back to where it was.
      const still =
        last !== undefined &&
        pass.before === undefined &&
        scroller === last.scroller &&
        scroller.scrollTop === last.scroll
          ? last
          : undefined;
      let mark =
        pass.anchor === false
          ? undefined
          : pass.keep !== undefined
            ? markOf(pass.keep)
            : still !== undefined && drawn.has(still.key)
              ? { key: still.key, top: viewOf(scroller).top + still.off }
              : anchorOf(pass.before ?? at);
      for (let round = 0; round < 6; round += 1) {
        const [start, end] = range(mark);
        rows = layout(
          start,
          end,
          [focusIndex(), mark === undefined ? undefined : at.get(mark.key), pass.also],
          round === 0 ? pass.linger : undefined,
        );
        if (round === 0) {
          pass.refocus?.();
        }
        const kept = mark === undefined ? undefined : drawn.get(mark.key);
        const by =
          kept === undefined || mark === undefined
            ? 0
            : kept.getBoundingClientRect().top - mark.top;
        const scrolled = Math.abs(by) >= 0.5;
        if (scrolled) {
          // Relative, so a scroll the reader makes meanwhile is added to,
          // never undone by an offset read before it.
          scroller.scrollBy({ top: by, behavior: "instant" });
        }
        if (!windows()) {
          break;
        }
        // A row placed in the wrong slot or a scroll moves the window, so
        // it is drawn again, about the row in view.
        const moved = measure(rows);
        if (!moved && !scrolled) {
          break;
        }
        mark ??= anchorOf(at);
      }
    } finally {
      scroller.style.overflowAnchor = anchoring;
    }
    const seen = anchorOf(at);
    last =
      seen === undefined
        ? undefined
        : {
            key: seen.key,
            off: seen.top - viewOf(scroller).top,
            scroller,
            scroll: scroller.scrollTop,
          };
    ask(rows);
  };

  const focusIndex = (): number | undefined => {
    const child = focused();
    const key = child === undefined ? undefined : keyOf.get(child);
    return key === undefined ? undefined : at.get(key);
  };

  const writeCount = (say: boolean): void => {
    if (counter === undefined) {
      return;
    }
    const text = words(keys.length, of ?? keys.length);
    if (counter.textContent !== text) {
      counter.textContent = text;
    }
    if (!say || signal?.aborted === true) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = words(keys.length, of ?? keys.length);
      if (now !== said) {
        said = now;
        announce(now);
      }
    }, settle);
  };

  /** Scrolls the list's start into view by a relative scroll, as `draw`'s
   *  correction does. */
  const toStart = (): void => {
    const scroller = scrollerOf(container, true);
    const by =
      scroller === container
        ? -container.scrollTop
        : shown()
          ? startOf() - seenOf(container, true).top
          : 0;
    if (by < 0) {
      scroller.scrollBy({ top: by, behavior: "instant" });
    }
  };

  const apply = (next: KeyedListKeys, total: number | undefined, fresh: boolean): void => {
    const before = at;
    const child = focused();
    const key = child === undefined ? undefined : keyOf.get(child);
    setKeys(next, total);
    const gone = child !== undefined && key !== undefined && !at.has(key);
    const target = gone ? Math.min(before.get(key) ?? 0, keys.length - 1) : undefined;
    // Focus leaves a row whose key left for the row now in its place, and
    // only then does the row go, so focus never drops to the page.
    const refocus = (): void => {
      const k = target === undefined ? undefined : keys[target];
      focusOn(k === undefined ? container : landing(rowFor(k, target ?? 0)));
      child?.remove();
    };
    if (fresh) {
      toStart();
    }
    draw(
      gone
        ? { before, anchor: !fresh, linger: child, refocus, also: target }
        : { before, anchor: !fresh },
    );
    writeCount(fresh);
  };

  setKeys(options.keys, options.of);
  for (const child of [...container.children]) {
    if (!child.matches(".cp-list-foot")) {
      child.remove();
    }
  }
  draw();
  writeCount(false);
  said = counter?.textContent ?? undefined;

  if (sizes !== undefined && signal?.aborted !== true) {
    const listen = until(signal);
    document.addEventListener(
      "scroll",
      (e) => {
        const t = e.target;
        if (t === document || (t instanceof Node && t.contains(container))) {
          // Laying out a change inside a scroll event's dispatch stops WebKit
          // anchoring that scroller for good (the FIXME in
          // https://commits.webkit.org/325991@main), so the draw waits for
          // the frame's animation callbacks, which run before its paint.
          soon();
        }
      },
      { ...until(signal, true), passive: true },
    );
    addEventListener("resize", soon, listen);
    window.visualViewport?.addEventListener("resize", soon, listen);
    window.visualViewport?.addEventListener("scroll", soon, listen);
    sizes.observe(container);
  }
  whenAborted(signal, () => {
    sizes?.disconnect();
    cancelAnimationFrame(frame);
  });
  whenAborted(signal, () => {
    clearTimeout(timer);
  });

  return {
    update(next, total) {
      apply(next, total, false);
    },
    reset(next, total) {
      apply(next, total, true);
    },
    rowOf(key) {
      return drawn.get(key);
    },
    reveal(key, how) {
      const i = at.get(key);
      if (i === undefined) {
        return undefined;
      }
      draw({ also: i });
      if (how?.scroll !== false) {
        drawn.get(key)?.scrollIntoView({ block: "nearest", behavior: "instant" });
        draw({ also: i, keep: key });
      }
      return drawn.get(key);
    },
    get length() {
      return keys.length;
    },
  };
}
