import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type {
  KeyView,
  LogEntryView,
  PasskeyView,
  SessionView,
  StateResponse,
  UserView,
} from "./client.js";
import { mountInvite } from "./invite.js";
import { mountSecurityLog } from "./log.js";
import { mountAccessSettings } from "./settings.js";
import { mountSetup } from "./setup.js";
import { mountSignIn } from "./sign-in.js";
import { ALICE_USER, BACKUP, Fake, HERE, meWith, ok, PHONE, refuse } from "./test-helpers/fake.js";
import {
  mount as mountAccount,
  noticeOf,
  passkeyRows,
  press,
  useScreen,
} from "./test-helpers/security.js";
import { mountUsers } from "./users.js";

useScreen();

let life = new AbortController();
afterEach(() => {
  life.abort();
  life = new AbortController();
});

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const EVERY: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  secure: true,
  https_required: [],
};
/** A plain request whose password form access refuses. */
const STRICT: StateResponse = {
  ...EVERY,
  passkeys: false,
  oidc: false,
  secure: false,
  https_required: ["password", "setup"],
};
const SETUP: StateResponse = { ...EVERY, setup_required: true, oidc: false };

const owner = meWith({}, { owner: true, single_user: false });
const PHONE_SESSION: SessionView = { ...HERE, id: "s2", label: "Phone", current: false };
const ME: UserView = { ...ALICE_USER, id: 1, username: "mika", role: "admin", owner: true };

const host = (tag = "div"): HTMLElement => {
  const region = document.createElement(tag);
  document.body.append(region);
  return region;
};

const signal = (): { readonly signal: AbortSignal } => ({ signal: life.signal });

/** The text of `selector` in `region`, or "" when there is none. */
const textOf = (region: HTMLElement, selector: string): string =>
  region.querySelector(selector)?.textContent ?? "";

/** The first of `words` that `text` holds, or "". */
const among = (text: string, ...words: string[]): string =>
  words.find((x) => text.includes(x)) ?? "";

const shape = (region: HTMLElement): string =>
  region.querySelector(".cp-empty")?.textContent.includes("needs HTTPS") === true
    ? "needs HTTPS"
    : region.querySelector("form") === null
      ? "nothing"
      : "form";

/** Sends the form, filled in on its first send: each send the screen
 *  refuses reads the state again. The later sends go at once, before the
 *  sketch of the read the first one started can take the form's place. */
function sender(region: HTMLElement, username: string, password: string): () => Promise<void> {
  let filled = false;
  return async () => {
    if (!filled) {
      filled = true;
      await userEvent.fill(
        region.querySelector<HTMLInputElement>("input[name='username']")!,
        username,
      );
      await userEvent.fill(
        region.querySelector<HTMLInputElement>("input[name='password']")!,
        password,
      );
    }
    region.querySelector("form")!.requestSubmit();
  };
}

const entry = (seq: number): LogEntryView => ({
  seq,
  at: "2026-11-14T10:00:00Z",
  occurred_at: "2026-11-14T10:00:00Z",
  class: "change",
  kind: "password_changed",
  user_id: 2,
  actor: { user_id: 2 },
});
const page = (...seqs: number[]): unknown =>
  ok({
    entries: seqs.map(entry),
    classes: [
      { class: "change", count: seqs.length, evicted: 0 },
      { class: "session", count: 0, evicted: 0 },
    ],
  });

interface Reversed {
  readonly name: string;
  /** The call each read makes. */
  readonly call: string;
  /** Its answers: to the first read, to an older read and to a newer one. */
  readonly answers: readonly [unknown, unknown, unknown];
  /** What the screen shows of each answer, in the same order. */
  readonly shown: readonly [string, string, string];
  readonly fake?: () => Fake;
  /** Mounts the screen on `fake`; `again` starts one more read. */
  readonly mount: (fake: Fake) => {
    readonly region: HTMLElement;
    readonly again: () => unknown;
  };
  readonly shows: (region: HTMLElement) => string;
}

