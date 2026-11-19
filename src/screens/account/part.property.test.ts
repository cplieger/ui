import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type {
  KeyView,
  PasskeyView,
  Result,
  SessionView,
  StateResponse,
  UserView,
} from "./client.js";
import { mountInvite } from "./invite.js";
import { mountSecurityLog } from "./log.js";
import { mountAccessSettings } from "./settings.js";
import { mountSetup } from "./setup.js";
import { mountSignIn } from "./sign-in.js";
import {
  ALICE_USER,
  BACKUP,
  Fake,
  HERE,
  meWith,
  noAnswer,
  ok,
  PHONE,
  refuse,
} from "./test-helpers/fake.js";
import { mount as mountAccount, useScreen } from "./test-helpers/security.js";
import { mountUsers } from "./users.js";

useScreen();

/** Waits until `check` holds: a press's answer draws only once its
 *  button's busy state, shown 150 ms in on a loaded host, has held. */
const drawnBy = async <T>(check: () => T): Promise<T> => vi.waitFor(check, { timeout: 3_000 });

/** Runs every task the screens queued, promise continuations included. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) {
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

type Outcome = "ok" | "refused" | "failed";

/** The rows a screen lists and names in place, as the server holds them. */
interface Server {
  readonly names: Map<string, string>;
  readonly present: Set<string>;
}

interface Rows {
  /** The rename call and the row ids the server starts with. */
  readonly rename: string;
  readonly ids: readonly string[];
  readonly first: (id: string) => string;
  /** The Rename… control's key for row `id`. */
  readonly key: (id: string) => string;
  readonly heading: string;
}

interface Step {
  /** Queues the answers that draw the step's code field. */
  readonly enter: (fake: Fake) => void;
  /** The call the step's code form sends. */
  readonly call: string;
}

interface Screen {
  readonly name: string;
  /** The read whose answers the property varies. */
  readonly call: string;
  readonly fake: () => Fake;
  readonly mount: (
    fake: Fake,
    signal: AbortSignal,
  ) => { readonly region: HTMLElement; readonly refresh: () => void };
  /** The answer read `n` gets, on the rows `server` holds now. */
  readonly answer: (n: number, server: Server, args: readonly unknown[]) => Result<unknown>;
  /** What the screen draws of read `n`'s answer. */
  readonly marker: (n: number) => string;
  /** What the screen draws now, "" when nothing is. */
  readonly shows: (region: HTMLElement) => string;
  readonly rows?: Rows;
  /** Answers the screen's other reads from `server`. */
  readonly serve?: (fake: Fake, server: Server) => void;
  /** A sign-in step the form's next send enters, asking for a code. */
  readonly step?: Step;
}

const EVERY: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  secure: true,
  https_required: [],
};
const owner = meWith({}, { owner: true, single_user: false });
const ME: UserView = { ...ALICE_USER, id: 1, username: "mika", role: "admin", owner: true };
const MODES = ["alongside", "for_linked", "only"] as const;

const textOf = (region: HTMLElement, selector: string): string =>
  region.querySelector(selector)?.textContent ?? "";
const numbered = (text: string, re: RegExp): string => re.exec(text)?.[1] ?? "";

/** The form a public screen draws, filled in and sent: the screen's
 *  refusal of it reads the state again. With no form, the notice's Retry. */
const send = (region: HTMLElement): void => {
  const user = region.querySelector<HTMLInputElement>("input[name='username']");
  const password = region.querySelector<HTMLInputElement>("input[name='password']");
  if (user === null || password === null) {
    region.querySelector<HTMLElement>("[data-cp-action='retry']")?.click();
    return;
  }
  if (!user.readOnly) {
    user.value = "mika";
  }
  password.value = "lantern harbour quietly";
  user.form?.requestSubmit();
};
const formShown = (region: HTMLElement): string =>
  region.querySelector("input[name='username']") ? "form" : "";
const codeField = (region: HTMLElement): HTMLInputElement | null =>
  region.querySelector<HTMLInputElement>("input[name='code']");
