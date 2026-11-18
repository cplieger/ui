import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { LogEntryView, LogQuery, Result, SecurityLogView } from "./client.js";
import { mountSecurityLog, type SecurityLogOptions } from "./log.js";
import { Fake, meWith, ok, refuse, type FakeClient } from "./test-helpers/fake.js";
import { mount as mountScreen, useScreen } from "./test-helpers/security.js";

useScreen();

let life = new AbortController();
afterEach(() => {
  life.abort();
  life = new AbortController();
});

const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

const entry = (seq: number, rest: Partial<LogEntryView> = {}): LogEntryView => ({
  seq,
  at: `2026-11-${String(10 + (seq % 10)).padStart(2, "0")}T10:00:00Z`,
  occurred_at: `2026-11-${String(10 + (seq % 10)).padStart(2, "0")}T10:00:00Z`,
  class: "change",
  kind: "password_changed",
  user_id: 2,
  actor: { user_id: 2 },
  ...rest,
});

/** The filters a cursor is sealed to, as one word. */
const sealOf = (q: LogQuery): string =>
  [...JSON.stringify([q.kinds ?? [], q.user ?? 0, q.actor ?? 0, q.actorKey ?? 0, q.oldestFirst])]
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    .toString(36);

/** A cursor resuming after (`n`) or before (`p`) the entry `seq` under
 *  `q`'s filters. */
const cursorOf = (side: "n" | "p", seq: number, q: LogQuery = {}): string =>
  `${side}${String(seq)}-${sealOf(q)}`;

/** access's security log over `log`: every filter matches,
 *  newest first unless `oldestFirst`, at most `limit` entries from the
 *  cursor's place, a page before one near the top is the first page, a
 *  cursor under other filters is `cursor_invalid`, and every class's
 *  counts. */
function server(log: readonly LogEntryView[], evicted = 0) {
  return (q: LogQuery = {}): Result<SecurityLogView> => {
    const oldest = q.oldestFirst === true;
    const match = log
      .filter(
        (e) =>
          (q.kinds === undefined || q.kinds.includes(e.kind)) &&
          (q.user === undefined || e.user_id === q.user),
      )
      .toSorted((a, b) => (oldest ? a.seq - b.seq : b.seq - a.seq));
    const limit = q.limit ?? 50;
    const at = q.cursor === undefined ? undefined : /^([np])(\d+)-(\w+)$/.exec(q.cursor);
    if (at === null || (at !== undefined && at[3] !== sealOf(q))) {
      return refuse(400, "cursor_invalid");
    }
    const seq = Number(at?.[2] ?? 0);
    const later = (e: LogEntryView): boolean => (oldest ? e.seq > seq : e.seq < seq);
    const before = match.filter((e) => !later(e) && e.seq !== seq).length;
    const start =
      at === undefined
        ? 0
        : at[1] === "n"
          ? match.length - match.filter(later).length
          : Math.max(0, before - limit);
    const items = match.slice(start, start + limit);
    const last = items.at(-1);
    const head = items[0];
    const count = (c: string): number => log.filter((e) => e.class === c).length;
    return ok({
      items,
      ...(last !== undefined && start + items.length < match.length
        ? { next_cursor: cursorOf("n", last.seq, q) }
        : {}),
      ...(head !== undefined && start > 0 ? { prev_cursor: cursorOf("p", head.seq, q) } : {}),
      offset: start,
      total: match.length,
      classes: [
        { class: "change", count: count("change"), evicted },
        { class: "session", count: count("session"), evicted: 0 },
      ],
    });
  };
}

const range = (from: number, to: number): LogEntryView[] =>
  Array.from({ length: to - from + 1 }, (_, i) => entry(from + i));

interface Mounted {
  readonly fake: Fake;
  readonly region: HTMLElement;
  readonly queries: string[];
  readonly refresh: () => Promise<void>;
}

