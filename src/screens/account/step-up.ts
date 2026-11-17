/**
 * step-up.ts — "Confirm it is you": runs a write that needs a recent
 * sign-in through `@cplieger/access`'s `withStepUp`, asking in one
 * `.cp-dialog` with the methods the account holds, as
 * docs/design-account.md "Step-up" lists them.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { clearError, showError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import { closeDialog, holdDialog, installDialogs } from "../../overlays/dialog/dialog.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import { codeOf, generic, passkeyMiss, reasonOf, retryAfter, type Said } from "./answer.js";
import type {
  MethodsView,
  PasskeyMiss,
  Refusal,
  Result,
  StepUpAccess,
  StepUpChoice,
  StepUpClient,
  StepUpResult,
} from "./client.js";
import { codeField, sixDigits } from "./code.js";
import { actionButton, el, field, heading, passwordField } from "./dom.js";
import { runDirect, type AccountAction, type Runner } from "./run.js";
import {
  cycle,
  holdFor,
  partsOf,
  read,
  slot,
  type Hold,
  type ScreenOptions,
  type Slot,
} from "./screen.js";
import { wordsOf } from "./words.js";

export interface StepUpOptions<C extends StepUpClient> extends Omit<ScreenOptions, "search"> {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: StepUpAccess<C>;
  /** The sentence naming the action, such as "Revoking a key needs a
   *  recent sign-in." */
  readonly reason: string;
  /** The single sign-on provider's name, for "Use Authelia". */
  readonly provider?: string;
  /** Where a single sign-on step-up comes back: the app's own path, which
   *  says what to open again there. Default: this page. */
  readonly redirect?: string;
  /** Takes focus as the dialog closes. Default: what had focus as it
   *  opened. */
  readonly opener?: HTMLElement;
}

export type StepUpAnswer<T> =
  /** The action's own answer, after at most one step-up. */
  | { readonly kind: "done"; readonly result: Result<T> }
  /** The person cancelled; nothing ran again. */
  | { readonly kind: "cancelled" }
  /** Single sign-on: the page is leaving, and the action did not run again. */
  | { readonly kind: "redirecting" }
  /** The step-up cannot go on, in `words`; `refusal` is the answer that
   *  ended it, such as a session that ended. */
  | { readonly kind: "failed"; readonly words: string; readonly refusal?: Refusal };

type Method = "password" | "totp" | "passkey" | "oidc";
type Offer = readonly Method[];

const WRITES = new Map<string, AccountAction>([
  ["stepUpPassword", "auth.step_up"],
  ["stepUpPasskeyFinish", "auth.step_up"],
  ["stepUpCode", "auth.step_up_code"],
]);

/** `client` with its step-up writes run through `run`, for `withStepUp`,
 *  which calls them on the client it is given. */
function throughRun<C extends object>(client: C, run: Runner): C {
  return new Proxy(client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== "function") {
        return value;
      }
      const name = typeof prop === "string" ? WRITES.get(prop) : undefined;
      const call = value as (...args: unknown[]) => unknown;
      return name === undefined
        ? call.bind(target)
        : (...args: unknown[]) => run(name, () => Promise.resolve(call.apply(target, args)));
    },
  });
}

interface Dialog {
  /** The next press: a method, or "cancel" once the person closes it. */
  next(): Promise<StepUpChoice>;
  /** Ends the pressed control's busy state. */
  idle(): void;
  offer(methods: Offer): void;
  readonly password: () => string;
  readonly code: () => string;
  fieldError(which: "password" | "code", text: string): void;
  say(said: Said): void;
  hold(seconds: number): void;
  close(): void;
}

/**
 * Runs `action`; when the server asks for a recent sign-in, asks the person
 * to confirm it is you with only the methods their account holds and the
 * host mounts, then runs `action` once more. A wrong password or code keeps
 * the dialog open on its field. Over a plain session the fresh sign-in
 * takes the dialog's place, with the username fixed.
 */
