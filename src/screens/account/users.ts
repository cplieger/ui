/**
 * users.ts — the admin's users list: each person's role, owner badge, state
 * and ways in, and the row actions access Parts 4 and 5 add, as
 * docs/design-account.md "Admin" lists them.
 * @module
 */

import type { Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { clearError, showError } from "../../forms/form/form.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import { focusAction, rowActions, rowHead, type Action } from "./actions.js";
import { codeOf, generic, reasonOf, type Said } from "./answer.js";
import type {
  AccountView,
  Refusal,
  Result,
  StepUpAccess,
  TemporaryPasswordOptions,
  TemporaryPasswordResponse,
  UserView,
  UsersClient,
} from "./client.js";
import { formDialog, type FormDialog } from "./dialogs.js";
import { cell, cellStack, clockAt, el, heading, sketch, stateMark, table, uid } from "./dom.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cycle,
  endsSession,
  holdForHttps,
  leaver,
  partsOf,
  question,
  read,
  slot,
  type ScreenOptions,
  type SignedOutOptions,
} from "./screen.js";
import { showSecret } from "./shown.js";
import { stepUp, type StepUpAnswer } from "./step-up.js";
import { wordsOf } from "./words.js";

export interface UsersOptions<C extends UsersClient> extends ScreenOptions, SignedOutOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The host's `@cplieger/access` module, `import * as access`. */
  readonly access: StepUpAccess<C>;
  /** The app's name, for "Open Release tracker over HTTPS". */
  readonly app: string;
  /** The heading's level. Default 2. */
  readonly level?: number;
  /** The single sign-on provider's name, for "Unlink alice from Authelia?". */
  readonly provider?: string;
  /** Where a single sign-on step-up comes back. Default: this page. */
  readonly redirect?: string;
}

export interface UsersScreen {
  /** Reads the people again and redraws them. */
  refresh(): Promise<void>;
}

const NOT_RUN: Refusal = { ok: false, status: 0, error: "not run" };
const LIFETIMES = [1, 24, 72, 168] as const;
const LIFETIME = 24;
const ROLES = ["admin", "user"] as const;
const OWN_REASONS = new Set([
  "self_recovery",
  "owner_target",
  "owner_role",
  "owner_needs_local_method",
  "last_owner",
]);

