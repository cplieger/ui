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

function mount(
  options?: Parameters<typeof createHeaderStatus>[1],
  { withBanner = true } = {},
): {
  button: HTMLButtonElement;
  panel: HTMLElement;
  banner: HTMLElement;
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
  const banner = document.createElement("div");
  banner.className = "cp-stack";
  document.body.append(header, banner);
  const parts = withBanner ? { button, panel, banner } : { button, panel };
  return { button, panel, banner, status: createHeaderStatus(parts, options) };
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

const sections = (panel: HTMLElement) =>
  [...panel.children].map((c) =>
    c instanceof HTMLElement && c.dataset["cpStatus"] !== undefined
      ? c.dataset["cpStatus"]
      : c.tagName.toLowerCase(),
  );
const rows = (panel: HTMLElement, name: string) => [
  ...panel.querySelectorAll<HTMLElement>(
    `[data-cp-status="${name}"] li[data-cp-key] > .cp-list-row`,
  ),
];
const heading = (panel: HTMLElement) => panel.querySelector("h2")?.textContent;
const stopButton = (panel: HTMLElement, id: string) =>
  panel.querySelector<HTMLButtonElement>(`[data-cp-stop="${id}"]`) as HTMLButtonElement;

const full = (starts: HTMLElement): StatusModel =>
  model({
    starts,
    conditions: [warning("w"), problem("p", { href: "/fix/p" })],
    work: [job("a", { stop: { run: () => Promise.resolve() } })],
    notices: [{ id: "n", title: "Backup restored" }],
    recent: [{ id: "r", words: "Check finished", at: Date.now() - 60_000 }],
    history: { href: "/activity", label: "Open activity" },
  });

describe("the panel's sections", () => {
  it("writes the heading, then starts, conditions, running, notices, recent and the foot", () => {
    const { panel, status } = mount();
    const starts = document.createElement("div");
    starts.className = "cp-cluster";
    status.update(full(starts));
    expect(sections(panel)).toEqual([
      "header",
      "starts",
      "conditions",
      "work",
      "notices",
      "recent",
      "footer",
    ]);
    expect(panel.querySelector('[data-cp-status="starts"] > .cp-cluster')).toBe(starts);
    expect(panel.querySelector("footer > a")?.getAttribute("href")).toBe("/activity");
    expect(panel.getAttribute("aria-labelledby")).toBe(panel.querySelector("h2")?.id);
    for (const list of panel.querySelectorAll("section > .cp-list")) {
      expect(list.getAttribute("data-surface")).toBe("plain");
      expect(document.getElementById(list.getAttribute("aria-labelledby") ?? "")).toBe(
        list.previousElementSibling,
      );
    }
  });

  it("leaves out every empty section", () => {
    const { panel, status } = mount();
    status.update(full(document.createElement("div")));
    status.update(model({ work: [job("a")] }));
    expect(sections(panel)).toEqual(["header", "work"]);
    status.update(model({}));
    expect(sections(panel)).toEqual(["header"]);
  });

  it("heads the panel with the pill's words in full", () => {
    const { panel, status } = mount();
    status.update(model({ conditions: [problem("a"), problem("b")], work: [job("x"), job("y")] }));
    expect(heading(panel)).toBe("2 problems · Working: 2");
    status.update(model({}));
    expect(heading(panel)).toBe("All good");
  });

  it("orders conditions urgent, problem, warning, the longest-standing first", () => {
    const { panel, status } = mount();
    status.update(
      model({
        conditions: [
          warning("w", { since: 1 }),
          problem("p2", { since: 3000 }),
          problem("p1", { since: 2000 }),
          warning("u", { urgent: true, title: "Sign-in is off", since: 5000 }),
        ],
      }),
    );
    expect(rows(panel, "conditions").map((r) => r.closest("li")?.dataset["cpKey"])).toEqual([
      "u",
      "p1",
      "p2",
      "w",
    ]);
  });

  it("writes a condition's reasons as lines and links the whole row to its fix", async () => {
    const { panel, status } = mount();
    status.update(
      model({
        conditions: [
          problem("p", {
            title: "Restart pending",
            reasons: ["Port changed", "Base URL changed"],
            since: Date.now() - 3_600_000,
            href: "/settings#restart",
          }),
          warning("w", { title: "Indexer slow" }),
        ],
      }),
    );
    panel.showPopover();
    const [linked, fact] = rows(panel, "conditions") as [HTMLElement, HTMLElement];
    expect(linked.tagName).toBe("A");
    expect(linked.getAttribute("href")).toBe("/settings#restart");
    expect(linked.querySelector('[data-cp-icon="chevron-right"]')).not.toBeNull();
    expect(
      [...linked.querySelectorAll(".cp-cell-stack > small")].map((s) => s.textContent),
    ).toEqual(["Port changed", "Base URL changed"]);
    expect(linked.querySelector("[data-part='end'] time")?.textContent).toMatch(/^1 hour ago/);
    await expect
      .element(page.getByRole("link", { name: /^Problem Restart pending.*Details and fix$/ }))
      .toBeInTheDocument();
    expect(fact.tagName).toBe("DIV");
    expect(fact.querySelector('[data-cp-icon="chevron-right"]')).toBeNull();
    expect(fact.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Warning");
  });

  it("closes on a problem's link, so the component's status heading it lands on takes focus", async () => {
    const { panel, status } = mount();
    const block = document.createElement("h3");
    block.id = "cs-sonarr";
    block.tabIndex = -1;
    block.textContent = "Sonarr";
    document.body.append(block);
    status.update(model({ conditions: [problem("p", { href: "#cs-sonarr" })] }));
    panel.showPopover();
    const [link] = rows(panel, "conditions") as [HTMLAnchorElement];
    try {
      link.click();
      expect(panel.matches(":popover-open")).toBe(false);
      await expect.poll(() => document.activeElement).toBe(block);
    } finally {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });

  it("stays open on a link pressed to open elsewhere", () => {
    const { panel, status } = mount();
    status.update(model({ conditions: [problem("p", { href: "#cs-sonarr" })] }));
    panel.showPopover();
    const [link] = rows(panel, "conditions") as [HTMLAnchorElement];
    const away = new AbortController();
    document.addEventListener("click", (e) => e.preventDefault(), { signal: away.signal });
    for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"] as const) {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, [key]: true }));
      expect(panel.matches(":popover-open"), key).toBe(true);
    }
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 }));
    expect(panel.matches(":popover-open")).toBe(true);
    away.abort();
  });

  it("writes notices with the info glyph, and five recent events at most", () => {
    const { panel, status } = mount();
    const at = Date.now();
    status.update(
      model({
        notices: [{ id: "n", title: "View rebuilt", href: "/notes" }],
        recent: Array.from({ length: 7 }, (_, i) => ({
          id: `r${String(i)}`,
          words: `Event ${String(i)}`,
          at: at - i * 60_000,
        })),
      }),
    );
    const [notice] = rows(panel, "notices") as [HTMLElement];
    expect(notice.tagName).toBe("A");
    expect(notice.querySelector('[data-cp-icon="info"]')).not.toBeNull();
    const recent = rows(panel, "recent");
    expect(recent.map((r) => r.querySelector(".cp-cell-stack")?.textContent)).toEqual([
      "Event 0",
      "Event 1",
      "Event 2",
      "Event 3",
      "Event 4",
    ]);
    expect(recent[0]?.querySelector("time")?.dataset["cpTip"]).toBeTruthy();
  });

  it("refuses an invalid date", () => {
    const { status } = mount();
    expect(() =>
      status.update(model({ recent: [{ id: "r", words: "x", at: Number.NaN }] })),
    ).toThrow(RangeError);
  });
});

