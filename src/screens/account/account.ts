/**
 * account.ts — the shared account screens of an app built on
 * `@cplieger/access`, filled into a host element on the host's client and
 * module, typed by shape so this package depends on neither. Nothing runs
 * at import. See docs/screens/account.md.
 * @module
 */

export type {
  OIDCReturn,
  Refusal,
  Result,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  SignedIn,
  StateResponse,
} from "./client.js";
export { accountActions, accountRunner, runDirect } from "./run.js";
export type { AccountAction, DefineAction, Runner } from "./run.js";
export type { AccountPart, ScreenOptions } from "./screen.js";
export { mountSignIn } from "./sign-in.js";
export type { SignInArrival, SignInOptions, SignedInEvent } from "./sign-in.js";
export { defaultAccountWords, wordsOf } from "./words.js";
export type { AccountWords } from "./words.js";
