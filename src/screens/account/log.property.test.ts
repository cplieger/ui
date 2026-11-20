import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { LogEntryView, LogQuery, Result, SecurityLogView } from "./client.js";
import { mountSecurityLog } from "./log.js";
import { Fake, ok, refuse } from "./test-helpers/fake.js";
import { useScreen } from "./test-helpers/security.js";

useScreen();

/** Runs every task the screen queued, promise continuations included. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise<void>((resolve) => {
      const c = new MessageChannel();
      c.port1.onmessage = () => {
        c.port1.close();
        resolve();
      };
      c.port2.postMessage(0);
    });
  }
};

const entry = (seq: number): LogEntryView => ({
  seq,
  at: "2026-11-14T10:00:00Z",
  occurred_at: "2026-11-14T10:00:00Z",
  class: "change",
  kind: "password_changed",
  user_id: 2,
  actor: { user_id: 2 },
});

/** The log as access keeps it: seqs ascending, the oldest dropped past
 *  its size cap. */
class Model {
  seqs: number[] = [];
  next = 1;
  evicted = 0;
  /** The log as the screen's last read saw it. */
  seen: readonly number[] = [];
  constructor(readonly cap: number) {}

  arrive(n: number): void {
    for (let i = 0; i < n; i += 1) {
      this.seqs.push(this.next);
      this.next += 1;
    }
    const over = Math.max(0, this.seqs.length - this.cap);
    this.seqs.splice(0, over);
    this.evicted += over;
  }

  /** access's SecurityLog: `after` and `before` exclusive, newest first
   *  unless `oldestFirst`, at most `limit` entries, a bound past JSON's
   *  exact range refused. */
  answer(q: LogQuery = {}): Result<SecurityLogView> {
    if ((q.after ?? 0) > Number.MAX_SAFE_INTEGER || (q.before ?? 0) > Number.MAX_SAFE_INTEGER) {
      return refuse(400, "auth_bad_request", "log_range") as Result<SecurityLogView>;
    }
    this.seen = [...this.seqs];
    const match = this.seqs.filter(
      (s) => (q.after === undefined || s > q.after) && (q.before === undefined || s < q.before),
    );
    const sorted = q.oldestFirst === true ? match : match.toReversed();
    return ok({
      entries: sorted.slice(0, q.limit ?? 50).map(entry),
      classes: [{ class: "change", count: this.seqs.length, evicted: this.evicted }],
    });
  }
}

interface Address {
  readonly order: "newest" | "oldest";
  readonly before?: number;
  readonly after?: number;
}

const addressOf = (params: string): Address => {
  const p = new URLSearchParams(params);
  const before = p.get("before");
  const after = p.get("after");
  return {
    order: p.get("order") === "oldest" ? "oldest" : "newest",
    ...(before === null ? {} : { before: Number(before) }),
    ...(after === null ? {} : { after: Number(after) }),
  };
};

/** The page an address names in `log`: the `limit` entries nearest its
 *  bound on the bound's side, or nearest the order's start, in its order. */
function slice(log: readonly number[], a: Address, limit: number): number[] {
  let page: number[];
  if (a.before !== undefined) {
    page = log.filter((s) => s < a.before!).slice(-limit);
  } else if (a.after !== undefined) {
    page = log.filter((s) => s > a.after!).slice(0, limit);
  } else {
    page = a.order === "newest" ? log.slice(-limit) : log.slice(0, limit);
  }
  return a.order === "newest" ? page.toReversed() : page;
}

const polite = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    "body > [data-cp-live-regions] [data-cp-politeness='polite']",
  );
const SENTINEL = "nothing said";

class Run {
  readonly model: Model;
  region = document.createElement("div");
  refresh!: () => Promise<void>;
  show!: (search: string) => void;
  address = "";
  life = new AbortController();
  limit: number;

  constructor(cap: number, limit: number, start: number) {
    this.model = new Model(cap);
    this.model.arrive(start);
    this.limit = limit;
    this.mount();
  }

