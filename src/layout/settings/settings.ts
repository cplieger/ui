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
  /** Removes the select, the dots, the bar's height and the listeners. */
  readonly signal?: AbortSignal;
}

export interface Settings {
  /** Shows `changes`, the changed fields the form's guard lists. Pass it as
   *  the guard's `onChange`, and call it once with `guard.changes()` after
   *  making the guard. */
  readonly paint: (changes: readonly Element[]) => void;
  /** Reads the categories again, after the app added, removed or renamed
   *  one. */
  readonly update: () => void;
}

const DEFAULTS = {
  count: (n: number): string => (n === 1 ? "1 unsaved change" : `${String(n)} unsaved changes`),
  unsaved: ", unsaved changes",
  marked: (name: string): string => `${name}, unsaved changes`,
  category: "Category",
};

const ADDED = "data-cp-added";
const END = '[data-part="end"]';
// Keys that change a closed select's value on Linux and Windows; on macOS
// the arrows open its picker.
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

/** A hex digit's value, or -1 for any other byte or none. */
const hexOf = (byte: number | undefined): number => {
  if (byte === undefined) {
    return -1;
  }
  const digit = "0123456789abcdef".indexOf(String.fromCharCode(byte | 0x20));
  return byte >= 0x30 && digit !== -1 ? digit : -1;
};

/** The URL Standard's string percent-decode, then UTF-8 decode without BOM:
 *  a `%` not followed by two hex digits stays, and a bad byte becomes U+FFFD,
 *  so it never throws (https://url.spec.whatwg.org/#string-percent-decode). */
function percentDecode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const high = byte === 0x25 ? hexOf(bytes[i + 1]) : -1;
    const low = high === -1 ? -1 : hexOf(bytes[i + 2]);
    if (low === -1) {
      out.push(byte);
    } else {
      out.push(high * 16 + low);
      i += 2;
    }
  }
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(out));
}

/** The element a fragment names, found as the browser finds it: the raw
 *  id, then the percent-decoded one
 *  (https://html.spec.whatwg.org/multipage/browsing-the-web.html#find-a-potential-indicated-element). */
function byFragment(root: Document | ShadowRoot, fragment: string): Element | null {
  if (fragment === "") {
    return null;
  }
  return root.getElementById(fragment) ?? root.getElementById(percentDecode(fragment));
}

/** Whether `node` is `el` or holds it, across shadow roots. */
function holds(node: Node, el: Node): boolean {
  for (
    let at: Node | null = el;
    at !== null;
    at = at instanceof ShadowRoot ? at.host : at.parentNode
  ) {
    if (at === node) {
      return true;
    }
  }
  return false;
}

/** A pressed category's hold; see `step` in `enhanceSettings`. */
type Hold =
  | { readonly kind: "idle" }
  | {
      readonly kind: "jumping";
      readonly link: HTMLAnchorElement;
      readonly from: number;
      readonly to: number;
      readonly scroller: EventTarget | null;
    }
  | { readonly kind: "held"; readonly link: HTMLAnchorElement; readonly at: string };

type HoldEvent =
  | { readonly type: "press"; readonly link: HTMLAnchorElement }
  | { readonly type: "scroll" | "scrollend"; readonly target: EventTarget | null }
  | { readonly type: "input" | "update" };

