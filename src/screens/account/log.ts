/**
 * log.ts — the security log: one `.cp-table` of what succeeded and what
 * changed, filtered by kind and person, newest or oldest first, paged by
 * the entries' `seq` with Newer and Older, the view held in the address,
 * as docs/design-account.md "Security log" says. Account and security
 * shows it for the viewer; an admin's screen mounts it for everyone.
 * @module
 */

import { enhancePill } from "../../core/pill/pill.js";
import { announce, installAnnouncer } from "../../feedback/announce/announce.js";
import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import { glyph } from "../../foundations/icons/glyph.js";
import { rowHead } from "./actions.js";
import { codeOf, generic, reasonOf } from "./answer.js";
import type {
  LogClient,
  LogEntryView,
  LogQuery,
  Refusal,
  Result,
  SecurityLogView,
} from "./client.js";
import { deviceName } from "./device.js";
import { cell, cellStack, el, heading, notice, sketch, table, time, uid } from "./dom.js";
import {
  endsSession,
  leaver,
  read,
  slot,
  type ScreenOptions,
  type SignedOutOptions,
  type SignedOutReason,
} from "./screen.js";
import { wordsOf, type AccountWords } from "./words.js";

/** The app's words for a kind, its own (`<app>.<name>`) or one of
 *  access's it words differently. */
export type LogKinds = Readonly<Record<string, string | ((entry: LogEntryView) => string)>>;

/** What the log takes, mounted alone or inside Account and security. */
export interface LogOptions {
  /** The app's words per kind, read before the library's. */
  readonly kinds?: LogKinds;
  /** Entries a page holds. Default 50, at most 500. */
  readonly limit?: number;
  /**
   * Writes the view into the address: `order=oldest`, `kind`, `user`, and
   * `before` or `after` a `seq`. `replace` is true when the view corrects
   * an address that named no page. Default: `history.pushState`, or
   * `replaceState`, keeping every other parameter.
   */
  readonly onQuery?: (params: URLSearchParams, replace: boolean) => void;
}

export interface SecurityLogOptions<C extends LogClient>
  extends ScreenOptions, SignedOutOptions, LogOptions {
  /** The host's `@cplieger/access` client. */
  readonly client: C;
  /** The heading's level. Default 2. */
  readonly level?: number;
  /** The single sign-on provider's name, for "Linked to Authelia". */
  readonly provider?: string;
  /** Only the entries about this account, with no Account filter. */
  readonly user?: number;
  /** The signed-in person's id: their entries read "You". */
  readonly viewer?: number;
}

export interface SecurityLogScreen {
  /** Reads what the log gained since the newest entry shown: the first
   *  page takes it on top, a later page offers it through Newer. */
  refresh(): Promise<void>;
  /** Shows the view a query names, as Back does. The log follows
   *  `popstate` itself unless the host passes `onQuery`. */
  show(search: string): void;
}

/** What the log reads from its screen. */
export interface LogCtx {
  readonly client: LogClient;
  readonly w: AccountWords;
  readonly provider: string;
  readonly options: LogOptions;
  readonly search: string;
  readonly user: number | undefined;
  readonly viewer: number | undefined;
  readonly life: { readonly signal?: AbortSignal };
  readonly leave: (reason: SignedOutReason) => void;
  /** Runs instead of the refusal's notice when the viewer may not read
   *  the log. */
  readonly forbidden?: () => void;
}

const KEYS = ["order", "kind", "user", "before", "after"] as const;

interface View {
  readonly order: "newest" | "oldest";
  readonly kind?: string;
  readonly user?: number;
  readonly before?: number;
  readonly after?: number;
}

