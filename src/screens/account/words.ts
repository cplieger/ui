/**
 * words.ts — every word the account screens show, with the defaults from
 * docs/design-account.md. A host overrides any of them through a screen's
 * `words` option: a key named after an answer's code, or its code and
 * reason, holds that answer's words.
 * @module
 */

import type { LogEntryView } from "./client.js";

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
  /** `auth_unavailable` on a signed-in screen. */
  readonly "generic.unavailable": string;
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
  /** The app's name, in "Open Release tracker over HTTPS", when the host
   *  gives none. */
  readonly "signIn.app": string;
  readonly "signIn.temporary": string;
  readonly "signIn.ownPassword": string;
  readonly "signIn.temporaryLabel": string;
  readonly "signIn.temporaryHelp": string;
  /** On a plain screen where a temporary password cannot finish; `origin`
   *  is the app's HTTPS address when it named one. */
  readonly "signIn.temporaryHttps": (origin: string | undefined) => string;
  /** The refusal before sending a typed value that reads as a temporary
   *  password, on such a screen. */
  readonly "signIn.looksTemporary": (origin: string | undefined) => string;
  readonly "auth_https_required.temporary_password_exposed": (origin: string | undefined) => string;
  /** `auth_https_required` at the first step: the next one needs HTTPS. */
  readonly "signIn.nextNeedsHttps": string;
  readonly "auth_second_factor_required.enrol_needs_known_device": string;
  /** `auth_forbidden` `no_usable_method` on the sign-in screen, or a step
   *  holding no method this page can run. */
  readonly "signIn.noUsableMethod": string;
  readonly auth_sso_only: string;
  /** Under `sso: "only"`, the one provider button. */
  readonly "sso.only": (provider: string) => string;
  readonly "sso.forLinked": (provider: string) => string;
  readonly "sso.ownerSignIn": string;
  readonly "sso.ownerLine": string;

  readonly "pending.code": string;
  readonly "pending.codeHelp": string;
  readonly "pending.continue": string;
  readonly "pending.busy": string;
  readonly "pending.done": string;
  readonly "pending.usePasskey": string;
  readonly "pending.passkeyLine": string;
  readonly "pending.passkeyBusy": string;
  readonly "pending.useRecovery": string;
  readonly "pending.useCode": string;
  readonly "pending.recovery": string;
  readonly "pending.recoveryHelp": string;
  readonly "pending.recoveryFormat": string;
  readonly "pending.choose": string;
  readonly "pending.chooseLine": string;
  readonly "pending.newPassword": string;
  readonly "pending.save": string;
  readonly "pending.saveBusy": string;
  readonly "pending.registerInstead": string;
  readonly "pending.registerPasskey": string;
  readonly "pending.enrol": string;
  readonly "pending.recovered": string;
  readonly "pending.enrolLine": string;
  readonly "pending.startAgain": string;
  readonly "pending.timedOut": string;
  readonly "pending.unavailable": string;
  readonly "pending.passwordOff": string;
  readonly "pending.waiting": string;
  readonly "pending.newPasswordEmpty": string;
  /** `passkey`: the person can sign in with a passkey to unlock it. */
  readonly "pending.recoveryLocked": (passkey: boolean) => string;
  readonly "auth_password_rejected.is_temporary_password": string;

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
  /** `auth_second_factor_required` `second_factor_held`: a password
   *  step-up offered from a `me()` read before a second factor was held. */
  readonly "stepUp.secondFactorHeld": string;
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
  readonly "arrived.signed-out": string;

  readonly "sessions.title": string;
  readonly "sessions.device": string;
  readonly "sessions.method": string;
  readonly "sessions.lastActive": string;
  readonly "sessions.address": string;
  readonly "sessions.this": string;
  /** A session whose browser the user agent does not name. */
  readonly "sessions.unknownDevice": string;
  readonly "sessions.browserOn": (browser: string, system: string) => string;
  readonly "sessions.rename": string;
  readonly "sessions.renameLabel": (name: string) => string;
  readonly "sessions.signOut": string;
  readonly "sessions.signOutLabel": (name: string) => string;
  readonly "sessions.signedOut": (name: string) => string;
  readonly "sessions.others": string;
  readonly "sessions.othersQuestion": string;
  readonly "sessions.othersSentence": string;
  readonly "sessions.othersAnswer": (n: number) => string;
  readonly "sessions.othersBusy": string;
  readonly "sessions.othersDone": string;
  /** A plain session's end, such as "18:40". */
  readonly "sessions.plainUntil": (time: string) => string;

  readonly "keys.title": string;
  readonly "keys.label": string;
  readonly "keys.key": string;
  readonly "keys.scopes": string;
  readonly "keys.expires": string;
  readonly "keys.lastUsed": string;
  readonly "keys.state": string;
  readonly "keys.never": string;
  readonly "keys.notUsed": string;
  /** A key made before labels were required. */
  readonly "keys.unnamed": string;
  readonly "keys.noScope": string;
  /** The key that minted this one, by its label. */
  readonly "keys.mintedBy": (label: string) => string;
  /** A minting key no longer in the list. */
  readonly "keys.revokedParent": (id: number) => string;
  readonly "keys.active": string;
  readonly "keys.retiring": (time: string) => string;
  readonly "keys.retiringLine": (time: string) => string;
  readonly "keys.expired": (date: string) => string;
  readonly "keys.empty": string;
  readonly "keys.create": string;
  readonly "keys.createTitle": string;
  readonly "keys.labelHelp": string;
  readonly "keys.level": string;
  readonly "keys.noLevel": string;
  readonly "keys.permissions": string;
  readonly "keys.scopeNeeded": string;
  readonly "keys.expiresIn": string;
  readonly "keys.days": (n: number) => string;
  readonly "keys.createSubmit": string;
  readonly "keys.createBusy": string;
  readonly "keys.created": (label: string) => string;
  readonly "keys.labelEmpty": string;
  readonly "keys.recent": string;
  readonly "keys.createdTitle": (label: string) => string;
  readonly "keys.secret": string;
  readonly "keys.rename": string;
  readonly "keys.renameLabel": (label: string) => string;
  readonly "keys.rotate": string;
  readonly "keys.rotateLabel": (label: string) => string;
  readonly "keys.rotateQuestion": (label: string) => string;
  /** `overlap` is how long the current secret keeps working, such as
   *  "1 hour". */
  readonly "keys.rotateSentence": (overlap: string) => string;
  /** Rotating a Retiring key: its older secret goes. */
  readonly "keys.rotateAgain": string;
  readonly "keys.rotateLeaked": string;
  readonly "keys.rotateAnswer": string;
  readonly "keys.rotateBusy": string;
  readonly "keys.rotateRecent": string;
  readonly "keys.rotatedTitle": (label: string) => string;
  readonly "keys.rotatedLine": (time: string) => string;
  /** Rotate on a server with no rotation: a new key, the old one revoked. */
  readonly "keys.swappedLine": string;
  readonly "keys.swapRevokeFailed": string;
  readonly "keys.overlap": string;
  readonly "keys.revoke": string;
  readonly "keys.revokeLabel": (label: string) => string;
  /** `minted` is how many keys it minted, which go with it. */
  readonly "keys.revokeQuestion": (label: string, minted: number) => string;
  readonly "keys.revokeSentence": string;
  readonly "keys.revokeRecent": string;
  readonly "keys.revokeAnswer": string;
  readonly "keys.revoked": (label: string) => string;
  readonly "keys.gone": string;
  /** An expired key's Rotate, refused. */
  readonly "keys.expiredRefused": string;
  /** A credential beside the session failed on a key route. */
  readonly "keys.signInAgain": string;
  readonly "keys.everyTitle": string;
  readonly "keys.noneAnywhere": string;
  readonly "keys.owner": string;
  readonly "keys.invites": string;
  /** A key no other key minted, on the every-account table. */
  readonly "keys.bySession": string;
  readonly "keys.reached": string;
  readonly "keys.reachedBy": (label: string) => string;
  readonly "keys.invitesOf": (label: string, count: number) => string;
  readonly "keys.inviteLine": (i: {
    readonly purpose: string;
    readonly role: string | undefined;
    readonly made: string;
    readonly until: string;
  }) => string;
  /** The admin's revoke: what goes with the key, and what stays. */
  readonly "keys.revokeAnySentence": (minted: number, invites: number) => string;

  readonly "users.title": string;
  readonly "users.person": string;
  readonly "users.role": string;
  readonly "users.signIn": string;
  readonly "users.state": string;
  readonly "users.roleOf": (role: string) => string;
  readonly "users.fromProvider": string;
  readonly "users.owner": string;
  readonly "users.you": string;
  readonly "users.enabled": string;
  readonly "users.disabled": string;
  readonly "users.waiting": string;
  /** A person's ways in, as one list. */
  readonly "users.ways": (ways: {
    readonly password: boolean;
    readonly passkeys: number;
    readonly totp: boolean;
    readonly oidc: string | undefined;
  }) => string;
  readonly "users.temporaryUntil": (until: string) => string;
  readonly "users.dormant": string;
  readonly "users.forbidden": string;
  readonly "users.recent": string;
  readonly "users.gone": string;
  readonly "users.approve": string;
  readonly "users.approveLabel": (name: string) => string;
  readonly "users.approved": (name: string) => string;
  readonly "users.edit": string;
  readonly "users.editTitle": (name: string) => string;
  readonly "users.editSubmit": string;
  readonly "users.editBusy": string;
  readonly "users.canSignIn": string;
  readonly "users.roleSynced": string;
  readonly "users.saved": (name: string) => string;
  readonly "users.temporary": string;
  readonly "users.temporaryTitle": (name: string) => string;
  /** `keeps`: the person's own methods stay, as single sign-on only keeps
   *  an unlinked person's. */
  readonly "users.temporaryDoes": (name: string, keeps: boolean) => string;
  readonly "users.relink": string;
  readonly "users.relinkTitle": (name: string) => string;
  readonly "users.relinkDoes": (name: string, provider: string) => string;
  readonly "users.lasts": string;
  readonly "users.hours": (hours: number) => string;
  readonly "users.revokePasskeys": string;
  readonly "users.revokePasskeysHelp": string;
  readonly "users.keepKeys": string;
  readonly "users.keepKeysHelp": string;
  readonly "users.temporarySubmit": string;
  readonly "users.relinkSubmit": string;
  readonly "users.temporaryBusy": string;
  readonly "users.temporaryShown": (name: string) => string;
  readonly "users.temporaryLabel": string;
  readonly "users.temporaryGive": (name: string, until: string) => string;
  readonly "users.temporaryHttps": (origin: string) => string;
  readonly "users.temporaryDormant": (
    name: string,
    provider: string,
    origin: string,
    until: string,
  ) => string;
  readonly "users.passwordKept": (name: string) => string;
  readonly "users.reset": string;
  readonly "users.resetTitle": (name: string) => string;
  readonly "users.resetSentence": string;
  readonly "users.resetAnswer": string;
  readonly "users.resetDone": (name: string) => string;
  readonly "users.makeOwner": string;
  readonly "users.makeOwnerTitle": (name: string) => string;
  readonly "users.makeOwnerSentence": string;
  readonly "users.removeOwner": string;
  readonly "users.removeOwnerTitle": (name: string) => string;
  readonly "users.removeOwnerSentence": string;
  readonly "users.ownerDone": (name: string, owner: boolean) => string;
  readonly "users.unlink": string;
  readonly "users.unlinkTitle": (name: string, provider: string) => string;
  /** What the person can do once unlinked: sign in with their own
   *  password or passkey, nothing until an admin issues a temporary
   *  password, or only through an admin's link. */
  readonly "users.unlinkNext": (name: string, next: "own" | "none" | "admin-link") => string;
  readonly "users.unlinkAnswer": string;
  readonly "users.unlinked": (name: string, provider: string) => string;
  readonly "users.delete": string;
  readonly "users.deleteTitle": (name: string) => string;
  readonly "users.deleteSentence": string;
  readonly "users.deleteAnswer": string;
  readonly "users.deleted": (name: string) => string;
  readonly "users.add": string;
  readonly "users.addTitle": string;
  readonly "users.addSentence": string;
  readonly "users.username": string;
  readonly "users.addSubmit": string;
  readonly "users.addBusy": string;
  readonly "users.added": (name: string) => string;
  readonly "users.addedNoPassword": (name: string) => string;
  readonly "users.invite": string;
  readonly "users.inviteTitle": string;
  readonly "users.inviteSentence": string;
  readonly "users.inviteSubmit": string;
  readonly "users.inviteBusy": string;
  readonly "users.inviteShown": string;
  readonly "users.inviteLabel": string;
  readonly "users.inviteLine": (until: string) => string;
  readonly "users.invited": string;
  readonly "users.through": string;
  readonly "users.keyPath": (name: string) => string;
  readonly "users.keyName": (id: number) => string;
  readonly "users.reachedTitle": (label: string) => string;
  readonly "users.showAll": string;
  readonly "users.reachedNone": string;
  readonly "invites.title": string;
  readonly "invites.kind": string;
  readonly "invites.made": string;
  readonly "invites.until": string;
  readonly "invites.by": string;
  readonly "invites.purpose": (purpose: string) => string;
  readonly "invites.byKey": (label: string) => string;
  readonly "invites.bySession": string;
  readonly "invites.empty": string;
  readonly "auth_forbidden.self_recovery": string;
  readonly "auth_forbidden.owner_target": string;
  readonly "auth_forbidden.owner_role": string;
  readonly "auth_forbidden.owner_needs_local_method": string;
  readonly "auth_forbidden.last_owner": string;
  readonly "auth_sso_only.linked": string;

  readonly "log.title": string;
  readonly "log.help": string;
  readonly "log.when": string;
  readonly "log.what": string;
  /** The account an entry is about. */
  readonly "log.account": string;
  readonly "log.who": string;
  readonly "log.where": string;
  readonly "log.type": string;
  /** An entry's class, `change` or `session`, as its chip. */
  readonly "log.classOf": (logClass: string) => string;
  /** The words of a kind of access's own, undefined for a kind it does
   *  not know. `how` words a sign-in method, as "a passkey". */
  readonly "log.kind": (entry: LogEntryView, how: (method: string) => string) => string | undefined;
  readonly "log.you": string;
  readonly "log.person": (id: number) => string;
  /** A key that acted; `label` is absent on a key with none. */
  readonly "log.key": (label: string | undefined) => string;
  /** `channel` names the out-of-band call, such as the admin socket. */
  readonly "log.outOfBand": (channel: string) => string;
  /** An entry with no actor, such as a lock the app's sweep reported. */
  readonly "log.nobody": string;
  /** Each count is already written in the page's language. */
  readonly "log.counts": (changes: string, sessions: string) => string;
  readonly "log.evicted": (count: string) => string;
  readonly "log.filterKind": string;
  readonly "log.everyKind": string;
  /** The kind filter's group of the app's own kinds. */
  readonly "log.appKinds": string;
  readonly "log.groupOf": (logClass: string) => string;
  readonly "log.filterPerson": string;
  readonly "log.everyone": string;
  readonly "log.order": string;
  readonly "log.newestFirst": string;
  readonly "log.oldestFirst": string;
  readonly "log.pages": string;
  readonly "log.newer": string;
  readonly "log.older": string;
  readonly "log.earlier": string;
  readonly "log.later": string;
  /** The times of a page's first and last entries. */
  readonly "log.range": (from: string, to: string) => string;
  readonly "log.empty": string;
  readonly "log.emptyFiltered": string;
  readonly "log.clear": string;
  readonly "log.arrived": (count: number) => string;
  readonly "log.forbidden": string;
  readonly "log.unknownKind": string;
  readonly "log.badPage": string;
  readonly "log.newest": string;
  readonly auth_key_label_taken: (label: string) => string;
  /** `scope` is the scope the server named, when it named one. */
  readonly auth_unknown_scope: (scope: string | undefined) => string;
  readonly auth_body_too_large: string;
  readonly auth_forbidden: string;
  readonly auth_session_required: string;

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
  /** Setting up an authenticator app on an account with no password,
   *  from a `me()` read before the password went. */
  readonly "auth_forbidden.totp_needs_password": string;

  readonly "link.title": string;
  /** `who` is the provider's name for the person, when it sent one. */
  readonly "link.as": (provider: string, who: string | undefined) => string;
  readonly "link.existing": string;
  readonly "link.existingLine": (provider: string) => string;
  readonly "link.adminLine": string;
  readonly "link.username": string;
  readonly "link.temporary": string;
  readonly "link.submit": string;
  readonly "link.busy": string;
  readonly "link.done": string;
  readonly "link.usernameEmpty": string;
  readonly "link.temporaryEmpty": string;
  readonly "link.wrong": string;
  readonly "link.notNow": string;
  readonly "link.create": string;
  readonly "link.createLine": (provider: string) => string;
  /** The pending sign-in lapsed: start over at the provider. */
  readonly "link.expired": (provider: string) => string;
  /** Signed in, but linking the identity was refused with words of its
   *  own. */
  readonly "link.continue": string;
  readonly auth_username_taken: string;
  /** A pending create through an invite used or revoked meanwhile. */
  readonly "auth_token_invalid.invite": string;
  readonly "auth_forbidden.provisioning_disabled": string;
  readonly "auth_forbidden.single_owner": string;

  readonly "invite.title": (app: string) => string;
  readonly "invite.provider": (provider: string) => string;
  readonly "invite.providerBusy": string;
  readonly "invite.forward": string;
  readonly "invite.role": (provider: string) => string;
  readonly "invite.broken": string;
  readonly "invite.off": string;

  readonly "register.duplicate": string;
  readonly "register.not-discoverable": string;

  readonly "passkey.timeout": string;
  readonly "passkey.ceremony-expired": string;
  readonly "passkey.unknown-credential": string;
  readonly "passkey.verification-failed": string;
  readonly "passkey.failed": string;
}