describe("the running section", () => {
  it("shows the newest three, then Show all N running", () => {
    const { panel, status } = mount();
    status.update(
      model({
        work: [job("a"), job("b"), job("c"), job("d")],
        workTotal: 12,
        workHref: "/running",
      }),
    );
    expect(rows(panel, "work").map((r) => r.closest("li")?.dataset["cpKey"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    const more = panel.querySelector<HTMLAnchorElement>(
      '[data-cp-status="work"] .cp-list-foot > a',
    );
    expect(more?.textContent).toBe("Show all 12 running");
    expect(more?.getAttribute("href")).toBe("/running");
    status.update(model({ work: [job("a"), job("b")], workHref: "/running" }));
    expect(panel.querySelector(".cp-list-foot")).toBeNull();
  });

  it("writes a row's progress, how far it is and its phase", () => {
    const { panel, status } = mount();
    status.update(
      model({
        work: [
          job("Scanning Sonarr", { value: 12, max: 40, phase: "Searching providers" }),
          job("Full check"),
        ],
      }),
    );
    const [counted, open] = rows(panel, "work") as [HTMLElement, HTMLElement];
    const bar = counted.querySelector(":scope > progress") as HTMLProgressElement;
    expect(bar.value).toBe(12);
    expect(bar.max).toBe(40);
    expect(bar.getAttribute("aria-label")).toBe("Scanning Sonarr");
    expect(counted.querySelector(":scope > small")?.textContent).toBe(
      "12 of 40 · Searching providers",
    );
    expect(open.querySelector(":scope > progress")?.hasAttribute("value")).toBe(false);
    expect(open.querySelector(":scope > small")).toBeNull();
  });

  it("shows the idle line while nothing runs", () => {
    const { panel, status } = mount();
    status.update(model({ next: "Next scan 03:00" }));
    expect(panel.querySelector('[data-cp-status="work"] .cp-cell-stack')?.textContent).toBe(
      "Next scan 03:00",
    );
    status.update(model({ next: "Next scan 03:00", work: [job("a")] }));
    expect(panel.querySelector('[data-cp-status="work"]')?.textContent).not.toContain("Next scan");
  });

  it("links the whole row with no Stop, and the title beside a Stop", () => {
    const { panel, status } = mount();
    status.update(
      model({
        work: [
          job("a", { href: "/a" }),
          job("b", { href: "/b", stop: { run: () => Promise.resolve() } }),
        ],
      }),
    );
    const [whole, both] = rows(panel, "work") as [HTMLElement, HTMLElement];
    expect(whole.tagName).toBe("A");
    expect(whole.querySelector('[data-cp-icon="chevron-right"]')).not.toBeNull();
    expect(both.tagName).toBe("DIV");
    expect(both.querySelector(".cp-cell-stack > a")?.getAttribute("href")).toBe("/b");
    expect(both.querySelector("[data-cp-stop]")).not.toBeNull();
  });

  it("stops at once, reading Stopping… until the item leaves", async () => {
    const { panel, status } = mount();
    const run = vi.fn(() => Promise.resolve());
    const m = model({ work: [job("Scanning Sonarr", { stop: { run } })] });
    status.update(m);
    panel.showPopover();
    await expect
      .element(page.getByRole("button", { name: "Stop Scanning Sonarr" }))
      .toBeInTheDocument();
    stopButton(panel, "Scanning Sonarr").click();
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledOnce();
    });
    const button = stopButton(panel, "Scanning Sonarr");
    expect(button.firstChild?.textContent).toBe("Stopping…");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.click();
    status.update(m);
    expect(stopButton(panel, "Scanning Sonarr").firstChild?.textContent).toBe("Stopping…");
    expect(run).toHaveBeenCalledOnce();
    status.update(model({}));
    status.update(m);
    expect(stopButton(panel, "Scanning Sonarr").firstChild?.textContent).toBe("Stop");
  });

  it("asks first when the app says so, and stops only on the answer", async () => {
    vi.useRealTimers();
    const { panel, status } = mount();
    const run = vi.fn(() => Promise.resolve());
    status.update(
      model({
        work: [
          job("Full check", {
            stop: { run, ask: { message: "Stop the full check?", confirmLabel: "Stop the check" } },
          }),
        ],
      }),
    );
    stopButton(panel, "Full check").click();
    const dialog = await vi.waitFor(() => {
      const d = document.querySelector<HTMLDialogElement>("dialog[open]");
      expect(d?.textContent).toContain("Stop the full check?");
      return d as HTMLDialogElement;
    });
    (dialog.querySelector("footer > button:not([value])") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector("dialog")).toBeNull();
    });
    expect(run).not.toHaveBeenCalled();
    expect(stopButton(panel, "Full check").firstChild?.textContent).toBe("Stop");
    stopButton(panel, "Full check").click();
    const again = await vi.waitFor(() => {
      const d = document.querySelector<HTMLDialogElement>("dialog[open]");
      expect(d).not.toBeNull();
      return d as HTMLDialogElement;
    });
    (again.querySelector('button[value="confirm"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledOnce();
    });
    expect(stopButton(panel, "Full check").firstChild?.textContent).toBe("Stopping…");
  });

  it("writes a refusal as the row's reason line, and Stop again", async () => {
    const { panel, status } = mount();
    const run = vi.fn(() => Promise.reject(new Error("The pass is writing; try in a minute")));
    status.update(model({ work: [job("a", { stop: { run } })] }));
    stopButton(panel, "a").click();
    await vi.waitFor(() => {
      expect(rows(panel, "work")[0]?.querySelector(".cp-cell-stack > small")?.textContent).toBe(
        "The pass is writing; try in a minute",
      );
    });
    expect(stopButton(panel, "a").firstChild?.textContent).toBe("Stop");
    expect(stopButton(panel, "a").hasAttribute("aria-disabled")).toBe(false);
  });

  it("shows a queued item as Queued with Cancel, never counted", async () => {
    const { button, panel, status } = mount();
    status.update(
      model({ work: [job("Next pass", { queued: true, stop: { run: () => Promise.resolve() } })] }),
    );
    panel.showPopover();
    expect(button.dataset["state"]).toBe("ok");
    const [queued] = rows(panel, "work") as [HTMLElement];
    expect(queued.querySelector("[data-part='end'] > .cp-state")?.textContent).toBe("Queued");
    expect(queued.querySelector("progress")).toBeNull();
    await expect
      .element(page.getByRole("button", { name: "Cancel Next pass" }))
      .toBeInTheDocument();
  });
});