// access's own kinds, each in the class its entries take (its
// account.eventKinds, and the kinds its Parts 4 and 5 add).
const SESSION_KINDS = [
  "signed_in",
  "stepped_up",
  "session_revoked",
  "second_factor_failed",
  "temporary_password_used",
  "oidc_not_admitted",
] as const;
const CHANGE_KINDS = [
  "user_created",
  "user_sessions_revoked",
  "password_set",
  "password_changed",
  "password_removed",
  "passkey_added",
  "passkey_removed",
  "oidc_linked",
  "oidc_unlinked",
  "setup_token_issued",
  "recovery_issued",
  "recovery_consumed",
  "recovery_completed",
  "key_minted",
  "key_rotated",
  "key_revoked",
  "user_disabled",
  "user_enabled",
  "user_deleted",
  "role_changed",
  "invite_issued",
  "method_locked",
  "method_reenabled",
  "totp_added",
  "totp_replaced",
  "totp_removed",
  "second_factor_reset",
  "recovery_code_issued",
  "recovery_code_replaced",
  "recovery_code_used",
  "temporary_password_set",
  "temporary_password_withdrawn",
  "user_approved",
  "registration_expired",
  "owner_set",
  "owner_removed",
  "role_synced",
  "role_sync_skipped",
  "sso_mode_changed",
] as const;

// access's rule for a kind: a library kind, or an app's `<app>.<name>`.
const KIND = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const SEQ = /^[1-9]\d{0,15}$/;
const WHEN: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
// A row's time is two short lines, so the When column stays narrow.
const DAY: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
const CLOCK: Intl.DateTimeFormatOptions = { timeStyle: "short" };

/** A positive whole number the address holds, within JSON's exact range. */
function seqOf(value: string | null): number | undefined {
  return value !== null && SEQ.test(value) && Number(value) <= Number.MAX_SAFE_INTEGER
    ? Number(value)
    : undefined;
}

