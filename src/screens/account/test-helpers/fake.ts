/**
 * fake.ts — a fake `@cplieger/access` client and module for the account
 * screens' tests: each call is recorded with its arguments, and answers the
 * next of the answers queued for it, else its default.
 */

import type {
  OIDCReturn,
  Refusal,
  Result,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  SignedIn,
  StateResponse,
} from "../client.js";

export interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

const everyMethod: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
};

export const signedIn: SignedIn = { user: { username: "mika" } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/** A refusal with `code`, its `reason` in the body, and `headers`. */
export function refuse(
  status: number,
  code?: string,
  reason?: string,
  headers?: Record<string, string>,
): Refusal {
  return {
    ok: false,
    status,
    error: code ?? "refused",
    ...(code === undefined ? {} : { code }),
    ...(reason === undefined ? {} : { body: { code, reason } }),
    ...(headers === undefined ? {} : { headers: new Headers(headers) }),
  };
}

export const noAnswer: Refusal = { ok: false, status: 0, error: "network", code: "network" };

type Answer = unknown;

export type FakeClient = SignInClient & { readonly prefix: string; readonly oidcPrefix: string };

export class Fake {
  readonly calls: Call[] = [];
  readonly prefix = "/api/auth";
  readonly oidcPrefix = "/api/auth/oidc";
  readonly #queued = new Map<string, Answer[]>();
  readonly #defaults = new Map<string, Answer>([
    ["state", ok(everyMethod)],
    ["loginPassword", ok(signedIn)],
    ["signInWithPasskey", { kind: "signed-in", result: signedIn }],
    ["passkeySupport", { webauthn: true, conditional: false }],
  ]);
  readonly #gates = new Map<string, Promise<void>>();

  /** Queues `answers` for `name`, one per call; each is a value, or a
   *  function of the call's arguments. */
  answer(name: string, ...answers: Answer[]): this {
    this.#queued.set(name, [...(this.#queued.get(name) ?? []), ...answers]);
    return this;
  }

  /** Every later call of `name` waits until the returned release runs. */
  hold(name: string): () => void {
    let release = (): void => undefined;
    this.#gates.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      this.#gates.delete(name);
      release();
    };
  }

  named(name: string): Call[] {
    return this.calls.filter((c) => c.name === name);
  }

  async call(name: string, args: readonly unknown[]): Promise<Answer> {
    this.calls.push({ name, args });
    await this.#gates.get(name);
    const queue = this.#queued.get(name);
    const next = queue !== undefined && queue.length > 0 ? queue.shift() : this.#defaults.get(name);
    return typeof next === "function"
      ? (next as (...a: readonly unknown[]) => Answer)(...args)
      : next;
  }

  /** The client, as the screens type it. */
  get client(): FakeClient {
    const call = <T>(name: string, args: readonly unknown[]): Promise<T> =>
      this.call(name, args) as Promise<T>;
    return {
      prefix: this.prefix,
      oidcPrefix: this.oidcPrefix,
      state: () => call<Result<StateResponse>>("state", []),
      loginPassword: (r) => call<Result<SignedIn>>("loginPassword", [r]),
    };
  }

  /** The access module, as the screens type it. */
  access(): SignInAccess<FakeClient> {
    const call = <T>(name: string, args: readonly unknown[]): Promise<T> =>
      this.call(name, args) as Promise<T>;
    return {
      signInWithPasskey: (c, o) => call<SignInOutcome>("signInWithPasskey", [c, o]),
      passkeySupport: () =>
        call<{ readonly webauthn: boolean; readonly conditional: boolean }>("passkeySupport", []),
      storePasswordCredential: async (username, password) => {
        await call("storePasswordCredential", [username, password]);
      },
      readOIDCReturn: readReturn,
      oidcSignInURL: (c, redirect) =>
        `${c.oidcPrefix}/start/signin${redirect === undefined ? "" : `?${new URLSearchParams({ redirect }).toString()}`}`,
    };
  }
}

/** `@cplieger/access`'s `readOIDCReturn`, as it reads the address. */
function readReturn(search: string): OIDCReturn {
  const q = new URLSearchParams(search);
  const errors = q.getAll("auth_error");
  if (errors.length > 0) {
    return { kind: "error", code: errors.length === 1 ? errors[0] : undefined };
  }
  const marker = q.getAll("oidc");
  switch (marker.length === 1 ? marker[0] : undefined) {
    case "not_linked":
      return { kind: "not_linked" };
    case "linked":
      return { kind: "linked" };
    case "stepped_up":
      return { kind: "stepped_up" };
    default:
      return { kind: "none" };
  }
}
