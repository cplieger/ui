/**
 * account.ts — the gallery's wiring for the account screens: each card's
 * screen runs on a fake client and access module that answer as the server
 * would, and a card that shows one state drives the screen into it.
 */

import {
  defaultAccountWords,
  mountAccessSettings,
  mountSecurity,
  mountSecurityLog,
  type LogClient,
  type LogEntryView,
  type LogKinds,
  type LogQuery,
  type SecurityLogView,
  type AccountPart,
  type KeyScopes,
  type KeyView,
  type SecurityOptions,
  type SessionView,
  mountInvite,
  mountSetup,
  mountSignIn,
  mountUsers,
  stepUp,
  type AccessSettingsClient,
  type AccountView,
  type AccountWords,
  type InviteAccess,
  type InviteClient,
  type InviteOptions,
  type PendingLinkView,
  type MeView,
  type MethodsView,
  type Refusal,
  type RegisterOutcome,
  type PasskeyView,
  type Readiness,
  type Result,
  type SSOMode,
  type SecondFactorProof,
  type SecurityAccess,
  type SecurityClient,
  type SetupAccess,
  type SetupClient,
  type SetupOptions,
  type SignInAccess,
  type SignInClient,
  type SignInOptions,
  type PasskeySignInOutcome,
  type PasswordAnswer,
  type Pending,
  type PendingClient,
  type PendingPasskeyOutcome,
  type SignInOutcome,
  type SignedIn,
  type StateResponse,
  type StepUpAccess,
  type StepUpCallbacks,
  type StepUpClient,
  type StepUpResult,
  type TemporaryPasswordOptions,
  type TemporaryPasswordResponse,
  type TokenView,
  type UserView,
  type UsersClient,
} from "@cplieger/ui/account";
import { clearError, showError } from "@cplieger/ui/form";
import { qrCode } from "@cplieger/ui/qr";
import { toast } from "@cplieger/ui/toast";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const EVERY: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
};
const SIGNED_IN: SignedIn = { user: { username: "mika" } };

function refusal(status: number, code: string, reason?: string, retryAfter?: number): Refusal {
  return {
    ok: false,
    status,
    error: code,
    code,
    ...(reason === undefined ? {} : { body: { code, reason } }),
    ...(retryAfter === undefined
      ? {}
      : { headers: new Headers({ "Retry-After": String(retryAfter) }) }),
  };
}

interface Demo extends SignInClient {
  readonly oidcPrefix: string;
}

interface Script {
  /** The state, or a refusal; undefined never answers. */
  readonly state?: () => Result<StateResponse> | undefined;
  readonly login?: (r: {
    readonly username: string;
    readonly password: string;
  }) => Result<PasswordAnswer>;
  readonly passkeys?: readonly PasskeySignInOutcome[];
  /** The code step's answer. Default: by the code typed. */
  readonly code?: (code: string) => Result<SignInOutcome>;
  /** The recovery code step's answer. Default: set up a new authenticator. */
  readonly recovery?: () => Result<SignInOutcome>;
  /** The identity a single sign-on return left unlinked. */
  readonly pending?: () => Result<PendingLinkView>;
  readonly link?: () => Result<unknown>;
  readonly create?: (username: string) => Result<SignedIn>;
  readonly admin?: (temporary: string) => Result<SignedIn>;
}

const ALICE: PendingLinkView = { issuer: "https://id.example", username_hint: "mika@example.com" };

/** A pending sign-in from access Part 4. */
const step = (
  next: Pending["next"],
  methods: Pending["methods"],
  recovered = false,
): Result<SignInOutcome> => ({
  ok: true,
  data: { pending: { ticket: "t1", next, methods, ...(recovered ? { recovered } : {}) } },
});

/** The code step's answers, by the code typed. */
function byCode(code: string): Result<SignInOutcome> {
  switch (code) {
    case "000000":
      return refusal(401, "auth_code_invalid", "code_invalid");
    case "111111":
      return refusal(401, "auth_code_invalid", "code_reused");
    default:
      return { ok: true, data: { signed_in: SIGNED_IN } };
  }
}

const PART4: StateResponse = { ...EVERY, totp: true };
const PLAIN: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: false,
  oidc: false,
  totp: true,
  secure: false,
  https_required: ["passkeys", "oidc"],
  plain_session: { idle_seconds: 1800, absolute_seconds: 43200 },
  https_origin: "https://tracker.example",
};

/** The answers of the page card, by what the person types. */
function byWords(r: { readonly username: string; readonly password: string }): Result<SignedIn> {
  if (r.username.includes(" ")) {
    return refusal(400, "auth_username_invalid", "disallowed_character");
  }
  switch (r.password) {
    case "wrong":
      return refusal(401, "auth_invalid_credentials");
    case "busy":
      return refusal(503, "auth_busy");
    case "limit":
      return refusal(429, "auth_rate_limited", undefined, 42);
    default:
      return { ok: true, data: SIGNED_IN };
  }
}

/** A pending sign-in's enrolment: 000000 is a wrong code, and the
 *  authenticator app's finish issues the recovery code. */
const ENROL: Required<Pick<PendingClient, "pendingTOTPBegin" | "pendingTOTPFinish">> = {
  async pendingTOTPBegin() {
    await wait(400);
    return {
      ok: true,
      data: {
        uri: "otpauth://totp/Release%20tracker:mika?secret=JBSWY3DPEHPK3PXP&issuer=Release%20tracker",
        text: "JBSWY3DPEHPK3PXP",
      },
    };
  },
  async pendingTOTPFinish(_ticket, code) {
    await wait(600);
    return code === "000000"
      ? refusal(401, "auth_code_invalid", "code_invalid")
      : { ok: true, data: { signed_in: { ...SIGNED_IN, recovery_code: "WXYZ2345EFGH6789" } } };
  },
};

const ceremony = async (): Promise<PendingPasskeyOutcome> => {
  await wait(900);
  return { kind: "answered", answer: { signed_in: SIGNED_IN } };
};

function fake(script: Script): { readonly client: Demo; readonly access: SignInAccess<Demo> } {
  let pressed = 0;
  const client: Demo = {
    oidcPrefix: "/api/auth/oidc",
    async state() {
      await wait(300);
      const answer = (script.state ?? (() => ({ ok: true, data: EVERY })))();
      return answer ?? new Promise<never>(() => undefined);
    },
    async loginPassword(r) {
      await wait(700);
      return (script.login ?? byWords)(r);
    },
    async loginCode(_ticket, code) {
      await wait(600);
      return (script.code ?? byCode)(code);
    },
    async loginRecoveryCode() {
      await wait(600);
      return (script.recovery ?? (() => step("enrol", ["totp", "passkey"], true)))();
    },
    async loginSetPassword() {
      await wait(600);
      return { ok: true, data: { signed_in: SIGNED_IN } };
    },
    ...ENROL,
    async oidcPending() {
      await wait(300);
      return (script.pending ?? (() => ({ ok: true, data: ALICE })))();
    },
    async oidcLinkPending() {
      await wait(500);
      return (script.link ?? (() => ({ ok: true, data: null })))();
    },
    async oidcCreatePending(r) {
      await wait(700);
      return (script.create ?? (() => ({ ok: true, data: SIGNED_IN })))(r.username);
    },
    async oidcLinkByAdmin(r) {
      await wait(700);
      return (script.admin ?? (() => ({ ok: true, data: SIGNED_IN })))(r.temporary_password);
    },
  };
  const access: SignInAccess<Demo> = {
    async signInWithPasskey(_c, o) {
      if (o?.mediation === "conditional") {
        return new Promise<never>(() => undefined);
      }
      await wait(900);
      const list = script.passkeys ?? [{ kind: "signed-in", result: SIGNED_IN }];
      const outcome = list[pressed % list.length] ?? { kind: "cancelled" };
      pressed += 1;
      return outcome;
    },
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    storePasswordCredential: () => Promise.resolve(),
    readOIDCReturn: (search) => {
      const q = new URLSearchParams(search);
      const error = q.get("auth_error");
      if (error !== null) {
        return { kind: "error", code: error };
      }
      return q.get("oidc") === "not_linked" ? { kind: "not_linked" } : { kind: "none" };
    },
    oidcSignInURL: () => "#sign-in",
    looksLikeTemporaryPassword: (value) =>
      /^[0-9a-z]{4}(?:[-\s]?[0-9a-z]{4}){3}$/i.test(value.trim()),
    loginSecondPasskey: ceremony,
    loginSetPasskey: ceremony,
    pendingPasskey: ceremony,
  };
  return { client, access };
}

type Card = Omit<SignInOptions<Demo>, "client" | "access"> & {
  readonly script?: Script;
  /** Drives the screen into the card's state once it is drawn. */
  readonly then?: (panel: HTMLElement) => void;
};

const fill = (panel: HTMLElement, name: string, value: string): void => {
  const input = panel.querySelector<HTMLInputElement>(`input[name='${name}']`);
  if (input !== null) {
    input.value = value;
  }
};

const submitForm = (panel: HTMLElement): void => {
  panel.querySelector("form")?.requestSubmit();
};

