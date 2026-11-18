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

/** What a list read sends: the cursor of the page wanted, absent for the
 *  first, and the page's size, 1 to 200 (absent is 50). A cursor is sealed
 *  to its list, its filters and its owner. */
export interface PageQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

/** One page of a list read. `offset` items come before it and `total`
 *  match the query; `prev_cursor` is absent exactly on the first page and
 *  `next_cursor` exactly on the last. */
export interface ListAnswer<T> {
  readonly items: readonly T[];
  readonly next_cursor?: string;
  readonly prev_cursor?: string;
  readonly offset: number;
  readonly total: number;
}

/** `GET /state`: which sign-in methods are on. */
export interface StateResponse {
  readonly setup_required: boolean;
  readonly password_login: boolean;
  readonly passkeys: boolean;
  readonly oidc: boolean;
  readonly secure: boolean;
  /** Only on a plain request to an app that allows one. */
  readonly plain_session?: {
    readonly idle_seconds: number;
    readonly absolute_seconds: number;
  };
  /** What HTTPS would add: only what the app offers and the transport
   *  withholds. */
  readonly https_required: readonly ("password" | "setup" | "passkeys" | "oidc")[];
  readonly https_origin?: string;
  /** The app offers authenticator apps. Absent: no. */
  readonly totp?: boolean;
  /** On a plain request only: this form must not send a temporary
   *  password. */
  readonly temporary_password_https_only?: boolean;
  /** How single sign-on sits beside local sign-in. Absent reads as
   *  `"alongside"`. */
  readonly sso?: SSOMode;
  /** The bounds a new password must fit, when the server sends them. */
  readonly password_length?: PasswordLength;
}

/** A password's bounds, in characters of its NFC form. */
export interface PasswordLength {
  readonly min: number;
  readonly max: number;
}

/** How single sign-on sits beside local sign-in, for everyone but the
 *  owners. */
export type SSOMode = "alongside" | "for_linked" | "only";

export interface SignedIn {
  readonly user: { readonly username: string };
  readonly clone_warning?: boolean;
  /** Set once, when this sign-in bound a factor that issued one. */
  readonly recovery_code?: string;
}

/** A method a pending sign-in's step accepts. */
export type PendingMethod = "totp" | "passkey" | "recovery_code" | "password";

/** A sign-in that needs another step. The ticket lives in memory only, and
 *  each answer's newer ticket replaces it. */
export interface Pending {
  readonly ticket: string;
  readonly next: "second_factor" | "set_credential" | "enrol";
  /** Already filtered by this request's transport. */
  readonly methods: readonly PendingMethod[];
  /** Set after a recovery code: the enrolment that follows completes the
   *  recovery. */
  readonly recovered?: boolean;
}

/** A sign-in step's answer: signed in, or a further step. */
export type SignInOutcome = { readonly signed_in: SignedIn } | { readonly pending: Pending };

/** A finish that created an account waiting for an administrator, with no
 *  session. */
export interface WaitingApproval {
  readonly waiting_approval: true;
  readonly recovery_code?: string;
}

/** What a passkey step of a pending sign-in ends with: the server's
 *  answer, or why the browser gave none. */
export type PendingPasskeyOutcome =
  | { readonly kind: "answered"; readonly result: SignInOutcome | WaitingApproval }
  | PasskeyMiss
  | RegisterMiss;

export type PasskeySignInOutcome =
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
  | {
      readonly kind: "registered";
      /** Set when this passkey is the first second factor of a person
       *  with a password. Show it once. */
      readonly recovery_code?: string;
    }
  | { readonly kind: "cancelled" | "duplicate" | "timeout" | "not-discoverable" }
  | { readonly kind: "failed"; readonly error: Refusal | string };

/** Where a single sign-on round trip came back, from the address. */
export type OIDCReturn =
  | { readonly kind: "none" | "not_linked" | "linked" | "stepped_up" }
  | { readonly kind: "error"; readonly code: string | undefined };

