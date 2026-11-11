import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { rollText } from "../../core/roll/roll.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceFeed, type FeedOptions } from "./feed.js";

let life = new AbortController();
let sheet: HTMLLinkElement;
const viewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

// The stylesheet turns the engines' own scroll anchoring off in the feed, as
// an app's page does, so the tests link it.
beforeEach(async () => {
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
  installAnnouncer({ signal: life.signal });
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  if (viewport !== undefined) {
    Object.defineProperty(window, "visualViewport", viewport);
  }
  sheet.remove();
  document.documentElement.classList.remove("cp");
  document.body.replaceChildren();
  document.documentElement.scrollTop = 0;
});

let made = 0;
function entry(attrs: Record<string, string> = {}): HTMLLIElement {
  made += 1;
  const li = document.createElement("li");
  li.className = "cp-feed-entry";
  for (const [k, v] of Object.entries(attrs)) {
    li.setAttribute(k, v);
  }
  const header = document.createElement("header");
  const a = document.createElement("a");
  a.href = "#kiro";
  a.textContent = "data-own" in attrs ? "You" : "@kiro";
  header.append(a);
  const p = document.createElement("p");
  p.className = "cp-feed-text";
  p.textContent = `Message ${String(made)}`;
  li.append(header, p);
  return li;
}

interface Conversation {
  readonly box: HTMLDivElement;
  readonly feed: HTMLOListElement;
  readonly foot: HTMLDivElement;
  readonly jump: HTMLButtonElement;
}

// A detail 20rem tall that scrolls its feed of `n` entries over its foot.
function conversation(n = 30, height = "20rem"): Conversation {
  const box = document.createElement("div");
  box.style.blockSize = height;
  box.style.inlineSize = "30rem";
  box.style.overflowY = "auto";
  const feed = document.createElement("ol");
  feed.className = "cp-feed";
  feed.setAttribute("aria-label", "Messages");
  for (let i = 0; i < n; i += 1) {
    feed.append(entry());
  }
  const foot = document.createElement("div");
  foot.className = "cp-feed-foot";
  const jump = document.createElement("button");
  jump.type = "button";
  jump.className = "cp-button cp-feed-jump";
  jump.hidden = true;
  const area = document.createElement("textarea");
  area.className = "cp-input";
  area.setAttribute("aria-label", "Message");
  foot.append(jump, area);
  box.append(feed, foot);
  document.body.append(box);
  return { box, feed, foot, jump };
}

function enhance(c: Conversation, options: FeedOptions = {}) {
  return enhanceFeed(c.feed, { foot: c.foot, jump: c.jump, signal: life.signal, ...options });
}

/** Two frames: the observers and the scroll events have run. */
const settle = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const gap = (el: Element) => el.scrollHeight - el.scrollTop - el.clientHeight;
const scrollTo = async (el: Element, top: number) => {
  el.scrollTop = top;
  await settle();
};
const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

