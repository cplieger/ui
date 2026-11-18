/**
 * settings.ts — the access settings: how single sign-on sits beside local
 * sign-in, each choice checked with the server for any admin and applied
 * by an owner, as docs/design-account.md "Admin" describes. The app's own
 * second-factor settings take their words from `AccountWords`.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import type { Tone } from "../../foundations/icons/glyph.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import { codeOf, genericSignedIn, reasonOf, type Said } from "./answer.js";
import type {
  AccessSettingsClient,
  AccountView,
  Readiness,
  Refusal,
  Result,
  SSOMode,
  StateResponse,
  StepUpAccess,
} from "./client.js";
import { actionButton, el, heading, line, uid } from "./dom.js";
import { screenPart } from "./part.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cycle,
  endsSession,
  holdForHttps,
  httpsOriginOf,
  leaver,
  latest,
  read,
  retryButton,
  slot,
  type ScreenOptions,
  type SignedOutOptions,
} from "./screen.js";
import { stepUp, type StepUpAnswer } from "./step-up.js";
import { wordsOf, type AccountWords } from "./words.js";

export interface AccessSettingsOptions<C extends AccessSettingsClient>
  extends Omit<ScreenOptions, "parts" | "search">, SignedOutOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: StepUpAccess<C>;
  /** The app's name, for "Open Release tracker over HTTPS". */
  readonly app: string;
  /** The heading's level. Default 2. */
  readonly level?: number;
  /** The single sign-on provider's name. */
  readonly provider?: string;
  /** Where a single sign-on step-up comes back. Default: this page. */
  readonly redirect?: string;
}

export interface AccessSettingsScreen {
  /** Reads the app's mode and the viewer again and redraws. */
  refresh(): Promise<void>;
}

const MODES: readonly SSOMode[] = ["alongside", "for_linked", "only"];
const NOT_RUN: Refusal = { ok: false, status: 0, error: "not run" };

/** The words of a state the owner fixes elsewhere, which both the
 *  readiness read and the change answer; undefined for any other. */
function blocker(
  code: string | undefined,
  reason: string | undefined,
  w: AccountWords,
): string | undefined {
  if (code === "auth_oidc_unavailable") {
    return w["settings.needsOidc"];
  }
  if (code !== "auth_forbidden") {
    return undefined;
  }
  switch (reason) {
    case "owner_needs_local_method":
      return w["settings.needsOwnMethod"];
    case "registration_enabled":
      return w["auth_forbidden.registration_enabled"];
    case "not_owner":
      return w["auth_forbidden.not_owner"];
    default:
      return w.auth_forbidden;
  }
}

/** A refusal worth sending again as it is: no answer, or a server that
 *  was busy or down for a moment. */
const passing = (r: Refusal): boolean => {
  const code = codeOf(r);
  return r.status === 0 || code === "auth_unavailable" || code === "auth_busy";
};

/**
 * Fills `region` with the SSO mode's three choices for an admin of a
 * multi-user app, each previewed by the server; only an owner applies
 * one. It stays empty for anyone else, and on a client without
 * `adminSSOReadiness`.
 */
