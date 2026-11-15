/**
 * account.ts — the shared account screens of an app built on
 * `@cplieger/access`, filled into a host element on the host's client and
 * module, typed by shape so this package depends on neither. Nothing runs
 * at import. See docs/screens/account.md.
 * @module
 */

export type {
  AccountView,
  KeyCreated,
  KeyView,
  KeysClient,
  LogActorView,
  LogClient,
  LogEntryView,
  LogQuery,
  MeView,
  MethodsView,
  OIDCReturn,
  PasskeyMiss,
  PasskeyView,
  PersonView,
  ProofOutcome,
  Refusal,
  RegisterOutcome,
  Result,
  SecondFactorProof,
  SecurityAccess,
  SecurityClient,
  SecurityLogView,
  SessionNow,
  SessionView,
  SessionsClient,
  SetupAccess,
  SetupClient,
  SignInAccess,
  SignInClient,
  SignInOutcome,
  SignedIn,
  StateResponse,
  StepUpAccess,
  StepUpCallbacks,
  StepUpChoice,
  StepUpClient,
  StepUpResult,
  TotpBegin,
} from "./client.js";
export { accountActions, accountRunner, runDirect } from "./run.js";
export type { KeyScope, KeyScopes } from "./keys.js";
export { mountSecurityLog } from "./log.js";
export type { LogKinds, LogOptions, SecurityLogOptions, SecurityLogScreen } from "./log.js";
export type { AccountAction, DefineAction, Runner } from "./run.js";
export type { AccountPart, ScreenOptions, SignedOutOptions, SignedOutReason } from "./screen.js";
export { mountSecurity } from "./security.js";
export type { SecurityOptions, SecurityScreen } from "./security.js";
export { mountSetup } from "./setup.js";
export type { SetupOptions } from "./setup.js";
export { mountSignIn } from "./sign-in.js";
export type { SignInArrival, SignInOptions, SignedInEvent } from "./sign-in.js";
export { stepUp } from "./step-up.js";
export type { StepUpAnswer, StepUpOptions } from "./step-up.js";
export { defaultAccountWords, wordsOf } from "./words.js";
export type { AccountWords, PageHost } from "./words.js";
