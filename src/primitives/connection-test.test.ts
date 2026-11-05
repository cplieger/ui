import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import { createRoot } from "../signal/signal.js";
import {
  createConnectionTest,
  type ConnectionTestOptions,
  type ConnectionTestResult,
  type ConnectionTestState,
} from "./connection-test.js";

/** A check the test answers by hand. */
function deferredRun(): {
  run: ConnectionTestOptions["run"];
  calls: AbortSignal[];
  resolve(r: unknown, at?: number): void;
  reject(e: unknown, at?: number): void;
} {
  const calls: AbortSignal[] = [];
  const settles: { resolve(v: unknown): void; reject(e: unknown): void }[] = [];
  return {
    calls,
    run: (signal) =>
      new Promise((resolve, reject) => {
        calls.push(signal);
        settles.push({ resolve: resolve as (v: unknown) => void, reject });
      }),
    resolve(r, at = settles.length - 1) {
      settles[at]?.resolve(r);
    },
    reject(e, at = settles.length - 1) {
      settles[at]?.reject(e);
    },
  };
}

interface Fixture {
  root: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  url: HTMLInputElement;
  key: HTMLInputElement;
}

function fixture(): Fixture {
  const root = document.createElement("div");
  const url = document.createElement("input");
  const key = document.createElement("input");
  const button = document.createElement("button");
  button.textContent = "Test connection";
  const status = document.createElement("p");
  root.append(url, key, button, status);
  document.body.append(root);
  return { root, button, status, url, key };
}

async function settled(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("connection test states", () => {
  it("walks idle, busy, passed with the state table's attributes", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run }, f.root);
    expect(c.state()).toBe("idle");
    expect(f.status.dataset["state"]).toBe("idle");
    expect(f.root.dataset["state"]).toBe("idle");
    expect(f.status.getAttribute("aria-busy")).toBe("false");
    expect(f.status.textContent).toBe("");
    f.button.click();
    expect(c.state()).toBe("busy");
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
    expect(f.button.disabled).toBe(false);
    expect(f.status.getAttribute("aria-busy")).toBe("true");
    expect(f.status.textContent).toBe("Testing…");
    expect(f.root.dataset["state"]).toBe("busy");
    d.resolve({ ok: true, message: "Passed: Sonarr 4.0.15" });
    await settled();
    expect(c.state()).toBe("passed");
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
    expect(f.status.getAttribute("aria-busy")).toBe("false");
    expect(f.status.textContent).toBe("Passed: Sonarr 4.0.15");
    expect(f.status.dataset["state"]).toBe("passed");
  });

  it("shows a failure's message and uses busyMessage", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run, busyMessage: "Checking…" });
    c.start();
    expect(f.status.textContent).toBe("Checking…");
    d.resolve({ ok: false, message: "Sonarr answered 404 at this URL." });
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("Sonarr answered 404 at this URL.");
  });

  it("keeps focus on the button while busy and runs once for a second click", () => {
    const f = fixture();
    const d = deferredRun();
    createConnectionTest(f.button, f.status, { run: d.run });
    f.button.focus();
    f.button.click();
    f.button.click();
    expect(document.activeElement).toBe(f.button);
    expect(d.calls).toHaveLength(1);
  });

  it("never fades: a passed state is unchanged a minute later", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run });
    c.start();
    d.resolve({ ok: true, message: "Connected" });
    await settled();
    vi.advanceTimersByTime(60_000);
    expect(c.state()).toBe("passed");
    expect(f.status.textContent).toBe("Connected");
  });
});

describe("connection test live region", () => {
  it("makes status a polite live region unless the host gave it a role", () => {
    const f = fixture();
    createConnectionTest(f.button, f.status, { run: deferredRun().run });
    expect(f.status.getAttribute("role")).toBe("status");
    const g = fixture();
    g.status.setAttribute("role", "alert");
    createConnectionTest(g.button, g.status, { run: deferredRun().run });
    expect(g.status.getAttribute("role")).toBe("alert");
  });

  it("writes no role with live none and still reports every transition", async () => {
    const f = fixture();
    const d = deferredRun();
    const seen: [ConnectionTestState, ConnectionTestResult | null][] = [];
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      live: "none",
      onChange: (s, r) => seen.push([s, r]),
    });
    expect(f.status.hasAttribute("role")).toBe(false);
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    c.reset();
    expect(seen.map(([s]) => s)).toEqual(["busy", "passed", "idle"]);
    expect(seen[1]?.[1]).toEqual({ ok: true, message: "ok" });
  });
});

