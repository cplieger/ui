import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { markKept } from "./list-row.js";

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

describe("a row that holds its own action", () => {
  /** A failed upload's row, its Retry beside the state, in a list `width` wide. */
  function retryRow(width: string): {
    readonly body: HTMLElement;
    readonly retry: HTMLButtonElement;
  } {
    const ul = list();
    ul.style.inlineSize = width;
    const row = ul.querySelector<HTMLElement>(".cp-list-row");
    const body = row?.querySelector<HTMLElement>(".cp-cell-stack");
    if (row == null || body == null) {
      throw new Error("no row");
    }
    const lead = document.createElement("span");
    lead.className = "cp-icon";
    lead.dataset["cpIcon"] = "file-text";
    const end = document.createElement("span");
    end.dataset["part"] = "end";
    end.innerHTML = '<span class="cp-state" data-cp-state="failed">Not uploaded</span>';
    const retry = document.createElement("button");
    retry.className = "cp-button";
    retry.type = "button";
    retry.dataset["size"] = "sm";
    retry.innerHTML =
      '<span class="cp-icon" data-cp-icon="refresh-cw"></span><span class="cp-roll">Retry</span>';
    row.prepend(lead);
    row.append(end, retry);
    return { body, retry };
  }

  it("moves its state and action under the words when they leave the words no room", () => {
    const { body, retry } = retryRow("13rem");
    expect(body.getBoundingClientRect().width).toBeGreaterThanOrEqual(4 * 16 - 1);
    const roll = retry.querySelector(".cp-roll");
    expect(roll?.scrollWidth).toBeLessThanOrEqual(roll?.clientWidth ?? 0);
    expect(retry.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      body.getBoundingClientRect().bottom - 1,
    );
    expect(retry.getBoundingClientRect().right).toBeCloseTo(
      (body.closest(".cp-list-row") as HTMLElement).getBoundingClientRect().right - 16,
      0,
    );
  });

  it("keeps them on the words' line when the row has room", () => {
    const { body, retry } = retryRow("40rem");
    const line = (el: Element): number => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    expect(line(retry)).toBeCloseTo(line(body), 0);
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