/** The enrolment a first password's `entry` answers under a second-factor
 *  rule, drawn with its authenticator key. */
const enrolment = (entry: string): Step => ({
  enter: (fake) => {
    fake
      .answer(entry, ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp"] } }))
      .answer(
        "pendingTOTPBegin",
        ok({ uri: "otpauth://totp/x?secret=JBSWY3DP", text: "JBSWY3DP" }),
      );
  },
  call: "pendingTOTPFinish",
});

const session = (id: string, server: Server): SessionView => ({
  ...HERE,
  id,
  label: server.names.get(id) ?? id,
  current: false,
  last_activity: "2026-11-14T09:00:00Z",
});
const key = (id: string, server: Server): KeyView => ({
  ...BACKUP,
  id: Number(id),
  label: server.names.get(id) ?? id,
});
const passkey = (id: string, server: Server): PasskeyView => ({
  ...PHONE,
  id: Number(id),
  name: server.names.get(id) ?? id,
});
/** A held code's late answers: a step no other command enters, and a
 *  rate limit's wait. */
const LATE_STEP = ok({ pending: { ticket: "t2", next: "set_credential", methods: ["password"] } });
const LATE_WAIT = refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" });

const listed = <T>(server: Server, make: (id: string, server: Server) => T): T[] =>
  [...server.present].map((id) => make(id, server));

const screens: readonly Screen[] = [
  {
    name: "Sessions",
    call: "sessions",
    fake: () => new Fake(),
    mount: (fake, signal) => {
      const { region, screen } = mountAccount(fake, {
        parts: ["sessions", "session-rename"],
        signal,
      });
      return { region, refresh: () => void screen.refresh() };
    },
    answer: (n, server) =>
      ok([{ ...HERE, last_ip: `192.0.2.${String(n)}` }, ...listed(server, session)]),
    marker: String,
    shows: (region) => numbered(textOf(region, "[data-part='sessions'] tbody"), /192\.0\.2\.(\d+)/),
    rows: {
      rename: "renameSession",
      ids: ["s2", "s3"],
      first: (id) => (id === "s2" ? "Phone" : "Tablet"),
      key: (id) => `session-rename-${id}`,
      heading: "Sessions",
    },
  },
  {
    name: "API keys",
    call: "keys",
    fake: () => new Fake(),
    mount: (fake, signal) => {
      const { region, screen } = mountAccount(fake, { parts: ["keys", "key-rotate"], signal });
      return { region, refresh: () => void screen.refresh() };
    },
    answer: (n, server) =>
      ok([{ ...BACKUP, id: 1, label: "marker", suffix: `z${String(n)}q` }, ...listed(server, key)]),
    marker: String,
    shows: (region) => numbered(textOf(region, "[data-part='keys'] tbody"), /z(\d+)q/),
    rows: {
      rename: "renameKey",
      ids: ["12", "99"],
      first: (id) => (id === "12" ? "backup script" : "Tablet"),
      key: (id) => `key-rename-${id}`,
      heading: "API keys",
    },
  },
  {
    name: "Account and security",
    call: "me",
    fake: () => new Fake(),
    mount: (fake, signal) => {
      const { region, screen } = mountAccount(fake, { parts: ["passkeys"], signal });
      return { region, refresh: () => void screen.refresh() };
    },
    answer: (n, server) =>
      ok(
        meWith(
          { passkey_count: server.present.size },
          { user: { id: 1, username: `u${String(n)}`, role: "admin" } },
        ),
      ),
    marker: String,
    shows: (region) => numbered(textOf(region, "[data-part='session']"), /Signed in as u(\d+)/),
    rows: {
      rename: "renamePasskey",
      ids: ["7", "8"],
      first: (id) => (id === "7" ? "Phone" : "Tablet"),
      key: (id) => `passkey-rename-${id}`,
      heading: "Sign-in methods",
    },
    serve: (fake, server) => {
      fake.always("passkeys", () => ok(listed(server, passkey)));
    },
  },
  {
    name: "Users",
    call: "adminUsers",
    fake: () => new Fake().always("me", ok(owner)),
    mount: (fake, signal) => {
      const region = document.createElement("div");
      document.body.append(region);
      const screen = mountUsers(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        signal,
      });
      return { region, refresh: () => void screen.refresh() };
    },
    answer: (n) => ok([ME, { ...ALICE_USER, username: `u${String(n)}` }]),
    marker: String,
    shows: (region) => numbered(textOf(region, "[data-part='users'] tbody"), /u(\d+)/),
  },
  {
    name: "Access settings",
    call: "state",
    fake: () => new Fake().always("me", ok(owner)),
    mount: (fake, signal) => {
      const region = document.createElement("div");
      document.body.append(region);
      const screen = mountAccessSettings(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        signal,
      });
      return { region, refresh: () => void screen.refresh() };
    },
    answer: (n) => ok({ ...EVERY, sso: MODES[n % 3] }),
    marker: (n) => MODES[n % 3] ?? "",
    shows: (region) =>
      region.querySelector<HTMLInputElement>("input[type='radio']:checked")?.value ?? "",
  },
  {
    name: "Security log",
    call: "adminSecurityLog",
    fake: () => new Fake(),
    mount: (fake, signal) => {
      const region = document.createElement("div");
      document.body.append(region);
      const screen = mountSecurityLog(region, {
        client: fake.client,
        search: "",
        viewer: 1,
        onQuery: () => undefined,
        signal,
      });
      return { region, refresh: () => void screen.refresh() };
    },
    // Entries 1 to n: the newest first, or those after `after` oldest first.
    answer: (n, _server, args) => {
      const after = (args[0] as { readonly after?: number } | undefined)?.after;
      const seqs = Array.from({ length: n }, (_, i) => i + 1).filter(
        (s) => after === undefined || s > after,
      );
      return ok({
        entries: (after === undefined ? seqs.toReversed() : seqs).map((seq) => ({
          seq,
          at: "2026-11-14T10:00:00Z",
          occurred_at: "2026-11-14T10:00:00Z",
          class: "change",
          kind: "password_changed",
          user_id: 2,
          actor: { user_id: 2 },
        })),
        classes: [{ class: "change", count: n, evicted: 0 }],
      });
    },
    marker: String,
    shows: (region) => region.querySelector<HTMLElement>("tbody tr")?.dataset["seq"] ?? "",
  },
  {
    name: "Sign-in",
    call: "state",
    fake: () => new Fake().always("loginPassword", refuse(403, "auth_password_login_disabled")),
    mount: (fake, signal) => {
      const region = document.createElement("section");
      document.body.append(region);
      mountSignIn(region, {
        client: fake.client,
        access: fake.access(),
        navigate: () => undefined,
        search: "",
        signal,
      });
      return { region, refresh: () => send(region) };
    },
    answer: () => ok(EVERY),
    marker: () => "form",
    shows: formShown,
    step: {
      enter: (fake) => {
        fake.answer(
          "loginPassword",
          ok({ pending: { ticket: "t1", next: "second_factor", methods: ["totp"] } }),
        );
      },
      call: "loginCode",
    },
  },
  {
    name: "Setup",
    call: "state",
    fake: () => new Fake().always("setupPassword", refuse(403, "auth_https_required")),
    mount: (fake, signal) => {
      const region = document.createElement("section");
      document.body.append(region);
      mountSetup(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: () => undefined,
        signal,
      });
      return { region, refresh: () => send(region) };
    },
    answer: () => ok({ ...EVERY, setup_required: true, oidc: false }),
    marker: () => "form",
    shows: formShown,
    step: enrolment("setupPassword"),
  },
  {
    name: "Invite",
    call: "state",
    fake: () => new Fake().always("inviteAcceptPassword", refuse(403, "auth_https_required")),
    mount: (fake, signal) => {
      const region = document.createElement("section");
      document.body.append(region);
      mountInvite(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        token: "inv-1",
        navigate: () => undefined,
        signal,
      });
      return { region, refresh: () => send(region) };
    },
    answer: () => ok(EVERY),
    marker: () => "form",
    shows: formShown,
    step: enrolment("inviteAcceptPassword"),
  },
];

