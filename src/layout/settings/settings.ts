/**
 * settings.ts — `enhanceSettings()` paints what a settings form's
 * unsaved-changes guard reports: the save bar and its count, a dot on each
 * category holding a change, and a category select it makes for a narrow
 * screen. On a page of sections it also marks the category in view.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";

export interface SettingsWords {
  /** The save bar's count. Default "1 unsaved change", "3 unsaved changes". */
  readonly count?: (n: number) => string;
  /** Read after a changed category's name in the list. Default
   *  ", unsaved changes". */
  readonly unsaved?: string;
  /** A changed category's option in the select. Default
   *  "{name}, unsaved changes". */
  readonly marked?: (name: string) => string;
  /** The select's label. Default "Category". */
  readonly category?: string;
}

export interface SettingsOptions {
  /** The categories: a `.cp-list` of `a.cp-list-row` links. Default: the
   *  `.cp-settings-nav` of the form's `.cp-settings`. */
  readonly nav?: HTMLElement | null;
  /** The `.cp-savebar` with its `[data-part="count"]`. Default: the form's. */
  readonly bar?: HTMLElement | null;
  readonly words?: SettingsWords;
  /** Removes the select, the dots and the listeners. */
  readonly signal?: AbortSignal;
}

export interface Settings {
  /** Shows `changes`, the changed fields the form's guard lists. Pass it as
   *  the guard's `onChange`, and call it once with `guard.changes()` after
   *  making the guard. */
  paint(changes: readonly Element[]): void;
  /** Reads the categories again, after the app added, removed or renamed
   *  one. */
  update(): void;
}

const DEFAULTS = {
  count: (n: number): string => (n === 1 ? "1 unsaved change" : `${String(n)} unsaved changes`),
  unsaved: ", unsaved changes",
  marked: (name: string): string => `${name}, unsaved changes`,
  category: "Category",
};

const ADDED = "data-cp-added";
const END = '[data-part="end"]';
// Keys that move a closed select's value without opening it.
const MOVES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);
let seq = 0;

const isCurrent = (link: Element): boolean => {
  const v = link.getAttribute("aria-current");
  return v !== null && v !== "false";
};

