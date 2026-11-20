/**
 * range.ts — `enhanceRange()` fills a `.cp-range`'s track to its thumb,
 * writes its value into its `<output>`, and shows the value over the thumb
 * while a pointer holds it or keys move it. The slider says its value in the
 * caller's words; the output, which shows the same, says nothing.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface RangeOptions {
  /** Where the value is written, such as the row's `<output>`. */
  readonly output?: HTMLOutputElement;
  /** Turns the value into words, such as `(v) => `${v} GB``, which are also
   *  the slider's value text. Default: the value itself. */
  readonly format?: (value: number) => string;
  /** Removes the listeners, the tip and the value text, and gives the
   *  output back its own live setting. */
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
  // An output is a polite live region, so each value would be said again
  // after the slider says it.
  const live = output?.getAttribute("aria-live") ?? null;
  output?.setAttribute("aria-live", "off");
  const update = (): void => {
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    const share = max > min ? (range.valueAsNumber - min) / (max - min) : 0;
    range.style.setProperty("--cp-range-fill", `${String(share * 100)}%`);
    const words = format(range.valueAsNumber);
    if (output !== undefined) {
      output.value = words;
    }
    if (words === String(range.valueAsNumber)) {
      range.removeAttribute("aria-valuetext");
    } else {
      range.setAttribute("aria-valuetext", words);
    }
    tip.textContent = words;
    if (row !== null) {
      // The thumb's centre travels the track less the thumb's own width.
      const rem = Number.parseFloat(getComputedStyle(range.ownerDocument.documentElement).fontSize);
      const thumb =
        Number.parseFloat(getComputedStyle(range).getPropertyValue("--cp-range-thumb")) * rem;
      // From the row's inline start, where the slider's minimum is in either
      // direction; the stylesheet places the tip by inset-inline-start.
      const start = range.matches(":dir(rtl)")
        ? row.clientWidth - range.offsetLeft - range.offsetWidth
        : range.offsetLeft;
      const x = start + thumb / 2 + share * (range.offsetWidth - thumb);
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
      range.removeAttribute("aria-valuetext");
      if (live === null) {
        output?.removeAttribute("aria-live");
      } else {
        output?.setAttribute("aria-live", live);
      }
    },
    { once: true },
  );
  update();
}
