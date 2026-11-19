import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { StateResponse } from "./client.js";
import { mountInvite } from "./invite.js";
import { mountSetup } from "./setup.js";
import { mountSignIn } from "./sign-in.js";
import { Fake, ok, refuse, signedIn } from "./test-helpers/fake.js";
import { useScreen } from "./test-helpers/security.js";

useScreen();

/** Runs every task the screens queued, promise continuations included. */
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

const CODE = "M9XRTB4HNW6P7KQ2";
const WAIT = refuse(429, "auth_rate_limited", undefined, { "Retry-After": "30" });
const ENROL = ok({ pending: { ticket: "t1", next: "enrol", methods: ["totp", "passkey"] } });
const SECOND = ok({ pending: { ticket: "t1", next: "second_factor", methods: ["totp"] } });
const SIGNED_IN_CODE = ok({ signed_in: { ...signedIn, recovery_code: CODE } });
const PASSKEY_IN = { kind: "signed-in", result: signedIn };
const STEP_IN = { kind: "answered", result: { signed_in: { ...signedIn, recovery_code: CODE } } };

/** An answer to a held call: its value, whether it carries a recovery
 *  code, and whether the server signed the person in by it. */
type Answer = readonly [unknown, boolean, boolean];
const IN = (v: unknown, code = false): Answer => [v, code, true];
const NOT = (v: unknown): Answer => [v, false, false];

/** The answers each held call can be given. */
const ANSWERS: Readonly<Record<string, readonly Answer[]>> = {
  loginPassword: [
    IN(ok(signedIn)),
    NOT(SECOND),
    NOT(refuse(401, "auth_invalid_credentials")),
    NOT(WAIT),
  ],
  passkey: [IN(PASSKEY_IN), NOT({ kind: "verification-failed" }), NOT({ kind: "cancelled" })],
  autofill: [IN(PASSKEY_IN), NOT({ kind: "verification-failed" })],
  loginCode: [
    IN(SIGNED_IN_CODE, true),
    IN(ok({ signed_in: signedIn })),
    NOT(refuse(401, "auth_code_invalid", "code_invalid")),
    NOT(WAIT),
  ],
  setupPassword: [IN(ok(signedIn)), NOT(ENROL), NOT(WAIT), NOT(refuse(409, "auth_setup_complete"))],
  setupWithPasskey: [
    IN(PASSKEY_IN),
    NOT({ kind: "failed", error: refuse(409, "auth_setup_complete") }),
    NOT({ kind: "verification-failed" }),
  ],
  offerPasskey: [NOT(true), NOT(false)],
  registerPasskey: [NOT({ kind: "registered" }), NOT({ kind: "duplicate" })],
  pendingTOTPFinish: [
    IN(SIGNED_IN_CODE, true),
    NOT(refuse(401, "auth_code_invalid", "code_invalid")),
    NOT(WAIT),
  ],
  pendingPasskey: [IN(STEP_IN, true), NOT({ kind: "cancelled" })],
  inviteAcceptPassword: [
    IN(ok(signedIn)),
    NOT(ENROL),
    NOT(WAIT),
    NOT(refuse(409, "auth_username_taken")),
  ],
  inviteAcceptOIDC: [
    NOT(ok({ url: "https://id.example/authorize" })),
    NOT(refuse(503, "auth_busy")),
  ],
  oidcLinkByAdmin: [IN(ok(signedIn)), NOT(refuse(401, "auth_invalid_credentials")), NOT(WAIT)],
  oidcCreatePending: [IN(ok(signedIn)), NOT(refuse(409, "auth_username_taken"))],
  storePasswordCredential: [NOT(undefined)],
  state: [NOT("ok"), NOT(refuse(503, "auth_unavailable"))],
};

/** What the browser keeps or reads on the page itself, not the server. */
const LOCAL = new Set(["storePasswordCredential", "passkeySupport", "takeFragmentToken"]);
/** What a signed-in person may still be asked before the screen hands on:
 *  the passkey offer after setup. */