function mount(
  fake: Fake,
  options: Partial<Omit<SecurityLogOptions<FakeClient>, "client">> = {},
): Mounted {
  const region = document.createElement("div");
  document.body.append(region);
  const queries: string[] = [];
  const screen = mountSecurityLog(region, {
    client: fake.client,
    search: "",
    viewer: 1,
    onQuery: (p) => {
      queries.push(p.toString());
    },
    signal: life.signal,
    ...options,
  });
  return { fake, region, queries, refresh: () => screen.refresh() };
}

const rows = (region: HTMLElement): Promise<HTMLTableRowElement[]> =>
  vi.waitFor(() => {
    const r = [...region.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    expect(r.length).toBeGreaterThan(0);
    return r;
  });

const seqs = (r: readonly HTMLTableRowElement[]): number[] =>
  r.map((x) => Number(x.dataset["seq"]));
const asked = (fake: Fake): (LogQuery | undefined)[] =>
  fake.named("adminSecurityLog").map((c) => c.args[0] as LogQuery | undefined);
const pagerLink = (region: HTMLElement, text: string): HTMLAnchorElement => {
  const a = [...region.querySelectorAll<HTMLAnchorElement>(".cp-pager a")].find(
    (x) => x.textContent === text,
  );
  expect(a, text).toBeDefined();
  return a!;
};
const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`body > [data-cp-live-regions] [data-cp-politeness='${politeness}']`)
    ?.textContent ?? "";
const noticeText = (region: HTMLElement): string =>
  region.querySelector("[data-part='notice'] .cp-notice [data-part='body']")?.textContent ?? "";