/** A password sign-in's, setup's or invite's answer: the session, from a
 *  server with no further steps, or a step's answer. */
export type PasswordAnswer = SignedIn | SignInOutcome;

/** The client calls a pending sign-in's steps make, each optional: a step
 *  shows a method only when the client has its call. */
export interface PendingClient {
  loginCode?(ticket: string, code: string): Promise<Result<SignInOutcome>>;
  loginRecoveryCode?(ticket: string, code: string): Promise<Result<SignInOutcome>>;
  loginSetPassword?(ticket: string, password: string): Promise<Result<SignInOutcome>>;
  pendingTOTPBegin?(r: {
    readonly ticket: string;
  }): Promise<Result<{ readonly uri: string; readonly text: string }>>;
  pendingTOTPFinish?(
    ticket: string,
    code: string,
  ): Promise<Result<{ readonly signed_in: SignedIn } | WaitingApproval>>;
}

/** The client calls the sign-in screen makes. */
export interface SignInClient extends PendingClient {
  state(): Promise<Result<StateResponse>>;
  loginPassword(r: {
    readonly username: string;
    readonly password: string;
  }): Promise<Result<PasswordAnswer>>;
  /** The identity a single sign-on return left unlinked. With
   *  `oidcLinkPending`, the screen offers to link it. */
  oidcPending?(): Promise<Result<PendingLinkView>>;
  /** Links the pending identity to the account just signed in. */
  oidcLinkPending?(): Promise<Result<unknown>>;
  /** A new account for the pending identity. */
  oidcCreatePending?(r: { readonly username: string }): Promise<Result<SignedIn>>;
  /** Under `sso: "only"`: links the pending identity to an account with
   *  a temporary password from an admin. */
  oidcLinkByAdmin?(r: {
    readonly username: string;
    readonly temporary_password: string;
  }): Promise<Result<SignedIn>>;
}

/** `oidcPending()`'s answer: the identity, as the provider named it. */
export interface PendingLinkView {
  readonly issuer: string;
  readonly username_hint?: string;
  readonly email?: string;
  /** "Create a new account" is offered. Absent reads as false. */
  readonly can_create?: boolean;
  readonly suggested_username?: string;
}

/** The client calls the invite screen makes. */
export interface InviteClient extends PendingClient {
  state(): Promise<Result<StateResponse>>;
  inviteAcceptPassword(r: {
    readonly token: string;
    readonly username: string;
    readonly password: string;
  }): Promise<Result<PasswordAnswer>>;
  /** The provider's address to accept by single sign-on. */
  inviteAcceptOIDC?(r: { readonly token: string }): Promise<Result<{ readonly url: string }>>;
}

/** The `@cplieger/access` functions a pending sign-in's steps call, over
 *  the host's client type `C`; the passkey steps are optional. */
export interface PendingAccess<C> {
  storePasswordCredential(username: string, password: string): Promise<void>;
  /** A passkey as the second step. */
  readonly loginSecondPasskey?: (c: C, ticket: string) => Promise<PendingPasskeyOutcome>;
  /** A passkey in place of a password, after a temporary password. */
  readonly loginSetPasskey?: (c: C, ticket: string) => Promise<PendingPasskeyOutcome>;
  /** A passkey enrolled as the second factor inside a sign-in. */
  readonly pendingPasskey?: (c: C, ticket: string) => Promise<PendingPasskeyOutcome>;
}

/** The `@cplieger/access` functions the invite screen calls. */
export interface InviteAccess<C> extends PendingAccess<C> {
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
  takeFragmentToken(name: string): string | undefined;
}

/** The `@cplieger/access` functions the sign-in screen calls. */
export interface SignInAccess<C> extends PendingAccess<C> {
  signInWithPasskey(
    c: C,
    o?: { readonly mediation?: "conditional"; readonly signal?: AbortSignal },
  ): Promise<PasskeySignInOutcome>;
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
  readOIDCReturn(search: string): OIDCReturn;
  oidcSignInURL(c: C, redirect?: string): string;
  /** True when `value` reads as a temporary password, in any spelling. */
  looksLikeTemporaryPassword?(value: string): boolean;
}

