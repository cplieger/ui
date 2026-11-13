/**
 * asker.ts — the questions asked before something drops a person's changes:
 * `./form`'s unsaved-changes guard sets one on the dialog that holds its
 * form, which `./dialog`'s listeners ask before Escape, a close command or a
 * close request ends it, and the guard asks its own before a link leaves.
 * @internal
 * @module
 */

export interface Asker {
  /** Whether going on would drop something now. */
  readonly waiting: () => boolean;
  /** Asks; resolves true when the person lets it go. */
  readonly ask: () => Promise<boolean>;
  /** Drops what waits, once every question has had its yes. */
  readonly dropped: () => void;
}

const askers = new WeakMap<HTMLDialogElement, Set<Asker>>();

/** Sets `asker` on `dialog` beside any it has, until `signal` aborts. */
export function addAsker(dialog: HTMLDialogElement, asker: Asker, signal?: AbortSignal): void {
  let set = askers.get(dialog);
  if (set === undefined) {
    set = new Set();
    askers.set(dialog, set);
  }
  set.add(asker);
  signal?.addEventListener(
    "abort",
    () => {
      set.delete(asker);
    },
    { once: true },
  );
}

/** The askers set on `dialog`, in the order they were set. */
export function askersOf(dialog: HTMLDialogElement): readonly Asker[] {
  return [...(askers.get(dialog) ?? [])];
}

/**
 * Asks each of `askers` that still waits, in turn, and resolves those that
 * said yes, or null at the first no. Nothing is dropped here, so a no on a
 * later question leaves every earlier one's changes in place.
 */
export async function askEach(askers: readonly Asker[]): Promise<readonly Asker[] | null> {
  const yes: Asker[] = [];
  for (const a of askers) {
    if (a.waiting()) {
      if (!(await a.ask())) {
        return null;
      }
      yes.push(a);
    }
  }
  return yes;
}
