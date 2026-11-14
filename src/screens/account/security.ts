/**
 * security.ts — Account and security, the signed-in person's own screen:
 * the session line, then a section each for the profile and the sign-in
 * methods, each heading at the host's level, as docs/design-account.md
 * "Account and security" lays it out.
 * @module
 */

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import { clock, codeOf, generic, reasonOf, retryAfter, type Said } from "./answer.js";
import type {
  AccountView,
  PasskeyView,
  Refusal,
  Result,
  SecurityAccess,
  SecurityClient,
} from "./client.js";
import { el, heading, sketch, stateMark } from "./dom.js";
import { drawMethods } from "./methods.js";
import { drawProfile } from "./profile.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cleanAddress,
  partsOf,
  read,
  slot,
  type AccountPart,
  type ScreenOptions,
  type Slot,
} from "./screen.js";
import { stepUp, type StepUpAnswer } from "./step-up.js";
import { wordsOf, type AccountWords } from "./words.js";

export interface SecurityOptions<C extends SecurityClient> extends ScreenOptions {
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
  /** Runs when the session is gone. Default: navigate to `signInPath`
   *  with `arrived` saying why. */
  readonly onSignedOut?: (why: { readonly reason: "session-ended" | "transport-changed" }) => void;
  /** Default "/sign-in". */
  readonly signInPath?: string;
}

export interface SecurityScreen {
  /** Reads the account again and redraws the sign-in methods. */
  refresh(): Promise<void>;
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
  readonly webauthn: boolean;
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
  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  const session = el("div");
  session.dataset["part"] = "session";
  const profile = section(w["profile.title"]);
  const methods = section(w["methods.title"]);
  methods.heading.tabIndex = -1;
  top.append(session, notices.root);
  region.replaceChildren(top);

  let me: AccountView | undefined;
  let passkeys: readonly PasskeyView[] = [];
  let ctx: Ctx<C> | undefined;

  function section(title: string): {
    readonly root: HTMLElement;
    readonly heading: HTMLHeadingElement;
    readonly body: HTMLElement;
  } {
    const root = el("section", "cp-stack");
    const h = heading(level, title);
    root.setAttribute("aria-labelledby", h.id);
    const body = el("div", "cp-stack");
    root.append(h, body);
    return { root, heading: h, body };
  }

  const signedOut = (r: Refusal): boolean => {
    const code = codeOf(r);
    if (code !== "auth_session_expired" && code !== "auth_required") {
      return false;
    }
    const reason = reasonOf(r) === "transport_changed" ? "transport-changed" : "session-ended";
    if (options.onSignedOut === undefined) {
      navigate(`${options.signInPath ?? "/sign-in"}?arrived=${reason}`);
    } else {
      options.onSignedOut({ reason });
    }
    return true;
  };

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
        line.append(el("span", undefined, w["security.plainUntil"](endWords(ends))));
      }
      session.append(line);
    }
  };

  const refresh = async (focus?: string): Promise<void> => {
    const [got, keys] = await Promise.all([read(() => client.me()), readPasskeys()]);
    if (signal?.aborted === true || ctx === undefined) {
      return;
    }
    if (!got.ok) {
      if (!signedOut(got)) {
        const said = generic(got, w);
        notices.show(said.tone, said.text, retryButton());
      }
      return;
    }
    me = got.data;
    passkeys = keys;
    drawSession(me);
    drawMethods(ctx, methods.body, me, passkeys);
    if (focus !== undefined) {
      const target = methods.body.querySelector<HTMLElement>(`[data-cp-action="${focus}"]`);
      // An action in a row's menu: its ⋯ button takes focus.
      const menu = target?.closest<HTMLElement>("[role='menu']");
      const opener =
        menu === null || menu === undefined
          ? target
          : methods.body.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`);
      (opener ?? methods.heading).focus();
    }
  };

  const readPasskeys = async (): Promise<readonly PasskeyView[]> => {
    if (!has("passkeys")) {
      return [];
    }
    const got = await read(() => client.passkeys());
    return got.ok ? got.data : passkeys;
  };

  const retryButton = (): HTMLButtonElement => {
    const retry = el("button", "cp-button", w["generic.retry"]);
    retry.type = "button";
    retry.addEventListener("click", () => void load(), { once: true });
    return retry;
  };

  const load = async (): Promise<void> => {
    notices.clear();
    region.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      top.replaceChildren(session, notices.root, sketch());
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
      region.removeAttribute("aria-busy");
      top.replaceChildren(session, notices.root);
      if (!got.ok) {
        if (!signedOut(got)) {
          const said = generic(got, w);
          notices.show(said.tone, said.text, retryButton());
        }
        return;
      }
      me = got.data;
      passkeys = keys;
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
        httpsOrigin: state.ok ? state.data.https_origin : undefined,
        appTotp: state.ok && state.data.totp === true,
        webauthn: support.webauthn,
        write,
        settle,
        refresh,
      };
      drawSession(me);
      if (has("profile")) {
        drawProfile(ctx, profile.body, me);
        top.append(profile.root);
      }
      drawMethods(ctx, methods.body, me, passkeys);
      top.append(methods.root);
      const said = returned();
      if (said !== undefined) {
        const into = methods.body.querySelector<HTMLElement>("[data-part='notice']");
        if (into === null) {
          notices.show(said.tone, said.text);
        } else {
          slot(into).show(said.tone, said.text);
        }
      }
    });
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

  void load();
  return { refresh: () => refresh() };
}

/** "18:40" today, else "14 Nov, 18:40". */
function endWords(at: Date): string {
  const now = new Date();
  const today =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  return at.toLocaleString(
    undefined,
    today
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  );
}
