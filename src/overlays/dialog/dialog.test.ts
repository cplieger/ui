import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { closeDialog, holdDialog, installDialogs } from "./dialog.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

function dialog(
  attrs: Record<string, string> = {},
  inner = "",
  into: ParentNode = document.body,
): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.className = "cp-dialog";
  // A box well inside the window, so a press at its corner is outside it.
  Object.assign(d.style, { inlineSize: "300px", blockSize: "200px", padding: "0", margin: "auto" });
  for (const [k, v] of Object.entries(attrs)) {
    d.setAttribute(k, v);
  }
  d.innerHTML = inner;
  into.append(d);
  return d;
}

/** Counts each refusal: the attribute that plays the shake, set again. */
function refusals(d: HTMLDialogElement): () => number {
  let n = 0;
  const count = (records: MutationRecord[]): void => {
    n += records.filter((r) => r.oldValue === null).length;
  };
  const watch = new MutationObserver(count);
  watch.observe(d, { attributeFilter: ["data-cp-refused"], attributeOldValue: true });
  return () => {
    count(watch.takeRecords());
    return n;
  };
}

// A dialog's exit ends on an animation frame, which a busy machine can hold past any fixed wait.
const settled = async () => {
  await Promise.allSettled(document.getAnimations().map((a) => a.finished));
  await new Promise((r) => setTimeout(r, 0));
};
// announce writes its words after a 100ms gap; a timer set later with an equal or longer
// timeout runs after it (https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers).
const said = () => new Promise((r) => setTimeout(r, 150));
// What `open` reads as `d` closes: a close waits for the exit, which a loaded
// engine can stretch past any fixed wait.
const closing = (d: HTMLDialogElement) =>
  new Promise<boolean>((r) => {
    d.addEventListener("close", () => r(d.open), { once: true });
  });

describe("installDialogs", () => {
  it("closes a dialog marked closedby=any on a press that starts and ends outside it", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ closedby: "any" }, "<p>Hi</p>");
    d.showModal();
    const shut = closing(d);
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect(await shut).toBe(false);
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
    const shut = closing(d);
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect(await shut).toBe(false);
  });

  it("says to a screen reader that typed changes are still there when it refuses a press outside", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog({ "data-keep-typed": "" }, '<input value="Sonarr">');
    d.showModal();
    (d.querySelector("input") as HTMLInputElement).value = "Sonarr 4K";
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    await said();
    expect(d.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "Your changes are still here. Save them, or cancel to drop them.",
    );
  });

  it("says a held dialog's words each time it refuses, and nothing without them", async () => {
    installDialogs({ signal: life.signal });
    const quiet = dialog({}, '<button type="button">Done</button>');
    holdDialog(quiet, () => true, { signal: life.signal });
    quiet.showModal();
    (quiet.querySelector("button") as HTMLButtonElement).focus();
    await userEvent.keyboard("{Escape}");
    await said();
    expect(quiet.querySelector('[aria-live="polite"]')?.textContent ?? "").toBe("");
    quiet.remove();
    const d = dialog({}, '<button type="button">Done</button>');
    holdDialog(d, () => true, { say: "Copy it first.", signal: life.signal });
    d.showModal();
    (d.querySelector("button") as HTMLButtonElement).focus();
    await userEvent.keyboard("{Escape}");
    await said();
    expect(d.querySelector('[aria-live="polite"]')?.textContent).toBe("Copy it first.");
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
    const shut = closing(d);
    await userEvent.keyboard("{Escape}");
    expect(await shut).toBe(false);
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
    const shut = closing(d);
    await userEvent.click(done);
    expect(await shut).toBe(false);
  });

  it("refuses a close request on a held dialog that opened before the listeners and the hold", async () => {
    const d = dialog({}, '<button type="button">Done</button>');
    d.showModal();
    installDialogs({ signal: life.signal });
    holdDialog(d, () => true, { signal: life.signal });
    const refused = refusals(d);
    d.requestClose();
    await settled();
    expect([d.open, refused()]).toEqual([true, 1]);
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
    const shut = closing(d);
    closeDialog(d, "saved");
    closeDialog(d, "twice");
    expect(await shut).toBe(false);
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

describe("data-keep-typed", () => {
  it("counts a choice changed in a select or a box as typed, and lets the dialog close once each is put back", async () => {
    installDialogs({ signal: life.signal });
    const d = dialog(
      { "data-keep-typed": "" },
      '<input type="hidden" value="7"><select><option>x</option><option selected>y</option></select><input type="checkbox" checked>',
    );
    d.showModal();
    const select = d.querySelector("select") as HTMLSelectElement;
    const box = d.querySelector('[type="checkbox"]') as HTMLInputElement;
    select.selectedIndex = 0;
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect([d.open, d.hasAttribute("data-cp-refused")]).toEqual([true, true]);
    select.selectedIndex = 1;
    box.checked = false;
    d.removeAttribute("data-cp-refused");
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect([d.open, d.hasAttribute("data-cp-refused")]).toEqual([true, true]);
    box.checked = true;
    const shut = closing(d);
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect(await shut).toBe(false);
  });
});