const OFFER = new Set(["registerPasskey"]);

interface Held {
  readonly name: string;
  readonly resolve: (v: unknown) => void;
}

interface Screen {
  readonly name: string;
  /** The calls whose answers the property holds and releases. */
  readonly held: readonly string[];
  /** What `state()` answers when it answers. */
  readonly state: StateResponse;
  readonly fake: () => Fake;
  /** Mounts the screen; `handOn` counts every way it hands on. */
  readonly mount: (
    region: HTMLElement,
    fake: Fake,
    handOn: () => void,
    gate: () => Promise<unknown>,
    signal: AbortSignal,
  ) => void;
}

const STATE: StateResponse = {
  setup_required: false,
  password_login: true,
  passkeys: true,
  oidc: true,
  secure: true,
  https_required: [],
};

const screens: readonly Screen[] = [
  {
    name: "Sign-in",
    held: ["loginPassword", "passkey", "autofill", "loginCode", "storePasswordCredential"],
    state: STATE,
    fake: () => new Fake().always("passkeySupport", { webauthn: true, conditional: true }),
    mount: (region, fake, handOn, _gate, signal) => {
      mountSignIn(region, {
        client: fake.client,
        access: fake.access(),
        search: "",
        navigate: handOn,
        onSignedIn: handOn,
        signal,
      });
    },
  },
  {
    name: "Link this identity",
    held: ["oidcLinkByAdmin", "oidcCreatePending"],
    state: { ...STATE, totp: true, sso: "only" },
    fake: () =>
      new Fake().always(
        "oidcPending",
        ok({ issuer: "https://id.example", can_create: true, suggested_username: "mika" }),
      ),
    mount: (region, fake, handOn, _gate, signal) => {
      mountSignIn(region, {
        client: fake.client,
        access: fake.access(),
        search: "?oidc=not_linked",
        navigate: handOn,
        onSignedIn: handOn,
        signal,
      });
    },
  },
  {
    name: "Setup",
    held: [
      "setupPassword",
      "setupWithPasskey",
      "offerPasskey",
      "registerPasskey",
      "pendingTOTPFinish",
      "pendingPasskey",
      "storePasswordCredential",
    ],
    state: { ...STATE, setup_required: true, oidc: false },
    fake: () => new Fake(),
    mount: (region, fake, handOn, gate, signal) => {
      mountSetup(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        navigate: handOn,
        onDone: handOn,
        onSetupComplete: handOn,
        offerPasskey: () => gate().then((v) => v === true),
        signal,
      });
    },
  },
  {
    name: "Invite",
    held: [
      "inviteAcceptPassword",
      "inviteAcceptOIDC",
      "pendingTOTPFinish",
      "pendingPasskey",
      "storePasswordCredential",
    ],
    state: STATE,
    fake: () => new Fake(),
    mount: (region, fake, handOn, _gate, signal) => {
      mountInvite(region, {
        client: fake.client,
        access: fake.access(),
        app: "Release tracker",
        token: "inv-1",
        navigate: handOn,
        onSignedIn: handOn,
        signal,
      });
    },
  },
];

const VALUES: Readonly<Record<string, string>> = {
  username: "mika",
  new_username: "mika",
  password: "lantern harbour quietly",
  temporary_password: "ABCD-2345-EFGH-6789",
  code: "123456",
};

/** What a screen draws: its controls, notices and field errors. */
const drawnIn = (region: HTMLElement): Element[] => [
  ...region.querySelectorAll("input, button, a, h2, .cp-notice, .cp-field-error"),
];

class Run {
  readonly fake: Fake;
  readonly region = document.createElement("section");
  readonly life = new AbortController();
  readonly held: Held[] = [];
  handed = 0;
  /** Forms the browser would have sent itself, which would leave the page. */
  readonly native: string[] = [];
  /** The calls made when the server first signed the person in. */
  callsAtSignIn: number | undefined;
  /** The calls made and what was drawn when the screen handed on. */
  callsAtHandOn = 0;
  drawnAtHandOn = new Set<Element>();
  invalidAtHandOn = 0;
  codesOwed = 0;
  codesShown = 0;
  /** An answer came while its button showed busy, which holds it 400 ms. */
  slow = false;

