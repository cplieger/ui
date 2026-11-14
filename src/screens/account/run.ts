/**
 * run.ts — every write the account screens make goes through a `Runner`
 * under one of `accountActions`' names, so a host can make each one a
 * `@cplieger/reactive/actions` definition marked `sensitive`, and its action
 * log and every subscriber see no password, key or answer.
 * @module
 */

/** The name of every write, one per call. */
export const accountActions = [
  "auth.setup",
  "auth.setup_passkey",
  "auth.sign_in",
  "auth.sign_in_passkey",
  "auth.link_pending",
  "auth.invite_accept",
  "auth.recovery_start",
  "auth.recovery_password",
  "auth.recovery_passkey",
  "auth.step_up",
  "auth.step_up_code",
  "auth.profile_save",
  "auth.password_set",
  "auth.password_remove",
  "auth.passkey_add",
  "auth.passkey_rename",
  "auth.passkey_remove",
  "auth.method_reenable",
  "auth.oidc_link",
  "auth.oidc_unlink",
  "auth.session_rename",
  "auth.session_revoke",
  "auth.sessions_revoke_others",
  "auth.api_key_create",
  "auth.api_key_revoke",
  "auth.api_key_rotate",
] as const;

export type AccountAction = (typeof accountActions)[number];

/** Runs one write. Rejects when the write itself failed or was cancelled,
 *  which the screens show as a failure with no words of its own. */
export type Runner = <T>(name: AccountAction, work: () => Promise<T>) => Promise<T>;

/** The runner a screen uses without one: the call runs as it is. */
export const runDirect: Runner = (_name, work) => work();

type Work = () => Promise<unknown>;

/** The shape of `@cplieger/reactive/actions`' `defineAction`, as far as
 *  `accountRunner` calls it. */
export type DefineAction = (definition: {
  readonly name: string;
  readonly sensitive: true;
  readonly error: false;
  readonly run: (work: Work) => Promise<unknown>;
}) => {
  dispatch(work: Work): {
    readonly outcome: Promise<
      | { readonly status: "success"; readonly value: unknown }
      | { readonly status: "error" | "cancelled" }
    >;
  };
};

/**
 * A runner that dispatches each write as an action the host's own
 * `defineAction` defines, once per name on first use, with `sensitive: true`
 * and no error notification of its own. Make one per page: a second runner
 * defines each name again, which the registry warns about.
 */
export function accountRunner(defineAction: DefineAction): Runner {
  const defined = new Map<AccountAction, ReturnType<DefineAction>>();
  return async <T>(name: AccountAction, work: () => Promise<T>): Promise<T> => {
    let action = defined.get(name);
    if (action === undefined) {
      action = defineAction({ name, sensitive: true, error: false, run: (w) => w() });
      defined.set(name, action);
    }
    const outcome = await action.dispatch(work).outcome;
    if (outcome.status !== "success") {
      throw new Error(`${name} ended: ${outcome.status}`);
    }
    // The action's value is what `work` resolved.
    return outcome.value as T;
  };
}
