/**
 * factor.ts — setting up or replacing an authenticator app (access Part
 * 4): the QR code of its link, the key as text in groups of four with
 * Copy, and the first code from the app confirming it, then the recovery
 * code shown once when the answer carries one.
 * @module
 */

import { enhanceCopy } from "../../forms/copy/copy.js";
import { clearError, showError } from "../../forms/form/form.js";
import { qrCode } from "../../media/qr/qr.js";
import { codeOf, generic, reasonOf, retryAfter } from "./answer.js";
import type { Refusal, TotpBegin } from "./client.js";
import { codeField, inFours, sixDigits } from "./code.js";
import { formDialog } from "./dialogs.js";
import { el, glyph, uid } from "./dom.js";
import { holdFor, type Hold } from "./screen.js";
import { showSecret } from "./shown.js";
import type { StepUpAnswer } from "./step-up.js";
import type { AccountWords } from "./words.js";

export interface FactorSpec {
  readonly begun: TotpBegin;
  /** Replacing: the old app's code is asked too. */
  readonly replace: boolean;
  readonly words: AccountWords;
  /** Sends the finish. */
  readonly finish: (r: {
    readonly ticket: string;
    readonly code: string;
    readonly current_code?: string;
  }) => Promise<StepUpAnswer<{ readonly recovery_code?: string }>>;
  readonly signal?: AbortSignal;
}

/** How the setup ended: on, cancelled, or a refusal the dialog could not
 *  hold, which the section shows. */
export type FactorEnd =
  | { readonly kind: "done" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "refused"; readonly answer: StepUpAnswer<unknown> };

/** The setup dialog for `spec.begun`; settles once it has closed and the
 *  recovery code, when one came, has been shown. */
export async function setUpFactor(spec: FactorSpec): Promise<FactorEnd> {
  const w = spec.words;
  const { signal } = spec;
  const life = signal === undefined ? {} : { signal };
  const d = formDialog({
    title: spec.replace ? w["totp.replaceTitle"] : w["totp.setUpTitle"],
    sentence: w["totp.scan"],
    submit: w["totp.confirm"],
    busy: w["totp.busy"],
    done: w["totp.done"],
    cancel: w["security.cancel"],
    ...life,
  });

  const pair = authenticatorKey(spec.begun, w, signal);
  const fresh = codeField({ label: w["totp.code"], help: w["totp.codeHelp"], name: "code" });
  const old = spec.replace
    ? codeField({ label: w["totp.oldCode"], help: w["totp.oldCodeHelp"], name: "current_code" })
    : undefined;
  d.stack.append(pair, fresh.root);
  if (old !== undefined) {
    d.stack.append(old.root);
  }
  fresh.input.focus();
  for (const f of [fresh, old]) {
    f?.input.addEventListener("input", () => {
      clearError(f.input);
    });
  }

  let hold: Hold | undefined;
  let ended: FactorEnd = { kind: "cancelled" };
  let code: string | undefined;

  /** Marks the field a refusal names: true keeps the dialog open. */
  const kept = (r: Refusal): boolean => {
    const mark = (input: HTMLInputElement, words: string): true => {
      showError(input, words);
      input.focus();
      input.select();
      return true;
    };
    const reason = reasonOf(r);
    const target = old !== undefined && reason !== "code_invalid" ? old.input : fresh.input;
    switch (codeOf(r)) {
      case "auth_code_invalid":
        switch (reason) {
          case "current_code_invalid":
            return mark(target, w["auth_code_invalid.current_code_invalid"]);
          case "code_reused":
            return mark(target, w["auth_code_invalid.code_reused"]);
          case "method_locked":
            d.notices.show("danger", w["auth_code_invalid.method_locked"](false));
            return true;
          default:
            return mark(fresh.input, w["auth_code_invalid.code_invalid"]);
        }
      case "auth_bad_request":
        return mark(
          reason === "second_factor_proof_required" && old !== undefined ? old.input : fresh.input,
          w["stepUp.codeFormat"],
        );
      case "auth_second_factor_unavailable":
        d.notices.show("warning", w.auth_second_factor_unavailable);
        return true;
      case "auth_rate_limited": {
        const seconds = retryAfter(r);
        if (seconds === undefined || seconds <= 0) {
          d.notices.show("warning", w["auth_rate_limited.later"]);
          return true;
        }
        hold = holdFor(
          seconds,
          d.notices,
          [d.submit],
          { text: w.auth_rate_limited, again: w["stepUp.again"] },
          signal,
        );
        return true;
      }
      case "auth_forbidden":
        if (reason !== "totp_needs_password") {
          d.notices.show("danger", generic(r, w).text);
          return true;
        }
        return false;
      case "auth_token_invalid":
      case "auth_totp_disabled":
      case "auth_https_required":
      case "auth_required":
      case "auth_session_expired":
        return false;
      default:
        d.notices.show("danger", generic(r, w).text);
        return true;
    }
  };

  d.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (d.busy() || hold?.active() === true) {
      return;
    }
    const digits = sixDigits(fresh.input.value);
    const current = old === undefined ? undefined : sixDigits(old.input.value);
    if (digits === undefined) {
      showError(fresh.input, w["stepUp.codeFormat"]);
      fresh.input.focus();
      return;
    }
    if (old !== undefined && current === undefined) {
      showError(old.input, w["stepUp.codeFormat"]);
      old.input.focus();
      return;
    }
    d.notices.clear();
    void d
      .run(
        async () => {
          const answer = await spec.finish({
            ticket: spec.begun.ticket,
            code: digits,
            ...(current === undefined ? {} : { current_code: current }),
          });
          if (answer.kind === "cancelled") {
            return false;
          }
          if (answer.kind === "done") {
            if (answer.result.ok) {
              code = answer.result.data.recovery_code;
              ended = { kind: "done" };
              return true;
            }
            if (kept(answer.result)) {
              return false;
            }
          }
          ended = { kind: "refused", answer };
          return true;
        },
        (closes) => closes && ended.kind === "done",
      )
      .then(() => {
        if (ended.kind !== "cancelled") {
          d.close();
        }
      });
  });
  await d.closed;
  if (code !== undefined && signal?.aborted !== true) {
    await showRecoveryCode(code, w, signal);
  }
  return ended;
}