/** Fills `region` with the app's people, for an admin. */
export function mountUsers<C extends UsersClient>(
  region: HTMLElement,
  options: UsersOptions<C>,
): UsersScreen {
  const { client, access, signal } = options;
  const w = wordsOf(options.words);
  const run = options.run ?? runDirect;
  const has = partsOf(options.parts);
  const provider = options.provider ?? w.provider;
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
  const h = heading(options.level ?? 2, w["users.title"]);
  h.tabIndex = -1;
  root.setAttribute("aria-labelledby", h.id);
  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "users";
  root.append(h, notices.root, content);
  region.replaceChildren(root);

  let viewer: AccountView | undefined;
  let list: readonly UserView[] = [];
  let mode: "alongside" | "for_linked" | "only" = "alongside";
  let httpsOrigin: string | undefined;

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
    work: () => Promise<Result<T>>,
  ): Promise<StepUpAnswer<T>> =>
    stepUp(() => attempt(name, work), {
      client,
      access,
      reason: w["users.recent"],
      provider,
      run,
      ...(options.words === undefined ? {} : { words: options.words }),
      ...(options.parts === undefined ? {} : { parts: options.parts }),
      ...(signal === undefined ? {} : { signal }),
      ...(options.navigate === undefined ? {} : { navigate: options.navigate }),
      redirect,
    });

  /** The users routes' own refusals, else the shared words; undefined when
   *  the answer only re-reads the list. */
  const wordsFor = (r: Refusal): Said | undefined => {
    if (r === NOT_RUN) {
      return { tone: "danger", text: w["generic.server"] };
    }
    const reason = reasonOf(r);
    switch (codeOf(r)) {
      case "auth_not_found":
        void refresh();
        return { tone: "neutral", text: w["users.gone"] };
      case "auth_forbidden":
        return {
          tone: "danger",
          text:
            reason !== undefined && OWN_REASONS.has(reason)
              ? w[`auth_forbidden.${reason}` as "auth_forbidden.owner_target"]
              : w.auth_forbidden,
        };
      case "auth_sso_only":
        return {
          tone: "danger",
          text: reason === "linked" ? w["auth_sso_only.linked"] : w.auth_sso_only,
        };
      case "auth_https_required":
        return { tone: "warning", text: w["security.needsHttps"] };
      default:
        return generic(r, w);
    }
  };

  /** Shows what a write answered; true when it succeeded. */
  const settle = (answer: StepUpAnswer<unknown>): boolean => {
    switch (answer.kind) {
      case "cancelled":
      case "redirecting":
        return false;
      case "failed":
        if (answer.refusal === undefined || !endsSession(answer.refusal, leave)) {
          notices.show("danger", answer.words);
        }
        return false;
      case "done":
        break;
    }
    const r = answer.result;
    if (r.ok) {
      return true;
    }
    if (!endsSession(r, leave)) {
      const said = wordsFor(r);
      if (said !== undefined) {
        notices.show(said.tone, said.text);
      }
    }
    return false;
  };

  const failed = (r: Refusal): void => {
    if (endsSession(r, leave)) {
      return;
    }
    if (codeOf(r) === "auth_forbidden") {
      notices.show("danger", w["users.forbidden"]);
      return;
    }
    const retry = el("button", "cp-button", w["generic.retry"]);
    retry.type = "button";
    retry.addEventListener("click", () => void load(), { once: true });
    const said = generic(r, w);
    notices.show(said.tone, said.text, retry);
  };

  /** Reads the viewer, the app's state and the people; false on a
   *  failure, which it shows. */
  const readAll = async (): Promise<boolean> => {
    const [state, me, users] = await Promise.all([
      read(() => client.state()),
      read(() => client.me()),
      read(() => client.adminUsers()),
    ]);
    if (signal?.aborted === true) {
      return false;
    }
    if (!me.ok || !users.ok) {
      content.replaceChildren();
      failed(me.ok ? (users as Refusal) : me);
      return false;
    }
    viewer = me.data;
    list = users.data;
    mode = state.ok ? (state.data.sso ?? "alongside") : "alongside";
    httpsOrigin = state.ok ? state.data.https_origin : undefined;
    return true;
  };

  const load = async (): Promise<void> => {
    notices.clear();
    region.setAttribute("aria-busy", "true");
    const skeleton = skeletonTiming(() => {
      content.replaceChildren(sketch());
    }, life);
    const got = await readAll();
    if (signal?.aborted === true) {
      skeleton.cancel();
      return;
    }
    skeleton.commit(() => {
      region.removeAttribute("aria-busy");
      if (got) {
        draw();
      }
    });
  };

  async function refresh(focus?: string): Promise<void> {
    if (!(await readAll())) {
      return;
    }
    draw();
    if (focus === undefined || !focusAction(content, focus)) {
      h.focus();
    }
  }

  function draw(): void {
    if (viewer === undefined) {
      return;
    }
    const me = viewer;
    const plain = !me.session.secure;
    const https = plain ? holdForHttps([], { httpsOrigin }, options.app, w) : undefined;
    let held = false;
    const t = table(h.id, [
      { text: w["users.person"] },
      { text: w["users.role"], priority: "mid" },
      { text: w["users.signIn"], priority: "low" },
      { text: w["users.state"] },
      { text: w["methods.actions"], col: "actions" },
    ]);
    for (const u of list) {
      const actions = actionsOf(u, me, plain);
      held ||= actions.some((a) => a.https === true);
      t.body.append(row(u, me, actions, https));
    }
    content.replaceChildren(t.root, ...(https !== undefined && held ? [https] : []));
  }

  function row(
    u: UserView,
    me: AccountView,
    actions: readonly Action[],
    https: HTMLElement | undefined,
  ): HTMLTableRowElement {
    const name = el("span", "cp-cluster");
    name.append(el("span", undefined, u.username));
    if (u.owner === true) {
      name.append(el("span", "cp-chip", w["users.owner"]));
    }
    const lines = [
      ...(u.display_name === undefined || u.display_name === "" ? [] : [u.display_name]),
      ...(u.id === me.user.id ? [w["users.you"]] : []),
    ];
    const role = el("span", "cp-chip", w["users.roleOf"](u.role));
    const roleCell = cell(
      u.methods?.role_from_provider === true ? cellStack(role, w["users.fromProvider"]) : role,
    );
    roleCell.dataset["priority"] = "mid";
    const m = u.methods;
    const ways = w["users.ways"]({
      password: m?.password ?? false,
      passkeys: m?.passkey_count ?? 0,
      totp: m?.totp ?? false,
      oidc: u.oidc_linked ? provider : undefined,
    });
    const facts = [
      ...(m?.temporary_password === undefined
        ? []
        : [w["users.temporaryUntil"](clockAt(new Date(m.temporary_password.expires_at)))]),
      ...(m?.local_methods_dormant === true ? [w["users.dormant"]] : []),
    ];
    const signIn = cell(facts.length === 0 ? ways : cellStack(ways, ...facts));
    signIn.dataset["priority"] = "low";
    const state =
      m?.waiting_approval === true
        ? stateMark("warning", "clock", w["users.waiting"])
        : u.enabled
          ? stateMark("success", "circle-check", w["users.enabled"])
          : stateMark("neutral", "circle-x", w["users.disabled"]);
    const [controls] = rowActions(
      { w, app: options.app, httpsOrigin, life },
      u.username,
      actions,
      https,
    );
    const tr = el("tr");
    tr.dataset["cpUser"] = String(u.id);
    tr.append(
      rowHead(lines.length === 0 ? name : cellStack(name, ...lines)),
      roleCell,
      signIn,
      cell(state),
      controls,
    );
    return tr;
  }

  /** What the viewer may do to `u`: an admin who is not an owner sees an
   *  owner and cannot change them, and nobody acts on their own account
   *  here but to stop being an owner. */
  function actionsOf(u: UserView, me: AccountView, plain: boolean): Action[] {
    const name = u.username;
    const id = String(u.id);
    const self = u.id === me.user.id;
    const owner = u.owner === true;
    const viewerOwner = me.owner === true && me.single_user !== true;
    const touch = !self && (!owner || viewerOwner);
    const actions: Action[] = [];
    if (touch && u.methods?.waiting_approval === true) {
      actions.push({
        text: w["users.approve"],
        key: `user-approve-${id}`,
        label: w["users.approveLabel"](name),
        busy: w["users.editBusy"],
        run: (opener, confirm) => {
          void approve(u, opener, confirm);
        },
      });
    }
    if (touch) {
      actions.push({
        text: w["users.edit"],
        key: `user-edit-${id}`,
        label: w["users.editTitle"](name),
        run: (opener) => {
          edit(u, opener);
        },
      });
    }
    if (viewerOwner && client.adminSetOwner !== undefined) {
      if (owner) {
        actions.push({
          text: w["users.removeOwner"],
          key: `user-owner-${id}`,
          run: (opener) => {
            void setOwner(u, false, opener);
          },
        });
      } else if (!self && u.role === "admin" && u.enabled) {
        actions.push({
          text: w["users.makeOwner"],
          key: `user-owner-${id}`,
          run: (opener) => {
            void setOwner(u, true, opener);
          },
        });
      }
    }
    const issue = client.adminTemporaryPassword?.bind(client);
    if (
      touch &&
      has("temporary-password") &&
      issue !== undefined &&
      (!u.oidc_linked || owner || mode === "alongside")
    ) {
      actions.push({
        text: w["users.temporary"],
        key: `user-temporary-${id}`,
        https: plain,
        run: (opener) => {
          temporary(u, opener, "auth.admin_temporary_password", (o) => issue(u.id, o));
        },
      });
    }
    const reset = client.adminResetSecondFactor?.bind(client);
    if (touch && has("second-factor") && reset !== undefined && u.methods?.totp === true) {
      actions.push({
        text: w["users.reset"],
        key: `user-reset-${id}`,
        danger: true,
        run: (opener) => {
          void ask(opener, {
            title: w["users.resetTitle"](name),
            sentence: w["users.resetSentence"],
            answer: w["users.resetAnswer"],
            action: "auth.admin_reset_second_factor",
            work: () => reset(u.id),
            done: w["users.resetDone"](name),
            focus: `user-reset-${id}`,
          });
        },
      });
    }
    if (touch && has("single-sign-on") && u.oidc_linked) {
      const unlink = client.adminUnlinkOIDC?.bind(client);
      if (unlink !== undefined) {
        actions.push({
          text: w["users.unlink"],
          key: `user-unlink-${id}`,
          danger: true,
          run: (opener) => {
            void ask(opener, {
              title: w["users.unlinkTitle"](name, provider),
              sentence: w["users.unlinkNext"](name, nextOf(u)),
              answer: w["users.unlinkAnswer"],
              action: "auth.admin_unlink_oidc",
              work: () => unlink(u.id),
              done: w["users.unlinked"](name, provider),
              focus: `user-edit-${id}`,
            });
          },
        });
      }
      const relink = client.adminRelinkOIDC?.bind(client);
      if (relink !== undefined && has("temporary-password")) {
        actions.push({
          text: w["users.relink"],
          key: `user-relink-${id}`,
          https: plain,
          run: (opener) => {
            temporary(u, opener, "auth.admin_relink_oidc", (o) => relink(u.id, o));
          },
        });
      }
    }
    if (touch) {
      actions.push({
        text: w["users.delete"],
        key: `user-delete-${id}`,
        danger: true,
        run: (opener) => {
          void ask(opener, {
            title: w["users.deleteTitle"](name),
            sentence: w["users.deleteSentence"],
            answer: w["users.deleteAnswer"],
            action: "auth.admin_user_delete",
            work: () => client.adminDeleteUser(u.id),
            done: w["users.deleted"](name),
          });
        },
      });
    }
    return actions;
  }

  /** What an unlinked person can do next: an owner is exempt from the
   *  single sign-on mode, so only a non-owner under "only" needs an
   *  admin's link. */
  function nextOf(u: UserView): "own" | "none" | "admin-link" {
    if (mode === "only" && u.owner !== true) {
      return "admin-link";
    }
    const m = u.methods;
    return m !== undefined && (m.password || m.passkey_count > 0) ? "own" : "none";
  }

  async function approve(
    u: UserView,
    opener: HTMLElement,
    confirm: Confirm | undefined,
  ): Promise<void> {
    notices.clear();
    const work = (): Promise<StepUpAnswer<UserView>> =>
      write("auth.admin_user_update", () => client.adminUpdateUser(u.id, { enabled: true }));
    const got =
      confirm === undefined
        ? { answer: await work() }
        : await cycle(confirm, work, (a) => a.kind === "done" && a.result.ok);
    if (got !== undefined && settle(got.answer)) {
      notices.show("success", w["users.approved"](u.username));
      await refresh(`user-edit-${String(u.id)}`);
    } else {
      opener.focus();
    }
  }

  async function ask(
    opener: HTMLElement,
    q: {
      readonly title: string;
      readonly sentence: string;
      readonly answer: string;
      readonly action: AccountAction;
      readonly work: () => Promise<Result<unknown>>;
      readonly done: string;
      readonly focus?: string;
    },
  ): Promise<void> {
    notices.clear();
    const yes = await question(q.sentence, {
      title: q.title,
      answer: q.answer,
      cancel: w["security.cancel"],
      danger: true,
    });
    if (!yes) {
      opener.focus();
      return;
    }
    if (settle(await write(q.action, q.work))) {
      notices.show("success", q.done);
      await refresh(q.focus);
    } else {
      opener.focus();
    }
  }

  async function setOwner(u: UserView, owner: boolean, opener: HTMLElement): Promise<void> {
    const set = client.adminSetOwner?.bind(client);
    if (set === undefined) {
      return;
    }
    notices.clear();
    const yes = await question(
      owner ? w["users.makeOwnerSentence"] : w["users.removeOwnerSentence"],
      {
        title: owner
          ? w["users.makeOwnerTitle"](u.username)
          : w["users.removeOwnerTitle"](u.username),
        answer: owner ? w["users.makeOwner"] : w["users.removeOwner"],
        cancel: w["security.cancel"],
      },
    );
    if (!yes) {
      opener.focus();
      return;
    }
    if (settle(await write("auth.admin_owner", () => set(u.id, { owner })))) {
      notices.show("success", w["users.ownerDone"](u.username, owner));
      await refresh(`user-owner-${String(u.id)}`);
    } else {
      opener.focus();
    }
  }

  function edit(u: UserView, opener: HTMLElement): void {
    notices.clear();
    const d = formDialog({
      title: w["users.editTitle"](u.username),
      submit: w["users.editSubmit"],
      busy: w["users.editBusy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...life,
    });
    const select = el("select", "cp-input");
    select.id = uid("user-role");
    select.name = "role";
    for (const r of ROLES.includes(u.role as "admin") ? ROLES : [...ROLES, u.role]) {
      select.append(new Option(w["users.roleOf"](r), r, false, r === u.role));
    }
    const roleField = el("div", "cp-field");
    const label = el("label", "cp-label", w["users.role"]);
    label.htmlFor = select.id;
    const wrap = el("div", "cp-select");
    wrap.append(select);
    roleField.append(label, wrap);
    if (u.methods?.role_from_provider === true) {
      const help = el("p", "cp-help", w["users.roleSynced"]);
      help.id = `${select.id}-help`;
      select.setAttribute("aria-describedby", help.id);
      roleField.append(help);
    }
    const [enabled, box] = choice(w["users.canSignIn"], u.enabled);
    d.stack.append(roleField, enabled);
    select.focus();
    select.addEventListener("change", () => {
      clearError(select);
    });

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy()) {
        return;
      }
      const change = {
        ...(select.value === u.role ? {} : { role: select.value }),
        ...(box.checked === u.enabled ? {} : { enabled: box.checked }),
      };
      if (Object.keys(change).length === 0) {
        d.close();
        return;
      }
      d.notices.clear();
      void d
        .run(
          () => write("auth.admin_user_update", () => client.adminUpdateUser(u.id, change)),
          (a) => a.kind === "done" && a.result.ok,
        )
        .then(async (got) => {
          if (got === undefined) {
            return;
          }
          const a = got.answer;
          if (a.kind === "done" && !a.result.ok && reasonOf(a.result) === "owner_role") {
            showError(select, w["auth_forbidden.owner_role"]);
            select.focus();
            return;
          }
          if (a.kind === "cancelled") {
            return;
          }
          d.close();
          if (settle(a)) {
            notices.show("success", w["users.saved"](u.username));
            await refresh(`user-edit-${String(u.id)}`);
          }
        });
    });
  }

  /** Issue a temporary password…, and Unlink and issue one: the options,
   *  then the password shown once in the words its answer chooses. */
  function temporary(
    u: UserView,
    opener: HTMLElement,
    action: "auth.admin_temporary_password" | "auth.admin_relink_oidc",
    call: (o: TemporaryPasswordOptions) => Promise<Result<TemporaryPasswordResponse>>,
  ): void {
    notices.clear();
    const relink = action === "auth.admin_relink_oidc";
    const keeps = !relink && mode === "only" && u.owner !== true && !u.oidc_linked;
    const d = formDialog({
      title: relink ? w["users.relinkTitle"](u.username) : w["users.temporaryTitle"](u.username),
      sentence: relink
        ? w["users.relinkDoes"](u.username, provider)
        : w["users.temporaryDoes"](u.username, keeps),
      submit: relink ? w["users.relinkSubmit"] : w["users.temporarySubmit"],
      busy: w["users.temporaryBusy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...life,
    });
    const lasts = el("select", "cp-input");
    lasts.id = uid("user-lasts");
    lasts.name = "ttl_hours";
    for (const hours of LIFETIMES) {
      lasts.append(new Option(w["users.hours"](hours), String(hours), false, hours === LIFETIME));
    }
    const lastsField = el("div", "cp-field");
    const label = el("label", "cp-label", w["users.lasts"]);
    label.htmlFor = lasts.id;
    const wrap = el("div", "cp-select");
    wrap.append(lasts);
    lastsField.append(label, wrap);
    const [passkeys, revoke] = choice(
      w["users.revokePasskeys"],
      false,
      w["users.revokePasskeysHelp"],
    );
    const [keys, keep] = choice(w["users.keepKeys"], false, w["users.keepKeysHelp"]);
    d.stack.append(lastsField, ...((u.methods?.passkey_count ?? 0) > 0 ? [passkeys] : []), keys);
    lasts.focus();

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy()) {
        return;
      }
      const o: TemporaryPasswordOptions = {
        ttl_hours: Number(lasts.value),
        ...(revoke.checked && passkeys.isConnected ? { revoke_passkeys: true } : {}),
        ...(keep.checked ? { keep_keys: true } : {}),
      };
      d.notices.clear();
      void issued(d, u, () => write(action, () => call(o)));
    });
  }

  async function issued(
    d: FormDialog,
    u: UserView,
    work: () => Promise<StepUpAnswer<TemporaryPasswordResponse>>,
  ): Promise<void> {
    const got = await d.run(work, (a) => a.kind === "done" && a.result.ok);
    if (got === undefined || got.answer.kind === "cancelled") {
      return;
    }
    d.close();
    const a = got.answer;
    if (a.kind !== "done" || !a.result.ok) {
      settle(a);
      return;
    }
    const t = a.result.data;
    const until = clockAt(new Date(t.expires_at));
    const origin = t.https_origin ?? location.origin;
    const line = t.dormant
      ? w["users.temporaryDormant"](u.username, provider, origin, until)
      : w["users.temporaryGive"](u.username, until);
    const more = [
      ...(!t.dormant && t.https_only ? [w["users.temporaryHttps"](origin)] : []),
      ...(t.dormant && t.password_kept ? [w["users.passwordKept"](u.username)] : []),
    ];
    await showSecret(
      {
        title: w["users.temporaryShown"](u.username),
        line,
        label: w["users.temporaryLabel"],
        secret: t.password,
        ...(more.length === 0 ? {} : { help: more.join(" ") }),
      },
      w,
      signal,
    );
    await refresh(`user-edit-${String(u.id)}`);
  }

  /** A `.cp-choice` checkbox worded `text`, with `help` under it. */
  function choice(
    text: string,
    checked: boolean,
    help?: string,
  ): [HTMLLabelElement, HTMLInputElement] {
    const label = el("label", "cp-choice");
    const input = el("input", "cp-checkbox");
    input.type = "checkbox";
    input.checked = checked;
    const words = el("span", undefined, text);
    if (help !== undefined) {
      words.append(el("small", undefined, help));
    }
    label.append(input, words);
    return [label, input];
  }

  void load();
  return { refresh: () => refresh() };
}
