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
   *  that showed the entry is gone, was the page, or none did, as when Back
   *  or Forward showed it, at once or after an await; null when the row is
   *  not drawn. Default: none, so focus goes to the list's tab stop. */
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
   *  heading, a new copy of it when another entry was shown (look it up to
   *  fill or focus it). The same key again only focuses the heading, scrolling only
   *  when it is entirely out of view or under the page's scroll padding.
   *  With null, hides it. Focus the reader moved out of the detail stays;
   *  otherwise it ends where the fragment navigation the hide comes during
   *  went, else on what showed the entry, else on its row, else on the
   *  list's tab stop. */
  show(key: string | null, options?: ShowOptions): void;
}

/** On the root when the detail starts showing `key`, before its heading
 *  takes focus, so a listener fills the detail, its new heading included,
 *  first. */
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
const FOCUSABLE =
  "a[href], area[href], button, input, select, textarea, summary, iframe, [contenteditable], [tabindex]";

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

/** An element that can take focus once it has a `tabindex`: the
 *  HTMLOrSVGElement mixin's (https://html.spec.whatwg.org/multipage/dom.html#htmlorsvgelement). */
type Part = HTMLElement | SVGElement | MathMLElement;

const isPart = (el: Element | null | undefined): el is Part =>
  el instanceof HTMLElement || el instanceof SVGElement || el instanceof MathMLElement;

/** Focuses `target` without scrolling; one that takes no focus gets
 *  `tabindex="-1"` until it loses focus, so the next Tab starts there. */
