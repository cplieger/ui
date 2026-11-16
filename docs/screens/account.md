# account

`@cplieger/ui/account`

The account screens of an app built on [`@cplieger/access`](https://github.com/cplieger/access): sign-in, first setup, invites, step-up, Account and security, the security log, the users list and the access settings, each with the states and words [Account and sign-in](../design-account.md) describes. A screen fills an element the app gives it, using DOM calls and `textContent` only, so a strict content policy accepts its markup. It is drawn by the classes in `css/system.css`, its glyphs from the [icon list](../foundations/icons.md#with-no-script).

```ts
import * as access from "@cplieger/access";
import { defineAction } from "@cplieger/reactive/actions";
import { accountRunner, mountSignIn } from "@cplieger/ui/account";

// `api` is the app's `@cplieger/reactive/fetch` instance.
const client = access.createAuthClient({ fetch: api, prefix: "/api/auth", oidcPrefix: "/api/auth/oidc" });

mountSignIn(document.getElementById("sign-in-panel"), {
  client,
  access,
  app: "Release tracker",
  provider: "Authelia",
  run: accountRunner(defineAction),
  recoveryHint: "Forgot your password? On the server, release-tracker admin reset-password sets a new one.",
  signal: page.signal,
});
```

The screens take the app's access client and module by shape, so this package depends on neither: the app passes `import * as access` as `access` and its client as `client`. Each screen's client type, such as `SignInClient`, lists the calls it makes. A call that a later access release adds is optional, and the screen offers what needs it only when the client has it. The tests check every type against the access release the package pins.

## Screens

| Function | Fills | Returns |
| --- | --- | --- |
| `mountSignIn(panel, options)` | the gate page's `.cp-panel`: the sign-in form and its methods, the second step, linking a single sign-on identity | nothing |
| `mountSetup(region, options)` | the first account's setup, with the setup token, then the passkey offer | nothing |
| `mountInvite(panel, options)` | accepting an invite, by password or single sign-on | nothing |
| `mountSecurity(region, options)` | Account and security: who is signed in, the profile, the sign-in methods, the sessions, the API keys and, for an admin, the security log | `{ refresh(), refreshLog() }` |
| `mountSecurityLog(region, options)` | the security log on its own, such as an admin's log page | `{ refresh(), show(search) }` |
| `mountUsers(region, options)` | the admin's users, waiting invites and every API key | `{ refresh(), show(search) }` |
| `mountAccessSettings(region, options)` | the owners' single sign-on mode | `{ refresh() }` |
| `stepUp(action, options)` | runs `action`, asking "Confirm it is you" when the server wants a recent sign-in, then runs it once more | `{ kind: "done", result }`, `"cancelled"`, `"redirecting"` or `"failed"` with its `words` |

A gate screen fills the panel of the [gate page](../design-account.md#the-gate-page), and the line under the panel is the app's own markup. Each screen installs the dialogs, the announcer and the tooltips it uses.

## Options every screen takes

- `client` and `access`, as above, and `app`, the app's name, for words such as "Set up Release tracker" and "Open Release tracker over HTTPS".
- `provider`, the single sign-on provider's name for "Continue with Authelia". Default "single sign-on".
- `words`, any of the screen's words, the words for each answer's code and reason included (below).
- `run`, the runner each write goes through. Default: the call runs as it is.
- `parts`, the route groups the app mounts. Default: every part. A part left out is absent from every screen, never a disabled control: `"password"`, `"passkeys"`, `"single-sign-on"`, `"pending-link"`, `"setup-passkey"`, `"second-factor"`, `"temporary-password"`, `"profile"`, `"sessions"`, `"session-rename"`, `"keys"`, `"key-rotate"`, `"security-log"`, `"invites"` and `"admin-keys"`. The answers of `state()` and `me()` turn a mounted part off at run time.
- `signal`, which ends the screen: its listeners, timers and requests.
- `navigate`, which opens an address. Default `location.assign`.
- `search`, the query the screen reads. Default `location.search`.
- On the signed-in screens, `onSignedOut({ reason })`, which runs when the session is gone (`"session-ended"`), the connection changed between HTTP and HTTPS (`"transport-changed"`) or the person signed this device out (`"signed-out"`). Default: navigate to `signInPath`, "/sign-in" by default, with `arrived` saying why, which the sign-in screen reads for its first notice.

## The app's own place

Each option below fits a screen into an app that already has its own layout and words:

- `mountSetup(region, { heading: false })` puts setup inside a step of the app's own setup, under the step's `<h1>`. `offerPasskey` returns whether to offer a passkey after a password setup, such as when the passkey's relying party matches this page.
- `recoveryHint` is the sign-in panel's last line, a string or a node, or `false` to leave it out.
- `words` takes a sentence for any code or reason. `auth_setup_token_required` may be a function of `{ hostname, ipOrLocalhost }`, so an app words the setup token one way at `localhost` or an IP address and another at a name.
- `mountSecurity(region, { level: 3 })` heads each section with an `<h3>`, inside an app's settings part headed by its own `<h2>`.
- `scopes: { levels, permissions }` is the scope choice of "Create key…": an access level as a radio group with "No level" first, then extra permissions as checkboxes, each `{ value, label, line }`. Either group may be absent. Without `scopes`, a key is made with no scope. `keysCreatedElsewhere: { words, href }` puts the app's line and link in place of "Create key…", for a person who may not make keys here.
- `refreshLog()` on Account and security, and `refresh()` on the security log, read what the log gained since the newest entry shown, so the app refreshes it when it likes.
- `accountRunner(defineAction)` makes a runner from `@cplieger/reactive/actions`' `defineAction`: each write is an action under its name in `accountActions`, defined once with `sensitive: true` on first use, so the action log never holds a password, a code or a secret. Make one runner per page.
- The Help line under the sign-in panel is the app's own markup.

## Sign-in

Besides the options above, `mountSignIn` takes `username` to fill in, `next` (default: the `next` query value when it is a path on this origin, else "/"), `arrived`, `heading: false`, `state` when the app already read it, `place`, the name of the page where a person links single sign-on (default "Security"), and `onSignedIn({ next, cloneWarning })` (default: navigate to `next`). `cloneWarning` is true when one of the person's passkeys may have been copied, for the page they land on to say so.

The screen reads `state()` and draws what it allows: the password form, a passkey, single sign-on in its mode, the plain-HTTP lines or "This app needs HTTPS." A return from single sign-on that no account uses shows "Link this identity" with the `pending-link` part. A password that needs a second step swaps the form for that step in the same panel. With the `temporary-password` part, "Use a temporary password" under the password field takes an admin's temporary password.

`mountSetup` takes `token: { help, value }` to ask for the setup token, with `help` naming the command that prints it. The field starts with `value`, else the link's `#token=`. `onDone` runs once the account exists (default: navigate to "/"), and `onSetupComplete` when setup was already done (default: the sign-in page with "Setup is already done. Sign in."). `mountInvite` takes `token` (default: the link's `#token=`), `roleFromProvider` when the app takes each person's role from the identity provider, and `onSignedIn`.

## Account and security

`mountSecurity` also takes `rpId`, the app's passkey relying party ID (default: a passkey is usable here when this page's host is its `rp_id` or under it), `redirect`, where linking single sign-on comes back (default: this page), and `log: { kinds, everyone }`, which words the app's own log kinds and, with `everyone`, shows every entry in place of the viewer's own.

