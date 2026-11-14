/**
 * words.ts — every word the account screens show, with the defaults from
 * docs/design-account.md. A host overrides any of them through a screen's
 * `words` option: a key named after an answer's code, or its code and
 * reason, holds that answer's words.
 * @module
 */

/** The page's address, for words that depend on how it was reached. */
export interface PageHost {
  /** `location.hostname`, such as "nas.lan" or "192.168.1.20". */
  readonly hostname: string;
  /** True at an IP address or `localhost`, false at any other name. */
  readonly ipOrLocalhost: boolean;
}

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

  readonly "setup.title": (app: string) => string;
  readonly "setup.token": string;
  readonly "setup.username": string;
  readonly "setup.usernameHelp": string;
  readonly "setup.password": string;
  readonly "setup.passwordHelp": string;
  readonly "setup.submit": string;
  readonly "setup.busy": string;
  readonly "setup.done": string;
  readonly "setup.passkey": string;
  readonly "setup.passkeyBusy": string;
  readonly "setup.tokenEmpty": string;
  readonly "setup.usernameEmpty": string;
  readonly "setup.passwordEmpty": string;
  /** The passkey offer after a password setup. */
  readonly "setup.offer": string;
  readonly "setup.offerAdd": string;
  readonly "setup.offerBusy": string;
  readonly "setup.offerDone": string;
  readonly "setup.offerSkip": string;
  readonly "setup.created": string;

  readonly "stepUp.title": string;
  readonly "stepUp.password": string;
  readonly "stepUp.code": string;
  readonly "stepUp.codeHelp": string;
  readonly "stepUp.confirm": string;
  readonly "stepUp.busy": string;
  readonly "stepUp.done": string;
  readonly "stepUp.cancel": string;
  readonly "stepUp.usePassword": string;
  readonly "stepUp.useCode": string;
  readonly "stepUp.usePasskey": string;
  readonly "stepUp.passkeyBusy": string;
  readonly "stepUp.useProvider": (provider: string) => string;
  readonly "stepUp.passwordEmpty": string;
  readonly "stepUp.codeFormat": string;
  /** A wrong password: the person is signed in, so it names the password. */
  readonly "stepUp.wrong": string;
  /** Password step-up was turned off after the methods were read. */
  readonly "stepUp.passwordOff": string;
  /** The account holds no method this page can confirm with. */
  readonly "stepUp.none": string;
  readonly "stepUp.https": string;
  /** Said when a rate limit's countdown ends. */
  readonly "stepUp.again": string;
  /** A plain session's fresh sign-in, in place of the step-up. */
  readonly "stepUp.signInTitle": string;
  readonly "stepUp.signIn": string;
  readonly "stepUp.signInBusy": string;
  /** The fresh sign-in needs a step this dialog does not hold. */
  readonly "stepUp.signInElsewhere": string;

  readonly "auth_code_invalid.code_invalid": string;
  readonly "auth_code_invalid.code_reused": string;
  /** `passkey`: the person can sign in with a passkey to unlock it. */
  readonly "auth_code_invalid.method_locked": (passkey: boolean) => string;
  readonly auth_totp_disabled: string;
  readonly auth_second_factor_unavailable: string;
  /** What HTTPS would add on a plain request, from `https_required`. */
  readonly "plain.withheld": (methods: readonly ("passkeys" | "oidc")[]) => string;
  /** The plain session's length, each part already worded ("12 hours"). */
  readonly "plain.session": (absolute: string, idle: string) => string;
  readonly "plain.needed": string;
  readonly "plain.open": (app: string) => string;
  readonly "plain.hours": (n: number) => string;
  readonly "plain.minutes": (n: number) => string;

  readonly "security.signedIn": (who: string, how: string) => string;
  /** How this session signed in, from `session.method`. */
  readonly "security.method": (method: string, provider: string) => string;
  readonly "security.plain": string;
  /** `time` is the session's end, such as "18:40". */
  readonly "security.plainUntil": (time: string) => string;
  readonly "security.needsHttps": string;
  readonly "security.cancel": string;
  /** A write that needs a recent sign-in, named for "Confirm it is you". */
  readonly "security.recent": string;

  readonly "profile.title": string;
  readonly "profile.username": string;
  readonly "profile.displayName": string;
  readonly "profile.save": string;
  readonly "profile.busy": string;
  readonly "profile.done": string;
  readonly "auth_bad_request.display_name_disallowed_character": string;
  readonly "auth_bad_request.display_name_too_long": string;

  readonly "methods.title": string;
  readonly "methods.method": string;
  readonly "methods.state": string;
  readonly "methods.actions": string;
  readonly "methods.actionsFor": (name: string) => string;
  readonly "methods.set": string;
  readonly "methods.notSet": string;
  readonly "methods.locked": string;
  /** A lock's line; `method` is the method's row name. */
  readonly "methods.lockedLine": (method: string) => string;
  readonly "methods.reenable": string;
  readonly "methods.unlock": string;
  readonly "methods.reenableBusy": string;
  /** The locked method can be turned back on only from a session signed in
   *  another way. */
  readonly "methods.reenableElsewhere": string;
  /** The identity provider manages the person's sign-in. */
  readonly "methods.ssoOnly": (provider: string) => string;

  readonly "password.title": string;
  readonly "password.change": string;
  readonly "password.changeShort": string;
  readonly "password.set": string;
  readonly "password.setShort": string;
  readonly "password.remove": string;
  readonly "password.changeTitle": string;
  readonly "password.setTitle": string;
  readonly "password.current": string;
  readonly "password.new": string;
  readonly "password.newHelp": string;
  readonly "password.save": string;
  readonly "password.busy": string;
  readonly "password.done": string;
  readonly "password.currentEmpty": string;
  readonly "password.newEmpty": string;
  readonly "password.wrong": string;
  readonly "password.changed": string;
  readonly "password.removeQuestion": string;
  readonly "password.removeSentence": string;
  readonly "password.removeAnswer": string;
  readonly "password.removed": string;
  readonly "password.recentSet": string;
  readonly "password.recentRemove": string;
  readonly auth_last_method: string;
  readonly "auth_last_method.last_second_factor": string;

  readonly "passkeys.title": string;
  readonly "passkeys.count": (n: number) => string;
  readonly "passkeys.add": string;
  readonly "passkeys.addShort": string;
  readonly "passkeys.addBusy": string;
  readonly "passkeys.added": string;
  readonly "passkeys.name": string;
  readonly "passkeys.created": string;
  readonly "passkeys.lastUsed": string;
  readonly "passkeys.where": string;
  readonly "passkeys.never": string;
  readonly "passkeys.synced": string;
  readonly "passkeys.device": string;
  readonly "passkeys.copied": string;
  readonly "passkeys.elsewhere": string;
  readonly "passkeys.rename": string;
  readonly "passkeys.renameLabel": (name: string) => string;
  readonly "passkeys.remove": string;
  readonly "passkeys.removeLabel": (name: string) => string;
  readonly "passkeys.removeQuestion": (name: string) => string;
  readonly "passkeys.removeSentence": string;
  readonly "passkeys.removeAnswer": string;
  readonly "passkeys.removed": (name: string) => string;
  /** A person whose one way in is a single passkey. */
  readonly "passkeys.second": string;
  readonly "passkeys.recentAdd": string;
  readonly "passkeys.recentRemove": string;

  readonly "rename.empty": string;
  readonly "rename.tooLong": (max: number) => string;
  readonly "auth_bad_request.label_disallowed_character": string;

  readonly "totp.title": string;
  readonly "totp.since": (date: string) => string;
  /** Enrolled, but the app has authenticator apps turned off. */
  readonly "totp.paused": string;
  readonly "totp.pausedLine": string;
  readonly "totp.setUp": string;
  readonly "totp.setUpShort": string;
  readonly "totp.replace": string;
  readonly "totp.remove": string;
  readonly "totp.removeShort": string;
  readonly "totp.setUpTitle": string;
  readonly "totp.replaceTitle": string;
  readonly "totp.scan": string;
  readonly "totp.key": string;
  readonly "totp.code": string;
  readonly "totp.codeHelp": string;
  readonly "totp.oldCode": string;
  readonly "totp.oldCodeHelp": string;
  readonly "totp.confirm": string;
  readonly "totp.busy": string;
  readonly "totp.done": string;
  readonly "totp.loading": string;
  readonly "totp.added": string;
  readonly "totp.replaced": string;
  readonly "totp.removeQuestion": string;
  readonly "totp.removeSentence": string;
  readonly "totp.removeAnswer": string;
  readonly "totp.removed": string;
  readonly "totp.recentSetUp": string;
  readonly "totp.recentRemove": string;
  readonly "totp.expired": string;
  readonly "auth_code_invalid.current_code_invalid": string;

  readonly "recoveryCode.title": string;
  readonly "recoveryCode.replace": string;
  readonly "recoveryCode.replaceLabel": string;
  readonly "recoveryCode.replaceQuestion": string;
  readonly "recoveryCode.replaceSentence": string;
  readonly "recoveryCode.replaceAnswer": string;
  readonly "recoveryCode.recent": string;
  readonly "recoveryCode.shownTitle": string;
  readonly "recoveryCode.shownLine": string;
  readonly "recoveryCode.label": string;
  readonly "recoveryCode.offline": string;
  readonly "recoveryCode.saved": string;
  readonly "recoveryCode.continue": string;
  readonly "recoveryCode.saveFirst": string;

  readonly "proof.title": string;
  readonly "proof.add": string;
  readonly "proof.remove": string;
  readonly "proof.replace": string;
  readonly "proof.removeTotp": string;
  readonly "proof.usePasskey": string;
  readonly "proof.passkeyBusy": string;

  readonly "shown.warning": string;
  readonly "shown.copy": string;
  readonly "shown.copied": string;
  readonly "shown.download": string;
  readonly "shown.done": string;

  readonly "oidc.title": string;
  readonly "oidc.linkedTo": (provider: string) => string;
  readonly "oidc.notLinked": string;
  readonly "oidc.link": (provider: string) => string;
  readonly "oidc.linkBusy": string;
  readonly "oidc.unlink": string;
  readonly "oidc.unlinkLabel": (provider: string) => string;
  readonly "oidc.unlinkQuestion": (provider: string) => string;
  readonly "oidc.unlinkSentence": (provider: string) => string;
  readonly "oidc.unlinkAnswer": string;
  readonly "oidc.unlinked": (provider: string) => string;
  readonly "oidc.linked": (provider: string) => string;
  readonly auth_identity_taken: string;
  readonly auth_already_linked: string;

  readonly "arrived.session-ended": string;
  readonly "arrived.setup-complete": string;
  readonly "arrived.password-set": string;
  readonly "arrived.transport-changed": string;

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

  /** A function words it by the address the page was opened at. */
  readonly auth_setup_token_required: string | ((page: PageHost) => string);
  readonly auth_token_invalid: string;
  readonly auth_breach_check_unavailable: string;
  /** A refused new password; `min` and `max` are the answer's bounds. */
  readonly "auth_password_rejected.too_short": (min: number, max: number) => string;
  readonly "auth_password_rejected.too_long": (min: number, max: number) => string;
  readonly "auth_password_rejected.contains_username": string;
  readonly "auth_password_rejected.contains_forbidden_word": string;
  readonly "auth_password_rejected.common": string;
  readonly "auth_password_rejected.breached": string;
  readonly auth_password_rejected: string;
  readonly "auth_forbidden.no_usable_method": string;

  readonly "register.duplicate": string;
  readonly "register.not-discoverable": string;

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

  "setup.title": (app) => `Set up ${app}`,
  "setup.token": "Setup token",
  "setup.username": "Username",
  "setup.usernameHelp": "Letters, digits, dots, dashes and underscores. No spaces.",
  "setup.password": "Password",
  "setup.passwordHelp": "15 to 128 characters. A few unrelated words make a strong one.",
  "setup.submit": "Create account",
  "setup.busy": "Creating account…",
  "setup.done": "Account created",
  "setup.passkey": "Create with a passkey",
  "setup.passkeyBusy": "Waiting for your passkey…",
  "setup.tokenEmpty": "Enter the setup token.",
  "setup.usernameEmpty": "Enter a username.",
  "setup.passwordEmpty": "Enter a password.",
  "setup.offer":
    "Add a passkey to sign in without typing your password. You can also add one later.",
  "setup.offerAdd": "Add a passkey",
  "setup.offerBusy": "Waiting for your passkey…",
  "setup.offerDone": "Passkey added",
  "setup.offerSkip": "Skip",
  "setup.created": "Your account is ready.",

  "stepUp.title": "Confirm it is you",
  "stepUp.password": "Password",
  "stepUp.code": "Code",
  "stepUp.codeHelp": "Enter the 6-digit code from your authenticator app.",
  "stepUp.confirm": "Confirm",
  "stepUp.busy": "Confirming…",
  "stepUp.done": "Confirmed",
  "stepUp.cancel": "Cancel",
  "stepUp.usePassword": "Use your password",
  "stepUp.useCode": "Use your authenticator app",
  "stepUp.usePasskey": "Use a passkey",
  "stepUp.passkeyBusy": "Waiting for your passkey…",
  "stepUp.useProvider": (provider) => `Use ${provider}`,
  "stepUp.passwordEmpty": "Enter your password.",
  "stepUp.codeFormat": "Enter the 6 digits from your authenticator app.",
  "stepUp.wrong": "The password is wrong.",
  "stepUp.passwordOff": "Password sign-in is turned off. Confirm it is you another way.",
  "stepUp.none":
    "Nothing on this account can confirm it is you here. Sign out, then sign in again.",
  "stepUp.https": "Confirming it is you needs HTTPS. Open the app over HTTPS to do this.",
  "stepUp.again": "You can try again.",
  "stepUp.signInTitle": "Sign in again to continue",
  "stepUp.signIn": "Sign in",
  "stepUp.signInBusy": "Signing in…",
  "stepUp.signInElsewhere":
    "This sign-in needs another step. Sign out, then sign in on the sign-in page.",

  "auth_code_invalid.code_invalid": "That code is not right.",
  "auth_code_invalid.code_reused":
    "That code was already used. Wait for the next one. If you did not just sign in elsewhere, someone else may have, and you should change your password.",
  "auth_code_invalid.method_locked": (passkey) =>
    passkey
      ? "Too many wrong codes. Sign in with a passkey to unlock it, or ask an admin to reset your authenticator app."
      : "Too many wrong codes. Ask an admin to reset your authenticator app.",
  auth_totp_disabled: "Authenticator apps were just turned off in this app.",
  auth_second_factor_unavailable:
    "Codes from an authenticator app cannot be checked right now. Try again later, or confirm it is you another way.",

  "plain.withheld": (methods) =>
    methods.length === 2
      ? "Passkeys and single sign-on need HTTPS."
      : methods[0] === "oidc"
        ? "Single sign-on needs HTTPS."
        : "Passkeys need HTTPS.",
  "plain.session": (absolute, idle) =>
    `You stay signed in for up to ${absolute}, ${idle} when idle, until you close the browser.`,
  "plain.needed": "This app needs HTTPS.",
  "plain.open": (app) => `Open ${app} over HTTPS`,
  "plain.hours": (n) => (n === 1 ? "1 hour" : `${String(n)} hours`),
  "plain.minutes": (n) => (n === 1 ? "1 minute" : `${String(n)} minutes`),

  "security.signedIn": (who, how) => `Signed in as ${who} with ${how}.`,
  "security.method": (method, provider) => {
    switch (method) {
      case "password":
        return "a password";
      case "passkey":
        return "a passkey";
      case "oidc":
        return provider;
      default:
        return "another way";
    }
  },
  "security.plain": "Plain HTTP",
  "security.plainUntil": (time) => `This session ends at ${time}, or when you close the browser.`,
  "security.needsHttps": "Needs HTTPS.",
  "security.cancel": "Cancel",
  "security.recent": "This change needs a recent sign-in.",

  "profile.title": "Profile",
  "profile.username": "Username",
  "profile.displayName": "Display name",
  "profile.save": "Save profile",
  "profile.busy": "Saving…",
  "profile.done": "Saved",
  "auth_bad_request.display_name_disallowed_character":
    "Keep it on one line, with no control characters.",
  "auth_bad_request.display_name_too_long": "Use at most 128 characters.",

  "methods.title": "Sign-in methods",
  "methods.method": "Method",
  "methods.state": "State",
  "methods.actions": "Actions",
  "methods.actionsFor": (name) => `Actions for ${name}`,
  "methods.set": "Set",
  "methods.notSet": "Not set",
  "methods.locked": "Turned off",
  "methods.lockedLine": (method) => `${method} was turned off after many failed attempts.`,
  "methods.reenable": "Turn it back on",
  "methods.unlock": "Unlock",
  "methods.reenableBusy": "Turning on…",
  "methods.reenableElsewhere": "Sign in with another method first, then turn this one back on.",
  "methods.ssoOnly": (provider) => `${provider} manages how you sign in.`,

  "password.title": "Password",
  "password.change": "Change password…",
  "password.changeShort": "Change…",
  "password.set": "Set a password…",
  "password.setShort": "Set…",
  "password.remove": "Remove password…",
  "password.changeTitle": "Change password",
  "password.setTitle": "Set a password",
  "password.current": "Current password",
  "password.new": "New password",
  "password.newHelp": "15 to 128 characters. A few unrelated words make a strong one.",
  "password.save": "Save password",
  "password.busy": "Saving…",
  "password.done": "Saved",
  "password.currentEmpty": "Enter your current password.",
  "password.newEmpty": "Enter a new password.",
  "password.wrong": "The current password is wrong.",
  "password.changed": "Password saved.",
  "password.removeQuestion": "Remove your password?",
  "password.removeSentence":
    "You will sign in with your passkeys or single sign-on only. Enter your current password to remove it.",
  "password.removeAnswer": "Remove password",
  "password.removed": "Password removed.",
  "password.recentSet": "Setting a password needs a recent sign-in.",
  "password.recentRemove": "Removing your password needs a recent sign-in.",
  auth_last_method: "Add a passkey or link single sign-on before you remove this.",
  "auth_last_method.last_second_factor":
    "This app requires a second factor. Set up another one before you remove this.",

  "passkeys.title": "Passkeys",
  "passkeys.count": (n) => (n === 1 ? "1 passkey" : `${String(n)} passkeys`),
  "passkeys.add": "Add a passkey",
  "passkeys.addShort": "Add",
  "passkeys.addBusy": "Waiting for your passkey…",
  "passkeys.added": "Passkey added.",
  "passkeys.name": "Name",
  "passkeys.created": "Added",
  "passkeys.lastUsed": "Last used",
  "passkeys.where": "Where",
  "passkeys.never": "Never",
  "passkeys.synced": "Synced",
  "passkeys.device": "This device only",
  "passkeys.copied": "May be copied",
  "passkeys.elsewhere": "Not usable here",
  "passkeys.rename": "Rename…",
  "passkeys.renameLabel": (name) => `Rename ${name}`,
  "passkeys.remove": "Remove…",
  "passkeys.removeLabel": (name) => `Remove ${name}`,
  "passkeys.removeQuestion": (name) => `Remove ${name}?`,
  "passkeys.removeSentence": "You can no longer sign in with it.",
  "passkeys.removeAnswer": "Remove passkey",
  "passkeys.removed": (name) => `${name} removed.`,
  "passkeys.second": "Add a second passkey in case you lose this one.",
  "passkeys.recentAdd": "Adding a passkey needs a recent sign-in.",
  "passkeys.recentRemove": "Removing a passkey needs a recent sign-in.",

  "rename.empty": "Give it a name.",
  "rename.tooLong": (max) => `Use at most ${String(max)} characters.`,
  "auth_bad_request.label_disallowed_character": "Keep it on one line, with no control characters.",

  "totp.title": "Authenticator app",
  "totp.since": (date) => `Set up ${date}`,
  "totp.paused": "Off in this app",
  "totp.pausedLine": "Authenticator apps are turned off in this app. Yours is kept.",
  "totp.setUp": "Set up an authenticator app",
  "totp.setUpShort": "Set up",
  "totp.replace": "Replace authenticator app",
  "totp.remove": "Remove authenticator app…",
  "totp.removeShort": "Remove…",
  "totp.setUpTitle": "Set up an authenticator app",
  "totp.replaceTitle": "Replace authenticator app",
  "totp.scan": "Scan this code with your authenticator app, or type the key.",
  "totp.key": "Or type this key",
  "totp.code": "Code from the app",
  "totp.codeHelp": "Enter the 6-digit code the app shows now.",
  "totp.oldCode": "Code from your current app",
  "totp.oldCodeHelp": "The app you are replacing, so we know it is still yours.",
  "totp.confirm": "Turn on",
  "totp.busy": "Checking…",
  "totp.done": "Turned on",
  "totp.loading": "Making a key…",
  "totp.added": "Authenticator app set up. Sign-in now asks for its code.",
  "totp.replaced": "Authenticator app replaced. The old one no longer works.",
  "totp.removeQuestion": "Remove your authenticator app?",
  "totp.removeSentence": "Signing in will no longer ask for its code.",
  "totp.removeAnswer": "Remove app",
  "totp.removed": "Authenticator app removed.",
  "totp.recentSetUp": "Setting up an authenticator app needs a recent sign-in.",
  "totp.recentRemove": "Removing your authenticator app needs a recent sign-in.",
  "totp.expired": "This setup timed out. Start again.",
  "auth_code_invalid.current_code_invalid": "That code is not right for your current app.",

  "recoveryCode.title": "Recovery code",
  "recoveryCode.replace": "Replace…",
  "recoveryCode.replaceLabel": "Replace recovery code…",
  "recoveryCode.replaceQuestion": "Replace your recovery code?",
  "recoveryCode.replaceSentence": "The one you saved stops working at once.",
  "recoveryCode.replaceAnswer": "Replace code",
  "recoveryCode.recent": "Replacing your recovery code needs a recent sign-in.",
  "recoveryCode.shownTitle": "Your recovery code",
  "recoveryCode.shownLine":
    "If you lose your authenticator app, this code signs you in once. It is shown only now.",
  "recoveryCode.label": "Recovery code",
  "recoveryCode.offline": "Keep it offline, such as on paper, away from this device.",
  "recoveryCode.saved": "I saved my recovery code",
  "recoveryCode.continue": "Continue",
  "recoveryCode.saveFirst": "Save the recovery code first, then check the box.",

  "proof.title": "Confirm with your second factor",
  "proof.add": "Adding a passkey needs a code from your authenticator app or one of your passkeys.",
  "proof.remove":
    "Removing a passkey needs a code from your authenticator app or one of your passkeys.",
  "proof.replace":
    "A new recovery code needs a code from your authenticator app or one of your passkeys.",
  "proof.removeTotp":
    "Removing your authenticator app needs a code from it or one of your passkeys.",
  "proof.usePasskey": "Use a passkey",
  "proof.passkeyBusy": "Waiting for your passkey…",

  "shown.warning": "Copy it now. It will not be shown again.",
  "shown.copy": "Copy",
  "shown.copied": "Copied",
  "shown.download": "Download",
  "shown.done": "Done",

  "oidc.title": "Single sign-on",
  "oidc.linkedTo": (provider) => `Linked to ${provider}`,
  "oidc.notLinked": "Not linked",
  "oidc.link": (provider) => `Link ${provider}`,
  "oidc.linkBusy": "Opening…",
  "oidc.unlink": "Unlink…",
  "oidc.unlinkLabel": (provider) => `Unlink ${provider}…`,
  "oidc.unlinkQuestion": (provider) => `Unlink ${provider}?`,
  "oidc.unlinkSentence": (provider) => `You will no longer sign in here with ${provider}.`,
  "oidc.unlinkAnswer": "Unlink",
  "oidc.unlinked": (provider) => `${provider} is unlinked.`,
  "oidc.linked": (provider) => `${provider} is linked. You can sign in with it.`,
  auth_identity_taken: "That identity is linked to another account.",
  auth_already_linked: "Your account already has a single sign-on identity. Unlink it first.",

  "arrived.session-ended": "Your session ended. Sign in to continue.",
  "arrived.setup-complete": "Setup is already done. Sign in.",
  "arrived.password-set": "Password set. Sign in with it.",
  "arrived.transport-changed":
    "You were signed out because the connection changed between HTTP and HTTPS.",

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

  auth_setup_token_required: "Enter the setup token.",
  auth_token_invalid: "That setup token does not work. Make a new one with the command above.",
  auth_breach_check_unavailable:
    "The password check is not answering. Try again in a moment. Your password can stay as it is.",
  "auth_password_rejected.too_short": (min, max) =>
    `Use ${String(min)} to ${String(max)} characters.`,
  "auth_password_rejected.too_long": (min, max) =>
    `Use ${String(min)} to ${String(max)} characters.`,
  "auth_password_rejected.contains_username": "Leave your username out of the password.",
  "auth_password_rejected.contains_forbidden_word":
    'Leave the app\'s name and words like "password" out of it.',
  "auth_password_rejected.common": "That password is too common. Choose another.",
  "auth_password_rejected.breached": "That password has appeared in a data breach. Choose another.",
  auth_password_rejected: "Choose another password.",
  "auth_forbidden.no_usable_method":
    "This app allows no second factor this account can set up. Ask an administrator.",

  "register.duplicate": "That passkey is already on your account.",
  "register.not-discoverable":
    "That authenticator cannot keep a passkey for this app. Try another one.",

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

/** Reads `hostname` (a `location.hostname`) into a `PageHost`. The URL
 *  parser has already written an IPv4 address as four decimal parts and
 *  put an IPv6 one in brackets. */
export function pageHost(hostname: string): PageHost {
  const ipOrLocalhost =
    hostname === "localhost" ||
    hostname.startsWith("[") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  return { hostname, ipOrLocalhost };
}