function land(target: Part): void {
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

/** Focuses `el` where it is, then reveals it, so a focus ring never lands
 *  where nobody sees it and a ring in view never jumps the page. */
function refocus(el: Part | null): void {
  if (el === null) {
    return;
  }
  land(el);
  reveal(el);
}

/** Scrolls `el` in only when none of it is in the viewport clear of its
 *  scroll padding. */
function reveal(el: Element): void {
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
function reach(target: Part): void {
  land(target);
  const top = target.getBoundingClientRect().top;
  const [clear, foot] = padding();
  if (top < clear - 1 || top >= document.documentElement.clientHeight - foot) {
    target.scrollIntoView();
  }
}

/** The top of the document, as a fragment can indicate it. */
const TOP = "top";

/** The part of this document a same-document `url` indicates by its
 *  fragment, or null for none
 *  (https://html.spec.whatwg.org/multipage/browsing-the-web.html#select-the-indicated-part,
 *  https://html.spec.whatwg.org/multipage/browsing-the-web.html#find-a-potential-indicated-element). */
function indicated(url: string): Part | typeof TOP | null {
  const at = url.indexOf("#");
  if (at < 0) {
    return null;
  }
  const raw = url.slice(at + 1);
  if (raw === "") {
    return TOP;
  }
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
  if (el !== null) {
    return isPart(el) ? el : null;
  }
  return decoded !== null && /^top$/i.test(decoded) ? TOP : null;
}

/** Whether `el` is an element a person sees now. */
const drawn = (el: Element | null | undefined): el is Part =>
  isPart(el) && el.isConnected && el.checkVisibility();

const isPage = (el: Element | null): boolean =>
  el === null || el === document.body || el === document.documentElement;

/** A same-document navigation the Navigation API reported, while it is in
 *  progress: from its `navigate` until a task after the last event a route
 *  hides in, so only a hide during it has it as its cause
 *  (https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-navigation-interface). */
interface Nav {
  readonly type: NavigationType;
  readonly hashChange: boolean;
  /** The element that started it, which keeps focus without being moved. */
  readonly source: Element | null;
  /** What its destination's fragment indicates, read at its `navigate`. */
  readonly part: Part | typeof TOP | null;
  /** Set by its own `currententrychange`: a navigation that opens nothing
   *  here, as a Ctrl press in WebKit, fires `navigate` and never commits. */
  committed: boolean;
  /** Committed under a route's `intercept()`, which fires no hashchange. */
  intercepted: boolean;
  /** Its own commits, and the settles of the handler runs they started. */
  commits: number;
  settles: number;
  /** A traversal whose show focused the heading, with no input from the
   *  reader since (a press, a key that moves focus or scroll, a wheel or a
   *  touch scroll): a scroll restore can only be the browser's. */
  armed: boolean;
  /** A traversal whose show focused the heading, whatever input followed:
   *  from then on every input updates `held`. */
  watched: boolean;
  /** Where the reader's focus is since that show: the heading, then what
   *  their last input left focused, null while that is the page. */
  held: Part | null;
}

/** What a hide hands `focusOnHide`, read at the hide: a modal sheet keeps
 *  focus until it closes, so the decision runs then. */
interface Hidden {
  readonly key: string;
  /** What a link target navigation in progress at the hide went to. */
  readonly part: Part | typeof TOP | null;
  /** Whether the reader had moved focus out of the detail. */
  readonly moved: boolean;
  readonly opener: Element | null;
}

interface Target {
  readonly el: Part;
  readonly how: "top" | "part" | "control";
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
  /** What had focus when a show of the shown key that was not Back or
   *  Forward came, so it never names another entry's row. */
  let opener: Element | null = null;
  /** The key the last hide hid and where it put focus, until the next show:
   *  focus the module moved is not the reader's, so a show of another entry
   *  right after it, as from a route that hides while it fetches, records
   *  no opener. */
  let returned: { readonly key: string; readonly el: Element | null } | null = null;
  /** The hide whose focus and `detailclose` wait for the sheet's exit in
   *  script to end: the page stays inert until the dialog closes. */
  let pending: Hidden | null = null;
  /** The navigation in progress, or null. */
  let current: Nav | null = null;
  /** The type of the last navigation recorded here that committed. A task
   *  never clears it, so a route that awaits before it shows on Back still
   *  reads the traversal. */
  let lastType: NavigationType | null = null;
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

  /** Reads a hide's inputs now. Only a committed push to a fragment counts
   *  as a link target: a replace, a reload and Back or Forward go nowhere
   *  the reader chose on this page. */
  const hidden = (key: string): Hidden => {
    const n = current;
    const target = n?.committed === true && n.type === "push" && n.hashChange;
    const active = document.activeElement;
    const inside = detail.contains(active) || dialog.contains(active);
    return {
      key,
      part: target ? n.part : null,
      // The navigation's source and the part it indicates hold focus by the
      // press or the browser, as WebKit focuses the part on Back or Forward.
      moved: !inside && !isPage(active) && active !== n?.source && active !== n?.part,
      opener,
    };
  };

  /** The top of the document, which a fragment indicated: the page scrolls
   *  to its start, and focus goes to its first focusable element outside the
   *  detail that is in view, else its main heading, which takes
   *  `tabindex="-1"` until it loses focus, else the body
   *  (https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-the-fragment-identifier). */
  const toTop = (): void => {
    scrollTo(0, 0);
    const kept = (el: Element | null | undefined): el is Part =>
      drawn(el) && !detail.contains(el) && !dialog.contains(el) && el.closest("[inert]") === null;
    const first = [...document.querySelectorAll(FOCUSABLE)].find(
      (el) => kept(el) && el.tabIndex >= 0 && !el.matches(":disabled"),
    );
    const main = document.querySelector("main h1") ?? document.querySelector("h1");
    const inView = (el: Element | undefined | null): el is Part =>
      kept(el) && el.getBoundingClientRect().top < document.documentElement.clientHeight;
    land(inView(first) ? first : inView(main) ? main : document.body);
  };

  /** The list column's tab stop: its roving item, else its first link, else
   *  its first heading, else the column. */
  const tabStop = (): Part | null => {
    const column = [...root.children].find((c) => c !== detail);
    const first = (selector: string): Part | undefined =>
      [...(column?.querySelectorAll(selector) ?? [])].find(drawn);
    const stop = first('[tabindex="0"]') ?? first("a[href]") ?? first("h1, h2, h3, h4, h5, h6");
    return stop ?? (drawn(column) ? column : null);
  };

  /** Where focus goes after a hide: the top of the document, a part
   *  revealed as a fragment's is, or a control; null to leave focus where it
   *  is. Resolved when focus moves, so a row the app redraws during the
   *  sheet's exit is found. */
  const focusTarget = (h: Hidden): Target | null => {
    if (h.moved) {
      return null;
    }
    const { part } = h;
    if (part === TOP) {
      return { el: document.body, how: "top" };
    }
    if (drawn(part) && !detail.contains(part) && !part.contains(root)) {
      return { el: part, how: "part" };
    }
    const outside = (el: Element | null): el is Part =>
      drawn(el) && !isPage(el) && !detail.contains(el) && !dialog.contains(el);
    // Only an element that still takes focus is one to return to.
    const control = (el: Element | null): el is Part =>
      outside(el) && (el.hasAttribute("tabindex") || el.tabIndex >= 0) && !el.matches(":disabled");
    if (control(h.opener)) {
      return { el: h.opener, how: "control" };
    }
    const row = entry?.(h.key) ?? null;
    if (control(row)) {
      return { el: row, how: "control" };
    }
    const stop = tabStop();
    return outside(stop) ? { el: stop, how: "control" } : null;
  };

  /** The one place focus moves after a hide, then `detailclose` fires. */
  const focusOnHide = (h: Hidden): void => {
    const to = focusTarget(h);
    if (to?.how === "top") {
      toTop();
    } else if (to?.how === "part") {
      reach(to.el);
    } else if (to !== null) {
      const { el } = to;
      refocus(el);
      if (current?.hashChange === true) {
        // WebKit can run the fragment's scroll it queued before the hide
        // after it, so the page jumps back to the fragment; reveal again
        // after that task
        // (https://github.com/WebKit/WebKit/blob/9fea36ebc8f5d9bd116ccdbc2e7130eeb02217b3/Source/WebCore/page/LocalFrameView.cpp#L4757-L4783).
        // Chromium's fragment anchor, applied on Back or Forward after the
        // hide, clears focus when the part it names takes none
        // (https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/page/scrolling/element_fragment_anchor.cc).
        setTimeout(() => {
          if (isPage(document.activeElement) && el.isConnected) {
            land(el);
          }
          if (document.activeElement === el) {
            reveal(el);
          }
        }, 0);
      }
    }
    returned = { key: h.key, el: to === null ? null : document.activeElement };
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
      // Back and Forward bring an entry back from the address alone, awaited
      // or not, so whatever focus is on did not show it, a part a link
      // reached included.
      const traversing = current?.type === "traverse" || lastType === "traverse";
      let was = document.activeElement;
      let placed = returned;
      returned = null;
      if (previous === null) {
        turn += 1;
        const leaving = pending;
        pending = null;
        if (leaving !== null) {
          // A show during the sheet's exit stands where that hide would
          // have put focus.
          was = focusTarget(leaving)?.el ?? null;
          placed = { key: leaving.key, el: was };
          fireClose(leaving.key);
        }
        detail.hidden = false;
        detail.toggleAttribute(STILL, opts.still === true);
        if (opts.still === true) {
          holdStill();
        }
      }
      if (key !== previous || traversing) {
        opener = null;
      }
      const mine = placed !== null && placed.key !== key && was === placed.el;
      if (!traversing && !mine && !isPage(was) && !detail.contains(was) && !dialog.contains(was)) {
        opener = was;
      }
      shown = key;
      let kept = false;
      const old = heading();
      if (previous !== null && key !== previous && old !== null) {
        // A new node for the new entry: focusing the node that already has
        // focus fires no focus event, so assistive technology is not told
        // focus moved
        // (https://github.com/chromium/chromium/blob/72e0b76845fa247601dae14b39702de2c28451d6/ui/accessibility/platform/browser_accessibility_manager.cc#L225-L233),
        // and an intercepted navigation would reset focus to the body
        // (https://html.spec.whatwg.org/multipage/nav-history-apis.html#focus-changed-during-ongoing-navigation).
        kept = document.activeElement === old;
        old.replaceWith(old.cloneNode(true));
      }
      if (key !== previous) {
        root.dispatchEvent(new CustomEvent("detailopen", { detail: { key, previous } }));
      }
      place(true, opts.still === true);
      const h = heading();
      if (kept && h !== null && document.activeElement !== h) {
        h.focus({ preventScroll: true });
      }
      if (current?.type === "traverse" && h !== null && document.activeElement === h) {
        current.armed = true;
        current.watched = true;
        current.held = h;
      }
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
  /** Ends `n` a task after now, which runs after every listener of the
   *  event being dispatched, the route's included. */
  const end = (n: Nav): void => {
    setTimeout(() => {
      if (current === n) {
        current = null;
      }
      // A traversal restores the page's scroll after its popstate, which can
      // carry the heading its show focused out of view; by this task it has
      // (https://html.spec.whatwg.org/multipage/browsing-the-web.html#restore-persisted-user-state).
      const h = heading();
      if (n.armed && h !== null && document.activeElement === h) {
        reveal(h);
      }
    }, 0);
  };
  navigation?.addEventListener(
    "navigate",
    (e) => {
      if (e.navigationType === "replace" && !e.hashChange && e.destination.url === location.href) {
        // A route stamping the entry's state while it handles a navigation.
        return;
      }
      current = {
        type: e.navigationType,
        hashChange: e.hashChange,
        source: e.sourceElement,
        part: e.hashChange ? indicated(e.destination.url) : null,
        committed: false,
        intercepted: false,
        commits: 0,
        settles: 0,
        armed: false,
        watched: false,
        held: null,
      };
    },
    listen,
  );
  navigation?.addEventListener(
    "currententrychange",
    (e) => {
      const n = current;
      // A stamp's own commit is a replace, so it never commits a push.
      if (n?.type !== e.navigationType) {
        return;
      }
      n.commits += 1;
      if (n.committed) {
        return;
      }
      n.committed = true;
      lastType = n.type;
      if (navigation.transition !== null) {
        // An intercepted navigation fires no popstate or hashchange: its
        // route has handled it once every handler run has settled.
        n.intercepted = true;
      } else if (!n.hashChange && n.type !== "traverse") {
        // pushState and replaceState fire no popstate.
        end(n);
      }
    },
    listen,
  );
  const settled = (e: Event): void => {
    const n = current;
    if (n === null) {
      return;
    }
    if (!n.committed) {
      end(n);
      return;
    }
    if (!n.intercepted) {
      return;
    }
    n.settles += 1;
    // In a nested browsing context Firefox 159 commits an intercepted
    // traversal twice, runs its handler again and, when that run settles,
    // resets focus to the body even after the reader moved it, which can be
    // after the transition finished; so the traversal lasts until its last
    // run settles, and focus goes back where the reader had it
    // (https://html.spec.whatwg.org/multipage/nav-history-apis.html#potentially-reset-the-focus).
    const el = n.held;
    if (
      e.type === "navigatesuccess" &&
      el?.isConnected === true &&
      shown !== null &&
      isPage(document.activeElement)
    ) {
      if (n.armed) {
        refocus(el);
      } else {
        land(el);
      }
    }
    if (n.settles >= n.commits) {
      end(n);
    }
  };
  navigation?.addEventListener("navigatesuccess", settled, listen);
  navigation?.addEventListener("navigateerror", settled, listen);
  /** Keys that move neither focus nor scroll, as a screen reader's Control
   *  that stops speech: UI Events' modifier keys
   *  (https://www.w3.org/TR/uievents-key/#keys-modifier). */
  const idle = new Set([
    "Alt",
    "AltGraph",
    "CapsLock",
    "Control",
    "Fn",
    "FnLock",
    "Meta",
    "NumLock",
    "ScrollLock",
    "Shift",
    "Symbol",
    "SymbolLock",
    "Hyper",
    "Super",
  ]);
  const disarm = (e: Event): void => {
    if (!e.isTrusted || current === null) {
      return;
    }
    if (e instanceof KeyboardEvent && idle.has(e.key)) {
      return;
    }
    const n = current;
    n.armed = false;
    // The input's own focus move has run by the next task.
    setTimeout(() => {
      const now = document.activeElement;
      if (current === n && n.watched) {
        n.held = isPart(now) && !isPage(now) ? now : null;
      }
    }, 0);
  };
  const input = { ...until(signal, true), passive: true };
  for (const type of ["pointerdown", "keydown", "wheel", "touchmove"]) {
    document.addEventListener(type, disarm, input);
  }
  addEventListener(
    "popstate",
    () => {
      if (current?.committed === true && !current.intercepted && !current.hashChange) {
        end(current);
      }
    },
    listen,
  );
  addEventListener(
    "hashchange",
    () => {
      if (current?.committed === true && !current.intercepted) {
        end(current);
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
