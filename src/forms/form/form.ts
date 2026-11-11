/**
 * form.ts — a form's errors, as the forms pattern in docs/design-patterns.md
 * asks: each field with an error is marked invalid and gets its sentence
 * under it, tied by `aria-describedby`. One error moves focus to its field;
 * two or more fill the form's summary, a list of links to each field, and
 * move focus to it. What the person typed stays.
 * @module
 */

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

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

const MARK = "data-cp-error";
/** Each field's error once found or made, so a later call finds it again
 *  after clearError took it out of the field's aria-describedby. */
const known = new WeakMap<Control, HTMLElement>();
let seq = 0;

function idOf(field: Control): string {
  if (field.id === "") {
    field.id = `cp-field-${String(++seq)}`;
  }
  return field.id;
}

function describedBy(field: Control, id: string, on: boolean): void {
  const ids = (field.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((t) => t !== "" && t !== id);
  if (on) {
    ids.push(id);
  }
  if (ids.length > 0) {
    field.setAttribute("aria-describedby", ids.join(" "));
  } else {
    field.removeAttribute("aria-describedby");
  }
}

function nameOf(field: Control): string {
  return (field.labels?.[0]?.textContent ?? field.getAttribute("aria-label") ?? field.name).trim();
}

/** The field's error: a `.cp-field-error` its `aria-describedby` names,
 *  else the element whose id is the field's id followed by `-error`. */
function errorOf(field: Control): HTMLElement | null {
  const kept = known.get(field);
  if (kept?.isConnected === true) {
    return kept;
  }
  const root = field.getRootNode() as Document | ShadowRoot;
  for (const id of (field.getAttribute("aria-describedby") ?? "").split(/\s+/)) {
    const el = id === "" ? null : root.getElementById(id);
    if (el?.classList.contains("cp-field-error") === true) {
      return el;
    }
  }
  return root.getElementById(`${idOf(field)}-error`);
}

/** Marks `field` valid: its error hides and no longer describes it. */
export function clearError(field: Control): void {
  const error = errorOf(field);
  field.removeAttribute("aria-invalid");
  field.removeAttribute(MARK);
  if (error !== null) {
    describedBy(field, error.id, false);
    error.hidden = true;
  }
}

function mark({ field, message }: FieldError): void {
  let error = errorOf(field);
  if (error === null) {
    error = document.createElement("span");
    error.className = "cp-field-error";
    error.id = `${idOf(field)}-error`;
    const host = field.closest(".cp-field");
    if (host === null) {
      field.after(error);
    } else {
      host.append(error);
    }
  }
  // An icon the markup gave the error stays; the words are this call's.
  for (const n of [...error.childNodes]) {
    if (!(n instanceof Element && n.classList.contains("cp-icon"))) {
      n.remove();
    }
  }
  error.append(message);
  error.hidden = false;
  known.set(field, error);
  field.setAttribute("aria-invalid", "true");
  field.setAttribute(MARK, "");
  describedBy(field, error.id, true);
}

/**
 * Shows `errors` on `form` and clears every error an earlier call showed
 * that `errors` no longer names. An empty list hides the summary. A field's
 * error is the `.cp-field-error` its `aria-describedby` names, else the
 * element whose id is its id followed by `-error`, else one made at the end
 * of its `.cp-field`, or after the field outside one.
 */
export function reportErrors(
  form: HTMLFormElement,
  errors: readonly FieldError[],
  options: ReportOptions,
): void {
  const { summary } = options;
  const named = new Set(errors.map((e) => e.field));
  for (const f of form.querySelectorAll<Control>(`[${MARK}]`)) {
    if (!named.has(f)) {
      clearError(f);
    }
  }
  for (const e of errors) {
    mark(e);
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
