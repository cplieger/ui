/**
 * keyed-list.ts — `enhanceKeyedList()` keeps a list's rows keyed through
 * live updates: a row keeps its element while it is drawn, and a reorder
 * keeps focus and the row at the top of the view. A long list draws only
 * the rows in view, in flow between spacers.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { announce } from "../../feedback/announce/announce.js";
import { focusableIn, focusOn } from "../list-row/row.js";
import { scrollerOf, scrollsItself, seenOf } from "../list-row/scroller.js";

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
  /** Scrolls `key`'s row into view and returns it, drawn. */
  reveal(key: string): HTMLElement | undefined;
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
}

const numbers = new Intl.NumberFormat();

const defaultCount = (n: number, of: number): string =>
  `${numbers.format(n)} of ${numbers.format(of)} titles`;

const clamp = (n: number, low: number, high: number): number => Math.min(Math.max(n, low), high);

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
  // Tiles share a line, so a grid's rows have no one pitch: it is drawn
  // whole, and windowed again once it is back to rows.
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
  let pitch = 3 * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  let edge = 0;
  let asked = "";
  let said: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  // A drawn row or the list resizing, such as at a pointer tier change,
  // moves the pitch. Drawing inside the observer's own callback resizes
  // what it observes and raises "ResizeObserver loop completed", so it
  // waits a frame.
  const sizes = windowed
    ? new ResizeObserver(() => {
        if (frame === 0) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            draw();
          });
        }
      })
    : undefined;

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

  const skeleton = (i: number): HTMLElement => {
    let el = loading.get(i);
    if (el !== undefined) {
      return el;
    }
    const bar = () => {
      const s = document.createElement("span");
      s.className = "cp-skeleton";
      return s;
    };
    if (table) {
      const tr = document.createElement("tr");
      for (let c = columns(); c > 0; c -= 1) {
        tr.insertCell().append(bar());
      }
      tr.dataset["skeleton"] = "";
      el = tr;
    } else {
      const stack = document.createElement("span");
      stack.className = "cp-cell-stack";
      stack.append(bar(), bar());
      const body = document.createElement("div");
      body.className = "cp-list-row";
      body.dataset["skeleton"] = "";
      body.append(stack);
      el = document.createElement("li");
      el.append(body);
    }
    el.setAttribute("aria-hidden", "true");
    loading.set(i, el);
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

  const range = (): readonly [number, number] => {
    const n = keys.length;
    if (!windows()) {
      return [0, n];
    }
    if (!shown()) {
      return [0, Math.min(n, Math.max(1, overscan))];
    }
    const band = seenOf(container, true);
    const top = startOf();
    const start = clamp(Math.floor((band.top - top) / pitch) - overscan, 0, n);
    return [start, clamp(Math.ceil((band.bottom - top) / pitch) + overscan, start, n)];
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
    const gap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
    const want: HTMLElement[] = [];
    const rows: { el: HTMLElement; i: number }[] = [];
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
      // A list draws its line above each item but the first, so the
      // spacer for the first rows has one line fewer than they have. A
      // collapsed table's line is inside its row's height.
      const px = Math.max(0, (to - from) * pitch - gap - (from === 0 ? edge : 0));
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
    for (const i of [...wanted].sort((a, b) => a - b)) {
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

  /** The line a list draws above each item but its first. */
  const lineOf = (): number => {
    const second = container.children[1];
    return table || second === undefined
      ? edge
      : Number.parseFloat(getComputedStyle(second).borderBlockStartWidth) || 0;
  };

  /** The rows' pitch, from the longest run of drawn rows in a row. It
   *  reads their bottoms, since the first row has no line above it. */
  const measure = (rows: readonly { readonly el: HTMLElement; readonly i: number }[]): number => {
    let best: readonly [HTMLElement, HTMLElement, number] | undefined;
    let from = 0;
    rows.forEach((r, j) => {
      if (j > 0 && r.i !== (rows[j - 1]?.i ?? 0) + 1) {
        from = j;
      }
      const first = rows[from];
      if (first !== undefined && (best === undefined || r.i - first.i > best[2])) {
        best = [first.el, r.el, r.i - first.i];
      }
    });
    if (best === undefined) {
      return pitch;
    }
    const [first, last, span] = best;
    if (span === 0) {
      const gap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
      return first.getBoundingClientRect().height + gap || pitch;
    }
    return (
      (last.getBoundingClientRect().bottom - first.getBoundingClientRect().bottom) / span || pitch
    );
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

  const draw = (pass: Pass = {}): void => {
    const scroller = scrollsItself(container) ? container : scrollerOf(container);
    const anchoring = scroller.style.overflowAnchor;
    // The engine's own anchoring would add its correction to this one;
    // WebKit has none, so the module keeps the place itself.
    scroller.style.overflowAnchor = "none";
    let rows: readonly { readonly el: HTMLElement; readonly i: number }[] = [];
    try {
      const mark = pass.anchor === false ? undefined : anchorOf(pass.before ?? at);
      for (let round = 0; round < 3; round += 1) {
        const [start, end] = range();
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
          scroller.scrollTo({ top: scroller.scrollTop + by, behavior: "instant" });
        }
        if (!windows()) {
          break;
        }
        // A new pitch or scroll moves the window, so it is drawn again.
        const measured = measure(rows);
        const line = lineOf();
        const moved = Math.abs(measured - pitch) > 0.5 || line !== edge;
        pitch = measured;
        edge = line;
        if (!moved && !scrolled) {
          break;
        }
      }
    } finally {
      scroller.style.overflowAnchor = anchoring;
    }
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

  const toStart = (): void => {
    if (scrollsItself(container)) {
      container.scrollTop = 0;
      return;
    }
    if (!shown()) {
      return;
    }
    const by = startOf() - seenOf(container, true).top;
    if (by < 0) {
      const scroller = scrollerOf(container);
      scroller.scrollTo({ top: scroller.scrollTop + by, behavior: "instant" });
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
      const part = k === undefined ? null : focusableIn(rowFor(k, target ?? 0));
      if (part === null) {
        focusOn(container);
      } else {
        part.focus();
      }
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
    const follow = (): void => {
      draw();
    };
    document.addEventListener(
      "scroll",
      (e) => {
        const t = e.target;
        if (t === document || (t instanceof Node && t.contains(container))) {
          draw();
        }
      },
      { ...until(signal, true), passive: true },
    );
    addEventListener("resize", follow, listen);
    window.visualViewport?.addEventListener("resize", follow, listen);
    window.visualViewport?.addEventListener("scroll", follow, listen);
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
    reveal(key) {
      const i = at.get(key);
      if (i === undefined) {
        return undefined;
      }
      draw({ also: i });
      drawn.get(key)?.scrollIntoView({ block: "nearest", behavior: "instant" });
      draw({ also: i });
      return drawn.get(key);
    },
    get length() {
      return keys.length;
    },
  };
}
