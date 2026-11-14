import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { accountRunner, type DefineAction } from "./run.js";
import { mountSignIn, type SignInOptions } from "./sign-in.js";
import { Fake, noAnswer, ok, refuse, signedIn, type FakeClient } from "./test-helpers/fake.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The glyphs and the hidden summary need the stylesheet, as an app's page
// links it.
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

afterEach(async () => {
  life.abort();
  life = new AbortController();
  sheet.remove();
  document.documentElement.classList.remove("cp");
  document.body.replaceChildren();
  await page.viewport(1280, 720);
});

type Options = Omit<SignInOptions<FakeClient>, "client" | "access">;

function mount(fake = new Fake(), options: Options = {}): { panel: HTMLElement; fake: Fake } {
  const panel = document.createElement("section");
  panel.className = "cp-panel";
  document.body.append(panel);
  mountSignIn(panel, {
    client: fake.client,
    access: fake.access(),
    navigate: () => undefined,
    search: "",
    signal: life.signal,
    ...options,
  });
  return { panel, fake };
}

const drawn = (panel: HTMLElement): Promise<void> =>
  vi.waitFor(() => {
    expect(panel.getAttribute("aria-busy")).toBeNull();
  });

const noticeOf = (panel: HTMLElement): HTMLElement | null =>
  panel.querySelector<HTMLElement>("[data-part='notice'] > .cp-notice");

const input = (panel: HTMLElement, name: string): HTMLInputElement =>
  panel.querySelector<HTMLInputElement>(`input[name='${name}']`) as HTMLInputElement;

const submit = (panel: HTMLElement): HTMLButtonElement =>
  panel.querySelector<HTMLButtonElement>("button[type='submit']") as HTMLButtonElement;

const button = (panel: HTMLElement, text: string): HTMLElement =>
  [...panel.querySelectorAll<HTMLElement>("button, a")].find((b) =>
    b.textContent.includes(text),
  ) as HTMLElement;

async function signIn(
  panel: HTMLElement,
  username = "mika",
  password = "lantern harbour",
): Promise<void> {
  await userEvent.fill(input(panel, "username"), username);
  await userEvent.fill(input(panel, "password"), password);
  await userEvent.click(submit(panel));
}

/** Waits on real time until `check` holds. */
async function settled(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(check()).toBe(true);
}

const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`body > [data-cp-live-regions] [data-cp-politeness='${politeness}']`)
    ?.textContent ?? "";

