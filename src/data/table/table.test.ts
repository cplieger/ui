import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceSelectAll } from "../../forms/checkbox/checkbox.js";
import { enhanceBatchBar, enhanceSort, type BatchSelection } from "./table.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

function sortable(): HTMLTableElement {
  const box = document.createElement("div");
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    '<table class="cp-table"><thead><tr>' +
      '<th aria-sort="ascending"><button class="cp-sort" type="button">Title</button></th>' +
      '<th><button class="cp-sort" type="button">Size</button></th><th>Note</th>' +
      "</tr></thead><tbody>" +
      '<tr id="a"><td>Arid</td><td data-sort="9">9 GB</td><td></td></tr>' +
      '<tr id="a-why" data-part="detail"><td colspan="3">why</td></tr>' +
      '<tr id="b"><td>Bocchi</td><td data-sort="10">10 GB</td><td></td></tr>' +
      '<tr id="c"><td>chainsaw</td><td data-sort="0.5">None</td><td></td></tr>' +
      "</tbody></table>",
  );
  document.body.append(box);
  return box.querySelector("table") as HTMLTableElement;
}

const ids = (table: HTMLTableElement) => [...table.tBodies[0]!.rows].map((r) => r.id);
const sorts = (table: HTMLTableElement) =>
  [...table.querySelectorAll("th")].map((th) => th.getAttribute("aria-sort"));
const labels = (table: HTMLTableElement) =>
  [...table.querySelectorAll(".cp-sort")].map((b) => b.getAttribute("aria-label"));

describe("enhanceSort", () => {
  it("names the order each header's press applies", () => {
    const table = sortable();
    enhanceSort(table, { signal: life.signal });
    expect(labels(table)).toEqual(["Sort by Title, descending", "Sort by Size, ascending"]);
  });

  it("sorts numbers as numbers, turns the order on a second press, and keeps a detail row after its row", async () => {
    installAnnouncer({ signal: life.signal });
    const table = sortable();
    enhanceSort(table, { signal: life.signal });
    const size = table.querySelectorAll<HTMLButtonElement>(".cp-sort")[1] as HTMLButtonElement;
    await userEvent.click(size);
    expect(ids(table)).toEqual(["c", "a", "a-why", "b"]);
    expect(sorts(table)).toEqual([null, "ascending", null]);
    expect(labels(table)).toEqual(["Sort by Title, ascending", "Sort by Size, descending"]);
    await expect.poll(polite).toBe("Sorted by Size, ascending");
    await userEvent.click(size);
    expect(ids(table)).toEqual(["b", "a", "a-why", "c"]);
    expect(sorts(table)).toEqual([null, "descending", null]);
    await expect.poll(polite).toBe("Sorted by Size, descending");
  });

  it("sorts words by the language's order, whatever their case", async () => {
    const table = sortable();
    enhanceSort(table, { signal: life.signal });
    await userEvent.click(table.querySelector(".cp-sort") as HTMLButtonElement);
    expect(ids(table)).toEqual(["c", "b", "a", "a-why"]);
  });

  it("leaves the rows to an app that sorts them itself, and takes its words", async () => {
    const table = sortable();
    const seen: [string, string][] = [];
    enhanceSort(table, {
      onSort: (th, order) => seen.push([th.textContent, order]),
      words: { sort: (c, o) => `${c} ${o === "ascending" ? "A to Z" : "Z to A"}` },
      signal: life.signal,
    });
    expect(labels(table)).toEqual(["Title Z to A", "Size A to Z"]);
    await userEvent.click(table.querySelector(".cp-sort") as HTMLButtonElement);
    expect(seen).toEqual([["Title", "descending"]]);
    expect(ids(table)).toEqual(["a", "a-why", "b", "c"]);
    expect(sorts(table)).toEqual(["descending", null, null]);
  });

  it("stops with its signal", async () => {
    const table = sortable();
    enhanceSort(table, { signal: life.signal });
    life.abort();
    await userEvent.click(
      table.querySelectorAll<HTMLButtonElement>(".cp-sort")[1] as HTMLButtonElement,
    );
    expect(ids(table)).toEqual(["a", "a-why", "b", "c"]);
  });
});

