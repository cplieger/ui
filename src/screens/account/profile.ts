/**
 * profile.ts — Account and security's profile: the username as a fact and
 * the display name, the one thing the profile route changes, saved with
 * "Save profile".
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { clearError, showError } from "../../forms/form/form.js";
import { codeOf, reasonOf, runes } from "./answer.js";
import type { AccountView, SecurityClient } from "./client.js";
import { actionButton, el, field } from "./dom.js";
import { NAME_MAX } from "./rename.js";
import { cycle, slot } from "./screen.js";
import type { Ctx } from "./security.js";

export function drawProfile<C extends SecurityClient>(
  ctx: Ctx<C>,
  body: HTMLElement,
  me: AccountView,
): void {
  const { w, client } = ctx;
  const notices = slot(el("div"));
  notices.root.dataset["part"] = "notice";
  const form = el("form", "cp-form");
  form.noValidate = true;
  const facts = el("dl", "cp-facts");
  facts.append(el("dt", undefined, w["profile.username"]), el("dd", undefined, me.user.username));
  const name = field({
    label: w["profile.displayName"],
    name: "display_name",
    autocomplete: "name",
    value: me.user.display_name ?? "",
  });
  name.input.maxLength = NAME_MAX * 2;
  const save = actionButton(w["profile.save"], { type: "submit" });
  const confirm = enhanceConfirm(save, {
    busy: w["profile.busy"],
    done: w["profile.done"],
    ...ctx.life,
  });
  form.append(facts, name.root, save);
  body.replaceChildren(notices.root, form);

  name.input.addEventListener("input", () => {
    clearError(name.input);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = name.input.value.trim();
    if (runes(value) > NAME_MAX) {
      showError(name.input, w["auth_bad_request.display_name_too_long"]);
      name.input.focus();
      return;
    }
    notices.clear();
    void cycle(
      confirm,
      () =>
        ctx.write("auth.profile_save", w["security.recent"], () =>
          client.updateProfile({ display_name: value }),
        ),
      (answer) => answer.kind === "done" && answer.result.ok,
    ).then((got) => {
      if (got === undefined) {
        return;
      }
      const answer = got.answer;
      if (answer.kind === "done" && answer.result.ok) {
        const saved = answer.result.data.user.display_name ?? value;
        name.input.value = saved;
        name.input.defaultValue = saved;
        if (ctx.has("passkeys") && ctx.webauthn) {
          void ctx.access.sendSignals(client);
        }
        return;
      }
      ctx.settle(answer, notices, (r) => {
        const reason = reasonOf(r);
        if (
          codeOf(r) === "auth_bad_request" &&
          (reason === "display_name_disallowed_character" || reason === "display_name_too_long")
        ) {
          showError(name.input, w[`auth_bad_request.${reason}`]);
          name.input.focus();
          return null;
        }
        return undefined;
      });
    });
  });
}