  constructor(readonly s: Screen) {
    this.fake = s.fake();
    for (const name of [...s.held, "state"]) {
      if (name === "passkey" || name === "autofill" || name === "offerPasskey") {
        continue;
      }
      this.fake.always(name, () => this.hold(name));
    }
    if (s.held.includes("passkey")) {
      this.fake.always("signInWithPasskey", (_c: unknown, o?: { readonly mediation?: string }) =>
        this.hold(o?.mediation === "conditional" ? "autofill" : "passkey"),
      );
    }
    document.body.append(this.region);
    // After every listener of the screen's own.
    window.addEventListener(
      "submit",
      (e) => {
        if (!e.defaultPrevented) {
          e.preventDefault();
          this.native.push((e.target as Element).outerHTML.slice(0, 120));
        }
      },
      { signal: this.life.signal },
    );
    s.mount(
      this.region,
      this.fake,
      () => {
        this.handOn();
      },
      () => this.hold("offerPasskey"),
      this.life.signal,
    );
  }

  hold(name: string): Promise<unknown> {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    this.held.push({ name, resolve });
    return promise;
  }

  handOn(): void {
    this.handed += 1;
    if (this.handed === 1) {
      this.callsAtHandOn = this.serverCalls();
      this.drawnAtHandOn = new Set(drawnIn(this.region));
      this.invalidAtHandOn = this.invalid();
    }
  }

  serverCalls(skip: ReadonlySet<string> = new Set()): number {
    return this.fake.calls.filter((c) => !LOCAL.has(c.name) && !skip.has(c.name)).length;
  }

  invalid(): number {
    return this.region.querySelectorAll("[aria-invalid='true']").length;
  }

  /** Saves the recovery code a dialog shows, as the person does. */
  saveCodes(): void {
    for (const d of document.querySelectorAll<HTMLDialogElement>("dialog.cp-dialog")) {
      if (!d.open || !(d.textContent ?? "").includes("M9XR-TB4H-NW6P-7KQ2")) {
        continue;
      }
      this.codesShown += 1;
      d.querySelector<HTMLInputElement>("input[type='checkbox']")?.click();
      [...d.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent.includes("Continue"))
        ?.click();
    }
  }

  async check(step: string): Promise<void> {
    await settle();
    this.saveCodes();
    await settle();
    const where = `${this.s.name}, after ${step}`;
    expect(this.native, `${where}: no form left to the browser`).toEqual([]);
    expect(this.handed, `${where}: handed on at most once`).toBeLessThanOrEqual(1);
    if (this.callsAtSignIn !== undefined) {
      expect(this.serverCalls(OFFER), `${where}: nothing sent once signed in`).toBe(
        this.callsAtSignIn,
      );
    }
    if (this.handed === 0) {
      return;
    }
    expect(this.serverCalls(), `${where}: nothing sent after the hand-on`).toBe(this.callsAtHandOn);
    const fresh = drawnIn(this.region).filter((e) => !this.drawnAtHandOn.has(e));
    expect(
      fresh.map((e) => e.outerHTML.slice(0, 80)),
      `${where}: nothing drawn after the hand-on`,
    ).toEqual([]);
    expect(this.invalid(), `${where}: no field error after the hand-on`).toBeLessThanOrEqual(
      this.invalidAtHandOn,
    );
    expect(this.region.textContent, `${where}: no wait after the hand-on`).not.toMatch(
      /Too many attempts/,
    );
  }

  end(): void {
    this.life.abort();
    for (const h of this.held.splice(0)) {
      h.resolve({ kind: "cancelled" });
    }
    for (const d of document.querySelectorAll("dialog")) {
      d.remove();
    }
    this.region.remove();
  }
}

type Command = fc.AsyncCommand<Run, Run>;

