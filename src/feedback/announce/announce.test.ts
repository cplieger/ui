import { afterEach, describe, expect, it } from "vitest";

import { announce, installAnnouncer } from "./announce.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

const said = () => new Promise((r) => setTimeout(r, 150));
const region = (host: Element, politeness: "polite" | "assertive") =>
  host.querySelector(`:scope > .cp-live-regions > [aria-live="${politeness}"]`) as HTMLElement;

describe("announce", () => {
  it("says a message from the page's polite region", async () => {
    installAnnouncer({ signal: life.signal });
    announce("3 entries removed");
    await said();
    expect(region(document.body, "polite").textContent).toBe("3 entries removed");
    expect(region(document.body, "assertive").textContent).toBe("");
  });

  it("says an urgent message from the assertive region", async () => {
    installAnnouncer({ signal: life.signal });
    announce("Sonarr stopped answering", "assertive");
    await said();
    expect(region(document.body, "assertive").textContent).toBe("Sonarr stopped answering");
  });

  it("says a message from inside the topmost modal dialog, which the page's regions cannot reach", async () => {
    installAnnouncer({ signal: life.signal });
    const outer = document.createElement("dialog");
    const inner = document.createElement("dialog");
    document.body.append(outer, inner);
    outer.showModal();
    inner.showModal();
    expect(region(inner, "polite"), "the pair exists before any message").not.toBeNull();
    announce("Saved");
    await said();
    expect(region(inner, "polite").textContent).toBe("Saved");
    expect(region(document.body, "polite").textContent).toBe("");
  });

  it("reaches a modal dialog opened before the announcer existed", async () => {
    const d = document.createElement("dialog");
    document.body.append(d);
    d.showModal();
    announce("Copied");
    await said();
    expect(region(d, "polite").textContent).toBe("Copied");
  });

  it("empties a dialog's regions as it closes, so an old message is not read again", async () => {
    installAnnouncer({ signal: life.signal });
    const d = document.createElement("dialog");
    document.body.append(d);
    d.showModal();
    announce("Saved");
    await said();
    const closed = new Promise((r) => d.addEventListener("close", r, { once: true }));
    d.close();
    await closed;
    expect(region(d, "polite").textContent).toBe("");
  });

  it("empties the region before a repeat, so the same words are read again", async () => {
    installAnnouncer({ signal: life.signal });
    announce("Copied");
    await said();
    announce("Copied");
    expect(region(document.body, "polite").textContent).toBe("");
    await said();
    expect(region(document.body, "polite").textContent).toBe("Copied");
  });

  it("does nothing with no announcer and no open dialog, and removes its regions when its signal aborts", async () => {
    announce("Nobody hears this");
    await said();
    expect(document.querySelector(".cp-live-regions")).toBeNull();
    installAnnouncer({ signal: life.signal });
    expect(document.querySelector(".cp-live-regions")).not.toBeNull();
    life.abort();
    expect(document.querySelector(".cp-live-regions")).toBeNull();
  });
});
