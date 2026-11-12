/**
 * sign-in.ts — the sign-in screen: password, passkey and single sign-on, in
 * the gate page's panel, with each answer's words as
 * docs/design-account.md "Sign-in" lists them.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { clearError, reportErrors, type FieldError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import { codeOf, generic, reasonOf, retryAfter, type Said } from "./answer.js";
import type {
  OIDCReturn,
  Refusal,
  Result,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  SignedIn,
  StateResponse,
} from "./client.js";
import { actionButton, el, field, glyph, heading, line, notice, passwordField } from "./dom.js";
import { runDirect } from "./run.js";
import {
  cleanAddress,
  cycle,
  holdFor,
  partsOf,
  samePath,
  sleep,
  slot,
  type Hold,
  type ScreenOptions,
} from "./screen.js";
import { wordsOf, type AccountWords } from "./words.js";

/** The notice a sign-in opens with, after the step that sent the person
 *  here. */
export type SignInArrival = "session-ended" | "setup-complete" | "password-set";

export interface SignedInEvent {
  /** Where to go: the `next` path, else "/". */
  readonly next: string;
  /** One of the person's passkeys may have been copied: the page they land
   *  on says so, linked to the passkeys. */
  readonly cloneWarning: boolean;
}

export interface SignInOptions<C extends SignInClient> extends ScreenOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: SignInAccess<C>;
  /** The single sign-on provider's name, for "Continue with Authelia". */
  readonly provider?: string;
  /** The line in the panel's foot that says how to get back in. False
   *  leaves it out. Default "Lost access? Ask an admin for a recovery link." */
  readonly recoveryHint?: string | Node | false;
  /** Where the person links a single sign-on identity, named in the words
   *  for one that no account uses. Default "Security". */
  readonly place?: string;
  readonly arrived?: SignInArrival;
  /** The username to fill in. */
  readonly username?: string;
  /** Where to go once signed in. Default: the `next` query value when it is
   *  a path on this origin, else "/". */
  readonly next?: string;
  /** False leaves out the `<h1>`, for a host that heads the screen itself. */
  readonly heading?: boolean;
  /** The state the host already read. Default: `client.state()`. */
  readonly state?: StateResponse;
  /** Runs once the person is signed in. Default: navigate to `next`. */
  readonly onSignedIn?: (event: SignedInEvent) => void;
}

interface Methods {
  readonly password: boolean;
  readonly passkey: boolean;
  readonly sso: boolean;
  readonly conditional: boolean;
}

interface PasswordForm {
  readonly form: HTMLFormElement;
  readonly summary: HTMLElement;
  readonly username: HTMLInputElement;
  readonly password: HTMLInputElement;
  readonly confirm: Confirm;
}

type Failed = Exclude<SignInOutcome, { kind: "signed-in" }>;