export async function stepUp<T, C extends StepUpClient>(
  action: () => Promise<Result<T>>,
  options: StepUpOptions<C>,
): Promise<StepUpAnswer<T>> {
  const { client, access, signal } = options;
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const provider = options.provider ?? w.provider;
  const life = signal === undefined ? {} : { signal };
  const opener =
    options.opener ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  installAnnouncer(life);
  installDialogs(life);
  installTooltips(life);

  let ui: Dialog | undefined;
  /** Methods the server turned away since the last `me()`. */
  const dropped = new Set<Method>();
  let webauthn: boolean | undefined;
  /** The press a later round's prompt answers with. */
  let chosen: StepUpChoice | undefined;
  /** The last press, whichever prompt took it. */
  let last: StepUpChoice | undefined;
  let offered: Offer = [];
  let ended: StepUpAnswer<T> | undefined;
  let refusal: Result<T> | undefined;
  let replay: Result<T> | undefined;

  // A later round replays the first refusal, so withStepUp reads `me()` and
  // asks again without sending the action a second time.
  const act = async (): Promise<Result<T>> => {
    if (replay !== undefined) {
      const answer = replay;
      replay = undefined;
      return answer;
    }
    const answer = await action();
    if (!answer.ok && codeOf(answer) === "auth_recent_auth_required") {
      refusal = answer;
    }
    return answer;
  };

  const offerOf = async (m: MethodsView): Promise<Offer> => {
    webauthn ??= (await access.passkeySupport()).webauthn;
    const offer: Method[] = [];
    if (m.password && m.password_login && m.password_step_up !== false && has("password")) {
      offer.push("password");
    }
    if (m.totp?.usable === true && has("second-factor")) {
      offer.push("totp");
    }
    if (m.passkey_count > 0 && m.passkeys_available && webauthn && has("passkeys")) {
      offer.push("passkey");
    }
    if (m.oidc_linked && m.oidc_available && has("single-sign-on")) {
      offer.push("oidc");
    }
    offered = offer.filter((o) => !dropped.has(o));
    return offered;
  };

  /** Offers what a fresh `me()` holds, less the dropped ways; failed
   *  when nothing is left. */
  const reoffer = async (d: Dialog): Promise<StepUpAnswer<T> | undefined> => {
    const me = await read(() => client.me());
    if (!me.ok) {
      if (offered.length === 0) {
        d.say(generic(me, w));
      }
      return undefined;
    }
    d.offer(await offerOf(me.data.methods));
    return offered.length === 0 ? { kind: "failed", words: w["stepUp.none"] } : undefined;
  };

  const press = async (d: Dialog): Promise<StepUpChoice> => {
    last = await d.next();
    return last;
  };

  /** Stops offering `m`, which the server turned away. */
  const drop = (d: Dialog, m: Method): void => {
    dropped.add(m);
    offered = offered.filter((o) => o !== m);
    d.offer(offered);
  };

  const prompt = async (methods: MethodsView): Promise<StepUpChoice> => {
    const offer = await offerOf(methods);
    if (ui === undefined) {
      if (offer.length === 0) {
        ended = { kind: "failed", words: w["stepUp.none"] };
        return "cancel";
      }
      ui = stepUpDialog(offer);
      return press(ui);
    }
    ui.offer(offer);
    const pressed = chosen;
    chosen = undefined;
    if (pressed !== undefined && (pressed === "cancel" || offer.includes(pressed))) {
      return pressed;
    }
    ui.idle();
    return press(ui);
  };

  const signInAgain = async (): Promise<boolean> => {
    const me = await read(() => client.me());
    if (!me.ok) {
      ended = { kind: "failed", words: generic(me, w).text, refusal: me };
      return false;
    }
    const username = me.data.user.username;
    ui?.close();
    const again = signInDialog(username);
    ui = again;
    for (;;) {
      if ((await press(again)) === "cancel") {
        ended = { kind: "cancelled" };
        return false;
      }
      let answer: Result<unknown> | null;
      try {
        answer = await run("auth.sign_in", () =>
          client.loginPassword({ username, password: again.password() }),
        );
      } catch {
        answer = null;
      }
      if (answer === null) {
        again.say({ tone: "danger", text: w["generic.server"] });
      } else if (answer.ok) {
        // A sign-in may answer a further step, which this dialog does not
        // hold.
        if (Object.hasOwn(answer.data as object, "pending")) {
          ended = { kind: "failed", words: w["stepUp.signInElsewhere"] };
          return false;
        }
        return true;
      } else {
        switch (codeOf(answer)) {
          case "auth_invalid_credentials":
            again.fieldError("password", w["stepUp.wrong"]);
            break;
          case "auth_password_login_disabled":
            ended = { kind: "failed", words: w["signIn.passwordOff"], refusal: answer };
            return false;
          default:
            refused(again, answer);
        }
      }
      again.idle();
    }
  };

  /** Shows a refusal no field takes. */
  const refused = (d: Dialog, r: Refusal): void => {
    const seconds = codeOf(r) === "auth_rate_limited" ? retryAfter(r) : undefined;
    if (seconds !== undefined && seconds > 0) {
      d.hold(seconds);
    } else {
      d.say(generic(r, w));
    }
  };

  /** What a refused step-up does: undefined keeps the dialog open, and
   *  "stale" keeps it once a fresh `me()` has redrawn its ways. */
  const failed = (
    d: Dialog,
    error: Refusal | PasskeyMiss,
  ): StepUpAnswer<T> | "stale" | undefined => {
    if ("kind" in error) {
      missed(d, error);
      return undefined;
    }
    switch (codeOf(error)) {
      case "auth_invalid_credentials":
        d.fieldError("password", w["stepUp.wrong"]);
        return undefined;
      case "auth_bad_request":
        d.fieldError("code", w["stepUp.codeFormat"]);
        return undefined;
      case "auth_code_invalid": {
        const reason = reasonOf(error);
        if (reason === "method_locked") {
          drop(d, "totp");
          d.say({
            tone: "danger",
            text: w["auth_code_invalid.method_locked"](offered.includes("passkey")),
          });
        } else {
          d.fieldError(
            "code",
            reason === "code_reused"
              ? w["auth_code_invalid.code_reused"]
              : w["auth_code_invalid.code_invalid"],
          );
        }
        return undefined;
      }
      case "auth_totp_disabled":
        drop(d, "totp");
        d.say({ tone: "warning", text: w.auth_totp_disabled });
        return undefined;
      case "auth_second_factor_unavailable":
        d.say({ tone: "warning", text: w.auth_second_factor_unavailable });
        return undefined;
      case "auth_password_login_disabled":
        drop(d, "password");
        d.say({ tone: "neutral", text: w["stepUp.passwordOff"] });
        return undefined;
      case "auth_second_factor_required":
        if (reasonOf(error) !== "second_factor_held") {
          refused(d, error);
          return undefined;
        }
        drop(d, "oidc");
        drop(d, "password");
        d.say({ tone: "neutral", text: w["stepUp.secondFactorHeld"] });
        return "stale";
      case "auth_https_required":
        return { kind: "failed", words: w["stepUp.https"], refusal: error };
      case "auth_required":
      case "auth_session_expired":
        return { kind: "failed", words: generic(error, w).text, refusal: error };
      default:
        refused(d, error);
        return undefined;
    }
  };

  const missed = (d: Dialog, miss: PasskeyMiss): void => {
    const said = passkeyMiss(miss, w);
    if (said === undefined) {
      return;
    }
    if ("ok" in said) {
      refused(d, said);
    } else {
      d.say(said);
    }
  };

  const through = throughRun(client, run);
  const round = async (): Promise<StepUpResult<T> | null> => {
    try {
      return await access.withStepUp(through, act, {
        prompt,
        password: () => Promise.resolve(ui?.password() ?? null),
        code: () => Promise.resolve(ui === undefined ? null : (sixDigits(ui.code()) ?? null)),
        signInAgain,
        ...(options.redirect === undefined ? {} : { redirect: options.redirect }),
        ...(options.navigate === undefined ? {} : { navigate: options.navigate }),
      });
    } catch {
      return null;
    }
  };

  /** The dialog's frame: its heading, the action's sentence, the notice
   *  slot and Cancel. Each dialog adds its fields and its primary. */
  function frame(title: string): {
    readonly dialog: HTMLDialogElement;
    readonly form: HTMLFormElement;
    readonly stack: HTMLElement;
    readonly notices: Slot;
    readonly footer: HTMLElement;
    readonly cancel: HTMLButtonElement;
  } {
    const dialog = el("dialog", "cp-dialog");
    const form = el("form");
    form.noValidate = true;
    const head = el("header");
    const h = heading(2, title);
    head.append(h);
    dialog.setAttribute("aria-labelledby", h.id);
    const body = el("div", "cp-dialog-body");
    const stack = el("div", "cp-stack");
    const sentence = el("p", undefined, options.reason);
    sentence.id = `${h.id}-reason`;
    dialog.setAttribute("aria-describedby", sentence.id);
    const notices = slot(el("div"));
    notices.root.dataset["part"] = "notice";
    stack.append(sentence, notices.root);
    body.append(stack);
    const footer = el("footer");
    const cancel = el("button", "cp-button", w["stepUp.cancel"]);
    cancel.type = "button";
    footer.append(cancel);
    form.append(head, body, footer);
    dialog.append(form);
    return { dialog, form, stack, notices, footer, cancel };
  }

  /** The shared behaviour of both dialogs: presses, busy, close. */
  function control(f: ReturnType<typeof frame>, holdable: () => HTMLElement[]) {
    let waiter: ((c: StepUpChoice) => void) | undefined;
    const queued: StepUpChoice[] = [];
    let endPress: ((ok: boolean) => void) | undefined;
    let hold: Hold | undefined;
    let closing = false;
    const busy = (): boolean => endPress !== undefined;

    const deliver = (choice: StepUpChoice): void => {
      if (waiter === undefined) {
        queued.push(choice);
      } else {
        const take = waiter;
        waiter = undefined;
        take(choice);
      }
    };
    const press = (confirm: Confirm, choice: StepUpChoice): void => {
      if (busy() || hold?.active() === true) {
        return;
      }
      f.notices.clear();
      f.cancel.setAttribute("aria-disabled", "true");
      void cycle(
        confirm,
        () =>
          new Promise<boolean>((resolve) => {
            endPress = resolve;
            deliver(choice);
          }),
        (ok) => ok,
      );
    };
    f.cancel.addEventListener("click", () => {
      if (!busy()) {
        closeDialog(f.dialog, "cancel");
      }
    });
    holdDialog(f.dialog, busy, life);
    f.dialog.addEventListener("close", () => {
      f.dialog.remove();
      if (opener?.isConnected === true) {
        opener.focus();
      }
      if (!closing) {
        deliver("cancel");
      }
    });
    signal?.addEventListener(
      "abort",
      () => {
        closeDialog(f.dialog, "cancel");
      },
      { once: true },
    );
    document.body.append(f.dialog);
    f.dialog.showModal();
    return {
      press,
      next: (): Promise<StepUpChoice> =>
        new Promise<StepUpChoice>((resolve) => {
          const first = queued.shift();
          if (first === undefined) {
            waiter = resolve;
          } else {
            resolve(first);
          }
        }),
      idle(): void {
        const end = endPress;
        endPress = undefined;
        f.cancel.removeAttribute("aria-disabled");
        end?.(false);
      },
      say(said: Said): void {
        f.notices.show(said.tone, said.text);
      },
      hold(seconds: number): void {
        hold = holdFor(
          seconds,
          f.notices,
          holdable(),
          { text: w.auth_rate_limited, again: w["stepUp.again"] },
          signal,
        );
      },
      close(): void {
        closing = true;
        const end = endPress;
        endPress = undefined;
        end?.(true);
        closeDialog(f.dialog, "done");
      },
    };
  }

  function stepUpDialog(first: Offer): Dialog {
    const f = frame(w["stepUp.title"]);
    const password = passwordField(
      { label: w["stepUp.password"], name: "password", autocomplete: "current-password" },
      w["password.show"],
    );
    enhanceReveal(password.reveal, password.input, life);
    const code = codeField({ label: w["stepUp.code"], help: w["stepUp.codeHelp"] });
    const methods = el("div", "cp-stack");
    methods.dataset["part"] = "methods";
    const rule = el("hr");
    const submit = actionButton(w["stepUp.confirm"], { primary: true, type: "submit" });
    const confirmSubmit = enhanceConfirm(submit, { busy: w["stepUp.busy"], done: false, ...life });
    const toCode = actionButton(w["stepUp.useCode"]);
    const toPassword = actionButton(w["stepUp.usePassword"]);
    const passkey = actionButton(w["stepUp.usePasskey"], { icon: "key-round" });
    const confirmPasskey = enhanceConfirm(passkey, {
      busy: w["stepUp.passkeyBusy"],
      done: false,
      ...life,
    });
    const sso = actionButton(w["stepUp.useProvider"](provider), { icon: "log-in" });
    const confirmSso = enhanceConfirm(sso, { busy: w["stepUp.busy"], done: false, ...life });
    f.stack.append(password.root, code.root, rule, methods);
    f.footer.append(submit);
    const c = control(f, () => [submit, passkey, sso]);

    let offer: Offer = first;
    let mode: "password" | "totp" | undefined;
    const draw = (focus: boolean): void => {
      const fields = offer.filter(
        (m): m is "password" | "totp" => m === "password" || m === "totp",
      );
      if (mode === undefined || !fields.includes(mode)) {
        mode = fields[0];
      }
      password.root.hidden = mode !== "password";
      code.root.hidden = mode !== "totp";
      submit.hidden = mode === undefined;
      const others: HTMLElement[] = [];
      if (mode === "password" && offer.includes("totp")) {
        others.push(toCode);
      }
      if (mode === "totp" && offer.includes("password")) {
        others.push(toPassword);
      }
      if (offer.includes("passkey")) {
        others.push(passkey);
      }
      if (offer.includes("oidc")) {
        others.push(sso);
      }
      methods.replaceChildren(...others);
      rule.hidden = mode === undefined || others.length === 0;
      // One primary: the field's Confirm, or else the first method.
      for (const b of others) {
        delete b.dataset["variant"];
      }
      const lead = others[0];
      if (mode === undefined && lead !== undefined) {
        lead.dataset["variant"] = "primary";
      }
      if (focus) {
        (mode === "password" ? password.input : mode === "totp" ? code.input : lead)?.focus();
      }
    };
    const swap = (to: "password" | "totp"): void => {
      mode = to;
      f.notices.clear();
      draw(true);
    };
    toCode.addEventListener("click", () => {
      swap("totp");
    });
    toPassword.addEventListener("click", () => {
      swap("password");
    });
    passkey.addEventListener("click", () => {
      c.press(confirmPasskey, "passkey");
    });
    sso.addEventListener("click", () => {
      c.press(confirmSso, "oidc");
    });
    for (const input of [password.input, code.input]) {
      input.addEventListener("input", () => {
        clearError(input);
      });
    }
    f.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (mode === "password") {
        if (password.input.value === "") {
          showError(password.input, w["stepUp.passwordEmpty"]);
          password.input.focus();
          return;
        }
        c.press(confirmSubmit, "password");
      } else if (mode === "totp") {
        if (sixDigits(code.input.value) === undefined) {
          showError(code.input, w["stepUp.codeFormat"]);
          code.input.focus();
          return;
        }
        c.press(confirmSubmit, "totp");
      }
    });
    draw(true);

    return {
      ...c,
      offer(next: Offer): void {
        const before = mode;
        offer = next;
        draw(false);
        if (mode !== before) {
          draw(true);
        }
      },
      password: () => password.input.value,
      code: () => code.input.value,
      fieldError(which, text): void {
        const input = which === "password" ? password.input : code.input;
        if (input.closest(".cp-field")?.hasAttribute("hidden") === true) {
          c.say({ tone: "danger", text });
          return;
        }
        showError(input, text);
        input.focus();
        input.select();
      },
    };
  }

  function signInDialog(username: string): Dialog {
    const f = frame(w["stepUp.signInTitle"]);
    const name = field({
      label: w["signIn.username"],
      name: "username",
      autocomplete: "username",
      value: username,
    });
    name.input.readOnly = true;
    const password = passwordField(
      { label: w["signIn.password"], name: "password", autocomplete: "current-password" },
      w["password.show"],
    );
    enhanceReveal(password.reveal, password.input, life);
    const submit = actionButton(w["stepUp.signIn"], { primary: true, type: "submit" });
    const confirm = enhanceConfirm(submit, { busy: w["stepUp.signInBusy"], done: false, ...life });
    f.stack.append(name.root, password.root);
    f.footer.append(submit);
    const c = control(f, () => [submit]);
    password.input.addEventListener("input", () => {
      clearError(password.input);
    });
    f.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (password.input.value === "") {
        showError(password.input, w["signIn.passwordEmpty"]);
        password.input.focus();
        return;
      }
      c.press(confirm, "password");
    });
    password.input.focus();
    return {
      ...c,
      offer: () => undefined,
      password: () => password.input.value,
      code: () => "",
      fieldError(_which, text): void {
        showError(password.input, text);
        password.input.focus();
        password.input.select();
      },
    };
  }

  const settle = (answer: StepUpAnswer<T>): StepUpAnswer<T> => {
    ui?.close();
    return answer;
  };

  for (;;) {
    const out = await round();
    if (ended !== undefined) {
      return settle(ended);
    }
    if (out === null) {
      if (ui === undefined) {
        return { kind: "failed", words: w["generic.server"] };
      }
      ui.say({ tone: "danger", text: w["generic.server"] });
    } else if (out.kind === "done" || out.kind === "redirecting") {
      return settle(out);
    } else if (out.kind === "cancelled") {
      // A dismissed passkey prompt answers as cancelled too: the dialog
      // stays for another way.
      if (ui === undefined || last === "cancel") {
        return settle({ kind: "cancelled" });
      }
    } else if (ui === undefined) {
      const error = out.error;
      return "kind" in error
        ? { kind: "failed", words: w["passkey.failed"] }
        : { kind: "failed", words: generic(error, w).text, refusal: error };
    } else {
      const final = failed(ui, out.error);
      const after = final === "stale" ? await reoffer(ui) : final;
      if (after !== undefined) {
        return settle(after);
      }
    }
    if (signal?.aborted === true) {
      return settle({ kind: "cancelled" });
    }
    ui.idle();
    chosen = await press(ui);
    if (chosen === "cancel") {
      return settle({ kind: "cancelled" });
    }
    replay = refusal;
  }
}