interface Bar {
  bar: HTMLElement;
  all: HTMLInputElement;
  boxes: HTMLInputElement[];
  every: HTMLButtonElement;
  clear: HTMLButtonElement;
  grab: HTMLButtonElement;
  count: HTMLElement;
}

function batch(rows = 3): Bar {
  const box = document.createElement("div");
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    '<section class="cp-batchbar" aria-label="Selected entries" hidden><span class="cp-batch-count"></span>' +
      '<button type="button" data-batch-every hidden>Select all</button>' +
      '<button type="button" data-batch-clear>Clear</button>' +
      '<button type="button" data-batch-action="Grab"><span class="cp-icon"></span><span class="cp-roll">Grab</span></button>' +
      '</section><table class="cp-table"><thead><tr><th data-col="select"><input type="checkbox" id="all"></th></tr></thead><tbody>' +
      '<tr><td data-col="select"><input type="checkbox"></td></tr>'.repeat(rows) +
      "</tbody></table>",
  );
  document.body.append(box);
  const all = box.querySelector("#all") as HTMLInputElement;
  const boxes = [...box.querySelectorAll<HTMLInputElement>("tbody input")];
  enhanceSelectAll(all, () => boxes, { signal: life.signal });
  return {
    bar: box.querySelector(".cp-batchbar") as HTMLElement,
    all,
    boxes,
    every: box.querySelector("[data-batch-every]") as HTMLButtonElement,
    clear: box.querySelector("[data-batch-clear]") as HTMLButtonElement,
    grab: box.querySelector("[data-batch-action]") as HTMLButtonElement,
    count: box.querySelector(".cp-batch-count") as HTMLElement,
  };
}

