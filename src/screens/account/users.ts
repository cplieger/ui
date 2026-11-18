/**
 * users.ts — the admin's people: each person's role, owner badge, state,
 * ways in and the keys that reached them, with the row actions the
 * client has calls for; Add user… and Invite…; the waiting invites; and every
 * account's API keys, as docs/design-account.md "Admin" lists them.
 * @module
 */

import type { Confirm } from "../../buttons/confirm/confirm.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { clearError, showError } from "../../forms/form/form.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import { rowActions, rowHead, type Action } from "./actions.js";
import { codeOf, genericSignedIn, reasonOf, usernameWords, type Said } from "./answer.js";
import type {
  AccountView,
  KeyView,
  Refusal,
  Result,
  SSOMode,
  StepUpAccess,
  TemporaryPasswordOptions,
  TemporaryPasswordResponse,
  TokenView,
  UserView,
  UsersClient,
} from "./client.js";
import { formDialog, type FormDialog } from "./dialogs.js";
import { redrawKeepingFocus } from "./focus.js";
import {
  cell,
  cellStack,
  clockAt,
  el,
  field,
  heading,
  plainButton,
  sketch,
  stateMark,
  table,
  time,
  uid,
} from "./dom.js";
import { drawKeys, type KeysSection } from "./keys.js";
import { runDirect, type AccountAction } from "./run.js";
import {
  cycle,
  endsSession,
  holdBy,
  holdForHttps,
  httpsOriginOf,
  isHeld,
  latest,
  leaver,
  partsOf,
  question,
  read,
  retryButton,
  slot,
  type ScreenOptions,
  type SignedOutOptions,
  type Slot,
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
  /** The heading's level; the invites and keys sections take the next.
   *  Default 2. */
  readonly level?: number;
  /** The single sign-on provider's name, for "Unlink alice from Authelia?". */
  readonly provider?: string;
  /** Where a single sign-on step-up comes back. Default: this page. */
  readonly redirect?: string;
  /** The app's invite page, which reads the link's `#token=`. Default
   *  "/invite". */
  readonly invitePath?: string;
  /**
   * Writes the key filter into the address: `key`, or none for every
   * user. `replace` is true when it drops a filter that named no key.
   * Default: `history.pushState`, or `replaceState`, keeping every other
   * parameter; the screen then follows `popstate` itself.
   */
  readonly onQuery?: (params: URLSearchParams, replace: boolean) => void;
}

export interface UsersScreen {
  /** Reads the people, the invites and the keys again and redraws them. */
  refresh(): Promise<void>;
  /** Shows the filter a query names, as Back does. */
  show(search: string): void;
}

const NOT_RUN: Refusal = { ok: false, status: 0, error: "not run" };
const LIFETIMES = [1, 24, 72, 168] as const;
const LIFETIME = 24;
const INVITE_LIFETIMES = [24, 72, 168, 336] as const;
const INVITE_LIFETIME = 168;
const ROLES = ["admin", "user"] as const;
const WHEN: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};
const OWN_REASONS = new Set([
  "self_recovery",
  "owner_target",
  "owner_role",
  "owner_needs_local_method",
  "last_owner",
]);

