/**
 * share-bar.ts — `enhanceShareBar()` draws a `.cp-share`'s table as a bar of
 * the shares of a whole, each segment with its tip, and a legend of chips
 * that keep the rows' links; a Table view toggle shows the table instead.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { localeOf } from "../../core/locale/locale.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";

export interface ShareBarOptions {
  /** A button in the page, written `hidden`, that switches to the table and
   *  back by its `aria-pressed`; pressed at the start shows the table. */
  readonly toggle?: HTMLButtonElement;
  /** Removes the bar, the legend and the listeners, and shows the table. */
  readonly signal?: AbortSignal;
}

interface Share {
  readonly row: HTMLTableRowElement;
  readonly label: Element;
  readonly link: HTMLAnchorElement | null;
  readonly count: HTMLDataElement;
  readonly value: number;
}

const TONES = ["data-series", "data-tone"];

function shares(table: HTMLTableElement): Share[] {
  const out: Share[] = [];
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      const label = row.querySelector("th") ?? row.cells[0];
      const count = row.querySelector("data[value]");
      if (label === undefined || !(count instanceof HTMLDataElement) || count.value.trim() === "") {
        continue;
      }
      const value = Number(count.value);
      if (Number.isFinite(value) && value >= 0) {
        out.push({ row, label, link: label.querySelector("a[href]"), count, value });
      }
    }
  }
  return out;
}

// Children are reused by place, so a tip that shows or a chip that holds
// focus stays through an update.
function place<T>(
  parent: Element,
  items: readonly T[],
  tag: (item: T) => string,
  paint: (el: HTMLElement, item: T) => void,
): void {
  items.forEach((item, i) => {
    const old = parent.children[i];
    let el = old instanceof HTMLElement ? old : undefined;
    if (el?.localName !== tag(item)) {
      const fresh = document.createElement(tag(item));
      if (old === undefined) {
        parent.append(fresh);
      } else {
        old.replaceWith(fresh);
      }
      el = fresh;
    }
    paint(el, item);
  });
  while (parent.children.length > items.length) {
    parent.lastElementChild?.remove();
  }
}

// Only what differs is written: a link that loses its href for a moment,
// even within one task, can lose focus. `owns` names what may be removed.
function sync(el: Element, attrs: ReadonlyMap<string, string>, owns: Iterable<string>): void {
  for (const name of owns) {
    if (!attrs.has(name)) {
      el.removeAttribute(name);
    }
  }
  for (const [name, v] of attrs) {
    if (el.getAttribute(name) !== v) {
      el.setAttribute(name, v);
    }
  }
}

function tones(row: Element, into: Map<string, string>): Map<string, string> {
  for (const name of TONES) {
    const v = row.getAttribute(name);
    if (v !== null) {
      into.set(name, v);
    }
  }
  return into;
}

// A part reads as neither 0% nor the whole: one too small for the usual
// digits shows its first significant digit, and one just short of the whole
// takes the fraction digits that tell it from 100%.
function percent(share: number, locale: string | undefined): string {
  const format = (o: Intl.NumberFormatOptions, v = share) =>
    new Intl.NumberFormat(locale, { style: "percent", ...o }).format(v);
  let digits = share < 0.1 ? 1 : 0;
  let out = format({ maximumFractionDigits: digits });
  if (share > 0 && out === format({}, 0)) {
    return format({ maximumSignificantDigits: 1 });
  }
  const whole = format({}, 1);
  // 20 digits tell the largest double below 1 from it, so the loop ends.
  while (share < 1 && out === whole && digits < 20) {
    digits += 1;
    out = format({ maximumFractionDigits: digits });
  }
  return out;
}

// No copy keeps an id, so the page holds each id once, on the table's node.
function copy(node: Node): Node {
  const out = node.cloneNode(true);
  if (out instanceof Element) {
    out.removeAttribute("id");
    for (const el of out.querySelectorAll("[id]")) {
      el.removeAttribute("id");
    }
  }
  return out;
}

function words(el: Element): string {
  return el.textContent.replaceAll(/\s+/g, " ").trim();
}

