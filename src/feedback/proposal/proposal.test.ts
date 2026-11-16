import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../announce/announce.js";
import { enhanceProposal, type ProposalOptions } from "./proposal.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

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
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Waits until `check` holds, for work that settles across a few tasks. */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`[aria-live="${politeness}"]`)?.textContent ?? "";

function proposal(unverified = false): HTMLDivElement {
  const host = document.createElement("section");
  const card = document.createElement("div");
  card.className = "cp-proposal";
  if (unverified) {
    card.dataset["variant"] = "unverified";
  }
  const p = document.createElement("p");
  const head = document.createElement("strong");
  head.textContent = "Proposed:";
  p.append(head, " +1.250 s with drift corrected.");
  const cluster = document.createElement("div");
  cluster.className = "cp-cluster";
  const apply = document.createElement("button");
  apply.className = "cp-button";
  apply.type = "button";
  apply.dataset["part"] = "apply";
  const busy = document.createElement("span");
  busy.className = "cp-icon";
  busy.dataset["cpIcon"] = "spinner-arc";
  busy.dataset["part"] = "busy";
  const roll = document.createElement("span");
  roll.className = "cp-roll";
  roll.textContent = "Apply";
  apply.append(busy, roll);
  const discard = document.createElement("button");
  discard.className = "cp-button";
  discard.type = "button";
  discard.dataset["part"] = "discard";
  discard.textContent = "Discard";
  cluster.append(apply, discard);
  card.append(p, cluster);
  host.append(card);
  document.body.append(host);
  return card;
}

const part = (card: Element, name: string): HTMLButtonElement =>
  card.querySelector(`[data-part="${name}"]`) as HTMLButtonElement;
const failedLine = (card: Element): Element | null =>
  card.querySelector(':scope > .cp-state[data-cp-state="failed"]');

function wire(card: HTMLElement, extra: Partial<ProposalOptions> = {}) {
  const calls: Deferred[] = [];
  const work = (): Promise<void> => {
    const d = deferred();
    calls.push(d);
    return d.promise;
  };
  enhanceProposal(card, {
    apply: work,
    words: { applied: "Applied: +1.250 s with drift corrected." },
    signal: life.signal,
    ...extra,
  });
  return calls;
}

describe("enhanceProposal: Apply", () => {
  it("applies, says what applied and focuses Undo", async () => {
    const card = proposal();
    const undone = deferred();
    const calls = wire(card, { undo: () => undone.promise });
    part(card, "apply").click();
    expect(calls).toHaveLength(1);
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(card.querySelector("p")?.textContent).toBe("Applied: +1.250 s with drift corrected.");
    expect(part(card, "apply")).toBeNull();
    const undo = card.querySelector<HTMLButtonElement>(".cp-cluster > button");
    expect(undo?.textContent).toBe("Undo");
    expect(document.activeElement).toBe(undo);
    await until(() => said("polite") === "Applied: +1.250 s with drift corrected.");
  });

  it("focuses the words when the app cannot undo", async () => {
    const card = proposal();
    const calls = wire(card);
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(document.activeElement).toBe(card.querySelector("p"));
    expect(card.querySelector(".cp-cluster")?.childElementCount).toBe(0);
    expect(getComputedStyle(card.querySelector(".cp-cluster") as Element).display).toBe("none");
  });

  it("shows a failure under the words, says it, keeps focus and tries again", async () => {
    const card = proposal();
    const calls = wire(card, {
      words: {
        applied: "Applied.",
        applyFailed: (reason) => `Not applied: ${(reason as Error).message}`,
      },
    });
    const apply = part(card, "apply");
    apply.focus();
    apply.click();
    calls[0]?.reject(new Error("the file is locked."));
    await until(() => failedLine(card) !== null);
    expect(failedLine(card)?.textContent).toBe("Not applied: the file is locked.");
    expect(failedLine(card)?.previousElementSibling).toBe(card.querySelector("p"));
    expect(card.dataset["cpState"]).toBeUndefined();
    expect(document.activeElement).toBe(apply);
    await until(() => said("assertive") === "Not applied: the file is locked.");
    apply.click();
    expect(failedLine(card)).toBeNull();
    calls[1]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
  });

  it("runs one action at a time", async () => {
    const card = proposal();
    let drops = 0;
    const calls = wire(card, {
      discard: () => {
        drops++;
        return Promise.resolve();
      },
    });
    part(card, "apply").click();
    part(card, "apply").click();
    part(card, "discard").click();
    expect(calls).toHaveLength(1);
    expect(drops).toBe(0);
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
  });

  it("stays busy and focusable while a slow change applies", async () => {
    const card = proposal();
    const calls = wire(card);
    const apply = part(card, "apply");
    apply.click();
    await until(() => apply.getAttribute("aria-busy") === "true");
    expect(apply.disabled).toBe(false);
    expect(apply.querySelector(".cp-roll")?.textContent).toContain("Applying…");
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
  });
});

