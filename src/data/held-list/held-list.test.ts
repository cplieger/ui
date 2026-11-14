import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { rollText } from "../../core/roll/roll.js";
import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceKeyedList } from "../keyed-list/keyed-list.js";
import { enhanceHeldList, type HeldListOptions } from "./held-list.js";

let life = new AbortController();
let sheet: HTMLLinkElement;
let away: HTMLDivElement;
const viewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

// The line's rules live in the stylesheet, so the tests link it, as an
// app's page does, once for the file.
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

beforeEach(async () => {
  installAnnouncer({ signal: life.signal });
  // Somewhere for the pointer to rest that no list reaches.
  away = document.createElement("div");
  away.style.position = "fixed";
  away.style.insetBlockEnd = "0";
  away.style.insetInlineEnd = "0";
  away.style.inlineSize = "2rem";
  away.style.blockSize = "2rem";
  document.body.append(away);
  await userEvent.hover(away);
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  if (viewport !== undefined) {
    Object.defineProperty(window, "visualViewport", viewport);
  }
  document.body.replaceChildren();
  document.documentElement.scrollTop = 0;
});

let made = 0;
function item(title = `Row ${String(++made)}`): HTMLLIElement {
  const link = document.createElement("a");
  link.href = `#${title.replaceAll(" ", "-")}`;
  link.textContent = title;
  const small = document.createElement("small");
  small.textContent = "Checked 4 minutes ago";
  const stack = document.createElement("span");
  stack.className = "cp-cell-stack";
  stack.append(link, small);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(stack);
  const li = document.createElement("li");
  li.append(row);
  return li;
}

/** A row with nothing in it that takes focus. */
function plain(title = `Row ${String(++made)}`): HTMLLIElement {
  const stack = document.createElement("span");
  stack.className = "cp-cell-stack";
  stack.textContent = title;
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(stack);
  const li = document.createElement("li");
  li.append(row);
  return li;
}

function list(n = 5, host: Element = document.body): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  ul.setAttribute("aria-label", "Activity");
  for (let i = 0; i < n; i += 1) {
    ul.append(item());
  }
  host.append(ul);
  return ul;
}

/** A box 12rem tall that scrolls a 4rem block and then `n` rows. */
function scrolling(n = 30): { readonly box: HTMLDivElement; readonly ul: HTMLUListElement } {
  const box = document.createElement("div");
  box.style.blockSize = "12rem";
  box.style.inlineSize = "24rem";
  box.style.overflowY = "auto";
  const head = document.createElement("div");
  head.style.blockSize = "4rem";
  box.append(head);
  document.body.prepend(box);
  return { box, ul: list(n, box) };
}

function enhance(ul: HTMLUListElement | HTMLTableSectionElement, options: HeldListOptions = {}) {
  return enhanceHeldList(ul, { signal: life.signal, ...options });
}

const line = () => document.querySelector<HTMLElement>(".cp-list-pending");
const showButton = () => line()?.querySelector("button") ?? null;
const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

/** Two frames: layout, scroll anchoring and scroll events have run. */
const settle = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

// WebKit under load can commit a scroll write a pixel from where it was
// put, after the frame; the engine's own anchoring adding to the module's
// correction would move the row by the line's whole height.
const drift = (row: Element, was: number) => Math.abs(row.getBoundingClientRect().top - was);

/** The first row whose bottom is below `top`, the one the reader sees there. */
function rowAt(ul: Element, top: number): Element {
  const row = [...ul.children].find((li) => li.getBoundingClientRect().bottom > top + 1);
  if (row === undefined) {
    throw new Error("no row in view");
  }
  return row;
}

