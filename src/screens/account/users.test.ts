import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { KeyView, StateResponse, TokenView, UserView } from "./client.js";
import {
  ALICE_USER,
  BACKUP,
  Fake,
  SESSION,
  TEMPORARY,
  meWith,
  ok,
  refuse,
} from "./test-helpers/fake.js";
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
import { mountUsers, type UsersOptions, type UsersScreen } from "./users.js";
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
  secure: true,
  https_required: [],
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
): {
  readonly region: HTMLElement;
  readonly ran: AccountAction[];
  readonly screen: UsersScreen;
} {
  const region = document.createElement("div");
  document.body.append(region);
  const ran: AccountAction[] = [];
  const screen = mountUsers(region, {
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
  return { region, ran, screen };
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

  it("draws the newest of two reads, whichever answers last", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = new Fake()
      .always("me", ok(owner))
      .answer("adminUsers", ok([ME, ALICE_USER]), () => late.promise)
      .always("adminUsers", ok([ME]));
    const { region, screen } = mount(fake);
    await rowOf(region, "alice");
    const first = screen.refresh();
    await screen.refresh();
    expect(await rowsOf(region)).toHaveLength(1);
    late.resolve(ok([ME, ALICE_USER]));
    await first;
    expect(fake.named("adminUsers")).toHaveLength(3);
    expect(await rowsOf(region)).toHaveLength(1);
    expect(region.textContent).not.toContain("alice");
  });

  it("leaves focus where it is when the host refreshes", async () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    const fake = people(ME, ALICE_USER);
    const { region, screen } = mount(fake);
    await rowOf(region, "alice");
    outside.focus();
    await screen.refresh();
    expect(fake.named("adminUsers")).toHaveLength(2);
    expect(document.activeElement).toBe(outside);
  });

  it("returns focus to the edited row when a newer read answers for its save", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = people(ME, ALICE_USER);
    const { region, screen } = mount(fake);
    await press(await rowOf(region, "alice"), "Edit…");
    const d = await dialogOf("Edit alice");
    await userEvent.selectOptions(d.querySelector("select")!, "admin");
    fake.answer("adminUsers", () => late.promise);
    await userEvent.click(button(d, "Save"));
    await vi.waitFor(() => {
      expect(fake.named("adminUsers")).toHaveLength(2);
    });
    await screen.refresh();
    const alice = await rowOf(region, "alice");
    await vi.waitFor(() => {
      expect(alice.contains(document.activeElement)).toBe(true);
    });
    late.resolve(ok([ME, ALICE_USER]));
  });

  it("keeps the newest answer drawn while an older load waits past the sketch's delay", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = people(ME, ALICE_USER).answer("adminUsers", () => late.promise);
    const { region, screen } = mount(fake);
    await screen.refresh();
    await rowOf(region, "alice");
    // Past the skeleton's 150 ms show delay, while the first load waits.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(region.querySelector(".cp-skeleton")).toBeNull();
    late.resolve(ok([ME]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(region.querySelector(".cp-skeleton")).toBeNull();
    await rowOf(region, "alice");
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

  it("names this page's address when the answer's HTTPS address is not an HTTPS origin", async () => {
    const fake = people(ME, ALICE_USER).answer(
      "adminTemporaryPassword",
      ok({ ...TEMPORARY, https_only: true, https_origin: "javascript:alert(1)" }),
    );
    const { region } = mount(fake);
    await press(await rowOf(region, "alice"), "Issue a temporary password…");
    await userEvent.click(button(await dialogOf("Issue a temporary password for alice"), "Issue"));
    const shown = await dialogOf("Temporary password for alice");
    expect(shown.textContent).toContain(`Enter it on ${location.origin}.`);
    expect(shown.textContent).not.toContain("javascript:");
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

  it("adds a user with no way in, then shows the temporary password once", async () => {
    const fake = people(ME);
    const { region, ran } = mount(fake);
    await userEvent.click(await vi.waitFor(() => button(region, "Add user…")));
    const d = await dialogOf("Add a user");
    await userEvent.fill(d.querySelector<HTMLInputElement>("input[name='username']")!, "  noor ");
    await userEvent.selectOptions(d.querySelector("select[name='role']")!, "admin");
    await userEvent.selectOptions(d.querySelector("select[name='ttl_hours']")!, "72");
    await userEvent.click(button(d, "Add user"));
    const shown = await dialogOf("Temporary password for noor");
    expect(shown.querySelector("code")?.textContent).toBe(TEMPORARY.password);
    expect(fake.named("adminCreateUser")[0]?.args).toEqual([{ username: "noor", role: "admin" }]);
    expect(fake.named("adminTemporaryPassword")[0]?.args).toEqual([9, { ttl_hours: 72 }]);
    expect(ran).toEqual(["auth.admin_user_create", "auth.admin_temporary_password"]);
    expect(noticeOf(region)).toBe("noor is added.");
  });

  it.each([
    ["auth_username_taken", undefined, "That username is taken. Choose another."],
    ["auth_username_invalid", "disallowed_character", undefined],
  ] as const)("keeps %s on the username field", async (code, reason, said) => {
    const fake = people(ME).answer("adminCreateUser", refuse(400, code, reason));
    const { region } = mount(fake);
    await userEvent.click(await vi.waitFor(() => button(region, "Add user…")));
    const d = await dialogOf("Add a user");
    const name = d.querySelector<HTMLInputElement>("input[name='username']")!;
    await userEvent.fill(name, "noor");
    await userEvent.click(button(d, "Add user"));
    await vi.waitFor(() => {
      expect(errorOf(name)).not.toBe("");
    });
    if (said !== undefined) {
      expect(errorOf(name)).toBe(said);
    }
    expect(d.open).toBe(true);
    expect(fake.named("adminTemporaryPassword")).toHaveLength(0);
  });

  it("refuses an empty username before sending", async () => {
    const fake = people(ME);
    const { region } = mount(fake);
    await userEvent.click(await vi.waitFor(() => button(region, "Add user…")));
    const d = await dialogOf("Add a user");
    await userEvent.click(button(d, "Add user"));
    expect(errorOf(d.querySelector<HTMLInputElement>("input[name='username']")!)).not.toBe("");
    expect(fake.named("adminCreateUser")).toHaveLength(0);
  });

  it("says a new user has no temporary password when issuing it failed", async () => {
    const fake = people(ME).answer("adminTemporaryPassword", refuse(503, "auth_unavailable"));
    const { region } = mount(fake);
    await userEvent.click(await vi.waitFor(() => button(region, "Add user…")));
    const d = await dialogOf("Add a user");
    await userEvent.fill(d.querySelector<HTMLInputElement>("input[name='username']")!, "noor");
    await userEvent.click(button(d, "Add user"));
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "noor is added, but no temporary password was issued. Use Issue a temporary password… on their row.",
      );
    });
  });

  it("makes an invite link and shows it once, its token in the fragment", async () => {
    const fake = people(ME);
    const { region, ran } = mount(fake, { invitePath: "/join" });
    await userEvent.click(await vi.waitFor(() => button(region, "Invite…")));
    const d = await dialogOf("Invite someone");
    expect(d.querySelector<HTMLSelectElement>("select[name='hours']")?.value).toBe("168");
    await userEvent.selectOptions(d.querySelector("select[name='hours']")!, "24");
    await userEvent.click(button(d, "Make the link"));
    const shown = await dialogOf("Invite link");
    expect(shown.querySelector("code")?.textContent).toBe(
      `${location.origin}/join#token=inv-test-token`,
    );
    expect(fake.named("adminInvite")[0]?.args).toEqual([{ role: "user", hours: 24 }]);
    expect(ran).toEqual(["auth.admin_invite"]);
    expect(fake.named("adminTokens").length).toBeGreaterThan(0);
  });

  it("holds Add user and Invite on a plain session", async () => {
    const fake = people(ME).always(
      "me",
      ok(meWith({}, { owner: true, session: { ...SESSION, secure: false } })),
    );
    const { region } = mount(fake);
    const add = await vi.waitFor(() => button(region, "Add user…"));
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(button(region, "Invite…").getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(add.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Needs HTTPS.",
    );
    add.click();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("offers no Add user, Invite or invites in an app with one account", async () => {
    const fake = people(ME).always("me", ok(meWith({}, { owner: true, single_user: true })));
    const { region } = mount(fake);
    await rowOf(region, "mika");
    expect(region.textContent).not.toContain("Add user…");
    expect(region.querySelector("[data-part='invites']")).toBeNull();
  });
});

const CI: KeyView = { ...BACKUP, id: 12, label: "ci", username: "mika", scopes: ["manage_users"] };
const NIGHTLY: KeyView = {
  ...BACKUP,
  id: 14,
  label: "nightly",
  username: "mika",
  parent_key_id: 12,
};
const BOT: UserView = { ...ALICE_USER, id: 5, username: "bot", key_lineage: [12, 14] };
const KAI: UserView = { ...ALICE_USER, id: 6, username: "kai", key_lineage: [9] };
const FROM_ADMIN: TokenView = {
  purpose: "invite",
  role: "user",
  created_at: "2026-11-14T09:00:00Z",
  expires_at: "2099-01-01T09:00:00Z",
};
const FROM_NIGHTLY: TokenView = {
  ...FROM_ADMIN,
  role: "admin",
  issued_by_key: 14,
  issuer_lineage: [12, 14],
};

const reached = (): Fake =>
  people(ME, BOT, KAI)
    .always("adminKeys", ok([CI, NIGHTLY]))
    .always("adminTokens", ok([FROM_ADMIN, FROM_NIGHTLY]));

const section = (region: HTMLElement, part: string): Promise<HTMLElement> =>
  vi.waitFor(() => {
    const s = region.querySelector<HTMLElement>(`[data-part='${part}']`);
    expect(s, part).not.toBeNull();
    return s!;
  });

describe("mountUsers, who a key reached", () => {
  it("shows each person's key path root first, a gone key by its id", async () => {
    const { region } = mount(reached());
    const bot = await rowOf(region, "bot");
    const crumbs = bot.querySelector("nav.cp-crumbs")!;
    expect(crumbs.getAttribute("aria-label")).toBe("Keys that last acted on bot");
    expect([...crumbs.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["ci", "nightly"]);
    expect(crumbs.querySelector("a")?.getAttribute("href")).toMatch(/[?&]key=12$/);
    const kai = await rowOf(region, "kai");
    expect(kai.querySelector("nav.cp-crumbs a")?.textContent).toBe("revoked key 9");
  });

  it("names each key's owner from the username the every-account list carries", async () => {
    const fake = people(ME, BOT, KAI)
      .always("adminKeys", ok([CI, { ...NIGHTLY, username: "alice" }]))
      .always("adminTokens", ok([]));
    const { region } = mount(fake);
    const keys = await section(region, "admin-keys");
    const owners = await vi.waitFor(() => {
      const heads = [...keys.querySelectorAll("thead th")].map((th) => th.textContent);
      const at = heads.indexOf("Belongs to");
      expect(at, heads.join()).toBeGreaterThan(-1);
      const rows = [...keys.querySelectorAll<HTMLTableRowElement>("tbody tr")];
      expect(rows).toHaveLength(2);
      return rows.map((r) => r.cells[at]?.textContent);
    });
    expect(owners).toEqual(["mika", "alice"]);
  });

  it("names a key it could not read the list of, never calling it revoked", async () => {
    const fake = reached().always("adminKeys", refuse(503, "auth_unavailable"));
    const { region } = mount(fake);
    const bot = await rowOf(region, "bot");
    expect([...bot.querySelectorAll("nav.cp-crumbs a")].map((a) => a.textContent)).toEqual([
      "key 12",
      "key 14",
    ]);
    expect((await rowOf(region, "kai")).querySelector("nav.cp-crumbs a")?.textContent).toBe(
      "key 9",
    );
  });

  it("keeps the keys table's newer list over an older whole read's", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = reached();
    const { region, screen } = mount(fake);
    const keys = await section(region, "admin-keys");
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("nightly");
    });
    const before = fake.named("adminKeys").length;
    fake.answer("adminKeys", () => late.promise);
    const refreshing = screen.refresh();
    await vi.waitFor(() => {
      expect(fake.named("adminKeys")).toHaveLength(before + 1);
    });
    fake.always("adminKeys", ok([{ ...CI, label: "deploy" }, NIGHTLY]));
    window.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("deploy");
    });
    late.resolve(ok([CI, NIGHTLY]));
    await refreshing;
    const bot = await rowOf(region, "bot");
    expect(bot.querySelector("nav.cp-crumbs a")?.textContent).toBe("deploy");
  });

  it("names a new key once the keys table's read answers after the whole read", async () => {
    const late = Promise.withResolvers<unknown>();
    const NEW: KeyView = { ...BACKUP, id: 99, label: "agent", username: "mika" };
    const LEO: UserView = { ...ALICE_USER, id: 7, username: "leo", key_lineage: [99] };
    const fake = reached();
    const { region, screen } = mount(fake);
    const keys = await section(region, "admin-keys");
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("nightly");
    });
    fake
      .always("adminUsers", ok([ME, BOT, KAI, LEO]))
      .always("adminKeys", ok([CI, NIGHTLY, NEW]))
      .answer("adminKeys", ok([CI, NIGHTLY, NEW]), () => late.promise);
    const refreshing = screen.refresh();
    window.dispatchEvent(new FocusEvent("focus"));
    await refreshing;
    late.resolve(ok([CI, NIGHTLY, NEW]));
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("agent");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const leo = await rowOf(region, "leo");
    expect(leo.querySelector("nav.cp-crumbs a")?.textContent).toBe("agent");
  });

  it("never draws the keys table's older read once a newer whole read took the keys", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = reached();
    const { region, screen } = mount(fake);
    const keys = await section(region, "admin-keys");
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("nightly");
    });
    const before = fake.named("adminKeys").length;
    fake.answer("adminKeys", () => late.promise);
    window.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(() => {
      expect(fake.named("adminKeys")).toHaveLength(before + 1);
    });
    fake
      .always("adminKeys", ok([{ ...CI, label: "deploy" }, NIGHTLY]))
      .answer("adminUsers", refuse(503, "auth_unavailable"));
    await screen.refresh();
    late.resolve(ok([{ ...CI, label: "stale" }, NIGHTLY]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(keys.textContent).toContain("nightly");
    expect(keys.textContent).not.toContain("stale");
  });

  it("ends with the keys table naming the keys the people rows name", async () => {
    const late = Promise.withResolvers<unknown>();
    const fake = reached();
    const { region, screen } = mount(fake);
    const keys = await section(region, "admin-keys");
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("nightly");
    });
    const before = fake.named("adminKeys").length;
    fake.answer("adminKeys", () => late.promise);
    window.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(() => {
      expect(fake.named("adminKeys")).toHaveLength(before + 1);
    });
    fake.always("adminKeys", ok([{ ...CI, label: "deploy" }, NIGHTLY]));
    await screen.refresh();
    late.resolve(ok([{ ...CI, label: "stale" }, NIGHTLY]));
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("deploy");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(keys.textContent).not.toContain("stale");
    const bot = await rowOf(region, "bot");
    expect(bot.querySelector("nav.cp-crumbs a")?.textContent).toBe("deploy");
  });

  it("stops calling a key revoked once the keys table's own read is refused", async () => {
    const fake = reached();
    const { region } = mount(fake);
    const keys = await section(region, "admin-keys");
    await vi.waitFor(() => {
      expect(keys.textContent).toContain("nightly");
    });
    const kai = await rowOf(region, "kai");
    expect(kai.querySelector("nav.cp-crumbs a")?.textContent).toBe("revoked key 9");
    fake.answer("adminKeys", refuse(503, "auth_unavailable"));
    window.dispatchEvent(new FocusEvent("focus"));
    await vi.waitFor(async () => {
      const row = await rowOf(region, "kai");
      expect(row.querySelector("nav.cp-crumbs a")?.textContent).toBe("key 9");
    });
    expect(region.textContent).not.toContain("revoked key");
  });

  it("filters by a key in place, asking the server, and Show all users drops it", async () => {
    const fake = reached();
    const queries: string[] = [];
    const { region } = mount(fake, { search: "", onQuery: (p) => queries.push(p.toString()) });
    const bot = await rowOf(region, "bot");
    fake.answer("adminUsers", ok([BOT]));
    await userEvent.click(bot.querySelector("nav.cp-crumbs a")!);
    await vi.waitFor(() => {
      expect(region.querySelector("h2")?.textContent).toBe("Users reached through ci");
    });
    expect(queries).toEqual(["key=12"]);
    expect(document.activeElement).toBe(region.querySelector("h2"));
    expect(fake.named("adminUsers").at(-1)?.args).toEqual([{ limit: 200, key: 12 }]);
    const invites = await section(region, "invites");
    expect(invites.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(invites.querySelector("tbody tr")?.textContent).toContain("Key nightly");
    await userEvent.click(
      [...region.querySelectorAll("a")].find((a) => a.textContent === "Show all users")!,
    );
    await vi.waitFor(() => {
      expect(region.querySelector("h2")?.textContent).toBe("Users");
    });
    expect(queries).toEqual(["key=12", ""]);
    expect(fake.named("adminUsers").at(-1)?.args).toEqual([{ limit: 200 }]);
  });

  it("reads the filter from the address, and says when no one was reached", async () => {
    const fake = reached().always("adminUsers", ok([]));
    const { region } = mount(fake, { search: "?key=14", onQuery: () => undefined });
    await vi.waitFor(() => {
      expect(region.textContent).toContain("No one was reached through this key.");
    });
    expect(region.querySelector("h2")?.textContent).toBe("Users reached through nightly");
    expect(fake.named("adminUsers")[0]?.args).toEqual([{ limit: 200, key: 14 }]);
  });

  it.each(["?key=0", "?key=-3", "?key=1.5", "?key=abc", "?key=99999999999999999"])(
    "ignores a key filter %s that names no key",
    async (search) => {
      const fake = reached();
      const { region } = mount(fake, { search, onQuery: () => undefined });
      await rowOf(region, "bot");
      expect(fake.named("adminUsers")[0]?.args).toEqual([{ limit: 200 }]);
    },
  );

  it("lists the waiting invites with who made each, never a secret", async () => {
    const { region } = mount(reached());
    const invites = await section(region, "invites");
    const rows = await vi.waitFor(() => {
      const r = [...invites.querySelectorAll<HTMLTableRowElement>("tbody tr")];
      expect(r).toHaveLength(2);
      return r;
    });
    expect(rows[0]?.cells[0]?.textContent).toBe("Invite");
    expect(rows[0]?.cells[1]?.textContent).toBe("User");
    expect(rows[0]?.cells[4]?.textContent).toBe("A signed-in admin");
    expect(rows[1]?.cells[1]?.textContent).toBe("Admin");
    expect(rows[1]?.cells[4]?.textContent).toBe("Key nightly");
  });

  it("lists every account's keys with their owner, origin and the people they reached", async () => {
    const { region } = mount(reached());
    const keys = await section(region, "admin-keys");
    const rows = await vi.waitFor(() => {
      const r = [...keys.querySelectorAll<HTMLTableRowElement>("tbody tr:not([data-part])")];
      expect(r).toHaveLength(2);
      return r;
    });
    const [ci, nightly] = rows;
    expect(ci?.textContent).toContain("Made in a signed-in session");
    expect(ci?.textContent).toContain("mika");
    expect(nightly?.querySelector("th a")?.textContent).toBe("Minted by ci");
    const reachedLink = [...(ci?.querySelectorAll("a") ?? [])].find(
      (a) => a.textContent === "People it reached",
    );
    expect(reachedLink?.getAttribute("href")).toMatch(/[?&]key=12$/);
    expect(actions(ci!)).toEqual(["Revoke ci…"]);
    await userEvent.click(nightly!.querySelector("th a")!);
    expect(document.activeElement).toBe(ci?.querySelector("th"));
  });

  it("opens a key's live invites under its row, its subtree's included", async () => {
    const { region } = mount(reached());
    const keys = await section(region, "admin-keys");
    const open = await vi.waitFor(() => {
      const b = keys.querySelector<HTMLButtonElement>("[data-col='expand'] button");
      expect(b).not.toBeNull();
      return b!;
    });
    expect(open.getAttribute("aria-label")).toBe("1 live invite from ci and the keys it minted");
    const detail = document.getElementById(open.getAttribute("aria-controls")!)!;
    expect(detail.hidden).toBe(true);
    await userEvent.click(open);
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toMatch(/^Invite as Admin, made .+, works until .+$/);
    expect(keys.querySelectorAll("[data-col='expand'] button")).toHaveLength(2);
  });

  it("asks before revoking any key, counting what goes with it and linking who it reached", async () => {
    const fake = reached();
    const { region, ran } = mount(fake);
    const keys = await section(region, "admin-keys");
    const ci = await vi.waitFor(() => {
      const r = keys.querySelector<HTMLTableRowElement>("tbody tr:not([data-part])");
      expect(r).not.toBeNull();
      return r!;
    });
    await press(ci, "Revoke ci…");
    const d = await dialogOf("Revoke ci and the key it minted?");
    expect(d.textContent).toContain("Their unused invite stops working too.");
    expect(d.textContent).toContain("People they added or changed stay");
    const link = [...d.querySelectorAll("a")].find(
      (a) => a.textContent === "Show the people ci reached",
    );
    expect(link?.getAttribute("href")).toMatch(/[?&]key=12$/);
    const before = fake.named("adminUsers").length;
    await userEvent.click(button(d, "Revoke key"));
    await vi.waitFor(() => {
      expect(noticeOf(keys)).toBe("ci is revoked.");
    });
    expect(fake.named("adminRevokeKey")[0]?.args).toEqual([12]);
    expect(ran).toEqual(["auth.admin_key_revoke"]);
    expect(fake.named("adminUsers").length).toBeGreaterThan(before);
  });
});
