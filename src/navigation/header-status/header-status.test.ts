import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import {
  createHeaderStatus,
  type HeaderStatus,
  type StatusCondition,
  type StatusModel,
  type StatusWork,
} from "./header-status.js";

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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  installAnnouncer({ signal: life.signal });
});

afterEach(async () => {
  vi.useRealTimers();
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
  await page.viewport(1280, 720);
});

function mount(options?: Parameters<typeof createHeaderStatus>[1]): {
  button: HTMLButtonElement;
  status: HeaderStatus;
} {
  const header = document.createElement("header");
  header.className = "cp-header";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cp-header-status";
  button.dataset["state"] = "ok";
  button.innerHTML = "<span>All good</span>";
  const panel = document.createElement("div");
  panel.className = "cp-popover cp-status-panel";
  panel.dataset["variant"] = "panel";
  panel.popover = "auto";
  header.append(button, panel);
  document.body.append(header);
  return { button, status: createHeaderStatus({ button, panel }, options) };
}

const words = (b: HTMLButtonElement) =>
  b.querySelector(":scope > span:not([data-part])")?.textContent;
const detail = (b: HTMLButtonElement) => b.querySelector('[data-part="detail"]')?.textContent;
const said = () => {
  vi.advanceTimersByTime(100);
  return document.querySelector('[aria-live="polite"]')?.textContent ?? "";
};

const problem = (id: string, extra: Partial<StatusCondition> = {}): StatusCondition => ({
  id,
  level: "problem",
  title: `${id} failed`,
  ...extra,
});
const warning = (id: string, extra: Partial<StatusCondition> = {}): StatusCondition => ({
  id,
  level: "warning",
  title: `${id} slow`,
  ...extra,
});
const job = (id: string, extra: Partial<StatusWork> = {}): StatusWork => ({
  id,
  title: id,
  ...extra,
});
const model = (m: Partial<StatusModel>): StatusModel => ({ conditions: [], work: [], ...m });

describe("the pill's words", () => {
  const rows: [string, Partial<StatusModel>, string, string, string | undefined][] = [
    ["nothing", {}, "ok", "All good", undefined],
    [
      "one item of work",
      { work: [job("Full check", { value: 3, max: 8 })] },
      "working",
      "Full check 3/8",
      undefined,
    ],
    [
      "one item with no amount",
      { work: [job("Scanning Sonarr")] },
      "working",
      "Scanning Sonarr",
      undefined,
    ],
    ["several items", { work: [job("a"), job("b"), job("c")] }, "working", "Working: 3", undefined],
    [
      "the newest few of more",
      { work: [job("a")], workTotal: 100 },
      "working",
      "Working: 100",
      undefined,
    ],
    ["queued only", { work: [job("a", { queued: true })] }, "ok", "All good", undefined],
    [
      "warnings only",
      { conditions: [warning("w1"), warning("w2")] },
      "warning",
      "2 warnings",
      undefined,
    ],
    [
      "a warning while work runs",
      { conditions: [warning("w1")], work: [job("a"), job("b")] },
      "warning",
      "1 warning",
      "Working: 2",
    ],
    [
      "problems over warnings",
      { conditions: [warning("w1"), problem("p1")] },
      "problem",
      "1 problem",
      undefined,
    ],
    [
      "problems while work runs",
      {
        conditions: [problem("p1"), problem("p2")],
        work: [job("Full check", { value: 1, max: 2 })],
      },
      "problem",
      "2 problems",
      "Full check 1/2",
    ],
    [
      "an urgent condition",
      { conditions: [problem("p1", { urgent: true, title: "Store full" })], work: [job("a")] },
      "problem",
      "Store full",
      "a",
    ],
    [
      "an urgent among problems",
      { conditions: [problem("p1"), problem("p2", { urgent: true, title: "Store full" })] },
      "problem",
      "Store full",
      "2 problems",
    ],
    [
      "an urgent warning",
      { conditions: [warning("w1", { urgent: true, title: "Sign-in is off" })] },
      "problem",
      "Sign-in is off",
      undefined,
    ],
  ];
  for (const [name, m, state, main, more] of rows) {
    it(`reads ${name}`, () => {
      const { button, status } = mount();
      status.update(model(m));
      expect(button.dataset["state"]).toBe(state);
      expect(words(button)).toBe(main);
      expect(detail(button)).toBe(more);
    });
  }

  it("names the longest-standing urgent condition", () => {
    const { button, status } = mount();
    status.update(
      model({
        conditions: [
          problem("a", { urgent: true, title: "Exposed", since: 2000 }),
          problem("b", { urgent: true, title: "Sign-in is off", since: 1000 }),
        ],
      }),
    );
    expect(words(button)).toBe("Sign-in is off");
  });

  it("takes the app's words and formats counts in its locale", () => {
    const { button, status } = mount({
      locale: "en-US",
      words: { problems: (n) => `${String(n)} Probleme` },
    });
    status.update(model({ work: [job("a")], workTotal: 1200 }));
    expect(words(button)).toBe("Working: 1,200");
    status.update(model({ conditions: [problem("a"), problem("b")] }));
    expect(words(button)).toBe("2 Probleme");
  });

  it("writes the words into a pill that had none and drops a detail that went", () => {
    const { button, status } = mount();
    button.replaceChildren();
    status.update(model({ conditions: [warning("w")], work: [job("a")] }));
    expect([...button.children].map((c) => c.textContent)).toEqual(["1 warning", "a"]);
    status.update(model({ conditions: [warning("w")] }));
    expect([...button.children].map((c) => c.textContent)).toEqual(["1 warning"]);
  });
});

