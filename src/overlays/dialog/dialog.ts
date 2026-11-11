/**
 * dialog.ts — what a native `<dialog class="cp-dialog">` lacks in some
 * engines. Buttons open and close it with `commandfor`, and the modal dialog
 * itself moves focus in, makes the page inert and returns focus. This adds:
 * a press outside closes a dialog marked `closedby="any"` where the engine
 * does not, a dialog marked `data-keep-typed` that holds typed changes
 * shakes instead of closing on that press, a dialog `holdDialog` holds
 * shakes instead of closing on Escape or that press, and the exit animation
 * runs in an engine that cannot animate a dialog leaving the top layer.
 * @module
 */

import { reducedMotion, shared } from "../../core/lifetime/lifetime.js";

export interface DialogOptions {
  /** Ends this call's hold on the listeners. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const KEEP = "data-keep-typed";
const LEAVING = "data-cp-leaving";
const REFUSED = "data-cp-refused";

const nativeClosedBy = (): boolean => "closedBy" in HTMLDialogElement.prototype;
/** Chromium animates a dialog out of the top layer in CSS; Firefox and
 *  WebKit drop it at once, so the exit runs in script there. */
const cssExit = (): boolean => CSS.supports("overlay", "auto");

function dialogOf(e: Event): HTMLDialogElement | null {
  const t = e.composedPath()[0];
  return t instanceof HTMLDialogElement && t.classList.contains("cp-dialog") ? t : null;
}

const holds = new WeakMap<HTMLDialogElement, () => boolean>();

export interface HoldOptions {
  /** Ends the hold. */
  readonly signal?: AbortSignal;
}

/**
 * While `held()` is true, Escape and a press outside shake `dialog` and keep
 * it open, as for a secret shown once that has not been copied. A close the
 * person chooses, a `command="close"` button or a form's submit, still
 * closes it. Needs `installDialogs()`.
 */
export function holdDialog(
  dialog: HTMLDialogElement,
  held: () => boolean,
  options: HoldOptions = {},
): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  holds.set(dialog, held);
  signal?.addEventListener(
    "abort",
    () => {
      if (holds.get(dialog) === held) {
        holds.delete(dialog);
      }
    },
    { once: true },
  );
}

const isHeld = (dialog: HTMLDialogElement): boolean => holds.get(dialog)?.() === true;

/** Whether the person changed a field from the value it opened with. */
export function holdsTypedChanges(dialog: HTMLDialogElement): boolean {
  return [
    ...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
  ].some((f) => {
    if (f instanceof HTMLSelectElement) {
      return [...f.options].some((o) => o.selected !== o.defaultSelected);
    }
    if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio")) {
      return f.checked !== f.defaultChecked;
    }
    return f.value !== f.defaultValue;
  });
}

/** A press on the backdrop: the event's target is the dialog itself, at a
 *  point outside its box. */
function outside(dialog: HTMLDialogElement, e: MouseEvent): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

function refuse(dialog: HTMLDialogElement): void {
  dialog.removeAttribute(REFUSED);
  dialog.getBoundingClientRect();
  dialog.setAttribute(REFUSED, "");
}

/**
 * Closes `dialog` with `value` as its `returnValue`, playing its exit first
 * where the engine cannot animate it in CSS. A dialog already leaving or
 * closed is left alone.
 */
export function closeDialog(dialog: HTMLDialogElement, value?: string): void {
  if (!dialog.open || dialog.hasAttribute(LEAVING)) {
    return;
  }
  if (cssExit() || reducedMotion() || !dialog.isConnected) {
    dialog.close(value);
    return;
  }
  dialog.setAttribute(LEAVING, "");
  const sheet = dialog.dataset["variant"] === "sheet";
  const rtl = getComputedStyle(dialog).direction === "rtl";
  const frames = sheet
    ? [{ translate: "0 0" }, { translate: rtl ? "-100% 0" : "100% 0" }]
    : [
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 0.96 },
      ];
  const exit = dialog.animate(frames, {
    duration: sheet ? 280 : 160,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    fill: "forwards",
  });
  void exit.finished.then(
    () => {
      dialog.removeAttribute(LEAVING);
      dialog.close(value);
      exit.cancel();
    },
    () => {
      dialog.removeAttribute(LEAVING);
    },
  );
}