describe("mountSecurityLog: the table", () => {
  it("lists entries newest first with what, about whom, who and from where", async () => {
    const log = [
      entry(10, {
        class: "session",
        kind: "signed_in",
        method: "passkey",
        user_id: 1,
        ip: "192.0.2.10",
        actor: { user_id: 1, user_agent: FIREFOX },
      }),
      entry(11, {
        kind: "key_revoked",
        user_id: 1,
        actor: { user_id: 1, key_id: 14, label: "ci", key_suffix: "q2Z" },
      }),
      entry(12, {
        kind: "user_created",
        role: "user",
        user_id: 3,
        actor: { out_of_band: "socket" },
      }),
      entry(13, { kind: "method_locked", method: "password", trusted: false, actor: {} }),
    ];
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region } = mount(fake);
    const r = await rows(region);
    expect(seqs(r)).toEqual([13, 12, 11, 10]);
    const heads = [...region.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(heads).toEqual(["When", "What", "Account", "Who", "From where", "Type"]);
    const text = (row: HTMLTableRowElement): string[] => [...row.cells].map((c) => c.textContent);
    expect(text(r[3]!)).toEqual([
      expect.any(String),
      "Signed in with a passkey",
      "You",
      "YouFirefox on Linux",
      "192.0.2.10",
      "Session",
    ]);
    expect(r[3]!.cells[0]!.querySelector("time")?.dateTime).toBe(log[0]!.occurred_at);
    expect(r[3]!.cells[4]!.querySelector(".cp-mono")).not.toBeNull();
    expect(text(r[2]!).slice(1, 4)).toEqual(["API key revoked", "You", "Key ci…q2Z"]);
    expect(text(r[1]!).slice(1, 4)).toEqual([
      "Account created as a user",
      "Person 3",
      "The app's own command",
    ]);
    expect(text(r[0]!)[1]).toBe(
      "Password sign-in turned off after too many failed attempts from unknown devices",
    );
    expect(text(r[0]!)[3]).toBe("The app");
    expect(region.querySelector("[data-part='counts']")?.textContent).toBe(
      "The log holds 3 changes and 1 session entries.",
    );
    expect(region.textContent).toContain("Failed sign-ins are not recorded.");
    // The pill sets its place through the CSSOM, which a strict policy allows.
    expect(region.querySelectorAll("[style]:not(.cp-pill)")).toHaveLength(0);
  });

  it("asks for 50 entries newest first by default", async () => {
    const fake = new Fake().always("adminSecurityLog", server([entry(1)]));
    const { region } = mount(fake);
    await rows(region);
    expect(asked(fake)[0]).toEqual({ limit: 50 });
  });

  it("words the app's kinds, and shows an unknown kind as sent with its detail", async () => {
    const log = [
      entry(1, { kind: "tracker.url_changed", detail: "https://t.example" }),
      entry(2, { kind: "tracker.mode_off" }),
      entry(3, { kind: "tracker.other", detail: "flag" }),
    ];
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region } = mount(fake, {
      kinds: {
        "tracker.url_changed": (e) => `Address changed to ${e.detail ?? ""}`,
        "tracker.mode_off": "Password sign-in turned off",
      },
    });
    const r = await rows(region);
    expect(r.map((x) => x.cells[1]?.textContent)).toEqual([
      "tracker.otherflag",
      "Password sign-in turned off",
      "Address changed to https://t.example",
    ]);
    expect(r[0]?.cells[1]?.querySelector(".cp-mono")?.textContent).toBe("tracker.other");
  });

  it("names people from the admin's users list, and offers them as a filter", async () => {
    const fake = new Fake()
      .always("adminSecurityLog", server([entry(1, { user_id: 2, actor: { user_id: 3 } })]))
      .answer(
        "adminUsers",
        ok([
          { id: 2, username: "alice" },
          { id: 3, username: "sam", display_name: "Sam Ortiz" },
        ]),
      );
    const { region, queries } = mount(fake);
    const [row] = await rows(region);
    expect([row?.cells[2]?.textContent, row?.cells[3]?.textContent]).toEqual([
      "alice",
      "Sam Ortiz",
    ]);
    const select = await vi.waitFor(() => {
      const s = [...region.querySelectorAll("select")].find((x) =>
        [...x.options].some((o) => o.text === "Everyone"),
      );
      expect(s).toBeDefined();
      return s!;
    });
    expect([...select.options].map((o) => o.text)).toEqual(["Everyone", "alice", "Sam Ortiz"]);
    await userEvent.selectOptions(select, "2");
    await vi.waitFor(() => {
      expect(asked(fake).at(-1)).toEqual({ limit: 50, user: 2 });
    });
    expect(queries.at(-1)).toBe("user=2");
  });

  it("fixed to one account, has no Account column and asks only for its entries", async () => {
    const fake = new Fake().always(
      "adminSecurityLog",
      server([entry(1, { user_id: 2 }), entry(2, { user_id: 4 })]),
    );
    const { region } = mount(fake, { user: 2, search: "?user=4" });
    const r = await rows(region);
    expect(seqs(r)).toEqual([1]);
    expect([...region.querySelectorAll("thead th")].map((th) => th.textContent)).not.toContain(
      "Account",
    );
    expect(asked(fake)[0]).toEqual({ limit: 50, user: 2 });
    expect(fake.named("adminUsers")).toHaveLength(0);
  });

  it("says how many older entries the size limit removed", async () => {
    const fake = new Fake().always("adminSecurityLog", server([entry(1)], 312));
    const { region } = mount(fake);
    await rows(region);
    expect(region.querySelector("[data-part='evicted'] .cp-notice")?.textContent).toBe(
      "312 older entries were removed.",
    );
  });
});

