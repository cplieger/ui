/**
 * focus.ts — where focus goes when an account screen draws a part again:
 * back to the same control, else to the part's heading, never the page,
 * as docs/design-patterns.md asks.
 * @module
 */

/** Focuses the control marked `data-cp-action="<key>"` in `root`, or the ⋯
 *  button of the menu holding it; false when none takes focus. */
function focusAction(root: HTMLElement, key: string): boolean {
  const target = root.querySelector<HTMLElement>(`[data-cp-action="${key}"]`);
  const menu = target?.closest<HTMLElement>("[role='menu']");
  const opener =
    menu === null || menu === undefined
      ? target
      : root.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`);
  if (opener === null) {
    return false;
  }
  opener.focus();
  return document.activeElement === opener;
}

/** The `data-cp-action` of `active`, or of the first item of the menu its
 *  ⋯ button opens. */
function actionOf(root: HTMLElement, active: HTMLElement): string | undefined {
  const own = active.dataset["cpAction"];
  if (own !== undefined) {
    return own;
  }
  const menu = active.getAttribute("popovertarget");
  const item =
    menu === null ? null : root.querySelector<HTMLElement>(`[id="${menu}"] [data-cp-action]`);
  return item?.dataset["cpAction"];
}

/** A part's heading, or a function answering it once the part is drawn. */
export type Heading = HTMLElement | (() => HTMLElement | undefined);

/**
 * Runs `draw`, which replaces what `part` holds. `asked` names the control
 * to focus after it, null `heading`. With none, a focused control in
 * `part` that `draw` took away gives focus to the new control with its
 * `data-cp-action`, scrolled as far as the old one, else to `heading`;
 * focus anywhere else stays.
 */
export function redrawKeepingFocus(
  part: HTMLElement,
  heading: Heading,
  draw: () => void,
  asked?: string | null,
): void {
  const active = document.activeElement;
  const held = active instanceof HTMLElement && part.contains(active) ? active : undefined;
  const key = held === undefined ? undefined : actionOf(part, held);
  const left = held?.scrollLeft ?? 0;
  draw();
  const lost = held !== undefined && document.activeElement !== held;
  const target = asked === undefined ? (lost ? (key ?? null) : undefined) : asked;
  if (target === undefined) {
    return;
  }
  if (target !== null && focusAction(part, target)) {
    if (target === key && document.activeElement instanceof HTMLElement) {
      document.activeElement.scrollLeft = left;
    }
    return;
  }
  (typeof heading === "function" ? heading() : heading)?.focus();
}

/** `heading`, else the first control in `root`, for a part a host heads
 *  itself. */
export function headingOr(heading: HTMLElement | undefined, root: HTMLElement): Heading {
  return () =>
    heading ??
    root.querySelector<HTMLElement>(
      "input:not([type='hidden'], [disabled]), select, textarea, button:not([disabled]), a[href]",
    ) ??
    undefined;
}
