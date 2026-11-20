/**
 * keys.ts — the one API keys table: Account and security's own keys, with
 * Create key…, the scope picker, Rename… in place and Rotate…; and the
 * admin's every-account table, with each key's owner, origin, the people
 * it reached and its live invites. Both revoke.
 * @module
 */

import { enhanceRowDetail } from "../../data/table/table.js";
import { clearError, showError } from "../../forms/form/form.js";
import { glyph } from "../../foundations/icons/glyph.js";
import { rowActions, rowHead, type Action } from "./actions.js";
import { codeOf, reasonOf, retryAfter, runes } from "./answer.js";
import type { KeyCreated, KeyView, Refusal, Result, SecurityClient, TokenView } from "./client.js";
import { formDialog, type FormDialog } from "./dialogs.js";
import {
  cell,
  cellStack,
  clockAt,
  el,
  field,
  plainButton,
  stateMark,
  table,
  time,
  uid,
} from "./dom.js";
import { screenPart } from "./part.js";
import { NAME_MAX, nameRefused } from "./rename.js";
import {
  duration,
  holdBy,
  holdFor,
  holdForHttps,
  isHeld,
  question,
  retryButton,
  slot,
} from "./screen.js";
import type { Ctx } from "./security.js";
import { showSecret } from "./shown.js";
import type { StepUpAnswer } from "./step-up.js";

/** One scope a key may carry, as the host's app defines it. */
export interface KeyScope {
  /** The scope's name in access's `Rules.Scopes`. */
  readonly value: string;
  readonly label: string;
  /** What a key with it can do, under its label. */
  readonly line?: string;
}

/**
 * The scope picker of Create key…: an ordered level, one of `levels` or
 * none, then any of `permissions`. With either group, a key needs a level
 * or a permission.
 */
export interface KeyScopes {
  readonly levels?: readonly KeyScope[];
  readonly permissions?: readonly KeyScope[];
  /** Every key holds one of `levels`: no "No level" choice, and a key
   *  with permissions only is refused before sending. */
  readonly required?: boolean;
  /** The level checked when Create key… opens, one of `levels`' values.
   *  Default: none. */
  readonly initial?: string;
}

/**
 * The app's line under a new secret, such as where to put it, for a key
 * just created or rotated. A string is a muted line; a node goes as it is.
 */
export type KeyNote = (made: "create" | "rotate", key: KeyView) => string | Node | undefined;

/** Throws a `RangeError` for scopes no picker can offer: `required` with
 *  no levels, or an `initial` that is not one of them. */
export function checkScopes(scopes: KeyScopes | undefined): void {
  const levels = scopes?.levels ?? [];
  if (scopes?.required === true && levels.length === 0) {
    throw new RangeError("scopes.required needs levels");
  }
  const initial = scopes?.initial;
  if (initial !== undefined && !levels.some((s) => s.value === initial)) {
    throw new RangeError(`scopes.initial "${initial}" is not one of the levels`);
  }
}

/** What a keys table reads from the screen it is part of. */
export type KeysCtx = Pick<
  Ctx<SecurityClient>,
  | "w"
  | "has"
  | "app"
  | "signal"
  | "life"
  | "plain"
  | "httpsOrigin"
  | "scopes"
  | "keysElsewhere"
  | "keyNote"
  | "write"
  | "settle"
>;

/** The calls a keys table makes. */
export interface KeyCalls {
  /** Answers undefined when a newer read of the same keys took over,
   *  which the table takes as no change; never rejects. */
  list(): Promise<Result<readonly KeyView[]> | undefined>;
  revoke(id: number): Promise<Result<void>>;
  /** The person's own keys: Create key…, Rename… and Rotate…. */
  readonly own?: {
    readonly create: SecurityClient["createKey"];
    readonly rename: SecurityClient["renameKey"];
    readonly rotate: SecurityClient["rotateKey"];
  };
  /** The admin's every-account table. */
  readonly admin?: KeysAdmin;
}

/** What the every-account table shows beside each key. */
interface KeysAdmin {
  /** The address of the people a key reached. */
  reached(id: number): string;
  /** Shows `reached(id)` in place. */
  follow(id: number): void;
  /** The live invites. */
  invites(): readonly TokenView[];
  /** Runs after a revoke, before the table is read again. */
  revoked(): Promise<void>;
}