/** The client calls the setup screen makes. */
export interface SetupClient extends PendingClient {
  state(): Promise<Result<StateResponse>>;
  setupPassword(r: {
    readonly token?: string;
    readonly username: string;
    readonly password: string;
  }): Promise<Result<PasswordAnswer>>;
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
  /** Absent reads as no authenticator app. */
  readonly totp?: {
    readonly enrolled: boolean;
    readonly since?: string;
    readonly usable: boolean;
    readonly removable: boolean;
  };
  /** Absent reads as true. */
  readonly password_step_up?: boolean;
  /** The person holds a recovery code. */
  readonly recovery_code?: boolean;
  /** Adding or removing a passkey needs a proof of a second factor.
   *  Absent reads as false. */
  readonly second_factor_held?: boolean;
}

/** `GET /me`, as far as the screens read it. */
export interface MeView {
  readonly user: { readonly username: string; readonly display_name?: string };
  readonly methods: MethodsView;
}

/** `MeResponse.session`: the session this page runs on. */
export interface SessionNow {
  readonly method: string;
  readonly auth_time: string;
  readonly idle_deadline: string;
  readonly absolute_deadline: string;
  /** False for a session made over plain HTTP. */
  readonly secure: boolean;
}

/** `GET /me` as Account and security reads it. */
export interface AccountView extends MeView {
  readonly user: MeView["user"] & { readonly id: number; readonly role: string };
  readonly can_link_oidc: boolean;
  /** The app has one account. */
  readonly single_user?: boolean;
  /** The identity provider manages this person's sign-in, so their
   *  local methods are dormant. */
  readonly sso_only?: boolean;
  /** An owner keeps every local method. */
  readonly owner?: boolean;
  readonly session: SessionNow;
}

/** A passkey on the person's account. */
export interface PasskeyView {
  readonly id: number;
  readonly name: string;
  readonly created_at: string;
  readonly last_used_at?: string;
  readonly backed_up: boolean;
  readonly clone_warning?: boolean;
  readonly rp_id: string;
  /** Remove would not be refused. Absent reads as true. */
  readonly removable?: boolean;
}

/** Proof of a second factor: a code from the authenticator app, or a
 *  passkey assertion from `stepUpPasskeyBegin`. */
export type SecondFactorProof =
  { readonly code: string } | { readonly ceremony: string; readonly assertion: unknown };

/** `beginTOTP()`'s answer: the authenticator link, its key as text, and
 *  the ticket the finish takes. */
export interface TotpBegin {
  readonly uri: string;
  readonly text: string;
  readonly ticket: string;
}

/** How a step-up confirms the person: `"totp"` is a code from their
 *  authenticator app. */
export type StepUpChoice = "password" | "passkey" | "oidc" | "totp" | "cancel";

/** What `withStepUp` takes, as `@cplieger/access` defines it. The prompt is
 *  a method, so a release whose union lacks `"totp"` still assigns. */
export interface StepUpCallbacks {
  prompt(methods: MethodsView): Promise<StepUpChoice>;
  readonly password: () => Promise<string | null>;
  /** A code from the authenticator app. */
  readonly code: () => Promise<string | null>;
  /** A fresh sign-in for a plain session. */
  readonly signInAgain?: () => Promise<boolean>;
  readonly redirect?: string;
  readonly navigate?: (url: string) => void;
}

/** A passkey assertion that did not confirm the person. */
export type PasskeyMiss = Exclude<PasskeySignInOutcome, { kind: "signed-in" }>;