const reversed: readonly Reversed[] = [
  {
    name: "Account and security",
    call: "me",
    answers: [
      ok(meWith()),
      ok(meWith({}, { user: { id: 1, username: "old", role: "admin" } })),
      ok(meWith({}, { user: { id: 1, username: "new", role: "admin" } })),
    ],
    shown: ["mika", "old", "new"],
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["password"] });
      return { region, again: () => screen.refresh() };
    },
    shows: (region) =>
      /Signed in as (\w+)/.exec(textOf(region, "[data-part='session']"))?.[1] ?? "",
  },
  {
    name: "Sessions",
    call: "sessions",
    answers: [
      ok([HERE]),
      ok([HERE, { ...PHONE_SESSION, label: "Older" }]),
      ok([HERE, { ...PHONE_SESSION, label: "Newer" }]),
    ],
    shown: ["1", "Older", "Newer"],
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["sessions"] });
      return { region, again: () => screen.refresh() };
    },
    shows: (region) => {
      const rows = [...region.querySelectorAll("[data-part='sessions'] tbody tr")];
      return rows.length === 1 ? "1" : (rows[1]?.querySelector("th")?.textContent ?? "");
    },
  },
  {
    name: "API keys",
    call: "keys",
    answers: [
      ok([BACKUP]),
      ok([{ ...BACKUP, label: "older" }]),
      ok([{ ...BACKUP, label: "newer" }]),
    ],
    shown: [BACKUP.label, "older", "newer"],
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["keys"] });
      return { region, again: () => screen.refresh() };
    },
    shows: (region) =>
      among(textOf(region, "[data-part='keys'] tbody th"), "newer", "older", BACKUP.label),
  },
  {
    name: "Users",
    call: "adminUsers",
    answers: [
      ok([ME]),
      ok([ME, { ...ALICE_USER, username: "older" }]),
      ok([ME, { ...ALICE_USER, username: "newer" }]),
    ],
    shown: ["mika", "older", "newer"],
    fake: () => new Fake().always("me", ok(owner)),
    mount: (fake) => {
      const region = host();
      const screen = mountUsers(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        ...signal(),
      });
      return { region, again: () => screen.refresh() };
    },
    shows: (region) => {
      const rows = [...region.querySelectorAll("[data-part='users'] tbody tr")];
      return among(rows.at(-1)?.textContent ?? "", "newer", "older", "mika");
    },
  },
  {
    name: "Access settings",
    call: "state",
    answers: [ok(EVERY), ok({ ...EVERY, sso: "for_linked" }), ok({ ...EVERY, sso: "only" })],
    shown: ["alongside", "for_linked", "only"],
    fake: () => new Fake().always("me", ok(owner)),
    mount: (fake) => {
      const region = host();
      const screen = mountAccessSettings(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        ...signal(),
      });
      return { region, again: () => screen.refresh() };
    },
    shows: (region) =>
      region.querySelector<HTMLInputElement>("input[type='radio']:checked")?.value ?? "",
  },
  {
    name: "Security log",
    call: "adminSecurityLog",
    answers: [page(5), page(1), page(2)],
    shown: ["5", "1", "2"],
    mount: (fake) => {
      const region = host();
      const screen = mountSecurityLog(region, {
        client: fake.client,
        search: "",
        viewer: 1,
        onQuery: () => undefined,
        ...signal(),
      });
      let n = 0;
      return {
        region,
        again: () => {
          n += 1;
          screen.show(n % 2 === 1 ? "?order=oldest" : "?order=newest&kind=password_changed");
        },
      };
    },
    shows: (region) =>
      [...region.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset["seq"]).join(),
  },
  {
    name: "Sign-in",
    call: "state",
    answers: [ok(EVERY), ok(EVERY), ok(STRICT)],
    shown: ["form", "form", "needs HTTPS"],
    fake: () => new Fake().always("loginPassword", refuse(403, "auth_password_login_disabled")),
    mount: (fake) => {
      const region = host("section");
      mountSignIn(region, {
        client: fake.client,
        access: fake.access(),
        navigate: () => undefined,
        search: "",
        ...signal(),
      });
      return { region, again: sender(region, "mika", "lantern harbour") };
    },
    shows: shape,
  },
  {
    name: "Setup",
    call: "state",
    answers: [ok(SETUP), ok(SETUP), ok({ ...STRICT, setup_required: true })],
    shown: ["form", "form", "needs HTTPS"],
    fake: () => new Fake().always("setupPassword", refuse(403, "auth_https_required")),
    mount: (fake) => {
      const region = host("section");
      mountSetup(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        ...signal(),
      });
      return { region, again: sender(region, "mika", "lantern harbour quietly") };
    },
    shows: shape,
  },
  {
    name: "Invite",
    call: "state",
    answers: [ok(EVERY), ok(EVERY), ok(STRICT)],
    shown: ["form", "form", "needs HTTPS"],
    fake: () => new Fake().always("inviteAcceptPassword", refuse(403, "auth_https_required")),
    mount: (fake) => {
      const region = host("section");
      mountInvite(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        token: "inv-1",
        navigate: () => undefined,
        ...signal(),
      });
      return { region, again: sender(region, "noor", "lantern harbour quietly") };
    },
    shows: shape,
  },
];