interface Read {
  readonly outcome: Outcome;
}

interface Editor {
  readonly id: string;
  readonly input: HTMLInputElement;
}

/** One run: the screen on its fake, the server it reads, and what the
 *  property has seen of it. */
class Run {
  readonly fake: Fake;
  readonly region: HTMLElement;
  readonly refresh: () => void;
  readonly server: Server;
  readonly reads: Read[] = [];
  /** Outcomes for the next reads, in order; a read with none answers at
   *  once with its data. */
  readonly plans: { readonly outcome: Outcome; readonly slow: boolean }[] = [];
  readonly slow: (() => void)[] = [];
  readonly editors: Editor[] = [];
  /** Reads resolved since the last check, and ever. */
  resolvedNow: number[] = [];
  readonly resolved = new Set<number>();
  /** The read a timed-out sign-in step started, while its step was the
   *  part's content. */
  restartRead: number | undefined;
  drawn = "";
  /** The newest read drawn, by its number. */
  drawnRead = 0;
  focused = false;
  saves = 0;
  readonly life = new AbortController();

  constructor(
    readonly s: Screen,
    first: Outcome,
  ) {
    this.plans.push({ outcome: first, slow: false });
    this.server = {
      names: new Map(s.rows?.ids.map((id) => [id, s.rows!.first(id)])),
      present: new Set(s.rows?.ids),
    };
    this.fake = s.fake().always(s.call, (...args: readonly unknown[]) => this.#read(args));
    if (s.rows !== undefined) {
      this.fake.always(s.rows.rename, (id: number | string, r: { readonly name: string }) => {
        this.server.names.set(String(id), r.name);
        return ok(undefined);
      });
    }
    s.serve?.(this.fake, this.server);
    const { region, refresh } = s.mount(this.fake, this.life.signal);
    this.region = region;
    this.refresh = refresh;
  }

  #read(args: readonly unknown[]): Result<unknown> | Promise<Result<unknown>> {
    const n = this.reads.length + 1;
    const plan = this.plans.shift() ?? { outcome: "ok", slow: false };
    const answer =
      plan.outcome === "ok"
        ? this.s.answer(n, this.server, args)
        : plan.outcome === "refused"
          ? refuse(503, "auth_unavailable")
          : noAnswer;
    const read: Read = { outcome: plan.outcome };
    this.reads.push(read);
    const done = (): Result<unknown> => {
      this.resolvedNow.push(n);
      this.resolved.add(n);
      return answer;
    };
    if (!plan.slow) {
      return done();
    }
    return new Promise((resolve) => {
      this.slow.push(() => {
        resolve(done());
      });
    });
  }

