/**
 * pointer.ts — The pointer tier css/system sizes controls from: `data-pointer`
 * on `<html>`, `"fine"` for a mouse and `"coarse"` for a finger or a pen.
 * `applyPointerTier` writes a first value before paint and `installPointerTier`
 * follows each real pointer, the authority over a capability query, which a
 * touchscreen laptop with a mouse answers wrong (crbug.com/398065927).
 * @module
 */

/** A pen counts as coarse: a stylus on a touchscreen has no hover and wants
 *  finger-sized targets, whatever its precision. */
export type PointerTier = "fine" | "coarse";

export interface PointerTierOptions {
  /** A `localStorage` key that keeps the last real pointer's tier, so the next
   *  load starts on it instead of the guess. Default: none, nothing kept. */
  readonly storageKey?: string;
}

export interface PointerTierFollowOptions extends PointerTierOptions {
  /** Removes the listener and leaves the attribute, so the page keeps its
   *  layout. Default: none, it follows for the page's life. */
  readonly signal?: AbortSignal;
}

const ATTR = "data-pointer";

function cached(key: string | undefined): PointerTier | null {
  if (key === undefined) {
    return null;
  }
  try {
    const v = globalThis.localStorage.getItem(key);
    return v === "fine" || v === "coarse" ? v : null;
  } catch {
    // Storage refused, as in a sandboxed frame: start from the guess.
    return null;
  }
}

function guess(): PointerTier {
  const g = globalThis as {
    readonly matchMedia?: (q: string) => MediaQueryList;
    readonly navigator?: { readonly maxTouchPoints?: number };
  };
  const coarse = g.matchMedia?.("(any-pointer: coarse)").matches ?? false;
  return coarse || (g.navigator?.maxTouchPoints ?? 0) > 0 ? "coarse" : "fine";
}

/** Write the first `data-pointer` before paint: the kept tier when there is
 *  one, else "coarse" wherever the device reports touch, else "fine". Never
 *  throws, and leaves no listener. Returns the value written. */
export function applyPointerTier(opts?: PointerTierOptions): PointerTier {
  const tier = cached(opts?.storageKey) ?? guess();
  document.documentElement.setAttribute(ATTR, tier);
  return tier;
}

/** Follow each real pointer: a pointerdown sets `data-pointer` to its tier and
 *  keeps it under `storageKey`. Call it after `applyPointerTier`; a second
 *  call adds a listener that writes the same values. */
export function installPointerTier(opts?: PointerTierFollowOptions): void {
  const key = opts?.storageKey;
  const signal = opts?.signal;
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === "") {
      return;
    }
    const tier: PointerTier = e.pointerType === "mouse" ? "fine" : "coarse";
    const root = document.documentElement;
    if (root.getAttribute(ATTR) !== tier) {
      root.setAttribute(ATTR, tier);
    }
    if (key !== undefined) {
      try {
        globalThis.localStorage.setItem(key, tier);
      } catch {
        // A refused write only costs the next load its head start.
      }
    }
  };
  // Capture, so a page handler that stops the event cannot hide the input.
  globalThis.addEventListener("pointerdown", onDown, {
    capture: true,
    passive: true,
    ...(signal === undefined ? {} : { signal }),
  });
}
