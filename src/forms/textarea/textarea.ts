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
  /** Shows "{length} / {max}", and describes the area. */
  readonly count?: HTMLElement;
  /** The count's words. Default "{length} / {max}". */
  readonly words?: (length: number, max: number) => string;
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

const OVER = "data-cp-over";

export function enhanceTextarea(area: HTMLTextAreaElement, options: TextareaOptions = {}): void {
  const { max, count, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const grows = CSS.supports("field-sizing", "content");
  const words = options.words ?? ((n: number, m: number) => `${String(n)} / ${String(m)}`);
  if (count !== undefined) {
    count.id ||= `${area.id || "cp-textarea"}-count`;
    const ids = (area.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(count.id)) {
      area.setAttribute("aria-describedby", [...ids, count.id].join(" "));
    }
  }
  const update = (): void => {
    const n = area.value.length;
    if (max !== undefined) {
      const over = n > max;
      if (count !== undefined) {
        count.textContent = words(n, max);
        count.toggleAttribute(OVER, over);
      }
      if (over) {
        area.setAttribute("aria-invalid", "true");
      } else {
        area.removeAttribute("aria-invalid");
      }
    }
    if (!grows) {
      area.style.blockSize = "auto";
      area.style.blockSize = `${String(area.scrollHeight + area.offsetHeight - area.clientHeight)}px`;
    }
  };
  area.addEventListener("input", update, until(signal));
  update();
}