  end(): void {
    this.life.abort();
    for (const go of this.slow.splice(0)) {
      go();
    }
    document.body.replaceChildren();
  }

  /** The control a person reaches for row `id`'s Rename…: itself, or the
   *  ⋯ button of the menu holding it. */
  opener(id: string): HTMLElement | null {
    const target = this.region.querySelector<HTMLElement>(
      `[data-cp-action="${this.s.rows!.key(id)}"]`,
    );
    const menu = target?.closest<HTMLElement>("[role='menu']");
    return menu === null || menu === undefined
      ? target
      : this.region.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`);
  }

  /** The invariants every step keeps. */
  check(step: string): void {
    const now = this.s.shows(this.region);
    const where = `${this.s.name}, after ${step}`;
    if (now !== this.drawn) {
      expect(now, `${where}: a drawn answer is never taken away`).not.toBe("");
      // The draw is the answer of a read resolved in this step, which no
      // read drawn before is newer than.
      const from = this.resolvedNow.filter(
        (n) =>
          n > this.drawnRead && this.reads[n - 1]?.outcome === "ok" && this.s.marker(n) === now,
      );
      expect(from, `${where}: ${now} drawn without a current successful read`).not.toEqual([]);
      this.drawnRead = Math.max(...from);
      this.drawn = now;
    }
    this.resolvedNow = [];
    const last = this.reads.length;
    if (this.restartRead !== undefined && this.resolved.has(this.restartRead)) {
      expect(codeField(this.region), `${where}: the timed-out step is gone`).toBeNull();
      this.restartRead = undefined;
    }
    if (
      this.restartRead === undefined &&
      this.slow.length === 0 &&
      this.editors.length === 0 &&
      this.reads[last - 1]?.outcome === "ok"
    ) {
      expect(now, `${where}: the newest read, answered, is drawn`).toBe(this.s.marker(last));
    }
    if (this.s.step !== undefined) {
      // Only an abandoned step's late answer could draw these.
      expect(
        this.region.querySelector("input[name='new_password']"),
        `${where}: no step of an attempt that ended`,
      ).toBeNull();
      expect(this.region.textContent, `${where}: no wait of an attempt that ended`).not.toMatch(
        /Too many attempts/,
      );
    }
    for (const e of this.editors) {
      expect(e.input.isConnected, `${where}: the field renaming ${e.id} stays`).toBe(true);
    }
    if (this.focused) {
      expect(document.activeElement, `${where}: focus is never on the page's body`).not.toBe(
        document.body,
      );
    }
  }

  /** Focus after an edit of row `id` ended: on its own Rename… control, or
   *  the part's heading once the row is gone. */
  backTo(id: string, step: string): void {
    const opener = this.opener(id);
    const active = document.activeElement;
    if (opener !== null) {
      expect(active, `${this.s.name}, after ${step}: focus on ${id}'s Rename…`).toBe(opener);
      return;
    }
    expect(active?.tagName, `${this.s.name}, after ${step}: focus on the heading`).toMatch(
      /^H[1-6]$/,
    );
    expect(active?.textContent).toContain(this.s.rows!.heading);
  }
}