describe("enhanceBatchBar", () => {
  it("shows the bar with the count while rows are selected, the actions naming it", async () => {
    installAnnouncer({ signal: life.signal });
    const b = batch();
    const seen: BatchSelection[] = [];
    enhanceBatchBar(b.bar, {
      boxes: () => b.boxes,
      all: b.all,
      onChange: (s) => seen.push({ ...s }),
      signal: life.signal,
    });
    expect(b.bar.hidden).toBe(true);
    expect(b.all.getAttribute("aria-label")).toBe("Select all 3 entries on this page");
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    await userEvent.click(b.boxes[2] as HTMLInputElement);
    expect(b.bar.hidden).toBe(false);
    expect(b.count.textContent).toBe("2 selected");
    expect(b.grab.querySelector(".cp-roll")?.textContent).toBe("Grab 2");
    expect(b.grab.querySelector(".cp-icon")).not.toBeNull();
    await expect.poll(polite).toBe("2 selected");
    expect(seen).toEqual([
      { count: 1, everything: false },
      { count: 2, everything: false },
    ]);
  });

  it("says a press of the header box once, with the count it ends on", async () => {
    installAnnouncer({ signal: life.signal });
    const b = batch();
    enhanceBatchBar(b.bar, { boxes: () => b.boxes, all: b.all, signal: life.signal });
    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;
    const said: string[] = [];
    new MutationObserver(() => {
      if (region.textContent !== "") {
        said.push(region.textContent);
      }
    }).observe(region, { childList: true, characterData: true, subtree: true });
    await userEvent.click(b.all);
    await expect.poll(() => said).toEqual(["3 selected"]);
    await new Promise((done) => setTimeout(done, 300));
    expect(said).toEqual(["3 selected"]);
  });

  it("offers every matching row once the whole page is selected, and counts them", async () => {
    const b = batch();
    const bar = enhanceBatchBar(b.bar, {
      boxes: () => b.boxes,
      all: b.all,
      total: () => 412,
      signal: life.signal,
    });
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    expect(b.every.hidden).toBe(true);
    await userEvent.click(b.all);
    expect([b.every.hidden, b.every.textContent]).toEqual([false, "Select all 412 entries"]);
    await userEvent.click(b.every);
    expect([bar.count, bar.everything, b.count.textContent, b.every.hidden]).toEqual([
      412,
      true,
      "412 selected",
      true,
    ]);
    expect(document.activeElement).toBe(b.clear);
    await userEvent.click(b.boxes[1] as HTMLInputElement);
    expect([bar.count, bar.everything]).toEqual([2, false]);
  });

  it("never offers more rows than the page holds", async () => {
    const b = batch();
    enhanceBatchBar(b.bar, { boxes: () => b.boxes, all: b.all, signal: life.signal });
    await userEvent.click(b.all);
    expect(b.every.hidden).toBe(true);
  });

  it("clears with Clear, returning focus to the header box, and says so", async () => {
    installAnnouncer({ signal: life.signal });
    const b = batch();
    enhanceBatchBar(b.bar, { boxes: () => b.boxes, all: b.all, signal: life.signal });
    await userEvent.click(b.all);
    await userEvent.click(b.clear);
    expect(b.boxes.map((x) => x.checked)).toEqual([false, false, false]);
    expect([b.all.checked, b.all.indeterminate]).toEqual([false, false]);
    expect(document.activeElement).toBe(b.all);
    await expect.poll(polite).toBe("Selection cleared");
    await expect.poll(() => b.bar.hidden).toBe(true);
  });

  it("clears on Escape in the table or the bar, unless an open popover takes it", async () => {
    const b = batch();
    enhanceBatchBar(b.bar, { boxes: () => b.boxes, all: b.all, signal: life.signal });
    const menu = document.createElement("div");
    menu.popover = "auto";
    document.body.append(menu);
    await userEvent.click(b.boxes[1] as HTMLInputElement);
    menu.showPopover();
    (b.boxes[1] as HTMLInputElement).focus();
    await userEvent.keyboard("{Escape}");
    expect([(b.boxes[1] as HTMLInputElement).checked, menu.matches(":popover-open")]).toEqual([
      true,
      false,
    ]);
    (b.boxes[1] as HTMLInputElement).focus();
    await userEvent.keyboard("{Escape}");
    expect((b.boxes[1] as HTMLInputElement).checked).toBe(false);
    expect(document.activeElement).toBe(b.all);
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    b.clear.focus();
    await userEvent.keyboard("{Escape}");
    expect((b.boxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("keeps a bulk action's words while its confirm runs, until sync", async () => {
    const b = batch();
    const bar = enhanceBatchBar(b.bar, { boxes: () => b.boxes, signal: life.signal });
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    b.grab.setAttribute("data-cp-state", "done");
    await userEvent.click(b.boxes[1] as HTMLInputElement);
    expect(b.grab.querySelector(".cp-roll")?.textContent).toBe("Grab 1");
    b.grab.removeAttribute("data-cp-state");
    bar.sync();
    expect(b.grab.querySelector(".cp-roll")?.textContent).toBe("Grab 2");
  });

  it("writes an action's words beside its icon when it has no roll", async () => {
    const b = batch();
    const plain = document.createElement("button");
    plain.dataset["batchAction"] = "Remove";
    plain.append(document.createElement("span"), "Remove");
    b.bar.append(plain);
    enhanceBatchBar(b.bar, { boxes: () => b.boxes, signal: life.signal });
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    expect([plain.childNodes.length, plain.textContent]).toEqual([2, "Remove 1"]);
  });

  it("counts rows added since through sync, and stops with its signal", async () => {
    const b = batch(1);
    const bar = enhanceBatchBar(b.bar, { boxes: () => b.boxes, all: b.all, signal: life.signal });
    const extra = document.createElement("input");
    extra.type = "checkbox";
    extra.checked = true;
    b.bar.after(extra);
    b.boxes.push(extra);
    bar.sync();
    expect([bar.count, b.all.getAttribute("aria-label")]).toEqual([
      1,
      "Select all 2 entries on this page",
    ]);
    life.abort();
    await userEvent.click(b.boxes[0] as HTMLInputElement);
    expect(bar.count).toBe(1);
  });
});
