/**
 * menu.ts — the WAI-ARIA menu button over a native popover
 * (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). Every button whose
 * `popovertarget` or `commandfor` names the `role="menu"` popover opens it,
 * and an automatic popover closes on Escape and on a press outside by
 * itself, returning focus to the button. `enhanceMenu()` adds what the
 * platform lacks: one call for every button that opens the menu, the menu
 * placed by the one pressed, focus on the first item as it opens, the arrow
 * keys, Home, End and typeahead among the items, check and radio items that
 * keep it open, closing once an item is chosen, and the Escape and outside
 * press a `popover="manual"` menu lacks. `enhanceContextMenu()` opens one at
 * the pointer instead, and one manual menu can take both.
 * @module
 */

import { anchorTo, showPopoverAt } from "../anchor/anchor.js";
import { shared, until } from "../../core/lifetime/lifetime.js";

export interface MenuOptions {
  /** The person chose an item: a `menuitem` after the menu closed, a
   *  `menuitemcheckbox` or `menuitemradio` after its `aria-checked` changed,
   *  with the menu still open. */
  readonly onSelect?: (item: HTMLElement) => void;
  /** Ends the enhancement: removes its listeners and ARIA, and closes the
   *  menu if this enhancement opened it. */
  readonly signal?: AbortSignal;
}

const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
/** Typed characters within this long of each other make one search. */
const TYPEAHEAD_MS = 500;
let seq = 0;

const disabled = (item: Element): boolean => item.getAttribute("aria-disabled") === "true";

function ensureId(el: HTMLElement): string {
  if (el.id === "") {
    el.id = `cp-menu-${String(++seq)}`;
  }
  return el.id;
}

function hide(menu: HTMLElement): void {
  if (menu.matches(":popover-open")) {
    menu.hidePopover();
  }
}

const itemsOf = (menu: HTMLElement): HTMLElement[] =>
  [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hidden);

/** One enhancement of a menu: how it closes, who hears a choice, and what
 *  it gives up when another enhancement opens the menu. */
interface Owner {
  readonly close: () => void;
  readonly onSelect: ((item: HTMLElement) => void) | undefined;
  /** Whether a press on `node` belongs to this opening, as its opener does. */
  readonly holds: (node: Node) => boolean;
  readonly release: () => void;
}

// A row menu that a ⋯ button and a right click both open is enhanced twice
// but has one set of item listeners, so a key moves once and a check
// toggles once; the enhancement that opened it last closes it and hears
// the choice.
const owners = new WeakMap<HTMLElement, Owner>();
const wirings = new WeakMap<HTMLElement, ReturnType<typeof shared>>();

function own(menu: HTMLElement, owner: Owner): void {
  const was = owners.get(menu);
  if (was !== owner) {
    was?.release();
    owners.set(menu, owner);
  }
}

/** Keys, typeahead, choosing, and the dismissal a manual popover lacks. */
function listenItems(menu: HTMLElement, signal: AbortSignal): void {
  const listen = { signal };
  const capture = { capture: true, signal };
  const close = (): void => {
    const o = owners.get(menu);
    if (o === undefined) {
      hide(menu);
    } else {
      o.close();
    }
  };
  let typed = "";
  let typedAt = -Infinity;

  menu.addEventListener(
    "keydown",
    (e) => {
      const list = itemsOf(menu);
      const active = e.composedPath()[0];
      const at = list.findIndex((i) => i === active);
      const go = (i: number): void => {
        list[(i + list.length) % list.length]?.focus();
      };
      if (e.key === "ArrowDown") {
        go(at + 1);
      } else if (e.key === "ArrowUp") {
        go(at < 0 ? -1 : at - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(-1);
      } else if (e.key === "Tab") {
        close();
        return;
      } else if (e.key === "Escape" && menu.popover === "auto") {
        close();
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        typed = e.timeStamp - typedAt < TYPEAHEAD_MS ? typed + k : k;
        typedAt = e.timeStamp;
        // One letter, or the same letter again, steps to the next item it
        // starts; a longer word keeps the current item while it still matches.
        const cycling = typed === k.repeat(typed.length / k.length);
        const word = cycling ? k : typed;
        const from = cycling ? at + 1 : Math.max(at, 0);
        const next = [...list.slice(from), ...list.slice(0, from)].find((i) =>
          i.textContent.trim().toLowerCase().startsWith(word),
        );
        next?.focus();
      } else {
        return;
      }
      e.preventDefault();
    },
    listen,
  );

  menu.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      const item = t instanceof Element ? t.closest<HTMLElement>(ITEM) : null;
      if (item === null || !menu.contains(item)) {
        return;
      }
      if (disabled(item)) {
        e.preventDefault();
        return;
      }
      const onSelect = owners.get(menu)?.onSelect;
      const role = item.getAttribute("role");
      if (role === "menuitemcheckbox") {
        item.setAttribute("aria-checked", String(item.getAttribute("aria-checked") !== "true"));
        onSelect?.(item);
        return;
      }
      if (role === "menuitemradio") {
        const group = item.closest('[role="group"]') ?? menu;
        for (const r of group.querySelectorAll('[role="menuitemradio"]')) {
          r.setAttribute("aria-checked", String(r === item));
        }
        onSelect?.(item);
        return;
      }
      close();
      onSelect?.(item);
    },
    listen,
  );

  // An auto popover closes itself on Escape and on a press outside; a
  // manual one, as a context menu must be, gets both here. Armed now, never
  // on a timer: a busy page starves timers, and a menu whose dismissal waits
  // behind them ignores Escape.
  const manualOpen = (): boolean => menu.popover === "manual" && menu.matches(":popover-open");
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.composedPath()[0];
      if (
        manualOpen() &&
        t instanceof Node &&
        !menu.contains(t) &&
        owners.get(menu)?.holds(t) !== true
      ) {
        close();
      }
    },
    capture,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && manualOpen()) {
        e.preventDefault();
        close();
      }
    },
    capture,
  );
}

