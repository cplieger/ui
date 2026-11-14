import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { Refusal, StateResponse } from "./client.js";
import type { AccountAction } from "./run.js";
import { mountSetup, type SetupOptions } from "./setup.js";
import { Fake, noAnswer, ok, refuse, type FakeClient } from "./test-helpers/fake.js";
import { pageHost, type PageHost } from "./words.js";

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

const SETUP: StateResponse = {
  setup_required: true,
  password_login: true,
  passkeys: true,
  oidc: false,
};

type Options = Partial<Omit<SetupOptions<FakeClient>, "client" | "access">>;

function mount(
  fake = new Fake().answer("state", ok(SETUP)),
  options: Options = {},
): { region: HTMLElement; fake: Fake; went: string[] } {
  const region = document.createElement("section");
  region.className = "cp-panel";
  document.body.append(region);
  const went: string[] = [];
  mountSetup(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    navigate: (url) => {
      went.push(url);
    },
    signal: life.signal,
    ...options,
  });
  return { region, fake, went };
}

const drawn = (region: HTMLElement): Promise<void> =>
  vi.waitFor(() => {
    expect(region.getAttribute("aria-busy")).toBeNull();
  });

const input = (region: HTMLElement, name: string): HTMLInputElement =>
  region.querySelector<HTMLInputElement>(`input[name='${name}']`) as HTMLInputElement;

const button = (region: HTMLElement, text: string): HTMLElement =>
  [...region.querySelectorAll<HTMLElement>("button, a")].find((b) =>
    b.textContent.includes(text),
  ) as HTMLElement;

const noticeOf = (region: HTMLElement): HTMLElement | null =>
  region.querySelector<HTMLElement>("[data-part='notice'] > .cp-notice");

/** The error message under the field named `name`. */
const errorOf = (region: HTMLElement, name: string): string => {
  const field = input(region, name);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  return field.closest(".cp-field")?.querySelector(".cp-field-error")?.textContent ?? "";
};

async function fillIn(region: HTMLElement, password = "lantern harbour quietly"): Promise<void> {
  await userEvent.fill(input(region, "username"), "mika");
  await userEvent.fill(input(region, "password"), password);
}

async function create(region: HTMLElement): Promise<void> {
  await fillIn(region);
  await userEvent.click(button(region, "Create account"));
}

const withToken = { token: { help: "Run release-tracker setup-token on the server." } };

