import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { Fake, PHONE, SESSION, meWith, ok, refuse } from "./test-helpers/fake.js";
import {
  actions,
  answerQuestion,
  button,
  dialogOf,
  errorOf,
  field,
  mount,
  named,
  noticeOf,
  passkeyRows,
  press,
  ready,
  rowOf,
  useScreen,
  words,
} from "./test-helpers/security.js";

useScreen();

describe("mountSecurity: the screen", () => {
  it("says who is signed in and heads its sections at the level the host gives", async () => {
    const { region } = mount(new Fake(), { level: 3 });
    await ready(region);
    expect(region.querySelector("[data-part='session']")?.textContent).toBe(
      "Signed in as mika with a passkey.",
    );
    expect([...region.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "Profile",
      "Sign-in methods",
      "Sessions",
      "API keys",
      "Security log",
    ]);
    expect(region.querySelector("h4")?.textContent).toBe("Passkeys");
    expect(region.querySelectorAll("h2")).toHaveLength(0);
    // The log's order pill sets its place through the CSSOM.
    expect(region.querySelectorAll("[style]:not(.cp-pill)")).toHaveLength(0);
  });

  it("shows each method's state as a .cp-state, Set in the success tone and Not set muted", async () => {
    const fake = new Fake().answer(
      "me",
      ok(
        meWith({ password: false, passkey_count: 2, oidc_linked: false }, { can_link_oidc: true }),
      ),
    );
    const { region } = mount(fake);
    await ready(region);
    const state = (name: string): HTMLElement =>
      rowOf(region, name).cells[1]?.querySelector(".cp-state") as HTMLElement;
    expect(state("Password").textContent).toBe("Not set");
    expect(state("Password").dataset["tone"]).toBe("neutral");
    expect(state("Passkeys").textContent).toBe("2 passkeys");
    expect(state("Passkeys").dataset["tone"]).toBe("success");
    expect(state("Single sign-on").textContent).toBe("Not linked");
    expect(actions(rowOf(region, "Password"))).toEqual(["Set a password…"]);
    expect(actions(rowOf(region, "Single sign-on"))).toEqual(["Link Authelia"]);
    const link = named(rowOf(region, "Single sign-on"), "Link Authelia");
    for (const part of link.querySelectorAll("[data-part]")) {
      expect(getComputedStyle(part).display).toBe("none");
    }
  });

  it("draws no methods section when the host mounts no method", async () => {
    const { region } = mount(new Fake(), { parts: ["sessions"] });
    await vi.waitFor(() => {
      expect([...region.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Sessions"]);
    });
  });

  it("leaves out each method the host does not mount", async () => {
    const { region } = mount(new Fake(), { parts: ["password"] });
    await ready(region);
    expect([...region.querySelectorAll("tbody tr")].map((r) => r.firstChild?.textContent)).toEqual([
      "Password",
    ]);
    expect(region.textContent).not.toContain("Profile");
  });

  it("shows a refusal to read the account with Retry, which reads it again", async () => {
    const fake = new Fake().answer("me", refuse(503, "auth_unavailable"));
    const { region } = mount(fake);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "Sign-in is unavailable right now. Try again in a few seconds.",
      );
    });
    await userEvent.click(button(region, "Retry"));
    await ready(region);
    expect(fake.named("me")).toHaveLength(2);
  });

  it("ends the screen when the session is gone, saying why", async () => {
    const reasons: string[] = [];
    const fake = new Fake().answer("me", refuse(401, "auth_session_expired", "transport_changed"));
    mount(fake, {
      onSignedOut: ({ reason }) => {
        reasons.push(reason);
      },
    });
    await vi.waitFor(() => {
      expect(reasons).toEqual(["transport-changed"]);
    });
  });

  it("goes to sign-in with arrived=session-ended by default", async () => {
    const fake = new Fake().answer("me", refuse(401, "auth_required"));
    const { went } = mount(fake, { signInPath: "/login" });
    await vi.waitFor(() => {
      expect(went).toEqual(["/login?arrived=session-ended"]);
    });
  });
});

