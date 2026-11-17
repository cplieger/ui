/**
 * answer.ts — reads a refusal: its code and reason, lifted only from a real
 * error answer as `@cplieger/access`'s `authCode` does, its wait, and the
 * words of the answers every screen shares.
 * @module
 */

import type { Tone } from "../../foundations/icons/glyph.js";
import { showError } from "../../forms/form/form.js";
import type { PasskeyMiss, PasswordLength, Refusal, StateResponse } from "./client.js";
import type { AccountWords } from "./words.js";

/** What a screen shows for an answer: a notice's tone and words. */
export interface Said {
  readonly tone: Tone;
  readonly text: string;
}

// A code from the fetch layer itself ("network", "decode") carries status 0
// or a 2xx, and must never read as the server's.
const fromServer = (r: Refusal): boolean => r.status >= 400 && r.status <= 599;

export function codeOf(r: Refusal): string | undefined {
  return fromServer(r) && typeof r.code === "string" && r.code !== "" ? r.code : undefined;
}

export function reasonOf(r: Refusal): string | undefined {
  const body = r.body;
  if (
    !fromServer(r) ||
    typeof body !== "object" ||
    body === null ||
    !Object.hasOwn(body, "reason")
  ) {
    return undefined;
  }
  const reason = (body as Record<string, unknown>)["reason"];
  return typeof reason === "string" && reason !== "" ? reason : undefined;
}

/** Whole seconds until the refused request may run again, from its
 *  `Retry-After` in seconds or as a date. */
export function retryAfter(r: Refusal, now = Date.now()): number | undefined {
  const value = r.headers?.get("Retry-After")?.trim() ?? "";
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const at = value === "" ? Number.NaN : Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

/** "0:42" for 42 seconds. */
export function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The words for `auth_username_invalid`, by its reason. */
export function usernameWords(r: Refusal, w: AccountWords): string {
  switch (reasonOf(r)) {
    case "empty":
      return w["auth_username_invalid.empty"];
    case "disallowed_character":
      return w["auth_username_invalid.disallowed_character"];
    default:
      return w.auth_username_invalid;
  }
}

/** How many code points `text` holds, as access counts runes. */
export function runes(text: string): number {
  let n = 0;
  for (const _ of text) {
    n += 1;
  }
  return n;
}

/** The bounds a new password must fit: `state()`'s, else access's fixed
 *  15 to 128, from a server that does not send them. */
export function passwordLengthOf(s: StateResponse | undefined): PasswordLength {
  return s?.password_length ?? { min: 15, max: 128 };
}

/** The words for a password outside `length`, or undefined when it fits
 *  or is empty. Counts code points of the NFC form, as access does. */
export function passwordMisfit(
  value: string,
  length: PasswordLength,
  w: AccountWords,
): string | undefined {
  if (value === "") {
    return undefined;
  }
  const n = runes(value.normalize("NFC"));
  if (n < length.min) {
    return w["auth_password_rejected.too_short"](length.min, length.max);
  }
  return n > length.max ? w["auth_password_rejected.too_long"](length.min, length.max) : undefined;
}

/** Marks `input` with its misfit when the person leaves it, before any
 *  request. */
export function checkLength(
  input: HTMLInputElement,
  length: PasswordLength,
  w: AccountWords,
  life: { readonly signal?: AbortSignal },
): void {
  input.addEventListener(
    "change",
    () => {
      const misfit = passwordMisfit(input.value, length, w);
      if (misfit !== undefined) {
        showError(input, misfit);
      }
    },
    life,
  );
}

/** The words for `auth_password_rejected`, by its reason, with the bounds
 *  of the field it refused. */
export function passwordWords(r: Refusal, w: AccountWords, length: PasswordLength): string {
  const reason = reasonOf(r);
  switch (reason) {
    case "too_short":
    case "too_long":
      return w[`auth_password_rejected.${reason}`](length.min, length.max);
    case "contains_username":
    case "contains_forbidden_word":
    case "common":
    case "breached":
    case "is_temporary_password":
      return w[`auth_password_rejected.${reason}`];
    default:
      return w.auth_password_rejected;
  }
}

/** The words for a passkey ceremony that confirmed no one, the server's
 *  refusal for the caller to word, or undefined for a prompt the person
 *  closed. */
export function passkeyMiss(outcome: PasskeyMiss, w: AccountWords): Said | Refusal | undefined {
  switch (outcome.kind) {
    case "cancelled":
      return undefined;
    case "timeout":
    case "ceremony-expired":
    case "unknown-credential":
      return { tone: "warning", text: w[`passkey.${outcome.kind}`] };
    case "verification-failed":
      return { tone: "danger", text: w["passkey.verification-failed"] };
    case "failed":
      if (typeof outcome.error !== "string") {
        return outcome.error;
      }
      // The browser refuses a ceremony whose relying party does not fit
      // this origin, before it asks the person.
      return {
        tone: "danger",
        text: outcome.error === "SecurityError" ? w.auth_origin_refused : w["passkey.failed"],
      };
  }
}

/** The words for a refusal no screen words itself. */
export function generic(r: Refusal, w: AccountWords): Said {
  if (r.status === 0) {
    return { tone: "danger", text: w["generic.network"] };
  }
  switch (codeOf(r)) {
    case "auth_busy":
      return { tone: "danger", text: w.auth_busy };
    case "auth_unavailable":
      return { tone: "danger", text: w.auth_unavailable };
    case "auth_rate_limited":
      return { tone: "warning", text: w["auth_rate_limited.later"] };
    default:
      return { tone: "danger", text: w["generic.server"] };
  }
}
