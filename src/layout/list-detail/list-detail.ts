/**
 * list-detail.ts — `enhanceListDetail()` docks a list's detail beside the
 * list once the box holding both is wide enough, and shows the same detail
 * in a full-height sheet below that width. The app's route decides when the
 * detail shows: it calls `open()` when the route names an entry and
 * `close()` when it does not, so Back closes the detail.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { closeDialog } from "../../overlays/dialog/dialog.js";

export interface ListDetailOptions {
  /** Closes the detail and removes the listeners and the sheet. Default:
   *  none, kept for the page's life. */
  readonly signal?: AbortSignal;
  /** The box's width, in rem, from which the detail docks. Default 52. */
  readonly dockAt?: number;
  /** Close, Escape, a press outside the sheet, or the engine closing the
   *  sheet itself. The app goes back, and its route then calls `close()`.
   *  An engine close before the route has answered is not passed on.
   *  Default: `close()`. */
  readonly onDismiss?: () => void;
}

export interface OpenOptions {
  /** Shows the detail without its entrance, as for a page that loads with
   *  an entry open, since nothing animates on load. Default false. */
  readonly still?: boolean;
}

export interface ListDetail {
  /** Shows the detail, docked or in its sheet, and focuses its heading. */
  open(options?: OpenOptions): void;
  /** Hides the detail and returns focus to what had it before `open()`,
   *  or before a later `open()` made from outside the shown detail. The
   *  sheet keeps the detail until its exit has played. */
  close(): void;
}

const DOCKED = "data-cp-docked";
const CLOSE = "[data-detail-close]";
const STILL = "data-cp-still";

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function restore(to: Element | null): void {
  if (to instanceof HTMLElement && to.isConnected) {
    to.focus();
  }
}

/**
 * `root` is a `.cp-list-detail` whose `.cp-detail` child holds a header with
 * its heading and any `[data-detail-close]` buttons, and starts `hidden`.
 * Throws a TypeError when `root` has no such child.
 */