describe("mountSetup: the form", () => {
  it("holds the heading, the token, username and password with their help, then the passkey under a rule", async () => {
    const { region } = mount(undefined, withToken);
    await drawn(region);
    const title = region.querySelector("h1");
    expect(title?.textContent).toBe("Set up Release tracker");
    expect(region.getAttribute("aria-labelledby")).toBe(title?.id);
    const order = [...region.querySelectorAll("h1, label, .cp-help, hr, button")]
      .filter((n) => n.closest(".cp-input-wrap") === null)
      .map((n) => n.textContent.trim());
    expect(order).toEqual([
      "Set up Release tracker",
      "Setup token",
      "Run release-tracker setup-token on the server.",
      "Username",
      "Letters, digits, dots, dashes and underscores. No spaces.",
      "Password",
      "15 to 128 characters. A few unrelated words make a strong one.",
      "Create account",
      "",
      "Create with a passkey",
    ]);
    expect(input(region, "token").getAttribute("aria-describedby")).toBe(
      region.querySelector(".cp-help")?.id,
    );
    expect(input(region, "password").getAttribute("autocomplete")).toBe("new-password");
    expect(input(region, "password").hasAttribute("minlength")).toBe(false);
    expect(input(region, "password").hasAttribute("maxlength")).toBe(false);
    expect(button(region, "Create account").dataset["variant"]).toBe("primary");
    expect(button(region, "Create with a passkey").dataset["variant"]).toBeUndefined();
    expect(region.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("fills the token from the link's fragment, taken before the state is read", async () => {
    const fake = new Fake().answer("state", ok(SETUP));
    fake.fragment = "tok-9f2";
    const { region } = mount(fake, withToken);
    expect(fake.calls[0]?.name).toBe("takeFragmentToken");
    await drawn(region);
    expect(input(region, "token").value).toBe("tok-9f2");
  });

  it("asks for no token, and reads no fragment, when the app needs none", async () => {
    const { region, fake } = mount();
    await drawn(region);
    expect(input(region, "token")).toBeNull();
    expect(fake.named("takeFragmentToken")).toHaveLength(0);
  });

  it("sits inside a host's step with no heading of its own", async () => {
    const { region } = mount(undefined, { heading: false });
    await drawn(region);
    expect(region.querySelector("h1, h2")).toBeNull();
    expect(region.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("leaves the passkey out without its part or where the browser runs no ceremony", async () => {
    const a = mount(undefined, { parts: ["password"] });
    await drawn(a.region);
    expect(button(a.region, "passkey")).toBeUndefined();
    expect(a.region.querySelector("hr")).toBeNull();
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("passkeySupport", { webauthn: false, conditional: false });
    const b = mount(fake);
    await drawn(b.region);
    expect(button(b.region, "passkey")).toBeUndefined();
  });

  it("sends the person to sign-in once setup is done", async () => {
    const { region, went } = mount(new Fake());
    await drawn(region);
    expect(went).toEqual(["/sign-in?arrived=setup-complete"]);
    const done = vi.fn();
    const other = mount(new Fake(), { onSetupComplete: done });
    await drawn(other.region);
    expect(done).toHaveBeenCalledOnce();
  });

  it("says the app is not answering, and reads the state again on Retry", async () => {
    const fake = new Fake().answer("state", noAnswer, ok(SETUP));
    const { region } = mount(fake);
    await drawn(region);
    expect(noticeOf(region)?.textContent).toContain("The app is not answering.");
    await userEvent.click(button(region, "Retry"));
    await vi.waitFor(() => {
      expect(input(region, "username")).not.toBeNull();
    });
  });
});

describe("mountSetup: over plain HTTP", () => {
  it("draws the password setup with the HTTPS line and the shorter session on a relaxed app", async () => {
    const fake = new Fake().answer(
      "state",
      ok({
        ...SETUP,
        passkeys: false,
        secure: false,
        https_required: ["passkeys"],
        plain_session: { idle_seconds: 1800, absolute_seconds: 43200 },
        https_origin: "https://tracker.example",
      }),
    );
    const { region } = mount(fake);
    await drawn(region);
    expect(input(region, "password")).not.toBeNull();
    expect(button(region, "passkey")).toBeUndefined();
    const https = region.querySelector("[data-part='https']");
    expect(https?.textContent).toBe("Passkeys need HTTPS. Open Release tracker over HTTPS.");
    const link = https?.querySelector("a") as HTMLAnchorElement;
    expect(new URL(link.href).origin).toBe("https://tracker.example");
    expect(region.querySelector("[data-part='plain-session']")?.textContent).toBe(
      "You stay signed in for up to 12 hours, 30 minutes when idle, until you close the browser.",
    );
  });

  it("says the line alone when the app named no HTTPS address", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...SETUP, passkeys: false, secure: false, https_required: ["passkeys"] }),
    );
    const { region } = mount(fake);
    await drawn(region);
    const https = region.querySelector("[data-part='https']");
    expect(https?.textContent).toBe("Passkeys need HTTPS.");
    expect(https?.querySelector("a")).toBeNull();
  });

  it("shows no form on a strict app, only the way to HTTPS", async () => {
    const fake = new Fake().answer(
      "state",
      ok({
        ...SETUP,
        password_login: false,
        passkeys: false,
        secure: false,
        https_required: ["password", "setup", "passkeys"],
        https_origin: "https://tracker.example",
      }),
    );
    const { region } = mount(fake);
    await drawn(region);
    expect(region.querySelector("form, input")).toBeNull();
    const empty = region.querySelector(".cp-empty");
    expect(empty?.textContent).toContain("This app needs HTTPS.");
    const link = empty?.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toBe("Open Release tracker over HTTPS");
    expect(link.dataset["variant"]).toBe("primary");
    expect(new URL(link.href).origin).toBe("https://tracker.example");
  });

  it("draws an HTTPS page as it is, whatever https_required says", async () => {
    const fake = new Fake().answer("state", ok({ ...SETUP, secure: true, https_required: [] }));
    const { region } = mount(fake);
    await drawn(region);
    expect(region.querySelector("[data-part='https'], [data-part='plain-session']")).toBeNull();
    expect(button(region, "Create with a passkey")).toBeDefined();
  });
});

describe("mountSetup: creating the account", () => {
  it("creates it with the token, stores the password, and opens the app", async () => {
    const { region, fake, went } = mount(undefined, {
      token: { help: "Run setup-token.", value: "tok-1" },
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("setupPassword")[0]?.args[0]).toEqual({
      token: "tok-1",
      username: "mika",
      password: "lantern harbour quietly",
    });
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "mika",
      "lantern harbour quietly",
    ]);
  });

  it("names each empty field and sends nothing", async () => {
    const { region, fake } = mount(undefined, withToken);
    await drawn(region);
    await userEvent.click(button(region, "Create account"));
    expect(errorOf(region, "token")).toBe("Enter the setup token.");
    expect(errorOf(region, "username")).toBe("Enter a username.");
    expect(errorOf(region, "password")).toBe("Enter a password.");
    expect(fake.named("setupPassword")).toHaveLength(0);
  });

  it("runs each write under its action name", async () => {
    const names: AccountAction[] = [];
    const { region } = mount(undefined, {
      run: (name, work) => {
        names.push(name);
        return work();
      },
      onDone: () => undefined,
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(names).toEqual(["auth.setup"]);
    });
  });

  const fieldCases: readonly [string, Refusal, string, string][] = [
    [
      "a missing token",
      refuse(400, "auth_setup_token_required"),
      "token",
      "Enter the setup token.",
    ],
    [
      "a token that does not work",
      refuse(401, "auth_token_invalid"),
      "token",
      "That setup token does not work. Make a new one with the command above.",
    ],
    [
      "a username with a space",
      refuse(400, "auth_username_invalid", "disallowed_character"),
      "username",
      "Usernames have no spaces.",
    ],
    [
      "a common password",
      refuse(400, "auth_password_rejected", "common"),
      "password",
      "That password is too common. Choose another.",
    ],
    [
      "a breached password",
      refuse(400, "auth_password_rejected", "breached"),
      "password",
      "That password has appeared in a data breach. Choose another.",
    ],
    [
      "a password holding the username",
      refuse(400, "auth_password_rejected", "contains_username"),
      "password",
      "Leave your username out of the password.",
    ],
    [
      "a short password, with the answer's bounds",
      {
        ok: false,
        status: 400,
        error: "access: password must be at least 12 characters Length: 12 to 64 characters.",
        code: "auth_password_rejected",
        body: { code: "auth_password_rejected", reason: "too_short" },
      },
      "password",
      "Use 12 to 64 characters.",
    ],
    [
      "a long password with no bounds",
      refuse(400, "auth_password_rejected", "too_long"),
      "password",
      "Use 15 to 128 characters.",
    ],
  ];
  for (const [what, answer, name, words] of fieldCases) {
    it(`shows ${what} on its field and keeps every value`, async () => {
      const fake = new Fake().answer("state", ok(SETUP)).answer("setupPassword", answer);
      const { region } = mount(fake, { token: { help: "Run setup-token.", value: "tok-1" } });
      await drawn(region);
      await create(region);
      await vi.waitFor(() => {
        expect(errorOf(region, name)).toBe(words);
      });
      expect(input(region, "token").value).toBe("tok-1");
      expect(input(region, "username").value).toBe("mika");
      expect(input(region, "password").value).toBe("lantern harbour quietly");
    });
  }

  it("says a token answer in a notice when the app asks for no token field", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupPassword", refuse(400, "auth_setup_token_required"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)?.textContent).toBe("Enter the setup token.");
    });
  });

  it("words a missing token by the page's address when the app passes a function", async () => {
    const pages: PageHost[] = [];
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupPassword", refuse(400, "auth_setup_token_required"));
    const { region } = mount(fake, {
      ...withToken,
      words: {
        auth_setup_token_required: (page) => {
          pages.push(page);
          return page.ipOrLocalhost
            ? "The setup token is in the container log."
            : `You opened it at ${page.hostname}.`;
        },
      },
    });
    await drawn(region);
    await userEvent.fill(input(region, "token"), "tok-1");
    await create(region);
    await vi.waitFor(() => {
      expect(errorOf(region, "token")).toBe("The setup token is in the container log.");
    });
    expect(pages).toEqual([{ hostname: location.hostname, ipOrLocalhost: true }]);
  });

  const noticeCases: readonly [string, Refusal, string, string][] = [
    [
      "the breach check not answering",
      refuse(503, "auth_breach_check_unavailable"),
      "warning",
      "The password check is not answering. Try again in a moment. Your password can stay as it is.",
    ],
    [
      "no second factor the account could set up",
      refuse(403, "auth_forbidden", "no_usable_method"),
      "danger",
      "This app allows no second factor this account can set up. Ask an administrator.",
    ],
  ];
  for (const [what, answer, tone, words] of noticeCases) {
    it(`says ${what}`, async () => {
      const fake = new Fake().answer("state", ok(SETUP)).answer("setupPassword", answer);
      const { region } = mount(fake);
      await drawn(region);
      await create(region);
      await vi.waitFor(() => {
        expect(noticeOf(region)?.textContent).toBe(words);
      });
      expect(noticeOf(region)?.dataset["tone"]).toBe(tone);
    });
  }

  it("goes to sign-in when another tab finished setup meanwhile", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupPassword", refuse(409, "auth_setup_complete"));
    const { region, went } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(went).toEqual(["/sign-in?arrived=setup-complete"]);
    });
  });

  it("offers Retry on a failure with no field, which sends the same values again", async () => {
    const fake = new Fake().answer("state", ok(SETUP)).answer("setupPassword", noAnswer);
    const { region, went } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)?.textContent).toContain("The app is not answering.");
    });
    await userEvent.click(button(region, "Retry"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("setupPassword")).toHaveLength(2);
  });

  it("holds the buttons through a rate limit's wait", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer(
        "setupPassword",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "42" }),
      );
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)?.textContent).toBe("Too many attempts. Try again in 0:42.");
    });
    expect(button(region, "Create account").getAttribute("aria-disabled")).toBe("true");
    expect(button(region, "Create with a passkey").getAttribute("aria-disabled")).toBe("true");
    // A held button stays pressable, so the press goes past the browser's
    // own disabled checks to the screen's.
    (region.querySelector("form") as HTMLFormElement).requestSubmit();
    button(region, "Create with a passkey").click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.named("setupPassword")).toHaveLength(1);
    expect(fake.named("setupWithPasskey")).toHaveLength(0);
  });

  it("draws the HTTPS state when the transport changed under the form", async () => {
    const fake = new Fake()
      .answer(
        "state",
        ok(SETUP),
        ok({
          ...SETUP,
          secure: false,
          password_login: false,
          https_required: ["password", "setup"],
        }),
      )
      .answer("setupPassword", refuse(403, "auth_https_required"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(region.querySelector(".cp-empty")?.textContent).toContain("This app needs HTTPS.");
    });
  });
});