  mount(): void {
    this.end();
    this.life = new AbortController();
    const fake = new Fake().always("adminSecurityLog", (q?: LogQuery) => this.model.answer(q));
    this.region = document.createElement("div");
    document.body.append(this.region);
    const screen = mountSecurityLog(this.region, {
      client: fake.client,
      search: this.address,
      viewer: 1,
      limit: this.limit,
      onQuery: (p) => {
        this.address = p.toString();
      },
      signal: this.life.signal,
    });
    this.refresh = () => screen.refresh();
    this.show = (search) => {
      screen.show(search);
    };
  }

  end(): void {
    this.life.abort();
    this.region.remove();
  }

  rows(): number[] {
    return [...this.region.querySelectorAll<HTMLElement>("tbody tr")].map((r) =>
      Number(r.dataset["seq"]),
    );
  }

  link(side: "older" | "newer"): HTMLAnchorElement | null {
    const a = this.region.querySelector<HTMLAnchorElement>(`.cp-pager a[data-part='${side}']`);
    return a === null || a.getAttribute("aria-disabled") === "true" ? null : a;
  }

  /** The page drawn is the one its address names in the log as last read,
   *  with each side offered exactly when the log goes on past it. */
  check(step: string): void {
    const where = `after ${step}`;
    const a = addressOf(this.address);
    const log = this.model.seen;
    const rows = this.rows();
    expect(rows, `${where}: the rows of ${this.address || "the first page"}`).toEqual(
      slice(log, a, this.limit),
    );
    const newest = log.at(-1);
    if (a.before !== undefined || a.after !== undefined) {
      expect(rows.length, `${where}: a bound names a page that has entries`).toBeGreaterThan(0);
    }
    if (a.order === "newest" && newest !== undefined && rows.includes(newest)) {
      expect(this.address, `${where}: the newest end is the first page`).toBe("");
    }
    const low = Math.min(...rows);
    const high = Math.max(...rows);
    expect(this.link("older") !== null, `${where}: Older offered`).toBe(
      rows.length > 0 && log.some((s) => s < low),
    );
    expect(this.link("newer") !== null, `${where}: Newer offered`).toBe(
      rows.length > 0 && log.some((s) => s > high),
    );
  }
}

type Command = fc.AsyncCommand<Run, Run>;

/** Runs `act`, then checks the page, and that the arrivals said are
 *  `said` of what was drawn and read before it. The announcer empties its
 *  region as it is called and says the words a moment later. */
async function step(
  r: Run,
  name: string,
  act: () => Promise<void> | void,
  said: (before: readonly number[], beforeLog: readonly number[]) => number,
): Promise<void> {
  const before = r.rows();
  const beforeLog = r.model.seen;
  const region = polite();
  if (region !== null) {
    region.textContent = SENTINEL;
  }
  await act();
  await settle();
  r.check(name);
  const n = said(before, beforeLog);
  const where = `after ${name}: the arrivals said`;
  if (n === 0) {
    // A remount makes the announcer's region afresh, where no page drawn
    // before it can have arrivals.
    if (polite() === region) {
      expect(region?.textContent ?? SENTINEL, where).toBe(SENTINEL);
    }
  } else {
    await vi.waitFor(() => {
      expect(polite()?.textContent, where).toBe(
        n === 1 ? "1 new entry" : `${String(n)} new entries`,
      );
    });
  }
}

const none = (): number => 0;

class Arrive implements Command {
  constructor(readonly n: number) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    const before = r.rows();
    await step(
      r,
      this.toString(),
      () => {
        r.model.arrive(this.n);
      },
      none,
    );
    expect(r.rows(), `${this.toString()}: nothing redraws before a read`).toEqual(before);
  }
  toString = (): string => `arrive(${String(this.n)})`;
}

class Page implements Command {
  constructor(readonly side: "older" | "newer") {}
  check = (m: Run): boolean => m.link(this.side) !== null;
  async run(_m: Run, r: Run): Promise<void> {
    await step(r, this.toString(), () => r.link(this.side)?.click(), none);
  }
  toString = (): string => this.side;
}

