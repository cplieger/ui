/**
 * pending.ts — the steps of a sign-in that needs more after its first
 * factor: a second factor, a credential of the person's
 * own after a temporary password, or a second factor set up there and
 * then. The ticket lives in this closure only, and each answer's newer
 * ticket replaces it.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { clearError, showError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import {
  checkLength,
  codeOf,
  generic,
  passkeyMiss,
  passwordMisfit,
  passwordWords,
  reasonOf,
  retryAfter,
  type Said,
} from "./answer.js";
import type {
  PasswordAnswer,
  PasswordLength,
  Pending,
  PendingAccess,
  PendingClient,
  PendingMethod,
  PendingPasskeyOutcome,
  Refusal,
  Result,
  SignInOutcome,
  SignedIn,
  WaitingApproval,
} from "./client.js";
import { codeField, groupedField, recoveryCode, sixDigits } from "./code.js";
import { actionButton, el, heading, passwordField, sketch, type Field } from "./dom.js";
import { authenticatorKey, showRecoveryCode } from "./factor.js";
import type { AccountAction, Runner } from "./run.js";
import { cycle, holdFor, read, type Hold, type Slot } from "./screen.js";
import type { AccountWords } from "./words.js";

interface PendingContext<C extends PendingClient> {
  readonly client: C;
  readonly access: PendingAccess<C>;
  readonly words: AccountWords;
  readonly run: Runner;
  /** Where the step draws, in place of the sign-in form. */
  readonly body: HTMLElement;
  readonly notices: Slot;
  /** The browser can run a passkey ceremony. */
  readonly webauthn: boolean;
  /** The username signing in, kept with a password the person chooses. */
  readonly username: string;
  /** The bounds of a password the person chooses. */
  readonly passwordLength: PasswordLength;
  readonly finish: (signedIn: SignedIn) => void;
  /** Marks the screen's sign-in taken, the moment a step's answer signs
   *  in: before the password is kept and before the recovery code shows. */
  readonly take: () => void;
  /** Back to the sign-in form, saying why. */
  readonly restart: (said?: Said) => void;
  /** Ends when the screen takes `body` back to draw in it. */
  readonly loan?: AbortSignal;
  /** Aborts once the screen took a sign-in by another way: the step then
   *  sends nothing and draws nothing. */
  readonly handed?: AbortSignal;
  /** The screen's own life. */
  readonly signal?: AbortSignal;
}

type Answer = SignInOutcome | WaitingApproval;

/** What a sent step is, so its refusal marks the right field. */
interface Sent {
  readonly method: PendingMethod;
  readonly input?: HTMLInputElement;
  /** The words for a value the server could not read. */
  readonly format?: string;
  readonly hold?: readonly HTMLElement[];
}

/** A password answer as a step's: a bare session is signed in. */
export function stepOf(d: PasswordAnswer): SignInOutcome {
  return "pending" in d || "signed_in" in d ? d : { signed_in: d };
}

/** Takes the answer of a sign-in's first step; a `pending` one draws its
 *  step in `x.body`. */