describe("enhanceHeldList", () => {
  it("runs a change at once while the reader is not in the list", () => {
    const ul = list();
    const held = enhance(ul);
    const fresh = item("Fresh");
    held.change(() => {
      ul.prepend(fresh);
    });
    expect(ul.firstElementChild).toBe(fresh);
    expect(line()).toBeNull();
    expect(held.held).toBe(0);
  });

  it("holds a change while focus is in the list, and offers it before the list", () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    const fresh = item("Fresh");
    held.change(() => {
      ul.prepend(fresh);
      return [fresh];
    }, 3);
    expect(fresh.isConnected).toBe(false);
    expect(held.held).toBe(3);
    const offer = line();
    expect(offer?.nextElementSibling).toBe(ul);
    const words = offer?.querySelector("span");
    expect(words?.textContent).toBe("3 newer rows");
    const show = showButton();
    expect(show?.textContent).toBe("Show");
    expect(show?.type).toBe("button");
    expect(show?.getAttribute("aria-describedby")).toBe(words?.id);
  });

  it("holds a change while the pointer is over the list", async () => {
    const ul = list();
    const held = enhance(ul);
    await userEvent.hover(ul);
    let ran = false;
    held.change(() => {
      ran = true;
      return undefined;
    });
    expect(ran).toBe(false);
    expect(held.held).toBe(1);
  });

  it("holds a change once the view has scrolled past the list's start, and keeps its rows still", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul);
    box.scrollTop = 200;
    await settle();
    const top = box.getBoundingClientRect().top;
    const seen = rowAt(ul, top);
    const was = seen.getBoundingClientRect().top;
    held.change(() => undefined);
    expect(held.held).toBe(1);
    expect(line()?.nextElementSibling).toBe(ul);
    expect(seen.getBoundingClientRect().top).toBeCloseTo(was, 0);
    await settle();
    expect(drift(seen, was)).toBeLessThanOrEqual(1);
  });

  it("keeps the rows still when the page itself scrolls", async () => {
    const head = document.createElement("div");
    head.style.blockSize = "50vh";
    document.body.prepend(head);
    const ul = list(60);
    const held = enhance(ul);
    document.documentElement.scrollTop = ul.offsetTop + 300;
    await settle();
    const seen = rowAt(ul, 0);
    const was = seen.getBoundingClientRect().top;
    held.change(() => undefined);
    expect(held.held).toBe(1);
    expect(seen.getBoundingClientRect().top).toBeCloseTo(was, 0);
    await settle();
    expect(drift(seen, was)).toBeLessThanOrEqual(1);
  });

  it("counts the scroller's start padding as covered, as by a sticky header", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul);
    held.change(() => undefined);
    expect(held.held).toBe(0);
    box.style.scrollPaddingBlockStart = "5rem";
    await settle();
    held.change(() => undefined);
    expect(held.held).toBe(1);
  });

  it("holds a change once the page has scrolled past the start of the box that scrolls the list", async () => {
    const { box, ul } = scrolling();
    const tail = document.createElement("div");
    tail.style.blockSize = "150vh";
    document.body.append(tail);
    const held = enhance(ul);
    held.change(() => undefined);
    expect(held.held).toBe(0);
    document.documentElement.scrollTop = box.offsetTop + 96;
    await settle();
    expect(box.scrollTop).toBe(0);
    held.change(() => undefined);
    expect(held.held).toBe(1);
  });

  it("holds a change once a pinch zoom or the keyboard shows the page past the list's start", () => {
    const ul = list();
    const held = enhance(ul);
    held.change(() => undefined);
    expect(held.held).toBe(0);
    const top = ul.getBoundingClientRect().top;
    Object.defineProperty(window, "visualViewport", {
      value: { offsetTop: top + 20, height: 200 },
      configurable: true,
    });
    held.change(() => undefined);
    expect(held.held).toBe(1);
  });

  it("holds every later change once one is held, and Show runs them in order", async () => {
    const ul = list();
    const held = enhance(ul);
    const ran: string[] = [];
    ul.querySelector("a")?.focus();
    held.change(() => {
      ran.push("first");
      return undefined;
    });
    (document.activeElement as HTMLElement).blur();
    held.change(() => {
      ran.push("second");
      return undefined;
    }, 2);
    expect(ran).toEqual([]);
    expect(held.held).toBe(3);
    expect(line()?.querySelector("span")?.textContent).toBe("3 newer rows");
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(ran).toEqual(["first", "second"]);
    expect(line()).toBeNull();
    expect(held.held).toBe(0);
  });

  it("moves focus on Show to the first row placed, in the page's order", async () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    const lower = item("Lower");
    const upper = item("Upper");
    held.change(() => {
      ul.children[3]?.before(lower);
      return [lower];
    });
    held.change(() => {
      ul.prepend(upper);
      return [upper];
    });
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(document.activeElement).toBe(upper.querySelector("a"));
  });

  it("focuses a row with nothing in it that takes focus, which keeps a tabindex until it loses focus", async () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    const fresh = plain("Fresh");
    held.change(() => {
      ul.prepend(fresh);
      return [fresh];
    });
    await userEvent.click(showButton() as HTMLButtonElement);
    const row = fresh.querySelector(".cp-list-row") as HTMLElement;
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute("tabindex")).toBe("-1");
    ul.querySelector("a")?.focus();
    expect(row.hasAttribute("tabindex")).toBe(false);
  });

  it("passes over a disabled or unshown control to the row's first part that takes focus", async () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    const fresh = item("Fresh");
    const stack = fresh.querySelector(".cp-cell-stack") as HTMLElement;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.disabled = true;
    const gone = document.createElement("button");
    gone.hidden = true;
    const secret = document.createElement("input");
    secret.type = "hidden";
    stack.before(box, gone, secret);
    held.change(() => {
      ul.prepend(fresh);
      return [fresh];
    });
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(document.activeElement).toBe(fresh.querySelector("a"));
  });

  it("focuses a row that takes focus itself without a tabindex", async () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    const link = document.createElement("a");
    link.className = "cp-list-row";
    link.href = "#fresh";
    link.textContent = "Fresh";
    const fresh = document.createElement("li");
    fresh.append(link);
    held.change(() => {
      ul.prepend(fresh);
      return [fresh];
    });
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(document.activeElement).toBe(link);
    expect(link.hasAttribute("tabindex")).toBe(false);
  });

  it("moves focus to the list on Show when no row comes back", async () => {
    const ul = list();
    const held = enhance(ul);
    ul.querySelector("a")?.focus();
    held.change(() => undefined);
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(document.activeElement).toBe(ul);
  });

  it("says the count politely once it settles, not at each change", async () => {
    const ul = list();
    const held = enhance(ul, { settle: 50 });
    const heard: string[] = [];
    const region = document.querySelector('[aria-live="polite"]') as Element;
    const watch = new MutationObserver(() => {
      if (region.textContent !== "") {
        heard.push(region.textContent);
      }
    });
    watch.observe(region, { childList: true, characterData: true, subtree: true });
    ul.querySelector("a")?.focus();
    held.change(() => undefined);
    held.change(() => undefined);
    await expect.poll(polite).toBe("2 newer rows");
    watch.disconnect();
    expect(heard).toEqual(["2 newer rows"]);
  });

  it("takes the app's words for the count and the button", async () => {
    const ul = list();
    const held = enhance(ul, {
      settle: 0,
      words: {
        count: (n) => (n === 1 ? "1 row changed" : `${String(n)} rows changed`),
        show: "Afficher",
      },
    });
    ul.querySelector("a")?.focus();
    held.change(() => undefined);
    expect(line()?.querySelector("span")?.textContent).toBe("1 row changed");
    expect(showButton()?.textContent).toBe("Afficher");
    await expect.poll(polite).toBe("1 row changed");
  });

  it("puts the line before the element the app names", () => {
    const heading = document.createElement("h2");
    heading.textContent = "Activity";
    document.body.append(heading);
    const ul = list();
    const held = enhance(ul, { beside: heading });
    ul.querySelector("a")?.focus();
    held.change(() => undefined);
    expect(line()?.nextElementSibling).toBe(heading);
  });

  it("drops what is held on discard, and keeps focus off the page", async () => {
    const ul = list();
    const held = enhance(ul);
    let ran = false;
    ul.querySelector("a")?.focus();
    held.change(() => {
      ran = true;
      return undefined;
    });
    showButton()?.focus();
    held.discard();
    expect(line()).toBeNull();
    expect(held.held).toBe(0);
    expect(document.activeElement).toBe(ul);
    (document.activeElement as HTMLElement).blur();
    await userEvent.hover(away);
    held.change(() => {
      ran = true;
      return undefined;
    });
    expect(ran).toBe(true);
  });

  it("holds a table body's changes, offers them before its panel and focuses the row", async () => {
    const panel = document.createElement("div");
    panel.className = "cp-panel";
    const table = document.createElement("table");
    table.className = "cp-table";
    const body = document.createElement("tbody");
    for (let i = 0; i < 4; i += 1) {
      const link = document.createElement("a");
      link.href = `#copy-${String(i)}`;
      link.textContent = `Copy ${String(i)}`;
      const cell = document.createElement("td");
      cell.append(link);
      const row = document.createElement("tr");
      row.append(cell);
      body.append(row);
    }
    table.append(body);
    panel.append(table);
    document.body.append(panel);
    const held = enhance(body, {
      words: { count: (n) => (n === 1 ? "1 row changed" : `${String(n)} rows changed`) },
    });
    body.querySelector("a")?.focus();
    const moved = body.rows[3] as HTMLTableRowElement;
    held.change(() => {
      body.prepend(moved);
      return [moved];
    });
    expect(body.rows[3]).toBe(moved);
    expect(line()?.nextElementSibling).toBe(panel);
    expect(line()?.textContent).toContain("1 row changed");
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(body.rows[0]).toBe(moved);
    expect(document.activeElement).toBe(moved.querySelector("a"));
  });

  it("offers a table body's changes right above its table under a heading its panel holds", () => {
    const panel = document.createElement("section");
    panel.className = "cp-panel";
    const heading = document.createElement("h2");
    heading.textContent = "Library";
    const table = document.createElement("table");
    table.className = "cp-table";
    const body = table.createTBody();
    const link = document.createElement("a");
    link.href = "#copy";
    link.textContent = "Copy";
    body.insertRow().insertCell().append(link);
    panel.append(heading, table);
    document.body.append(panel);
    const held = enhance(body);
    link.focus();
    held.change(() => undefined);
    expect(line()?.parentElement).toBe(panel);
    expect(line()?.nextElementSibling).toBe(table);
  });

  it("drops the line on abort, and runs a later change at once", () => {
    const ul = list();
    const own = new AbortController();
    const held = enhanceHeldList(ul, { signal: own.signal });
    ul.querySelector("a")?.focus();
    held.change(() => undefined);
    own.abort();
    expect(line()).toBeNull();
    let ran = false;
    held.change(() => {
      ran = true;
      return undefined;
    });
    expect(ran).toBe(true);
  });

  it("holds behind the host's own button at the start edge, and its press puts the rows in", async () => {
    const ul = list();
    const jump = hostJump();
    const held = enhance(ul, { jump });
    expect(jump.hidden).toBe(true);
    ul.querySelector("a")?.focus();
    const fresh = item("Fresh");
    held.change(() => {
      ul.prepend(fresh);
      return [fresh];
    }, 2);
    expect(line()).toBeNull();
    expect(jump.hidden).toBe(false);
    expect(jump.textContent).toBe("2 newer rows");
    await userEvent.click(jump);
    expect(ul.firstElementChild).toBe(fresh);
    expect(jump.hidden).toBe(true);
    expect(document.activeElement).toBe(fresh.querySelector("a"));
  });
});

