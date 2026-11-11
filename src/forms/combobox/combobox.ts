/**
 * combobox.ts — the WAI-ARIA combobox with a list popup
 * (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) over a text field
 * and a `role="listbox"` the host fills. Focus stays in the field while the
 * arrow keys move `aria-activedescendant` through the options, and Enter or
 * a press accepts one. The host owns which options show and what accepting
 * one does; the popup shows while it holds a visible option, or a line
 * saying the text matches none.
 * @module
 */

import { anchorTo } from "../../overlays/anchor/anchor.js";
import { until } from "../../core/lifetime/lifetime.js";

export interface ComboboxOptions {
  /** Runs on each edit with the field's text, before the options are read:
   *  the host shows and hides the listbox's options for it. */
  readonly onQuery?: (text: string) => void;
  /** An option was accepted, by Enter or a press. The popup has closed;
   *  call `refresh()` to show the options again. */
  readonly onAccept: (option: HTMLElement) => void;
  /** Enter with no active option, with the field's text. Without it, Enter
   *  does what the field does alone, such as submitting its form. */
  readonly onText?: (text: string) => void;
  /** Runs once typing has paused for `settle` ms, with the field's text,
   *  for work too costly for each keystroke, such as a filter in the URL. */
  readonly onSettle?: (text: string) => void;
  /** The pause `onSettle` waits for, in ms. Default 250. */
  readonly settle?: number;
  /** Makes the first option active as typed text changes the options, so
   *  Enter takes the best match. Default false: Enter with nothing active
   *  goes to `onText`. */
  readonly autoActivate?: boolean;
  /** Shows the options when the field takes focus. Default false: typing,
   *  ArrowDown or Alt+ArrowDown shows them. */
  readonly openOnFocus?: boolean;
  /** What the popup sits under. Default: the field. */
  readonly anchor?: HTMLElement;
  /** The element shown as the popup, holding the listbox and `empty`.
   *  Default: the listbox itself. */
  readonly popup?: HTMLElement;
  /** A line in `popup`, beside the listbox, shown in place of the options
   *  while typed text matches none. The host writes its words in `onQuery`;
   *  without it, the popup closes when no option is left. */
  readonly empty?: HTMLElement;
  /** Removes the listeners and the field's combobox attributes, and closes
   *  the popup. */
  readonly signal?: AbortSignal;
}

export interface Combobox {
  /** Runs `onQuery` with the field's text and reads the options again, as
   *  after the host changed them. */
  refresh(): void;
  /** Closes the popup, keeping the text. */
  close(): void;
}

let seq = 0;

function ensureId(el: HTMLElement, prefix: string): string {
  if (el.id === "") {
    el.id = `${prefix}-${String(++seq)}`;
  }
  return el.id;
}

/**
 * `input` is a text `<input>`. `listbox` is the `role="listbox"` that holds
 * its `role="option"` rows; it, or `popup` when given, becomes a manual
 * popover placed under `anchor`. An option that is hidden, inside a
 * hidden part of the listbox, or `aria-disabled="true"` is skipped.
 */
