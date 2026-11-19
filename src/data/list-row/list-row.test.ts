import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import { userEvent } from "vitest/browser";

import { installTooltips } from "../../overlays/tooltip/tooltip.js";
import { installRowActions, markKept } from "./list-row.js";

let sheet: HTMLLinkElement;

// A kept row's look lives in the stylesheet, so the tests link it, as an
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

afterEach(() => {
  document.body.replaceChildren();
});

/** A list of one row: a title link over a line of facts. */
function list(): HTMLUListElement {
  const link = document.createElement("a");
  link.href = "#frieren";
  link.textContent = "Frieren";
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
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  ul.append(li);
  document.body.append(ul);
  return ul;
}

/** A Library row: a title link over its meta line, in a `.cp-table`. */
function libraryRow(): { readonly row: HTMLTableRowElement; readonly link: HTMLAnchorElement } {
  const link = document.createElement("a");
  link.href = "#mushishi";
  link.textContent = "Mushishi";
  const meta = document.createElement("span");
  meta.className = "cp-meta";
  meta.textContent = "Sonarr, TV, 2005";
  const stack = document.createElement("div");
  stack.className = "cp-cell-stack";
  stack.append(link, meta);
  const cell = document.createElement("td");
  cell.append(stack);
  const row = document.createElement("tr");
  row.append(cell);
  const body = document.createElement("tbody");
  body.append(row);
  const table = document.createElement("table");
  table.className = "cp-table";
  table.append(body);
  document.body.append(table);
  return { row, link };
}