/** Signs in with a password, as the person would. */
const signInNow = (panel: HTMLElement, password = "lantern harbour"): void => {
  fill(panel, "username", "mika");
  fill(panel, "password", password);
  submitForm(panel);
};

/** Runs `then` once `selector` matches inside `panel`. */
function once(panel: HTMLElement, selector: string, then: (found: HTMLElement) => void): void {
  const look = (): boolean => {
    const found = panel.querySelector<HTMLElement>(selector);
    if (found !== null) {
      then(found);
    }
    return found !== null;
  };
  if (look()) {
    return;
  }
  const watch = new MutationObserver(() => {
    if (look()) {
      watch.disconnect();
    }
  });
  watch.observe(panel, { childList: true, subtree: true });
}

/** Signs in, then sends `code` at the code step. */
const codeStep = (code: string) => (panel: HTMLElement) => {
  signInNow(panel);
  once(panel, "input[name='code']", (input) => {
    (input as HTMLInputElement).value = code;
    submitForm(panel);
  });
};

const ownerHint = (): Node => {
  const hint = document.createDocumentFragment();
  const command = document.createElement("code");
  command.textContent = "seadex-scout admin reset-password";
  hint.append("Forgot your password? On the server, ", command, " sets a new one.");
  return hint;
};

const CARDS: Readonly<Record<string, Card>> = {
  page: {
    provider: "Authelia",
    arrived: "session-ended",
    script: {
      passkeys: [
        { kind: "timeout" },
        { kind: "unknown-credential" },
        { kind: "cancelled" },
        { kind: "signed-in", result: SIGNED_IN },
      ],
    },
  },
  owner: {
    provider: "Authelia",
    place: "Settings → Account",
    recoveryHint: ownerHint(),
    search: "?oidc=not_linked",
    parts: ["password", "passkeys", "single-sign-on"],
    words: {
      "oidc.not_linked": (provider, place) =>
        `This ${provider} identity is not linked to your account. Sign in another way, then link it in ${place}.`,
    },
  },
  wrong: {
    script: { login: () => refusal(401, "auth_invalid_credentials") },
    then: (panel) => {
      fill(panel, "username", "mika");
      fill(panel, "password", "lantern harbour");
      submitForm(panel);
    },
  },
  limit: {
    script: { login: () => refusal(429, "auth_rate_limited", undefined, 600) },
    then: (panel) => {
      fill(panel, "username", "mika");
      fill(panel, "password", "lantern harbour");
      submitForm(panel);
    },
  },
  empty: { then: submitForm },
  passkey: {
    script: { passkeys: [{ kind: "timeout" }] },
    then: (panel) => {
      panel
        .querySelector<HTMLButtonElement>("button:not([type='submit'], .cp-input-wrap > *)")
        ?.click();
    },
  },
  sso: { provider: "Authelia", search: "?auth_error=auth_oidc_failed" },
  "passkey-only": {
    script: { state: () => ({ ok: true, data: { ...EVERY, password_login: false, oidc: false } }) },
  },
  loading: { script: { state: () => undefined } },
  offline: {
    script: (() => {
      let reads = 0;
      return {
        state: (): Result<StateResponse> => {
          reads += 1;
          return reads === 1
            ? { ok: false, status: 0, error: "network", code: "network" }
            : { ok: true, data: EVERY };
        },
      };
    })(),
  },
  off: {
    script: {
      state: () => ({
        ok: true,
        data: { ...EVERY, password_login: false, passkeys: false, oidc: false },
      }),
    },
  },
  plain: { app: "Release tracker", script: { state: () => ({ ok: true, data: PLAIN }) } },
  strict: {
    app: "Release tracker",
    script: {
      state: () => ({
        ok: true,
        data: { ...PLAIN, password_login: false, https_required: ["password", "passkeys", "oidc"] },
      }),
    },
  },
  temporary: {
    script: {
      state: () => ({ ok: true, data: PART4 }),
      login: () => step("set_credential", ["password", "passkey"]),
    },
    then: (panel) => {
      panel.querySelector<HTMLButtonElement>("[data-part='temporary']")?.click();
    },
  },
  "temporary-plain": {
    script: {
      state: () => ({ ok: true, data: { ...PLAIN, temporary_password_https_only: true } }),
    },
    then: (panel) => {
      signInNow(panel, "abcd-2345-efgh-6789");
    },
  },
  "for-linked": {
    provider: "Authelia",
    script: { state: () => ({ ok: true, data: { ...PART4, sso: "for_linked" } }) },
  },
  "sso-only": {
    provider: "Authelia",
    script: { state: () => ({ ok: true, data: { ...PART4, sso: "only" } }) },
  },
  code: {
    script: { login: () => step("second_factor", ["totp", "passkey", "recovery_code"]) },
    then: signInNow,
  },
  "second-passkey": {
    script: { login: () => step("second_factor", ["passkey", "recovery_code"]) },
    then: signInNow,
  },
  recovered: {
    script: { login: () => step("second_factor", ["totp", "recovery_code"]) },
    then: (panel) => {
      signInNow(panel);
      once(panel, "input[name='code']", () => {
        [...panel.querySelectorAll<HTMLButtonElement>("button")]
          .find((b) => b.textContent === "Use your recovery code")
          ?.click();
        once(panel, "input[name='recovery_code']", (input) => {
          (input as HTMLInputElement).value = "ABCD-2345-EFGH-6789";
          submitForm(panel);
        });
      });
    },
  },
  locked: {
    script: {
      login: () => step("second_factor", ["totp", "passkey"]),
      code: () => refusal(401, "auth_code_invalid", "method_locked"),
    },
    then: codeStep("123456"),
  },
  "timed-out": {
    script: {
      login: () => step("second_factor", ["totp"]),
      code: () => refusal(401, "auth_token_invalid"),
    },
    then: codeStep("123456"),
  },
  choose: {
    script: { login: () => step("set_credential", ["password", "passkey"]) },
    then: (panel) => {
      signInNow(panel, "ABCD-2345-EFGH-6789");
    },
  },
  enrol: {
    script: { login: () => step("enrol", ["totp", "passkey"]) },
    then: signInNow,
  },
  link: (() => {
    let password = "";
    return {
      provider: "Authelia",
      search: "?oidc=not_linked",
      script: {
        login: (r: { readonly password: string }): Result<PasswordAnswer> => {
          password = r.password;
          return { ok: true, data: SIGNED_IN };
        },
        link: (): Result<unknown> =>
          password === "taken" ? refusal(409, "auth_identity_taken") : { ok: true, data: null },
      },
    };
  })(),
  "link-create": {
    provider: "Authelia",
    search: "?oidc=not_linked",
    script: {
      pending: () => ({
        ok: true,
        data: { ...ALICE, can_create: true, suggested_username: "mika" },
      }),
      create: (username) => {
        switch (username) {
          case "taken":
            return refusal(409, "auth_username_taken");
          case "late":
            return refusal(404, "auth_not_found");
          default:
            return { ok: true, data: SIGNED_IN };
        }
      },
    },
  },
  "link-admin": {
    provider: "Authelia",
    search: "?oidc=not_linked",
    script: {
      state: () => ({ ok: true, data: { ...PART4, sso: "only" } }),
      pending: () => ({
        ok: true,
        data: { ...ALICE, can_create: true, suggested_username: "mika" },
      }),
      admin: (temporary) =>
        temporary === "wrong"
          ? refusal(401, "auth_invalid_credentials")
          : { ok: true, data: SIGNED_IN },
    },
  },
  "link-expired": {
    provider: "Authelia",
    search: "?oidc=not_linked",
    script: { pending: () => refusal(404, "auth_not_found") },
  },
  "known-device": {
    script: {
      login: () => refusal(403, "auth_second_factor_required", "enrol_needs_known_device"),
    },
    then: signInNow,
  },
};

/** Runs `then` once `panel` is drawn and in view, so the focus it moves
 *  never scrolls the page. */
function whenShown(panel: HTMLElement, then: (panel: HTMLElement) => void): void {
  const seen = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting === true && !panel.hasAttribute("aria-busy")) {
        seen.disconnect();
        then(panel);
      }
    },
    { threshold: 0.6 },
  );
  const drawn = new MutationObserver(() => {
    if (!panel.hasAttribute("aria-busy")) {
      drawn.disconnect();
      seen.observe(panel);
    }
  });
  drawn.observe(panel, { attributes: true, attributeFilter: ["aria-busy"] });
}

for (const panel of document.querySelectorAll<HTMLElement>("[data-account-demo]")) {
  const card = CARDS[panel.dataset["accountDemo"] ?? ""];
  if (card === undefined) {
    continue;
  }
  const { script = {}, then, ...options } = card;
  const { client, access } = fake(script);
  mountSignIn(panel, {
    search: "",
    onSignedIn: ({ next }) => {
      toast({ title: `Signed in: the app would open ${next}` });
    },
    ...options,
    client,
    access,
  });
  if (then !== undefined) {
    whenShown(panel, then);
  }
}

