/**
 * account.ts — the gallery's wiring for the account screens: each card's
 * screen runs on a fake client and access module that answer as the server
 * would, and a card that shows one state drives the screen into it.
 */

import {
  mountSignIn,
  type Refusal,
  type Result,
  type SignInAccess,
  type SignInClient,
  type SignInOptions,
  type SignInOutcome,
  type SignedIn,
  type StateResponse,
} from "@cplieger/ui/account";
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
    // Each state is driven once its card is in view, so the focus it moves
    // never scrolls the page.
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
}