export interface KeysSection {
  /** Reads the keys again and redraws them. */
  refresh(focus?: string): Promise<void>;
}

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const LIFETIMES = [30, 90, 365, 0] as const;
const LIFETIME = 90;
const MINUTE = 60_000;
const DAY_MS = 86_400_000;

/** Fills `body` with the keys `calls` reads. */
export function drawKeys(
  ctx: KeysCtx,
  body: HTMLElement,
  heading: HTMLHeadingElement,
  calls: KeyCalls,
): KeysSection {
  const { w, has } = ctx;
  const { own, admin } = calls;
  const notices = slot(el("div"), heading);
  notices.root.dataset["part"] = "notice";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "keys";
  body.replaceChildren(notices.root, content);
  const levels = ctx.scopes?.levels ?? [];
  const permissions = ctx.scopes?.permissions ?? [];
  const picked = levels.length > 0 || permissions.length > 0;
  const scopeLabel = new Map([...levels, ...permissions].map((s) => [s.value, s.label]));
  const levelValues = new Set(levels.map((s) => s.value));
  const levelRequired = ctx.scopes?.required === true;
  const initial = ctx.scopes?.initial;
  let list: readonly KeyView[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A past end the server still sent, and the wait before asking again:
  // its clock is behind this one, so the wait doubles rather than polling.
  let pastEnd: number | undefined;
  let pastWait = 0;
  // How long the previous secret worked after the last rotation here, which
  // the app sets and only a rotation's answer tells.
  let overlap: string | undefined;
  const noted = (made: "create" | "rotate", key: KeyView): { help?: string | Node } => {
    const help = ctx.keyNote?.(made, key);
    return help === undefined ? {} : { help };
  };

  const labelOf = (k: KeyView): string => (k.label === "" ? w["keys.unnamed"] : k.label);

  // Reads overlap: focus, the timer, every key action.
  const part = screenPart<readonly KeyView[]>({
    content,
    heading,
    notices,
    signal: ctx.signal,
    read: () => calls.list(),
    refused: (r, again) => {
      ctx.settle({ kind: "done", result: r }, notices, (x) => unavailable(x, again));
    },
    draw: (got) => {
      list = got;
      draw();
    },
  });
  const refresh = async (focus?: string): Promise<void> => {
    await part.refresh(focus);
  };

  /** The soonest previous secret's end, when the row goes Active again. */
  const schedule = (): void => {
    clearTimeout(timer);
    const ends = list
      .map((k) => (k.previous_until === undefined ? Number.NaN : Date.parse(k.previous_until)))
      .filter((t) => !Number.isNaN(t));
    if (ends.length === 0) {
      pastEnd = undefined;
      return;
    }
    const now = Date.now();
    const soonest = Math.min(...ends);
    const left = soonest - now;
    let wait = left + 1000;
    if (left < 0) {
      pastWait = soonest === pastEnd ? Math.min(pastWait * 2, MINUTE) : 1000;
      pastEnd = soonest;
      const ahead = ends.filter((t) => t >= now);
      wait = Math.min(pastWait, ahead.length === 0 ? pastWait : Math.min(...ahead) - now + 1000);
    } else {
      pastEnd = undefined;
    }
    timer = setTimeout(() => void refresh(), Math.min(wait, DAY_MS));
  };

  window.addEventListener("focus", () => void refresh(), ctx.life);
  ctx.signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );

  /** Offers Retry on `auth_unavailable`, the one answer worth repeating. */
  const unavailable = (r: Refusal, again: () => unknown): null | undefined => {
    if (codeOf(r) !== "auth_unavailable") {
      return undefined;
    }
    notices.show("danger", w["generic.unavailable"], retryButton(w["generic.retry"], again));
    return null;
  };

  /** The key routes' own answers, then Retry, else the shared words. */
  const refused = (r: Refusal, again: () => unknown): null | undefined => {
    switch (codeOf(r)) {
      case "auth_not_found":
        notices.show("neutral", w["keys.gone"]);
        void refresh();
        return null;
      case "auth_invalid_credentials":
      case "auth_key_invalid":
        notices.show("danger", w["keys.signInAgain"]);
        return null;
      case "auth_body_too_large":
        notices.show("danger", w.auth_body_too_large);
        return null;
      case "auth_forbidden":
        notices.show(
          "danger",
          reasonOf(r) === "key_expired" ? w["keys.expiredRefused"] : w.auth_forbidden,
        );
        return null;
      case "auth_session_required":
        notices.show("danger", w.auth_session_required);
        return null;
      default:
        return unavailable(r, again);
    }
  };

  const draw = (): void => {
    schedule();
    const now = Date.now();
    const parts: Node[] = [];
    // One "Needs HTTPS." line for Create key and every row's Rotate.
    const https = ctx.plain ? holdForHttps([], ctx, ctx.app, w) : undefined;
    const create = createControl(https);
    if (list.length === 0) {
      const empty = el("div", "cp-empty");
      empty.append(
        glyph("key-round"),
        el("p", undefined, admin === undefined ? w["keys.empty"] : w["keys.noneAnywhere"]),
        ...create,
      );
      content.replaceChildren(empty);
      return;
    }
    parts.push(...create);
    if (https !== undefined && ctx.keysElsewhere !== undefined) {
      parts.push(https);
    }
    const scoped = picked || list.some((k) => k.scopes.length > 0);
    const invites = new Map(list.map((k) => [k.id, invitesOf(k.id)]));
    const detailed = [...invites.values()].some((i) => i.length > 0);
    const t = table(
      heading.id,
      [
        ...(detailed ? [{ text: w["keys.invites"], col: "expand" as const }] : []),
        { text: w["keys.label"] },
        ...(admin === undefined ? [] : [{ text: w["keys.owner"], priority: "mid" as const }]),
        { text: w["keys.key"], priority: "mid" },
        ...(scoped ? [{ text: w["keys.scopes"], priority: "low" as const }] : []),
        { text: w["keys.expires"], priority: "low" },
        { text: w["keys.lastUsed"], priority: "low" },
        { text: w["keys.state"] },
        { text: w["methods.actions"], col: "actions" },
      ],
      w["table.scroll"],
    );
    for (const k of list) {
      t.body.append(
        ...row(k, now, scoped, https, detailed ? (invites.get(k.id) ?? []) : undefined),
      );
    }
    parts.push(t.root);
    content.replaceChildren(...parts);
    const tableEl = t.root.querySelector("table");
    if (detailed && tableEl !== null) {
      enhanceRowDetail(tableEl, ctx.life);
    }
  };

  /** The live invites `id` or a key it minted issued. */
  const invitesOf = (id: number): readonly TokenView[] =>
    admin?.invites().filter((i) => i.issuer_lineage?.includes(id) === true) ?? [];

  /** A link to the people the key `id` reached, shown in place. */
  /** Every row's link has the same words, so the key's name, unseen,
   *  tells each one's target apart. */
  const reachedLink = (id: number, text: string, key: string): HTMLAnchorElement => {
    const a = el("a", undefined, text);
    a.append(el("span", "cp-visually-hidden", `, ${key}`));
    a.href = admin?.reached(id) ?? "";
    a.addEventListener(
      "click",
      (e) => {
        if (admin !== undefined && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          admin.follow(id);
        }
      },
      ctx.life,
    );
    return a;
  };

  /** Create key…, or the host's line where keys are made elsewhere. */
  const createControl = (https: HTMLElement | undefined): Node[] => {
    if (own === undefined) {
      return [];
    }
    if (ctx.keysElsewhere !== undefined) {
      const p = el("p", "cp-help");
      const a = el("a", undefined, ctx.keysElsewhere.words);
      a.href = ctx.keysElsewhere.href;
      p.append(a);
      return [p];
    }
    const b = plainButton(w["keys.create"], "plus");
    b.dataset["cpAction"] = "key-create";
    b.addEventListener(
      "click",
      () => {
        if (!isHeld(b)) {
          createKey(b, own.create);
        }
      },
      ctx.life,
    );
    const bar = el("div", "cp-cluster");
    bar.append(b);
    if (https === undefined) {
      return [bar];
    }
    holdBy([b], https);
    return [bar, https];
  };

  /** `k`'s row, and with `invites` its detail row when it has any. */
  const row = (
    k: KeyView,
    now: number,
    scoped: boolean,
    https: HTMLElement | undefined,
    invites: readonly TokenView[] | undefined,
  ): HTMLTableRowElement[] => {
    const name = labelOf(k);
    const nameNode = el("span", undefined, name);
    const expired = k.expires_at !== undefined && Date.parse(k.expires_at) <= now;
    const lines: (string | Node)[] = [];
    const parent =
      k.parent_key_id === undefined ? undefined : list.find((p) => p.id === k.parent_key_id);
    if (k.parent_key_id !== undefined) {
      const minted = w["keys.mintedBy"](
        parent === undefined ? w["keys.revokedParent"](k.parent_key_id) : labelOf(parent),
      );
      lines.push(parent === undefined || admin === undefined ? minted : parentLink(parent, minted));
    } else if (admin !== undefined) {
      lines.push(w["keys.bySession"]);
    }
    if (admin !== undefined) {
      lines.push(reachedLink(k.id, w["keys.reached"], name));
    }
    const actions: Action[] = [];
    if (own !== undefined) {
      actions.push({
        text: w["keys.rename"],
        key: `key-rename-${String(k.id)}`,
        label: w["keys.renameLabel"](name),
        run: (opener) => {
          rename(k, nameNode, opener, own.rename);
        },
      });
    }
    if (own !== undefined && has("key-rotate") && !expired) {
      actions.push({
        text: w["keys.rotate"],
        key: `key-rotate-${String(k.id)}`,
        label: w["keys.rotateLabel"](name),
        https: ctx.plain,
        run: (opener) => {
          void rotate(k, opener, own.rotate);
        },
      });
    }
    actions.push({
      text: w["keys.revoke"],
      key: `key-revoke-${String(k.id)}`,
      label: w["keys.revokeLabel"](name),
      danger: true,
      run: (opener) => {
        void revoke(k, opener);
      },
    });
    const [controls] = rowActions(ctx, name, actions, https);

    let state: Node;
    if (expired) {
      state = stateMark(
        "neutral",
        "clock",
        w["keys.expired"](new Date(k.expires_at).toLocaleDateString(undefined, DAY)),
      );
    } else if (k.previous_until !== undefined) {
      const until = clockAt(new Date(k.previous_until));
      state = cellStack(
        stateMark("warning", "timer", w["keys.retiring"](until)),
        w["keys.retiringLine"](until),
      );
    } else {
      state = stateMark("success", "circle-check", w["keys.active"]);
    }

    // Word joiners keep the key's two ends on one line.
    const key = cell(el("span", "cp-mono", `${k.prefix}\u2060…\u2060${k.suffix}`));
    key.dataset["priority"] = "mid";
    const head = rowHead(lines.length === 0 ? nameNode : cellStack(nameNode, ...lines));
    head.id = rowIdOf(k.id);
    head.tabIndex = -1;
    const cells: HTMLTableCellElement[] = [];
    let detail: HTMLTableRowElement | undefined;
    if (invites !== undefined) {
      const expand = cell();
      expand.dataset["col"] = "expand";
      if (invites.length > 0) {
        detail = el("tr");
        detail.id = `${head.id}-invites`;
        detail.dataset["part"] = "detail";
        detail.hidden = true;
        const td = el("td");
        td.append(inviteList(invites));
        detail.append(td);
        const open = el("button", "cp-button");
        open.type = "button";
        open.dataset["variant"] = "quiet";
        open.dataset["size"] = "sm";
        open.setAttribute("aria-expanded", "false");
        open.setAttribute("aria-controls", detail.id);
        open.setAttribute("aria-label", w["keys.invitesOf"](name, invites.length));
        open.append(glyph("chevron-right"));
        expand.append(open);
      }
      cells.push(expand);
    }
    cells.push(head);
    if (admin !== undefined) {
      const owner = cell(k.username ?? "");
      owner.dataset["priority"] = "mid";
      cells.push(owner);
    }
    cells.push(key);
    if (scoped) {
      const chips = el("div", "cp-cluster");
      for (const s of k.scopes) {
        chips.append(el("span", "cp-chip", scopeLabel.get(s) ?? s));
      }
      const scopes = cell(k.scopes.length === 0 ? w["keys.noScope"] : chips);
      scopes.dataset["priority"] = "low";
      cells.push(scopes);
    }
    const expires = cell(k.expires_at === undefined ? w["keys.never"] : time(k.expires_at, DAY));
    expires.dataset["priority"] = "low";
    const used = cell(k.last_used_at === undefined ? w["keys.notUsed"] : time(k.last_used_at, DAY));
    used.dataset["priority"] = "low";
    cells.push(expires, used, cell(state), controls);
    const across = detail?.cells[0];
    if (across !== undefined) {
      across.colSpan = cells.length;
    }
    const tr = el("tr");
    tr.append(...cells);
    return detail === undefined ? [tr] : [tr, detail];
  };

  const rowIdOf = (id: number): string => `${heading.id}-key-${String(id)}`;

  /** "Minted by ci", taking focus to ci's row. */
  const parentLink = (parent: KeyView, text: string): HTMLAnchorElement => {
    const a = el("a", undefined, text);
    a.href = `#${rowIdOf(parent.id)}`;
    a.addEventListener(
      "click",
      (e) => {
        const target = document.getElementById(rowIdOf(parent.id));
        if (target !== null) {
          e.preventDefault();
          target.focus();
        }
      },
      ctx.life,
    );
    return a;
  };

  /** The live invites under a key, never their secrets. */
  const inviteList = (invites: readonly TokenView[]): HTMLElement => {
    const ul = el("ul", "cp-stack");
    ul.dataset["gap"] = "tight";
    for (const i of invites) {
      ul.append(
        el(
          "li",
          undefined,
          w["keys.inviteLine"]({
            purpose: i.purpose,
            role: i.role,
            made: clockAt(new Date(i.created_at)),
            until: clockAt(new Date(i.expires_at)),
          }),
        ),
      );
    }
    return ul;
  };

  function createKey(opener: HTMLElement, create: SecurityClient["createKey"]): void {
    notices.clear();
    const d = formDialog({
      title: w["keys.createTitle"],
      submit: w["keys.createSubmit"],
      busy: w["keys.createBusy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...ctx.life,
    });
    const label = field({
      label: w["keys.label"],
      name: "label",
      autocomplete: "off",
      help: w["keys.labelHelp"],
      required: { label: w["form.requiredLabel"], help: w["form.requiredHelp"] },
    });
    const picker = scopePicker();
    const lifetime = lifetimeField();
    d.stack.append(label.root, ...(picker === undefined ? [] : [picker.root]), lifetime.root);
    label.input.addEventListener("input", () => {
      clearError(label.input);
    });
    label.input.focus();

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy() || isHeld(d.submit)) {
        return;
      }
      const text = label.input.value.trim();
      const bad =
        text === ""
          ? w["keys.labelEmpty"]
          : runes(text) > NAME_MAX
            ? w["rename.tooLong"](NAME_MAX)
            : undefined;
      if (bad !== undefined) {
        showError(label.input, bad);
        label.input.focus();
        return;
      }
      const scopes = picker?.value() ?? [];
      if (picker !== undefined && scopes.length === 0) {
        picker.refuse(w[levelRequired ? "keys.levelNeeded" : "keys.scopeNeeded"]);
        return;
      }
      if (levelRequired && !scopes.some((s) => levelValues.has(s))) {
        picker?.refuse(w["keys.levelNeeded"]);
        return;
      }
      d.notices.clear();
      const days = Number(lifetime.select.value);
      const request = { label: text, scopes, ...(days > 0 ? { expires_in_days: days } : {}) };
      void d
        .run(
          () => ctx.write("auth.api_key_create", w["keys.recent"], () => create(request)),
          (a) => a.kind === "done" && a.result.ok,
        )
        .then(async (got) => {
          if (got === undefined) {
            return;
          }
          const made = kept(d, got.answer, (r) => {
            switch (codeOf(r)) {
              case "auth_key_label_taken":
                showError(label.input, w.auth_key_label_taken(text));
                label.input.focus();
                label.input.select();
                return true;
              case "auth_unknown_scope": {
                const [only] = scopes;
                picker?.refuse(
                  w.auth_unknown_scope(
                    scopes.length === 1 && only !== undefined
                      ? (scopeLabel.get(only) ?? only)
                      : undefined,
                  ),
                );
                return picker !== undefined;
              }
              case "auth_bad_request": {
                const said =
                  reasonOf(r) === "label_empty" ? w["keys.labelEmpty"] : nameRefused(r, w);
                if (said === undefined) {
                  return false;
                }
                showError(label.input, said);
                label.input.focus();
                return true;
              }
              case "auth_unavailable":
                // Pressing Create key again is the retry.
                d.notices.show("danger", w["generic.unavailable"]);
                return true;
              default:
                return waited(d, r);
            }
          });
          if (made !== undefined) {
            await showSecret(
              {
                title: w["keys.createdTitle"](made.details.label),
                label: w["keys.secret"],
                secret: made.key,
                ...noted("create", made.details),
              },
              w,
              ctx.signal,
            );
            notices.show("success", w["keys.created"](made.details.label));
            await refresh(`key-rename-${String(made.details.id)}`);
          }
        });
    });
  }

  /**
   * What a dialog's write answered: the new key, or undefined. A refusal
   * `stay` shows on a field keeps the dialog open; any other closes it and
   * shows in the section's notices.
   */
  function kept(
    d: FormDialog,
    answer: StepUpAnswer<KeyCreated>,
    stay: (r: Refusal) => boolean,
  ): KeyCreated | undefined {
    if (answer.kind === "cancelled") {
      return undefined;
    }
    if (answer.kind === "done" && !answer.result.ok && stay(answer.result)) {
      return undefined;
    }
    d.close();
    if (answer.kind === "done" && answer.result.ok) {
      return answer.result.data;
    }
    ctx.settle(answer, notices, (r) => refused(r, () => undefined));
    return undefined;
  }

  /** Holds `d`'s primary for a rate limit's wait; false with no wait. */
  function waited(d: FormDialog, r: Refusal): boolean {
    const seconds = retryAfter(r);
    if (codeOf(r) !== "auth_rate_limited" || seconds === undefined || seconds <= 0) {
      return false;
    }
    holdFor(
      seconds,
      d.notices,
      [d.submit],
      { text: w.auth_rate_limited, again: w["stepUp.again"] },
      ctx.signal,
    );
    return true;
  }

  /** The level's radios and the permissions' boxes, in one `.cp-field`
   *  whose error names a missing or unknown scope. */
  function scopePicker():
    | {
        readonly root: HTMLElement;
        value(): string[];
        refuse(text: string): void;
      }
    | undefined {
    if (!picked) {
      return undefined;
    }
    const root = el("div", "cp-field");
    const inputs: HTMLInputElement[] = [];
    const group = (
      legend: string,
      type: "radio" | "checkbox",
      scopes: readonly (KeyScope | undefined)[],
    ): HTMLFieldSetElement => {
      const set = el("fieldset", "cp-choices");
      set.append(el("legend", "cp-label", legend));
      const name = uid("scope");
      for (const s of scopes) {
        const choice = el("label", "cp-choice");
        const input = el("input", type === "radio" ? "cp-radio" : "cp-checkbox");
        input.type = type;
        input.name = name;
        input.value = s?.value ?? "";
        input.checked = type === "radio" && s !== undefined && s.value === initial;
        const words = el("span", undefined, s?.label ?? w["keys.noLevel"]);
        if (s?.line !== undefined) {
          words.append(el("small", undefined, s.line));
        }
        choice.append(input, words);
        set.append(choice);
        inputs.push(input);
      }
      return set;
    };
    if (levels.length > 0) {
      root.append(group(w["keys.level"], "radio", levelRequired ? levels : [undefined, ...levels]));
    }
    if (permissions.length > 0) {
      root.append(group(w["keys.permissions"], "checkbox", permissions));
    }
    const [first] = inputs;
    root.addEventListener("change", () => {
      if (first !== undefined) {
        clearError(first);
      }
    });
    return {
      root,
      value: () => inputs.filter((i) => i.checked && i.value !== "").map((i) => i.value),
      refuse: (text) => {
        if (first !== undefined) {
          showError(first, text);
          first.focus();
        }
      },
    };
  }

  function lifetimeField(): { readonly root: HTMLElement; readonly select: HTMLSelectElement } {
    const root = el("div", "cp-field");
    const select = el("select", "cp-input");
    select.id = uid("expires");
    select.name = "expires_in_days";
    for (const days of LIFETIMES) {
      const o = el("option", undefined, days === 0 ? w["keys.never"] : w["keys.days"](days));
      o.value = String(days);
      o.selected = days === LIFETIME;
      select.append(o);
    }
    const label = el("label", "cp-label", w["keys.expiresIn"]);
    label.htmlFor = select.id;
    const box = el("div", "cp-select");
    box.append(select);
    root.append(label, box);
    return { root, select };
  }

  function rename(
    k: KeyView,
    node: HTMLElement,
    opener: HTMLElement,
    renameKey: SecurityClient["renameKey"],
  ): void {
    notices.clear();
    part.edit({
      name: node,
      value: k.label,
      label: w["keys.renameLabel"](labelOf(k)),
      button: opener,
      words: w,
      save: async (name, edit) => {
        const a = await ctx.write("auth.api_key_rename", w["security.recent"], () =>
          renameKey(k.id, { name }),
        );
        if (a.kind === "cancelled" || a.kind === "redirecting") {
          return false;
        }
        if (a.kind === "failed") {
          return a.words;
        }
        if (a.result.ok) {
          return undefined;
        }
        if (codeOf(a.result) === "auth_key_label_taken") {
          return w.auth_key_label_taken(name);
        }
        const said = nameRefused(a.result, w);
        if (said !== undefined) {
          return said;
        }
        if (codeOf(a.result) === "auth_not_found") {
          edit.close();
        }
        ctx.settle(a, notices, (r) => refused(r, edit.retry));
        edit.noted(notices);
        return false;
      },
      ended: (saved) => {
        if (saved) {
          void refresh(`key-rename-${String(k.id)}`);
        }
      },
    });
  }

  async function rotate(
    k: KeyView,
    opener: HTMLElement,
    rotateKey: SecurityClient["rotateKey"],
  ): Promise<void> {
    notices.clear();
    const name = labelOf(k);
    const sentence = [
      w["keys.rotateSentence"](overlap ?? w["keys.overlap"]),
      ...(k.previous_until === undefined ? [] : [w["keys.rotateAgain"]]),
      w["keys.rotateLeaked"],
    ].join(" ");
    const yes = await question(sentence, {
      title: w["keys.rotateQuestion"](name),
      answer: w["keys.rotateAnswer"],
      cancel: w["security.cancel"],
    });
    if (!yes) {
      opener.focus();
      return;
    }
    await send(k, rotateKey, opener);
  }

  async function send(
    k: KeyView,
    rotateKey: SecurityClient["rotateKey"],
    opener: HTMLElement,
  ): Promise<void> {
    const name = labelOf(k);
    const a = await ctx.write("auth.api_key_rotate", w["keys.rotateRecent"], () => rotateKey(k.id));
    if (a.kind === "done" && a.result.ok) {
      const made = a.result.data;
      const until = made.details.previous_until;
      const end = until === undefined ? Number.NaN : Date.parse(until);
      if (!Number.isNaN(end)) {
        overlap = duration(Math.max(1, Math.round((end - Date.now()) / MINUTE)) * 60, w);
      }
      await showSecret(
        {
          title: w["keys.rotatedTitle"](name),
          ...(Number.isNaN(end) ? {} : { line: w["keys.rotatedLine"](clockAt(new Date(end))) }),
          label: w["keys.secret"],
          secret: made.key,
          ...noted("rotate", made.details),
        },
        w,
        ctx.signal,
      );
      await refresh(`key-rotate-${String(k.id)}`);
      return;
    }
    ctx.settle(a, notices, (r) => refused(r, () => send(k, rotateKey, opener)));
    if (opener.isConnected) {
      opener.focus();
    }
  }

  async function revoke(k: KeyView, opener: HTMLElement): Promise<void> {
    notices.clear();
    const name = labelOf(k);
    const minted = list.filter((c) => descends(c, k.id)).length;
    const yes = await question(
      admin === undefined
        ? w["keys.revokeSentence"]
        : w["keys.revokeAnySentence"](minted, invitesOf(k.id).length),
      {
        title: w["keys.revokeQuestion"](name, minted),
        answer: w["keys.revokeAnswer"],
        cancel: w["security.cancel"],
        danger: true,
        ...(admin === undefined
          ? {}
          : { link: { text: w["keys.reachedBy"](name), href: admin.reached(k.id) } }),
      },
    );
    if (!yes) {
      opener.focus();
      return;
    }
    const run = async (): Promise<void> => {
      const a = await ctx.write(
        admin === undefined ? "auth.api_key_revoke" : "auth.admin_key_revoke",
        w["keys.revokeRecent"],
        () => calls.revoke(k.id),
      );
      if (a.kind === "done" && a.result.ok) {
        notices.show("success", w["keys.revoked"](name));
        await admin?.revoked();
        await refresh();
        heading.focus();
        return;
      }
      ctx.settle(a, notices, (r) => refused(r, run));
      if (opener.isConnected) {
        opener.focus();
      }
    };
    await run();
  }

  /** Whether `c` was minted, at any depth, by the key `id` in the list. */
  function descends(c: KeyView, id: number): boolean {
    const seen = new Set<number>();
    let parent = c.parent_key_id;
    while (parent !== undefined && !seen.has(parent)) {
      if (parent === id) {
        return true;
      }
      seen.add(parent);
      parent = list.find((p) => p.id === parent)?.parent_key_id;
    }
    return false;
  }

  void refresh();
  return { refresh };
}
