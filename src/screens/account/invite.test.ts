import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { StateResponse } from "./client.js";
import { mountInvite, type InviteOptions } from "./invite.js";
import type { AccountAction } from "./run.js";
import { Fake, ok, refuse, signedIn, type FakeClient } from "./test-helpers/fake.js";

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

const EVERY: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  secure: true,
  https_required: [],
};

type Options = Partial<Omit<InviteOptions<FakeClient>, "client" | "access">>;

function mount(
  fake = new Fake(),
  options: Options = {},
  /** null: the host passes none. */
  token: string | null = "inv-1",
): { panel: HTMLElement; fake: Fake; went: string[]; joined: string[] } {
  const panel = document.createElement("section");
  panel.className = "cp-panel";
  document.body.append(panel);
  const went: string[] = [];
  const joined: string[] = [];
  mountInvite(panel, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    provider: "Authelia",
    ...(token === null ? {} : { token }),
    navigate: (url) => {
      went.push(url);
    },
    onSignedIn: (s) => {
      joined.push(s.user.username);
    },
    signal: life.signal,
    ...options,
  });
  return { panel, fake, went, joined };
}

const drawn = (panel: HTMLElement): Promise<void> =>
  vi.waitFor(() => {
    expect(panel.getAttribute("aria-busy")).toBeNull();
  });

const input = (panel: HTMLElement, name: string): HTMLInputElement =>
  panel.querySelector<HTMLInputElement>(`input[name='${name}']`) as HTMLInputElement;

const button = (panel: HTMLElement, text: string): HTMLElement =>
  [...panel.querySelectorAll<HTMLElement>("button, a")].find((b) =>
    b.textContent.includes(text),
  ) as HTMLElement;

const noticeOf = (panel: HTMLElement): HTMLElement | null =>
  panel.querySelector<HTMLElement>("[data-part='notice'] > .cp-notice");

const errorOf = (panel: HTMLElement, name: string): string => {
  const field = input(panel, name);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  return field.closest(".cp-field")?.querySelector(".cp-field-error")?.textContent ?? "";
};

const emptyOf = (panel: HTMLElement): string => panel.querySelector(".cp-empty")?.textContent ?? "";

async function accept(panel: HTMLElement, password = "lantern harbour quietly"): Promise<void> {
  await userEvent.fill(input(panel, "username"), "noor");
  await userEvent.fill(input(panel, "password"), password);
  await userEvent.click(button(panel, "Create account"));
}

describe("mountInvite: the panel", () => {
  it("joins the app by password, then by single sign-on under a rule", async () => {
    const { panel } = mount();
    await drawn(panel);
    const title = panel.querySelector("h1");
    expect(title?.textContent).toBe("Join Release tracker");
    expect(panel.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(panel.textContent).toContain("This invite is for you alone. Do not forward it.");
    expect(input(panel, "password").getAttribute("autocomplete")).toBe("new-password");
    expect(button(panel, "Create account").dataset["variant"]).toBe("primary");
    expect(panel.querySelector("form + hr + button")?.textContent).toContain(
      "Accept with Authelia",
    );
    expect(button(panel, "Accept with Authelia").dataset["variant"]).toBeUndefined();
  });

  it("says the role lasts until the first sign-in where the provider sets it", async () => {
    const { panel } = mount(new Fake(), { roleFromProvider: true });
    await drawn(panel);
    expect(panel.textContent).toContain("Your role comes from Authelia after your first sign-in.");
  });

  it("offers only the provider under single sign-on only, as the one primary", async () => {
    const { panel } = mount(new Fake().answer("state", ok({ ...EVERY, sso: "only" })));
    await drawn(panel);
    expect(input(panel, "password")).toBeNull();
    expect(button(panel, "Accept with Authelia").dataset["variant"]).toBe("primary");
  });

  it("leaves the provider out for a client without inviteAcceptOIDC", async () => {
    const { panel } = mount(new Fake().without("inviteAcceptOIDC"));
    await drawn(panel);
    expect(button(panel, "Accept with Authelia")).toBeUndefined();
    expect(panel.querySelector("hr")).toBeNull();
  });

  it("says the invite cannot be accepted when no way in is on", async () => {
    const fake = new Fake().answer("state", ok({ ...EVERY, password_login: false, oidc: false }));
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    expect(panel.textContent).toContain(
      "This invite cannot be accepted here. Ask whoever sent it.",
    );
  });

  it("asks for HTTPS over plain HTTP, with no form", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...EVERY, secure: false, https_origin: "https://tracker.example" }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    expect(emptyOf(panel)).toContain("This app needs HTTPS");
    expect(button(panel, "Open Release tracker over HTTPS")).toBeDefined();
  });
});

