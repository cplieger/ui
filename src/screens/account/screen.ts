/**
 * screen.ts — what every account screen shares: the options a host passes,
 * the parts it mounts, the notice slot, the hold a rate limit puts on a
 * form, and the confirm cycle that shows its done state only on success.
 * @module
 */

import type { Confirm } from "../../buttons/confirm/confirm.js";
import { announce } from "../../feedback/announce/announce.js";
import { ask } from "../../overlays/ask/ask.js";
import { glyph, type Tone } from "../../foundations/icons/glyph.js";
import { clock, codeOf, reasonOf } from "./answer.js";
import type { Refusal, Result, StateResponse } from "./client.js";
import { el, line, notice, uid } from "./dom.js";
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
  | "second-factor"
  | "temporary-password"
  | "profile"
  | "sessions"
  | "session-rename"
  | "keys"
  | "key-rotate"
  | "security-log"
  | "invites"
  | "admin-keys";

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

/** Why a screen ended its session: it expired, the connection changed
 *  between HTTP and HTTPS, or the person signed this device out. */
export type SignedOutReason = "session-ended" | "transport-changed" | "signed-out";

export interface SignedOutOptions {
  /** Runs when the session is gone, or the person signed this one out.
   *  Default: navigate to `signInPath` with `arrived` saying why. */
  readonly onSignedOut?: (why: { readonly reason: SignedOutReason }) => void;
  /** Default "/sign-in". */
  readonly signInPath?: string;
}

/** Ends a screen for a reason, as `o.onSignedOut` says. */
export function leaver(
  o: SignedOutOptions,
  navigate: (url: string) => void,
): (reason: SignedOutReason) => void {
  return (reason) => {
    if (o.onSignedOut === undefined) {
      navigate(`${o.signInPath ?? "/sign-in"}?arrived=${reason}`);
    } else {
      o.onSignedOut({ reason });
    }
  };
}

/** Ends the screen through `leave` when `r` says the session is gone;
 *  true when it did. */
