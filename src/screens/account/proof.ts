/**
 * proof.ts — the proof of a second factor access Part 4 asks before a
 * passkey is added or removed, the authenticator app is removed or the
 * recovery code is replaced: a code from the app, or a passkey.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { clearError, showError } from "../../forms/form/form.js";
import { codeOf, generic, passkeyMiss, reasonOf, retryAfter } from "./answer.js";
import type {
  MethodsView,
  PasskeyMiss,
  Refusal,
  SecondFactorProof,
  SecurityAccess,
} from "./client.js";
import { codeField, sixDigits } from "./code.js";
import { formDialog } from "./dialogs.js";
import { actionButton } from "./dom.js";
import { holdFor, isHeld, type Hold } from "./screen.js";
import type { StepUpAnswer } from "./step-up.js";
import type { AccountWords } from "./words.js";

export interface ProofSpec<C> {
  readonly client: C;
  readonly access: SecurityAccess<C>;
  readonly words: AccountWords;
  /** The sentence naming the action. */
  readonly reason: string;
  /** Whether a code may prove it: the app is enrolled and usable. */
  readonly code: boolean;
  /** Whether a passkey may prove it. */
  readonly passkey: boolean;
  readonly signal?: AbortSignal;
}

/** The ways `methods` can prove a second factor here. */
export function proofWays<C>(
  m: MethodsView,
  access: SecurityAccess<C>,
  o: {
    readonly webauthn: boolean;
    readonly secure: boolean;
    readonly has: (p: "second-factor" | "passkeys") => boolean;
  },
): { readonly code: boolean; readonly passkey: boolean } {
  return {
    code: m.totp?.usable === true && o.has("second-factor"),
    passkey:
      access.passkeyProof !== undefined &&
      m.passkey_count > 0 &&
      m.passkeys_available &&
      o.webauthn &&
      o.secure &&
      o.has("passkeys"),
  };
}

/**
 * Asks for a proof and runs `write` with it, keeping the dialog open on a
 * code the server refused; answers what `write` answered, or cancelled.
 * The caller checks that one of `spec.code` and `spec.passkey` holds.
 */
export async function withProof<C, T>(
  spec: ProofSpec<C>,
  write: (proof: SecondFactorProof) => Promise<StepUpAnswer<T>>,
): Promise<StepUpAnswer<T>> {
  const w = spec.words;
  const life = spec.signal === undefined ? {} : { signal: spec.signal };
  const d = formDialog({
    title: w["proof.title"],
    sentence: spec.reason,
    submit: w["stepUp.confirm"],
    busy: w["stepUp.busy"],
    done: false,
    cancel: w["stepUp.cancel"],
    ...life,
  });
  const code = codeField({ label: w["stepUp.code"], help: w["stepUp.codeHelp"] });
  const passkey = actionButton(w["proof.usePasskey"], { icon: "key-round" });
  const passkeyConfirm = enhanceConfirm(passkey, {
    busy: w["proof.passkeyBusy"],
    done: false,
    ...life,
  });
  let codeOffered = spec.code;
  let hold: Hold | undefined;
  const draw = (): void => {
    code.root.hidden = !codeOffered;
    d.submit.hidden = !codeOffered;
    if (codeOffered) {
      delete passkey.dataset["variant"];
    } else {
      passkey.dataset["variant"] = "primary";
    }
  };
  d.stack.append(code.root);
  if (spec.passkey) {
    d.stack.append(passkey);
  }
  draw();
  (codeOffered ? code.input : passkey).focus();

  let result: StepUpAnswer<T> = { kind: "cancelled" };
  /** What a refused proof does: true keeps the dialog open. */
  const kept = (r: Refusal): boolean => {
    switch (codeOf(r)) {
      case "auth_code_invalid": {
        const reason = reasonOf(r);
        if (reason === "method_locked") {
          codeOffered = false;
          draw();
          d.notices.show("danger", w["auth_code_invalid.method_locked"](spec.passkey));
          return spec.passkey;
        }
        showError(
          code.input,
          reason === "code_reused"
            ? w["auth_code_invalid.code_reused"]
            : w["auth_code_invalid.code_invalid"],
        );
        code.input.focus();
        code.input.select();
        return true;
      }
      case "auth_bad_request":
        if (!codeOffered) {
          return false;
        }
        showError(code.input, w["stepUp.codeFormat"]);
        code.input.focus();
        return true;
      case "auth_rate_limited": {
        const seconds = retryAfter(r);
        if (seconds === undefined || seconds <= 0) {
          return false;
        }
        hold = holdFor(
          seconds,
          d.notices,
          [d.submit, passkey],
          { text: w.auth_rate_limited, again: w["stepUp.again"] },
          spec.signal,
        );
        return true;
      }
      case "auth_totp_disabled":
        codeOffered = false;
        draw();
        d.notices.show("warning", w.auth_totp_disabled);
        return spec.passkey;
      default:
        return false;
    }
  };
  const missed = (miss: PasskeyMiss): void => {
    const said = passkeyMiss(miss, w);
    if (said !== undefined) {
      const words = "ok" in said ? generic(said, w) : said;
      d.notices.show(words.tone, words.text);
    }
  };
  /** Sends `proof`; true once the dialog may close. */
  const send = async (proof: SecondFactorProof): Promise<boolean> => {
    const answer = await write(proof);
    if (answer.kind === "done" && !answer.result.ok && kept(answer.result)) {
      return false;
    }
    result = answer;
    return true;
  };
  const busyOrHeld = (): boolean => d.busy() || hold?.active() === true;

  code.input.addEventListener("input", () => {
    clearError(code.input);
  });
  d.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busyOrHeld() || isHeld(d.submit)) {
      return;
    }
    const digits = sixDigits(code.input.value);
    if (digits === undefined) {
      showError(code.input, w["stepUp.codeFormat"]);
      code.input.focus();
      return;
    }
    d.notices.clear();
    void d
      .run(
        () => send({ code: digits }),
        (closes) => closes,
      )
      .then((got) => {
        if (got?.answer === true) {
          d.close();
        }
      });
  });
  passkey.addEventListener("click", () => {
    if (busyOrHeld()) {
      return;
    }
    d.notices.clear();
    void d
      .run(
        async () => {
          const got = await spec.access.passkeyProof?.(spec.client);
          if (got === undefined) {
            return false;
          }
          if (got.kind !== "proof") {
            missed(got);
            return false;
          }
          return send(got.proof);
        },
        (closes) => closes,
        passkeyConfirm,
      )
      .then((got) => {
        if (got?.answer === true) {
          d.close();
        }
      });
  });
  await d.closed;
  return result;
}
