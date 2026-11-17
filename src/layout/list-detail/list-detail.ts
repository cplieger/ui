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
  /** The entry's own row, which takes focus after a hide when the element
   *  that showed the entry is gone or was the page; null when the row is not
   *  drawn. Default: none, so focus goes to the list's tab stop. */
  readonly entry?: (key: string) => HTMLElement | null;
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
   *  far as it takes to show it when it is entirely out of view or under the
   *  page's scroll padding.
   *  With null, hides it. Focus the reader moved out of the detail stays;
   *  otherwise it ends on the part of the page a link went to, else on what
   *  showed the entry, else on the entry's row, else on the list's tab stop. */
  show(key: string | null, options?: ShowOptions): void;
}

/** On the root when the detail starts showing `key`, before its heading
 *  takes focus, so a listener fills the detail first. */
export type DetailOpenEvent = CustomEvent<{
  readonly key: string;
  readonly previous: string | null;
}>;

/** On the root once per hide of `key`, for reacting to it: after focus has
 *  moved, or, when a `show()` keeps the leaving sheet open, just before that
 *  show's `detailopen`. */
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

/** Focuses `target` without scrolling; one that takes no focus gets
 *  `tabindex="-1"` until it loses focus, so the next Tab starts there. */
function land(target: HTMLElement): void {
  target.focus({ preventScroll: true });
  if (document.activeElement !== target && !target.hasAttribute("tabindex")) {
    target.tabIndex = -1;
    target.addEventListener(
      "blur",
      () => {
        target.removeAttribute("tabindex");
      },
      { once: true },
    );
    target.focus({ preventScroll: true });
  }
}

/** Focuses `el` where it is, then scrolls it in only when none of it is in
 *  the viewport clear of its scroll padding, so a focus ring never lands
 *  where nobody sees it and a ring in view never jumps the page. */
