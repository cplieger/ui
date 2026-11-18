import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { accountRunner, type DefineAction, type Runner } from "./run.js";
import { Fake, noAnswer, ok, refuse, signedIn } from "./test-helpers/fake.js";
import {
  button,
  drawn,
  endBeforeMount,
  endScreen,
  input,
  mount,
  noticeOf,
  said,
  settled,
  signIn,
  submit,
  useSignIn,
} from "./test-helpers/sign-in.js";

useSignIn();

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
    expect(user.getAttribute("autocorrect")).toBe("off");
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
      "p:Lost access? Ask an admin for a temporary password.",
    ]);
    const link = button(panel, "Continue with") as HTMLAnchorElement;
    expect(new URL(link.href).pathname).toBe("/api/auth/oidc/start/signin");
    expect(new URL(link.href).searchParams.get("redirect")).toBe("/feed");
    expect(panel.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("draws single sign-on from the server's offer alone: none with no provider named, a plain name with one", async () => {
    const passkeyOnly = {
      setup_required: false,
      password_login: true,
      passkeys: true,
      secure: true,
      https_required: [],
    };
    const off = mount(new Fake(), { state: { ...passkeyOnly, oidc: false } });
    await drawn(off.panel);
    expect(off.panel.querySelector("a[href*='/oidc/']")).toBeNull();
    expect(off.panel.textContent).not.toContain("Continue with");
    expect(off.panel.querySelectorAll("hr")).toHaveLength(1);
    off.panel.remove();
    const passwordOnly = mount(new Fake(), {
      state: { ...passkeyOnly, passkeys: false, oidc: false },
    });
    await drawn(passwordOnly.panel);
    expect(passwordOnly.panel.querySelector("hr")).toBeNull();
    passwordOnly.panel.remove();
    const unnamed = mount(new Fake(), { state: { ...passkeyOnly, oidc: true } });
    await drawn(unnamed.panel);
    expect(button(unnamed.panel, "Continue with").textContent.trim()).toBe(
      "Continue with single sign-on",
    );
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
      ok({
        setup_required: false,
        password_login: true,
        passkeys: true,
        oidc: true,
        secure: true,
        https_required: [],
      }),
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
      ok({
        setup_required: false,
        password_login: false,
        passkeys: true,
        oidc: false,
        secure: true,
        https_required: [],
      }),
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
      ok({
        setup_required: false,
        password_login: false,
        passkeys: true,
        oidc: true,
        secure: true,
        https_required: [],
      }),
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
      ok({
        setup_required: false,
        password_login: false,
        passkeys: false,
        oidc: false,
        secure: true,
        https_required: [],
      }),
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
      state: {
        setup_required: false,
        password_login: true,
        passkeys: false,
        oidc: false,
        secure: true,
        https_required: [],
      },
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

  it("reads a sign-out of this device from the address", async () => {
    const { panel } = mount(new Fake(), { search: "?arrived=signed-out" });
    await drawn(panel);
    expect(noticeOf(panel)?.dataset["tone"]).toBe("neutral");
    expect(noticeOf(panel)?.textContent).toBe("You signed out.");
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

  it.each([
    "//evil.example/x",
    "/\\evil.example",
    "/\t/evil.example",
    "https://evil.example/",
    "/.//evil.example",
    "/foo/..//evil.example",
    "/%2e//evil.example",
    "/.\\/evil.example",
    "//",
    "///",
    "//?x",
    "/\\",
    "/\\/",
    "/\t/",
  ])("goes home for a next of %j, which leaves the origin or does not parse", async (next) => {
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
  });

  it("keeps a next's query and fragment on this origin", async () => {
    const navigate = vi.fn<(url: string) => void>();
    const { panel } = mount(new Fake(), {
      navigate,
      search: `?${new URLSearchParams({ next: "/feed?x=1#a" }).toString()}`,
    });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/feed?x=1#a");
    });
  });

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
        ok({
          setup_required: false,
          password_login: true,
          passkeys: true,
          oidc: false,
          secure: true,
          https_required: [],
        }),
        ok({
          setup_required: false,
          password_login: false,
          passkeys: true,
          oidc: false,
          secure: true,
          https_required: [],
        }),
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

  it.each([
    [
      "a refused begin",
      { ok: false, status: 503, error: "unavailable", code: "auth_unavailable" },
      "Sign-in is unavailable right now. Try again in a few seconds.",
    ],
    [
      "a relying party that does not fit the host",
      "SecurityError",
      "Passkeys do not work at this address. Open the app at its usual address, or ask its admin to check its public URL.",
    ],
  ] as const)(
    "asks the autofill once after %s, and once more per press",
    async (_, error, words) => {
      const fake = new Fake()
        .answer("passkeySupport", { webauthn: true, conditional: true })
        .always("signInWithPasskey", { kind: "failed", error });
      const { panel } = mount(fake);
      await drawn(panel);
      const second = (): Promise<void> => new Promise((done) => setTimeout(done, 1000));
      await second();
      expect(fake.named("signInWithPasskey")).toHaveLength(1);
      expect(noticeOf(panel)?.textContent).toBe(words);
      await userEvent.click(button(panel, "Sign in with a passkey"));
      await second();
      // The press's own request, then the autofill's one restart.
      expect(fake.named("signInWithPasskey")).toHaveLength(3);
      expect(noticeOf(panel)?.textContent).toBe(words);
    },
  );

  it("says the server failed when the autofill's write throws, and does not ask again", async () => {
    const fake = new Fake().answer("passkeySupport", { webauthn: true, conditional: true });
    let calls = 0;
    const run: Runner = (name, work) => {
      if (name !== "auth.sign_in_passkey") {
        return work();
      }
      calls += 1;
      return Promise.reject(new Error("the action log refused it"));
    };
    const { panel } = mount(fake, { run });
    await drawn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "The server could not do this. Try again in a moment.",
      );
    });
    await new Promise((done) => setTimeout(done, 1000));
    expect(calls).toBe(1);
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
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
    const { panel } = mount(new Fake().without("oidcPending"), {
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
    endScreen();
    expect(o.signal?.aborted).toBe(true);
    expect(submit(panel).hasAttribute("aria-disabled")).toBe(false);
  });

  it("does nothing on an aborted signal", () => {
    endBeforeMount();
    const { panel, fake } = mount();
    expect(panel.childElementCount).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});

const plain = {
  setup_required: false,
  totp: true,
  password_login: true,
  passkeys: false,
  oidc: false,
  secure: false,
  https_required: ["passkeys", "oidc"],
  plain_session: { idle_seconds: 1800, absolute_seconds: 43200 },
  https_origin: "https://tracker.example",
} as const;

describe("mountSignIn: over plain HTTP", () => {
  it("draws the password form with what HTTPS adds, linked there, and the shorter session", async () => {
    const fake = new Fake().answer("state", ok(plain));
    const { panel } = mount(fake, { app: "Release tracker" });
    await drawn(panel);
    expect(panel.querySelector("form")).not.toBeNull();
    expect(button(panel, "passkey")).toBeUndefined();
    const https = panel.querySelector<HTMLElement>("[data-part='https']");
    expect(https?.textContent).toBe(
      "Passkeys and single sign-on need HTTPS. Open Release tracker over HTTPS.",
    );
    expect(https?.querySelector("a")?.href.startsWith("https://tracker.example/")).toBe(true);
    expect(panel.querySelector("[data-part='plain-session']")?.textContent).toBe(
      "You stay signed in for up to 12 hours, 30 minutes when idle, until you close the browser.",
    );
  });

  it.each([
    ["a script URL", "javascript:alert(1)"],
    ["a script URL split by a tab", "java\tscript:alert(1)"],
    ["credentials before the host", "https://tracker.example@evil.example"],
    ["plain HTTP", "http://tracker.example"],
    ["a path", "https://tracker.example/path"],
    ["a query", "https://tracker.example/?next=/"],
    ["an empty string", ""],
  ])("links nowhere when the HTTPS address is %s", async (_, origin) => {
    const fake = new Fake().answer("state", ok({ ...plain, https_origin: origin }));
    const { panel } = mount(fake, { app: "Release tracker" });
    await drawn(panel);
    const https = panel.querySelector<HTMLElement>("[data-part='https']");
    expect(https?.textContent).toBe("Passkeys and single sign-on need HTTPS.");
    expect(https?.querySelector("a")).toBeNull();
  });

  it("links an HTTPS origin, with its port, to this page there", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...plain, https_origin: "https://tracker.example:8443/" }),
    );
    const { panel } = mount(fake, { app: "Release tracker" });
    await drawn(panel);
    expect(panel.querySelector<HTMLAnchorElement>("[data-part='https'] a")?.href).toBe(
      `https://tracker.example:8443${location.pathname}${location.search}`,
    );
  });

  it("names only what the host mounts among what HTTPS adds", async () => {
    const fake = new Fake().answer("state", ok(plain));
    const { panel } = mount(fake, { parts: ["password", "passkeys"] });
    await drawn(panel);
    expect(panel.querySelector("[data-part='https']")?.textContent).toBe(
      "Passkeys need HTTPS. Open the app over HTTPS.",
    );
  });

  it("shows This app needs HTTPS with no form under the strict posture", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...plain, password_login: false, https_required: ["password", "passkeys", "oidc"] }),
    );
    const { panel } = mount(fake, { app: "Release tracker", arrived: "transport-changed" });
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    const empty = panel.querySelector(".cp-empty");
    expect(empty?.querySelector("p")?.textContent).toBe("This app needs HTTPS.");
    const link = empty?.querySelector("a");
    expect(link?.textContent).toBe("Open Release tracker over HTTPS");
    expect(link?.dataset["variant"]).toBe("primary");
    expect(noticeOf(panel)?.textContent).toBe(
      "You were signed out because the connection changed between HTTP and HTTPS.",
    );
  });

  it("says the sentence alone when the app named no HTTPS address", async () => {
    const { https_origin: _gone, ...bare } = plain;
    const fake = new Fake().answer("state", ok({ ...bare, https_required: ["password"] }));
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector(".cp-empty")?.textContent).toBe("This app needs HTTPS.");
    expect(panel.querySelector(".cp-empty a")).toBeNull();
  });

  it("shows the same state where password sign-in is off and a temporary password could not finish", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...plain, password_login: false, temporary_password_https_only: true }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    expect(panel.querySelector(".cp-empty p")?.textContent).toBe("This app needs HTTPS.");
  });

  it("points to HTTPS when the next step needs it", async () => {
    const fake = new Fake()
      .answer("state", ok(plain))
      .answer("loginPassword", refuse(403, "auth_https_required"));
    const { panel } = mount(fake, { app: "Release tracker" });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "The next step of this sign-in needs HTTPS. Open Release tracker over HTTPS.",
      );
    });
    expect(noticeOf(panel)?.dataset["tone"]).toBe("warning");
  });
});

