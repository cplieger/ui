/**
 * range.ts — `enhanceRange()` fills a `.cp-range`'s track to its thumb,
 * writes its value into its `<output>`, and shows the value over the thumb
 * while a pointer holds it or keys move it.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface RangeOptions {
  /** Where the value is written, such as the row's `<output>`. */
  readonly output?: HTMLOutputElement;
  /** Turns the value into words, such as `(v) => `${v} GB``. Default: the
   *  value itself. */
  readonly format?: (value: number) => string;
  /** Removes the listeners and the tip. */
  readonly signal?: AbortSignal;
}

const HELD = "data-cp-held";

/** `range` sits in a `.cp-range-row`, which holds the tip. */
export function enhanceRange(range: HTMLInputElement, options: RangeOptions = {}): void {
  const { output, signal } = options;
  const row = range.closest<HTMLElement>(".cp-range-row");
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const format = options.format ?? ((v: number) => String(v));
  const tip = document.createElement("span");
  tip.className = "cp-range-tip";
  tip.setAttribute("aria-hidden", "true");
  row?.append(tip);
  const update = (): void => {
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    const share = max > min ? (range.valueAsNumber - min) / (max - min) : 0;
    range.style.setProperty("--cp-range-fill", `${String(share * 100)}%`);
    const words = format(range.valueAsNumber);
    if (output !== undefined) {
      output.value = words;
    }
    tip.textContent = words;
    if (row !== null) {
      // The thumb's centre travels the track less the thumb's own width.
      const rem = Number.parseFloat(getComputedStyle(range.ownerDocument.documentElement).fontSize);
      const thumb =
        Number.parseFloat(getComputedStyle(range).getPropertyValue("--cp-range-thumb")) * rem;
      const along = range.matches(":dir(rtl)") ? 1 - share : share;
      const x = range.offsetLeft + thumb / 2 + along * (range.offsetWidth - thumb);
      tip.style.setProperty("--cp-range-tip-x", `${String(Math.round(x))}px`);
    }
  };
  range.addEventListener("input", update, listen);
  range.addEventListener(
    "pointerdown",
    () => {
      row?.setAttribute(HELD, "");
    },
    listen,
  );
  for (const type of ["pointerup", "pointercancel"]) {
    range.ownerDocument.addEventListener(
      type,
      () => {
        row?.removeAttribute(HELD);
      },
      listen,
    );
  }
  const resize = new ResizeObserver(update);
  resize.observe(range);
  signal?.addEventListener(
    "abort",
    () => {
      resize.disconnect();
      tip.remove();
      row?.removeAttribute(HELD);
    },
    { once: true },
  );
  update();
}
