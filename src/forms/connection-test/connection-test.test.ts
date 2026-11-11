import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceConnectionTest, type ConnectionTestResult } from "./connection-test.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function form(): {
  form: HTMLFormElement;
  url: HTMLInputElement;
  mark: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
} {
  const f = document.createElement("form");
  const url = document.createElement("input");
  url.name = "url";
  url.value = "http://sonarr:8989";
  const mark = document.createElement("span");
  mark.hidden = true;
  const button = document.createElement("button");
  button.textContent = "Test connection";
  const status = document.createElement("p");
  f.append(url, mark, button, status);
  document.body.append(f);
  return { form: f, url, mark, button, status };
}

function answer(): {
  run: () => Promise<ConnectionTestResult>;
  give: (r: ConnectionTestResult) => void;
  fail: (e: unknown) => void;
  calls: () => number;
} {
  let pending = Promise.withResolvers<ConnectionTestResult>();
  let calls = 0;
  return {
    run: () => {
      calls += 1;
      pending = Promise.withResolvers<ConnectionTestResult>();
      return pending.promise;
    },
    give: (r) => {
      pending.resolve(r);
    },
    fail: (e) => {
      pending.reject(e);
    },
    calls: () => calls,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("enhanceConnectionTest", () => {
  it("never submits its form, and makes the status a polite live region", () => {
    const { button, status } = form();
    enhanceConnectionTest(button, status, { run: answer().run, signal: life.signal });
    expect(button.type).toBe("button");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.dataset["cpState"]).toBe("idle");
  });

  it("goes busy with its words, then says a pass, on the status and the form", async () => {
    const { form: f, button, status } = form();
    const a = answer();
    const states: string[] = [];
    enhanceConnectionTest(button, status, {
      run: a.run,
      onChange: (s) => states.push(s),
      signal: life.signal,
    });
    await userEvent.click(button);
    expect(status.dataset["cpState"]).toBe("busy");
    expect(status.textContent).toBe("Testing…");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(status.hasAttribute("aria-busy")).toBe(false);
    a.give({ ok: true, message: "Sonarr 4.0 answered." });
    await tick();
    expect([status.dataset["cpState"], f.dataset["cpState"], status.textContent]).toEqual([
      "passed",
      "passed",
      "Sonarr 4.0 answered.",
    ]);
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(states).toEqual(["busy", "passed"]);
  });

  it("ignores a press while busy, without moving focus off the button", async () => {
    const { button, status } = form();
    const a = answer();
    enhanceConnectionTest(button, status, { run: a.run, signal: life.signal });
    await userEvent.click(button);
    button.click();
    expect(a.calls()).toBe(1);
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("marks the field a failure names and says why there, until the form is edited", async () => {
    const { url, mark, button, status } = form();
    const a = answer();
    enhanceConnectionTest(button, status, {
      run: a.run,
      fields: { url: { input: url, mark } },
      signal: life.signal,
    });
    await userEvent.click(button);
    a.give({ ok: false, message: "Nothing answered at that address.", field: "url" });
    await tick();
    expect(status.dataset["cpState"]).toBe("failed");
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect([mark.hidden, mark.textContent]).toEqual([false, "Nothing answered at that address."]);
    await userEvent.type(url, "0");
    expect(status.dataset["cpState"]).toBe("idle");
    expect(url.hasAttribute("aria-invalid")).toBe(false);
    expect(mark.hidden).toBe(true);
  });

  it("ignores a field it was not given, inherited names included", async () => {
    const { button, status } = form();
    const a = answer();
    enhanceConnectionTest(button, status, { run: a.run, fields: {}, signal: life.signal });
    await userEvent.click(button);
    a.give({ ok: false, message: "No.", field: "constructor" });
    await tick();
    expect(status.dataset["cpState"]).toBe("failed");
  });

  it("words a rejected check, and drops the answer of a check the person edited past", async () => {
    const { url, button, status } = form();
    const a = answer();
    enhanceConnectionTest(button, status, { run: a.run, signal: life.signal });
    await userEvent.click(button);
    a.fail(new Error("NetworkError when attempting to fetch resource."));
    await tick();
    expect(status.textContent).toBe("NetworkError when attempting to fetch resource.");
    await userEvent.click(button);
    await userEvent.type(url, "1");
    a.give({ ok: true, message: "late" });
    await tick();
    expect(status.dataset["cpState"]).toBe("idle");
    await userEvent.click(button);
    a.fail("nope");
    await tick();
    expect(status.textContent).toBe("The test could not run.");
  });
});
