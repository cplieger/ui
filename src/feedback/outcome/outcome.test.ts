import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { installAnnouncer } from "../announce/announce.js";
import { reported } from "../test-helpers/reported.js";
import { enhanceOutcome, type OutcomeOptions, type OutcomeResult } from "./outcome.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

beforeAll(async () => {
  document.documentElement.classList.add("cp");
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
});

afterAll(() => {
  sheet.remove();
  document.documentElement.classList.remove("cp");
});

beforeEach(() => {
  installAnnouncer({ signal: life.signal });
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

interface Deferred {
  readonly promise: Promise<OutcomeResult>;
  resolve(result: OutcomeResult): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let resolve!: (result: OutcomeResult) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<OutcomeResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`[aria-live="${politeness}"]`)?.textContent ?? "";

const PINNED: OutcomeResult = { href: "#arid", words: "Downloaded · Pinned" };

/** A table row with its Download in the actions cell, and a button after
 *  the table to move focus to. */
function row(): {
  cell: HTMLTableCellElement;
  button: HTMLButtonElement;
  after: HTMLButtonElement;
} {
  document.body.insertAdjacentHTML(
    "beforeend",
    '<table class="cp-table"><tbody><tr><td>[Arid] Frieren S01E04</td><td data-col="actions">' +
      '<button class="cp-button" data-size="sm" type="button"><span class="cp-icon" data-cp-icon="download" aria-hidden="true"></span>' +
      '<span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span><span class="cp-roll">Download</span></button>' +
      '</td></tr></tbody></table><button type="button" id="after">After</button>',
  );
  return {
    cell: document.querySelector("td[data-col]") as HTMLTableCellElement,
    button: document.querySelector("td button") as HTMLButtonElement,
    after: document.querySelector("#after") as HTMLButtonElement,
  };
}

function wire(button: HTMLButtonElement, extra: Partial<OutcomeOptions> = {}): Deferred[] {
  const calls: Deferred[] = [];
  enhanceOutcome(button, {
    run: () => {
      const d = deferred();
      calls.push(d);
      return d.promise;
    },
    words: { busy: "Downloading…" },
    signal: life.signal,
    ...extra,
  });
  return calls;
}

describe("enhanceOutcome", () => {
  it("runs busy and focusable, then the link to the result takes the cell and focus", async () => {
    const { cell, button } = row();
    const calls = wire(button);
    button.focus();
    button.click();
    button.click();
    expect(calls).toHaveLength(1);
    await until(() => button.getAttribute("aria-busy") === "true");
    expect(button.disabled).toBe(false);
    expect(button.querySelector(".cp-roll")?.textContent).toContain("Downloading…");
    expect(document.activeElement).toBe(button);
    calls[0]?.resolve(PINNED);
    await until(() => cell.querySelector(".cp-outcome") !== null);
    const link = cell.querySelector(":scope > .cp-outcome > a") as HTMLAnchorElement;
    expect(button.isConnected).toBe(false);
    expect(link.getAttribute("href")).toBe("#arid");
    expect(link.textContent).toBe("Downloaded · Pinned");
    expect(link.querySelector('.cp-icon[aria-hidden="true"]')?.getAttribute("data-cp-icon")).toBe(
      "circle-check",
    );
    expect(document.activeElement).toBe(link);
    await until(() => said("polite") === "Downloaded · Pinned");
  });

  it("says the app's words for a success", async () => {
    const { button } = row();
    const calls = wire(button, {
      words: { busy: "Downloading…", said: (r) => `${r.words.split(" · ")[0] ?? ""} and pinned.` },
    });
    button.click();
    calls[0]?.resolve(PINNED);
    await until(() => said("polite") !== "");
    expect(said("polite")).toBe("Downloaded and pinned.");
  });

  it("settles a failure into its failed state beside Retry, which takes focus", async () => {
    const { cell, button } = row();
    const calls = wire(button, {
      words: {
        busy: "Downloading…",
        failedSaid: (reason) =>
          `Download failed: ${(reason as Error).message.replace(/^\w/, (c) => c.toLowerCase())}`,
      },
    });
    button.focus();
    button.click();
    calls[0]?.reject(new Error("The provider timed out."));
    await until(() => cell.querySelector(".cp-outcome") !== null);
    const state = cell.querySelector(".cp-outcome > .cp-state") as HTMLElement;
    const retry = cell.querySelector(".cp-outcome > button") as HTMLButtonElement;
    expect([state.dataset["cpState"], state.textContent]).toEqual([
      "failed",
      "The provider timed out.",
    ]);
    const danger = document.body.appendChild(document.createElement("span"));
    danger.style.color = "var(--cp-danger-11)";
    expect(getComputedStyle(state).color).toBe(getComputedStyle(danger).color);
    expect(retry.type).toBe("button");
    expect(retry.querySelector(".cp-roll")?.textContent).toBe("Retry");
    expect(retry.getAttribute("aria-describedby")).toBe(state.id);
    expect(document.activeElement).toBe(retry);
    await until(() => said("assertive") === "Download failed: the provider timed out.");
  });

  it("settles in the default words when the app's words throw", async () => {
    const errors = reported();
    const { cell, button } = row();
    const fails = (reason: unknown): string => (reason as { body: { detail: string } }).body.detail;
    const calls = wire(button, {
      words: { busy: "Downloading…", failed: fails, failedSaid: fails },
    });
    button.click();
    calls[0]?.reject(new Error("The provider timed out."));
    await until(() => cell.querySelector(".cp-state") !== null);
    expect(cell.querySelector(".cp-state")?.textContent).toBe("The provider timed out.");
    expect(cell.querySelector(".cp-outcome > button")).not.toBeNull();
    await until(() => said("assertive") === "The provider timed out.");
    expect(errors).toHaveLength(2);
  });

  it("says the result's words when the app's success words throw", async () => {
    const errors = reported();
    const { cell, button } = row();
    const calls = wire(button, {
      words: {
        busy: "Downloading…",
        said: () => {
          throw new Error("no words");
        },
      },
    });
    button.click();
    calls[0]?.resolve(PINNED);
    await until(() => cell.querySelector(".cp-outcome > a") !== null);
    await until(() => said("polite") === "Downloaded · Pinned");
    expect(errors).toHaveLength(1);
  });

  it("falls back to its own sentence for a rejection with no message", async () => {
    const { cell, button } = row();
    const calls = wire(button);
    button.click();
    calls[0]?.reject("nope");
    await until(() => cell.querySelector(".cp-state") !== null);
    expect(cell.querySelector(".cp-state")?.textContent).toBe("The action failed.");
    await until(() => said("assertive") === "The action failed.");
  });

  it("retries through the same cycle, and a success then replaces the failure", async () => {
    const { cell, button } = row();
    const calls = wire(button, { words: { busy: "Downloading…", retry: "Try again" } });
    button.click();
    calls[0]?.reject(new Error("The provider timed out."));
    await until(() => cell.querySelector(".cp-outcome > button") !== null);
    const retry = cell.querySelector(".cp-outcome > button") as HTMLButtonElement;
    expect(retry.textContent).toBe("Try again");
    retry.click();
    await until(() => retry.getAttribute("aria-busy") === "true");
    expect(document.activeElement).toBe(retry);
    calls[1]?.resolve(PINNED);
    await until(() => cell.querySelector(".cp-outcome > a") !== null);
    expect(cell.querySelectorAll(".cp-outcome")).toHaveLength(1);
    expect(cell.querySelector(".cp-state")).toBeNull();
    expect(document.activeElement).toBe(cell.querySelector(".cp-outcome > a"));
  });

  it("leaves focus where the reader moved it", async () => {
    const { cell, button, after } = row();
    const calls = wire(button);
    button.focus();
    button.click();
    after.focus();
    calls[0]?.resolve(PINNED);
    await until(() => cell.querySelector(".cp-outcome") !== null);
    expect(document.activeElement).toBe(after);
  });

  it("writes nothing once its signal ends the work under way", async () => {
    const { cell, button } = row();
    const calls = wire(button);
    button.click();
    life.abort();
    calls[0]?.resolve(PINNED);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(button.isConnected).toBe(true);
    expect(cell.querySelector(".cp-outcome")).toBeNull();
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("passes its signal to the work and aborts it with the module's", () => {
    const { button } = row();
    let given: AbortSignal | undefined;
    enhanceOutcome(button, {
      run: (signal) => {
        given = signal;
        return new Promise(() => undefined);
      },
      words: { busy: "Downloading…" },
      signal: life.signal,
    });
    button.click();
    expect(given?.aborted).toBe(false);
    life.abort();
    expect(given?.aborted).toBe(true);
  });

  it("throws a TypeError for a button with no .cp-roll", () => {
    const button = document.createElement("button");
    expect(() => {
      enhanceOutcome(button, { run: () => Promise.resolve(PINNED), words: { busy: "…" } });
    }).toThrow(TypeError);
  });
});
