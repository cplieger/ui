import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { KeyView } from "./client.js";
import type { KeyScopes } from "./keys.js";
import { BACKUP, Fake, SESSION, meWith, ok, refuse } from "./test-helpers/fake.js";
import {
  actions,
  answerQuestion,
  button,
  dialogOf,
  errorOf,
  field,
  mount,
  noticeOf,
  press,
  useScreen,
} from "./test-helpers/security.js";

useScreen();

const SCOPES: KeyScopes = {
  levels: [
    { value: "read", label: "Read", line: "See releases." },
    { value: "write", label: "Read and change" },
  ],
  permissions: [{ value: "users", label: "Manage users", line: "Invite and reset people." }],
};

const hour = (n: number): string => new Date(Date.now() + n * 3_600_000).toISOString();

const CI: KeyView = {
  ...BACKUP,
  id: 14,
  label: "ci",
  prefix: "rt_9fk",
  suffix: "q2Z",
  scopes: ["write", "users"],
  previous_until: hour(0.5),
};
const CHILD: KeyView = { ...BACKUP, id: 15, label: "deploy", parent_key_id: 14 };
const OLD: KeyView = { ...BACKUP, id: 9, label: "old laptop", expires_at: "2026-11-03T10:00:00Z" };
const UNNAMED: KeyView = { ...BACKUP, id: 3, label: "", scopes: [] };

const KEY_PARTS = ["keys", "key-rotate"] as const;

/** The keys table's rows, once it is drawn. */
const keyRows = (region: HTMLElement): Promise<HTMLTableRowElement[]> =>
  vi.waitFor(() => {
    const rows = [...region.querySelectorAll<HTMLTableRowElement>("[data-part='keys'] tbody tr")];
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  });

const keyRow = async (region: HTMLElement, label: string): Promise<HTMLTableRowElement> => {
  const rows = await keyRows(region);
  const row = rows.find((r) => r.cells[0]?.querySelector("span")?.textContent === label);
  expect(row, label).toBeDefined();
  return row as HTMLTableRowElement;
};

const keysSection = (region: HTMLElement): HTMLElement =>
  region.querySelector("[data-part='keys']")?.closest("section") as HTMLElement;

const stateOf = (row: HTMLTableRowElement): string =>
  row.querySelector(".cp-state")?.textContent ?? "";

/** Opens Create key… and answers its dialog. */
async function openCreate(region: HTMLElement): Promise<HTMLDialogElement> {
  await vi.waitFor(() => {
    expect(region.querySelector("[data-cp-action='key-create']")).not.toBeNull();
  });
  await userEvent.click(region.querySelector("[data-cp-action='key-create']") as HTMLElement);
  return dialogOf("Create an API key");
}

const choose = async (d: HTMLDialogElement, label: string): Promise<void> => {
  const choice = [...d.querySelectorAll("label.cp-choice")].find((c) =>
    c.textContent.startsWith(label),
  );
  expect(choice, label).toBeDefined();
  await userEvent.click(choice?.querySelector("input") as HTMLInputElement);
};