/** The QR code of an authenticator link beside its key as text, in groups
 *  of four with Copy, which copies the key alone. */
export function authenticatorKey(
  begun: { readonly uri: string; readonly text: string },
  w: AccountWords,
  signal?: AbortSignal,
): HTMLElement {
  const pair = el("div", "cp-cluster");
  const key = el("div", "cp-field");
  const keyLabel = el("span", "cp-label", w["totp.key"]);
  keyLabel.id = uid("key");
  const box = el("div", "cp-code");
  box.setAttribute("role", "group");
  box.setAttribute("aria-labelledby", keyLabel.id);
  const text = el("code", "cp-mono", inFours(begun.text, " "));
  text.tabIndex = 0;
  const copy = el("button", "cp-button cp-copy");
  copy.type = "button";
  copy.append(glyph("copy"), glyph("check", "done"), w["shown.copy"]);
  box.append(text, copy);
  key.append(keyLabel, box);
  pair.append(qrCode(begun.uri), key);
  enhanceCopy(copy, {
    source: text,
    text: () => begun.text.replace(/\s/g, ""),
    copied: w["shown.copied"],
    ...(signal === undefined ? {} : { signal }),
  });
  return pair;
}

/** The recovery code, shown once: copy, download and a box to say it is
 *  saved before the dialog closes. */
export function showRecoveryCode(
  code: string,
  w: AccountWords,
  signal?: AbortSignal,
): Promise<void> {
  return showSecret(
    {
      title: w["recoveryCode.shownTitle"],
      line: w["recoveryCode.shownLine"],
      label: w["recoveryCode.label"],
      secret: inFours(code, "-"),
      download: "recovery-code.txt",
      help: w["recoveryCode.offline"],
      saved: { label: w["recoveryCode.saved"], first: w["recoveryCode.saveFirst"] },
      done: w["recoveryCode.continue"],
    },
    w,
    signal,
  );
}