/** A passkey registration that bound nothing. */
export type RegisterMiss = Exclude<RegisterOutcome, { kind: "registered" }>;

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
  }): Promise<Result<PasswordAnswer>>;
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
export interface SetupAccess<C> extends PendingAccess<C> {
  setupWithPasskey(
    c: C,
    r: { readonly token?: string; readonly username: string },
  ): Promise<PasskeySignInOutcome>;
  registerPasskey(c: C): Promise<RegisterOutcome>;
  passkeySupport(): Promise<{ readonly webauthn: boolean; readonly conditional: boolean }>;
  takeFragmentToken(name: string): string | undefined;
}

/** The client calls Account and security's profile and sign-in methods
 *  make. The second-factor calls are optional: a control that needs one
 *  shows only when the client has it. */
export interface SecurityClient extends StepUpClient, SessionsClient, KeysClient, LogClient {
  state(): Promise<Result<StateResponse>>;
  me(): Promise<Result<AccountView>>;
  updateProfile(r: { readonly display_name: string }): Promise<Result<AccountView>>;
  /** Answers nothing or `{recovery_code?}`: set when the new password
   *  joins a usable passkey of a person who held no code. */
  setPassword(r: {
    readonly current_password?: string;
    readonly password: string;
  }): Promise<Result<unknown>>;
  removePassword(r: { readonly current_password: string }): Promise<Result<void>>;
  passkeys(q?: PageQuery): Promise<Result<ListAnswer<PasskeyView>>>;
  renamePasskey(id: number, r: { readonly name: string }): Promise<Result<void>>;
  removePasskey(id: number, proof?: SecondFactorProof): Promise<Result<void>>;
  reenableMethod(method: string): Promise<Result<void>>;
  oidcStartLink(r: { readonly redirect?: string }): Promise<Result<{ readonly url: string }>>;
  oidcUnlink(): Promise<Result<void>>;
  beginTOTP?(): Promise<Result<TotpBegin>>;
  finishTOTP?(r: {
    readonly ticket: string;
    readonly code: string;
    readonly current_code?: string;
  }): Promise<Result<{ readonly recovery_code?: string }>>;
  removeTOTP?(proof?: SecondFactorProof): Promise<Result<void>>;
  regenerateRecoveryCode?(
    proof: SecondFactorProof,
  ): Promise<Result<{ readonly recovery_code: string }>>;
}

/** A signed-in device of the person's. */
export interface SessionView {
  readonly id: string;
  readonly label?: string;
  readonly user_agent?: string;
  readonly last_ip?: string;
  readonly method: string;
  readonly created_at: string;
  readonly last_activity: string;
  readonly idle_deadline: string;
  readonly absolute_deadline: string;
  readonly current: boolean;
  /** False for a session made over plain HTTP. */
  readonly secure: boolean;
}

/** An API key of the person's. `previous_until` is set while a rotated
 *  key's previous secret still works. */
export interface KeyView {
  readonly id: number;
  /** Empty only on a key made before labels were required. */
  readonly label: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly scopes: readonly string[];
  readonly created_at: string;
  readonly expires_at?: string;
  readonly last_used_at?: string;
  readonly previous_until?: string;
  /** The key that minted this one, when a key did. */
  readonly parent_key_id?: number;
  /** On the every-account list: the username of the key's owner. */
  readonly username?: string;
}

/** `createKey` and `rotateKey`'s answer: the plaintext, shown once. */
export interface KeyCreated {
  readonly key: string;
  readonly details: KeyView;
}

/** The client calls the Sessions and API keys sections make. */
export interface SessionsClient {
  sessions(q?: PageQuery): Promise<Result<ListAnswer<SessionView>>>;
  renameSession(id: string, r: { readonly name: string }): Promise<Result<void>>;
  revokeSession(id: string): Promise<Result<void>>;
  revokeOtherSessions(): Promise<Result<void>>;
}

export interface KeysClient {
  keys(q?: PageQuery): Promise<Result<ListAnswer<KeyView>>>;
  createKey(r: {
    readonly label: string;
    readonly scopes: readonly string[];
    readonly expires_in_days?: number;
  }): Promise<Result<KeyCreated>>;
  renameKey(id: number, r: { readonly name: string }): Promise<Result<void>>;
  /** A new secret for the same key; the previous one works until
   *  `previous_until`. */
  rotateKey(id: number): Promise<Result<KeyCreated>>;
  revokeKey(id: number): Promise<Result<void>>;
}