/** Starts `menu`'s one set of item listeners, held until every
 *  enhancement's signal has aborted; `owner` answers for it until another
 *  enhancement opens it, unless one already does. */
function wireItems(menu: HTMLElement, owner: Owner, signal: AbortSignal | undefined): void {
  let wiring = wirings.get(menu);
  if (wiring === undefined) {
    wiring = shared((s) => {
      listenItems(menu, s);
    });
    wirings.set(menu, wiring);
  }
  wiring.install(signal === undefined ? {} : { signal });
  if (!owners.has(menu)) {
    owners.set(menu, owner);
  }
}

/** Ends `owner`'s hold on `menu`, closing it if `owner` opened it. */
function disown(menu: HTMLElement, owner: Owner): void {
  if (owners.get(menu) === owner) {
    owners.delete(menu);
    hide(menu);
  }
}

/**
 * Enhances the `role="menu"` popover `menu` once, however many buttons open
 * it: every element whose `popovertarget` or `commandfor` names it is an
 * opener, rows added later included, so one menu can serve every row of a
 * list, and the menu sits by the opener pressed. Items are read at each key,
 * so items the host adds or removes need no call. An item with
 * `aria-disabled="true"` takes focus but cannot be chosen.
 */
export function enhanceMenu(menu: HTMLElement, options: MenuOptions = {}): void {
  const { onSelect, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const capture = until(signal, true);
  const id = ensureId(menu);
  // A menu built before it joins the document listens on its document.
  const tree = menu.getRootNode();
  const root = tree instanceof ShadowRoot ? tree : menu.ownerDocument;
  const OPENER = `[popovertarget="${CSS.escape(id)}"], [commandfor="${CSS.escape(id)}"]`;
  const openerOf = (t: EventTarget | null): HTMLElement | null => {
    const b = t instanceof Element ? t.closest<HTMLElement>(OPENER) : null;
    return b === null || menu.contains(b) ? null : b;
  };
  const mark = (b: Element): void => {
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-controls", id);
    if (!b.hasAttribute("aria-expanded")) {
      b.setAttribute("aria-expanded", "false");
    }
  };
  for (const b of root.querySelectorAll(OPENER)) {
    mark(b);
  }
  let opener: HTMLElement | null = null;
  let focusLast = false;
  const me: Owner = {
    // Safari focuses no button on a click, so hiding can find no opener to
    // give focus back to (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus).
    close: () => {
      const inside = menu.contains(document.activeElement);
      hide(menu);
      if (inside && opener?.isConnected === true && document.activeElement !== opener) {
        opener.focus();
      }
    },
    onSelect,
    holds: (node) => node instanceof Element && openerOf(node) !== null,
    release: () => {
      opener?.setAttribute("aria-expanded", "false");
    },
  };
  // The opener pressed last owns the menu: only it reads as expanded, and
  // the menu sits by it.
  const take = (b: HTMLElement): void => {
    if (opener !== b) {
      opener?.setAttribute("aria-expanded", "false");
    }
    mark(b);
    opener = b;
    own(menu, me);
    anchorTo(menu, b);
  };

  // An opener added later is named one as focus or a press reaches it.
  root.addEventListener(
    "focusin",
    (e) => {
      const b = openerOf(e.target);
      if (b !== null) {
        mark(b);
      }
    },
    capture,
  );
  // A click runs before the opener's default action opens the popover.
  root.addEventListener(
    "click",
    (e) => {
      const b = openerOf(e.target);
      if (b !== null) {
        take(b);
      }
    },
    capture,
  );
  // Enter and Space open by the button's own click; the arrows open it too,
  // ArrowUp with focus on the last item.
  root.addEventListener(
    "keydown",
    (e) => {
      const ke = e as KeyboardEvent;
      const b = openerOf(ke.target);
      if (b === null || (ke.key !== "ArrowDown" && ke.key !== "ArrowUp")) {
        return;
      }
      ke.preventDefault();
      take(b);
      focusLast = ke.key === "ArrowUp";
      if (menu.matches(":popover-open")) {
        (focusLast ? itemsOf(menu).at(-1) : itemsOf(menu)[0])?.focus();
        focusLast = false;
      } else {
        menu.showPopover();
      }
    },
    capture,
  );
  menu.addEventListener(
    "toggle",
    (e) => {
      if (owners.get(menu) === me) {
        const open = e.newState === "open";
        opener?.setAttribute("aria-expanded", String(open));
        if (open) {
          (focusLast ? itemsOf(menu).at(-1) : itemsOf(menu)[0])?.focus();
        }
      }
      focusLast = false;
    },
    listen,
  );
  wireItems(menu, me, signal);

  signal?.addEventListener(
    "abort",
    () => {
      disown(menu, me);
      for (const b of root.querySelectorAll(OPENER)) {
        for (const a of ["aria-haspopup", "aria-controls", "aria-expanded"]) {
          b.removeAttribute(a);
        }
      }
    },
    { once: true },
  );
}

export interface ContextMenuOptions extends MenuOptions {
  /** How long a finger held still opens the menu, in ms. Default 500. */
  readonly hold?: number;
  /** Runs with the element pressed before the menu opens, so the host can
   *  fill the menu for it. */
  readonly onOpen?: (target: Element) => void;
}

/**
 * Opens the `role="menu"` popover `menu`, marked `popover="manual"`, at the
 * pointer on a right click or a finger held still inside `zone`, and calls
 * `onOpen` with the element pressed so the host can fill the menu for it.
 * A press outside or Escape closes it; the hold selects no text, opens no
 * browser menu, and the lift that ends it clicks nothing.
 */
export function enhanceContextMenu(
  zone: HTMLElement,
  menu: HTMLElement,
  options: ContextMenuOptions = {},
): void {
  const { onOpen, onSelect, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const holdMs = options.hold ?? 500;
  const listen = until(signal);
  const capture = until(signal, true);
  let opener: Element | null = null;
  const close = (): void => {
    hide(menu);
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      (menu.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      opener.focus();
    }
    opener = null;
  };
  const me: Owner = {
    close,
    onSelect,
    holds: () => false,
    release: () => {
      opener = null;
    },
  };
  const open = (x: number, y: number, at: Element): void => {
    onOpen?.(at);
    opener = document.activeElement;
    own(menu, me);
    showPopoverAt(menu, x, y);
    menu.querySelector<HTMLElement>(ITEM)?.focus();
  };

  let held = false;
  let start: { x: number; y: number; at: Element } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drop = (): void => {
    clearTimeout(timer);
    start = null;
  };
  zone.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
      if (!held && e.target instanceof Element) {
        open(e.clientX, e.clientY, e.target);
      }
    },
    listen,
  );
  zone.addEventListener(
    "pointerdown",
    (e) => {
      if (
        e.pointerType === "mouse" ||
        !(e.target instanceof Element) ||
        e.target.closest("button, a, input, select, textarea") !== null
      ) {
        return;
      }
      held = false;
      start = { x: e.clientX, y: e.clientY, at: e.target };
      const from = start;
      // A hold is a length of time, so it is the one thing here a timer measures.
      timer = setTimeout(() => {
        held = true;
        open(from.x, from.y, from.at);
      }, holdMs);
    },
    listen,
  );
  zone.addEventListener(
    "pointermove",
    (e) => {
      if (start !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
        drop();
      }
    },
    listen,
  );
  for (const type of ["pointerup", "pointercancel"]) {
    zone.addEventListener(type, drop, listen);
  }
  zone.addEventListener(
    "click",
    (e) => {
      if (held) {
        held = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    capture,
  );
  zone.addEventListener(
    "selectstart",
    (e) => {
      if (start !== null) {
        e.preventDefault();
      }
    },
    listen,
  );
  // menu.css stops a hold here raising iOS's link callout, which no event
  // cancels (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-touch-callout).
  zone.toggleAttribute("data-cp-context", true);
  wireItems(menu, me, signal);
  signal?.addEventListener(
    "abort",
    () => {
      drop();
      zone.removeAttribute("data-cp-context");
      disown(menu, me);
    },
    { once: true },
  );
}
