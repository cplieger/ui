import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { StateResponse, UserView } from "./client.js";
import { ALICE_USER, Fake, SESSION, TEMPORARY, meWith, ok, refuse } from "./test-helpers/fake.js";
import {
  actions,
  answerQuestion,
  button,
  dialogOf,
  errorOf,
  noticeOf,
  press,
  useScreen,
} from "./test-helpers/security.js";
import type { AccountAction } from "./run.js";
import { mountUsers, type UsersOptions } from "./users.js";
import type { FakeClient } from "./test-helpers/fake.js";

useScreen();

let life = new AbortController();
afterEach(() => {
  life.abort();
  life = new AbortController();
});

const ME: UserView = {
  ...ALICE_USER,
  id: 1,
  username: "mika",
  role: "admin",
  owner: true,
  methods: { password: true, passkey_count: 1 },
};
const SAM: UserView = {
  ...ALICE_USER,
  id: 3,
  username: "sam",
  display_name: "Sam Ortiz",
  oidc_linked: true,
  methods: {
    password: false,
    passkey_count: 0,
    totp: false,
    role_from_provider: true,
    local_methods_dormant: true,
    temporary_password: { expires_at: "2099-01-01T18:00:00Z" },
  },
};
const ROBIN: UserView = {
  ...ALICE_USER,
  id: 4,
  username: "robin",
  enabled: false,
  methods: { password: true, passkey_count: 2, waiting_approval: true },
};

const STATE: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
};

/** Checks the `.cp-choice` box worded `text` in `root`. */
async function check(root: ParentNode, text: string): Promise<void> {
  const box = [...root.querySelectorAll<HTMLLabelElement>("label.cp-choice")].find((l) =>
    l.textContent.startsWith(text),
  );
  expect(box, text).toBeDefined();
  await userEvent.click(box!.querySelector("input")!);
}

/** An owner viewer, over HTTPS, in a multi-user app. */
const owner = meWith({}, { owner: true, single_user: false });

function mount(
  fake: Fake,
  options: Partial<Omit<UsersOptions<FakeClient>, "client" | "access">> = {},
): { readonly region: HTMLElement; readonly ran: AccountAction[] } {
  const region = document.createElement("div");
  document.body.append(region);
  const ran: AccountAction[] = [];
  mountUsers(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    provider: "Authelia",
    run: (name, work) => {
      ran.push(name);
      return work();
    },
    navigate: () => undefined,
    signal: life.signal,
    ...options,
  });
  return { region, ran };
}

const people = (...list: UserView[]): Fake =>
  new Fake().always("me", ok(owner)).always("adminUsers", ok(list));