type Command = fc.AsyncCommand<Run, Run>;

class Refresh implements Command {
  constructor(
    readonly outcome: Outcome,
    readonly slow: boolean,
  ) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    r.plans.push({ outcome: this.outcome, slow: this.slow });
    r.refresh();
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `refresh(${this.outcome}${this.slow ? ", slow" : ""})`;
}

class Release implements Command {
  constructor(readonly at: number) {}
  check = (m: Run): boolean => m.slow.length > 0;
  async run(_m: Run, r: Run): Promise<void> {
    r.slow.splice(this.at % r.slow.length, 1)[0]?.();
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `release(${String(this.at)})`;
}

class Focus implements Command {
  constructor(readonly at: number) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    const all = [
      ...r.region.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([type='hidden']), [tabindex='-1']",
      ),
    ].filter((x) => x.closest("[hidden], [popover]") === null);
    const target = all[this.at % Math.max(1, all.length)];
    if (target !== undefined) {
      target.focus();
      r.focused ||= document.activeElement === target;
    }
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `focus(${String(this.at)})`;
}

class Open implements Command {
  constructor(readonly at: number) {}
  #id = (m: Run): string | undefined => {
    const ids = m.s.rows?.ids ?? [];
    return ids[this.at % Math.max(1, ids.length)];
  };
  check = (m: Run): boolean => {
    const id = this.#id(m);
    return id !== undefined && !m.editors.some((e) => e.id === id) && m.opener(id) !== null;
  };
  async run(_m: Run, r: Run): Promise<void> {
    const id = this.#id(r)!;
    const before = new Set(r.region.querySelectorAll("tbody input.cp-input"));
    r.region.querySelector<HTMLElement>(`[data-cp-action="${r.s.rows!.key(id)}"]`)!.click();
    await settle();
    const input = await drawnBy(() => {
      const opened = [...r.region.querySelectorAll<HTMLInputElement>("tbody input.cp-input")].find(
        (x) => !before.has(x),
      );
      expect(opened, `${r.s.name}, rename ${id} opens its field`).toBeDefined();
      expect(document.activeElement).toBe(opened);
      return opened;
    });
    r.editors.push({ id, input: input! });
    r.focused = true;
    r.check(this.toString());
  }
  toString = (): string => `open(${String(this.at)})`;
}