describe("enhanceFeed", () => {
  it("opens at the newest entry with the foot under it", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    const last = c.feed.lastElementChild as Element;
    expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      c.foot.getBoundingClientRect().top + 1,
    );
    expect(c.jump.hidden).toBe(true);
  });

  it("follows an arrival while the reader is at the end", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    c.feed.append(entry());
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(true);
    expect(feed.unseen).toBe(0);
  });

  it("keeps a reader who scrolled up in place and counts what arrives", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    c.feed.append(entry());
    await settle();
    expect(c.box.scrollTop).toBe(200);
    expect(c.jump.hidden).toBe(false);
    expect(c.jump.textContent).toBe("1 new message");
    await expect.poll(polite).toBe("1 new message");
    c.feed.append(entry());
    await settle();
    expect(c.box.scrollTop).toBe(200);
    expect(c.jump.textContent).toBe("2 new messages");
    expect(feed.unseen).toBe(2);
    await expect.poll(polite).toBe("2 new messages");
  });

  it("rolls the count in a jump that has a roll, in the app's words", async () => {
    const c = conversation();
    const host = document.createElement("span");
    host.className = "cp-roll";
    c.jump.append(host);
    enhance(c, { words: (n) => `${String(n)} nouveaux` });
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    expect(rollText(host)).toBe("1 nouveaux");
    c.feed.append(entry(), entry());
    await settle();
    expect(rollText(host)).toBe("3 nouveaux");
    expect(c.jump.contains(host)).toBe(true);
  });

  it("counts an arrival with its day separator as one entry", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    const day = document.createElement("li");
    day.className = "cp-feed-day";
    day.textContent = "Today";
    c.feed.append(day, entry());
    await settle();
    expect(feed.unseen).toBe(1);
  });

  it("scrolls to the newest when the person's own entry arrives", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    c.feed.append(entry({ "data-own": "" }));
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(true);
    expect(feed.unseen).toBe(0);
  });

  it("keeps the reader on the same entry when older ones are shown above", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 300);
    const top = c.box.getBoundingClientRect().top;
    const on = [...c.feed.children].find(
      (el) => el.getBoundingClientRect().bottom > top,
    ) as Element;
    const before = on.getBoundingClientRect().top;
    c.feed.prepend(...Array.from({ length: 5 }, () => entry()));
    await settle();
    expect(Math.abs(on.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("keeps the reader in place when an entry above grows", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 300);
    const top = c.box.getBoundingClientRect().top;
    const on = [...c.feed.children].find(
      (el) => el.getBoundingClientRect().bottom > top,
    ) as Element;
    const before = on.getBoundingClientRect().top;
    const p = c.feed.children[2]?.querySelector("p") as HTMLParagraphElement;
    p.style.blockSize = "10rem";
    await settle();
    expect(Math.abs(on.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
  });

  it("counts nothing while the feed is busy, and opens a loaded feed at its newest", async () => {
    const c = conversation(0);
    c.feed.setAttribute("aria-busy", "true");
    const skeleton = entry({ "data-skeleton": "" });
    c.feed.append(skeleton);
    const feed = enhance(c);
    await settle();
    c.feed.replaceChildren(...Array.from({ length: 30 }, () => entry()));
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("hides the jump once the reader scrolls to the end", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    expect(c.jump.hidden).toBe(false);
    await scrollTo(c.box, c.box.scrollHeight);
    expect(c.jump.hidden).toBe(true);
    expect(feed.unseen).toBe(0);
  });

  it("scrolls to the newest on a press of the jump, hides it and focuses the newest entry", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry(), entry());
    await settle();
    await userEvent.click(c.jump);
    await expect.poll(() => gap(c.box)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(true);
    const newest = c.feed.lastElementChild as HTMLElement;
    expect(document.activeElement).toBe(newest);
    expect(newest.tabIndex).toBe(-1);
    // Arrivals during the smooth scroll follow it to the end.
    c.feed.append(entry());
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(true);
  });

  it("moves focus to the newest entry when the focused jump hides", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    c.jump.focus();
    await scrollTo(c.box, c.box.scrollHeight);
    expect(c.jump.hidden).toBe(true);
    expect(document.activeElement).toBe(c.feed.lastElementChild);
  });

  it("keeps the scroller's end scroll padding at the foot's height", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    expect(c.box.style.scrollPaddingBlockEnd).toBe(`${String(c.foot.offsetHeight)}px`);
    const tall = document.createElement("div");
    tall.style.blockSize = "5rem";
    c.foot.append(tall);
    await settle();
    expect(c.box.style.scrollPaddingBlockEnd).toBe(`${String(c.foot.offsetHeight)}px`);
    expect(gap(c.box)).toBeLessThanOrEqual(1);
  });

  it("raises the foot's controls by the part the on-screen keyboard covers", async () => {
    const keyboard = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      scale: number;
    };
    Object.assign(keyboard, { height: innerHeight - 200, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: keyboard, configurable: true });
    document.body.style.margin = "0";
    const c = conversation(30, `${String(innerHeight)}px`);
    enhance(c);
    await settle();
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("200px");
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    keyboard.height = innerHeight;
    keyboard.dispatchEvent(new Event("resize"));
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("");
    // A pinch zoom shrinks the visual viewport too, and is not a keyboard.
    Object.assign(keyboard, { height: innerHeight / 2, scale: 2 });
    keyboard.dispatchEvent(new Event("resize"));
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("");
    document.body.style.removeProperty("margin");
  });

  it("follows the feed into another scroller", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    const other = document.createElement("div");
    other.style.blockSize = "25rem";
    other.style.inlineSize = "36rem";
    other.style.overflowY = "auto";
    document.body.append(other);
    other.append(c.feed, c.foot);
    await settle();
    expect(gap(other)).toBeLessThanOrEqual(1);
    expect(other.style.scrollPaddingBlockEnd).toBe(`${String(c.foot.offsetHeight)}px`);
    expect(c.box.style.scrollPaddingBlockEnd).toBe("");
    await scrollTo(other, 100);
    c.feed.append(entry());
    await settle();
    expect(other.scrollTop).toBe(100);
    expect(feed.unseen).toBe(1);
  });

  it("uses the page as the scroller when no box around the feed scrolls", async () => {
    const c = conversation(60, "auto");
    c.box.style.overflowY = "visible";
    enhance(c);
    await settle();
    expect(gap(document.documentElement)).toBeLessThanOrEqual(1);
    await scrollTo(document.documentElement, 0);
    c.feed.append(entry());
    await settle();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(c.jump.hidden).toBe(false);
  });

  it("on the page, ends at the foot's place under the feed, not at the page's end", async () => {
    const c = conversation(60, "auto");
    c.box.style.overflowY = "visible";
    const after = document.createElement("div");
    after.style.blockSize = "150vh";
    document.body.append(after);
    enhance(c);
    await settle();
    const end = c.feed.getBoundingClientRect().bottom + c.foot.offsetHeight;
    expect(Math.abs(end - innerHeight)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(true);
    await scrollTo(document.documentElement, 0);
    c.feed.append(entry());
    await settle();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(c.jump.hidden).toBe(false);
  });

  it("leaves the page alone while the feed is hidden, and opens at the newest once shown", async () => {
    const tall = document.createElement("div");
    tall.style.blockSize = "150vh";
    document.body.append(tall);
    const c = conversation();
    c.box.hidden = true;
    enhance(c);
    await settle();
    expect(document.documentElement.scrollTop).toBe(0);
    c.box.hidden = false;
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("scrolls to the newest on toNewest()", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    feed.toNewest();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("puts everything back on abort and stops following", async () => {
    const c = conversation();
    c.box.style.scrollPaddingBlockEnd = "1px";
    const own = new AbortController();
    enhance(c, { signal: own.signal });
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    await userEvent.click(c.jump);
    c.foot.style.setProperty("--cp-keyboard-inset", "10px");
    own.abort();
    expect(c.box.style.scrollPaddingBlockEnd).toBe("1px");
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("");
    expect(c.feed.lastElementChild?.hasAttribute("tabindex")).toBe(false);
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    expect(c.box.scrollTop).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("does nothing with a signal that has already aborted", async () => {
    const c = conversation();
    const feed = enhanceFeed(c.feed, { foot: c.foot, jump: c.jump, signal: AbortSignal.abort() });
    await settle();
    expect(c.box.scrollTop).toBe(0);
    feed.toNewest();
    expect(c.box.scrollTop).toBe(0);
    expect(c.box.style.scrollPaddingBlockEnd).toBe("");
  });
});
