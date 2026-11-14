import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
