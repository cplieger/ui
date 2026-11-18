/**
 * sessions.ts — Account and security's Sessions: a `.cp-table` of the
 * person's signed-in devices, this one first, each with Rename… and Sign
 * out, and "Sign out everywhere else…" naming the count, as
 * docs/design-account.md "Account and security" says.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { enhanceRelativeTime } from "../../data/relative-time/relative-time.js";
import { rowActions, rowHead, type Action } from "./actions.js";
import { codeOf } from "./answer.js";
import type { Refusal, SecurityClient, SessionView } from "./client.js";
import { deviceName } from "./device.js";
import { actionButton, cell, cellStack, clockAt, el, stateMark, table } from "./dom.js";
import { screenPart } from "./part.js";
import { nameRefused } from "./rename.js";
import { cycle, question, read, retryButton, slot } from "./screen.js";
import type { Ctx } from "./security.js";

export interface SessionsSection {
  /** Reads the sessions again and redraws them. */
  refresh(focus?: string): Promise<void>;
}

/** Fills `body` with the sessions, read from the client. */
export function drawSessions<C extends SecurityClient>(
  ctx: Ctx<C>,
  body: HTMLElement,
  heading: HTMLHeadingElement,
): SessionsSection {
  const { w, client, has } = ctx;
  const notices = slot(el("div"), heading);
  notices.root.dataset["part"] = "notice";
  const content = el("div", "cp-stack");
  content.dataset["part"] = "sessions";
  body.replaceChildren(notices.root, content);
  let list: readonly SessionView[] = [];
  const part = screenPart<readonly SessionView[]>({
    content,
    heading,
    notices,
    signal: ctx.signal,
    read: () => read(() => client.sessions()),
    refused: (r, again) => {
      ctx.settle({ kind: "done", result: r }, notices, (x) => unavailable(x, again));
    },
    draw: (got) => {
      list = order(got);
      draw();
    },
  });
  const refresh = async (focus?: string): Promise<void> => {
    await part.refresh(focus);
  };

  /** Offers Retry on `auth_unavailable`, the one answer worth repeating. */
  const unavailable = (r: Refusal, again: () => unknown): null | undefined => {
    if (codeOf(r) !== "auth_unavailable") {
      return undefined;
    }
    notices.show("danger", w["generic.unavailable"], retryButton(w["generic.retry"], again));
    return null;
  };

  const draw = (): void => {
    const t = table(heading.id, [
      { text: w["sessions.device"] },
      { text: w["sessions.method"], priority: "mid" },
      { text: w["sessions.lastActive"] },
      { text: w["sessions.address"], priority: "low" },
      { text: w["methods.actions"], col: "actions" },
    ]);
    for (const s of list) {
      const name = deviceName(s, w);
      const nameNode = el("span", undefined, name);
      const lines: (string | Node)[] = [];
      if (s.current) {
        lines.push(w["sessions.this"]);
      }
      if (!s.secure) {
        const ends = [s.idle_deadline, s.absolute_deadline]
          .map((iso) => new Date(iso))
          .filter((d) => !Number.isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime())[0];
        const plain = el("span", "cp-cluster");
        plain.append(stateMark("warning", "lock", w["security.plain"]));
        if (ends !== undefined) {
          plain.append(w["sessions.plainUntil"](clockAt(ends)));
        }
        lines.push(plain);
      }
      const actions: Action[] = [];
      if (has("session-rename")) {
        actions.push({
          text: w["sessions.rename"],
          key: `session-rename-${s.id}`,
          label: w["sessions.renameLabel"](name),
          run: (opener) => {
            rename(s, nameNode, opener);
          },
        });
      }
      actions.push({
        text: w["sessions.signOut"],
        key: `session-revoke-${s.id}`,
        label: w["sessions.signOutLabel"](name),
        danger: true,
        run: (opener) => {
          revoke(s, name, opener);
        },
      });
      const [controls] = rowActions(ctx, name, actions);
      const last = el("time");
      last.dateTime = s.last_activity;
      if (!Number.isNaN(Date.parse(s.last_activity))) {
        enhanceRelativeTime(last, ctx.life);
      }
      const address = cell();
      address.dataset["priority"] = "low";
      if (s.last_ip !== undefined) {
        address.append(el("span", "cp-mono", s.last_ip));
      }
      const method = cell(w["security.method"](s.method, ctx.provider));
      method.dataset["priority"] = "mid";
      const tr = el("tr");
      tr.append(
        rowHead(lines.length === 0 ? nameNode : cellStack(nameNode, ...lines)),
        method,
        cell(last),
        address,
        controls,
      );
      t.body.append(tr);
    }
    const parts: Node[] = [t.root];
    const others = list.filter((s) => !s.current).length;
    if (others > 0) {
      const all = actionButton(w["sessions.others"], { icon: "log-out" });
      all.dataset["cpAction"] = "sessions-others";
      const confirm = enhanceConfirm(all, {
        busy: w["sessions.othersBusy"],
        done: false,
        ...ctx.life,
      });
      all.addEventListener(
        "click",
        () => {
          signOutOthers(others, all, confirm);
        },
        ctx.life,
      );
      const bar = el("div", "cp-cluster");
      bar.append(all);
      parts.push(bar);
    }
    content.replaceChildren(...parts);
  };

  function rename(s: SessionView, node: HTMLElement, opener: HTMLElement): void {
    notices.clear();
    part.edit({
      name: node,
      value: s.label ?? "",
      label: w["sessions.renameLabel"](deviceName(s, w)),
      clearable: { placeholder: deviceName({ ...s, label: "" }, w) },
      button: opener,
      words: w,
      save: async (name, edit) => {
        const a = await ctx.write("auth.session_rename", w["security.recent"], () =>
          client.renameSession(s.id, { name }),
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
        if (codeOf(a.result) === "auth_not_found") {
          edit.close();
        }
        ctx.settle(a, notices, (r) => (gone(r) === null ? null : unavailable(r, edit.retry)));
        edit.noted(notices);
        return false;
      },
      ended: (saved) => {
        if (saved) {
          void refresh(`session-rename-${s.id}`);
        }
      },
    });
  }

  /** A session another device already ended: the list is read again. */
  function gone(r: Refusal): null | undefined {
    if (codeOf(r) !== "auth_not_found") {
      return undefined;
    }
    void refresh();
    return null;
  }

  function revoke(s: SessionView, name: string, opener: HTMLElement): void {
    notices.clear();
    const run = async (): Promise<void> => {
      const a = await ctx.write("auth.session_revoke", w["security.recent"], () =>
        client.revokeSession(s.id),
      );
      if (a.kind === "done" && a.result.ok) {
        if (s.current) {
          ctx.signedOut("signed-out");
          return;
        }
        notices.show("success", w["sessions.signedOut"](name));
        void refresh();
        return;
      }
      ctx.settle(a, notices, (r) => (gone(r) === null ? null : unavailable(r, run)));
      if (opener.isConnected) {
        opener.focus();
      }
    };
    void run();
  }

  function signOutOthers(count: number, opener: HTMLElement, confirm: Confirm): void {
    notices.clear();
    void question(w["sessions.othersSentence"], {
      title: w["sessions.othersQuestion"],
      answer: w["sessions.othersAnswer"](count),
      cancel: w["security.cancel"],
      danger: true,
    }).then(async (yes) => {
      if (!yes) {
        opener.focus();
        return;
      }
      const run = async (): Promise<void> => {
        const got = await cycle(
          confirm,
          () =>
            ctx.write("auth.sessions_revoke_others", w["security.recent"], () =>
              client.revokeOtherSessions(),
            ),
          (a) => a.kind === "done" && a.result.ok,
        );
        if (got === undefined) {
          return;
        }
        if (ctx.settle(got.answer, notices, (r) => unavailable(r, run))) {
          notices.show("success", w["sessions.othersDone"]);
          await refresh();
          heading.focus();
        }
      };
      await run();
    });
  }

  void refresh();
  return { refresh };
}

/** This device first, then the others by their last activity, newest
 *  first. */
function order(sessions: readonly SessionView[]): SessionView[] {
  return sessions.toSorted(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      Date.parse(b.last_activity) - Date.parse(a.last_activity),
  );
}