const SETUP: StateResponse = { ...EVERY, setup_required: true, oidc: false };

/** The setup answers, by what the person types. */
function setupByWords(r: {
  readonly token?: string;
  readonly username: string;
  readonly password: string;
}): Result<PasswordAnswer> {
  if (r.token === "wrong") {
    return refusal(401, "auth_token_invalid");
  }
  if (r.username.includes(" ")) {
    return refusal(400, "auth_username_invalid", "disallowed_character");
  }
  switch (r.password) {
    case "common":
      return refusal(400, "auth_password_rejected", "common");
    case "breached":
      return refusal(400, "auth_password_rejected", "breached");
    case "short":
      return refusal(400, "auth_password_rejected", "too_short");
    case "limit":
      return refusal(429, "auth_rate_limited", undefined, 42);
    default:
      return { ok: true, data: SIGNED_IN };
  }
}

interface SetupScript {
  readonly state?: StateResponse;
  readonly setup?: typeof setupByWords;
  readonly register?: RegisterOutcome;
}

function setupFake(script: SetupScript): {
  readonly client: SetupClient;
  readonly access: SetupAccess<SetupClient>;
} {
  const client: SetupClient = {
    async state() {
      await wait(300);
      return { ok: true, data: script.state ?? SETUP };
    },
    async setupPassword(r) {
      await wait(700);
      return (script.setup ?? setupByWords)(r);
    },
    ...ENROL,
  };
  const access: SetupAccess<SetupClient> = {
    async setupWithPasskey() {
      await wait(900);
      return { kind: "signed-in", result: SIGNED_IN };
    },
    async registerPasskey() {
      await wait(900);
      return script.register ?? { kind: "registered" };
    },
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    storePasswordCredential: () => Promise.resolve(),
    takeFragmentToken: () => undefined,
    pendingPasskey: ceremony,
  };
  return { client, access };
}

type SetupCard = Omit<SetupOptions<SetupClient>, "client" | "access" | "app"> & {
  readonly script?: SetupScript;
  readonly then?: (panel: HTMLElement) => void;
};

const tokenHelp = (): Node => {
  const help = document.createDocumentFragment();
  const command = document.createElement("code");
  command.textContent = "release-tracker setup-token";
  help.append("Run ", command, " on the server to print it.");
  return help;
};

const createAccount = (panel: HTMLElement): void => {
  fill(panel, "username", "mika");
  fill(panel, "password", "lantern harbour quietly");
  submitForm(panel);
};

const SETUP_CARDS: Readonly<Record<string, SetupCard>> = {
  page: { token: { help: tokenHelp() }, offerPasskey: () => true },
  step: { heading: false },
  offer: { offerPasskey: () => true, then: createAccount },
  rule: {
    script: {
      setup: (r) =>
        r.password === "lantern harbour quietly"
          ? step("enrol", ["totp", "passkey"])
          : setupByWords(r),
    },
    then: createAccount,
  },
  token: {
    token: { help: tokenHelp(), value: "wrong" },
    then: createAccount,
  },
  host: {
    token: { help: "Paste it from the container log." },
    script: { setup: () => refusal(400, "auth_setup_token_required") },
    words: {
      auth_setup_token_required: (page) =>
        page.ipOrLocalhost
          ? "The setup token is in the container log."
          : `You opened Release tracker at ${page.hostname}, a name it does not trust yet. Paste the setup token from the container log, or add ${page.hostname} to allowed_hosts and restart it.`,
    },
    then: (panel) => {
      fill(panel, "token", "tok-1");
      createAccount(panel);
    },
  },
  plain: {
    script: {
      state: {
        ...SETUP,
        passkeys: false,
        secure: false,
        https_required: ["passkeys"],
        plain_session: { idle_seconds: 1800, absolute_seconds: 43200 },
        https_origin: "https://tracker.example",
      },
    },
  },
  strict: {
    script: {
      state: {
        ...SETUP,
        password_login: false,
        passkeys: false,
        secure: false,
        https_required: ["password", "setup", "passkeys"],
        https_origin: "https://tracker.example",
      },
    },
  },
};

for (const panel of document.querySelectorAll<HTMLElement>("[data-setup-demo]")) {
  const card = SETUP_CARDS[panel.dataset["setupDemo"] ?? ""];
  if (card === undefined) {
    continue;
  }
  const { script = {}, then, ...options } = card;
  const { client, access } = setupFake(script);
  mountSetup(panel, {
    app: "Release tracker",
    onDone: () => {
      toast({ title: "Account created: the app would open" });
    },
    onSetupComplete: () => {
      toast({ title: "Setup was done: the app would open sign-in" });
    },
    ...options,
    client,
    access,
  });
  if (then !== undefined) {
    whenShown(panel, then);
  }
}

interface InviteScript {
  readonly state?: StateResponse;
}

/** The invite answers, by what the person types. */
function inviteByWords(r: {
  readonly username: string;
  readonly password: string;
}): Result<PasswordAnswer> {
  if (r.username === "taken") {
    return refusal(409, "auth_username_taken");
  }
  switch (r.password) {
    case "common":
      return refusal(400, "auth_password_rejected", "common");
    case "used":
      return refusal(401, "auth_token_invalid");
    default:
      return { ok: true, data: SIGNED_IN };
  }
}

function inviteFake(
  script: InviteScript,
  accept = inviteByWords,
): { readonly client: InviteClient; readonly access: InviteAccess<InviteClient> } {
  const client: InviteClient = {
    async state() {
      await wait(300);
      return { ok: true, data: script.state ?? EVERY };
    },
    async inviteAcceptPassword(r) {
      await wait(700);
      return accept(r);
    },
    async inviteAcceptOIDC() {
      await wait(500);
      return { ok: true, data: { url: "#invite" } };
    },
    ...ENROL,
  };
  const access: InviteAccess<InviteClient> = {
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    storePasswordCredential: () => Promise.resolve(),
    takeFragmentToken: () => undefined,
    pendingPasskey: ceremony,
  };
  return { client, access };
}

type InviteCard = Omit<InviteOptions<InviteClient>, "client" | "access" | "app"> & {
  readonly script?: InviteScript;
  readonly accept?: typeof inviteByWords;
  readonly then?: (panel: HTMLElement) => void;
};

const INVITE_CARDS: Readonly<Record<string, InviteCard>> = {
  page: { token: "inv-1" },
  role: { token: "inv-1", roleFromProvider: true },
  only: { token: "inv-1", script: { state: { ...EVERY, sso: "only" } } },
  rule: {
    token: "inv-1",
    accept: () => step("enrol", ["totp", "passkey"]),
    then: (panel) => {
      fill(panel, "username", "noor");
      fill(panel, "password", "lantern harbour quietly");
      submitForm(panel);
    },
  },
  broken: {},
  "single-owner": {
    token: "inv-1",
    accept: () => refusal(403, "auth_forbidden", "single_owner"),
    then: (panel) => {
      fill(panel, "username", "noor");
      fill(panel, "password", "lantern harbour quietly");
      submitForm(panel);
    },
  },
  plain: {
    token: "inv-1",
    script: {
      state: { ...EVERY, passkeys: false, secure: false, https_origin: "https://tracker.example" },
    },
  },
};

for (const panel of document.querySelectorAll<HTMLElement>("[data-invite-demo]")) {
  const card = INVITE_CARDS[panel.dataset["inviteDemo"] ?? ""];
  if (card === undefined) {
    continue;
  }
  const { script = {}, accept, then, ...options } = card;
  const { client, access } = inviteFake(script, accept);
  mountInvite(panel, {
    app: "Release tracker",
    provider: "Authelia",
    navigate: () => {
      toast({ title: "The app would open Authelia" });
    },
    onSignedIn: () => {
      toast({ title: "Joined: the app would open" });
    },
    ...options,
    client,
    access,
  });
  if (then !== undefined) {
    whenShown(panel, then);
  }
}

for (const box of document.querySelectorAll<HTMLElement>("[data-qr-demo]")) {
  box.replaceChildren(qrCode(box.dataset["qrDemo"] ?? ""));
}

const HOLDS: MethodsView = {
  password: true,
  passkey_count: 1,
  oidc_linked: true,
  oidc_available: true,
  passkeys_available: true,
  password_login: true,
  locks: [],
};

interface StepUpScript {
  readonly methods: MethodsView;
  /** The refusal the action answers first. */
  readonly first: Refusal;
  /** A plain session: the server asks for a fresh sign-in. */
  readonly signInAgain?: boolean;
}

const STEP_UP: Readonly<Record<string, StepUpScript & { readonly reason: string }>> = {
  password: {
    methods: HOLDS,
    first: refusal(403, "auth_recent_auth_required"),
    reason: "Revoking a key needs a recent sign-in.",
  },
  code: {
    methods: {
      ...HOLDS,
      password_step_up: false,
      totp: { enrolled: true, usable: true, removable: true },
    },
    first: refusal(403, "auth_recent_auth_required"),
    reason: "Rotating a key needs a recent sign-in.",
  },
  passkey: {
    methods: { ...HOLDS, password: false, oidc_linked: false },
    first: refusal(403, "auth_recent_auth_required"),
    reason: "Removing your password needs a recent sign-in.",
  },
  plain: {
    methods: HOLDS,
    first: refusal(403, "auth_recent_auth_required", "sign_in_again"),
    signInAgain: true,
    reason: "Changing your password needs a recent sign-in.",
  },
};