const outOfTime = "The passkey request ran out of time. Try again.";

const ROLE: Readonly<Record<string, string>> = { admin: "an admin", user: "a user" };
const roleOf = (role: string): string => (Object.hasOwn(ROLE, role) ? (ROLE[role] ?? role) : role);

/** The method a lock or its re-enable names, as its own subject. */
function lockOf(method: string): string {
  switch (method) {
    case "password":
      return "Password sign-in";
    case "totp":
      return "The authenticator app";
    case "recovery_code":
      return "The recovery code";
    case "passkey":
      return "Passkey sign-in";
    default:
      return "A sign-in method";
  }
}

/** Every kind access logs, from its docs/security-log.md and the kinds
 *  its Parts 4 and 5 add. */
function logKind(e: LogEntryView, how: (method: string) => string): string | undefined {
  const by =
    e.method === "password" || e.method === "passkey" || e.method === "oidc"
      ? ` with ${how(e.method)}`
      : "";
  const sso = how("oidc");
  switch (e.kind) {
    case "signed_in":
      return `Signed in${by}`;
    case "stepped_up":
      return `Confirmed a recent sign-in${by}`;
    case "session_revoked": {
      const n = e.session_ids?.length ?? 1;
      if (e.detail === "transport_changed") {
        return "Signed out: the connection changed between HTTP and HTTPS";
      }
      if (e.detail === "signed_in_again") {
        return "Signed out by a fresh sign-in";
      }
      return n > 1 ? `Signed out ${String(n)} sessions` : "Signed out";
    }
    case "user_sessions_revoked":
      return "Signed out everywhere else";
    case "password_set":
      return "Password set";
    case "password_changed":
      return "Password changed";
    case "password_removed":
      return "Password removed";
    case "passkey_added":
      return "Passkey added";
    case "passkey_removed":
      return "Passkey removed";
    case "oidc_linked":
      return `Linked to ${sso}`;
    case "oidc_unlinked":
      return `Unlinked from ${sso}`;
    case "setup_token_issued":
      return "Setup token issued";
    case "recovery_issued":
      return "Recovery link issued";
    case "recovery_consumed":
      return "Recovery link opened";
    case "recovery_completed":
      return e.method === "password"
        ? "Recovered with a new password"
        : e.method === "passkey"
          ? "Recovered with a new passkey"
          : "Account recovered";
    case "key_minted":
      return "API key created";
    case "key_rotated":
      return "API key rotated";
    case "key_revoked":
      return "API key revoked";
    case "user_created":
      return e.role === undefined ? "Account created" : `Account created as ${roleOf(e.role)}`;
    case "user_disabled":
      return "Account turned off";
    case "user_enabled":
      return "Account turned back on";
    case "user_deleted":
      return "Account deleted";
    case "role_changed":
      return e.role === undefined ? "Role changed" : `Role changed to ${e.role}`;
    case "invite_issued":
      return e.role === undefined ? "Invite issued" : `Invite issued for ${roleOf(e.role)}`;
    case "method_locked":
      if (e.method === undefined) {
        return "Locked after failed attempts";
      }
      return `${lockOf(e.method)} turned off after too many failed attempts${
        e.trusted === true
          ? " from a known device"
          : e.trusted === false
            ? " from unknown devices"
            : ""
      }`;
    case "method_reenabled":
      return e.method === undefined ? "Unlocked" : `${lockOf(e.method)} turned back on`;
    case "totp_added":
      return "Authenticator app set up";
    case "totp_replaced":
      return "Authenticator app replaced";
    case "totp_removed":
      return "Authenticator app removed";
    case "second_factor_reset":
      return "Second factor reset";
    case "second_factor_failed":
      return "A second-factor code was refused";
    case "recovery_code_issued":
      return "Recovery code issued";
    case "recovery_code_replaced":
      return "Recovery code replaced";
    case "recovery_code_used":
      return "Recovery code used";
    case "temporary_password_set":
      return "Temporary password issued";
    case "temporary_password_withdrawn":
      return "Temporary password withdrawn";
    case "temporary_password_used":
      return "Temporary password used";
    case "user_approved":
      return "Account approved";
    case "registration_expired":
      return "Waiting account removed";
    case "owner_set":
      return "Made an owner";
    case "owner_removed":
      return "No longer an owner";
    case "oidc_not_admitted":
      return `${sso} sign-in not admitted`;
    case "role_synced":
      return e.role === undefined ? `Role set by ${sso}` : `Role set by ${sso} to ${e.role}`;
    case "role_sync_skipped":
      return `Role from ${sso} not applied`;
    case "sso_mode_changed":
      return "Single sign-on mode changed";
    default:
      return undefined;
  }
}