function refocus(el: HTMLElement | null): void {
  if (el === null) {
    return;
  }
  land(el);
  const r = el.getBoundingClientRect();
  const vh = document.documentElement.clientHeight;
  const vw = document.documentElement.clientWidth;
  const [top, bottom] = padding();
  if (r.bottom <= top || r.top >= vh - bottom || r.right <= 0 || r.left >= vw) {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

/** Focuses `target` as a fragment navigation outside a modal dialog leaves
 *  it, with its top scrolled clear of the scroll padding when it is not in
 *  view
 *  (https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-the-fragment-identifier). */
function reach(target: HTMLElement): void {
  land(target);
  const top = target.getBoundingClientRect().top;
  const [clear, foot] = padding();
  if (top < clear - 1 || top >= document.documentElement.clientHeight - foot) {
    target.scrollIntoView();
  }
}

/** The element of this document a press on `link` scrolls to, by its
 *  fragment, or null when it goes to another document, another browsing
 *  context or no element
 *  (https://html.spec.whatwg.org/multipage/browsing-the-web.html#find-the-indicated-part). */
function indicated(link: HTMLAnchorElement | HTMLAreaElement): HTMLElement | null {
  const self = (link.target === "" || link.target === "_self") && !link.hasAttribute("download");
  if (!self || link.hash.length <= 1 || link.href.split("#")[0] !== document.URL.split("#")[0]) {
    return null;
  }
  const raw = link.hash.slice(1);
  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape names only by the raw fragment.
  }
  const potential = (fragment: string): Element | null =>
    document.getElementById(fragment) ??
    [...document.getElementsByName(fragment)].find((e) => e instanceof HTMLAnchorElement) ??
    null;
  const el = potential(raw) ?? (decoded === null ? null : potential(decoded));
  return el instanceof HTMLElement ? el : null;
}

/** Whether `el` is an element a person sees now. */
const drawn = (el: Element | null | undefined): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el.checkVisibility();

const isPage = (el: Element | null): boolean =>
  el === null || el === document.body || el === document.documentElement;

/** A same-page link press the Navigation API reported
 *  (https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-navigation-interface). */
interface Press {
  readonly link: Element;
  /** The part of the page its fragment names. */
  readonly part: HTMLElement | null;
  /** Set by the `currententrychange` of the press's own navigation, the next
   *  one after its `navigate` with no other `navigate` between: a press that
   *  navigated nothing, as a Ctrl press in WebKit, never commits, and a
   *  router's later same-URL `replaceState` commits only itself. */
  committed: boolean;
}

/** What a hide hands `focusOnHide`, read at the hide: a modal sheet keeps
 *  focus until it closes, so the decision runs then. */
interface Hidden {
  readonly key: string;
  /** The part a committed press went to, when that press is why it hides. */
  readonly part: HTMLElement | null;
  /** Whether the reader had moved focus out of the detail. */
  readonly moved: boolean;
  readonly opener: Element | null;
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
  const { signal, onDismiss, entry } = options;
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
  /** The hide whose focus and `detailclose` wait for the sheet's exit in
   *  script to end: the page stays inert until the dialog closes. */
  let pending: Hidden | null = null;
  let press: Press | null = null;
  /** The press the next `currententrychange` commits. */
  let awaiting: Press | null = null;
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

  /** Reads a hide's inputs now, using up the press that caused it. */
  const hidden = (key: string): Hidden => {
    const p = press?.committed === true ? press : null;
    press = null;
    const active = document.activeElement;
    const inside = detail.contains(active) || dialog.contains(active);
    return {
      key,
      part: p?.part ?? null,
      moved: !inside && !isPage(active) && active !== p?.link,
      opener,
    };
  };

  /** The list column's tab stop: its roving item, else its first link, else
   *  its first heading, else the column. */
  const tabStop = (): HTMLElement | null => {
    const column = [...root.children].find((c) => c !== detail);
    const first = (selector: string): HTMLElement | undefined =>
      [...(column?.querySelectorAll(selector) ?? [])].find(drawn);
    const stop = first('[tabindex="0"]') ?? first("a[href]") ?? first("h1, h2, h3, h4, h5, h6");
    return stop ?? (drawn(column) ? column : null);
  };

  /** Where focus goes after a hide, and whether the target's top is
   *  revealed as a fragment's is; null to leave focus where it is. Resolved
   *  when focus moves, so a row the app redraws during the sheet's exit is
   *  found. */
  const focusTarget = (h: Hidden): { readonly el: HTMLElement; readonly top: boolean } | null => {
    if (h.moved) {
      return null;
    }
    const { part } = h;
    if (drawn(part) && !detail.contains(part) && !part.contains(root)) {
      return { el: part, top: true };
    }
    const outside = (el: Element | null): el is HTMLElement =>
      drawn(el) && !isPage(el) && !detail.contains(el) && !dialog.contains(el);
    // A part a fragment reached held focus only until it blurred, so it is
    // no control to return to: the row is.
    const control = (el: Element | null): el is HTMLElement =>
      outside(el) && (el.hasAttribute("tabindex") || el.tabIndex >= 0) && !el.matches(":disabled");
    if (control(h.opener)) {
      return { el: h.opener, top: false };
    }
    const row = entry?.(h.key) ?? null;
    if (control(row)) {
      return { el: row, top: false };
    }
    const stop = tabStop();
    return outside(stop) ? { el: stop, top: false } : null;
  };

  /** The one place focus moves after a hide, then `detailclose` fires. */
  const focusOnHide = (h: Hidden): void => {
    const to = focusTarget(h);
    if (to?.top === true) {
      reach(to.el);
    } else if (to !== null) {
      refocus(to.el);
    }
    fireClose(h.key);
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
    // Read before closing the sheet, which moves focus.
    const h = hidden(key);
    opener = null;
    if (was === "dialog" && animate) {
      closeDialog(dialog);
    } else if (dialog.open) {
      dialog.close();
    }
    if (dialog.open) {
      // The modal sheet refuses focus outside it until it closes.
      pending = h;
    } else {
      focusOnHide(h);
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
      if (key !== previous) {
        press = null;
      }
      if (previous === null) {
        turn += 1;
        const leaving = pending;
        pending = null;
        // A show during the sheet's exit takes the element that hide would
        // have focused as its opener.
        opener = leaving === null ? document.activeElement : (focusTarget(leaving)?.el ?? null);
        if (leaving !== null) {
          fireClose(leaving.key);
        }
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
        const h = pending;
        pending = null;
        if (h !== null) {
          focusOnHide(h);
        }
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
  const navigation = (globalThis as { readonly navigation?: Navigation }).navigation;
  navigation?.addEventListener(
    "navigate",
    (e) => {
      const link = e.sourceElement;
      if (e.hashChange && (link instanceof HTMLAnchorElement || link instanceof HTMLAreaElement)) {
        press = { link, part: indicated(link), committed: false };
        awaiting = press;
        return;
      }
      awaiting = null;
      if (!(e.navigationType === "replace" && e.destination.url === location.href)) {
        // A router rewriting the entry's state keeps the press it handles.
        press = null;
      }
    },
    listen,
  );
  navigation?.addEventListener(
    "currententrychange",
    () => {
      const p = awaiting;
      awaiting = null;
      if (p === null || p !== press) {
        return;
      }
      p.committed = true;
      // An intercepted navigation fires no hashchange: its route has handled
      // the press once the handler's promise settles.
      const finished = navigation.transition?.finished;
      const forget = (): void => {
        setTimeout(() => {
          if (press === p) {
            press = null;
          }
        }, 0);
      };
      finished?.then(forget, forget);
    },
    listen,
  );
  addEventListener(
    "hashchange",
    () => {
      const p = press;
      if (p?.committed === true) {
        // A task queued here runs after every listener of this hashchange,
        // the router's included, so the press causes no later hide.
        setTimeout(() => {
          if (press === p) {
            press = null;
          }
        }, 0);
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
    const h = pending;
    pending = null;
    if (h !== null) {
      focusOnHide(h);
    }
    turn += 1;
    stow();
    dialog.remove();
  };
  whenAborted(signal, teardown);

  return api;
}