function viewOf(search: string, fixedUser: boolean): View {
  const p = new URLSearchParams(search);
  const kind = p.get("kind");
  const user = fixedUser ? undefined : seqOf(p.get("user"));
  const before = seqOf(p.get("before"));
  const after = before === undefined ? seqOf(p.get("after")) : undefined;
  return {
    order: p.get("order") === "oldest" ? "oldest" : "newest",
    ...(kind !== null && kind.length <= 64 && KIND.test(kind) ? { kind } : {}),
    ...(user === undefined ? {} : { user }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}

function paramsOf(v: View): URLSearchParams {
  const p = new URLSearchParams();
  if (v.order === "oldest") {
    p.set("order", "oldest");
  }
  if (v.kind !== undefined) {
    p.set("kind", v.kind);
  }
  if (v.user !== undefined) {
    p.set("user", String(v.user));
  }
  if (v.before !== undefined) {
    p.set("before", String(v.before));
  }
  if (v.after !== undefined) {
    p.set("after", String(v.after));
  }
  return p;
}

/** This page's address with the log's parameters set to `params`. */
function addressOf(params: URLSearchParams): URL {
  const url = new URL(location.href);
  for (const k of KEYS) {
    url.searchParams.delete(k);
  }
  for (const [k, v] of params) {
    url.searchParams.set(k, v);
  }
  return url;
}

const writeAddress = (params: URLSearchParams, replace: boolean): void => {
  const url = addressOf(params);
  if (replace) {
    history.replaceState(history.state, "", url);
  } else {
    history.pushState(history.state, "", url);
  }
};

/** `v` with no page bound: its first page. */
const first = (v: View): View => ({
  order: v.order,
  ...(v.kind === undefined ? {} : { kind: v.kind }),
  ...(v.user === undefined ? {} : { user: v.user }),
});

/** Fills `region` with the security log under its own heading. */
export function mountSecurityLog<C extends LogClient>(
  region: HTMLElement,
  options: SecurityLogOptions<C>,
): SecurityLogScreen {
  const w = wordsOf(options.words);
  const life = options.signal === undefined ? {} : { signal: options.signal };
  const navigate =
    options.navigate ??
    ((url: string) => {
      location.assign(url);
    });
  installAnnouncer(life);
  const root = el("section", "cp-stack");
  const h = heading(options.level ?? 2, w["log.title"]);
  h.tabIndex = -1;
  root.setAttribute("aria-labelledby", h.id);
  const body = el("div", "cp-stack");
  root.append(h, body);
  region.replaceChildren(root);
  return drawLog(
    {
      client: options.client,
      w,
      provider: options.provider ?? w.provider,
      options,
      search: options.search ?? location.search,
      user: options.user,
      viewer: options.viewer,
      life,
      leave: leaver(options, navigate),
    },
    body,
    h,
  );
}

/** Fills `body` with the log, named by `title`, which takes focus after a
 *  page change. */
export function drawLog(
  ctx: LogCtx,
  body: HTMLElement,
  title: HTMLHeadingElement,
): SecurityLogScreen {
  const { w, client } = ctx;
  const signal = ctx.life.signal;
  const limit = Math.min(500, Math.max(1, Math.trunc(ctx.options.limit ?? 50)));
  const onQuery = ctx.options.onQuery ?? writeAddress;
  const kinds = ctx.options.kinds ?? {};
  const fixed = ctx.user !== undefined;
  const how = (method: string): string => w["security.method"](method, ctx.provider);

  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  const filters = el("div", "cp-cluster");
  filters.dataset["part"] = "filters";
  const counts = el("p", "cp-meta");
  counts.dataset["part"] = "counts";
  const evicted = el("div");
  evicted.dataset["part"] = "evicted";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "log";
  const help = el("p", "cp-help", w["log.help"]);
  body.replaceChildren(filters, notices.root, counts, evicted, content, help);

  let view = viewOf(ctx.search, fixed);
  let entries: readonly LogEntryView[] = [];
  let past = false;
  let future = false;
  let loads = 0;
  let busy = false;
  const people = new Map<number, string>();

  const nameOf = (id: number): string =>
    id === ctx.viewer ? w["log.you"] : (people.get(id) ?? w["log.person"](id));

  const kindWords = (e: LogEntryView): string | undefined => {
    if (Object.hasOwn(kinds, e.kind)) {
      const own = kinds[e.kind];
      return typeof own === "function" ? own(e) : own;
    }
    return w["log.kind"](e, how);
  };

  const label = (kind: string): string =>
    kindWords({ seq: 0, at: "", occurred_at: "", class: "", kind, actor: {} }) ?? kind;

  // The filters ------------------------------------------------------------

  const kindSelect = el("select", "cp-input");
  kindSelect.id = uid("log-kind");
  kindSelect.append(new Option(w["log.everyKind"], ""));
  const groups: [string, readonly string[]][] = [
    [w["log.groupOf"]("change"), CHANGE_KINDS],
    [w["log.groupOf"]("session"), SESSION_KINDS],
    [w["log.appKinds"], Object.keys(kinds).filter((k) => k.includes(".") && KIND.test(k))],
  ];
  for (const [name, list] of groups) {
    if (list.length === 0) {
      continue;
    }
    const group = el("optgroup");
    group.label = name;
    for (const k of list) {
      group.append(new Option(label(k), k));
    }
    kindSelect.append(group);
  }
  kindSelect.addEventListener(
    "change",
    () => {
      const { kind: _, ...rest } = first(view);
      void go(kindSelect.value === "" ? rest : { ...rest, kind: kindSelect.value });
    },
    ctx.life,
  );
  filters.append(fieldOf(w["log.filterKind"], kindSelect));

  const personSelect = el("select", "cp-input");
  personSelect.id = uid("log-person");
  personSelect.addEventListener(
    "change",
    () => {
      const { user: _, ...rest } = first(view);
      const user = seqOf(personSelect.value);
      void go(user === undefined ? rest : { ...rest, user });
    },
    ctx.life,
  );
  const personField = fieldOf(w["log.filterPerson"], personSelect);

  const order = el("div", "cp-segmented");
  order.setAttribute("role", "radiogroup");
  order.setAttribute("aria-label", w["log.order"]);
  const orderName = uid("log-order");
  const radios = (["newest", "oldest"] as const).map((value) => {
    const radio = el("input");
    radio.type = "radio";
    radio.name = orderName;
    radio.value = value;
    const l = el("label");
    l.append(radio, w[value === "newest" ? "log.newestFirst" : "log.oldestFirst"]);
    order.append(l);
    radio.addEventListener(
      "change",
      () => {
        if (radio.checked) {
          void go({ ...first(view), order: value });
        }
      },
      ctx.life,
    );
    return radio;
  });
  filters.append(order);
  enhancePill(order, ctx.life);

  const syncFilters = (): void => {
    kindSelect.value = view.kind ?? "";
    if (kindSelect.value !== (view.kind ?? "")) {
      // A kind the list does not hold, such as one a newer server logs.
      kindSelect.append(new Option(view.kind ?? "", view.kind ?? ""));
      kindSelect.value = view.kind ?? "";
    }
    personSelect.value = view.user === undefined ? "" : String(view.user);
    for (const r of radios) {
      r.checked = r.value === view.order;
    }
  };

  const readPeople = async (): Promise<void> => {
    const users = client.adminUsers?.bind(client);
    if (fixed || users === undefined) {
      return;
    }
    const got = await read(users);
    if (!got.ok || signal?.aborted === true) {
      return;
    }
    for (const p of got.data) {
      people.set(
        p.id,
        p.display_name !== undefined && p.display_name !== "" ? p.display_name : p.username,
      );
    }
    personSelect.replaceChildren(new Option(w["log.everyone"], ""));
    for (const [id, name] of [...people].sort((a, b) => a[1].localeCompare(b[1]))) {
      personSelect.append(new Option(name, String(id)));
    }
    if (people.size > 0) {
      order.before(personField);
      syncFilters();
    }
  };

  // Reading ----------------------------------------------------------------

  const query = (v: View, extra: LogQuery = {}): Promise<Result<SecurityLogView>> =>
    read(() =>
      client.adminSecurityLog({
        limit,
        ...(v.kind === undefined ? {} : { kinds: [v.kind] }),
        ...(ctx.user === undefined
          ? v.user === undefined
            ? {}
            : { user: v.user }
          : { user: ctx.user }),
        ...extra,
      }),
    );

  const shown = (list: readonly LogEntryView[]): LogEntryView[] =>
    [...list].sort((a, b) => (view.order === "newest" ? b.seq - a.seq : a.seq - b.seq));

  const load = async (focus: boolean): Promise<void> => {
    loads += 1;
    const mine = loads;
    busy = true;
    body.setAttribute("aria-busy", "true");
    const ascending =
      view.after !== undefined || (view.before === undefined && view.order === "oldest");
    const skeleton = skeletonTiming(() => {
      if (entries.length === 0) {
        content.replaceChildren(sketch());
      }
    }, ctx.life);
    const [got] = await Promise.all([
      query(view, {
        ...(ascending ? { oldestFirst: true } : {}),
        ...(view.before === undefined ? {} : { before: view.before }),
        ...(view.after === undefined ? {} : { after: view.after }),
      }),
      peopleRead,
    ]);
    if (mine !== loads || signal?.aborted === true) {
      skeleton.cancel();
      return;
    }
    busy = false;
    skeleton.commit(() => {
      body.removeAttribute("aria-busy");
      if (!got.ok) {
        if (content.querySelector("table") === null) {
          content.replaceChildren();
        }
        refused(got);
        return;
      }
      notices.clear();
      const page = got.data.entries;
      if (page.length === 0 && (view.before !== undefined || view.after !== undefined)) {
        void go(first(view), { replace: true });
        return;
      }
      const full = page.length >= limit;
      past = ascending ? view.after !== undefined : full;
      future = ascending ? full : view.before !== undefined;
      entries = shown(page);
      draw(got.data);
      if (focus) {
        title.focus();
      }
    });
  };

  const go = async (
    next: View,
    o: { readonly replace?: boolean; readonly focus?: boolean } = {},
  ): Promise<void> => {
    view = next;
    syncFilters();
    onQuery(paramsOf(next), o.replace === true);
    await load(o.focus === true);
  };

  const refused = (r: Refusal): void => {
    if (endsSession(r, ctx.leave)) {
      return;
    }
    switch (codeOf(r)) {
      case "auth_forbidden":
        if (ctx.forbidden !== undefined) {
          ctx.forbidden();
          return;
        }
        notices.show("danger", w["log.forbidden"]);
        return;
      case "auth_bad_request":
        if (reasonOf(r) === "log_kind") {
          notices.show("warning", w["log.unknownKind"], button(w["log.clear"], cleared));
          return;
        }
        notices.show(
          "warning",
          w["log.badPage"],
          button(w["log.newest"], () => void go(first(view))),
        );
        return;
      default: {
        const said = generic(r, w);
        notices.show(
          said.tone,
          said.text,
          button(w["generic.retry"], () => void load(false)),
        );
      }
    }
  };

  const cleared = (): void => {
    void go({ order: view.order });
  };

  // Drawing ----------------------------------------------------------------

  const draw = (page: SecurityLogView): void => {
    const fmt = new Intl.NumberFormat();
    const count = (c: string): number => page.classes.find((x) => x.class === c)?.count ?? 0;
    counts.textContent = w["log.counts"](fmt.format(count("change")), fmt.format(count("session")));
    const removed = page.classes.reduce((n, c) => n + c.evicted, 0);
    evicted.replaceChildren(
      ...(removed > 0 ? [notice("neutral", w["log.evicted"](fmt.format(removed)))] : []),
    );
    if (entries.length === 0) {
      content.replaceChildren(empty());
      return;
    }
    const t = table(title.id, [
      { text: w["log.when"] },
      { text: w["log.what"] },
      ...(fixed ? [] : [{ text: w["log.account"], priority: "mid" as const }]),
      { text: w["log.who"] },
      { text: w["log.where"], priority: "low" },
      { text: w["log.type"], priority: "low" },
    ]);
    for (const e of entries) {
      const tr = el("tr");
      tr.dataset["seq"] = String(e.seq);
      const what = kindWords(e);
      const where = cell();
      where.dataset["priority"] = "low";
      if (e.ip !== undefined && e.ip !== "") {
        where.append(el("span", "cp-mono", e.ip));
      }
      const type = cell(el("span", "cp-chip", w["log.classOf"](e.class)));
      type.dataset["priority"] = "low";
      tr.append(
        rowHead(cellStack(time(e.occurred_at, DAY), time(e.occurred_at, CLOCK))),
        cell(what ?? asSent(e)),
      );
      if (!fixed) {
        const about = cell(e.user_id === undefined ? "" : nameOf(e.user_id));
        about.dataset["priority"] = "mid";
        tr.append(about);
      }
      tr.append(who(e), where, type);
      t.body.append(tr);
    }
    t.root.append(pager());
    content.replaceChildren(t.root);
  };

  const who = (e: LogEntryView): HTMLTableCellElement => {
    const a = e.actor;
    if (a.out_of_band !== undefined && a.out_of_band !== "") {
      return cell(w["log.outOfBand"](a.out_of_band));
    }
    if (a.key_id !== undefined) {
      const name = w["log.key"](a.label);
      return cell(
        a.key_suffix === undefined || a.key_suffix === ""
          ? name
          : cellStack(name, el("span", "cp-mono", `…${a.key_suffix}`)),
      );
    }
    if (a.user_id !== undefined) {
      const name = nameOf(a.user_id);
      const named = (a.label ?? "") !== "" || (a.user_agent ?? "") !== "";
      return cell(named ? cellStack(name, deviceName(a, w)) : name);
    }
    return cell(w["log.nobody"]);
  };

  const pager = (): HTMLElement => {
    const nav = el("nav", "cp-pager");
    nav.setAttribute("aria-label", w["log.pages"]);
    const times = entries.map((e) => e.occurred_at).sort();
    const from = times[0];
    const to = times[times.length - 1];
    nav.append(
      el(
        "span",
        undefined,
        from === undefined || to === undefined
          ? ""
          : w["log.range"](time(from, WHEN).textContent, time(to, WHEN).textContent),
      ),
    );
    const seqs = entries.map((e) => e.seq);
    const low = Math.min(...seqs);
    const high = Math.max(...seqs);
    const base = first(view);
    const toPast = past ? { ...base, before: low } : undefined;
    const toFuture = future ? { ...base, after: high } : undefined;
    const links =
      view.order === "newest"
        ? [link(w["log.newer"], toFuture, "newer"), link(w["log.older"], toPast, "older")]
        : [link(w["log.earlier"], toPast, "older"), link(w["log.later"], toFuture, "newer")];
    nav.append(...links);
    return nav;
  };

  const link = (text: string, to: View | undefined, side: string): HTMLAnchorElement => {
    const a = el("a", "cp-button", text);
    a.dataset["variant"] = "quiet";
    a.dataset["size"] = "sm";
    a.dataset["part"] = side;
    if (to === undefined) {
      a.setAttribute("aria-disabled", "true");
      return a;
    }
    const url = addressOf(paramsOf(to));
    a.href = url.pathname + url.search + url.hash;
    a.addEventListener(
      "click",
      (ev) => {
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
          return;
        }
        ev.preventDefault();
        void go(to, { focus: true });
      },
      ctx.life,
    );
    return a;
  };

  const empty = (): HTMLElement => {
    const box = el("div", "cp-empty");
    const filtered = view.kind !== undefined || view.user !== undefined;
    box.append(
      glyph("history"),
      el("p", undefined, w[filtered ? "log.emptyFiltered" : "log.empty"]),
    );
    if (filtered) {
      box.append(button(w["log.clear"], cleared));
    }
    return box;
  };

  function button(text: string, run: () => void): HTMLButtonElement {
    const b = el("button", "cp-button", text);
    b.type = "button";
    b.addEventListener("click", run, { once: true });
    return b;
  }

  // Keeping up -------------------------------------------------------------

  const refresh = async (): Promise<void> => {
    if (busy) {
      return;
    }
    const top = entries.reduce((n, e) => Math.max(n, e.seq), 0);
    const atTop = view.before === undefined && view.after === undefined;
    const live = view.order === "newest" ? atTop : !future;
    const since = top === 0 ? {} : { after: top };
    if (!live) {
      if (future) {
        return;
      }
      const got = await query(view, { ...since, oldestFirst: true, limit: 1 });
      if (got.ok && got.data.entries.length > 0 && signal?.aborted !== true) {
        future = true;
        draw(got.data);
      }
      return;
    }
    const mine = loads;
    const fresh: LogEntryView[] = [];
    let last: SecurityLogView | undefined;
    let after = since;
    let more = false;
    // Ten pages at most: past them, a newest-first view reads its first
    // page again, and an oldest-first one offers the rest through Later.
    for (let i = 0; i < 10; i += 1) {
      const got = await query(view, { ...after, oldestFirst: true });
      if (mine !== loads || signal?.aborted === true) {
        return;
      }
      if (!got.ok) {
        refused(got);
        return;
      }
      last = got.data;
      fresh.push(...got.data.entries);
      const end = got.data.entries[got.data.entries.length - 1];
      more = got.data.entries.length >= limit && end !== undefined;
      if (!more || end === undefined) {
        break;
      }
      after = { after: end.seq };
    }
    if (last === undefined || fresh.length === 0) {
      return;
    }
    if (more && view.order === "newest") {
      await load(false);
      announce(w["log.arrived"](fresh.length));
      return;
    }
    const known = new Set(entries.map((e) => e.seq));
    const added = fresh.filter((e) => !known.has(e.seq));
    if (added.length === 0) {
      return;
    }
    let next = shown([...entries, ...added]);
    if (next.length > limit) {
      if (view.order === "newest") {
        past = true;
      } else {
        future = true;
      }
      next = next.slice(0, limit);
    }
    entries = next;
    draw(last);
    announce(w["log.arrived"](added.length));
  };

  const show = (search: string): void => {
    const next = viewOf(search, fixed);
    if (paramsOf(next).toString() !== paramsOf(view).toString()) {
      view = next;
      syncFilters();
      void load(false);
    }
  };
  if (ctx.options.onQuery === undefined) {
    window.addEventListener(
      "popstate",
      () => {
        show(location.search);
      },
      ctx.life,
    );
  }

  syncFilters();
  const peopleRead = readPeople();
  void load(false);
  return { refresh, show };
}

/** A kind with no words, as sent, with the app's detail under it. */
function asSent(e: LogEntryView): HTMLElement {
  const code = el("span", "cp-mono", e.kind);
  return e.detail === undefined || e.detail === "" ? code : cellStack(code, e.detail);
}

function fieldOf(text: string, select: HTMLSelectElement): HTMLElement {
  const root = el("div", "cp-field");
  const l = el("label", "cp-label", text);
  l.htmlFor = select.id;
  const wrap = el("div", "cp-select");
  wrap.append(select);
  root.append(l, wrap);
  return root;
}