describe("enhanceProposal: Undo and Discard", () => {
  it("puts the proposal back on Undo and focuses Apply", async () => {
    const card = proposal();
    const undone = deferred();
    const calls = wire(card, { undo: () => undone.promise });
    const apply = part(card, "apply");
    apply.click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    (document.activeElement as HTMLButtonElement).click();
    undone.resolve();
    await until(() => card.dataset["cpState"] === undefined);
    expect(card.querySelector("p")?.textContent).toBe("Proposed: +1.250 s with drift corrected.");
    expect(part(card, "apply")).toBe(apply);
    expect(apply.nextElementSibling).toBe(part(card, "discard"));
    expect(document.activeElement).toBe(apply);
    await until(() => said("polite") === "Change undone");
  });

  it("keeps the applied card when Undo fails", async () => {
    const card = proposal();
    const calls = wire(card, { undo: () => Promise.reject(new Error("gone")) });
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    const undo = document.activeElement as HTMLButtonElement;
    undo.click();
    await until(() => failedLine(card) !== null);
    expect(failedLine(card)?.textContent).toBe("The change could not be undone.");
    expect(card.dataset["cpState"]).toBe("applied");
    expect(document.activeElement).toBe(undo);
  });

  it("removes the card on Discard, focuses where it was told and says it", async () => {
    const card = proposal();
    const back = document.createElement("h2");
    document.body.prepend(back);
    const dropped = deferred();
    wire(card, { discard: () => dropped.promise, returnFocus: back });
    const discard = part(card, "discard");
    discard.click();
    expect(discard.getAttribute("aria-busy")).toBe("true");
    dropped.resolve();
    await until(() => !card.isConnected);
    expect(document.activeElement).toBe(back);
    await until(() => said("polite") === "Proposal discarded");
  });

  it("keeps the card with its failure when Discard fails", async () => {
    const card = proposal();
    wire(card, { discard: () => Promise.reject(new Error("no")) });
    const discard = part(card, "discard");
    discard.click();
    await until(() => failedLine(card) !== null);
    expect(card.isConnected).toBe(true);
    expect(discard.hasAttribute("aria-busy")).toBe(false);
    expect(failedLine(card)?.textContent).toBe("The proposal could not be discarded.");
  });

  it("removes the card at once with no discard, focusing its parent", async () => {
    const card = proposal();
    const host = card.parentElement;
    wire(card);
    part(card, "discard").click();
    await until(() => !card.isConnected);
    expect(document.activeElement).toBe(host);
  });
});

/** The same card with its buttons beside the words, with no cluster. */
function flat(card: HTMLElement): HTMLElement {
  const cluster = card.querySelector(".cp-cluster");
  cluster?.replaceWith(...(cluster?.children ?? []));
  return card;
}

describe("enhanceProposal: buttons beside the words", () => {
  it("keeps the words, puts Undo in Apply's place, and puts both buttons back on Undo", async () => {
    const card = flat(proposal());
    const undone = deferred();
    const calls = wire(card, { undo: () => undone.promise });
    const words = card.querySelector("p");
    const apply = part(card, "apply");
    const discard = part(card, "discard");
    apply.click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    const undo = card.lastElementChild as HTMLButtonElement;
    expect([...card.children]).toEqual([words, undo]);
    expect(words?.textContent).toBe("Applied: +1.250 s with drift corrected.");
    expect(undo.textContent).toBe("Undo");
    expect(document.activeElement).toBe(undo);
    undo.click();
    undone.resolve();
    await until(() => card.dataset["cpState"] === undefined);
    expect(card.children).toHaveLength(3);
    expect(card.children[0]).toBe(words);
    expect(card.children[1]).toBe(apply);
    expect(card.children[2]).toBe(discard);
    expect(document.activeElement).toBe(apply);
  });

  it("keeps the words and focuses them when the app cannot undo", async () => {
    const card = flat(proposal());
    const calls = wire(card);
    const words = card.querySelector("p");
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(card.children).toHaveLength(1);
    expect(card.firstElementChild).toBe(words);
    expect(words?.textContent).toBe("Applied: +1.250 s with drift corrected.");
    expect(document.activeElement).toBe(words);
  });
});