export function mountAccessSettings<C extends AccessSettingsClient>(
  region: HTMLElement,
  options: AccessSettingsOptions<C>,
): AccessSettingsScreen {
  const { client, access, signal } = options;
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const provider = options.provider ?? w.provider;
  const level = options.level ?? 2;
  const life = signal === undefined ? {} : { signal };
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const redirect = options.redirect ?? location.pathname + location.search + location.hash;
  const leave = leaver(options, navigate);
  installAnnouncer(life);
  installDialogs(life);

  const root = el("section", "cp-stack");
  const h = heading(level, w["settings.title"]);
  h.tabIndex = -1;
  root.setAttribute("aria-labelledby", h.id);
  const notices = slot(el("div"), h);
  notices.root.dataset["part"] = "notice";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "sso-mode";
  root.append(h, notices.root, content);

  let current: SSOMode = "alongside";

  const guarded = <T>(
    work: () => Promise<Result<T>>,
    name: AccountAction,
  ): Promise<StepUpAnswer<T>> =>
    stepUp(
      async () => {
        try {
          return await run(name, work);
        } catch {
          return NOT_RUN;
        }
      },
      {
        client,
        access,
        reason: w["settings.recent"],
        provider,
        run,
        ...(options.words === undefined ? {} : { words: options.words }),
        ...(signal === undefined ? {} : { signal }),
        ...(options.navigate === undefined ? {} : { navigate: options.navigate }),
        redirect,
      },
    );

  const wordsFor = (r: Refusal): Said => {
    if (r === NOT_RUN) {
      return { tone: "danger", text: w["generic.server"] };
    }
    if (codeOf(r) === "auth_https_required") {
      return { tone: "warning", text: w["security.needsHttps"] };
    }
    const said = blocker(codeOf(r), reasonOf(r), w);
    return said === undefined ? genericSignedIn(r, w) : { tone: "danger", text: said };
  };

  // access answers the readiness read to any admin, and the change only
  // to an owner.
  const shows = (me: AccountView): boolean =>
    me.single_user !== true &&
    (me.owner === true || me.user.role === "admin") &&
    client.adminSSOReadiness !== undefined;
  const changes = (me: AccountView): boolean =>
    me.owner === true && client.adminApplySSO !== undefined;

  const part = screenPart<{ readonly state: StateResponse; readonly me: AccountView }>({
    content,
    scope: region,
    heading: h,
    busy: region,
    notices,
    signal,
    read: async () => {
      const [state, me] = await Promise.all([read(() => client.state()), read(() => client.me())]);
      if (!me.ok || !state.ok) {
        return me.ok ? (state as Refusal) : me;
      }
      return { ok: true, data: { state: state.data, me: me.data } };
    },
    refused: (r, again) => {
      if (endsSession(r, leave)) {
        return;
      }
      if (!root.isConnected) {
        region.replaceChildren(root);
      }
      const said = genericSignedIn(r, w);
      notices.show(said.tone, said.text, retryButton(w["generic.retry"], again));
    },
    draw: ({ state, me }) => {
      if (!shows(me)) {
        region.replaceChildren();
        return;
      }
      if (!root.isConnected) {
        region.replaceChildren(root);
      }
      current = state.sso ?? "alongside";
      draw(me, httpsOriginOf(state.https_origin));
    },
  });

  function draw(me: AccountView, httpsOrigin: string | undefined): void {
    // One form's readiness reads: a newer choice drops an older one's answer.
    const checks = latest(signal);
    const form = el("form", "cp-form");
    form.noValidate = true;
    const set = el("fieldset", "cp-choices");
    set.append(el("legend", "cp-label", w["settings.mode"](provider)));
    const name = uid("sso");
    const radios = MODES.map((mode) => {
      const choice = el("label", "cp-choice");
      const input = el("input", "cp-radio");
      input.type = "radio";
      input.name = name;
      input.value = mode;
      input.checked = mode === current;
      input.dataset["cpAction"] = `sso-${mode}`;
      const words = el("span", undefined, w["settings.modeOf"](mode));
      words.append(el("small", undefined, w["settings.modeLine"](mode, provider)));
      choice.append(input, words);
      set.append(choice);
      return input;
    });
    const owns = changes(me);
    const help = line("cp-help", owns ? w["settings.help"] : w["auth_forbidden.not_owner"]);
    help.id = uid("sso-help");
    const described = [help.id];
    const parts: HTMLElement[] = [set, help];
    // access refuses the readiness read and the change over plain HTTP.
    if (!me.session.secure) {
      set.disabled = true;
      const https = holdForHttps([], { httpsOrigin }, options.app, w);
      described.push(https.id);
      parts.push(https);
    }
    set.setAttribute("aria-describedby", described.join(" "));
    const readiness = slot(el("div"), () => radios.find((r) => r.checked));
    readiness.root.dataset["part"] = "readiness";
    const apply = actionButton(w["settings.apply"], { primary: true, type: "submit" });
    apply.hidden = true;
    const confirm = enhanceConfirm(apply, {
      busy: w["settings.applyBusy"],
      done: w["settings.applyDone"],
      ...life,
    });
    form.append(...parts, readiness.root, apply);
    content.replaceChildren(form);

    let chosen = current;
    const label = (mode: SSOMode): string => w["settings.modeOf"](mode);

    const retry = (mode: SSOMode): HTMLButtonElement =>
      retryButton(w["generic.retry"], () => choose(mode));

    const outcome = (mode: SSOMode, r: Readiness): { readonly tone: Tone; readonly node: Node } => {
      const lines = [
        ...(r.locked_out > 0 ? [w["settings.lockedOut"](r.locked_out)] : []),
        ...(r.methods_made_dormant > 0 ? [w["settings.dormant"](r.methods_made_dormant)] : []),
        ...(r.methods_restored > 0 ? [w["settings.restored"](r.methods_restored)] : []),
        ...(r.temporary_passwords_withdrawn > 0
          ? [w["settings.withdrawn"](r.temporary_passwords_withdrawn)]
          : []),
      ];
      const tone = r.locked_out > 0 || r.temporary_passwords_withdrawn > 0 ? "warning" : "neutral";
      if (lines.length === 0) {
        return { tone, node: document.createTextNode(w["settings.noChange"]) };
      }
      const box = el("div", "cp-stack");
      box.dataset["gap"] = "tight";
      const list = el("ul", "cp-stack");
      list.dataset["gap"] = "tight";
      for (const l of lines) {
        list.append(el("li", undefined, l));
      }
      box.append(el("p", undefined, w["settings.changes"](label(mode))), list);
      return { tone, node: box };
    };

    async function choose(mode: SSOMode): Promise<void> {
      apply.hidden = true;
      readiness.clear();
      chosen = mode;
      const fresh = checks.start();
      if (mode === current) {
        return;
      }
      const ask = client.adminSSOReadiness?.bind(client);
      if (ask === undefined) {
        return;
      }
      readiness.root.setAttribute("aria-busy", "true");
      readiness.root.replaceChildren(line("cp-help", w["settings.checking"]));
      const r = await read(() => ask(mode));
      if (!fresh()) {
        return;
      }
      readiness.root.removeAttribute("aria-busy");
      if (!r.ok) {
        if (!endsSession(r, leave)) {
          const said = wordsFor(r);
          readiness.show(said.tone, said.text, passing(r) ? retry(mode) : undefined);
        }
        return;
      }
      const refusal = r.data.refusal;
      if (refusal !== undefined) {
        readiness.show("danger", blocker(refusal.code, refusal.reason, w) ?? w["generic.server"]);
        return;
      }
      const said = outcome(mode, r.data);
      readiness.show(said.tone, said.node);
      apply.hidden = !owns;
    }

    set.addEventListener("change", (e) => {
      const target = e.target;
      if (target instanceof HTMLInputElement && radios.includes(target)) {
        void choose(target.value as SSOMode);
      }
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const change = client.adminApplySSO?.bind(client);
      const mode = chosen;
      if (apply.hidden || mode === current || change === undefined) {
        return;
      }
      notices.clear();
      void cycle(
        confirm,
        () => guarded(() => change(mode), "auth.admin_sso_apply"),
        (a) => a.kind === "done" && a.result.ok,
      ).then((got) => {
        if (got === undefined || signal?.aborted === true) {
          return;
        }
        const a = got.answer;
        switch (a.kind) {
          case "cancelled":
          case "redirecting":
            return;
          case "failed":
            if (a.refusal === undefined || !endsSession(a.refusal, leave)) {
              readiness.show("danger", a.words);
            }
            return;
          case "done":
            break;
        }
        const r = a.result;
        if (r.ok) {
          current = mode;
          apply.hidden = true;
          readiness.clear();
          notices.show("success", w["settings.applied"](label(mode)));
          return;
        }
        if (endsSession(r, leave)) {
          return;
        }
        // A change refused for the state it meets, the readiness read's own
        // refusal, holds until the owner fixes that state and chooses again.
        apply.hidden = !passing(r);
        const said = wordsFor(r);
        readiness.show(said.tone, said.text);
      });
    });
  }

  void part.load();
  return {
    refresh: async () => {
      await part.refresh();
    },
  };
}