const keydown = (input: HTMLInputElement, name: string): void => {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
};

class Save implements Command {
  constructor(
    readonly at: number,
    readonly refused: boolean,
  ) {}
  check = (m: Run): boolean => m.editors.length > 0;
  async run(_m: Run, r: Run): Promise<void> {
    const i = this.at % r.editors.length;
    const e = r.editors[i]!;
    r.saves += 1;
    if (this.refused) {
      r.fake.answer(r.s.rows!.rename, refuse(503, "auth_unavailable"));
    }
    e.input.focus();
    e.input.value = `Name ${String(r.saves)}`;
    keydown(e.input, "Enter");
    await settle();
    if (this.refused) {
      await drawnBy(() => {
        expect(e.input.isConnected, `${r.s.name}: a refused name keeps its field`).toBe(true);
        expect(r.region.querySelector("[data-cp-state='busy']")).toBeNull();
        expect(document.activeElement).toBe(e.input);
      });
    } else {
      r.editors.splice(i, 1);
      await drawnBy(() => {
        expect(e.input.isConnected, `${r.s.name}: a saved name closes its field`).toBe(false);
        r.backTo(e.id, this.toString());
      });
    }
    r.check(this.toString());
  }
  toString = (): string => `save(${String(this.at)}${this.refused ? ", refused" : ""})`;
}

class Escape implements Command {
  constructor(readonly at: number) {}
  check = (m: Run): boolean => m.editors.length > 0;
  async run(_m: Run, r: Run): Promise<void> {
    const i = this.at % r.editors.length;
    const e = r.editors.splice(i, 1)[0]!;
    e.input.focus();
    keydown(e.input, "Escape");
    await settle();
    expect(e.input.isConnected, `${r.s.name}: Escape closes the field`).toBe(false);
    r.backTo(e.id, this.toString());
    r.check(this.toString());
  }
  toString = (): string => `escape(${String(this.at)})`;
}

/** Enters the screen's sign-in step from the form's send. */
async function enter(r: Run): Promise<HTMLInputElement> {
  r.s.step!.enter(r.fake);
  send(r.region);
  await settle();
  const code = await drawnBy(() => {
    const c = codeField(r.region);
    expect(c, `${r.s.name}: the step asks for a code`).not.toBeNull();
    return c;
  });
  r.focused ||= r.region.contains(document.activeElement);
  return code!;
}

/** The step hands the part's content back, so a read from before it, or
 *  the form, is no longer drawn, and the next read draws the form again. */
function handedBack(r: Run, outcome: Outcome, slow: boolean): void {
  r.drawn = "";
  r.drawnRead = r.reads.length;
  r.restartRead = r.reads.length + 1;
  r.plans.push({ outcome, slow });
}

/** The form's send answers a sign-in step, whose code the server then
 *  refuses as timed out: the screen starts again with a read of `outcome`. */