describe("the panel while offline", () => {
  it("heads it Offline since, with Retry, and keeps every row as of the drop", () => {
    const reconnect = vi.fn();
    const { panel, status } = mount({ locale: "en-GB" });
    const lost = new Date(2026, 10, 14, 14, 2).getTime();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: lost });
    status.update(
      model({
        conditions: [problem("p", { reasons: ["Port changed"] })],
        work: [job("a", { phase: "Searching" })],
        recent: [{ id: "r", words: "Done", at: lost - 60_000 }],
        reconnect,
      }),
    );
    status.connection("lost");
    expect(panel.querySelector("[data-cp-retry]")).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(heading(panel)).toBe("Offline since 14:02");
    const retry = panel.querySelector<HTMLButtonElement>("header > [data-cp-retry]");
    expect(retry?.textContent).toBe("Retry");
    retry?.click();
    expect(reconnect).toHaveBeenCalledOnce();
    for (const r of [...rows(panel, "conditions"), ...rows(panel, "work")]) {
      expect(r.hasAttribute("data-kept")).toBe(true);
      expect(r.querySelector(".cp-kept")?.textContent).toBe("As of 14:02");
    }
    expect(rows(panel, "recent")[0]?.hasAttribute("data-kept")).toBe(false);
    status.update(model({ conditions: [problem("p", { reasons: ["Port changed"] })], reconnect }));
    expect(rows(panel, "conditions")[0]?.querySelector(".cp-kept")?.textContent).toBe(
      "As of 14:02",
    );
    status.connection("live");
    expect(panel.querySelector("[data-cp-retry]")).toBeNull();
    const [row] = rows(panel, "conditions") as [HTMLElement];
    expect(row.hasAttribute("data-kept")).toBe(false);
    expect(row.querySelector(".cp-kept")).toBeNull();
    expect(row.querySelector("small:not([hidden])")?.textContent).toBe("Port changed");
  });
});