/** A step-up's answers by what the person types, and `withStepUp` as
 *  `@cplieger/access` runs it, its passkey and provider steps faked. */
function stepUpFake(script: StepUpScript): {
  readonly client: StepUpClient;
  readonly access: StepUpAccess<StepUpClient>;
} {
  let passkeys = 0;
  const client: StepUpClient = {
    async me(): Promise<Result<MeView>> {
      await wait(200);
      return { ok: true, data: { user: { username: "mika" }, methods: script.methods } };
    },
    async loginPassword(r) {
      await wait(700);
      return r.password === "wrong"
        ? refusal(401, "auth_invalid_credentials")
        : { ok: true, data: SIGNED_IN };
    },
  };
  const password = async (value: string): Promise<Result<void>> => {
    await wait(700);
    switch (value) {
      case "wrong":
        return refusal(401, "auth_invalid_credentials");
      case "limit":
        return refusal(429, "auth_rate_limited", undefined, 30);
      default:
        return { ok: true, data: undefined };
    }
  };
  const code = async (value: string): Promise<Result<void>> => {
    await wait(700);
    switch (value) {
      case "111111":
        return refusal(401, "auth_code_invalid", "code_invalid");
      case "222222":
        return refusal(401, "auth_code_invalid", "code_reused");
      case "333333":
        return refusal(401, "auth_code_invalid", "method_locked");
      default:
        return { ok: true, data: undefined };
    }
  };
  const access: StepUpAccess<StepUpClient> = {
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    async withStepUp<T>(
      c: StepUpClient,
      action: () => Promise<Result<T>>,
      o: StepUpCallbacks,
    ): Promise<StepUpResult<T>> {
      const first = await action();
      if (first.ok) {
        return { kind: "done", result: first };
      }
      const retry = async (): Promise<StepUpResult<T>> => ({
        kind: "done",
        result: await action(),
      });
      if (script.signInAgain === true && o.signInAgain !== undefined) {
        return (await o.signInAgain()) ? retry() : { kind: "cancelled" };
      }
      const me = await c.me();
      if (!me.ok) {
        return { kind: "step-up-failed", error: me };
      }
      const choice = await o.prompt(me.data.methods);
      switch (choice) {
        case "cancel":
          return { kind: "cancelled" };
        case "password": {
          const value = await o.password();
          if (value === null) {
            return { kind: "cancelled" };
          }
          const res = await password(value);
          return res.ok ? retry() : { kind: "step-up-failed", error: res };
        }
        case "totp": {
          const value = (await o.code?.()) ?? null;
          if (value === null) {
            return { kind: "cancelled" };
          }
          const res = await code(value);
          return res.ok ? retry() : { kind: "step-up-failed", error: res };
        }
        case "passkey":
          await wait(900);
          passkeys += 1;
          return passkeys === 1 ? { kind: "step-up-failed", error: { kind: "timeout" } } : retry();
        case "oidc":
          await wait(400);
          toast({ title: "The page would leave for Authelia here" });
          return { kind: "cancelled" };
      }
    },
  };
  return { client, access };
}

for (const opener of document.querySelectorAll<HTMLButtonElement>("[data-step-up-demo]")) {
  const script = STEP_UP[opener.dataset["stepUpDemo"] ?? ""];
  if (script === undefined) {
    continue;
  }
  opener.addEventListener("click", () => {
    const { client, access } = stepUpFake(script);
    let sent = 0;
    void stepUp(
      async (): Promise<Result<string>> => {
        sent += 1;
        await wait(300);
        return sent === 1 ? script.first : { ok: true, data: "done" };
      },
      { client, access, reason: script.reason, provider: "Authelia", opener },
    ).then((answer) => {
      if (answer.kind === "done" && answer.result.ok) {
        toast({ title: "Confirmed: the action ran again" });
      } else if (answer.kind === "failed") {
        toast({ title: answer.words });
      }
    });
  });
}

interface Account {
  me: AccountView;
  passkeys: PasskeyView[];
  sessions: SessionView[];
  keys: KeyView[];
  /** The app offers authenticator apps. */
  readonly totp: boolean;
  readonly secure: boolean;
  /** The server rotates a key in place (access Part 2). */
  readonly rotates: boolean;
  /** The session's sign-in is old, so a key write asks to confirm it is you. */
  readonly stale: boolean;
}

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

/** This device, a phone the person named, and a session over plain HTTP. */
function sessionsOf(secure: boolean): SessionView[] {
  const session = (s: Partial<SessionView> & Pick<SessionView, "id">): SessionView => ({
    method: "passkey",
    created_at: ago(30 * 24 * HOUR),
    last_activity: ago(0),
    idle_deadline: later(0.5 * HOUR),
    absolute_deadline: later(12 * HOUR),
    current: false,
    secure: true,
    ...s,
  });
  return [
    session({
      id: "here",
      user_agent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
      last_ip: "192.0.2.10",
      current: true,
      secure,
      method: secure ? "passkey" : "password",
    }),
    session({
      id: "phone",
      label: "Mika's phone",
      user_agent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      last_ip: "198.51.100.23",
      last_activity: ago(2 * HOUR),
    }),
    session({
      id: "lan",
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      last_ip: "10.0.0.14",
      method: "password",
      last_activity: ago(26 * HOUR),
      idle_deadline: later(0.25 * HOUR),
      absolute_deadline: later(4 * HOUR),
      secure: false,
    }),
  ];
}

/** An active key, one rotated a moment ago, a key it minted, an expired
 *  key and one made before labels were required. */
function keysOf(): KeyView[] {
  const key = (k: Partial<KeyView> & Pick<KeyView, "id" | "label">): KeyView => ({
    prefix: "rt_exa",
    suffix: "nce",
    scopes: ["read"],
    created_at: ago(40 * 24 * HOUR),
    ...k,
  });
  return [
    key({
      id: 12,
      label: "backup script",
      last_used_at: ago(5 * HOUR),
      expires_at: later(50 * 24 * HOUR),
    }),
    key({
      id: 14,
      label: "ci",
      prefix: "rt_9fk",
      suffix: "q2Z",
      scopes: ["write", "users"],
      previous_until: later(0.7 * HOUR),
    }),
    key({
      id: 15,
      label: "ci deploy step",
      prefix: "rt_m3x",
      suffix: "7Lp",
      parent_key_id: 14,
      last_used_at: ago(HOUR),
    }),
    key({
      id: 9,
      label: "old laptop",
      prefix: "rt_k1d",
      suffix: "wQ8",
      expires_at: ago(11 * 24 * HOUR),
      last_used_at: ago(20 * 24 * HOUR),
    }),
    key({
      id: 3,
      label: "",
      prefix: "rt_a7c",
      suffix: "0nE",
      scopes: [],
      last_used_at: ago(90 * 24 * HOUR),
    }),
  ];
}

/** A tracker's access levels, in order, and one extra permission. */
const SCOPES: KeyScopes = {
  levels: [
    { value: "read", label: "Read", line: "See releases, checks and settings." },
    { value: "write", label: "Read and change", line: "Also start checks and change settings." },
    { value: "admin", label: "Administer", line: "Also manage people and the app's access." },
  ],
  permissions: [
    { value: "users", label: "Manage users", line: "Create, invite and reset people's sign-in." },
  ],
};

const HOUR = 3_600_000;
const later = (ms: number): string => new Date(Date.now() + ms).toISOString();

/** A person with every method, on an HTTPS session. */
function account(
  methods: Partial<MethodsView> = {},
  rest: Partial<Omit<AccountView, "methods">> = {},
  more: Partial<Omit<Account, "me">> = {},
): Account {
  return {
    me: {
      user: { id: 1, username: "mika", role: "admin", display_name: "Mika Laine" },
      methods: {
        ...HOLDS,
        passkey_count: 2,
        password_step_up: true,
        recovery_code: true,
        totp: { enrolled: true, since: "2026-11-03T10:00:00Z", usable: true, removable: true },
        ...methods,
      },
      can_link_oidc: true,
      sso_governed: false,
      session: {
        method: "passkey",
        auth_time: new Date().toISOString(),
        idle_deadline: later(0.5 * HOUR),
        absolute_deadline: later(12 * HOUR),
        secure: more.secure ?? true,
      },
      ...rest,
    },
    passkeys: [
      {
        id: 1,
        name: "Phone",
        created_at: "2026-09-14T10:00:00Z",
        last_used_at: new Date().toISOString(),
        backed_up: true,
        rp_id: location.hostname,
      },
      {
        id: 2,
        name: "Security key",
        created_at: "2026-03-02T10:00:00Z",
        last_used_at: "2026-10-30T18:00:00Z",
        backed_up: false,
        clone_warning: true,
        rp_id: location.hostname,
      },
    ].slice(0, methods.passkey_count ?? 2),
    sessions: more.sessions ?? sessionsOf(more.secure ?? true),
    keys: more.keys ?? keysOf(),
    totp: more.totp ?? true,
    secure: more.secure ?? true,
    rotates: more.rotates ?? true,
    stale: more.stale ?? false,
  };
}