class Restart implements Command {
  constructor(
    readonly outcome: Outcome,
    readonly slow: boolean,
  ) {}
  check = (m: Run): boolean => m.s.step !== undefined && formShown(m.region) !== "";
  async run(_m: Run, r: Run): Promise<void> {
    const code = await enter(r);
    r.fake.answer(r.s.step!.call, refuse(401, "auth_token_invalid"));
    handedBack(r, this.outcome, this.slow);
    code.value = "123456";
    code.form!.requestSubmit();
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `restart(${this.outcome}${this.slow ? ", slow" : ""})`;
}

/** The step's code is sent and held, the person presses Start again, and
 *  the code's answer is released later, in any order with the reads: the
 *  next step of another kind, or a rate limit's wait. */
class StartAgain implements Command {
  constructor(
    readonly late: "step" | "wait",
    readonly outcome: Outcome,
    readonly slow: boolean,
  ) {}
  check = (m: Run): boolean => m.s.step !== undefined && formShown(m.region) !== "";
  async run(_m: Run, r: Run): Promise<void> {
    const code = await enter(r);
    const call = r.s.step!.call;
    // Bound to this call, so a later attempt's call never takes it.
    const late = Promise.withResolvers<Result<unknown>>();
    r.fake.answer(call, () => late.promise);
    const release = (): void => {
      late.resolve(this.late === "step" ? LATE_STEP : LATE_WAIT);
    };
    code.value = "123456";
    code.form!.requestSubmit();
    await settle();
    handedBack(r, this.outcome, this.slow);
    [...r.region.querySelectorAll<HTMLElement>("button")]
      .find((b) => b.textContent === "Start again")!
      .click();
    r.slow.push(release);
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `startAgain(${this.late}, ${this.outcome}${this.slow ? ", slow" : ""})`;
}

/** The server drops a row, as another device removing it does. */
class Remove implements Command {
  constructor(readonly at: number) {}
  check = (m: Run): boolean => m.server.present.size > 0;
  async run(_m: Run, r: Run): Promise<void> {
    const ids = [...r.server.present];
    r.server.present.delete(ids[this.at % ids.length]!);
    await settle();
    r.check(this.toString());
  }
  toString = (): string => `remove(${String(this.at)})`;
}

const outcome = fc.constantFrom<Outcome>("ok", "ok", "refused", "failed");
const at = fc.nat(7);

// Renames weigh more, so a run often holds two fields at once.
const commands = (s: Screen): fc.Arbitrary<Iterable<Command>> =>
  fc.commands(
    [
      fc.oneof(
        {
          arbitrary: fc.tuple(outcome, fc.boolean()).map(([o, slow]) => new Refresh(o, slow)),
          weight: 3,
        },
        { arbitrary: at.map((i): Command => new Release(i)), weight: 2 },
        { arbitrary: at.map((i): Command => new Focus(i)), weight: 1 },
        ...(s.step === undefined
          ? []
          : [
              {
                arbitrary: fc.tuple(outcome, fc.boolean()).map(([o, slow]) => new Restart(o, slow)),
                weight: 2,
              },
              {
                arbitrary: fc
                  .tuple(fc.constantFrom("step" as const, "wait" as const), outcome, fc.boolean())
                  .map(([late, o, slow]) => new StartAgain(late, o, slow)),
                weight: 2,
              },
            ]),
        ...(s.rows === undefined
          ? []
          : [
              { arbitrary: at.map((i): Command => new Open(i)), weight: 4 },
              {
                arbitrary: fc
                  .tuple(at, fc.boolean())
                  .map(([i, refused]): Command => new Save(i, refused)),
                weight: 3,
              },
              { arbitrary: at.map((i): Command => new Escape(i)), weight: 3 },
              { arbitrary: at.map((i): Command => new Remove(i)), weight: 1 },
            ]),
      ),
    ],
    { maxCommands: 10 },
  );

describe("every account screen, any sequence of reads, renames and focus", () => {
  it.each(screens)(
    "$name draws only a current successful read, keeps its fields and focus",
    async (s) => {
      await fc.assert(
        fc.asyncProperty(outcome, commands(s), async (first, cmds) => {
          const run = new Run(s, first);
          try {
            await settle();
            run.check(`the first read (${first})`);
            await fc.asyncModelRun(() => ({ model: run, real: run }), cmds);
          } finally {
            run.end();
          }
        }),
        // A loaded host runs fewer cases rather than failing for time.
        { numRuns: 60, plugins: [fc.interruptAfterTimeLimit(5_000)] },
      );
    },
  );
});
