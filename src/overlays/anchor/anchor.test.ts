import { afterEach, describe, expect, it } from "vitest";

import { anchorOf, anchorTo, installAnchors, showPopoverAt } from "./anchor.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
    p.hidePopover();
  }
  document.body.replaceChildren();
});

function menuFor(...openers: string[]): { pop: HTMLElement; buttons: HTMLButtonElement[] } {
  const pop = document.createElement("div");
  pop.id = "menu";
  pop.popover = "auto";
  pop.textContent = "Menu";
  const buttons = openers.map((word) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = word;
    b.setAttribute("popovertarget", "menu");
    return b;
  });
  document.body.append(...buttons, pop);
  return { pop, buttons };
}

describe("installAnchors", () => {
  it("anchors a popover to the button that opens it, by one name per pair", () => {
    installAnchors({ signal: life.signal });
    const { pop, buttons } = menuFor("Row one");
    const [b] = buttons as [HTMLButtonElement];
    b.click();
    expect(pop.matches(":popover-open")).toBe(true);
    const name = b.style.getPropertyValue("anchor-name");
    expect(name).toMatch(/^--cp-anchor-\d+$/);
    expect(pop.style.getPropertyValue("position-anchor")).toBe(name);
  });

  it("moves a popover shared by several buttons to the one pressed", () => {
    installAnchors({ signal: life.signal });
    const { pop, buttons } = menuFor("Row one", "Row two");
    const [one, two] = buttons as [HTMLButtonElement, HTMLButtonElement];
    one.click();
    pop.hidePopover();
    two.click();
    expect(pop.style.getPropertyValue("position-anchor")).toBe(
      two.style.getPropertyValue("anchor-name"),
    );
    expect(one.style.getPropertyValue("anchor-name")).not.toBe(
      two.style.getPropertyValue("anchor-name"),
    );
  });

  it("follows a commandfor button with a popover command too", () => {
    installAnchors({ signal: life.signal });
    const { pop } = menuFor();
    const b = document.createElement("button");
    b.setAttribute("commandfor", "menu");
    b.setAttribute("command", "toggle-popover");
    document.body.append(b);
    b.click();
    expect(pop.style.getPropertyValue("position-anchor")).toBe(
      b.style.getPropertyValue("anchor-name"),
    );
  });

  it("leaves a button inside its own popover, and every press once its signals abort, alone", () => {
    installAnchors({ signal: life.signal });
    const { pop, buttons } = menuFor("Open");
    const inner = document.createElement("button");
    inner.setAttribute("popovertarget", "menu");
    pop.append(inner);
    pop.showPopover();
    inner.click();
    expect(inner.style.getPropertyValue("anchor-name")).toBe("");
    life.abort();
    (buttons[0] as HTMLButtonElement).click();
    expect((buttons[0] as HTMLButtonElement).style.getPropertyValue("anchor-name")).toBe("");
  });
});

describe("anchorTo and showPopoverAt", () => {
  it("opens a popover at a point, kept inside the window, and goes back to its anchor after", () => {
    const { pop, buttons } = menuFor("Open");
    pop.style.inlineSize = "200px";
    pop.style.blockSize = "120px";
    pop.style.position = "fixed";
    pop.style.margin = "0";
    showPopoverAt(pop, innerWidth - 10, 40);
    expect(pop.matches(":popover-open")).toBe(true);
    expect(pop.hasAttribute("data-cp-at")).toBe(true);
    const box = pop.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(innerWidth);
    expect(box.top).toBeCloseTo(40, 0);
    anchorTo(pop, buttons[0] as HTMLButtonElement);
    expect(pop.hasAttribute("data-cp-at")).toBe(false);
    expect(pop.style.left).toBe("");
  });

  it("names the element a popover sits by: the opener pressed last, none at a point", () => {
    installAnchors({ signal: life.signal });
    const { pop, buttons } = menuFor("Row one", "Row two");
    const [one, two] = buttons as [HTMLButtonElement, HTMLButtonElement];
    expect(anchorOf(pop)).toBeNull();
    one.click();
    expect(anchorOf(pop)).toBe(one);
    pop.hidePopover();
    two.click();
    expect(anchorOf(pop)).toBe(two);
    pop.hidePopover();
    showPopoverAt(pop, 10, 10);
    expect(anchorOf(pop)).toBeNull();
  });
});
