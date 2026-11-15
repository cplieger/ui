/**
 * link.ts — the forms of "Link this identity", the sign-in screen's view
 * after a single sign-on return that no account uses (access Part 5's
 * pending link): an admin's temporary password under `sso: "only"`, and
 * "Create a new account" when the answer offers it.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { clearError, reportErrors, type FieldError } from "../../forms/form/form.js";
import { codeOf, generic, reasonOf, usernameWords, type Said } from "./answer.js";
import type { PendingLinkView, Refusal, Result, SignInClient, SignedIn } from "./client.js";
import { actionButton, el, field, heading, line, notice } from "./dom.js";
import type { AccountAction } from "./run.js";
import { cycle, read, type Slot } from "./screen.js";
import type { AccountWords } from "./words.js";

export interface LinkContext {
  readonly client: SignInClient;
  readonly words: AccountWords;
  readonly provider: string;
  readonly notices: Slot;
  /** Runs one write, answering null when the write itself failed. */
  readonly attempt: <T>(name: AccountAction, work: () => Promise<T>) => Promise<T | null>;
  /** Buttons a rate limit holds. */
  readonly holdable: HTMLElement[];
  /** Signed in, with the identity linked. */
  readonly done: (signedIn: SignedIn) => void;
  /** Back to the plain sign-in screen, saying why. */
  readonly reload: (said: Said) => void;
  /** Draws the link again from a fresh state, saying why. */
  readonly redraw: (said: Said) => void;
  /** Shows a refusal no form words itself. */
  readonly refused: (r: Refusal) => void;
  readonly held: () => boolean;
  readonly signal?: AbortSignal;
}

/** The words for a pending link that cannot go on: its sign-in lapsed,
 *  or the read was refused. */
export function lapsed(r: Refusal, w: AccountWords, provider: string): Said {
  switch (codeOf(r)) {
    case "auth_not_found":
      return { tone: "warning", text: w["link.expired"](provider) };
    case "auth_oidc_unavailable":
      return { tone: "danger", text: w.auth_oidc_unavailable };
    case "auth_https_required":
      return { tone: "warning", text: w["signIn.nextNeedsHttps"] };
    default:
      return generic(r, w);
  }
}

/** The words for `oidcLinkPending`'s refusal, once the person is signed
 *  in. */
export function linkRefused(r: Refusal, w: AccountWords, provider: string): Said {
  switch (codeOf(r)) {
    case "auth_identity_taken":
      return { tone: "danger", text: w.auth_identity_taken };
    case "auth_already_linked":
      return { tone: "danger", text: w.auth_already_linked };
    default:
      return lapsed(r, w, provider);
  }
}

const empty = (input: HTMLInputElement): boolean => input.value.trim() === "";

const clearOnInput = (inputs: readonly HTMLInputElement[], signal?: AbortSignal): void => {
  for (const input of inputs) {
    input.addEventListener(
      "input",
      () => {
        if (!empty(input)) {
          clearError(input);
        }
      },
      signal === undefined ? {} : { signal },
    );
  }
};

interface Form {
  readonly form: HTMLFormElement;
  readonly summary: HTMLElement;
}

function form(): Form {
  const f = el("form", "cp-stack");
  f.noValidate = true;
  const summary = notice("danger", "");
  summary.hidden = true;
  f.append(summary);
  return { form: f, summary };
}

/** Under `sso: "only"`: the account's username and a temporary password
 *  from an admin, which link the identity and sign in. */
