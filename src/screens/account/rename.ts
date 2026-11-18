/**
 * rename.ts — a name edited in its own table cell: Rename… turns the name
 * into a field holding it, selected; Enter saves, Escape puts the name
 * back, and focus returns to the Rename… button either way.
 * @module
 */

import { clearError, showError } from "../../forms/form/form.js";
import { codeOf, reasonOf, runes } from "./answer.js";
import type { Refusal } from "./client.js";
import { el } from "./dom.js";
import type { Slot } from "./screen.js";
import type { AccountWords } from "./words.js";

/** A display name, a passkey's name and a key's label: one line of at
 *  most this many characters (access `maxDisplayRunes`). */
export const NAME_MAX = 128;

/** The edit a save runs in, which its refusal arms end or repeat. */
interface OpenEdit {
  /** Ends the edit unsaved, as Escape does, for an answer that reads the
   *  table again. */
  readonly close: () => void;
  /** Saves the field's current value again, as Enter does, for Retry. */
  readonly retry: () => void;
  /** Takes the notice `into` shows now as this edit's: it goes once the
   *  edit saves again or ends. */
  readonly noted: (into: Slot) => void;
}

export interface RenameSpec {
  /** The node showing the name, replaced by the field while it is edited. */
  readonly name: HTMLElement;
  readonly value: string;
  /** The field's accessible name, such as "Rename Phone". */
  readonly label: string;
  /** An empty name is saved, clearing it; the placeholder shows what an
   *  unnamed one reads as. */
  readonly clearable?: { readonly placeholder: string };
  /** Gets focus back once the edit ends. */
  readonly button: HTMLElement;
  readonly words: AccountWords;
  /** Saves `value`: undefined once saved, the words of the refusal to
   *  show on the field, or false to keep the field as it is. */
  readonly save: (value: string, edit: OpenEdit) => Promise<string | false | undefined>;
  /** Runs once the edit ends, `saved` when the new name was stored. */
  readonly ended: (saved: boolean) => void;
}

function renameInPlace(spec: RenameSpec): HTMLInputElement {
  const w = spec.words;
  const box = el("div");
  const input = el("input", "cp-input");
  input.type = "text";
  input.value = spec.value;
  input.setAttribute("aria-label", spec.label);
  input.setAttribute("autocomplete", "off");
  if (spec.clearable !== undefined) {
    input.placeholder = spec.clearable.placeholder;
  }
  input.enterKeyHint = "done";
  box.append(input);
  spec.name.replaceWith(box);
  input.focus();
  input.select();

  let saving = false;
  let open = true;
  let note: { readonly into: Slot; readonly box: Element | undefined } | undefined;
  const unnote = (): void => {
    note?.into.drop(note.box);
    note = undefined;
  };
  const end = (saved: boolean): void => {
    if (!open) {
      return;
    }
    open = false;
    box.replaceWith(spec.name);
    spec.button.focus();
    unnote();
    spec.ended(saved);
  };
  const edit: OpenEdit = {
    close: () => {
      end(false);
    },
    retry: () => {
      if (open) {
        input.focus();
        submit();
      }
    },
    noted: (into) => {
      note = { into, box: into.shown() };
    },
  };
  const submit = (): void => {
    if (saving) {
      return;
    }
    const value = input.value.trim();
    if (value === spec.value) {
      end(false);
      return;
    }
    if (value === "" && spec.clearable === undefined) {
      showError(input, w["rename.empty"]);
      return;
    }
    if (runes(value) > NAME_MAX) {
      showError(input, w["rename.tooLong"](NAME_MAX));
      return;
    }
    unnote();
    saving = true;
    input.readOnly = true;
    input.setAttribute("aria-busy", "true");
    void spec.save(value, edit).then((refused) => {
      saving = false;
      input.readOnly = false;
      input.removeAttribute("aria-busy");
      if (refused === undefined) {
        end(true);
      } else if (open) {
        if (refused !== false) {
          showError(input, refused);
        }
        input.focus();
        input.select();
      }
    });
  };
  input.addEventListener("input", () => {
    clearError(input);
  });
  // An IME's own Enter and Escape confirm or drop its candidate. WebKit
  // delivers compositionend before that keydown, with isComposing already
  // false; its keyCode 229 still marks it as the IME's:
  // https://bugs.webkit.org/show_bug.cgi?id=165004 and
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
  input.addEventListener("keydown", (e) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- WebKit's only IME mark.
    if (e.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!saving) {
        end(false);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  return input;
}

/** A part's redraws held while one of its names is edited in place, so a
 *  read answering meanwhile neither takes the field away nor moves focus. */
interface RenameHold {
  /** Asked where a read would draw: true while an edit is open, so the
   *  caller skips its redraw and the hold runs `again` once the last edit
   *  ends unsaved. */
  held(): boolean;
  /** `renameInPlace` under the hold; on a name already being edited, it
   *  focuses that field instead. */
  edit(spec: RenameSpec): void;
}

/** A hold whose `again` reads the part again for a read it held back. */
export function renameHold(again: () => void): RenameHold {
  // One field per name node: while it is open the node is out of the page.
  const open = new Map<HTMLElement, HTMLInputElement>();
  // A read was held back since the last one that drew.
  let owed = false;
  return {
    held() {
      owed = open.size > 0;
      return owed;
    },
    edit(spec) {
      const field = open.get(spec.name);
      if (field !== undefined) {
        field.focus();
        field.select();
        return;
      }
      const input = renameInPlace({
        ...spec,
        ended: (saved) => {
          open.delete(spec.name);
          const missed = owed && open.size === 0;
          if (missed) {
            owed = false;
          }
          spec.ended(saved);
          if (missed && !saved) {
            again();
          }
        },
      });
      open.set(spec.name, input);
    },
  };
}

/** A refused name's words on its field, or undefined for any other
 *  refusal. */
export function nameRefused(r: Refusal, w: AccountWords): string | undefined {
  if (codeOf(r) !== "auth_bad_request") {
    return undefined;
  }
  switch (reasonOf(r)) {
    case "label_empty":
      return w["rename.empty"];
    case "label_too_long":
      return w["rename.tooLong"](NAME_MAX);
    case "label_disallowed_character":
      return w["auth_bad_request.label_disallowed_character"];
    default:
      return undefined;
  }
}