describe("mountSecurity: a plain session", () => {
  const plain = (): Fake =>
    new Fake()
      .answer(
        "state",
        ok({
          setup_required: false,
          password_login: true,
          passkeys: false,
          oidc: false,
          secure: false,
          https_origin: "https://tracker.example",
        }),
      )
      .answer("me", ok(meWith({}, { session: { ...SESSION, secure: false } })));

  it("reads Plain HTTP with the session's end", async () => {
    const { region } = mount(plain());
    await ready(region);
    const line = region.querySelector("[data-part='plain-session']");
    expect(line?.querySelector(".cp-state")?.textContent).toBe("Plain HTTP");
    expect(line?.textContent).toContain("or when you close the browser.");
  });

  it("offers no Remove password, and holds Add a passkey as needing HTTPS with the way there", async () => {
    const { fake, region } = mount(plain());
    await ready(region);
    expect(actions(rowOf(region, "Password"))).toEqual(["Change password…"]);
    const add = named(rowOf(region, "Passkeys"), "Add a passkey");
    expect(add.textContent.trim()).toBe("Add");
    expect(add.getAttribute("aria-disabled")).toBe("true");
    const help = document.getElementById(add.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toBe("Needs HTTPS. Open Release tracker over HTTPS.");
    expect(help?.querySelector("a")?.getAttribute("href")).toMatch(/^https:\/\/tracker\.example\//);
    // A held button stays focusable; Playwright refuses to press it.
    add.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.named("registerPasskey")).toHaveLength(0);
  });
});

describe("mountSecurity: the profile", () => {
  it("saves the display name through the runner, trimmed", async () => {
    const { fake, region, ran } = mount();
    await ready(region);
    const input = field(region, "display_name");
    await userEvent.fill(input, "  Mika Laine ");
    await userEvent.click(button(region, "Save profile"));
    await vi.waitFor(() => {
      expect(fake.named("updateProfile")[0]?.args).toEqual([{ display_name: "Mika Laine" }]);
    });
    expect(ran).toContain("auth.profile_save");
    await vi.waitFor(() => {
      expect(input.value).toBe("Mika Laine");
    });
    // The load's signal, then the new display name for the passkey provider.
    expect(fake.named("sendSignals")).toHaveLength(2);
  });

  it("tells the passkey provider the accepted passkeys when it loads", async () => {
    const { fake, region } = mount();
    await ready(region);
    expect(fake.named("sendSignals")).toHaveLength(1);
  });

  it("lets a keyboard scroll each wide table, its panel named by the table's heading", async () => {
    const { region } = mount();
    await ready(region);
    const panels = [...region.querySelectorAll<HTMLElement>(".cp-panel[data-flush]")];
    expect(panels.length).toBeGreaterThanOrEqual(3);
    for (const p of panels) {
      expect(p.tabIndex).toBe(0);
      expect(p.getAttribute("role")).toBe("group");
      const by = p.getAttribute("aria-labelledby") ?? "";
      expect(document.getElementById(by)?.tagName).toMatch(/^H[2-4]$/);
      expect(p.querySelector("table")?.getAttribute("aria-labelledby")).toBe(by);
    }
  });

  it("sends no signal from a browser without WebAuthn", async () => {
    const fake = new Fake().answer("passkeySupport", { webauthn: false, conditional: false });
    const { region } = mount(fake);
    await ready(region);
    await userEvent.fill(field(region, "display_name"), "Mika");
    await userEvent.click(button(region, "Save profile"));
    await vi.waitFor(() => {
      expect(fake.named("updateProfile")).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.named("sendSignals")).toHaveLength(0);
  });

  it("puts a refused display name on its field", async () => {
    const fake = new Fake().answer(
      "updateProfile",
      refuse(400, "auth_bad_request", "display_name_disallowed_character"),
    );
    const { region } = mount(fake);
    await ready(region);
    await userEvent.fill(field(region, "display_name"), "Mika");
    await userEvent.click(button(region, "Save profile"));
    await vi.waitFor(() => {
      expect(errorOf(field(region, "display_name"))).toBe(
        "Keep it on one line, with no control characters.",
      );
    });
  });

  it("refuses a name over 128 characters before sending it", async () => {
    const { fake, region } = mount();
    await ready(region);
    await userEvent.fill(field(region, "display_name"), "é".repeat(129));
    await userEvent.click(button(region, "Save profile"));
    expect(errorOf(field(region, "display_name"))).toBe("Use at most 128 characters.");
    expect(fake.named("updateProfile")).toHaveLength(0);
  });
});

describe("mountSecurity: the password", () => {
  it("changes it with the current one, keeping the dialog on a wrong current password", async () => {
    const fake = new Fake().answer("setPassword", refuse(401, "auth_invalid_credentials"));
    const { region, ran } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Change password…");
    const d = await dialogOf("Change password");
    expect(document.activeElement).toBe(field(d, "current_password"));
    await userEvent.fill(field(d, "current_password"), "old words here");
    await userEvent.fill(field(d, "password"), "lantern harbour quietly");
    await userEvent.click(button(d, "Save password"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "current_password"))).toBe("The current password is wrong.");
    });
    expect(d.open).toBe(true);
    await userEvent.fill(field(d, "current_password"), "right words here");
    await userEvent.click(button(d, "Save password"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Password saved.");
    });
    expect(fake.named("setPassword")[1]?.args).toEqual([
      { current_password: "right words here", password: "lantern harbour quietly" },
    ]);
    expect(fake.named("storePasswordCredential")[0]?.args).toEqual([
      "mika",
      "lantern harbour quietly",
    ]);
    expect(ran.filter((n) => n === "auth.password_set")).toHaveLength(2);
  });

  it("puts a rejected new password's reason on the new field", async () => {
    const fake = new Fake().answer(
      "setPassword",
      refuse(400, "auth_password_rejected", "breached"),
    );
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Change password…");
    const d = await dialogOf("Change password");
    await userEvent.fill(field(d, "current_password"), "old words here");
    await userEvent.fill(field(d, "password"), "password123456789");
    await userEvent.click(button(d, "Save password"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "password"))).toBe(
        "That password has appeared in a data breach. Choose another.",
      );
    });
  });

  it("removes it after the current password, the last method's refusal kept in the dialog", async () => {
    const fake = new Fake().answer("removePassword", refuse(409, "auth_last_method"));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Remove password…");
    const d = await dialogOf("Remove your password?");
    expect(button(d, "Remove password").dataset["tone"]).toBe("danger");
    await userEvent.fill(field(d, "current_password"), "old words here");
    await userEvent.click(button(d, "Remove password"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe("Add a passkey or link single sign-on before you remove this.");
    });
    expect(fake.named("removePassword")[0]?.args).toEqual([{ current_password: "old words here" }]);
  });

  it("asks to confirm it is you when the server wants a recent sign-in, naming the action", async () => {
    const fake = new Fake().answer("removePassword", refuse(403, "auth_recent_auth_required"));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Remove password…");
    const d = await dialogOf("Remove your password?");
    await userEvent.fill(field(d, "current_password"), "old words here");
    await userEvent.click(button(d, "Remove password"));
    const up = await dialogOf("Confirm it is you");
    expect(document.getElementById(up.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Removing your password needs a recent sign-in.",
    );
    await userEvent.fill(field(up, "password"), "old words here");
    await userEvent.click(button(up, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Password removed.");
    });
    expect(fake.named("removePassword")).toHaveLength(2);
  });

  it("shows the recovery code a new password issued once, before saying it is saved", async () => {
    const fake = new Fake()
      .answer("me", ok(meWith({ password: false, recovery_code: false })))
      .answer("setPassword", ok({ recovery_code: "H4NW6PTB7KQ2M9XR" }));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Set a password…");
    const d = await dialogOf("Set a password");
    await userEvent.fill(field(d, "password"), "lantern harbour quietly");
    await userEvent.click(button(d, "Save password"));
    const shown = await dialogOf("Your recovery code");
    expect(shown.querySelector(".cp-code code")?.textContent).toBe("H4NW-6PTB-7KQ2-M9XR");
    expect(noticeOf(region)).toBe("");
    await userEvent.click(shown.querySelector("input[type='checkbox']") as HTMLInputElement);
    await userEvent.click(button(shown, "Continue"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Password saved.");
    });
  });

  it("words the new password's limit from the app's state, and refuses one outside it unsent", async () => {
    const fake = new Fake().answer(
      "state",
      ok({
        setup_required: false,
        password_login: true,
        passkeys: true,
        oidc: true,
        password_length: { min: 30, max: 64 },
      }),
    );
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Password"), "Change password…");
    const d = await dialogOf("Change password");
    const fresh = field(d, "password");
    expect(document.getElementById(fresh.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "30 to 64 characters. A few unrelated words make a strong one.",
    );
    await userEvent.fill(field(d, "current_password"), "old words here");
    await userEvent.fill(fresh, "lantern harbour quietly");
    await userEvent.click(button(d, "Save password"));
    expect(errorOf(fresh)).toBe("Use 30 to 64 characters.");
    expect(fake.named("setPassword")).toHaveLength(0);
  });

  it("offers no Remove password when it is the only way in", async () => {
    const fake = new Fake().answer("me", ok(meWith({ passkey_count: 0, oidc_linked: false })));
    const { region } = mount(fake);
    await ready(region);
    expect(actions(rowOf(region, "Password"))).toEqual(["Change password…"]);
  });
});

