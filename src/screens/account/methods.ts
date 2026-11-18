/**
 * methods.ts — Account and security's sign-in methods: a `.cp-table` of
 * each method the person holds or may add, its state and its actions,
 * then the passkeys, as docs/design-account.md "Account and security"
 * says which shows when.
 * @module
 */

import type { Confirm } from "../../buttons/confirm/confirm.js";
import { clearError, showError } from "../../forms/form/form.js";
import { enhanceReveal } from "../../forms/secret/secret.js";
import {
  checkLength,
  codeOf,
  passwordMisfit,
  passwordWords,
  reasonOf,
  retryAfter,
  type Said,
} from "./answer.js";
import type {
  AccountView,
  PasskeyView,
  RegisterOutcome,
  Refusal,
  SecondFactorProof,
  SecurityClient,
} from "./client.js";
import { glyph } from "../../foundations/icons/glyph.js";
import type { IconName } from "../../foundations/icons/icons.js";
import { rowActions, rowHead, type Action } from "./actions.js";
import { formDialog, type FormDialog } from "./dialogs.js";
import {
  cell,
  cellStack,
  el,
  heading,
  line,
  passwordField,
  stateMark,
  table,
  time,
} from "./dom.js";
import { setUpFactor, showRecoveryCode } from "./factor.js";
import { proofWays, withProof } from "./proof.js";
import { nameRefused, type RenameHold } from "./rename.js";
import { cycle, holdFor, isHeld, question, retryButton, slot } from "./screen.js";
import type { Ctx } from "./security.js";
import type { StepUpAnswer } from "./step-up.js";

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

interface Row {
  readonly name: string;
  readonly state: Node;
  readonly actions: readonly Action[];
}

/** Runs `work` on `confirm`'s cycle when there is one, else as it is. */
function busyRun<T>(
  confirm: Confirm | undefined,
  work: () => Promise<T>,
  ok: (answer: T) => boolean,
): Promise<{ readonly answer: T } | undefined> {
  return confirm === undefined ? work().then((answer) => ({ answer })) : cycle(confirm, work, ok);
}

/** Draws the sign-in methods into `body`, keeping its notice slot; a
 *  passkey's Rename… edits under `renames`, which the caller asks before
 *  drawing again. */