function colour(token: string, property: "color" | "backgroundColor" = "color"): string {
  const probe = document.createElement("span");
  probe.style.setProperty(property === "color" ? "color" : "background-color", `var(${token})`);
  document.body.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

const muted = () => colour("--cp-ink-muted");

const today = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

describe("markKept", () => {
  it("mutes a list row and puts the time and the reason in its second line's place", () => {
    const ul = list();
    const li = ul.firstElementChild as HTMLLIElement;
    const second = li.querySelector("small") as HTMLElement;
    markKept(li, { from: today(3, 0), reason: "Sonarr walk partial" }, { locale: "en-GB" });
    const row = li.querySelector(".cp-list-row") as HTMLElement;
    expect(row.hasAttribute("data-kept")).toBe(true);
    expect(getComputedStyle(row).color).toBe(muted());
    expect(getComputedStyle(li.querySelector("a") as HTMLElement).color).toBe(muted());
    expect(second.hidden).toBe(true);
    const kept = row.querySelector(".cp-cell-stack > small.cp-kept") as HTMLElement;
    expect(kept.textContent).toBe("Kept from 03:00: Sonarr walk partial");
    const clock = getComputedStyle(kept, "::before");
    expect(clock.maskImage).toMatch(/^url\(/);
    expect(clock.width).toBe("14px");
  });

  it("names the day too when the row is from another day", () => {
    const ul = list();
    const from = today(14, 2);
    from.setDate(from.getDate() - 3);
    markKept(
      ul.firstElementChild as Element,
      { from, reason: "Radarr is not answering" },
      { locale: "en-GB" },
    );
    const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(from);
    expect(ul.querySelector(".cp-kept")?.textContent).toBe(
      `Kept from ${day}, 14:02: Radarr is not answering`,
    );
  });

  it("takes the app's words, and a second mark rewrites the one line", () => {
    const ul = list();
    const row = ul.querySelector(".cp-list-row") as HTMLElement;
    const words = (time: string, reason: string) => `${reason}, since ${time}`;
    markKept(row, { from: today(3, 0), reason: "Partial" }, { words, locale: "en-GB" });
    markKept(row, { from: today(4, 30), reason: "Partial" }, { words, locale: "en-GB" });
    const lines = row.querySelectorAll(".cp-kept");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe("Partial, since 04:30");
  });

  it("marks the row fresh again with null, showing only the lines it hid", () => {
    const ul = list();
    const stack = ul.querySelector(".cp-cell-stack") as HTMLElement;
    const shown = stack.querySelector("small") as HTMLElement;
    const hostHidden = document.createElement("small");
    hostHidden.hidden = true;
    stack.append(hostHidden);
    const li = ul.firstElementChild as Element;
    markKept(li, { from: Date.now(), reason: "Partial" });
    markKept(li, null);
    const row = ul.querySelector(".cp-list-row") as HTMLElement;
    expect(row.hasAttribute("data-kept")).toBe(false);
    expect(row.querySelector(".cp-kept")).toBeNull();
    expect(shown.hidden).toBe(false);
    expect(hostHidden.hidden).toBe(true);
  });

  it("mutes a table row and writes its line in the first cell", () => {
    const row = document.createElement("tr");
    const first = document.createElement("td");
    first.textContent = "Frieren";
    const second = document.createElement("td");
    second.textContent = "1080p";
    row.append(first, second);
    const body = document.createElement("tbody");
    body.append(row);
    const table = document.createElement("table");
    table.className = "cp-table";
    table.append(body);
    document.body.append(table);
    markKept(row, { from: today(3, 0), reason: "Sonarr walk partial" }, { locale: "en-GB" });
    expect(first.querySelector(".cp-kept")?.textContent).toBe(
      "Kept from 03:00: Sonarr walk partial",
    );
    expect(getComputedStyle(second).color).toBe(muted());
  });

  it("puts a table title's meta line aside for the kept line, and back with null", () => {
    const { row } = libraryRow();
    const meta = row.querySelector(".cp-meta") as HTMLElement;
    const stack = row.querySelector(".cp-cell-stack") as HTMLElement;
    markKept(row, { from: today(3, 0), reason: "Sonarr walk partial" }, { locale: "en-GB" });
    expect(meta.hidden).toBe(true);
    expect(stack.lastElementChild?.matches("small.cp-kept")).toBe(true);
    expect(stack.lastElementChild?.textContent).toBe("Kept from 03:00: Sonarr walk partial");
    markKept(row, null);
    expect(meta.hidden).toBe(false);
    expect(stack.querySelector(".cp-kept")).toBeNull();
  });

  it("mutes a kept row's title link, which still takes the accent from the keyboard", async () => {
    const { row, link } = libraryRow();
    markKept(row, { from: today(3, 0), reason: "Sonarr walk partial" });
    expect(link.hidden).toBe(false);
    expect(getComputedStyle(link).color).toBe(muted());
    await userEvent.tab();
    expect(document.activeElement).toBe(link);
    expect(getComputedStyle(link).color).toBe(colour("--cp-accent-ink"));
  });

  it("greys the compact step track in a kept table row, and gives it back its accent", () => {
    const { row } = libraryRow();
    const cell = document.createElement("td");
    const track = document.createElement("button");
    track.type = "button";
    track.className = "cp-track-compact";
    track.textContent = "Downloading";
    cell.append(track);
    row.append(cell);
    const accent = colour("--cp-accent-11");
    expect(getComputedStyle(track).color).toBe(accent);
    markKept(row, { from: today(3, 0), reason: "Sonarr walk partial" });
    expect(getComputedStyle(track).color).toBe(muted());
    markKept(row, null);
    expect(getComputedStyle(track).color).toBe(accent);
  });

  it("greys the step track under a kept list row as a kept track is", () => {
    const ul = list();
    const row = ul.querySelector(".cp-list-row") as HTMLElement;
    const steps = document.createElement("ol");
    steps.className = "cp-track";
    for (const [state, name] of [
      ["done", "Found"],
      ["current", "Downloading"],
      ["todo", "Imported"],
    ] as const) {
      const step = document.createElement("li");
      step.dataset["state"] = state;
      step.textContent = name;
      steps.append(step);
    }
    row.append(steps);
    markKept(row, { from: today(3, 0), reason: "Sonarr walk partial" });
    const [done, current, todo] = [...steps.children].map((li) => getComputedStyle(li, "::before"));
    expect(done?.backgroundColor).toBe(colour("--cp-neutral-8", "backgroundColor"));
    expect(todo?.backgroundColor).toBe(colour("--cp-neutral-5", "backgroundColor"));
    const stops = [...(current?.backgroundImage ?? "").matchAll(/rgb\([^)]+\)|oklch\([^)]+\)/g)];
    expect(new Set(stops.map((m) => m[0]))).toHaveProperty("size", 1);
    expect(getComputedStyle(steps.children[1] as Element).color).toBe(muted());
  });

  it("refuses an invalid date", () => {
    const ul = list();
    expect(() => {
      markKept(ul.firstElementChild as Element, { from: Number.NaN, reason: "Partial" });
    }).toThrow(TypeError);
    expect(ul.querySelector("[data-kept]")).toBeNull();
  });
});

