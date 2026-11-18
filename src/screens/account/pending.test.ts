import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { Pending } from "./client.js";
import type { AccountAction } from "./run.js";
import { Fake, ok, refuse, signedIn } from "./test-helpers/fake.js";
import {
  button,
  drawn,
  input,
  mount,
  noticeOf,
  signIn,
  submit,
  useSignIn,
  type Options,
} from "./test-helpers/sign-in.js";

useSignIn();

const pending = (p: Partial<Pending> = {}): ReturnType<typeof ok> =>
  ok({
    pending: {
      ticket: "t1",
      next: "second_factor",
      methods: ["totp", "passkey", "recovery_code"],
      ...p,
    },
  });

/** Signs in with a password the server answers with `first`, and waits for
 *  the step it draws. */
async function stepped(
  fake: Fake,
  first: unknown = pending(),
  options: Options = {},
  wait = true,
): Promise<{ panel: HTMLElement; ran: AccountAction[]; went: string[] }> {
  fake.answer("loginPassword", first);
  const ran: AccountAction[] = [];
  const went: string[] = [];
  const { panel } = mount(fake, {
    run: (name, work) => {
      ran.push(name);
      return work();
    },
    navigate: (url) => {
      went.push(url);
    },
    next: "/feed",
    ...options,
  });
  await drawn(panel);
  await signIn(panel);
  if (wait) {
    await vi.waitFor(() => {
      expect(input(panel, "username")).toBeNull();
    });
  }
  return { panel, ran, went };
}

const errorOf = (field: HTMLInputElement): string | undefined =>
  document.getElementById(`${field.id}-error`)?.textContent;

const dialogOf = (title: string): Promise<HTMLDialogElement> =>
  vi.waitFor(() => {
    const d = [...document.querySelectorAll("dialog")].find(
      (x) => x.open && x.querySelector("h2")?.textContent === title,
    );
    expect(d).toBeDefined();
    return d as HTMLDialogElement;
  });

