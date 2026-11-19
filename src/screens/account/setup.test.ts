import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { Refusal, StateResponse } from "./client.js";
import type { AccountAction } from "./run.js";
import { mountSetup, type SetupOptions } from "./setup.js";
import { Fake, noAnswer, ok, refuse, signedIn, type FakeClient } from "./test-helpers/fake.js";
import { dialogOf } from "./test-helpers/security.js";
import { pageHost, type PageHost } from "./words.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

beforeEach(async () => {
  // Dialogs close without their exit glide, so a test reading what follows
  // a recovery code's dialog waits on no animation frames.
  const real = matchMedia.bind(window);
  vi.stubGlobal("matchMedia", (q: string) =>
    real(q.includes("prefers-reduced-motion: reduce") ? "all" : q),
  );
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
  vi.unstubAllGlobals();
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
  secure: true,
  https_required: [],
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
      "a short password, with access's own bounds before the state sends them",
      refuse(400, "auth_password_rejected", "too_short"),
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

  it("draws the newest state when two re-reads answer out of order", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = new Fake()
      .answer(
        "state",
        ok(SETUP),
        () => late.promise,
        ok({
          ...SETUP,
          secure: false,
          password_login: false,
          https_required: ["password", "setup"],
        }),
      )
      .always("setupPassword", refuse(403, "auth_https_required"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(fake.named("state")).toHaveLength(2);
    });
    (region.querySelector("form") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => {
      expect(region.querySelector(".cp-empty")?.textContent).toContain("This app needs HTTPS.");
    });
    late.resolve(ok(SETUP));
    // The older read settles on microtasks; a task tick lets it draw.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(region.querySelector(".cp-empty")?.textContent).toContain("This app needs HTTPS.");
    expect(region.querySelector("form")).toBeNull();
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

/** Checks "I saved my recovery code" in the open recovery-code dialog and
 *  presses Continue, answering the code it showed. */
async function savedCode(): Promise<string | null | undefined> {
  const shown = await dialogOf("Your recovery code");
  const code = shown.querySelector(".cp-code code")?.textContent;
  await userEvent.click(shown.querySelector("input[type='checkbox']") as HTMLInputElement);
  await userEvent.click(button(shown, "Continue"));
  return code;
}

describe("mountSetup: the recovery code after the passkey offer", () => {
  it("shows the code the passkey issued once, then goes on", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("registerPasskey", { kind: "registered", recovery_code: "M9XRTB4HNW6P7KQ2" });
    const { region, went } = mount(fake, { offerPasskey: () => true });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    await userEvent.click(button(region, "Add a passkey"));
    await dialogOf("Your recovery code");
    expect(went).toEqual([]);
    expect(await savedCode()).toBe("M9XR-TB4H-NW6P-7KQ2");
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
  });
});

describe("mountSetup: the passkey offer, skipped", () => {
  it("goes on once when a passkey answers after Skip, still showing its recovery code", async () => {
    const fake = new Fake().answer("state", ok(SETUP)).answer("registerPasskey", {
      kind: "registered",
      recovery_code: "M9XRTB4HNW6P7KQ2",
    });
    const release = fake.hold("registerPasskey");
    let done = 0;
    const { region } = mount(fake, {
      offerPasskey: () => true,
      onDone: () => {
        done += 1;
      },
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    await userEvent.click(button(region, "Add a passkey"));
    // Pressed at once: Add a passkey's busy words move Skip under a pointer.
    button(region, "Skip").click();
    expect(done).toBe(1);
    release();
    expect(await savedCode()).toBe("M9XR-TB4H-NW6P-7KQ2");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(done).toBe(1);
  });

  it("says nothing of a passkey that failed after Skip", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("registerPasskey", { kind: "verification-failed" });
    const release = fake.hold("registerPasskey");
    let done = 0;
    const { region } = mount(fake, {
      offerPasskey: () => true,
      onDone: () => {
        done += 1;
      },
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    await userEvent.click(button(region, "Add a passkey"));
    // Pressed at once: Add a passkey's busy words move Skip under a pointer.
    button(region, "Skip").click();
    expect(done).toBe(1);
    release();
    // Past the 400 ms a confirm cycle's shown busy state holds an answer.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(noticeOf(region)?.textContent ?? "").not.toContain("passkey");
    expect(done).toBe(1);
  });
});

describe("mountSetup: a second factor first", () => {
  const enrol = ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp", "passkey"] } });

  it("continues into the sign-in's own enrolment, and keeps the password once it finishes", async () => {
    const names: AccountAction[] = [];
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupPassword", enrol)
      .answer("pendingTOTPBegin", ok({ uri: "otpauth://totp/x?secret=JBSWY3DP", text: "JBSWY3DP" }))
      .answer(
        "pendingTOTPFinish",
        ok({ signed_in: { ...signedIn, recovery_code: "WXYZ2345EFGH6789" } }),
      );
    const { region, went } = mount(fake, {
      offerPasskey: () => true,
      run: (name, work) => {
        names.push(name);
        return work();
      },
    });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(region.querySelector("h2")?.textContent).toBe("Set up a second factor");
    });
    expect(region.querySelector("h1")?.textContent).toBe("Set up Release tracker");
    expect(button(region, "Register a passkey")).toBeDefined();
    await vi.waitFor(() => {
      expect(region.querySelector("svg.cp-qr")).not.toBeNull();
    });
    expect(fake.named("pendingTOTPBegin")[0]?.args).toEqual([{ ticket: "t1" }]);
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
    await userEvent.fill(input(region, "code"), "123456");
    await userEvent.click(button(region, "Turn on"));
    expect(await savedCode()).toBe("WXYZ-2345-EFGH-6789");
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("pendingTOTPFinish")[0]?.args).toEqual(["t1", "123456"]);
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "mika",
      "lantern harbour quietly",
    ]);
    expect(button(region, "Add a passkey")).toBeUndefined();
    expect(names).toEqual(["auth.setup", "auth.enrol_totp", "auth.enrol_totp"]);
  });

  it("sends nothing from the code once a passkey finished the enrolment", async () => {
    const fake = new Fake().answer("state", ok(SETUP)).answer("setupPassword", enrol);
    const { region, went } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(input(region, "code")).not.toBeNull();
    });
    await userEvent.click(button(region, "Register a passkey"));
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    await userEvent.fill(input(region, "code"), "123456");
    await userEvent.click(button(region, "Turn on"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fake.named("pendingTOTPFinish")).toHaveLength(0);
    expect(went).toEqual(["/"]);
  });

  it("hands on once when the code answers after a passkey finished the enrolment", async () => {
    const fake = new Fake().answer("state", ok(SETUP)).answer("setupPassword", enrol);
    const { region, went } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(input(region, "code")).not.toBeNull();
    });
    const release = fake.hold("pendingTOTPFinish");
    await userEvent.fill(input(region, "code"), "123456");
    await userEvent.click(button(region, "Turn on"));
    // Pressed at once: Turn on's busy words can move it under a pointer.
    button(region, "Register a passkey").click();
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    release();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fake.named("pendingTOTPFinish")).toHaveLength(1);
    expect(went).toEqual(["/"]);
  });

  it("goes back to the form with the token when the person starts again", async () => {
    const fake = new Fake().always("state", ok(SETUP)).answer("setupPassword", enrol);
    const { region } = mount(fake, { token: { help: "Run setup-token.", value: "tok-1" } });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Start again")).toBeDefined();
    });
    await userEvent.click(button(region, "Start again"));
    await vi.waitFor(() => {
      expect(input(region, "token").value).toBe("tok-1");
    });
    expect(input(region, "password")).not.toBeNull();
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
  });

  it("takes the sign-in an enrolment completed after the person started again", async () => {
    const fake = new Fake()
      .always("state", ok(SETUP))
      .answer(
        "setupPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["passkey"] } }),
      )
      .answer("pendingPasskey", { kind: "answered", result: { signed_in: signedIn } });
    const release = fake.hold("pendingPasskey");
    const { region, went } = mount(fake);
    await drawn(region);
    await create(region);
    const register = await vi.waitFor(() => {
      const b = button(region, "Register a passkey");
      expect(b).toBeDefined();
      return b;
    });
    await userEvent.click(register);
    await userEvent.click(button(region, "Start again"));
    await vi.waitFor(() => {
      expect(input(region, "password")).not.toBeNull();
    });
    expect(went).toEqual([]);
    release();
    await vi.waitFor(() => {
      expect(went).toEqual(["/"]);
    });
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "mika",
      "lantern harbour quietly",
    ]);
    // Handed on once: the form drawn again sends nothing.
    await create(region);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fake.named("setupPassword")).toHaveLength(1);
    expect(went).toEqual(["/"]);
  });

  it("shows no failure of the authenticator key's read once the person started again", async () => {
    const fake = new Fake()
      .always("state", ok(SETUP))
      .answer("setupPassword", enrol)
      .answer("pendingTOTPBegin", refuse(503, "auth_unavailable"));
    const release = fake.hold("pendingTOTPBegin");
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Start again")).toBeDefined();
    });
    await userEvent.click(button(region, "Start again"));
    await vi.waitFor(() => {
      expect(input(region, "password")).not.toBeNull();
    });
    const password = input(region, "password");
    release();
    // Past the 400 ms a confirm cycle's shown busy state holds an answer.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(noticeOf(region)).toBeNull();
    expect(input(region, "password")).toBe(password);
  });

  it("says over the form that the setup timed out when the ticket lapsed", async () => {
    const fake = new Fake()
      .always("state", ok(SETUP))
      .answer("setupPassword", enrol)
      .answer("pendingTOTPBegin", refuse(401, "auth_token_invalid"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)?.textContent).toBe("This sign-in timed out. Start again.");
    });
    expect(input(region, "password")).not.toBeNull();
  });

  it("leaves no step behind when the read after a lapsed ticket is refused, and Retry says why", async () => {
    const fake = new Fake()
      .always("state", ok(SETUP))
      .answer("setupPassword", enrol)
      .answer("pendingTOTPBegin", ok({ uri: "otpauth://totp/x?secret=JBSWY3DP", text: "JBSWY3DP" }))
      .answer("pendingTOTPFinish", refuse(401, "auth_token_invalid"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(input(region, "code")).not.toBeNull();
    });
    fake.answer("state", refuse(503, "auth_unavailable"));
    await userEvent.fill(input(region, "code"), "123456");
    await userEvent.click(button(region, "Turn on"));
    await vi.waitFor(() => {
      expect(button(region, "Retry")).toBeDefined();
    });
    expect(input(region, "code")).toBeNull();
    expect(button(region, "Register a passkey")).toBeUndefined();
    expect(button(region, "Start again")).toBeUndefined();
    expect(noticeOf(region)?.querySelector("[data-part='body']")?.textContent).toBe(
      "This sign-in timed out. Start again. Sign-in is unavailable right now. Try again in a few seconds.",
    );
    await userEvent.click(button(region, "Retry"));
    await vi.waitFor(() => {
      expect(input(region, "password")).not.toBeNull();
    });
    expect(noticeOf(region)?.textContent).toBe("This sign-in timed out. Start again.");
  });
});

