/**
 * secret.ts — secrets in a form. `enhanceSecret()` drives a saved secret,
 * whose value never comes back to the browser: Replace opens an empty field,
 * and Keep saved value goes back to Saved with nothing sent. `enhanceReveal()`
 * makes a button show and hide a password field's text. `shownOnce()` holds
 * a dialog that shows a new secret until it is copied, and clears it.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";
import { holdDialog } from "../../overlays/dialog/dialog.js";

export interface SecretOptions {
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

function clear(input: HTMLInputElement): void {
  if (input.value !== "") {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * `secret` is a `.cp-secret` with `data-cp-state="saved"`, a part
 * `data-part="saved"` holding the Replace button, and a part
 * `data-part="edit"` holding the field and a `data-part="keep"` button.
 * While saved, the field is disabled, so a form leaves it out.
 */
export function enhanceSecret(secret: HTMLElement, options: SecretOptions = {}): void {
  const { signal } = options;
  const replace = secret.querySelector<HTMLButtonElement>("[data-part='saved'] button");
  const keep = secret.querySelector<HTMLButtonElement>("[data-part='keep']");
  const input = secret.querySelector<HTMLInputElement>("[data-part='edit'] input");
  if (replace === null || keep === null || input === null || signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const show = (state: "saved" | "edit"): void => {
    secret.dataset["cpState"] = state;
    input.disabled = state === "saved";
  };
  show(secret.dataset["cpState"] === "edit" ? "edit" : "saved");
  replace.addEventListener(
    "click",
    () => {
      show("edit");
      clear(input);
      input.focus();
    },
    listen,
  );
  keep.addEventListener(
    "click",
    () => {
      clear(input);
      show("saved");
      replace.focus();
    },
    listen,
  );
}

/**
 * `button`, inside the field's `.cp-input-wrap`, keeps its own name, such as
 * "Show password", and `aria-pressed` says whether the text shows. It holds
 * the drawing at rest and one marked `data-part="on"`, shown while pressed.
 */
export function enhanceReveal(
  button: HTMLButtonElement,
  input: HTMLInputElement,
  options: SecretOptions = {},
): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  button.setAttribute("aria-pressed", String(input.type !== "password"));
  button.addEventListener(
    "click",
    () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
    },
    until(signal),
  );
}

export interface ShownOnceOptions {
  /** The dialog the secret shows in, held open until it is copied. */
  readonly dialog?: HTMLDialogElement;
  /** Ends the hold and the clearing. */
  readonly signal?: AbortSignal;
}

export interface ShownOnce {
  /** The person copied the secret: the dialog closes as any other. */
  copied(): void;
}

/**
 * Shows `secret`, an element whose text is a new key or link, once. Until
 * `copied()` runs, Escape and a press outside shake `dialog` and keep it;
 * Done or Cancel still close it. The text is cleared when the dialog closes
 * and when the page is hidden, so it never comes back from the back-forward
 * cache. Pass `copied` as `enhanceCopy`'s `onCopy`.
 */
export function shownOnce(secret: HTMLElement, options: ShownOnceOptions = {}): ShownOnce {
  const { dialog, signal } = options;
  let isCopied = false;
  const clear = (): void => {
    if (secret instanceof HTMLInputElement || secret instanceof HTMLTextAreaElement) {
      secret.value = "";
      secret.defaultValue = "";
    } else {
      secret.textContent = "";
    }
  };
  if (signal?.aborted === true) {
    return { copied: () => undefined };
  }
  const listen = until(signal);
  if (dialog !== undefined) {
    holdDialog(dialog, () => !isCopied, signal === undefined ? {} : { signal });
    dialog.addEventListener("close", clear, listen);
  }
  addEventListener("pagehide", clear, listen);
  return {
    copied() {
      isCopied = true;
    },
  };
}
