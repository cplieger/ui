/**
 * fake.ts — a fake `@cplieger/access` client and module for the account
 * screens' tests: each call is recorded with its arguments, and answers the
 * next of the answers queued for it, else its default.
 */

import { codeOf, reasonOf } from "../answer.js";
import type {
  AccountView,
  KeyCreated,
  KeyView,
  MethodsView,
  OIDCReturn,
  PasskeyMiss,
  PasskeyView,
  PasswordAnswer,
  PendingPasskeyOutcome,
  PersonView,
  ProofOutcome,
  Refusal,
  RegisterOutcome,
  Result,
  SecondFactorProof,
  SecurityAccess,
  SecurityClient,
  SecurityLogView,
  SessionView,
  SetupAccess,
  SetupClient,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  PasskeySignInOutcome,
  SignedIn,
  StateResponse,
  StepUpAccess,
  StepUpClient,
  StepUpResult,
  TotpBegin,
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

/** A person holding a password and a passkey, on an app with every method
 *  on, before access Part 4. */
const holdsAll: MethodsView = {
  password: true,
  passkey_count: 1,
  oidc_linked: true,
  oidc_available: true,
  passkeys_available: true,
  password_login: true,
  locks: [],
};

/** An HTTPS session signed in with a passkey, ending in hours. */
export const SESSION = {
  id: "s1",
  method: "passkey",
  auth_time: "2026-11-14T09:00:00Z",
  idle_deadline: "2099-01-01T12:00:00Z",
  absolute_deadline: "2099-01-01T18:00:00Z",
  secure: true,
} as const;

export function meWith(
  methods: Partial<MethodsView> = {},
  rest: Partial<Omit<AccountView, "methods">> = {},
): AccountView {
  return {
    user: { id: 1, username: "mika", role: "admin" },
    methods: { ...holdsAll, ...methods },
    can_link_oidc: false,
    sso_governed: false,
    session: SESSION,
    ...rest,
  };
}

/** This device's session in the Sessions list. */
export const HERE: SessionView = {
  id: "s1",
  user_agent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  last_ip: "192.0.2.10",
  method: "passkey",
  created_at: "2026-11-14T09:00:00Z",
  last_activity: "2026-11-14T09:30:00Z",
  idle_deadline: "2099-01-01T12:00:00Z",
  absolute_deadline: "2099-01-01T18:00:00Z",
  current: true,
  secure: true,
};

/** An active API key with no expiry. */
export const BACKUP: KeyView = {
  id: 12,
  label: "backup script",
  prefix: "rt_exa",
  suffix: "nce",
  scopes: ["read"],
  created_at: "2026-10-01T10:00:00Z",
  last_used_at: "2026-11-13T03:00:00Z",
};

export const PHONE: PasskeyView = {
  id: 7,
  name: "Phone",
  created_at: "2026-09-14T10:00:00Z",
  last_used_at: "2026-11-08T16:41:00Z",
  backed_up: true,
  rp_id: "localhost",
};

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

/** The step-up calls `withStepUp` makes on the client it is given. */
interface StepUpCalls {
  stepUpPassword(r: { readonly password: string }): Promise<Result<void>>;
  stepUpCode(code: string): Promise<Result<void>>;
  stepUpPasskeyBegin(): Promise<Result<{ readonly ceremony: string }>>;
  stepUpPasskeyFinish(ceremony: string, credential: unknown): Promise<Result<void>>;
  oidcStartStepUp(r: { readonly redirect?: string }): Promise<Result<{ readonly url: string }>>;
}

export type FakeClient = SignInClient &
  SetupClient &
  StepUpClient &
  SecurityClient &
  StepUpCalls & { readonly prefix: string; readonly oidcPrefix: string };

export class Fake {
  readonly calls: Call[] = [];
  readonly prefix = "/api/auth";
  readonly oidcPrefix = "/api/auth/oidc";
  /** What `takeFragmentToken` answers. */
  fragment: string | undefined;
  readonly #queued = new Map<string, Answer[]>();
  readonly #defaults = new Map<string, Answer>([
    ["state", ok(everyMethod)],
    ["loginPassword", ok(signedIn)],
    ["setupPassword", ok(signedIn)],
    ["setupWithPasskey", { kind: "signed-in", result: signedIn }],
    ["registerPasskey", { kind: "registered" }],
    ["signInWithPasskey", { kind: "signed-in", result: signedIn }],
    ["passkeySupport", { webauthn: true, conditional: false }],
    ["me", ok(meWith())],
    ["stepUpPassword", ok(undefined)],
    ["stepUpCode", ok(undefined)],
    ["stepUpPasskeyBegin", ok({ ceremony: "cer-1" })],
    ["passkeyAssertion", { kind: "credential" }],
    ["stepUpPasskeyFinish", ok(undefined)],
    ["oidcStartStepUp", ok({ url: "https://id.example/authorize?state=s1" })],
    [
      "updateProfile",
      (r: { readonly display_name: string }) =>
        ok(
          meWith(
            {},
            { user: { id: 1, username: "mika", role: "admin", display_name: r.display_name } },
          ),
        ),
    ],
    ["setPassword", ok(undefined)],
    ["removePassword", ok(undefined)],
    ["passkeys", ok([PHONE])],
    ["renamePasskey", ok(undefined)],
    ["removePasskey", ok(undefined)],
    ["reenableMethod", ok(undefined)],
    ["oidcStartLink", ok({ url: "https://id.example/authorize?state=link" })],
    ["oidcUnlink", ok(undefined)],
    [
      "beginTOTP",
      ok({
        uri: "otpauth://totp/App:mika?secret=JBSWY3DPEHPK3PXP&issuer=App",
        text: "JBSWY3DPEHPK3PXP",
        ticket: "t1",
      }),
    ],
    ["finishTOTP", ok({ recovery_code: "ABCD2345EFGH6789" })],
    ["removeTOTP", ok(undefined)],
    ["regenerateRecoveryCode", ok({ recovery_code: "WXYZ2345EFGH6789" })],
    ["sendSignals", undefined],
    ["passkeyProof", { kind: "proof", proof: { ceremony: "cer-2", assertion: {} } }],
    ["sessions", ok([HERE])],
    ["renameSession", ok(undefined)],
    ["revokeSession", ok(undefined)],
    ["revokeOtherSessions", ok(undefined)],
    ["keys", ok([])],
    [
      "createKey",
      (r: { readonly label: string; readonly scopes: readonly string[] }) =>
        ok({
          key: "rt_example_new_secret",
          details: { ...BACKUP, id: 20, label: r.label, scopes: r.scopes, prefix: "rt_new" },
        }),
    ],
    ["renameKey", ok(undefined)],
    [
      "rotateKey",
      (id: number) =>
        ok({
          key: "rt_example_rotated",
          details: { ...BACKUP, id, previous_until: "2099-01-01T14:32:00Z" },
        }),
    ],
    ["revokeKey", ok(undefined)],
    ["adminSecurityLog", ok({ entries: [], classes: [] })],
    ["loginCode", ok({ signed_in: signedIn })],
    ["loginRecoveryCode", ok({ signed_in: signedIn })],
    ["loginSetPassword", ok({ signed_in: signedIn })],
    [
      "pendingTOTPBegin",
      ok({
        uri: "otpauth://totp/App:mika?secret=JBSWY3DPEHPK3PXP&issuer=App",
        text: "JBSWY3DPEHPK3PXP",
      }),
    ],
    ["pendingTOTPFinish", ok({ signed_in: signedIn })],
    ["loginSecondPasskey", { kind: "answered", answer: { signed_in: signedIn } }],
    ["loginSetPasskey", { kind: "answered", answer: { signed_in: signedIn } }],
    ["pendingPasskey", { kind: "answered", answer: { signed_in: signedIn } }],
    ["adminUsers", ok([])],
  ]);
  /** Calls the client leaves out, as a server before access Part 2. */
  readonly #without = new Set<string>();
  readonly #gates = new Map<string, Promise<void>>();

  /** Queues `answers` for `name`, one per call; each is a value, or a
   *  function of the call's arguments. */
  answer(name: string, ...answers: Answer[]): this {
    this.#queued.set(name, [...(this.#queued.get(name) ?? []), ...answers]);
    return this;
  }

  /** Makes `answer` the default of `name`, for every call no queued
   *  answer takes. */
  always(name: string, answer: Answer): this {
    this.#defaults.set(name, answer);
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

  /** Leaves `names` out of the client and the access module. */
  without(...names: string[]): this {
    for (const n of names) {
      this.#without.add(n);
    }
    return this;
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

  /** `@cplieger/access`'s `withStepUp` as dev.13 runs it, with access
   *  Part 4's code; the passkey's browser step answers `passkeyAssertion`. */
  async #withStepUp<T>(
    c: FakeClient,
    action: () => Promise<Result<T>>,
    o: Parameters<StepUpAccess<FakeClient>["withStepUp"]>[2],
  ): Promise<StepUpResult<T>> {
    this.calls.push({ name: "withStepUp", args: [] });
    const first = await action();
    if (first.ok || codeOf(first) !== "auth_recent_auth_required") {
      return { kind: "done", result: first };
    }
    const retry = async (): Promise<StepUpResult<T>> => ({ kind: "done", result: await action() });
    const reason = reasonOf(first);
    if (reason === "sign_in_again" && o.signInAgain !== undefined) {
      return (await o.signInAgain()) ? retry() : { kind: "cancelled" };
    }
    if (reason !== undefined) {
      return { kind: "done", result: first };
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
        const password = await o.password();
        if (password === null) {
          return { kind: "cancelled" };
        }
        const res = await c.stepUpPassword({ password });
        return res.ok ? retry() : { kind: "step-up-failed", error: res };
      }
      case "totp": {
        const code = (await o.code?.()) ?? null;
        if (code === null) {
          return { kind: "cancelled" };
        }
        const res = await c.stepUpCode(code);
        return res.ok ? retry() : { kind: "step-up-failed", error: res };
      }
      case "passkey": {
        const begin = await c.stepUpPasskeyBegin();
        if (!begin.ok) {
          return { kind: "step-up-failed", error: { kind: "failed", error: begin } };
        }
        const got = (await this.call("passkeyAssertion", [])) as
          { readonly kind: "credential" } | PasskeyMiss;
        if (got.kind === "cancelled") {
          return { kind: "cancelled" };
        }
        if (got.kind !== "credential") {
          return { kind: "step-up-failed", error: got };
        }
        const res = await c.stepUpPasskeyFinish(begin.data.ceremony, {});
        return res.ok ? retry() : { kind: "step-up-failed", error: { kind: "failed", error: res } };
      }
      case "oidc": {
        const res = await c.oidcStartStepUp(
          o.redirect === undefined ? {} : { redirect: o.redirect },
        );
        if (!res.ok) {
          return { kind: "step-up-failed", error: res };
        }
        o.navigate?.(res.data.url);
        return { kind: "redirecting" };
      }
    }
  }

  /** The client, as the screens type it. */
  get client(): FakeClient {
    const call = <T>(name: string, args: readonly unknown[]): Promise<T> =>
      this.call(name, args) as Promise<T>;
    const client: FakeClient = {
      prefix: this.prefix,
      oidcPrefix: this.oidcPrefix,
      state: () => call<Result<StateResponse>>("state", []),
      loginPassword: (r) => call<Result<PasswordAnswer>>("loginPassword", [r]),
      loginCode: (ticket, code) => call<Result<SignInOutcome>>("loginCode", [ticket, code]),
      loginRecoveryCode: (ticket, code) =>
        call<Result<SignInOutcome>>("loginRecoveryCode", [ticket, code]),
      loginSetPassword: (ticket, password) =>
        call<Result<SignInOutcome>>("loginSetPassword", [ticket, password]),
      pendingTOTPBegin: (ticket) =>
        call<Result<{ readonly uri: string; readonly text: string }>>("pendingTOTPBegin", [ticket]),
      pendingTOTPFinish: (ticket, code) =>
        call<Result<{ readonly signed_in: SignedIn }>>("pendingTOTPFinish", [ticket, code]),
      setupPassword: (r) => call<Result<SignedIn>>("setupPassword", [r]),
      me: () => call<Result<AccountView>>("me", []),
      updateProfile: (r) => call<Result<AccountView>>("updateProfile", [r]),
      setPassword: (r) => call<Result<void>>("setPassword", [r]),
      removePassword: (r) => call<Result<void>>("removePassword", [r]),
      passkeys: () => call<Result<readonly PasskeyView[]>>("passkeys", []),
      renamePasskey: (id, r) => call<Result<void>>("renamePasskey", [id, r]),
      removePasskey: (id, proof?: SecondFactorProof) =>
        call<Result<void>>("removePasskey", proof === undefined ? [id] : [id, proof]),
      reenableMethod: (method) => call<Result<void>>("reenableMethod", [method]),
      oidcStartLink: (r) => call<Result<{ readonly url: string }>>("oidcStartLink", [r]),
      oidcUnlink: () => call<Result<void>>("oidcUnlink", []),
      beginTOTP: () => call<Result<TotpBegin>>("beginTOTP", []),
      finishTOTP: (r) => call<Result<{ readonly recovery_code?: string }>>("finishTOTP", [r]),
      removeTOTP: (proof?: SecondFactorProof) =>
        call<Result<void>>("removeTOTP", proof === undefined ? [] : [proof]),
      regenerateRecoveryCode: (proof) =>
        call<Result<{ readonly recovery_code: string }>>("regenerateRecoveryCode", [proof]),
      stepUpPassword: (r) => call<Result<void>>("stepUpPassword", [r]),
      stepUpCode: (code) => call<Result<void>>("stepUpCode", [code]),
      stepUpPasskeyBegin: () =>
        call<Result<{ readonly ceremony: string }>>("stepUpPasskeyBegin", []),
      stepUpPasskeyFinish: (ceremony, credential) =>
        call<Result<void>>("stepUpPasskeyFinish", [ceremony, credential]),
      oidcStartStepUp: (r) => call<Result<{ readonly url: string }>>("oidcStartStepUp", [r]),
      sessions: () => call<Result<readonly SessionView[]>>("sessions", []),
      renameSession: (id, r) => call<Result<void>>("renameSession", [id, r]),
      revokeSession: (id) => call<Result<void>>("revokeSession", [id]),
      revokeOtherSessions: () => call<Result<void>>("revokeOtherSessions", []),
      keys: () => call<Result<readonly KeyView[]>>("keys", []),
      createKey: (r) => call<Result<KeyCreated>>("createKey", [r]),
      renameKey: (id, r) => call<Result<void>>("renameKey", [id, r]),
      rotateKey: (id) => call<Result<KeyCreated>>("rotateKey", [id]),
      revokeKey: (id) => call<Result<void>>("revokeKey", [id]),
      adminSecurityLog: (q) => call<Result<SecurityLogView>>("adminSecurityLog", [q]),
      adminUsers: () => call<Result<readonly PersonView[]>>("adminUsers", []),
    };
    for (const n of this.#without) {
      Reflect.deleteProperty(client, n);
    }
    return client;
  }

  /** The access module, as the screens type it. */
  access(): SignInAccess<FakeClient> &
    SetupAccess<FakeClient> &
    StepUpAccess<FakeClient> &
    SecurityAccess<FakeClient> {
    const call = <T>(name: string, args: readonly unknown[]): Promise<T> =>
      this.call(name, args) as Promise<T>;
    const module = {
      signInWithPasskey: (c, o) => call<PasskeySignInOutcome>("signInWithPasskey", [c, o]),
      passkeySupport: () =>
        call<{ readonly webauthn: boolean; readonly conditional: boolean }>("passkeySupport", []),
      storePasswordCredential: async (username, password) => {
        await call("storePasswordCredential", [username, password]);
      },
      setupWithPasskey: (c, r) => call<PasskeySignInOutcome>("setupWithPasskey", [c, r]),
      registerPasskey: (c, proof?: SecondFactorProof) =>
        call<RegisterOutcome>("registerPasskey", proof === undefined ? [c] : [c, proof]),
      sendSignals: async (c) => {
        await call("sendSignals", [c]);
      },
      passkeyProof: (c) => call<ProofOutcome>("passkeyProof", [c]),
      looksLikeTemporaryPassword: (value) => {
        this.calls.push({ name: "looksLikeTemporaryPassword", args: [value] });
        return /^[0-9a-z]{4}(?:[-\s]?[0-9a-z]{4}){3}$/i.test(value.trim());
      },
      loginSecondPasskey: (c, ticket) =>
        call<PendingPasskeyOutcome>("loginSecondPasskey", [c, ticket]),
      loginSetPasskey: (c, ticket) => call<PendingPasskeyOutcome>("loginSetPasskey", [c, ticket]),
      pendingPasskey: (c, ticket) => call<PendingPasskeyOutcome>("pendingPasskey", [c, ticket]),
      takeFragmentToken: (name) => {
        this.calls.push({ name: "takeFragmentToken", args: [name] });
        return this.fragment;
      },
      readOIDCReturn: readReturn,
      withStepUp: (c, action, o) => this.#withStepUp(c, action, o),
      oidcSignInURL: (c, redirect) =>
        `${c.oidcPrefix}/start/signin${redirect === undefined ? "" : `?${new URLSearchParams({ redirect }).toString()}`}`,
    } satisfies SignInAccess<FakeClient> &
      SetupAccess<FakeClient> &
      StepUpAccess<FakeClient> &
      SecurityAccess<FakeClient>;
    for (const n of this.#without) {
      Reflect.deleteProperty(module, n);
    }
    return module;
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