/** A state from a server with temporary passwords. */
const temporaryState = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  totp: true,
  secure: true,
  https_required: [],
} as const;

describe("mountSignIn: a temporary password", () => {
  it("switches the field to a temporary password and back, which the browser never keeps", async () => {
    const fake = new Fake()
      .answer("state", ok(temporaryState))
      .answer(
        "loginPassword",
        ok({ pending: { ticket: "t1", next: "set_credential", methods: ["password"] } }),
      );
    const { panel } = mount(fake);
    await drawn(panel);
    const pass = input(panel, "password");
    const label = (): string | null | undefined =>
      panel.querySelector(`label[for='${pass.id}']`)?.textContent;
    const toggle = button(panel, "Use a temporary password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(pass.hasAttribute("aria-describedby")).toBe(false);
    await userEvent.click(toggle);
    expect(label()).toBe("Temporary password");
    expect(toggle.textContent).toBe("Use your own password");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(pass.getAttribute("autocomplete")).toBe("one-time-code");
    expect(document.getElementById(pass.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "An admin gave it to you. You choose your own password next.",
    );
    expect(document.activeElement).toBe(pass);
    await userEvent.click(toggle);
    expect(label()).toBe("Password");
    expect(pass.getAttribute("autocomplete")).toBe("current-password");
    expect(pass.hasAttribute("aria-describedby")).toBe(false);
    await userEvent.click(toggle);
    await signIn(panel, "mika", "ABCD-2345-EFGH-6789");
    await vi.waitFor(() => {
      expect(input(panel, "new_password")).not.toBeNull();
    });
    expect(fake.named("loginPassword")[0]?.args).toEqual([
      { username: "mika", password: "ABCD-2345-EFGH-6789" },
    ]);
    expect(fake.named("storePasswordCredential")).toHaveLength(0);
  });

  it("labels the form for a temporary password only when password sign-in is off", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...temporaryState, password_login: false, oidc: false }),
    );
    const { panel } = mount(fake);
    await drawn(panel);
    const pass = input(panel, "password");
    expect(panel.querySelector(`label[for='${pass.id}']`)?.textContent).toBe("Temporary password");
    expect(button(panel, "Use a temporary password")).toBeUndefined();
    expect(button(panel, "Sign in with a passkey")).toBeDefined();
  });

  it("is left out when the host does not mount it, or the server has none", async () => {
    const fake = new Fake().answer(
      "state",
      ok({ ...temporaryState, password_login: false, oidc: false }),
    );
    const { panel } = mount(fake, { parts: ["password", "passkeys"] });
    await drawn(panel);
    expect(panel.querySelector("form")).toBeNull();
    const before = mount(new Fake());
    await drawn(before.panel);
    expect(button(before.panel, "Use a temporary password")).toBeUndefined();
    const again = mount(new Fake().answer("state", ok(temporaryState)), {
      parts: ["password", "passkeys"],
    });
    await drawn(again.panel);
    expect(button(again.panel, "Use a temporary password")).toBeUndefined();
  });

  it("refuses to send what reads as a temporary password over plain HTTP, sending nothing", async () => {
    const fake = new Fake().answer("state", ok({ ...plain, temporary_password_https_only: true }));
    const { panel } = mount(fake);
    await drawn(panel);
    expect(button(panel, "Use a temporary password")).toBeUndefined();
    const pass = input(panel, "password");
    expect(document.getElementById(pass.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "A temporary password works only on https://tracker.example.",
    );
    await signIn(panel, "mika", "abcd 2345 efgh 6789");
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This looks like a temporary password, which works only on https://tracker.example. If this is your password, sign in there.",
      );
    });
    expect(fake.named("loginPassword")).toHaveLength(0);
    expect(document.activeElement).toBe(pass);
    await userEvent.fill(pass, "lantern harbour");
    await userEvent.click(submit(panel));
    await vi.waitFor(() => {
      expect(fake.named("loginPassword")).toHaveLength(1);
    });
  });

  it("says where to go without an HTTPS address", async () => {
    const { https_origin: _gone, ...bare } = plain;
    const fake = new Fake().answer("state", ok({ ...bare, temporary_password_https_only: true }));
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel, "mika", "ABCD-2345-EFGH-6789");
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This looks like a temporary password, which works only over HTTPS. If this is your password, open the app over HTTPS and sign in there.",
      );
    });
    expect(fake.named("loginPassword")).toHaveLength(0);
  });

  it("says a temporary password sent in clear no longer works", async () => {
    const fake = new Fake()
      .answer("state", ok(plain))
      .answer("loginPassword", refuse(403, "auth_https_required", "temporary_password_exposed"));
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(
        "This temporary password was sent over an unencrypted connection and no longer works. Ask for a new one, and use https://tracker.example.",
      );
    });
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
  });
});

