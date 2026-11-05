import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import { cdp, userEvent } from "vitest/browser";

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
    expect(f.status.textContent).toBe("");
    f.button.click();
    expect(c.state()).toBe("busy");
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
    expect(f.button.disabled).toBe(false);
    // aria-busy on the live region would let a screen reader skip "Testing…".
    expect(f.status.hasAttribute("aria-busy")).toBe(false);
    expect(f.status.textContent).toBe("Testing…");
    expect(f.root.dataset["state"]).toBe("busy");
    d.resolve({ ok: true, message: "Passed: Sonarr 4.0.15" });
    await settled();
    expect(c.state()).toBe("passed");
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
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
    for (const attr of ["data-state", "role", "id"]) {
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

/** Whether Chromium's accessibility tree reports the button disabled. */
async function buttonReportedDisabled(name: string): Promise<boolean> {
  const { frameTree } = (await cdp().send("Page.getFrameTree", {})) as {
    frameTree: { childFrames?: readonly { frame: { id: string } }[] };
  };
  const frameId = frameTree.childFrames?.[0]?.frame.id;
  if (frameId === undefined) {
    throw new Error("no runner iframe");
  }
  const { nodes } = (await cdp().send("Accessibility.getFullAXTree", { frameId })) as {
    nodes: {
      role?: { value: string };
      name?: { value: string };
      properties?: { name: string; value: { value: unknown } }[];
    }[];
  };
  const button = nodes.find((n) => n.role?.value === "button" && n.name?.value === name);
  if (button === undefined) {
    throw new Error(`no button named ${name}`);
  }
  return button.properties?.some((p) => p.name === "disabled" && p.value.value === true) ?? false;
}

describe("connection test review cases", () => {
  it("reports the button disabled to assistive technology while busy", async () => {
    const f = fixture();
    const d = deferredRun();
    createConnectionTest(f.button, f.status, { run: d.run });
    expect(await buttonReportedDisabled("Test connection")).toBe(false);
    f.button.click();
    expect(await buttonReportedDisabled("Test connection")).toBe(true);
  });

  it("never submits the host's form", () => {
    const f = fixture();
    const form = document.createElement("form");
    form.append(f.button);
    document.body.append(form);
    let submits = 0;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submits++;
    });
    createConnectionTest(f.button, f.status, { run: deferredRun().run });
    f.button.click();
    f.button.click();
    expect(submits).toBe(0);
  });

  it("calls no run after a dispose from onChange on the busy transition", () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | null = null;
    c = createConnectionTest(f.button, f.status, {
      run: d.run,
      onChange: (state) => (state === "busy" ? c?.dispose() : undefined),
    });
    c.start();
    expect(d.calls).toHaveLength(0);
  });

  it("calls no run after a dispose from mark(null) as the next test starts", async () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | null = null;
    c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { mark: (m) => (m === null ? c?.dispose() : undefined) } },
    });
    c.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    c.start();
    expect(d.calls).toHaveLength(1);
  });

  it("calls no run after a reset from onChange on the busy transition", () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | null = null;
    c = createConnectionTest(f.button, f.status, {
      run: d.run,
      onChange: (state) => (state === "busy" ? c?.reset() : undefined),
    });
    c.start();
    expect(d.calls).toHaveLength(0);
    expect(c.state()).toBe("idle");
  });

  it("keeps a reset made inside errorMessage", async () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | null = null;
    c = createConnectionTest(f.button, f.status, {
      run: d.run,
      errorMessage: () => {
        c?.reset();
        return "unreachable";
      },
    });
    c.start();
    d.reject(new Error("down"));
    await settled();
    expect(c.state()).toBe("idle");
    expect(f.status.textContent).toBe("");
  });

  it("still runs the check when onChange throws on busy", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      onChange: (state) => {
        if (state === "busy") {
          throw new Error("host bug");
        }
      },
    });
    expect(() => {
      c.start();
    }).toThrow("host bug");
    expect(d.calls).toHaveLength(1);
    d.resolve({ ok: true, message: "Connected" });
    await settled();
    expect(c.state()).toBe("passed");
  });

  it("hands errorMessage the value a run threw, as a rejection would", async () => {
    const f = fixture();
    const seen: unknown[] = [];
    const thrown = { code: 5 };
    const c = createConnectionTest(f.button, f.status, {
      run: () => {
        throw thrown;
      },
      errorMessage: (e) => {
        seen.push(e);
        return "failed";
      },
    });
    c.start();
    await settled();
    expect(seen).toEqual([thrown]);
    expect(seen[0]).toBe(thrown);
    const g = fixture();
    const plain = createConnectionTest(g.button, g.status, {
      run: () => {
        throw thrown;
      },
    });
    plain.start();
    await settled();
    expect(g.status.textContent).toBe("The test could not run.");
  });

  it("keeps a valid answer whose field is null, empty, or set on a pass", async () => {
    const cases: [unknown, ConnectionTestState, string][] = [
      [{ ok: true, message: "Connected", field: "" }, "passed", "Connected"],
      [{ ok: true, message: "Connected", field: "url" }, "passed", "Connected"],
      [
        { ok: false, message: "The API key was rejected (HTTP 401)", field: null },
        "failed",
        "The API key was rejected (HTTP 401)",
      ],
    ];
    for (const [answer, state, text] of cases) {
      document.body.replaceChildren();
      const f = fixture();
      const d = deferredRun();
      let reported: ConnectionTestResult | null = null;
      const c = createConnectionTest(f.button, f.status, {
        run: d.run,
        fields: { url: { input: f.url } },
        onChange: (_s, r) => {
          reported = r;
        },
      });
      c.start();
      d.resolve(answer);
      await settled();
      expect(c.state()).toBe(state);
      expect(f.status.textContent).toBe(text);
      expect(f.url.hasAttribute("aria-invalid")).toBe(false);
      // The host receives a ConnectionTestResult: no field key on these answers.
      expect(reported).toEqual({ ok: state === "passed", message: text });
      expect(reported !== null && Object.hasOwn(reported, "field")).toBe(false);
    }
  });

  it("removes its listeners from root on dispose", () => {
    const f = fixture();
    const removed: string[] = [];
    const original = f.root.removeEventListener.bind(f.root);
    f.root.removeEventListener = (
      type: string,
      ...rest: [EventListenerOrEventListenerObject, (boolean | EventListenerOptions)?]
    ) => {
      removed.push(type);
      original(type, ...rest);
    };
    const fromButton: string[] = [];
    const originalButton = f.button.removeEventListener.bind(f.button);
    f.button.removeEventListener = (
      type: string,
      ...rest: [EventListenerOrEventListenerObject, (boolean | EventListenerOptions)?]
    ) => {
      fromButton.push(type);
      originalButton(type, ...rest);
    };
    const c = createConnectionTest(f.button, f.status, { run: deferredRun().run }, f.root);
    c.dispose();
    expect(removed.toSorted()).toEqual(["change", "input"]);
    expect(fromButton).toEqual(["click"]);
  });

  it("marks no prototype input for an inherited field name", async () => {
    const f = fixture();
    const decoy = document.createElement("input");
    document.body.append(decoy);
    Object.defineProperty(Object.prototype, "input", { value: decoy, configurable: true });
    try {
      const d = deferredRun();
      const c = createConnectionTest(f.button, f.status, {
        run: d.run,
        fields: { url: { input: f.url } },
      });
      c.start();
      d.resolve({ ok: false, message: "odd", field: "constructor" });
      await settled();
      expect(decoy.hasAttribute("aria-invalid")).toBe(false);
    } finally {
      delete (Object.prototype as { input?: unknown }).input;
    }
  });

  it("keeps an id or aria-disabled the host set", () => {
    const f = fixture();
    f.button.setAttribute("aria-disabled", "true");
    const c = createConnectionTest(f.button, f.status, { run: deferredRun().run });
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
    f.status.id = "host-status";
    c.reset();
    c.dispose();
    expect(f.status.id).toBe("host-status");
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
  });

  it("gives back everything through an owner dispose while failed", async () => {
    const f = fixture();
    const d = deferredRun();
    const seen: ConnectionTestState[] = [];
    const marks: (string | null)[] = [];
    let c: ReturnType<typeof createConnectionTest> | undefined;
    const dispose = createRoot((disposeRoot) => {
      c = createConnectionTest(f.button, f.status, {
        run: d.run,
        onChange: (state) => seen.push(state),
        fields: { url: { input: f.url, mark: (m) => marks.push(m) } },
      });
      return disposeRoot;
    });
    c?.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    seen.length = 0;
    marks.length = 0;
    dispose();
    for (const attr of ["data-state", "role", "id"]) {
      expect(f.status.hasAttribute(attr)).toBe(false);
    }
    expect(f.status.textContent).toBe("");
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
    expect(f.url.attributes).toHaveLength(0);
    expect(seen).toEqual([]);
    expect(marks).toEqual([]);
  });
});