/** Presses one of the screen's buttons, or sends one of its forms filled. */
class Act implements Command {
  constructor(readonly at: number) {}
  check = (): boolean => true;
  async run(_m: Run, r: Run): Promise<void> {
    const forms = [...r.region.querySelectorAll("form")];
    const buttons = [
      ...r.region.querySelectorAll<HTMLButtonElement>("button:not([type='submit'])"),
    ].filter((b) => b.closest(".cp-input-wrap") === null);
    // Forms weigh double: most ways in start from one.
    const all: (HTMLFormElement | HTMLButtonElement)[] = [...forms, ...forms, ...buttons];
    const target = all[this.at % Math.max(1, all.length)];
    if (target instanceof HTMLFormElement) {
      for (const input of target.querySelectorAll<HTMLInputElement>("input[name]")) {
        if (!input.readOnly && input.value === "") {
          input.value = VALUES[input.name] ?? "x";
        }
      }
      target.requestSubmit();
    } else {
      target?.click();
    }
    await r.check(this.toString());
  }
  toString = (): string => `act(${String(this.at)})`;
}

/** Answers one held call. */
class Release implements Command {
  constructor(
    readonly at: number,
    readonly answer: number,
  ) {}
  check = (m: Run): boolean => m.held.length > 0;
  async run(_m: Run, r: Run): Promise<void> {
    const h = r.held.splice(this.at % r.held.length, 1)[0]!;
    const choices = ANSWERS[h.name] ?? [NOT(undefined)];
    const [value, code, signed] = choices[this.answer % choices.length]!;
    if (code) {
      r.codesOwed += 1;
    }
    if (signed) {
      r.callsAtSignIn ??= r.serverCalls(OFFER);
    }
    r.slow ||= r.region.querySelector("[data-cp-state='busy']") !== null;
    h.resolve(value === "ok" ? ok(r.s.state) : value);
    await r.check(`${this.toString()} of ${h.name}`);
  }
  toString = (): string => `release(${String(this.at)}, ${String(this.answer)})`;
}

const commands = fc.commands(
  [
    fc.oneof(
      { arbitrary: fc.nat(9).map((i): Command => new Act(i)), weight: 2 },
      {
        arbitrary: fc.tuple(fc.nat(5), fc.nat(3)).map(([i, a]): Command => new Release(i, a)),
        weight: 3,
      },
    ),
  ],
  { maxCommands: 20 },
);

// fast-check's own budget per assert is 10 s, so the runs go in batches,
// each stopping early on a loaded host, until 1,000 have run.
const RUNS = 1_000;

describe("every way into an account, answered in any order", () => {
  it.each(screens)(
    "$name hands on once, then sends and draws nothing, and still shows a recovery code",
    async (s) => {
      let runs = 0;
      let inflight: Promise<unknown> = Promise.resolve();
      const started = performance.now();
      while (runs < RUNS) {
        await fc.assert(
          fc.asyncProperty(commands, async (cmds) => {
            // A run the time limit cut off still runs: the next waits for it.
            await inflight.catch(() => undefined);
            runs += 1;
            const run = new Run(s);
            const going = (async () => {
              try {
                await run.check("the first read");
                await fc.asyncModelRun(() => ({ model: run, real: run }), cmds);
                if (run.slow) {
                  // Past the 400 ms a confirm cycle's shown busy state holds an answer.
                  await new Promise((resolve) => setTimeout(resolve, 450));
                }
                await run.check("the last answers");
                expect(run.codesShown, `${s.name}: every recovery code shown`).toBe(run.codesOwed);
              } finally {
                run.end();
              }
            })();
            inflight = going;
            await going;
          }),
          // A loaded host runs fewer cases rather than failing for time.
          { numRuns: 250, plugins: [fc.interruptAfterTimeLimit(8_000)] },
        );
      }
      console.info(
        `hand-on model, ${s.name}: ${String(runs)} runs in ${String(Math.round(performance.now() - started))} ms`,
      );
      expect(runs).toBeGreaterThanOrEqual(RUNS);
    },
    600_000,
  );
});