describe("mountSignIn: the second factor", () => {
  it("asks for the code in place of the form, keeping the heading, and signs in with it", async () => {
    const fake = new Fake();
    const { panel, ran, went } = await stepped(fake);
    expect(panel.querySelector("h1")?.textContent).toBe("Sign in");
    const code = input(panel, "code");
    expect(document.activeElement).toBe(code);
    expect(code.inputMode).toBe("numeric");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.enterKeyHint).toBe("done");
    expect(button(panel, "Use a passkey")).toBeDefined();
    expect(button(panel, "Use your recovery code")).toBeDefined();
    expect(button(panel, "Start again")).toBeDefined();
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
    expect(panel.querySelectorAll("[style]")).toHaveLength(0);
    await userEvent.fill(code, "123 456");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("loginCode")[0]?.args).toEqual(["t1", "123456"]);
    expect(ran).toEqual(["auth.sign_in", "auth.sign_in_code"]);
  });

  it("refuses a code that is not six digits on the field and sends nothing", async () => {
    const fake = new Fake();
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "12345");
    await userEvent.click(submit(panel));
    expect(errorOf(input(panel, "code"))).toBe("Enter the 6 digits from your authenticator app.");
    expect(fake.named("loginCode")).toHaveLength(0);
  });

  it("marks a wrong and a reused code on the field, keeping the ticket", async () => {
    const fake = new Fake().answer(
      "loginCode",
      refuse(401, "auth_code_invalid", "code_invalid"),
      refuse(401, "auth_code_invalid", "code_reused"),
    );
    const { panel } = await stepped(fake);
    const code = input(panel, "code");
    await userEvent.fill(code, "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(errorOf(code)).toBe("That code is not right.");
    });
    await userEvent.fill(code, "222222");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(errorOf(code)).toBe(
        "That code was already used. Wait for the next one. If you did not just sign in elsewhere, someone else may have, and you should change your password.",
      );
    });
    expect(fake.named("loginCode").map((c) => c.args[0])).toEqual(["t1", "t1"]);
  });

  it("continues with the newest ticket each answer carries", async () => {
    const fake = new Fake().answer(
      "loginCode",
      pending({ ticket: "t2", methods: ["totp"] }),
      ok({ signed_in: signedIn }),
    );
    const { panel, went } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(button(panel, "Use a passkey")).toBeUndefined();
    });
    await userEvent.fill(input(panel, "code"), "222222");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("loginCode").map((c) => c.args[0])).toEqual(["t1", "t2"]);
  });

  it("drops a locked authenticator app for the passkey, saying so", async () => {
    const fake = new Fake().answer("loginCode", refuse(401, "auth_code_invalid", "method_locked"));
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "code")).toBeNull();
    });
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
    expect(noticeOf(panel)?.textContent).toBe(
      "Too many wrong codes. Sign in with a passkey to unlock it, or ask an admin to reset your authenticator app.",
    );
    expect(document.activeElement).toBe(button(panel, "Use a passkey"));
    expect(button(panel, "Use a passkey").dataset["variant"]).toBe("primary");
  });

  it("goes back to the form, the username kept, when the locked app was the only way", async () => {
    const fake = new Fake().answer("loginCode", refuse(401, "auth_code_invalid", "method_locked"));
    const { panel } = await stepped(fake, pending({ methods: ["totp"] }));
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "username").value).toBe("mika");
    });
    expect(noticeOf(panel)?.textContent).toBe(
      "Too many wrong codes. Ask an admin to reset your authenticator app.",
    );
  });

  it("starts again on a ticket that timed out, with the username kept", async () => {
    const fake = new Fake().answer("loginCode", refuse(401, "auth_token_invalid"));
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "username").value).toBe("mika");
    });
    expect(noticeOf(panel)?.dataset["tone"]).toBe("warning");
    expect(noticeOf(panel)?.textContent).toBe("This sign-in timed out. Start again.");
    expect(input(panel, "password").value).toBe("");
  });

  it("holds Continue through a rate limit's wait", async () => {
    const fake = new Fake().answer(
      "loginCode",
      refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
    );
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(submit(panel).getAttribute("aria-disabled")).toBe("true");
    });
    expect(noticeOf(panel)?.textContent).toBe("Too many attempts. Try again in 0:30.");
    submit(panel).click();
    expect(fake.named("loginCode")).toHaveLength(1);
  });

  it("hides the code field once authenticator apps were turned off, and keeps the other ways", async () => {
    const fake = new Fake().answer("loginCode", refuse(403, "auth_totp_disabled"));
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "code")).toBeNull();
    });
    expect(noticeOf(panel)?.textContent).toBe(
      "Authenticator apps were just turned off in this app.",
    );
    expect(button(panel, "Use your recovery code")).toBeDefined();
  });

  it("keeps the field when codes cannot be checked right now", async () => {
    const fake = new Fake().answer("loginCode", refuse(503, "auth_second_factor_unavailable"));
    const { panel } = await stepped(fake);
    await userEvent.fill(input(panel, "code"), "111111");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "Sign-in with an authenticator app is unavailable right now. Try again later, or use a passkey or your recovery code.",
      );
    });
    expect(input(panel, "code")).not.toBeNull();
  });

  it("confirms with a passkey first when no authenticator app is listed", async () => {
    const fake = new Fake().answer("loginSecondPasskey", { kind: "timeout" });
    const { panel, ran, went } = await stepped(
      fake,
      pending({ methods: ["passkey", "recovery_code"] }),
    );
    expect(input(panel, "code")).toBeNull();
    expect(panel.textContent).toContain("Confirm with one of your passkeys to finish signing in.");
    const use = button(panel, "Use a passkey");
    expect(use.dataset["variant"]).toBe("primary");
    expect(document.activeElement).toBe(use);
    await userEvent.click(use);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("The passkey request ran out of time. Try again.");
    });
    await userEvent.click(use);
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("loginSecondPasskey")[1]?.args[1]).toBe("t1");
    expect(ran.slice(1)).toEqual(["auth.sign_in_second_passkey", "auth.sign_in_second_passkey"]);
  });

  it("offers only the ways the client and the browser can run", async () => {
    const fake = new Fake()
      .without("loginRecoveryCode")
      .answer("passkeySupport", { webauthn: false, conditional: false });
    const { panel } = await stepped(fake);
    expect(input(panel, "code")).not.toBeNull();
    expect(button(panel, "Use a passkey")).toBeUndefined();
    expect(button(panel, "Use your recovery code")).toBeUndefined();
  });

  it("goes back to the form when the step holds no way this page can run", async () => {
    const fake = new Fake().without("loginCode");
    const { panel } = await stepped(fake, pending({ methods: ["totp"] }), {}, false);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This account cannot finish signing in to this app. Ask an admin.",
      );
    });
    expect(input(panel, "username").value).toBe("mika");
  });

  it("goes back to the form on Start again", async () => {
    const fake = new Fake();
    const { panel } = await stepped(fake);
    await userEvent.click(button(panel, "Start again"));
    await vi.waitFor(() => {
      expect(input(panel, "username").value).toBe("mika");
    });
    expect(noticeOf(panel)).toBeNull();
  });
});