/** A hidden button after the body, as a host's own offer. */
function hostJump(roll = false): HTMLButtonElement {
  const jump = document.createElement("button");
  jump.type = "button";
  jump.className = "cp-button";
  jump.hidden = true;
  if (roll) {
    const host = document.createElement("span");
    host.className = "cp-roll";
    jump.append(host);
  }
  document.body.append(jump);
  return jump;
}

/** Appends a row to `ul` and returns it, as an end edge's change does. */
const grow = (ul: HTMLUListElement, title?: string) => () => {
  const li = item(title);
  ul.append(li);
  return [li];
};

/** How far `row`'s end is below `box`'s, in px. */
const past = (row: Element, box: Element) =>
  row.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;

const scrollTo = async (el: Element, top: number) => {
  el.scrollTop = top;
  await settle();
};
/** A smooth scroll's length depends on the engine and the host's load, so a
 *  test waits for it to end rather than polling within a time bound. */
const scrollEnd = (el: Element) =>
  new Promise<void>((resolve) => {
    el.addEventListener("scrollend", () => resolve(), { once: true });
  });

describe("enhanceHeldList at the end edge", () => {
  it("puts a change in at once and counts nothing while the reader sees its row", () => {
    const ul = list(3);
    const held = enhance(ul, { edge: "end" });
    held.change(grow(ul, "Fresh"));
    expect(ul.lastElementChild?.textContent).toContain("Fresh");
    expect(held.held).toBe(0);
    expect(line()).toBeNull();
  });

  it("counts a row that goes in below the reader on a line pinned after the list", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul, { edge: "end", settle: 0 });
    held.change(grow(ul, "Fresh"));
    expect(ul.lastElementChild?.textContent).toContain("Fresh");
    expect(box.scrollTop).toBe(0);
    expect(held.held).toBe(1);
    const offer = line();
    expect(offer?.previousElementSibling).toBe(ul);
    expect(offer?.dataset["edge"]).toBe("end");
    expect(offer?.querySelector("span")?.textContent).toBe("1 newer row");
    expect(offer?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      box.getBoundingClientRect().bottom + 1,
    );
    held.change(grow(ul), 2);
    expect(held.held).toBe(3);
    expect(offer?.querySelector("span")?.textContent).toBe("3 newer rows");
    await expect.poll(polite).toBe("3 newer rows");
  });

  it("goes to the newest row on Show and moves focus to it", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul, { edge: "end" });
    held.change(grow(ul));
    const newest = grow(ul, "Newest")()[0] as HTMLLIElement;
    held.change(() => [newest]);
    const ended = scrollEnd(box);
    await userEvent.click(showButton() as HTMLButtonElement);
    expect(line()).toBeNull();
    expect(held.held).toBe(0);
    await ended;
    expect(past(newest, box)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(newest.querySelector("a"));
  });

  it("drops the count once the reader scrolls to the newest row, moving focus there from Show", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul, { edge: "end" });
    held.change(grow(ul, "Fresh"));
    await scrollTo(box, 100);
    expect(held.held).toBe(1);
    showButton()?.focus();
    await scrollTo(box, box.scrollHeight);
    expect(line()).toBeNull();
    expect(held.held).toBe(0);
    expect(document.activeElement).toBe(ul.lastElementChild?.querySelector("a"));
  });

  it("counts nothing that a change scrolls into view, as a host following the end does", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul, { edge: "end" });
    await scrollTo(box, box.scrollHeight);
    const follow = () => {
      const [li] = grow(ul)();
      box.scrollTop = box.scrollHeight;
      return li === undefined ? [] : [li];
    };
    held.change(follow);
    expect(held.held).toBe(0);
    // Under the end padding at the last position there is nothing to reach.
    box.style.scrollPaddingBlockEnd = "3rem";
    held.change(follow);
    expect(held.held).toBe(0);
  });

  it("counts a row its end scroll margin leaves under a pinned foot, as a feed's entries have", () => {
    const { box, ul } = scrolling();
    const foot = document.createElement("div");
    foot.style.position = "sticky";
    foot.style.insetBlockEnd = "0";
    foot.style.blockSize = "5rem";
    box.append(foot);
    const held = enhance(ul, { edge: "end" });
    // The new row's end at the box's end, under the foot.
    const under = (margin: string) => () => {
      const [li] = grow(ul)();
      li?.style.setProperty("scroll-margin-block-end", margin);
      box.scrollTop = box.scrollHeight - box.clientHeight - foot.offsetHeight;
      return li === undefined ? [] : [li];
    };
    held.change(under("0px"));
    expect(held.held).toBe(0);
    held.change(under("5rem"));
    expect(held.held).toBe(1);
    expect(line()?.previousElementSibling).toBe(ul);
  });

  it("follows a row that arrives during Show's scroll to the newest, counting it not", async () => {
    const { box, ul } = scrolling();
    const held = enhance(ul, { edge: "end" });
    held.change(grow(ul));
    const ended = scrollEnd(box);
    await userEvent.click(showButton() as HTMLButtonElement);
    const [late] = grow(ul, "Late")();
    held.change(() => (late === undefined ? [] : [late]));
    expect(held.held).toBe(0);
    expect(line()).toBeNull();
    await ended;
    // An engine may end the scroll the late row's replaced before its own.
    if (past(late as Element, box) > 1) {
      await scrollEnd(box);
    }
    expect(past(late as Element, box)).toBeLessThanOrEqual(1);
  });

  it("counts a row under the scroller's end padding, and pins the line above it", async () => {
    const { box, ul } = scrolling();
    box.style.scrollPaddingBlockEnd = "3rem";
    const tail = document.createElement("div");
    tail.style.blockSize = "4rem";
    box.append(tail);
    const held = enhance(ul, { edge: "end" });
    await scrollTo(box, box.scrollHeight);
    // The newest row's end 2rem above the box's end, under its 3rem padding.
    await scrollTo(box, box.scrollTop - 32);
    held.change(() => []);
    expect(held.held).toBe(1);
    const offer = line() as HTMLElement;
    expect(box.getBoundingClientRect().bottom - offer.getBoundingClientRect().bottom).toBeCloseTo(
      48,
      0,
    );
    const ended = scrollEnd(box);
    await userEvent.click(showButton() as HTMLButtonElement);
    const newest = ul.lastElementChild as Element;
    await ended;
    expect(Math.round(past(newest, box))).toBe(-48);
    expect(line()).toBeNull();
  });

  it("counts on the host's own button, rolling its words, and its press goes to the newest", async () => {
    const { box, ul } = scrolling();
    const jump = hostJump(true);
    const host = jump.querySelector(".cp-roll") as HTMLElement;
    const held = enhance(ul, {
      edge: "end",
      jump,
      words: { count: (n) => `${String(n)} nouvelles lignes` },
    });
    held.change(grow(ul));
    expect(line()).toBeNull();
    expect(jump.hidden).toBe(false);
    expect(rollText(host)).toBe("1 nouvelles lignes");
    const add = grow(ul, "Newest");
    let newest: Element | undefined;
    held.change(() => {
      [newest] = add();
      return newest === undefined ? [] : [newest];
    });
    expect(rollText(host)).toBe("2 nouvelles lignes");
    expect(jump.contains(host)).toBe(true);
    const ended = scrollEnd(box);
    await userEvent.click(jump);
    expect(jump.hidden).toBe(true);
    await ended;
    expect(past(newest as Element, box)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(newest?.querySelector("a"));
  });

  it("on abort hides the button, removes the tabindex it gave and counts no later change", async () => {
    const { box, ul } = scrolling();
    const own = new AbortController();
    const jump = hostJump();
    const held = enhanceHeldList(ul, { edge: "end", jump, signal: own.signal });
    held.change(() => {
      const li = plain();
      ul.append(li);
      return [li];
    });
    const ended = scrollEnd(box);
    await userEvent.click(jump);
    const row = document.activeElement as HTMLElement;
    expect(row.getAttribute("tabindex")).toBe("-1");
    await ended;
    expect(past(row, box)).toBeLessThanOrEqual(1);
    await settle();
    held.change(grow(ul));
    expect(jump.hidden).toBe(false);
    own.abort();
    expect(jump.hidden).toBe(true);
    expect(row.hasAttribute("tabindex")).toBe(false);
    held.change(grow(ul));
    expect(jump.hidden).toBe(true);
    expect(held.held).toBe(0);
  });
});

