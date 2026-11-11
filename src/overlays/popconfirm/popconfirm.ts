/**
 * popconfirm.ts — `enhancePopconfirm()` makes a
 * `.cp-popover[data-variant="confirm"]` a small confirmation next to its
 * button, for a short removal that needs no dialog: a question, a `<form>`
 * whose one submit button confirms, and a `type="button"` decline that
 * takes focus as it opens.
 * @module
 */

import { anchorOf } from "../anchor/anchor.js";
import { until } from "../../core/lifetime/lifetime.js";

export interface PopconfirmOptions {
  /** The person confirmed, by the form's submit. The popover has closed
   *  and focus is back on its opener. */
  readonly onConfirm: () => void;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

let seq = 0;

/**
 * `popover` is a `.cp-popover[data-variant="confirm"]` opened by a button's
 * `popovertarget` or `commandfor`, holding the question in a `<p>` and a
 * `<form>` with its submit button and a `type="button"` decline. Throws a
 * `TypeError` when it holds no form or no decline.
 */
export function enhancePopconfirm(popover: HTMLElement, options: PopconfirmOptions): void {
  const { onConfirm, signal } = options;
  const form = popover.querySelector("form");
  const decline = popover.querySelector<HTMLButtonElement>('button[type="button"]');
  if (form === null || decline === null) {
    throw new TypeError(
      'enhancePopconfirm: the popover needs a <form> and a type="button" decline',
    );
  }
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  if (!popover.hasAttribute("role")) {
    popover.setAttribute("role", "alertdialog");
  }
  const question = popover.querySelector("p");
  if (
    question !== null &&
    !popover.hasAttribute("aria-label") &&
    !popover.hasAttribute("aria-labelledby")
  ) {
    if (question.id === "") {
      question.id = `cp-popconfirm-${String(++seq)}`;
    }
    popover.setAttribute("aria-labelledby", question.id);
  }
  // The popover's own focusing steps move focus as it shows, in the task
  // that opens it; a decline not marked by the page is marked here.
  const marked = decline.autofocus;
  decline.autofocus = true;
  signal?.addEventListener(
    "abort",
    () => {
      decline.autofocus = marked;
    },
    { once: true },
  );
  form.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      popover.hidePopover();
      // Safari focuses no button on a click, so hiding finds no opener to
      // give focus back to.
      anchorOf(popover)?.focus();
      onConfirm();
    },
    listen,
  );
}