describe("mountInvite: the token", () => {
  it("reads the link's token and sends it with the account", async () => {
    const fake = new Fake();
    fake.fragment = "inv-from-link";
    const { panel, joined } = mount(fake, {}, null);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(joined).toEqual(["mika"]);
    });
    expect(fake.named("takeFragmentToken")[0]?.args).toEqual(["token"]);
    expect(fake.named("inviteAcceptPassword")[0]?.args).toEqual([
      { token: "inv-from-link", username: "noor", password: "lantern harbour quietly" },
    ]);
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "noor",
      "lantern harbour quietly",
    ]);
  });

  it("shows a link with no token as broken, reading nothing", async () => {
    const { panel, fake } = mount(new Fake(), {}, null);
    expect(emptyOf(panel)).toBe(
      "This invite link does not work. Ask whoever sent it for a new one.",
    );
    expect(fake.named("state")).toHaveLength(0);
  });

  it("replaces the form when the server says the invite does not work", async () => {
    const fake = new Fake().answer("inviteAcceptPassword", refuse(401, "auth_token_invalid"));
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(emptyOf(panel)).toBe(
        "This invite link does not work. Ask whoever sent it for a new one.",
      );
    });
    expect(panel.querySelector("form")).toBeNull();
  });

  it("says a single-user app takes no invites", async () => {
    const fake = new Fake().answer(
      "inviteAcceptPassword",
      refuse(403, "auth_forbidden", "single_owner"),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(emptyOf(panel)).toBe("This app has one owner and takes no invites.");
    });
  });
});

describe("mountInvite: the answers", () => {
  it("marks empty fields and sends nothing", async () => {
    const { panel, fake } = mount();
    await drawn(panel);
    await userEvent.click(button(panel, "Create account"));
    expect(errorOf(panel, "username")).toBe("Enter a username.");
    expect(errorOf(panel, "password")).toBe("Enter a password.");
    expect(fake.named("inviteAcceptPassword")).toHaveLength(0);
  });

  it.each([
    ["auth_username_taken", undefined, "username", "That username is taken. Choose another."],
    ["auth_username_invalid", "disallowed_character", "username", "Usernames have no spaces."],
    [
      "auth_password_rejected",
      "common",
      "password",
      "That password is too common. Choose another.",
    ],
  ] as const)("shows %s on its field", async (code, reason, name, words) => {
    const fake = new Fake().answer("inviteAcceptPassword", refuse(400, code, reason));
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(errorOf(panel, name)).toBe(words);
    });
  });

  it.each([
    [
      refuse(403, "auth_forbidden", "no_usable_method"),
      "This app allows no second factor this account can set up. Ask an administrator.",
    ],
    [
      refuse(503, "auth_breach_check_unavailable"),
      "The password check is not answering. Try again in a moment. Your password can stay as it is.",
    ],
    [
      refuse(400, "auth_bad_request", "token_in_query"),
      "The server could not do this. Try again in a moment.",
    ],
  ])("words a refusal with no field", async (answer, words) => {
    const fake = new Fake().answer("inviteAcceptPassword", answer);
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toContain(words);
    });
  });

  it("points a password under single sign-on only at the provider", async () => {
    const fake = new Fake().answer("inviteAcceptPassword", refuse(403, "auth_sso_only"));
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("Use your organisation's sign-in.");
    });
    expect(document.activeElement).toBe(button(panel, "Accept with Authelia"));
  });

  it("holds both ways in through a rate limit's wait", async () => {
    const fake = new Fake().answer(
      "inviteAcceptPassword",
      refuse(429, "auth_rate_limited", undefined, { "Retry-After": "42" }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("Too many attempts. Try again in 0:42.");
    });
    expect(button(panel, "Create account").getAttribute("aria-disabled")).toBe("true");
    expect(button(panel, "Accept with Authelia").getAttribute("aria-disabled")).toBe("true");
  });

  it("runs each write under its action name", async () => {
    const names: AccountAction[] = [];
    const { panel } = mount(new Fake(), {
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    await drawn(panel);
    await accept(panel);
    await userEvent.click(button(panel, "Accept with Authelia"));
    await vi.waitFor(() => {
      expect(names).toEqual(["auth.invite_accept", "auth.invite_accept_oidc"]);
    });
  });
});