const ACCOUNTS: Readonly<Record<string, () => Account>> = {
  every: () => account({}, {}, { stale: true }),
  "set-up": () =>
    account({ totp: { enrolled: false, usable: false, removable: false }, recovery_code: false }),
  proof: () => account({ second_factor_held: true }),
  plain: () =>
    account(
      { totp: { enrolled: false, usable: false, removable: false }, recovery_code: false },
      { session: { ...account().me.session, method: "password", secure: false } },
      { secure: false },
    ),
  locked: () => account({ locks: [{ method: "password", untrusted: true, trusted: false }] }),
  sso: () => account({}, { sso_only: true }),
  sessions: () => account(),
  keys: () => account(),
  "keys-none": () => account({}, {}, { keys: [] }),
  "keys-elsewhere": () => account({}, {}, { keys: keysOf().slice(0, 2) }),
  "keys-swap": () => account({}, {}, { keys: keysOf().slice(0, 1), rotates: false }),
  "plain-keys": () =>
    account(
      {},
      { session: { ...account().me.session, method: "password", secure: false } },
      { secure: false, keys: keysOf().slice(0, 2) },
    ),
  "first-passkey": () =>
    account({
      passkey_count: 0,
      totp: { enrolled: false, usable: false, removable: false },
      recovery_code: false,
    }),
  "passkey-only": () =>
    account(
      {
        password: false,
        passkey_count: 1,
        oidc_linked: false,
        totp: { enrolled: false, usable: false, removable: false },
        recovery_code: false,
      },
      { can_link_oidc: false },
    ),
};

/** The people the admin's log names. */
const PEOPLE = [
  { id: 1, username: "mika", display_name: "Mika Laine" },
  { id: 2, username: "alice" },
  { id: 3, username: "sam", display_name: "Sam Ortiz" },
];

const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

/** A month of a small app's log, oldest first: sign-ins, a key rotated, a
 *  lock from unknown devices and its re-enable, a recovery, the app's own
 *  kind, and an admin's work on alice. */
function logOf(): LogEntryView[] {
  const plan: (Omit<LogEntryView, "seq" | "at" | "occurred_at"> & { readonly hours: number })[] = [
    { hours: 700, class: "change", kind: "user_created", user_id: 1, role: "admin", actor: {} },
    {
      hours: 699,
      class: "session",
      kind: "signed_in",
      user_id: 1,
      method: "passkey",
      ip: "192.0.2.10",
      actor: { user_id: 1, user_agent: FIREFOX },
    },
    {
      hours: 650,
      class: "change",
      kind: "invite_issued",
      role: "user",
      ip: "192.0.2.10",
      actor: { user_id: 1, user_agent: FIREFOX },
    },
    {
      hours: 640,
      class: "change",
      kind: "user_created",
      user_id: 2,
      role: "user",
      ip: "198.51.100.40",
      actor: {},
    },
    {
      hours: 639,
      class: "session",
      kind: "signed_in",
      user_id: 2,
      method: "password",
      ip: "198.51.100.40",
      actor: { user_id: 2, user_agent: IPHONE },
    },
    {
      hours: 500,
      class: "change",
      kind: "key_minted",
      user_id: 1,
      key_id: 14,
      ip: "192.0.2.10",
      actor: { user_id: 1, label: "Desk", user_agent: FIREFOX },
    },
    {
      hours: 300,
      class: "change",
      kind: "totp_added",
      user_id: 2,
      ip: "198.51.100.40",
      actor: { user_id: 2, user_agent: IPHONE },
    },
    {
      hours: 200,
      class: "change",
      kind: "method_locked",
      user_id: 2,
      method: "password",
      trusted: false,
      actor: {},
    },
    {
      hours: 199,
      class: "change",
      kind: "temporary_password_set",
      user_id: 2,
      ip: "192.0.2.10",
      actor: { user_id: 1, label: "Desk", user_agent: FIREFOX },
    },
    {
      hours: 190,
      class: "session",
      kind: "temporary_password_used",
      user_id: 2,
      ip: "203.0.113.7",
      actor: { user_id: 2, user_agent: IPHONE },
    },
    {
      hours: 189,
      class: "change",
      kind: "password_set",
      user_id: 2,
      ip: "203.0.113.7",
      actor: { user_id: 2, user_agent: IPHONE },
    },
    {
      hours: 120,
      class: "change",
      kind: "release_tracker.public_url_changed",
      detail: "https://tracker.example",
      ip: "192.0.2.10",
      actor: { user_id: 1, user_agent: FIREFOX },
    },
    {
      hours: 60,
      class: "change",
      kind: "user_created",
      user_id: 3,
      role: "user",
      actor: { out_of_band: "admin socket" },
    },
    {
      hours: 30,
      class: "session",
      kind: "stepped_up",
      user_id: 1,
      method: "password",
      ip: "192.0.2.10",
      actor: { user_id: 1, user_agent: FIREFOX },
    },
    {
      hours: 29,
      class: "change",
      kind: "key_rotated",
      user_id: 1,
      key_id: 14,
      ip: "192.0.2.10",
      actor: { user_id: 1, user_agent: FIREFOX },
    },
    {
      hours: 5,
      class: "change",
      kind: "key_revoked",
      user_id: 1,
      key_id: 15,
      ip: "198.51.100.9",
      actor: { user_id: 1, key_id: 14, label: "ci", key_suffix: "q2Z" },
    },
    {
      hours: 2,
      class: "session",
      kind: "session_revoked",
      user_id: 1,
      session_ids: ["s9"],
      detail: "transport_changed",
      ip: "10.0.0.14",
      actor: {},
    },
    {
      hours: 1,
      class: "session",
      kind: "signed_in",
      user_id: 3,
      method: "oidc",
      ip: "198.51.100.23",
      actor: { user_id: 3, user_agent: IPHONE },
    },
  ];
  return plan.map(({ hours, ...e }, i) => ({
    ...e,
    seq: 100 + i * 3,
    at: ago(hours * HOUR),
    occurred_at: ago(hours * HOUR),
  }));
}

const LOG = logOf();

/** `adminSecurityLog` as access answers it over `log`. */
function logPage(
  log: readonly LogEntryView[],
  q: LogQuery = {},
  evicted = 0,
): Result<SecurityLogView> {
  const match = log.filter(
    (e) =>
      (q.kinds === undefined || q.kinds.length === 0 || q.kinds.includes(e.kind)) &&
      (q.user === undefined || e.user_id === q.user) &&
      (q.after === undefined || e.seq > q.after) &&
      (q.before === undefined || e.seq < q.before),
  );
  const ordered = q.oldestFirst === true ? match : [...match].reverse();
  const count = (c: string): number => log.filter((e) => e.class === c).length;
  return {
    ok: true,
    data: {
      entries: ordered.slice(0, q.limit ?? 50),
      classes: [
        { class: "change", count: count("change"), evicted },
        { class: "session", count: count("session"), evicted: 0 },
      ],
    },
  };
}

/** The app's words for its own kind. */
const APP_KINDS: LogKinds = {
  "release_tracker.public_url_changed": (e) => `Public address changed to ${e.detail ?? "another"}`,
};

/** A log client: each card's own entries, and a way to add one. */
function logClient(log: LogEntryView[], evicted = 0): LogClient & { add(): void } {
  return {
    adminSecurityLog: (q) => after(logPage(log, q, evicted), 400),
    adminUsers: () => after({ ok: true, data: PEOPLE }, 200),
    add() {
      const seq = Math.max(0, ...log.map((e) => e.seq)) + 1;
      const now = new Date().toISOString();
      log.push({
        seq,
        at: now,
        occurred_at: now,
        class: "session",
        kind: "signed_in",
        user_id: 2,
        method: "passkey",
        ip: "198.51.100.40",
        actor: { user_id: 2, user_agent: IPHONE },
      });
    },
  };
}

const after = async <T>(value: T, ms = 600): Promise<T> => {
  await wait(ms);
  return value;
};

for (const region of document.querySelectorAll<HTMLElement>("[data-log-demo]")) {
  const name = region.dataset["logDemo"] ?? "";
  const client =
    name === "empty"
      ? logClient([])
      : name === "evicted"
        ? logClient(logOf().slice(-6), 312)
        : logClient(logOf());
  const screen = mountSecurityLog(region, {
    client,
    level: 3,
    provider: "Authelia",
    viewer: 1,
    kinds: APP_KINDS,
    limit: name === "admin" ? 6 : 50,
    ...(name === "person" ? { user: 2 } : {}),
    ...(name === "admin" ? {} : { search: "", onQuery: () => undefined }),
    onSignedOut: () => {
      toast({ title: "Signed out: the app would open its sign-in page" });
    },
  });
  const more = region.parentElement?.querySelector<HTMLButtonElement>("[data-log-add]");
  more?.addEventListener("click", () => {
    client.add();
    void screen.refresh();
  });
}

