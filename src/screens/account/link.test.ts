import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { StateResponse } from "./client.js";
import { Fake, ok, refuse, signedIn } from "./test-helpers/fake.js";
import {
  button,
  drawn,
  input,
  mount,
  noticeOf,
  signIn,
  useSignIn,
  type Options,
} from "./test-helpers/sign-in.js";

useSignIn();

const RETURN = "?oidc=not_linked";
const ONLY: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  totp: true,
  sso: "only",
};
const CAN_CREATE = ok({
  issuer: "https://id.example",
  username_hint: "mika@example.com",
  can_create: true,
  suggested_username: "mika",
});

function linkScreen(
  fake = new Fake(),
  options: Options = {},
): { panel: HTMLElement; fake: Fake; went: string[] } {
  const went: string[] = [];
  const { panel } = mount(fake, {
    search: RETURN,
    provider: "Authelia",
    onSignedIn: ({ next }) => {
      went.push(next);
    },
    ...options,
  });
  return { panel, fake, went };
}

const errorOf = (panel: HTMLElement, name: string): string => {
  const field = input(panel, name);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  return field.closest(".cp-field")?.querySelector(".cp-field-error")?.textContent ?? "";
};

const headings = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll("h1, h2")].map((h) => h.textContent);

describe("mountSignIn: link this identity", () => {
  it("names the identity and offers the account's own ways in, never single sign-on", async () => {
    const { panel, fake } = linkScreen();
    await drawn(panel);
    expect(headings(panel)).toEqual(["Link this identity", "Link to an existing account"]);
    expect(panel.textContent).toContain("You signed in with Authelia as mika@example.com.");
    expect(panel.textContent).toContain(
      "Sign in to that account here, and Authelia is linked to it.",
    );
    expect(input(panel, "password")).not.toBeNull();
    expect(button(panel, "Sign in with a passkey")).toBeDefined();
    expect(button(panel, "Continue with Authelia")).toBeUndefined();
    expect(panel.textContent).not.toContain("Create a new account");
    expect(noticeOf(panel)).toBeNull();
    expect(fake.named("oidcPending")).toHaveLength(1);
  });

  it("names the identity without a name when the provider sent none", async () => {
    const fake = new Fake().answer("oidcPending", ok({ issuer: "https://id.example" }));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    expect(panel.textContent).toContain("You signed in with Authelia.");
  });

  it("links the identity once the person signs in, then goes on", async () => {
    const { panel, fake, went } = linkScreen();
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("loginPassword")).toHaveLength(1);
    expect(fake.named("oidcLinkPending")).toHaveLength(1);
  });

  it.each([
    ["auth_identity_taken", 409, "That identity is linked to another account."],
    [
      "auth_already_linked",
      409,
      "Your account already has a single sign-on identity. Unlink it first.",
    ],
    ["auth_not_found", 404, "Your sign-in expired. Sign in with Authelia again."],
  ] as const)(
    "signs in but says why %s left the identity unlinked, with Continue",
    async (code, status, words) => {
      const fake = new Fake().answer("oidcLinkPending", refuse(status, code));
      const { panel, went } = linkScreen(fake);
      await drawn(panel);
      await signIn(panel);
      await vi.waitFor(() => {
        expect(noticeOf(panel)?.textContent).toContain(words);
      });
      expect(went).toEqual([]);
      const go = button(panel, "Continue");
      expect(document.activeElement).toBe(go);
      await userEvent.click(go);
      expect(went).toEqual(["/"]);
    },
  );

  it("shows a lapsed pending sign-in as expired, with the provider's button", async () => {
    const fake = new Fake().answer("oidcPending", refuse(404, "auth_not_found"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    expect(noticeOf(panel)?.dataset["tone"]).toBe("warning");
    expect(noticeOf(panel)?.textContent).toBe("Your sign-in expired. Sign in with Authelia again.");
    expect(headings(panel)).toEqual(["Sign in"]);
    expect(button(panel, "Continue with Authelia")).toBeDefined();
  });

  it("words the identity as before when the host mounts no pending link", async () => {
    const { panel, fake } = linkScreen(new Fake(), {
      parts: ["password", "passkeys", "single-sign-on"],
      place: "Security",
    });
    await drawn(panel);
    expect(noticeOf(panel)?.textContent).toBe(
      "This Authelia identity is not linked to an account here. Sign in another way, then link it in Security.",
    );
    expect(fake.named("oidcPending")).toHaveLength(0);
  });
});

describe("mountSignIn: create a new account for the identity", () => {
  it("fills the provider's username and creates the account", async () => {
    const fake = new Fake().answer("oidcPending", CAN_CREATE);
    const { panel, went } = linkScreen(fake);
    await drawn(panel);
    expect(headings(panel)).toEqual([
      "Link this identity",
      "Link to an existing account",
      "Create a new account",
    ]);
    expect(input(panel, "new_username").value).toBe("mika");
    await userEvent.fill(input(panel, "new_username"), "mika-k");
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("oidcCreatePending")[0]?.args).toEqual([{ username: "mika-k" }]);
    expect(fake.named("oidcLinkPending")).toHaveLength(0);
  });

  it("asks for a username before sending", async () => {
    const fake = new Fake().answer("oidcPending", CAN_CREATE);
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.clear(input(panel, "new_username"));
    await userEvent.click(button(panel, "Create account"));
    expect(errorOf(panel, "new_username")).toBe("Enter a username.");
    expect(fake.named("oidcCreatePending")).toHaveLength(0);
  });

  it.each([
    ["auth_username_taken", undefined, "That username is taken. Choose another."],
    ["auth_username_invalid", "disallowed_character", "Usernames have no spaces."],
  ] as const)("shows %s on the username", async (code, reason, words) => {
    const fake = new Fake()
      .answer("oidcPending", CAN_CREATE)
      .answer("oidcCreatePending", refuse(409, code, reason));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(errorOf(panel, "new_username")).toBe(words);
    });
  });

  it("goes back to sign-in, expired, when the pending sign-in lapsed", async () => {
    const fake = new Fake()
      .answer("oidcPending", CAN_CREATE)
      .answer("oidcCreatePending", refuse(404, "auth_not_found"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "Your sign-in expired. Sign in with Authelia again.",
      );
    });
    await drawn(panel);
    expect(headings(panel)).toEqual(["Sign in"]);
    expect(button(panel, "Continue with Authelia")).toBeDefined();
  });

  it("says an invite used meanwhile no longer works", async () => {
    const fake = new Fake()
      .answer("oidcPending", CAN_CREATE)
      .answer("oidcCreatePending", refuse(401, "auth_token_invalid"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This invite no longer works. Ask whoever sent it for a new one.",
      );
    });
  });

  it("drops Create when new accounts by single sign-on were turned off", async () => {
    const fake = new Fake()
      .answer("oidcPending", CAN_CREATE)
      .answer("oidcCreatePending", refuse(403, "auth_forbidden", "provisioning_disabled"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "New accounts by single sign-on are turned off. Ask an administrator.",
      );
    });
    expect(headings(panel)).not.toContain("Create a new account");
  });

  it("holds Create through a rate limit's wait", async () => {
    const fake = new Fake()
      .answer("oidcPending", CAN_CREATE)
      .answer(
        "oidcCreatePending",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "42" }),
      );
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("Too many attempts. Try again in 0:42.");
    });
    expect(button(panel, "Create account").getAttribute("aria-disabled")).toBe("true");
  });
});

