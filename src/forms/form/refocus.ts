/**
 * refocus.ts — where focus goes when a repaint hides the control that held
 * it, such as Discard in a save bar that goes once nothing waits: a hidden
 * control drops focus to the document's body, where a screen reader loses
 * its place.
 * @internal
 * @module
 */

const FOCUSABLE = "input:not([type='hidden']), select, textarea, button, a[href], [tabindex]";

function firstShown(el: Element): HTMLElement | undefined {
  return [el, ...el.querySelectorAll(FOCUSABLE)].find(
    (c): c is HTMLElement =>
      c instanceof HTMLElement &&
      c.matches(FOCUSABLE) &&
      c.tabIndex >= 0 &&
      !c.matches(":disabled") &&
      c.checkVisibility(),
  );
}

/** Whether `el` holds focus and shows, read before a repaint. */
export function holdsFocus(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el === document.activeElement && el.checkVisibility();
}

/**
 * After a repaint hid `held`, which held focus: focuses the first of
 * `changed` that shows (a field, or the first control of a chips or rows
 * field's box), else the first control of `form` that shows. Does nothing
 * while `held` shows or once focus went elsewhere.
 */
export function refocus(
  form: HTMLFormElement,
  held: HTMLElement,
  changed: readonly Element[],
): void {
  const now = document.activeElement;
  if (held.checkVisibility() || (now !== held && now !== null && now !== document.body)) {
    return;
  }
  for (const el of [...changed, form]) {
    const target = firstShown(el);
    if (target !== undefined) {
      target.focus();
      return;
    }
  }
}