describe("a timeline's event", () => {
  /** A timeline of one event per text: its mark, its words and its time. */
  function timeline(texts: readonly string[]): HTMLOListElement {
    const ol = document.createElement("ol");
    ol.className = "cp-list";
    ol.dataset["variant"] = "timeline";
    ol.dataset["surface"] = "plain";
    ol.style.inlineSize = "20rem";
    for (const text of texts) {
      const mark = document.createElement("span");
      mark.dataset["part"] = "mark";
      mark.dataset["tone"] = "success";
      const words = document.createElement("p");
      words.textContent = text;
      const body = document.createElement("div");
      body.append(words);
      const time = document.createElement("time");
      time.textContent = "14:05";
      const end = document.createElement("span");
      end.dataset["part"] = "end";
      end.append(time);
      const row = document.createElement("div");
      row.className = "cp-list-row";
      row.dataset["lines"] = "wrap";
      row.append(mark, body, end);
      const li = document.createElement("li");
      li.append(row);
      ol.append(li);
    }
    document.body.append(ol);
    return ol;
  }

  /** The centre of the cap band of the first line `el`'s text draws. */
  function capCentre(el: Element): number {
    const mark = document.createElement("span");
    mark.style.cssText = "display: inline-block; inline-size: 0; block-size: 0";
    el.prepend(mark);
    const baseline = mark.getBoundingClientRect().bottom;
    mark.remove();
    const style = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx === null) {
      throw new TypeError("no 2d context");
    }
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return baseline - ctx.measureText("H").actualBoundingBoxAscent / 2;
  }

  it("centres its glyph and its time on its first line's cap band, on one line or several", async () => {
    const ol = timeline([
      "Grabbed Arid's BD release",
      "Grabbed Arid's BD release of all 24 episodes, dual audio, replacing the web release",
    ]);
    await document.fonts.ready;
    const rows = [...ol.querySelectorAll(".cp-list-row")];
    const lines = rows.map((row) => {
      const p = row.querySelector("p") as HTMLElement;
      return Math.round(
        p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight),
      );
    });
    expect(lines[0]).toBe(1);
    expect(lines[1]).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      const first = capCentre(row.querySelector("p") as Element);
      const box = (row.querySelector('[data-part="mark"]') as Element).getBoundingClientRect();
      expect(Math.abs((box.top + box.bottom) / 2 - first)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(capCentre(row.querySelector("time") as Element) - first)).toBeLessThanOrEqual(
        0.5,
      );
    }
  });
});

