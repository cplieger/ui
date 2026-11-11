/**
 * overflow.ts — `enhanceOverflow()` keeps a toolbar on one line: the
 * buttons that no longer fit leave it, last first, and its More button
 * offers them in a menu in the bar's order. Choosing one presses its
 * button, so it acts as it does in the bar; a button with `aria-pressed`
 * is a check item. A button that comes back fades in.
 * @module
 */

import { reducedMotion, until } from "../../core/lifetime/lifetime.js";
import { rollText } from "../../core/roll/roll.js";
import { enhanceMenu } from "../../overlays/menu/menu.js";

export interface OverflowOptions {
  /** Ends the enhancement: shows every button again and hides More. */
  readonly signal?: AbortSignal;
}

export interface Overflow {
  /** Fits the bar again, after a button's words changed or a button came
   *  or went. A change of the bar's own width refits by itself. */
  fit(): void;
}

const FADE: KeyframeAnimationOptions = { duration: 160, easing: "ease-out" };

const widthOf = (el: Element): number => {
  const width = Number.parseFloat(getComputedStyle(el).inlineSize);
  return Number.isNaN(width) ? 0 : width;
};

const px = (value: string): number => Number.parseFloat(value) || 0;

/** The room for the bar's children, unscaled by any transform. */
function roomOf(bar: HTMLElement): number {
  const s = getComputedStyle(bar);
  const width = px(s.inlineSize);
  return s.boxSizing === "border-box"
    ? width -
        px(s.paddingInlineStart) -
        px(s.paddingInlineEnd) -
        px(s.borderInlineStartWidth) -
        px(s.borderInlineEndWidth)
    : width;
}

function wordsOf(button: HTMLButtonElement): string {
  const label = button.getAttribute("aria-label");
  if (label !== null) {
    return label;
  }
  const roll = button.querySelector<HTMLElement>(":scope > .cp-roll");
  return roll === null ? button.textContent.trim() : rollText(roll);
}

/** The menu item that stands for `button`, its icon copied. */
function itemFor(button: HTMLButtonElement): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  const pressed = button.getAttribute("aria-pressed");
  if (pressed === null) {
    item.setAttribute("role", "menuitem");
    const icon = button.querySelector<HTMLElement>(":scope > .cp-icon:not([data-part])");
    if (icon !== null) {
      const copy = icon.cloneNode(true) as HTMLElement;
      // A strict style-src refuses a copied style attribute, never the CSSOM.
      copy.removeAttribute("style");
      for (const name of icon.style) {
        copy.style.setProperty(name, icon.style.getPropertyValue(name));
      }
      item.append(copy);
    }
  } else {
    item.setAttribute("role", "menuitemcheckbox");
    item.setAttribute("aria-checked", String(pressed === "true"));
  }
  if (button.disabled || button.getAttribute("aria-disabled") === "true") {
    item.setAttribute("aria-disabled", "true");
  }
  const tone = button.dataset["tone"];
  if (tone !== undefined) {
    item.dataset["tone"] = tone;
  }
  item.append(wordsOf(button));
  return item;
}

/**
 * `bar`, a `.cp-overflow`, holds `.cp-button`s and last its More button,
 * marked `data-part="more"`, whose `popovertarget` names an empty
 * `role="menu"` popover. Give More `hidden`, so a page without the script
 * never shows an empty menu. A child that is not a button, or that the
 * page hid, keeps its place. The menu is enhanced here; enhance it nowhere
 * else. Throws a TypeError without More or its menu.
 */
export function enhanceOverflow(bar: HTMLElement, options: OverflowOptions = {}): Overflow {
  const { signal } = options;
  const more = bar.querySelector<HTMLButtonElement>(':scope > button[data-part="more"]');
  const id = more?.getAttribute("popovertarget");
  const menu = id === null || id === undefined ? null : document.getElementById(id);
  if (more === null || menu === null) {
    throw new TypeError("enhanceOverflow: the bar has no More button with its menu");
  }
  if (signal?.aborted === true) {
    return { fit: () => undefined };
  }
  const out = new Set<HTMLButtonElement>();
  const buttonOf = new WeakMap<Element, HTMLButtonElement>();
  let first = true;

  const items = (): HTMLButtonElement[] =>
    [...bar.querySelectorAll<HTMLButtonElement>(":scope > button")].filter(
      (b) => b !== more && (out.has(b) || !b.hidden),
    );

  const fit = (): void => {
    const was = new Set(out);
    const moreWas = more.hidden;
    const list = items();
    for (const b of out) {
      b.hidden = false;
    }
    more.hidden = false;
    const gap = px(getComputedStyle(bar).columnGap);
    const room = roomOf(bar);
    const moving = new Set<Element>(list);
    const kept = [...bar.children].filter(
      (c) => c !== more && !moving.has(c) && !c.matches("[hidden], [popover]"),
    );
    const widths = list.map(widthOf);
    const fixed = kept.reduce((sum, c) => sum + widthOf(c) + gap, 0);
    const all = fixed + widths.reduce((sum, w) => sum + w + gap, 0) - gap;
    out.clear();
    if (all > room + 0.01) {
      let used = fixed + widthOf(more);
      const cut = widths.findIndex((w) => {
        used += gap + w;
        return used > room + 0.01;
      });
      for (const b of list.slice(cut < 0 ? list.length : cut)) {
        out.add(b);
      }
    }

    // An open menu offers what no longer leaves the bar, so it closes,
    // while More still shows to take its focus back.
    const changed = was.size !== out.size || [...was].some((b) => !out.has(b));
    if (changed && menu.matches(":popover-open")) {
      // The popover gives focus back only to a More that took it, which a
      // click in Safari never does.
      const inside = menu.contains(document.activeElement);
      menu.hidePopover();
      if (inside) {
        more.focus();
      }
    }
    const focused = document.activeElement;
    for (const b of out) {
      b.hidden = true;
    }
    more.hidden = out.size === 0;
    if (focused instanceof HTMLButtonElement && out.has(focused)) {
      more.focus();
    } else if (focused === more && more.hidden) {
      list.at(-1)?.focus();
    }
    if (!first && !reducedMotion()) {
      for (const b of was) {
        if (!out.has(b)) {
          b.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
        }
      }
      if (moreWas && !more.hidden) {
        more.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
      }
    }
    first = false;
  };

  const listen = until(signal);
  menu.addEventListener(
    "beforetoggle",
    (e) => {
      if (e.newState === "open") {
        menu.replaceChildren(
          ...items()
            .filter((b) => out.has(b))
            .map((b) => {
              const item = itemFor(b);
              buttonOf.set(item, b);
              return item;
            }),
        );
      }
    },
    listen,
  );
  enhanceMenu(menu, {
    onSelect: (item) => {
      const b = buttonOf.get(item);
      if (b === undefined) {
        return;
      }
      b.click();
      if (item.getAttribute("role") === "menuitemcheckbox") {
        item.setAttribute("aria-checked", String(b.getAttribute("aria-pressed") === "true"));
      }
    },
    ...(signal === undefined ? {} : { signal }),
  });

  bar.setAttribute("data-cp-overflow", "");
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(bar);
  // A web font that loads after the first fit changes every button's width.
  document.fonts.addEventListener("loadingdone", fit, listen);

  signal?.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      for (const b of out) {
        b.hidden = false;
      }
      out.clear();
      more.hidden = true;
      menu.replaceChildren();
      bar.removeAttribute("data-cp-overflow");
    },
    { once: true },
  );

  return { fit };
}
