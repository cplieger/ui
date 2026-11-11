/**
 * turn.ts — a button whose icon acts out its word, such as Refresh. `turn()`
 * plays one turn of the icon, speeding up and slowing down; `turnWhile()`
 * repeats it while work runs and lets the turn in progress finish, so the
 * icon always comes to rest upright. Under reduced motion the icon pulses
 * instead of turning.
 * @module
 */

import { reducedMotion } from "../../core/lifetime/lifetime.js";

/** At most about 1.8 turns a second at its fastest. */
const TURN: KeyframeAnimationOptions = { duration: 900, easing: "cubic-bezier(0.55, 0, 0.3, 1)" };
const PULSE: KeyframeAnimationOptions = { duration: 2000 };

function icon(button: Element): HTMLElement | null {
  return button.querySelector<HTMLElement>(":scope > .cp-icon");
}

function play(target: HTMLElement, iterations: number): Animation {
  return reducedMotion()
    ? target.animate([{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], { ...PULSE, iterations })
    : target.animate([{ rotate: "0turn" }, { rotate: "1turn" }], { ...TURN, iterations });
}

/** Plays one turn of `button`'s icon. A turn already playing keeps going. */
export function turn(button: Element): void {
  const target = icon(button);
  if (target === null || target.getAnimations().length > 0) {
    return;
  }
  play(target, 1);
}

/**
 * Turns `button`'s icon while `work` runs and marks the button
 * `aria-busy="true"`, then finishes the turn in progress. Resolves or
 * rejects as `work` does.
 */
export async function turnWhile<T>(button: Element, work: Promise<T>): Promise<T> {
  const target = icon(button);
  for (const a of target?.getAnimations() ?? []) {
    a.cancel();
  }
  const anim = target === null ? null : play(target, Infinity);
  button.setAttribute("aria-busy", "true");
  try {
    return await work;
  } finally {
    button.removeAttribute("aria-busy");
    if (anim !== null) {
      const length = Number(anim.effect?.getTiming().duration ?? 1);
      const done = Math.max(1, Math.ceil(Number(anim.currentTime ?? 0) / length));
      anim.effect?.updateTiming({ iterations: done });
    }
  }
}
