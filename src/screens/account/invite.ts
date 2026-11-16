/**
 * invite.ts — the invite screen: a new account from an invite link, by
 * password or, from access Part 5, by single sign-on, with each answer's
 * words as docs/design-account.md "First run and invites" lists them.
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
  InviteAccess,
  InviteClient,
  PasswordAnswer,
  Refusal,
  Result,
  SignedIn,
} from "./client.js";
import {
  actionButton,
  el,
  field,
  glyph,
  heading,
  line,
  notice,
  passwordField,
  sketch,
} from "./dom.js";
import { continueSignIn, stepOf } from "./pending.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cycle,
  holdFor,
  needsHttps,
  partsOf,
  read,
  slot,
  transportOf,
  type Hold,
  type ScreenOptions,
} from "./screen.js";
import { wordsOf } from "./words.js";

export interface InviteOptions<C extends InviteClient> extends ScreenOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: InviteAccess<C>;
  /** The app's name, for "Join Release tracker". */
  readonly app: string;
  /** The single sign-on provider's name, for "Accept with Authelia". */
  readonly provider?: string;
  /** The invite's token. Default: the link's `#token=`. */
  readonly token?: string;
  /** The app takes each person's role from the identity provider, so the
   *  invite's role lasts until their first sign-in. */
  readonly roleFromProvider?: boolean;
  /** False leaves out the `<h1>`, for a host that heads the screen itself. */
  readonly heading?: boolean;
  /** Runs once the account exists and is signed in. Default: navigate to
   *  "/". */
  readonly onSignedIn?: (signedIn: SignedIn) => void;
}

interface InviteForm {
  readonly form: HTMLFormElement;
  readonly summary: HTMLElement;
  readonly username: HTMLInputElement;
  readonly password: HTMLInputElement;
  readonly confirm: Confirm;
}

