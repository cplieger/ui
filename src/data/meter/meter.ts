/**
 * meter.ts — `enhanceMeter()` lays out a `.cp-meter`'s native `<meter>`
 * elements as one bar, each segment sized by its range, colours each by
 * where its value falls, and marks the bar at each meter's `low` and `high`.
 * @module
 */

import { whenAborted } from "../../core/lifetime/lifetime.js";
import { localeOf } from "../../core/locale/locale.js";

export interface MeterOptions {
  /** Removes the marks, the levels and the sizes the script wrote. */
  readonly signal?: AbortSignal;
}

type MeterLevel = "optimum" | "suboptimum" | "even-less-good";

const RANK: Readonly<Record<MeterLevel, number>> = {
  optimum: 0,
  suboptimum: 1,
  "even-less-good": 2,
};

// The region HTML's meter algorithm puts the value in. Its suboptimum region
// runs "from the low boundary", so a value at the mark next to the optimum is
// past it, as Gecko reads it; Blink and WebKit colour that value optimum.
// https://html.spec.whatwg.org/multipage/form-elements.html#the-meter-element
// https://searchfox.org/mozilla-central/source/dom/html/HTMLMeterElement.cpp
// https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/html_meter_element.cc
function meterLevel(meter: HTMLMeterElement): MeterLevel {
  const { value, low, high, optimum } = meter;
  if (optimum < low) {
    return value < low ? "optimum" : value <= high ? "suboptimum" : "even-less-good";
  }
  if (optimum > high) {
    return value > high ? "optimum" : value >= low ? "suboptimum" : "even-less-good";
  }
  return value >= low && value <= high ? "optimum" : "suboptimum";
}

/**
 * `host` is a `.cp-meter` whose `[data-part="bar"]` holds one `<meter>`, or
 * several that share one bar, such as one per language. The page names each
 * meter and writes its value in words in `[data-part="words"]`; the marks are
 * not read. The bar follows every later change to its meters' values and
 * bounds, and the host takes its worst meter's level as `data-cp-level`.
 */
export function enhanceMeter(host: HTMLElement, options: MeterOptions = {}): void {
  const { signal } = options;
  const bar = host.querySelector<HTMLElement>('[data-part="bar"]');
  if (bar === null || signal?.aborted === true) {
    return;
  }
  const marks = document.createElement("div");
  marks.dataset["part"] = "marks";
  marks.setAttribute("aria-hidden", "true");
  bar.after(marks);

  const draw = (): void => {
    const meters = [...bar.querySelectorAll("meter")];
    const total = meters.reduce((sum, m) => sum + (m.max - m.min), 0);
    const percent = new Intl.NumberFormat(localeOf(host), {
      style: "percent",
      maximumFractionDigits: 1,
    });
    const labels: HTMLElement[] = [];
    let worst: MeterLevel = "optimum";
    let before = 0;
    meters.forEach((meter, i) => {
      const range = meter.max - meter.min;
      meter.style.flexGrow = String(range);
      const level = meterLevel(meter);
      meter.dataset["cpLevel"] = level;
      if (RANK[level] > RANK[worst]) {
        worst = level;
      }
      for (const at of new Set([meter.low, meter.high])) {
        if (at <= meter.min || at >= meter.max || total <= 0) {
          continue;
        }
        const along = (before + at - meter.min) / total;
        const mark = document.createElement("span");
        // A segment's start moves by the gaps before it, so the gaps are
        // taken out of the width the shares are of.
        mark.style.insetInlineStart = `calc((100% - ${String(meters.length - 1)} * var(--cp-meter-gap)) * ${String(along)} + ${String(i)} * var(--cp-meter-gap))`;
        mark.textContent = percent.format((at - meter.min) / range);
        labels.push(mark);
      }
      before += range;
    });
    marks.replaceChildren(...labels);
    marks.hidden = labels.length === 0;
    host.dataset["cpLevel"] = worst;
  };

  draw();
  const watch = new MutationObserver(draw);
  watch.observe(bar, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["value", "min", "max", "low", "high", "optimum"],
  });
  whenAborted(signal, () => {
    watch.disconnect();
    marks.remove();
    delete host.dataset["cpLevel"];
    for (const meter of bar.querySelectorAll("meter")) {
      meter.style.removeProperty("flex-grow");
      delete meter.dataset["cpLevel"];
    }
  });
}
