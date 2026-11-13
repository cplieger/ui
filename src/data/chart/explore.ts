/**
 * explore.ts — a chart's selection on the page: the keys, focus, the
 * pointer and touch, the crosshair and ring, the legend row's reading of
 * it, and what each key says through announce.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";

import { drawSelection, writeLegend } from "./draw.js";
import type { Layout } from "./layout.js";
import type { Model } from "./model.js";
import { overall } from "./readout.js";
import {
  initial,
  isKey,
  navigator,
  rekey,
  selectionReading,
  spoken,
  xOf,
  type Navigator,
  type Selection,
} from "./select.js";
import type { Words } from "./words.js";

/** A touch that moves this far is a drag, not a tap, in px: along x on a
 *  chart a drag explores, in any direction on one that only taps select. */
const DRAG = 8;

interface Explorer {
  /** `model` was drawn as `lay`, its legend row framed with no selection. */
  drawn(model: Model, lay: Layout): void;
  /** `model` replaces the data: the selection stays where its x still is. */
  data(model: Model): void;
  /** Clears the selection; the next focus or arrow brings it back. */
  clear(): void;
  /** Drops the selection and what it would come back as. */
  reset(): void;
}

interface Touch {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  dragging: boolean;
  /** Moved past DRAG on a chart that only taps select, so its lift selects nothing. */
  moved: boolean;
}

/**
 * Follows the keys, focus and pointers on `plot` until `signal` aborts,
 * drawing the selection into `svg` and reading it in `legend`.
 */
export function explore(
  plot: HTMLElement,
  svg: SVGSVGElement,
  legend: HTMLElement,
  words: Words,
  signal: AbortSignal,
): Explorer {
  let model: Model | undefined;
  let lay: Layout | undefined;
  let nav: Navigator | undefined;
  let sel: Selection | undefined;
  // What focus or the next arrow brings back after a clear.
  let memory: Selection | undefined;
  // The post x Up and Down aim for in the next row.
  let lastX: number | undefined;
  let touch: Touch | undefined;
  // A pointer that just lifted, whose leave the browser sends at once.
  let lifted: number | undefined;
  let pressed = false;

  const show = (): void => {
    if (model === undefined || lay === undefined || nav === undefined) {
      return;
    }
    drawSelection(svg, model, lay, sel, nav);
    const reading = sel === undefined ? overall(model, words) : selectionReading(model, sel, words);
    if (reading !== undefined) {
      writeLegend(legend, reading);
    }
  };

  const select = (next: Selection): void => {
    sel = next;
    memory = next;
    if (model !== undefined) {
      lastX = xOf(model, next) ?? lastX;
    }
    show();
  };

  const clear = (): void => {
    if (sel !== undefined) {
      sel = undefined;
      show();
    }
  };

  const say = (s: Selection, part: boolean): void => {
    if (model !== undefined) {
      announce(spoken(model, s, words, part));
    }
  };

  const pointAt = (e: PointerEvent): void => {
    if (lay === undefined || nav === undefined) {
      return;
    }
    const box = svg.getBoundingClientRect();
    const next = nav.pick(e.clientX - box.left - lay.left, e.clientY - box.top - lay.top);
    if (next !== undefined) {
      select(next);
    }
  };

  const on = <K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
  ): void => {
    plot.addEventListener(type, listener, { signal });
  };

  on("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }
    if (e.key === "Escape") {
      if (sel !== undefined) {
        e.preventDefault();
        clear();
      }
      return;
    }
    if (!isKey(e.key) || model === undefined || nav === undefined) {
      return;
    }
    e.preventDefault();
    if (sel === undefined) {
      const back = memory ?? initial(model);
      if (back !== undefined) {
        select(back);
        say(back, false);
      }
      return;
    }
    const next = nav.move(sel, e.key, lastX);
    if (next !== undefined) {
      select(next);
      // The keys that choose a part say it alone: Left and Right across a
      // bar or point row, Up and Down through a stack or the lines.
      const across = e.key === "ArrowLeft" || e.key === "ArrowRight";
      const band = next.kind === "bar" || next.kind === "point";
      say(next, band ? across : e.key === "ArrowUp" || e.key === "ArrowDown");
    }
  });

  on("focus", () => {
    const fromPointer = pressed;
    pressed = false;
    if (sel !== undefined || model === undefined) {
      return;
    }
    const back = memory ?? initial(model);
    if (back !== undefined) {
      select(back);
      if (!fromPointer) {
        say(back, false);
      }
    }
  });
  on("blur", clear);

  on("pointerdown", (e) => {
    pressed = true;
    lifted = undefined;
    if (e.pointerType === "touch") {
      touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, moved: false };
    }
  });
  on("pointermove", (e) => {
    lifted = undefined;
    if (e.pointerType !== "touch") {
      pointAt(e);
      return;
    }
    if (touch?.id !== e.pointerId) {
      return;
    }
    if (nav?.drags === true) {
      if (touch.dragging || Math.abs(e.clientX - touch.x) > DRAG) {
        touch.dragging = true;
        pointAt(e);
      }
    } else if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > DRAG) {
      touch.moved = true;
    }
  });
  on("pointerup", (e) => {
    pressed = false;
    if (e.pointerType !== "mouse") {
      lifted = e.pointerId;
    }
    if (e.pointerType === "touch" && touch?.id === e.pointerId) {
      if (!touch.dragging && !touch.moved) {
        pointAt(e);
      }
      touch = undefined;
    }
  });
  on("pointercancel", (e) => {
    pressed = false;
    if (touch?.id === e.pointerId) {
      // The browser took the touch for a scroll or a zoom.
      if (touch.dragging) {
        clear();
      }
      touch = undefined;
    }
  });
  // A touch, or a pen that cannot hover, leaves the plot as it lifts:
  // https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerout_event
  on("pointerleave", (e) => {
    if (e.pointerType !== "touch" && e.pointerId !== lifted) {
      clear();
    }
  });
  document.addEventListener(
    "pointerup",
    (e) => {
      if (e.pointerType !== "mouse" && !(e.target instanceof Node && plot.contains(e.target))) {
        clear();
      }
    },
    { signal },
  );

  const adopt = (m: Model): void => {
    if (model !== undefined && model !== m) {
      sel = sel === undefined ? undefined : rekey(model, sel, m);
      memory = memory === undefined ? undefined : rekey(model, memory, m);
      lay = undefined;
      nav = undefined;
    }
    model = m;
  };

  return {
    drawn(m, l) {
      adopt(m);
      lay = l;
      nav = navigator(m, l);
      show();
    },
    data: adopt,
    clear,
    reset() {
      sel = undefined;
      memory = undefined;
      lastX = undefined;
      touch = undefined;
      show();
      model = undefined;
      lay = undefined;
      nav = undefined;
    },
  };
}
