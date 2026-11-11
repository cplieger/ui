/**
 * palette.ts — `enhancePalette()` makes a `<dialog class="cp-dialog
 * cp-palette">` a command palette: Ctrl+K, or ⌘K, opens it with
 * its field empty and focused, typing narrows its list of actions, the
 * arrow keys move through them while focus stays in the field, and Enter or
 * a press runs one and closes the palette. The list is an inline
 * `@cplieger/ui/combobox`.
 * @module
 */

import { enhanceCombobox } from "../../forms/combobox/combobox.js";
import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";
import { closeDialog } from "../dialog/dialog.js";

export interface PaletteOptions {
  /** An action was chosen, by Enter or a press. The palette is closing and
   *  focus goes back to where it was before it opened. */
  readonly onRun: (option: HTMLElement) => void;
  /** The key that opens the palette with Ctrl, or ⌘ on a Mac, while no
   *  other modal dialog is open. Default "k"; `null` for none. */
  readonly key?: string | null;
  /** Removes the listeners, the key among them. */
  readonly signal?: AbortSignal;
}

export interface Palette {
  /** Opens the palette with its field empty, unless it is open. */
  open(): void;
}

/** An option's words, without the keys a `<kbd>` names beside them. */
function words(option: HTMLElement): string {
  let text = "";
  for (const n of option.childNodes) {
    if (!(n instanceof HTMLElement && n.localName === "kbd")) {
      text += ` ${n.textContent ?? ""}`;
    }
  }
  return text.toLocaleLowerCase();
}

/**
 * `dialog` holds a text `<input>`, a `role="listbox"` of `role="option"`
 * rows and, optionally, an element marked `data-part="empty"` that shows,
 * and is said to a screen reader, while no option matches. Throws a
 * `TypeError` when the field or the listbox is missing. Needs
 * `installDialogs()` for the exit in Firefox and Safari.
 */
export function enhancePalette(dialog: HTMLDialogElement, options: PaletteOptions): Palette {
  const { onRun, signal } = options;
  const key = options.key === undefined ? "k" : (options.key?.toLocaleLowerCase() ?? null);
  const field = dialog.querySelector("input");
  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (field === null || listbox === null) {
    throw new TypeError('enhancePalette: the dialog needs an <input> and a role="listbox"');
  }
  const open = (): void => {
    if (!dialog.open) {
      dialog.showModal();
    }
  };
  if (signal?.aborted === true) {
    return { open };
  }
  const listen = until(signal);
  const empty = dialog.querySelector<HTMLElement>('[data-part="empty"]');
  const combo = enhanceCombobox(field, listbox, {
    inline: true,
    autoActivate: true,
    onQuery: (text) => {
      const q = text.trim().toLocaleLowerCase();
      let any = false;
      for (const o of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
        o.hidden = !words(o).includes(q);
        any ||= !o.hidden;
      }
      if (empty !== null && empty.hidden !== any) {
        empty.hidden = any;
        if (!any) {
          announce(empty.textContent.trim());
        }
      }
    },
    onAccept: (option) => {
      closeDialog(dialog, "run");
      onRun(option);
    },
    ...(signal === undefined ? {} : { signal }),
  });
  // The dialog's own focusing steps put focus in the field as it opens.
  field.autofocus = true;
  // A long list scrolls, and a scroller with nothing focusable in it is a
  // Tab stop in Chromium and Firefox; focus belongs in the field.
  listbox.tabIndex = -1;
  field.addEventListener(
    "focus",
    () => {
      combo.refresh();
    },
    listen,
  );
  dialog.addEventListener(
    "close",
    () => {
      field.value = "";
    },
    listen,
  );
  if (key !== null) {
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          !(e.ctrlKey || e.metaKey) ||
          e.altKey ||
          e.shiftKey ||
          e.key.toLocaleLowerCase() !== key ||
          e.defaultPrevented
        ) {
          return;
        }
        const modal = document.querySelector("dialog:modal");
        if (modal !== null && modal !== dialog) {
          return;
        }
        e.preventDefault();
        open();
      },
      listen,
    );
  }
  return { open };
}