/** The root scrollbar's width, which the stylesheet pads the page by while a
 *  modal dialog stops it scrolling. Measured while no modal is open, since
 *  the lock removes the scrollbar. */
function measureScrollbar(): void {
  if (document.querySelector("dialog:modal") === null) {
    const w = innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--cp-scrollbar-w", `${String(Math.max(0, w))}px`);
  }
}

function listen(signal: AbortSignal): void {
  const on = { capture: true, signal };
  measureScrollbar();
  addEventListener("resize", measureScrollbar, { signal });
  signal.addEventListener(
    "abort",
    () => {
      document.documentElement.style.removeProperty("--cp-scrollbar-w");
    },
    { once: true },
  );
  let startedOutside: HTMLDialogElement | null = null;

  document.addEventListener(
    "pointerdown",
    (e) => {
      const d = dialogOf(e);
      startedOutside = d !== null && outside(d, e) ? d : null;
    },
    on,
  );
  document.addEventListener(
    "click",
    (e) => {
      const d = dialogOf(e);
      // The press must start and end outside, so a drag out of a field
      // closes nothing.
      if (d === null || d !== startedOutside || !outside(d, e)) {
        return;
      }
      startedOutside = null;
      if (isHeld(d)) {
        refuse(d);
        return;
      }
      if (d.hasAttribute(KEEP)) {
        if (holdsTypedChanges(d)) {
          refuse(d);
        } else {
          closeDialog(d, "cancel");
        }
        return;
      }
      if (d.getAttribute("closedby") === "any" && !nativeClosedBy()) {
        closeDialog(d, "cancel");
      }
    },
    on,
  );
  document.addEventListener(
    "animationend",
    (e) => {
      const d = dialogOf(e);
      d?.removeAttribute(REFUSED);
    },
    on,
  );
  // Escape on a held dialog is refused before the engine turns it into a
  // close request, in the bubble phase, so a field inside that took the key,
  // such as a combobox closing its list, keeps it. The cancel below refuses
  // light dismiss too.
  document.addEventListener(
    "keydown",
    (e) => {
      const t = e.target;
      const d = e.key === "Escape" && t instanceof Element ? t.closest("dialog") : null;
      if (d instanceof HTMLDialogElement && d.open && !e.defaultPrevented && isHeld(d)) {
        e.preventDefault();
        refuse(d);
      }
    },
    { signal },
  );
  document.addEventListener(
    "cancel",
    (e) => {
      const d = dialogOf(e);
      if (d === null) {
        return;
      }
      if (isHeld(d)) {
        e.preventDefault();
        refuse(d);
      } else if (!cssExit() && !reducedMotion()) {
        // Escape ends the dialog at once in these engines; it goes through
        // closeDialog instead, for the exit.
        e.preventDefault();
        closeDialog(d, "cancel");
      }
    },
    on,
  );
  if (cssExit()) {
    return;
  }
  // A <form method="dialog"> and a close command end the dialog at once in
  // these engines; each goes through closeDialog instead.
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.method !== "dialog" || reducedMotion()) {
        return;
      }
      const d = form.closest("dialog");
      if (d instanceof HTMLDialogElement && d.classList.contains("cp-dialog")) {
        e.preventDefault();
        const submitter = e.submitter;
        closeDialog(d, submitter instanceof HTMLButtonElement ? submitter.value : "");
      }
    },
    on,
  );
  document.addEventListener(
    "command",
    (e) => {
      const d = dialogOf(e);
      if (
        d !== null &&
        (e as Event & { command?: string }).command === "close" &&
        !reducedMotion()
      ) {
        e.preventDefault();
        closeDialog(d, "");
      }
    },
    on,
  );
}

const page = shared((signal) => {
  listen(signal);
});

/**
 * Starts the dialog fill-ins, once for the page however many parts of it
 * call this. The listeners stay until every caller's signal has aborted; a
 * caller with no signal holds them for the page's life.
 */
export function installDialogs(options: DialogOptions = {}): void {
  page.install(options);
}