describe("mountSecurity: API keys", () => {
  it("lists each key with its ends, scopes, dates and state", async () => {
    const fake = new Fake().answer("keys", ok([BACKUP, CI, CHILD, OLD, UNNAMED]));
    const { region } = mount(fake, { parts: [...KEY_PARTS], scopes: SCOPES });
    const backup = await keyRow(region, "backup script");
    // Word joiners hold the two ends together; a reader sees only them.
    expect(backup.cells[1]?.textContent).toBe("rt_exa\u2060…\u2060nce");
    expect(backup.cells[1]?.querySelector(".cp-mono")).not.toBeNull();
    expect(backup.cells[2]?.textContent).toBe("Read");
    expect(backup.cells[3]?.textContent).toBe("Never");
    expect(backup.cells[4]?.querySelector("time")?.dateTime).toBe(BACKUP.last_used_at);
    expect(stateOf(backup)).toBe("Active");
    expect(actions(backup)).toEqual(["Rename…", "Rotate…", "Revoke…"]);

    const ci = await keyRow(region, "ci");
    expect(
      [...(ci.cells[2]?.querySelectorAll(".cp-chip") ?? [])].map((c) => c.textContent),
    ).toEqual(["Read and change", "Manage users"]);
    expect(stateOf(ci)).toMatch(/^Retiring until /);
    expect(ci.querySelector(".cp-state")?.getAttribute("data-tone")).toBe("warning");
    expect(ci.textContent).toContain("The old key works until this machine first uses the new one");

    expect((await keyRow(region, "deploy")).cells[0]?.textContent).toContain("Minted by ci");
    const old = await keyRow(region, "old laptop");
    expect(stateOf(old)).toMatch(/^Expired /);
    expect(actions(old)).toEqual(["Rename…", "Revoke…"]);
    const unnamed = await keyRow(region, "Unnamed key");
    expect(unnamed.cells[2]?.textContent).toBe("None");
    expect(region.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("names a minting key that is gone by its id", async () => {
    const fake = new Fake().answer("keys", ok([CHILD]));
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    expect((await keyRow(region, "deploy")).cells[0]?.textContent).toContain(
      "Minted by revoked key 14",
    );
  });

  it("offers no Rotate without its part, and no Rename without the call", async () => {
    const fake = new Fake().answer("keys", ok([BACKUP])).without("renameKey");
    const { region } = mount(fake, { parts: ["keys"] });
    expect(actions(await keyRow(region, "backup script"))).toEqual(["Revoke backup script…"]);
  });

  it("holds the empty state's Create key, and the host's line in its place", async () => {
    const empty = mount(new Fake(), { parts: [...KEY_PARTS] });
    await vi.waitFor(() => {
      const box = empty.region.querySelector("[data-part='keys'] .cp-empty");
      expect(box?.textContent).toContain("No API keys yet.");
      expect(box?.querySelector("[data-cp-action='key-create']")).not.toBeNull();
    });
    empty.region.remove();
    const elsewhere = mount(new Fake().answer("keys", ok([BACKUP])), {
      parts: [...KEY_PARTS],
      keysCreatedElsewhere: { words: "An admin makes keys for you.", href: "/admin/keys" },
    });
    await keyRows(elsewhere.region);
    const link = elsewhere.region.querySelector<HTMLAnchorElement>("[data-part='keys'] p a");
    expect(link?.textContent).toBe("An admin makes keys for you.");
    expect(link?.getAttribute("href")).toBe("/admin/keys");
    expect(elsewhere.region.querySelector("[data-cp-action='key-create']")).toBeNull();
  });
});

describe("mountSecurity: Create key", () => {
  it("refuses an empty or over-long label, and no scope, before sending", async () => {
    const fake = new Fake();
    const { region } = mount(fake, { parts: [...KEY_PARTS], scopes: SCOPES });
    const d = await openCreate(region);
    const label = field(d, "label");
    expect(document.activeElement).toBe(label);
    await userEvent.click(button(d, "Create key"));
    expect(errorOf(label)).toBe("Give the key a name.");
    await userEvent.fill(label, "x".repeat(129));
    await userEvent.click(button(d, "Create key"));
    expect(errorOf(label)).toBe("Use at most 128 characters.");
    await userEvent.fill(label, "backup script");
    await userEvent.click(button(d, "Create key"));
    const first = d.querySelector<HTMLInputElement>(".cp-choices input") as HTMLInputElement;
    expect(errorOf(first)).toBe("Choose a level or a permission.");
    await choose(d, "No level");
    await userEvent.click(button(d, "Create key"));
    expect(errorOf(first)).toBe("Choose a level or a permission.");
    expect(fake.named("createKey")).toHaveLength(0);
  });

  it("sends the label, the level and permissions and the lifetime, then shows the key once", async () => {
    const fake = new Fake().answer(
      "keys",
      ok([]),
      ok([{ ...BACKUP, id: 20, label: "ci", scopes: ["write", "users"] }]),
    );
    const { region, ran } = mount(fake, { parts: [...KEY_PARTS], scopes: SCOPES });
    const d = await openCreate(region);
    expect(d.querySelector("legend")?.textContent).toBe("Access level");
    expect(d.textContent).toContain("Invite and reset people.");
    await userEvent.fill(field(d, "label"), "  ci ");
    await choose(d, "Read and change");
    await choose(d, "Manage users");
    await userEvent.click(button(d, "Create key"));
    const shown = await dialogOf("New key for ci");
    expect(shown.querySelector("code")?.textContent).toBe("rt_example_new_secret");
    expect(shown.querySelector("code")?.tabIndex).toBe(0);
    expect(fake.named("createKey")[0]?.args).toEqual([
      { label: "ci", scopes: ["write", "users"], expires_in_days: 90 },
    ]);
    expect(ran).toEqual(["auth.api_key_create"]);
    await userEvent.click(button(shown, "Done"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe("ci is ready to use.");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Actions for ci");
    });
  });

  it("makes a key that never expires with no lifetime and, with no scopes, none", async () => {
    const fake = new Fake();
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    const d = await openCreate(region);
    expect(d.querySelector(".cp-choices")).toBeNull();
    await userEvent.fill(field(d, "label"), "agent");
    await userEvent.selectOptions(d.querySelector("select") as HTMLSelectElement, "Never");
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(fake.named("createKey")[0]?.args).toEqual([{ label: "agent", scopes: [] }]);
    });
  });

  it("keeps the dialog on a taken label, an unknown scope and an empty label's answer", async () => {
    const fake = new Fake().answer(
      "createKey",
      refuse(409, "auth_key_label_taken"),
      refuse(400, "auth_unknown_scope"),
      refuse(400, "auth_bad_request", "label_empty"),
      refuse(503, "auth_unavailable"),
    );
    const { region } = mount(fake, { parts: [...KEY_PARTS], scopes: SCOPES });
    const d = await openCreate(region);
    const label = field(d, "label");
    await userEvent.fill(label, "Agent");
    await choose(d, "Manage users");
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(errorOf(label)).toBe("You already have a key named Agent.");
    });
    await userEvent.fill(label, "Agent 2");
    await userEvent.click(button(d, "Create key"));
    const first = d.querySelector<HTMLInputElement>(".cp-choices input") as HTMLInputElement;
    await vi.waitFor(() => {
      expect(errorOf(first)).toBe("This app has no scope named Manage users.");
    });
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(errorOf(label)).toBe("Give the key a name.");
    });
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(noticeOf(d)).toBe("The app cannot do this right now. Try again in a few seconds.");
    });
    expect(d.open).toBe(true);
  });

  it("closes on a final refusal and says it in the section", async () => {
    const fake = new Fake().answer(
      "createKey",
      refuse(401, "auth_key_invalid"),
      refuse(400, "auth_bad_request"),
    );
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    let d = await openCreate(region);
    await userEvent.fill(field(d, "label"), "agent");
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "Your sign-in did not check out. Sign in again, then try once more.",
      );
    });
    d = await openCreate(region);
    await userEvent.fill(field(d, "label"), "agent");
    await userEvent.click(button(d, "Create key"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "The server could not do this. Try again in a moment.",
      );
    });
  });

  it("asks to confirm it is you when the server wants a recent sign-in", async () => {
    const fake = new Fake().answer("createKey", refuse(401, "auth_recent_auth_required"));
    // Step-up offers only the ways whose routes the host mounts.
    const { region } = mount(fake, { parts: [...KEY_PARTS, "password"] });
    const d = await openCreate(region);
    await userEvent.fill(field(d, "label"), "agent");
    await userEvent.click(button(d, "Create key"));
    const up = await dialogOf("Confirm it is you");
    expect(document.getElementById(up.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Creating a key needs a recent sign-in.",
    );
    await userEvent.fill(field(up, "password"), "old words here");
    await userEvent.click(button(up, "Confirm"));
    await dialogOf("New key for agent");
    expect(fake.named("createKey")).toHaveLength(2);
  });
});

