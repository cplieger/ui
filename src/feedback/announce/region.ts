/**
 * region.ts — how a message goes into a live region so a screen reader
 * reads it: `./announce`'s regions and a module's own, such as a panel's.
 * @module
 * @internal
 */

/** The pause between emptying a region and writing to it, so the same
 *  message twice is read twice. */
const GAP_MS = 100;

const pending = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

/** Empties `region`, then writes `message` into it after the pause; a
 *  second message within the pause replaces the first. */
export function writeRegion(region: HTMLElement, message: string): void {
  region.textContent = "";
  clearTimeout(pending.get(region));
  pending.set(
    region,
    setTimeout(() => {
      pending.delete(region);
      region.textContent = message;
    }, GAP_MS),
  );
}

/** Drops the message still waiting for `region`, if any. */
export function cancelRegion(region: Element): void {
  if (region instanceof HTMLElement) {
    clearTimeout(pending.get(region));
    pending.delete(region);
  }
}
