/**
 * answer.ts — reads a refusal: its code and reason, lifted only from a real
 * error answer as `@cplieger/access`'s `authCode` does, its wait, and the
 * words of the answers every screen shares.
 * @module
 */

import type { Refusal } from "./client.js";
import type { AccountWords } from "./words.js";

export type Tone = "danger" | "warning" | "neutral" | "success";

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