describe("every account screen, two reads answering out of order", () => {
  it.each(reversed)("$name draws the newer read's answer", async (c) => {
    const late = Promise.withResolvers<unknown>();
    const [first, older, newer] = c.answers;
    const fake = (c.fake?.() ?? new Fake()).answer(c.call, first, () => late.promise, newer);
    const { region, again } = c.mount(fake);
    await vi.waitFor(() => {
      expect(c.shows(region)).toBe(c.shown[0]);
    });
    void again();
    await vi.waitFor(
      () => {
        expect(fake.named(c.call)).toHaveLength(2);
      },
      { interval: 5 },
    );
    void again();
    await vi.waitFor(() => {
      expect(c.shows(region)).toBe(c.shown[2]);
    });
    late.resolve(older);
    await tick(50);
    expect(fake.named(c.call)).toHaveLength(3);
    expect(c.shows(region)).toBe(c.shown[2]);
  });
});

/** The control a person reaches for `key`: itself, or the ⋯ button of the
 *  menu holding it. */
const control = (root: HTMLElement, key: string): HTMLElement | null => {
  const target = root.querySelector<HTMLElement>(`[data-cp-action="${key}"]`);
  const menu = target?.closest<HTMLElement>("[role='menu']");
  return menu === null || menu === undefined
    ? target
    : root.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`);
};

interface Kept {
  readonly name: string;
  /** Mounts the screen; its rows hold `key` until `drop()` answers the
   *  next read without it. */
  readonly mount: () => {
    readonly region: HTMLElement;
    readonly refresh: () => Promise<void>;
    readonly drop: () => void;
  };
  readonly key: string;
  /** The heading focus goes to once the control is gone. */
  readonly heading: string;
}

const kept: readonly Kept[] = [
  {
    name: "Sessions",
    key: "session-revoke-s2",
    heading: "Sessions",
    mount: () => {
      const fake = new Fake().always("sessions", ok([HERE, PHONE_SESSION]));
      const { region, screen } = mountAccount(fake, { parts: ["sessions"] });
      return {
        region,
        refresh: () => screen.refresh(),
        drop: () => fake.always("sessions", ok([HERE])),
      };
    },
  },
  {
    name: "API keys",
    key: `key-revoke-${String(BACKUP.id)}`,
    heading: "API keys",
    mount: () => {
      const fake = new Fake().always("keys", ok([BACKUP]));
      const { region, screen } = mountAccount(fake, { parts: ["keys", "key-rotate"] });
      return { region, refresh: () => screen.refresh(), drop: () => fake.always("keys", ok([])) };
    },
  },
  {
    name: "Sign-in methods",
    key: "password-change",
    heading: "Sign-in methods",
    mount: () => {
      const fake = new Fake().always("me", ok(meWith()));
      const { region, screen } = mountAccount(fake, { parts: ["password"] });
      return {
        region,
        refresh: () => screen.refresh(),
        drop: () => fake.always("me", ok(meWith({ password: false }))),
      };
    },
  },
  {
    name: "Users",
    key: `user-edit-${String(ALICE_USER.id)}`,
    heading: "Users",
    mount: () => {
      const fake = new Fake().always("me", ok(owner)).always("adminUsers", ok([ME, ALICE_USER]));
      const region = host();
      const screen = mountUsers(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        ...signal(),
      });
      return {
        region,
        refresh: () => screen.refresh(),
        drop: () => fake.always("adminUsers", ok([ME])),
      };
    },
  },
  {
    name: "Access settings",
    key: "sso-only",
    heading: "Single sign-on",
    mount: () => {
      const fake = new Fake().always("me", ok(owner)).always("state", ok(EVERY));
      const region = host();
      const screen = mountAccessSettings(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        ...signal(),
      });
      return {
        region,
        refresh: () => screen.refresh(),
        drop: () => fake.always("state", refuse(503, "auth_unavailable")),
      };
    },
  },
];

describe("every account screen, a host's refresh while a control has focus", () => {
  it.each(kept)("$name gives focus back to the same control", async (c) => {
    const { region, refresh } = c.mount();
    const before = await vi.waitFor(() => {
      const found = control(region, c.key);
      expect(found).not.toBeNull();
      return found!;
    });
    before.focus();
    await refresh();
    await tick();
    const after = control(region, c.key);
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
  });

  it.each(kept)("$name gives focus to its heading once the control is gone", async (c) => {
    const { region, refresh, drop } = c.mount();
    const before = await vi.waitFor(() => {
      const found = control(region, c.key);
      expect(found).not.toBeNull();
      return found!;
    });
    before.focus();
    drop();
    await refresh();
    await tick();
    expect(control(region, c.key)).toBeNull();
    const active = document.activeElement;
    expect(active?.tagName).toMatch(/^H[1-6]$/);
    expect(active?.textContent).toContain(c.heading);
  });

  it("keeps focus on the log's Older link when new entries arrive", async () => {
    const log = [entry(1), entry(2), entry(3)];
    const fake = new Fake().always("adminSecurityLog", (q: { after?: number } = {}) =>
      page(
        ...log
          .map((e) => e.seq)
          .filter((s) => q.after === undefined || s > q.after)
          .toSorted((a, b) => (q.after === undefined ? b - a : a - b))
          .slice(0, 2),
      ),
    );
    const region = host();
    const screen = mountSecurityLog(region, {
      client: fake.client,
      search: "",
      viewer: 1,
      limit: 2,
      onQuery: () => undefined,
      ...signal(),
    });
    const before = await vi.waitFor(() => {
      const older = control(region, "log-older");
      expect(older?.hasAttribute("href")).toBe(true);
      return older!;
    });
    before.focus();
    log.push(entry(4));
    await screen.refresh();
    await tick();
    expect(textOf(region, "tbody tr")).not.toBe("");
    expect(region.querySelector("tbody tr")?.getAttribute("data-seq")).toBe("4");
    const after = control(region, "log-older");
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
  });
});

describe("every account screen, Retry", () => {
  const retried: readonly {
    readonly name: string;
    readonly call: string;
    readonly heading: string;
    readonly fake?: () => Fake;
    readonly mount: (fake: Fake) => HTMLElement;
  }[] = [
    {
      name: "Sessions",
      call: "sessions",
      heading: "Sessions",
      mount: (fake) => mountAccount(fake, { parts: ["sessions"] }).region,
    },
    {
      name: "API keys",
      call: "keys",
      heading: "API keys",
      mount: (fake) => mountAccount(fake, { parts: ["keys"] }).region,
    },
    {
      name: "Account and security",
      call: "me",
      heading: "Sign-in methods",
      mount: (fake) => mountAccount(fake, { parts: ["password"] }).region,
    },
    {
      name: "Users",
      call: "adminUsers",
      heading: "Users",
      fake: () => new Fake().always("me", ok(owner)),
      mount: (fake) => {
        const region = host();
        mountUsers(region, {
          client: fake.client,
          access: fake.access(),
          app: "Release tracker",
          navigate: () => undefined,
          ...signal(),
        });
        return region;
      },
    },
    {
      name: "Sign-in",
      call: "state",
      heading: "Sign in",
      mount: (fake) => {
        const region = host("section");
        mountSignIn(region, {
          client: fake.client,
          access: fake.access(),
          navigate: () => undefined,
          search: "",
          ...signal(),
        });
        return region;
      },
    },
  ];

  it.each(retried)(
    "$name keeps focus on Retry while it fails, then gives it to the heading",
    async (c) => {
      const fake = (c.fake?.() ?? new Fake()).answer(
        c.call,
        refuse(503, "auth_unavailable"),
        refuse(503, "auth_unavailable"),
      );
      const region = c.mount(fake);
      const retry = (): HTMLElement | null =>
        region.querySelector<HTMLElement>("[data-cp-action='retry']");
      await vi.waitFor(() => {
        expect(retry()).not.toBeNull();
      });
      const first = retry()!;
      await userEvent.click(first);
      await vi.waitFor(() => {
        expect(fake.named(c.call)).toHaveLength(2);
        expect(retry()).not.toBe(first);
      });
      expect(document.activeElement).toBe(retry());
      await userEvent.click(retry()!);
      await vi.waitFor(() => {
        expect(retry()).toBeNull();
      });
      const active = document.activeElement;
      expect(active?.tagName).toMatch(/^H[1-6]$/);
      expect(active?.textContent).toContain(c.heading);
    },
  );
});

const usersOn = (fake: Fake): { region: HTMLElement; refresh: () => Promise<void> } => {
  const region = host();
  const screen = mountUsers(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    navigate: () => undefined,
    ...signal(),
  });
  return { region, refresh: () => screen.refresh() };
};

const settingsOn = (fake: Fake): { region: HTMLElement; refresh: () => Promise<void> } => {
  const region = host();
  const screen = mountAccessSettings(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    navigate: () => undefined,
    ...signal(),
  });
  return { region, refresh: () => screen.refresh() };
};

interface Refreshed {
  readonly name: string;
  /** The read a refresh makes again. */
  readonly call: string;
  /** Its newer answer, and what the screen shows of it. */
  readonly newer: unknown;
  readonly shown: string;
  /** A first answer the newer one replaces. */
  readonly older: unknown;
  readonly fake?: () => Fake;
  readonly mount: (fake: Fake) => {
    readonly region: HTMLElement;
    readonly refresh: () => Promise<void>;
  };
  readonly shows: (region: HTMLElement) => string;
}

const sessionName = (region: HTMLElement): string =>
  among(textOf(region, "[data-part='sessions'] tbody"), "Newer", "Older");

const refreshed: readonly Refreshed[] = [
  {
    name: "Account and security",
    call: "me",
    older: ok(meWith({}, { user: { id: 1, username: "old", role: "admin" } })),
    newer: ok(meWith({}, { user: { id: 1, username: "new", role: "admin" } })),
    shown: "new",
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["password"] });
      return { region, refresh: () => screen.refresh() };
    },
    shows: (region) =>
      /Signed in as (\w+)/.exec(textOf(region, "[data-part='session']"))?.[1] ?? "",
  },
  {
    name: "Sessions",
    call: "sessions",
    older: ok([HERE, { ...PHONE_SESSION, label: "Older" }]),
    newer: ok([HERE, { ...PHONE_SESSION, label: "Newer" }]),
    shown: "Newer",
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["sessions"] });
      return { region, refresh: () => screen.refresh() };
    },
    shows: sessionName,
  },
  {
    name: "API keys",
    call: "keys",
    older: ok([{ ...BACKUP, label: "older" }]),
    newer: ok([{ ...BACKUP, label: "newer" }]),
    shown: "newer",
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["keys"] });
      return { region, refresh: () => screen.refresh() };
    },
    shows: (region) => among(textOf(region, "[data-part='keys'] tbody th"), "newer", "older"),
  },
  {
    name: "Users",
    call: "adminUsers",
    older: ok([ME, { ...ALICE_USER, username: "older" }]),
    newer: ok([ME, { ...ALICE_USER, username: "newer" }]),
    shown: "newer",
    fake: () => new Fake().always("me", ok(owner)),
    mount: usersOn,
    shows: (region) => among(textOf(region, "[data-part='users'] tbody"), "newer", "older"),
  },
  {
    name: "Access settings",
    call: "state",
    older: ok({ ...EVERY, sso: "for_linked" }),
    newer: ok({ ...EVERY, sso: "only" }),
    shown: "only",
    fake: () => new Fake().always("me", ok(owner)),
    mount: settingsOn,
    shows: (region) =>
      region.querySelector<HTMLInputElement>("input[type='radio']:checked")?.value ?? "",
  },
  {
    name: "Security log",
    call: "adminSecurityLog",
    older: page(1),
    // The first page whole, and what a read after entry 1 gains.
    newer: (q: { after?: number } = {}) => (q.after === 1 ? page(2) : page(2, 1)),
    shown: "2,1",
    mount: (fake) => {
      const region = host();
      const screen = mountSecurityLog(region, {
        client: fake.client,
        search: "",
        viewer: 1,
        onQuery: () => undefined,
        ...signal(),
      });
      return { region, refresh: () => screen.refresh() };
    },
    shows: (region) =>
      [...region.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset["seq"]).join(),
  },
];

describe("every account screen, a refresh during its first read", () => {
  it.each(refreshed)(
    "$name has drawn a read made after it when the refresh resolves",
    async (c) => {
      const fake = (c.fake?.() ?? new Fake()).answer(c.call, c.older).always(c.call, c.newer);
      const release = fake.hold(c.call);
      const { region, refresh } = c.mount(fake);
      await vi.waitFor(
        () => {
          expect(fake.named(c.call)).toHaveLength(1);
        },
        { interval: 5 },
      );
      const done = refresh();
      release();
      await done;
      expect(c.shows(region)).toBe(c.shown);
      expect(fake.named(c.call)).toHaveLength(2);
    },
  );
});

describe("every account screen, a first read refused and a refresh answered", () => {
  it.each(refreshed)("$name draws the refresh's answer and drops the notice", async (c) => {
    const fake = (c.fake?.() ?? new Fake())
      .answer(c.call, refuse(503, "auth_unavailable"))
      .always(c.call, c.newer);
    const { region, refresh } = c.mount(fake);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    await refresh();
    expect(c.shows(region)).toBe(c.shown);
    expect(noticeOf(region)).toBe("");
  });
});

interface Edited {
  readonly name: string;
  /** The list read, its first answer and one with a row named Tablet
   *  added. */
  readonly call: string;
  readonly first: unknown;
  readonly newer: unknown;
  /** The same list, with the renamed row named Desk. */
  readonly saved: unknown;
  readonly mount: (fake: Fake) => {
    readonly region: HTMLElement;
    readonly refresh: () => Promise<void>;
  };
  readonly row: (region: HTMLElement) => Promise<HTMLElement>;
  /** The row named `name`. */
  readonly named: (region: HTMLElement, name: string) => Promise<HTMLElement>;
  /** The rename call. */
  readonly rename: string;
  /** The renamed row's Rename… key. */
  readonly key: string;
  readonly table: (region: HTMLElement) => string;
}

const rowNamed = (
  region: HTMLElement,
  selector: string,
  name: string,
): Promise<HTMLTableRowElement> =>
  vi.waitFor(() => {
    const row = [...region.querySelectorAll<HTMLTableRowElement>(`${selector} tbody tr`)].find(
      (r) => r.cells[0]?.textContent.startsWith(name) === true,
    );
    expect(row, name).toBeDefined();
    return row!;
  });

const TABLET_KEY: KeyView = { ...BACKUP, id: 99, label: "Tablet", prefix: "rt_tab" };
const TABLET_PASSKEY: PasskeyView = { ...PHONE, id: 8, name: "Tablet" };

const edited: readonly Edited[] = [
  {
    name: "Sessions",
    call: "sessions",
    first: ok([HERE, PHONE_SESSION]),
    newer: ok([HERE, PHONE_SESSION, { ...PHONE_SESSION, id: "s3", label: "Tablet" }]),
    saved: ok([HERE, { ...PHONE_SESSION, label: "Desk" }]),
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["sessions", "session-rename"] });
      return { region, refresh: () => screen.refresh() };
    },
    row: (region) => rowNamed(region, "[data-part='sessions']", "Phone"),
    named: (region, name) => rowNamed(region, "[data-part='sessions']", name),
    rename: "renameSession",
    key: "session-rename-s2",
    table: (region) => textOf(region, "[data-part='sessions'] tbody"),
  },
  {
    name: "Passkeys",
    call: "passkeys",
    first: ok([PHONE]),
    newer: ok([PHONE, TABLET_PASSKEY]),
    saved: ok([{ ...PHONE, name: "Desk" }]),
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["passkeys"] });
      return { region, refresh: () => screen.refresh() };
    },
    row: (region) =>
      vi.waitFor(() => {
        const row = passkeyRows(region)[0];
        expect(row).toBeDefined();
        return row!;
      }),
    named: (region, name) =>
      vi.waitFor(() => {
        const row = passkeyRows(region).find(
          (r) => r.cells[0]?.textContent.startsWith(name) === true,
        );
        expect(row, name).toBeDefined();
        return row!;
      }),
    rename: "renamePasskey",
    key: `passkey-rename-${String(PHONE.id)}`,
    table: (region) =>
      passkeyRows(region)
        .map((r) => r.cells[0]?.textContent ?? "")
        .join(),
  },
  {
    name: "API keys",
    call: "keys",
    first: ok([BACKUP]),
    newer: ok([BACKUP, TABLET_KEY]),
    saved: ok([{ ...BACKUP, label: "Desk" }]),
    mount: (fake) => {
      const { region, screen } = mountAccount(fake, { parts: ["keys", "key-rotate"] });
      return { region, refresh: () => screen.refresh() };
    },
    row: (region) => rowNamed(region, "[data-part='keys']", BACKUP.label),
    named: (region, name) => rowNamed(region, "[data-part='keys']", name),
    rename: "renameKey",
    key: `key-rename-${String(BACKUP.id)}`,
    table: (region) => textOf(region, "[data-part='keys'] tbody"),
  },
];

describe("every account table, a refresh while Rename… is open", () => {
  /** Opens Rename… on the row, types Desk and refreshes the screen with
   *  the newer list. */
  const typedThenRefreshed = async (
    c: Edited,
  ): Promise<{ fake: Fake; region: HTMLElement; input: HTMLInputElement }> => {
    const fake = new Fake().answer(c.call, c.first).always(c.call, c.newer);
    const { region, refresh } = c.mount(fake);
    await press(await c.row(region), "Rename…");
    const input = region.querySelector<HTMLInputElement>("tbody input.cp-input")!;
    await userEvent.fill(input, "Desk");
    const reads = fake.named(c.call).length;
    await refresh();
    await tick();
    expect(fake.named(c.call).length).toBeGreaterThan(reads);
    return { fake, region, input };
  };

  it.each(edited)("$name keeps the field, its text and focus", async (c) => {
    const { region, input } = await typedThenRefreshed(c);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Desk");
    expect(document.activeElement).toBe(input);
    expect(c.table(region)).not.toContain("Tablet");
  });

  it.each(edited)("$name draws the newer list once Escape closes the field", async (c) => {
    const { region, input } = await typedThenRefreshed(c);
    input.focus();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => {
      expect(c.table(region)).toContain("Tablet");
    });
    expect(region.querySelector("tbody input.cp-input")).toBeNull();
  });

  it.each(edited)("$name draws the saved name with focus on Rename… after Enter", async (c) => {
    const { fake, region, input } = await typedThenRefreshed(c);
    fake.always(c.call, c.saved);
    input.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(c.table(region)).toContain("Desk");
      expect(region.querySelector("tbody input.cp-input")).toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(control(region, c.key));
    });
  });
});

describe("every account table, Rename… on a name already open", () => {
  it.each(edited)("$name keeps one field, with focus in it", async (c) => {
    const fake = new Fake().always(c.call, c.first);
    const { region } = c.mount(fake);
    const row = await c.row(region);
    await press(row, "Rename…");
    await press(row, "Rename…");
    const fields = region.querySelectorAll<HTMLInputElement>("tbody input.cp-input");
    expect(fields).toHaveLength(1);
    expect(document.activeElement).toBe(fields[0]);
  });

  it.each(edited)("$name draws a newer list once Escape closes the field", async (c) => {
    const fake = new Fake().answer(c.call, c.first).always(c.call, c.newer);
    const { region, refresh } = c.mount(fake);
    const row = await c.row(region);
    await press(row, "Rename…");
    await press(row, "Rename…");
    await userEvent.keyboard("{Escape}");
    expect(region.querySelector("tbody input.cp-input")).toBeNull();
    await refresh();
    await vi.waitFor(() => {
      expect(c.table(region)).toContain("Tablet");
    });
  });
});

describe("every account table, a rename the server refused", () => {
  /** Opens Rename… on the row, types Desk and sends it to a refusal. */
  const refused = async (
    c: Edited,
    fake: Fake,
  ): Promise<{ region: HTMLElement; refresh: () => Promise<void>; input: HTMLInputElement }> => {
    fake.answer(c.rename, refuse(503, "auth_unavailable"));
    const { region, refresh } = c.mount(fake);
    await press(await c.row(region), "Rename…");
    const input = region.querySelector<HTMLInputElement>("tbody input.cp-input")!;
    await userEvent.fill(input, "Desk");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    return { region, refresh, input };
  };

  it.each(edited)("$name keeps the field, its text and focus through a refresh", async (c) => {
    const fake = new Fake().answer(c.call, c.first).always(c.call, c.newer);
    const { region, refresh, input } = await refused(c, fake);
    await refresh();
    await tick();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Desk");
    expect(document.activeElement).toBe(input);
    expect(c.table(region)).not.toContain("Tablet");
  });

  it.each(edited)("$name keeps another row's open field held", async (c) => {
    const fake = new Fake().answer(c.call, c.newer).always(c.call, c.first);
    fake.answer(c.rename, refuse(503, "auth_unavailable"));
    const { region, refresh } = c.mount(fake);
    await press(await c.named(region, "Tablet"), "Rename…");
    const tablet = region.querySelector<HTMLInputElement>("tbody input.cp-input")!;
    await userEvent.fill(tablet, "Den");
    await press(await c.row(region), "Rename…");
    const input = [...region.querySelectorAll<HTMLInputElement>("tbody input.cp-input")].find(
      (x) => x !== tablet,
    )!;
    await userEvent.fill(input, "Desk");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(fake.named(c.rename)).toHaveLength(1);
      expect(input.readOnly).toBe(false);
    });
    await userEvent.keyboard("{Escape}");
    await refresh();
    await tick();
    expect(tablet.isConnected).toBe(true);
    expect(tablet.value).toBe("Den");
  });

  it.each(edited)("$name sends the typed name again on Retry", async (c) => {
    const fake = new Fake().always(c.call, c.first);
    const { region } = await refused(c, fake);
    fake.always(c.call, c.saved);
    await userEvent.click(region.querySelector<HTMLElement>("[data-cp-action='retry']")!);
    await vi.waitFor(() => {
      expect(fake.named(c.rename)).toHaveLength(2);
      expect(c.table(region)).toContain("Desk");
      expect(region.querySelector("tbody input.cp-input")).toBeNull();
    });
    expect(fake.named(c.rename).at(-1)?.args.at(-1)).toEqual({ name: "Desk" });
    expect(noticeOf(region)).toBe("");
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(control(region, c.key));
    });
  });
});

interface PartlyRefused {
  readonly name: string;
  /** The read refused once, beside reads that succeed. */
  readonly call: string;
  readonly fake?: () => Fake;
  readonly mount: (fake: Fake) => HTMLElement;
  /** What the screen draws once every read succeeded. */
  readonly shown: string;
  readonly shows: (region: HTMLElement) => string;
}

const passkeyTable = (region: HTMLElement): string =>
  passkeyRows(region)
    .map((r) => r.cells[0]?.textContent ?? "")
    .join();
const peopleRows = (region: HTMLElement): string =>
  among(textOf(region, "[data-part='users'] tbody"), "mika");

const partial: readonly PartlyRefused[] = [
  {
    name: "Account and security, its passkeys",
    call: "passkeys",
    fake: () => new Fake().always("me", ok(meWith({ passkey_count: 2 }))),
    mount: (fake) => mountAccount(fake, { parts: ["passkeys"] }).region,
    shown: "Phone",
    shows: passkeyTable,
  },
  {
    name: "Account and security, the app's state",
    call: "state",
    mount: (fake) => mountAccount(fake, { parts: ["passkeys"] }).region,
    shown: "Phone",
    shows: passkeyTable,
  },
  {
    name: "Users, the app's state",
    call: "state",
    fake: () => new Fake().always("me", ok(owner)).always("adminUsers", ok([ME])),
    mount: (fake) => usersOn(fake).region,
    shown: "mika",
    shows: peopleRows,
  },
  {
    name: "Users, the invites",
    call: "adminTokens",
    fake: () => new Fake().always("me", ok(owner)).always("adminUsers", ok([ME])),
    mount: (fake) => usersOn(fake).region,
    shown: "mika",
    shows: peopleRows,
  },
  {
    name: "Access settings, the app's state",
    call: "state",
    fake: () => new Fake().always("me", ok(owner)),
    mount: (fake) => settingsOn(fake).region,
    shown: "alongside",
    shows: (region) =>
      region.querySelector<HTMLInputElement>("input[type='radio']:checked")?.value ?? "",
  },
];

describe("every account screen, one of its first reads refused", () => {
  it.each(partial)("$name shows the notice, and Retry draws the screen", async (c) => {
    const fake = (c.fake?.() ?? new Fake()).answer(c.call, refuse(503, "auth_unavailable"));
    const region = c.mount(fake);
    await vi.waitFor(() => {
      expect(noticeOf(region)).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    expect(c.shows(region)).not.toBe(c.shown);
    await userEvent.click(region.querySelector<HTMLElement>("[data-cp-action='retry']")!);
    await vi.waitFor(() => {
      expect(c.shows(region)).toBe(c.shown);
    });
    expect(noticeOf(region)).toBe("");
  });
});

describe("Account and security, a refresh with one of its reads refused", () => {
  it("keeps the notice until both reads succeed, and what is drawn under it", async () => {
    const fake = new Fake().always("me", ok(meWith({ passkey_count: 2 })));
    const { region, screen } = mountAccount(fake, { parts: ["passkeys"] });
    await vi.waitFor(() => {
      expect(passkeyTable(region)).toBe("Phone");
    });
    const unavailable = "The app cannot do this right now. Try again in a few seconds.";
    fake.answer("me", refuse(503, "auth_unavailable"));
    await screen.refresh();
    expect(noticeOf(region)).toBe(unavailable);
    fake.answer("passkeys", refuse(503, "auth_unavailable"));
    fake.always("passkeys", ok([PHONE, TABLET_PASSKEY]));
    await screen.refresh();
    expect(noticeOf(region)).toBe(unavailable);
    expect(passkeyTable(region)).toBe("Phone");
    await screen.refresh();
    expect(noticeOf(region)).toBe("");
    expect(passkeyTable(region)).toBe("Phone,Tablet");
  });
});