/** The key a query filters the people by, when it names one. */
function keyOf(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("key");
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

const paramsOf = (key: number | undefined): URLSearchParams =>
  new URLSearchParams(key === undefined ? {} : { key: String(key) });

/** This page's address with `key` as its key filter. */
function addressOf(key: number | undefined): string {
  const url = new URL(location.href);
  url.searchParams.delete("key");
  if (key !== undefined) {
    url.searchParams.set("key", String(key));
  }
  return url.pathname + url.search + url.hash;
}

const writeAddress = (params: URLSearchParams, replace: boolean): void => {
  const url = addressOf(keyOf(params.toString()));
  if (replace) {
    history.replaceState(history.state, "", url);
  } else {
    history.pushState(history.state, "", url);
  }
};

/** What a key list shows of each key in the people's rows: its label. */
const signature = (keys: readonly KeyView[]): string =>
  JSON.stringify(keys.map((k) => [k.id, k.label]));

/** A follow of a link the screen shows in place: a plain left press. */
const inPlace = (e: MouseEvent): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

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
  const level = options.level ?? 2;
  const life = signal === undefined ? {} : { signal };
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  const redirect = options.redirect ?? location.pathname + location.search + location.hash;
  const onQuery = options.onQuery ?? writeAddress;
  const leave = leaver(options, navigate);
  installAnnouncer(life);
  installDialogs(life);

  const root = el("section", "cp-stack");
  const h = heading(level, w["users.title"]);
  h.tabIndex = -1;
  root.setAttribute("aria-labelledby", h.id);
  const notices = slot(el("div"), h);
  notices.root.dataset["part"] = "notice";
  const bar = el("div", "cp-cluster");
  bar.dataset["part"] = "users-bar";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "users";
  root.append(h, notices.root, bar, content);
  const invitesPart = part(w["invites.title"]);
  invitesPart.root.dataset["part"] = "invites";
  const keysPart = part(w["keys.everyTitle"]);
  keysPart.root.dataset["part"] = "admin-keys";
  region.replaceChildren(root);

  let viewer: AccountView | undefined;
  let list: readonly UserView[] = [];
  let keys: readonly KeyView[] = [];
  let tokens: readonly TokenView[] = [];
  let filter = keyOf(options.search ?? location.search);
  let mode: SSOMode = "alongside";
  let httpsOrigin: string | undefined;
  let keysView: KeysSection | undefined;
  // The whole read draws the people; `keys` takes the newest keys answer,
  // the whole read's or the keys table's own.
  const reads = latest(signal);
  const keyReads = latest(signal);
  /** Whether `keys` is the server's whole list, so a key missing from it
   *  is revoked; false while no keys read has answered. */
  let keysKnown = false;
  /** The focus the newest refresh draws with: a control's
   *  `data-cp-action`, null for the heading. */
  let wanted: string | null | undefined;
  /** Whether the people on screen are a read's, not its failure. */
  let drawn = false;
  /** The notice of the last whole read that failed, until one succeeds. */
  let failure: Element | undefined;

  function part(title: string): {
    readonly root: HTMLElement;
    readonly heading: HTMLHeadingElement;
    readonly body: HTMLElement;
  } {
    const section = el("section", "cp-stack");
    const head = heading(level + 1, title);
    head.tabIndex = -1;
    section.setAttribute("aria-labelledby", head.id);
    const body = el("div", "cp-stack");
    section.append(head, body);
    return { root: section, heading: head, body };
  }

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
    reason = w["users.recent"],
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
        return genericSignedIn(r, w);
    }
  };

  /**
   * Shows in `into` what a write answered; true when it succeeded. `own`
   * words a refusal first: null when it showed it itself, undefined to
   * leave it to the users words.
   */
  const settle = (
    answer: StepUpAnswer<unknown>,
    into: Slot = notices,
    own?: (r: Refusal) => Said | null | undefined,
  ): boolean => {
    switch (answer.kind) {
      case "cancelled":
      case "redirecting":
        return false;
      case "failed":
        if (answer.refusal === undefined || !endsSession(answer.refusal, leave)) {
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
    if (!endsSession(r, leave)) {
      const mine = own?.(r);
      const said = mine === null ? undefined : (mine ?? wordsFor(r));
      if (said !== undefined) {
        into.show(said.tone, said.text);
      }
    }
    return false;
  };

  const failed = (r: Refusal): void => {
    if (endsSession(r, leave)) {
      return;
    }
    if (codeOf(r) === "auth_forbidden") {
      failure = notices.show("danger", w["users.forbidden"]);
      return;
    }
    const said = genericSignedIn(r, w);
    failure = notices.show(said.tone, said.text, retryButton(w["generic.retry"], load));
  };

  /** Takes a keys answer: a refusal keeps the last list, no longer known
   *  whole. True when what a key's label reads as changed. */
  const takeKeys = (got: Result<readonly KeyView[]>): boolean => {
    const before = keysKnown ? signature(keys) : undefined;
    if (got.ok) {
      keys = got.data;
    }
    keysKnown = got.ok;
    return (keysKnown ? signature(keys) : undefined) !== before;
  };

  /** Reads the viewer, the app's state, the people and, as mounted, the
   *  keys and invites that name them; false on a failure, which it shows.
   *  A failed keys read keeps the last list, no longer known whole. */
  const readAll = async (current = reads.start()): Promise<boolean> => {
    const key = filter;
    const [state, me, users, tokenList] = await Promise.all([
      read(() => client.state()),
      read(() => client.me()),
      read(() => client.adminUsers(key === undefined ? undefined : { key })),
      has("invites") || has("admin-keys") ? read(() => client.adminTokens()) : undefined,
      has("admin-keys") ? keyReads.run(() => read(() => client.adminKeys()), takeKeys) : undefined,
    ]);
    if (!current()) {
      return false;
    }
    if (!me.ok || !users.ok || !state.ok || tokenList?.ok === false) {
      wanted = undefined;
      drawn = false;
      redrawKeepingFocus(root, h, () => {
        content.replaceChildren();
        failed(!me.ok ? me : !users.ok ? users : !state.ok ? state : (tokenList as Refusal));
      });
      return false;
    }
    viewer = me.data;
    list = users.data;
    tokens = tokenList?.data ?? [];
    mode = state.data.sso ?? "alongside";
    httpsOrigin = httpsOriginOf(state.data.https_origin);
    return true;
  };

  const load = async (): Promise<void> => {
    region.setAttribute("aria-busy", "true");
    const current = reads.start();
    const reading = readAll(current);
    // A newer read may have drawn by the time the sketch is due.
    const skeleton = skeletonTiming(() => {
      if (current()) {
        redrawKeepingFocus(root, h, () => {
          content.replaceChildren(sketch());
        });
      }
    }, life);
    const got = await reading;
    if (signal?.aborted === true) {
      skeleton.cancel();
      return;
    }
    skeleton.commit(() => {
      region.removeAttribute("aria-busy");
      if (got) {
        redraw();
      }
    });
  };

  /** Draws the newest read, with the focus its refresh asked for. */
  function redraw(): void {
    const asked = wanted;
    wanted = undefined;
    drawn = true;
    redrawKeepingFocus(
      root,
      h,
      () => {
        notices.drop(failure);
        failure = undefined;
        draw();
      },
      asked,
    );
  }

  /** Reads again and redraws. `focus` names the control to focus after
   *  it, null or a gone control the heading; with no `focus`, focus stays
   *  where it is, or moves to the heading when the redraw took its
   *  control away and drew none like it. */
  async function refresh(focus?: string | null): Promise<void> {
    wanted = focus === undefined ? wanted : focus;
    if (await readAll()) {
      redraw();
    }
  }

  /** Filters the people by the key `id`, or shows every one. */
  function follow(id: number | undefined, replace = false): void {
    filter = id;
    onQuery(paramsOf(id), replace);
    void refresh(null);
  }

  function show(search: string): void {
    const next = keyOf(search);
    if (next !== filter) {
      filter = next;
      void refresh(null);
    }
  }

  if (options.onQuery === undefined) {
    window.addEventListener(
      "popstate",
      () => {
        show(location.search);
      },
      life,
    );
  }

  /** A key's label, or "revoked key 12" once it is gone. */
  const keyLabel = (id: number): string => {
    const k = keys.find((x) => x.id === id);
    if (k === undefined) {
      return keysKnown ? w["keys.revokedParent"](id) : w["users.keyName"](id);
    }
    return k.label === "" ? w["keys.unnamed"] : k.label;
  };

  /** A link to the people the key `id` reached, which filters in place. */
  const keyLink = (id: number, text: string): HTMLAnchorElement => {
    const a = el("a", undefined, text);
    a.href = addressOf(id);
    a.addEventListener(
      "click",
      (e) => {
        if (inPlace(e)) {
          e.preventDefault();
          follow(id);
        }
      },
      life,
    );
    return a;
  };

  function draw(): void {
    if (viewer === undefined) {
      return;
    }
    drawPeople(viewer);
    drawEveryKey(!viewer.session.secure);
  }

  /** The heading, the bar, the people and the invites: everything a key's
   *  label is shown in, but the keys table. */
  function drawPeople(me: AccountView): void {
    const plain = !me.session.secure;
    const https = plain ? holdForHttps([], { httpsOrigin }, options.app, w) : undefined;
    h.textContent =
      filter === undefined ? w["users.title"] : w["users.reachedTitle"](keyLabel(filter));
    const barHeld = drawBar(me, plain, https);
    let held = false;
    const parts: Node[] = [];
    if (filter !== undefined) {
      const all = el("a", undefined, w["users.showAll"]);
      all.href = addressOf(undefined);
      all.addEventListener(
        "click",
        (e) => {
          if (inPlace(e)) {
            e.preventDefault();
            follow(undefined);
          }
        },
        life,
      );
      const back = el("p", "cp-help");
      back.append(all);
      parts.push(back);
    }
    if (list.length === 0 && filter !== undefined) {
      parts.push(el("p", "cp-meta", w["users.reachedNone"]));
    } else {
      const through = list.some((u) => (u.key_lineage?.length ?? 0) > 0);
      const t = table(h.id, [
        { text: w["users.person"] },
        { text: w["users.role"], priority: "mid" },
        { text: w["users.signIn"], priority: "low" },
        ...(through ? [{ text: w["users.through"], priority: "low" as const }] : []),
        { text: w["users.state"] },
        { text: w["methods.actions"], col: "actions" },
      ]);
      for (const u of list) {
        const actions = actionsOf(u, me, plain);
        held ||= actions.some((a) => a.https === true);
        t.body.append(row(u, me, actions, https, through));
      }
      parts.push(t.root);
    }
    // One "Needs HTTPS." line: beside Add user and Invite when they are
    // held, else under the rows it holds.
    if (https !== undefined && barHeld) {
      bar.append(https);
    }
    content.replaceChildren(...parts, ...(https !== undefined && held && !barHeld ? [https] : []));
    drawInvites(me);
  }

  /** Add user… and Invite…, held on a plain session; true when one is. */
  function drawBar(me: AccountView, plain: boolean, https: HTMLElement | undefined): boolean {
    bar.replaceChildren();
    if (me.single_user === true) {
      bar.hidden = true;
      return false;
    }
    bar.hidden = false;
    const add = plainButton(w["users.add"], "plus");
    add.dataset["cpAction"] = "user-add";
    add.addEventListener("click", () => {
      if (!isHeld(add)) {
        addUser(add);
      }
    });
    const buttons = [add];
    if (has("invites")) {
      const invite = plainButton(w["users.invite"], "users");
      invite.dataset["cpAction"] = "user-invite";
      invite.addEventListener("click", () => {
        if (!isHeld(invite)) {
          inviteSomeone(invite);
        }
      });
      buttons.push(invite);
    }
    bar.append(...buttons);
    // access refuses an invite and a temporary password over plain HTTP,
    // and adding a user ends in a temporary password.
    if (plain && https !== undefined) {
      holdBy(buttons, https);
      return true;
    }
    return false;
  }

  /** The live invites, the key filter's alone while it is set. */
  function drawInvites(me: AccountView): void {
    if (!has("invites") || me.single_user === true) {
      invitesPart.root.remove();
      return;
    }
    const key = filter;
    const shown =
      key === undefined ? tokens : tokens.filter((t) => t.issuer_lineage?.includes(key) === true);
    if (shown.length === 0) {
      invitesPart.body.replaceChildren(el("p", "cp-meta", w["invites.empty"]));
    } else {
      const t = table(invitesPart.heading.id, [
        { text: w["invites.kind"] },
        { text: w["users.role"], priority: "mid" },
        { text: w["invites.made"], priority: "low" },
        { text: w["invites.until"] },
        { text: w["invites.by"], priority: "low" },
      ]);
      for (const i of shown) {
        const by = i.issued_by_key;
        const tr = el("tr");
        const made = cell(time(i.created_at, WHEN));
        made.dataset["priority"] = "low";
        const role = cell(i.role === undefined ? "" : w["users.roleOf"](i.role));
        role.dataset["priority"] = "mid";
        const who = cell(
          by === undefined ? w["invites.bySession"] : keyLink(by, w["invites.byKey"](keyLabel(by))),
        );
        who.dataset["priority"] = "low";
        tr.append(
          rowHead(w["invites.purpose"](i.purpose)),
          role,
          made,
          cell(time(i.expires_at, WHEN)),
          who,
        );
        t.body.append(tr);
      }
      invitesPart.body.replaceChildren(t.root);
    }
    if (!invitesPart.root.isConnected) {
      content.after(invitesPart.root);
    }
  }

  /** Every account's keys, drawn once and read again after a change. */
  function drawEveryKey(plain: boolean): void {
    if (!has("admin-keys")) {
      return;
    }
    if (keysView !== undefined) {
      void keysView.refresh();
      return;
    }
    keysView = drawKeys(
      {
        w,
        has,
        app: options.app,
        signal,
        life,
        plain,
        httpsOrigin,
        scopes: undefined,
        keysElsewhere: undefined,
        keyNote: undefined,
        write: (name, reason, work) => write(name, work, reason),
        settle,
      },
      keysPart.body,
      keysPart.heading,
      {
        list: async () => {
          const got = read(() => client.adminKeys());
          const taken = await keyReads.run(
            () => got,
            (answer) => {
              const me = viewer;
              if (takeKeys(answer) && drawn && me !== undefined) {
                redrawKeepingFocus(root, h, () => {
                  drawPeople(me);
                });
              }
            },
          );
          return taken ? got : undefined;
        },
        revoke: (id) => client.adminRevokeKey(id),
        admin: {
          reached: (id) => addressOf(id),
          follow: (id) => {
            follow(id);
          },
          invites: () => tokens,
          revoked: async () => {
            if (await readAll()) {
              redraw();
            }
          },
        },
      },
    );
    root.append(keysPart.root);
  }

  function row(
    u: UserView,
    me: AccountView,
    actions: readonly Action[],
    https: HTMLElement | undefined,
    through: boolean,
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
    tr.append(rowHead(lines.length === 0 ? name : cellStack(name, ...lines)), roleCell, signIn);
    if (through) {
      const path = u.key_lineage ?? [];
      const keyCell = cell();
      keyCell.dataset["priority"] = "low";
      if (path.length > 0) {
        const crumbs = el("nav", "cp-crumbs");
        crumbs.setAttribute("aria-label", w["users.keyPath"](u.username));
        crumbs.append(...path.map((id) => keyLink(id, keyLabel(id))));
        keyCell.append(crumbs);
      }
      tr.append(keyCell);
    }
    tr.append(cell(state), controls);
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
    const [roleField, select] = roleSelect(u.role);
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
    const [lastsField, lasts] = hoursSelect("ttl_hours", LIFETIMES, LIFETIME);
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
    await passOn(u, a.result.data);
  }

  /** Shows `t` once with the words its answer chooses, then reads the
   *  list again. */
  async function passOn(u: UserView, t: TemporaryPasswordResponse): Promise<void> {
    const until = clockAt(new Date(t.expires_at));
    const origin = httpsOriginOf(t.https_origin) ?? location.origin;
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

  /** Add user…: an account with no way in, then its temporary password,
   *  since a person signs in only once given one. */
  function addUser(opener: HTMLElement): void {
    notices.clear();
    const issue = client.adminTemporaryPassword?.bind(client);
    const d = formDialog({
      title: w["users.addTitle"],
      ...(issue === undefined ? {} : { sentence: w["users.addSentence"] }),
      submit: w["users.addSubmit"],
      busy: w["users.addBusy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...life,
    });
    const name = field({ label: w["users.username"], name: "username", autocomplete: "off" });
    name.input.required = true;
    const [roleField, role] = roleSelect("user");
    const [lastsField, lasts] = hoursSelect("ttl_hours", LIFETIMES, LIFETIME);
    d.stack.append(name.root, roleField, ...(issue === undefined ? [] : [lastsField]));
    name.input.addEventListener("input", () => {
      clearError(name.input);
    });
    name.input.focus();

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy()) {
        return;
      }
      const username = name.input.value.trim();
      if (username === "") {
        showError(name.input, w["auth_username_invalid.empty"]);
        name.input.focus();
        return;
      }
      d.notices.clear();
      const ttl = Number(lasts.value);
      const work = async (): Promise<{
        readonly made: StepUpAnswer<UserView>;
        readonly issued?: StepUpAnswer<TemporaryPasswordResponse>;
      }> => {
        const made = await write("auth.admin_user_create", () =>
          client.adminCreateUser({ username, role: role.value }),
        );
        if (issue === undefined || made.kind !== "done" || !made.result.ok) {
          return { made };
        }
        const id = made.result.data.id;
        return {
          made,
          issued: await write("auth.admin_temporary_password", () => issue(id, { ttl_hours: ttl })),
        };
      };
      void d
        .run(work, (a) => a.made.kind === "done" && a.made.result.ok)
        .then(async (got) => {
          if (got === undefined || got.answer.made.kind === "cancelled") {
            return;
          }
          const { made, issued: given } = got.answer;
          if (made.kind === "done" && !made.result.ok) {
            const r = made.result;
            const code = codeOf(r);
            if (code === "auth_username_taken" || code === "auth_username_invalid") {
              showError(
                name.input,
                code === "auth_username_taken" ? w.auth_username_taken : usernameWords(r, w),
              );
              name.input.focus();
              return;
            }
          }
          d.close();
          if (made.kind !== "done" || !made.result.ok) {
            settle(made);
            return;
          }
          const u = made.result.data;
          const key = `user-temporary-${String(u.id)}`;
          if (given?.kind === "done" && given.result.ok) {
            notices.show("success", w["users.added"](u.username));
            await passOn(u, given.result.data);
            return;
          }
          if (given !== undefined) {
            notices.show("warning", w["users.addedNoPassword"](u.username));
          } else {
            notices.show("success", w["users.added"](u.username));
          }
          await refresh(key);
        });
    });
  }

  /** Invite…: a role and how long, then the link shown once. */
  function inviteSomeone(opener: HTMLElement): void {
    notices.clear();
    const d = formDialog({
      title: w["users.inviteTitle"],
      sentence: w["users.inviteSentence"],
      submit: w["users.inviteSubmit"],
      busy: w["users.inviteBusy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...life,
    });
    const [roleField, role] = roleSelect("user");
    const [lastsField, lasts] = hoursSelect("hours", INVITE_LIFETIMES, INVITE_LIFETIME);
    d.stack.append(roleField, lastsField);
    role.focus();

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy()) {
        return;
      }
      d.notices.clear();
      const request = { role: role.value, hours: Number(lasts.value) };
      void d
        .run(
          () => write("auth.admin_invite", () => client.adminInvite(request)),
          (a) => a.kind === "done" && a.result.ok,
        )
        .then(async (got) => {
          if (got === undefined || got.answer.kind === "cancelled") {
            return;
          }
          d.close();
          const a = got.answer;
          if (a.kind !== "done" || !a.result.ok) {
            settle(a);
            return;
          }
          const link = new URL(options.invitePath ?? "/invite", location.href);
          link.hash = `token=${encodeURIComponent(a.result.data.token)}`;
          await showSecret(
            {
              title: w["users.inviteShown"],
              line: w["users.inviteLine"](clockAt(new Date(a.result.data.expires_at))),
              label: w["users.inviteLabel"],
              secret: link.href,
            },
            w,
            signal,
          );
          notices.show("success", w["users.invited"]);
          await refresh("user-invite");
        });
    });
  }

  /** The role field, `current` chosen; a role outside the library's two is
   *  kept as a choice. */
  function roleSelect(current: string): [HTMLElement, HTMLSelectElement] {
    const roles: readonly string[] = ROLES.includes(current as "admin")
      ? ROLES
      : [...ROLES, current];
    return selectField(
      w["users.role"],
      "role",
      roles.map((r) => [r, w["users.roleOf"](r)] as const),
      current,
    );
  }

  /** A field choosing a number of hours from `choices`. */
  function hoursSelect(
    name: string,
    choices: readonly number[],
    chosen: number,
  ): [HTMLElement, HTMLSelectElement] {
    return selectField(
      w["users.lasts"],
      name,
      choices.map((n) => [String(n), w["users.hours"](n)] as const),
      String(chosen),
    );
  }

  function selectField(
    text: string,
    name: string,
    choices: readonly (readonly [string, string])[],
    chosen: string,
  ): [HTMLElement, HTMLSelectElement] {
    const select = el("select", "cp-input");
    select.id = uid(`user-${name}`);
    select.name = name;
    for (const [value, words] of choices) {
      select.append(new Option(words, value, false, value === chosen));
    }
    const root = el("div", "cp-field");
    const label = el("label", "cp-label", text);
    label.htmlFor = select.id;
    const wrap = el("div", "cp-select");
    wrap.append(select);
    root.append(label, wrap);
    return [root, select];
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
  return { refresh: () => refresh(), show };
}
