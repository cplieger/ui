/**
 * account.ts — the gallery's wiring for the account screens: each card's
 * screen runs on a fake client and access module that answer as the server
 * would, and a card that shows one state drives the screen into it.
 */

import {
  mountSetup,
  mountSignIn,
  type Refusal,
  type RegisterOutcome,
  type Result,
  type SetupAccess,
  type SetupClient,
  type SetupOptions,
  type SignInAccess,
  type SignInClient,
  type SignInOptions,
  type SignInOutcome,
  type SignedIn,
  type StateResponse,
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
