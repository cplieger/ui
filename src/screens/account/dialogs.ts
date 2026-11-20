/**
 * dialogs.ts — the `.cp-dialog` an Account and security action asks in:
 * its heading, its sentence, a notice slot, Cancel and its primary, held
 * open while a request runs, and focus back to the opener as it closes.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { closeDialog, holdDialog, installDialogs } from "../../overlays/dialog/dialog.js";
import { actionButton, el, heading } from "./dom.js";
import { cycle, slot, type Slot } from "./screen.js";

interface FormDialogSpec {
  readonly title: string;
  readonly sentence?: string;
  /** The primary's words, busy words and done words. */
  readonly submit: string;
  readonly busy: string;
  readonly done: string | false;
  readonly cancel: string;
  /** Takes focus as the dialog closes. Default: what had focus as it
   *  opened. */
  readonly opener?: HTMLElement;
  readonly signal?: AbortSignal;
}

export interface FormDialog {
  readonly form: HTMLFormElement;
  /** Where the fields go, after the sentence and the notice slot. */
  readonly stack: HTMLElement;
  readonly notices: Slot;
  readonly submit: HTMLButtonElement;
  /**
   * Runs `work` on `confirm`'s cycle, the primary's by default, holding
   * the dialog and Cancel while it runs; answers as `cycle` does.
   */
  run<T>(
    work: () => Promise<T>,
    ok: (answer: T) => boolean,
    confirm?: Confirm,
  ): Promise<{ readonly answer: T } | undefined>;
  /** Whether a request is running. */
  busy(): boolean;
  close(): void;
  /** Settles once the dialog has closed, by any way. */
  readonly closed: Promise<void>;
}

export function formDialog(spec: FormDialogSpec): FormDialog {
  const { signal } = spec;
  const life = signal === undefined ? {} : { signal };
  installDialogs(life);
  const opener =
    spec.opener ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  const dialog = el("dialog", "cp-dialog");
  const form = el("form");
  form.noValidate = true;
  const head = el("header");
  const h = heading(2, spec.title);
  head.append(h);
  dialog.setAttribute("aria-labelledby", h.id);
  const body = el("div", "cp-dialog-body");
  const stack = el("div", "cp-stack");
  if (spec.sentence !== undefined) {
    const p = el("p", undefined, spec.sentence);
    p.id = `${h.id}-sentence`;
    dialog.setAttribute("aria-describedby", p.id);
    stack.append(p);
  }
  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  stack.append(notices.root);
  body.append(stack);
  const footer = el("footer");
  const cancel = el("button", "cp-button", spec.cancel);
  cancel.type = "button";
  const submit = actionButton(spec.submit, { primary: true, type: "submit" });
  const main = enhanceConfirm(submit, { busy: spec.busy, done: spec.done, ...life });
  footer.append(cancel, submit);
  form.append(head, body, footer);
  dialog.append(form);

  let running = 0;
  const busy = (): boolean => running > 0;
  holdDialog(dialog, busy, life);
  cancel.addEventListener("click", () => {
    if (!busy()) {
      closeDialog(dialog, "cancel");
    }
  });
  const closed = new Promise<void>((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        if (opener?.isConnected === true) {
          opener.focus();
        }
        resolve();
      },
      { once: true },
    );
  });
  signal?.addEventListener(
    "abort",
    () => {
      closeDialog(dialog, "cancel");
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();

  return {
    form,
    stack,
    notices,
    submit,
    async run(work, ok, confirm = main) {
      running += 1;
      cancel.setAttribute("aria-disabled", "true");
      try {
        return await cycle(confirm, work, ok);
      } finally {
        running -= 1;
        if (running === 0) {
          cancel.removeAttribute("aria-disabled");
        }
      }
    },
    busy,
    close() {
      closeDialog(dialog, "done");
    },
    closed,
  };
}