describe("enhanceProposal: a reader who moved on", () => {
  it("keeps their place when Apply settles", async () => {
    const card = proposal();
    const elsewhere = document.createElement("input");
    document.body.append(elsewhere);
    const calls = wire(card, { undo: () => Promise.resolve() });
    const apply = part(card, "apply");
    apply.focus();
    apply.click();
    elsewhere.focus();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps their place when Discard settles", async () => {
    const card = proposal();
    const back = document.createElement("h2");
    const elsewhere = document.createElement("input");
    document.body.prepend(back, elsewhere);
    const dropped = deferred();
    wire(card, { discard: () => dropped.promise, returnFocus: back });
    const discard = part(card, "discard");
    discard.focus();
    discard.click();
    elsewhere.focus();
    dropped.resolve();
    await until(() => !card.isConnected);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("enhanceProposal: the unverified proposal", () => {
  const confirm = {
    title: "Apply an unchecked change?",
    message: "Nothing confirmed that +0.400 s matches the audio.",
    cancelLabel: "Keep the current timing",
  };

  const open = (): HTMLDialogElement | null => document.querySelector("dialog[open]");

  it("asks first with the declining button focused, and declining runs nothing", async () => {
    const card = proposal(true);
    const calls = wire(card, { confirm });
    const apply = part(card, "apply");
    apply.focus();
    apply.click();
    await until(() => open() !== null);
    const dialog = open() as HTMLDialogElement;
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.querySelector("h2")?.textContent).toBe("Apply an unchecked change?");
    expect(dialog.querySelector("p")?.textContent).toBe(confirm.message);
    expect(dialog.querySelector('[data-cp-icon="triangle-alert"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Keep the current timing");
    expect(dialog.querySelector('[data-tone="danger"]')).toBeNull();
    await userEvent.keyboard("{Enter}");
    await until(() => open() === null);
    expect(calls).toHaveLength(0);
    expect(document.activeElement).toBe(apply);
  });

  it("applies once the person answers Apply", async () => {
    const card = proposal(true);
    const calls = wire(card, { confirm });
    part(card, "apply").click();
    await until(() => open() !== null);
    const yes = [...(open() as HTMLDialogElement).querySelectorAll("button")].find(
      (b) => b.textContent === "Apply",
    ) as HTMLButtonElement;
    await userEvent.click(yes);
    await until(() => calls.length === 1);
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(calls).toHaveLength(1);
  });

  it("needs its question, and only it takes one", () => {
    expect(() => {
      wire(proposal(true));
    }).toThrow(TypeError);
    expect(() => {
      wire(proposal(), { confirm });
    }).toThrow(TypeError);
  });
});

describe("enhanceProposal: wiring", () => {
  it("throws without its words or Apply", () => {
    const card = proposal();
    part(card, "apply").remove();
    expect(() => {
      wire(card);
    }).toThrow(TypeError);
  });

  it("does nothing once its signal aborts", () => {
    const card = proposal();
    const calls = wire(card);
    life.abort();
    part(card, "apply").click();
    expect(calls).toHaveLength(0);
  });
});

describe(".cp-proposal", () => {
  it("draws a dashed edge, the warning wash unverified and a solid edge applied", () => {
    const card = proposal();
    const unchecked = proposal(true);
    const edge = getComputedStyle(card);
    expect(edge.borderTopStyle).toBe("dashed");
    expect(getComputedStyle(unchecked).backgroundColor).not.toBe(edge.backgroundColor);
    card.dataset["cpState"] = "applied";
    expect(getComputedStyle(card).borderTopStyle).toBe("solid");
    expect(getComputedStyle(card).backgroundColor).not.toBe(
      getComputedStyle(unchecked).backgroundColor,
    );
  });
});
