/**
 * field-error.ts — one field's error, shared by `./form` and
 * `./connection-test`: the field marked invalid, its sentence under it in a
 * `.cp-field-error`, tied by `aria-describedby`.
 * @internal
 * @module
 */

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The attribute on a field whose error is showing, valued by who showed
 * it, so `reportErrors` and a connection test each clear only their own. */
export const MARK = "data-cp-error";

/** Who showed a field's error. */
export type Owner = "form" | "test";
/** Each field's error once found or made, so a later call finds it again
 *  after clearError took it out of the field's aria-describedby. */
const known = new WeakMap<Control, HTMLElement>();
let seq = 0;

export function isControl(el: Element): el is Control {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

export function idOf(field: Control): string {
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

/** Writes `message` into `error`, keeping an icon the markup gave it. */
export function writeError(error: HTMLElement, message: string): void {
  for (const n of [...error.childNodes]) {
    if (!(n instanceof Element && n.classList.contains("cp-icon"))) {
      n.remove();
    }
  }
  error.append(message);
  error.hidden = false;
}

/** Marks `field` valid: its error hides and no longer describes it. With
 *  `owner`, only an error that owner showed. */
export function clearError(field: Control, owner?: Owner): void {
  if (owner !== undefined && field.getAttribute(MARK) !== owner) {
    return;
  }
  const error = errorOf(field);
  field.removeAttribute("aria-invalid");
  field.removeAttribute(MARK);
  if (error !== null) {
    describedBy(field, error.id, false);
    error.hidden = true;
  }
}

/** Shows `message` as `field`'s error, in `error` when given, else in the
 *  error clearError finds, else in one made at the end of its `.cp-field`,
 *  or after the field outside one. */
export function showError(
  field: Control,
  message: string,
  error?: HTMLElement,
  owner: Owner = "form",
): void {
  let el = error ?? errorOf(field);
  if (el === null) {
    el = document.createElement("span");
    el.className = "cp-field-error";
    el.id = `${idOf(field)}-error`;
    const host = field.closest(".cp-field");
    if (host === null) {
      field.after(el);
    } else {
      host.append(el);
    }
  } else if (el.id === "") {
    el.id = `${idOf(field)}-error`;
  }
  writeError(el, message);
  known.set(field, el);
  field.setAttribute("aria-invalid", "true");
  field.setAttribute(MARK, owner);
  describedBy(field, el.id, true);
}