export function drawMethods<C extends SecurityClient>(
  ctx: Ctx<C>,
  body: HTMLElement,
  me: AccountView,
  passkeys: readonly PasskeyView[],
  renames: RenameHold,
): void {
  const { w, client, access, has, provider } = ctx;
  const m = me.methods;
  let notes = body.querySelector<HTMLElement>(":scope > [data-part='notice']");
  if (notes === null) {
    notes = el("div");
    notes.dataset["part"] = "notice";
  }
  const notices = slot(notes);
  const plain = !me.session.secure;
  const dormant = (me.sso_only ?? me.sso_governed ?? false) && me.owner !== true;
  const ways = proofWays(m, access, { webauthn: ctx.webauthn, secure: !plain, has });
  const needsProof = m.second_factor_held === true;
  const lockOf = (method: string): boolean =>
    m.locks.some((l) => l.method === method && (l.untrusted || l.trusted));
  const locked = (name: string): Node =>
    cellStack(stateMark("warning", "lock", w["methods.locked"]), w["methods.lockedLine"](name));
  const set = (text = w["methods.set"]): Node => stateMark("success", "circle-check", text);
  const notSet = (text = w["methods.notSet"]): Node => stateMark("neutral", "circle-dashed", text);
  const unlock = (method: string, text: string): Action => ({
    text,
    key: `unlock-${method}`,
    busy: w["methods.reenableBusy"],
    run: (_opener, confirm) => {
      reenable(method, confirm);
    },
  });

  const rows: Row[] = [];

  // Password.
  if (has("password") && (m.password || m.password_login)) {
    const name = w["password.title"];
    const actions: Action[] = [];
    if (lockOf("password")) {
      actions.push(unlock("password", w["methods.reenable"]));
    }
    if (!dormant && m.password) {
      actions.push({
        text: w["password.change"],
        short: w["password.changeShort"],
        key: "password-change",
        run: (opener) => {
          passwordDialog("change", opener);
        },
      });
      if (!plain && (m.passkey_count > 0 || m.oidc_linked)) {
        actions.push({
          text: w["password.remove"],
          key: "password-remove",
          danger: true,
          run: (opener) => {
            removePassword(opener);
          },
        });
      }
    } else if (!dormant) {
      actions.push({
        text: w["password.set"],
        short: w["password.setShort"],
        key: "password-set",
        run: (opener) => {
          passwordDialog("set", opener);
        },
      });
    }
    rows.push({
      name,
      state: lockOf("password") ? locked(name) : m.password ? set() : notSet(),
      actions,
    });
  }

  // Passkeys.
  if (has("passkeys") && (m.passkeys_available || m.passkey_count > 0)) {
    const name = w["passkeys.title"];
    const actions: Action[] = [];
    if (lockOf("passkey")) {
      actions.push(unlock("passkey", w["methods.reenable"]));
    }
    if (
      !dormant &&
      m.passkeys_available &&
      ctx.webauthn &&
      (plain || !needsProof || ways.code || ways.passkey)
    ) {
      actions.push({
        text: w["passkeys.add"],
        short: w["passkeys.addShort"],
        key: "passkey-add",
        icon: "plus",
        busy: w["passkeys.addBusy"],
        https: plain,
        run: (_opener, confirm) => {
          addPasskey(confirm);
        },
      });
    }
    const count = m.passkey_count;
    const state = lockOf("passkey")
      ? locked(name)
      : count > 0
        ? set(w["passkeys.count"](count))
        : notSet();
    rows.push({
      name,
      state:
        !m.password && count === 1 && !m.oidc_linked && !dormant
          ? cellStack(state, w["passkeys.second"])
          : state,
      actions,
    });
  }

  // Authenticator app.
  const totp = m.totp;
  if (has("second-factor") && (totp?.enrolled === true || (ctx.appTotp && m.password))) {
    const name = w["totp.title"];
    const actions: Action[] = [];
    if (lockOf("totp")) {
      actions.push(unlock("totp", w["methods.unlock"]));
    }
    const settable = client.beginTOTP !== undefined && client.finishTOTP !== undefined;
    if (!dormant && settable && ctx.appTotp && m.password && totp?.enrolled !== true) {
      actions.push({
        text: w["totp.setUp"],
        short: w["totp.setUpShort"],
        key: "totp-set-up",
        busy: w["totp.loading"],
        https: plain,
        run: (_opener, confirm) => {
          factor(false, confirm);
        },
      });
    }
    if (!dormant && settable && totp?.usable === true) {
      actions.push({
        text: w["totp.replace"],
        key: "totp-replace",
        busy: w["totp.loading"],
        https: plain,
        run: (_opener, confirm) => {
          factor(true, confirm);
        },
      });
    }
    if (!dormant && client.removeTOTP !== undefined && totp?.removable === true) {
      actions.push({
        text: w["totp.remove"],
        short: w["totp.removeShort"],
        key: "totp-remove",
        danger: true,
        run: (opener) => {
          removeFactor(opener);
        },
      });
    }
    let state: Node;
    if (lockOf("totp")) {
      state = locked(name);
    } else if (totp?.enrolled === true && !totp.usable) {
      state = cellStack(
        stateMark("warning", "circle-dashed", w["totp.paused"]),
        w["totp.pausedLine"],
      );
    } else if (totp?.enrolled === true) {
      state =
        totp.since === undefined
          ? set()
          : cellStack(
              set(),
              w["totp.since"](new Date(totp.since).toLocaleDateString(undefined, DAY)),
            );
    } else {
      state = notSet();
    }
    rows.push({ name, state, actions });
  }

  // Recovery code.
  if (
    has("second-factor") &&
    m.recovery_code !== undefined &&
    (m.recovery_code || totp?.enrolled === true)
  ) {
    const name = w["recoveryCode.title"];
    const actions: Action[] = [];
    if (lockOf("recovery_code")) {
      actions.push(unlock("recovery_code", w["methods.unlock"]));
    }
    if (
      !dormant &&
      m.recovery_code &&
      client.regenerateRecoveryCode !== undefined &&
      (plain || ways.code || ways.passkey)
    ) {
      actions.push({
        text: w["recoveryCode.replaceLabel"],
        short: w["recoveryCode.replace"],
        key: "recovery-code-replace",
        https: plain,
        run: (opener) => {
          replaceRecoveryCode(opener);
        },
      });
    }
    rows.push({
      name,
      state: lockOf("recovery_code") ? locked(name) : m.recovery_code ? set() : notSet(),
      actions,
    });
  }

  // Single sign-on.
  if (has("single-sign-on") && (m.oidc_available || m.oidc_linked)) {
    const name = w["oidc.title"];
    const actions: Action[] = [];
    if (lockOf("oidc")) {
      actions.push(unlock("oidc", w["methods.reenable"]));
    }
    if (m.oidc_linked) {
      actions.push({
        text: w["oidc.unlinkLabel"](provider),
        short: w["oidc.unlink"],
        key: "oidc-unlink",
        danger: true,
        run: (opener) => {
          unlinkProvider(opener);
        },
      });
    } else if (me.can_link_oidc && m.oidc_available) {
      actions.push({
        text: w["oidc.link"](provider),
        key: "oidc-link",
        busy: w["oidc.linkBusy"],
        https: plain,
        run: (_opener, confirm) => {
          linkProvider(confirm);
        },
      });
    }
    rows.push({
      name,
      state: lockOf("oidc")
        ? locked(name)
        : m.oidc_linked
          ? set(w["oidc.linkedTo"](provider))
          : notSet(w["oidc.notLinked"]),
      actions,
    });
  }

  const titleId = body.closest("section")?.getAttribute("aria-labelledby") ?? "";
  const t = table(titleId, [
    { text: w["methods.method"] },
    { text: w["methods.state"] },
    { text: w["methods.actions"], col: "actions" },
  ]);
  for (const r of rows) {
    const [controls, help] = rowActions(ctx, r.name, r.actions);
    const state = help === undefined ? r.state : cellStack(r.state, help);
    const tr = el("tr");
    tr.append(rowHead(r.name), cell(state), controls);
    t.body.append(tr);
  }
  const content = el("div", "cp-stack");
  content.dataset["part"] = "methods";
  content.append(t.root);
  if (dormant) {
    content.append(line("cp-help", w["methods.ssoOnly"](provider)));
  }
  if (has("passkeys") && passkeys.length > 0) {
    content.append(...passkeyTable());
  }
  body.replaceChildren(notes, content);

  function passkeyTable(): Node[] {
    const h = heading(ctx.level + 1, w["passkeys.title"]);
    const p = table(h.id, [
      { text: w["passkeys.name"] },
      { text: w["passkeys.created"], priority: "mid" },
      { text: w["passkeys.lastUsed"], priority: "low" },
      { text: w["passkeys.where"] },
      { text: w["methods.actions"], col: "actions" },
    ]);
    for (const k of passkeys) {
      const nameNode = el("span", undefined, k.name);
      const where = el("div", "cp-cluster");
      where.append(chip("neutral", k.backed_up ? w["passkeys.synced"] : w["passkeys.device"]));
      if (k.clone_warning === true) {
        where.append(chip("warning", w["passkeys.copied"], "triangle-alert"));
      }
      if (!ctx.usableHere(k.rp_id)) {
        where.append(chip("neutral", w["passkeys.elsewhere"]));
      }
      const actions: Action[] = [];
      if (!dormant) {
        actions.push({
          text: w["passkeys.rename"],
          key: `passkey-rename-${String(k.id)}`,
          label: w["passkeys.renameLabel"](k.name),
          run: (opener) => {
            renamePasskey(k, nameNode, opener);
          },
        });
        if (k.removable !== false && (plain || !needsProof || ways.code || ways.passkey)) {
          actions.push({
            text: w["passkeys.remove"],
            key: `passkey-remove-${String(k.id)}`,
            label: w["passkeys.removeLabel"](k.name),
            danger: true,
            // Over plain HTTP only a code proves the second factor.
            https: plain && needsProof && !ways.code,
            run: (opener) => {
              removePasskey(k, opener);
            },
          });
        }
      }
      const [controls, help] = rowActions(ctx, k.name, actions);
      const whereCell = help === undefined ? where : cellStack(where, help);
      const last = cell(
        k.last_used_at === undefined ? w["passkeys.never"] : time(k.last_used_at, DAY),
      );
      last.dataset["priority"] = "low";
      const added = cell(time(k.created_at, DAY));
      added.dataset["priority"] = "mid";
      const tr = el("tr");
      tr.append(rowHead(nameNode), added, last, cell(whereCell), controls);
      p.body.append(tr);
    }
    return [h, p.root];
  }

  function chip(tone: "neutral" | "warning", text: string, icon?: IconName): HTMLSpanElement {
    const c = el("span", "cp-chip");
    c.dataset["tone"] = tone;
    if (icon !== undefined) {
      c.append(glyph(icon));
    }
    c.append(text);
    return c;
  }

  /** Closes `d` and shows `answer` in the section, unless `kept` holds it
   *  in the dialog; true when the write succeeded. */
  function ended(
    d: FormDialog,
    answer: StepUpAnswer<unknown>,
    kept: (r: Refusal) => boolean,
  ): boolean | undefined {
    if (answer.kind === "cancelled") {
      return undefined;
    }
    if (answer.kind === "done" && !answer.result.ok && kept(answer.result)) {
      return undefined;
    }
    d.close();
    return ctx.settle(answer, notices);
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

  /** Shows a recovery code a write issued, once, before the screen moves
   *  on. */
  async function issuedCode(code: string | undefined): Promise<void> {
    if (code !== undefined) {
      await showRecoveryCode(code, w, ctx.signal);
    }
  }

  function done(text: string, focus?: string): void {
    notices.show("success", text);
    void ctx.refresh(focus);
  }

  function passwordDialog(mode: "change" | "set", opener: HTMLElement): void {
    notices.clear();
    const d = formDialog({
      title: mode === "change" ? w["password.changeTitle"] : w["password.setTitle"],
      submit: w["password.save"],
      busy: w["password.busy"],
      done: w["password.done"],
      cancel: w["security.cancel"],
      opener,
      ...ctx.life,
    });
    const user = el("input");
    user.type = "text";
    user.hidden = true;
    user.value = me.user.username;
    user.setAttribute("autocomplete", "username");
    const current =
      mode === "change"
        ? passwordField(
            {
              label: w["password.current"],
              name: "current_password",
              autocomplete: "current-password",
            },
            w["password.show"],
          )
        : undefined;
    const fresh = passwordField(
      {
        label: w["password.new"],
        name: "password",
        autocomplete: "new-password",
        help: w["password.newHelp"](ctx.passwordLength.min, ctx.passwordLength.max),
      },
      w["password.show"],
    );
    checkLength(fresh.input, ctx.passwordLength, w, ctx.life);
    for (const f of [current, fresh]) {
      if (f !== undefined) {
        enhanceReveal(f.reveal, f.input, ctx.life);
        f.input.addEventListener("input", () => {
          clearError(f.input);
        });
      }
    }
    d.stack.append(user);
    if (current !== undefined) {
      d.stack.append(current.root);
    }
    d.stack.append(fresh.root);
    (current ?? fresh).input.focus();

    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy() || isHeld(d.submit)) {
        return;
      }
      if (current?.input.value === "") {
        showError(current.input, w["password.currentEmpty"]);
        current.input.focus();
        return;
      }
      const misfit =
        fresh.input.value === ""
          ? w["password.newEmpty"]
          : passwordMisfit(fresh.input.value, ctx.passwordLength, w);
      if (misfit !== undefined) {
        showError(fresh.input, misfit);
        fresh.input.focus();
        return;
      }
      d.notices.clear();
      const request = {
        ...(current === undefined ? {} : { current_password: current.input.value }),
        password: fresh.input.value,
      };
      void d
        .run(
          () =>
            ctx.write("auth.password_set", w["password.recentSet"], () =>
              client.setPassword(request),
            ),
          (a) => a.kind === "done" && a.result.ok,
        )
        .then((got) => {
          if (got === undefined) {
            return;
          }
          const ok = ended(d, got.answer, (r) => {
            switch (codeOf(r)) {
              case "auth_invalid_credentials":
                if (current !== undefined) {
                  showError(current.input, w["password.wrong"]);
                  current.input.focus();
                  current.input.select();
                  return true;
                }
                return false;
              case "auth_password_rejected":
                showError(fresh.input, passwordWords(r, w, ctx.passwordLength));
                fresh.input.focus();
                return true;
              case "auth_breach_check_unavailable":
                d.notices.show("warning", w.auth_breach_check_unavailable);
                return true;
              default:
                return waited(d, r);
            }
          });
          if (ok !== true) {
            return;
          }
          void access.storePasswordCredential(me.user.username, request.password);
          const a = got.answer;
          const issued: unknown = a.kind === "done" && a.result.ok ? a.result.data : undefined;
          const code =
            typeof issued === "object" &&
            issued !== null &&
            "recovery_code" in issued &&
            typeof issued.recovery_code === "string"
              ? issued.recovery_code
              : undefined;
          void issuedCode(code).then(() => {
            done(w["password.changed"], "password-change");
          });
        });
    });
  }

  function removePassword(opener: HTMLElement): void {
    notices.clear();
    const d = formDialog({
      title: w["password.removeQuestion"],
      sentence: w["password.removeSentence"],
      submit: w["password.removeAnswer"],
      busy: w["password.busy"],
      done: false,
      cancel: w["security.cancel"],
      opener,
      ...ctx.life,
    });
    d.submit.dataset["tone"] = "danger";
    const current = passwordField(
      { label: w["password.current"], name: "current_password", autocomplete: "current-password" },
      w["password.show"],
    );
    enhanceReveal(current.reveal, current.input, ctx.life);
    current.input.addEventListener("input", () => {
      clearError(current.input);
    });
    d.stack.append(current.root);
    current.input.focus();
    d.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.busy() || isHeld(d.submit)) {
        return;
      }
      if (current.input.value === "") {
        showError(current.input, w["password.currentEmpty"]);
        current.input.focus();
        return;
      }
      d.notices.clear();
      const request = { current_password: current.input.value };
      void d
        .run(
          () =>
            ctx.write("auth.password_remove", w["password.recentRemove"], () =>
              client.removePassword(request),
            ),
          (a) => a.kind === "done" && a.result.ok,
        )
        .then((got) => {
          if (got === undefined) {
            return;
          }
          const ok = ended(d, got.answer, (r) => {
            switch (codeOf(r)) {
              case "auth_invalid_credentials":
                showError(current.input, w["password.wrong"]);
                current.input.focus();
                current.input.select();
                return true;
              case "auth_last_method":
                d.notices.show(
                  "danger",
                  reasonOf(r) === "last_second_factor"
                    ? w["auth_last_method.last_second_factor"]
                    : w.auth_last_method,
                );
                return true;
              default:
                return waited(d, r);
            }
          });
          if (ok === true) {
            done(w["password.removed"]);
          }
        });
    });
  }

  /** Runs `write` with a proof first while one is needed. */
  function proved<T>(
    need: boolean,
    reason: string,
    write: (proof?: SecondFactorProof) => Promise<StepUpAnswer<T>>,
  ): Promise<StepUpAnswer<T>> {
    if (!need || (!ways.code && !ways.passkey)) {
      return write();
    }
    return withProof(
      {
        client,
        access,
        words: w,
        reason,
        code: ways.code,
        passkey: ways.passkey,
        ...ctx.life,
      },
      (proof) => write(proof),
    );
  }

  function addPasskey(confirm: Confirm | undefined): void {
    notices.clear();
    void busyRun(
      confirm,
      () =>
        proved(needsProof, w["proof.add"], (proof) =>
          ctx.write("auth.passkey_add", w["passkeys.recentAdd"], async () => {
            const outcome =
              proof === undefined
                ? await access.registerPasskey(client)
                : await access.registerPasskey(client, proof);
            return outcome.kind === "failed" && typeof outcome.error !== "string"
              ? outcome.error
              : { ok: true as const, data: outcome };
          }),
        ),
      (a) => a.kind === "done" && a.result.ok && a.result.data.kind === "registered",
    ).then((got) => {
      if (got === undefined) {
        return;
      }
      const a = got.answer;
      if (a.kind !== "done" || !a.result.ok) {
        ctx.settle(a, notices);
        return;
      }
      const outcome = a.result.data;
      const said = registered(outcome);
      if (outcome.kind === "registered") {
        void issuedCode(outcome.recovery_code).then(() => {
          done(w["passkeys.added"], "passkey-add");
        });
      } else if (said !== undefined) {
        notices.show(said.tone, said.text);
      }
    });
  }

  function registered(outcome: RegisterOutcome): Said | undefined {
    switch (outcome.kind) {
      case "registered":
      case "cancelled":
        return undefined;
      case "duplicate":
      case "not-discoverable":
        return { tone: "warning", text: w[`register.${outcome.kind}`] };
      case "timeout":
        return { tone: "warning", text: w["passkey.timeout"] };
      case "failed":
        return {
          tone: "danger",
          text: outcome.error === "SecurityError" ? w.auth_origin_refused : w["passkey.failed"],
        };
    }
  }

  function renamePasskey(k: PasskeyView, node: HTMLElement, opener: HTMLElement): void {
    notices.clear();
    renames.edit({
      name: node,
      value: k.name,
      label: w["passkeys.renameLabel"](k.name),
      button: opener,
      words: w,
      save: async (name, edit) => {
        const a = await ctx.write("auth.passkey_rename", w["security.recent"], () =>
          client.renamePasskey(k.id, { name }),
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
        const said = nameRefused(a.result, w);
        if (said !== undefined) {
          return said;
        }
        const code = codeOf(a.result);
        if (code === "auth_not_found" || code === "auth_method_not_locked") {
          edit.close();
        }
        ctx.settle(a, notices, (r) => {
          if (codeOf(r) !== "auth_unavailable") {
            return undefined;
          }
          notices.show(
            "danger",
            w["generic.unavailable"],
            retryButton(w["generic.retry"], edit.retry),
          );
          return null;
        });
        edit.noted(notices);
        return false;
      },
      ended: (saved) => {
        if (saved) {
          void ctx.refresh(`passkey-rename-${String(k.id)}`);
        }
      },
    });
  }

  function removePasskey(k: PasskeyView, opener: HTMLElement): void {
    notices.clear();
    void question(w["passkeys.removeSentence"], {
      title: w["passkeys.removeQuestion"](k.name),
      answer: w["passkeys.removeAnswer"],
      cancel: w["security.cancel"],
      danger: true,
    }).then(async (yes) => {
      if (!yes) {
        return;
      }
      const a = await proved(needsProof, w["proof.remove"], (proof) =>
        ctx.write("auth.passkey_remove", w["passkeys.recentRemove"], () =>
          proof === undefined ? client.removePasskey(k.id) : client.removePasskey(k.id, proof),
        ),
      );
      if (ctx.settle(a, notices)) {
        void access.sendSignals(client);
        done(w["passkeys.removed"](k.name));
      } else {
        opener.focus();
      }
    });
  }

  function factor(replace: boolean, confirm: Confirm | undefined): void {
    const beginTOTP = client.beginTOTP?.bind(client);
    const finishTOTP = client.finishTOTP?.bind(client);
    if (beginTOTP === undefined || finishTOTP === undefined) {
      return;
    }
    notices.clear();
    void busyRun(
      confirm,
      () => ctx.write("auth.totp_set_up", w["totp.recentSetUp"], beginTOTP),
      (a) => a.kind === "done" && a.result.ok,
    ).then(async (got) => {
      if (got === undefined) {
        return;
      }
      const a = got.answer;
      if (a.kind !== "done" || !a.result.ok) {
        ctx.settle(a, notices, factorWords);
        return;
      }
      const end = await setUpFactor({
        begun: a.result.data,
        replace,
        words: w,
        finish: (r) => ctx.write("auth.totp_set_up", w["totp.recentSetUp"], () => finishTOTP(r)),
        ...ctx.life,
      });
      if (end.kind === "done") {
        done(replace ? w["totp.replaced"] : w["totp.added"], "totp-replace");
      } else if (end.kind === "refused") {
        ctx.settle(end.answer, notices, factorWords);
      }
    });
  }

  /** An authenticator app's refusals, said in the section. */
  function factorWords(r: Refusal): Said | undefined {
    switch (codeOf(r)) {
      case "auth_token_invalid":
        return { tone: "warning", text: w["totp.expired"] };
      case "auth_totp_disabled":
        void ctx.refresh();
        return { tone: "warning", text: w.auth_totp_disabled };
      case "auth_second_factor_unavailable":
        return { tone: "warning", text: w.auth_second_factor_unavailable };
      case "auth_forbidden":
        if (reasonOf(r) !== "totp_needs_password") {
          return undefined;
        }
        void ctx.refresh("password-set");
        return { tone: "warning", text: w["auth_forbidden.totp_needs_password"] };
      default:
        return undefined;
    }
  }

  function removeFactor(opener: HTMLElement): void {
    const removeTOTP = client.removeTOTP?.bind(client);
    if (removeTOTP === undefined) {
      return;
    }
    notices.clear();
    void question(w["totp.removeSentence"], {
      title: w["totp.removeQuestion"],
      answer: w["totp.removeAnswer"],
      cancel: w["security.cancel"],
      danger: true,
    }).then(async (yes) => {
      if (!yes) {
        return;
      }
      const a = await proved(totp?.usable === true, w["proof.removeTotp"], (proof) =>
        ctx.write("auth.totp_remove", w["totp.recentRemove"], () =>
          proof === undefined ? removeTOTP() : removeTOTP(proof),
        ),
      );
      if (ctx.settle(a, notices, factorWords)) {
        done(w["totp.removed"]);
      } else {
        opener.focus();
      }
    });
  }

  function replaceRecoveryCode(opener: HTMLElement): void {
    const regenerate = client.regenerateRecoveryCode?.bind(client);
    if (regenerate === undefined || (!ways.code && !ways.passkey)) {
      return;
    }
    notices.clear();
    void question(w["recoveryCode.replaceSentence"], {
      title: w["recoveryCode.replaceQuestion"],
      answer: w["recoveryCode.replaceAnswer"],
      cancel: w["security.cancel"],
    }).then(async (yes) => {
      if (!yes) {
        return;
      }
      const a = await withProof(
        { client, access, words: w, reason: w["proof.replace"], ...ways, ...ctx.life },
        (proof) =>
          ctx.write("auth.recovery_code_replace", w["recoveryCode.recent"], () =>
            regenerate(proof),
          ),
      );
      if (a.kind === "done" && a.result.ok) {
        await showRecoveryCode(a.result.data.recovery_code, w, ctx.signal);
        void ctx.refresh("recovery-code-replace");
        return;
      }
      ctx.settle(a, notices, factorWords);
      opener.focus();
    });
  }

  function reenable(method: string, confirm: Confirm | undefined): void {
    notices.clear();
    void busyRun(
      confirm,
      () =>
        ctx.write("auth.method_reenable", w["security.recent"], () =>
          client.reenableMethod(method),
        ),
      (a) => a.kind === "done" && a.result.ok,
    ).then((got) => {
      if (got === undefined) {
        return;
      }
      const ok = ctx.settle(got.answer, notices, (r) =>
        codeOf(r) === "auth_recent_auth_required" && reasonOf(r) === "reenable_needs_other_method"
          ? { tone: "warning", text: w["methods.reenableElsewhere"] }
          : undefined,
      );
      if (ok) {
        void ctx.refresh();
      }
    });
  }

  function linkProvider(confirm: Confirm | undefined): void {
    notices.clear();
    void busyRun(
      confirm,
      () =>
        ctx.write("auth.oidc_link", w["security.recent"], () =>
          client.oidcStartLink({ redirect: ctx.redirect }),
        ),
      (a) => a.kind === "done" && a.result.ok,
    ).then((got) => {
      if (got === undefined) {
        return;
      }
      const a = got.answer;
      if (a.kind === "done" && a.result.ok) {
        ctx.navigate(a.result.data.url);
        return;
      }
      ctx.settle(a, notices, (r) =>
        codeOf(r) === "auth_oidc_unavailable"
          ? { tone: "danger", text: w.auth_oidc_unavailable }
          : undefined,
      );
    });
  }

  function unlinkProvider(opener: HTMLElement): void {
    notices.clear();
    void question(w["oidc.unlinkSentence"](provider), {
      title: w["oidc.unlinkQuestion"](provider),
      answer: w["oidc.unlinkAnswer"],
      cancel: w["security.cancel"],
      danger: true,
    }).then(async (yes) => {
      if (!yes) {
        return;
      }
      const a = await ctx.write("auth.oidc_unlink", w["security.recent"], () =>
        client.oidcUnlink(),
      );
      if (ctx.settle(a, notices)) {
        done(w["oidc.unlinked"](provider), "oidc-link");
      } else {
        opener.focus();
      }
    });
  }
}