describe("mountSignIn: answers at the first step", () => {
  it.each([
    [
      refuse(403, "auth_second_factor_required", "enrol_needs_known_device"),
      "Set up a second factor from a device you have signed in on before, or ask an admin for a temporary password.",
    ],
    [
      refuse(403, "auth_forbidden", "no_usable_method"),
      "This account cannot finish signing in to this app. Ask an admin.",
    ],
  ])("words %j", async (answer, words) => {
    const fake = new Fake().answer("loginPassword", answer);
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe(words);
    });
    expect(noticeOf(panel)?.dataset["tone"]).toBe("danger");
  });

  it("points a linked account to its organisation's sign-in", async () => {
    const fake = new Fake()
      .answer(
        "state",
        ok({
          setup_required: false,
          password_login: true,
          passkeys: true,
          oidc: true,
          sso: "for_linked",
          secure: true,
          https_required: [],
        }),
      )
      .answer("loginPassword", refuse(403, "auth_sso_only"));
    const { panel } = mount(fake, { provider: "Authelia" });
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.textContent).toBe("Use your organisation's sign-in.");
    });
    expect(document.activeElement).toBe(button(panel, "Continue with Authelia"));
  });
});

describe("mountSignIn: the single sign-on mode", () => {
  const sso = (mode: "for_linked" | "only", over: object = {}): ReturnType<typeof ok> =>
    ok({
      setup_required: false,
      password_login: true,
      passkeys: true,
      oidc: true,
      sso: mode,
      ...over,
      secure: true,
      https_required: [],
    });

  it("says who signs in with the provider for linked accounts", async () => {
    const { panel } = mount(new Fake().answer("state", sso("for_linked")), {
      provider: "Authelia",
    });
    await drawn(panel);
    const link = button(panel, "Continue with Authelia");
    expect(link.nextElementSibling?.textContent).toBe(
      "Accounts linked to Authelia sign in with it.",
    );
    expect(panel.querySelector("form")).not.toBeNull();
  });

  it("leads with the provider and keeps the owners' form behind Owner sign-in", async () => {
    const { panel, fake } = mount(new Fake().answer("state", sso("only")), {
      provider: "Authelia",
    });
    await drawn(panel);
    const first = panel.querySelector("[data-part='notice'] + .cp-stack > *");
    expect(first?.textContent).toBe("Sign in with Authelia");
    expect((first as HTMLElement).dataset["variant"]).toBe("primary");
    const details = panel.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe("Owner sign-in");
    expect(details?.textContent).toContain("For the app's owners.");
    expect(details?.querySelector("form")).not.toBeNull();
    expect(details?.querySelector("button[type='submit']")?.hasAttribute("data-variant")).toBe(
      false,
    );
    expect(panel.querySelectorAll("[data-variant='primary']")).toHaveLength(1);
    expect(button(panel, "Continue with")).toBeUndefined();
    await userEvent.click(details?.querySelector("summary") as HTMLElement);
    await vi.waitFor(() => {
      expect(details?.open).toBe(true);
    });
    await signIn(panel);
    await vi.waitFor(() => {
      expect(fake.named("loginPassword")).toHaveLength(1);
    });
  });

  it("shows the owners' form alone over plain HTTP, where the provider cannot run", async () => {
    const fake = new Fake().answer("state", sso("only", { ...plain, sso: "only" }));
    const { panel } = mount(fake, { provider: "Authelia" });
    await drawn(panel);
    expect(panel.querySelector("details")).toBeNull();
    expect(panel.querySelector("form")?.previousElementSibling?.textContent).toBe(
      "For the app's owners.",
    );
    expect(button(panel, "Authelia")).toBeUndefined();
  });
});

