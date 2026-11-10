/**
 * ask.ts — `ask()` puts one question to the person in a modal
 * `.cp-dialog`: a yes or no that resolves true or false, or, with `input`,
 * a value that resolves its text or null. A question asked while another is
 * open replaces it, and the open one answers as cancelled.
 * @module
 */

import { closeDialog } from "../dialog/dialog.js";

export interface AskInput {
  readonly type?: "text" | "password";
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly autocomplete?: string;
}

export interface AskOptions {
  /** The dialog's heading. Default: the message is the heading. */
  readonly title?: string;
  /** The answering button's words. Default "OK". */
  readonly confirmLabel?: string;
  /** The declining button's words. Default "Cancel". */
  readonly cancelLabel?: string;
  /** `"destructive"` paints the answer in the danger tone, leads with
   *  `icon` and puts focus on the declining button. Default `"normal"`. */
  readonly variant?: "normal" | "destructive";
  /** A drawing from `@cplieger/ui/icons` to lead the question with. */
  readonly icon?: Element;
  /** Facts to see before answering, as label and value pairs, in order. */
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  /** Ask for a value instead of a yes or no. */
  readonly input?: AskInput | true;
}

let current: { dialog: HTMLDialogElement; settle: () => void } | null = null;
let seq = 0;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className !== undefined) {
    n.className = className;
  }
  if (text !== undefined) {
    n.textContent = text;
  }
  return n;
}

function checkDetails(details: unknown): void {
  if (details === undefined) {
    return;
  }
  if (!Array.isArray(details)) {
    throw new TypeError("ask: details must be an array");
  }
  for (const d of details as unknown[]) {
    const entry = d as { label?: unknown; value?: unknown } | null;
    if (typeof entry?.label !== "string" || typeof entry.value !== "string") {
      throw new TypeError("ask: each of details needs a string label and value");
    }
  }
}

/** Asks a yes or no question; resolves true for the answer, false otherwise. */
export function ask(
  message: string,
  opts?: AskOptions & { readonly input?: undefined },
): Promise<boolean>;
/** Asks for a value; resolves its text, or null when the person declines. */
export function ask(
  message: string,
  opts: AskOptions & { readonly input: AskInput | true },
): Promise<string | null>;
export function ask(message: string, opts: AskOptions = {}): Promise<boolean | string | null> {
  checkDetails(opts.details);
  current?.settle();

  const destructive = opts.variant === "destructive";
  const input = opts.input === true ? {} : opts.input;
  const dialog = node("dialog", "cp-dialog");
  dialog.dataset["variant"] = "confirm";
  const titleId = `cp-ask-${String(++seq)}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const form = node("form");
  form.method = "dialog";
  const body = node("div", "cp-dialog-body");
  if (opts.icon !== undefined) {
    body.append(opts.icon);
  }
  const text = node("div");
  const heading = node("h2", undefined, opts.title ?? message);
  heading.id = titleId;
  text.append(heading);
  if (opts.title !== undefined) {
    text.append(node("p", undefined, message));
  }
  if (opts.details !== undefined && opts.details.length > 0) {
    const list = node("dl", "cp-ask-details");
    for (const d of opts.details) {
      list.append(node("dt", undefined, d.label), node("dd", undefined, d.value));
    }
    text.append(list);
  }
  let field: HTMLInputElement | null = null;
  if (input !== undefined) {
    field = node("input", "cp-input");
    field.type = input.type ?? "text";
    field.value = input.initialValue ?? "";
    field.setAttribute("aria-labelledby", titleId);
    if (input.placeholder !== undefined) {
      field.placeholder = input.placeholder;
    }
    if (input.maxLength !== undefined) {
      field.maxLength = input.maxLength;
    }
    field.autocomplete = (input.autocomplete ?? "off") as AutoFill;
    text.append(field);
  }
  body.append(text);
  const footer = node("footer");
  // Declining is a plain button, so Enter in the field submits the answer,
  // the form's only submit button.
  const cancel = node("button", "cp-button", opts.cancelLabel ?? "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    closeDialog(dialog, "cancel");
  });
  const confirm = node("button", "cp-button", opts.confirmLabel ?? "OK");
  confirm.value = "confirm";
  confirm.dataset["variant"] = "primary";
  if (destructive) {
    confirm.dataset["tone"] = "danger";
  }
  footer.append(cancel, confirm);
  form.append(body, footer);
  dialog.append(form);
  document.body.append(dialog);

  return new Promise((resolve) => {
    let done = false;
    const settle = (): void => {
      if (done) {
        return;
      }
      done = true;
      if (current?.dialog === dialog) {
        current = null;
      }
      const yes = dialog.returnValue === "confirm";
      resolve(field === null ? yes : yes ? field.value : null);
      if (dialog.open) {
        dialog.close("cancel");
      }
      dialog.remove();
    };
    current = { dialog, settle };
    dialog.addEventListener("close", settle, { once: true });
    dialog.showModal();
    // The least harmful choice takes focus when the answer cannot be undone.
    (field ?? (destructive ? cancel : confirm)).focus();
  });
}