/** The link's words without its end part or the words read after them. */
function nameOf(link: HTMLAnchorElement): string {
  let text = "";
  for (const node of link.childNodes) {
    if (!(node instanceof Element && node.matches(`${END}, .cp-visually-hidden`))) {
      text += node.textContent ?? "";
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A category owns the fields inside the element its link's fragment names
 * (a page of sections); a form with no such element belongs to the link
 * with `aria-current="page"` (one category per route). Throws a TypeError
 * when no nav is given or found.
 */
export function enhanceSettings(form: HTMLFormElement, options: SettingsOptions = {}): Settings {
  const nav =
    options.nav ?? form.closest(".cp-settings")?.querySelector<HTMLElement>(".cp-settings-nav");
  if (nav === null || nav === undefined) {
    throw new TypeError("enhanceSettings: no .cp-settings-nav");
  }
  const bar = options.bar ?? form.querySelector<HTMLElement>(".cp-savebar");
  const { signal } = options;
  const words = { ...DEFAULTS, ...options.words };
  const listen = until(signal);
  const root = form.getRootNode() as Document | ShadowRoot;

  let links: HTMLAnchorElement[] = [];
  let targets = new Map<HTMLAnchorElement, Element>();
  let last: readonly Element[] = [];
  let changed = new Set<HTMLAnchorElement>();
  // Paints in the task that enhanced the page are its first paint, which
  // does not animate.
  let still = true;
  setTimeout(() => {
    still = false;
  });

  const madeEnds = new WeakSet<Element>();
  const dotOf = (link: HTMLAnchorElement): Element | null =>
    link.querySelector(`:scope > ${END} > .cp-dot`);
  const mark = (link: HTMLAnchorElement, on: boolean): void => {
    const dot = dotOf(link);
    if (on && dot === null) {
      let end = link.querySelector(`:scope > ${END}`);
      if (end === null) {
        end = document.createElement("span");
        end.setAttribute("data-part", "end");
        madeEnds.add(end);
        link.append(end);
      }
      const made = document.createElement("span");
      made.className = "cp-dot";
      made.setAttribute("data-tone", "accent");
      made.setAttribute("aria-hidden", "true");
      if (!still) {
        made.setAttribute(ADDED, "");
      }
      const said = document.createElement("span");
      said.className = "cp-visually-hidden";
      said.textContent = words.unsaved;
      end.append(made, said);
    } else if (!on && dot !== null) {
      const end = dot.parentElement;
      if (dot.nextElementSibling?.matches(".cp-visually-hidden") === true) {
        dot.nextElementSibling.remove();
      }
      dot.remove();
      if (end !== null && madeEnds.has(end) && end.childNodes.length === 0) {
        end.remove();
      }
    }
  };

  const field = document.createElement("div");
  field.className = "cp-field";
  const label = document.createElement("label");
  label.className = "cp-label";
  label.htmlFor = `cp-settings-${String(++seq)}`;
  label.textContent = words.category;
  const box = document.createElement("div");
  box.className = "cp-select";
  const select = document.createElement("select");
  select.className = "cp-input";
  select.id = label.htmlFor;
  box.append(select);
  field.append(label, box);

  const sync = (): void => {
    const at = links.findIndex(isCurrent);
    select.selectedIndex = at === -1 ? 0 : at;
  };
  const fillSelect = (): void => {
    const options = links.map((link) => {
      const name = nameOf(link);
      return new Option(changed.has(link) ? words.marked(name) : name);
    });
    select.replaceChildren(...options);
    sync();
  };

  const ownerOf = (el: Element): HTMLAnchorElement | undefined => {
    for (const [link, target] of targets) {
      if (target.contains(el)) {
        return link;
      }
    }
    return links.find((link) => link.getAttribute("aria-current") === "page");
  };

  const playing = (): boolean =>
    bar !== null && bar.querySelector("button[data-cp-state]") !== null;
  const paintBar = (): void => {
    if (bar === null) {
      return;
    }
    const n = last.length;
    // While Save changes plays its busy and done words the bar stays; it
    // recounts once the button is back at rest.
    bar.hidden = n === 0 && !playing();
    const count = bar.querySelector(`[data-part="count"]`);
    if (count !== null && n > 0) {
      count.textContent = words.count(n);
    }
  };

  const paint = (changes: readonly Element[]): void => {
    last = changes;
    changed = new Set();
    for (const el of changes) {
      const link = ownerOf(el);
      if (link !== undefined) {
        changed.add(link);
      }
    }
    for (const link of links) {
      mark(link, changed.has(link));
    }
    fillSelect();
    paintBar();
  };

  // A held link stays current until the person scrolls on their own, so a
  // last section too short to reach the band still reads as current after
  // its link is pressed.
  let held: HTMLAnchorElement | null = null;
  const setCurrent = (link: HTMLAnchorElement): void => {
    for (const other of targets.keys()) {
      if (other === link) {
        other.setAttribute("aria-current", "location");
      } else {
        other.removeAttribute("aria-current");
      }
    }
  };
  const seen = new Set<Element>();
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          seen.add(e.target);
        } else {
          seen.delete(e.target);
        }
      }
      if (held !== null) {
        return;
      }
      const first = [...targets].find(([, t]) => seen.has(t));
      if (first !== undefined) {
        setCurrent(first[0]);
      }
    },
    { rootMargin: "-20% 0px -60% 0px" },
  );
  const release = (e: Event): void => {
    if (!(e.target instanceof Node && nav.contains(e.target))) {
      held = null;
    }
  };
  for (const type of ["wheel", "touchmove", "keydown"]) {
    addEventListener(type, release, { ...listen, passive: true });
  }
  nav.addEventListener(
    "click",
    (e) => {
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (link !== null && targets.has(link)) {
        held = link;
        setCurrent(link);
      }
    },
    listen,
  );

  const read = (): void => {
    links = [...nav.querySelectorAll<HTMLAnchorElement>(".cp-list a.cp-list-row[href]")];
    targets = new Map();
    spy.disconnect();
    seen.clear();
    for (const link of links) {
      const url = new URL(link.href, location.href);
      const here = new URL(location.href);
      url.hash = "";
      here.hash = "";
      const id = decodeURIComponent(link.hash.slice(1));
      const target = id === "" || url.href !== here.href ? null : root.getElementById(id);
      if (target !== null) {
        targets.set(link, target);
        spy.observe(target);
      }
    }
    if (links.length > 0) {
      nav.append(field);
    } else {
      field.remove();
    }
    paint(last);
  };

  const go = (): void => {
    links[select.selectedIndex]?.click();
    sync();
  };
  // A closed select's arrow and letter keys change its value at each press
  // in Firefox and in Chromium on Windows; moving to a category then would
  // change the page under the person's keys (WCAG 3.2.2), so the choice
  // waits for Enter, and Escape or leaving the select puts the current back.
  let keyed = false;
  let waiting = false;
  select.addEventListener(
    "pointerdown",
    () => {
      keyed = false;
    },
    listen,
  );
  select.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && waiting) {
        waiting = false;
        go();
      } else if (e.key === "Escape" && waiting) {
        waiting = false;
        sync();
      }
      keyed = !e.altKey && (MOVES.has(e.key) || (e.key.length === 1 && e.key !== " "));
    },
    listen,
  );
  select.addEventListener(
    "change",
    () => {
      if (keyed) {
        waiting = true;
      } else {
        go();
      }
    },
    listen,
  );
  select.addEventListener(
    "blur",
    () => {
      if (waiting) {
        waiting = false;
        sync();
      }
    },
    listen,
  );

  const currents = new MutationObserver(sync);
  currents.observe(nav, { subtree: true, attributeFilter: ["aria-current"] });
  const rest = new MutationObserver(paintBar);
  if (bar !== null) {
    rest.observe(bar, { subtree: true, attributeFilter: ["data-cp-state"] });
  }

  read();
  whenAborted(signal, () => {
    spy.disconnect();
    currents.disconnect();
    rest.disconnect();
    for (const link of links) {
      mark(link, false);
    }
    field.remove();
  });

  return { paint, update: read };
}
