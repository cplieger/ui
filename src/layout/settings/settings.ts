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

/** The element `el` lays out in: its slot when slotted, a shadow root's host. */
function parentBox(el: Element): Element | null {
  const up = el.assignedSlot ?? el.parentNode;
  return up instanceof ShadowRoot ? up.host : up instanceof Element ? up : null;
}

/** `scroll-padding-top` at its used length. Engines return a percentage
 *  unresolved, alone or inside calc(), min() or max(), so such a value is
 *  measured as the height of a box in a block as tall as the scrollport,
 *  its basis (https://drafts.csswg.org/css-scroll-snap-1/#scroll-padding). */
function paddingTop(styled: Element, port: number): number {
  const value = getComputedStyle(styled).scrollPaddingTop;
  if (value === "auto") {
    return 0;
  }
  if (/^[\d.]+px$/.test(value)) {
    return parseFloat(value);
  }
  const block = document.createElement("div");
  const probe = document.createElement("div");
  // The page's own rules must not pad or bound either box.
  block.style.all = "initial";
  block.style.position = "fixed";
  block.style.visibility = "hidden";
  block.style.blockSize = `${String(port)}px`;
  probe.style.all = "initial";
  probe.style.display = "block";
  probe.style.blockSize = value;
  block.append(probe);
  document.documentElement.append(block);
  const used = probe.getBoundingClientRect().height;
  block.remove();
  return used;
}

/** A scroller a fragment jump moves: its offset at the press and the
 *  offset the jump takes it to. */
interface Leg {
  readonly box: Element;
  readonly from: number;
  readonly to: number;
}

/** Where a fragment jump to `section` takes each scroller holding it, keyed
 *  by its scroll events' target, as "scroll a target into view" does:
 *  innermost first, each so the section's scroll-margin edge sits at its
 *  port's top plus its scroll-padding-top, within its range
 *  (https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view). Past a
 *  fixed box the viewport is left out, since its scroll does not move it. */
function plan(section: Element): Map<EventTarget, Leg> {
  const legs = new Map<EventTarget, Leg>();
  let top =
    section.getBoundingClientRect().top -
    (parseFloat(getComputedStyle(section).scrollMarginTop) || 0);
  const take = (key: EventTarget, box: Element, styled: Element, portTop: number): void => {
    const from = box.scrollTop;
    const want = from + top - portTop - paddingTop(styled, box.clientHeight);
    const to = Math.max(0, Math.min(want, box.scrollHeight - box.clientHeight));
    legs.set(key, { box, from, to });
    top -= to - from;
  };
  const html = document.documentElement;
  // The body's overflow is the viewport's while the root's is visible.
  const bodyScrolls = getComputedStyle(html).overflowY !== "visible";
  for (let at: Element | null = section; at !== null && at !== html; at = parentBox(at)) {
    const { overflowY, position } = getComputedStyle(at);
    if (
      at !== section &&
      overflowY !== "visible" &&
      overflowY !== "clip" &&
      (at !== document.body || bodyScrolls)
    ) {
      take(at, at, at, at.getBoundingClientRect().top + at.clientTop);
    }
    if (position === "fixed") {
      return legs;
    }
  }
  take(document, document.scrollingElement ?? html, html, 0);
  return legs;
}

/** A pressed category's hold; see `step` in `enhanceSettings`. */
type Hold =
  | { readonly kind: "idle" }
  | {
      readonly kind: "jumping";
      readonly link: HTMLAnchorElement;
      readonly legs: ReadonlyMap<EventTarget, Leg>;
      /** The scrollers seen moving since the press. */
      readonly moved: ReadonlySet<EventTarget>;
      /** The scrollers the jump moves that have not landed yet. */
      readonly left: ReadonlySet<EventTarget>;
    }
  | { readonly kind: "held"; readonly link: HTMLAnchorElement; readonly at: string };

type HoldEvent =
  | { readonly type: "press"; readonly link: HTMLAnchorElement }
  | { readonly type: "scroll" | "scrollend"; readonly target: EventTarget | null }
  | { readonly type: "update" };

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
  // to idle. The press plans the jump (`plan`); each scroller's `scrollend`
  // at its planned offset lands it, and the last lands the jump in `held`
  // (Firefox jumps a frame after the click, a smooth scroll glides). A
  // scroller off its course, or stopped short, releases. A jump that moves
  // nothing is held at once; `held` releases once the section moves.
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
  const press = (link: HTMLAnchorElement, section: Element): void => {
    const legs = plan(section);
    const left = new Set<EventTarget>();
    for (const [key, leg] of legs) {
      if (Math.abs(leg.to - leg.from) > 1) {
        left.add(key);
      } else {
        legs.set(key, { ...leg, to: leg.from });
      }
    }
    setCurrent(link);
    if (left.size === 0) {
      settle(link);
    } else {
      hold = { kind: "jumping", link, legs, moved: new Set(), left };
    }
  };
  const step = (e: HoldEvent): void => {
    if (e.type === "press") {
      const section = targets.get(e.link);
      if (section !== undefined) {
        press(e.link, section);
      }
      return;
    }
    if (hold.kind === "idle") {
      return;
    }
    const { link } = hold;
    if (e.type === "update") {
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
    if (hold.kind === "held") {
      if (e.type === "scroll" && placeOf(link) !== hold.at) {
        release();
      }
      return;
    }
    const at = e.target;
    const leg = at === null ? undefined : hold.legs.get(at);
    // A scroller the jump does not move, a box inside the section, leaves it.
    if (at === null || leg === undefined) {
      return;
    }
    const y = leg.box.scrollTop;
    // On its way a scroller stays between its two offsets, within the 1px a
    // planned offset may differ from the browser's; once still, on its own.
    const onCourse = hold.left.has(at)
      ? y >= Math.min(leg.from, leg.to) - 1 && y <= Math.max(leg.from, leg.to) + 1
      : y === leg.to;
    if (!onCourse) {
      release();
    } else if (e.type === "scroll") {
      if (y !== leg.from && !hold.moved.has(at)) {
        hold = { ...hold, moved: new Set([...hold.moved, at]) };
      }
    } else if (hold.moved.has(at) && hold.left.has(at)) {
      if (Math.abs(y - leg.to) > 1) {
        release();
        return;
      }
      const left = new Set(hold.left);
      left.delete(at);
      const legs = new Map(hold.legs).set(at, { ...leg, to: y });
      if (left.size === 0) {
        settle(link);
      } else {
        hold = { ...hold, legs, left };
      }
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