export function adminLinkForm(x: LinkContext): HTMLFormElement {
  const { client, words: w, signal } = x;
  const life = signal === undefined ? {} : { signal };
  const { form: f, summary } = form();
  const username = field({ label: w["link.username"], name: "username", autocomplete: "username" });
  const secret = field({
    label: w["link.temporary"],
    name: "temporary_password",
    type: "password",
    autocomplete: "one-time-code",
  });
  const submit = actionButton(w["link.submit"], { primary: true, type: "submit" });
  f.append(username.root, secret.root, submit);
  x.holdable.push(submit);
  const confirm = enhanceConfirm(submit, { busy: w["link.busy"], done: w["link.done"], ...life });
  clearOnInput([username.input, secret.input], signal);
  const report = (errors: readonly FieldError[]): void => {
    reportErrors(f, errors, { summary, heading: w["form.summary"] });
  };

  const send = async (): Promise<void> => {
    const errors: FieldError[] = [];
    if (empty(username.input)) {
      errors.push({ field: username.input, message: w["link.usernameEmpty"] });
    }
    if (secret.input.value === "") {
      errors.push({ field: secret.input, message: w["link.temporaryEmpty"] });
    }
    report(errors);
    if (errors.length > 0 || client.oidcLinkByAdmin === undefined) {
      return;
    }
    x.notices.clear();
    const request = { username: username.input.value, temporary_password: secret.input.value };
    const got = await cycle(
      confirm,
      () =>
        x.attempt(
          "auth.pending_link_admin",
          (): Promise<Result<SignedIn>> =>
            client.oidcLinkByAdmin?.(request) ?? Promise.reject(new Error("no call")),
        ),
      (answer) => answer?.ok === true,
    );
    if (got === undefined || signal?.aborted === true) {
      return;
    }
    const answer = got.answer;
    if (answer === null) {
      x.notices.show("danger", w["generic.server"]);
    } else if (answer.ok) {
      x.done(answer.data);
    } else if (codeOf(answer) === "auth_invalid_credentials") {
      // The same answer as a mode that is no longer "only" (access Part 5).
      const state = await read(() => client.state());
      if (state.ok && (state.data.sso ?? "alongside") !== "only") {
        x.redraw({ tone: "warning", text: w["link.notNow"] });
        return;
      }
      x.notices.show("danger", w["link.wrong"]);
      secret.input.focus();
      secret.input.select();
    } else if (codeOf(answer) === "auth_not_found") {
      x.reload(lapsed(answer, w, x.provider));
    } else {
      x.refused(answer);
    }
  };
  f.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      if (!x.held()) {
        void send();
      }
    },
    life,
  );
  return f;
}

/** "Create a new account": its heading, line and form, the username filled
 *  with the provider's suggestion. */
export function createSection(x: LinkContext, pending: PendingLinkView): HTMLElement {
  const { client, words: w, signal } = x;
  const life = signal === undefined ? {} : { signal };
  const section = el("section", "cp-stack");
  const title = heading(2, w["link.create"]);
  section.setAttribute("aria-labelledby", title.id);
  const { form: f, summary } = form();
  const username = field({
    label: w["setup.username"],
    name: "new_username",
    autocomplete: "username",
    help: w["setup.usernameHelp"],
    ...(pending.suggested_username === undefined ? {} : { value: pending.suggested_username }),
  });
  const submit = actionButton(w["setup.submit"], { type: "submit" });
  f.append(username.root, submit);
  x.holdable.push(submit);
  const confirm = enhanceConfirm(submit, { busy: w["setup.busy"], done: w["setup.done"], ...life });
  clearOnInput([username.input], signal);
  const onField = (message: string): void => {
    reportErrors(f, [{ field: username.input, message }], { summary, heading: w["form.summary"] });
  };

  const send = async (): Promise<void> => {
    if (empty(username.input)) {
      onField(w["setup.usernameEmpty"]);
      return;
    }
    reportErrors(f, [], { summary, heading: w["form.summary"] });
    x.notices.clear();
    const request = { username: username.input.value.trim() };
    const got = await cycle(
      confirm,
      () =>
        x.attempt(
          "auth.pending_create",
          (): Promise<Result<SignedIn>> =>
            client.oidcCreatePending?.(request) ?? Promise.reject(new Error("no call")),
        ),
      (answer) => answer?.ok === true,
    );
    if (got === undefined || signal?.aborted === true) {
      return;
    }
    const answer = got.answer;
    if (answer === null) {
      x.notices.show("danger", w["generic.server"]);
      return;
    }
    if (answer.ok) {
      x.done(answer.data);
      return;
    }
    switch (codeOf(answer)) {
      case "auth_username_taken":
        onField(w.auth_username_taken);
        return;
      case "auth_username_invalid":
        onField(usernameWords(answer, w));
        return;
      case "auth_not_found":
        x.reload(lapsed(answer, w, x.provider));
        return;
      case "auth_token_invalid":
        x.notices.show("danger", w["auth_token_invalid.invite"]);
        return;
      case "auth_identity_taken":
        x.notices.show("danger", w.auth_identity_taken);
        return;
      case "auth_forbidden":
        if (reasonOf(answer) === "provisioning_disabled") {
          section.remove();
          x.notices.show("danger", w["auth_forbidden.provisioning_disabled"]);
          return;
        }
        x.refused(answer);
        return;
      default:
        x.refused(answer);
    }
  };
  f.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      if (!x.held()) {
        void send();
      }
    },
    life,
  );
  section.append(title, line("cp-help", w["link.createLine"](x.provider)), f);
  return section;
}
