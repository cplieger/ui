/**
 * words.ts — every word the account screens show, with the defaults from
 * docs/design-account.md. A host overrides any of them through a screen's
 * `words` option: a key named after an answer's code, or its code and
 * reason, holds that answer's words.
 * @module
 */

export interface AccountWords {
  /** A request that got no answer. */
  readonly "generic.network": string;
  /** An answer with no words of its own. */
  readonly "generic.server": string;
  readonly "generic.retry": string;
  /** The heading of a form's error summary. */
  readonly "form.summary": (count: number) => string;
  readonly "password.show": string;
  /** The single sign-on provider's name, when the host gives none. */
  readonly provider: string;

  readonly "signIn.title": string;
  readonly "signIn.username": string;
  readonly "signIn.password": string;
  readonly "signIn.submit": string;
  readonly "signIn.busy": string;
  readonly "signIn.done": string;
  readonly "signIn.passkey": string;
  readonly "signIn.passkeyBusy": string;
  readonly "signIn.provider": (provider: string) => string;
  readonly "signIn.recoveryHint": string;
  readonly "signIn.off": string;
  /** Password sign-in was turned off while the screen was open. */
  readonly "signIn.passwordOff": string;
  readonly "signIn.usernameEmpty": string;
  readonly "signIn.passwordEmpty": string;
  /** Said when a rate limit's countdown ends. */
  readonly "signIn.again": string;

  readonly "arrived.session-ended": string;
  readonly "arrived.setup-complete": string;
  readonly "arrived.password-set": string;

  readonly auth_invalid_credentials: string;
  /** `time` is the wait, such as "0:42". */
  readonly auth_rate_limited: (time: string) => string;
  /** A rate limit whose answer gave no wait, as on a single sign-on return. */
  readonly "auth_rate_limited.later": string;
  readonly auth_busy: string;
  readonly auth_unavailable: string;
  readonly auth_username_invalid: string;
  readonly "auth_username_invalid.empty": string;
  readonly "auth_username_invalid.disallowed_character": string;
  readonly auth_origin_refused: string;
  readonly auth_oidc_unavailable: string;
  /** Any single sign-on return that failed: the callback's redirect
   *  carries the code alone, never its reason. */
  readonly auth_oidc_failed: string;
  /** A single sign-on identity no account uses, where no pending link is
   *  mounted. `place` names where the person links it. */
  readonly "oidc.not_linked": (provider: string, place: string) => string;

  readonly "passkey.timeout": string;
  readonly "passkey.ceremony-expired": string;
  readonly "passkey.unknown-credential": string;
  readonly "passkey.verification-failed": string;
  readonly "passkey.failed": string;
}

const outOfTime = "The passkey request ran out of time. Try again.";

export const defaultAccountWords: AccountWords = {
  "generic.network": "The app is not answering. Check your connection, then try again.",
  "generic.server": "The server could not do this. Try again in a moment.",
  "generic.retry": "Retry",
  "form.summary": (count) => `${String(count)} fields need a fix`,
  "password.show": "Show password",
  provider: "single sign-on",

  "signIn.title": "Sign in",
  "signIn.username": "Username",
  "signIn.password": "Password",
  "signIn.submit": "Sign in",
  "signIn.busy": "Signing in…",
  "signIn.done": "Signed in",
  "signIn.passkey": "Sign in with a passkey",
  "signIn.passkeyBusy": "Waiting for your passkey…",
  "signIn.provider": (provider) => `Continue with ${provider}`,
  "signIn.recoveryHint": "Lost access? Ask an admin for a recovery link.",
  "signIn.off": "Sign-in is turned off. Ask the app's admin.",
  "signIn.passwordOff": "Password sign-in is turned off. Sign in another way.",
  "signIn.usernameEmpty": "Enter your username.",
  "signIn.passwordEmpty": "Enter your password.",
  "signIn.again": "You can sign in again.",

  "arrived.session-ended": "Your session ended. Sign in to continue.",
  "arrived.setup-complete": "Setup is already done. Sign in.",
  "arrived.password-set": "Password set. Sign in with it.",

  auth_invalid_credentials: "The username or password is wrong.",
  auth_rate_limited: (time) => `Too many attempts. Try again in ${time}.`,
  "auth_rate_limited.later": "Too many attempts. Try again in a moment.",
  auth_busy: "The server is busy. Try again in a moment.",
  auth_unavailable: "Sign-in is unavailable right now. Try again in a few seconds.",
  auth_username_invalid: "Use letters, digits, dots, dashes and underscores.",
  "auth_username_invalid.empty": "Enter your username.",
  "auth_username_invalid.disallowed_character": "Usernames have no spaces.",
  auth_origin_refused:
    "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
  auth_oidc_unavailable:
    "Single sign-on is unavailable right now. Try again in a moment, or sign in another way.",
  auth_oidc_failed: "Single sign-on did not finish. Try again, or sign in another way.",
  "oidc.not_linked": (provider, place) =>
    `This ${provider} identity is not linked to an account here. Sign in another way, then link it in ${place}.`,

  "passkey.timeout": outOfTime,
  "passkey.ceremony-expired": outOfTime,
  "passkey.unknown-credential":
    "That passkey is not registered here. Try another one, or sign in another way.",
  "passkey.verification-failed": "That passkey could not be checked. Try again.",
  "passkey.failed": "The passkey request did not finish. Try again, or sign in another way.",
};

/** The defaults with `overrides` on top. */
export function wordsOf(overrides: Partial<AccountWords> = {}): AccountWords {
  return { ...defaultAccountWords, ...overrides };
}
