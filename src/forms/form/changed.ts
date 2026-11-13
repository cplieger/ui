/**
 * changed.ts — what a person changed in a form or a dialog: each control
 * whose value differs from what the form's reset would put back, and each
 * piece (`./pieces`) whose values differ from its saved ones. Shared by the
 * unsaved-changes guard and `./dialog`'s `data-keep-typed`.
 * @internal
 * @module
 */

import { type Control, isControl } from "./field-error.js";
import { pieceChanged, pieceOf, piecesIn } from "./pieces.js";

/** Input types that hold no value of the person's: a press, or a value the
 *  page sets. */
const NOT_TYPED = new Set(["button", "submit", "reset", "image", "hidden"]);

/** The value a reset gives `input`: its default, cleaned as its type cleans
 *  a value, so a range or colour with no `value` attribute is no change. */
export function resetValue(input: HTMLInputElement): string {
  const fresh = input.ownerDocument.createElement("input");
  for (const name of ["type", "min", "max", "step", "multiple"]) {
    const v = input.getAttribute(name);
    if (v !== null) {
      fresh.setAttribute(name, v);
    }
  }
  fresh.value = input.defaultValue;
  return fresh.value;
}

/** Which options a reset selects: the `selected` ones, and for a one-line
 *  single select the last of them, else its first enabled option
 *  (https://html.spec.whatwg.org/multipage/form-elements.html#selectedness-setting-algorithm). */
export function resetSelection(select: HTMLSelectElement): boolean[] {
  const options = [...select.options];
  const want = options.map((o) => o.defaultSelected);
  if (select.multiple) {
    return want;
  }
  const last = want.lastIndexOf(true);
  const pick =
    last === -1 && select.size <= 1 ? options.findIndex((o) => !o.matches(":disabled")) : last;
  return options.map((_, i) => i === pick);
}

export function textDefault(area: HTMLTextAreaElement): string {
  return area.defaultValue.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/** Whether `c` holds a value of the person's, as against one a press or the
 *  page gives it. */
export function isTyped(c: Control): boolean {
  return !(c instanceof HTMLInputElement && NOT_TYPED.has(c.type));
}

function controlChanged(c: Control): boolean {
  if (c instanceof HTMLSelectElement) {
    const want = resetSelection(c);
    return [...c.options].some((o, i) => o.selected !== want[i]);
  }
  if (c instanceof HTMLTextAreaElement) {
    return c.value !== textDefault(c);
  }
  if (c.type === "checkbox" || c.type === "radio") {
    return c.checked !== c.defaultChecked;
  }
  // A reset empties a file field, whatever its value attribute says.
  if (c.type === "file") {
    return (c.files?.length ?? 0) > 0;
  }
  return c.value !== resetValue(c);
}

/** The controls a person types into under `root`, a form's own and those
 *  joined to it by `form=` included, outside any piece. */
export function controlsOf(root: Element): Control[] {
  const all =
    root instanceof HTMLFormElement
      ? [...root.elements]
      : [...root.querySelectorAll("input, select, textarea")];
  return all.filter(
    (el): el is Control =>
      isControl(el) && isTyped(el) && !el.matches(":disabled") && pieceOf(el) === undefined,
  );
}

/**
 * The changes under `root`, in page order: each changed control, a radio
 * group once by its checked radio (else its first), and each changed piece
 * by its box.
 */
export function changesIn(root: Element): Element[] {
  const found: Element[] = [];
  const groups = new Map<string, HTMLInputElement[]>();
  for (const c of controlsOf(root)) {
    if (c instanceof HTMLInputElement && c.type === "radio" && c.name !== "") {
      const group = groups.get(c.name);
      if (group === undefined) {
        groups.set(c.name, [c]);
      } else {
        group.push(c);
      }
    } else if (controlChanged(c)) {
      found.push(c);
    }
  }
  for (const group of groups.values()) {
    const pick = group.find((r) => r.checked) ?? group[0];
    if (pick !== undefined && group.some(controlChanged)) {
      found.push(pick);
    }
  }
  for (const p of piecesIn(root)) {
    if (pieceChanged(p)) {
      found.push(p.element);
    }
  }
  return found.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}
