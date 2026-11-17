import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../announce/announce.js";
import { reported } from "../test-helpers/reported.js";
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
  const d: PromiseWithResolvers<void> = Promise.withResolvers();
  return d;
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

  it("hides an emptied cluster that still holds the markup's whitespace", async () => {
    const card = proposal();
    const cluster = card.querySelector(".cp-cluster") as HTMLElement;
    cluster.prepend("\n    ");
    part(card, "apply").after("\n    ");
    cluster.append("\n  ");
    const calls = wire(card);
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(cluster.childElementCount).toBe(0);
    expect(cluster.textContent.trim()).toBe("");
    expect(cluster.childNodes.length).toBeGreaterThan(0);
    expect(getComputedStyle(cluster).display).toBe("none");
  });

  it("shows the default failure when the app's failure words throw", async () => {
    const errors = reported();
    const card = proposal();
    const calls = wire(card, {
      words: {
        applied: "Applied.",
        applyFailed: (reason) => (reason as { body: { detail: string } }).body.detail,
      },
    });
    const apply = part(card, "apply");
    apply.focus();
    apply.click();
    calls[0]?.reject(new TypeError("Failed to fetch"));
    await until(() => failedLine(card) !== null);
    expect(failedLine(card)?.textContent).toBe("The change could not be applied.");
    expect(document.activeElement).toBe(apply);
    expect(errors).toHaveLength(1);
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

  it("puts back on Undo the words that showed when Apply ran", async () => {
    const card = proposal();
    const undone = deferred();
    const calls = wire(card, { undo: () => undone.promise });
    const words = card.querySelector("p") as HTMLParagraphElement;
    const head = document.createElement("strong");
    head.textContent = "Proposed:";
    words.replaceChildren(head, " +1.300 s with drift corrected.");
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    (document.activeElement as HTMLButtonElement).click();
    undone.resolve();
    await until(() => card.dataset["cpState"] === undefined);
    expect(words.textContent).toBe("Proposed: +1.300 s with drift corrected.");
    expect(words.firstChild).toBe(head);
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
    const lead = card.firstElementChild;
    expect(lead?.getAttribute("data-part")).toBe("tone");
    expect(card.children).toHaveLength(3);
    expect(card.children[1]).toBe(words);
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
    expect(card.children).toHaveLength(2);
    expect(card.firstElementChild?.getAttribute("data-part")).toBe("tone");
    expect(card.lastElementChild).toBe(words);
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

  it("closes its question and applies nothing when its signal aborts while it asks", async () => {
    const card = proposal(true);
    const calls = wire(card, { confirm });
    part(card, "apply").click();
    await until(() => open() !== null);
    life.abort();
    await until(() => document.querySelector("dialog") === null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(0);
    expect(card.dataset["cpState"]).toBeUndefined();
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

describe("enhanceProposal: its tone", () => {
  const confirm = { title: "Apply an unchecked change?", message: "Nothing confirmed it." };
  /** The tone glyph the card leads with, and the card's tone. */
  const tone = (card: HTMLElement): [string | undefined, string | null | undefined] => {
    const lead = card.firstElementChild;
    return [
      card.dataset["tone"],
      lead?.matches('.cp-icon[data-part="tone"][aria-hidden="true"]') === true
        ? lead.getAttribute("data-cp-icon")
        : undefined,
    ];
  };

  it("leads an unverified proposal with the warning glyph, an applied one with success's, and puts the warning back on Undo", async () => {
    const card = proposal(true);
    const undone = deferred();
    const calls = wire(card, { confirm, undo: () => undone.promise });
    expect(tone(card)).toEqual(["warning", "triangle-alert"]);
    part(card, "apply").click();
    await until(() => document.querySelector("dialog[open]") !== null);
    const yes = [...document.querySelectorAll("dialog[open] button")].find(
      (b) => b.textContent === "Apply",
    ) as HTMLButtonElement;
    await userEvent.click(yes);
    await until(() => calls.length === 1);
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(tone(card)).toEqual(["success", "circle-check"]);
    expect(card.querySelectorAll('[data-part="tone"]')).toHaveLength(1);
    (document.activeElement as HTMLButtonElement).click();
    undone.resolve();
    await until(() => card.dataset["cpState"] === undefined);
    expect(tone(card)).toEqual(["warning", "triangle-alert"]);
    expect(card.querySelectorAll('[data-part="tone"]')).toHaveLength(1);
  });

  it("gives a checked proposal no tone until it applies, and none again after Undo", async () => {
    const card = proposal();
    const undone = deferred();
    const calls = wire(card, { undo: () => undone.promise });
    expect(tone(card)).toEqual([undefined, undefined]);
    expect(card.querySelector('[data-part="tone"]')).toBeNull();
    part(card, "apply").click();
    calls[0]?.resolve();
    await until(() => card.dataset["cpState"] === "applied");
    expect(tone(card)).toEqual(["success", "circle-check"]);
    (document.activeElement as HTMLButtonElement).click();
    undone.resolve();
    await until(() => card.dataset["cpState"] === undefined);
    expect(tone(card)).toEqual([undefined, undefined]);
    expect(card.querySelector('[data-part="tone"]')).toBeNull();
  });
});

describe(".cp-proposal", () => {
  /** A notice in `tone`, the surface whose wash and glyph a toned proposal shares. */
  const notice = (tone: string): HTMLElement => {
    const box = document.createElement("div");
    box.className = "cp-notice";
    box.dataset["tone"] = tone;
    box.innerHTML = '<span class="cp-icon" data-cp-icon="info" aria-hidden="true"></span><p>x</p>';
    document.body.append(box);
    return box;
  };

  it("draws a dashed edge, a tone's wash and edge, and a solid edge applied", () => {
    const card = proposal();
    const plain = getComputedStyle(card);
    expect(plain.borderTopStyle).toBe("dashed");
    const [fill, edge] = [plain.backgroundColor, plain.borderTopColor];
    for (const name of ["warning", "success"]) {
      card.dataset["tone"] = name;
      const box = notice(name);
      const toned = getComputedStyle(card);
      expect(toned.backgroundColor).toBe(getComputedStyle(box).backgroundColor);
      expect(toned.backgroundColor).not.toBe(fill);
      expect(toned.borderTopColor).not.toBe(edge);
    }
    card.dataset["cpState"] = "applied";
    expect(getComputedStyle(card).borderTopStyle).toBe("solid");
  });

  it("puts its tone glyph before the words, in the tone's ink, the words and buttons beside it", () => {
    const card = proposal();
    card.dataset["tone"] = "warning";
    const lead = document.createElement("span");
    lead.className = "cp-icon";
    lead.dataset["cpIcon"] = "triangle-alert";
    lead.dataset["part"] = "tone";
    card.prepend(lead);
    const words = card.querySelector("p") as HTMLElement;
    const cluster = card.querySelector(".cp-cluster") as HTMLElement;
    const icon = lead.getBoundingClientRect();
    const text = words.getBoundingClientRect();
    expect(icon.right).toBeLessThan(text.left);
    expect(icon.top).toBeGreaterThanOrEqual(text.top);
    expect(icon.bottom).toBeLessThanOrEqual(
      text.top + parseFloat(getComputedStyle(words).lineHeight),
    );
    expect(cluster.getBoundingClientRect().left).toBe(text.left);
    const box = notice("warning");
    expect(getComputedStyle(lead).color).toBe(
      getComputedStyle(box.querySelector(".cp-icon") as Element).color,
    );
  });
});