export function endsSession(r: Refusal, leave: (reason: SignedOutReason) => void): boolean {
  const code = codeOf(r);
  if (code !== "auth_session_expired" && code !== "auth_required") {
    return false;
  }
  leave(reasonOf(r) === "transport_changed" ? "transport-changed" : "session-ended");
  return true;
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

/** Removes the single sign-on outcome and the arrival from the address
 *  bar. */
export function cleanAddress(): void {
  const url = new URL(location.href);
  url.searchParams.delete("oidc");
  url.searchParams.delete("auth_error");
  url.searchParams.delete("arrived");
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

/** A read that answers a refusal instead of rejecting. */
export async function read<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch {
    return { ok: false, status: 0, error: "no answer" };
  }
}

/** How the request that read `state()` travelled (access Part 3). */
export interface Transport {
  readonly plain: boolean;
  /** What HTTPS would add here, of what the screen offers. */
  readonly withheld: readonly ("passkeys" | "oidc")[];
  readonly session?: { readonly idle: number; readonly absolute: number };
  readonly httpsOrigin?: string;
}

export function transportOf(s: StateResponse): Transport {
  const plain = s.secure === false;
  const withheld = (s.https_required ?? []).filter(
    (m): m is "passkeys" | "oidc" => m === "passkeys" || m === "oidc",
  );
  return {
    plain,
    withheld: plain ? withheld : [],
    ...(plain && s.plain_session !== undefined
      ? {
          session: {
            idle: s.plain_session.idle_seconds,
            absolute: s.plain_session.absolute_seconds,
          },
        }
      : {}),
    ...(plain && s.https_origin !== undefined && s.https_origin !== ""
      ? { httpsOrigin: s.https_origin }
      : {}),
  };
}

/** "12 hours" or "30 minutes", rounded to the larger unit that is whole. */
export function duration(seconds: number, w: AccountWords): string {
  return seconds >= 3600 && seconds % 3600 === 0
    ? w["plain.hours"](seconds / 3600)
    : w["plain.minutes"](Math.max(1, Math.round(seconds / 60)));
}

/** A link to the app's HTTPS address, or undefined without one. */
export function httpsLink(
  t: { readonly httpsOrigin?: string | undefined },
  app: string,
  w: AccountWords,
): HTMLAnchorElement | undefined {
  if (t.httpsOrigin === undefined) {
    return undefined;
  }
  const a = el("a", undefined, w["plain.open"](app));
  a.href = t.httpsOrigin + location.pathname + location.search;
  return a;
}

/** The lines a plain screen shows under its form: what HTTPS would add,
 *  linked to the HTTPS address, and the shorter session. */
export function plainLines(
  t: Transport,
  offered: readonly ("passkeys" | "oidc")[],
  app: string,
  w: AccountWords,
): HTMLElement[] {
  if (!t.plain) {
    return [];
  }
  const lines: HTMLElement[] = [];
  const withheld = t.withheld.filter((m) => offered.includes(m));
  const link = httpsLink(t, app, w);
  if (withheld.length > 0) {
    const p = line("cp-help", w["plain.withheld"](withheld));
    if (link !== undefined) {
      p.append(" ", link, ".");
    }
    p.dataset["part"] = "https";
    lines.push(p);
  }
  if (t.session !== undefined) {
    const p = line(
      "cp-help",
      w["plain.session"](duration(t.session.absolute, w), duration(t.session.idle, w)),
    );
    p.dataset["part"] = "plain-session";
    lines.push(p);
  }
  return lines;
}

/** "This app needs HTTPS", with the way there when the app named one. */
export function needsHttps(t: Transport, app: string, w: AccountWords): HTMLElement {
  const box = el("div", "cp-empty");
  box.append(glyph("lock"), el("p", undefined, w["plain.needed"]));
  const link = httpsLink(t, app, w);
  if (link !== undefined) {
    link.className = "cp-button";
    link.dataset["variant"] = "primary";
    box.append(link);
  }
  return box;
}

/** Whether `button` is held: by "Needs HTTPS", or by a rate limit's
 *  countdown. A held button keeps focus and ignores a press. */
export function isHeld(button: HTMLElement): boolean {
  return button.getAttribute("aria-disabled") === "true";
}

/** Holds each of `buttons` as needing HTTPS, focusable so the reason is
 *  heard, and answers the "Needs HTTPS." line that describes them, linked
 *  to the app's HTTPS address when it named one. */
export function holdForHttps(
  buttons: readonly HTMLElement[],
  t: { readonly httpsOrigin?: string | undefined },
  app: string,
  w: AccountWords,
): HTMLElement {
  const help = line("cp-help", w["security.needsHttps"]);
  help.id = uid("https");
  const link = httpsLink(t, app, w);
  if (link !== undefined) {
    help.append(" ", link, ".");
  }
  holdBy(buttons, help);
  return help;
}

/** Holds each of `buttons` as needing HTTPS, described by `help`, a line
 *  `holdForHttps` made. */
export function holdBy(buttons: readonly HTMLElement[], help: HTMLElement): void {
  for (const b of buttons) {
    b.setAttribute("aria-disabled", "true");
    b.setAttribute("aria-describedby", help.id);
  }
}

/** Asks one question through `ask()`: true when the person answers. A
 *  danger question takes focus on its declining button. */
export function question(
  message: string,
  o: {
    readonly title: string;
    readonly answer: string;
    readonly cancel: string;
    readonly danger?: boolean;
    readonly link?: { readonly text: string; readonly href: string };
  },
): Promise<boolean> {
  return ask(message, {
    title: o.title,
    confirmLabel: o.answer,
    cancelLabel: o.cancel,
    ...(o.danger === true ? { tone: "danger" as const } : {}),
    ...(o.link === undefined ? {} : { link: o.link }),
  });
}