describe("mountSignIn: link with an admin's temporary password", () => {
  const onlyFake = (): Fake => new Fake().always("state", ok(ONLY));

  it("asks for the account's username and temporary password under single sign-on only", async () => {
    const { panel, fake, went } = linkScreen(onlyFake());
    await drawn(panel);
    expect(panel.textContent).toContain(
      "Enter the account's username and the temporary password an admin gave you.",
    );
    expect(input(panel, "password")).toBeNull();
    const secret = input(panel, "temporary_password");
    expect(secret.type).toBe("password");
    expect(secret.getAttribute("autocomplete")).toBe("one-time-code");
    await userEvent.fill(input(panel, "username"), "mika");
    await userEvent.fill(secret, "ABCD-2345-EFGH-6789");
    await userEvent.click(button(panel, "Link account"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("oidcLinkByAdmin")[0]?.args).toEqual([
      { username: "mika", temporary_password: "ABCD-2345-EFGH-6789" },
    ]);
    expect(fake.named("oidcLinkPending")).toHaveLength(0);
  });

  it("marks empty fields and sends nothing", async () => {
    const { panel, fake } = linkScreen(onlyFake());
    await drawn(panel);
    await userEvent.click(button(panel, "Link account"));
    expect(errorOf(panel, "username")).toBe("Enter a username.");
    expect(errorOf(panel, "temporary_password")).toBe("Enter the temporary password.");
    expect(fake.named("oidcLinkByAdmin")).toHaveLength(0);
  });

  const send = async (panel: HTMLElement): Promise<void> => {
    await userEvent.fill(input(panel, "username"), "mika");
    await userEvent.fill(input(panel, "temporary_password"), "ABCD-2345-EFGH-6789");
    await userEvent.click(button(panel, "Link account"));
  };

  it("says the pair is wrong while the mode is still single sign-on only", async () => {
    const fake = onlyFake().answer("oidcLinkByAdmin", refuse(401, "auth_invalid_credentials"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await send(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("The username or temporary password is wrong.");
    });
    expect(document.activeElement).toBe(input(panel, "temporary_password"));
  });

  it("offers signing in to the account once the mode is no longer single sign-on only", async () => {
    const fake = new Fake()
      .answer("state", ok(ONLY))
      .answer("oidcLinkByAdmin", refuse(401, "auth_invalid_credentials"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await send(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This way of linking is not available now. Sign in to the account and link from it.",
      );
    });
    await drawn(panel);
    expect(headings(panel)).toEqual(["Link this identity", "Link to an existing account"]);
    expect(input(panel, "password")).not.toBeNull();
    expect(input(panel, "temporary_password")).toBeNull();
  });

  it("goes back to sign-in, expired, when the pending sign-in lapsed", async () => {
    const fake = onlyFake().answer("oidcLinkByAdmin", refuse(404, "auth_not_found"));
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await send(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "Your sign-in expired. Sign in with Authelia again.",
      );
    });
    await drawn(panel);
    expect(headings(panel)).toEqual(["Sign in"]);
    expect(button(panel, "Sign in with Authelia")).toBeDefined();
  });

  it("holds Link account through a rate limit's wait", async () => {
    const fake = onlyFake().answer(
      "oidcLinkByAdmin",
      refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
    );
    const { panel } = linkScreen(fake);
    await drawn(panel);
    await send(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("Too many attempts. Try again in 0:30.");
    });
    expect(button(panel, "Link account").getAttribute("aria-disabled")).toBe("true");
  });

  it("signs in as linked, with no second link call", async () => {
    const { panel, fake } = linkScreen(onlyFake().answer("oidcLinkByAdmin", ok(signedIn)));
    await drawn(panel);
    await send(panel);
    await vi.waitFor(() => {
      expect(fake.named("oidcLinkByAdmin")).toHaveLength(1);
    });
    expect(fake.named("oidcLinkPending")).toHaveLength(0);
  });
});
