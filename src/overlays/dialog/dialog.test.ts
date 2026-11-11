import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { closeDialog, holdDialog, holdsTypedChanges, installDialogs } from "./dialog.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

function dialog(attrs: Record<string, string> = {}, inner = ""): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.className = "cp-dialog";
  // A box well inside the window, so a press at its corner is outside it.
  Object.assign(d.style, { inlineSize: "300px", blockSize: "200px", padding: "0", margin: "auto" });
  for (const [k, v] of Object.entries(attrs)) {
    d.setAttribute(k, v);
  }
  d.innerHTML = inner;
  document.body.append(d);
  return d;
}

const settled = () => new Promise((r) => setTimeout(r, 400));

describe("installDialogs", () => {
  it("closes a dialog marked closedby=any on a press that starts and ends outside it", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ closedby: "any" }, "<p>Hi</p>");
    d.showModal();
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    await settled();
    expect(d.open).toBe(false);
  });

  it("keeps a dialog open for a press inside it", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ closedby: "any" }, "<p>Hi</p>");
    d.showModal();
    await userEvent.click(d.querySelector("p") as HTMLElement);
    await settled();
    expect(d.open).toBe(true);
  });

  it("shakes a dialog holding typed changes instead of closing it, and closes it once they are gone", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ "data-keep-typed": "" }, '<input value="Sonarr">');
    d.showModal();
    const field = d.querySelector("input") as HTMLInputElement;
    field.value = "Sonarr 4K";
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect(d.open).toBe(true);
    expect(d.hasAttribute("data-cp-refused")).toBe(true);
    field.value = "Sonarr";
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    await settled();
    expect(d.open).toBe(false);
  });

  it("keeps a held dialog open on Escape and a press outside, shaking it, and closes it once released", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ closedby: "any" }, '<button type="button" id="done">Done</button>');
    let held = true;
    holdDialog(d, () => held, { signal: life.signal });
    d.showModal();
    (d.querySelector("#done") as HTMLButtonElement).focus();
    await userEvent.keyboard("{Escape}");
    await settled();
    expect(d.open).toBe(true);
    expect(d.hasAttribute("data-cp-refused")).toBe(true);
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    await settled();
    expect(d.open).toBe(true);
    held = false;
    await userEvent.keyboard("{Escape}");
    await settled();
    expect(d.open).toBe(false);
  });

  it("closes a held dialog when the person chooses to, by a close command", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({}, "");
    d.id = "held";
    const done = document.createElement("button");
    done.type = "button";
    done.setAttribute("commandfor", "held");
    done.setAttribute("command", "close");
    done.textContent = "Done";
    d.append(done);
    holdDialog(d, () => true, { signal: life.signal });
    d.showModal();
    await userEvent.click(done);
    await settled();
    expect(d.open).toBe(false);
  });

  it("measures the scrollbar the page lock pads by, and forgets it once its signals abort", () => {
    installDialogs({ signal: life.signal });
    const w = document.documentElement.style.getPropertyValue("--cp-scrollbar-w");
    expect(w).toBe(`${String(Math.max(0, innerWidth - document.documentElement.clientWidth))}px`);
    life.abort();
    expect(document.documentElement.style.getPropertyValue("--cp-scrollbar-w")).toBe("");
  });
});

describe("closeDialog", () => {
  it("closes with its return value, after the exit where the engine needs one", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog();
    d.showModal();
    closeDialog(d, "saved");
    closeDialog(d, "twice");
    await settled();
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("saved");
  });

  it("leaves a closed dialog alone", () => {
    const d = dialog();
    expect(() => {
      closeDialog(d, "x");
    }).not.toThrow();
    expect(d.returnValue).toBe("");
  });
});

describe("holdsTypedChanges", () => {
  it("compares each field with the value it opened with", () => {
    const d = dialog(
      {},
      '<input value="a"><textarea>b</textarea><select><option>x</option><option selected>y</option></select><input type="checkbox" checked>',
    );
    expect(holdsTypedChanges(d)).toBe(false);
    (d.querySelector("select") as HTMLSelectElement).selectedIndex = 0;
    expect(holdsTypedChanges(d)).toBe(true);
    (d.querySelector("select") as HTMLSelectElement).selectedIndex = 1;
    (d.querySelector('[type="checkbox"]') as HTMLInputElement).checked = false;
    expect(holdsTypedChanges(d)).toBe(true);
  });
});