/**
 * `share` holds a `<table>` whose body rows are the parts of the whole: a
 * row's first `<th>` (or first cell) is its label, a link there is where its
 * legend chip leads, its `<data value>` is its count, and its `data-series`
 * or `data-tone` is its colour. A row without a count of 0 or more is left
 * out. The bar and the legend follow every later change to the table.
 */
export function enhanceShareBar(share: HTMLElement, options: ShareBarOptions = {}): void {
  const { toggle, signal } = options;
  const table = share.querySelector("table");
  if (table === null || signal?.aborted === true) {
    return;
  }
  const view = table.closest<HTMLElement>(".cp-share > *") ?? table;
  const bar = document.createElement("div");
  bar.className = "cp-share-bar";
  // The legend says every segment's words, count and share, so the bar is not read.
  bar.setAttribute("aria-hidden", "true");
  const legend = document.createElement("ul");
  legend.className = "cp-share-legend";
  view.before(bar, legend);
  installTooltips(signal === undefined ? {} : { signal });
  // What each chip took from the last draw, the only names a redraw removes:
  // the tip writes the chip's style (its anchor) and aria-describedby.
  const written = new WeakMap<Element, readonly string[]>();

  const draw = (): void => {
    const all = shares(table);
    const total = all.reduce((sum, s) => sum + s.value, 0);
    const shown = all.filter((s) => s.value > 0);
    const locale = localeOf(share);
    const of = (s: Share): string => percent(s.value / total, locale);
    const tip = (s: Share): string => `${words(s.label)}: ${words(s.count)}, ${of(s)}`;
    place(
      bar,
      shown,
      () => "span",
      (seg, s) => {
        // The tip's own aria-describedby on the segment stays.
        sync(
          seg,
          tones(
            s.row,
            new Map([
              ["data-cp-tip", tip(s)],
              ["data-cp-tip-toggle", ""],
            ]),
          ),
          TONES,
        );
        seg.style.flexGrow = String(s.value);
      },
    );
    place(
      legend,
      all,
      () => "li",
      (item, s) => {
        place(
          item,
          [s],
          () => (s.link === null ? "span" : "a"),
          (chip) => {
            const attrs = new Map<string, string>();
            for (const name of s.link?.getAttributeNames() ?? []) {
              attrs.set(name, s.link?.getAttribute(name) ?? "");
            }
            attrs.delete("id");
            attrs.delete("style");
            attrs.set("class", "cp-chip");
            // A tap on a link chip follows it, so only a plain chip toggles.
            if (total > 0) {
              attrs.set("data-cp-tip", tip(s));
              if (s.link === null) {
                attrs.set("data-cp-tip-toggle", "");
              }
            }
            tones(s.row, attrs);
            sync(chip, attrs, written.get(chip) ?? []);
            written.set(chip, [...attrs.keys()]);
            const swatch = document.createElement("span");
            swatch.className = "cp-swatch";
            const label = [...(s.link ?? s.label).childNodes].map(copy);
            chip.replaceChildren(swatch, ...label, " ", copy(s.count));
            if (total > 0) {
              const hidden = document.createElement("span");
              hidden.className = "cp-visually-hidden";
              hidden.textContent = `, ${of(s)}`;
              chip.append(hidden);
            }
          },
        );
      },
    );
  };

  const show = (tableView: boolean): void => {
    view.hidden = !tableView;
    bar.hidden = tableView;
    legend.hidden = tableView;
    toggle?.setAttribute("aria-pressed", String(tableView));
  };

  draw();
  show(toggle?.getAttribute("aria-pressed") === "true");
  // Unfiltered, since a chip copies every attribute of its row's link; draw
  // writes only outside the table, so it never wakes itself.
  const watch = new MutationObserver(draw);
  watch.observe(table, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  if (toggle !== undefined) {
    toggle.hidden = false;
    toggle.addEventListener(
      "click",
      () => {
        show(toggle.getAttribute("aria-pressed") !== "true");
      },
      until(signal),
    );
  }
  whenAborted(signal, () => {
    watch.disconnect();
    bar.remove();
    legend.remove();
    view.hidden = false;
    if (toggle !== undefined) {
      toggle.hidden = true;
    }
  });
}
