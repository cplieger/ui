/**
 * chip.ts — `flashChip()` flashes a `.cp-chip`'s tone solid once and fades
 * it back to its wash, for a state that changed while the person watched.
 * css/system draws the flash; this starts it, and starts it again on a
 * second change mid-flash.
 * @module
 */

const FLASH = "data-cp-flash";

/** The flash's own animations, while one runs. */
function flashing(chip: HTMLElement): CSSAnimation[] {
  return chip
    .getAnimations()
    .filter(
      (a): a is CSSAnimation => a instanceof CSSAnimation && a.animationName.startsWith("cp-chip-"),
    );
}

/**
 * Flashes `chip` after its host has written the new state (its `data-tone`,
 * glyph and word). Say the change through `announce` when it matters to
 * someone not looking: the flash is only seen.
 */
export function flashChip(chip: HTMLElement): void {
  const running = flashing(chip);
  if (running.length > 0) {
    for (const a of running) {
      a.currentTime = 0;
    }
    return;
  }
  // An attribute left by a flash that has just ended must change for the
  // stylesheet to start a new one; reading the animations applies the change.
  if (chip.hasAttribute(FLASH)) {
    chip.removeAttribute(FLASH);
    flashing(chip);
  }
  chip.setAttribute(FLASH, "");
  // A flash cut short (the chip hidden or removed) rejects `finished` with no
  // animation event when it had not started yet.
  void Promise.allSettled(flashing(chip).map((a) => a.finished)).then(() => {
    if (flashing(chip).length === 0) {
      chip.removeAttribute(FLASH);
    }
  });
}