export function enhanceCombobox(
  input: HTMLInputElement,
  listbox: HTMLElement,
  options: ComboboxOptions,
): Combobox {
  const { onQuery, onAccept, onText, onSettle, empty, signal } = options;
  const settleMs = options.settle ?? 250;
  const anchor = options.anchor ?? input;
  const popup = options.popup ?? listbox;
  let active: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const shown = (o: HTMLElement): boolean => {
    const hidden = o.closest<HTMLElement>("[hidden]");
    return hidden === null || hidden === listbox || !listbox.contains(hidden);
  };
  const visible = (): HTMLElement[] =>
    [...listbox.querySelectorAll<HTMLElement>('[role="option"]')].filter(
      (o) => o.getAttribute("aria-disabled") !== "true" && shown(o),
    );
  const isOpen = (): boolean => popup.matches(":popover-open");
  const mark = (option: HTMLElement | null): void => {
    active = option;
    for (const o of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
      o.setAttribute("aria-selected", String(o === option));
    }
    if (option === null) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    input.setAttribute("aria-activedescendant", ensureId(option, `${listbox.id}-opt`));
    option.scrollIntoView({ block: "nearest" });
  };
  const close = (): void => {
    mark(null);
    input.setAttribute("aria-expanded", "false");
    if (isOpen()) {
      popup.hidePopover();
    }
  };
  const focused = (): boolean =>
    (input.getRootNode() as Document | ShadowRoot).activeElement === input;
  /** Shows or hides the popup for the options now visible. */
  const update = (activate: "keep" | "first" | "last" | "none"): void => {
    const list = visible();
    const none = list.length === 0 && input.value.trim() !== "";
    if (empty !== undefined) {
      empty.hidden = !none;
    }
    if (!focused() || (list.length === 0 && !(none && empty !== undefined))) {
      close();
      return;
    }
    if (!isOpen()) {
      anchorTo(popup, anchor);
      popup.showPopover();
    }
    input.setAttribute("aria-expanded", "true");
    if (activate === "first") {
      mark(list[0] ?? null);
    } else if (activate === "last") {
      mark(list.at(-1) ?? null);
    } else if (activate === "none" || active === null || !list.includes(active)) {
      mark(null);
    }
  };
  const query = (): void => {
    onQuery?.(input.value);
  };
  const accept = (option: HTMLElement): void => {
    close();
    onAccept(option);
  };

  if (signal?.aborted === true) {
    return { refresh: () => undefined, close: () => undefined };
  }
  const listen = until(signal);
  ensureId(listbox, "cp-listbox");
  listbox.setAttribute("role", "listbox");
  if (!popup.hasAttribute("popover")) {
    popup.popover = "manual";
  }
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", listbox.id);
  input.setAttribute("aria-expanded", "false");

  input.addEventListener(
    "input",
    () => {
      query();
      update(options.autoActivate === true && input.value.trim() !== "" ? "first" : "keep");
      if (onSettle !== undefined) {
        clearTimeout(timer);
        // A pause in typing is a length of time, so a timer measures it.
        timer = setTimeout(() => {
          onSettle(input.value);
        }, settleMs);
      }
    },
    listen,
  );
  input.addEventListener(
    "focus",
    () => {
      if (options.openOnFocus === true) {
        query();
        update("none");
      }
    },
    listen,
  );
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.isComposing) {
        return;
      }
      const list = visible();
      const at = active === null ? -1 : list.indexOf(active);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen()) {
          query();
          update(e.altKey ? "none" : "first");
        } else if (!e.altKey) {
          mark(list[(at + 1) % list.length] ?? null);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (e.altKey) {
          close();
        } else if (!isOpen()) {
          query();
          update("last");
        } else {
          mark(list[(at - 1 + list.length) % list.length] ?? null);
        }
      } else if (e.key === "Enter") {
        if (isOpen() && active !== null) {
          e.preventDefault();
          accept(active);
        } else if (onText !== undefined) {
          e.preventDefault();
          close();
          onText(input.value);
        }
      } else if (e.key === "Escape") {
        // Handled here, so a dialog holding the field stays open.
        if (isOpen()) {
          e.preventDefault();
          close();
        } else if (input.value !== "") {
          e.preventDefault();
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          // The edit shows every option again; the Escape that made it does not.
          close();
        }
      } else if (e.key === "Tab") {
        close();
      }
    },
    listen,
  );
  // A press on the popup keeps focus in the field, so the field never blurs
  // and the click lands.
  popup.addEventListener(
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
      if (o !== null && visible().includes(o)) {
        accept(o);
      }
    },
    listen,
  );
  input.addEventListener(
    "focusout",
    (e) => {
      if (!(e.relatedTarget instanceof Node && popup.contains(e.relatedTarget))) {
        close();
      }
    },
    listen,
  );
  signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      close();
      for (const a of [
        "role",
        "aria-autocomplete",
        "aria-controls",
        "aria-expanded",
        "aria-activedescendant",
      ]) {
        input.removeAttribute(a);
      }
    },
    { once: true },
  );

  return {
    refresh() {
      query();
      update(options.autoActivate === true && input.value.trim() !== "" ? "first" : "keep");
    },
    close,
  };
}
