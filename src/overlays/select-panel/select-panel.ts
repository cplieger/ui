/**
 * select-panel.ts — `enhanceSelectPanel()` makes a `.cp-popover.cp-select-panel`
 * a choice of several from a long list: a field filters the options, Enter
 * or a press checks one, the form's submit applies the choice, and any other
 * close puts back the choice it opened with.
 * @module
 */

import { anchorOf } from "../anchor/anchor.js";
import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";

export interface SelectPanelOptions {
  /** The choice was applied by the form's submit, with the checked options
   *  in their order. The panel has closed and focus is back on its opener. */
  readonly onApply: (chosen: HTMLElement[]) => void;
  /** Removes the listeners and the active option. */
  readonly signal?: AbortSignal;
}

const ACTIVE = "data-cp-active";
let seq = 0;

function ensureId(el: HTMLElement, prefix: string): string {
  if (el.id === "") {
    el.id = `${prefix}-${String(++seq)}`;
  }
  return el.id;
}

const words = (el: Element): string => el.textContent.trim().toLocaleLowerCase();

/**
 * `panel` is a `.cp-popover.cp-select-panel` opened by a button's
 * `popovertarget` or `commandfor`, holding a `<form>` with a text `<input>`,
 * a `role="listbox"` of `role="option"` rows checked by `aria-selected`, and
 * its submit button. An element marked `data-part="empty"` shows while no
 * option matches, and its words are announced as it shows. Throws a
 * `TypeError` when the form, the field or the listbox is missing. Needs
 * `installAnchors()` for focus to come back to the opener in Safari.
 */
export function enhanceSelectPanel(panel: HTMLElement, options: SelectPanelOptions): void {
  const { onApply, signal } = options;
  const form = panel.querySelector("form");
  const field = panel.querySelector("input");
  const listbox = panel.querySelector<HTMLElement>('[role="listbox"]');
  if (form === null || field === null || listbox === null) {
    throw new TypeError(
      'enhanceSelectPanel: the panel needs a <form> with an <input> and a role="listbox"',
    );
  }
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const empty = panel.querySelector<HTMLElement>('[data-part="empty"]');
  const all = (): HTMLElement[] => [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
  const usable = (o: HTMLElement): boolean =>
    !o.hidden && o.getAttribute("aria-disabled") !== "true";
  const checked = (o: HTMLElement): boolean => o.getAttribute("aria-selected") === "true";
  let active: HTMLElement | null = null;
  let kept = new Map<HTMLElement, boolean>();
  let applied = false;

  const activate = (option: HTMLElement | null): void => {
    active?.removeAttribute(ACTIVE);
    active = option;
    if (option === null) {
      field.removeAttribute("aria-activedescendant");
      return;
    }
    option.setAttribute(ACTIVE, "");
    field.setAttribute("aria-activedescendant", ensureId(option, `${listbox.id}-opt`));
    option.scrollIntoView({ block: "nearest" });
  };
  const filter = (): void => {
    const q = field.value.trim().toLocaleLowerCase();
    for (const o of all()) {
      o.hidden = !words(o).includes(q);
    }
    const shown = all().filter(usable);
    const none = shown.length === 0;
    // Focus stays in the field, so the list going empty says nothing by
    // itself.
    if (empty !== null && empty.hidden === none) {
      empty.hidden = !none;
      if (none) {
        announce(empty.textContent.trim());
      }
    }
    activate(shown[0] ?? null);
  };
  const flip = (o: HTMLElement): void => {
    o.setAttribute("aria-selected", String(!checked(o)));
  };

  ensureId(listbox, "cp-select-panel");
  listbox.setAttribute("aria-multiselectable", "true");
  // A long list scrolls, and a scroller with nothing focusable in it is a
  // Tab stop in Chromium and Firefox; focus belongs in the field.
  // (https://chromestatus.com/feature/5231964663578624)
  listbox.tabIndex = -1;
  field.setAttribute("role", "combobox");
  field.setAttribute("aria-autocomplete", "list");
  field.setAttribute("aria-controls", listbox.id);
  field.setAttribute("aria-expanded", "true");
  // The popover's own focusing steps move focus as it shows, in the task
  // that opens it.
  const marked = field.autofocus;
  field.autofocus = true;

  panel.addEventListener(
    "beforetoggle",
    (e) => {
      if (e.newState === "open") {
        kept = new Map(all().map((o) => [o, checked(o)]));
        applied = false;
        field.value = "";
        filter();
        return;
      }
      if (!applied) {
        for (const [o, was] of kept) {
          o.setAttribute("aria-selected", String(was));
        }
      }
      activate(null);
    },
    listen,
  );
  field.addEventListener("input", filter, listen);
  field.addEventListener(
    "keydown",
    (e) => {
      if (e.isComposing) {
        return;
      }
      const shown = all().filter(usable);
      const at = active === null ? -1 : shown.indexOf(active);
      if (e.key === "ArrowDown") {
        activate(shown[(at + 1) % shown.length] ?? null);
      } else if (e.key === "ArrowUp") {
        activate(shown.at(at <= 0 ? -1 : at - 1) ?? null);
      } else if (e.key === "Enter") {
        // Enter checks, and never submits from the field: a filter that
        // matched nothing would apply a choice nobody looked at.
        if (active !== null) {
          flip(active);
        }
      } else {
        return;
      }
      e.preventDefault();
    },
    listen,
  );
  // A press on the list keeps focus in the field.
  listbox.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
    },
    listen,
  );
  listbox.addEventListener(
    "click",
    (e) => {
      const o =
        e.target instanceof Element ? e.target.closest<HTMLElement>('[role="option"]') : null;
      if (o !== null && listbox.contains(o) && usable(o)) {
        flip(o);
        activate(o);
      }
    },
    listen,
  );
  form.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      applied = true;
      panel.hidePopover();
      // Safari focuses no button on a click, so hiding finds no opener to
      // give focus back to (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus).
      anchorOf(panel)?.focus();
      onApply(all().filter(checked));
    },
    listen,
  );
  signal?.addEventListener(
    "abort",
    () => {
      activate(null);
      field.autofocus = marked;
    },
    { once: true },
  );
}
