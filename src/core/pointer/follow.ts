/**
 * follow.ts — `installPointerTier` moves `data-pointer` to each real pointer,
 * the authority over a guess. Kept out of `./pointer.ts`, which imports nothing.
 * @module
 */

import { shared } from "../lifetime/lifetime.js";
import type { PointerTier, PointerTierOptions } from "./pointer.js";

export interface PointerTierFollowOptions extends PointerTierOptions {
  /** Ends this call's hold; the last hold to end removes the listeners and
   *  leaves the attribute, so the page keeps its layout. Default: none, it
   *  holds for the page's life. */
  readonly signal?: AbortSignal;
}

const ATTR = "data-pointer";

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
  // Only a mouse or trackpad move sets fine, since an iPad trackpad moves long
  // before it clicks; a hovering pen's move must not change the tier.
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

const page = shared(follow);

/** Follow each real pointer: a press of any pointer, or a mouse or trackpad
 *  that moves without one, sets `data-pointer` to its tier and keeps it
 *  under `storageKey`. Call it after `applyPointerTier`. Every call shares
 *  one set of listeners, held until every caller's `signal` has aborted;
 *  the first call's `storageKey` holds. */
export function installPointerTier(opts: PointerTierFollowOptions = {}): void {
  page.install(opts);
}
