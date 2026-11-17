/**
 * shown.ts — a secret shown once in its own `.cp-dialog`, as
 * docs/design-account.md "Secrets shown once" says: the warning, the
 * secret in a `.cp-code` with Copy, and held open until it is copied or,
 * with `saved`, until the person says they saved it.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { enhanceCopy } from "../../forms/copy/copy.js";
import { shownOnce } from "../../forms/secret/secret.js";
import { closeDialog, holdDialog, installDialogs } from "../../overlays/dialog/dialog.js";
import { glyph } from "../../foundations/icons/glyph.js";
import { el, heading, notice, uid } from "./dom.js";
import { isHeld } from "./screen.js";
import type { AccountWords } from "./words.js";

export interface ShownSpec {
  readonly title: string;
  /** The sentence under the warning. */
  readonly line?: string;
  /** The secret's label. */
  readonly label: string;
  readonly secret: string;
  /** Offers the secret as a text file of this name. */
  readonly download?: string;
  /** A muted line under the secret, such as where to keep it; a node goes
   *  in as it is. */
  readonly help?: string | Node;
  /** A box the person checks once they saved the secret; the dialog stays
   *  open until it is checked. */
  readonly saved?: { readonly label: string; readonly first: string };
  /** The closing button's words. Default `shown.done`. */
  readonly done?: string;
}

/** Shows `spec.secret` once; resolves when the dialog has closed. */
export function showSecret(spec: ShownSpec, w: AccountWords, signal?: AbortSignal): Promise<void> {
  const life = signal === undefined ? {} : { signal };
  installDialogs(life);
  const dialog = el("dialog", "cp-dialog");
  const h = heading(2, spec.title);
  dialog.setAttribute("aria-labelledby", h.id);
  const head = el("header");
  head.append(h);
  const stack = el("div", "cp-stack");
  stack.append(notice("warning", w["shown.warning"]));
  if (spec.line !== undefined) {
    stack.append(el("p", undefined, spec.line));
  }

  const box = el("div", "cp-field");
  const label = el("span", "cp-label", spec.label);
  label.id = uid("secret");
  const code = el("div", "cp-code");
  code.setAttribute("role", "group");
  code.setAttribute("aria-labelledby", label.id);
  const text = el("code", "cp-mono", spec.secret);
  // `.cp-code > code` scrolls a long secret sideways; the arrow keys reach
  // the rest only once it takes focus.
  text.tabIndex = 0;
  const copy = el("button", "cp-button cp-copy");
  copy.type = "button";
  copy.append(glyph("copy"), glyph("check", "done"), w["shown.copy"]);
  code.append(text, copy);
  box.append(label, code);
  stack.append(box);

  const kept = shownOnce(text, { ...(spec.saved === undefined ? { dialog } : {}), ...life });
  enhanceCopy(copy, {
    source: text,
    copied: w["shown.copied"],
    ...(spec.saved === undefined
      ? {
          onCopy: () => {
            kept.copied();
          },
        }
      : {}),
    ...life,
  });

  let url: string | undefined;
  if (spec.download !== undefined) {
    url = URL.createObjectURL(new Blob([`${spec.secret}\n`], { type: "text/plain" }));
    const a = el("a", "cp-button");
    a.href = url;
    a.download = spec.download;
    a.append(glyph("download"), w["shown.download"]);
    const actions = el("div", "cp-cluster");
    actions.append(a);
    stack.append(actions);
  }
  if (spec.help !== undefined) {
    stack.append(typeof spec.help === "string" ? el("p", "cp-help", spec.help) : spec.help);
  }

  const done = el("button", "cp-button", spec.done ?? w["shown.done"]);
  done.type = "button";
  done.dataset["variant"] = "primary";
  if (spec.saved !== undefined) {
    const { saved } = spec;
    const choice = el("label", "cp-choice");
    const check = el("input", "cp-checkbox");
    check.type = "checkbox";
    choice.append(check, el("span", undefined, saved.label));
    stack.append(choice);
    done.setAttribute("aria-disabled", "true");
    check.addEventListener(
      "change",
      () => {
        if (check.checked) {
          done.removeAttribute("aria-disabled");
        } else {
          done.setAttribute("aria-disabled", "true");
        }
      },
      life,
    );
    holdDialog(dialog, () => !check.checked, { say: saved.first, ...life });
    dialog.addEventListener(
      "close",
      () => {
        text.textContent = "";
      },
      { once: true },
    );
    done.addEventListener(
      "click",
      () => {
        if (isHeld(done)) {
          announce(saved.first);
        }
      },
      life,
    );
  }
  done.addEventListener(
    "click",
    () => {
      if (!isHeld(done)) {
        closeDialog(dialog, "done");
      }
    },
    life,
  );

  const body = el("div", "cp-dialog-body");
  body.append(stack);
  const footer = el("footer");
  footer.append(done);
  const form = el("form");
  form.method = "dialog";
  form.append(head, body, footer);
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  copy.focus();
  announce(`${spec.title}. ${w["shown.warning"]}`);
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        if (url !== undefined) {
          URL.revokeObjectURL(url);
        }
        dialog.remove();
        resolve();
      },
      { once: true },
    );
    signal?.addEventListener(
      "abort",
      () => {
        closeDialog(dialog, "cancel");
      },
      { once: true },
    );
  });
}