describe("mountSetup: with a passkey", () => {
  it("creates the account with a passkey and the username alone", async () => {
    const { region, fake, went } = mount(undefined, {
      token: { help: "Run setup-token.", value: "tok-1" },
    });
    await drawn(region);
    await userEvent.fill(input(region, "username"), "mika");
    await userEvent.click(button(region, "Create with a passkey"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("setupWithPasskey")[0]?.args[1]).toEqual({
      token: "tok-1",
      username: "mika",
    });
    expect(fake.named("setupPassword")).toHaveLength(0);
  });

  it("asks for the username first, and not for a password", async () => {
    const { region, fake } = mount();
    await drawn(region);
    await userEvent.click(button(region, "Create with a passkey"));
    expect(errorOf(region, "username")).toBe("Enter a username.");
    expect(input(region, "password").hasAttribute("aria-invalid")).toBe(false);
    expect(fake.named("setupWithPasskey")).toHaveLength(0);
  });

  const outcomes: readonly [string, unknown, string | null][] = [
    ["a closed prompt", { kind: "cancelled" }, null],
    [
      "a prompt that ran out of time",
      { kind: "timeout" },
      "The passkey request ran out of time. Try again.",
    ],
    [
      "a refused origin",
      { kind: "failed", error: "SecurityError" },
      "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
    ],
    [
      "a token the server refused",
      { kind: "failed", error: refuse(401, "auth_token_invalid") },
      "That setup token does not work. Make a new one with the command above.",
    ],
  ];
  for (const [what, outcome, words] of outcomes) {
    it(`shows ${what}`, async () => {
      const fake = new Fake().answer("state", ok(SETUP)).answer("setupWithPasskey", outcome);
      const { region } = mount(fake);
      await drawn(region);
      await userEvent.fill(input(region, "username"), "mika");
      await userEvent.click(button(region, "Create with a passkey"));
      await vi.waitFor(() => {
        expect(fake.named("setupWithPasskey")).toHaveLength(1);
      });
      if (words === null) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(noticeOf(region)).toBeNull();
      } else {
        await vi.waitFor(() => {
          expect(noticeOf(region)?.textContent).toBe(words);
        });
      }
    });
  }
});