describe("mountSignIn: the recovery code", () => {
  it("groups the code in fours as typed and sends it normalised", async () => {
    const fake = new Fake();
    const { panel, ran } = await stepped(fake);
    await userEvent.click(button(panel, "Use your recovery code"));
    const code = input(panel, "recovery_code");
    expect(document.activeElement).toBe(code);
    await userEvent.type(code, "abcd2345efgh67lo");
    expect(code.value).toBe("abcd-2345-efgh-67lo");
    expect(button(panel, "Use your authenticator app")).toBeDefined();
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(fake.named("loginRecoveryCode")[0]?.args).toEqual(["t1", "ABCD2345EFGH6710"]);
    });
    expect(ran).toContain("auth.sign_in_recovery_code");
  });

  it("refuses a code that is not 16 characters and sends nothing", async () => {
    const fake = new Fake();
    const { panel } = await stepped(fake);
    await userEvent.click(button(panel, "Use your recovery code"));
    await userEvent.fill(input(panel, "recovery_code"), "abcd-2345");
    await userEvent.click(submit(panel));
    expect(errorOf(input(panel, "recovery_code"))).toBe(
      "Enter the 16 characters of your recovery code.",
    );
    expect(fake.named("loginRecoveryCode")).toHaveLength(0);
  });

  it.each(["ßßßß-ßßßß", "ıııı ıııı ıııı ıııı", "ﬀﬀﬀﬀ-ﬀﬀﬀﬀ", "abcdefghijkmnpß"])(
    "refuses %s, which only upper-casing makes 16 characters",
    async (typed) => {
      const fake = new Fake();
      const { panel } = await stepped(fake);
      await userEvent.click(button(panel, "Use your recovery code"));
      await userEvent.fill(input(panel, "recovery_code"), typed);
      await userEvent.click(submit(panel));
      expect(errorOf(input(panel, "recovery_code"))).toBe(
        "Enter the 16 characters of your recovery code.",
      );
      expect(fake.named("loginRecoveryCode")).toHaveLength(0);
    },
  );

  it("then sets up a new authenticator, and shows the new recovery code before going on", async () => {
    const fake = new Fake()
      .answer(
        "loginRecoveryCode",
        pending({ ticket: "t2", next: "enrol", methods: ["totp", "passkey"], recovered: true }),
      )
      .answer(
        "pendingTOTPFinish",
        ok({ signed_in: { ...signedIn, recovery_code: "WXYZ2345EFGH6789" } }),
      );
    const { panel, ran, went } = await stepped(fake);
    await userEvent.click(button(panel, "Use your recovery code"));
    await userEvent.fill(input(panel, "recovery_code"), "ABCD-2345-EFGH-6789");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(panel.querySelector("h2")?.textContent).toBe(
        "You used your recovery code. Set up a new authenticator",
      );
    });
    await vi.waitFor(() => {
      expect(panel.querySelector("svg.cp-qr")).not.toBeNull();
    });
    expect(panel.querySelector(".cp-code code")?.textContent).toBe("JBSW Y3DP EHPK 3PXP");
    expect(fake.named("pendingTOTPBegin")[0]?.args).toEqual([{ ticket: "t2" }]);
    expect(document.activeElement).toBe(input(panel, "code"));
    expect(button(panel, "Register a passkey")).toBeDefined();
    await userEvent.fill(input(panel, "code"), "123456");
    await userEvent.click(button(panel, "Turn on"));
    const shown = await dialogOf("Your recovery code");
    expect(shown.querySelector(".cp-code code")?.textContent).toBe("WXYZ-2345-EFGH-6789");
    expect(went).toEqual([]);
    await userEvent.click(shown.querySelector("input[type='checkbox']") as HTMLInputElement);
    await userEvent.click(button(shown, "Continue"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("pendingTOTPFinish")[0]?.args).toEqual(["t2", "123456"]);
    expect(ran.filter((n) => n === "auth.enrol_totp")).toHaveLength(2);
  });

  it("says a locked recovery code in its own words", async () => {
    const fake = new Fake().answer(
      "loginRecoveryCode",
      refuse(401, "auth_code_invalid", "method_locked"),
    );
    const { panel } = await stepped(fake, pending({ methods: ["totp", "recovery_code"] }));
    await userEvent.click(button(panel, "Use your recovery code"));
    await userEvent.fill(input(panel, "recovery_code"), "ABCD-2345-EFGH-6789");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "recovery_code")).toBeNull();
    });
    expect(noticeOf(panel)?.textContent).toBe(
      "Too many wrong recovery codes. Ask an admin to reset your second factor.",
    );
    expect(input(panel, "code")).not.toBeNull();
  });
});

