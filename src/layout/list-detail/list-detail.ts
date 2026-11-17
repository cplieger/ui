/**
 * list-detail.ts — `enhanceListDetail()` docks a list's detail beside the
 * list once the box holding both is wide enough, and shows the same detail
 * in a full-height sheet below that width. The app's router owns the URL and
 * calls `show(key)` with the entry it names, or `show(null)` when it names
 * none, so Back shows whatever the previous entry names.
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
   *  sheet itself. The app's router leaves the entry, and then calls
   *  `show(null)`; until then Close, Escape and a press outside leave the
   *  sheet open. Default: `show(null)`. */
  readonly onDismiss?: () => void;
}

export interface ShowOptions {
  /** Shows the detail without its entrance, as for a page that loads with
   *  an entry open, since nothing animates on load. Docked, it also moves no
   *  focus and no scroll, since a load is not the reader's act; the sheet
   *  still focuses its heading. Default false. */
  readonly still?: boolean;
}

export interface ListDetail {
  /** The entry the detail shows, or null while it is hidden. */
  readonly key: string | null;
  /** With a key, shows the detail, docked or in its sheet, and focuses its
   *  heading; the same key again only focuses the heading, scrolling only as
   *  far as it takes to show the heading when it is entirely out of view or
   *  under the page's scroll padding.
   *  With null, hides it and, when focus is inside it, returns focus to what
   *  had it before it showed, or before a later `show()` made from outside
   *  the shown detail. The sheet keeps the detail until its exit has played. */
  show(key: string | null, options?: ShowOptions): void;
}

/** On the root when the detail starts showing `key`, before its heading
 *  takes focus, so a listener fills the detail first. */
export type DetailOpenEvent = CustomEvent<{
  readonly key: string;
  readonly previous: string | null;
}>;

/** On the root once per hide of `key`: after its sheet has closed, so a
 *  listener can move focus out of it, or, when a `show()` keeps the leaving
 *  sheet open, just before that show's `detailopen`, while the sheet is
 *  still open. */
export type DetailCloseEvent = CustomEvent<{ readonly key: string }>;

const DOCKED = "data-cp-docked";
const CLOSE = "[data-detail-close]";
const STILL = "data-cp-still";
/** closeDialog's mark on a sheet whose exit plays in script. */
const LEAVING = "data-cp-leaving";

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/** The root scroller's `scroll-padding` at the block start and end, in px:
 *  the bands a sticky bar covers, which `scrollIntoView` keeps clear
 *  (https://drafts.csswg.org/css-scroll-snap-1/#scroll-padding). */
function padding(): readonly [number, number] {
  const style = getComputedStyle(document.documentElement);
  const vh = document.documentElement.clientHeight;
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? 0 : v.endsWith("%") ? (n * vh) / 100 : n;
  };
  return [px(style.scrollPaddingTop), px(style.scrollPaddingBottom)];
}

/** Focuses `heading` where it is, then scrolls it in only when none of it is
 *  in the viewport clear of its scroll padding, so a focus ring never lands
 *  where nobody sees it. */
