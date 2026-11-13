/**
 * list-detail.ts — `enhanceListDetail()` docks a list's detail beside the
 * list once the box holding both is wide enough, and shows the same detail
 * in a modal dialog below that width. The app's route decides when the
 * detail shows: it calls `open()` when the route names an entry and
 * `close()` when it does not, so Back closes the detail.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";

export interface ListDetailOptions {
  /** Closes the detail and removes the listeners and the dialog. Default:
   *  none, kept for the page's life. */
  readonly signal?: AbortSignal;
  /** The box's width, in rem, from which the detail docks. Default 52. */
  readonly dockAt?: number;
  /** Close or Escape. The app goes back, and its route then calls
   *  `close()`. Default: `close()`. */
  readonly onDismiss?: () => void;
}

export interface OpenOptions {
  /** Shows the detail without its entrance, as for a page that loads with
   *  an entry open, since nothing animates on load. Default false. */
  readonly still?: boolean;
}

export interface ListDetail {
  /** Shows the detail, docked or in its dialog, and focuses its heading. */
  open(options?: OpenOptions): void;
  /** Hides the detail and returns focus to what had it before `open()`. */
  close(): void;
}

const DOCKED = "data-cp-docked";
const CLOSE = "[data-detail-close]";
const STILL = "data-cp-still";

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
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
  dialog.className = "cp-dialog";
  const labelledBy = detail.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    dialog.setAttribute("aria-labelledby", labelledBy);
  }
  root.after(dialog);

  let shown = false;
  /** Where the shown detail sits; null while it is hidden. */
  let at: "dock" | "dialog" | null = null;
  let opener: Element | null = null;

  const heading = (): HTMLElement | null =>
    detail.querySelector<HTMLElement>(":scope > header > :is(h1, h2, h3, h4)");

  /** Moves the shown detail to where the box's width puts it. */
  const place = (focus: boolean): void => {
    const want = root.getBoundingClientRect().width >= dockAt * remPx() ? "dock" : "dialog";
    if (want === at) {
      if (focus) {
        heading()?.focus();
      }
      return;
    }
    const hadFocus = at !== null && detail.contains(document.activeElement);
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
      dialog.append(detail);
      dialog.showModal();
    }
    // showModal() focuses the dialog's first focusable, often Close; the
    // heading names what opened.
    if (focus || hadFocus || want === "dialog") {
      heading()?.focus();
    }
  };

  let still = 0;
  const api: ListDetail = {
    open(opts = {}) {
      if (!shown) {
        shown = true;
        opener = document.activeElement;
        detail.hidden = false;
        if (opts.still === true) {
          detail.setAttribute(STILL, "");
          dialog.setAttribute(STILL, "");
          cancelAnimationFrame(still);
          // Two frames: the still state paints before the motion returns.
          still = requestAnimationFrame(() => {
            still = requestAnimationFrame(() => {
              detail.removeAttribute(STILL);
              dialog.removeAttribute(STILL);
            });
          });
        }
      }
      place(true);
    },
    close() {
      if (!shown) {
        return;
      }
      shown = false;
      at = null;
      detail.hidden = true;
      root.removeAttribute(DOCKED);
      root.append(detail);
      if (dialog.open) {
        dialog.close();
      }
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
      opener = null;
    },
  };

  const dismiss = (): void => {
    if (onDismiss === undefined) {
      api.close();
    } else {
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
    api.close();
    dialog.remove();
  };
  whenAborted(signal, teardown);

  return api;
}
