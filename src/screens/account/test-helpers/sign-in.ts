/**
 * sign-in.ts — what the sign-in tests share: the system stylesheet loaded
 * around each test, the screen mounted on a fake, and queries for its
 * fields, buttons and notices.
 */

import { afterEach, beforeEach, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { mountSignIn, type SignInOptions } from "../sign-in.js";
import { Fake, type FakeClient } from "./fake.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

/** Loads the system stylesheet before each test, as an app's page links
 *  it, and ends each test's screen and page after it. Call once at the top
 *  of a test file. */
export function useSignIn(): void {
  beforeEach(async () => {
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

  afterEach(async () => {
    endScreen();
    sheet.remove();
    document.documentElement.classList.remove("cp");
    document.body.replaceChildren();
    await page.viewport(1280, 720);
  });
}

/** Aborts the screen's signal, as a host ending the page does. */
export function endScreen(): void {
  life.abort();
  life = new AbortController();
}

/** Aborts the signal the next mount takes before it runs. */
export function endBeforeMount(): void {
  life.abort();
}

export type Options = Omit<SignInOptions<FakeClient>, "client" | "access">;

export function mount(
  fake = new Fake(),
  options: Options = {},
): { panel: HTMLElement; fake: Fake } {
  const panel = document.createElement("section");
  panel.className = "cp-panel";
  document.body.append(panel);
  mountSignIn(panel, {
    client: fake.client,
    access: fake.access(),
    navigate: () => undefined,
    search: "",
    signal: life.signal,
    ...options,
  });
  return { panel, fake };
}

export const drawn = (panel: HTMLElement): Promise<void> =>
  vi.waitFor(() => {
    expect(panel.getAttribute("aria-busy")).toBeNull();
  });

export const noticeOf = (panel: HTMLElement): HTMLElement | null =>
  panel.querySelector<HTMLElement>("[data-part='notice'] > .cp-notice");

export const input = (panel: HTMLElement, name: string): HTMLInputElement =>
  panel.querySelector<HTMLInputElement>(`input[name='${name}']`)!;

export const submit = (panel: HTMLElement): HTMLButtonElement =>
  panel.querySelector<HTMLButtonElement>("button[type='submit']")!;

export const button = (panel: HTMLElement, text: string): HTMLElement =>
  [...panel.querySelectorAll<HTMLElement>("button, a")].find((b) => b.textContent.includes(text))!;

export async function signIn(
  panel: HTMLElement,
  username = "mika",
  password = "lantern harbour",
): Promise<void> {
  await userEvent.fill(input(panel, "username"), username);
  await userEvent.fill(input(panel, "password"), password);
  await userEvent.click(submit(panel));
}

/** Waits on real time until `check` holds. */
export async function settled(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(check()).toBe(true);
}

export const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`body > [data-cp-live-regions] [data-cp-politeness='${politeness}']`)
    ?.textContent ?? "";