describe("mountSecurityLog: the address and the pages", () => {
  it("reads its view from the address", async () => {
    const q = { kinds: ["signed_in"], user: 2, oldestFirst: true };
    const cursor = cursorOf("n", 20, q);
    const fake = new Fake().always("adminSecurityLog", server(range(1, 30)));
    const { region } = mount(fake, {
      search: `?order=oldest&kind=signed_in&user=2&cursor=${cursor}`,
    });
    await vi.waitFor(() => {
      expect(asked(fake)[0]).toEqual({ limit: 50, ...q, cursor });
    });
    expect(region.querySelector<HTMLInputElement>("input[value='oldest']")?.checked).toBe(true);
  });

  it("drops address values that name no view", async () => {
    const fake = new Fake().always("adminSecurityLog", server([entry(1)]));
    const { region } = mount(fake, {
      search: `?kind=Signed%20in&user=constructor&cursor=a%2Fb&order=sideways`,
    });
    await rows(region);
    expect(asked(fake)[0]).toEqual({ limit: 50 });
    const long = new Fake().always("adminSecurityLog", server([entry(1)]));
    await rows(mount(long, { search: `?cursor=${"a".repeat(1417)}` }).region);
    expect(asked(long)[0]).toEqual({ limit: 50 });
  });

  it("pages newest first by the cursors the server answers, saying where", async () => {
    const fake = new Fake().always("adminSecurityLog", server(range(1, 12)));
    const { region, queries } = mount(fake, { limit: 5 });
    expect(seqs(await rows(region))).toEqual([12, 11, 10, 9, 8]);
    const pager = (): string => region.querySelector(".cp-pager > span")?.textContent ?? "";
    expect(pager()).toBe("1 to 5 of 12");
    const newer = pagerLink(region, "Newer");
    expect(newer.getAttribute("aria-disabled")).toBe("true");
    expect(newer.hasAttribute("href")).toBe(false);
    const next = cursorOf("n", 8);
    expect(new URL(pagerLink(region, "Older").href).searchParams.get("cursor")).toBe(next);

    await userEvent.click(pagerLink(region, "Older"));
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([7, 6, 5, 4, 3]);
    });
    expect(asked(fake).at(-1)).toEqual({ limit: 5, cursor: next });
    expect(queries.at(-1)).toBe(`cursor=${next}`);
    expect(pager()).toBe("6 to 10 of 12");
    expect(document.activeElement?.textContent).toBe("Security log");

    await userEvent.click(pagerLink(region, "Newer"));
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([12, 11, 10, 9, 8]);
    });
    expect(asked(fake).at(-1)).toEqual({ limit: 5, cursor: cursorOf("p", 7) });
  });

  it("reads oldest first with Earlier and Later", async () => {
    const fake = new Fake().always("adminSecurityLog", server(range(1, 7)));
    const { region } = mount(fake, { limit: 5, search: "?order=oldest" });
    expect(seqs(await rows(region))).toEqual([1, 2, 3, 4, 5]);
    expect(asked(fake)[0]).toEqual({ limit: 5, oldestFirst: true });
    expect(pagerLink(region, "Earlier").getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(pagerLink(region, "Later"));
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([6, 7]);
    });
    expect(pagerLink(region, "Later").getAttribute("aria-disabled")).toBe("true");
    expect(pagerLink(region, "Earlier").getAttribute("aria-disabled")).toBeNull();
  });

  it.each([
    ["newest first", "", "Older", [5, 4, 3, 2, 1]],
    ["oldest first", "?order=oldest", "Later", [6, 7, 8, 9, 10]],
  ] as const)("%s, offers no page after a full last page", async (_order, search, onward, last) => {
    const fake = new Fake().always("adminSecurityLog", server(range(1, 10)));
    const { region } = mount(fake, { limit: 5, search });
    await rows(region);
    await userEvent.click(pagerLink(region, onward));
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual(last);
    });
    const link = pagerLink(region, onward);
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.hasAttribute("href")).toBe(false);
  });

  it("changing the order or the kind starts at the first page", async () => {
    const fake = new Fake().always(
      "adminSecurityLog",
      server([...range(1, 3), entry(4, { kind: "signed_in", class: "session" })]),
    );
    const { region, queries } = mount(fake, { search: `?cursor=${cursorOf("n", 9)}` });
    await rows(region);
    await userEvent.click(region.querySelector<HTMLInputElement>("input[value='oldest']")!);
    await vi.waitFor(() => {
      expect(asked(fake).at(-1)).toEqual({ limit: 50, oldestFirst: true });
    });
    expect(queries.at(-1)).toBe("order=oldest");
    const kind = region.querySelector<HTMLSelectElement>("select")!;
    await userEvent.selectOptions(kind, "signed_in");
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([4]);
    });
    expect(queries.at(-1)).toBe("order=oldest&kind=signed_in");
  });

  it.each([
    ["no longer opens", () => "n9-gone"],
    ["was sealed to other filters", () => cursorOf("n", 9)],
    ["reaches past the end", () => cursorOf("n", 1, { kinds: ["password_changed"] })],
  ])(
    "an address whose cursor %s shows its first page and corrects the address",
    async (_case, cursor) => {
      const fake = new Fake().always("adminSecurityLog", server(range(5, 8)));
      const replaced: [string, boolean][] = [];
      const { region } = mount(fake, {
        search: `?kind=password_changed&cursor=${cursor()}`,
        onQuery: (p, replace) => {
          replaced.push([p.toString(), replace]);
        },
      });
      await vi.waitFor(async () => {
        expect(seqs(await rows(region))).toEqual([8, 7, 6, 5]);
      });
      expect(asked(fake).at(-1)).toEqual({ limit: 50, kinds: ["password_changed"] });
      expect(replaced).toEqual([["kind=password_changed", true]]);
      expect(noticeText(region)).toBe("");
    },
  );
});

