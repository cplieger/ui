/**
 * toast.ts — short notices in a stack at the window's inline-end corner, in
 * a `popover="manual"` so they sit above the page, kept inside the topmost
 * modal dialog while one is open. A passing toast leaves after its time, which a
 * pointer or focus on the stack pauses; an error, a toast with an action and
 * a working toast stay until dismissed or updated. A press anywhere on a
 * toast but its own buttons dismisses it, and a finger can swipe it away.
 * Each toast is a live region, so it is said as it appears.
 * @module
 */

import { reducedMotion } from "../../core/lifetime/lifetime.js";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastAction {
  readonly label: string;
  readonly run?: () => void;
  /** The toast stays after the action runs. Default false. */
  readonly keep?: boolean;
}

export interface ToastOptions {
  readonly kind?: ToastKind;
  readonly title: string;
  readonly body?: string;
  readonly actions?: readonly ToastAction[];
  /** Stays until dismissed. Default: true for an error or a toast with an
   *  action, false otherwise. */
  readonly sticky?: boolean;
  /** How long a passing toast stays, in ms. Default 7000. */
  readonly life?: number;
  /** Work in progress: a loader instead of the kind's glyph, and it stays
   *  until `update` gives it an outcome. */
  readonly busy?: boolean;
}

export interface ToastHandle {
  /** Takes the toast away. */
  dismiss(): void;
  /** Gives the toast new words, a new kind or an outcome; a busy toast that
   *  is updated without `busy` starts its time. Buttons with the same labels
   *  stay in place, so focus on one survives, and run the new `run`. */
  update(next: ToastOptions): void;
}

/** How many toasts show at once; the oldest passing one makes room. */
const MAX = 4;
const SWIPE_PX = 80;

let stack: HTMLElement | null = null;

function node(tag: string, className: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = className;
  if (text !== undefined) {
    n.textContent = text;
  }
  return n;
}

/** Where the stack lives: inside the topmost modal dialog, since a modal
 *  makes the rest of the page inert, popovers shown after it included, so
 *  a toast outside it could be neither read nor pressed. */
function home(): HTMLElement {
  const modals = [...document.querySelectorAll("dialog")].filter((d) => d.matches(":modal"));
  return modals.at(-1) ?? document.body;
}

/** Moves the stack to its home and shows it there, last in the top layer. */
function rehome(s: HTMLElement): void {
  const to = home();
  if (s.parentElement !== to) {
    to.append(s);
  }
  if (s.childElementCount > 0 && !s.matches(":popover-open")) {
    s.showPopover();
  }
}

let following = false;

function theStack(): HTMLElement {
  if (stack?.isConnected !== true) {
    stack = node("section", "cp-toaster");
    stack.popover = "manual";
    stack.setAttribute("aria-label", "Notifications");
  }
  if (!following) {
    following = true;
    // A dialog opening or closing moves the stack to the new topmost one.
    document.addEventListener(
      "toggle",
      (e) => {
        if (e.target instanceof HTMLDialogElement && stack !== null) {
          rehome(stack);
        }
      },
      { capture: true },
    );
  }
  return stack;
}

/** Leaves in two beats: slides out toward its edge and fades, then its row
 *  closes so the toasts above settle. Reduced motion only fades. */
function leave(slot: HTMLElement): void {
  if (slot.hasAttribute("data-cp-leaving")) {
    return;
  }
  slot.setAttribute("data-cp-leaving", "");
  const out = reducedMotion() ? 120 : 280;
  const toast = slot.firstElementChild?.firstElementChild;
  const finish = (): void => {
    slot.setAttribute("data-cp-closing", "");
    const row = slot.animate([{ gridTemplateRows: "1fr" }, { gridTemplateRows: "0fr" }], {
      duration: reducedMotion() ? 0 : 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      fill: "forwards",
    });
    void row.finished.then(
      () => {
        slot.remove();
        if (stack !== null && stack.childElementCount === 0 && stack.matches(":popover-open")) {
          stack.hidePopover();
        }
      },
      () => {
        slot.remove();
      },
    );
  };
  if (toast instanceof HTMLElement) {
    void toast
      .animate(
        [
          {},
          {
            opacity: 0,
            translate: reducedMotion()
              ? "0 0"
              : toast.matches(":dir(rtl)")
                ? "calc(-100% - 1rem) 0"
                : "calc(100% + 1rem) 0",
          },
        ],
        {
          duration: out,
          easing: "cubic-bezier(0.4, 0, 1, 1)",
          fill: "forwards",
        },
      )
      .finished.then(finish, finish);
  } else {
    finish();
  }
}

