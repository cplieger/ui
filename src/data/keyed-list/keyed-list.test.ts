import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceKeyedList, type KeyedListOptions } from "./keyed-list.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The list's height, its rows' density and the spacers' rules live in the
// stylesheet, so the tests link it, as an app's page does.
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
  document.documentElement.scrollTop = 0;
});

const keysOf = (n: number, from = 0): string[] =>
  Array.from({ length: n }, (_, i) => `t${String(from + i)}`);

/** subflux's title row: its one interactive part is its title link. */
function titleItem(key: string): HTMLLIElement {
  const link = document.createElement("a");
  link.className = "cp-truncate";
  link.href = `#${key}`;
  link.textContent = `Title ${key}`;
  const stack = document.createElement("span");
  stack.className = "cp-cell-stack";
  stack.append(link);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.textContent = "3 of 26 episodes";
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(stack, end);
  const li = document.createElement("li");
  li.dataset["key"] = key;
  li.append(row);
  return li;
}

function copyRow(key: string): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset["key"] = key;
  const link = document.createElement("a");
  link.href = `#${key}`;
  link.textContent = `Copy ${key}`;
  tr.insertCell().append(link);
  tr.insertCell().textContent = "On the best";
  tr.insertCell().textContent = "None";
  return tr;
}

function virtualList(): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  ul.dataset["virtual"] = "";
  ul.setAttribute("aria-label", "Titles");
  document.body.append(ul);
  return ul;
}

function enhance(
  container: HTMLUListElement | HTMLTableSectionElement,
  options: Partial<KeyedListOptions> & Pick<KeyedListOptions, "keys">,
) {
  return enhanceKeyedList(container, {
    row: (key) => (container instanceof HTMLTableSectionElement ? copyRow(key) : titleItem(key)),
    signal: life.signal,
    ...options,
  });
}

/** The keyed rows in the document, in order. */
const rows = (container: Element): HTMLElement[] =>
  [...container.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset["key"] !== undefined,
  );

const keysIn = (container: Element): string[] =>
  rows(container).map((el) => el.dataset["key"] ?? "");

/** The distance from one row's bottom to the next one's, the first row
 *  having no line above it. */
function pitchOf(container: Element): number {
  const [a, b] = rows(container);
  if (a === undefined || b === undefined) {
    throw new Error("fewer than two rows drawn");
  }
  return b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom;
}

/** The first row whose bottom is below `top`, the one the reader sees there. */
function rowAt(container: Element, top: number): HTMLElement {
  const row = rows(container).find((el) => el.getBoundingClientRect().bottom > top + 1);
  if (row === undefined) {
    throw new Error("no row in view");
  }
  return row;
}

/** Two frames: scroll events and the resize observer have run. */
const frames = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

