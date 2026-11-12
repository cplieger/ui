/**
 * screen.ts — what every account screen shares: the options a host passes,
 * the parts it mounts, the notice slot, the hold a rate limit puts on a
 * form, and the confirm cycle that shows its done state only on success.
 * @module
 */

import type { Confirm } from "../../buttons/confirm/confirm.js";
import { announce } from "../../feedback/announce/announce.js";
import { clock, type Tone } from "./answer.js";
import { notice } from "./dom.js";
import type { Runner } from "./run.js";
import type { AccountWords } from "./words.js";

/** A route group the host mounts. A part left out is absent from every
 *  screen, never a disabled control. */
export type AccountPart =
  | "password"
  | "passkeys"
  | "single-sign-on"
  | "pending-link"
  | "setup-passkey"
  | "profile"
  | "password-remove"
  | "sessions"
  | "session-rename"
  | "keys"
  | "key-rotate"
  | "security-log";

export interface ScreenOptions {
  /** Any word on the screen, the words for each answer's code included. */
  readonly words?: Partial<AccountWords>;
  /** Every write goes through it, under a name in `accountActions`.
   *  Default: the call runs as it is. */
  readonly run?: Runner;
  /** The routes the host mounts. Default: every part. */
  readonly parts?: readonly AccountPart[];
  /** Ends the screen: its listeners, timers and requests. */
  readonly signal?: AbortSignal;
  /** Opens an address. Default `location.assign`. */
  readonly navigate?: (url: string) => void;
  /** The query the screen reads. Default `location.search`. */
  readonly search?: string;
}

export function partsOf(parts: readonly AccountPart[] | undefined): (p: AccountPart) => boolean {
  return parts === undefined ? () => true : (p) => parts.includes(p);
}

/** `value` when it is a path on this origin, else undefined. */
export function samePath(value: string | null): string | undefined {
  if (value?.startsWith("/") !== true) {
    return undefined;
  }
  // The parser drops tabs and line breaks and reads a backslash as a slash,
  // so "/\t/host" leaves the origin: only the parsed URL is trusted.
  const url = new URL(value, location.origin);
  return url.origin === location.origin ? url.pathname + url.search + url.hash : undefined;
}

/** Removes the single sign-on outcome from the address bar. */
export function cleanAddress(): void {
  const url = new URL(location.href);
  url.searchParams.delete("oidc");
  url.searchParams.delete("auth_error");
  if (url.href !== location.href) {
    history.replaceState(history.state, "", url);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** The notice slot: at most one notice, said to a screen reader as it
 *  shows, a danger one assertively. */
export interface Slot {
  readonly root: HTMLElement;
  show(tone: Tone, text: string | Node, action?: HTMLElement): HTMLElement;
  clear(): void;
}

export function slot(root: HTMLElement): Slot {
  return {
    root,
    show(tone, text, action) {
      const box = notice(tone, text, action);
      root.replaceChildren(box);
      announce(box.textContent, tone === "danger" ? "assertive" : "polite");
      return box;
    },
    clear() {
      root.replaceChildren();
    },
  };
}

export interface Hold {
  /** Whether the countdown is still running. */
  readonly active: () => boolean;
}

/**
 * Holds `buttons` with `aria-disabled`, so focus stays on them, and counts
 * `seconds` down in a warning notice in `into`. Only its start and its end
 * are said; at the end the notice goes and `again` is said.
 */
export function holdFor(
  seconds: number,
  into: Slot,
  buttons: readonly HTMLElement[],
  words: { readonly text: (time: string) => string; readonly again: string },
  signal?: AbortSignal,
): Hold {
  let left = seconds;
  const box = into.show("warning", words.text(clock(left)));
  const body = box.querySelector<HTMLElement>("[data-part='body']") ?? box;
  for (const b of buttons) {
    b.setAttribute("aria-disabled", "true");
  }
  let running = true;
  const end = (say: boolean): void => {
    running = false;
    clearInterval(timer);
    for (const b of buttons) {
      b.removeAttribute("aria-disabled");
    }
    if (box.isConnected) {
      box.remove();
    }
    if (say) {
      announce(words.again);
    }
  };
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0 || !box.isConnected) {
      end(left <= 0);
    } else {
      body.textContent = words.text(clock(left));
    }
  }, 1000);
  signal?.addEventListener(
    "abort",
    () => {
      end(false);
    },
    { once: true },
  );
  return { active: () => running };
}

class Refused extends Error {}
const REFUSED = new Refused("refused");

/** Runs `work` on `confirm`'s cycle, whose done state shows only when
 *  `done` holds for what `work` answered. Answers that, or undefined when
 *  the button was already busy and `work` never ran. */
export async function cycle<T>(
  confirm: Confirm,
  work: () => Promise<T>,
  done: (answer: T) => boolean,
): Promise<{ readonly answer: T } | undefined> {
  let got: { readonly answer: T } | undefined;
  try {
    await confirm.run(async () => {
      const answer = await work();
      got = { answer };
      if (!done(answer)) {
        throw REFUSED;
      }
    });
  } catch (err) {
    if (err !== REFUSED) {
      throw err;
    }
  }
  return got;
}