/** Fills `panel`, the gate page's `.cp-panel`, with the invite screen. */
export function mountInvite<C extends InviteClient>(
  panel: HTMLElement,
  options: InviteOptions<C>,
): void {
  const { client, access, signal, app } = options;
  if (signal?.aborted === true) {
    return;
  }
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const provider = options.provider ?? w.provider;
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const life = signal === undefined ? {} : { signal };
  // Before anything else runs, so the token leaves the address bar at once.
  const token = (options.token ?? access.takeFragmentToken("token") ?? "").trim();
  installAnnouncer(life);
  installTooltips(life);

  const stack = el("div", "cp-stack");
  if (options.heading !== false) {
    const title = heading(1, w["invite.title"](app));
    panel.setAttribute("aria-labelledby", title.id);
    stack.append(title);
  }
  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  const body = el("div", "cp-stack");
  stack.append(notices.root, body);
  panel.replaceChildren(stack);

  let hold: Hold | undefined;
  const held = (): boolean => hold?.active() === true;
  let holdable: HTMLElement[] = [];
  let providerButton: HTMLButtonElement | undefined;
  let passwordLength = passwordLengthOf(undefined);
  let webauthn = false;

  const signedIn = (result: SignedIn): void => {
    if (options.onSignedIn === undefined) {
      navigate("/");
    } else {
      options.onSignedIn(result);
    }
  };

  const attempt = async <T>(name: AccountAction, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await run(name, work);
    } catch {
      return null;
    }
  };

  /** The invite cannot be used: no form, only why. */
  const broken = (text: string): void => {
    holdable = [];
    notices.clear();
    const box = el("div", "cp-empty");
    box.append(glyph("circle-alert"), el("p", undefined, text));
    body.replaceChildren(box);
  };

  /** Draws the screen from `state()`, saying `said` over it. */
  const load = async (said?: Said): Promise<void> => {
    if (token === "") {
      broken(w["invite.broken"]);
      return;
    }
    notices.clear();
    panel.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      body.replaceChildren(sketch());
    }, life);
    const [state, support] = await Promise.all([
      read(() => client.state()),
      access.passkeySupport(),
    ]);
    if (signal?.aborted === true) {
      skeleton.cancel();
      return;
    }
    skeleton.commit(() => {
      panel.removeAttribute("aria-busy");
      if (!state.ok) {
        body.replaceChildren();
        const retry = el("button", "cp-button", w["generic.retry"]);
        retry.type = "button";
        retry.addEventListener("click", () => void load(), { once: true });
        notices.show("danger", generic(state, w).text, retry);
        return;
      }
      const s = state.data;
      const t = transportOf(s);
      // Accepting an invite needs HTTPS (access Part 3).
      if (t.plain) {
        holdable = [];
        body.replaceChildren(needsHttps(t, app, w));
        return;
      }
      passwordLength = passwordLengthOf(s);
      webauthn = support.webauthn;
      const password = s.password_login && has("password") && (s.sso ?? "alongside") !== "only";
      const sso = s.oidc && has("single-sign-on") && client.inviteAcceptOIDC !== undefined;
      draw(password, sso);
      if (said !== undefined) {
        notices.show(said.tone, said.text);
      }
    });
  };

  const draw = (password: boolean, sso: boolean): void => {
    holdable = [];
    providerButton = undefined;
    const nodes: Node[] = [];
    if (options.roleFromProvider === true) {
      nodes.push(line("cp-help", w["invite.role"](provider)));
    }
    nodes.push(line("cp-help", w["invite.forward"]));
    if (password) {
      nodes.push(inviteForm().form);
    }
    if (sso) {
      if (password) {
        nodes.push(el("hr"));
      }
      nodes.push(ssoButton(!password));
    }
    if (!password && !sso) {
      nodes.push(notice("neutral", w["invite.off"]));
    }
    body.replaceChildren(...nodes);
  };

  const inviteForm = (): InviteForm => {
    const form = el("form", "cp-stack");
    form.noValidate = true;
    const summary = notice("danger", "");
    summary.hidden = true;
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
    form.append(summary, username.root, password.root, submit);
    holdable.push(submit);
    const parts: InviteForm = {
      form,
      summary,
      username: username.input,
      password: password.input,
      confirm: enhanceConfirm(submit, { busy: w["setup.busy"], done: w["setup.done"], ...life }),
    };
    for (const input of [parts.username, parts.password]) {
      input.addEventListener(
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
          void accept(parts);
        }
      },
      life,
    );
    return parts;
  };

  const report = (f: InviteForm, errors: readonly FieldError[]): void => {
    reportErrors(f.form, errors, { summary: f.summary, heading: w["form.summary"] });
  };

  const accept = async (f: InviteForm): Promise<void> => {
    const empty: FieldError[] = [];
    if (f.username.value.trim() === "") {
      empty.push({ field: f.username, message: w["setup.usernameEmpty"] });
    }
    const misfit =
      f.password.value === ""
        ? w["setup.passwordEmpty"]
        : passwordMisfit(f.password.value, passwordLength, w);
    if (misfit !== undefined) {
      empty.push({ field: f.password, message: misfit });
    }
    report(f, empty);
    if (empty.length > 0) {
      return;
    }
    notices.clear();
    const request = { token, username: f.username.value, password: f.password.value };
    const kept = (): Promise<void> =>
      access.storePasswordCredential(request.username, request.password);
    const got = await cycle(
      f.confirm,
      async () => {
        const answer: Result<PasswordAnswer> | null = await attempt("auth.invite_accept", () =>
          client.inviteAcceptPassword(request),
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
      notices.show("danger", w["generic.server"]);
    } else if (answer.ok) {
      const step = stepOf(answer.data);
      if ("pending" in step) {
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
            finish: (result) => {
              void kept().then(
                () => {
                  signedIn(result);
                },
                () => {
                  signedIn(result);
                },
              );
            },
            restart: (said) => {
              void load(said);
            },
            ...life,
          },
          step,
        );
      } else {
        signedIn(step.signed_in);
      }
    } else {
      refused(answer, f);
    }
  };

  /** Shows a refusal of either way in; with `f`, on its fields. */
  const refused = (r: Refusal, f?: InviteForm): void => {
    const code = codeOf(r);
    switch (code) {
      case "auth_username_taken":
      case "auth_username_invalid":
        if (f !== undefined) {
          const message =
            code === "auth_username_taken" ? w.auth_username_taken : usernameWords(r, w);
          report(f, [{ field: f.username, message }]);
          return;
        }
        break;
      case "auth_password_rejected":
        if (f !== undefined) {
          report(f, [{ field: f.password, message: passwordWords(r, w, passwordLength) }]);
          return;
        }
        break;
      case "auth_token_invalid":
        broken(w["invite.broken"]);
        return;
      case "auth_forbidden":
        switch (reasonOf(r)) {
          case "single_owner":
            broken(w["auth_forbidden.single_owner"]);
            return;
          case "no_usable_method":
            notices.show("danger", w["auth_forbidden.no_usable_method"]);
            return;
          default:
            notices.show("danger", w.auth_forbidden);
            return;
        }
      case "auth_sso_only":
        notices.show("danger", w.auth_sso_only);
        providerButton?.focus();
        return;
      case "auth_breach_check_unavailable":
        notices.show("warning", w.auth_breach_check_unavailable);
        return;
      case "auth_https_required":
        void load();
        return;
      case "auth_oidc_unavailable":
        notices.show("danger", w.auth_oidc_unavailable);
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
    notices.show(said.tone, said.text);
  };

  const ssoButton = (primary: boolean): HTMLButtonElement => {
    const button = actionButton(w["invite.provider"](provider), { icon: "log-in", primary });
    providerButton = button;
    holdable.push(button);
    const confirm = enhanceConfirm(button, {
      busy: w["invite.providerBusy"],
      done: false,
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
          () =>
            attempt(
              "auth.invite_accept_oidc",
              (): Promise<Result<{ readonly url: string }>> =>
                client.inviteAcceptOIDC?.({ token }) ?? Promise.reject(new Error("no call")),
            ),
          (answer) => answer?.ok === true,
        ).then((got) => {
          if (got === undefined || signal?.aborted === true) {
            return;
          }
          const answer = got.answer;
          if (answer === null) {
            notices.show("danger", w["generic.server"]);
          } else if (answer.ok) {
            navigate(answer.data.url);
          } else {
            refused(answer);
          }
        });
      },
      life,
    );
    return button;
  };

  void load();
}