describe("connection test field marking", () => {
  it("marks the named input and gives back exactly what it added", async () => {
    const f = fixture();
    f.url.setAttribute("aria-describedby", "url-hint");
    const marks: (string | null)[] = [];
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url, mark: (m) => marks.push(m) } },
    });
    c.start();
    d.resolve({ ok: false, message: "No answer at this URL.", field: "url" });
    await settled();
    expect(f.url.getAttribute("aria-invalid")).toBe("true");
    expect(f.url.getAttribute("aria-describedby")).toBe(`url-hint ${f.status.id}`);
    expect(f.status.id).not.toBe("");
    expect(marks).toEqual(["No answer at this URL."]);
    c.reset();
    expect(f.url.hasAttribute("aria-invalid")).toBe(false);
    expect(f.url.getAttribute("aria-describedby")).toBe("url-hint");
    expect(marks).toEqual(["No answer at this URL.", null]);
  });

  it("restores an aria-invalid the form set before the test", async () => {
    const f = fixture();
    f.url.setAttribute("aria-invalid", "true");
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    c.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    expect(f.url.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the message and marks nothing for a field it was not given", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    c.start();
    d.resolve({ ok: false, message: "The key was rejected.", field: "api_key" });
    await settled();
    expect(f.status.textContent).toBe("The key was rejected.");
    expect(f.url.hasAttribute("aria-invalid")).toBe(false);
    expect(f.url.hasAttribute("aria-describedby")).toBe(false);
  });

  it("treats an inherited name such as constructor as no field", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    c.start();
    d.resolve({ ok: false, message: "odd", field: "constructor" });
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("odd");
    expect(f.url.attributes).toHaveLength(0);
  });

  it("touches no input attribute for a field marked by mark alone", async () => {
    const f = fixture();
    const marks: (string | null)[] = [];
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { key: { mark: (m) => marks.push(m) } },
    });
    c.start();
    d.resolve({ ok: false, message: "rejected", field: "key" });
    await settled();
    expect(f.key.attributes).toHaveLength(0);
    expect(marks).toEqual(["rejected"]);
  });
});

describe("connection test watching", () => {
  it("resets on an edit inside root, an input added later included, and not outside it", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run }, f.root);
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.dispatchEvent(new Event("input", { bubbles: true }));
    expect(c.state()).toBe("passed");
    const later = document.createElement("input");
    f.root.append(later);
    later.dispatchEvent(new Event("input", { bubbles: true }));
    expect(c.state()).toBe("idle");
  });

  it("lets an explicit watch replace the default", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run, watch: [f.url] }, f.root);
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    f.key.dispatchEvent(new Event("input", { bubbles: true }));
    expect(c.state()).toBe("passed");
    f.url.dispatchEvent(new Event("change", { bubbles: true }));
    expect(c.state()).toBe("idle");
  });

  it("watches the field inputs when there is no root", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    f.url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(c.state()).toBe("idle");
  });
});

