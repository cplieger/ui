/**
 * sign-in.ts — the sign-in screen: password, passkey and single sign-on, in
 * the gate page's panel, with each answer's words as
 * docs/design-account.md "Sign-in" lists them, the states a plain request
 * and the single sign-on mode give it, and the steps after a password that
 * needs more (`pending.ts`).
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { clearError, reportErrors, type FieldError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import { enhanceDisclosure } from "../../navigation/disclosure/disclosure.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import {
  codeOf,
  generic,
  passkeyMiss,
  reasonOf,
  retryAfter,
  usernameWords,
  type Said,
} from "./answer.js";
import type {
  OIDCReturn,
  PasskeyMiss,
  PasswordAnswer,
  PendingLinkView,
  Refusal,
  Result,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  SignedIn,
  StateResponse,
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
  uid,
} from "./dom.js";
import { adminLinkForm, createSection, lapsed, linkRefused, type LinkContext } from "./link.js";
import { continueSignIn } from "./pending.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cleanAddress,
  cycle,
  holdFor,
  httpsLink,
  needsHttps,
  partsOf,
  plainLines,
  read,
  samePath,
  sleep,
  slot,
  transportOf,
  type Hold,
  type ScreenOptions,
  type Transport,
} from "./screen.js";
import { wordsOf } from "./words.js";

/** The notice a sign-in opens with, after the step that sent the person
 *  here. */
export type SignInArrival =
  "session-ended" | "setup-complete" | "password-set" | "transport-changed" | "signed-out";

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
  /** The app's name, for "Open Release tracker over HTTPS". */
  readonly app?: string;
  /** The single sign-on provider's name, for "Continue with Authelia". */
  readonly provider?: string;
  /** The line in the panel's foot that says how to get back in. False
   *  leaves it out. Default "Lost access? Ask an admin for a temporary
   *  password." */
  readonly recoveryHint?: string | Node | false;
  /** Where the person links a single sign-on identity, named in the words
   *  for one that no account uses. Default "Security". */
  readonly place?: string;
  /** Default: the `arrived` query value, as setup's default sends it. */
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

/** How the password form takes a temporary password: a switch under the
 *  field, as its only use, a line saying it works only over HTTPS, or not
 *  at all. */
type Temporary = "switch" | "only" | "https" | "none";

interface Methods {
  readonly password: boolean;
  readonly passkey: boolean;
  readonly sso: boolean;
  readonly conditional: boolean;
  readonly temporary: Temporary;
  readonly mode: NonNullable<StateResponse["sso"]>;
}

interface PasswordForm {
  readonly form: HTMLFormElement;
  readonly summary: HTMLElement;
  readonly username: HTMLInputElement;
  readonly password: HTMLInputElement;
  readonly confirm: Confirm;
  /** The field holds a temporary password. */
  readonly temporary: () => boolean;
}

/** `loginPassword`'s answer as a step's: the session alone before access
 *  Part 4. */