describe("mountSignIn: choosing a credential after a temporary password", () => {
  const choose = pending({ next: "set_credential", methods: ["password", "passkey"] });

  it("asks for a new password, keeps it with the browser and signs in", async () => {
    const fake = new Fake();
    const { panel, ran, went } = await stepped(fake, choose);
    expect(panel.querySelector("h2")?.textContent).toBe("Choose your password");
    const field = input(panel, "new_password");
    expect(field.type).toBe("password");
    expect(field.getAttribute("autocomplete")).toBe("new-password");
    expect(document.activeElement).toBe(field);
    expect(button(panel, "Register a passkey instead")).toBeDefined();
    await userEvent.click(submit(panel));
    expect(errorOf(field)).toBe("Enter a password.");
    await userEvent.fill(field, "copper lantern harbour");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("loginSetPassword")[0]?.args).toEqual(["t1", "copper lantern harbour"]);
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "mika",
      "copper lantern harbour",
    ]);
    expect(ran).toEqual(["auth.sign_in", "auth.sign_in_set_password"]);
  });

  it("words the new password's bounds from the app's state, and refuses one outside them unsent", async () => {
    const fake = new Fake().answer(
      "state",
      ok({
        setup_required: false,
        password_login: true,
        passkeys: true,
        oidc: true,
        password_length: { min: 12, max: 64 },
        secure: true,
        https_required: [],
      }),
    );
    const { panel } = await stepped(fake, choose);
    const field = input(panel, "new_password");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "12 to 64 characters. A few unrelated words make a strong one.",
    );
    await userEvent.fill(field, "copper lamp");
    await userEvent.click(submit(panel));
    expect(errorOf(field)).toBe("Use 12 to 64 characters.");
    await userEvent.fill(field, "x".repeat(65));
    await userEvent.click(submit(panel));
    expect(errorOf(field)).toBe("Use 12 to 64 characters.");
    expect(fake.named("loginSetPassword")).toHaveLength(0);
  });

  it("refuses the temporary password itself as the new one", async () => {
    const fake = new Fake().answer(
      "loginSetPassword",
      refuse(400, "auth_password_rejected", "is_temporary_password"),
    );
    const { panel } = await stepped(fake, choose);
    await userEvent.fill(input(panel, "new_password"), "ABCD-2345-EFGH-6789");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(errorOf(input(panel, "new_password"))).toBe(
        "This is the temporary password you were given. Choose your own.",
      );
    });
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
  });

  it("offers only the passkey once password sign-in is off", async () => {
    const fake = new Fake().answer("loginSetPassword", refuse(403, "auth_password_login_disabled"));
    const { panel, went } = await stepped(fake, choose);
    await userEvent.fill(input(panel, "new_password"), "copper lantern harbour");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(input(panel, "new_password")).toBeNull();
    });
    expect(noticeOf(panel)?.textContent).toBe(
      "Password sign-in is off in this app. Register a passkey instead.",
    );
    const register = button(panel, "Register a passkey");
    expect(register.dataset["variant"]).toBe("primary");
    await userEvent.click(register);
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("loginSetPasskey")[0]?.args[1]).toBe("t1");
  });

  it("goes on to set up a second factor when the app requires one", async () => {
    const fake = new Fake().answer(
      "loginSetPassword",
      pending({ ticket: "t2", next: "enrol", methods: ["passkey"] }),
    );
    const { panel, went } = await stepped(fake, choose);
    await userEvent.fill(input(panel, "new_password"), "copper lantern harbour");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(panel.querySelector("h2")?.textContent).toBe("Set up a second factor");
    });
    expect(panel.querySelector("svg.cp-qr")).toBeNull();
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
    const register = button(panel, "Register a passkey");
    expect(document.activeElement).toBe(register);
    await userEvent.click(register);
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("pendingPasskey")[0]?.args[1]).toBe("t2");
  });

  it("words a passkey the authenticator already holds and keeps the enrolment", async () => {
    const fake = new Fake().answer("pendingPasskey", { kind: "duplicate" });
    const { panel, went } = await stepped(
      fake,
      pending({ ticket: "t2", next: "enrol", methods: ["passkey"] }),
    );
    await userEvent.click(button(panel, "Register a passkey"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("That passkey is already on your account.");
    });
    expect(panel.querySelector("h2")?.textContent).toBe("Set up a second factor");
    expect(went).toEqual([]);
  });
});