describe("mountSecurity: Rename, Rotate and Revoke", () => {
  it("renames a key in its cell, a taken label kept on the field", async () => {
    const fake = new Fake()
      .answer("keys", ok([BACKUP]), ok([{ ...BACKUP, label: "nightly backup" }]))
      .answer("renameKey", refuse(409, "auth_key_label_taken"));
    const { region, ran } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "backup script"), "Rename…");
    const input = region.querySelector<HTMLInputElement>("[data-part='keys'] input");
    expect(input?.getAttribute("aria-label")).toBe("Rename backup script");
    await userEvent.keyboard("{Control>}a{/Control}ci{Enter}");
    await vi.waitFor(() => {
      expect(errorOf(input as HTMLInputElement)).toBe("You already have a key named ci.");
    });
    await userEvent.keyboard("{Control>}a{/Control}nightly backup{Enter}");
    await vi.waitFor(async () => {
      expect((await keyRows(region))[0]?.cells[0]?.textContent).toBe("nightly backup");
    });
    expect(fake.named("renameKey").map((c) => c.args)).toEqual([
      [12, { name: "ci" }],
      [12, { name: "nightly backup" }],
    ]);
    expect(ran).toEqual(["auth.api_key_rename", "auth.api_key_rename"]);
  });

  it("says a key is gone and reads the list again", async () => {
    const fake = new Fake()
      .answer("keys", ok([BACKUP]), ok([]))
      .answer("renameKey", refuse(404, "auth_not_found"));
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "backup script"), "Rename…");
    await userEvent.keyboard("{Control>}a{/Control}x{Enter}");
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe("This key is gone.");
      expect(region.querySelector("[data-part='keys'] .cp-empty")).not.toBeNull();
    });
  });

  it("rotates after naming the key and the overlap, then shows the new secret once", async () => {
    const until = hour(0.75);
    const fake = new Fake()
      .answer("keys", ok([BACKUP]), ok([{ ...BACKUP, previous_until: until }]))
      .answer(
        "rotateKey",
        ok({ key: "rt_new_secret", details: { ...BACKUP, previous_until: until } }),
      );
    const { region, ran } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "backup script"), "Rotate…");
    const q = await dialogOf("Rotate backup script?");
    expect(q.textContent).toContain("or for 1 hour.");
    expect(q.textContent).toContain("Lost or leaked? Revoke it instead.");
    await userEvent.click(button(q, "Rotate key"));
    const shown = await dialogOf("New secret for backup script");
    expect(shown.querySelector("code")?.textContent).toBe("rt_new_secret");
    expect(shown.textContent).toContain("or as soon as the new one is used.");
    expect(fake.named("rotateKey")[0]?.args).toEqual([12]);
    expect(ran).toEqual(["auth.api_key_rotate"]);
    await userEvent.click(button(shown, "Done"));
    const row = await vi.waitFor(async () => {
      const r = await keyRow(region, "backup script");
      expect(stateOf(r)).toMatch(/^Retiring until /);
      return r;
    });
    await press(row, "Rotate…");
    const again = await dialogOf("Rotate backup script?");
    expect(again.textContent).toContain("or for 45 minutes.");
    expect(again.textContent).toContain("The secret from the last rotation stops working at once.");
  });

  it("words each refusal of a rotation, with Retry only when the app is unavailable", async () => {
    const fake = new Fake()
      .answer("keys", ok([BACKUP]))
      .answer(
        "rotateKey",
        refuse(403, "auth_forbidden", "key_expired"),
        refuse(503, "auth_unavailable"),
        refuse(403, "auth_session_required"),
      );
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    const rotate = async (): Promise<void> => {
      await press(await keyRow(region, "backup script"), "Rotate…");
      await answerQuestion("Rotate backup script?", "Rotate key");
    };
    await rotate();
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "This key has expired. Revoke it, or create a new one.",
      );
    });
    expect(keysSection(region).querySelector(".cp-notice button")).toBeNull();
    await rotate();
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    await userEvent.click(button(keysSection(region), "Retry"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "Only a signed-in session can do this, not an API key.",
      );
    });
    expect(fake.named("rotateKey")).toHaveLength(3);
  });

  it("makes a key like it, then revokes the old one, on a client with no rotation", async () => {
    const expiring = { ...BACKUP, expires_at: hour(24 * 10 - 1) };
    const fake = new Fake().answer("keys", ok([expiring])).without("rotateKey");
    const { region, ran } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "backup script"), "Rotate…");
    await answerQuestion("Rotate backup script?", "Rotate key");
    const shown = await dialogOf("New secret for backup script");
    expect(shown.textContent).toContain("The old key is revoked.");
    expect(fake.named("createKey")[0]?.args).toEqual([
      { label: "backup script", scopes: ["read"], expires_in_days: 10 },
    ]);
    expect(fake.named("revokeKey")[0]?.args).toEqual([12]);
    expect(ran).toEqual(["auth.api_key_rotate", "auth.api_key_revoke"]);
  });

  it("keeps the new key shown when the old one cannot be revoked", async () => {
    const fake = new Fake()
      .answer("keys", ok([BACKUP]))
      .answer("revokeKey", refuse(503, "auth_unavailable"))
      .without("rotateKey");
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "backup script"), "Rotate…");
    await answerQuestion("Rotate backup script?", "Rotate key");
    const shown = await dialogOf("New secret for backup script");
    expect(shown.textContent).not.toContain("The old key is revoked.");
    await userEvent.click(button(shown, "Done"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe(
        "The new key is made, but the old one could not be revoked. Revoke it in the list.",
      );
    });
  });

  it("revokes after a danger question that counts the keys it minted", async () => {
    const fake = new Fake().answer("keys", ok([CI, CHILD, BACKUP]), ok([BACKUP]));
    const { region, ran } = mount(fake, { parts: [...KEY_PARTS] });
    await press(await keyRow(region, "ci"), "Revoke…");
    const q = await dialogOf("Revoke ci and the key it minted?");
    expect(q.textContent).toContain("both its current and its previous secret");
    await userEvent.click(button(q, "Revoke key"));
    await vi.waitFor(() => {
      expect(noticeOf(keysSection(region))).toBe("ci is revoked.");
    });
    expect(fake.named("revokeKey")[0]?.args).toEqual([14]);
    expect(ran).toEqual(["auth.api_key_revoke"]);
    expect(await keyRows(region)).toHaveLength(1);
  });

  it("reads the keys again at a retiring key's end, and when the window gets focus", async () => {
    const fake = new Fake().answer(
      "keys",
      ok([{ ...BACKUP, previous_until: new Date(Date.now() + 300).toISOString() }]),
      ok([BACKUP]),
      ok([BACKUP]),
    );
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    expect(stateOf(await keyRow(region, "backup script"))).toMatch(/^Retiring until /);
    await vi.waitFor(
      async () => {
        expect(stateOf(await keyRow(region, "backup script"))).toBe("Active");
      },
      { timeout: 5000 },
    );
    window.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(() => {
      expect(fake.named("keys")).toHaveLength(3);
    });
  });

  it("holds Create key and Rotate on a plain session, with the way to HTTPS", async () => {
    const fake = new Fake()
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
      .answer("me", ok(meWith({}, { session: { ...SESSION, secure: false } })))
      .answer("keys", ok([BACKUP]));
    const { region } = mount(fake, { parts: [...KEY_PARTS] });
    const row = await keyRow(region, "backup script");
    const create = region.querySelector("[data-cp-action='key-create']") as HTMLElement;
    expect(create.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(create.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Needs HTTPS. Open Release tracker over HTTPS.");
    const rotate = row.querySelector("[data-cp-action='key-rotate-12']") as HTMLElement;
    expect(rotate.getAttribute("aria-disabled")).toBe("true");
    // One line serves Create key and every row's Rotate.
    expect(rotate.getAttribute("aria-describedby")).toBe(create.getAttribute("aria-describedby"));
    expect(region.querySelectorAll("[data-part='keys'] .cp-help")).toHaveLength(1);
  });
});