describe("enhanceKeyedList", () => {
  it("draws only the rows in view of 20,000, and five past each edge, in order", () => {
    const ul = virtualList();
    enhance(ul, { keys: keysOf(20_000) });
    const pitch = pitchOf(ul);
    const view = Math.ceil(ul.clientHeight / pitch);
    expect(keysIn(ul)).toEqual(keysOf(view + 5));
    expect(ul.scrollHeight).toBeGreaterThan(20_000 * pitch - pitch);
    expect(ul.scrollHeight).toBeLessThan(20_000 * pitch + pitch);
    const [first, second] = rows(ul);
    expect(first?.getAttribute("aria-setsize")).toBe("20000");
    expect(first?.getAttribute("aria-posinset")).toBe("1");
    expect(second?.getAttribute("aria-posinset")).toBe("2");
  });

  it("takes its rows' pitch from the list's density", () => {
    const regular = virtualList();
    enhance(regular, { keys: keysOf(100) });
    const tall = virtualList();
    tall.dataset["density"] = "tall";
    enhance(tall, { keys: keysOf(100) });
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    // A row is the density's height and the line between rows 1px.
    expect(pitchOf(regular)).toBeCloseTo(3.25 * rem + 1, 0);
    expect(pitchOf(tall)).toBeCloseTo(4.5 * rem + 1, 0);
    expect(tall.scrollHeight).toBeGreaterThan(100 * pitchOf(tall) - pitchOf(tall));
  });

  it.each([
    ["a list with lines", "line"],
    ["a list with no lines", "none"],
    ["a table", "table"],
  ])("puts a windowed row where it sits with every row drawn, in %s", async (_, kind) => {
    const place = async (window: boolean) => {
      const box = document.createElement("div");
      box.style.blockSize = "20rem";
      box.style.inlineSize = "30rem";
      box.style.overflowY = "auto";
      document.body.append(box);
      let body: HTMLUListElement | HTMLTableSectionElement;
      if (kind === "table") {
        const table = document.createElement("table");
        table.className = "cp-table";
        body = table.createTBody();
        box.append(table);
      } else {
        body = document.createElement("ul");
        body.className = "cp-list";
        if (kind === "none") {
          body.dataset["divider"] = "none";
        }
        box.append(body);
      }
      const list = enhance(body, { keys: keysOf(400), window });
      box.scrollTop = 250 * pitchOf(body);
      await frames();
      const row = list.reveal("t250") as HTMLElement;
      const at = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const height = box.scrollHeight;
      box.remove();
      return [at, height];
    };
    expect(await place(true)).toEqual(await place(false));
  });

  it("draws the rows at the place the reader scrolls to, and drops those that left", async () => {
    const ul = virtualList();
    enhance(ul, { keys: keysOf(20_000) });
    const pitch = pitchOf(ul);
    const t0 = rows(ul)[0];
    ul.scrollTop = 10_000 * pitch;
    await frames();
    expect(rowAt(ul, ul.getBoundingClientRect().top).dataset["key"]).toBe("t10000");
    expect(rows(ul)[0]?.dataset["key"]).toBe("t9995");
    expect(t0?.isConnected).toBe(false);
    expect(rows(ul).length).toBeLessThan(30);
  });

  it("keeps the focused row drawn, in its place, when it scrolls out of view", async () => {
    const ul = virtualList();
    enhance(ul, { keys: keysOf(20_000) });
    const link = rows(ul)[2]?.querySelector("a") as HTMLAnchorElement;
    // WebKit scrolls a newly focused element into view a frame later, which
    // would undo the scroll below; the link is in view already.
    link.focus({ preventScroll: true });
    ul.scrollTop = 10_000 * pitchOf(ul);
    await frames();
    expect(document.activeElement).toBe(link);
    expect(link.isConnected).toBe(true);
    expect(keysIn(ul)[0]).toBe("t2");
    expect(keysIn(ul)[1]).toBe("t9995");
  });

  it("patches only the five rows the app changes, keeping focus and scroll (seadex 7.2)", () => {
    const panel = document.createElement("div");
    panel.style.blockSize = "20rem";
    panel.style.overflowY = "auto";
    const table = document.createElement("table");
    table.className = "cp-table";
    table
      .createTHead()
      .insertRow()
      .append(
        ...["Copy", "Verdict", "Grab"].map((text) => {
          const th = document.createElement("th");
          th.textContent = text;
          return th;
        }),
      );
    const body = table.createTBody();
    panel.append(table);
    document.body.append(panel);
    const keys = keysOf(2000);
    const library = enhance(body, { keys, window: false });
    panel.scrollTop = 600;
    const link = library.rowOf("t20")?.querySelector("a") as HTMLAnchorElement;
    link.focus();
    const changed = ["t3", "t20", "t500", "t1200", "t1999"];
    const touched = new Set<Element>();
    const watch = new MutationObserver((records) => {
      for (const r of records) {
        const node = r.target instanceof Element ? r.target : r.target.parentElement;
        touched.add(node?.closest("tbody > tr") ?? body);
      }
    });
    watch.observe(table, { subtree: true, childList: true, attributes: true, characterData: true });
    for (const key of changed) {
      const row = library.rowOf(key);
      const cell = row instanceof HTMLTableRowElement ? row.cells[1] : undefined;
      if (cell !== undefined) {
        cell.textContent = "Not the best";
      }
    }
    library.update(keys);
    const records = watch.takeRecords();
    watch.disconnect();
    for (const r of records) {
      const node = r.target instanceof Element ? r.target : r.target.parentElement;
      touched.add(node?.closest("tbody > tr") ?? body);
    }
    expect([...touched].map((el) => (el as HTMLElement).dataset["key"]).sort()).toEqual(
      [...changed].sort(),
    );
    expect(document.activeElement).toBe(link);
    expect(panel.scrollTop).toBe(600);
  });

  it("keeps the row at the top of the view where it was when rows arrive above it", async () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(1000) });
    ul.scrollTop = 300.5 * pitchOf(ul);
    await frames();
    const top = ul.getBoundingClientRect().top;
    const seen = rowAt(ul, top);
    const was = seen.getBoundingClientRect().top;
    list.update([...keysOf(3, 5000), ...keysOf(1000)]);
    expect(rowAt(ul, top)).toBe(seen);
    expect(Math.abs(seen.getBoundingClientRect().top - was)).toBeLessThan(1);
  });

  it("shows a row put first while the reader is at the list's start", () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(1000) });
    list.update(["new", ...keysOf(1000)]);
    expect(ul.scrollTop).toBe(0);
    expect(keysIn(ul)[0]).toBe("new");
  });

  it("moves a reordered row around the focused one, which keeps its element and focus", () => {
    const ul = virtualList();
    const keys = keysOf(50);
    const list = enhance(ul, { keys });
    const focused = list.rowOf("t3") as HTMLElement;
    const link = focused.querySelector("a") as HTMLAnchorElement;
    link.focus();
    let blurred = false;
    link.addEventListener("blur", () => {
      blurred = true;
    });
    list.update(["t3", ...keys.filter((k) => k !== "t3")]);
    expect(keysIn(ul).slice(0, 3)).toEqual(["t3", "t0", "t1"]);
    expect(list.rowOf("t3")).toBe(focused);
    expect(document.activeElement).toBe(link);
    expect(blurred).toBe(false);
    list.update([...keys.filter((k) => k !== "t3"), "t3"]);
    expect(list.rowOf("t3")).toBe(focused);
    expect(document.activeElement).toBe(link);
    expect(blurred).toBe(false);
  });

  it("moves focus to the row now in a removed row's place, never to the page", () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(20) });
    const gone = list.rowOf("t4") as HTMLElement;
    gone.querySelector("a")?.focus();
    list.update(keysOf(20).filter((k) => k !== "t4"));
    expect(gone.isConnected).toBe(false);
    expect(document.activeElement).toBe(list.rowOf("t5")?.querySelector("a"));
    list.update([]);
    expect(document.activeElement).toBe(ul);
  });

  it("passes over a disabled or unshown control in the row it moves focus to", () => {
    const ul = virtualList();
    const list = enhance(ul, {
      keys: keysOf(20),
      row: (key) => {
        const li = titleItem(key);
        const box = document.createElement("input");
        box.type = "checkbox";
        box.disabled = true;
        const gone = document.createElement("button");
        gone.hidden = true;
        li.querySelector(".cp-list-row")?.prepend(box, gone);
        return li;
      },
    });
    list.rowOf("t4")?.querySelector("a")?.focus();
    list.update(keysOf(20).filter((k) => k !== "t4"));
    expect(document.activeElement).toBe(list.rowOf("t5")?.querySelector("a"));
  });

  it("draws a skeleton where a row is not loaded, asks the app for it, and is busy until it comes", () => {
    const ul = virtualList();
    const asked: [number, number][] = [];
    const keys: (string | undefined)[] = [...keysOf(3), ...Array<undefined>(997)];
    const list = enhance(ul, {
      keys,
      need: (start, end) => {
        asked.push([start, end]);
      },
    });
    const drawn = [...ul.children].filter((el) => el.getAttribute("data-part") !== "spacer");
    expect(asked).toEqual([[3, drawn.length]]);
    expect(ul.getAttribute("aria-busy")).toBe("true");
    const skeleton = drawn[3];
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.querySelector(".cp-list-row[data-skeleton] .cp-skeleton")).not.toBeNull();
    list.update([...keysOf(drawn.length), ...Array<undefined>(1000 - drawn.length)]);
    expect(ul.hasAttribute("aria-busy")).toBe(false);
    expect(ul.querySelector("[data-skeleton]")).toBeNull();
    expect(skeleton?.isConnected).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("writes the count in subflux's words, and says it once a new set settles", async () => {
    const ul = virtualList();
    const count = document.createElement("span");
    document.body.append(count);
    const list = enhance(ul, { keys: keysOf(640), count, settle: 50 });
    expect(count.textContent).toBe("640 of 640 titles");
    list.reset(keysOf(5), 640);
    expect(count.textContent).toBe("5 of 640 titles");
    await expect.poll(polite).toBe("5 of 640 titles");
  });

  it("writes a live update's count without saying it", async () => {
    const ul = virtualList();
    const count = document.createElement("span");
    document.body.append(count);
    const list = enhance(ul, {
      keys: keysOf(8),
      of: 659,
      count,
      settle: 0,
      words: { count: (n, of) => `${String(n)} of ${String(of)} copies` },
    });
    list.update(keysOf(9));
    expect(count.textContent).toBe("9 of 659 copies");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(polite()).toBe("");
  });

  it("goes back to the list's start on a new set of rows", () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(1000) });
    ul.scrollTop = 200 * pitchOf(ul);
    list.reset(keysOf(500, 1));
    expect(ul.scrollTop).toBe(0);
    expect(keysIn(ul)[0]).toBe("t1");
  });

  it("adds no listener's mark, tab stop or role to a row: its title link is its one stop", () => {
    const ul = virtualList();
    enhance(ul, { keys: keysOf(100) });
    const li = rows(ul)[0] as HTMLElement;
    expect(li.getAttributeNames().sort()).toEqual(["aria-posinset", "aria-setsize", "data-key"]);
    const row = li.firstElementChild as HTMLElement;
    expect(row.getAttributeNames()).toEqual(["class"]);
    expect(li.querySelectorAll("a, button, [tabindex]")).toHaveLength(1);
  });

  it("windows a table body's rows in flow, its columns still, each row's place in the table said", async () => {
    const panel = document.createElement("div");
    panel.style.blockSize = "15rem";
    panel.style.inlineSize = "36rem";
    panel.style.overflowY = "auto";
    const table = document.createElement("table");
    table.className = "cp-table";
    const head = table.createTHead().insertRow();
    for (const text of ["Copy", "Verdict", "Grab"]) {
      const th = document.createElement("th");
      th.textContent = text;
      head.append(th);
    }
    const body = table.createTBody();
    body.dataset["virtual"] = "";
    panel.append(table);
    document.body.append(panel);
    enhanceKeyedList(body, {
      keys: keysOf(659),
      row: (key) => {
        const tr = copyRow(key);
        if (key === "t600") {
          tr.cells[0]?.append(" with a much longer title that would widen its column");
        }
        return tr;
      },
      signal: life.signal,
    });
    const widths = () => [...head.cells].map((th) => th.getBoundingClientRect().width);
    const before = widths();
    expect(table.getAttribute("aria-rowcount")).toBe("660");
    expect(rows(body)[0]?.getAttribute("aria-rowindex")).toBe("2");
    const spacer = body.querySelector<HTMLTableRowElement>('tr[data-part="spacer"]');
    expect(spacer?.cells[0]?.colSpan).toBe(3);
    const pitch = pitchOf(body);
    panel.scrollTop = 598 * pitch;
    await frames();
    expect(
      rowAt(body, panel.getBoundingClientRect().top + (table.tHead?.offsetHeight ?? 0)).dataset[
        "key"
      ],
    ).toBe("t598");
    expect(body.querySelector('[data-key="t600"]')).not.toBeNull();
    expect(widths()).toEqual(before);
  });

  it("windows a list that scrolls with the page", async () => {
    const lead = document.createElement("div");
    lead.style.blockSize = "10rem";
    document.body.append(lead);
    const ul = document.createElement("ul");
    ul.className = "cp-list";
    document.body.append(ul);
    enhance(ul, { keys: keysOf(5000) });
    const pitch = pitchOf(ul);
    expect(rows(ul).length).toBeLessThan(Math.ceil(innerHeight / pitch) + 12);
    const page = document.scrollingElement as HTMLElement;
    page.scrollTop = ul.getBoundingClientRect().top + 2000 * pitch;
    await frames();
    expect(rowAt(ul, 0).dataset["key"]).toBe("t2000");
  });

  it("draws every row in order with window: false, and no spacer or set size", () => {
    const ul = document.createElement("ul");
    ul.className = "cp-list";
    document.body.append(ul);
    const list = enhance(ul, { keys: keysOf(50), window: false });
    expect(keysIn(ul)).toEqual(keysOf(50));
    expect(ul.querySelector('[data-part="spacer"]')).toBeNull();
    expect(rows(ul)[0]?.hasAttribute("aria-setsize")).toBe(false);
    list.update(keysOf(50).reverse());
    expect(keysIn(ul)).toEqual(keysOf(50).reverse());
  });

  it("draws a grid's tiles whole, and windows its rows again once it is back to rows", async () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(300) });
    const windowed = rows(ul).length;
    ul.dataset["layout"] = "grid";
    list.update(keysOf(300));
    expect(keysIn(ul)).toEqual(keysOf(300));
    expect(ul.querySelector('[data-part="spacer"]')).toBeNull();
    expect(rows(ul)[0]?.hasAttribute("aria-posinset")).toBe(false);
    delete ul.dataset["layout"];
    await frames();
    await frames();
    expect(rows(ul)).toHaveLength(windowed);
    expect(rows(ul)[0]?.getAttribute("aria-posinset")).toBe("1");
  });

  it("scrolls a row into view, drawn, by its key", () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(20_000) });
    expect(list.rowOf("t15000")).toBeUndefined();
    const row = list.reveal("t15000") as HTMLElement;
    expect(row.isConnected).toBe(true);
    const box = row.getBoundingClientRect();
    const view = ul.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(view.top - 1);
    expect(box.bottom).toBeLessThanOrEqual(view.bottom + 1);
    expect(list.reveal("nope")).toBeUndefined();
    expect(list.length).toBe(20_000);
  });

  it("draws a row out of view at its place without scrolling, given scroll: false", () => {
    const ul = virtualList();
    const list = enhance(ul, { keys: keysOf(20_000) });
    const row = list.reveal("t15000", { scroll: false }) as HTMLElement;
    expect(ul.scrollTop).toBe(0);
    expect(row.isConnected).toBe(true);
    expect(row.getAttribute("aria-posinset")).toBe("15001");
    expect(row.previousElementSibling?.getAttribute("data-part")).toBe("spacer");
    expect(row.getBoundingClientRect().top).toBeGreaterThan(ul.getBoundingClientRect().bottom);
  });

  it("keeps a list's foot last", () => {
    const ul = document.createElement("ul");
    ul.className = "cp-list";
    const foot = document.createElement("li");
    foot.className = "cp-list-foot";
    ul.append(foot);
    document.body.append(ul);
    const list = enhance(ul, { keys: keysOf(10), window: false });
    expect(ul.lastElementChild).toBe(foot);
    list.update(keysOf(20));
    expect(ul.lastElementChild).toBe(foot);
    expect(keysIn(ul)).toEqual(keysOf(20));
  });

  it("refuses a key given twice and a row of the wrong element", () => {
    const ul = virtualList();
    expect(() => enhance(ul, { keys: ["a", "b", "a"] })).toThrow(TypeError);
    expect(() =>
      enhanceKeyedList(virtualList(), {
        keys: ["a"],
        row: () => document.createElement("div"),
        signal: life.signal,
      }),
    ).toThrow(TypeError);
  });

  describe("with rows of different heights", () => {
    /** A day-by-day history: every 40th row a day's heading, the others
     *  one line, or taller by their index, as a wrapped row or a row with
     *  its details open is. */
    const TALL = ["", "5.5rem", "", "9rem", "", "4.25rem", "12.5rem"];
    function historyItem(key: string): HTMLLIElement {
      const i = Number(key.slice(1));
      if (i % 40 === 0) {
        const heading = document.createElement("h3");
        heading.className = "cp-list-heading";
        heading.textContent = `Day ${String(i / 40)}`;
        const li = document.createElement("li");
        li.dataset["key"] = key;
        li.append(heading);
        return li;
      }
      const li = titleItem(key);
      const row = li.firstElementChild as HTMLElement;
      row.style.minBlockSize = TALL[i % TALL.length] ?? "";
      return li;
    }

    /** Where `el` sits in `scroller`'s content, in px from its start. */
    const offsetIn = (scroller: Element, el: Element): number =>
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

    it("places 10,000 of them as with every row drawn once scrolled end to end, never drawing past the view", async () => {
      const keys = keysOf(10_000);
      const marks = ["t1", "t5000", "t9999"];
      // Gecko lays a grid out in at most 9,999 rows
      // (https://bugzilla.mozilla.org/show_bug.cgi?id=1752237), so the list
      // drawn whole is a column of flex items.
      const whole = virtualList();
      whole.style.display = "flex";
      whole.style.flexDirection = "column";
      const all = enhance(whole, {
        keys,
        window: false,
        row: (key) => {
          const li = historyItem(key);
          li.style.flex = "none";
          return li;
        },
      });
      const placed = marks.map((key) => offsetIn(whole, all.rowOf(key) as HTMLElement));
      const height = whole.scrollHeight;
      const heights = rows(whole).map((el) => el.getBoundingClientRect().height);
      const least = Math.min(...heights);
      const tallest = Math.max(...heights);
      whole.remove();

      const ul = virtualList();
      const list = enhance(ul, { keys, row: historyItem });
      // Rows a view can hold at their least height, a part row at each
      // edge, and five past each edge.
      const bound = Math.ceil(ul.clientHeight / least) + 1 + 2 * 5;
      let most = rows(ul).length;
      // Each step reveals a row past the last one drawn by fewer rows than
      // the view holds, so the rows between are in view once it is scrolled
      // to, and every row is drawn once in this task.
      const ahead = Math.max(1, Math.floor(ul.clientHeight / tallest) - 1);
      for (let step = 0; step < 20_000; step += 1) {
        const next = Number(rows(ul).at(-1)?.dataset["key"]?.slice(1)) + ahead;
        list.reveal(`t${String(Math.min(next, keys.length - 1))}`);
        most = Math.max(most, rows(ul).length);
        if (next >= keys.length - 1) {
          break;
        }
      }
      await frames();
      expect(most).toBeLessThanOrEqual(bound);
      expect(Math.abs(ul.scrollHeight - height)).toBeLessThan(1);
      const last = list.rowOf("t9999") as HTMLElement;
      expect(Math.abs(offsetIn(ul, last) - (placed[2] ?? 0))).toBeLessThan(1);
      for (const [n, key] of marks.entries()) {
        const row = list.reveal(key, { scroll: false }) as HTMLElement;
        expect(Math.abs(offsetIn(ul, row) - (placed[n] ?? 0))).toBeLessThan(1);
      }
    }, 120_000);

    it("scrolls a far row into view, where it stays as the rows around it are measured", async () => {
      const ul = virtualList();
      const list = enhance(ul, { keys: keysOf(10_000), row: historyItem });
      const row = list.reveal("t7003") as HTMLElement;
      const inView = (): boolean => {
        const box = row.getBoundingClientRect();
        const view = ul.getBoundingClientRect();
        return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
      };
      expect(inView()).toBe(true);
      await frames();
      await frames();
      expect(row.isConnected).toBe(true);
      expect(inView()).toBe(true);
    });

    it("ends a windowed table body of mixed heights where it ends drawn whole", async () => {
      /** A body of copies, every fifth with a second line, in its panel. */
      const panelOf = (): { panel: HTMLDivElement; body: HTMLTableSectionElement } => {
        const panel = document.createElement("div");
        panel.style.blockSize = "15rem";
        panel.style.inlineSize = "40rem";
        panel.style.overflowY = "auto";
        const table = document.createElement("table");
        table.className = "cp-table";
        const body = table.createTBody();
        body.dataset["virtual"] = "";
        panel.append(table);
        document.body.append(panel);
        return { panel, body };
      };
      const copy = (key: string): HTMLTableRowElement => {
        const tr = copyRow(key);
        if (Number(key.slice(1)) % 5 === 0) {
          const line = document.createElement("div");
          line.textContent = "Kept: the release with the better subtitles";
          tr.cells[0]?.append(line);
        }
        return tr;
      };
      const keys = keysOf(400);
      const whole = panelOf();
      const all = enhanceKeyedList(whole.body, {
        keys,
        row: copy,
        window: false,
        signal: life.signal,
      });
      const end = offsetIn(whole.panel, all.rowOf("t399") as HTMLElement);
      const height = whole.panel.scrollHeight;
      whole.panel.remove();

      const { panel, body } = panelOf();
      const list = enhanceKeyedList(body, { keys, row: copy, signal: life.signal });
      for (let step = 0; step < 2000; step += 1) {
        if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1) {
          break;
        }
        panel.scrollTop += panel.clientHeight;
        await frames();
      }
      expect(Math.abs(panel.scrollHeight - height)).toBeLessThan(1);
      expect(Math.abs(offsetIn(panel, list.rowOf("t399") as HTMLElement) - end)).toBeLessThan(1);
    });

    it("draws a day's heading as an item of the list: no line above it, the space a group's heading has, lined up with the rows", () => {
      const item = (inner: string) => `<li>${inner}</li>`;
      const heading = (day: string) => item(`<h3 class="cp-list-heading">${day}</h3>`);
      const row = item('<div class="cp-list-row"><span class="cp-cell-stack">Grabbed</span></div>');
      document.body.insertAdjacentHTML(
        "beforeend",
        `<ul class="cp-list">${heading("Today")}${row}${row}${heading("Yesterday")}${row}</ul>` +
          `<ol class="cp-list" data-variant="timeline" data-surface="plain">${heading("Today")}${row}${row}${heading("Yesterday")}${row}</ol>`,
      );
      const [boxed, timeline] = [...document.querySelectorAll<HTMLElement>(".cp-list")] as [
        HTMLElement,
        HTMLElement,
      ];
      const items = [...boxed.children];
      const style = (el: Element | undefined, pseudo?: string) =>
        getComputedStyle(el as Element, pseudo);
      const rem = Number.parseFloat(style(document.documentElement).fontSize);
      expect(items.map((li) => style(li).borderBlockStartWidth)).toEqual([
        "0px",
        "1px",
        "1px",
        "0px",
        "1px",
      ]);
      const [first, second] = [...boxed.querySelectorAll(".cp-list-heading")];
      expect(style(first).marginBlockStart).toBe("0px");
      expect(style(second).marginBlockStart).toBe(`${String(rem)}px`);
      expect(style(second).marginBlockEnd).toBe(`${String(rem / 2)}px`);
      // Only the first clears the box's edge; the others have their margin.
      expect([style(first).paddingBlockStart, style(second).paddingBlockStart]).toEqual([
        `${String(0.75 * rem)}px`,
        "0px",
      ]);
      expect(style(second).paddingInlineStart).toBe(
        style(boxed.querySelector(".cp-list-row") ?? undefined).paddingInlineStart,
      );
      // A timeline's line joins the marks of one day only.
      const lines = [...timeline.children].map((li) => style(li, "::before").content);
      expect(lines).toEqual(["none", '""', "none", "none", "none"]);
      expect(
        style(timeline.querySelector(".cp-list-heading") ?? undefined).paddingInlineStart,
      ).toBe("0px");
      boxed.dataset["density"] = "compact";
      expect(style(second).paddingInlineStart).toBe(
        style(boxed.querySelector(".cp-list-row") ?? undefined).paddingInlineStart,
      );
    });
  });

  describe("in a box taller than the window, or one that grows with its rows", () => {
    interface Shape {
      readonly ul: HTMLUListElement;
      /** What the reader scrolls. */
      readonly scroller: HTMLElement;
    }
    const page = (): HTMLElement => document.scrollingElement as HTMLElement;
    const SHAPES: readonly (readonly [string, () => Shape])[] = [
      [
        "its own scroller, taller than the window",
        () => {
          const ul = virtualList();
          ul.style.setProperty("--cp-list-h", "300vh");
          return { ul, scroller: ul };
        },
      ],
      [
        "a scrolling box taller than the window",
        () => {
          const box = document.createElement("div");
          box.style.blockSize = "300vh";
          box.style.overflowY = "auto";
          const ul = document.createElement("ul");
          ul.className = "cp-list";
          box.append(ul);
          document.body.append(box);
          return { ul, scroller: box };
        },
      ],
      [
        "a clipping box that grows with it",
        () => {
          const box = document.createElement("div");
          box.style.overflowY = "clip";
          const ul = document.createElement("ul");
          ul.className = "cp-list";
          box.append(ul);
          document.body.append(box);
          return { ul, scroller: page() };
        },
      ],
      [
        "a list set to scroll that grows with its rows",
        () => {
          const ul = virtualList();
          ul.style.blockSize = "auto";
          ul.style.contain = "none";
          return { ul, scroller: page() };
        },
      ],
    ];

    /** The top of what `scroller` shows, in px of the window. */
    const viewTop = (scroller: HTMLElement): number =>
      scroller === page() ? 0 : Math.max(0, scroller.getBoundingClientRect().top);

    /** Spies on every way to move a scroller; each calls through. */
    function scrollWrites() {
      return {
        by: vi.spyOn(Element.prototype, "scrollBy"),
        top: vi.spyOn(Element.prototype, "scrollTop", "set"),
        to: vi.spyOn(Element.prototype, "scrollTo"),
        windowTo: vi.spyOn(window, "scrollTo"),
        windowBy: vi.spyOn(window, "scrollBy"),
      };
    }

    afterEach(() => {
      document.documentElement.style.removeProperty("overflow-anchor");
    });

    it.each(SHAPES)("draws no more rows than the window holds, in %s", async (_, make) => {
      const { ul, scroller } = make();
      enhance(ul, { keys: keysOf(5000) });
      const pitch = pitchOf(ul);
      // The rows the window holds, a part row at each edge, five past each.
      const bound = Math.ceil(innerHeight / pitch) + 1 + 2 * 5;
      expect(rows(ul).length).toBeLessThanOrEqual(bound);
      scroller.scrollTop += 2000 * pitch;
      await frames();
      expect(rows(ul).length).toBeLessThanOrEqual(bound);
      expect(rowAt(ul, viewTop(scroller)).dataset["key"]).toMatch(/^t(19\d\d|20\d\d)$/);
    });

    it.each(SHAPES)(
      "keeps the row in view still by a relative scroll when a row above it grows, in %s",
      async (_, make) => {
        const { ul, scroller } = make();
        // With the engine's anchoring off, the module alone keeps the place.
        scroller.style.overflowAnchor = "none";
        enhance(ul, { keys: keysOf(5000) });
        scroller.scrollTop += 300.5 * pitchOf(ul);
        await frames();
        const top = viewTop(scroller);
        const seen = rowAt(ul, top);
        const was = seen.getBoundingClientRect().top;
        const above = rows(ul)[0] as HTMLElement;
        expect(above.getBoundingClientRect().bottom).toBeLessThan(top);
        const from = scroller.scrollTop;
        const writes = scrollWrites();
        (above.firstElementChild as HTMLElement).style.minBlockSize = "10rem";
        await frames();
        await frames();
        expect(Math.abs(seen.getBoundingClientRect().top - was)).toBeLessThan(1);
        // The grown row's slot moves the guess for the rows not drawn too, so
        // the scroller may move by more than the row grew, all of it relative.
        expect(writes.by).toHaveBeenCalled();
        const moved = (writes.by.mock.calls as unknown as readonly [ScrollToOptions][]).reduce(
          (sum, [how]) => sum + (how.top ?? 0),
          0,
        );
        expect(Math.abs(scroller.scrollTop - from - moved)).toBeLessThan(1);
        expect(writes.top).not.toHaveBeenCalled();
        expect(writes.to).not.toHaveBeenCalled();
        expect(writes.windowTo).not.toHaveBeenCalled();
        expect(writes.windowBy).not.toHaveBeenCalled();
      },
    );

    it.each(SHAPES)(
      "keeps a drawn row that grows above the view, with the app's patch, under the engine's own anchoring, in %s",
      async (_, make) => {
        const { ul, scroller } = make();
        const list = enhance(ul, { keys: keysOf(5000) });
        scroller.scrollTop += 300.5 * pitchOf(ul);
        await frames();
        const top = viewTop(scroller);
        const seen = rowAt(ul, top);
        const was = seen.getBoundingClientRect().top;
        const above = rows(ul)[0] as HTMLElement;
        const key = above.dataset["key"] ?? "";
        expect(above.getBoundingClientRect().bottom).toBeLessThan(top);
        // A resize observer runs after layout and before paint, so it reads
        // the place the reader sees in the frame the growth is painted.
        const painted: number[] = [];
        let grown = false;
        const watch = new ResizeObserver(() => {
          if (grown) {
            painted.push(seen.getBoundingClientRect().top - was);
          }
        });
        watch.observe(above);
        await frames();
        grown = true;
        // The app's patch: a row's details opened, which `row` does not know.
        above.dataset["open"] = "";
        (above.firstElementChild as HTMLElement).style.minBlockSize = "10rem";
        await frames();
        await frames();
        watch.disconnect();
        expect(list.rowOf(key)).toBe(above);
        expect(above.dataset["open"]).toBe("");
        expect(Math.abs(seen.getBoundingClientRect().top - was)).toBeLessThan(1);
        expect(painted.length).toBeGreaterThan(0);
        expect(Math.abs(painted[0] ?? Infinity)).toBeLessThan(1);
      },
    );

    it.each(SHAPES)(
      "goes back to the list's start by a relative scroll on a new set of rows, in %s",
      async (_, make) => {
        const { ul, scroller } = make();
        const list = enhance(ul, { keys: keysOf(5000) });
        const pitch = pitchOf(ul);
        scroller.scrollTop += 2000 * pitch;
        await frames();
        const writes = scrollWrites();
        list.reset(keysOf(500, 1));
        const first = list.rowOf("t1") as HTMLElement;
        expect(Math.abs(first.getBoundingClientRect().top - viewTop(scroller))).toBeLessThan(pitch);
        expect(writes.by).toHaveBeenCalled();
        expect(writes.top).not.toHaveBeenCalled();
        expect(writes.to).not.toHaveBeenCalled();
        expect(writes.windowTo).not.toHaveBeenCalled();
      },
    );
  });

  it("draws in the frame after a resize or a visual viewport scroll, never inside the event", async () => {
    const ul = virtualList();
    enhance(ul, { keys: keysOf(20_000) });
    const first = keysIn(ul);
    ul.scrollTop = 5000 * pitchOf(ul);
    dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent(new Event("scroll"));
    expect(keysIn(ul)).toEqual(first);
    await frames();
    expect(keysIn(ul)).not.toEqual(first);
  });

  it("stops following the scroll once its signal aborts", async () => {
    const ul = virtualList();
    const stop = new AbortController();
    enhance(ul, { keys: keysOf(20_000), signal: stop.signal });
    const first = keysIn(ul);
    stop.abort();
    ul.scrollTop = 5000 * pitchOf(ul);
    await frames();
    expect(keysIn(ul)).toEqual(first);
  });
});
