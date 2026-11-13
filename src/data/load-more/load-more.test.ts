import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { rollText } from "../../core/roll/roll.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceFeed } from "../feed/feed.js";
import { enhanceLoadMore, type LoadMoreOptions, type LoadMorePage } from "./load-more.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The spinner and the feed's scroll anchoring live in the stylesheet, so
// the tests link it, as an app's page does.
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

let made = 0;
function row(title = `Row ${String(++made)}`): HTMLLIElement {
  const link = document.createElement("a");
  link.href = `#${title.replaceAll(" ", "-")}`;
  link.textContent = title;
  const stack = document.createElement("span");
  stack.className = "cp-cell-stack";
  stack.append(link);
  const div = document.createElement("div");
  div.className = "cp-list-row";
  div.append(stack);
  const li = document.createElement("li");
  li.append(div);
  return li;
}

function moreButton(words = "Show older"): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.dataset["size"] = "sm";
  button.type = "button";
  button.textContent = words;
  return button;
}

/** A list of `n` rows and a foot holding its button. */
function footed(n = 3): { readonly ul: HTMLUListElement; readonly button: HTMLButtonElement } {
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  for (let i = 0; i < n; i += 1) {
    ul.append(row());
  }
  const button = moreButton();
  const foot = document.createElement("li");
  foot.className = "cp-list-foot";
  foot.append(button);
  ul.append(foot);
  document.body.append(ul);
  return { ul, button };
}

function enhance(button: HTMLButtonElement, options: LoadMoreOptions): void {
  enhanceLoadMore(button, { signal: life.signal, ...options });
}

const page = (items: Element[], more = true, label?: string): LoadMorePage =>
  label === undefined ? { items, more } : { items, more, label };

const words = (b: HTMLButtonElement) => rollText(b.querySelector(".cp-roll") as HTMLElement);
const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;
const press = (b: HTMLButtonElement) => {
  b.focus();
  b.click();
};