describe("mountSetup: the password's bounds", () => {
  const bounded = ok({ ...SETUP, password_length: { min: 12, max: 64 } });

  it("words the limit from the app's state, and sends only a password inside it", async () => {
    const fake = new Fake().answer("state", bounded);
    const { region } = mount(fake);
    await drawn(region);
    const help = document.getElementById(
      input(region, "password").getAttribute("aria-describedby") ?? "",
    );
    expect(help?.textContent).toBe("12 to 64 characters. A few unrelated words make a strong one.");
    // Eleven characters, 22 code units: access counts characters.
    await fillIn(region, "🔑".repeat(11));
    await userEvent.click(button(region, "Create account"));
    expect(errorOf(region, "password")).toBe("Use 12 to 64 characters.");
    await fillIn(region, "x".repeat(65));
    await userEvent.click(button(region, "Create account"));
    expect(errorOf(region, "password")).toBe("Use 12 to 64 characters.");
    expect(fake.named("setupPassword")).toHaveLength(0);
    // Twelve characters once composed, as access normalises it.
    const composed = "e\u0301".repeat(12);
    await fillIn(region, composed);
    await userEvent.click(button(region, "Create account"));
    await vi.waitFor(() => {
      expect(fake.named("setupPassword")).toHaveLength(1);
    });
    expect(fake.named("setupPassword")[0]?.args[0]).toMatchObject({ password: composed });
  });

  it("words the server's length refusal with the state's bounds", async () => {
    const fake = new Fake()
      .answer("state", bounded)
      .answer("setupPassword", refuse(400, "auth_password_rejected", "too_short"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(errorOf(region, "password")).toBe("Use 12 to 64 characters.");
    });
  });

  it("marks a password outside the bounds once the person leaves the field", async () => {
    const { region } = mount();
    await drawn(region);
    await userEvent.fill(input(region, "password"), "short");
    await userEvent.tab();
    expect(errorOf(region, "password")).toBe("Use 15 to 128 characters.");
    await userEvent.type(input(region, "password"), " and longer now");
    expect(input(region, "password").getAttribute("aria-invalid")).not.toBe("true");
  });
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

describe("mountSetup: a re-read refused once the form is drawn", () => {
  it("keeps the form and its values under the notice, and Retry draws it again", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP), refuse(503, "auth_unavailable"), ok(SETUP))
      .answer("setupPassword", refuse(403, "auth_https_required"));
    const { region } = mount(fake);
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)?.querySelector("[data-cp-action='retry']")).not.toBeNull();
    });
    expect(region.querySelector("form")).not.toBeNull();
    expect(input(region, "username").value).toBe("mika");
    await userEvent.click(
      noticeOf(region)!.querySelector<HTMLElement>("[data-cp-action='retry']")!,
    );
    await vi.waitFor(() => {
      expect(fake.named("state")).toHaveLength(3);
      expect(noticeOf(region)).toBeNull();
    });
    expect(region.querySelector("form")).not.toBeNull();
  });
});

