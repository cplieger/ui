/**
 * pairs.ts — `enhancePairs()` runs a `.cp-pairs` list of rows of fields,
 * such as path mappings: "Add" appends an empty row made from the first
 * one, a row's remove takes it away, and focus follows each change.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface PairsOptions {
  /** After each add and removal. */
  readonly onChange?: () => void;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const ADDED = "data-cp-added";

/**
 * `box` holds the `<ul class="cp-pairs">` and a `data-add-pair` button.
 * Each row is an `<li>` whose fields may each have a `.cp-field-error`, and
 * a `data-remove-pair` button. A new row copies the first row as the page
 * drew it, with its values and errors cleared and each id numbered anew.
 */
export function enhancePairs(box: HTMLElement, options: PairsOptions = {}): void {
  const { signal, onChange } = options;
  const list = box.querySelector<HTMLUListElement>(".cp-pairs");
  const model = list?.querySelector(":scope > li")?.cloneNode(true);
  if (list === null || signal?.aborted === true) {
    return;
  }
  let n = list.children.length;
  const add = box.querySelector<HTMLButtonElement>("[data-add-pair]");

  const fresh = (): HTMLLIElement | null => {
    if (!(model instanceof HTMLLIElement)) {
      return null;
    }
    const row = model.cloneNode(true) as HTMLLIElement;
    n += 1;
    // "pm-from-1" becomes "pm-from-2", and "pm-from-1-error" "pm-from-2-error".
    const renamed = new Map<string, string>();
    for (const el of row.querySelectorAll<HTMLElement>("[id]")) {
      const m = /^(.*?)(?:-\d+)?(-error)?$/.exec(el.id);
      const id = `${m?.[1] ?? el.id}-${String(n)}${m?.[2] ?? ""}`;
      renamed.set(el.id, id);
      el.id = id;
    }
    for (const el of row.querySelectorAll<HTMLElement>("[aria-describedby], [for]")) {
      for (const name of ["aria-describedby", "for"]) {
        const v = el.getAttribute(name);
        if (v !== null) {
          el.setAttribute(
            name,
            v
              .split(/\s+/)
              .map((t) => renamed.get(t) ?? t)
              .join(" "),
          );
        }
      }
    }
    for (const f of row.querySelectorAll<HTMLInputElement>("input, textarea")) {
      f.value = "";
      f.removeAttribute("value");
      f.removeAttribute("aria-invalid");
      f.removeAttribute("data-cp-error");
    }
    for (const e of row.querySelectorAll<HTMLElement>(".cp-field-error")) {
      e.hidden = true;
    }
    row.setAttribute(ADDED, "");
    return row;
  };

  box.addEventListener(
    "click",
    (e) => {
      const b = e.target instanceof Element ? e.target.closest("button") : null;
      if (b === null || !box.contains(b)) {
        return;
      }
      if (b.hasAttribute("data-remove-pair")) {
        const row = b.closest("li");
        if (row === null) {
          return;
        }
        const next = row.nextElementSibling ?? row.previousElementSibling;
        row.remove();
        (next?.querySelector<HTMLElement>("input, select, textarea") ?? add)?.focus();
        onChange?.();
      } else if (b === add) {
        const row = fresh();
        if (row === null) {
          return;
        }
        list.append(row);
        row.querySelector<HTMLElement>("input, select, textarea")?.focus();
        onChange?.();
      }
    },
    until(signal),
  );
  box.addEventListener(
    "animationend",
    (e) => {
      if (e.target instanceof Element) {
        e.target.removeAttribute(ADDED);
      }
    },
    until(signal),
  );
}