describe("mountSignIn: the end of a pending sign-in", () => {
  it("signs in from the step's answer as well as the session alone", async () => {
    const fake = new Fake();
    const { went } = await stepped(fake, ok({ signed_in: signedIn }), {}, false);
    await vi.waitFor(() => {
      expect(went).toEqual(["/feed"]);
    });
    expect(fake.named("storePasswordCredential")).toHaveLength(1);
  });

  it("says an account waits for approval, after its recovery code", async () => {
    const fake = new Fake().answer(
      "pendingTOTPFinish",
      ok({ waiting_approval: true, recovery_code: "WXYZ2345EFGH6789" }),
    );
    const { panel, went } = await stepped(fake, pending({ next: "enrol", methods: ["totp"] }));
    await vi.waitFor(() => {
      expect(input(panel, "code")).not.toBeNull();
    });
    await userEvent.fill(input(panel, "code"), "123456");
    await userEvent.click(submit(panel));
    const shown = await dialogOf("Your recovery code");
    await userEvent.click(shown.querySelector("input[type='checkbox']") as HTMLInputElement);
    await userEvent.click(button(shown, "Continue"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "Your account is waiting for an administrator's approval. You can sign in once it is approved.",
      );
    });
    expect(went).toEqual([]);
  });

  it("fits a 320px phone at the setup step", async () => {
    await page.viewport(320, 640);
    const fake = new Fake();
    const { panel } = await stepped(fake, pending({ next: "enrol", methods: ["totp", "passkey"] }));
    await vi.waitFor(() => {
      expect(panel.querySelector("svg.cp-qr")).not.toBeNull();
    });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});
