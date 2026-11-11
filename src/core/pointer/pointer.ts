/**
 * pointer.ts — The pointer tier css/system sizes controls from: `data-pointer`
 * on `<html>`, `"fine"` for a mouse and `"coarse"` for a finger or a pen.
 * `applyPointerTier` writes a first value before paint and `installPointerTier`
 * follows each real pointer, the authority over a capability query, which a
 * touchscreen laptop with a mouse answers wrong (crbug.com/398065927).
 * @module
 */

import { shared } from "../lifetime/lifetime.js";

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

function follow(signal: AbortSignal, opts: PointerTierOptions): void {
  const key = opts.storageKey;
  const root = document.documentElement;
  const set = (tier: PointerTier): void => {
    if (root.getAttribute(ATTR) === tier) {
      return;
    }
    root.setAttribute(ATTR, tier);
    if (key !== undefined) {
      try {
        globalThis.localStorage.setItem(key, tier);
      } catch {
        // A refused write only costs the next load its head start.
      }
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== "") {
      set(e.pointerType === "mouse" ? "fine" : "coarse");
    }
  };
  // A trackpad on an iPad moves the pointer long before it clicks; a finger
  // or a pen sends no move without a press first.
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") {
      set("fine");
    }
  };
  // Capture, so a page handler that stops the event cannot hide the input.
  const options: AddEventListenerOptions = { capture: true, passive: true, signal };
  globalThis.addEventListener("pointerdown", onDown, options);
  globalThis.addEventListener("pointermove", onMove, options);
}

// Made on the first install, so a pre-paint bundle that imports only
// applyPointerTier keeps no lifetime code.
let page: ReturnType<typeof shared<PointerTierOptions>> | undefined;

/** Follow each real pointer: a press of any pointer, or a mouse or trackpad
 *  that moves without one, sets `data-pointer` to its tier and keeps it
 *  under `storageKey`. Call it after `applyPointerTier`. Every call shares
 *  one set of listeners, held until every caller's `signal` has aborted;
 *  the first call's `storageKey` holds. */
export function installPointerTier(opts: PointerTierFollowOptions = {}): void {
  page ??= shared(follow);
  page.install(opts);
}
