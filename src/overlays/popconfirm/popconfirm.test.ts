import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnchors } from "../anchor/anchor.js";
import { enhancePopconfirm } from "./popconfirm.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
    p.hidePopover();
  }
  document.body.replaceChildren();
});

function page(form = true): {
  opener: HTMLButtonElement;
  pop: HTMLElement;
  yes: HTMLButtonElement;
  no: HTMLButtonElement;
} {
  const root = document.createElement("div");
  const answers =
    '<button id="yes">Remove</button><button id="no" type="button" commandfor="pc" command="hide-popover">Keep it</button>';
  // Static test markup, never caller text.
  root.setHTMLUnsafe(
    '<button type="button" id="opener" popovertarget="pc">Remove</button>' +
      `<div class="cp-popover" data-variant="confirm" popover id="pc"><p>Remove this label?</p>${form ? `<form>${answers}</form>` : answers}</div>`,
  );
  document.body.append(root);
  const get = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  return {
    opener: get("opener") as HTMLButtonElement,
    pop: get("pc"),
    yes: get("yes") as HTMLButtonElement,
    no: get("no") as HTMLButtonElement,
  };
}

describe("enhancePopconfirm", () => {
  it("puts focus on the decline as it opens", async () => {
    const { opener, pop, no } = page();
    enhancePopconfirm(pop, { onConfirm: () => undefined, signal: life.signal });
    await userEvent.click(opener);
    expect(pop.matches(":popover-open")).toBe(true);
    expect(document.activeElement).toBe(no);
  });

  it("closes on the decline without confirming, and focus goes back to the opener", async () => {
    const { opener, pop, no } = page();
    let confirmed = 0;
    enhancePopconfirm(pop, { onConfirm: () => (confirmed += 1), signal: life.signal });
    opener.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(no);
    expect(pop.matches(":popover-open")).toBe(false);
    expect(confirmed).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it("confirms once on its submit, after closing with focus back on the opener", async () => {
    installAnchors({ signal: life.signal });
    const { opener, pop, yes } = page();
    const seen: { open: boolean; focus: Element | null }[] = [];
    enhancePopconfirm(pop, {
      onConfirm: () =>
        seen.push({ open: pop.matches(":popover-open"), focus: document.activeElement }),
      signal: life.signal,
    });
    await userEvent.click(opener);
    await userEvent.click(yes);
    expect(seen).toEqual([{ open: false, focus: opener }]);
  });

  it("gives focus back to the opener on confirm though the opener never had it", async () => {
    installAnchors({ signal: life.signal });
    const { opener, pop } = page();
    enhancePopconfirm(pop, { onConfirm: () => undefined, signal: life.signal });
    // As Safari does on a click: the popover opens with focus on the page.
    opener.click();
    (document.activeElement as HTMLElement | null)?.blur();
    pop.querySelector("form")?.requestSubmit();
    expect(document.activeElement).toBe(opener);
  });

  it("gives focus back to the opener on the decline though the opener never had it", () => {
    installAnchors({ signal: life.signal });
    const { opener, pop, no } = page();
    let confirmed = 0;
    enhancePopconfirm(pop, { onConfirm: () => (confirmed += 1), signal: life.signal });
    // As Safari does on a click: the popover opens with focus on the page.
    opener.click();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(pop.matches(":popover-open")).toBe(true);
    no.click();
    expect(pop.matches(":popover-open")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(confirmed).toBe(0);
  });

  it("gives focus back to the opener on Escape though the opener never had it", async () => {
    installAnchors({ signal: life.signal });
    const { opener, pop, no } = page();
    enhancePopconfirm(pop, { onConfirm: () => undefined, signal: life.signal });
    opener.click();
    (document.activeElement as HTMLElement | null)?.blur();
    no.focus();
    await userEvent.keyboard("{Escape}");
    expect(pop.matches(":popover-open")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("becomes an alertdialog named by its question, and keeps a role and name it has", () => {
    const a = page();
    enhancePopconfirm(a.pop, { onConfirm: () => undefined, signal: life.signal });
    const q = a.pop.querySelector("p");
    expect(a.pop.getAttribute("role")).toBe("alertdialog");
    expect(q?.id).not.toBe("");
    expect(a.pop.getAttribute("aria-labelledby")).toBe(q?.id);
    document.body.replaceChildren();
    const b = page();
    b.pop.setAttribute("role", "dialog");
    b.pop.setAttribute("aria-label", "Remove");
    enhancePopconfirm(b.pop, { onConfirm: () => undefined, signal: life.signal });
    expect(b.pop.getAttribute("role")).toBe("dialog");
    expect(b.pop.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("throws for a popover with no form", () => {
    const { pop } = page(false);
    expect(() => {
      enhancePopconfirm(pop, { onConfirm: () => undefined });
    }).toThrow(TypeError);
  });

  it("stops confirming and moving focus once its signal aborts", async () => {
    const { opener, pop, no } = page();
    let confirmed = 0;
    enhancePopconfirm(pop, { onConfirm: () => (confirmed += 1), signal: life.signal });
    life.abort();
    await userEvent.click(opener);
    expect(document.activeElement).not.toBe(no);
    pop.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
    });
    pop.querySelector("form")?.requestSubmit();
    expect(confirmed).toBe(0);
  });
});
