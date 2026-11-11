/**
 * date-range.ts — `enhanceDateRange()` ties two native date fields to the
 * quick ranges beside them: a quick range fills both dates, typing a date
 * clears the quick range, and an end before the start is an error on the
 * end, as `./form` shows errors.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";
import { clearError, showError } from "../form/field-error.js";

export interface DateRangeOptions {
  /** The end field's error when it comes before the start. Default "The
   *  end comes before the start." */
  readonly order?: string;
  /** Today, for the quick ranges. Default: the clock. */
  readonly today?: () => Date;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

/** A local date as a date field's value, "2026-11-15". */
function day(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * `range` holds two `<input type="date">`, the start then the end, and may
 * hold radios for the quick ranges, each valued by how many days it spans
 * up to today, or `"all"` for any time.
 */
export function enhanceDateRange(range: HTMLElement, options: DateRangeOptions = {}): void {
  const { signal, today = () => new Date() } = options;
  const order = options.order ?? "The end comes before the start.";
  const [from, to] = [...range.querySelectorAll<HTMLInputElement>('input[type="date"]')];
  if (from === undefined || to === undefined || signal?.aborted === true) {
    return;
  }
  const quick = (): HTMLInputElement[] => [
    ...range.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ];
  const check = (): void => {
    if (from.value !== "" && to.value !== "" && to.value < from.value) {
      showError(to, order, undefined, "date-range");
    } else {
      clearError(to, "date-range");
    }
  };
  const fill = (value: string): void => {
    const n = Number(value);
    if (value === "all" || !Number.isFinite(n) || n < 1) {
      from.value = "";
      to.value = "";
    } else {
      const end = today();
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
      from.value = day(start);
      to.value = day(end);
    }
    check();
  };
  range.addEventListener(
    "change",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) {
        return;
      }
      if (t.type === "radio" && t.checked) {
        fill(t.value);
      } else if (t === from || t === to) {
        for (const r of quick()) {
          r.checked = false;
        }
        check();
      }
    },
    until(signal),
  );
  const chosen = quick().find((r) => r.checked);
  if (chosen === undefined) {
    check();
  } else {
    fill(chosen.value);
  }
}
