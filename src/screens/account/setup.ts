/**
 * setup.ts — the first-run screen: the setup token, the first account by
 * password or passkey, and the passkey offer after a password setup, with
 * each answer's words as docs/design-account.md "First run and invites"
 * lists them.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { clearError, reportErrors, type FieldError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import {
  checkLength,
  codeOf,
  generic,
  passwordLengthOf,
  passwordMisfit,
  passwordWords,
  reasonOf,
  retryAfter,
  usernameWords,
  type Said,
} from "./answer.js";
import type {
  PasswordAnswer,
  RegisterOutcome,
  Refusal,
  Result,
  SetupAccess,
  SetupClient,
  PasskeySignInOutcome,
} from "./client.js";
import { actionButton, el, field, heading, line, notice, passwordField, sketch } from "./dom.js";
import { showRecoveryCode } from "./factor.js";
import { headingOr, redrawKeepingFocus } from "./focus.js";
import { continueSignIn } from "./pending.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cycle,
  holdFor,
  needsHttps,
  partsOf,
  plainLines,
  latest,
  read,
  retryButton,
  slot,
  transportOf,
  type Hold,
  type ScreenOptions,
  type Transport,
} from "./screen.js";
import { pageHost, wordsOf } from "./words.js";

export interface SetupOptions<C extends SetupClient> extends ScreenOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: SetupAccess<C>;
  /** The app's name, for "Set up Release tracker". */
  readonly app: string;
  /** Asks for the setup token, with `help` naming the command that prints
   *  it. The field starts with `value`, else the link's `#token=`. */
  readonly token?: { readonly help: string | Node; readonly value?: string };
  /** False leaves out the `<h1>`, for a host step that heads the region
   *  itself. */
  readonly heading?: boolean;
  /** Whether to offer a passkey once a password setup is done; the host's
   *  gate, such as its relying party's origin matching this page. Absent:
   *  no offer. */
  readonly offerPasskey?: () => boolean | Promise<boolean>;
  /** Runs once the account exists. Default: navigate to "/". */
  readonly onDone?: () => void;
  /** Runs when setup was already done. Default: navigate to `signInPath`
   *  with `arrived=setup-complete`. */
  readonly onSetupComplete?: () => void;
  /** Default "/sign-in". */
  readonly signInPath?: string;
}

interface SetupForm {
  readonly form: HTMLFormElement;
  readonly summary: HTMLElement;
  readonly token: HTMLInputElement | undefined;
  readonly username: HTMLInputElement;
  readonly password: HTMLInputElement;
  readonly confirm: Confirm;
}

/** Fills `region`, the gate page's panel or a host's step, with the setup
 *  screen. */