describe("mountInvite: single sign-on", () => {
  it("sends the token in the body and opens the provider", async () => {
    const { panel, fake, went } = mount();
    await drawn(panel);
    await userEvent.click(button(panel, "Accept with Authelia"));
    await vi.waitFor(() => {
      expect(went).toEqual(["https://id.example/authorize?state=invite"]);
    });
    expect(fake.named("inviteAcceptOIDC")[0]?.args).toEqual([{ token: "inv-1" }]);
  });

  it.each([
    [refuse(401, "auth_token_invalid"), "This invite link does not work."],
    [refuse(403, "auth_forbidden", "single_owner"), "This app has one owner and takes no invites."],
  ])("replaces the panel when the invite cannot be used", async (answer, words) => {
    const fake = new Fake().answer("inviteAcceptOIDC", answer);
    const { panel, went } = mount(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Accept with Authelia"));
    await vi.waitFor(() => {
      expect(emptyOf(panel)).toContain(words);
    });
    expect(went).toEqual([]);
  });

  it("says when single sign-on is unavailable", async () => {
    const fake = new Fake().answer("inviteAcceptOIDC", refuse(400, "auth_oidc_unavailable"));
    const { panel } = mount(fake);
    await drawn(panel);
    await userEvent.click(button(panel, "Accept with Authelia"));
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "Single sign-on is unavailable right now. Try again in a moment, or sign in another way.",
      );
    });
  });

  it("finishes with the session the answer made", async () => {
    const { panel, joined } = mount(new Fake().answer("inviteAcceptPassword", ok(signedIn)));
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(joined).toEqual(["mika"]);
    });
  });
});

