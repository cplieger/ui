import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { Result } from "./client.js";
import type { AccountAction } from "./run.js";
import { stepUp, type StepUpAnswer, type StepUpOptions } from "./step-up.js";
import { Fake, meWith, ok, refuse, signedIn, type FakeClient } from "./test-helpers/fake.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

beforeEach(async () => {
  document.documentElement.classList.add("cp");
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  sheet.remove();
  document.documentElement.classList.remove("cp");
  document.body.replaceChildren();
});

const REASON = "Revoking a key needs a recent sign-in.";
const recent = refuse(403, "auth_recent_auth_required");

type Options = Partial<Omit<StepUpOptions<FakeClient>, "client" | "access">>;

/** Starts a step-up from a focused "Revoke…" button, for an action that
 *  answers `answers` in turn, then "revoked". */
function start(
  fake = new Fake(),
  answers: readonly Result<string>[] = [recent],
  options: Options = {},
): {
  fake: Fake;
  opener: HTMLButtonElement;
  sent: () => number;
  went: string[];
  answer: Promise<StepUpAnswer<string>>;
} {
  const opener = document.createElement("button");
  opener.textContent = "Revoke…";
  document.body.append(opener);
  opener.focus();
  let n = 0;
  const went: string[] = [];
  const answer = stepUp(
    () => {
      n += 1;
      return Promise.resolve(answers[n - 1] ?? ok("revoked"));
    },
    {
      client: fake.client,
      access: fake.access(),
      reason: REASON,
      provider: "Authelia",
      navigate: (url) => {
        went.push(url);
      },
      signal: life.signal,
      ...options,
    },
  );
  return { fake, opener, sent: () => n, went, answer };
}

const dialogOf = (): Promise<HTMLDialogElement> =>
  vi.waitFor(() => {
    const d = document.querySelector<HTMLDialogElement>("dialog.cp-dialog");
    expect(d?.open).toBe(true);
    return d as HTMLDialogElement;
  });

const gone = (): Promise<void> =>
  vi.waitFor(() => {
    expect(document.querySelector("dialog")).toBeNull();
  });

const field = (d: HTMLElement, name: string): HTMLInputElement =>
  d.querySelector<HTMLInputElement>(`input[name='${name}']`) as HTMLInputElement;

const shown = (el: Element): boolean => el.closest("[hidden]") === null;

/** The dialog's buttons a person sees, by their words. */
const buttons = (d: HTMLElement): string[] =>
  [...d.querySelectorAll<HTMLButtonElement>("button")]
    .filter((b) => shown(b) && b.closest(".cp-input-wrap") === null)
    .map((b) => b.textContent.trim());

const button = (d: HTMLElement, text: string): HTMLButtonElement =>
  [...d.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => shown(b) && b.textContent.includes(text),
  ) as HTMLButtonElement;

const errorOf = (input: HTMLInputElement): string => {
  expect(input.getAttribute("aria-invalid")).toBe("true");
  return input.closest(".cp-field")?.querySelector(".cp-field-error")?.textContent ?? "";
};

const noticeOf = (d: HTMLElement): string =>
  d.querySelector("[data-part='notice'] .cp-notice [data-part='body']")?.textContent ?? "";

