/**
 * pointer.ts — `data-pointer` on `<html>`, `"fine"` or `"coarse"`, the tier
 * css/system sizes controls from. `applyPointerTier` writes the kept tier, else
 * a capability guess a touchscreen laptop with a mouse gets wrong
 * (crbug.com/398065927). Imports nothing, so a pre-paint allow list names it.
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
  const query = (q: string): boolean => g.matchMedia?.(q).matches ?? false;
  // A touchscreen with a hovering fine pointer beside it, such as an iPad on
  // a Magic Keyboard, is driven by that pointer.
  if (query("(any-pointer: fine)") && query("(any-hover: hover)")) {
    return "fine";
  }
  return query("(any-pointer: coarse)") || (g.navigator?.maxTouchPoints ?? 0) > 0
    ? "coarse"
    : "fine";
}

/** Write the first `data-pointer` before paint: the kept tier when there is
 *  one, else "fine" wherever a hovering fine pointer is attached, else
 *  "coarse" wherever the device reports touch, else "fine". Never throws,
 *  and leaves no listener. Returns the value written. */
export function applyPointerTier(opts?: PointerTierOptions): PointerTier {
  const tier = cached(opts?.storageKey) ?? guess();
  document.documentElement.setAttribute(ATTR, tier);
  return tier;
}