const IDLE: Hold = { kind: "idle" };

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

  // The category a key chose, waiting for Enter (see the select's listeners
  // below).
  let keyed = false;
  let choice: HTMLAnchorElement | null = null;
  const sync = (): void => {
    const at = links.findIndex(isCurrent);
    select.selectedIndex = at === -1 ? 0 : at;
  };
  const fillSelect = (): void => {
    select.replaceChildren(
      ...links.map((link) => {
        const name = nameOf(link);
        return new Option(changed.has(link) ? words.marked(name) : name);
      }),
    );
    const at = choice === null ? -1 : links.indexOf(choice);
    if (at === -1) {
      choice = null;
      sync();
    } else {
      select.selectedIndex = at;
    }
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

  // A link the app marks "page" means its router shows one section at a
  // time and owns which is current.
  const routed = (): boolean => links.some((l) => l.getAttribute("aria-current") === "page");
  const setCurrent = (link: HTMLAnchorElement): void => {
    if (routed()) {
      return;
    }
    for (const other of targets.keys()) {
      if (other === link) {
        other.setAttribute("aria-current", "location");
      } else if (other.getAttribute("aria-current") === "location") {
        other.removeAttribute("aria-current");
      }
    }
  };
  const seen = new Set<Element>();
  const markInView = (): void => {
    const first = [...targets].find(([, t]) => seen.has(t));
    if (first !== undefined) {
      setCurrent(first[0]);
    }
  };

  // A pressed link stays current until the page scrolls after the press's
  // own jump, so a last section too short to reach the band still reads as
  // current. Every event goes through `step`; `release` is the only way back
  // to idle. While `jumping`, the first scroller seen moving the section
  // toward its place is the jump's, and only its `scrollend` ends the jump
  // (Firefox jumps a frame after the click, a smooth scroll glides); a jump
  // nothing has moved yet ends at the next input. Then `held` keeps the
  // section's place on screen until a scroll moves it.
  let hold: Hold = IDLE;
  const placeOf = (link: HTMLAnchorElement): string => {
    const box = targets.get(link)?.getBoundingClientRect();
    return box === undefined ? "" : `${String(box.left)} ${String(box.top)}`;
  };
  const release = (): void => {
    hold = IDLE;
    markInView();
  };
  const settle = (link: HTMLAnchorElement): void => {
    hold = { kind: "held", link, at: placeOf(link) };
  };
  // `from` is the section's top at the press and `to` where the jump brings
  // it. A scroll that moves the section away from `to` or past it is the
  // person's, as after a press at the page's end, which moves nothing.
  const jumped = (jump: Extract<Hold, { kind: "jumping" }>, scroller: EventTarget | null): void => {
    const section = targets.get(jump.link);
    if (section === undefined || !(scroller instanceof Node) || !holds(scroller, section)) {
      return;
    }
    const top = section.getBoundingClientRect().top;
    if (top === jump.from) {
      return;
    }
    const away = Math.sign(top - jump.from) !== Math.sign(jump.to - jump.from);
    if (away || Math.abs(top - jump.from) > Math.abs(jump.to - jump.from) + 1) {
      release();
    } else if (jump.scroller === null) {
      hold = { ...jump, scroller };
    }
  };
  const step = (e: HoldEvent): void => {
    if (e.type === "press") {
      const target = targets.get(e.link);
      const from = target?.getBoundingClientRect().top ?? 0;
      // scroll-padding computes to "auto" when unset.
      const to =
        target === undefined
          ? from
          : (parseFloat(getComputedStyle(target).scrollMarginTop) || 0) +
            (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
      hold = { kind: "jumping", link: e.link, from, to, scroller: null };
      setCurrent(e.link);
      return;
    }
    if (hold.kind === "idle") {
      return;
    }
    const { link } = hold;
    switch (e.type) {
      case "update": {
        // The app may have rebuilt the links: the hold moves to the one with
        // the same address, whose section is the same.
        const same = links.find((l) => l.href === link.href && targets.has(l));
        if (same === undefined) {
          release();
        } else {
          hold = { ...hold, link: same };
          setCurrent(same);
        }
        return;
      }
      case "input":
        if (hold.kind === "jumping" && hold.scroller === null) {
          settle(link);
        }
        return;
      case "scrollend":
        if (hold.kind === "jumping" && hold.scroller === e.target) {
          settle(link);
        }
        return;
      case "scroll":
        if (hold.kind === "jumping") {
          jumped(hold, e.target);
        } else if (placeOf(link) !== hold.at) {
          release();
        }
        return;
    }
  };
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          seen.add(e.target);
        } else {
          seen.delete(e.target);
        }
      }
      if (hold.kind === "idle") {
        markInView();
      }
    },
    { rootMargin: "-20% 0px -60% 0px" },
  );
  const early = { ...until(signal, true), passive: true };
  // A box's scroll does not bubble, and one inside a shadow root stops there.
  for (const at of root instanceof ShadowRoot ? [window, root] : [window]) {
    for (const type of ["scroll", "scrollend"] as const) {
      at.addEventListener(
        type,
        (e) => {
          step({ type, target: e.target });
        },
        early,
      );
    }
  }
  for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) {
    addEventListener(
      type,
      () => {
        step({ type: "input" });
      },
      early,
    );
  }
  nav.addEventListener(
    "click",
    (e) => {
      // A modified or non-primary press opens the link elsewhere, and this
      // page stays where it was.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (link !== null && targets.has(link)) {
        step({ type: "press", link });
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
      const target = url.href === here.href ? byFragment(root, link.hash.slice(1)) : null;
      if (target !== null) {
        targets.set(link, target);
        spy.observe(target);
      }
    }
    if (links.length === 0) {
      field.remove();
    } else if (field.parentNode !== nav) {
      // Moving the select again would blur it under the person's keys.
      nav.append(field);
    }
    step({ type: "update" });
    paint(last);
  };

  const go = (link: HTMLAnchorElement | null | undefined): void => {
    link?.click();
    sync();
  };
  // A closed select's arrow and letter keys change its value at each press
  // in Firefox and in Chromium on Linux and Windows; moving to a category
  // then would change the page under the person's keys (WCAG 3.2.2), so the
  // choice waits for Enter, and Escape or leaving the select puts the current
  // back. That change fires inside the key's own task, a letter's inside its
  // keypress, which Chromium sends as a later task, so both arm the hold; a
  // picker's commit comes in a later one and moves at once. A repaint keeps
  // the waiting choice.
  const arm = (): void => {
    keyed = true;
    setTimeout(() => {
      keyed = false;
    });
  };
  const typed = (e: KeyboardEvent): boolean =>
    e.key.length === 1 && e.key !== " " && !e.altKey && !e.ctrlKey && !e.metaKey;
  select.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && choice !== null) {
        // Chromium on Linux and Windows would also open the picker.
        e.preventDefault();
        const link = choice;
        choice = null;
        go(link);
      } else if (e.key === "Escape" && choice !== null) {
        choice = null;
        sync();
      }
      keyed = false;
      if (typed(e) || (!e.altKey && MOVES.has(e.key))) {
        arm();
      }
    },
    listen,
  );
  select.addEventListener(
    "keypress",
    (e) => {
      if (typed(e)) {
        arm();
      }
    },
    listen,
  );
  select.addEventListener(
    "change",
    () => {
      const link = links[select.selectedIndex];
      if (keyed) {
        choice = link ?? null;
      } else {
        go(link);
      }
    },
    listen,
  );
  select.addEventListener(
    "blur",
    () => {
      if (choice !== null) {
        choice = null;
        sync();
      }
    },
    listen,
  );

  const currents = new MutationObserver(() => {
    if (choice === null) {
      sync();
    }
  });
  currents.observe(nav, { subtree: true, attributeFilter: ["aria-current"] });
  const rest = new MutationObserver(paintBar);
  const size = new ResizeObserver(([entry]) => {
    const height = entry?.borderBoxSize[0]?.blockSize ?? 0;
    if (height > 0) {
      form.style.setProperty("--cp-savebar-size", `${String(height)}px`);
    }
  });
  whenAborted(signal, () => {
    spy.disconnect();
    currents.disconnect();
    rest.disconnect();
    size.disconnect();
    form.style.removeProperty("--cp-savebar-size");
    for (const link of links) {
      mark(link, false);
    }
    field.remove();
  });
  if (signal?.aborted !== true) {
    if (bar !== null) {
      rest.observe(bar, { subtree: true, attributeFilter: ["data-cp-state"] });
      size.observe(bar);
    }
    read();
  }

  return { paint, update: read };
}