describe("mountSecurityLog: its states", () => {
  it("says the log is empty, and that a filter matched nothing with Clear filters", async () => {
    const fake = new Fake().always("adminSecurityLog", server([]));
    const { region, queries } = mount(fake, { search: "?kind=signed_in" });
    await vi.waitFor(() => {
      expect(region.querySelector(".cp-empty")?.textContent).toBe(
        "Nothing matches these filters.Clear filters",
      );
    });
    await userEvent.click(region.querySelector<HTMLButtonElement>(".cp-empty button")!);
    await vi.waitFor(() => {
      expect(region.querySelector(".cp-empty")?.textContent).toBe("Nothing has happened yet.");
    });
    expect(queries.at(-1)).toBe("");
  });

  it("offers Retry on a failed read, which reads again", async () => {
    const fake = new Fake()
      .answer("adminSecurityLog", refuse(503, "auth_unavailable"))
      .always("adminSecurityLog", server([entry(1)]));
    const { region } = mount(fake);
    await vi.waitFor(() => {
      expect(noticeText(region)).not.toBe("");
    });
    await userEvent.click(region.querySelector<HTMLButtonElement>("[data-part='notice'] button")!);
    expect(seqs(await rows(region))).toEqual([1]);
  });

  it.each([
    ["a refusal", refuse(503, "auth_unavailable"), "[data-part='notice'] .cp-notice"],
    ["an empty page", server([]), ".cp-empty"],
  ])(
    "keeps what a newer load drew, %s, when an older load answers past the sketch's delay",
    async (_name, answer, drawn) => {
      const late = Promise.withResolvers<unknown>();
      const fake = new Fake().answer("adminSecurityLog", () => late.promise, answer);
      const { region } = mount(fake);
      const kind = region.querySelector<HTMLSelectElement>("select")!;
      kind.value = "signed_in";
      kind.dispatchEvent(new Event("change"));
      await vi.waitFor(() => {
        expect(region.querySelector(drawn)).not.toBeNull();
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      late.resolve(server([entry(1)])());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(region.querySelector(drawn)).not.toBeNull();
      expect(region.querySelector(".cp-skeleton")).toBeNull();
      expect(region.querySelector("tbody tr")).toBeNull();
    },
  );

  it("words a kind the server does not know, and a refusal to a non-admin", async () => {
    const fake = new Fake()
      .answer("adminSecurityLog", refuse(400, "auth_bad_request", "log_kind"))
      .answer("adminSecurityLog", refuse(403, "auth_forbidden"));
    const first = mount(fake, { search: "?kind=tracker.gone" });
    await vi.waitFor(() => {
      expect(noticeText(first.region)).toBe("This app does not record that kind of entry.");
    });
    const second = mount(fake);
    await vi.waitFor(() => {
      expect(noticeText(second.region)).toBe("Only an administrator can read the security log.");
    });
  });

  it("ends the screen when the session is gone", async () => {
    const reasons: string[] = [];
    const fake = new Fake().answer(
      "adminSecurityLog",
      refuse(401, "auth_session_expired", "transport_changed"),
    );
    mount(fake, {
      onSignedOut: ({ reason }) => {
        reasons.push(reason);
      },
    });
    await vi.waitFor(() => {
      expect(reasons).toEqual(["transport-changed"]);
    });
  });
});

describe("mountSecurityLog: refresh", () => {
  it("puts new entries on the first page on top, and says how many", async () => {
    const log = range(1, 3);
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region, refresh } = mount(fake, { limit: 4 });
    expect(seqs(await rows(region))).toEqual([3, 2, 1]);
    log.push(entry(4), entry(5));
    await refresh();
    expect(asked(fake).at(-1)).toEqual({ limit: 4 });
    expect(seqs(await rows(region))).toEqual([5, 4, 3, 2]);
    expect(pagerLink(region, "Older").getAttribute("aria-disabled")).toBeNull();
    await vi.waitFor(() => {
      expect(said("polite")).toBe("2 new entries");
    });
  });

  it("re-sends the cursor that reached a later page, which keeps its rows", async () => {
    const log = range(1, 8);
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region, refresh } = mount(fake, { limit: 5 });
    await rows(region);
    await userEvent.click(pagerLink(region, "Older"));
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([3, 2, 1]);
    });
    const reached = asked(fake).at(-1);
    log.push(entry(9));
    await refresh();
    expect(asked(fake).at(-1)).toEqual(reached);
    expect(seqs(await rows(region))).toEqual([3, 2, 1]);
    expect(region.querySelector(".cp-pager > span")?.textContent).toBe("7 to 9 of 9");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(said("polite")).not.toContain("new entr");
  });

  it("oldest first, a full last page offers Later once another entry arrives", async () => {
    const log = range(1, 5);
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region, refresh } = mount(fake, { limit: 5, search: "?order=oldest" });
    expect(seqs(await rows(region))).toEqual([1, 2, 3, 4, 5]);
    expect(pagerLink(region, "Later").getAttribute("aria-disabled")).toBe("true");
    log.push(entry(6));
    await refresh();
    await vi.waitFor(() => {
      expect(pagerLink(region, "Later").getAttribute("aria-disabled")).toBeNull();
    });
    expect(seqs(await rows(region))).toEqual([1, 2, 3, 4, 5]);
    expect(said("polite")).not.toContain("new entr");
  });

  it("oldest first, adds new entries under a last page with room, saying only those drawn", async () => {
    const log = range(1, 3);
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region, refresh } = mount(fake, { limit: 5, search: "?order=oldest" });
    expect(seqs(await rows(region))).toEqual([1, 2, 3]);
    log.push(...range(4, 8));
    await refresh();
    expect(seqs(await rows(region))).toEqual([1, 2, 3, 4, 5]);
    expect(pagerLink(region, "Later").getAttribute("aria-disabled")).toBeNull();
    await vi.waitFor(() => {
      expect(said("polite")).toBe("2 new entries");
    });
  });

  it("says nothing of a refresh the server refused, and keeps the rows", async () => {
    const log = range(1, 2);
    const fake = new Fake().always("adminSecurityLog", server(log));
    const { region, refresh } = mount(fake, { limit: 2 });
    expect(seqs(await rows(region))).toEqual([2, 1]);
    log.push(...range(3, 5));
    fake.answer("adminSecurityLog", refuse(503, "auth_unavailable"));
    await refresh();
    await vi.waitFor(() => {
      expect(noticeText(region)).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(said("polite")).not.toContain("new entr");
    expect(seqs(await rows(region))).toEqual([2, 1]);
  });

  it("says nothing of a refresh a Kind change replaced", async () => {
    const log = [...range(1, 2)];
    const late = Promise.withResolvers<undefined>();
    let held = false;
    const fake = new Fake().always("adminSecurityLog", async (q: LogQuery = {}) => {
      if (held && q.kinds === undefined) {
        await late.promise;
      }
      return server(log)(q);
    });
    const { region, refresh } = mount(fake, { limit: 2 });
    expect(seqs(await rows(region))).toEqual([2, 1]);
    log.push(...range(3, 30), entry(31, { kind: "signed_in", class: "session" }));
    held = true;
    const done = refresh();
    await vi.waitFor(() => {
      expect(asked(fake)).toHaveLength(2);
    });
    await userEvent.selectOptions(region.querySelector<HTMLSelectElement>("select")!, "signed_in");
    await vi.waitFor(async () => {
      expect(seqs(await rows(region))).toEqual([31]);
    });
    late.resolve(undefined);
    await done;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(said("polite")).not.toContain("new entr");
    expect(seqs(await rows(region))).toEqual([31]);
  });

  it("reads once after a load, however many refreshes came during it", async () => {
    const log = range(1, 3);
    const fake = new Fake()
      .answer("adminSecurityLog", server([...log]))
      .always("adminSecurityLog", server(log));
    const release = fake.hold("adminSecurityLog");
    const { region, refresh } = mount(fake, { limit: 4 });
    await vi.waitFor(() => {
      expect(asked(fake)).toHaveLength(1);
    });
    const both = Promise.all([refresh(), refresh()]);
    log.push(entry(4));
    release();
    await both;
    expect(asked(fake)).toEqual([{ limit: 4 }, { limit: 4 }]);
    expect(seqs(await rows(region))).toEqual([4, 3, 2, 1]);
  });

  it("after a refused Older page, reads that page again and drops the notice", async () => {
    const fake = new Fake().always("adminSecurityLog", server(range(1, 8)));
    const { region, refresh } = mount(fake, { limit: 5 });
    expect(seqs(await rows(region))).toEqual([8, 7, 6, 5, 4]);
    fake.answer("adminSecurityLog", refuse(503, "auth_unavailable"));
    await userEvent.click(pagerLink(region, "Older"));
    await vi.waitFor(() => {
      expect(noticeText(region)).toBe(
        "The app cannot do this right now. Try again in a few seconds.",
      );
    });
    await refresh();
    expect(asked(fake).at(-1)).toEqual({ limit: 5, cursor: cursorOf("n", 4) });
    expect(seqs(await rows(region))).toEqual([3, 2, 1]);
    expect(noticeText(region)).toBe("");
  });
});