export const defaultAccountWords: AccountWords = {
  "generic.network": "The app is not answering. Check your connection, then try again.",
  "generic.server": "The server could not do this. Try again in a moment.",
  "generic.retry": "Retry",
  "generic.unavailable": "The app cannot do this right now. Try again in a few seconds.",
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
  "signIn.recoveryHint": "Lost access? Ask an admin for a temporary password.",
  "signIn.off": "Sign-in is turned off. Ask the app's admin.",
  "signIn.passwordOff": "Password sign-in is turned off. Sign in another way.",
  "signIn.usernameEmpty": "Enter your username.",
  "signIn.passwordEmpty": "Enter your password.",
  "signIn.again": "You can sign in again.",
  "signIn.app": "the app",
  "signIn.temporary": "Use a temporary password",
  "signIn.ownPassword": "Use your own password",
  "signIn.temporaryLabel": "Temporary password",
  "signIn.temporaryHelp": "An admin gave it to you. You choose your own password next.",
  "signIn.temporaryHttps": (origin) =>
    origin === undefined
      ? "A temporary password works only over HTTPS. Open the app over HTTPS to use one."
      : `A temporary password works only on ${origin}.`,
  "signIn.looksTemporary": (origin) =>
    origin === undefined
      ? "This looks like a temporary password, which works only over HTTPS. If this is your password, open the app over HTTPS and sign in there."
      : `This looks like a temporary password, which works only on ${origin}. If this is your password, sign in there.`,
  "auth_https_required.temporary_password_exposed": (origin) =>
    `This temporary password was sent over an unencrypted connection and no longer works. Ask for a new one, and use ${origin ?? "the app's HTTPS address"}.`,
  "signIn.nextNeedsHttps": "The next step of this sign-in needs HTTPS.",
  "auth_second_factor_required.enrol_needs_known_device":
    "Set up a second factor from a device you have signed in on before, or ask an admin for a temporary password.",
  "signIn.noUsableMethod": "This account cannot finish signing in to this app. Ask an admin.",
  auth_sso_only: "Use your organisation's sign-in.",
  "sso.only": (provider) => `Sign in with ${provider}`,
  "sso.forLinked": (provider) => `Accounts linked to ${provider} sign in with it.`,
  "sso.ownerSignIn": "Owner sign-in",
  "sso.ownerLine": "For the app's owners.",

  "pending.code": "Code",
  "pending.codeHelp": "Enter the 6-digit code from your authenticator app.",
  "pending.continue": "Continue",
  "pending.busy": "Checking…",
  "pending.done": "Signed in",
  "pending.usePasskey": "Use a passkey",
  "pending.passkeyLine": "Confirm with one of your passkeys to finish signing in.",
  "pending.passkeyBusy": "Waiting for your passkey…",
  "pending.useRecovery": "Use your recovery code",
  "pending.useCode": "Use your authenticator app",
  "pending.recovery": "Recovery code",
  "pending.recoveryHelp": "The 16 characters you saved. Dashes and spaces are optional.",
  "pending.recoveryFormat": "Enter the 16 characters of your recovery code.",
  "pending.choose": "Choose your password",
  "pending.chooseLine": "Your temporary password worked. Choose your own to finish signing in.",
  "pending.newPassword": "New password",
  "pending.save": "Save and sign in",
  "pending.saveBusy": "Saving…",
  "pending.registerInstead": "Register a passkey instead",
  "pending.registerPasskey": "Register a passkey",
  "pending.enrol": "Set up a second factor",
  "pending.recovered": "You used your recovery code. Set up a new authenticator",
  "pending.enrolLine": "This app asks for a second factor after your password.",
  "pending.startAgain": "Start again",
  "pending.timedOut": "This sign-in timed out. Start again.",
  "pending.unavailable":
    "Sign-in with an authenticator app is unavailable right now. Try again later, or use a passkey or your recovery code.",
  "pending.passwordOff": "Password sign-in is off in this app. Register a passkey instead.",
  "pending.waiting":
    "Your account is waiting for an administrator's approval. You can sign in once it is approved.",
  "pending.newPasswordEmpty": "Enter a password.",
  "pending.recoveryLocked": (passkey) =>
    passkey
      ? "Too many wrong recovery codes. Sign in with a passkey to unlock it, or ask an admin to reset your second factor."
      : "Too many wrong recovery codes. Ask an admin to reset your second factor.",
  "auth_password_rejected.is_temporary_password":
    "This is the temporary password you were given. Choose your own.",

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
  "stepUp.secondFactorHeld": "Step up with your code or passkey.",
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
  "arrived.signed-out": "You signed out.",

  "sessions.title": "Sessions",
  "sessions.device": "Device",
  "sessions.method": "Signed in with",
  "sessions.lastActive": "Last active",
  "sessions.address": "Address",
  "sessions.this": "This device",
  "sessions.unknownDevice": "A browser",
  "sessions.browserOn": (browser, system) => `${browser} on ${system}`,
  "sessions.rename": "Rename…",
  "sessions.renameLabel": (name) => `Rename ${name}`,
  "sessions.signOut": "Sign out",
  "sessions.signOutLabel": (name) => `Sign out ${name}`,
  "sessions.signedOut": (name) => `${name} is signed out.`,
  "sessions.others": "Sign out everywhere else…",
  "sessions.othersQuestion": "Sign out everywhere else?",
  "sessions.othersSentence": "Every other device signed in as you is signed out. This one stays.",
  "sessions.othersAnswer": (n) =>
    n === 1 ? "Sign out 1 other session" : `Sign out ${String(n)} other sessions`,
  "sessions.othersBusy": "Signing out…",
  "sessions.othersDone": "Every other session is signed out.",
  "sessions.plainUntil": (time) => `Until ${time}, or when the browser closes`,

  "keys.title": "API keys",
  "keys.label": "Label",
  "keys.key": "Key",
  "keys.scopes": "Scopes",
  "keys.expires": "Expires",
  "keys.lastUsed": "Last used",
  "keys.state": "State",
  "keys.never": "Never",
  "keys.notUsed": "Not yet",
  "keys.unnamed": "Unnamed key",
  "keys.noScope": "None",
  "keys.mintedBy": (label) => `Minted by ${label}`,
  "keys.revokedParent": (id) => `revoked key ${String(id)}`,
  "keys.active": "Active",
  "keys.retiring": (time) => `Retiring until ${time}`,
  "keys.retiringLine": (time) =>
    `The old key works until this machine first uses the new one, or until ${time}.`,
  "keys.expired": (date) => `Expired ${date}`,
  "keys.empty": "No API keys yet.",
  "keys.create": "Create key…",
  "keys.createTitle": "Create an API key",
  "keys.labelHelp": "Name what will use it, such as backup script.",
  "keys.level": "Access level",
  "keys.noLevel": "No level",
  "keys.permissions": "Extra permissions",
  "keys.scopeNeeded": "Choose a level or a permission.",
  "keys.expiresIn": "Expires",
  "keys.days": (n) => `In ${String(n)} days`,
  "keys.createSubmit": "Create key",
  "keys.createBusy": "Creating…",
  "keys.created": (label) => `${label} is ready to use.`,
  "keys.labelEmpty": "Give the key a name.",
  "keys.recent": "Creating a key needs a recent sign-in.",
  "keys.createdTitle": (label) => `New key for ${label}`,
  "keys.secret": "API key",
  "keys.rename": "Rename…",
  "keys.renameLabel": (label) => `Rename ${label}`,
  "keys.rotate": "Rotate…",
  "keys.rotateLabel": (label) => `Rotate ${label}…`,
  "keys.rotateQuestion": (label) => `Rotate ${label}?`,
  "keys.rotateSentence": (overlap) =>
    `A new secret replaces the current one, shown once. The current secret keeps working until this machine first uses the new one, or for ${overlap}.`,
  "keys.rotateAgain": "The secret from the last rotation stops working at once.",
  "keys.rotateLeaked": "Lost or leaked? Revoke it instead.",
  "keys.rotateAnswer": "Rotate key",
  "keys.rotateBusy": "Rotating…",
  "keys.rotateRecent": "Rotating a key needs a recent sign-in.",
  "keys.rotatedTitle": (label) => `New secret for ${label}`,
  "keys.rotatedLine": (time) =>
    `The old secret stops working at ${time}, or as soon as the new one is used.`,
  "keys.swappedLine": "The old key is revoked. Put this one where the old one was.",
  "keys.swapRevokeFailed":
    "The new key is made, but the old one could not be revoked. Revoke it in the list.",
  "keys.overlap": "1 hour",
  "keys.revoke": "Revoke…",
  "keys.revokeLabel": (label) => `Revoke ${label}…`,
  "keys.revokeQuestion": (label, minted) =>
    minted === 0
      ? `Revoke ${label}?`
      : `Revoke ${label} and the ${minted === 1 ? "key" : `${String(minted)} keys`} it minted?`,
  "keys.revokeSentence":
    "Anything using it stops working at once, both its current and its previous secret.",
  "keys.revokeAnswer": "Revoke key",
  "keys.revokeRecent": "Revoking a key needs a recent sign-in.",
  "keys.revoked": (label) => `${label} is revoked.`,
  "keys.gone": "This key is gone.",
  "keys.expiredRefused": "This key has expired. Revoke it, or create a new one.",
  "keys.signInAgain": "Your sign-in did not check out. Sign in again, then try once more.",
  "keys.everyTitle": "Every API key",
  "keys.noneAnywhere": "Nobody has an API key yet.",
  "keys.owner": "Belongs to",
  "keys.invites": "Live invites",
  "keys.bySession": "Made in a signed-in session",
  "keys.reached": "People it reached",
  "keys.reachedBy": (label) => `Show the people ${label} reached`,
  "keys.invitesOf": (label, count) =>
    `${count === 1 ? "1 live invite" : `${String(count)} live invites`} from ${label} and the keys it minted`,
  "keys.inviteLine": ({ purpose, role, made, until }) =>
    `${purpose === "setup" ? "Setup link" : purpose === "invite" ? "Invite" : purpose}${
      role === undefined
        ? ""
        : ` as ${role === "admin" ? "Admin" : role === "user" ? "User" : role}`
    }, made ${made}, works until ${until}`,
  "keys.revokeAnySentence": (minted, invites) => {
    const many = minted > 0;
    return [
      `Anything using ${many ? "them" : "it"} stops working at once, current and previous secrets alike.`,
      ...(invites === 0
        ? []
        : [
            `${many ? "Their" : "Its"} ${invites === 1 ? "unused invite stops" : `${String(invites)} unused invites stop`} working too.`,
          ]),
      `People ${many ? "they" : "it"} added or changed stay, with any password a key set: disable them or issue a temporary password in the users list.`,
    ].join(" ");
  },
  "users.title": "Users",
  "users.person": "Person",
  "users.role": "Role",
  "users.signIn": "Signs in with",
  "users.state": "State",
  "users.roleOf": (role) => (role === "admin" ? "Admin" : role === "user" ? "User" : role),
  "users.fromProvider": "from the identity provider",
  "users.owner": "Owner",
  "users.you": "You",
  "users.enabled": "Enabled",
  "users.disabled": "Disabled",
  "users.waiting": "Waiting for approval",
  "users.ways": ({ password, passkeys, totp, oidc }) => {
    const ways = [
      ...(password ? ["Password"] : []),
      ...(passkeys === 0 ? [] : [passkeys === 1 ? "1 passkey" : `${String(passkeys)} passkeys`]),
      ...(totp ? ["Authenticator app"] : []),
      ...(oidc === undefined ? [] : [oidc]),
    ];
    return ways.length === 0 ? "No way in yet" : ways.join(", ");
  },
  "users.temporaryUntil": (until) => `Temporary password until ${until}`,
  "users.dormant": "Local sign-in dormant",
  "users.forbidden": "Only an administrator can see the users.",
  "users.recent": "Changing people needs a recent sign-in.",
  "users.gone": "This person is gone.",
  "users.approve": "Approve",
  "users.approveLabel": (name) => `Approve ${name}`,
  "users.approved": (name) => `${name} can sign in now.`,
  "users.edit": "Edit…",
  "users.editTitle": (name) => `Edit ${name}`,
  "users.editSubmit": "Save",
  "users.editBusy": "Saving…",
  "users.canSignIn": "Can sign in",
  "users.roleSynced": "The identity provider sets the role again at their next sign-in.",
  "users.saved": (name) => `${name} is saved.`,
  "users.temporary": "Issue a temporary password…",
  "users.temporaryTitle": (name) => `Issue a temporary password for ${name}`,
  "users.temporaryDoes": (name, keeps) =>
    keeps
      ? `It lets ${name} link their single sign-on once. Their password, authenticator app and recovery code stay.`
      : `It signs ${name} out everywhere and replaces their password, authenticator app and recovery code.`,
  "users.relink": "Unlink and issue a temporary password…",
  "users.relinkTitle": (name) => `Unlink ${name} and issue a temporary password`,
  "users.relinkDoes": (name, provider) =>
    `It unlinks ${name} from ${provider}, signs them out everywhere and replaces their password, authenticator app and recovery code.`,
  "users.lasts": "Works for",
  "users.hours": (hours) =>
    hours % 24 === 0 && hours > 24
      ? `${String(hours / 24)} days`
      : hours === 1
        ? "1 hour"
        : `${String(hours)} hours`,
  "users.revokePasskeys": "Also revoke passkeys",
  "users.revokePasskeysHelp": "For a lost device that held them.",
  "users.keepKeys": "Keep API keys",
  "users.keepKeysHelp": "Left off, their API keys are revoked.",
  "users.temporarySubmit": "Issue",
  "users.relinkSubmit": "Unlink and issue",
  "users.temporaryBusy": "Issuing…",
  "users.temporaryShown": (name) => `Temporary password for ${name}`,
  "users.temporaryLabel": "Temporary password",
  "users.temporaryGive": (name, until) =>
    `Give ${name} this temporary password. It works once, until ${until}.`,
  "users.temporaryHttps": (origin) =>
    `Enter it on ${origin}. It does not work on the plain address.`,
  "users.temporaryDormant": (name, provider, origin, until) =>
    `Ask ${name} to sign in with ${provider}, choose Link to an existing account, and enter this temporary password on ${origin}. It works once, until ${until}.`,
  "users.passwordKept": (name) =>
    `${name}'s current password stays and comes back if single sign-on is relaxed; set a new one if it may be known.`,
  "users.reset": "Reset second factor…",
  "users.resetTitle": (name) => `Reset ${name}'s second factor?`,
  "users.resetSentence":
    "Their authenticator app and recovery code are deleted and they are signed out everywhere. Their password and passkeys stay.",
  "users.resetAnswer": "Reset second factor",
  "users.resetDone": (name) => `${name}'s second factor is reset.`,
  "users.makeOwner": "Make owner",
  "users.makeOwnerTitle": (name) => `Make ${name} an owner?`,
  "users.makeOwnerSentence":
    "An owner is always an admin, keeps their own sign-in under every single sign-on rule, and only an owner can change them.",
  "users.removeOwner": "Remove owner",
  "users.removeOwnerTitle": (name) => `Remove ${name} as an owner?`,
  "users.removeOwnerSentence": "They stay an admin.",
  "users.ownerDone": (name, owner) =>
    owner ? `${name} is an owner.` : `${name} is no longer an owner.`,
  "users.unlink": "Unlink single sign-on…",
  "users.unlinkTitle": (name, provider) => `Unlink ${name} from ${provider}?`,
  "users.unlinkNext": (name, next) =>
    next === "own"
      ? `It signs them out everywhere. ${name} then signs in with their own password or passkey.`
      : next === "none"
        ? `It signs them out everywhere. ${name} then cannot sign in until an admin issues a temporary password.`
        : `It signs them out everywhere. ${name} then signs in only through an admin's link with a temporary password.`,
  "users.unlinkAnswer": "Unlink",
  "users.unlinked": (name, provider) => `${name} is unlinked from ${provider}.`,
  "users.delete": "Delete…",
  "users.deleteTitle": (name) => `Delete ${name}?`,
  "users.deleteSentence": "Their account goes for good, and nothing signed in as them works.",
  "users.deleteAnswer": "Delete user",
  "users.deleted": (name) => `${name} is deleted.`,
  "users.add": "Add user…",
  "users.addTitle": "Add a user",
  "users.addSentence":
    "They get a temporary password to pass on, and with it choose their own password or passkey.",
  "users.username": "Username",
  "users.addSubmit": "Add user",
  "users.addBusy": "Adding…",
  "users.added": (name) => `${name} is added.`,
  "users.addedNoPassword": (name) =>
    `${name} is added, but no temporary password was issued. Use Issue a temporary password… on their row.`,
  "users.invite": "Invite…",
  "users.inviteTitle": "Invite someone",
  "users.inviteSentence":
    "The link lets one person make their own account with this role. Send it only to them.",
  "users.inviteSubmit": "Make the link",
  "users.inviteBusy": "Making…",
  "users.inviteShown": "Invite link",
  "users.inviteLabel": "Invite link",
  "users.inviteLine": (until) =>
    `Send this link to the person you invite. It works once, until ${until}.`,
  "users.invited": "The invite link is made.",
  "users.through": "Through key",
  "users.keyPath": (name) => `Keys that last acted on ${name}`,
  "users.keyName": (id) => `key ${String(id)}`,
  "users.reachedTitle": (label) => `Users reached through ${label}`,
  "users.showAll": "Show all users",
  "users.reachedNone": "No one was reached through this key.",
  "invites.title": "Waiting invites",
  "invites.kind": "Kind",
  "invites.made": "Made",
  "invites.until": "Works until",
  "invites.by": "Made by",
  "invites.purpose": (purpose) =>
    purpose === "invite" ? "Invite" : purpose === "setup" ? "Setup link" : purpose,
  "invites.byKey": (label) => `Key ${label}`,
  "invites.bySession": "A signed-in admin",
  "invites.empty": "No invite is waiting.",
  "auth_forbidden.self_recovery": "Use Account and security for your own account.",
  "auth_forbidden.owner_target": "Only an owner can change an owner.",
  "auth_forbidden.owner_role": "An owner is always an admin. Remove them as an owner first.",
  "auth_forbidden.owner_needs_local_method": "An owner needs a password or a passkey.",
  "auth_forbidden.last_owner": "This is the last owner. Make someone else an owner first.",
  "auth_sso_only.linked":
    "This person signs in with single sign-on. Use Unlink and issue a temporary password instead.",
  "log.title": "Security log",
  "log.help": "Failed sign-ins are not recorded.",
  "log.when": "When",
  "log.what": "What",
  "log.account": "Account",
  "log.who": "Who",
  "log.where": "From where",
  "log.type": "Type",
  "log.classOf": (c) => (c === "change" ? "Change" : c === "session" ? "Session" : c),
  "log.kind": logKind,
  "log.you": "You",
  "log.person": (id) => `Person ${String(id)}`,
  "log.key": (label) => (label === undefined || label === "" ? "A key" : `Key ${label}`),
  "log.outOfBand": () => "The app's own command",
  "log.nobody": "The app",
  "log.counts": (changes, sessions) =>
    `The log holds ${changes} changes and ${sessions} session entries.`,
  "log.evicted": (count) => `${count} older entries were removed.`,
  "log.filterKind": "Kind",
  "log.everyKind": "Every kind",
  "log.appKinds": "This app",
  "log.groupOf": (c) => (c === "change" ? "Changes" : c === "session" ? "Sessions" : c),
  "log.filterPerson": "Account",
  "log.everyone": "Everyone",
  "log.order": "Order",
  "log.newestFirst": "Newest first",
  "log.oldestFirst": "Oldest first",
  "log.pages": "Pages of the security log",
  "log.newer": "Newer",
  "log.older": "Older",
  "log.earlier": "Earlier",
  "log.later": "Later",
  "log.range": (from, to) => `${from} to ${to}`,
  "log.empty": "Nothing has happened yet.",
  "log.emptyFiltered": "Nothing matches these filters.",
  "log.clear": "Clear filters",
  "log.arrived": (n) => (n === 1 ? "1 new entry" : `${String(n)} new entries`),
  "log.forbidden": "Only an administrator can read the security log.",
  "log.unknownKind": "This app does not record that kind of entry.",
  "log.badPage": "This address does not name a page of the log.",
  "log.newest": "Show the newest",
  auth_key_label_taken: (label) => `You already have a key named ${label}.`,
  auth_unknown_scope: (scope) =>
    scope === undefined ? "This app has no such scope." : `This app has no scope named ${scope}.`,
  auth_body_too_large: "That was too long to send. Shorten it and try again.",
  auth_forbidden: "This is not allowed.",
  auth_session_required: "Only a signed-in session can do this, not an API key.",

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
  "auth_forbidden.totp_needs_password":
    "Set a password first: an authenticator app protects password sign-in.",

  "link.title": "Link this identity",
  "link.as": (provider, who) =>
    who === undefined
      ? `You signed in with ${provider}.`
      : `You signed in with ${provider} as ${who}.`,
  "link.existing": "Link to an existing account",
  "link.existingLine": (provider) =>
    `Sign in to that account here, and ${provider} is linked to it.`,
  "link.adminLine": "Enter the account's username and the temporary password an admin gave you.",
  "link.username": "Username",
  "link.temporary": "Temporary password",
  "link.submit": "Link account",
  "link.busy": "Linking…",
  "link.done": "Linked",
  "link.usernameEmpty": "Enter a username.",
  "link.temporaryEmpty": "Enter the temporary password.",
  "link.wrong": "The username or temporary password is wrong.",
  "link.notNow":
    "This way of linking is not available now. Sign in to the account and link from it.",
  "link.create": "Create a new account",
  "link.createLine": (provider) => `A new account here, signing in with ${provider}.`,
  "link.expired": (provider) => `Your sign-in expired. Sign in with ${provider} again.`,
  "link.continue": "Continue",
  auth_username_taken: "That username is taken. Choose another.",
  "auth_token_invalid.invite": "This invite no longer works. Ask whoever sent it for a new one.",
  "auth_forbidden.provisioning_disabled":
    "New accounts by single sign-on are turned off. Ask an administrator.",
  "auth_forbidden.single_owner": "This app has one owner and takes no invites.",

  "invite.title": (app) => `Join ${app}`,
  "invite.provider": (provider) => `Accept with ${provider}`,
  "invite.providerBusy": "Opening…",
  "invite.forward": "This invite is for you alone. Do not forward it.",
  "invite.role": (provider) => `Your role comes from ${provider} after your first sign-in.`,
  "invite.broken": "This invite link does not work. Ask whoever sent it for a new one.",
  "invite.off": "This invite cannot be accepted here. Ask whoever sent it.",

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
