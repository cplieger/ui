import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { SessionView } from "./client.js";
import { deviceName } from "./device.js";
import { HERE, Fake, ok, refuse } from "./test-helpers/fake.js";
import {
  actions,
  answerQuestion,
  button,
  errorOf,
  mount,
  noticeOf,
  press,
  useScreen,
} from "./test-helpers/security.js";
import { defaultAccountWords } from "./words.js";

useScreen();

const PHONE_SESSION: SessionView = {
  ...HERE,
  id: "s2",
  label: "Mika's phone",
  user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Safari/604.1",
  last_ip: "198.51.100.23",
  last_activity: "2026-11-14T08:00:00Z",
  current: false,
};

const LAN: SessionView = {
  ...HERE,
  id: "s3",
  user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
  last_ip: "192.0.2.14",
  method: "password",
  last_activity: "2026-11-13T08:00:00Z",
  current: false,
  secure: false,
};

/** The sessions table's rows, once it is drawn. */
const sessionRows = (region: HTMLElement): Promise<HTMLTableRowElement[]> =>
  vi.waitFor(() => {
    const rows = [
      ...region.querySelectorAll<HTMLTableRowElement>("[data-part='sessions'] tbody tr"),
    ];
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  });

const sessionsSection = (region: HTMLElement): HTMLElement =>
  region.querySelector("[data-part='sessions']")?.closest("section") as HTMLElement;

const three = (): Fake => new Fake().answer("sessions", ok([LAN, PHONE_SESSION, HERE]));

