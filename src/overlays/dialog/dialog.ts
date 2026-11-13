/**
 * dialog.ts — what a native `<dialog class="cp-dialog">` lacks in some
 * engines: a press outside closing a `closedby="any"` dialog, a shake in
 * place of closing for `data-keep-typed` or `holdDialog`, said to a screen
 * reader, the question `./form`'s unsaved-changes guard asks before a close
 * drops a change, and the exit animation out of the top layer.
 * @module
 */

import { reducedMotion, shared } from "../../core/lifetime/lifetime.js";
import { announce } from "../../feedback/announce/announce.js";
import { changesIn } from "../../forms/form/changed.js";
import { type Asker, askerOf } from "./asker.js";

export interface DialogOptions {
  /** Ends this call's hold on the listeners. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const KEEP = "data-keep-typed";
const LEAVING = "data-cp-leaving";
const REFUSED = "data-cp-refused";
const KEPT = "Your changes are still here. Save them, or cancel to drop them.";

const nativeClosedBy = (): boolean => "closedBy" in HTMLDialogElement.prototype;
/** Chromium animates a dialog out of the top layer in CSS; Firefox and
 *  WebKit drop it at once, so the exit runs in script there. */
const cssExit = (): boolean => CSS.supports("overlay", "auto");

function dialogOf(e: Event): HTMLDialogElement | null {
  const t = e.composedPath()[0];
  return t instanceof HTMLDialogElement && t.classList.contains("cp-dialog") ? t : null;
}

interface Hold {
  readonly held: () => boolean;
  readonly say: string | undefined;
}

const holds = new WeakMap<HTMLDialogElement, Hold>();

export interface HoldOptions {
  /** Said to a screen reader each time a close is refused, such as what
   *  to do before the dialog closes. Default: nothing said. */
  readonly say?: string;
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
  const { say, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  holds.set(dialog, { held, say });
  signal?.addEventListener(
    "abort",
    () => {
      if (holds.get(dialog)?.held === held) {
        holds.delete(dialog);
      }
    },
    { once: true },
  );
}

const isHeld = (dialog: HTMLDialogElement): boolean => holds.get(dialog)?.held() === true;

/** Whether a guard's question waits, or for a dialog with none, whether a
 *  field holds a change of the person's. */
const holdsChanges = (dialog: HTMLDialogElement): boolean =>
  askerOf(dialog)?.waiting() ?? changesIn(dialog).length > 0;

const asking = new WeakSet<HTMLDialogElement>();

/** Asks `asker`'s question, once at a time, and closes `dialog` on a yes. */
function askThenClose(dialog: HTMLDialogElement, asker: Asker, value: string): void {
  if (asking.has(dialog)) {
    return;
  }
  asking.add(dialog);
  void asker.ask().then((yes) => {
    asking.delete(dialog);
    if (yes) {
      dialog.addEventListener("close", asker.dropped, { once: true });
      closeDialog(dialog, value);
    }
  });
}

/** The guard's question for `dialog` while a close would drop a change. */
const waitingAsker = (dialog: HTMLDialogElement): Asker | undefined => {
  const a = askerOf(dialog);
  return a?.waiting() === true ? a : undefined;
};

/** A press on the backdrop: the event's target is the dialog itself, at a
 *  point outside its box. */
function outside(dialog: HTMLDialogElement, e: MouseEvent): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/** Shakes `dialog` and says why it stays, if `say` is given. */
function refuse(dialog: HTMLDialogElement, say: string | undefined): void {
  dialog.removeAttribute(REFUSED);
  dialog.getBoundingClientRect();
  dialog.setAttribute(REFUSED, "");
  if (say !== undefined) {
    announce(say);
  }
}

const refuseHeld = (dialog: HTMLDialogElement): void => {
  refuse(dialog, holds.get(dialog)?.say);
};

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
        refuseHeld(d);
        return;
      }
      if (d.hasAttribute(KEEP)) {
        if (holdsChanges(d)) {
          refuse(d, KEPT);
        } else {
          closeDialog(d, "cancel");
        }
        return;
      }
      if (d.getAttribute("closedby") === "any" && !nativeClosedBy()) {
        const a = waitingAsker(d);
        if (a === undefined) {
          closeDialog(d, "cancel");
        } else {
          askThenClose(d, a, "cancel");
        }
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
  // Escape on a held or guarded dialog is stopped before the engine turns it
  // into a close request, in the bubble phase, so a field inside that took
  // the key, such as a combobox closing its list, keeps it. The cancel below
  // covers light dismiss and other close requests.
  document.addEventListener(
    "keydown",
    (e) => {
      const t = e.target;
      const d = e.key === "Escape" && t instanceof Element ? t.closest("dialog") : null;
      if (!(d instanceof HTMLDialogElement) || !d.open || e.defaultPrevented) {
        return;
      }
      const a = waitingAsker(d);
      if (isHeld(d)) {
        e.preventDefault();
        refuseHeld(d);
      } else if (a !== undefined) {
        e.preventDefault();
        askThenClose(d, a, "cancel");
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
      const a = waitingAsker(d);
      if (isHeld(d)) {
        e.preventDefault();
        refuseHeld(d);
      } else if (a !== undefined) {
        e.preventDefault();
        askThenClose(d, a, "cancel");
      } else if (!cssExit() && !reducedMotion()) {
        // Escape ends the dialog at once in these engines; it goes through
        // closeDialog instead, for the exit.
        e.preventDefault();
        closeDialog(d, "cancel");
      }
    },
    on,
  );
  // A close command on a guarded dialog asks first. Where the engine cannot
  // animate the exit in CSS, the command goes through closeDialog for it.
  document.addEventListener(
    "command",
    (e) => {
      const d = dialogOf(e);
      if (d === null || (e as Event & { command?: string }).command !== "close") {
        return;
      }
      const a = waitingAsker(d);
      if (a !== undefined) {
        e.preventDefault();
        askThenClose(d, a, "");
      } else if (!cssExit() && !reducedMotion()) {
        e.preventDefault();
        closeDialog(d, "");
      }
    },
    on,
  );
  if (cssExit()) {
    return;
  }
  // A <form method="dialog"> ends the dialog at once in these engines; it
  // goes through closeDialog instead.
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