describe("live updates", () => {
  it("patches rows in place by id", () => {
    const { panel, status } = mount();
    status.update(model({ work: [job("a", { value: 1, max: 4 }), job("b")] }));
    const [a, b] = rows(panel, "work");
    status.update(model({ work: [job("c"), job("a", { value: 2, max: 4 }), job("b")] }));
    const now = rows(panel, "work");
    expect(now[1]).toBe(a);
    expect(now[2]).toBe(b);
    expect((a?.querySelector("progress") as HTMLProgressElement).value).toBe(2);
  });

  it("keeps focus on a row that stays, and moves it to the next when it leaves", () => {
    const { panel, status } = mount();
    panel.showPopover();
    const link = (id: string) => job(id, { href: `/${id}` });
    status.update(model({ work: [link("a"), link("b"), link("c")] }));
    const b = rows(panel, "work")[1] as HTMLElement;
    b.focus();
    status.update(model({ work: [link("x"), link("b"), link("c")] }));
    expect(document.activeElement).toBe(b);
    status.update(model({ work: [link("x"), link("c")] }));
    expect(document.activeElement).toBe(rows(panel, "work")[1]);
  });

  it("moves focus to the section's heading, else the panel's heading", () => {
    const { panel, status } = mount();
    panel.showPopover();
    status.update(
      model({ conditions: [problem("p", { href: "/p" }), problem("q", { href: "/q" })] }),
    );
    (rows(panel, "conditions")[1] as HTMLElement).focus();
    status.update(model({ conditions: [problem("p", { href: "/p" })] }));
    expect(document.activeElement).toBe(panel.querySelector('[data-cp-status="conditions"] h3'));
    (rows(panel, "conditions")[0] as HTMLElement).focus();
    status.update(model({}));
    expect(document.activeElement).toBe(panel.querySelector("h2"));
  });

  it("keeps focus on Stop when its row turns Stopping…", async () => {
    const { panel, status } = mount();
    panel.showPopover();
    status.update(
      model({ work: [job("a", { stop: { run: () => new Promise<void>(() => undefined) } })] }),
    );
    const stop = stopButton(panel, "a");
    stop.focus();
    stop.click();
    await vi.waitFor(() => {
      expect(stop.firstChild?.textContent).toBe("Stopping…");
    });
    expect(document.activeElement).toBe(stop);
  });
});