function swipeAway(toast: HTMLElement, dismiss: () => void): void {
  let start: { x: number; id: number } | null = null;
  toast.addEventListener("pointerdown", (e) => {
    if (
      e.pointerType === "mouse" ||
      (e.target instanceof Element && e.target.closest("button, a") !== null)
    ) {
      return;
    }
    start = { x: e.clientX, id: e.pointerId };
    toast.setPointerCapture(e.pointerId);
  });
  toast.addEventListener("pointermove", (e) => {
    if (start?.id !== e.pointerId) {
      return;
    }
    const dx = e.clientX - start.x;
    toast.style.translate = `${String(dx)}px 0`;
    toast.style.opacity = String(1 - Math.min(Math.abs(dx) / 200, 0.7));
  });
  const end = (e: PointerEvent): void => {
    if (start?.id !== e.pointerId) {
      return;
    }
    const dx = e.clientX - start.x;
    start = null;
    if (Math.abs(dx) > SWIPE_PX) {
      dismiss();
    } else {
      toast.style.translate = "";
      toast.style.opacity = "";
    }
  };
  toast.addEventListener("pointerup", end);
  toast.addEventListener("pointercancel", end);
}

/** Shows a toast. Returns its handle. */
export function toast(options: ToastOptions): ToastHandle {
  const s = theStack();
  const el = node("div", "cp-toast");
  const lead = node("span", "cp-toast-lead");
  lead.setAttribute("aria-hidden", "true");
  const text = node("div", "cp-toast-text");
  const close = node("button", "cp-button cp-toast-close") as HTMLButtonElement;
  close.type = "button";
  close.dataset["variant"] = "quiet";
  close.setAttribute("aria-label", "Dismiss");
  el.append(lead, text, close);
  const wrap = node("div", "cp-toast-wrap");
  wrap.append(el);
  const slot = node("div", "cp-toast-slot");
  slot.append(wrap);

  const dismiss = (): void => {
    leave(slot);
  };

  const title = node("strong", "");
  const body = node("p", "");
  text.append(title);
  let actions: readonly ToastAction[] = [];
  let row: HTMLElement | null = null;

  // An update keeps the loader, the body and the buttons whose labels did
  // not change, and leaves unchanged words alone, so a working toast that
  // counts keeps its loader turning, focus on its buttons and a selection in
  // its body. The draining line starts again with each update.
  const render = (o: ToastOptions): void => {
    const kind = o.kind ?? "info";
    el.dataset["kind"] = kind;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    if (lead.classList.contains("cp-loader") !== (o.busy === true)) {
      lead.classList.toggle("cp-loader", o.busy === true);
      lead.replaceChildren(...(o.busy === true ? [document.createElement("span")] : []));
    }
    if (title.textContent !== o.title) {
      title.textContent = o.title;
    }
    if (o.body !== undefined && o.body !== "") {
      if (body.textContent !== o.body) {
        body.textContent = o.body;
      }
      if (body.parentNode !== text) {
        title.after(body);
      }
    } else {
      body.remove();
    }
    const labels = (list: readonly ToastAction[]): string =>
      JSON.stringify(list.map((a) => a.label));
    const next = o.actions ?? [];
    if (row === null || labels(next) !== labels(actions)) {
      row?.remove();
      row = null;
      if (next.length > 0) {
        const buttons = next.map((a, i) => {
          const b = node("button", "cp-button", a.label) as HTMLButtonElement;
          b.type = "button";
          b.dataset["size"] = "sm";
          b.addEventListener("click", () => {
            const now = actions[i];
            now?.run?.();
            if (now?.keep !== true) {
              dismiss();
            }
          });
          return b;
        });
        row = node("div", "cp-toast-actions");
        row.append(...buttons);
        text.append(row);
      }
    }
    actions = next;
    el.querySelector(".cp-toast-time")?.remove();
    const sticky = o.sticky ?? (kind === "error" || actions.length > 0);
    if (!sticky && o.busy !== true) {
      // The draining line is the timer: CSS pauses it under a pointer or
      // focus, and its end takes the toast away.
      const line = node("span", "cp-toast-time");
      line.style.setProperty("--cp-toast-life", `${String(o.life ?? 7000)}ms`);
      line.addEventListener("animationend", dismiss);
      el.append(line);
    }
  };

  render(options);
  close.addEventListener("click", dismiss);
  el.addEventListener("click", (e) => {
    const t = e.target;
    if (
      (t instanceof Element && t.closest("button, a") !== null) ||
      String(getSelection() ?? "").length > 0
    ) {
      return;
    }
    dismiss();
  });
  swipeAway(el, dismiss);
  s.append(slot);
  rehome(s);
  const showing = [...s.querySelectorAll<HTMLElement>(".cp-toast-slot:not([data-cp-leaving])")];
  if (showing.length > MAX) {
    const passing = showing.find((x) => x.querySelector(".cp-toast-time") !== null) ?? showing[0];
    if (passing !== undefined) {
      leave(passing);
    }
  }
  return { dismiss, update: render };
}
