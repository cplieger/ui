/**
 * reorder.ts — `enhanceReorder()` lets a person put a list's items in their
 * order: an item's Move up and Move down buttons move it by one, Alt with
 * the Up or Down arrow moves the item holding focus, and its handle drags
 * it. The others slide aside, the ranks renumber and the new place is said.
 * @module
 */

import { reducedMotion, until, whenAborted } from "../../core/lifetime/lifetime.js";
import { announce } from "../../feedback/announce/announce.js";

export interface ReorderOptions {
  /** An item's name in what is said. Default: its `data-name`, else its
   *  text. */
  readonly name?: (item: HTMLLIElement) => string;
  /** What is said after a move, `position` counting from 1. Default:
   *  "Japanese, position 2 of 3". */
  readonly words?: (name: string, position: number, count: number) => string;
  /** After each move that changed the order, with the items in their new
   *  order and the one that moved. */
  readonly onChange?: (items: readonly HTMLLIElement[], moved: HTMLLIElement) => void;
  /** Removes the listeners, drops an item being dragged where it is, and
   *  clears every slide. */
  readonly signal?: AbortSignal;
}

const LIFTED = "data-cp-lifted";
/** How near the scroller's edge, in rem, a drag starts scrolling it. */
const EDGE_REM = 2;
/** The scroll per frame, in px, with the pointer at or past the edge. */
const EDGE_SPEED = 14;

interface Drag {
  readonly item: HTMLLIElement;
  readonly handle: Element;
  readonly id: number;
  readonly from: number;
  /** Every item's top and height in the list's own coordinates at the
   *  start, the dragged one's included. */
  readonly boxes: readonly {
    readonly el: HTMLLIElement;
    readonly top: number;
    readonly h: number;
  }[];
  /** How far the others slide: the dragged item's height and the gap. */
  readonly step: number;
  /** The pointer's offset from the list's top at the start. */
  readonly y0: number;
  readonly scroller: Element;
  y: number;
  to: number;
  frame: number;
}

const defaultWords = (name: string, position: number, count: number): string =>
  `${name}, position ${String(position)} of ${String(count)}`;

/** Whether Alt with an arrow already means something where focus is: a
 *  caret, a choice or a value to step. */
function takesArrows(t: Element): boolean {
  if (t instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset"].includes(t.type);
  }
  return (
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable) ||
    t.closest('[role="combobox"], [role="listbox"]') !== null
  );
}