const rowsOf = (region: HTMLElement): Promise<HTMLTableRowElement[]> =>
  vi.waitFor(() => {
    const rows = [...region.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  });

const rowOf = async (region: HTMLElement, name: string): Promise<HTMLTableRowElement> => {
  const row = (await rowsOf(region)).find(
    (r) => r.cells[0]?.querySelector("span span")?.textContent === name,
  );
  expect(row, name).toBeDefined();
  return row!;
};

describe("mountUsers", () => {
  it("lists each person's role, owner badge, state and ways in", async () => {
    const { region } = mount(people(ME, ALICE_USER, SAM, ROBIN));
    const [mika, alice, sam, robin] = await rowsOf(region);
    expect(mika?.cells[0]?.querySelector(".cp-chip")?.textContent).toBe("Owner");
    expect(mika?.cells[0]?.textContent).toContain("You");
    expect(alice?.cells[1]?.textContent).toBe("User");
    expect(alice?.cells[2]?.textContent).toBe("Password, Authenticator app");
    expect(alice?.cells[3]?.textContent).toBe("Enabled");
    expect(sam?.cells[0]?.textContent).toContain("Sam Ortiz");
    expect(sam?.cells[1]?.textContent).toBe("Userfrom the identity provider");
    const samWays = [...(sam?.cells[2]?.querySelectorAll("small") ?? [])].map((s) => s.textContent);
    expect(sam?.cells[2]?.textContent).toMatch(/^Authelia/);
    expect(samWays[0]).toMatch(/^Temporary password until /);
    expect(samWays[1]).toBe("Local sign-in dormant");
    expect(robin?.cells[2]?.textContent).toBe("Password, 2 passkeys");
    expect(robin?.cells[3]?.textContent).toBe("Waiting for approval");
    expect(region.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("offers an owner every action, and nothing on their own row but Remove owner", async () => {
    const { region } = mount(people(ME, ALICE_USER));
    expect(actions(await rowOf(region, "mika"))).toEqual(["Remove owner"]);
    expect(actions(await rowOf(region, "alice"))).toEqual([
      "Edit…",
      "Issue a temporary password…",
      "Reset second factor…",
      "Delete…",
    ]);
  });

  it("lets an owner make an enabled admin an owner, after asking", async () => {
    const admin = { ...ALICE_USER, role: "admin" };
    const fake = people(ME, admin);
    const { region, ran } = mount(fake);
    await press(await rowOf(region, "alice"), "Make owner");
    await answerQuestion("Make alice an owner?", "Make owner");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("alice is an owner.");
    });
    expect(fake.named("adminSetOwner")[0]?.args).toEqual([2, { owner: true }]);
    expect(ran).toEqual(["auth.admin_owner"]);
    expect(fake.named("adminUsers").length).toBeGreaterThan(1);
  });

  it("shows an admin who is not an owner the owners, with no way to change them", async () => {
    const fake = people(ME, ALICE_USER).always("me", ok(meWith({}, { owner: false })));
    const { region } = mount(fake);
    const row = await rowOf(region, "mika");
    expect(row.cells[0]?.querySelector(".cp-chip")?.textContent).toBe("Owner");
    expect(actions(row)).toEqual([]);
    expect(actions(await rowOf(region, "alice"))).not.toContain("Make owner");
  });

  it("offers no owner actions in an app with one account", async () => {
    const fake = people(ME).always("me", ok(meWith({}, { owner: true, single_user: true })));
    const { region } = mount(fake);
    expect(actions(await rowOf(region, "mika"))).toEqual([]);
  });

  it.each([
    ["owner_needs_local_method", "An owner needs a password or a passkey."],
    ["last_owner", "This is the last owner. Make someone else an owner first."],
  ])("words the owner refusal %s", async (reason, said) => {
    const fake = people(ME).answer("adminSetOwner", refuse(403, "auth_forbidden", reason));
    const { region } = mount(fake);
    await press(await rowOf(region, "mika"), "Remove owner");
    await answerQuestion("Remove mika as an owner?", "Remove owner");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(said);
    });
  });

  it("resets a second factor after a danger question naming the person", async () => {
    const fake = people(ME, ALICE_USER);
    const { region, ran } = mount(fake);
    await press(await rowOf(region, "alice"), "Reset second factor…");
    const d = await dialogOf("Reset alice's second factor?");
    expect(d.textContent).toContain("Their password and passkeys stay.");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await userEvent.click(button(d, "Reset second factor"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("alice's second factor is reset.");
    });
    expect(fake.named("adminResetSecondFactor")[0]?.args).toEqual([2]);
    expect(ran).toEqual(["auth.admin_reset_second_factor"]);
  });

  it("offers no reset to a person with no authenticator app", async () => {
    const { region } = mount(
      people(ME, { ...ALICE_USER, methods: { password: true, passkey_count: 0 } }),
    );
    expect(actions(await rowOf(region, "alice"))).not.toContain("Reset second factor…");
  });

  it("issues a temporary password and shows it once with the words to pass on", async () => {
    const fake = people(ME, { ...ALICE_USER, methods: { password: true, passkey_count: 1 } });
    const { region, ran } = mount(fake);
    await press(await rowOf(region, "alice"), "Issue a temporary password…");
    const d = await dialogOf("Issue a temporary password for alice");
    expect(d.textContent).toContain("signs alice out everywhere");
    await check(d, "Also revoke passkeys");
    await userEvent.click(button(d, "Issue"));
    const shown = await dialogOf("Temporary password for alice");
    expect(shown.querySelector("code")?.textContent).toBe(TEMPORARY.password);
    expect(shown.textContent).toContain("Give alice this temporary password. It works once, until");
    expect(shown.textContent).not.toContain("plain address");
    expect(fake.named("adminTemporaryPassword")[0]?.args).toEqual([
      2,
      { ttl_hours: 24, revoke_passkeys: true },
    ]);
    expect(ran).toEqual(["auth.admin_temporary_password"]);
    await userEvent.click(button(shown, "Done"));
  });

  it("adds the HTTPS sentence when the password works only there", async () => {
    const fake = people(ME, ALICE_USER).answer(
      "adminTemporaryPassword",
      ok({ ...TEMPORARY, https_only: true, https_origin: "https://tracker.example" }),
    );
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Issue a temporary password…");
    await userEvent.click(button(await dialogOf("Issue a temporary password for alice"), "Issue"));
    const shown = await dialogOf("Temporary password for alice");
    expect(shown.textContent).toContain(
      "Enter it on https://tracker.example. It does not work on the plain address.",
    );
  });

  it("words a dormant password by the answer, never by the mode the page read", async () => {
    const fake = people(ME, ALICE_USER).answer(
      "adminTemporaryPassword",
      ok({
        ...TEMPORARY,
        dormant: true,
        password_kept: true,
        https_origin: "https://tracker.example",
      }),
    );
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Issue a temporary password…");
    await userEvent.click(button(await dialogOf("Issue a temporary password for alice"), "Issue"));
    const shown = await dialogOf("Temporary password for alice");
    expect(shown.textContent).toContain(
      "Ask alice to sign in with Authelia, choose Link to an existing account, and enter this temporary password on https://tracker.example.",
    );
    expect(shown.textContent).toContain("alice's current password stays");
  });

  it("refuses a temporary password for the admin's own account in words", async () => {
    const fake = people(ME, ALICE_USER).answer(
      "adminTemporaryPassword",
      refuse(403, "auth_forbidden", "self_recovery"),
    );
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Issue a temporary password…");
    await userEvent.click(button(await dialogOf("Issue a temporary password for alice"), "Issue"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Use Account and security for your own account.");
    });
  });

  it("offers a linked person only Unlink and issue under a single sign-on mode", async () => {
    const fake = people(ME, SAM).always("state", ok({ ...STATE, sso: "for_linked" as const }));
    const { region } = mount(fake);
    expect(actions(await rowOf(region, "sam"))).toEqual([
      "Edit…",
      "Unlink single sign-on…",
      "Unlink and issue a temporary password…",
      "Delete…",
    ]);
  });

  const OWN_WAY: UserView = { ...SAM, methods: { password: true, passkey_count: 0 } };
  it.each([
    ["alongside", SAM, "cannot sign in until an admin issues a temporary password"],
    ["alongside", OWN_WAY, "own password or passkey"],
    ["only", OWN_WAY, "only through an admin's link"],
  ] as const)("says under %s what an unlinked person can do next", async (mode, user, next) => {
    const fake = people(ME, user).always("state", ok({ ...STATE, sso: mode }));
    const { region, ran } = mount(fake);
    await press(await rowOf(region, "sam"), "Unlink single sign-on…");
    const d = await dialogOf("Unlink sam from Authelia?");
    expect(d.textContent).toContain(next);
    await userEvent.click(button(d, "Unlink"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("sam is unlinked from Authelia.");
    });
    expect(ran).toEqual(["auth.admin_unlink_oidc"]);
  });

  it("unlinks and issues a temporary password in one step", async () => {
    const fake = people(ME, SAM);
    const { region, ran } = mount(fake);
    await press(await rowOf(region, "sam"), "Unlink and issue a temporary password…");
    const d = await dialogOf("Unlink sam and issue a temporary password");
    await check(d, "Keep API keys");
    await userEvent.click(button(d, "Unlink and issue"));
    await dialogOf("Temporary password for sam");
    expect(fake.named("adminRelinkOIDC")[0]?.args).toEqual([3, { ttl_hours: 24, keep_keys: true }]);
    expect(ran).toEqual(["auth.admin_relink_oidc"]);
  });

  it("approves a waiting registration by enabling it", async () => {
    const fake = people(ME, ROBIN);
    const { region, ran } = mount(fake);
    const row = await rowOf(region, "robin");
    await press(row, "Approve");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("robin can sign in now.");
    });
    expect(fake.named("adminUpdateUser")[0]?.args).toEqual([4, { enabled: true }]);
    expect(ran).toEqual(["auth.admin_user_update"]);
  });

  it("edits a role, and keeps an owner's role refusal on its field", async () => {
    const fake = people(ME, ALICE_USER).answer(
      "adminUpdateUser",
      refuse(403, "auth_forbidden", "owner_role"),
    );
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Edit…");
    const d = await dialogOf("Edit alice");
    const select = d.querySelector("select")!;
    await userEvent.selectOptions(select, "admin");
    await userEvent.click(button(d, "Save"));
    await vi.waitFor(() => {
      expect(errorOf(select)).toBe("An owner is always an admin. Remove them as an owner first.");
    });
    expect(fake.named("adminUpdateUser")[0]?.args).toEqual([2, { role: "admin" }]);
  });

  it("re-reads the list after a change, so the row facts are the server's", async () => {
    const fake = people(ME, ALICE_USER);
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Delete…");
    await answerQuestion("Delete alice?", "Delete user");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("alice is deleted.");
    });
    expect(fake.named("adminUsers")).toHaveLength(2);
  });

  it("holds Issue on a plain session with Needs HTTPS", async () => {
    const fake = people(ME, ALICE_USER).always(
      "me",
      ok(meWith({}, { owner: true, session: { ...SESSION, secure: false } })),
    );
    const { region } = mount(fake);
    const row = await rowOf(region, "alice");
    const item = [...row.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
      (i) => i.textContent === "Issue a temporary password…",
    );
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toContain("Needs HTTPS.");
  });

  it("says only an admin can see the users when the list is refused", async () => {
    const fake = new Fake().always("adminUsers", refuse(403, "auth_forbidden"));
    const { region } = mount(fake);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe("Only an administrator can see the users.");
    });
  });

  it("offers Retry when the list cannot be read", async () => {
    const fake = new Fake()
      .answer("adminUsers", refuse(503, "auth_unavailable"))
      .always("me", ok(owner));
    fake.always("adminUsers", ok([ME]));
    const { region } = mount(fake);
    await userEvent.click(await vi.waitFor(() => button(region, "Retry")));
    await rowOf(region, "mika");
  });
});