describe("enhanceLoadMore", () => {
  it("adds a page before the foot, focuses its first row's link and says how many came", async () => {
    const { ul, button } = footed();
    const fresh = [row("Older 1"), row("Older 2"), row("Older 3")];
    enhance(button, { load: () => Promise.resolve(page(fresh)) });
    press(button);
    await expect.poll(() => document.activeElement?.textContent).toBe("Older 1");
    expect([...ul.children].slice(3, 6)).toEqual(fresh);
    expect(ul.lastElementChild?.classList.contains("cp-list-foot")).toBe(true);
    expect(document.activeElement).toBe(fresh[0]?.querySelector("a"));
    await expect.poll(polite).toBe("3 more rows");
    expect(words(button)).toBe("Show older");
  });

  it("turns busy with its busy words while a page loads, then rests", async () => {
    const { button } = footed();
    const wait = Promise.withResolvers<LoadMorePage>();
    enhance(button, { load: () => wait.promise, words: { busy: "Loading older posts…" } });
    press(button);
    await expect.poll(() => button.getAttribute("aria-busy")).toBe("true");
    expect(words(button)).toBe("Loading older posts…");
    wait.resolve(page([row()]));
    await expect.poll(() => button.hasAttribute("aria-busy")).toBe(false);
    await expect.poll(() => words(button)).toBe("Show older");
  });

  it("takes a page's words, and leaves with its foot once no page is left", async () => {
    const { ul, button } = footed();
    const pages = [page([row()], true, "Show the last 2"), page([row("Last 1"), row()], false)];
    enhance(button, { load: () => Promise.resolve(pages.shift() ?? page([], false)) });
    press(button);
    await expect.poll(() => words(button)).toBe("Show the last 2");
    press(button);
    await expect.poll(() => ul.querySelector(".cp-list-foot")).toBeNull();
    expect(ul.children).toHaveLength(6);
    expect(document.activeElement?.textContent).toBe("Last 1");
  });

  it("moves focus to the last row when an empty last page takes the button away", async () => {
    const { ul, button } = footed();
    enhance(button, { load: () => Promise.resolve(page([], false)) });
    press(button);
    await expect.poll(() => button.isConnected).toBe(false);
    expect(document.activeElement).toBe(ul.children[2]?.querySelector("a"));
    expect(polite()).toBe("");
  });

  it("says a page that failed, reads Retry, and takes its words back once a retry loads", async () => {
    const { ul, button } = footed();
    let calls = 0;
    enhance(button, {
      load: () =>
        ++calls === 1
          ? Promise.reject(new Error("The server did not answer."))
          : Promise.resolve(page([row("Older 1")])),
    });
    press(button);
    await expect.poll(polite).toBe("The next page did not load.");
    await expect.poll(() => words(button)).toBe("Retry");
    expect(ul.children).toHaveLength(4);
    expect(document.activeElement).toBe(button);
    press(button);
    await expect.poll(() => words(button)).toBe("Show older");
    expect(ul.children[3]?.textContent).toBe("Older 1");
  });

  it("takes the app's words for the count, the failure and the retry", async () => {
    const { button } = footed();
    let calls = 0;
    enhance(button, {
      load: () =>
        ++calls === 1 ? Promise.reject(new Error("no")) : Promise.resolve(page([row(), row()])),
      words: {
        count: (n) => `${String(n)} older posts`,
        failed: "The older posts did not load.",
        retry: "Try again",
      },
    });
    press(button);
    await expect.poll(polite).toBe("The older posts did not load.");
    await expect.poll(() => words(button)).toBe("Try again");
    press(button);
    await expect.poll(polite).toBe("2 older posts");
  });

  it("loads once for presses while a page loads", async () => {
    const { button } = footed();
    const wait = Promise.withResolvers<LoadMorePage>();
    let calls = 0;
    enhance(button, {
      load: () => {
        calls += 1;
        return wait.promise;
      },
    });
    press(button);
    press(button);
    press(button);
    wait.resolve(page([row()]));
    await expect.poll(() => button.hasAttribute("data-cp-state")).toBe(false);
    expect(calls).toBe(1);
  });

  it("leaves focus where the reader moved it while the page loaded", async () => {
    const { ul, button } = footed();
    const elsewhere = document.createElement("input");
    document.body.append(elsewhere);
    const wait = Promise.withResolvers<LoadMorePage>();
    enhance(button, { load: () => wait.promise });
    press(button);
    elsewhere.focus();
    wait.resolve(page([row()]));
    await expect.poll(() => ul.children.length).toBe(5);
    await expect.poll(polite).toBe("1 more row");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps a row the load already put in the list where it is, and focuses it", async () => {
    const { ul, button } = footed();
    const placed = row("Placed");
    enhance(button, {
      load: () => {
        ul.children[1]?.after(placed);
        return Promise.resolve(page([placed]));
      },
    });
    press(button);
    await expect.poll(() => document.activeElement?.textContent).toBe("Placed");
    expect(ul.children[2]).toBe(placed);
    await expect.poll(polite).toBe("1 more row");
  });

  it("adds a group after the groups its foot follows, counting its rows and focusing its heading", async () => {
    const groups = document.createElement("div");
    const first = document.createElement("ol");
    first.className = "cp-list";
    first.append(row());
    groups.append(first);
    const button = moreButton("Load older");
    const foot = document.createElement("div");
    foot.className = "cp-list-foot";
    foot.append(button);
    document.body.append(groups, foot);
    const heading = document.createElement("h3");
    heading.className = "cp-list-heading";
    heading.textContent = "Last week";
    const week = document.createElement("ol");
    week.className = "cp-list";
    week.append(row(), row());
    enhance(button, { load: () => Promise.resolve(page([heading, week], false)) });
    press(button);
    await expect.poll(() => document.activeElement).toBe(heading);
    expect([...groups.children]).toEqual([first, heading, week]);
    expect(heading.tabIndex).toBe(-1);
    expect(foot.isConnected).toBe(false);
    await expect.poll(polite).toBe("2 more rows");
  });

  it("at a feed's start puts older entries first, and focuses the oldest, which stays in view", async () => {
    const box = document.createElement("div");
    box.style.blockSize = "16rem";
    box.style.inlineSize = "30rem";
    box.style.overflowY = "auto";
    const head = document.createElement("div");
    head.className = "cp-feed-head";
    const button = moreButton();
    head.append(button);
    const feed = document.createElement("ol");
    feed.className = "cp-feed";
    const entry = (text: string): HTMLLIElement => {
      const li = document.createElement("li");
      li.className = "cp-feed-entry";
      li.style.blockSize = "5rem";
      li.textContent = text;
      return li;
    };
    for (let i = 0; i < 8; i += 1) {
      feed.append(entry(`Now ${String(i)}`));
    }
    box.append(head, feed);
    document.body.append(box);
    enhanceFeed(feed, { signal: life.signal });
    box.scrollTop = 0;
    await expect.poll(() => box.scrollTop).toBe(0);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const day = document.createElement("li");
    day.className = "cp-feed-day";
    const older = [entry("Old 0"), entry("Old 1"), entry("Old 2"), entry("Old 3")];
    enhance(button, { edge: "start", load: () => Promise.resolve(page([day, ...older])) });
    press(button);
    await expect.poll(() => document.activeElement).toBe(older[0]);
    expect([...feed.children].slice(0, 5)).toEqual([day, ...older]);
    await expect.poll(polite).toBe("4 older messages");
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const seen = box.getBoundingClientRect();
      const at = (older[0] as HTMLElement).getBoundingClientRect();
      expect(at.top).toBeGreaterThanOrEqual(seen.top - 1);
      expect(at.bottom).toBeLessThanOrEqual(seen.bottom + 1);
    }
  });

  it("throws a TypeError for a button in no list's foot or feed's head", () => {
    const button = moreButton();
    document.body.append(button);
    expect(() => {
      enhance(button, { load: () => Promise.resolve(page([])) });
    }).toThrow(TypeError);
    expect(() => {
      enhance(button, { edge: "start", load: () => Promise.resolve(page([])) });
    }).toThrow(TypeError);
  });

  it("drops a page that comes after its signal aborts, its load told to stop, and rests", async () => {
    const { ul, button } = footed();
    const stop = new AbortController();
    const wait = Promise.withResolvers<LoadMorePage>();
    let told: AbortSignal | undefined;
    enhanceLoadMore(button, {
      signal: stop.signal,
      load: (signal) => {
        told = signal;
        return wait.promise;
      },
    });
    press(button);
    await expect.poll(() => button.getAttribute("aria-busy")).toBe("true");
    stop.abort();
    expect(told?.aborted).toBe(true);
    wait.resolve(page([row()]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ul.children).toHaveLength(4);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(words(button)).toBe("Show older");
  });

  it("gives a plain button its words' window and a spinner the stylesheet draws", () => {
    const { button } = footed();
    enhance(button, { load: () => Promise.resolve(page([])) });
    const spin = button.querySelector<HTMLElement>(':scope > .cp-icon[data-part="busy"]');
    expect(button.querySelector(":scope > .cp-roll")?.textContent).toBe("Show older");
    expect(spin?.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(spin as HTMLElement).getPropertyValue("--cp-icon-image")).toMatch(
      /^url\(/,
    );
    expect(getComputedStyle(spin as HTMLElement).display).toBe("none");
  });
});
