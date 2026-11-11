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
function sync(
  el: Element,
  attrs: ReadonlyMap<string, string>,
  owns: readonly string[] | "all",
): void {
  for (const name of owns === "all" ? el.getAttributeNames() : owns) {
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

function percent(share: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: share < 0.1 ? 1 : 0,
  }).format(share);
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
  // The legend says every segment's words and count, so the bar is not read.
  bar.setAttribute("aria-hidden", "true");
  const legend = document.createElement("ul");
  legend.className = "cp-share-legend";
  view.before(bar, legend);
  installTooltips(signal === undefined ? {} : { signal });

  const draw = (): void => {
    const all = shares(table);
    const total = all.reduce((sum, s) => sum + s.value, 0);
    const shown = all.filter((s) => s.value > 0);
    const locale = localeOf(share);
    place(
      bar,
      shown,
      () => "span",
      (seg, s) => {
        const tip = `${words(s.label)}: ${words(s.count)}, ${percent(s.value / total, locale)}`;
        // The tip's own aria-describedby on the segment stays.
        sync(
          seg,
          tones(
            s.row,
            new Map([
              ["data-cp-tip", tip],
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
            attrs.set("class", "cp-chip");
            sync(chip, tones(s.row, attrs), "all");
            const swatch = document.createElement("span");
            swatch.className = "cp-swatch";
            const label = [...(s.link ?? s.label).childNodes].map((n) => n.cloneNode(true));
            chip.replaceChildren(swatch, ...label, " ", s.count.cloneNode(true));
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
  const watch = new MutationObserver(draw);
  watch.observe(table, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["value", "href", ...TONES],
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
