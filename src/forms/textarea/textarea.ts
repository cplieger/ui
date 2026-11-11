/**
 * textarea.ts — `enhanceTextarea()` counts a text area's characters against
 * its limit, marks it invalid once past it, and grows it with its text where
 * the engine cannot size it to its content (`field-sizing`).
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface TextareaOptions {
  /** The most characters the area takes before it reads as invalid. */
  readonly max?: number;
  /** Shows the count, "{length} / {max}" with a limit or "{length}"
   *  without, and describes the area. */
  readonly count?: HTMLElement;
  /** The count's words. Default as `count` says. */
  readonly words?: (length: number, max: number | undefined) => string;
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

const OVER = "data-cp-over";
let seq = 0;

export function enhanceTextarea(area: HTMLTextAreaElement, options: TextareaOptions = {}): void {
  const { max, count, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const grows = CSS.supports("field-sizing", "content");
  const words =
    options.words ??
    ((n: number, m: number | undefined) =>
      m === undefined ? String(n) : `${String(n)} / ${String(m)}`);
  if (count !== undefined) {
    count.id ||= `cp-textarea-count-${String(++seq)}`;
    const ids = (area.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(count.id)) {
      area.setAttribute("aria-describedby", [...ids, count.id].join(" "));
    }
  }
  // Only the limit's own mark is cleared here, so an error a form check
  // set stays until that check clears it.
  let marked = false;
  const update = (): void => {
    const n = area.value.length;
    const over = max !== undefined && n > max;
    if (count !== undefined) {
      count.textContent = words(n, max);
      count.toggleAttribute(OVER, over);
    }
    if (over && !marked) {
      area.setAttribute("aria-invalid", "true");
      marked = true;
    } else if (!over && marked) {
      area.removeAttribute("aria-invalid");
      marked = false;
    }
    if (!grows) {
      area.style.blockSize = "auto";
      area.style.blockSize = `${String(area.scrollHeight + area.offsetHeight - area.clientHeight)}px`;
    }
  };
  area.addEventListener("input", update, until(signal));
  update();
}