export function enhanceListDetail(root: HTMLElement, options: ListDetailOptions = {}): ListDetail {
  const detail = root.querySelector<HTMLElement>(":scope > .cp-detail");
  if (detail === null) {
    throw new TypeError("enhanceListDetail: root has no .cp-detail child");
  }
  const { signal, onDismiss } = options;
  const listen = until(signal);
  const dockAt = options.dockAt ?? 52;

  const dialog = document.createElement("dialog");
  dialog.className = "cp-dialog cp-detail-dialog";
  dialog.dataset["variant"] = "sheet";
  const labelledBy = detail.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    dialog.setAttribute("aria-labelledby", labelledBy);
  }
  root.after(dialog);

  let shown = false;
  /** Where the shown detail sits; null while it is hidden. */
  let at: "dock" | "dialog" | null = null;
  let opener: Element | null = null;
  /** The opener while the sheet's exit plays in script: the page stays
   *  inert until the dialog closes. */
  let returnTo: Element | null = null;
  /** Counts opens and closes, so an exit that ends after the next open
   *  leaves the detail where it is. */
  let turn = 0;
  let still = 0;
  /** onDismiss has been called since the last open(): the engine closing
   *  the sheet while the route works on it is not a second dismissal. */
  let asked = false;

  const heading = (): HTMLElement | null =>
    detail.querySelector<HTMLElement>(":scope > header > :is(h1, h2, h3, h4)");

  /** Stops the sheet's motion until the still state has painted. */
  const holdStill = (): void => {
    dialog.setAttribute(STILL, "");
    cancelAnimationFrame(still);
    // Two frames: the still state paints before the motion returns.
    still = requestAnimationFrame(() => {
      still = requestAnimationFrame(() => {
        dialog.removeAttribute(STILL);
      });
    });
  };

  const stow = (): void => {
    detail.hidden = true;
    root.append(detail);
  };

  /** Puts the shown detail where the box's width says. A move between the
   *  dock and the sheet is not an open, so it plays no motion. */
  const place = (opening: boolean): void => {
    if (!opening && at === "dialog" && !dialog.open) {
      // Closed outside the module, its close event still queued: that
      // event dismisses, and reopening here would strand the route.
      return;
    }
    const want = root.getBoundingClientRect().width >= dockAt * remPx() ? "dock" : "dialog";
    if (want === at && (want === "dock" || dialog.open)) {
      if (opening) {
        heading()?.focus();
      }
      return;
    }
    const moving = at !== null && at !== want;
    const hadFocus = moving && detail.contains(document.activeElement);
    if (moving) {
      // The docked detail keeps it until the next open, since dropping
      // `animation: none` would start its entrance.
      detail.setAttribute(STILL, "");
      holdStill();
    }
    at = want;
    if (want === "dock") {
      // Out of the dialog before it closes: WebKit's close otherwise sends
      // focus to the body after the heading has taken it.
      root.append(detail);
      root.setAttribute(DOCKED, "");
      if (dialog.open) {
        dialog.close();
      }
    } else {
      root.removeAttribute(DOCKED);
      if (detail.parentElement !== dialog) {
        dialog.append(detail);
      }
      if (dialog.open) {
        // Opened again while closeDialog plays the exit: cancelling it
        // keeps the dialog open.
        for (const a of dialog.getAnimations()) {
          a.cancel();
        }
      } else {
        dialog.showModal();
      }
    }
    // showModal() focuses the dialog's first focusable, often Close; the
    // heading names what opened.
    if (opening || hadFocus || want === "dialog") {
      heading()?.focus();
    }
  };

  const hide = (animate: boolean): void => {
    if (!shown) {
      return;
    }
    shown = false;
    asked = false;
    turn += 1;
    const was = at;
    at = null;
    root.removeAttribute(DOCKED);
    const to = opener;
    opener = null;
    if (was === "dialog" && animate) {
      closeDialog(dialog);
    } else if (dialog.open) {
      dialog.close();
    }
    if (dialog.open) {
      returnTo = to;
    } else {
      restore(to);
    }
    // getAnimations() flushes style, so it holds the exit Chromium has
    // just started in CSS.
    const exit = was === "dialog" && animate ? dialog.getAnimations() : [];
    if (exit.length === 0) {
      stow();
      return;
    }
    const mine = turn;
    void Promise.allSettled(exit.map((a) => a.finished)).then(() => {
      if (mine === turn) {
        stow();
      }
    });
  };

  const api: ListDetail = {
    open(opts = {}) {
      asked = false;
      if (!shown) {
        shown = true;
        turn += 1;
        opener = returnTo ?? document.activeElement;
        returnTo = null;
        detail.hidden = false;
        detail.toggleAttribute(STILL, opts.still === true);
        if (opts.still === true) {
          holdStill();
        }
      } else if (
        !dialog.contains(document.activeElement) &&
        !detail.contains(document.activeElement) &&
        document.activeElement !== document.body
      ) {
        // Another entry's link opened the docked detail: Close returns there.
        opener = document.activeElement;
      }
      place(true);
    },
    close() {
      hide(true);
    },
  };

  const dismiss = (): void => {
    if (!shown) {
      return;
    }
    if (onDismiss === undefined) {
      api.close();
    } else {
      asked = true;
      onDismiss();
    }
  };

  // Moving the detail resizes the box, so a move inside the observer's own
  // callback would raise "ResizeObserver loop completed"; it waits a frame.
  let frame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (shown) {
        place(false);
      }
    });
  });
  resize.observe(root);

  dialog.addEventListener(
    "cancel",
    (e) => {
      e.preventDefault();
      dismiss();
    },
    listen,
  );
  dialog.addEventListener(
    "close",
    () => {
      if (!shown) {
        restore(returnTo);
        returnTo = null;
      } else if (at === "dialog" && !dialog.open && !asked) {
        // The engine closed it itself, as Chromium does on a second Escape
        // with no user activation between, so the route has to follow
        // (https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers).
        // A route already asked closes it in its own time: installDialogs'
        // scripted exit can close the sheet first.
        dismiss();
      }
    },
    listen,
  );

  /** A press on the backdrop: its target is the dialog, outside its box. */
  const outside = (e: MouseEvent): boolean => {
    if (e.target !== dialog) {
      return false;
    }
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener(
    "pointerdown",
    (e) => {
      pressedOutside = outside(e);
    },
    listen,
  );
  dialog.addEventListener(
    "click",
    (e) => {
      // The press must start and end outside, so a drag out of the sheet
      // closes nothing.
      if (pressedOutside && outside(e)) {
        dismiss();
      }
      pressedOutside = false;
    },
    listen,
  );
  detail.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest(CLOSE) !== null) {
        dismiss();
      }
    },
    listen,
  );

  const teardown = (): void => {
    resize.disconnect();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(still);
    hide(false);
    // An exit still playing ends here, with the detail back in the box.
    if (dialog.open) {
      dialog.close();
    }
    restore(returnTo);
    returnTo = null;
    turn += 1;
    stow();
    dialog.remove();
  };
  whenAborted(signal, teardown);

  return api;
}
