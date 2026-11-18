import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import type { ListAnswer, PageQuery, Result } from "./client.js";
import { everyPage, pager, type PagerSpec } from "./pages.js";
import { ok, pageOf, refuse } from "./test-helpers/fake.js";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(history.state, "", location.pathname + location.search);
});

const numbers = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe("everyPage", () => {
  it("reads every item in order, 200 at a time, by each next cursor", async () => {
    const asked: PageQuery[] = [];
    const list = numbers(450);
    const got = await everyPage((q) => {
      asked.push(q);
      return Promise.resolve(ok(pageOf(list, q)));
    });
    expect(got).toEqual({ ok: true, data: list });
    expect(asked).toEqual([
      { limit: 200 },
      { cursor: "at-200", limit: 200 },
      { cursor: "at-400", limit: 200 },
    ]);
  });

  it("answers the first refused page's refusal", async () => {
    const refused = refuse(503, "auth_unavailable");
    let n = 0;
    const got = await everyPage((q) => {
      n += 1;
      return Promise.resolve(n === 2 ? refused : ok(pageOf(numbers(450), q)));
    });
    expect(got).toBe(refused);
    expect(n).toBe(2);
  });

  it("answers a read that threw as no answer", async () => {
    const got = await everyPage(() => Promise.reject(new TypeError("offline")));
    expect(got).toMatchObject({ ok: false, status: 0 });
  });

  it("stops after a thousand pages of a list that never ends", async () => {
    let n = 0;
    const endless = (): Promise<Result<ListAnswer<number>>> => {
      n += 1;
      return Promise.resolve(ok({ items: [n], next_cursor: "again", offset: n, total: n + 1 }));
    };
    const got = await everyPage(endless);
    expect(got).toMatchObject({ ok: false, status: 0 });
    expect(n).toBe(1000);
  });
});

describe("pager", () => {
  const words = {
    label: "Pages of the list",
    prev: "Previous",
    next: "Next",
    range: (first: string, last: string, total: string) => `${first} to ${last} of ${total}`,
  };

  function draw(page: ListAnswer<unknown>, spec: Partial<PagerSpec> = {}) {
    const went: string[] = [];
    const nav = pager(page, {
      words,
      key: "list",
      href: (cursor) => `#cursor=${cursor}`,
      go: (cursor) => {
        went.push(cursor);
      },
      ...spec,
    });
    document.body.append(nav);
    const link = (text: string): HTMLAnchorElement =>
      [...nav.querySelectorAll("a")].find((a) => a.textContent === text)!;
    return { nav, went, link };
  }

  it("says where the page sits and links each side the answer has a cursor for", async () => {
    const { nav, went, link } = draw({
      items: numbers(50),
      prev_cursor: "p1",
      next_cursor: "n1",
      offset: 1000,
      total: 1659,
    });
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Pages of the list");
    expect(nav.querySelector("span")?.textContent).toBe(
      `${(1001).toLocaleString()} to ${(1050).toLocaleString()} of ${(1659).toLocaleString()}`,
    );
    expect(link("Previous").getAttribute("href")).toBe("#cursor=p1");
    expect(link("Next").dataset["cpAction"]).toBe("list-next");
    await userEvent.click(link("Next"));
    await userEvent.click(link("Previous"));
    expect(went).toEqual(["n1", "p1"]);
  });

  it("leaves a side with no cursor disabled with no address", () => {
    const { link } = draw({ items: [1, 2], offset: 0, total: 2 });
    for (const text of ["Previous", "Next"]) {
      expect(link(text).getAttribute("aria-disabled")).toBe("true");
      expect(link(text).hasAttribute("href")).toBe(false);
    }
  });

  it("leaves a modified press to the browser", () => {
    const { went, link } = draw({ items: [1], next_cursor: "n1", offset: 0, total: 2 });
    const press = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    link("Next").dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    expect(went).toEqual([]);
  });

  it("stops following presses once its signal ends", async () => {
    const life = new AbortController();
    const { went, link } = draw(
      { items: [1], next_cursor: "n1", offset: 0, total: 2 },
      { signal: life.signal },
    );
    life.abort();
    await userEvent.click(link("Next"));
    expect(went).toEqual([]);
  });

  it("says nothing of a place for an empty page", () => {
    const { nav } = draw({ items: [], offset: 0, total: 0 });
    expect(nav.querySelector("span")?.textContent).toBe("");
  });
});
