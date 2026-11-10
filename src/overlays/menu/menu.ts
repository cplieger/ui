/**
 * menu.ts — the WAI-ARIA menu button over a native popover
 * (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). The button opens
 * the `role="menu"` popover by its `popovertarget`, and the popover closes
 * on Escape and on a press outside by itself, returning focus to the button.
 * `enhanceMenu()` adds what the platform lacks: focus on the first item as
 * it opens, the arrow keys, Home, End and typeahead among the items, check
 * and radio items that keep it open, and closing once an item is chosen.
 * `enhanceContextMenu()` opens one at the pointer instead.
 * @module
 */

import { anchorTo, showPopoverAt } from "../anchor/anchor.js";
import { until } from "../../core/lifetime/lifetime.js";

export interface MenuOptions {
  /** The person chose an item: a `menuitem` after the menu closed, a
   *  `menuitemcheckbox` or `menuitemradio` after its `aria-checked` changed,
   *  with the menu still open. */
  readonly onSelect?: (item: HTMLElement) => void;
  /** Removes the listeners and the button's ARIA. */
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

/** Keys, typeahead and choosing inside `menu`, shared by both menus. */
function wireItems(
  menu: HTMLElement,
  close: () => void,
  onSelect: ((item: HTMLElement) => void) | undefined,
  listen: AddEventListenerOptions,
): void {
  const items = (): HTMLElement[] =>
    [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hidden);
  let typed = "";
  let typedAt = -Infinity;

  menu.addEventListener(
    "keydown",
    (e) => {
      const list = items();
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
}

/**
 * Wires `button` to the `role="menu"` popover `menu`, which `button` opens
 * by `popovertarget`. Items are read at each key, so items the host adds or
 * removes need no call. An item with `aria-disabled="true"` takes focus but
 * cannot be chosen.
 */
export function enhanceMenu(
  button: HTMLElement,
  menu: HTMLElement,
  options: MenuOptions = {},
): void {
  const { onSelect, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-controls", ensureId(menu));
  button.setAttribute("aria-expanded", "false");
  let focusLast = false;
  const first = (): HTMLElement | undefined =>
    [...menu.querySelectorAll<HTMLElement>(ITEM)].find((i) => !i.hidden);
  const last = (): HTMLElement | undefined =>
    [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hidden).at(-1);
  const close = (): void => {
    if (menu.matches(":popover-open")) {
      menu.hidePopover();
    }
  };

  menu.addEventListener(
    "toggle",
    (e) => {
      const open = e.newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (open && !menu.hasAttribute("data-cp-at")) {
        (focusLast ? last() : first())?.focus();
      }
      focusLast = false;
    },
    listen,
  );
  // Enter and Space open by the button's own click; the arrows open it too,
  // ArrowUp with focus on the last item.
  button.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        return;
      }
      e.preventDefault();
      focusLast = e.key === "ArrowUp";
      anchorTo(menu, button);
      if (!menu.matches(":popover-open")) {
        menu.showPopover();
      } else {
        (focusLast ? last() : first())?.focus();
      }
    },
    listen,
  );
  wireItems(menu, close, onSelect, listen);

  signal?.addEventListener(
    "abort",
    () => {
      close();
      for (const a of ["aria-haspopup", "aria-controls", "aria-expanded"]) {
        button.removeAttribute(a);
      }
    },
    { once: true },
  );
}

export interface ContextMenuOptions extends MenuOptions {
  /** How long a finger held still opens the menu, in ms. Default 500. */
  readonly hold?: number;
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
  options: ContextMenuOptions & { readonly onOpen?: (target: Element) => void } = {},
): void {
  const { onSelect, onOpen, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const holdMs = options.hold ?? 500;
  const listen = until(signal);
  const capture = until(signal, true);
  let opener: Element | null = null;
  const open = (x: number, y: number, at: Element): void => {
    onOpen?.(at);
    opener = document.activeElement;
    showPopoverAt(menu, x, y);
    menu.querySelector<HTMLElement>(ITEM)?.focus();
  };
  const close = (): void => {
    if (menu.matches(":popover-open")) {
      menu.hidePopover();
    }
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      (menu.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      opener.focus();
    }
    opener = null;
  };

  // Armed now, never on a timer: a busy page starves timers, and a menu
  // whose dismissal waits behind them ignores Escape.
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.composedPath()[0];
      if (menu.matches(":popover-open") && t instanceof Node && !menu.contains(t)) {
        close();
      }
    },
    capture,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && menu.matches(":popover-open")) {
        e.preventDefault();
        close();
      }
    },
    capture,
  );

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
  wireItems(menu, close, onSelect, listen);
  signal?.addEventListener(
    "abort",
    () => {
      drop();
      close();
    },
    { once: true },
  );
}
