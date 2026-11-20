import * as access from "@cplieger/access";
import type { ApiResult } from "@cplieger/reactive/fetch";
import { expect, it } from "vitest";

import type {
  AccessSettingsClient,
  InviteAccess,
  InviteClient,
  LogClient,
  Result,
  SecurityAccess,
  SecurityClient,
  SetupAccess,
  SetupClient,
  SignInAccess,
  SignInClient,
  StepUpAccess,
  StepUpClient,
  UsersClient,
} from "./client.js";

// typecheck:tests compiles these against the pinned @cplieger/access, so a
// structural type that drifts from the release fails there.
const fits = <T>(value: T): T => value;

export function hostPasses(client: access.AuthClient, answer: ApiResult<number>): unknown[] {
  return [
    fits<Result<number>>(answer),
    fits<SignInClient>(client),
    fits<SetupClient>(client),
    fits<StepUpClient>(client),
    fits<SecurityClient>(client),
    fits<LogClient>(client),
    fits<InviteClient>(client),
    fits<UsersClient>(client),
    fits<AccessSettingsClient>(client),
    fits<SignInAccess<access.AuthClient>>(access),
    fits<SetupAccess<access.AuthClient>>(access),
    fits<StepUpAccess<access.AuthClient>>(access),
    fits<SecurityAccess<access.AuthClient>>(access),
    fits<InviteAccess<access.AuthClient>>(access),
  ];
}

it("finds every function the screens call in the access module", () => {
  const called = [
    "loginSecondPasskey",
    "loginSetPasskey",
    "looksLikeTemporaryPassword",
    "passkeyProof",
    "passkeySupport",
    "pendingPasskey",
    "readOIDCReturn",
    "oidcSignInURL",
    "registerPasskey",
    "sendSignals",
    "setupWithPasskey",
    "signInWithPasskey",
    "storePasswordCredential",
    "takeFragmentToken",
    "withStepUp",
  ] as const;
  for (const name of called) {
    expect(typeof access[name], name).toBe("function");
  }
});