describe("the urgent banner", () => {
  const exposed = (extra: Partial<StatusCondition> = {}): StatusCondition =>
    problem("exposed", {
      urgent: true,
      title: "This app can be reached from the internet",
      reasons: ["It answers on a public address.", "Sign-in by password is on."],
      since: Date.now() - 7_200_000,
      seen: Date.now() - 2_400_000,
      href: "/settings/access",
      docs: { href: "/docs/access", label: "How to limit access" },
      ...extra,
    });
  const banners = (banner: HTMLElement) => [...banner.querySelectorAll<HTMLElement>(".cp-notice")];

  it("stands each urgent condition as a danger banner: heading, reasons, last seen, one link", () => {
    const { banner, status } = mount();
    expect(banner.hidden).toBe(true);
    status.update(model({ conditions: [warning("w"), problem("p"), exposed()] }));
    expect(banner.hidden).toBe(false);
    const [one, ...rest] = banners(banner) as [HTMLElement];
    expect(rest).toEqual([]);
    expect(one.dataset["variant"]).toBe("banner");
    expect(one.dataset["tone"]).toBe("danger");
    expect(one.hasAttribute("role")).toBe(false);
    expect(one.querySelector(":scope > strong")?.textContent).toBe(
      "This app can be reached from the internet",
    );
    expect(one.querySelector(':scope > strong > .cp-icon[data-cp-icon="circle-x"]')).not.toBeNull();
    expect([...one.querySelectorAll(":scope > ul > li")].map((li) => li.textContent)).toEqual([
      "It answers on a public address.",
      "Sign-in by password is on.",
    ]);
    const foot = one.querySelector(":scope > small") as HTMLElement;
    expect(foot.textContent).toMatch(/^Last seen 40 minutes ago.* How to limit access$/);
    expect([...foot.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/docs/access",
    ]);
    const cs = getComputedStyle(one);
    expect(cs.display).toBe("grid");
  });

  it("links a banner with no docs to the condition's fix, and leaves out a foot with nothing in it", () => {
    const { banner, status } = mount({ words: { seen: () => "Seen" } });
    status.update(
      model({
        conditions: [
          problem("a", {
            urgent: true,
            title: "Store full",
            reasons: [],
            since: Date.now() - 60_000,
            seen: Date.now() - 2_400_000,
            href: "/settings/access",
          }),
          problem("b", { urgent: true, title: "Sign-in is off", since: Date.now() }),
        ],
      }),
    );
    const [a, b] = banners(banner) as [HTMLElement, HTMLElement];
    expect(a.querySelector(":scope > .cp-icon")).not.toBeNull();
    expect(a.querySelector(":scope > span > strong")?.textContent).toBe("Store full");
    expect(a.querySelector("ul")).toBeNull();
    const foot = a.querySelector(":scope > span > small") as HTMLElement;
    expect(foot.textContent).toMatch(/^Seen 40 minutes ago.* Details and fix$/);
    expect(foot.querySelector("a")?.getAttribute("href")).toBe("/settings/access");
    expect(b.querySelector("small")).toBeNull();
    expect(b.textContent).toBe("Sign-in is off");
  });

  it("orders banners as the panel does and patches them in place, hiding the place once none holds", () => {
    const { banner, status } = mount();
    const app = document.createElement("div");
    app.className = "cp-notice";
    app.textContent = "Reload to use the new version.";
    banner.after(app);
    const older = exposed({ id: "older", title: "Store full", since: Date.now() - 9_000_000 });
    status.update(model({ conditions: [exposed(), older] }));
    const [first, second] = banners(banner) as [HTMLElement, HTMLElement];
    expect(first.dataset["cpKey"]).toBe("older");
    expect(second.dataset["cpKey"]).toBe("exposed");
    status.update(
      model({ conditions: [exposed({ reasons: ["It answers on a public address."] }), older] }),
    );
    expect(banners(banner)[1]).toBe(second);
    expect(second.querySelectorAll("li")).toHaveLength(1);
    status.update(model({ conditions: [older] }));
    expect(banners(banner)).toEqual([first]);
    status.update(model({ conditions: [problem("p")] }));
    expect(banners(banner)).toEqual([]);
    expect(banner.hidden).toBe(true);
    expect(app.isConnected).toBe(true);
    expect(app.textContent).toBe("Reload to use the new version.");
  });

  it("writes no banner when the app gives no place for it", () => {
    const { banner, button, status } = mount(undefined, { withBanner: false });
    status.update(model({ conditions: [exposed()] }));
    expect(words(button)).toBe("This app can be reached from the internet");
    expect(banner.childElementCount).toBe(0);
    expect(banner.hidden).toBe(false);
  });
});