describe("mountSignIn: the panel", () => {
  it("holds the heading, the password form, a rule, the passkey and single sign-on, and the hint, in order", async () => {
    const { panel } = mount(new Fake(), { provider: "Authelia", search: "?next=/feed" });
    await drawn(panel);
    const title = panel.querySelector("h1");
    expect(title?.textContent).toBe("Sign in");
    expect(panel.getAttribute("aria-labelledby")).toBe(title?.id);
    const user = input(panel, "username");
    expect(user.getAttribute("autocomplete")).toBe("username");
    expect(user.getAttribute("autocapitalize")).toBe("none");
    expect(user.spellcheck).toBe(false);
    expect(input(panel, "password").getAttribute("autocomplete")).toBe("current-password");
    expect(input(panel, "password").type).toBe("password");
    expect(submit(panel).dataset["variant"]).toBe("primary");
    const order = [...panel.querySelectorAll("h1, form, hr, button:not([type='submit']), a, p")]
      .filter((n) => n.closest(".cp-input-wrap") === null)
      .map(
        (n) =>
          n.tagName.toLowerCase() + (n.textContent.trim() === "" ? "" : `:${n.textContent.trim()}`),
      );
    expect(order).toEqual([
      "h1:Sign in",
      expect.stringMatching(/^form/),
      "hr",
      "button:Sign in with a passkey",
      "a:Continue with Authelia",
      "p:Lost access? Ask an admin for a recovery link.",
    ]);
    const link = button(panel, "Continue with") as HTMLAnchorElement;
    expect(new URL(link.href).pathname).toBe("/api/auth/oidc/start/signin");
    expect(new URL(link.href).searchParams.get("redirect")).toBe("/feed");
    expect(panel.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("draws its glyphs from the system's icon list, with no rule of its own", async () => {
    const { panel } = mount();
    await drawn(panel);
    const image = (icon: Element): string =>
      getComputedStyle(icon).getPropertyValue("--cp-icon-image");
    const key = panel.querySelector(".cp-icon[data-cp-icon='key-round']") as Element;
    const eye = panel.querySelector(".cp-icon[data-cp-icon='eye']") as Element;
    const outside = key.cloneNode() as Element;
    document.body.append(outside);
    expect(image(key)).toMatch(/^url\(/);
    expect(image(eye)).toMatch(/^url\(/);
    expect(image(eye)).not.toBe(image(key));
    expect(image(outside)).toBe(image(key));
  });

  it("shows a method only while the state and the mounted parts both have it", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ setup_required: false, password_login: true, passkeys: true, oidc: true }),
    );
    const { panel } = mount(fake, { parts: ["password", "single-sign-on"] });
    await drawn(panel);
    expect(panel.querySelector("form")).not.toBeNull();
    expect(button(panel, "passkey")).toBeUndefined();
    expect(button(panel, "Continue with")).toBeDefined();
  });

  it("makes the only method the primary when password sign-in is off, and draws no rule", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ setup_required: false, password_login: false, passkeys: true, oidc: false }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    expect(panel.querySelector("hr")).toBeNull();
    expect(button(panel, "Sign in with a passkey").dataset["variant"]).toBe("primary");
  });

  it("makes no primary of two methods without a password", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ setup_required: false, password_login: false, passkeys: true, oidc: true }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("[data-variant='primary']")).toBeNull();
  });

  it("leaves the passkey out where the browser runs no ceremony", async () => {
    const fake = new Fake().answer("passkeySupport", { webauthn: false, conditional: false });
    const { panel } = mount(fake);
    await drawn(panel);
    expect(button(panel, "passkey")).toBeUndefined();
  });

  it("says sign-in is off when no method is on", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ setup_required: false, password_login: false, passkeys: false, oidc: false }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("form, button, a")).toBeNull();
    expect(noticeOf(panel)?.textContent).toBe("Sign-in is turned off. Ask the app's admin.");
  });

  it("takes the host's hint as words or a node, or none, and no heading on request", async () => {
    const code = document.createElement("code");
    code.textContent = "admin reset-password";
    const { panel } = mount(new Fake(), { recoveryHint: code, heading: false });
    await drawn(panel);
    expect(panel.querySelector("h1")).toBeNull();
    expect(panel.querySelector("[data-part='hint'] > code")).toBe(code);
    const other = mount(new Fake(), { recoveryHint: false });
    await drawn(other.panel);
    expect(other.panel.querySelector("[data-part='hint']")).toBeNull();
  });

  it("uses the state the host passes, and reads none", async () => {
    const fake = new Fake();
    const { panel } = mount(fake, {
      state: { setup_required: false, password_login: true, passkeys: false, oidc: false },
    });
    await drawn(panel);
    expect(fake.named("state")).toHaveLength(0);
    expect(panel.querySelector("hr")).toBeNull();
  });

  it("shows the state read failing with Retry, which reads it again", async () => {
    const fake = new Fake().answer("state", noAnswer);
    const { panel } = mount(fake);
    await drawn(panel);
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
    expect(noticeOf(panel)?.textContent).toContain(
      "The app is not answering. Check your connection, then try again.",
    );
    await userEvent.click(button(panel, "Retry"));
    await vi.waitFor(() => {
      expect(panel.querySelector("form")).not.toBeNull();
    });
    expect(fake.named("state")).toHaveLength(2);
    expect(noticeOf(panel)).toBeNull();
  });

  it("is busy with the form's shape while a slow state read runs", async () => {
    const fake = new Fake();
    const release = fake.hold("state");
    const { panel } = mount(fake);
    await vi.waitFor(() => {
      expect(panel.querySelector(".cp-skeleton")).not.toBeNull();
    });
    expect(panel.getAttribute("aria-busy")).toBe("true");
    release();
    await drawn(panel);
    expect(panel.querySelector(".cp-skeleton")).toBeNull();
  });

  it("opens with the notice of the step that sent the person here", async () => {
    const { panel } = mount(new Fake(), { arrived: "session-ended" });
    await drawn(panel);
    expect(noticeOf(panel)?.dataset["tone"]).toBe("neutral");
    expect(noticeOf(panel)?.textContent).toBe("Your session ended. Sign in to continue.");
    const set = mount(new Fake(), { arrived: "password-set", username: "mika" });
    await drawn(set.panel);
    expect(noticeOf(set.panel)?.dataset["tone"]).toBe("success");
    expect(noticeOf(set.panel)?.textContent).toBe("Password set. Sign in with it.");
    expect(input(set.panel, "username").value).toBe("mika");
  });

  it("fits a 320px phone without a sideways scroll", async () => {
    await page.viewport(320, 640);
    const { panel } = mount(new Fake(), { provider: "Authelia" });
    await drawn(panel);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});

