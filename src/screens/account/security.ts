/**
 * security.ts — Account and security, the signed-in person's own screen:
 * the session line, then a section each for the profile, the sign-in
 * methods, the sessions, the API keys and the security log, each heading at
 * the host's level, as docs/design-account.md
 * "Account and security" lays it out.
 * @module
 */

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import {
  clock,
  codeOf,
  generic,
  passwordLengthOf,
  reasonOf,
  retryAfter,
  type Said,
} from "./answer.js";
import type {
  AccountView,
  PasskeyView,
  PasswordLength,
  Refusal,
  Result,
  SecurityAccess,
  SecurityClient,
  StateResponse,
} from "./client.js";
import { clockAt, el, heading, sketch, stateMark } from "./dom.js";
import { redrawKeepingFocus } from "./focus.js";
import { checkScopes, drawKeys, type KeyNote, type KeyScopes, type KeysSection } from "./keys.js";
import { drawLog, type LogOptions, type SecurityLogScreen } from "./log.js";
import { drawMethods } from "./methods.js";
import { drawProfile } from "./profile.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cleanAddress,
  endsSession,
  httpsOriginOf,
  leaver,
  latest,
  partsOf,
  read,
  retryButton,
  slot,
  type AccountPart,
  type ScreenOptions,
  type SignedOutOptions,
  type SignedOutReason,
  type Slot,
} from "./screen.js";
import { drawSessions, type SessionsSection } from "./sessions.js";
import { stepUp, type StepUpAnswer } from "./step-up.js";
import { wordsOf, type AccountWords } from "./words.js";

export interface SecurityOptions<C extends SecurityClient> extends ScreenOptions, SignedOutOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: SecurityAccess<C>;
  /** The app's name, for "Open Release tracker over HTTPS". */
  readonly app: string;
  /** The sections' heading level: 3 inside a host's settings part that
   *  heads the region with its `<h2>`. Default 2. */
  readonly level?: number;
  /** The single sign-on provider's name, for "Linked to Authelia". */
  readonly provider?: string;
  /** The app's passkey relying party ID. Default: a passkey is usable here
   *  when this page's host is its `rp_id` or under it. */
  readonly rpId?: string;
  /** Where linking single sign-on comes back. Default: this page. */
  readonly redirect?: string;
  /** The scopes Create key… offers. Default: none, so a key is made with
   *  no scope. */
  readonly scopes?: KeyScopes;
  /** In place of Create key…, for a person who may not make keys here: a
   *  link to where they are made, worded by `words`. */
  readonly keysCreatedElsewhere?: { readonly words: string; readonly href: string };
  /** The app's line under a key's new secret, such as where to put it. */
  readonly keyNote?: KeyNote;
  /**
   * The security log, for a viewer who may read it: by default the entries
   * about the viewer, or every entry with `everyone` (an app with one
   * account shows every entry anyway). `kinds` words the app's own.
   */
  readonly log?: LogOptions & { readonly everyone?: boolean };
}

export interface SecurityScreen {
  /** Reads the account, its sessions, its keys and the log again and
   *  redraws them. */
  refresh(): Promise<void>;
  /** Reads what the security log gained, as `mountSecurityLog`'s
   *  `refresh` does. */
  refreshLog(): Promise<void>;
}

/** What every section of the screen shares. */
export interface Ctx<C extends SecurityClient> {
  readonly client: C;
  readonly access: SecurityAccess<C>;
  readonly w: AccountWords;
  readonly has: (p: AccountPart) => boolean;
  readonly app: string;
  readonly provider: string;
  readonly level: number;
  readonly signal: AbortSignal | undefined;
  readonly life: { readonly signal?: AbortSignal };
  readonly navigate: (url: string) => void;
  readonly redirect: string;
  /** Whether a passkey with `rp_id` signs in on this page. */
  readonly usableHere: (rpId: string) => boolean;
  /** The app's HTTPS address, read from `state()` on a plain request. */
  readonly httpsOrigin: string | undefined;
  /** The app offers authenticator apps. */
  readonly appTotp: boolean;
  /** The bounds of a new password. */
  readonly passwordLength: PasswordLength;
  readonly webauthn: boolean;
  /** This page's session was made over plain HTTP. */
  readonly plain: boolean;
  readonly scopes: KeyScopes | undefined;
  readonly keysElsewhere: { readonly words: string; readonly href: string } | undefined;
  readonly keyNote: KeyNote | undefined;
  /** Ends the screen for `reason`, as `onSignedOut` says. */
  signedOut(reason: SignedOutReason): void;
  /**
   * Runs a write through the host's runner under `name`; when the server
   * asks for a recent sign-in, asks with `reason` and runs it once more.
   */
  write<T>(
    name: AccountAction,
    reason: string,
    work: () => Promise<Result<T>>,
  ): Promise<StepUpAnswer<T>>;
  /**
   * Shows in `into` what a write answered, and ends the screen when the
   * session is gone. `own` words a refusal first: null when it showed it
   * itself, undefined to leave it to the shared words. True when the
   * write succeeded.
   */
  settle(
    answer: StepUpAnswer<unknown>,
    into: Slot,
    own?: (r: Refusal) => Said | null | undefined,
  ): boolean;
  /** Reads the account again and redraws the methods, then focuses the
   *  control marked `data-cp-action="<focus>"`, or the ⋯ button of the menu
   *  holding it, else the section's heading. */
  refresh(focus?: string): Promise<void>;
}