describe("mountSetup: once one way made the account", () => {
  const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 600));
  const counted = (): { done: number[]; options: Options } => {
    const done = [0, 0];
    return {
      done,
      options: {
        onDone: () => {
          done[0] = (done[0] ?? 0) + 1;
        },
        onSetupComplete: () => {
          done[1] = (done[1] ?? 0) + 1;
        },
      },
    };
  };

  it("draws no passkey offer the host's gate answers after a passkey made the account", async () => {
    const gate = Promise.withResolvers<boolean>();
    const fake = new Fake().answer("state", ok(SETUP));
    const releasePassword = fake.hold("setupPassword");
    const { done, options } = counted();
    const { region } = mount(fake, { ...options, offerPasskey: () => gate.promise });
    await drawn(region);
    await create(region);
    button(region, "Create with a passkey").click();
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
    releasePassword();
    await later();
    gate.resolve(true);
    await later();
    expect(button(region, "Add a passkey")).toBeUndefined();
    expect(fake.named("registerPasskey")).toHaveLength(0);
    expect(done).toEqual([1, 0]);
  });

  it("offers no passkey once a passkey made the account while the gate was asked", async () => {
    const gate = Promise.withResolvers<boolean>();
    const fake = new Fake().answer("state", ok(SETUP));
    const releasePasskey = fake.hold("setupWithPasskey");
    const { done, options } = counted();
    const { region } = mount(fake, { ...options, offerPasskey: () => gate.promise });
    await drawn(region);
    await fillIn(region);
    await userEvent.click(button(region, "Create with a passkey"));
    await userEvent.click(button(region, "Create account"));
    await vi.waitFor(() => {
      expect(fake.named("setupPassword")).toHaveLength(1);
    });
    await later();
    releasePasskey();
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
    gate.resolve(true);
    await later();
    expect(button(region, "Add a passkey")).toBeUndefined();
    expect(done).toEqual([1, 0]);
  });

  it("says nothing of a passkey setup found complete after the password made the account", async () => {
    const gate = Promise.withResolvers<boolean>();
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupWithPasskey", { kind: "failed", error: refuse(409, "auth_setup_complete") });
    const releasePasskey = fake.hold("setupWithPasskey");
    const { done, options } = counted();
    const { region } = mount(fake, { ...options, offerPasskey: () => gate.promise });
    await drawn(region);
    await fillIn(region);
    await userEvent.click(button(region, "Create with a passkey"));
    await userEvent.click(button(region, "Create account"));
    await vi.waitFor(() => {
      expect(fake.named("setupPassword")).toHaveLength(1);
    });
    await later();
    releasePasskey();
    await later();
    gate.resolve(true);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    expect(noticeOf(region)?.textContent).toBe("Your account is ready.");
    expect(done).toEqual([0, 0]);
  });

  it("adds no passkey once Skip handed on", async () => {
    const { done, options } = counted();
    const { region, fake } = mount(undefined, { ...options, offerPasskey: () => true });
    await drawn(region);
    await create(region);
    await vi.waitFor(() => {
      expect(button(region, "Add a passkey")).toBeDefined();
    });
    const add = button(region, "Add a passkey");
    button(region, "Skip").click();
    expect(done).toEqual([1, 0]);
    add.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.named("registerPasskey")).toHaveLength(0);
    expect(done).toEqual([1, 0]);
  });

  it("draws no refusal of the password once a passkey made the account", async () => {
    const answer = Promise.withResolvers<unknown>();
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupPassword", () => answer.promise);
    const { done, options } = counted();
    const { region } = mount(fake, options);
    await drawn(region);
    await create(region);
    await userEvent.click(button(region, "Create with a passkey"));
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
    answer.resolve(refuse(400, "auth_username_invalid"));
    await later();
    expect(noticeOf(region)).toBeNull();
    expect(input(region, "username").hasAttribute("aria-invalid")).toBe(false);
  });

  it("draws no miss of the passkey once the password made the account", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer("setupWithPasskey", { kind: "verification-failed" });
    const releasePasskey = fake.hold("setupWithPasskey");
    const { done, options } = counted();
    const { region } = mount(fake, options);
    await drawn(region);
    await fillIn(region);
    await userEvent.click(button(region, "Create with a passkey"));
    await userEvent.click(button(region, "Create account"));
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
    releasePasskey();
    await later();
    expect(noticeOf(region)).toBeNull();
  });

  it("ends the rate-limit wait without saying setup is open again", async () => {
    const fake = new Fake()
      .answer("state", ok(SETUP))
      .answer(
        "setupPassword",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
      );
    const releasePasskey = fake.hold("setupWithPasskey");
    const { done, options } = counted();
    const { region } = mount(fake, options);
    await drawn(region);
    await fillIn(region);
    await userEvent.click(button(region, "Create with a passkey"));
    await userEvent.click(button(region, "Create account"));
    await vi.waitFor(() => {
      expect(noticeOf(region)?.textContent).toBe("Too many attempts. Try again in 0:30.");
    });
    releasePasskey();
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
    expect(noticeOf(region)).toBeNull();
  });

  it("sends nothing from the form drawn again while the browser keeps the password", async () => {
    const fake = new Fake()
      .always("state", ok(SETUP))
      .answer(
        "setupPassword",
        ok({ pending: { ticket: "t1", next: "enrol", methods: ["passkey"] } }),
      );
    const releaseEnrol = fake.hold("pendingPasskey");
    const { done, options } = counted();
    const { region } = mount(fake, options);
    await drawn(region);
    await create(region);
    await userEvent.click(button(region, "Register a passkey"));
    await userEvent.click(button(region, "Start again"));
    await vi.waitFor(() => {
      expect(input(region, "password")).not.toBeNull();
    });
    const releaseStore = fake.hold("storePasswordCredential");
    releaseEnrol();
    await later();
    expect(done).toEqual([0, 0]);
    await create(region);
    await later();
    expect(fake.named("setupPassword")).toHaveLength(1);
    releaseStore();
    await vi.waitFor(() => {
      expect(done).toEqual([1, 0]);
    });
  });
});