describe("mountSecurity: passkeys", () => {
  it("lists each passkey with its dates and where it lives", async () => {
    const fake = new Fake().answer(
      "passkeys",
      ok([
        PHONE,
        {
          ...PHONE,
          id: 8,
          name: "Key",
          backed_up: false,
          clone_warning: true,
          rp_id: "other.example",
        },
      ]),
    );
    const { region } = mount(fake);
    await ready(region);
    const rows = passkeyRows(region);
    expect(rows[0]?.cells[3]?.textContent).toBe("Synced");
    expect(rows[1]?.cells[3]?.textContent).toBe("This device onlyMay be copiedNot usable here");
    expect(rows[0]?.cells[1]?.querySelector("time")?.dateTime).toBe(PHONE.created_at);
    expect(actions(rows[0] as HTMLElement)).toEqual(["Rename…", "Remove…"]);
    expect(rows[0]?.querySelector("[popovertarget]")?.getAttribute("aria-label")).toBe(
      "Actions for Phone",
    );
  });

  it("adds one with no proof while no second factor is held", async () => {
    const { fake, region } = mount();
    await ready(region);
    await press(rowOf(region, "Passkeys"), "Add a passkey");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Passkey added.");
    });
    expect(fake.named("registerPasskey")[0]?.args).toHaveLength(1);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("shows the recovery code a first second factor issued once, before saying it is added", async () => {
    const fake = new Fake().answer("registerPasskey", {
      kind: "registered",
      recovery_code: "M9XRTB4HNW6P7KQ2",
    });
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Passkeys"), "Add a passkey");
    const shown = await dialogOf("Your recovery code");
    expect(shown.querySelector(".cp-code code")?.textContent).toBe("M9XR-TB4H-NW6P-7KQ2");
    expect(noticeOf(region)).toBe("");
    await userEvent.click(shown.querySelector("input[type='checkbox']") as HTMLInputElement);
    await userEvent.click(button(shown, "Continue"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Passkey added.");
    });
  });

  it("asks for a code first while a second factor is held, keeping the dialog on a wrong one", async () => {
    const fake = new Fake()
      .answer(
        "me",
        ok(
          meWith({
            second_factor_held: true,
            totp: { enrolled: true, usable: true, removable: true },
          }),
        ),
      )
      .answer("registerPasskey", {
        kind: "failed",
        error: refuse(401, "auth_code_invalid", "code_invalid"),
      });
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Passkeys"), "Add a passkey");
    const d = await dialogOf("Confirm with your second factor");
    expect(words(d)).toEqual(["Use a passkey", "Cancel", "Confirm"]);
    await userEvent.fill(field(d, "code"), "123 456");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "code"))).toBe("That code is not right.");
    });
    await userEvent.fill(field(d, "code"), "654321");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Passkey added.");
    });
    const calls = fake.named("registerPasskey");
    expect(calls[0]?.args[1]).toEqual({ code: "123456" });
    expect(calls[1]?.args[1]).toEqual({ code: "654321" });
  });

  it("renames one in its cell: Enter saves, and Escape puts the name back", async () => {
    const { fake, region, ran } = mount();
    await ready(region);
    const rename = await press(passkeyRows(region)[0] as HTMLElement, "Rename…");
    const input = region.querySelector<HTMLInputElement>(
      "tbody input.cp-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("Phone");
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard("{Escape}");
    expect(region.querySelector("tbody input.cp-input")).toBeNull();
    expect(document.activeElement).toBe(rename);
    await press(passkeyRows(region)[0] as HTMLElement, "Rename…");
    await userEvent.fill(region.querySelector("tbody input.cp-input") as HTMLInputElement, "  ");
    await userEvent.keyboard("{Enter}");
    expect(errorOf(region.querySelector("tbody input.cp-input") as HTMLInputElement)).toBe(
      "Give it a name.",
    );
    await userEvent.fill(
      region.querySelector("tbody input.cp-input") as HTMLInputElement,
      "Laptop",
    );
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(fake.named("renamePasskey")[0]?.args).toEqual([7, { name: "Laptop" }]);
    });
    expect(ran).toContain("auth.passkey_rename");
    // A passkey's name lives only on the server: the load's signal is the one sent.
    expect(fake.named("sendSignals")).toHaveLength(1);
  });

  it("keeps the edit while an input method composes, Enter and Escape alike", async () => {
    const { fake, region } = mount();
    await ready(region);
    await press(passkeyRows(region)[0] as HTMLElement, "Rename…");
    const input = region.querySelector("tbody input.cp-input") as HTMLInputElement;
    await userEvent.fill(input, "Laptop");
    for (const key of ["Enter", "Escape"]) {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true }),
      );
      // WebKit's order: the composition ends, then its confirming key.
      input.dispatchEvent(new CompositionEvent("compositionend", { data: "ラ" }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(region.querySelector("tbody input.cp-input")).toBe(input);
    expect(fake.named("renamePasskey")).toHaveLength(0);
  });

  it("removes one after a danger question, and tells the password manager", async () => {
    const { fake, region } = mount();
    await ready(region);
    await press(passkeyRows(region)[0] as HTMLElement, "Remove…");
    const q = await dialogOf("Remove Phone?");
    expect(button(q, "Remove passkey").dataset["tone"]).toBe("danger");
    expect(document.activeElement).toBe(button(q, "Cancel"));
    await userEvent.click(button(q, "Remove passkey"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Phone removed.");
    });
    expect(fake.named("removePasskey")[0]?.args).toEqual([7]);
    expect(fake.named("sendSignals")).toHaveLength(2);
  });

  it("offers no Remove on a passkey the server would refuse", async () => {
    const fake = new Fake().answer("passkeys", ok([{ ...PHONE, removable: false }]));
    const { region } = mount(fake);
    await ready(region);
    expect(actions(passkeyRows(region)[0] as HTMLElement)).toEqual(["Rename Phone"]);
  });

  it("suggests a second passkey to a person whose one way in is a passkey", async () => {
    const fake = new Fake().answer(
      "me",
      ok(meWith({ password: false, passkey_count: 1, oidc_linked: false })),
    );
    const { region } = mount(fake);
    await ready(region);
    expect(rowOf(region, "Passkeys").cells[1]?.textContent).toBe(
      "1 passkeyAdd a second passkey in case you lose this one.",
    );
  });
});