describe("mountSecurity: sessions", () => {
  it("lists this device first, then the others by their last activity", async () => {
    const { region } = mount(three(), { parts: ["sessions", "session-rename"] });
    const rows = await sessionRows(region);
    expect(rows.map((r) => r.cells[0]?.querySelector("span")?.textContent)).toEqual([
      "Firefox on Linux",
      "Mika's phone",
      "Chrome on Windows",
    ]);
    expect(rows[0]?.cells[0]?.textContent).toContain("This device");
    expect(rows[0]?.cells[1]?.textContent).toBe("a passkey");
    expect(rows[0]?.cells[3]?.querySelector(".cp-mono")?.textContent).toBe("192.0.2.10");
    expect(rows[0]?.cells[2]?.querySelector("time")?.dateTime).toBe(HERE.last_activity);
    const plain = rows[2]?.cells[0]?.querySelector(".cp-state");
    expect(plain?.textContent).toBe("Plain HTTP");
    expect(rows[2]?.cells[0]?.textContent).toContain("or when the browser closes");
    expect(actions(rows[1] as HTMLElement)).toEqual(["Rename…", "Sign out"]);
    expect(region.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("offers no Rename without its route", async () => {
    const { region } = mount(three(), { parts: ["sessions"] });
    const rows = await sessionRows(region);
    expect(actions(rows[1] as HTMLElement)).toEqual(["Sign out Mika's phone"]);
  });

  it("renames a session in its cell, and an empty name puts back the browser's", async () => {
    const fake = new Fake().answer(
      "sessions",
      ok([LAN, PHONE_SESSION, HERE]),
      ok([LAN, PHONE_SESSION, { ...HERE, label: "Desk" }]),
    );
    const { region, ran } = mount(fake, { parts: ["sessions", "session-rename"] });
    const rows = await sessionRows(region);
    await press(rows[0] as HTMLElement, "Rename…");
    const input = region.querySelector<HTMLInputElement>("[data-part='sessions'] input");
    expect(input?.getAttribute("aria-label")).toBe("Rename Firefox on Linux");
    expect(input?.placeholder).toBe("Firefox on Linux");
    await userEvent.keyboard("Desk{Enter}");
    await vi.waitFor(() => {
      expect(fake.named("renameSession")[0]?.args).toEqual(["s1", { name: "Desk" }]);
    });
    expect(ran).toContain("auth.session_rename");
    await vi.waitFor(async () => {
      const [first] = await sessionRows(region);
      expect(first?.cells[0]?.querySelector("span")?.textContent).toBe("Desk");
    });

    await press((await sessionRows(region))[1] as HTMLElement, "Rename…");
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}{Enter}");
    await vi.waitFor(() => {
      expect(fake.named("renameSession")[1]?.args).toEqual(["s2", { name: "" }]);
    });
  });

  it("puts a refused name on its field", async () => {
    const fake = three().answer("renameSession", refuse(400, "auth_bad_request", "label_too_long"));
    const { region } = mount(fake, { parts: ["sessions", "session-rename"] });
    await press((await sessionRows(region))[1] as HTMLElement, "Rename…");
    await userEvent.keyboard("{Control>}a{/Control}Phone{Enter}");
    await vi.waitFor(() => {
      const input = region.querySelector<HTMLInputElement>("[data-part='sessions'] input");
      expect(errorOf(input as HTMLInputElement)).toBe("Use at most 128 characters.");
    });
  });

  it("signs out another session and reads the list again", async () => {
    const fake = new Fake().answer("sessions", ok([LAN, PHONE_SESSION, HERE]), ok([LAN, HERE]));
    const { region, ran } = mount(fake, { parts: ["sessions"] });
    await press((await sessionRows(region))[1] as HTMLElement, "Sign out Mika's phone");
    await vi.waitFor(() => {
      expect(fake.named("revokeSession")[0]?.args).toEqual(["s2"]);
      expect(noticeOf(sessionsSection(region))).toBe("Mika's phone is signed out.");
    });
    expect(ran).toEqual(["auth.session_revoke"]);
    await vi.waitFor(async () => {
      expect(await sessionRows(region)).toHaveLength(2);
    });
  });

  it("keeps a signed-out session gone when an earlier read answers after a later one", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = new Fake().answer(
      "sessions",
      ok([LAN, PHONE_SESSION, HERE]),
      () => late.promise,
      ok([HERE]),
    );
    const { region } = mount(fake, { parts: ["sessions"] });
    const [, phone, lan] = await sessionRows(region);
    await press(phone as HTMLElement, "Sign out Mika's phone");
    await vi.waitFor(() => {
      expect(fake.named("sessions")).toHaveLength(2);
    });
    await press(lan as HTMLElement, `Sign out ${deviceName(LAN, defaultAccountWords)}`);
    await vi.waitFor(async () => {
      expect(await sessionRows(region)).toHaveLength(1);
    });
    late.resolve(ok([LAN, HERE]));
    await new Promise((done) => setTimeout(done, 50));
    expect(fake.named("sessions")).toHaveLength(3);
    expect(await sessionRows(region)).toHaveLength(1);
  });

  it("reads the list again when the session is already gone", async () => {
    const fake = new Fake()
      .answer("sessions", ok([LAN, PHONE_SESSION, HERE]), ok([LAN, HERE]))
      .answer("revokeSession", refuse(404, "auth_not_found"));
    const { region } = mount(fake, { parts: ["sessions"] });
    await press((await sessionRows(region))[1] as HTMLElement, "Sign out Mika's phone");
    await vi.waitFor(async () => {
      expect(await sessionRows(region)).toHaveLength(2);
    });
    expect(fake.named("sessions")).toHaveLength(2);
  });

  it("ends the screen when the person signs this device out", async () => {
    const reasons: string[] = [];
    const { region } = mount(three(), {
      parts: ["sessions"],
      onSignedOut: ({ reason }) => {
        reasons.push(reason);
      },
    });
    await press((await sessionRows(region))[0] as HTMLElement, "Sign out Firefox on Linux");
    await vi.waitFor(() => {
      expect(reasons).toEqual(["signed-out"]);
    });
  });

  it("signs out everywhere else after a danger question counting them", async () => {
    const fake = new Fake().answer("sessions", ok([LAN, PHONE_SESSION, HERE]), ok([HERE]));
    const { region, ran } = mount(fake, { parts: ["sessions"] });
    await sessionRows(region);
    await userEvent.click(button(region, "Sign out everywhere else…"));
    await answerQuestion("Sign out everywhere else?", "Sign out 2 other sessions");
    await vi.waitFor(() => {
      expect(fake.named("revokeOtherSessions")).toHaveLength(1);
      expect(noticeOf(sessionsSection(region))).toBe("Every other session is signed out.");
    });
    expect(ran).toEqual(["auth.sessions_revoke_others"]);
    await vi.waitFor(() => {
      expect(region.textContent).not.toContain("Sign out everywhere else");
    });
  });

  it("offers Retry when the sessions cannot be read, which reads them again", async () => {
    const fake = new Fake().answer("sessions", refuse(503, "auth_unavailable"));
    const { region } = mount(fake, { parts: ["sessions"] });
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(defaultAccountWords["generic.unavailable"]);
    });
    await userEvent.click(button(region, "Retry"));
    expect((await sessionRows(region)).length).toBe(1);
  });
});

describe("deviceName", () => {
  const w = defaultAccountWords;
  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36 Edg/131.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) Version/18.1 Safari/605.1.15",
      "Safari on macOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    ["Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) Version/18.1 Safari/604.1", "Safari on iPadOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) OPR/114.0 Chrome/130.0 Safari/537.36", "Opera on Linux"],
    ["curl/8.10", "A browser"],
  ])("names %s as %s", (ua, name) => {
    expect(deviceName({ user_agent: ua }, w)).toBe(name);
  });

  it("prefers the session's own label", () => {
    expect(deviceName({ label: "Desk", user_agent: "Firefox/140.0" }, w)).toBe("Desk");
  });
});
