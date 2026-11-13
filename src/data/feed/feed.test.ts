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

function block(size: string): HTMLDivElement {
  const div = document.createElement("div");
  div.style.blockSize = size;
  return div;
}

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

  it("keeps in place the first entry below the scroller's start padding, as under a sticky header", async () => {
    const c = conversation();
    c.box.style.scrollPaddingBlockStart = "160px";
    enhance(c);
    await settle();
    await scrollTo(c.box, 300);
    const top = c.box.getBoundingClientRect().top;
    const kids = [...c.feed.children];
    const under = kids.find((el) => el.getBoundingClientRect().bottom > top) as Element;
    const seen = kids.find((el) => el.getBoundingClientRect().bottom > top + 160) as Element;
    expect(seen).not.toBe(under);
    const before = seen.getBoundingClientRect().top;
    under.append(block("3rem"));
    await settle();
    expect(Math.abs(seen.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
  });

  it("opens a feed loaded from skeletons at its newest, and counts nothing a later load adds", async () => {
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
    expect(c.box.scrollTop).toBe(0);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("moves no one when the feed is marked busy and settles with no entry added", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    c.feed.setAttribute("aria-busy", "true");
    await settle();
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    await scrollTo(c.box, 200);
    c.feed.setAttribute("aria-busy", "true");
    await settle();
    expect(c.box.scrollTop).toBe(200);
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(c.box.scrollTop).toBe(200);
  });

  it("counts nothing a load adds when the feed is marked busy and cleared in one task", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    c.feed.setAttribute("aria-busy", "true");
    c.feed.append(entry(), entry());
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(c.box.scrollTop).toBe(200);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
    expect(polite()).not.toContain("new message");
  });

  it("keeps a reader at the end there through a load that spans tasks, counting nothing", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    c.feed.setAttribute("aria-busy", "true");
    await settle();
    c.feed.append(entry(), entry(), entry());
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("keeps a reader at the end there through a load set and cleared in one task", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    c.feed.setAttribute("aria-busy", "true");
    c.feed.append(entry(), entry(), entry());
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("keeps the place and counts nothing when the entries are replaced whole", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    c.feed.replaceChildren(...Array.from({ length: 30 }, () => entry()));
    await settle();
    expect(c.box.scrollTop).toBe(200);
    expect(feed.unseen).toBe(0);
    expect(c.jump.hidden).toBe(true);
  });

  it("follows the person's own entry appended while a load is under way", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.setAttribute("aria-busy", "true");
    await settle();
    c.feed.append(entry({ "data-own": "" }));
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(feed.unseen).toBe(0);
  });

  it("keeps the reader on the same entry through a busy load of older entries, counting nothing", async () => {
    const c = conversation();
    const feed = enhance(c);
    await settle();
    await scrollTo(c.box, 300);
    const top = c.box.getBoundingClientRect().top;
    const on = [...c.feed.children].find(
      (el) => el.getBoundingClientRect().bottom > top,
    ) as Element;
    const before = on.getBoundingClientRect().top;
    c.feed.setAttribute("aria-busy", "true");
    const skeletons = Array.from({ length: 3 }, () => entry({ "data-skeleton": "" }));
    c.feed.prepend(...skeletons);
    await settle();
    expect(Math.abs(on.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
    for (const s of skeletons) {
      s.remove();
    }
    c.feed.prepend(...Array.from({ length: 5 }, () => entry()));
    c.feed.append(entry());
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(Math.abs(on.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
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

  it("keeps the foot's height as the feed's --cp-feed-foot-size", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    const size = () => c.feed.style.getPropertyValue("--cp-feed-foot-size");
    expect(size()).toBe(`${String(c.foot.offsetHeight)}px`);
    c.foot.append(block("5rem"));
    await settle();
    expect(size()).toBe(`${String(c.foot.offsetHeight)}px`);
    expect(c.box.style.scrollPaddingBlockEnd).toBe("");
  });

  it("lands an entry's link that Tab reaches below the view clear of the foot", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    (c.feed.querySelector("a") as HTMLAnchorElement).focus();
    for (let i = 0; i < 4; i += 1) {
      await userEvent.keyboard("{Tab}");
      await settle();
      const link = document.activeElement as HTMLElement;
      expect(c.feed.contains(link)).toBe(true);
      expect(link.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        c.foot.getBoundingClientRect().top + 1,
      );
    }
    expect(c.box.scrollTop).toBeGreaterThan(0);
  });

  it("lands the newest entry's link clear of the foot on Shift+Tab from the composer", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    (c.foot.querySelector("textarea") as HTMLTextAreaElement).focus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await settle();
    const link = c.feed.lastElementChild?.querySelector("a") as HTMLAnchorElement;
    expect(document.activeElement).toBe(link);
    expect(link.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      c.foot.getBoundingClientRect().top + 1,
    );
  });

  it("lands an entry's link that Tab reaches clear of the New messages button", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    expect(c.jump.hidden).toBe(false);
    (c.feed.querySelector("a") as HTMLAnchorElement).focus();
    for (let i = 0; i < 4; i += 1) {
      await userEvent.keyboard("{Tab}");
      await settle();
      const link = document.activeElement as HTMLElement;
      expect(c.feed.contains(link)).toBe(true);
      expect(link.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        c.jump.getBoundingClientRect().top + 1,
      );
    }
    expect(c.box.scrollTop).toBeGreaterThan(0);
  });

  // Thirty Tabs, each awaited until the page settles, take 1.5s alone and
  // near 6s in WebKit on a loaded machine.
  it(
    "lets a name that Tab reaches in an entry's popover reach the popover's end",
    { timeout: 15_000 },
    async () => {
      const c = conversation();
      enhance(c);
      await settle();
      const panel = document.createElement("div");
      panel.className = "cp-popover cp-feed-readers";
      panel.dataset["variant"] = "panel";
      panel.popover = "auto";
      // With no anchor to place it by. A shown position-area popover also
      // stops WebKit's page scroll anchoring, which a later test relies on.
      panel.style.positionArea = "none";
      panel.style.insetBlockStart = "0";
      panel.style.insetInlineStart = "0";
      const names = document.createElement("ul");
      for (let i = 0; i < 40; i += 1) {
        const a = document.createElement("a");
        a.href = `#reader-${String(i)}`;
        a.textContent = `Reader ${String(i + 1)}`;
        const li = document.createElement("li");
        li.append(a);
        names.append(li);
      }
      panel.append(names);
      c.feed.lastElementChild?.append(panel);
      panel.showPopover();
      await Promise.all(panel.getAnimations().map((a) => a.finished));
      const [first, second] = panel.querySelectorAll("a");
      const pitch =
        (second?.getBoundingClientRect().top ?? 0) - (first?.getBoundingClientRect().top ?? 0);
      first?.focus();
      // An engine scrolls a name into view only once it is not wholly in
      // view, so one a margin does not push up gets within a name of the end.
      const gaps: number[] = [];
      for (let i = 0; i < 30; i += 1) {
        await userEvent.keyboard("{Tab}");
        await settle();
        const end = panel.getBoundingClientRect().top + panel.clientTop + panel.clientHeight;
        gaps.push(end - (document.activeElement?.getBoundingClientRect().bottom ?? 0));
      }
      expect(document.activeElement?.textContent).toBe("Reader 31");
      expect(panel.scrollTop).toBeGreaterThan(0);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-1);
      expect(Math.min(...gaps)).toBeLessThan(pitch);
    },
  );

  it("keeps a reader who scrolled up in place while they type in the composer", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    await userEvent.click(c.foot.querySelector("textarea") as HTMLTextAreaElement);
    await settle();
    expect(c.box.scrollTop).toBe(200);
    await userEvent.keyboard("abc{Enter}def{Enter}ghi");
    await settle();
    expect(c.box.scrollTop).toBe(200);
  });

  it("keeps the place as the foot grows and shrinks, at the end and scrolled up", async () => {
    const c = conversation();
    enhance(c);
    await settle();
    const tall = block("5rem");
    c.foot.append(tall);
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    tall.remove();
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    await scrollTo(c.box, 200);
    c.foot.append(tall);
    await settle();
    expect(c.box.scrollTop).toBe(200);
    tall.remove();
    await settle();
    expect(c.box.scrollTop).toBe(200);
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

  it("measures what the keyboard covers from the scroller's inner edge, not its border", async () => {
    const keyboard = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      scale: number;
    };
    Object.assign(keyboard, { height: innerHeight - 200, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: keyboard, configurable: true });
    document.body.style.margin = "0";
    const c = conversation(30, `${String(innerHeight - 100)}px`);
    c.box.style.boxSizing = "border-box";
    c.box.style.borderBlockEnd = "40px solid";
    enhance(c);
    await settle();
    // The foot rests on the inner edge, innerHeight - 140; the keyboard
    // starts at innerHeight - 200.
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("60px");
    document.body.style.removeProperty("margin");
  });

  it("keeps a reader who scrolled up in place as the on-screen keyboard opens", async () => {
    const keyboard = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      scale: number;
    };
    Object.assign(keyboard, { height: innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: keyboard, configurable: true });
    document.body.style.margin = "0";
    const c = conversation(30, `${String(innerHeight)}px`);
    enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    keyboard.height = innerHeight - 200;
    keyboard.dispatchEvent(new Event("resize"));
    await settle();
    expect(c.foot.style.getPropertyValue("--cp-keyboard-inset")).toBe("200px");
    expect(c.box.scrollTop).toBe(200);
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
    await scrollTo(other, 100);
    c.feed.append(entry());
    await settle();
    expect(other.scrollTop).toBe(100);
    expect(feed.unseen).toBe(1);
  });

  it("keeps the entry a reader scrolled up to in place when its box stops scrolling", async () => {
    document.body.append(block("30vh"));
    const c = conversation();
    document.body.append(block("150vh"));
    enhance(c);
    await settle();
    await scrollTo(c.box, 200);
    const top = c.box.getBoundingClientRect().top;
    const seen = [...c.feed.children].find((el) => el.getBoundingClientRect().bottom > top);
    const at = seen?.getBoundingClientRect().top ?? Number.NaN;
    c.box.style.blockSize = "auto";
    await settle();
    expect(c.box.scrollHeight).toBeLessThanOrEqual(c.box.clientHeight);
    expect(Math.abs((seen?.getBoundingClientRect().top ?? 0) - at)).toBeLessThanOrEqual(1);
  });

  it("keeps a page-scrolled reader's entry in place when the feed's box starts to scroll", async () => {
    document.body.append(block("30vh"));
    const c = conversation(15, "auto");
    c.box.style.maxBlockSize = `${String(2 * innerHeight)}px`;
    document.body.append(block("150vh"));
    enhance(c);
    await settle();
    const seen = c.feed.children[3] as Element;
    const page = document.documentElement;
    await scrollTo(page, page.scrollTop + seen.getBoundingClientRect().top - 10);
    const at = seen.getBoundingClientRect().top;
    for (let i = 0; i < 30; i += 1) {
      c.feed.append(entry());
    }
    await settle();
    expect(c.box.scrollHeight).toBeGreaterThan(c.box.clientHeight);
    expect(c.box.scrollTop).toBe(0);
    expect(Math.abs(seen.getBoundingClientRect().top - at)).toBeLessThanOrEqual(1);
    expect(c.jump.hidden).toBe(false);
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

  it("never scrolls the page up to a short feed's end that already shows", async () => {
    document.body.append(block("40vh"));
    const c = conversation(2);
    document.body.append(block("150vh"));
    const feed = enhance(c);
    await settle();
    await scrollTo(document.documentElement, 150);
    c.feed.append(entry());
    await settle();
    expect(document.documentElement.scrollTop).toBe(150);
    c.foot.append(block("3rem"));
    await settle();
    expect(document.documentElement.scrollTop).toBe(150);
    feed.toNewest();
    await settle();
    expect(document.documentElement.scrollTop).toBe(150);
  });

  it("leaves the page alone when the reader scrolls it past a feed it scrolls", async () => {
    const c = conversation(60, "auto");
    c.box.style.overflowY = "visible";
    const after = block("150vh");
    document.body.append(after);
    enhance(c);
    await settle();
    await scrollTo(document.documentElement, document.documentElement.scrollHeight);
    // The engine's own scroll anchoring may move the page to keep what
    // shows in place; the feed moves nothing.
    const top = after.getBoundingClientRect().top;
    c.feed.append(entry());
    await settle();
    expect(Math.abs(after.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    c.foot.append(block("3rem"));
    await settle();
    expect(Math.abs(after.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("never moves the page around a feed that scrolls in its own box", async () => {
    document.body.append(block("60vh"));
    const c = conversation();
    document.body.append(block("150vh"));
    const feed = enhance(c);
    await settle();
    await scrollTo(document.documentElement, 120);
    c.feed.append(entry());
    await settle();
    c.feed.prepend(entry(), entry());
    c.foot.append(block("4rem"));
    await settle();
    await scrollTo(c.box, 100);
    c.feed.append(entry());
    c.feed.setAttribute("aria-busy", "true");
    c.feed.append(entry());
    c.feed.removeAttribute("aria-busy");
    await settle();
    expect(c.box.scrollTop).toBe(100);
    c.feed.append(entry({ "data-own": "" }));
    await settle();
    await userEvent.click(c.foot.querySelector("textarea") as HTMLTextAreaElement);
    await userEvent.keyboard("abc{Enter}def");
    feed.toNewest();
    await settle();
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    expect(document.documentElement.scrollTop).toBe(120);
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

  it("on toNewest() in the turn a hidden feed shows, scrolls its box and not the page", async () => {
    const above = document.createElement("div");
    above.style.blockSize = "50vh";
    document.body.append(above);
    const c = conversation();
    const below = document.createElement("div");
    below.style.blockSize = "150vh";
    document.body.append(below);
    c.box.hidden = true;
    const feed = enhance(c);
    await settle();
    c.box.hidden = false;
    feed.toNewest();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(gap(c.box)).toBeLessThanOrEqual(1);
    await settle();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(gap(c.box)).toBeLessThanOrEqual(1);
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
    const own = new AbortController();
    enhance(c, { signal: own.signal });
    await settle();
    await scrollTo(c.box, 0);
    c.feed.append(entry());
    await settle();
    await userEvent.click(c.jump);
    // Firefox runs a smooth scroll on for a few frames after an instant one,
    // which should end it (https://drafts.csswg.org/cssom-view/#perform-a-scroll),
    // so the press's scroll finishes before the reset.
    await expect.poll(() => gap(c.box)).toBeLessThanOrEqual(1);
    c.foot.style.setProperty("--cp-keyboard-inset", "10px");
    own.abort();
    expect(c.feed.style.getPropertyValue("--cp-feed-foot-size")).toBe("");
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
    expect(c.feed.style.getPropertyValue("--cp-feed-foot-size")).toBe("");
  });
});