Every write runs through `stepUp`, so a refusal asking for a recent sign-in opens "Confirm it is you" with the action's own sentence, such as "Revoking a key needs a recent sign-in.", and a write that needs none costs nothing. A new secret, recovery code or temporary password shows once in a dialog, held with [secret](../forms/secret.md)'s `shownOnce`.

Rotate… calls `client.rotateKey(id)`. A client without it rotates by creating a key with the old key's label, scopes and remaining days, then revoking the old one, both under `auth.api_key_rotate`.

## Security log

`mountSecurityLog` takes `user`, to show only one account's entries with no account filter, `viewer`, the signed-in person's id so their entries read "You", `level`, `limit` (entries a page holds, 50 by default, at most 500), `kinds`, and `onQuery(params, replace)`. The view lives in the address: `order=oldest`, `kind`, `user`, and `before` or `after` a `seq`. By default `onQuery` writes it with `history.pushState`, or `replaceState` for an address that named no page, keeping every other parameter, and the screen follows `popstate`. An app that routes itself passes `onQuery` and calls `show(search)` when the address changes.

`kinds` maps a kind to its words, a string or a function of the entry, read before the library's own words for access's kinds.

## Users and access settings

`mountUsers` takes `level` (the invites and keys sections take the next), `redirect`, `invitePath`, the app's invite page, which reads the link's `#token=` (default "/invite"), and `onQuery(params, replace)` for the key filter `?key=<id>`, as the log does. It draws nothing that needs a second person in an app with one account.

