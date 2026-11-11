/**
 * search.ts — `enhanceSearch()` gives a `.cp-search` its clear button: a
 * press empties the field, tells the page as typing would, and gives focus
 * back to the field. The stylesheet shows the button only while there is
 * text.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface SearchOptions {
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

/** `search` holds the field and a quiet `.cp-button` named, for example,
 *  "Clear search". */
export function enhanceSearch(search: HTMLElement, options: SearchOptions = {}): void {
  const { signal } = options;
  const input = search.querySelector<HTMLInputElement>(":scope > input");
  const clear = search.querySelector<HTMLButtonElement>(":scope > button");
  if (input === null || clear === null || signal?.aborted === true) {
    return;
  }
  clear.type = "button";
  clear.addEventListener(
    "click",
    () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    },
    until(signal),
  );
}