const NOT_RUN: Refusal = { ok: false, status: 0, error: "not run" };

/** Fills `region` with Account and security for the signed-in person. */
export function mountSecurity<C extends SecurityClient>(
  region: HTMLElement,
  options: SecurityOptions<C>,
): SecurityScreen {
  const { client, access, signal } = options;
  checkScopes(options.scopes);
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const provider = options.provider ?? w.provider;
  const level = options.level ?? 2;
  const life = signal === undefined ? {} : { signal };
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const back = access.readOIDCReturn(options.search ?? location.search);
  if (back.kind !== "none") {
    cleanAddress();
  }
  const redirect = options.redirect ?? location.pathname + location.search + location.hash;
  const host = location.hostname;
  const usableHere = (rpId: string): boolean =>
    options.rpId === undefined ? host === rpId || host.endsWith(`.${rpId}`) : options.rpId === rpId;
  installAnnouncer(life);
  installDialogs(life);
  installTooltips(life);

  const top = el("div", "cp-stack");
  /** The first section's heading, where focus goes when its control is
   *  drawn away. */
  const lead = (): HTMLElement | undefined =>
    [profile, methods, sessionsPart, keysPart, logPart].find((p) => p.root.isConnected)?.heading;
  const notices = slot(el("div"), lead);
  notices.root.dataset["part"] = "notice";
  const session = el("div");
  session.dataset["part"] = "session";
  const profile = section(w["profile.title"]);
  const methods = section(w["methods.title"]);
  // With no method's routes mounted, the screen has no methods section.
  const anyMethod = (["password", "passkeys", "second-factor", "single-sign-on"] as const).some(
    has,
  );
  const sessionsPart = section(w["sessions.title"]);
  const keysPart = section(w["keys.title"]);
  const logPart = section(w["log.title"]);
  top.append(session, notices.root);
  region.replaceChildren(top);

  let me: AccountView | undefined;
  let passkeys: readonly PasskeyView[] = [];
  let ctx: Ctx<C> | undefined;
  const reads = latest(signal);
  /** The focus the newest read draws with, whichever read asked for it. */
  let wanted: string | undefined;
  /** The notice of the last refresh that failed, until one succeeds. */
  let failed: HTMLElement | undefined;
  let sessionsView: SessionsSection | undefined;
  let keysView: KeysSection | undefined;
  let logView: SecurityLogScreen | undefined;

  function section(title: string): {
    readonly root: HTMLElement;
    readonly heading: HTMLHeadingElement;
    readonly body: HTMLElement;
  } {
    const root = el("section", "cp-stack");
    const h = heading(level, title);
    h.tabIndex = -1;
    root.setAttribute("aria-labelledby", h.id);
    const body = el("div", "cp-stack");
    root.append(h, body);
    return { root, heading: h, body };
  }

  const leave = leaver(options, navigate);
  const signedOut = (r: Refusal): boolean => endsSession(r, leave);

  const attempt = async <T>(
    name: AccountAction,
    work: () => Promise<Result<T>>,
  ): Promise<Result<T>> => {
    try {
      return await run(name, work);
    } catch {
      return NOT_RUN;
    }
  };

  const write = <T>(
    name: AccountAction,
    reason: string,
    work: () => Promise<Result<T>>,
  ): Promise<StepUpAnswer<T>> =>
    stepUp(() => attempt(name, work), {
      client,
      access,
      reason,
      provider,
      run,
      ...(options.words === undefined ? {} : { words: options.words }),
      ...(options.parts === undefined ? {} : { parts: options.parts }),
      ...(signal === undefined ? {} : { signal }),
      ...(options.navigate === undefined ? {} : { navigate: options.navigate }),
      redirect,
    });

  const settle = (
    answer: StepUpAnswer<unknown>,
    into: Slot,
    own?: (r: Refusal) => Said | null | undefined,
  ): boolean => {
    switch (answer.kind) {
      case "cancelled":
      case "redirecting":
        return false;
      case "failed":
        if (answer.refusal === undefined || !signedOut(answer.refusal)) {
          into.show("danger", answer.words);
        }
        return false;
      case "done":
        break;
    }
    const r = answer.result;
    if (r.ok) {
      return true;
    }
    if (signedOut(r)) {
      return false;
    }
    const mine = own?.(r);
    const said = mine === null ? undefined : (mine ?? common(r));
    if (said !== undefined) {
      into.show(said.tone, said.text);
    }
    return false;
  };

  /** The words of a refusal no action words itself; undefined for one that
   *  only re-reads the account. */
  const common = (r: Refusal): Said | undefined => {
    if (r === NOT_RUN) {
      return { tone: "danger", text: w["generic.server"] };
    }
    switch (codeOf(r)) {
      case "auth_last_method":
        return {
          tone: "danger",
          text:
            reasonOf(r) === "last_second_factor"
              ? w["auth_last_method.last_second_factor"]
              : w.auth_last_method,
        };
      case "auth_https_required":
        return { tone: "warning", text: w["security.needsHttps"] };
      case "auth_not_found":
      case "auth_method_not_locked":
        void refresh();
        return undefined;
      case "auth_rate_limited": {
        const seconds = retryAfter(r);
        return seconds === undefined || seconds <= 0
          ? { tone: "warning", text: w["auth_rate_limited.later"] }
          : { tone: "warning", text: w.auth_rate_limited(clock(seconds)) };
      }
      default:
        return generic(r, w);
    }
  };

  const drawSession = (m: AccountView): void => {
    const p = el(
      "p",
      "cp-meta",
      w["security.signedIn"](m.user.username, w["security.method"](m.session.method, provider)),
    );
    session.replaceChildren(p);
    if (!m.session.secure) {
      const ends = [m.session.idle_deadline, m.session.absolute_deadline]
        .map((iso) => new Date(iso))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const line = el("p", "cp-cluster");
      line.dataset["part"] = "plain-session";
      line.append(stateMark("warning", "lock", w["security.plain"]));
      if (ends !== undefined && !Number.isNaN(ends.getTime())) {
        line.append(el("span", undefined, w["security.plainUntil"](clockAt(ends))));
      }
      session.append(line);
    }
  };

  const refresh = async (focus?: string): Promise<void> => {
    wanted = focus ?? wanted;
    await reads.run(
      () => Promise.all([read(() => client.me()), readPasskeys()]),
      ([got, keys]) => {
        const c = ctx;
        if (c === undefined) {
          return;
        }
        const asked = wanted;
        wanted = undefined;
        if (!got.ok) {
          if (!signedOut(got)) {
            const said = generic(got, w);
            failed = notices.show(
              said.tone,
              said.text,
              retryButton(w["generic.retry"], () => refresh(asked)),
            );
          }
          return;
        }
        notices.drop(failed);
        failed = undefined;
        const m = got.data;
        me = m;
        passkeys = keys;
        drawSession(m);
        if (anyMethod) {
          redrawKeepingFocus(
            methods.body,
            methods.heading,
            () => {
              drawMethods(c, methods.body, m, keys);
            },
            asked,
          );
        }
      },
    );
  };

  const readPasskeys = async (): Promise<readonly PasskeyView[]> => {
    if (!has("passkeys")) {
      return [];
    }
    const got = await read(() => client.passkeys());
    return got.ok ? got.data : passkeys;
  };

  // The first read, while it runs: a refresh waits for it, since the
  // sections it mounts exist only once it commits.
  let loading: Promise<void> | undefined;
  const start = (): Promise<void> =>
    (loading ??= load().finally(() => {
      loading = undefined;
    }));

  // Runs only while no section is mounted: a second mount would leave the
  // first copies' focus, timer and popstate listeners running.
  const load = async (): Promise<void> => {
    region.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      redrawKeepingFocus(top, lead, () => {
        top.replaceChildren(session, notices.root, sketch());
      });
    }, life);
    const [state, got, support] = await Promise.all([
      read(() => client.state()),
      read(() => client.me()),
      access.passkeySupport(),
    ]);
    const keys = got.ok ? await readPasskeys() : [];
    if (signal?.aborted === true) {
      skeleton.cancel();
      return;
    }
    skeleton.commit(() => {
      redrawKeepingFocus(top, lead, () => {
        mount(state, got, keys, support);
      });
    });
  };

  /** Draws the first read's sections, or its failure with Retry. */
  const mount = (
    state: Result<StateResponse>,
    got: Result<AccountView>,
    keys: readonly PasskeyView[],
    support: { readonly webauthn: boolean },
  ): void => {
    region.removeAttribute("aria-busy");
    notices.clear();
    top.replaceChildren(session, notices.root);
    if (!got.ok) {
      if (!signedOut(got)) {
        const said = generic(got, w);
        notices.show(said.tone, said.text, retryButton(w["generic.retry"], start));
      }
      return;
    }
    me = got.data;
    passkeys = keys;
    if (has("passkeys") && support.webauthn) {
      void access.sendSignals(client);
    }
    ctx = {
      client,
      access,
      w,
      has,
      app: options.app,
      provider,
      level,
      signal,
      life,
      navigate,
      redirect,
      usableHere,
      httpsOrigin: state.ok ? httpsOriginOf(state.data.https_origin) : undefined,
      appTotp: state.ok && state.data.totp === true,
      passwordLength: passwordLengthOf(state.ok ? state.data : undefined),
      webauthn: support.webauthn,
      plain: !me.session.secure,
      scopes: options.scopes,
      keysElsewhere: options.keysCreatedElsewhere,
      keyNote: options.keyNote,
      signedOut: leave,
      write,
      settle,
      refresh,
    };
    drawSession(me);
    if (has("profile")) {
      drawProfile(ctx, profile.body, me);
      top.append(profile.root);
    }
    if (anyMethod) {
      drawMethods(ctx, methods.body, me, passkeys);
      top.append(methods.root);
    }
    if (has("sessions")) {
      sessionsView = drawSessions(ctx, sessionsPart.body, sessionsPart.heading);
      top.append(sessionsPart.root);
    }
    if (has("keys")) {
      keysView = drawKeys(ctx, keysPart.body, keysPart.heading, {
        list: () => client.keys(),
        revoke: (id) => client.revokeKey(id),
        own: {
          create: (r) => client.createKey(r),
          rename: (id, r) => client.renameKey(id, r),
          rotate: (id) => client.rotateKey(id),
        },
      });
      top.append(keysPart.root);
    }
    // access reads the log only to a viewer its policy lets list users,
    // an admin under its role policy; its refusal removes the section.
    if (has("security-log") && me.user.role === "admin") {
      const everyone = options.log?.everyone === true || me.single_user === true;
      logView = drawLog(
        {
          client,
          w,
          provider,
          options: options.log ?? {},
          search: options.search ?? location.search,
          user: everyone ? undefined : me.user.id,
          viewer: me.user.id,
          life,
          leave,
          forbidden: () => {
            logPart.root.remove();
          },
        },
        logPart.body,
        logPart.heading,
      );
      top.append(logPart.root);
    }
    const said = returned();
    if (said !== undefined) {
      const into = methods.body.querySelector<HTMLElement>("[data-part='notice']");
      if (into === null) {
        notices.show(said.tone, said.text);
      } else {
        slot(into).show(said.tone, said.text);
      }
    }
  };

  /** The notice a single sign-on link brings back. */
  const returned = (): Said | undefined => {
    switch (back.kind) {
      case "linked":
        return { tone: "success", text: w["oidc.linked"](provider) };
      case "error":
        switch (back.code) {
          case "auth_identity_taken":
            return { tone: "danger", text: w.auth_identity_taken };
          case "auth_already_linked":
            return { tone: "danger", text: w.auth_already_linked };
          case "auth_oidc_unavailable":
            return { tone: "danger", text: w.auth_oidc_unavailable };
          case "auth_rate_limited":
            return { tone: "warning", text: w["auth_rate_limited.later"] };
          default:
            return { tone: "danger", text: w.auth_oidc_failed };
        }
      default:
        return undefined;
    }
  };

  void start();
  return {
    refresh: async () => {
      while (loading !== undefined) {
        await loading;
      }
      if (ctx === undefined) {
        await start();
        return;
      }
      await Promise.all([
        refresh(),
        sessionsView?.refresh(),
        keysView?.refresh(),
        logView?.refresh(),
      ]);
    },
    refreshLog: async () => {
      await logView?.refresh();
    },
  };
}