export function continueSignIn<C extends PendingClient>(
  x: PendingContext<C>,
  answer: SignInOutcome,
): void {
  const { client, access, words: w, notices } = x;
  // A restart hands `x.body` back to the screen, so it ends the attempt:
  // every listener, timer and answer of it runs on `signal`.
  const over = new AbortController();
  const signal = AbortSignal.any(
    [over.signal, x.loan, x.signal].filter((s): s is AbortSignal => s !== undefined),
  );
  const life = { signal };
  // Aborts the moment an answer of this step signs in, before anything it
  // awaits, or once another way did.
  const taken = new AbortController();
  const take = (): void => {
    taken.abort();
    x.take();
  };
  let handed = false;
  const handedOn = AbortSignal.any(
    [taken.signal, x.handed].filter((s): s is AbortSignal => s !== undefined),
  );
  const stop = AbortSignal.any([signal, handedOn]);
  let current: Pending | undefined;
  let hold: Hold | undefined;
  const held = (): boolean => handedOn.aborted || hold?.active() === true;
  const ended = (): boolean => stop.aborted;
  const restart = (said?: Said): void => {
    over.abort();
    x.restart(said);
  };
  /** Hands this step's sign-in on, once; `x.finish` keeps the screen's
   *  own once, across every way that signs in. */
  const hand = (s: SignedIn): void => {
    if (handed) {
      return;
    }
    handed = true;
    x.finish(s);
  };

  const can = (p: Pending, m: PendingMethod): boolean => {
    switch (p.next) {
      case "second_factor":
        return m === "totp"
          ? client.loginCode !== undefined
          : m === "recovery_code"
            ? client.loginRecoveryCode !== undefined
            : m === "passkey" && x.webauthn && access.loginSecondPasskey !== undefined;
      case "set_credential":
        return m === "password"
          ? client.loginSetPassword !== undefined
          : m === "passkey" && x.webauthn && access.loginSetPasskey !== undefined;
      case "enrol":
        return m === "totp"
          ? client.pendingTOTPBegin !== undefined && client.pendingTOTPFinish !== undefined
          : m === "passkey" && x.webauthn && access.pendingPasskey !== undefined;
    }
  };
  /** The step's methods this page can run, in the server's order. */
  const runnable = (p: Pending): PendingMethod[] => p.methods.filter((m) => can(p, m));

  const attempt = async <T>(name: AccountAction, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await x.run(name, work);
    } catch {
      return null;
    }
  };

  const recoveryOf = (a: Answer): string | undefined =>
    "pending" in a
      ? undefined
      : "waiting_approval" in a
        ? a.recovery_code
        : a.signed_in.recovery_code;

  /** Takes a step's answer. A sign-in is taken however the attempt
   *  ended, since the server already made its session. Once the attempt
   *  ended, a next step or a wait for approval is dropped. The recovery
   *  code an answer carries is shown either way, as that answer is the
   *  code's one showing. */
  const took = async (a: Answer): Promise<void> => {
    const code = recoveryOf(a);
    if ("signed_in" in a) {
      take();
      if (code !== undefined) {
        await showRecoveryCode(code, w, x.signal);
      }
      if (x.signal?.aborted !== true) {
        hand(a.signed_in);
      }
      return;
    }
    if (ended()) {
      if (code !== undefined) {
        await showRecoveryCode(code, w, x.signal);
      }
      return;
    }
    if ("pending" in a) {
      notices.clear();
      show(a.pending);
      return;
    }
    if (code !== undefined) {
      await showRecoveryCode(code, w, signal);
    }
    if (!ended()) {
      restart({ tone: "neutral", text: w["pending.waiting"] });
    }
  };

  /** Draws `p` without `method`, saying why; back to the form when no
   *  method is left. */
  const drop = (method: PendingMethod, said: Said): void => {
    if (current === undefined) {
      return;
    }
    const p = { ...current, methods: current.methods.filter((m) => m !== method) };
    if (runnable(p).length === 0) {
      restart(said);
      return;
    }
    show(p);
    notices.show(said.tone, said.text);
  };

  const mark = (input: HTMLInputElement | undefined, words: string, tone: Said["tone"]): void => {
    if (input === undefined) {
      notices.show(tone, words);
      return;
    }
    showError(input, words);
    input.focus();
    input.select();
  };

  const refused = (r: Refusal, at: Sent): void => {
    const reason = reasonOf(r);
    switch (codeOf(r)) {
      case "auth_token_invalid":
        restart({ tone: "warning", text: w["pending.timedOut"] });
        return;
      case "auth_bad_request":
        mark(at.input, at.format ?? w["generic.server"], "danger");
        return;
      case "auth_code_invalid": {
        if (reason === "method_locked") {
          const passkey = current !== undefined && runnable(current).includes("passkey");
          drop(at.method, {
            tone: "danger",
            text:
              at.method === "recovery_code"
                ? w["pending.recoveryLocked"](passkey)
                : w["auth_code_invalid.method_locked"](passkey),
          });
          return;
        }
        mark(
          at.input,
          reason === "code_reused"
            ? w["auth_code_invalid.code_reused"]
            : w["auth_code_invalid.code_invalid"],
          "danger",
        );
        return;
      }
      case "auth_rate_limited": {
        const seconds = retryAfter(r);
        if (seconds === undefined || seconds <= 0) {
          notices.show("warning", w["auth_rate_limited.later"]);
          return;
        }
        hold = holdFor(
          seconds,
          notices,
          at.hold ?? [],
          { text: w.auth_rate_limited, again: w["signIn.again"] },
          stop,
        );
        return;
      }
      case "auth_totp_disabled":
        drop("totp", { tone: "warning", text: w.auth_totp_disabled });
        return;
      case "auth_second_factor_unavailable":
        notices.show("warning", w["pending.unavailable"]);
        return;
      case "auth_password_rejected":
        mark(at.input, passwordWords(r, w, x.passwordLength), "danger");
        return;
      case "auth_password_login_disabled":
        drop("password", { tone: "neutral", text: w["pending.passwordOff"] });
        return;
      case "auth_https_required":
        notices.show("warning", w["signIn.nextNeedsHttps"]);
        return;
      case "auth_forbidden":
        if (reason === "no_usable_method") {
          restart({ tone: "danger", text: w["signIn.noUsableMethod"] });
          return;
        }
        notices.show("danger", generic(r, w).text);
        return;
      default: {
        const said = generic(r, w);
        notices.show(said.tone, said.text);
      }
    }
  };

  /** Sends one step on `confirm`'s cycle and takes its answer. */
  const send = async (
    confirm: Confirm,
    name: AccountAction,
    call: () => Promise<Result<Answer>>,
    at: Sent,
    kept?: () => Promise<void>,
  ): Promise<void> => {
    if (held()) {
      return;
    }
    notices.clear();
    const got = await cycle(
      confirm,
      () => attempt(name, call),
      (a) => a?.ok === true && !("pending" in a.data),
      (a) => {
        if (a?.ok === true && "signed_in" in a.data) {
          take();
        }
      },
    );
    if (got === undefined) {
      return;
    }
    const a = got.answer;
    if (a?.ok === true) {
      if ("signed_in" in a.data) {
        await kept?.();
      }
      await took(a.data);
    } else if (ended()) {
      return;
    } else if (a === null) {
      notices.show("danger", w["generic.server"]);
    } else {
      refused(a, at);
    }
  };

  /** A button that runs a passkey step. */
  const passkeyButton = (
    text: string,
    primary: boolean,
    name: AccountAction,
    ceremony: () => Promise<PendingPasskeyOutcome>,
  ): HTMLButtonElement => {
    const button = actionButton(text, { icon: "key-round", primary });
    const confirm = enhanceConfirm(button, {
      busy: w["pending.passkeyBusy"],
      done: w["pending.done"],
      ...life,
    });
    button.addEventListener(
      "click",
      () => {
        if (held()) {
          return;
        }
        notices.clear();
        void cycle(
          confirm,
          () => attempt(name, ceremony),
          (o) => o?.kind === "answered" && !("pending" in o.result),
          (o) => {
            if (o?.kind === "answered" && "signed_in" in o.result) {
              take();
            }
          },
        ).then(async (got) => {
          if (got === undefined) {
            return;
          }
          const o = got.answer;
          if (ended()) {
            if (o?.kind === "answered") {
              await took(o.result);
            }
            return;
          }
          if (o === null) {
            notices.show("danger", w["generic.server"]);
          } else if (o.kind === "answered") {
            await took(o.result);
          } else {
            const said = passkeyMiss(o, w);
            if (said !== undefined && "ok" in said) {
              refused(said, { method: "passkey", hold: [button] });
            } else if (said !== undefined) {
              notices.show(said.tone, said.text);
            }
          }
        });
      },
      life,
    );
    return button;
  };

  const quiet = (text: string, then: () => void): HTMLButtonElement => {
    const b = el("button", "cp-button", text);
    b.type = "button";
    b.dataset["variant"] = "quiet";
    b.addEventListener(
      "click",
      () => {
        if (!handedOn.aborted) {
          then();
        }
      },
      life,
    );
    return b;
  };

  const startAgain = (): HTMLButtonElement =>
    quiet(w["pending.startAgain"], () => {
      restart();
    });

  /** A form of one field and its submit; `send` runs on a valid value. */
  const oneField = (
    f: Field,
    submitWords: { readonly text: string; readonly busy: string },
    onSubmit: (submit: HTMLButtonElement, confirm: Confirm) => void,
  ): { readonly form: HTMLFormElement; readonly submit: HTMLButtonElement } => {
    const form = el("form", "cp-stack");
    form.noValidate = true;
    f.input.enterKeyHint = "done";
    const submit = actionButton(submitWords.text, { primary: true, type: "submit" });
    const confirm = enhanceConfirm(submit, {
      busy: submitWords.busy,
      done: w["pending.done"],
      ...life,
    });
    f.input.addEventListener(
      "input",
      () => {
        clearError(f.input);
      },
      life,
    );
    form.append(f.root, submit);
    // On the screen's life, not the attempt's: an ended step stays drawn
    // until the screen's read answers, and its form must not fall back to
    // the browser's own submit, which puts the code in the address.
    form.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        if (!ended() && !held()) {
          onSubmit(submit, confirm);
        }
      },
      x.signal === undefined ? {} : { signal: x.signal },
    );
    return { form, submit };
  };

  const codeForm = (run: (code: string) => Promise<Result<Answer>>): HTMLElement => {
    const f = codeField({ label: w["pending.code"], help: w["pending.codeHelp"] });
    const { form } = oneField(
      f,
      { text: w["pending.continue"], busy: w["pending.busy"] },
      (submit, confirm) => {
        const code = sixDigits(f.input.value);
        if (code === undefined) {
          mark(f.input, w["stepUp.codeFormat"], "danger");
          return;
        }
        void send(confirm, "auth.sign_in_code", () => run(code), {
          method: "totp",
          input: f.input,
          format: w["stepUp.codeFormat"],
          hold: [submit],
        });
      },
    );
    return form;
  };

  const secondFactor = (
    p: Pending,
    methods: readonly PendingMethod[],
    use?: PendingMethod,
  ): void => {
    const loginCode = client.loginCode?.bind(client);
    const loginRecovery = client.loginRecoveryCode?.bind(client);
    const second = access.loginSecondPasskey;
    const chosen =
      use ?? (["totp", "passkey", "recovery_code"] as const).find((m) => methods.includes(m));
    const nodes: Node[] = [];
    let focus: HTMLElement | undefined;
    if (chosen === "totp" && loginCode !== undefined) {
      const form = codeForm((code) => loginCode(p.ticket, code));
      nodes.push(form);
      focus = form.querySelector("input") ?? undefined;
    } else if (chosen === "recovery_code" && loginRecovery !== undefined) {
      const f = groupedField(
        { label: w["pending.recovery"], help: w["pending.recoveryHelp"] },
        signal,
      );
      const { form } = oneField(
        f,
        { text: w["pending.continue"], busy: w["pending.busy"] },
        (submit, confirm) => {
          const code = recoveryCode(f.input.value);
          if (code === undefined) {
            mark(f.input, w["pending.recoveryFormat"], "danger");
            return;
          }
          void send(confirm, "auth.sign_in_recovery_code", () => loginRecovery(p.ticket, code), {
            method: "recovery_code",
            input: f.input,
            format: w["pending.recoveryFormat"],
            hold: [submit],
          });
        },
      );
      nodes.push(form);
      focus = f.input;
    } else if (chosen === "passkey" && second !== undefined) {
      const button = passkeyButton(
        w["pending.usePasskey"],
        true,
        "auth.sign_in_second_passkey",
        () => second(client, p.ticket),
      );
      nodes.push(el("p", undefined, w["pending.passkeyLine"]), button);
      focus = button;
    }
    const others = el("div", "cp-cluster");
    for (const m of methods) {
      if (m === chosen) {
        continue;
      }
      if (m === "passkey" && second !== undefined) {
        const b = passkeyButton(w["pending.usePasskey"], false, "auth.sign_in_second_passkey", () =>
          second(client, p.ticket),
        );
        b.dataset["variant"] = "quiet";
        others.append(b);
      } else if (m === "recovery_code") {
        others.append(
          quiet(w["pending.useRecovery"], () => {
            notices.clear();
            secondFactor(p, methods, "recovery_code");
          }),
        );
      } else if (m === "totp") {
        others.append(
          quiet(w["pending.useCode"], () => {
            notices.clear();
            secondFactor(p, methods, "totp");
          }),
        );
      }
    }
    others.append(startAgain());
    nodes.push(others);
    draw(nodes, focus);
  };

  const setCredential = (p: Pending, methods: readonly PendingMethod[]): void => {
    const setPassword = client.loginSetPassword?.bind(client);
    const setPasskey = access.loginSetPasskey;
    const title = heading(2, w["pending.choose"]);
    const nodes: Node[] = [title, el("p", undefined, w["pending.chooseLine"])];
    let focus: HTMLElement | undefined;
    if (methods.includes("password") && setPassword !== undefined) {
      const f = passwordField(
        {
          label: w["pending.newPassword"],
          name: "new_password",
          autocomplete: "new-password",
          help: w["setup.passwordHelp"](x.passwordLength.min, x.passwordLength.max),
        },
        w["password.show"],
      );
      enhanceReveal(f.reveal, f.input, life);
      checkLength(f.input, x.passwordLength, w, life);
      const { form } = oneField(
        f,
        { text: w["pending.save"], busy: w["pending.saveBusy"] },
        (submit, confirm) => {
          const password = f.input.value;
          const misfit =
            password === ""
              ? w["pending.newPasswordEmpty"]
              : passwordMisfit(password, x.passwordLength, w);
          if (misfit !== undefined) {
            mark(f.input, misfit, "danger");
            return;
          }
          void send(
            confirm,
            "auth.sign_in_set_password",
            () => setPassword(p.ticket, password),
            { method: "password", input: f.input, hold: [submit] },
            () => access.storePasswordCredential(x.username, password),
          );
        },
      );
      nodes.push(form);
      focus = f.input;
    }
    if (methods.includes("passkey") && setPasskey !== undefined) {
      const alone = focus === undefined;
      if (!alone) {
        nodes.push(el("hr"));
      }
      const button = passkeyButton(
        alone ? w["pending.registerPasskey"] : w["pending.registerInstead"],
        alone,
        "auth.sign_in_set_passkey",
        () => setPasskey(client, p.ticket),
      );
      nodes.push(button);
      focus ??= button;
    }
    const foot = el("div", "cp-cluster");
    foot.append(startAgain());
    nodes.push(foot);
    draw(nodes, focus);
  };

  const enrol = (p: Pending, methods: readonly PendingMethod[]): void => {
    const begin = client.pendingTOTPBegin?.bind(client);
    const finishTotp = client.pendingTOTPFinish?.bind(client);
    const enrolPasskey = access.pendingPasskey;
    const title = heading(2, p.recovered === true ? w["pending.recovered"] : w["pending.enrol"]);
    title.tabIndex = -1;
    const nodes: Node[] = [title, el("p", undefined, w["pending.enrolLine"])];
    let slotForKey: HTMLElement | undefined;
    if (methods.includes("totp") && begin !== undefined && finishTotp !== undefined) {
      slotForKey = el("div", "cp-stack");
      slotForKey.append(sketch());
      nodes.push(slotForKey);
    }
    let passkey: HTMLButtonElement | undefined;
    if (methods.includes("passkey") && enrolPasskey !== undefined) {
      const alone = slotForKey === undefined;
      if (!alone) {
        nodes.push(el("hr"));
      }
      passkey = passkeyButton(w["pending.registerPasskey"], alone, "auth.enrol_passkey", () =>
        enrolPasskey(client, p.ticket),
      );
      nodes.push(passkey);
    }
    const foot = el("div", "cp-cluster");
    foot.append(startAgain());
    nodes.push(foot);
    draw(nodes, slotForKey === undefined ? passkey : title);
    if (slotForKey === undefined || begin === undefined || finishTotp === undefined) {
      return;
    }
    const into = slotForKey;
    into.setAttribute("aria-busy", "true");
    void attempt("auth.enrol_totp", () => read(() => begin({ ticket: p.ticket }))).then((begun) => {
      // A method dropped meanwhile redraws this attempt without `into`.
      if (ended() || current !== p) {
        return;
      }
      into.removeAttribute("aria-busy");
      if (begun === null) {
        into.remove();
        notices.show("danger", w["generic.server"]);
        return;
      }
      if (!begun.ok) {
        into.remove();
        refused(begun, { method: "totp" });
        return;
      }
      const f = codeField({ label: w["totp.code"], help: w["totp.codeHelp"] });
      const { form } = oneField(
        f,
        { text: w["totp.confirm"], busy: w["totp.busy"] },
        (submit, confirm) => {
          const code = sixDigits(f.input.value);
          if (code === undefined) {
            mark(f.input, w["stepUp.codeFormat"], "danger");
            return;
          }
          void send(confirm, "auth.enrol_totp", () => finishTotp(p.ticket, code), {
            method: "totp",
            input: f.input,
            format: w["stepUp.codeFormat"],
            hold: [submit],
          });
        },
      );
      into.replaceChildren(
        el("p", undefined, w["totp.scan"]),
        authenticatorKey(begun.data, w, signal),
        form,
      );
      // Only while the person has not moved on from the heading.
      if (document.activeElement === title) {
        f.input.focus();
      }
    });
  };

  const draw = (nodes: readonly Node[], focus: HTMLElement | undefined): void => {
    x.body.replaceChildren(...nodes);
    focus?.focus();
  };

  const show = (p: Pending): void => {
    current = p;
    hold = undefined;
    const methods = runnable(p);
    if (methods.length === 0) {
      restart({ tone: "danger", text: w["signIn.noUsableMethod"] });
      return;
    }
    switch (p.next) {
      case "second_factor":
        secondFactor(p, methods);
        return;
      case "set_credential":
        setCredential(p, methods);
        return;
      case "enrol":
        enrol(p, methods);
    }
  };

  void took(answer);
}
