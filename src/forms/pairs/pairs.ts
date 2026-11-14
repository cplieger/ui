/**
 * pairs.ts — `enhancePairs()` runs a `.cp-pairs` list of rows of fields,
 * such as path mappings: "Add" appends an empty row made from the first
 * one, a row's remove takes it away, and focus follows each change.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";
import { focusIn } from "../../core/tree/tree.js";
import { holds } from "../form/changed.js";
import { type Values, registerPiece, touched } from "../form/pieces.js";

export interface PairsOptions {
  /** After each add and removal. */
  readonly onChange?: () => void;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const ADDED = "data-cp-added";

type RowControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** A row's fields, each keyed by its name, or by its place when it has
 *  none. */
function fieldsOf(row: Element): [string, RowControl][] {
  return [...row.querySelectorAll<RowControl>("input, select, textarea")]
    .filter((c) => c.type !== "button" && c.type !== "submit" && c.type !== "reset")
    .map((c, i) => [c.name === "" ? `:${String(i)}` : c.name, c]);
}

const read = (c: RowControl): string =>
  c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")
    ? String(c.checked)
    : c.value;

function write(c: RowControl, v: string): void {
  if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) {
    c.checked = v === "true";
  } else {
    c.value = v;
  }
}

/** Whether `c` holds `v` as `write` gives it; `""`, a value left out, is an
 *  unchecked box. */
function fits(c: RowControl, v: string): boolean {
  if (c instanceof HTMLSelectElement) {
    return [...c.options].some((o) => o.value === v);
  }
  if (c instanceof HTMLInputElement) {
    return c.type === "checkbox" || c.type === "radio"
      ? v === "true" || v === "false" || v === ""
      : holds(c, v);
  }
  return true;
}

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

  const rows = (): HTMLLIElement[] =>
    [...list.children].filter((r): r is HTMLLIElement => r instanceof HTMLLIElement);
  // A form's reset and the unsaved-changes guard put the rows back by these,
  // as a reset puts a native field back.
  registerPiece(
    {
      element: box,
      value: () => {
        const values: Record<string, string[]> = {};
        for (const row of rows()) {
          for (const [key, c] of fieldsOf(row)) {
            (values[key] ??= []).push(read(c));
          }
        }
        return values;
      },
      set: (next: Values) => {
        const need = Math.max(0, ...Object.values(next).map((v) => v.length));
        const focused = focusIn(box);
        for (const row of rows().slice(need)) {
          row.remove();
        }
        while (rows().length < need) {
          const row = fresh();
          if (row === null) {
            break;
          }
          row.removeAttribute(ADDED);
          list.append(row);
        }
        for (const [i, row] of rows().entries()) {
          for (const [key, c] of fieldsOf(row)) {
            write(c, next[key]?.[i] ?? "");
          }
        }
        if (focused !== null && !focused.isConnected) {
          add?.focus();
        }
        touched(box);
        onChange?.();
      },
      fits: (next: Values) => {
        const need = Math.max(0, ...Object.values(next).map((v) => v.length));
        if (!(model instanceof HTMLLIElement)) {
          const have = rows().length;
          const over = Object.entries(next).find(([, v]) => v.length > have);
          return over === undefined
            ? null
            : `${over[0]} needs at most ${String(have)} values, one for each row`;
        }
        for (const [key, c] of fieldsOf(model)) {
          for (let i = 0; i < need; i++) {
            if (!fits(c, next[key]?.[i] ?? "")) {
              return `${key} needs a value its field holds`;
            }
          }
        }
        return null;
      },
    },
    signal,
  );

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
        touched(box);
        onChange?.();
      } else if (b === add) {
        const row = fresh();
        if (row === null) {
          return;
        }
        list.append(row);
        row.querySelector<HTMLElement>("input, select, textarea")?.focus();
        touched(box);
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
