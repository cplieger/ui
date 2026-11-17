import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { Readiness } from "./client.js";
import { Fake, SESSION, meWith, ok, refuse } from "./test-helpers/fake.js";
import { button, dialogOf, noticeOf, useScreen } from "./test-helpers/security.js";
import type { AccountAction } from "./run.js";
import { mountAccessSettings } from "./settings.js";

useScreen();

const NONE: Readiness = {
  locked_out: 0,
  methods_made_dormant: 0,
  methods_restored: 0,
  temporary_passwords_withdrawn: 0,
};

/** An owner of a multi-user app, over HTTPS, under `sso`. */
const owned = (sso: "alongside" | "for_linked" | "only" = "alongside"): Fake =>
  new Fake()
    .always(
      "state",
      ok({ setup_required: false, password_login: true, passkeys: true, oidc: true, sso }),
    )
    .always("me", ok(meWith({}, { owner: true, single_user: false })));

function mount(fake: Fake): { readonly region: HTMLElement; readonly ran: AccountAction[] } {
  const region = document.createElement("div");
  document.body.append(region);
  const ran: AccountAction[] = [];
  mountAccessSettings(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    provider: "Authelia",
    run: (name, work) => {
      ran.push(name);
      return work();
    },
    navigate: () => undefined,
  });
  return { region, ran };
}

const radios = (region: HTMLElement): Promise<HTMLInputElement[]> =>
  vi.waitFor(() => {
    const found = [...region.querySelectorAll<HTMLInputElement>("input[type='radio']")];
    expect(found).toHaveLength(3);
    return found;
  });

/** Chooses the mode worded `text`. */
async function choose(region: HTMLElement, text: string): Promise<void> {
  const label = [...region.querySelectorAll<HTMLLabelElement>("label.cp-choice")].find((l) =>
    l.textContent.startsWith(text),
  );
  expect(label, text).toBeDefined();
  await userEvent.click(label!.querySelector("input")!);
}

const readinessOf = (region: HTMLElement): string =>
  region.querySelector("[data-part='readiness'] .cp-notice [data-part='body']")?.textContent ?? "";

const applyOf = (region: HTMLElement): HTMLButtonElement =>
  region.querySelector<HTMLButtonElement>("button[type='submit']")!;

