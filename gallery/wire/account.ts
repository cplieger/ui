/**
 * account.ts — the gallery's wiring for the account screens: each card's
 * screen runs on a fake client and access module that answer as the server
 * would, and a card that shows one state drives the screen into it.
 */

import {
  mountSecurity,
  mountSetup,
  mountSignIn,
  stepUp,
  type AccountView,
  type MeView,
  type MethodsView,
  type Refusal,
  type RegisterOutcome,
  type PasskeyView,
  type Result,
  type SecondFactorProof,
  type SecurityAccess,
  type SecurityClient,
  type SetupAccess,
  type SetupClient,
  type SetupOptions,
  type SignInAccess,
  type SignInClient,
  type SignInOptions,
  type SignInOutcome,
  type SignedIn,
  type StateResponse,
  type StepUpAccess,
  type StepUpCallbacks,
  type StepUpClient,
  type StepUpResult,
} from "@cplieger/ui/account";
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
  }) => Result<SignedIn>;
  readonly passkeys?: readonly SignInOutcome[];
}

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
}): Result<SignedIn> {
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
  /** The app offers authenticator apps. */
  readonly totp: boolean;
  readonly secure: boolean;
}

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
      user: { username: "mika", display_name: "Mika Laine" },
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
    totp: more.totp ?? true,
    secure: more.secure ?? true,
  };
}

const ACCOUNTS: Readonly<Record<string, () => Account>> = {
  every: () => account(),
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
  const after = async <T>(value: T, ms = 600): Promise<T> => {
    await wait(ms);
    return value;
  };
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
      methods({ password: true });
      return done;
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
      methods({ passkey_count: a.passkeys.length });
      return { kind: "registered" };
    },
    sendSignals: () => Promise.resolve(),
    storePasswordCredential: () => Promise.resolve(),
    readOIDCReturn: () => ({ kind: "none" }),
    passkeyProof: () => after({ kind: "proof", proof: { ceremony: "c1", assertion: {} } }, 900),
  };
  return { client, access };
}

for (const region of document.querySelectorAll<HTMLElement>("[data-security-demo]")) {
  const make = ACCOUNTS[region.dataset["securityDemo"] ?? ""];
  if (make === undefined) {
    continue;
  }
  const { client, access } = securityFake(make());
  mountSecurity(region, {
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