/** Who made a logged change, with the label, user agent or key suffix the
 *  change's commit read. */
export interface LogActorView {
  readonly user_id?: number;
  readonly session_id?: string;
  readonly key_id?: number;
  /** The channel of an out-of-band call, such as the app's own command. */
  readonly out_of_band?: string;
  readonly label?: string;
  readonly user_agent?: string;
  readonly key_suffix?: string;
}

/** One security-log entry. `at` is when it was appended, `occurred_at`
 *  when the change happened. */
export interface LogEntryView {
  readonly seq: number;
  readonly at: string;
  readonly occurred_at: string;
  readonly class: string;
  readonly kind: string;
  /** The account the entry is about. */
  readonly user_id?: number;
  readonly actor: LogActorView;
  readonly ip?: string;
  readonly session_ids?: readonly string[];
  readonly key_id?: number;
  readonly passkey_id?: number;
  readonly method?: string;
  readonly role?: string;
  /** A lock's context: true for attempts from a device known to the
   *  account. */
  readonly trusted?: boolean;
  readonly detail?: string;
}

/** One page of the security log, in the order asked, and every class's
 *  count and the entries its size limit removed. */
export interface SecurityLogView extends ListAnswer<LogEntryView> {
  readonly classes: readonly {
    readonly class: string;
    readonly count: number;
    readonly evicted: number;
  }[];
}

/** `adminSecurityLog`'s query: newest first unless `oldestFirst`. A
 *  cursor answers `cursor_invalid` under any other filters than its own. */
export interface LogQuery extends PageQuery {
  readonly user?: number;
  readonly actor?: number;
  readonly actorKey?: number;
  readonly kinds?: readonly string[];
  readonly oldestFirst?: boolean;
}

/** A person of the app, as the admin's users list names them. */
export interface PersonView {
  readonly id: number;
  readonly username: string;
  readonly display_name?: string;
}

/** The client calls the security log makes. */
export interface LogClient {
  adminSecurityLog(q?: LogQuery): Promise<Result<SecurityLogView>>;
  /** Names the people in the log, and offers them as a filter. Absent or
   *  refused, a person reads by their number. */
  adminUsers?(q?: PageQuery): Promise<Result<ListAnswer<PersonView>>>;
}

/** A person's ways in, as only the admin's users list carries them.
 *  Each optional field absent reads as none. */
export interface UserMethodsView {
  readonly password: boolean;
  readonly passkey_count: number;
  readonly totp?: boolean;
  readonly temporary_password?: { readonly expires_at: string };
  readonly waiting_approval?: boolean;
  /** The role follows the identity provider: a change here lasts until
   *  the person's next sign-in. */
  readonly role_from_provider?: boolean;
  readonly local_methods_dormant?: boolean;
}

/** A person of the app, on the admin's users list. */
export interface UserView extends PersonView {
  readonly role: string;
  readonly enabled: boolean;
  readonly oidc_linked: boolean;
  readonly owner?: boolean;
  readonly created_at: string;
  readonly methods?: UserMethodsView;
  /** On the admin list: the path of keys that last acted on the person,
   *  root first, that key last. */
  readonly key_lineage?: readonly number[];
}

/** A one-time token, shown once. */
export interface TokenResponse {
  readonly token: string;
  readonly expires_at: string;
}

/** A live one-time token, with neither the token nor its hash. */
export interface TokenView {
  /** `"invite"` or `"setup"`, or an app's own. */
  readonly purpose: string;
  readonly role?: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly issued_by_key?: number;
  /** The issuing key's path, root first, that key last. */
  readonly issuer_lineage?: readonly number[];
}