// keyed-list.md's "With a held list": a live re-sort of a library whose
// moved row is far below the view and not drawn.
function library(n: number) {
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  ul.setAttribute("aria-label", "Library");
  document.body.append(ul);
  let ids = Array.from({ length: n }, (_, i) => `c${String(i)}`);
  const keyed = enhanceKeyedList(ul, { keys: ids, row: (id) => item(id), signal: life.signal });
  const held = enhance(ul);
  const resort = (id: string, to: number): void => {
    held.change(() => {
      ids = ids.filter((k) => k !== id);
      ids.splice(to, 0, id);
      keyed.update(ids);
      const row = keyed.reveal(id, { scroll: false });
      return row === undefined ? [] : [row];
    });
  };
  return { ul, keyed, held, resort };
}

describe("enhanceHeldList over a keyed list", () => {
  it("leaves the page where it is for a change the reader is not in the list for", async () => {
    const { keyed, held, resort } = library(300);
    const page = document.scrollingElement as Element;
    expect(page.scrollTop).toBe(0);
    resort("c250", 200);
    expect(held.held).toBe(0);
    expect(keyed.rowOf("c250")?.getAttribute("aria-posinset")).toBe("201");
    await settle();
    expect(page.scrollTop).toBe(0);
  });

  it("focuses the moved row's link on Show, drawn at the place the re-sort gave it", async () => {
    const { ul, keyed, held, resort } = library(300);
    (ul.querySelector("a") as HTMLAnchorElement).focus();
    resort("c250", 200);
    expect(held.held).toBe(1);
    await userEvent.click(showButton() as HTMLButtonElement);
    const row = keyed.rowOf("c250");
    expect(document.activeElement).toBe(row?.querySelector("a"));
    expect(row?.getAttribute("aria-posinset")).toBe("201");
    await settle();
    const box = (row as HTMLElement).getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual(innerHeight + 1);
  });
});