describe("mountSecurity: the security log section", () => {
  const LOG = [entry(1, { user_id: 1, actor: { user_id: 1 } }), entry(2, { user_id: 2 })];

  it("shows an admin the entries about them", async () => {
    const fake = new Fake().always("adminSecurityLog", server(LOG));
    const { region } = mountScreen(fake, {
      parts: ["security-log"],
      log: { onQuery: () => undefined },
    });
    const heading = await vi.waitFor(() => {
      const h = [...region.querySelectorAll("h2")].find((x) => x.textContent === "Security log");
      expect(h).toBeDefined();
      return h!;
    });
    expect(heading.closest("section")?.querySelector("[data-part='log']")).not.toBeNull();
    await vi.waitFor(() => {
      expect(asked(fake)[0]).toEqual({ limit: 50, user: 1 });
    });
  });

  it("shows everyone's with `everyone`, and in an app with one account", async () => {
    const fake = new Fake().always("adminSecurityLog", server(LOG));
    mountScreen(fake, {
      parts: ["security-log"],
      log: { everyone: true, onQuery: () => undefined },
    });
    await vi.waitFor(() => {
      expect(asked(fake)[0]).toEqual({ limit: 50 });
    });
    const single = new Fake()
      .always("adminSecurityLog", server(LOG))
      .always("me", ok(meWith({}, { single_user: true })));
    mountScreen(single, { parts: ["security-log"], log: { onQuery: () => undefined } });
    await vi.waitFor(() => {
      expect(asked(single)[0]).toEqual({ limit: 50 });
    });
  });

  it("has no log for a person who is not an admin, or whom the server refuses", async () => {
    const user = new Fake().always(
      "me",
      ok(meWith({}, { user: { id: 2, username: "alice", role: "user" } })),
    );
    const a = mountScreen(user, { parts: ["profile", "security-log"] });
    await vi.waitFor(() => {
      expect(a.region.textContent).toContain("Profile");
    });
    expect(a.region.textContent).not.toContain("Security log");
    expect(user.named("adminSecurityLog")).toHaveLength(0);

    const refused = new Fake().always("adminSecurityLog", refuse(403, "auth_forbidden"));
    const b = mountScreen(refused, { parts: ["profile", "security-log"] });
    await vi.waitFor(() => {
      expect(refused.named("adminSecurityLog")).toHaveLength(1);
      expect(b.region.textContent).not.toContain("Security log");
    });
  });
});
