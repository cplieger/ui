/**
 * security.ts — what the Account and security tests share: the system
 * stylesheet loaded around each test, the screen mounted on a fake, and
 * queries for its rows, buttons, dialogs, fields and notices.
 */

import { afterEach, beforeEach, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { AccountAction } from "../run.js";
import { mountSecurity, type SecurityOptions, type SecurityScreen } from "../security.js";
import { Fake, type FakeClient } from "./fake.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

/** Loads the system stylesheet before each test, and ends each test's
 *  screen and page after it. Call once at the top of a test file. */
export function useScreen(): void {
  beforeEach(async () => {
    // Dialogs close without their exit glide, so an assertion after a close
    // never waits on animation frames a loaded host starves.
    const real = matchMedia.bind(window);
    vi.stubGlobal("matchMedia", (q: string) =>
      real(q.includes("prefers-reduced-motion: reduce") ? "all" : q),
    );
    document.documentElement.classList.add("cp");
    sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = new URL("../../../../css/system.css", import.meta.url).href;
    const loaded = new Promise((resolve, reject) => {
      sheet.addEventListener("load", resolve, { once: true });
      sheet.addEventListener("error", reject, { once: true });
    });
    document.head.append(sheet);
    await loaded;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    life.abort();
    life = new AbortController();
    sheet.remove();
    document.documentElement.classList.remove("cp");
    document.body.replaceChildren();
  });
}

export type Options = Partial<Omit<SecurityOptions<FakeClient>, "client" | "access">>;

export interface Mounted {
  readonly fake: Fake;
  readonly region: HTMLElement;
  readonly ran: AccountAction[];
  readonly went: string[];
  readonly screen: SecurityScreen;
}

/** Mounts the screen on `fake`, recording every write's name and every
 *  address it opens. */
export function mount(fake = new Fake(), options: Options = {}): Mounted {
  const region = document.createElement("div");
  document.body.append(region);
  const ran: AccountAction[] = [];
  const went: string[] = [];
  const screen = mountSecurity(region, {
    client: fake.client,
    access: fake.access(),
    app: "Release tracker",
    provider: "Authelia",
    search: "",
    run: (name, work) => {
      ran.push(name);
      return work();
    },
    navigate: (url) => {
      went.push(url);
    },
    signal: life.signal,
    ...options,
  });
  return { fake, region, ran, went, screen };
}

const shown = (el: Element): boolean => el.closest("[hidden]") === null;

export const ready = (region: HTMLElement): Promise<HTMLTableElement> =>
  vi.waitFor(() => {
    const t = region.querySelector<HTMLTableElement>("table.cp-table");
    expect(t).not.toBeNull();
    return t!;
  });

/** The methods table's row for `name`. */
export const rowOf = (region: HTMLElement, name: string): HTMLTableRowElement => {
  const row = [...region.querySelectorAll<HTMLTableRowElement>("tbody tr")].find(
    (r) => r.cells[0]?.textContent === name,
  );
  expect(row, name).toBeDefined();
  return row!;
};

export const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => shown(x) && x.textContent.includes(text),
  );
  expect(b, text).toBeDefined();
  return b!;
};

export const words = (root: ParentNode): string[] =>
  [...root.querySelectorAll<HTMLButtonElement>("button")]
    .filter((b) => shown(b) && b.closest(".cp-input-wrap") === null)
    .map((b) => b.textContent.trim());

/** The actions a row offers: its button, or the items of its ⋯ menu. */
export const actions = (row: HTMLElement): string[] => {
  const menu = row.querySelector("[role='menu']");
  return menu === null
    ? [...(row.querySelector("[data-col='actions']")?.querySelectorAll("button") ?? [])].map(nameOf)
    : [...menu.querySelectorAll("[role='menuitem']")].map((i) => i.textContent);
};

/** A button's accessible name, as a screen reader hears it. */
const nameOf = (b: HTMLElement): string => b.getAttribute("aria-label") ?? b.textContent.trim();

/** The row's own button named `name`. */
export const named = (row: HTMLElement, name: string): HTMLButtonElement => {
  const b = [...row.querySelectorAll<HTMLButtonElement>("[data-col='actions'] button")].find(
    (x) => nameOf(x) === name,
  );
  expect(b, name).toBeDefined();
  return b!;
};

/** Presses the row's action worded `text`, through its ⋯ menu when the
 *  row has more than one. Answers the control that opened it. */
export async function press(row: HTMLElement, text: string): Promise<HTMLButtonElement> {
  const cell = row.querySelector("[data-col='actions']")!;
  const menu = cell.querySelector<HTMLElement>("[role='menu']");
  if (menu === null) {
    const b = named(row, text);
    await userEvent.click(b);
    return b;
  }
  const more = cell.querySelector<HTMLButtonElement>("[popovertarget]")!;
  await userEvent.click(more);
  const item = [...menu.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
    (i) => i.textContent === text,
  );
  expect(item, text).toBeDefined();
  await userEvent.click(item!);
  return more;
}

/** The passkeys table's rows. */
export const passkeyRows = (region: HTMLElement): HTMLTableRowElement[] => [
  ...([...region.querySelectorAll<HTMLTableElement>("table")][1]?.tBodies[0]?.rows ?? []),
];

export const dialogOf = (title: string): Promise<HTMLDialogElement> =>
  vi.waitFor(() => {
    const d = [...document.querySelectorAll<HTMLDialogElement>("dialog.cp-dialog")].find(
      (x) => x.open && x.querySelector("h2")?.textContent === title,
    );
    expect(d, title).toBeDefined();
    return d!;
  });

export const field = (root: ParentNode, name: string): HTMLInputElement =>
  root.querySelector<HTMLInputElement>(`input[name='${name}']`)!;

export const errorOf = (input: HTMLInputElement | HTMLSelectElement): string => {
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const id = (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .find((x) => document.getElementById(x)?.classList.contains("cp-field-error"));
  return id === undefined ? "" : (document.getElementById(id)?.textContent ?? "");
};

export const noticeOf = (root: ParentNode): string =>
  root.querySelector("[data-part='notice'] .cp-notice [data-part='body']")?.textContent ?? "";

/** Answers the open `ask()` question with its button worded `answer`. */
export async function answerQuestion(title: string, answer: string): Promise<void> {
  const d = await dialogOf(title);
  await userEvent.click(button(d, answer));
}