type SecurityDemo = SecurityClient;

/** Account and security's answers on `a`, which each write changes, by
 *  what the person types: "wrong" for a wrong current password, 111111 for
 *  a wrong code, 222222 for a code already used. */
function securityFake(a: Account): {
  readonly client: SecurityDemo;
  readonly access: SecurityAccess<SecurityDemo>;
} {
  const done = { ok: true as const, data: undefined };
  let removals = 0;
  // On a stale session the first key write asks for a recent sign-in.
  let recent = !a.stale;
  const fresh = (): Refusal | undefined => {
    if (recent) {
      return undefined;
    }
    recent = true;
    return refusal(401, "auth_recent_auth_required");
  };
  const fold = (label: string): string => label.normalize("NFC").toLowerCase();
  const taken = (label: string, but?: number): boolean =>
    a.keys.some((k) => k.id !== but && fold(k.label) === fold(label));
  const secret = (): string =>
    `rt_${Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31] ?? "a").join("")}`;
  const minted = (id: number): number[] =>
    a.keys.filter((k) => k.parent_key_id === id).flatMap((k) => [k.id, ...minted(k.id)]);
  const byCode = (code: string): Refusal | undefined =>
    code === "111111"
      ? refusal(401, "auth_code_invalid", "code_invalid")
      : code === "222222"
        ? refusal(401, "auth_code_invalid", "code_reused")
        : undefined;
  const proofRefused = (proof?: SecondFactorProof): Refusal | undefined =>
    proof !== undefined && "code" in proof ? byCode(proof.code) : undefined;
  const methods = (m: Partial<MethodsView>): void => {
    a.me = { ...a.me, methods: { ...a.me.methods, ...m } };
  };
  const client: SecurityDemo = {
    state: () =>
      after({
        ok: true,
        data: {
          ...EVERY,
          totp: a.totp,
          secure: a.secure,
          ...(a.secure ? {} : { https_origin: "https://tracker.example" }),
        },
      }),
    me: () => after({ ok: true, data: a.me }, 300),
    async loginPassword(r) {
      await wait(500);
      return r.password === "wrong"
        ? refusal(401, "auth_invalid_credentials")
        : { ok: true, data: SIGNED_IN };
    },
    async updateProfile(r) {
      await wait(600);
      a.me = { ...a.me, user: { ...a.me.user, display_name: r.display_name } };
      return { ok: true, data: a.me };
    },
    async setPassword(r) {
      await wait(700);
      if (r.current_password === "wrong") {
        return refusal(401, "auth_invalid_credentials");
      }
      if (r.password.length < 15) {
        return refusal(400, "auth_password_rejected", "too_short");
      }
      const issues = a.me.methods.passkey_count > 0 && a.me.methods.recovery_code !== true;
      methods({ password: true, recovery_code: a.me.methods.recovery_code === true || issues });
      return { ok: true, data: issues ? { recovery_code: "H4NW6PTB7KQ2M9XR" } : {} };
    },
    async removePassword(r) {
      await wait(700);
      removals += 1;
      if (removals === 1) {
        return refusal(403, "auth_recent_auth_required");
      }
      if (r.current_password === "wrong") {
        return refusal(401, "auth_invalid_credentials");
      }
      methods({ password: false });
      return done;
    },
    passkeys: () => after({ ok: true, data: a.passkeys }, 300),
    async renamePasskey(id, r) {
      await wait(500);
      a.passkeys = a.passkeys.map((k) => (k.id === id ? { ...k, name: r.name } : k));
      return done;
    },
    async removePasskey(id, proof) {
      await wait(600);
      const no = proofRefused(proof);
      if (no !== undefined) {
        return no;
      }
      a.passkeys = a.passkeys.filter((k) => k.id !== id);
      methods({ passkey_count: a.passkeys.length });
      return done;
    },
    async reenableMethod(method) {
      await wait(500);
      methods({ locks: a.me.methods.locks.filter((l) => l.method !== method) });
      return done;
    },
    async oidcStartLink() {
      await wait(400);
      return { ok: true, data: { url: "#account-security" } };
    },
    async oidcUnlink() {
      await wait(500);
      methods({ oidc_linked: false });
      return done;
    },
    beginTOTP: () =>
      after({
        ok: true,
        data: {
          uri: "otpauth://totp/Release%20tracker:mika?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Release%20tracker",
          text: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
          ticket: "t1",
        },
      }),
    async finishTOTP(r) {
      await wait(700);
      const no =
        byCode(r.code) ?? (r.current_code === undefined ? undefined : byCode(r.current_code));
      if (no !== undefined) {
        return r.current_code !== undefined && byCode(r.code) === undefined
          ? refusal(401, "auth_code_invalid", "current_code_invalid")
          : no;
      }
      const first = a.me.methods.recovery_code !== true;
      methods({
        totp: { enrolled: true, since: new Date().toISOString(), usable: true, removable: true },
        recovery_code: true,
      });
      return { ok: true, data: first ? { recovery_code: "7KQ2M9XRTB4HNW6P" } : {} };
    },
    async removeTOTP(proof) {
      await wait(600);
      const no = proofRefused(proof);
      if (no !== undefined) {
        return no;
      }
      methods({ totp: { enrolled: false, usable: false, removable: false }, recovery_code: false });
      return done;
    },
    async regenerateRecoveryCode(proof) {
      await wait(600);
      return proofRefused(proof) ?? { ok: true, data: { recovery_code: "R3VD8KQ2PX7MTN4B" } };
    },
    sessions: () => after({ ok: true, data: a.sessions }, 300),
    async renameSession(id, r) {
      await wait(500);
      a.sessions = a.sessions.map((s) => (s.id === id ? { ...s, label: r.name } : s));
      return done;
    },
    async revokeSession(id) {
      await wait(500);
      a.sessions = a.sessions.filter((s) => s.id !== id);
      return done;
    },
    async revokeOtherSessions() {
      await wait(700);
      a.sessions = a.sessions.filter((s) => s.current);
      return done;
    },
    keys: () => after({ ok: true, data: a.keys }, 300),
    adminSecurityLog: (q) => after(logPage(LOG, q), 300),
    adminUsers: () => after({ ok: true, data: PEOPLE }, 200),
    async createKey(r) {
      await wait(700);
      const no = fresh();
      if (no !== undefined) {
        return no;
      }
      if (taken(r.label)) {
        return refusal(409, "auth_key_label_taken");
      }
      const key = secret();
      const details: KeyView = {
        id: Math.max(0, ...a.keys.map((k) => k.id)) + 1,
        label: r.label,
        prefix: key.slice(0, 6),
        suffix: key.slice(-3),
        scopes: r.scopes,
        created_at: new Date().toISOString(),
        ...(r.expires_in_days === undefined
          ? {}
          : { expires_at: later(r.expires_in_days * 24 * HOUR) }),
      };
      a.keys = [details, ...a.keys];
      return { ok: true, data: { key, details } };
    },
    async renameKey(id, r) {
      await wait(500);
      if (taken(r.name, id)) {
        return refusal(409, "auth_key_label_taken");
      }
      a.keys = a.keys.map((k) => (k.id === id ? { ...k, label: r.name } : k));
      return done;
    },
    ...(a.rotates
      ? {
          async rotateKey(
            id: number,
          ): Promise<Result<{ readonly key: string; readonly details: KeyView }>> {
            await wait(700);
            const no = fresh();
            if (no !== undefined) {
              return no;
            }
            const key = secret();
            let details: KeyView | undefined;
            a.keys = a.keys.map((k) => {
              if (k.id !== id) {
                return k;
              }
              const { last_used_at: _, ...rest } = k;
              details = {
                ...rest,
                prefix: key.slice(0, 6),
                suffix: key.slice(-3),
                previous_until: later(HOUR),
              };
              return details;
            });
            return details === undefined
              ? refusal(404, "auth_not_found")
              : { ok: true, data: { key, details } };
          },
        }
      : {}),
    async revokeKey(id) {
      await wait(600);
      const no = fresh();
      if (no !== undefined) {
        return no;
      }
      const gone = new Set([id, ...minted(id)]);
      a.keys = a.keys.filter((k) => !gone.has(k.id));
      return done;
    },
  };
  const access: SecurityAccess<SecurityDemo> = {
    ...stepUpFake({ methods: a.me.methods, first: refusal(403, "auth_recent_auth_required") })
      .access,
    async registerPasskey(_c, proof) {
      await wait(900);
      const no = proofRefused(proof);
      if (no !== undefined) {
        return { kind: "failed", error: no };
      }
      const held = a.me.methods;
      const issues =
        held.password &&
        held.passkey_count === 0 &&
        held.totp?.enrolled !== true &&
        held.recovery_code !== true;
      const id = Math.max(0, ...a.passkeys.map((k) => k.id)) + 1;
      a.passkeys = [
        ...a.passkeys,
        {
          id,
          name: `Passkey ${String(id)}`,
          created_at: new Date().toISOString(),
          backed_up: true,
          rp_id: location.hostname,
        },
      ];
      methods({
        passkey_count: a.passkeys.length,
        recovery_code: held.recovery_code === true || issues,
      });
      return issues
        ? { kind: "registered", recovery_code: "M9XRTB4HNW6P7KQ2" }
        : { kind: "registered" };
    },
    sendSignals: () => Promise.resolve(),
    storePasswordCredential: () => Promise.resolve(),
    readOIDCReturn: () => ({ kind: "none" }),
    passkeyProof: () => after({ kind: "proof", proof: { ceremony: "c1", assertion: {} } }, 900),
  };
  return { client, access };
}

