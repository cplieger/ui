/**
 * ask.ts — `ask()` puts one question to the person in a modal
 * `.cp-dialog`: a yes or no that resolves true or false, with `input` a
 * value that resolves its text or null, or with `choices` the groups the
 * action takes, which resolve their values or null. A question asked while
 * another is open replaces it, and the open one answers as cancelled.
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

/** One group the action can take, such as "3 managed files". */
export interface AskChoice {
  /** What the answer resolves for this group when it is chosen. */
  readonly value: string;
  readonly label: string;
  /** A muted line under the label, such as "Fetched by this app". */
  readonly note?: string;
  /** How many things the group holds, summed into the answer's words.
   *  Default 1, so the sum counts the groups chosen. */
  readonly count?: number;
}

export interface AskOptions {
  /** The dialog's heading. Default: the message is the heading. */
  readonly title?: string;
  /** The answering button's words. Default "OK". With `choices`, a function
   *  of the chosen groups' count, such as `(n) => \`Delete ${n} files\``. */
  readonly confirmLabel?: string | ((count: number) => string);
  /** The declining button's words. Default "Cancel". */
  readonly cancelLabel?: string;
  /** `"danger"` paints the answer in the danger tone. Default none. */
  readonly tone?: "danger";
  /** What takes focus as the question opens: the answer (the first choice,
   *  when there are choices) or the declining button. Default `"decline"`
   *  with `tone: "danger"`, else `"answer"`. A value question focuses its field. */
  readonly focus?: "answer" | "decline";
  /** A drawing from `@cplieger/ui/icons` to lead the question with. */
  readonly icon?: Element;
  /** Facts to see before answering, as label and value pairs, in order. */
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  /** Ask for a value instead of a yes or no. */
  readonly input?: AskInput | true;
  /** Ask which groups the action takes, none chosen to start; the answer
   *  stays disabled until one is. */
  readonly choices?: readonly AskChoice[];
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

function checkChoices(choices: unknown): void {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TypeError("ask: choices must be a non-empty array");
  }
  const values = new Set<string>();
  for (const c of choices as unknown[]) {
    const entry = c as { value?: unknown; label?: unknown; note?: unknown; count?: unknown } | null;
    if (typeof entry?.value !== "string" || typeof entry.label !== "string") {
      throw new TypeError("ask: each of choices needs a string value and label");
    }
    if (entry.note !== undefined && typeof entry.note !== "string") {
      throw new TypeError("ask: a choice's note must be a string");
    }
    if (
      entry.count !== undefined &&
      (typeof entry.count !== "number" || !Number.isInteger(entry.count) || entry.count < 0)
    ) {
      throw new TypeError("ask: a choice's count must be a whole number of 0 or more");
    }
    if (values.has(entry.value)) {
      throw new TypeError(`ask: two choices share the value "${entry.value}"`);
    }
    values.add(entry.value);
  }
}

function checkOptions(opts: AskOptions): void {
  const { tone, focus, input, choices, confirmLabel } = opts as {
    tone?: unknown;
    focus?: unknown;
    input?: unknown;
    choices?: unknown;
    confirmLabel?: unknown;
  };
  if (tone !== undefined && tone !== "danger") {
    throw new TypeError('ask: tone must be "danger" or left out');
  }
  if (focus !== undefined && focus !== "answer" && focus !== "decline") {
    throw new TypeError('ask: focus must be "answer" or "decline"');
  }
  checkDetails(opts.details);
  if (choices !== undefined) {
    if (input !== undefined) {
      throw new TypeError("ask: give input or choices, not both");
    }
    checkChoices(choices);
  } else if (typeof confirmLabel === "function") {
    throw new TypeError("ask: a confirmLabel function needs choices to count");
  }
}

/** Asks a yes or no question; resolves true for the answer, false otherwise. */
export function ask(
  message: string,
  opts?: AskOptions & {
    readonly input?: undefined;
    readonly choices?: undefined;
    readonly confirmLabel?: string;
  },
): Promise<boolean>;
/** Asks for a value; resolves its text, or null when the person declines. */
export function ask(
  message: string,
  opts: AskOptions & {
    readonly input: AskInput | true;
    readonly choices?: undefined;
    readonly confirmLabel?: string;
  },
): Promise<string | null>;
/** Asks which groups the action takes; resolves the chosen values in their
 *  order, or null when the person declines. */
export function ask(
  message: string,
  opts: AskOptions & { readonly choices: readonly AskChoice[]; readonly input?: undefined },
): Promise<readonly string[] | null>;
export function ask(
  message: string,
  opts: AskOptions = {},
): Promise<boolean | string | readonly string[] | null> {
  checkOptions(opts);
  current?.settle();

  const input = opts.input === true ? {} : opts.input;
  const dialog = node("dialog", "cp-dialog");
  dialog.dataset["variant"] = "confirm";
  const id = `cp-ask-${String(++seq)}`;
  const titleId = `${id}-title`;
  dialog.setAttribute("aria-labelledby", titleId);
  if (input === undefined) {
    dialog.setAttribute("role", "alertdialog");
  }
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
  let wordsId = titleId;
  if (opts.title !== undefined) {
    const words = node("p", undefined, message);
    wordsId = `${id}-words`;
    words.id = wordsId;
    dialog.setAttribute("aria-describedby", wordsId);
    text.append(words);
  }
  if (opts.details !== undefined && opts.details.length > 0) {
    const list = node("dl", "cp-facts");
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
  const boxes: { box: HTMLInputElement; choice: AskChoice }[] = [];
  if (opts.choices !== undefined) {
    const set = node("fieldset", "cp-choices");
    set.setAttribute("aria-labelledby", wordsId);
    for (const choice of opts.choices) {
      const box = node("input", "cp-checkbox");
      box.type = "checkbox";
      box.value = choice.value;
      const words = node("span", undefined, choice.label);
      if (choice.note !== undefined) {
        words.append(node("small", undefined, choice.note));
      }
      const row = node("label", "cp-choice");
      row.append(box, words);
      set.append(row);
      boxes.push({ box, choice });
    }
    text.append(set);
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
  const confirm = node("button", "cp-button");
  confirm.value = "confirm";
  confirm.dataset["variant"] = "primary";
  if (opts.tone === "danger") {
    confirm.dataset["tone"] = "danger";
  }
  const label = opts.confirmLabel ?? "OK";
  const words = (count: number): string => (typeof label === "function" ? label(count) : label);
  const chosen = (): AskChoice[] => boxes.filter((b) => b.box.checked).map((b) => b.choice);
  const relabel = (): void => {
    const picked = chosen();
    confirm.textContent = words(picked.reduce((sum, c) => sum + (c.count ?? 1), 0));
    confirm.disabled = picked.length === 0;
  };
  if (boxes.length > 0) {
    relabel();
    form.addEventListener("change", relabel);
  } else {
    confirm.textContent = words(0);
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
      if (field !== null) {
        resolve(yes ? field.value : null);
      } else if (boxes.length > 0) {
        resolve(yes ? chosen().map((c) => c.value) : null);
      } else {
        resolve(yes);
      }
      if (dialog.open) {
        dialog.close("cancel");
      }
      dialog.remove();
    };
    current = { dialog, settle };
    dialog.addEventListener("close", settle, { once: true });
    dialog.showModal();
    const focus = opts.focus ?? (opts.tone === "danger" ? "decline" : "answer");
    const answer = boxes[0]?.box ?? confirm;
    (field ?? (focus === "decline" ? cancel : answer)).focus();
  });
}