function scrollerOf(list: Element): Element {
  for (let el = list.parentElement; el !== null; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

/** The part of the viewport `scroller` shows, top and bottom. */
function viewOf(scroller: Element): readonly [number, number] {
  if (scroller === document.scrollingElement) {
    const top = visualViewport?.offsetTop ?? 0;
    return [top, top + (visualViewport?.height ?? innerHeight)];
  }
  const r = scroller.getBoundingClientRect();
  return [r.top, r.bottom];
}

/**
 * Wires `list`, whose `<li>` items hold anything and may each hold a
 * `[data-part="handle"]` to drag, a `[data-part="rank"]` the module numbers,
 * and buttons `[data-move="up"]` and `[data-move="down"]`. The end buttons
 * get `aria-disabled="true"`, items added later are numbered too, and a
 * move never takes the moved item out of the document, so focus stays.
 */
export function enhanceReorder(
  list: HTMLOListElement | HTMLUListElement,
  options: ReorderOptions = {},
): void {
  const { signal, onChange } = options;
  if (signal?.aborted === true) {
    return;
  }
  const words = options.words ?? defaultWords;
  const nameOf =
    options.name ?? ((item: HTMLLIElement) => item.dataset["name"] ?? item.textContent.trim());
  const items = (): HTMLLIElement[] =>
    [...list.children].filter((c): c is HTMLLIElement => c instanceof HTMLLIElement);
  let drag: Drag | null = null;
  // A union of element types resolves addEventListener to its Event overload.
  const box: HTMLElement = list;

  // The item of `el` that is this list's own, through any list nested in it.
  const itemOf = (el: Element): HTMLLIElement | null => {
    let li = el.closest("li");
    while (li !== null && li.parentElement !== list) {
      li = li.parentElement?.closest("li") ?? null;
    }
    return li;
  };
  // The item a rank or Move button numbers or moves: only one of this list's
  // own, never one in a list nested in it, which numbers and moves its own.
  const partOf = (el: Element): HTMLLIElement | null => {
    const li = el.closest("li");
    return li?.parentElement === list ? li : null;
  };

  const sync = (): void => {
    const all = items();
    all.forEach((item, i) => {
      for (const rank of item.querySelectorAll('[data-part="rank"]')) {
        if (partOf(rank) === item) {
          rank.textContent = String(i + 1);
        }
      }
      for (const b of item.querySelectorAll("[data-move]")) {
        if (partOf(b) !== item) {
          continue;
        }
        if (b.getAttribute("data-move") === "up" ? i === 0 : i === all.length - 1) {
          b.setAttribute("aria-disabled", "true");
        } else {
          b.removeAttribute("aria-disabled");
        }
      }
    });
  };

  const unslide = (all: readonly HTMLLIElement[]): void => {
    for (const el of all) {
      el.style.removeProperty("transition");
      el.style.removeProperty("translate");
    }
  };

  // Puts `item` at index `to` by moving its neighbours across it, then
  // slides every item from where it showed to its new place.
  const place = (item: HTMLLIElement, to: number): void => {
    const all = items();
    const from = all.indexOf(item);
    const shown = all.map((el) => el.getBoundingClientRect().top);
    if (to > from) {
      item.before(...all.slice(from + 1, to + 1));
    } else if (to < from) {
      item.after(...all.slice(to, from));
    }
    if (reducedMotion()) {
      unslide(all);
      return;
    }
    // Without a transition, so the measure below is each item's new place.
    for (const el of all) {
      el.style.transition = "none";
      el.style.translate = "";
    }
    if (item.contains(document.activeElement)) {
      item.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
    const shifts = all.map((el, i) => (shown[i] ?? 0) - el.getBoundingClientRect().top);
    all.forEach((el, i) => {
      if (shifts[i] !== 0) {
        el.style.translate = `0 ${String(shifts[i])}px`;
      }
    });
    // The style must be computed with the shift before it is cleared, or no
    // transition starts from it.
    list.getBoundingClientRect();
    unslide(all);
  };

  const move = (item: HTMLLIElement, to: number): void => {
    const all = items();
    const from = all.indexOf(item);
    if (from < 0) {
      return;
    }
    const at = Math.max(0, Math.min(all.length - 1, to));
    place(item, at);
    if (at === from) {
      return;
    }
    sync();
    announce(words(nameOf(item), at + 1, all.length));
    onChange?.(items(), item);
  };

  box.addEventListener(
    "click",
    (e) => {
      const b = e.target instanceof Element ? e.target.closest("[data-move]") : null;
      const item = b === null || e.defaultPrevented ? null : partOf(b);
      if (item === null || b === null) {
        return;
      }
      e.preventDefault();
      const by = { up: -1, down: 1 }[b.getAttribute("data-move") ?? ""];
      if (drag !== null || by === undefined || b.getAttribute("aria-disabled") === "true") {
        return;
      }
      move(item, items().indexOf(item) + by);
    },
    until(signal),
  );

  box.addEventListener(
    "keydown",
    (e) => {
      const by = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      const t = e.target;
      if (
        by === undefined ||
        !e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.defaultPrevented ||
        drag !== null ||
        !(t instanceof Element) ||
        takesArrows(t)
      ) {
        return;
      }
      const item = itemOf(t);
      if (item === null) {
        return;
      }
      e.preventDefault();
      move(item, items().indexOf(item) + by);
    },
    until(signal),
  );

  const follow = (): void => {
    if (drag === null) {
      return;
    }
    const { boxes, from, step } = drag;
    const me = boxes[from];
    const first = boxes[0];
    const last = boxes.at(-1);
    if (me === undefined || first === undefined || last === undefined) {
      return;
    }
    const pointer = drag.y - list.getBoundingClientRect().top - drag.y0;
    const dy = Math.max(first.top - me.top, Math.min(last.top + last.h - me.top - me.h, pointer));
    drag.item.style.translate = `0 ${String(dy)}px`;
    const mid = me.top + me.h / 2 + dy;
    let to = boxes.findIndex((b) => mid < b.top + b.h / 2);
    if (to < 0) {
      to = boxes.length - 1;
    } else if (to > from) {
      to -= 1;
    }
    if (to === drag.to) {
      return;
    }
    drag.to = to;
    boxes.forEach((b, i) => {
      if (i === from) {
        return;
      }
      const shift = from < i && i <= to ? -step : to <= i && i < from ? step : 0;
      b.el.style.translate = shift === 0 ? "" : `0 ${String(shift)}px`;
    });
  };

  // While the pointer is near the scroller's edge, scroll it toward the
  // pointer, faster the nearer the edge, and keep the item under it.
  const edge = (): void => {
    if (drag === null) {
      return;
    }
    const near = EDGE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const [top, bottom] = viewOf(drag.scroller);
    const into = drag.y < top + near ? drag.y - top - near : Math.max(0, drag.y - bottom + near);
    if (into !== 0) {
      const speed = Math.max(-1, Math.min(1, into / near)) * EDGE_SPEED;
      drag.scroller.scrollBy({ top: Math.round(speed), behavior: "instant" });
    }
    follow();
    drag.frame = requestAnimationFrame(edge);
  };

  box.addEventListener(
    "pointerdown",
    (e) => {
      const handle = e.target instanceof Element ? e.target.closest('[data-part="handle"]') : null;
      const item = handle === null || e.defaultPrevented ? null : itemOf(handle);
      if (item === null || handle === null || drag !== null || e.button !== 0 || !e.isPrimary) {
        return;
      }
      // No text selection and no focus move under the dragging pointer.
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const all = items();
      for (const el of all) {
        el.style.transition = "none";
        el.style.translate = "";
      }
      const listTop = list.getBoundingClientRect().top;
      const boxes = all.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top: r.top - listTop, h: r.height };
      });
      unslide(all);
      const from = all.indexOf(item);
      const me = boxes[from];
      const next = boxes[from + 1] ?? boxes[from - 1];
      const gap =
        me === undefined || next === undefined
          ? 0
          : Math.max(0, next.top > me.top ? next.top - me.top - me.h : me.top - next.top - next.h);
      drag = {
        item,
        handle,
        id: e.pointerId,
        from,
        boxes,
        step: (me?.h ?? 0) + gap,
        y0: e.clientY - listTop,
        scroller: scrollerOf(list),
        y: e.clientY,
        to: from,
        frame: 0,
      };
      item.setAttribute(LIFTED, "");
      drag.frame = requestAnimationFrame(edge);
    },
    until(signal),
  );

  box.addEventListener(
    "pointermove",
    (e) => {
      if (drag?.id === e.pointerId) {
        drag.y = e.clientY;
        follow();
      }
    },
    until(signal),
  );

  // A drag ends where the item is, on release or when the pointer is lost.
  const drop = (e: PointerEvent): void => {
    if (drag?.id !== e.pointerId) {
      return;
    }
    const { item, handle, to, frame } = drag;
    drag = null;
    cancelAnimationFrame(frame);
    item.removeAttribute(LIFTED);
    if (handle.hasPointerCapture(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }
    if (item.parentElement === list) {
      move(item, to);
    } else {
      unslide(items());
    }
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    box.addEventListener(type, drop, until(signal));
  }

  const added = new MutationObserver(sync);
  added.observe(list, { childList: true });
  sync();

  whenAborted(signal, () => {
    added.disconnect();
    if (drag !== null) {
      cancelAnimationFrame(drag.frame);
      drag.item.removeAttribute(LIFTED);
      drag = null;
    }
    unslide(items());
  });
}