describe("mountSignIn: password", () => {
  it("signs in through the runner, offers the password to the browser and goes to next", async () => {
    const navigate = vi.fn<(url: string) => void>();
    const { panel, fake } = mount(new Fake(), { navigate, search: "?next=/feed%3Fpage%3D2" });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/feed?page=2");
    });
    expect(fake.named("loginPassword")[0]?.args).toEqual([
      { username: "mika", password: "lantern harbour" },
    ]);
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual(["mika", "lantern harbour"]);
  });

  it.each(["//evil.example/x", "/\\evil.example", "/\t/evil.example", "https://evil.example/"])(
    "goes home for a next of %j, which leaves the origin",
    async (next) => {
      const navigate = vi.fn<(url: string) => void>();
      const { panel } = mount(new Fake(), {
        navigate,
        search: `?${new URLSearchParams({ next }).toString()}`,
      });
      await drawn(panel);
      await signIn(panel);
      await vi.waitFor(() => {
        expect(navigate).toHaveBeenCalledWith("/");
      });
    },
  );

  it("tells the host when a passkey may have been copied", async () => {
    const onSignedIn = vi.fn();
    const fake = new Fake().answer("loginPassword", ok({ ...signedIn, clone_warning: true }));
    const { panel } = mount(fake, { onSignedIn, next: "/home" });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledWith({ next: "/home", cloneWarning: true });
    });
  });

  it("asks for an empty field on the field, sends nothing, and clears it once typed", async () => {
    const { panel, fake } = mount();
    await drawn(panel);
    await userEvent.fill(input(panel, "username"), "mika");
    await userEvent.click(submit(panel));
    const pass = input(panel, "password");
    expect(pass.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(`${pass.id}-error`)?.textContent).toBe("Enter your password.");
    expect(document.activeElement).toBe(pass);
    expect(fake.named("loginPassword")).toHaveLength(0);
    await userEvent.keyboard("x");
    expect(pass.hasAttribute("aria-invalid")).toBe(false);
  });

  it("lists two empty fields in the summary and focuses it", async () => {
    const { panel } = mount();
    await drawn(panel);
    await userEvent.click(submit(panel));
    const summary = panel.querySelector<HTMLElement>("form > .cp-notice");
    expect(summary?.hidden).toBe(false);
    expect(summary?.querySelector("strong")?.textContent).toBe("2 fields need a fix");
    expect([...(summary?.querySelectorAll("a") ?? [])].map((a) => a.textContent)).toEqual([
      "Username",
      "Password",
    ]);
    expect(document.activeElement).toBe(summary);
  });

  it("says a wrong credential without naming which, and selects the password", async () => {
    const fake = new Fake().answer("loginPassword", refuse(401, "auth_invalid_credentials"));
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("The username or password is wrong.");
    });
    const pass = input(panel, "password");
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
    expect(document.activeElement).toBe(pass);
    expect([pass.selectionStart, pass.selectionEnd]).toEqual([0, pass.value.length]);
    expect(input(panel, "username").value).toBe("mika");
    await vi.waitFor(() => {
      expect(said("assertive")).toBe("The username or password is wrong.");
    });
  });

  it("puts an invalid username's words on the field, by reason", async () => {
    const fake = new Fake().answer(
      "loginPassword",
      refuse(400, "auth_username_invalid", "disallowed_character"),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel, "mika k");
    const user = input(panel, "username");
    await vi.waitFor(() => {
      expect(user.getAttribute("aria-invalid")).toBe("true");
    });
    expect(document.getElementById(`${user.id}-error`)?.textContent).toBe(
      "Usernames have no spaces.",
    );
  });

  it("counts a rate limit down from Retry-After, holds the buttons, and says only its start and end", async () => {
    // The countdown's ticks alone run on fake time.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const fake = new Fake().answer(
        "loginPassword",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "62" }),
      );
      const { panel } = mount(fake);
      await drawn(panel);
      await userEvent.fill(input(panel, "username"), "mika");
      await userEvent.fill(input(panel, "password"), "lantern harbour");
      // From here on, no command that waits on the browser: one moves the
      // fake clock while it waits.
      const form = submit(panel).form as HTMLFormElement;
      form.requestSubmit();
      await settled(() => noticeOf(panel)?.textContent === "Too many attempts. Try again in 1:02.");
      expect(noticeOf(panel)?.dataset["tone"]).toBe("warning");
      expect(submit(panel).getAttribute("aria-disabled")).toBe("true");
      expect(button(panel, "Sign in with a passkey").getAttribute("aria-disabled")).toBe("true");
      await settled(() => said("polite") === "Too many attempts. Try again in 1:02.");
      form.requestSubmit();
      expect(fake.named("loginPassword")).toHaveLength(1);
      vi.advanceTimersByTime(3000);
      expect(noticeOf(panel)?.textContent).toBe("Too many attempts. Try again in 0:59.");
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(said("polite")).toBe("Too many attempts. Try again in 1:02.");
      vi.advanceTimersByTime(59_000);
      expect(noticeOf(panel)).toBeNull();
      expect(submit(panel).hasAttribute("aria-disabled")).toBe(false);
      await settled(() => said("polite") === "You can sign in again.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a busy server once, silently, a second later", async () => {
    const fake = new Fake().answer("loginPassword", refuse(503, "auth_busy"), ok(signedIn));
    const navigate = vi.fn<(url: string) => void>();
    const { panel } = mount(fake, { navigate });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(
      () => {
        expect(navigate).toHaveBeenCalledWith("/");
      },
      { timeout: 2500 },
    );
    expect(fake.named("loginPassword")).toHaveLength(2);
    expect(noticeOf(panel)).toBeNull();
  });

  it("says a server still busy after the retry", async () => {
    const fake = new Fake().answer(
      "loginPassword",
      refuse(503, "auth_busy"),
      refuse(503, "auth_busy"),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(
      () => {
        expect(noticeOf(panel)?.textContent).toBe("The server is busy. Try again in a moment.");
      },
      { timeout: 2500 },
    );
  });

  it.each([
    [
      refuse(503, "auth_unavailable"),
      "Sign-in is unavailable right now. Try again in a few seconds.",
    ],
    [noAnswer, "The app is not answering. Check your connection, then try again."],
    [refuse(500, "something_new"), "The server could not do this. Try again in a moment."],
    [
      { ok: false, status: 200, error: "decode", code: "auth_invalid_credentials" },
      "The server could not do this. Try again in a moment.",
    ],
  ] as const)("words a refusal that names no field: %j", async (answer, words) => {
    const fake = new Fake().answer("loginPassword", answer);
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(words);
    });
    expect(input(panel, "password").value).toBe("lantern harbour");
  });

  it("redraws without the form when password sign-in was turned off meanwhile", async () => {
    const fake = new Fake()
      .answer("loginPassword", refuse(403, "auth_password_login_disabled"))
      .answer(
        "state",
        ok({ setup_required: false, password_login: true, passkeys: true, oidc: false }),
        ok({ setup_required: false, password_login: false, passkeys: true, oidc: false }),
      );
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(panel.querySelector("form")).toBeNull();
    });
    expect(noticeOf(panel)?.textContent).toBe(
      "Password sign-in is turned off. Sign in another way.",
    );
  });

  it("shows the host's words for a code", async () => {
    const fake = new Fake().answer("loginPassword", refuse(401, "auth_invalid_credentials"));
    const { panel } = mount(fake, { words: { auth_invalid_credentials: "No match." } });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("No match.");
    });
  });

  it("shows Show on the password, with its name as a tip", async () => {
    const { panel } = mount();
    await drawn(panel);
    const reveal = panel.querySelector<HTMLButtonElement>(
      ".cp-input-wrap > button",
    ) as HTMLButtonElement;
    expect(reveal.getAttribute("aria-label")).toBe("Show password");
    expect(reveal.dataset["cpTip"]).toBe("Show password");
    await userEvent.click(reveal);
    expect(input(panel, "password").type).toBe("text");
    expect(reveal.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("mountSignIn: passkey", () => {
  it("signs in with the button's passkey", async () => {
    const navigate = vi.fn<(url: string) => void>();
    const { panel, fake } = mount(new Fake(), { navigate });
    await drawn(panel);
    await userEvent.click(button(panel, "Sign in with a passkey"));
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
    expect(fake.named("signInWithPasskey")).toHaveLength(1);
  });

  it.each([
    [{ kind: "cancelled" }, null, null],
    [{ kind: "timeout" }, "warning", "The passkey request ran out of time. Try again."],
    [{ kind: "ceremony-expired" }, "warning", "The passkey request ran out of time. Try again."],
    [
      { kind: "unknown-credential" },
      "warning",
      "That passkey is not registered here. Try another one, or sign in another way.",
    ],
    [{ kind: "verification-failed" }, "danger", "That passkey could not be checked. Try again."],
    [
      { kind: "failed", error: refuse(403, "auth_origin_refused") },
      "danger",
      "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
    ],
    [
      { kind: "failed", error: "SecurityError" },
      "danger",
      "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
    ],
    [
      { kind: "failed", error: "UnknownError" },
      "danger",
      "The passkey request did not finish. Try again, or sign in another way.",
    ],
  ] as const)("words the outcome %j", async (outcome, tone, words) => {
    const fake = new Fake().answer("signInWithPasskey", outcome);
    const { panel } = mount(fake);
    await drawn(panel);
    const press = button(panel, "Sign in with a passkey");
    await userEvent.click(press);
    await vi.waitFor(() => {
      expect(fake.named("signInWithPasskey")).toHaveLength(1);
      expect(press.hasAttribute("data-cp-state")).toBe(false);
    });
    expect(noticeOf(panel)?.dataset["tone"] ?? null).toBe(tone);
    expect(noticeOf(panel)?.textContent ?? null).toBe(words);
  });

  it("offers passkeys in the username's autofill, and ends that request before the button's own", async () => {
    const fake = new Fake().answer("passkeySupport", { webauthn: true, conditional: true });
    const pending = new Promise<never>(() => undefined);
    fake.answer("signInWithPasskey", () => pending);
    const { panel } = mount(fake);
    await drawn(panel);
    expect(input(panel, "username").getAttribute("autocomplete")).toBe("username webauthn");
    const [first] = fake.named("signInWithPasskey");
    const o = first?.args[1] as { mediation?: string; signal?: AbortSignal };
    expect(o.mediation).toBe("conditional");
    expect(o.signal?.aborted).toBe(false);
    await userEvent.click(button(panel, "Sign in with a passkey"));
    expect(o.signal?.aborted).toBe(true);
    await vi.waitFor(() => {
      expect(fake.named("signInWithPasskey")).toHaveLength(2);
    });
    expect(fake.named("signInWithPasskey")[1]?.args[1]).toBeUndefined();
  });

  it("ends the autofill request before a password submit, and signs in from the autofill's pick", async () => {
    const fake = new Fake().answer("passkeySupport", { webauthn: true, conditional: true });
    fake.answer("signInWithPasskey", () => new Promise<never>(() => undefined));
    const { panel } = mount(fake);
    await drawn(panel);
    const o = fake.named("signInWithPasskey")[0]?.args[1] as { signal?: AbortSignal };
    await signIn(panel);
    expect(o.signal?.aborted).toBe(true);

    const picked = new Fake().answer("passkeySupport", { webauthn: true, conditional: true });
    const navigate = vi.fn<(url: string) => void>();
    const other = mount(picked, { navigate });
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
    expect(other.panel.querySelector("form")).not.toBeNull();
  });
});

describe("mountSignIn: single sign-on return", () => {
  it.each([
    [
      "?auth_error=auth_oidc_failed",
      "danger",
      "Single sign-on did not finish. Try again, or sign in another way.",
    ],
    ["?auth_error=auth_rate_limited", "warning", "Too many attempts. Try again in a moment."],
    [
      "?auth_error=auth_oidc_unavailable",
      "danger",
      "Single sign-on is unavailable right now. Try again in a moment, or sign in another way.",
    ],
    [
      "?auth_error=something_new",
      "danger",
      "Single sign-on did not finish. Try again, or sign in another way.",
    ],
    [
      "?oidc=not_linked",
      "warning",
      "This Authelia identity is not linked to an account here. Sign in another way, then link it in Settings → Account.",
    ],
  ] as const)("shows %s as its notice", async (search, tone, words) => {
    const { panel } = mount(new Fake(), {
      search,
      provider: "Authelia",
      place: "Settings → Account",
      arrived: "session-ended",
    });
    await drawn(panel);
    expect(noticeOf(panel)?.dataset["tone"]).toBe(tone);
    expect(noticeOf(panel)?.textContent).toBe(words);
  });

  it("removes the outcome from the address and keeps the rest", async () => {
    const before = location.href;
    history.replaceState(null, "", "?next=/feed&auth_error=auth_oidc_failed");
    try {
      const { panel } = mount(new Fake(), { search: location.search });
      await drawn(panel);
      expect(location.search).toBe("?next=%2Ffeed");
    } finally {
      history.replaceState(null, "", before);
    }
  });
});

describe("mountSignIn: writes as actions", () => {
  it("runs each write as a sensitive action of its own name, defined once", async () => {
    const defined: { name: string; sensitive: true; error: false }[] = [];
    const define: DefineAction = (definition) => {
      defined.push(definition);
      return {
        dispatch: (work) => ({
          outcome: definition.run(work).then((value) => ({ status: "success" as const, value })),
        }),
      };
    };
    const fake = new Fake().answer("loginPassword", refuse(401, "auth_invalid_credentials"));
    const { panel } = mount(fake, { run: accountRunner(define) });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("The username or password is wrong.");
    });
    await signIn(panel);
    await vi.waitFor(() => {
      expect(fake.named("loginPassword")).toHaveLength(2);
    });
    expect(defined.map((d) => [d.name, d.sensitive, d.error])).toEqual([
      ["auth.sign_in", true, false],
    ]);
  });

  it("shows a write that ended in error as the server failing", async () => {
    const define: DefineAction = () => ({
      dispatch: () => ({ outcome: Promise.resolve({ status: "error" as const }) }),
    });
    const { panel } = mount(new Fake(), { run: accountRunner(define) });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "The server could not do this. Try again in a moment.",
      );
    });
  });
});

describe("mountSignIn: lifetime", () => {
  it("stops the countdown and the autofill request when its signal aborts", async () => {
    const fake = new Fake()
      .answer("passkeySupport", { webauthn: true, conditional: true })
      .answer("signInWithPasskey", () => new Promise<never>(() => undefined))
      .answer(
        "loginPassword",
        refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" }),
      );
    const { panel } = mount(fake);
    await drawn(panel);
    const o = fake.named("signInWithPasskey")[0]?.args[1] as { signal?: AbortSignal };
    await signIn(panel);
    await vi.waitFor(() => {
      expect(submit(panel).getAttribute("aria-disabled")).toBe("true");
    });
    life.abort();
    expect(o.signal?.aborted).toBe(true);
    expect(submit(panel).hasAttribute("aria-disabled")).toBe(false);
  });

  it("does nothing on an aborted signal", () => {
    life.abort();
    const { panel, fake } = mount();
    expect(panel.childElementCount).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});
