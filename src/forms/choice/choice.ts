/**
 * choice.ts — `enhanceChoiceFields()` keeps a radio's own field, such as
 * "Every [30] minutes", live only while its radio is chosen. The field is
 * never disabled, so focus on it is never lost: it leaves the tab order and
 * reads as unavailable, and focusing it chooses its radio.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface ChoiceFieldOptions {
  /** Removes the listeners, and the state written on the fields. */
  readonly signal?: AbortSignal;
}

const FIELD = ".cp-choice-field :is(input:not([type='radio']), select, textarea)";

function radioOf(field: Element): HTMLInputElement | null {
  return (
    field.closest(".cp-choice")?.querySelector<HTMLInputElement>("input[type='radio']") ?? null
  );
}

/**
 * Enhances every `.cp-choice-field` in `group`, a `.cp-choices`, read at each
 * change, so choices added later need no call.
 */
export function enhanceChoiceFields(group: HTMLElement, options: ChoiceFieldOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const fields = (): HTMLElement[] => [...group.querySelectorAll<HTMLElement>(FIELD)];
  const sync = (): void => {
    for (const f of fields()) {
      const live = radioOf(f)?.checked === true;
      f.setAttribute("aria-disabled", String(!live));
      f.tabIndex = live ? 0 : -1;
    }
  };
  group.addEventListener("change", sync, listen);
  group.addEventListener(
    "focusin",
    (e) => {
      const f = e.target instanceof Element ? e.target.closest(FIELD) : null;
      const radio = f === null ? null : radioOf(f);
      if (radio !== null && !radio.checked) {
        radio.checked = true;
        // Chosen by the person, so the form hears it as a press of the radio.
        radio.dispatchEvent(new Event("input", { bubbles: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    listen,
  );
  signal?.addEventListener(
    "abort",
    () => {
      for (const f of fields()) {
        f.removeAttribute("aria-disabled");
        f.removeAttribute("tabindex");
      }
    },
    { once: true },
  );
  sync();
}
