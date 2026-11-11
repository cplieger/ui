/**
 * active-filters.ts — `enhanceActiveFilters()` runs a `.cp-active-filters`
 * row: a `.cp-token` chip for each filter in force, each with its Remove,
 * then Clear filters, shown only while a filter is on. A press ends its
 * filter and moves focus to the next chip, or to Clear while one is left,
 * or to the count once none is. The app owns the filters and the count, and
 * the count it writes through `setCount()` is announced once it stops
 * changing.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";

/** The words the row writes, each given the filter's words. */
export interface ActiveFiltersWords {
  /** A chip's Remove, unless the button is named already. Default "Remove
   *  {filter}". */
  readonly remove?: (filter: string) => string;
}

export interface ActiveFiltersOptions {
  /** The result count, such as "38 of 412", which `setCount()` writes. */
  readonly count: HTMLElement;
  /** Where focus goes once no filter is left. Default: the count, which
   *  takes `tabindex="-1"`. */
  readonly rest?: HTMLElement;
  /** After a press ends a filter, or Clear ends them all, with the values
   *  left in order. */
  readonly onChange?: (values: readonly string[]) => void;
  /** How long the count must stay the same before it is announced, in ms.
   *  Default 500. */
  readonly settle?: number;
  readonly words?: ActiveFiltersWords;
  /** Removes the listeners and drops a count not yet announced. */
  readonly signal?: AbortSignal;
}

export interface ActiveFilters {
  /** The `data-value` of each filter in force, in order. */
  readonly values: readonly string[];
  /** Writes the count, announced once it has stayed the same for `settle`
   *  ms. */
  setCount(text: string): void;
  /** Names the chips' Remove buttons and shows or hides Clear, after the app
   *  adds or replaces chips. */
  sync(): void;
}

const LEAVING = "data-cp-leaving";

/**
 * `row` holds a `.cp-token` for each filter, with its `data-value`, its
 * words in a `<span>` and a Remove `<button>`, then a `data-filters-clear`
 * button. A removed chip shrinks away as a token does.
 */
export function enhanceActiveFilters(
  row: HTMLElement,
  options: ActiveFiltersOptions,
): ActiveFilters {
  const { count, onChange, signal } = options;
  const settle = options.settle ?? 500;
  const removeWords = options.words?.remove ?? ((f: string) => `Remove ${f}`);
  const rest = options.rest ?? count;
  if (rest === count && !count.hasAttribute("tabindex")) {
    count.tabIndex = -1;
  }
  const clearButton = row.querySelector<HTMLButtonElement>("[data-filters-clear]");
  const chips = (): HTMLElement[] =>
    [...row.querySelectorAll<HTMLElement>(":scope > .cp-token")].filter(
      (c) => !c.hasAttribute(LEAVING),
    );
  const values = (): string[] => chips().map((c) => c.dataset["value"] ?? "");

  const sync = (): void => {
    for (const chip of chips()) {
      const button = chip.querySelector("button");
      if (button !== null) {
        button.type = "button";
        if (!button.hasAttribute("aria-label")) {
          button.setAttribute("aria-label", removeWords(chip.textContent.trim()));
        }
      }
    }
    if (clearButton !== null) {
      clearButton.hidden = chips().length === 0;
    }
  };

  let said = count.textContent;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const setCount = (text: string): void => {
    count.textContent = text;
    clearTimeout(timer);
    if (signal?.aborted === true) {
      return;
    }
    timer = setTimeout(() => {
      if (text !== said) {
        said = text;
        announce(text);
      }
    }, settle);
  };

  const leave = (chip: HTMLElement): void => {
    chip.setAttribute(LEAVING, "");
    const gone = (): void => {
      chip.remove();
    };
    void Promise.all(chip.getAnimations({ subtree: true }).map((a) => a.finished)).then(gone, gone);
  };

  const controller: ActiveFilters = {
    get values() {
      return values();
    },
    setCount,
    sync,
  };
  sync();
  if (signal?.aborted === true) {
    return controller;
  }

  row.addEventListener(
    "click",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const chip = t?.closest(".cp-token > button")?.parentElement;
      if (
        chip instanceof HTMLElement &&
        chip.parentElement === row &&
        !chip.hasAttribute(LEAVING)
      ) {
        const all = chips();
        const next = all[all.indexOf(chip) + 1]?.querySelector("button");
        leave(chip);
        sync();
        (next ?? (all.length > 1 ? clearButton : null) ?? rest).focus();
        onChange?.(values());
      } else if (clearButton !== null && t?.closest("[data-filters-clear]") === clearButton) {
        for (const c of chips()) {
          leave(c);
        }
        sync();
        rest.focus();
        onChange?.([]);
      }
    },
    until(signal),
  );
  whenAborted(signal, () => {
    clearTimeout(timer);
  });
  return controller;
}