describe("connection test shared elements", () => {
  it("restores an input two controls marked once neither marks it", async () => {
    const f = fixture();
    const other = fixture();
    const a = deferredRun();
    const b = deferredRun();
    const ca = createConnectionTest(f.button, f.status, {
      run: a.run,
      fields: { url: { input: f.url } },
    });
    const cb = createConnectionTest(other.button, other.status, {
      run: b.run,
      fields: { url: { input: f.url } },
    });
    ca.start();
    a.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    cb.start();
    b.resolve({ ok: false, message: "bad too", field: "url" });
    await settled();
    ca.reset();
    expect(f.url.getAttribute("aria-invalid")).toBe("true");
    cb.reset();
    expect(f.url.hasAttribute("aria-invalid")).toBe(false);
    expect(f.url.hasAttribute("aria-describedby")).toBe(false);
  });

  it("refuses a status another live control writes, and accepts it after dispose", () => {
    const f = fixture();
    const first = createConnectionTest(f.button, f.status, { run: deferredRun().run });
    const second = document.createElement("button");
    f.root.append(second);
    expect(() => createConnectionTest(second, f.status, { run: deferredRun().run })).toThrow(
      TypeError,
    );
    first.dispose();
    expect(() => createConnectionTest(second, f.status, { run: deferredRun().run })).not.toThrow();
    expect(f.status.getAttribute("role")).toBe("status");
  });

  it("keeps a reset made inside console.error for a wrong-shape answer", async () => {
    const f = fixture();
    const d = deferredRun();
    let c: ReturnType<typeof createConnectionTest> | null = null;
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      c?.reset();
    });
    c = createConnectionTest(f.button, f.status, { run: d.run });
    c.start();
    d.resolve({ ok: "yes" });
    await settled();
    expect(c.state()).toBe("idle");
    error.mockRestore();
  });

  it("logs a throwing errorMessage and shows the default", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      errorMessage: () => {
        throw new Error("words failed");
      },
    });
    c.start();
    d.reject(new Error("down"));
    await settled();
    expect(f.status.textContent).toBe("down");
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe("connection test in a form and with host attributes", () => {
  function inForm(f: Fixture): () => number {
    const el = document.createElement("form");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    el.append(f.url, f.button, f.status, save);
    document.body.append(el);
    let n = 0;
    el.addEventListener("submit", (e) => {
      e.preventDefault();
      n++;
    });
    return () => n;
  }

  it("leaves Enter in a field to the form's Save, not the Test button", async () => {
    const f = fixture();
    const submits = inForm(f);
    const d = deferredRun();
    createConnectionTest(f.button, f.status, { run: d.run });
    f.url.focus();
    await userEvent.keyboard("{Enter}");
    expect(submits()).toBe(1);
    expect(d.calls).toHaveLength(0);
    f.button.click();
    expect(submits()).toBe(1);
    expect(d.calls).toHaveLength(1);
  });

  it("keeps a host's submit button from submitting while busy", () => {
    const f = fixture();
    const submits = inForm(f);
    f.button.type = "submit";
    createConnectionTest(f.button, f.status, { run: deferredRun().run });
    f.button.click();
    expect(submits()).toBe(1);
    f.button.click();
    expect(submits()).toBe(1);
  });

  it("gives back the button type it added, and keeps one the host set", () => {
    const f = fixture();
    const c = createConnectionTest(f.button, f.status, { run: deferredRun().run });
    expect(f.button.getAttribute("type")).toBe("button");
    c.dispose();
    expect(f.button.hasAttribute("type")).toBe(false);
    const g = fixture();
    g.button.type = "submit";
    const d = createConnectionTest(g.button, g.status, { run: deferredRun().run });
    expect(g.button.getAttribute("type")).toBe("submit");
    d.dispose();
    expect(g.button.getAttribute("type")).toBe("submit");
  });

  it("follows the host's aria-disabled outside busy", async () => {
    const f = fixture();
    f.button.setAttribute("aria-disabled", "true");
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, { run: d.run }, f.root);
    f.url.addEventListener("input", () => {
      f.button.removeAttribute("aria-disabled");
    });
    f.url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
    f.button.setAttribute("aria-disabled", "true");
    c.reset();
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
    f.button.removeAttribute("aria-disabled");
    c.start();
    expect(f.button.getAttribute("aria-disabled")).toBe("true");
    d.resolve({ ok: true, message: "ok" });
    await settled();
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
  });

  it("removes the describedby token it added though the status id changed since", async () => {
    const f = fixture();
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    c.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    f.status.id = "host-status";
    c.reset();
    expect(f.url.hasAttribute("aria-describedby")).toBe(false);
  });

  it("refuses a root another live control writes", () => {
    const f = fixture();
    const extra = document.createElement("p");
    const second = document.createElement("button");
    f.root.append(extra, second);
    const first = createConnectionTest(f.button, f.status, { run: deferredRun().run }, f.root);
    expect(() => createConnectionTest(second, extra, { run: deferredRun().run }, f.root)).toThrow(
      TypeError,
    );
    first.dispose();
    expect(() =>
      createConnectionTest(second, extra, { run: deferredRun().run }, f.root),
    ).not.toThrow();
  });

  it("refuses a status or root that is no element and claims nothing", () => {
    const f = fixture();
    const run = deferredRun().run;
    const notElement = null as unknown as HTMLElement;
    expect(() => createConnectionTest(f.button, f.status, { run }, notElement)).toThrow(
      "status and root must be elements",
    );
    expect(() => createConnectionTest(f.button, notElement, { run })).toThrow(TypeError);
    expect(() => createConnectionTest(f.button, f.status, { run }, f.root)).not.toThrow();
  });

  it("treats an empty or unknown type as a submit button and types it", async () => {
    for (const type of ["", "submitt", "Button "]) {
      document.body.replaceChildren();
      const f = fixture();
      const submits = inForm(f);
      f.button.setAttribute("type", type);
      const d = deferredRun();
      const c = createConnectionTest(f.button, f.status, { run: d.run });
      expect(f.button.type).toBe("button");
      f.url.focus();
      await userEvent.keyboard("{Enter}");
      expect(submits()).toBe(1);
      expect(d.calls).toHaveLength(0);
      c.dispose();
      expect(f.button.getAttribute("type")).toBe(type);
    }
  });

  it("keeps a type the host set while the control lived", () => {
    const f = fixture();
    const c = createConnectionTest(f.button, f.status, { run: deferredRun().run });
    f.button.type = "submit";
    c.dispose();
    expect(f.button.getAttribute("type")).toBe("submit");
  });

  it("gives back the host's aria-disabled after busy is realized twice in one pass", async () => {
    const f = fixture();
    const d = deferredRun();
    let again = true;
    const c: ReturnType<typeof createConnectionTest> = createConnectionTest(f.button, f.status, {
      run: d.run,
      onChange: (state) => {
        if (state === "busy" && again) {
          again = false;
          c.reset();
          c.start();
        }
      },
    });
    c.start();
    d.resolve({ ok: true, message: "ok" });
    await settled();
    expect(c.state()).toBe("passed");
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
  });

  it("fails with the no-answer text for a result whose fields throw when read", async () => {
    const f = fixture();
    const d = deferredRun();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const c = createConnectionTest(f.button, f.status, { run: d.run });
    c.start();
    d.resolve({
      get ok(): boolean {
        throw new Error("getter");
      },
      message: "m",
    });
    await settled();
    expect(c.state()).toBe("failed");
    expect(f.status.textContent).toBe("The test returned no answer.");
    expect(f.button.hasAttribute("aria-disabled")).toBe(false);
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("keeps a role the host set after construction", () => {
    const f = fixture();
    const c = createConnectionTest(f.button, f.status, { run: deferredRun().run });
    f.status.setAttribute("role", "alert");
    c.dispose();
    expect(f.status.getAttribute("role")).toBe("alert");
  });

  it("gives status an id when the host removed its own, so a mark is never empty", async () => {
    const f = fixture();
    f.status.id = "host-status";
    f.url.setAttribute("aria-describedby", "hint");
    const d = deferredRun();
    const c = createConnectionTest(f.button, f.status, {
      run: d.run,
      fields: { url: { input: f.url } },
    });
    f.status.removeAttribute("id");
    c.start();
    d.resolve({ ok: false, message: "bad", field: "url" });
    await settled();
    expect(f.status.id).toMatch(/^uip-connection-test-\d+$/);
    expect(f.url.getAttribute("aria-describedby")).toBe(`hint ${f.status.id}`);
    c.dispose();
    expect(f.url.getAttribute("aria-describedby")).toBe("hint");
    expect(f.status.hasAttribute("id")).toBe(false);
  });
});