describe("stepUp: no step-up needed", () => {
  it("answers the action's own result and opens nothing when the server does not ask", async () => {
    const { fake, answer } = start(new Fake(), [ok("revoked")]);
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(document.querySelector("dialog")).toBeNull();
    expect(fake.named("me")).toHaveLength(0);
  });

  it("passes a refusal that carries a reason through, since a step-up cannot cure it", async () => {
    const other = refuse(403, "auth_recent_auth_required", "reenable_needs_other_method");
    const { answer } = start(new Fake(), [other]);
    expect(await answer).toEqual({ kind: "done", result: other });
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("stepUp: the dialog", () => {
  it("is titled, names the action, and offers only the methods held, the password first and focused", async () => {
    start();
    const d = await dialogOf();
    const title = d.querySelector("h2");
    expect(title?.textContent).toBe("Confirm it is you");
    expect(d.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(document.getElementById(d.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      REASON,
    );
    expect(buttons(d)).toEqual(["Use a passkey", "Use Authelia", "Cancel", "Confirm"]);
    expect(document.activeElement).toBe(field(d, "password"));
    expect(field(d, "password").getAttribute("autocomplete")).toBe("current-password");
    expect(button(d, "Confirm").dataset["variant"]).toBe("primary");
    expect(button(d, "Use a passkey").dataset["variant"]).toBeUndefined();
    expect(d.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("leaves out each method the account lacks, the browser lacks or the host does not mount", async () => {
    const fake = new Fake()
      .answer("me", ok(meWith({ passkey_count: 0, oidc_linked: true })))
      .answer("passkeySupport", { webauthn: true, conditional: false });
    start(fake, [recent], { parts: ["password", "passkeys"] });
    const d = await dialogOf();
    expect(buttons(d)).toEqual(["Cancel", "Confirm"]);
    expect(d.querySelector("hr")?.hidden).toBe(true);
  });

  it("makes the first method the primary and focuses it when there is no password", async () => {
    const fake = new Fake().answer("me", ok(meWith({ password: false })));
    start(fake);
    const d = await dialogOf();
    expect(field(d, "password").closest<HTMLElement>(".cp-field")?.hidden).toBe(true);
    expect(buttons(d)).toEqual(["Use a passkey", "Use Authelia", "Cancel"]);
    expect(button(d, "Use a passkey").dataset["variant"]).toBe("primary");
    expect(document.activeElement).toBe(button(d, "Use a passkey"));
  });

  it("offers no password while the server withholds it from step-up", async () => {
    const fake = new Fake().answer("me", ok(meWith({ password_step_up: false })));
    start(fake);
    const d = await dialogOf();
    expect(shown(field(d, "password"))).toBe(false);
    expect(buttons(d)).not.toContain("Use your password");
  });

  it("answers failed with its words, and opens nothing, when no method can confirm the person", async () => {
    const fake = new Fake().answer(
      "me",
      ok(meWith({ password: false, passkey_count: 0, oidc_linked: false })),
    );
    const { answer } = start(fake);
    expect(await answer).toEqual({
      kind: "failed",
      words: "Nothing on this account can confirm it is you here. Sign out, then sign in again.",
    });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("answers failed with the refusal when the methods cannot be read", async () => {
    const down = refuse(503, "auth_unavailable");
    const { answer } = start(new Fake().answer("me", down));
    expect(await answer).toEqual({
      kind: "failed",
      words: "Sign-in is unavailable right now. Try again in a few seconds.",
      refusal: down,
    });
  });
});

describe("stepUp: the password", () => {
  it("confirms, runs the action once more, closes and gives focus back to the opener", async () => {
    const { fake, opener, sent, answer } = start();
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Confirm"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(fake.named("stepUpPassword")[0]?.args).toEqual([{ password: "lantern harbour" }]);
    expect(sent()).toBe(2);
    await gone();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the dialog on a wrong password with its field error, and sends the action again only after the step-up", async () => {
    const fake = new Fake().answer("stepUpPassword", refuse(401, "auth_invalid_credentials"));
    const { sent, answer } = start(fake);
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "wrong one");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "password"))).toBe("The password is wrong.");
    });
    expect(d.open).toBe(true);
    expect(document.activeElement).toBe(field(d, "password"));
    expect(sent()).toBe(1);
    await userEvent.fill(field(d, "password"), "lantern harbour");
    expect(field(d, "password").hasAttribute("aria-invalid")).toBe(false);
    await userEvent.click(button(d, "Confirm"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(fake.named("stepUpPassword")).toHaveLength(2);
    expect(fake.named("me")).toHaveLength(2);
    expect(sent()).toBe(2);
  });

  it("asks for the password before sending anything when the field is empty", async () => {
    const { fake } = start();
    const d = await dialogOf();
    await userEvent.click(button(d, "Confirm"));
    expect(errorOf(field(d, "password"))).toBe("Enter your password.");
    expect(fake.named("stepUpPassword")).toHaveLength(0);
  });

  it("holds Confirm for a rate limit's wait, then lets the person try again", async () => {
    const fake = new Fake().answer(
      "stepUpPassword",
      refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
    );
    start(fake);
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe("Too many attempts. Try again in 0:30.");
    });
    expect(button(d, "Confirm").getAttribute("aria-disabled")).toBe("true");
    d.querySelector("form")?.requestSubmit();
    expect(fake.named("stepUpPassword")).toHaveLength(1);
  });

  it("runs the step-up write through the host's runner under its action name", async () => {
    const names: AccountAction[] = [];
    const { answer } = start(new Fake(), [recent], {
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Confirm"));
    await answer;
    expect(names).toEqual(["auth.step_up"]);
  });
});

describe("stepUp: a code from an authenticator app", () => {
  const withApp = meWith({
    totp: { enrolled: true, usable: true, removable: true, since: "2026-11-03T10:00:00Z" },
  });

  it("offers the code beside the password, and takes six digits with numeric keys", async () => {
    const fake = new Fake().answer("me", ok(withApp));
    start(fake);
    const d = await dialogOf();
    expect(buttons(d)).toEqual([
      "Use your authenticator app",
      "Use a passkey",
      "Use Authelia",
      "Cancel",
      "Confirm",
    ]);
    await userEvent.click(button(d, "Use your authenticator app"));
    const code = field(d, "code");
    expect(shown(code)).toBe(true);
    expect(shown(field(d, "password"))).toBe(false);
    expect(document.activeElement).toBe(code);
    expect(code.inputMode).toBe("numeric");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(buttons(d)[0]).toBe("Use your password");
  });

  it("starts on the code when the password is not offered, and confirms with it", async () => {
    const fake = new Fake().answer(
      "me",
      ok({ ...withApp, methods: { ...withApp.methods, password_step_up: false } }),
    );
    const names: AccountAction[] = [];
    const { answer } = start(fake, [recent], {
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    const d = await dialogOf();
    expect(document.activeElement).toBe(field(d, "code"));
    await userEvent.fill(field(d, "code"), "123 456");
    await userEvent.click(button(d, "Confirm"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(fake.named("stepUpCode")[0]?.args).toEqual(["123456"]);
    expect(names).toEqual(["auth.step_up_code"]);
  });

  it("refuses anything but six digits before sending", async () => {
    const fake = new Fake().answer(
      "me",
      ok({ ...withApp, methods: { ...withApp.methods, password_step_up: false } }),
    );
    start(fake);
    const d = await dialogOf();
    await userEvent.fill(field(d, "code"), "12345");
    await userEvent.click(button(d, "Confirm"));
    expect(errorOf(field(d, "code"))).toBe("Enter the 6 digits from your authenticator app.");
    expect(fake.named("stepUpCode")).toHaveLength(0);
  });

  it.each([
    ["code_invalid", "That code is not right."],
    [
      "code_reused",
      "That code was already used. Wait for the next one. If you did not just sign in elsewhere, someone else may have, and you should change your password.",
    ],
  ])("words a %s refusal on the code's field and keeps the dialog", async (reason, words) => {
    const fake = new Fake()
      .answer("me", ok(withApp))
      .answer("stepUpCode", refuse(401, "auth_code_invalid", reason));
    start(fake);
    const d = await dialogOf();
    await userEvent.click(button(d, "Use your authenticator app"));
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "code"))).toBe(words);
    });
    expect(d.open).toBe(true);
  });

  it("drops the code once it is locked, says so with the passkey way out, and keeps the other methods", async () => {
    const fake = new Fake()
      .answer("me", ok(withApp))
      .answer("stepUpCode", refuse(401, "auth_code_invalid", "method_locked"));
    start(fake);
    const d = await dialogOf();
    await userEvent.click(button(d, "Use your authenticator app"));
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe(
        "Too many wrong codes. Sign in with a passkey to unlock it, or ask an admin to reset your authenticator app.",
      );
    });
    expect(shown(field(d, "code"))).toBe(false);
    expect(shown(field(d, "password"))).toBe(true);
    expect(buttons(d)).toEqual(["Use a passkey", "Use Authelia", "Cancel", "Confirm"]);
  });

  it("drops the code when the app turned authenticator apps off", async () => {
    const fake = new Fake()
      .answer("me", ok(withApp))
      .answer("stepUpCode", refuse(403, "auth_totp_disabled"));
    start(fake);
    const d = await dialogOf();
    await userEvent.click(button(d, "Use your authenticator app"));
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe("Authenticator apps were just turned off in this app.");
    });
    expect(buttons(d)).not.toContain("Use your authenticator app");
  });

  it("offers no code while the host does not mount the second factor", async () => {
    const fake = new Fake().answer("me", ok(withApp));
    start(fake, [recent], { parts: ["password", "passkeys", "single-sign-on"] });
    const d = await dialogOf();
    expect(buttons(d)).not.toContain("Use your authenticator app");
  });
});

describe("stepUp: a passkey and single sign-on", () => {
  it("confirms with a passkey and runs the action again", async () => {
    const { fake, answer } = start();
    const d = await dialogOf();
    await userEvent.click(button(d, "Use a passkey"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(fake.named("stepUpPasskeyFinish")).toHaveLength(1);
  });

  it("keeps the dialog for another way when the passkey prompt is closed", async () => {
    const fake = new Fake().answer("passkeyAssertion", { kind: "cancelled" });
    const { answer } = start(fake);
    const d = await dialogOf();
    await userEvent.click(button(d, "Use a passkey"));
    await vi.waitFor(() => {
      expect(button(d, "Use a passkey").hasAttribute("data-cp-state")).toBe(false);
    });
    expect(d.open).toBe(true);
    expect(noticeOf(d)).toBe("");
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Confirm"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
  });

  it("words a passkey that ran out of time and keeps the dialog", async () => {
    const fake = new Fake().answer("passkeyAssertion", { kind: "timeout" });
    start(fake);
    const d = await dialogOf();
    await userEvent.click(button(d, "Use a passkey"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe("The passkey request ran out of time. Try again.");
    });
    expect(d.open).toBe(true);
  });

  it("leaves for the provider with the host's return path, and never runs the action again", async () => {
    const { fake, sent, went, answer } = start(new Fake(), [recent], {
      redirect: "/settings/account?confirm=revoke-key-12",
    });
    const d = await dialogOf();
    await userEvent.click(button(d, "Use Authelia"));
    expect(await answer).toEqual({ kind: "redirecting" });
    expect(fake.named("oidcStartStepUp")[0]?.args).toEqual([
      { redirect: "/settings/account?confirm=revoke-key-12" },
    ]);
    expect(went).toEqual(["https://id.example/authorize?state=s1"]);
    expect(sent()).toBe(1);
  });
});

describe("stepUp: cancelling", () => {
  it("answers cancelled with no error, sends nothing more, and gives focus back", async () => {
    const { fake, opener, sent, answer } = start();
    const d = await dialogOf();
    await userEvent.click(button(d, "Cancel"));
    expect(await answer).toEqual({ kind: "cancelled" });
    await gone();
    expect(document.activeElement).toBe(opener);
    expect(fake.named("stepUpPassword")).toHaveLength(0);
    expect(sent()).toBe(1);
  });

  it("answers cancelled on Escape", async () => {
    const { answer } = start();
    await dialogOf();
    await userEvent.keyboard("{Escape}");
    expect(await answer).toEqual({ kind: "cancelled" });
  });

  it("closes when the host's signal ends it", async () => {
    const { answer } = start();
    await dialogOf();
    life.abort();
    expect(await answer).toEqual({ kind: "cancelled" });
  });
});

describe("stepUp: a plain session signs in again", () => {
  const again = refuse(403, "auth_recent_auth_required", "sign_in_again");

  it("opens the sign-in form with the username fixed in place of the step-up, then runs the action again", async () => {
    const { fake, sent, answer } = start(new Fake(), [again]);
    const d = await dialogOf();
    expect(d.querySelector("h2")?.textContent).toBe("Sign in again to continue");
    const name = field(d, "username");
    expect(name.value).toBe("mika");
    expect(name.readOnly).toBe(true);
    expect(document.activeElement).toBe(field(d, "password"));
    expect(buttons(d)).toEqual(["Cancel", "Sign in"]);
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Sign in"));
    expect(await answer).toEqual({ kind: "done", result: ok("revoked") });
    expect(fake.named("loginPassword")[0]?.args).toEqual([
      { username: "mika", password: "lantern harbour" },
    ]);
    expect(fake.named("stepUpPassword")).toHaveLength(0);
    expect(sent()).toBe(2);
  });

  it("keeps the form on a wrong password, and answers cancelled on Cancel", async () => {
    const fake = new Fake().answer("loginPassword", refuse(401, "auth_invalid_credentials"));
    const { sent, answer } = start(fake, [again]);
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "wrong one");
    await userEvent.click(button(d, "Sign in"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "password"))).toBe("The password is wrong.");
    });
    await userEvent.click(button(d, "Cancel"));
    expect(await answer).toEqual({ kind: "cancelled" });
    expect(sent()).toBe(1);
  });

  it("stops, with words, when the sign-in needs a step the dialog does not hold", async () => {
    const fake = new Fake().answer(
      "loginPassword",
      ok({ pending: { ticket: "t", next: "second_factor", methods: ["totp"] } }),
    );
    const { answer } = start(fake, [again]);
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Sign in"));
    expect(await answer).toEqual({
      kind: "failed",
      words: "This sign-in needs another step. Sign out, then sign in on the sign-in page.",
    });
  });

  it("signs in through the host's runner as a sign-in", async () => {
    const names: AccountAction[] = [];
    const fake = new Fake().answer("loginPassword", ok(signedIn));
    const { answer } = start(fake, [again], {
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    const d = await dialogOf();
    await userEvent.fill(field(d, "password"), "lantern harbour");
    await userEvent.click(button(d, "Sign in"));
    await answer;
    expect(names).toEqual(["auth.sign_in"]);
  });
});
