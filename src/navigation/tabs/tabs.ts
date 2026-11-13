/**
 * tabs.ts — `enhanceTabs()` runs a `.cp-tabs` strip. A tablist is the
 * WAI-ARIA tabs pattern: the selected tab is the one Tab stop, the arrows,
 * Home and End move along the tabs, and each tab shows its own panel. A nav
 * of links keeps the current link (`aria-current="page"`) the app sets.
 * Either way it stays in view under the pill from `@cplieger/ui/pill`.
 * @module
 */

import { reducedMotion, until, whenAborted } from "../../core/lifetime/lifetime.js";
import { enhancePill } from "../../core/pill/pill.js";
import { enhanceRovingFocus } from "../../core/roving-focus/roving-focus.js";

export interface TabsOptions {
  /** `"automatic"` selects the tab focus moves to, for panels already on
   *  the page. `"manual"` moves focus only, and Enter, Space or a press
   *  selects, for a panel that loads once chosen. Default `"automatic"`.
   *  A nav's links are followed, so it has no activation. */
  readonly activation?: "automatic" | "manual";
  /** Runs when a press or a key selects another tab, with that tab's panel
   *  (null when it has none), after the panel is shown. Never on a nav. */
  readonly onSelect?: (tab: HTMLElement, panel: HTMLElement | null) => void;
  /** Removes the listeners and the pill. */
  readonly signal?: AbortSignal;
}

export interface Tabs {
  /** The selected tab or current link, or null when the strip holds none. */
  readonly selected: HTMLElement | null;
  /** Selects `tab`, shows its panel and scrolls the strip to it without
   *  `onSelect`, as when Back restores the tab the URL names. On a nav it
   *  makes that link the one `aria-current="page"`, for a router that
   *  changes the view in place. A tab outside the strip is ignored. */
  select(tab: HTMLElement): void;
}

const TAB = ':scope > [role="tab"]';
const LINK = ":scope > a";

/**
 * `list` is a `role="tablist"` whose `role="tab"` children name their
 * panels by `aria-controls`, or a `<nav>` of links. In a tablist the tab
 * marked `aria-selected="true"` starts selected, else the first, and every
 * other tab's panel is hidden. A nav keeps its current link, or none.
 */
export function enhanceTabs(list: HTMLElement, options: TabsOptions = {}): Tabs {
  const { onSelect, signal } = options;
  const manual = options.activation === "manual";
  const links = list.getAttribute("role") !== "tablist";
  const item = links ? LINK : TAB;
  const listen = until(signal);
  const root = list.getRootNode() as Document | ShadowRoot;
  const tabs = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>(item)];
  const tabOf = (t: EventTarget | null): HTMLElement | null => {
    const tab = t instanceof Element ? t.closest<HTMLElement>(links ? "a" : '[role="tab"]') : null;
    return tab?.parentElement === list ? tab : null;
  };
  const panelOf = (tab: HTMLElement): HTMLElement | null => {
    const id = tab.getAttribute("aria-controls");
    return id === null ? null : root.getElementById(id);
  };
  const selected = (): HTMLElement | null =>
    tabs().find((t) =>
      links
        ? t.getAttribute("aria-current") === "page"
        : t.getAttribute("aria-selected") === "true",
    ) ?? null;

  const show = (tab: HTMLElement): void => {
    for (const t of tabs()) {
      const on = t === tab;
      if (links) {
        if (on) {
          t.setAttribute("aria-current", "page");
        } else {
          t.removeAttribute("aria-current");
        }
        continue;
      }
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelOf(t);
      if (panel !== null) {
        panel.hidden = !on;
      }
    }
  };
  // Only the strip scrolls, never the page (as scrollIntoView would), so a
  // tab Back restores in a strip off screen leaves the page where it was.
  // Only a press or a key glides, since nothing animates on load (design.md
  // "Motion"). A tab wider than the strip shows its reading start.
  const reveal = (glide: boolean): void => {
    const tab = selected();
    // A strip with no box (in a closed dialog or a hidden panel) measures 0
    // at both edges; the observer reveals once it has a width.
    if (tab === null || list.clientWidth === 0) {
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
  const pick = (tab: HTMLElement, glide: boolean): void => {
    show(tab);
    reveal(glide);
  };
  const choose = (tab: HTMLElement): void => {
    if (tab === selected()) {
      return;
    }
    pick(tab, true);
    onSelect?.(tab, panelOf(tab));
  };

  const first = links ? undefined : (selected() ?? tabs()[0]);
  if (first !== undefined) {
    show(first);
  }
  // The strip's first box, at the start or once it is first shown, and
  // every resize after it, reveal the selected tab. Its tabs are observed
  // too: a strip held to its width keeps its size while a tab grows, as
  // when its font arrives.
  const sized = new ResizeObserver(() => {
    reveal(false);
  });
  sized.observe(list);
  for (const t of tabs()) {
    sized.observe(t);
  }
  // A router that moves aria-current itself, as after a press, gets the
  // gliding reveal a press gets.
  const current = new MutationObserver(() => {
    reveal(true);
  });
  if (links) {
    current.observe(list, { subtree: true, attributeFilter: ["aria-current"] });
  }
  whenAborted(signal, () => {
    sized.disconnect();
    current.disconnect();
  });
  enhancePill(list, signal === undefined ? {} : { signal });
  const api: Tabs = {
    get selected() {
      return selected();
    },
    select(tab) {
      if (tabOf(tab) === tab) {
        pick(tab, false);
      }
    },
  };
  // Each link is its own Tab stop and its press is followed.
  if (links) {
    return api;
  }
  enhanceRovingFocus(list, { items: TAB, ...(signal === undefined ? {} : { signal }) });

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

  return api;
}