/** What Issue a temporary password asks for. */
export interface TemporaryPasswordOptions {
  /** Default 24, at most 168. */
  readonly ttl_hours?: number;
  readonly revoke_passkeys?: boolean;
  /** Default false: the person's API keys are revoked. */
  readonly keep_keys?: boolean;
}

/** A temporary password, shown once. `https_only`, `dormant` and
 *  `password_kept` choose the words the admin passes on with it. */
export interface TemporaryPasswordResponse {
  readonly password: string;
  readonly expires_at: string;
  readonly https_only: boolean;
  readonly https_origin?: string;
  readonly dormant: boolean;
  readonly password_kept: boolean;
}

/** The client calls the admin's users list makes. A row offers an
 *  optional call's action only when the client has it. */
export interface UsersClient extends StepUpClient {
  state(): Promise<Result<StateResponse>>;
  me(): Promise<Result<AccountView>>;
  /** `key`: only the people that key's subtree reached. */
  adminUsers(q?: PageQuery & { readonly key?: number }): Promise<Result<ListAnswer<UserView>>>;
  adminUpdateUser(
    id: number,
    r: { readonly role?: string; readonly enabled?: boolean },
  ): Promise<Result<UserView>>;
  adminDeleteUser(id: number): Promise<Result<void>>;
  /** Makes an account with no way in; a temporary password gives it one. */
  adminCreateUser(r: {
    readonly username: string;
    readonly role: string;
  }): Promise<Result<UserView>>;
  adminInvite(r: {
    readonly role: string;
    readonly hours?: number;
  }): Promise<Result<TokenResponse>>;
  adminTokens(q?: PageQuery): Promise<Result<ListAnswer<TokenView>>>;
  adminKeys(q?: PageQuery): Promise<Result<ListAnswer<KeyView>>>;
  adminRevokeKey(id: number): Promise<Result<void>>;
  adminTemporaryPassword?(
    id: number,
    o: TemporaryPasswordOptions,
  ): Promise<Result<TemporaryPasswordResponse>>;
  adminResetSecondFactor?(id: number): Promise<Result<void>>;
  adminSetOwner?(id: number, r: { readonly owner: boolean }): Promise<Result<UserView>>;
  adminUnlinkOIDC?(id: number): Promise<Result<void>>;
  adminRelinkOIDC?(
    id: number,
    o: TemporaryPasswordOptions,
  ): Promise<Result<TemporaryPasswordResponse>>;
}

/** What a change of the SSO mode would do, or the refusal that stops it,
 *  which `adminApplySSO` would answer exactly. Each count is zero in the
 *  direction that does not apply. */
export interface Readiness {
  readonly refusal?: { readonly code: string; readonly reason?: string };
  /** People not linked yet, who could not sign in under the mode. */
  readonly locked_out: number;
  readonly methods_made_dormant: number;
  readonly methods_restored: number;
  readonly temporary_passwords_withdrawn: number;
}

/** The client calls the access settings make; without the two optional
 *  calls the screen draws nothing. */
export interface AccessSettingsClient extends StepUpClient {
  state(): Promise<Result<StateResponse>>;
  me(): Promise<Result<AccountView>>;
  adminSSOReadiness?(mode: SSOMode): Promise<Result<Readiness>>;
  adminApplySSO?(mode: SSOMode): Promise<Result<void>>;
}

/** A passkey assertion taken as a proof, or why there is none. */
export type ProofOutcome =
  { readonly kind: "proof"; readonly proof: SecondFactorProof } | PasskeyMiss;

/** The `@cplieger/access` functions Account and security calls. */
export interface SecurityAccess<C> extends StepUpAccess<C> {
  /** `proof` while `second_factor_held`. */
  registerPasskey(c: C, proof?: SecondFactorProof): Promise<RegisterOutcome>;
  sendSignals(c: C): Promise<void>;
  storePasswordCredential(username: string, password: string): Promise<void>;
  readOIDCReturn(search: string): OIDCReturn;
  /** A passkey assertion as a second-factor proof. */
  passkeyProof?(c: C): Promise<ProofOutcome>;
}
