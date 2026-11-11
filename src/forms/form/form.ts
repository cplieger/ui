/**
 * form.ts — a form's errors, as the forms pattern in docs/design-patterns.md
 * asks: each field with an error is marked invalid and gets its sentence
 * under it, tied by `aria-describedby`. One error moves focus to its field;
 * two or more fill the form's summary, a list of links to each field, and
 * move focus to it. What the person typed stays.
 * @module
 */

import { type Control, MARK, clearError as clear, idOf, showError as show } from "./field-error.js";

export type { Control } from "./field-error.js";

/** Marks `field` valid: its error hides and no longer describes it, whoever
 *  showed it. */
export function clearError(field: Control): void {
  clear(field);
}

/** Shows `message` as `field`'s error, as `reportErrors` does for one field,
 *  without the summary or a move of focus. */
export function showError(field: Control, message: string): void {
  show(field, message);
}

export interface FieldError {
  readonly field: Control;
  /** The sentence that names the fix, such as "Enter 5 minutes or more". */
  readonly message: string;
}

export interface ReportOptions {
  /** The form's summary, such as a hidden `.cp-notice` with
   *  `data-tone="danger"` at its top. Its `[data-part="body"]`, or the
   *  summary itself, takes the heading and the links. */
  readonly summary: HTMLElement;
  /** The summary's heading for `count` errors, such as "2 settings need a
   *  fix before they save". */
  readonly heading: (count: number) => string;
}

function nameOf(field: Control): string {
  return (field.labels?.[0]?.textContent ?? field.getAttribute("aria-label") ?? field.name).trim();
}

/**
 * Shows `errors` on `form` and clears every error an earlier call or
 * `showError` showed that `errors` no longer names. An error a connection
 * test, a date range or a file field showed stays until that module clears
 * it or this call names its field. An empty list hides the summary. A
 * field's error is the `.cp-field-error` its `aria-describedby` names, else
 * the element whose id is its id followed by `-error`, else one made at the
 * end of its `.cp-field`, or after the field outside one.
 */
export function reportErrors(
  form: HTMLFormElement,
  errors: readonly FieldError[],
  options: ReportOptions,
): void {
  const { summary } = options;
  const named = new Set(errors.map((e) => e.field));
  for (const f of form.querySelectorAll<Control>(`[${MARK}="form"]`)) {
    if (!named.has(f)) {
      clear(f);
    }
  }
  for (const e of errors) {
    show(e.field, e.message);
  }
  if (errors.length < 2) {
    summary.hidden = true;
    errors[0]?.field.focus();
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = options.heading(errors.length);
  const list = document.createElement("ul");
  for (const { field } of errors) {
    const link = document.createElement("a");
    link.href = `#${idOf(field)}`;
    link.textContent = nameOf(field);
    // Focus the field and bring its label into view, which a jump to the
    // fragment alone does not.
    link.addEventListener("click", (e) => {
      e.preventDefault();
      field.focus();
      (field.labels?.[0] ?? field).scrollIntoView({ block: "nearest" });
    });
    const item = document.createElement("li");
    item.append(link);
    list.append(item);
  }
  (summary.querySelector("[data-part='body']") ?? summary).replaceChildren(heading, list);
  summary.hidden = false;
  summary.tabIndex = -1;
  summary.focus();
}