/** The parts each card mounts: the method cards leave out sessions and
 *  keys, the sessions and keys cards leave out the methods. */
const METHOD_PARTS: readonly AccountPart[] = [
  "profile",
  "password",
  "passkeys",
  "second-factor",
  "single-sign-on",
];
const KEY_PARTS: readonly AccountPart[] = ["keys", "key-rotate"];
const SESSION_PARTS: readonly AccountPart[] = ["sessions", "session-rename"];

const CARD_OPTIONS: Readonly<Record<string, Partial<SecurityOptions<SecurityDemo>>>> = {
  every: {
    parts: [...METHOD_PARTS, ...SESSION_PARTS, ...KEY_PARTS, "security-log"],
    scopes: SCOPES,
    log: { kinds: APP_KINDS, limit: 5, onQuery: () => undefined },
  },
  sessions: { parts: SESSION_PARTS },
  keys: { parts: KEY_PARTS, scopes: SCOPES },
  "keys-none": { parts: KEY_PARTS, scopes: SCOPES },
  "keys-elsewhere": {
    parts: KEY_PARTS,
    keysCreatedElsewhere: {
      words: "An admin makes keys for you in Access.",
      href: "#account-keys",
    },
  },
  "keys-swap": { parts: KEY_PARTS },
  "plain-keys": { parts: [...SESSION_PARTS, ...KEY_PARTS], scopes: SCOPES },
};

for (const region of document.querySelectorAll<HTMLElement>("[data-security-demo]")) {
  const name = region.dataset["securityDemo"] ?? "";
  const make = ACCOUNTS[name];
  if (make === undefined) {
    continue;
  }
  const { client, access } = securityFake(make());
  mountSecurity(region, {
    parts: METHOD_PARTS,
    ...CARD_OPTIONS[name],
    client,
    access,
    app: "Release tracker",
    provider: "Authelia",
    level: 3,
    search: "",
    navigate: () => {
      toast({ title: "The page would leave for Authelia here" });
    },
    onSignedOut: () => {
      toast({ title: "Signed out: the app would open its sign-in page" });
    },
  });
}

/** The people of a small app: its owner, a person with an authenticator
 *  app, one linked to single sign-on whose local sign-in is dormant, and a
 *  registration waiting for approval. */
function peopleOf(): UserView[] {
  const at = "2026-10-01T10:00:00Z";
  return [
    {
      id: 1,
      username: "mika",
      display_name: "Mika Laine",
      role: "admin",
      enabled: true,
      oidc_linked: false,
      owner: true,
      created_at: at,
      methods: { password: true, passkey_count: 2, totp: true },
    },
    {
      id: 2,
      username: "alice",
      role: "user",
      enabled: true,
      oidc_linked: false,
      owner: false,
      created_at: at,
      methods: { password: true, passkey_count: 1, totp: true },
    },
    {
      id: 3,
      username: "sam",
      display_name: "Sam Ortiz",
      role: "admin",
      enabled: true,
      oidc_linked: true,
      owner: false,
      created_at: at,
      methods: {
        password: true,
        passkey_count: 0,
        role_from_provider: true,
        local_methods_dormant: true,
      },
    },
    {
      id: 4,
      username: "robin",
      role: "user",
      enabled: false,
      oidc_linked: false,
      owner: false,
      created_at: at,
      methods: { password: true, passkey_count: 0, waiting_approval: true },
    },
    {
      id: 5,
      username: "nightly-bot",
      role: "user",
      enabled: true,
      oidc_linked: false,
      owner: false,
      created_at: at,
      key_lineage: [12, 14],
      methods: { password: true, passkey_count: 0 },
    },
    {
      id: 6,
      username: "kai",
      role: "user",
      enabled: true,
      oidc_linked: false,
      owner: false,
      created_at: at,
      key_lineage: [12],
      methods: { password: false, passkey_count: 0 },
    },
  ];
}

/** Every account's keys: mika's provisioning key ci, the key it minted,
 *  alice's own, and the users each reached. */
function everyKeyOf(): KeyView[] {
  return [
    {
      id: 12,
      owner: "mika",
      label: "ci",
      prefix: "rt_ci3",
      suffix: "q2Z",
      scopes: ["manage_users"],
      created_at: ago(40 * 24 * HOUR),
      last_used_at: ago(2 * HOUR),
    },
    {
      id: 14,
      owner: "mika",
      label: "nightly",
      prefix: "rt_n8k",
      suffix: "Lw4",
      scopes: ["manage_users"],
      created_at: ago(10 * 24 * HOUR),
      expires_at: later(80 * 24 * HOUR),
      parent_key_id: 12,
    },
    {
      id: 21,
      owner: "alice",
      label: "backup script",
      prefix: "rt_b7a",
      suffix: "m0P",
      scopes: ["read"],
      created_at: ago(5 * 24 * HOUR),
      expires_at: later(85 * 24 * HOUR),
      last_used_at: ago(26 * HOUR),
    },
  ];
}

/** The waiting invites: one from a signed-in admin, one nightly issued. */
function tokensOf(): TokenView[] {
  return [
    {
      purpose: "invite",
      role: "user",
      created_at: ago(3 * HOUR),
      expires_at: later(6 * 24 * HOUR),
    },
    {
      purpose: "invite",
      role: "user",
      created_at: ago(HOUR),
      expires_at: later(2 * 24 * HOUR),
      issued_by_key: 14,
      issuer_lineage: [12, 14],
    },
  ];
}

/** The users list's answers, which each write changes; `viewer` is the
 *  signed-in admin, an owner unless `owner` is false. */
