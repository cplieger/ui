/**
 * client.ts — the parts of `@cplieger/access`'s web client and module that
 * the account screens call, typed by their shape: the host passes its own
 * client and `import * as access`, so this package depends on neither.
 * Every answer is a `Result`, which `@cplieger/reactive/fetch`'s
 * `ApiResult` is assignable to.
 * @module
 */

/** A request the server refused, or one that got no answer (status 0). */
export interface Refusal {
  readonly ok: false;
  readonly status: number;
  readonly error: string;
  readonly code?: string;
  /** The error body, server text: read it as `unknown`. */
  readonly body?: unknown;
  readonly headers?: Headers;
}

export type Result<T> = { readonly ok: true; readonly data: T } | Refusal;

/** `GET /state`: which sign-in methods are on. */
export interface StateResponse {
  readonly setup_required: boolean;
  readonly password_login: boolean;
  readonly passkeys: boolean;
  readonly oidc: boolean;
  /** Absent before access Part 3: read as true. */
  readonly secure?: boolean;
  /** Only on a plain request to an app that allows one. */
  readonly plain_session?: {
    readonly idle_seconds: number;
    readonly absolute_seconds: number;
  };
  /** What HTTPS would add: only what the app offers and the transport
   *  withholds. */
  readonly https_required?: readonly ("password" | "setup" | "passkeys" | "oidc")[];
  readonly https_origin?: string;
}

export interface SignedIn {
  readonly user: { readonly username: string };
  readonly clone_warning?: boolean;
}

export type SignInOutcome =
  | { readonly kind: "signed-in"; readonly result: SignedIn }
  | {
      readonly kind:
        "cancelled" | "timeout" | "ceremony-expired" | "unknown-credential" | "verification-failed";
    }
  | {
      readonly kind: "failed";
      /** The server's refusal, or the browser's `DOMException` name. */
      readonly error: Refusal | string;
    };

export type RegisterOutcome =
  | { readonly kind: "registered" }
  | { readonly kind: "cancelled" | "duplicate" | "timeout" | "not-discoverable" }
  | { readonly kind: "failed"; readonly error: Refusal | string };

/** Where a single sign-on round trip came back, from the address. */
export type OIDCReturn =
  | { readonly kind: "none" | "not_linked" | "linked" | "stepped_up" }
  | { readonly kind: "error"; readonly code: string | undefined };

/** The client calls the sign-in screen makes. */
export interface SignInClient {
  state(): Promise<Result<StateResponse>>;
  loginPassword(r: {
    readonly username: string;
    readonly password: string;
  }): Promise<Result<SignedIn>>;
}

/** The `@cplieger/access` functions the sign-in screen calls, over the host's
 *  client type `C`. */
export interface SignInAccess<C> {
  signInWithPasskey(
    c: C,
    o?: { readonly mediation?: "conditional"; readonly signal?: AbortSignal },
  ): Promise<SignInOutcome>;
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
  storePasswordCredential(username: string, password: string): Promise<void>;
  readOIDCReturn(search: string): OIDCReturn;
  oidcSignInURL(c: C, redirect?: string): string;
}

/** The client calls the setup screen makes. */
export interface SetupClient {
  state(): Promise<Result<StateResponse>>;
  setupPassword(r: {
    readonly token?: string;
    readonly username: string;
    readonly password: string;
  }): Promise<Result<SignedIn>>;
}

/** `MeResponse.methods`: what the signed-in person holds, and what the
 *  app has on. */
export interface MethodsView {
  readonly password: boolean;
  readonly passkey_count: number;
  readonly oidc_linked: boolean;
  readonly oidc_available: boolean;
  readonly passkeys_available: boolean;
  readonly password_login: boolean;
  readonly locks: readonly {
    readonly method: string;
    readonly untrusted: boolean;
    readonly trusted: boolean;
  }[];
  /** From access Part 4; absent reads as no authenticator app. */
  readonly totp?: {
    readonly enrolled: boolean;
    readonly since?: string;
    readonly usable: boolean;
    readonly removable: boolean;
  };
  /** From access Part 4; absent reads as true. */
  readonly password_step_up?: boolean;
}

/** `GET /me`, as far as the screens read it. */
export interface MeView {
  readonly user: { readonly username: string; readonly display_name?: string };
  readonly methods: MethodsView;
}

/** How a step-up confirms the person: `"totp"` is a code from their
 *  authenticator app (access Part 4). */
export type StepUpChoice = "password" | "passkey" | "oidc" | "totp" | "cancel";

/** What `withStepUp` takes, as `@cplieger/access` defines it. The prompt is
 *  a method, so a release whose union lacks `"totp"` still assigns. */
export interface StepUpCallbacks {
  prompt(methods: MethodsView): Promise<StepUpChoice>;
  readonly password: () => Promise<string | null>;
  /** Read from access Part 4. */
  readonly code?: () => Promise<string | null>;
  /** Read from access Part 3: a fresh sign-in for a plain session. */
  readonly signInAgain?: () => Promise<boolean>;
  readonly redirect?: string;
  readonly navigate?: (url: string) => void;
}

/** A passkey assertion that did not confirm the person. */
export type PasskeyMiss = Exclude<SignInOutcome, { kind: "signed-in" }>;

export type StepUpResult<T> =
  | { readonly kind: "done"; readonly result: Result<T> }
  | { readonly kind: "cancelled" }
  | { readonly kind: "redirecting" }
  | { readonly kind: "step-up-failed"; readonly error: Refusal | PasskeyMiss };

/** The client calls a step-up makes itself; `withStepUp` makes the rest. */
export interface StepUpClient {
  me(): Promise<Result<MeView>>;
  loginPassword(r: {
    readonly username: string;
    readonly password: string;
  }): Promise<Result<SignedIn>>;
}

/** The `@cplieger/access` functions a step-up calls. */
export interface StepUpAccess<C> {
  withStepUp<T>(
    c: C,
    action: () => Promise<Result<T>>,
    o: StepUpCallbacks,
  ): Promise<StepUpResult<T>>;
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
}

/** The `@cplieger/access` functions the setup screen calls. */
export interface SetupAccess<C> {
  setupWithPasskey(
    c: C,
    r: { readonly token?: string; readonly username: string },
  ): Promise<SignInOutcome>;
  registerPasskey(c: C): Promise<RegisterOutcome>;
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
  storePasswordCredential(username: string, password: string): Promise<void>;
  takeFragmentToken(name: string): string | undefined;
}