describe("mountInvite: a second factor first", () => {
  it("keeps the step it hands its panel to when a read started before it is slow", async () => {
    const fake = new Fake()
      .answer("inviteAcceptPassword", refuse(403, "auth_https_required"))
      .answer(
        "inviteAcceptPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp"] } }),
      )
      .answer(
        "pendingTOTPBegin",
        ok({ uri: "otpauth://totp/x?secret=JBSWY3DP", text: "JBSWY3DP" }),
      );
    const { panel } = mount(fake);
    await drawn(panel);
    // The re-read the refusal starts stays out, and the person sends the
    // form again at once, inside the load's first 150 ms.
    const stalled = Promise.withResolvers<unknown>();
    fake.answer("state", () => {
      setTimeout(() => {
        panel.querySelector("form")?.requestSubmit();
      }, 0);
      return stalled.promise;
    });
    await accept(panel);
    await vi.waitFor(() => {
      expect(input(panel, "code")).not.toBeNull();
    });
    const code = input(panel, "code");
    // Past the 150 ms after which a slow load sketches an empty part.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(input(panel, "code")).toBe(code);
    expect(panel.querySelector(".cp-skeleton")).toBeNull();
    stalled.resolve(ok(EVERY));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(input(panel, "code")).toBe(code);
  });

  it("shows no rate limit's wait from the authenticator key's read once the person started again", async () => {
    const fake = new Fake()
      .answer(
        "inviteAcceptPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp", "passkey"] } }),
      )
      .answer(
        "pendingTOTPBegin",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
      );
    const release = fake.hold("pendingTOTPBegin");
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(button(panel, "Start again")).toBeDefined();
    });
    await userEvent.click(button(panel, "Start again"));
    await vi.waitFor(() => {
      expect(input(panel, "password")).not.toBeNull();
    });
    const password = input(panel, "password");
    release();
    // Past the 400 ms a confirm cycle's shown busy state holds an answer.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(noticeOf(panel)).toBeNull();
    expect(input(panel, "password")).toBe(password);
    expect(button(panel, "Create account").getAttribute("aria-disabled")).toBeNull();
  });

  it("takes the sign-in an enrolment completed after the person started again", async () => {
    const fake = new Fake()
      .answer(
        "inviteAcceptPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["passkey"] } }),
      )
      .answer("pendingPasskey", { kind: "answered", result: { signed_in: signedIn } });
    const release = fake.hold("pendingPasskey");
    const { panel, joined } = mount(fake);
    await drawn(panel);
    await accept(panel);
    const register = await vi.waitFor(() => {
      const b = button(panel, "Register a passkey");
      expect(b).toBeDefined();
      return b;
    });
    await userEvent.click(register);
    await userEvent.click(button(panel, "Start again"));
    await vi.waitFor(() => {
      expect(input(panel, "password")).not.toBeNull();
    });
    expect(joined).toEqual([]);
    release();
    await vi.waitFor(() => {
      expect(joined).toEqual(["mika"]);
    });
  });

  it("continues into the sign-in's own enrolment, and joins once it finishes", async () => {
    const fake = new Fake()
      .answer(
        "inviteAcceptPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["passkey"] } }),
      )
      .answer("pendingPasskey", { kind: "answered", result: { signed_in: signedIn } });
    const { panel, joined } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(panel.querySelector("h2")?.textContent).toBe("Set up a second factor");
    });
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
    expect(joined).toEqual([]);
    await userEvent.click(button(panel, "Register a passkey"));
    await vi.waitFor(() => {
      expect(joined).toEqual(["mika"]);
    });
    expect(fake.named("pendingPasskey")[0]?.args[1]).toBe("t1");
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "noor",
      "lantern harbour quietly",
    ]);
  });

  it("leaves no step behind when the read after a lapsed ticket is refused, and Retry says why", async () => {
    const fake = new Fake()
      .answer(
        "inviteAcceptPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp", "passkey"] } }),
      )
      .answer("pendingTOTPBegin", ok({ uri: "otpauth://totp/x?secret=JBSWY3DP", text: "JBSWY3DP" }))
      .answer("pendingTOTPFinish", refuse(401, "auth_token_invalid"));
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(input(panel, "code")).not.toBeNull();
    });
    fake.answer("state", refuse(503, "auth_unavailable"));
    await userEvent.fill(input(panel, "code"), "123456");
    await userEvent.click(button(panel, "Turn on"));
    await vi.waitFor(() => {
      expect(button(panel, "Retry")).toBeDefined();
    });
    expect(input(panel, "code")).toBeNull();
    expect(button(panel, "Register a passkey")).toBeUndefined();
    expect(button(panel, "Start again")).toBeUndefined();
    expect(noticeOf(panel)?.querySelector("[data-part='body']")?.textContent).toBe(
      "This sign-in timed out. Start again. Sign-in is unavailable right now. Try again in a few seconds.",
    );
    await userEvent.click(button(panel, "Retry"));
    await vi.waitFor(() => {
      expect(input(panel, "password")).not.toBeNull();
    });
    expect(noticeOf(panel)?.textContent).toBe("This sign-in timed out. Start again.");
  });

  it("joins at once when the answer is the session", async () => {
    const fake = new Fake().answer("inviteAcceptPassword", ok({ signed_in: signedIn }));
    const { panel, joined } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(joined).toEqual(["mika"]);
    });
    expect(panel.querySelector("h2")).toBeNull();
  });
});

describe("mountInvite: the password's bounds", () => {
  it("words the limit from the app's state, and refuses a password outside it unsent", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...EVERY, password_length: { min: 30, max: 64 } }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    const help = document.getElementById(
      input(panel, "password").getAttribute("aria-describedby") ?? "",
    );
    expect(help?.textContent).toBe("30 to 64 characters. A few unrelated words make a strong one.");
    await accept(panel);
    expect(errorOf(panel, "password")).toBe("Use 30 to 64 characters.");
    expect(fake.named("inviteAcceptPassword")).toHaveLength(0);
  });
});

describe("mountInvite: a re-read refused once the form is drawn", () => {
  it("keeps the form and its values under the notice, and Retry draws it again", async () => {
    const fake = new Fake()
      .answer("state", ok(EVERY), refuse(503, "auth_unavailable"), ok(EVERY))
      .answer("inviteAcceptPassword", refuse(403, "auth_https_required"));
    const { panel } = mount(fake);
    await drawn(panel);
    await accept(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.querySelector("[data-cp-action='retry']")).not.toBeNull();
    });
    expect(panel.querySelector("form")).not.toBeNull();
    expect(input(panel, "username").value).toBe("noor");
    await userEvent.click(noticeOf(panel)!.querySelector<HTMLElement>("[data-cp-action='retry']")!);
    await vi.waitFor(() => {
      expect(fake.named("state")).toHaveLength(3);
      expect(noticeOf(panel)).toBeNull();
    });
    expect(panel.querySelector("form")).not.toBeNull();
  });
});
