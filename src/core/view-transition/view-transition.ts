/**
 * view-transition.ts — Queued, feature-detected, rejection-safe wrapper over
 * document.startViewTransition. Overlapping calls serialize through a
 * module-level pending promise; the returned promise never rejects, even when
 * the transition rejects or `fn` throws.
 *
 * Suspended-renderer safety: a hidden tab (and some remote/virtualized
 * sessions that stay "visible" while the compositor is suspended) never
 * grants startViewTransition a rendering opportunity, so `finished` never
 * settles and every later call chains behind it forever. Two guards: a
 * `document.hidden` fast-path that skips the transition entirely, and a
 * watchdog that calls `skipTransition()` when `finished` hasn't settled in
 * time (skipping still runs the update callback and settles via task queues).
 *
 * @module
 */

import { reducedMotion } from "../lifetime/lifetime.js";

export interface ViewTransitionOptions {
  /** Reveals the new look in a circle growing from this element's centre,
   *  as a theme toggle does, instead of the cross-fade. Under reduced motion
   *  the cross-fade plays. */
  readonly from?: Element;
}

const REVEAL = "data-cp-reveal";

let pending: Promise<void> = Promise.resolve();

/** How long a transition may stay unsettled before the watchdog skips it.
 *  Generous next to real transition durations (a few hundred ms): only a
 *  starved renderer ever reaches it. */
const SKIP_WATCHDOG_MS = 1_000;

/** Run `fn` inside a serialized document view transition. Resolves when the
 *  transition (or, when the API is absent or the document is hidden, the
 *  direct call) finishes. */
export function viewTransition(
  fn: () => void | Promise<void>,
  options: ViewTransitionOptions = {},
): Promise<void> {
  const run = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime feature detection
    if (!document.startViewTransition || document.hidden) {
      try {
        await fn();
      } catch {
        // swallow — matches the API-present path, which never rejects the caller.
      }
      return;
    }
    const root = document.documentElement;
    const from = reducedMotion() ? undefined : options.from;
    if (from !== undefined) {
      root.setAttribute(REVEAL, "");
    }
    const transition = document.startViewTransition(fn);
    transition.ready.then(
      () => {
        if (from === undefined) {
          return;
        }
        const r = from.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.animate(
          {
            clipPath: [
              `circle(0 at ${String(x)}px ${String(y)}px)`,
              `circle(${String(end)}px at ${String(x)}px ${String(y)}px)`,
            ],
          },
          {
            duration: 480,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      },
      () => undefined,
    );
    // Otherwise a throwing `fn` raises an unhandled rejection in the page —
    // nothing else here observes updateCallbackDone.
    transition.updateCallbackDone.catch(() => undefined);
    const watchdog = setTimeout(() => {
      transition.skipTransition();
    }, SKIP_WATCHDOG_MS);
    try {
      await transition.finished.catch(() => undefined);
    } finally {
      clearTimeout(watchdog);
      root.removeAttribute(REVEAL);
    }
  };
  // Reset the shared tail to a swallowed promise so one failure can't wedge the queue.
  const result = pending.then(run, run);
  pending = result.catch(() => undefined);
  return result;
}