/** Fills `panel`, the gate page's `.cp-panel`, with the sign-in screen. */
export function mountSignIn<C extends SignInClient>(
  panel: HTMLElement,
  options: SignInOptions<C>,
): void {
  const { client, access, signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const provider = options.provider ?? w.provider;
  const place = options.place ?? "Security";
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const search = options.search ?? location.search;
  const next = options.next ?? samePath(new URLSearchParams(search).get("next")) ?? "/";
  const life = signal === undefined ? {} : { signal };
  installAnnouncer(life);
  installTooltips(life);
  panel.dataset["cpAccount"] = "";

  const back = access.readOIDCReturn(search);
  if (back.kind !== "none") {
    cleanAddress();
  }

  const stack = el("div", "cp-stack");
  if (options.heading !== false) {
    const title = heading(1, w["signIn.title"]);
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
  let conditionalOn = false;
  let waiting: AbortController | undefined;

  const finish = (result: SignedIn): void => {
    stopConditional();
    const event = { next, cloneWarning: result.clone_warning === true };
    if (options.onSignedIn === undefined) {
      navigate(next);
    } else {
      options.onSignedIn(event);
    }
  };

  /** Runs one write, answering null when the write itself failed. */
  const attempt = async <T>(
    name: "auth.sign_in" | "auth.sign_in_passkey",
    work: () => Promise<T>,
  ): Promise<T | null> => {
    try {
      return await run(name, work);
    } catch {
      return null;
    }
  };

  const load = async (after?: Said): Promise<void> => {
    stopConditional();
    notices.clear();
    panel.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      body.replaceChildren(sketch());
    }, life);
    const [state, support] = await Promise.all([
      options.state === undefined
        ? read(() => client.state())
        : Promise.resolve({ ok: true as const, data: options.state }),
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
      const drawn = draw({
        password: state.data.password_login && has("password"),
        passkey: state.data.passkeys && has("passkeys") && support.webauthn,
        sso: state.data.oidc && has("single-sign-on"),
        conditional: support.conditional,
      });
      const said = drawn
        ? (after ?? opening())
        : { tone: "neutral" as const, text: w["signIn.off"] };
      if (said !== undefined) {
        notices.show(said.tone, said.text);
      }
    });
  };

  /** Draws the methods that are on; false when none is. */
  const draw = (methods: Methods): boolean => {
    holdable = [];
    conditionalOn = false;
    const others = Number(methods.passkey) + Number(methods.sso);
    if (!methods.password && others === 0) {
      body.replaceChildren();
      return false;
    }
    // One primary on the page: the password form's, or else the only method.
    const alone = !methods.password && others === 1;
    const nodes: Node[] = [];
    const form = methods.password ? passwordForm() : undefined;
    if (form !== undefined) {
      nodes.push(form.form);
      if (others > 0) {
        nodes.push(el("hr"));
      }
    }
    if (others > 0) {
      const list = el("div", "cp-stack");
      if (methods.passkey) {
        list.append(passkeyButton(alone));
      }
      if (methods.sso) {
        list.append(ssoLink(alone));
      }
      nodes.push(list);
    }
    const hint = options.recoveryHint ?? w["signIn.recoveryHint"];
    if (hint !== false) {
      const foot = line("cp-meta", hint);
      foot.dataset["part"] = "hint";
      nodes.push(foot);
    }
    body.replaceChildren(...nodes);
    conditionalOn = form !== undefined && methods.passkey && methods.conditional;
    if (conditionalOn && form !== undefined) {
      form.username.setAttribute("autocomplete", "username webauthn");
      startConditional();
    }
    return true;
  };

  /** The notice the screen opens with: a single sign-on outcome first. */
  const opening = (): Said | undefined => {
    const said = returned(back);
    if (said !== undefined || options.arrived === undefined) {
      return said;
    }
    return {
      tone: options.arrived === "password-set" ? "success" : "neutral",
      text: w[`arrived.${options.arrived}`],
    };
  };

  const returned = (r: OIDCReturn): Said | undefined => {
    switch (r.kind) {
      case "none":
      case "linked":
      case "stepped_up":
        return undefined;
      case "not_linked":
        return { tone: "warning", text: w["oidc.not_linked"](provider, place) };
      case "error":
        switch (r.code) {
          case "auth_rate_limited":
            return { tone: "warning", text: w["auth_rate_limited.later"] };
          case "auth_busy":
            return { tone: "danger", text: w.auth_busy };
          case "auth_unavailable":
            return { tone: "danger", text: w.auth_unavailable };
          case "auth_oidc_unavailable":
            return { tone: "danger", text: w.auth_oidc_unavailable };
          default:
            return { tone: "danger", text: w.auth_oidc_failed };
        }
    }
  };

  /** Shows a refusal that names no field. */
  const refused = (r: Refusal): void => {
    const code = codeOf(r);
    const seconds = code === "auth_rate_limited" ? retryAfter(r) : undefined;
    if (seconds !== undefined && seconds > 0) {
      hold = holdFor(
        seconds,
        notices,
        holdable,
        { text: w.auth_rate_limited, again: w["signIn.again"] },
        signal,
      );
    } else if (code === "auth_origin_refused") {
      notices.show("danger", w.auth_origin_refused);
    } else {
      const said = generic(r, w);
      notices.show(said.tone, said.text);
    }
  };

  const passwordForm = (): PasswordForm => {
    const form = el("form", "cp-stack");
    form.noValidate = true;
    const summary = notice("danger", "");
    summary.hidden = true;
    const username = field({
      label: w["signIn.username"],
      name: "username",
      autocomplete: "username",
      ...(options.username === undefined ? {} : { value: options.username }),
    });
    const password = passwordField(
      { label: w["signIn.password"], name: "password", autocomplete: "current-password" },
      w["password.show"],
    );
    enhanceReveal(password.reveal, password.input, life);
    const submit = actionButton(w["signIn.submit"], { primary: true, type: "submit" });
    form.append(summary, username.root, password.root, submit);
    holdable.push(submit);
    const parts: PasswordForm = {
      form,
      summary,
      username: username.input,
      password: password.input,
      confirm: enhanceConfirm(submit, { busy: w["signIn.busy"], done: w["signIn.done"], ...life }),
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
          void signIn(parts);
        }
      },
      life,
    );
    return parts;
  };

  const signIn = async (f: PasswordForm): Promise<void> => {
    const empty: FieldError[] = [];
    if (f.username.value.trim() === "") {
      empty.push({ field: f.username, message: w["signIn.usernameEmpty"] });
    }
    if (f.password.value === "") {
      empty.push({ field: f.password, message: w["signIn.passwordEmpty"] });
    }
    reportErrors(f.form, empty, { summary: f.summary, heading: w["form.summary"] });
    if (empty.length > 0) {
      return;
    }
    notices.clear();
    stopConditional();
    const credentials = { username: f.username.value, password: f.password.value };
    const login = (): Promise<Result<SignedIn> | null> =>
      attempt("auth.sign_in", () => client.loginPassword(credentials));
    const got = await cycle(
      f.confirm,
      async () => {
        let answer = await login();
        if (answer?.ok === false && codeOf(answer) === "auth_busy") {
          await sleep(1000, signal);
          answer = await login();
        }
        if (answer?.ok === true) {
          await access.storePasswordCredential(credentials.username, credentials.password);
        }
        return answer;
      },
      (answer) => answer?.ok === true,
    );
    if (got === undefined || signal?.aborted === true) {
      return;
    }
    const answer = got.answer;
    if (answer === null) {
      notices.show("danger", w["generic.server"]);
    } else if (answer.ok) {
      finish(answer.data);
      return;
    } else {
      passwordRefused(answer, f);
    }
    startConditional();
  };

  const passwordRefused = (r: Refusal, f: PasswordForm): void => {
    switch (codeOf(r)) {
      case "auth_invalid_credentials":
        notices.show("danger", w.auth_invalid_credentials);
        f.password.focus();
        f.password.select();
        return;
      case "auth_username_invalid":
        reportErrors(f.form, [{ field: f.username, message: usernameWords(reasonOf(r), w) }], {
          summary: f.summary,
          heading: w["form.summary"],
        });
        return;
      case "auth_password_login_disabled":
        void load({ tone: "neutral", text: w["signIn.passwordOff"] });
        return;
      default:
        refused(r);
    }
  };

  const stopConditional = (): void => {
    waiting?.abort();
    waiting = undefined;
  };
  signal?.addEventListener("abort", stopConditional, { once: true });

  /** The autofill request, which offers the person's passkeys in the
   *  username field's suggestions. */
  const startConditional = (): void => {
    if (!conditionalOn || waiting !== undefined || signal?.aborted === true) {
      return;
    }
    const mine = new AbortController();
    waiting = mine;
    void attempt("auth.sign_in_passkey", () =>
      access.signInWithPasskey(client, { mediation: "conditional", signal: mine.signal }),
    ).then((outcome) => {
      if (mine.signal.aborted || signal?.aborted === true) {
        return;
      }
      waiting = undefined;
      if (outcome?.kind === "signed-in") {
        finish(outcome.result);
      } else if (outcome !== null && outcome.kind !== "cancelled" && outcome.kind !== "timeout") {
        passkeyRefused(outcome);
        startConditional();
      }
    });
  };

  const passkeyButton = (primary: boolean): HTMLButtonElement => {
    const button = actionButton(w["signIn.passkey"], { icon: "key-round", primary });
    holdable.push(button);
    const confirm = enhanceConfirm(button, {
      busy: w["signIn.passkeyBusy"],
      done: w["signIn.done"],
      ...life,
    });
    button.addEventListener(
      "click",
      () => {
        if (held()) {
          return;
        }
        notices.clear();
        // The browser runs one passkey request at a time.
        stopConditional();
        void cycle(
          confirm,
          () => attempt("auth.sign_in_passkey", () => access.signInWithPasskey(client)),
          (outcome) => outcome?.kind === "signed-in",
        ).then((got) => {
          if (got === undefined || signal?.aborted === true) {
            return;
          }
          const outcome = got.answer;
          if (outcome === null) {
            notices.show("danger", w["generic.server"]);
          } else if (outcome.kind === "signed-in") {
            finish(outcome.result);
            return;
          } else {
            passkeyRefused(outcome);
          }
          startConditional();
        });
      },
      life,
    );
    return button;
  };

  const passkeyRefused = (outcome: Failed): void => {
    switch (outcome.kind) {
      case "cancelled":
        return;
      case "timeout":
      case "ceremony-expired":
      case "unknown-credential":
        notices.show("warning", w[`passkey.${outcome.kind}`]);
        return;
      case "verification-failed":
        notices.show("danger", w["passkey.verification-failed"]);
        return;
      case "failed":
        if (typeof outcome.error !== "string") {
          refused(outcome.error);
        } else if (outcome.error === "SecurityError") {
          // The browser refuses a ceremony whose relying party does not fit
          // this origin, before it asks the person.
          notices.show("danger", w.auth_origin_refused);
        } else {
          notices.show("danger", w["passkey.failed"]);
        }
    }
  };

  const ssoLink = (primary: boolean): HTMLAnchorElement => {
    const link = el("a", "cp-button");
    link.href = access.oidcSignInURL(client, next);
    if (primary) {
      link.dataset["variant"] = "primary";
    }
    link.append(glyph("log-in"), w["signIn.provider"](provider));
    return link;
  };

  void load();
}

/** The words for `auth_username_invalid`, by its reason. */
function usernameWords(reason: string | undefined, w: AccountWords): string {
  switch (reason) {
    case "empty":
      return w["auth_username_invalid.empty"];
    case "disallowed_character":
      return w["auth_username_invalid.disallowed_character"];
    default:
      return w.auth_username_invalid;
  }
}

/** A read that answers a refusal instead of rejecting. */
async function read<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch {
    return { ok: false, status: 0, error: "no answer" };
  }
}

/** The form's shape while the state loads. */
function sketch(): HTMLElement {
  const box = el("div", "cp-stack");
  box.setAttribute("aria-hidden", "true");
  for (const variant of ["heading", "", "heading", "", "last"]) {
    const bar = el("span", "cp-skeleton");
    if (variant !== "") {
      bar.dataset["variant"] = variant;
    }
    box.append(bar);
  }
  return box;
}