describe("the stream", () => {
  it("reads Reconnecting… for ten seconds, then turns offline and says so once", () => {
    const { button, status } = mount();
    status.update(model({ conditions: [warning("w")] }));
    status.connection("lost");
    expect(button.dataset["state"]).toBe("warning");
    expect(words(button)).toBe("1 warning");
    expect(detail(button)).toBe("Reconnecting…");
    vi.advanceTimersByTime(9_900);
    expect(button.dataset["state"]).toBe("warning");
    status.connection("lost");
    vi.advanceTimersByTime(100);
    expect(button.dataset["state"]).toBe("offline");
    expect(words(button)).toBe("Offline");
    expect(detail(button)).toBeUndefined();
    expect(said()).toBe("Offline");
    status.update(model({ conditions: [problem("p")] }));
    expect(button.dataset["state"]).toBe("offline");
  });

  it("goes back at once when the stream returns, and in time never turns offline", () => {
    const { button, status } = mount({ offlineAfter: 500 });
    status.update(model({ work: [job("a")] }));
    status.connection("lost");
    vi.advanceTimersByTime(400);
    status.connection("live");
    vi.advanceTimersByTime(1000);
    expect(button.dataset["state"]).toBe("working");
    expect(detail(button)).toBeUndefined();
    status.connection("lost");
    vi.advanceTimersByTime(500);
    expect(button.dataset["state"]).toBe("offline");
    status.connection("live");
    expect(button.dataset["state"]).toBe("working");
    expect(words(button)).toBe("a");
  });

  it("refuses an offline delay that is not a count of ms", () => {
    expect(() => mount({ offlineAfter: -1 })).toThrow(RangeError);
    expect(() => mount({ offlineAfter: Number.NaN })).toThrow(RangeError);
  });

  it("stops on destroy", () => {
    const { button, status } = mount();
    status.update(model({ work: [job("a")] }));
    status.connection("lost");
    status.destroy();
    vi.advanceTimersByTime(20_000);
    status.update(model({}));
    status.connection("live");
    expect(button.dataset["state"]).toBe("working");
    expect(detail(button)).toBe("Reconnecting…");
  });
});

describe("what it says", () => {
  it("says nothing at the first update", () => {
    const { status } = mount();
    status.update(model({ conditions: [problem("p")] }));
    expect(said()).toBe("");
  });

  it("says the pill turning worse, with the condition that did it", () => {
    const { status } = mount();
    status.update(model({}));
    status.update(model({ conditions: [warning("Indexer")] }));
    expect(said()).toBe("1 warning: Indexer slow");
    status.update(
      model({
        conditions: [
          warning("Indexer"),
          problem("Sonarr", { title: "Sonarr rejected the API key" }),
        ],
      }),
    );
    expect(said()).toBe("1 problem: Sonarr rejected the API key");
  });

  it("says a rising problem count and an urgent condition by name", () => {
    const { status } = mount();
    status.update(model({ conditions: [problem("a")] }));
    status.update(model({ conditions: [problem("a"), problem("b")] }));
    expect(said()).toBe("2 problems: b failed");
    status.update(
      model({ conditions: [problem("b"), problem("c", { urgent: true, title: "Store full" })] }),
    );
    expect(said()).toBe("Store full");
  });

  it("never says work starting, moving or ending, nor a warning count rising", () => {
    const { status } = mount();
    status.update(model({}));
    status.update(model({ work: [job("a", { value: 1, max: 8 })] }));
    status.update(model({ work: [job("a", { value: 2, max: 8 }), job("b")] }));
    status.update(model({}));
    expect(said()).toBe("");
    status.update(model({ conditions: [warning("w1")] }));
    expect(said()).toBe("1 warning: w1 slow");
    status.update(model({ conditions: [warning("w1"), warning("w2")] }));
    expect(said()).toBe("1 warning: w1 slow");
  });

  it("says the return to All good after trouble, and not before", () => {
    const { status } = mount();
    status.update(model({ conditions: [problem("p")] }));
    status.update(model({ work: [job("a")] }));
    expect(said()).toBe("");
    status.update(model({ conditions: [problem("p")] }));
    status.update(model({ work: [job("a")] }));
    status.update(model({}));
    expect(said()).toBe("All good");
  });

  it("says All good when the stream returns to nothing wrong", () => {
    const { status } = mount({ offlineAfter: 0 });
    status.update(model({}));
    status.connection("lost");
    vi.advanceTimersByTime(0);
    expect(said()).toBe("Offline");
    status.connection("live");
    expect(said()).toBe("All good");
  });
});

describe("at compact width", () => {
  it("shows the glyph alone and keeps the words as the button's name", async () => {
    const { button, status } = mount();
    status.update(model({ conditions: [problem("p")], work: [job("a")] }));
    await page.viewport(390, 800);
    const main = button.querySelector(":scope > span:not([data-part])") as HTMLElement;
    expect(main.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(getComputedStyle(button.querySelector('[data-part="detail"]') as Element).display).toBe(
      "none",
    );
    expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
    await expect
      .element(page.getByRole("button", { name: "1 problem", exact: true }))
      .toBeInTheDocument();
  });
});