function refocus(heading: HTMLElement | null): void {
  if (heading === null) {
    return;
  }
  heading.focus({ preventScroll: true });
  const r = heading.getBoundingClientRect();
  const vh = document.documentElement.clientHeight;
  const vw = document.documentElement.clientWidth;
  const [top, bottom] = padding();
  if (r.bottom <= top || r.top >= vh - bottom || r.right <= 0 || r.left >= vw) {
    heading.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
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
  // Asks ./dialog's installDialogs to leave close requests to the cancel
  // listener below, since the route decides whether one closes the sheet.
  dialog.setAttribute("data-cp-own-close", "");
  const labelledBy = detail.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    dialog.setAttribute("aria-labelledby", labelledBy);
  }
  root.after(dialog);

  let shown: string | null = null;
  /** Where the shown detail sits; null while it is hidden. */
  let at: "dock" | "dialog" | null = null;
  let opener: Element | null = null;
  /** The opener while the sheet's exit plays in script: the page stays
   *  inert until the dialog closes. */
  let returnTo: Element | null = null;
  /** The hidden key whose `detailclose` waits for that exit to end. */
  let closing: string | null = null;
  /** Counts opens and closes, so an exit that ends after the next open
   *  leaves the detail where it is. */
  let turn = 0;
  let still = 0;

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

  /** Cancels the exit closeDialog plays in script, which keeps the sheet
   *  open. closeDialog drops its leaving mark a microtask after the cancel,
   *  and refuses to close a sheet that carries it, so the mark goes here: a
   *  `close()` in the same task, as a route makes inside `onDismiss`, then
   *  plays a fresh exit instead of leaving an empty sheet open. */
  const stopExit = (): void => {
    for (const a of dialog.getAnimations()) {
      if (!(a instanceof CSSTransition || a instanceof CSSAnimation)) {
        a.cancel();
        dialog.removeAttribute(LEAVING);
      }
    }
  };

  /** Puts the shown detail where the box's width says. A move between the
   *  dock and the sheet is not an open, so it plays no motion. */
  const place = (opening: boolean, still = false): void => {
    if (!opening && at === "dialog" && !dialog.open) {
      // Closed outside the module, its close event still queued: that
      // event dismisses, and reopening here would strand the route.
      return;
    }
    if (!root.checkVisibility()) {
      // A hidden box measures 0 wide, and the sheet, the box's sibling, would
      // open over the page. The resize observer places the detail once the
      // box shows; until then the detail waits in it, and is not dismissed.
      if (at === "dialog") {
        at = null;
        root.append(detail);
        stopExit();
        dialog.close();
      }
      return;
    }
    const want = root.getBoundingClientRect().width >= dockAt * remPx() ? "dock" : "dialog";
    const focusing = opening && !(still && want === "dock");
    if (want === at && (want === "dock" || dialog.open)) {
      if (focusing) {
        refocus(heading());
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
      // closeDialog's exit in script can outlive a sheet the engine already
      // closed, and its end would close the sheet opened again here.
      stopExit();
      if (!dialog.open) {
        dialog.showModal();
      }
    }
    // showModal() focuses the dialog's first focusable, often Close; the
    // heading names what opened.
    if (focusing || hadFocus || want === "dialog") {
      heading()?.focus();
    }
  };

  const fireClose = (key: string): void => {
    root.dispatchEvent(new CustomEvent("detailclose", { detail: { key } }));
  };

  const firePendingClose = (): void => {
    if (closing !== null) {
      const key = closing;
      closing = null;
      fireClose(key);
    }
  };

  const hide = (animate: boolean): void => {
    if (shown === null) {
      return;
    }
    const key = shown;
    shown = null;
    turn += 1;
    const was = at;
    at = null;
    root.removeAttribute(DOCKED);
    // Focus the reader moved out of the detail stays where they put it.
    const to =
      detail.contains(document.activeElement) || dialog.contains(document.activeElement)
        ? opener
        : null;
    opener = null;
    if (was === "dialog" && animate) {
      closeDialog(dialog);
    } else if (dialog.open) {
      dialog.close();
    }
    if (dialog.open) {
      // The modal sheet refuses focus outside it until it closes.
      returnTo = to;
      closing = key;
    } else {
      restore(to);
      fireClose(key);
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
    get key() {
      return shown;
    },
    show(key, opts = {}) {
      if (key === null) {
        hide(true);
        return;
      }
      const previous = shown;
      if (previous === null) {
        turn += 1;
        opener = closing === null ? document.activeElement : returnTo;
        returnTo = null;
        firePendingClose();
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
      shown = key;
      if (key !== previous) {
        root.dispatchEvent(new CustomEvent("detailopen", { detail: { key, previous } }));
      }
      place(true, opts.still === true);
    },
  };

  const dismiss = (): void => {
    if (shown === null) {
      return;
    }
    if (onDismiss === undefined) {
      api.show(null);
    } else {
      // installDialogs' cancel handler starts closing the sheet in engines
      // with no CSS exit; the route decides whether it closes.
      stopExit();
      onDismiss();
    }
  };

  // Moving the detail resizes the box, so a move inside the observer's own
  // callback would raise "ResizeObserver loop completed"; it waits a frame.
  let frame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (shown !== null) {
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
      if (shown === null) {
        restore(returnTo);
        returnTo = null;
        firePendingClose();
      } else if (at === "dialog" && !dialog.open) {
        // The engine closed it itself, as Chromium does on a second Escape
        // with no user activation between, so the route has to follow
        // (https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers).
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
    firePendingClose();
    turn += 1;
    stow();
    dialog.remove();
  };
  whenAborted(signal, teardown);

  return api;
}