class Refresh implements Command {
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    // Entries written since a page at the newest end are said, as many as
    // the page now draws of them.
    await step(r, this.toString(), r.refresh, (before, log) => {
      const top = before.length === 0 ? 0 : Math.max(...before);
      const atEnd = !log.some((s) => s > top);
      return atEnd ? r.rows().filter((s) => s > top).length : 0;
    });
  }
  toString = (): string => "refresh";
}

class Order implements Command {
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    const other = addressOf(r.address).order === "newest" ? "oldest" : "newest";
    await step(
      r,
      this.toString(),
      () => r.region.querySelector<HTMLInputElement>(`input[value='${other}']`)?.click(),
      none,
    );
    expect(addressOf(r.address).order).toBe(other);
  }
  toString = (): string => "switch order";
}

class Limit implements Command {
  constructor(readonly limit: number) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    await step(
      r,
      this.toString(),
      () => {
        r.limit = this.limit;
        r.mount();
      },
      none,
    );
  }
  toString = (): string => `limit(${String(this.limit)})`;
}

/** An address the pager never writes: a host's `show()`, or a page mounted
 *  from a search, with a bound anywhere in or past the log. */
class Open implements Command {
  constructor(
    readonly how: "show" | "mount",
    readonly order: "newest" | "oldest",
    readonly side: "before" | "after" | undefined,
    readonly at: number,
  ) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    const p = new URLSearchParams();
    if (this.order === "oldest") {
      p.set("order", "oldest");
    }
    if (this.side !== undefined) {
      p.set(this.side, String(this.at));
    }
    const search = p.toString();
    await step(
      r,
      this.toString(),
      () => {
        r.address = search;
        if (this.how === "show") {
          r.show(search);
        } else {
          r.mount();
        }
      },
      none,
    );
  }
  toString = (): string =>
    `${this.how}(${this.order}${this.side === undefined ? "" : ` ${this.side}=${String(this.at)}`})`;
}

const commands = fc.commands(
  [
    fc.integer({ min: 1, max: 6 }).map((n): Command => new Arrive(n)),
    fc.constant<Command>(new Page("older")),
    fc.constant<Command>(new Page("newer")),
    fc.constant<Command>(new Refresh()),
    fc.constant<Command>(new Order()),
    fc.integer({ min: 1, max: 5 }).map((n): Command => new Limit(n)),
    fc
      .tuple(
        fc.constantFrom<"show" | "mount">("show", "mount"),
        fc.constantFrom<"newest" | "oldest">("newest", "oldest"),
        fc.constantFrom<"before" | "after" | undefined>("before", "after", undefined),
        fc.oneof(fc.integer({ min: 1, max: 40 }), fc.constant(Number.MAX_SAFE_INTEGER - 1)),
      )
      .map(([how, order, side, at]): Command => new Open(how, order, side, at)),
  ],
  { maxCommands: 14 },
);

// fast-check's own budget per assert is 10 s, so the runs go in batches,
// each stopping early on a loaded host, until 1,000 have run.
const RUNS = 1_000;

describe("mountSecurityLog against a model log", () => {
  it("draws the page its address names, offers each side the log has, and says only new arrivals", async () => {
    let runs = 0;
    // A run the time limit cut off still runs: the next waits for it, so
    // no two share the page or the announcer.
    let inflight: Promise<unknown> = Promise.resolve();
    const started = performance.now();
    while (runs < RUNS) {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 24 }),
          fc.integer({ min: 1, max: 5 }),
          fc.nat(20),
          commands,
          async (cap, limit, start, cmds) => {
            await inflight.catch(() => undefined);
            runs += 1;
            const run = new Run(cap, limit, start);
            const going = (async () => {
              try {
                await settle();
                run.check("the first read");
                await fc.asyncModelRun(() => ({ model: run, real: run }), cmds);
              } finally {
                run.end();
              }
            })();
            inflight = going;
            await going;
          },
        ),
        { numRuns: 200, plugins: [fc.interruptAfterTimeLimit(8_000)] },
      );
    }
    console.info(
      `log model: ${String(runs)} runs in ${String(Math.round(performance.now() - started))} ms`,
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  }, 600_000);
});