describe("mountSetup: the passkey offer", () => {
  const offering = { offerPasskey: () => true };

  it("asks the host's gate, then offers Add a passkey and Skip in the same region", async () => {
    const { region, went } = mount(undefined, offering);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    expect(region.querySelector("form")).toBeNull();
    expect(region.querySelector("h1")?.textContent).toBe("Set up Release tracker");
    expect(noticeOf(region)?.textContent).toBe("Your account is ready.");
    expect(button(region, "Add a passkey").dataset["variant"]).toBe("primary");
    expect(document.activeElement).toBe(button(region, "Add a passkey"));
    expect(went).toEqual([]);
    await userEvent.click(button(region, "Skip"));
    expect(went).toEqual(["/"]);
  });

  it("goes straight on when the gate says no", async () => {
    const { region, went } = mount(undefined, { offerPasskey: () => Promise.resolve(false) });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
  });

  it("registers the passkey under its action name, then goes on", async () => {
    const names: AccountAction[] = [];
    const { region, fake, went } = mount(undefined, {
      ...offering,
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    await userEvent.click(button(region, "Add a passkey"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("registerPasskey")).toHaveLength(1);
    expect(names).toEqual(["auth.setup", "auth.passkey_add"]);
  });

  const outcomes: readonly [string, unknown, string][] = [
    [
      "a refused origin, keeping Skip",
      { kind: "failed", error: refuse(403, "auth_origin_refused") },
      "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
    ],
    ["a passkey already there", { kind: "duplicate" }, "That passkey is already on your account."],
    [
      "an authenticator that keeps no passkey",
      { kind: "not-discoverable" },
      "That authenticator cannot keep a passkey for this app. Try another one.",
    ],
    [
      "a server failure",
      { kind: "failed", error: refuse(503, "auth_unavailable") },
      "Sign-in is unavailable right now. Try again in a few seconds.",
    ],
  ];
  for (const [what, outcome, words] of outcomes) {
    it(`shows ${what}`, async () => {
      const fake = new Fake().answer("state", ok(SETUP)).answer("registerPasskey", outcome);
      const { region, went } = mount(fake, offering);
      await drawn(region);
      await create(region);
      await vi.waitFor(() => {
        expect(button(region, "Add a passkey")).toBeDefined();
      });
      await userEvent.click(button(region, "Add a passkey"));
      await vi.waitFor(() => {
        expect(noticeOf(region)?.textContent).toBe(words);
      });
      expect(went).toEqual([]);
      expect(button(region, "Skip")).toBeDefined();
    });
  }
});

describe("pageHost", () => {
  const cases: readonly [string, boolean][] = [
    ["localhost", true],
    ["127.0.0.1", true],
    ["192.168.1.20", true],
    ["[::1]", true],
    ["[fd00::2]", true],
    ["nas.lan", false],
    ["tracker.example", false],
    ["app.localhost", false],
    ["10.0.0.1.nip.io", false],
    ["1.2.3", false],
  ];
  for (const [hostname, ipOrLocalhost] of cases) {
    it(`reads ${hostname} as ${ipOrLocalhost ? "an address" : "a name"}`, () => {
      expect(pageHost(hostname)).toEqual({ hostname, ipOrLocalhost });
    });
  }
});