describe("connection test superseding", () => {
  it("aborts on an edit while busy and drops the late answer", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run }, f.root);
    c.start();
    f.url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(d.calls[0]?.aborted).toBe(true);
    d.resolve({ ok: true, message: "late" });
    await settled();
    expect(c.state()).toBe("idle");
    expect(f.status.textContent).toBe("");
  });

  it("ends in the state of the last run nothing superseded", async () => {
    type Op = "start" | "edit" | { readonly answer: number; readonly ok: boolean };
    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.constant<Op>("start"),
      fc.constant<Op>("edit"),
      fc.record({ answer: fc.nat({ max: 5 }), ok: fc.boolean() }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 12 }), async (ops) => {
        document.body.replaceChildren();
        const f = fixture();
        const d = deferredRun();
        const c = createConnectionTest(f.button, f.status, { run: d.run }, f.root);
        // The model: the newest run is live until an edit; a live run's answer wins.
        let live: number | null = null;
        let want: ConnectionTestState = "idle";
        for (const op of ops) {
          if (op === "start") {
            if (want !== "busy") {
              live = d.calls.length;
              want = "busy";
            }
            c.start();
          } else if (op === "edit") {
            live = null;
            want = "idle";
            f.url.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            if (op.answer === live && want === "busy") {
              want = op.ok ? "passed" : "failed";
            }
            d.resolve({ ok: op.ok, message: String(op.answer) }, op.answer);
            await settled();
          }
          expect(c.state()).toBe(want);
        }
        c.dispose();
      }),
    );
  });
});

describe("connection test failures of the run", () => {
  it("fails with errorMessage for a rejected run, and goes idle for an AbortError", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      errorMessage: (e) => `Could not reach the server (${(e as Error).message}).`,
    });
    c.start();
    d.reject(new TypeError("Failed to fetch"));
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("Could not reach the server (Failed to fetch).");
    c.start();
    d.reject(new DOMException("aborted", "AbortError"));
    await settled();
    expect(c.state()).toBe("idle");
  });

  it("uses the error's message, then a fixed text, without errorMessage", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run });
    c.start();
    d.reject(new Error("boom"));
    await settled();
    expect(f.status.textContent).toBe("boom");
    c.start();
    d.reject("not an error");
    await settled();
    expect(f.status.textContent).toBe("The test could not run.");
  });

  it("fails with a fixed text and logs a result of the wrong shape", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run });
    c.start();
    d.resolve({ ok: true });
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("The test returned no answer.");
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("fails for a run that throws synchronously", async () => {
    const f = fixture();
    const c = createConnectionTest(f.button, f.status, {
      run: () => {
        throw new Error("no client");
      },
    });
    c.start();
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("no client");
  });
});

describe("connection test wiring and lifecycle", () => {
  it("refuses a button that is no button and a status holding the button", () => {
    const f = fixture();
    const run = deferredRun().run;
    expect(() =>
      createConnectionTest(document.createElement("div") as never, f.status, { run }),
    ).toThrow(TypeError);
    f.status.append(f.button);
    expect(() => createConnectionTest(f.button, f.status, { run })).toThrow(TypeError);
  });

  it("disposes while busy with no callback and gives back what it added", async () => {
    const f = fixture();
    const d = deferredRun();
    const seen: ConnectionTestState[] = [];
    const marks: (string | null)[] = [];
    const c = createConnectionTest(
      f.button,
      f.status,
      {
        run: d.run,
        onChange: (s) => seen.push(s),
        fields: { url: { input: f.url, mark: (m) => marks.push(m) } },
      },
      f.root,
    );
    c.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    c.start();
    seen.length = 0;
    marks.length = 0;
    c.dispose();
    c.dispose();
    expect(d.calls[1]?.aborted).toBe(true);
    for (const attr of ["aria-busy", "data-state", "role", "id"]) {
      expect(f.status.hasAttribute(attr)).toBe(false);
    }
    expect(f.root.hasAttribute("data-state")).toBe(false);
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
    expect(f.status.textContent).toBe("");
    expect(f.url.attributes).toHaveLength(0);
    expect(seen).toEqual([]);
    expect(marks).toEqual([]);
    d.resolve({ ok: true, message: "late" }, 1);
    await settled();
    f.button.click();
    f.url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(d.calls).toHaveLength(2);
    expect(c.state()).toBe("idle");
  });

  it("ends with the owner current when it was made", () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | undefined;
    const dispose = createRoot((disposeRoot) => {
      c = createConnectionTest(f.button, f.status, { run: d.run });
      return disposeRoot;
    });
    c?.start();
    dispose();
    expect(d.calls[0]?.aborted).toBe(true);
    expect(f.status.hasAttribute("data-state")).toBe(false);
  });
});