describe("mountSecurity: the authenticator app", () => {
  const offered = (methods = {}): Fake =>
    new Fake()
      .answer(
        "state",
        ok({ setup_required: false, password_login: true, passkeys: true, oidc: true, totp: true }),
      )
      .answer("me", ok(meWith(methods)));

  it("sets one up from its QR code and key, then shows the recovery code until it is saved", async () => {
    const fake = offered({ totp: { enrolled: false, usable: false, removable: false } });
    const { region, ran } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Authenticator app"), "Set up an authenticator app");
    const d = await dialogOf("Set up an authenticator app");
    expect(d.querySelector("svg.cp-qr")).not.toBeNull();
    expect(d.querySelector(".cp-code code")?.textContent).toBe("JBSW Y3DP EHPK 3PXP");
    expect(document.activeElement).toBe(field(d, "code"));
    expect(field(d, "code").getAttribute("autocomplete")).toBe("one-time-code");
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Turn on"));
    const shownCode = await dialogOf("Your recovery code");
    expect(shownCode.querySelector(".cp-code code")?.textContent).toBe("ABCD-2345-EFGH-6789");
    expect(fake.named("finishTOTP")[0]?.args).toEqual([{ ticket: "t1", code: "123456" }]);
    const go = button(shownCode, "Continue");
    expect(go.getAttribute("aria-disabled")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(shownCode.open).toBe(true);
    await userEvent.click(shownCode.querySelector("input[type='checkbox']") as HTMLInputElement);
    expect(go.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(go);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Authenticator app set up. Sign-in now asks for its code.");
    });
    expect(ran.filter((n) => n === "auth.totp_set_up")).toHaveLength(2);
    expect(shownCode.querySelector(".cp-code code")?.textContent).toBe("");
  });

  it("marks the old app's code when the replacement's current code is wrong", async () => {
    const fake = offered({
      totp: { enrolled: true, since: "2026-11-03T10:00:00Z", usable: true, removable: true },
    }).answer("finishTOTP", refuse(401, "auth_code_invalid", "current_code_invalid"), ok({}));
    const { region } = mount(fake);
    await ready(region);
    expect(rowOf(region, "Authenticator app").cells[1]?.textContent).toMatch(/^SetSet up /);
    await press(rowOf(region, "Authenticator app"), "Replace authenticator app");
    const d = await dialogOf("Replace authenticator app");
    await userEvent.fill(field(d, "code"), "111111");
    await userEvent.fill(field(d, "current_code"), "222222");
    await userEvent.click(button(d, "Turn on"));
    await vi.waitFor(() => {
      expect(errorOf(field(d, "current_code"))).toBe(
        "That code is not right for your current app.",
      );
    });
    await userEvent.fill(field(d, "current_code"), "333333");
    await userEvent.click(button(d, "Turn on"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Authenticator app replaced. The old one no longer works.");
    });
    expect(fake.named("finishTOTP")[1]?.args).toEqual([
      { ticket: "t1", code: "111111", current_code: "333333" },
    ]);
  });

  const unset = { totp: { enrolled: false, usable: false, removable: false } };
  const noPassword = meWith({ ...unset, password: false });

  /** The setup ended for want of a password: the sentence above the
   *  methods, which are read again, with Set a password… focused. */
  const needsPassword = async (region: HTMLElement, fake: Fake): Promise<void> => {
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "Set a password first: an authenticator app protects password sign-in.",
      );
      expect(document.activeElement?.getAttribute("data-cp-action")).toBe("password-set");
    });
    expect(fake.named("me")).toHaveLength(2);
    expect(rowOf(region, "Password").contains(document.activeElement)).toBe(true);
    expect(region.textContent).not.toContain("Set up an authenticator app");
  };

  it("sends a person whose password went to Set a password… when the setup is refused at its start", async () => {
    const fake = offered(unset)
      .always("me", ok(noPassword))
      .answer("beginTOTP", refuse(403, "auth_forbidden", "totp_needs_password"));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Authenticator app"), "Set up an authenticator app");
    await needsPassword(region, fake);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("closes the setup on a password removed in another tab meanwhile, with Set a password… in reach", async () => {
    const fake = offered(unset)
      .always("me", ok(noPassword))
      .answer("finishTOTP", refuse(403, "auth_forbidden", "totp_needs_password"));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Authenticator app"), "Set up an authenticator app");
    const d = await dialogOf("Set up an authenticator app");
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Turn on"));
    await needsPassword(region, fake);
    await vi.waitFor(() => {
      expect(d.isConnected).toBe(false);
    });
    expect(fake.named("finishTOTP")).toHaveLength(1);
  });

  it("keeps the setup open with the generic failure on a refusal for another reason", async () => {
    const fake = offered(unset).answer("finishTOTP", refuse(403, "auth_forbidden"));
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Authenticator app"), "Set up an authenticator app");
    const d = await dialogOf("Set up an authenticator app");
    await userEvent.fill(field(d, "code"), "123456");
    await userEvent.click(button(d, "Turn on"));
    await vi.waitFor(() => {
      expect(d.querySelector("[data-part='notice']")?.textContent).toContain(
        "The server could not do this. Try again in a moment.",
      );
    });
    expect(d.open).toBe(true);
  });

  it("says when the app turned authenticator apps off, and offers no setup to a passkey-only person", async () => {
    const off = offered({ totp: { enrolled: true, usable: false, removable: true } });
    const { region } = mount(off);
    await ready(region);
    expect(rowOf(region, "Authenticator app").cells[1]?.textContent).toBe(
      "Off in this appAuthenticator apps are turned off in this app. Yours is kept.",
    );
    expect(actions(rowOf(region, "Authenticator app"))).toEqual(["Remove authenticator app…"]);
    document.body.replaceChildren();
    const passkeyOnly = mount(offered({ password: false }));
    await ready(passkeyOnly.region);
    const methods = [...passkeyOnly.region.querySelectorAll("tbody tr")].map(
      (r) => (r as HTMLTableRowElement).cells[0]?.textContent,
    );
    expect(methods).not.toContain("Authenticator app");
    expect(passkeyOnly.region.textContent).not.toContain("Set up an authenticator app");
  });

  it("removes it with a code from it while it is usable", async () => {
    const fake = offered({ totp: { enrolled: true, usable: true, removable: true } });
    const { region } = mount(fake);
    await ready(region);
    await press(rowOf(region, "Authenticator app"), "Remove authenticator app…");
    await answerQuestion("Remove your authenticator app?", "Remove app");
    const d = await dialogOf("Confirm with your second factor");
    await userEvent.fill(field(d, "code"), "246810");
    await userEvent.click(button(d, "Confirm"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Authenticator app removed.");
    });
    expect(fake.named("removeTOTP")[0]?.args).toEqual([{ code: "246810" }]);
  });

  it("replaces the recovery code with a passkey as the proof, then shows the new one", async () => {
    const fake = offered({
      recovery_code: true,
      totp: { enrolled: true, usable: false, removable: true },
    });
    const { region } = mount(fake);
    await ready(region);
    expect(rowOf(region, "Recovery code").cells[1]?.textContent).toBe("Set");
    await press(rowOf(region, "Recovery code"), "Replace recovery code…");
    await answerQuestion("Replace your recovery code?", "Replace code");
    const d = await dialogOf("Confirm with your second factor");
    expect(words(d)).toEqual(["Use a passkey", "Cancel"]);
    await userEvent.click(button(d, "Use a passkey"));
    const code = await dialogOf("Your recovery code");
    expect(code.querySelector(".cp-code code")?.textContent).toBe("WXYZ-2345-EFGH-6789");
    expect(fake.named("regenerateRecoveryCode")[0]?.args).toEqual([
      { ceremony: "cer-2", assertion: {} },
    ]);
  });
});

