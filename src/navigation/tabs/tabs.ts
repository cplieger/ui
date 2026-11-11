/**
 * tabs.ts — `enhanceTabs()` runs a `.cp-tabs` tablist as the WAI-ARIA tabs
 * pattern: the selected tab is the one Tab stop, the arrows, Home and End
 * move along the tabs, each tab shows its own panel, and the pill from
 * `@cplieger/ui/pill` slides under the selected tab.
 * @module
 */

import { reducedMotion, until, whenAborted } from "../../core/lifetime/lifetime.js";
import { enhancePill } from "../../core/pill/pill.js";
import { enhanceRovingFocus } from "../../core/roving-focus/roving-focus.js";

export interface TabsOptions {
  /** `"automatic"` selects the tab focus moves to, for panels already on
   *  the page. `"manual"` moves focus only, and Enter, Space or a press
   *  selects, for a panel that loads once chosen. Default `"automatic"`. */
  readonly activation?: "automatic" | "manual";
  /** Runs when a press or a key selects another tab, with that tab's panel
   *  (null when it has none), after the panel is shown. */
  readonly onSelect?: (tab: HTMLElement, panel: HTMLElement | null) => void;
  /** Removes the listeners and the pill. */
  readonly signal?: AbortSignal;
}

export interface Tabs {
  /** The selected tab, or null when the list holds none. */
  readonly selected: HTMLElement | null;
  /** Selects `tab`, shows its panel and scrolls the strip to it without
   *  `onSelect`, as when Back restores the tab the URL names. A tab outside
   *  the list is ignored. */
  select(tab: HTMLElement): void;
}

const TAB = ':scope > [role="tab"]';

/**
 * `list` is a `role="tablist"` whose `role="tab"` children name their
 * panels by `aria-controls`. The tab marked `aria-selected="true"` starts
 * selected, else the first; every other tab's panel is hidden.
 */
export function enhanceTabs(list: HTMLElement, options: TabsOptions = {}): Tabs {
  const { onSelect, signal } = options;
  const manual = options.activation === "manual";
  const listen = until(signal);
  const root = list.getRootNode() as Document | ShadowRoot;
  const tabs = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>(TAB)];
  const tabOf = (t: EventTarget | null): HTMLElement | null => {
    const tab = t instanceof Element ? t.closest<HTMLElement>('[role="tab"]') : null;
    return tab?.parentElement === list ? tab : null;
  };
  const panelOf = (tab: HTMLElement): HTMLElement | null => {
    const id = tab.getAttribute("aria-controls");
    return id === null ? null : root.getElementById(id);
  };
  const selected = (): HTMLElement | null =>
    tabs().find((t) => t.getAttribute("aria-selected") === "true") ?? null;

  const show = (tab: HTMLElement): void => {
    for (const t of tabs()) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelOf(t);
      if (panel !== null) {
        panel.hidden = !on;
      }
    }
  };
  let unseen: ResizeObserver | null = null;
  whenAborted(signal, () => unseen?.disconnect());
  // Only the strip scrolls, never the page (as scrollIntoView would), so a
  // tab Back restores in a strip off screen leaves the page where it was.
  // A restore or the start scrolls at once, since nothing animates on load
  // (design.md "Motion"). A tab wider than the strip shows its reading start.
  const reveal = (tab: HTMLElement, glide: boolean): void => {
    if (list.clientWidth === 0) {
      // A strip with no box (in a closed dialog or a hidden panel) measures
      // 0 at both edges, so the reveal waits until it first has a width.
      if (unseen === null && signal?.aborted !== true) {
        const watch = new ResizeObserver(() => {
          const now = selected();
          if (list.clientWidth > 0 && now !== null) {
            watch.disconnect();
            unseen = null;
            reveal(now, false);
          }
        });
        unseen = watch;
        watch.observe(list);
      }
      return;
    }
    const left = list.getBoundingClientRect().left + list.clientLeft;
    const right = left + list.clientWidth;
    const box = tab.getBoundingClientRect();
    const past = box.right - right;
    const before = box.left - left;
    let dx: number;
    if (list.matches(":dir(rtl)")) {
      dx = past > 0 ? past : Math.min(0, Math.max(before, past));
    } else {
      dx = before < 0 ? before : Math.max(0, Math.min(past, before));
    }
    if (dx !== 0) {
      list.scrollBy({ left: dx, behavior: glide && !reducedMotion() ? "smooth" : "auto" });
    }
  };
  const choose = (tab: HTMLElement): void => {
    if (tab === selected()) {
      return;
    }
    show(tab);
    reveal(tab, true);
    onSelect?.(tab, panelOf(tab));
  };

  const first = selected() ?? tabs()[0];
  if (first !== undefined) {
    show(first);
    reveal(first, false);
  }
  enhanceRovingFocus(list, { items: TAB, ...(signal === undefined ? {} : { signal }) });
  enhancePill(list, signal === undefined ? {} : { signal });

  list.addEventListener(
    "click",
    (e) => {
      const tab = tabOf(e.target);
      if (tab !== null) {
        choose(tab);
      }
    },
    listen,
  );
  if (!manual) {
    list.addEventListener(
      "focusin",
      (e) => {
        const tab = tabOf(e.target);
        if (tab !== null) {
          choose(tab);
        }
      },
      listen,
    );
  }
  // Focus that comes back to the list lands on the selected tab, not on the
  // one last arrowed to (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
  list.addEventListener(
    "focusout",
    (e) => {
      const to = e.relatedTarget;
      const tab = selected();
      if (tab !== null && !(to instanceof Node && list.contains(to))) {
        for (const t of tabs()) {
          t.tabIndex = t === tab ? 0 : -1;
        }
      }
    },
    listen,
  );

  return {
    get selected() {
      return selected();
    },
    select(tab) {
      if (tabOf(tab) === tab) {
        show(tab);
        reveal(tab, false);
      }
    },
  };
}
