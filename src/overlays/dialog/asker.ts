/**
 * asker.ts — a question a dialog asks before Escape, a close command or a
 * close request ends it, set by `./form`'s unsaved-changes guard on the
 * dialog that holds its form and read by `./dialog`'s listeners.
 * @internal
 * @module
 */

export interface Asker {
  /** Whether a close would drop something now. */
  readonly waiting: () => boolean;
  /** Asks; resolves true when the person lets the dialog close. */
  readonly ask: () => Promise<boolean>;
  /** Drops what waits, once the dialog has closed on that answer. */
  readonly dropped: () => void;
}

const askers = new WeakMap<HTMLDialogElement, Asker>();

export function setAsker(dialog: HTMLDialogElement, asker: Asker, signal?: AbortSignal): void {
  askers.set(dialog, asker);
  signal?.addEventListener(
    "abort",
    () => {
      if (askers.get(dialog) === asker) {
        askers.delete(dialog);
      }
    },
    { once: true },
  );
}

export function askerOf(dialog: HTMLDialogElement): Asker | undefined {
  return askers.get(dialog);
}