export function mountSetup<C extends SetupClient>(
  region: HTMLElement,
  options: SetupOptions<C>,
): void {
  const { client, access, signal, app } = options;
  if (signal?.aborted === true) {
    return;
  }
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const life = signal === undefined ? {} : { signal };
  const ended = (): boolean => signal?.aborted === true;
  // Before anything else runs, so the token leaves the address bar at once.
  const linked = options.token === undefined ? undefined : access.takeFragmentToken("token");
  installAnnouncer(life);
  installTooltips(life);

  const stack = el("div", "cp-stack");
  const title = options.heading === false ? undefined : heading(1, w["setup.title"](app));
  if (title !== undefined) {
    title.tabIndex = -1;
    region.setAttribute("aria-labelledby", title.id);
    stack.append(title);
  }
  const body = el("div", "cp-stack");
  const lead = headingOr(title, body);
  const notices = slot(el("div"), lead);
  notices.root.dataset["part"] = "notice";
  stack.append(notices.root, body);
  region.replaceChildren(stack);

  let hold: Hold | undefined;
  const held = (): boolean => hold?.active() === true;
  let holdable: HTMLElement[] = [];
  let passwordLength = passwordLengthOf(undefined);
  let webauthn = false;

  const done = (): void => {
    if (options.onDone === undefined) {
      navigate("/");
    } else {
      options.onDone();
    }
  };
  const alreadyDone = (): void => {
    if (options.onSetupComplete === undefined) {
      navigate(`${options.signInPath ?? "/sign-in"}?arrived=setup-complete`);
    } else {
      options.onSetupComplete();
    }
  };

  /** Runs one write, answering null when the write itself failed. */
  const attempt = async <T>(name: AccountAction, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await run(name, work);
    } catch {
      return null;
    }
  };

  const loads = latest(signal);
  /** Draws the screen from `state()`, saying `said` over it. */
  const load = async (said?: Said): Promise<void> => {
    region.setAttribute("aria-busy", "true");
    const current = loads.start();
    const skeleton = skeletonTiming(() => {
      if (current()) {
        redrawKeepingFocus(body, lead, () => {
          body.replaceChildren(sketch());
        });
      }
    }, life);
    const [state, support] = await Promise.all([
      read(() => client.state()),
      access.passkeySupport(),
    ]);
    if (!current()) {
      skeleton.cancel();
      return;
    }
    skeleton.commit(() => {
      redrawKeepingFocus(stack, lead, () => {
        region.removeAttribute("aria-busy");
        notices.clear();
        if (!state.ok) {
          body.replaceChildren();
          notices.show("danger", generic(state, w).text, retryButton(w["generic.retry"], load));
          return;
        }
        if (!state.data.setup_required) {
          body.replaceChildren();
          alreadyDone();
          return;
        }
        const t = transportOf(state.data);
        const required = state.data.https_required;
        if (t.plain && (required.includes("setup") || required.includes("password"))) {
          body.replaceChildren(needsHttps(t, app, w));
          return;
        }
        passwordLength = passwordLengthOf(state.data);
        webauthn = support.webauthn;
        draw(t, has("setup-passkey") && state.data.passkeys && support.webauthn && !t.plain);
        if (said !== undefined) {
          notices.show(said.tone, said.text);
        }
      });
    });
  };

  const draw = (t: Transport, passkey: boolean): void => {
    holdable = [];
    const f = setupForm();
    const nodes: Node[] = [f.form];
    const offered: ("passkeys" | "oidc")[] = has("setup-passkey") ? ["passkeys"] : [];
    nodes.push(...plainLines(t, offered, app, w));
    if (passkey) {
      nodes.push(el("hr"), passkeyButton(f));
    }
    body.replaceChildren(...nodes);
  };

  const setupForm = (): SetupForm => {
    const form = el("form", "cp-stack");
    form.noValidate = true;
    const summary = notice("danger", "");
    summary.hidden = true;
    form.append(summary);
    let token: HTMLInputElement | undefined;
    if (options.token !== undefined) {
      const value = options.token.value ?? linked;
      const t = field({
        label: w["setup.token"],
        name: "token",
        autocomplete: "off",
        ...(value === undefined ? {} : { value }),
      });
      const help = line("cp-help", options.token.help);
      help.id = `${t.input.id}-help`;
      t.input.setAttribute("aria-describedby", help.id);
      t.input.classList.add("cp-mono");
      t.root.append(help);
      token = t.input;
      form.append(t.root);
    }
    const username = field({
      label: w["setup.username"],
      name: "username",
      autocomplete: "username",
      help: w["setup.usernameHelp"],
    });
    const password = passwordField(
      {
        label: w["setup.password"],
        name: "password",
        autocomplete: "new-password",
        help: w["setup.passwordHelp"](passwordLength.min, passwordLength.max),
      },
      w["password.show"],
    );
    enhanceReveal(password.reveal, password.input, life);
    checkLength(password.input, passwordLength, w, life);
    const submit = actionButton(w["setup.submit"], { primary: true, type: "submit" });
    form.append(username.root, password.root, submit);
    holdable.push(submit);
    const parts: SetupForm = {
      form,
      summary,
      token,
      username: username.input,
      password: password.input,
      confirm: enhanceConfirm(submit, { busy: w["setup.busy"], done: w["setup.done"], ...life }),
    };
    for (const input of [token, parts.username, parts.password]) {
      input?.addEventListener(
        "input",
        () => {
          if (input.value.trim() !== "") {
            clearError(input);
          }
        },
        life,
      );
    }
    form.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        if (!held()) {
          void setUp(parts);
        }
      },
      life,
    );
    return parts;
  };

  /** Reports the empty fields, and the password only when `password`;
   *  true when every field is ready to send. */
  const filled = (f: SetupForm, password: boolean): boolean => {
    const empty: FieldError[] = [];
    if (f.token?.value.trim() === "") {
      empty.push({ field: f.token, message: w["setup.tokenEmpty"] });
    }
    if (f.username.value.trim() === "") {
      empty.push({ field: f.username, message: w["setup.usernameEmpty"] });
    }
    const misfit = password
      ? f.password.value === ""
        ? w["setup.passwordEmpty"]
        : passwordMisfit(f.password.value, passwordLength, w)
      : undefined;
    if (misfit !== undefined) {
      empty.push({ field: f.password, message: misfit });
    }
    report(f, empty);
    return empty.length === 0;
  };

  const tokenRequired = (): string => {
    const words = w.auth_setup_token_required;
    return typeof words === "string" ? words : words(pageHost(location.hostname));
  };

  const report = (f: SetupForm, errors: readonly FieldError[]): void => {
    reportErrors(f.form, errors, { summary: f.summary, heading: w["form.summary"] });
  };

  const tokenOf = (f: SetupForm): { readonly token?: string } =>
    f.token === undefined ? {} : { token: f.token.value.trim() };

  const setUp = async (f: SetupForm): Promise<void> => {
    if (!filled(f, true)) {
      return;
    }
    notices.clear();
    const request = { ...tokenOf(f), username: f.username.value, password: f.password.value };
    const kept = (): Promise<void> =>
      access.storePasswordCredential(request.username, request.password);
    const got = await cycle(
      f.confirm,
      async () => {
        const answer: Result<PasswordAnswer> | null = await attempt("auth.setup", () =>
          client.setupPassword(request),
        );
        if (answer?.ok === true && !("pending" in answer.data)) {
          await kept();
        }
        return answer;
      },
      (answer) => answer?.ok === true && !("pending" in answer.data),
    );
    if (got === undefined || signal?.aborted === true) {
      return;
    }
    const answer = got.answer;
    if (answer === null) {
      notices.show("danger", w["generic.server"], resubmit(f));
    } else if (answer.ok) {
      if ("pending" in answer.data) {
        // Under a second-factor rule the account exists only once the
        // enrolment finishes, so the password is kept with the browser then.
        continueSignIn(
          {
            client,
            access,
            words: w,
            run,
            body,
            notices,
            webauthn,
            username: request.username,
            passwordLength,
            finish: () => {
              void kept().then(done, done);
            },
            restart: (said) => {
              void load(said);
            },
            ...life,
          },
          answer.data,
        );
      } else {
        const offer = (await options.offerPasskey?.()) === true;
        if (!ended()) {
          if (offer) {
            offerPasskey();
          } else {
            done();
          }
        }
      }
    } else {
      setupRefused(answer, f);
    }
  };

  const resubmit = (f: SetupForm): HTMLButtonElement =>
    retryButton(w["generic.retry"], () => {
      f.form.requestSubmit();
    });

  /** Shows a refusal of either setup; every typed value stays. */
  const setupRefused = (r: Refusal, f: SetupForm): void => {
    const code = codeOf(r);
    switch (code) {
      case "auth_setup_token_required":
      case "auth_token_invalid": {
        const words = code === "auth_token_invalid" ? w.auth_token_invalid : tokenRequired();
        if (f.token === undefined) {
          notices.show("danger", words);
        } else {
          report(f, [{ field: f.token, message: words }]);
        }
        return;
      }
      case "auth_username_invalid":
        report(f, [{ field: f.username, message: usernameWords(r, w) }]);
        return;
      case "auth_password_rejected":
        report(f, [{ field: f.password, message: passwordWords(r, w, passwordLength) }]);
        return;
      case "auth_breach_check_unavailable":
        notices.show("warning", w.auth_breach_check_unavailable);
        return;
      case "auth_setup_complete":
        alreadyDone();
        return;
      case "auth_https_required":
        void load();
        return;
      case "auth_forbidden":
        if (reasonOf(r) === "no_usable_method") {
          notices.show("danger", w["auth_forbidden.no_usable_method"]);
          return;
        }
        break;
      case "auth_origin_refused":
        notices.show("danger", w.auth_origin_refused);
        return;
      case "auth_rate_limited": {
        const seconds = retryAfter(r);
        if (seconds !== undefined && seconds > 0) {
          hold = holdFor(
            seconds,
            notices,
            holdable,
            { text: w.auth_rate_limited, again: w["signIn.again"] },
            signal,
          );
          return;
        }
        break;
      }
      default:
        break;
    }
    const said = generic(r, w);
    notices.show(said.tone, said.text, resubmit(f));
  };

  const passkeyButton = (f: SetupForm): HTMLButtonElement => {
    const button = actionButton(w["setup.passkey"], { icon: "key-round" });
    holdable.push(button);
    const confirm = enhanceConfirm(button, {
      busy: w["setup.passkeyBusy"],
      done: w["setup.done"],
      ...life,
    });
    button.addEventListener(
      "click",
      () => {
        if (held() || !filled(f, false)) {
          return;
        }
        notices.clear();
        const request = { ...tokenOf(f), username: f.username.value };
        void cycle(
          confirm,
          () => attempt("auth.setup_passkey", () => access.setupWithPasskey(client, request)),
          (outcome) => outcome?.kind === "signed-in",
        ).then((got) => {
          if (got === undefined || signal?.aborted === true) {
            return;
          }
          const outcome: PasskeySignInOutcome | null = got.answer;
          if (outcome === null) {
            notices.show("danger", w["generic.server"]);
          } else if (outcome.kind === "signed-in") {
            done();
          } else if (outcome.kind !== "failed") {
            ceremonyRefused(outcome.kind);
          } else if (typeof outcome.error === "string") {
            ceremonyRefused(outcome.error);
          } else {
            setupRefused(outcome.error, f);
          }
        });
      },
      life,
    );
    return button;
  };

  /** Shows a passkey ceremony that ended without an answer from the
   *  server: its outcome, or the browser's `DOMException` name. */
  const ceremonyRefused = (kind: string): void => {
    switch (kind) {
      case "cancelled":
        return;
      case "timeout":
      case "ceremony-expired":
        notices.show("warning", w[`passkey.${kind}`]);
        return;
      case "duplicate":
      case "not-discoverable":
        notices.show("warning", w[`register.${kind}`]);
        return;
      case "verification-failed":
        notices.show("danger", w["passkey.verification-failed"]);
        return;
      case "SecurityError":
        // The browser refuses a ceremony whose relying party does not fit
        // this origin, before it asks the person.
        notices.show("danger", w.auth_origin_refused);
        return;
      default:
        notices.show("danger", w["passkey.failed"]);
    }
  };

  /** The step after a password setup: Add a passkey, or Skip. */
  const offerPasskey = (): void => {
    notices.show("success", w["setup.created"]);
    const add = actionButton(w["setup.offerAdd"], { icon: "key-round", primary: true });
    const skip = el("button", "cp-button", w["setup.offerSkip"]);
    skip.type = "button";
    skip.addEventListener("click", done, life);
    const confirm = enhanceConfirm(add, {
      busy: w["setup.offerBusy"],
      done: w["setup.offerDone"],
      ...life,
    });
    add.addEventListener(
      "click",
      () => {
        notices.clear();
        void cycle(
          confirm,
          () => attempt("auth.passkey_add", () => access.registerPasskey(client)),
          (outcome) => outcome?.kind === "registered",
        ).then((got) => {
          if (got === undefined || signal?.aborted === true) {
            return;
          }
          const outcome: RegisterOutcome | null = got.answer;
          if (outcome === null) {
            notices.show("danger", w["generic.server"]);
          } else if (outcome.kind === "registered") {
            if (outcome.recovery_code === undefined) {
              done();
            } else {
              void showRecoveryCode(outcome.recovery_code, w, signal).then(() => {
                if (!ended()) {
                  done();
                }
              });
            }
          } else if (outcome.kind !== "failed") {
            ceremonyRefused(outcome.kind);
          } else if (typeof outcome.error === "string") {
            ceremonyRefused(outcome.error);
          } else if (codeOf(outcome.error) === "auth_origin_refused") {
            notices.show("danger", w.auth_origin_refused);
          } else {
            notices.show("danger", generic(outcome.error, w).text);
          }
        });
      },
      life,
    );
    const actions = el("div", "cp-cluster");
    actions.append(add, skip);
    body.replaceChildren(el("p", undefined, w["setup.offer"]), actions);
    add.focus();
  };

  void load();
}