describe("installRowActions", () => {
  const life = new AbortController();
  const still = document.createElement("style");
  still.textContent = "*, *::after { transition: none !important; }";
  beforeAll(() => {
    document.head.append(still);
    installRowActions({ signal: life.signal });
  });
  afterAll(() => {
    life.abort();
    still.remove();
  });

  /** A list row holding `parts` after its title, in a 40rem list. */
  function row(title: string, ...parts: string[]): HTMLElement {
    const ul = document.createElement("ul");
    ul.className = "cp-list";
    ul.style.inlineSize = "40rem";
    ul.innerHTML = `<li><div class="cp-list-row"><span class="cp-cell-stack">${title}<small>Checked 4 minutes ago</small></span>${parts.join("")}</div></li>`;
    document.body.append(ul);
    return ul.querySelector(".cp-list-row") as HTMLElement;
  }

  const settle = () => new Promise((ok) => setTimeout(ok, 0));
  /** Puts the mouse on a block under the rows: an earlier file can leave it where a new row lands. */
  async function mouseAway(): Promise<void> {
    const off = document.createElement("div");
    off.style.blockSize = "2rem";
    document.body.append(off);
    await userEvent.hover(off);
  }
  const fill = (el: Element) => getComputedStyle(el).backgroundColor;
  const farEnd = (el: Element) => {
    const box = el.getBoundingClientRect();
    return { x: box.width - 4, y: box.height / 2 };
  };
  const clicks = (el: Element) => {
    const heard: EventTarget[] = [];
    el.addEventListener("click", (e) => {
      e.preventDefault();
      heard.push(e.target as EventTarget);
    });
    return heard;
  };

  it("makes a row of one link that link, whole: its ring, a press at its far end and the hover fill", async () => {
    const r = row('<a href="#frieren">Frieren</a>');
    await settle();
    const link = r.querySelector("a") as HTMLAnchorElement;
    await userEvent.tab();
    expect(document.activeElement).toBe(link);
    const ring = getComputedStyle(link, "::after");
    expect(ring.outlineStyle).toBe("solid");
    const box = r.getBoundingClientRect();
    expect(parseFloat(ring.inlineSize)).toBeCloseTo(box.width, 0);
    expect(parseFloat(ring.blockSize)).toBeCloseTo(box.height, 0);
    link.blur();
    const heard = clicks(link);
    await mouseAway();
    const rest = fill(r);
    await userEvent.click(r, { position: farEnd(r) });
    expect(heard).toEqual([link]);
    await userEvent.hover(r, { position: farEnd(r) });
    expect(fill(r)).toBe(colour("--cp-fill", "backgroundColor"));
    expect(fill(r)).not.toBe(rest);
  });

  it("makes a row of one button that button, whole", async () => {
    const r = row(
      "<span>Quick check</span>",
      '<button class="cp-button" type="button">Cancel</button>',
    );
    await settle();
    const button = r.querySelector("button") as HTMLButtonElement;
    const heard = clicks(button);
    await userEvent.click(r, { position: { x: 4, y: 4 } });
    expect(heard).toEqual([button]);
  });

  it("gives a row of two actions no row hover and no row hit area, its title a link that underlines", async () => {
    const r = row(
      '<a href="#frieren">Frieren</a>',
      '<button class="cp-button" type="button">Grab</button>',
    );
    await settle();
    const link = r.querySelector("a") as HTMLAnchorElement;
    const button = r.querySelector("button") as HTMLButtonElement;
    const linkHeard = clicks(link);
    const buttonHeard = clicks(button);
    await mouseAway();
    const rest = fill(r);
    const blank = { x: r.getBoundingClientRect().width / 2, y: 4 };
    await userEvent.click(r, { position: blank });
    expect([...linkHeard, ...buttonHeard]).toEqual([]);
    await userEvent.hover(r, { position: blank });
    expect(fill(r)).toBe(rest);
    await userEvent.hover(link);
    expect(getComputedStyle(link).textDecorationColor).toBe(getComputedStyle(link).color);
  });

  it("gives a row of no action nothing under the mouse", async () => {
    const r = row("<span>Store full</span>");
    await settle();
    await mouseAway();
    const rest = fill(r);
    await userEvent.hover(r);
    expect(fill(r)).toBe(rest);
    expect(r.hasAttribute("data-cp-row-action")).toBe(false);
  });

  it("does not count a menu's items in a row as the row's actions", async () => {
    const r = row(
      "<span>Frieren</span>",
      '<button class="cp-button" type="button" popovertarget="m">More</button><div popover id="m" role="menu"><button role="menuitem" type="button">Rename</button><button role="menuitem" type="button">Delete</button></div>',
    );
    await settle();
    expect(r.hasAttribute("data-cp-row-action")).toBe(true);
    expect(r.querySelector("[data-cp-stretch]")?.textContent).toBe("More");
  });

  it("reads a row again when an action is added or taken away", async () => {
    const r = row('<a href="#frieren">Frieren</a>');
    await settle();
    expect(r.hasAttribute("data-cp-row-action")).toBe(true);
    const grab = document.createElement("button");
    grab.textContent = "Grab";
    r.append(grab);
    await settle();
    expect(r.hasAttribute("data-cp-row-action")).toBe(false);
    expect(r.querySelector("[data-cp-stretch]")).toBeNull();
    grab.remove();
    await settle();
    expect(r.querySelector("[data-cp-stretch]")).toBe(r.querySelector("a"));
  });

  describe("a row's own tipped parts", () => {
    const tip = () => document.querySelector(".cp-tooltip");
    const tipSays = () => (tip()?.matches(":popover-open") === true ? tip()?.textContent : null);
    /** `part`'s centre, as a position in `r`. */
    const centreIn = (r: Element, part: Element) => {
      const row = r.getBoundingClientRect();
      const box = part.getBoundingClientRect();
      return { x: box.left - row.left + box.width / 2, y: box.top - row.top + box.height / 2 };
    };
    const tapAt = (r: Element, at: { x: number; y: number }) => {
      const row = r.getBoundingClientRect();
      document
        .elementFromPoint(row.left + at.x, row.top + at.y)
        ?.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "touch" }),
        );
    };
    beforeEach(() => {
      const tips = new AbortController();
      installTooltips({ signal: tips.signal, delay: 100 });
      onTestFinished(() => {
        tips.abort();
      });
    });

    it("puts a focusable part over the row's action: its own target, its tip shown to a mouse and a tap", async () => {
      const r = row(
        '<a href="#frieren">Frieren</a>',
        '<span tabindex="0" data-cp-tip-toggle data-cp-tip="Step 2 of 4: grabbing">2/4</span>',
      );
      await settle();
      const link = r.querySelector("a") as HTMLAnchorElement;
      const part = r.querySelector("span[tabindex]") as HTMLElement;
      const at = centreIn(r, part);
      const box = r.getBoundingClientRect();
      expect(document.elementFromPoint(box.left + at.x, box.top + at.y)).toBe(part);
      const heard = clicks(link);
      await mouseAway();
      const rest = fill(r);
      await userEvent.hover(r, { position: at });
      await expect.poll(tipSays).toBe("Step 2 of 4: grabbing");
      expect(fill(r)).toBe(rest);
      await userEvent.pointer({ target: r, coords: at, keys: "[MouseLeft>]" });
      expect(fill(r)).toBe(rest);
      await userEvent.pointer({ target: r, coords: at, keys: "[/MouseLeft]" });
      expect(heard).toEqual([]);
      await mouseAway();
      await expect.poll(tipSays).toBeNull();
      tapAt(r, at);
      expect(tipSays()).toBe("Step 2 of 4: grabbing");
      tapAt(r, at);
      expect(tipSays()).toBeNull();
    });

    it("shows a plain tipped part's tip to a mouse resting on it, while a press on it follows the action", async () => {
      const r = row(
        '<a href="#frieren">Frieren</a>',
        '<time datetime="2026-11-18T10:00" data-cp-tip="18 Nov 2026, 10:00">2h ago</time>',
      );
      await settle();
      const link = r.querySelector("a") as HTMLAnchorElement;
      const at = centreIn(r, r.querySelector("time") as Element);
      const heard = clicks(link);
      await mouseAway();
      await userEvent.hover(r, { position: at });
      await expect.poll(tipSays).toBe("18 Nov 2026, 10:00");
      expect(fill(r)).toBe(colour("--cp-fill", "backgroundColor"));
      await userEvent.hover(r, { position: { x: 4, y: at.y } });
      await expect.poll(tipSays).toBeNull();
      await userEvent.hover(r, { position: at });
      await expect.poll(tipSays).toBe("18 Nov 2026, 10:00");
      await userEvent.pointer({ target: r, coords: at, keys: "[MouseLeft>]" });
      expect(fill(r)).toBe(colour("--cp-fill-active", "backgroundColor"));
      await userEvent.pointer({ target: r, coords: at, keys: "[/MouseLeft]" });
      expect(heard).toEqual([link]);
    });

    it("hides a plain tipped part's tip once the mouse leaves the part by one pixel, onto the row's action or off the row", async () => {
      const r = row(
        '<a href="#frieren">Frieren</a>',
        '<time datetime="2026-11-18T10:00" data-cp-tip="18 Nov 2026, 10:00">2h ago</time>',
      );
      await settle();
      const time = r.querySelector("time") as HTMLElement;
      const box = r.getBoundingClientRect();
      const t = time.getBoundingClientRect();
      const past = { x: t.right - box.left, y: centreIn(r, time).y };
      expect(document.elementsFromPoint(t.right, t.top + t.height / 2)).not.toContain(time);
      for (const off of [() => userEvent.hover(r, { position: { x: 4, y: past.y } }), mouseAway]) {
        await mouseAway();
        await userEvent.hover(r, { position: centreIn(r, time) });
        await expect.poll(tipSays).toBe("18 Nov 2026, 10:00");
        await userEvent.hover(r, { position: past });
        await off();
        await expect.poll(tipSays).toBeNull();
      }
    });

    it("lets a press just past a part's open tip, between it and the part, follow the action", async () => {
      const r = row(
        '<a href="#frieren">Frieren</a>',
        '<time datetime="2026-11-18T10:00" data-cp-tip="18 Nov 2026, 10:00">2h ago</time>',
      );
      (r.closest("ul") as HTMLElement).style.marginBlockStart = "6rem";
      await settle();
      const link = r.querySelector("a") as HTMLAnchorElement;
      const time = r.querySelector("time") as HTMLElement;
      const heard = clicks(link);
      await mouseAway();
      await userEvent.hover(r, { position: centreIn(r, time) });
      await expect.poll(tipSays).toBe("18 Nov 2026, 10:00");
      const above = time.getBoundingClientRect().top - 3;
      expect((tip() as Element).getBoundingClientRect().bottom).toBeLessThan(above);
      const box = r.getBoundingClientRect();
      const at = { x: centreIn(r, time).x, y: above - box.top };
      expect(document.elementFromPoint(box.left + at.x, above)).toBe(link);
      await userEvent.click(r, { position: at, force: true });
      expect(heard).toEqual([link]);
    });

    it("keeps a row whole whose action sits inside a focusable cut line", async () => {
      const r = row(
        '<span class="cp-truncate" tabindex="0" data-cp-tip-toggle data-cp-tip="Frieren: Beyond Journey\'s End"><a href="#frieren">Frieren: Beyond Journey\'s End</a></span>',
      );
      await settle();
      const link = r.querySelector("a") as HTMLAnchorElement;
      const heard = clicks(link);
      await mouseAway();
      await userEvent.click(r, { position: farEnd(r) });
      expect(heard).toEqual([link]);
    });
  });

  it("makes a table row of one link that link, whole, and leaves a row of two to its cells", async () => {
    const { row: one, link } = libraryRow();
    const two = document.createElement("tr");
    two.innerHTML =
      '<td><a href="#mushishi">Mushishi</a></td><td><button type="button">Grab</button></td>';
    one.after(two);
    one.append(Object.assign(document.createElement("td"), { textContent: "2005" }));
    await settle();
    const heard = clicks(link);
    const cell = one.lastElementChild as HTMLElement;
    await userEvent.click(one, { position: farEnd(one) });
    expect(heard).toEqual([link]);
    await userEvent.hover(one, { position: farEnd(one) });
    expect(fill(cell)).toBe(colour("--cp-fill", "backgroundColor"));
    const rest = fill(two.cells[0] as Element);
    await userEvent.hover(two.cells[0] as Element, { position: { x: 1, y: 1 } });
    expect(fill(two.cells[0] as Element)).toBe(rest);
  });
});