describe("mountSecurity: locks and single sign-on", () => {
  it("turns a locked method back on, or says to sign in another way first", async () => {
    const lock = [{ method: "password", untrusted: true, trusted: false }];
    const fake = new Fake()
      .answer("me", ok(meWith({ locks: lock })))
      .answer(
        "reenableMethod",
        refuse(403, "auth_recent_auth_required", "reenable_needs_other_method"),
      );
    const { region } = mount(fake);
    await ready(region);
    expect(rowOf(region, "Password").cells[1]?.textContent).toBe(
      "Turned offPassword was turned off after many failed attempts.",
    );
    await press(rowOf(region, "Password"), "Turn it back on");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "Sign in with another method first, then turn this one back on.",
      );
    });
    expect(fake.named("reenableMethod")[0]?.args).toEqual(["password"]);
  });

  it("hides every local-method form while the provider manages sign-in, except for an owner", async () => {
    const fake = new Fake().answer("me", ok(meWith({}, { sso_only: true })));
    const { region } = mount(fake);
    await ready(region);
    expect(actions(rowOf(region, "Password"))).toEqual([]);
    expect(actions(rowOf(region, "Passkeys"))).toEqual([]);
    expect(region.textContent).toContain("Authelia manages how you sign in.");
    document.body.replaceChildren();
    const owner = mount(new Fake().answer("me", ok(meWith({}, { sso_only: true, owner: true }))));
    await ready(owner.region);
    expect(actions(rowOf(owner.region, "Password"))).toContain("Change password…");
  });

  it("links the provider by opening its address, and says so on the way back", async () => {
    const fake = new Fake().answer(
      "me",
      ok(meWith({ oidc_linked: false }, { can_link_oidc: true })),
    );
    const { region, went } = mount(fake, { redirect: "/settings/account" });
    await ready(region);
    await press(rowOf(region, "Single sign-on"), "Link Authelia");
    await vi.waitFor(() => {
      expect(went).toEqual(["https://id.example/authorize?state=link"]);
    });
    expect(fake.named("oidcStartLink")[0]?.args).toEqual([{ redirect: "/settings/account" }]);
    document.body.replaceChildren();
    const back = mount(new Fake(), { search: "?oidc=linked" });
    await ready(back.region);
    await vi.waitFor(() => {
      expect(noticeOf(back.region)).toBe("Authelia is linked. You can sign in with it.");
    });
  });

  it("words a failed link that comes back", async () => {
    const { region } = mount(new Fake(), { search: "?auth_error=auth_identity_taken" });
    await ready(region);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("That identity is linked to another account.");
    });
  });

  it("unlinks after a danger question", async () => {
    const { fake, region } = mount();
    await ready(region);
    await press(rowOf(region, "Single sign-on"), "Unlink Authelia…");
    await answerQuestion("Unlink Authelia?", "Unlink");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Authelia is unlinked.");
    });
    expect(fake.named("oidcUnlink")).toHaveLength(1);
  });
});