`mountAccessSettings` draws for an owner only: the single sign-on mode, checked through `adminSSOReadiness` before `adminApplySSO`. "Authenticator app" and "Require a second factor" are the app's own settings, saved by its own form. Their words and the two refusals are in `defaultAccountWords`:

```html
<div class="cp-setting">
  <div>
    <label class="cp-label" for="totp">Authenticator app</label>
    <span class="cp-help">People can add an authenticator app for a code at sign-in. Turned off, each person's app is kept and works again once it is back on.</span>
  </div>
  <input class="cp-switch" id="totp" name="totp" type="checkbox" role="switch">
</div>
<div class="cp-setting">
  <div>
    <label class="cp-label" for="require-second-factor">Require a second factor</label>
    <span class="cp-help">Everyone who signs in with a password also needs an authenticator app or a passkey.</span>
    <span class="cp-field-error" id="require-second-factor-error" hidden></span>
  </div>
  <input class="cp-switch" id="require-second-factor" name="require_second_factor" type="checkbox" role="switch">
</div>
```

The app shows `settings.noWayToEnrol` on the field when its save would leave no second factor to set up, and `auth_second_factor_required.enable_without_second_factor` when the server refuses it because the owner holds none.

## Words

`defaultAccountWords` holds every word, and `wordsOf(overrides)` puts an app's on top. A word with a varying part is a function, such as `` "keys.rotateQuestion": (label) => `Rotate ${label}?` ``. The keys group by screen: `signIn.*`, `pending.*`, `setup.*`, `invite.*`, `link.*`, `stepUp.*`, `proof.*`, `plain.*`, `security.*`, `profile.*`, `methods.*`, `password.*`, `passkeys.*`, `totp.*`, `recoveryCode.*`, `oidc.*`, `sessions.*`, `keys.*`, `shown.*`, `log.*`, `users.*`, `invites.*` and `settings.*`. An answer's words are under its code, such as `auth_rate_limited`, or its code and reason, such as `auth_code_invalid.code_reused`. The `AccountWords` type lists every key.

## What each write is called

`accountActions` lists the names a runner sees, one per write: the sign-in steps (`auth.sign_in`, `auth.sign_in_passkey`, `auth.sign_in_code`, `auth.sign_in_recovery_code`, `auth.sign_in_second_passkey`, `auth.sign_in_set_password`, `auth.sign_in_set_passkey`, `auth.enrol_totp`, `auth.enrol_passkey`), setup and invites (`auth.setup`, `auth.setup_passkey`, `auth.invite_accept`, `auth.invite_accept_oidc`), linking (`auth.link_pending`, `auth.pending_create`, `auth.pending_link_admin`), step-up (`auth.step_up`, `auth.step_up_code`), Account and security (`auth.profile_save`, `auth.password_set`, `auth.password_remove`, `auth.passkey_add`, `auth.passkey_rename`, `auth.passkey_remove`, `auth.method_reenable`, `auth.totp_set_up`, `auth.totp_remove`, `auth.recovery_code_replace`, `auth.oidc_link`, `auth.oidc_unlink`, `auth.session_rename`, `auth.session_revoke`, `auth.sessions_revoke_others`, `auth.api_key_create`, `auth.api_key_rename`, `auth.api_key_revoke`, `auth.api_key_rotate`), and the admin's (`auth.admin_user_create`, `auth.admin_user_update`, `auth.admin_user_delete`, `auth.admin_temporary_password`, `auth.admin_reset_second_factor`, `auth.admin_owner`, `auth.admin_unlink_oidc`, `auth.admin_relink_oidc`, `auth.admin_invite`, `auth.admin_key_revoke`, `auth.admin_sso_apply`). A read is never an action.