function usersFake(o: {
  readonly owner: boolean;
  readonly plain?: boolean;
  readonly sso?: SSOMode;
}): { readonly client: UsersClient; readonly access: StepUpAccess<UsersClient> } {
  let people = peopleOf();
  let keys = everyKeyOf();
  let tokens = tokensOf();
  let next = 7;
  const done = { ok: true as const, data: undefined };
  const find = (id: number): UserView | Refusal =>
    people.find((u) => u.id === id) ?? refusal(404, "auth_not_found");
  const change = (id: number, to: Partial<UserView>): Result<UserView> => {
    const u = find(id);
    if ("ok" in u) {
      return u;
    }
    const next = { ...u, ...to };
    people = people.map((p) => (p.id === id ? next : p));
    return { ok: true, data: next };
  };
  const issue = async (
    id: number,
    t: TemporaryPasswordOptions,
  ): Promise<Result<TemporaryPasswordResponse>> => {
    await wait(700);
    const u = find(id);
    if ("ok" in u) {
      return u;
    }
    const expires = later((t.ttl_hours ?? 24) * HOUR);
    const dormant = o.sso === "only" && u.owner !== true;
    change(id, {
      methods: {
        password: u.methods?.password ?? false,
        passkey_count: t.revoke_passkeys === true ? 0 : (u.methods?.passkey_count ?? 0),
        ...(dormant ? {} : { totp: false }),
        temporary_password: { expires_at: expires },
      },
    });
    return {
      ok: true,
      data: {
        password: "K7QM-2XRA-PL9D-4HVT",
        expires_at: expires,
        https_only: dormant,
        https_origin: "https://tracker.example",
        dormant,
        password_kept: dormant && (u.methods?.password ?? false),
      },
    };
  };
  const client: UsersClient = {
    async state() {
      await wait(150);
      return {
        ok: true,
        data: { ...EVERY, sso: o.sso ?? "alongside", secure: o.plain !== true },
      };
    },
    async me() {
      await wait(150);
      return {
        ok: true,
        data: {
          user: { id: 1, username: "mika", role: "admin" },
          methods: HOLDS,
          can_link_oidc: false,
          owner: o.owner,
          session: {
            id: "s1",
            method: "passkey",
            auth_time: ago(HOUR),
            idle_deadline: later(HOUR),
            absolute_deadline: later(8 * HOUR),
            secure: o.plain !== true,
          },
        },
      };
    },
    async loginPassword() {
      await wait(500);
      return { ok: true, data: SIGNED_IN };
    },
    async adminUsers(q) {
      await wait(400);
      const key = q?.key;
      return {
        ok: true,
        data: key === undefined ? people : people.filter((u) => u.key_lineage?.includes(key)),
      };
    },
    async adminCreateUser(r) {
      await wait(500);
      if (people.some((u) => u.username === r.username)) {
        return refusal(409, "auth_username_taken");
      }
      const u: UserView = {
        id: next++,
        username: r.username,
        role: r.role,
        enabled: true,
        oidc_linked: false,
        owner: false,
        created_at: new Date().toISOString(),
        methods: { password: false, passkey_count: 0 },
      };
      people = [...people, u];
      return { ok: true, data: u };
    },
    async adminInvite(r) {
      await wait(500);
      const expires = later((r.hours ?? 168) * HOUR);
      tokens = [
        ...tokens,
        {
          purpose: "invite",
          role: r.role,
          created_at: new Date().toISOString(),
          expires_at: expires,
        },
      ];
      return { ok: true, data: { token: "inv_Q4mT9xVb2LcR7pWz", expires_at: expires } };
    },
    async adminTokens() {
      await wait(300);
      return { ok: true, data: tokens };
    },
    async adminKeys() {
      await wait(300);
      return { ok: true, data: keys };
    },
    async adminRevokeKey(id) {
      await wait(600);
      const gone = new Set([id]);
      for (const k of keys) {
        if (k.parent_key_id !== undefined && gone.has(k.parent_key_id)) {
          gone.add(k.id);
        }
      }
      keys = keys.filter((k) => !gone.has(k.id));
      tokens = tokens.filter((t) => !(t.issuer_lineage ?? []).some((k) => gone.has(k)));
      return done;
    },
    async adminUpdateUser(id, r) {
      await wait(600);
      const u = find(id);
      if (!("ok" in u) && u.owner === true && r.role === "user") {
        return refusal(403, "auth_forbidden", "owner_role");
      }
      return change(id, {
        ...(r.role === undefined ? {} : { role: r.role }),
        ...(r.enabled === undefined
          ? {}
          : {
              enabled: r.enabled,
              ...(!("ok" in u) && u.methods !== undefined
                ? { methods: { ...u.methods, waiting_approval: false } }
                : {}),
            }),
      });
    },
    async adminDeleteUser(id) {
      await wait(600);
      people = people.filter((u) => u.id !== id);
      return done;
    },
    adminTemporaryPassword: issue,
    async adminResetSecondFactor(id) {
      await wait(600);
      const u = find(id);
      if ("ok" in u) {
        return u;
      }
      change(id, { methods: { password: false, passkey_count: 0, ...u.methods, totp: false } });
      return done;
    },
    async adminSetOwner(id, r) {
      await wait(600);
      if (!r.owner && people.filter((u) => u.owner === true).length === 1) {
        return refusal(403, "auth_forbidden", "last_owner");
      }
      return change(id, { owner: r.owner });
    },
    async adminUnlinkOIDC(id) {
      await wait(600);
      const u = find(id);
      if ("ok" in u) {
        return u;
      }
      change(id, {
        oidc_linked: false,
        methods: { password: false, passkey_count: 0, ...u.methods, local_methods_dormant: false },
      });
      return done;
    },
    async adminRelinkOIDC(id, t) {
      change(id, { oidc_linked: false });
      return issue(id, t);
    },
  };
  const access: StepUpAccess<UsersClient> = {
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    async withStepUp(_c, action) {
      return { kind: "done", result: await action() };
    },
  };
  return { client, access };
}

for (const region of document.querySelectorAll<HTMLElement>("[data-users-demo]")) {
  const name = region.dataset["usersDemo"] ?? "";
  const { client, access } = usersFake({
    owner: name !== "admin",
    plain: name === "plain",
    ...(name === "sso-only" ? { sso: "only" as const } : {}),
  });
  mountUsers(region, {
    client,
    access,
    app: "Release tracker",
    provider: "Authelia",
    level: 3,
    // The gallery's address stays the page's: a filter shows in place.
    search: name === "reached" ? "?key=12" : "",
    onQuery: () => undefined,
    onSignedOut: () => {
      toast({ title: "Signed out: the app would open its sign-in page" });
    },
  });
}

/** What each mode would change in the gallery's app, by the mode the
 *  page holds now. */
function readinessOf(from: SSOMode, to: SSOMode, blocked: boolean): Readiness {
  const none = {
    locked_out: 0,
    methods_made_dormant: 0,
    methods_restored: 0,
    temporary_passwords_withdrawn: 0,
  };
  if (blocked && to !== "alongside") {
    return { ...none, refusal: { code: "auth_oidc_unavailable" } };
  }
  const strict = { alongside: 0, for_linked: 1, only: 2 } as const;
  if (strict[to] < strict[from]) {
    return { ...none, methods_restored: 5 };
  }
  return to === "only"
    ? {
        locked_out: 3,
        methods_made_dormant: 5,
        methods_restored: 0,
        temporary_passwords_withdrawn: 2,
      }
    : none;
}

function settingsFake(o: { readonly plain: boolean; readonly blocked: boolean }): {
  readonly client: AccessSettingsClient;
  readonly access: StepUpAccess<AccessSettingsClient>;
} {
  let mode: SSOMode = "alongside";
  const client: AccessSettingsClient = {
    async state() {
      await wait(150);
      return {
        ok: true,
        data: {
          ...EVERY,
          oidc: !o.blocked && !o.plain,
          secure: !o.plain,
          https_origin: "https://tracker.example",
          sso: mode,
        },
      };
    },
    async me() {
      await wait(150);
      return {
        ok: true,
        data: {
          user: { id: 1, username: "mika", role: "admin" },
          methods: HOLDS,
          can_link_oidc: false,
          owner: true,
          single_user: false,
          session: {
            id: "s1",
            method: "passkey",
            auth_time: ago(HOUR),
            idle_deadline: later(HOUR),
            absolute_deadline: later(8 * HOUR),
            secure: !o.plain,
          },
        },
      };
    },
    async loginPassword() {
      await wait(500);
      return { ok: true, data: SIGNED_IN };
    },
    async adminSSOReadiness(to) {
      await wait(500);
      return { ok: true, data: readinessOf(mode, to, o.blocked) };
    },
    async adminApplySSO(to) {
      await wait(700);
      mode = to;
      return { ok: true, data: undefined };
    },
  };
  const access: StepUpAccess<AccessSettingsClient> = {
    passkeySupport: () => Promise.resolve({ webauthn: true, conditional: false }),
    async withStepUp(_c, action) {
      return { kind: "done", result: await action() };
    },
  };
  return { client, access };
}

for (const region of document.querySelectorAll<HTMLElement>("[data-access-settings-demo]")) {
  const name = region.dataset["accessSettingsDemo"] ?? "";
  const { client, access } = settingsFake({ plain: name === "plain", blocked: name === "blocked" });
  mountAccessSettings(region, {
    client,
    access,
    app: "Release tracker",
    provider: "Authelia",
    level: 3,
    onSignedOut: () => {
      toast({ title: "Signed out: the app would open its sign-in page" });
    },
  });
}

for (const form of document.querySelectorAll<HTMLFormElement>("[data-second-factor-demo]")) {
  for (const node of form.querySelectorAll<HTMLElement>("[data-account-word]")) {
    const word = defaultAccountWords[node.dataset["accountWord"] as keyof AccountWords];
    if (typeof word === "string") {
      node.textContent = word;
    }
  }
  const totp = form.querySelector<HTMLInputElement>("[name='totp']");
  const rule = form.querySelector<HTMLInputElement>("[name='require_second_factor']");
  if (totp === null || rule === null) {
    continue;
  }
  form.addEventListener("change", () => {
    clearError(rule);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!rule.checked) {
      toast({ title: "Saved" });
      return;
    }
    // The app's own check runs first; then its save meets access's.
    showError(
      rule,
      totp.checked
        ? defaultAccountWords["auth_second_factor_required.enable_without_second_factor"]
        : defaultAccountWords["settings.noWayToEnrol"],
    );
    rule.focus();
  });
}

// Each card mounts its own copy of a screen, so the page holds many regions
// named "Sign in" or "API keys" and many log pagers; the card's own heading
// leads each name, as a page with one screen never needs.
let cardNames = 0;
function nameByCard(section: Element): void {
  const card = section.closest(".card");
  const own = card?.querySelector(":scope > h2");
  const by = section.getAttribute("aria-labelledby");
  if (own === null || own === undefined || by === null) {
    return;
  }
  if (own.id === "") {
    cardNames += 1;
    own.id = `account-card-${String(cardNames)}`;
  }
  if (!by.split(" ").includes(own.id)) {
    section.setAttribute("aria-labelledby", `${own.id} ${by}`);
  }
}
const named = (): void => {
  for (const section of document.querySelectorAll(".card section[aria-labelledby]")) {
    nameByCard(section);
  }
  for (const nav of document.querySelectorAll(".card nav[aria-label]")) {
    const card = nav.closest(".card")?.querySelector(":scope > h2")?.textContent ?? "";
    const label = nav.getAttribute("aria-label") ?? "";
    if (card !== "" && !label.startsWith(`${card}: `)) {
      nav.setAttribute("aria-label", `${card}: ${label}`);
    }
  }
};
named();
new MutationObserver(named).observe(document.body, {
  subtree: true,
  childList: true,
  attributeFilter: ["aria-labelledby", "aria-label"],
});