describe("mountAccessSettings", () => {
  it("offers the three modes, the stored one chosen, each with its line", async () => {
    const { region } = mount(owned("for_linked"));
    const [alongside, linked, only] = await radios(region);
    expect(linked?.checked).toBe(true);
    expect(alongside?.checked).toBe(false);
    expect(only?.checked).toBe(false);
    const labels = [...region.querySelectorAll("label.cp-choice")];
    expect(labels.map((l) => l.firstChild?.nextSibling?.firstChild?.textContent)).toEqual([
      "Alongside",
      "For linked accounts",
      "Single sign-on only",
    ]);
    expect(labels[1]?.querySelector("small")?.textContent).toContain("signs in only with it");
    expect(region.querySelector("legend")?.textContent).toBe("How people sign in with Authelia");
    expect(applyOf(region).hidden).toBe(true);
    expect(region.querySelectorAll("[style]")).toHaveLength(0);
  });

  it.each([
    [
      "a person who is neither an owner nor an admin",
      meWith({}, { owner: false, user: { id: 1, username: "mika", role: "user" } }),
    ],
    ["an owner of a single-user app", meWith({}, { owner: true, single_user: true })],
  ])("shows nothing to %s", async (_who, me) => {
    const fake = owned().always("me", ok(me));
    const { region } = mount(fake);
    await vi.waitFor(() => {
      expect(fake.named("me")).toHaveLength(1);
      expect(region.getAttribute("aria-busy")).toBeNull();
    });
    expect(region.childElementCount).toBe(0);
  });

  it("shows nothing on a client before access Part 5", async () => {
    const fake = owned().without("adminSSOReadiness", "adminApplySSO");
    const { region } = mount(fake);
    await vi.waitFor(() => {
      expect(region.getAttribute("aria-busy")).toBeNull();
    });
    expect(region.childElementCount).toBe(0);
  });

  it("shows what a mode would change, then applies it", async () => {
    const fake = owned().answer(
      "adminSSOReadiness",
      ok({ ...NONE, locked_out: 3, methods_made_dormant: 5, temporary_passwords_withdrawn: 2 }),
    );
    const { region, ran } = mount(fake);
    await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    expect(fake.named("adminSSOReadiness")[0]?.args).toEqual(["only"]);
    const items = [...region.querySelectorAll("[data-part='readiness'] li")].map(
      (li) => li.textContent,
    );
    expect(items).toEqual([
      "3 accounts are not linked yet and could not sign in",
      "5 accounts' local sign-in turns dormant",
      "2 temporary passwords are withdrawn",
    ]);
    expect(
      region.querySelector("[data-part='readiness'] .cp-notice")?.getAttribute("data-tone"),
    ).toBe("warning");
    await userEvent.click(applyOf(region));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Single sign-on only is on.");
    });
    expect(fake.named("adminApplySSO")[0]?.args).toEqual(["only"]);
    expect(ran).toEqual(["auth.admin_sso_apply"]);
    expect(applyOf(region).hidden).toBe(true);
  });

  it("words a loosening's restored sign-ins, one in the singular", async () => {
    const fake = owned("only").answer("adminSSOReadiness", ok({ ...NONE, methods_restored: 1 }));
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "Alongside");
    await vi.waitFor(() => {
      expect(region.querySelector("[data-part='readiness'] li")?.textContent).toBe(
        "1 account gets its local sign-in back",
      );
    });
  });

  it("says nobody's sign-in changes when every count is zero, and still applies", async () => {
    const { region } = mount(owned());
    await radios(region);
    await choose(region, "For linked accounts");
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe("Nobody's sign-in changes.");
    });
    expect(applyOf(region).hidden).toBe(false);
  });

  it("asks nothing when the stored mode is chosen again", async () => {
    const fake = owned();
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "For linked accounts");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    await choose(region, "Alongside");
    expect(applyOf(region).hidden).toBe(true);
    expect(readinessOf(region)).toBe("");
    expect(fake.named("adminSSOReadiness")).toHaveLength(1);
  });

  it.each([
    ["auth_oidc_unavailable", undefined, "Set up single sign-on first."],
    [
      "auth_forbidden",
      "owner_needs_local_method",
      "Add a password or a passkey to your own account first.",
    ],
    [
      "auth_forbidden",
      "registration_enabled",
      "Turn off sign-ups first. Under single sign-on only, people join through the identity provider.",
    ],
  ])("shows the refusal %s %s in place of the change", async (code, reason, said) => {
    const fake = owned().answer(
      "adminSSOReadiness",
      ok({
        ...NONE,
        locked_out: 2,
        refusal: { code, ...(reason === undefined ? {} : { reason }) },
      }),
    );
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe(said);
    });
    expect(region.querySelector("[data-part='readiness'] li")).toBeNull();
    expect(applyOf(region).hidden).toBe(true);
  });

  it("previews a mode to an admin who is not an owner, with no Apply", async () => {
    const fake = owned()
      .always("me", ok(meWith({}, { owner: false, single_user: false })))
      .answer("adminSSOReadiness", ok({ ...NONE, locked_out: 3 }));
    const { region, ran } = mount(fake);
    await radios(region);
    const set = region.querySelector("fieldset")!;
    expect(document.getElementById(set.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Only an owner can change this.",
    );
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(region.querySelector("[data-part='readiness'] li")?.textContent).toBe(
        "3 accounts are not linked yet and could not sign in",
      );
    });
    expect(applyOf(region).hidden).toBe(true);
    expect(ran).toEqual([]);
  });

  it("reads a mode's changes with no step-up, whatever the read answers", async () => {
    const fake = owned().answer("adminSSOReadiness", refuse(401, "auth_recent_auth_required"));
    const { region, ran } = mount(fake);
    await radios(region);
    await choose(region, "For linked accounts");
    await vi.waitFor(() => {
      expect(readinessOf(region)).not.toBe("");
    });
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(fake.named("adminSSOReadiness")).toHaveLength(1);
    expect(applyOf(region).hidden).toBe(true);
    expect(ran).toEqual([]);
  });

  it("asks to confirm it is you before Apply, naming the change", async () => {
    const fake = owned().answer("adminApplySSO", refuse(401, "auth_recent_auth_required"));
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    await userEvent.click(applyOf(region));
    const up = await dialogOf("Confirm it is you");
    expect(document.getElementById(up.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Changing how people sign in needs a recent sign-in.",
    );
    await userEvent.fill(up.querySelector<HTMLInputElement>("input[name='password']")!, "words");
    await userEvent.click(button(up, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Single sign-on only is on.");
    });
    expect(fake.named("adminApplySSO")).toHaveLength(2);
  });

  it("keeps the choice and Apply when the step-up is cancelled", async () => {
    const fake = owned().answer("adminApplySSO", refuse(401, "auth_recent_auth_required"));
    const { region } = mount(fake);
    const [, , only] = await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    await userEvent.click(applyOf(region));
    await userEvent.click(button(await dialogOf("Confirm it is you"), "Cancel"));
    await vi.waitFor(() => {
      expect(document.querySelector("dialog[open]")).toBeNull();
    });
    expect(only?.checked).toBe(true);
    expect(applyOf(region).hidden).toBe(false);
    expect(fake.named("adminApplySSO")).toHaveLength(1);
  });

  it("offers Retry when the server is unavailable for the readiness read", async () => {
    const fake = owned().answer("adminSSOReadiness", refuse(503, "auth_unavailable"));
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "For linked accounts");
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe(
        "Sign-in is unavailable right now. Try again in a few seconds.",
      );
    });
    await userEvent.click(button(region, "Retry"));
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe("Nobody's sign-in changes.");
    });
  });

  it("holds Apply on a change refused for the state it meets", async () => {
    const fake = owned().answer(
      "adminApplySSO",
      refuse(403, "auth_forbidden", "registration_enabled"),
    );
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    await userEvent.click(applyOf(region));
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe(
        "Turn off sign-ups first. Under single sign-on only, people join through the identity provider.",
      );
    });
    expect(applyOf(region).hidden).toBe(true);
  });

  it("words a change refused to someone no longer an owner", async () => {
    const fake = owned().answer("adminApplySSO", refuse(403, "auth_forbidden", "not_owner"));
    const { region } = mount(fake);
    await radios(region);
    await choose(region, "For linked accounts");
    await vi.waitFor(() => {
      expect(applyOf(region).hidden).toBe(false);
    });
    await userEvent.click(applyOf(region));
    await vi.waitFor(() => {
      expect(readinessOf(region)).toBe("Only an owner can change this.");
    });
  });

  it("holds the choice on a plain session with the Needs HTTPS line", async () => {
    const fake = owned()
      .always(
        "state",
        ok({
          setup_required: false,
          password_login: true,
          passkeys: true,
          oidc: false,
          secure: false,
          https_origin: "https://tracker.example",
          sso: "alongside" as const,
        }),
      )
      .always(
        "me",
        ok(meWith({}, { owner: true, single_user: false, session: { ...SESSION, secure: false } })),
      );
    const { region } = mount(fake);
    await radios(region);
    const set = region.querySelector("fieldset")!;
    expect(set.disabled).toBe(true);
    const ids = (set.getAttribute("aria-describedby") ?? "").split(" ");
    const https = ids.map((id) => document.getElementById(id)?.textContent ?? "");
    expect(https[1]).toBe("Needs HTTPS. Open Release tracker over HTTPS.");
    expect(fake.named("adminSSOReadiness")).toHaveLength(0);
  });

  it("ends the screen when the session is gone", async () => {
    const fake = owned().answer("adminSSOReadiness", refuse(401, "auth_session_expired"));
    const went: string[] = [];
    const region = document.createElement("div");
    document.body.append(region);
    mountAccessSettings(region, {
      client: fake.client,
      access: fake.access(),
      app: "Release tracker",
      navigate: (url) => {
        went.push(url);
      },
    });
    await radios(region);
    await choose(region, "Single sign-on only");
    await vi.waitFor(() => {
      expect(went).toEqual(["/sign-in?arrived=session-ended"]);
    });
  });
});