describe("mountSignIn: a re-read refused once the form is drawn", () => {
  it("keeps the form and its values under the notice, and Retry draws it again with why it read", async () => {
    const every = {
      setup_required: false,
      password_login: true,
      passkeys: true,
      oidc: false,
      secure: true,
      https_required: [],
    };
    const fake = new Fake()
      .answer("state", ok(every), refuse(503, "auth_unavailable"), ok(every))
      .answer("loginPassword", refuse(403, "auth_password_login_disabled"));
    const { panel } = mount(fake);
    await drawn(panel);
    await signIn(panel);
    await vi.waitFor(() => {
      expect(noticeOf(panel)?.querySelector("[data-cp-action='retry']")).not.toBeNull();
    });
    expect(panel.querySelector("form")).not.toBeNull();
    expect(input(panel, "username").value).toBe("mika");
    expect(noticeOf(panel)?.querySelector("[data-part='body']")?.textContent).toBe(
      "Password sign-in is turned off. Sign in another way. Sign-in is unavailable right now. Try again in a few seconds.",
    );
    await userEvent.click(noticeOf(panel)!.querySelector<HTMLElement>("[data-cp-action='retry']")!);
    await vi.waitFor(() => {
      expect(fake.named("state")).toHaveLength(3);
      expect(noticeOf(panel)?.textContent).toBe(
        "Password sign-in is turned off. Sign in another way.",
      );
    });
    expect(panel.querySelector("form")).not.toBeNull();
  });
});
