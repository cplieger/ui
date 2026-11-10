/**
 * roving-focus.ts — one Tab stop for a group of controls, such as a
 * toolbar or a list of chips: Tab enters the group at the item last used,
 * and the arrow keys, Home and End move among its items.
 * @module
 */

export interface RovingFocusOptions {
  /** The items, matched inside the group at each key. Default: its
   *  buttons, links and `[role="option"]`s. */
  readonly items?: string;
  /** Which arrows move: left and right, up and down, or both. Default
   *  `"horizontal"`. */
  readonly orientation?: "horizontal" | "vertical" | "both";
  /** From the last item an arrow goes back to the first. Default true. */
  readonly wrap?: boolean;
  /** Removes the listeners and puts each item's tab order back. */
  readonly signal?: AbortSignal;
}

const DEFAULT_ITEMS = 'button, a[href], [role="option"]';

/** Makes `group` one Tab stop over its items. */
export function enhanceRovingFocus(group: HTMLElement, options: RovingFocusOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const selector = options.items ?? DEFAULT_ITEMS;
  const orientation = options.orientation ?? "horizontal";
  const wrap = options.wrap ?? true;
  const items = (): HTMLElement[] =>
    [...group.querySelectorAll<HTMLElement>(selector)].filter(
      (i) => !i.hidden && !(i as HTMLButtonElement).disabled,
    );
  const listen: AddEventListenerOptions = signal === undefined ? {} : { signal };

  /** One item takes Tab: the one given, else the one that had it, else the first. */
  const settle = (current?: HTMLElement): void => {
    const list = items();
    const keep = current ?? list.find((i) => i.tabIndex === 0) ?? list[0];
    for (const i of list) {
      i.tabIndex = i === keep ? 0 : -1;
    }
  };
  settle();

  const back = new Set(
    orientation === "vertical"
      ? ["ArrowUp"]
      : orientation === "both"
        ? ["ArrowLeft", "ArrowUp"]
        : ["ArrowLeft"],
  );
  const forth = new Set(
    orientation === "vertical"
      ? ["ArrowDown"]
      : orientation === "both"
        ? ["ArrowRight", "ArrowDown"]
        : ["ArrowRight"],
  );

  group.addEventListener(
    "keydown",
    (e) => {
      const list = items();
      const at = list.indexOf(e.target as HTMLElement);
      if (at < 0) {
        return;
      }
      // In a right-to-left group the inline arrows run the other way.
      const rtl = getComputedStyle(group).direction === "rtl";
      let key = e.key;
      if (rtl && (key === "ArrowLeft" || key === "ArrowRight")) {
        key = key === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
      }
      let next: number;
      if (forth.has(key)) {
        next = at + 1 < list.length ? at + 1 : wrap ? 0 : at;
      } else if (back.has(key)) {
        next = at > 0 ? at - 1 : wrap ? list.length - 1 : at;
      } else if (key === "Home") {
        next = 0;
      } else if (key === "End") {
        next = list.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      const to = list[next];
      if (to !== undefined) {
        settle(to);
        to.focus();
      }
    },
    listen,
  );
  // A press or a focus from elsewhere makes that item the one Tab returns to.
  group.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && items().includes(t)) {
        settle(t);
      }
    },
    listen,
  );
  signal?.addEventListener(
    "abort",
    () => {
      for (const i of group.querySelectorAll<HTMLElement>(selector)) {
        i.removeAttribute("tabindex");
      }
    },
    { once: true },
  );
}
