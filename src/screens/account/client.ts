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