function stepOf(d: PasswordAnswer): SignInOutcome {
  return "pending" in d || "signed_in" in d ? d : { signed_in: d };
}

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
  const app = options.app ?? w["signIn.app"];
  const provider = options.provider ?? w.provider;
  const place = options.place ?? "Security";
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const search = options.search ?? location.search;
  const query = new URLSearchParams(search);
  const next = options.next ?? samePath(query.get("next")) ?? "/";
  const arrived = options.arrived ?? arrivalOf(query.get("arrived"));
  const life = signal === undefined ? {} : { signal };
  installAnnouncer(life);
  installTooltips(life);

  const back = access.readOIDCReturn(search);
  if (back.kind !== "none" || query.has("arrived")) {
    cleanAddress();
  }

  const stack = el("div", "cp-stack");
  const title = options.heading === false ? undefined : heading(1, w["signIn.title"]);
  if (title !== undefined) {
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
  let transport: Transport = { plain: false, withheld: [] };
  /** A plain screen that must not send a temporary password. */
  let precheck = false;
  let webauthn = false;
  let opened = false;
  let typed = options.username;
  let ssoLinkNode: HTMLAnchorElement | undefined;
  /** The return left an identity to link, and the host mounts the link. */
  let linking =
    back.kind === "not_linked" &&
    has("pending-link") &&
    client.oidcPending !== undefined &&
    client.oidcLinkPending !== undefined;

  const finish = (result: SignedIn): void => {
    stopConditional();
    if (linking) {
      void link(result);
      return;
    }
    leave(result);
  };

  const leave = (result: SignedIn): void => {
    const event = { next, cloneWarning: result.clone_warning === true };
    if (options.onSignedIn === undefined) {
      navigate(next);
    } else {
      options.onSignedIn(event);
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

  const load = async (after?: Said): Promise<void> => {
    stopConditional();
    notices.clear();
    panel.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      body.replaceChildren(sketch());
    }, life);
    const [state, support, pending] = await Promise.all([
      options.state === undefined || opened
        ? read(() => client.state())
        : Promise.resolve({ ok: true as const, data: options.state }),
      access.passkeySupport(),
      linking ? read(readPending) : Promise.resolve(undefined),
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
      webauthn = support.webauthn;
      transport = transportOf(s);
      precheck = transport.plain && s.temporary_password_https_only === true;
      let said = after ?? opening();
      opened = true;
      if (pending?.ok === false) {
        linking = false;
        said = lapsed(pending, w, provider);
      }
      if (title !== undefined) {
        title.textContent = linking ? w["link.title"] : w["signIn.title"];
      }
      if (strict(s)) {
        holdable = [];
        body.replaceChildren(needsHttps(transport, app, w));
        if (said !== undefined) {
          notices.show(said.tone, said.text);
        }
        return;
      }
      const temporary = temporaryOf(s);
      if (pending?.ok === true && linking) {
        drawLink(s, pending.data, support.webauthn, support.conditional, temporary);
        if (said !== undefined) {
          notices.show(said.tone, said.text);
        }
        return;
      }
      const drawn = draw({
        password: (s.password_login && has("password")) || temporary === "only",
        passkey: s.passkeys && has("passkeys") && support.webauthn,
        sso: s.oidc && has("single-sign-on"),
        conditional: support.conditional,
        temporary,
        mode: s.sso ?? "alongside",
      });
      const shown = drawn ? said : { tone: "neutral" as const, text: w["signIn.off"] };
      if (shown !== undefined) {
        notices.show(shown.tone, shown.text);
      }
    });
  };

  /** Part 3's strict posture over plain HTTP, or a plain screen whose form
   *  could only be refused (Part 4). */
  const strict = (s: StateResponse): boolean =>
    transport.plain &&
    ((s.https_required ?? []).includes("password") ||
      (!s.password_login && s.temporary_password_https_only === true));

  const temporaryOf = (s: StateResponse): Temporary => {
    // Temporary passwords come with access Part 4, whose state always
    // carries `totp`.
    if (!has("temporary-password") || s.totp === undefined) {
      return "none";
    }
    if (!s.password_login) {
      return transport.plain ? "none" : "only";
    }
    return s.temporary_password_https_only === true ? "https" : "switch";
  };

  /** Draws the methods that are on into `into`; false when none is. */
  const draw = (methods: Methods, into: HTMLElement = body): boolean => {
    holdable = [];
    conditionalOn = false;
    ssoLinkNode = undefined;
    const others = Number(methods.passkey) + Number(methods.sso);
    if (!methods.password && others === 0) {
      into.replaceChildren();
      return false;
    }
    const nodes: Node[] = [];
    const ssoOnly = methods.mode === "only" && methods.sso;
    // One primary on the page: the password form's, else the only method,
    // else under `sso: "only"` the provider's.
    const alone = !methods.password && others === 1;
    const form = methods.password ? passwordForm(methods.temporary, !ssoOnly) : undefined;
    if (ssoOnly) {
      nodes.push(ssoLink(true, w["sso.only"](provider)));
      const local = el("div", "cp-stack");
      local.append(line("cp-help", w["sso.ownerLine"]));
      if (form !== undefined) {
        local.append(form.form);
      }
      if (methods.passkey) {
        local.append(passkeyButton(false));
      }
      if (form !== undefined || methods.passkey) {
        const details = el("details");
        details.append(el("summary", undefined, w["sso.ownerSignIn"]), local);
        enhanceDisclosure(details, life);
        nodes.push(details);
      }
    } else {
      if (form !== undefined) {
        if (methods.mode === "only") {
          nodes.push(line("cp-help", w["sso.ownerLine"]));
        }
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
          list.append(ssoLink(alone, w["signIn.provider"](provider)));
          if (methods.mode === "for_linked") {
            list.append(line("cp-help", w["sso.forLinked"](provider)));
          }
        }
        nodes.push(list);
      }
    }
    const offered: ("passkeys" | "oidc")[] = [];
    if (has("passkeys")) {
      offered.push("passkeys");
    }
    if (has("single-sign-on")) {
      offered.push("oidc");
    }
    nodes.push(...plainLines(transport, offered, app, w));
    const hint = options.recoveryHint ?? w["signIn.recoveryHint"];
    if (hint !== false) {
      const foot = line("cp-meta", hint);
      foot.dataset["part"] = "hint";
      nodes.push(foot);
    }
    into.replaceChildren(...nodes);
    conditionalOn = form !== undefined && methods.passkey && methods.conditional;
    if (conditionalOn && form !== undefined) {
      form.username.setAttribute("autocomplete", "username webauthn");
      startConditional();
    }
    return true;
  };

  /** The notice the screen opens with, once: a single sign-on outcome
   *  first. */
  const opening = (): Said | undefined => {
    if (opened) {
      return undefined;
    }
    const said = returned(back);
    if (said !== undefined || arrived === undefined) {
      return said;
    }
    return {
      tone: arrived === "password-set" ? "success" : "neutral",
      text: w[`arrived.${arrived}`],
    };
  };

  const returned = (r: OIDCReturn): Said | undefined => {
    switch (r.kind) {
      case "none":
      case "linked":
      case "stepped_up":
        return undefined;
      case "not_linked":
        return linking
          ? undefined
          : { tone: "warning", text: w["oidc.not_linked"](provider, place) };
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

  const readPending = async (): Promise<Result<PendingLinkView>> =>
    (await client.oidcPending?.()) ?? { ok: false, status: 0, error: "no call" };

  /** "Link this identity": the existing account to sign in to, or under
   *  `sso: "only"` an admin's temporary password, then "Create a new
   *  account" when the answer offers it. */
  const drawLink = (
    s: StateResponse,
    pending: PendingLinkView,
    passkeys: boolean,
    conditional: boolean,
    temporary: Temporary,
  ): void => {
    const mode = s.sso ?? "alongside";
    const existing = el("section", "cp-stack");
    const existingTitle = heading(2, w["link.existing"]);
    existing.setAttribute("aria-labelledby", existingTitle.id);
    const methods = el("div", "cp-stack");
    let local: boolean;
    if (mode === "only") {
      holdable = [];
      conditionalOn = false;
      ssoLinkNode = undefined;
      local = client.oidcLinkByAdmin !== undefined;
      if (local) {
        methods.append(adminLinkForm(linkContext()));
      }
    } else {
      local = draw(
        {
          password: (s.password_login && has("password")) || temporary === "only",
          passkey: s.passkeys && has("passkeys") && passkeys,
          sso: false,
          conditional,
          temporary,
          mode: "alongside",
        },
        methods,
      );
    }
    const nodes: Node[] = [
      line("", w["link.as"](provider, pending.username_hint ?? pending.email)),
    ];
    if (local) {
      existing.append(
        existingTitle,
        line("cp-help", mode === "only" ? w["link.adminLine"] : w["link.existingLine"](provider)),
        methods,
      );
      nodes.push(existing);
    }
    if (pending.can_create === true && client.oidcCreatePending !== undefined) {
      nodes.push(createSection(linkContext(), pending));
    }
    if (nodes.length === 1) {
      nodes.push(line("", w["signIn.off"]));
    }
    body.replaceChildren(...nodes);
  };

  const linkContext = (): LinkContext => ({
    client,
    words: w,
    provider,
    notices,
    attempt,
    holdable,
    done: (result) => {
      linking = false;
      leave(result);
    },
    reload: (said) => {
      linking = false;
      void load(said);
    },
    redraw: (said) => {
      void load(said);
    },
    refused,
    held,
    ...life,
  });

  /** Links the pending identity to the account just signed in. Signed in
   *  either way: a refusal says why, with Continue into the app. */
  const link = async (result: SignedIn): Promise<void> => {
    linking = false;
    const answer = await attempt("auth.link_pending", async () => {
      const linked = await client.oidcLinkPending?.();
      return linked ?? { ok: false as const, status: 0, error: "no call" };
    });
    if (signal?.aborted === true) {
      return;
    }
    if (answer?.ok === true) {
      leave(result);
      return;
    }
    const said =
      answer === null
        ? { tone: "danger" as const, text: w["generic.server"] }
        : linkRefused(answer, w, provider);
    const go = el("button", "cp-button", w["link.continue"]);
    go.type = "button";
    go.addEventListener(
      "click",
      () => {
        leave(result);
      },
      { once: true },
    );
    body.replaceChildren();
    notices.show(said.tone, said.text, go);
    go.focus();
  };

  const passwordForm = (temporary: Temporary, primary: boolean): PasswordForm => {
    const form = el("form", "cp-stack");
    form.noValidate = true;
    const summary = notice("danger", "");
    summary.hidden = true;
    const username = field({
      label: w["signIn.username"],
      name: "username",
      autocomplete: "username",
      ...(typed === undefined ? {} : { value: typed }),
    });
    const password = passwordField(
      { label: w["signIn.password"], name: "password", autocomplete: "current-password" },
      w["password.show"],
    );
    enhanceReveal(password.reveal, password.input, life);
    const submit = actionButton(w["signIn.submit"], { primary, type: "submit" });
    form.append(summary, username.root, password.root);
    let isTemporary = temporary === "only";
    if (temporary !== "none") {
      temporaryParts(temporary, password.root, password.input, (on) => {
        isTemporary = on;
      });
    }
    form.append(submit);
    holdable.push(submit);
    const parts: PasswordForm = {
      form,
      summary,
      username: username.input,
      password: password.input,
      confirm: enhanceConfirm(submit, { busy: w["signIn.busy"], done: w["signIn.done"], ...life }),
      temporary: () => isTemporary,
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

  /** The temporary password's label, help, switch or HTTPS line, inside
   *  the password field's `root`. */
  const temporaryParts = (
    temporary: Exclude<Temporary, "none">,
    root: HTMLElement,
    input: HTMLInputElement,
    set: (on: boolean) => void,
  ): void => {
    const label = root.querySelector("label");
    const help = el("p", "cp-help");
    help.id = uid("temporary");
    const apply = (on: boolean): void => {
      if (label !== null) {
        label.textContent = on ? w["signIn.temporaryLabel"] : w["signIn.password"];
      }
      // A temporary password is spent once: no manager should keep it.
      input.setAttribute("autocomplete", on ? "one-time-code" : "current-password");
      help.textContent = on ? w["signIn.temporaryHelp"] : "";
      help.hidden = !on;
      // A description is read even from a hidden node.
      if (on) {
        input.setAttribute("aria-describedby", help.id);
      } else {
        input.removeAttribute("aria-describedby");
      }
      set(on);
    };
    root.append(help);
    if (temporary === "https") {
      help.textContent = w["signIn.temporaryHttps"](transport.httpsOrigin);
      help.dataset["part"] = "temporary-https";
      input.setAttribute("aria-describedby", help.id);
      return;
    }
    apply(temporary === "only");
    if (temporary === "only") {
      return;
    }
    let on = false;
    const toggle = el("button", "cp-button", w["signIn.temporary"]);
    toggle.type = "button";
    toggle.dataset["variant"] = "quiet";
    toggle.dataset["size"] = "sm";
    toggle.setAttribute("aria-pressed", "false");
    toggle.dataset["part"] = "temporary";
    toggle.addEventListener(
      "click",
      () => {
        on = !on;
        apply(on);
        toggle.textContent = on ? w["signIn.ownPassword"] : w["signIn.temporary"];
        toggle.setAttribute("aria-pressed", String(on));
        input.focus();
      },
      life,
    );
    // A cluster keeps the small button at its own width under the field.
    const row = el("div", "cp-cluster");
    row.append(toggle);
    root.append(row);
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
    // Over plain HTTP a temporary password would cross in clear, and the
    // server's cancel cannot win against a replay (access Part 4 (b)).
    if (precheck && access.looksLikeTemporaryPassword?.(f.password.value) === true) {
      notices.show("warning", w["signIn.looksTemporary"](transport.httpsOrigin));
      f.password.focus();
      return;
    }
    stopConditional();
    typed = f.username.value;
    const credentials = { username: f.username.value, password: f.password.value };
    const temporary = f.temporary();
    const login = (): Promise<Result<PasswordAnswer> | null> =>
      attempt("auth.sign_in", () => client.loginPassword(credentials));
    const got = await cycle(
      f.confirm,
      async () => {
        let answer = await login();
        if (answer?.ok === false && codeOf(answer) === "auth_busy") {
          await sleep(1000, signal);
          answer = await login();
        }
        if (answer?.ok === true && !temporary && !("pending" in answer.data)) {
          await access.storePasswordCredential(credentials.username, credentials.password);
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
      continueSignIn(
        {
          client,
          access,
          words: w,
          run,
          body,
          notices,
          webauthn,
          username: credentials.username,
          finish,
          restart: (said) => {
            void load(said);
          },
          ...life,
        },
        stepOf(answer.data),
      );
      return;
    } else {
      passwordRefused(answer, f);
    }
    startConditional();
  };

  const passwordRefused = (r: Refusal, f: PasswordForm): void => {
    const reason = reasonOf(r);
    switch (codeOf(r)) {
      case "auth_invalid_credentials":
        notices.show("danger", w.auth_invalid_credentials);
        f.password.focus();
        f.password.select();
        return;
      case "auth_username_invalid":
        reportErrors(f.form, [{ field: f.username, message: usernameWords(r, w) }], {
          summary: f.summary,
          heading: w["form.summary"],
        });
        return;
      case "auth_password_login_disabled":
        void load({ tone: "neutral", text: w["signIn.passwordOff"] });
        return;
      case "auth_second_factor_required":
        notices.show(
          "danger",
          reason === "enrol_needs_known_device"
            ? w["auth_second_factor_required.enrol_needs_known_device"]
            : w["signIn.noUsableMethod"],
        );
        return;
      case "auth_https_required": {
        if (reason === "temporary_password_exposed") {
          notices.show(
            "danger",
            w["auth_https_required.temporary_password_exposed"](transport.httpsOrigin),
          );
          return;
        }
        const words = document.createDocumentFragment();
        words.append(w["signIn.nextNeedsHttps"]);
        const link = httpsLink(transport, app, w);
        if (link !== undefined) {
          words.append(" ", link, ".");
        }
        notices.show("warning", words);
        return;
      }
      case "auth_forbidden":
        if (reason === "no_usable_method") {
          notices.show("danger", w["signIn.noUsableMethod"]);
          return;
        }
        refused(r);
        return;
      case "auth_sso_only":
        notices.show("danger", w.auth_sso_only);
        ssoLinkNode?.focus();
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

  const passkeyRefused = (outcome: PasskeyMiss): void => {
    const said = passkeyMiss(outcome, w);
    if (said === undefined) {
      return;
    }
    if ("ok" in said) {
      refused(said);
    } else {
      notices.show(said.tone, said.text);
    }
  };

  const ssoLink = (primary: boolean, text: string): HTMLAnchorElement => {
    const link = el("a", "cp-button");
    link.href = access.oidcSignInURL(client, next);
    if (primary) {
      link.dataset["variant"] = "primary";
    }
    link.append(glyph("log-in"), text);
    ssoLinkNode = link;
    return link;
  };

  void load();
}

const ARRIVALS: readonly SignInArrival[] = [
  "session-ended",
  "setup-complete",
  "password-set",
  "transport-changed",
  "signed-out",
];

function arrivalOf(value: string | null): SignInArrival | undefined {
  return ARRIVALS.find((a) => a === value);
}
