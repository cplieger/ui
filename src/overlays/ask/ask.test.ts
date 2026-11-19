import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { ask } from "./ask.js";

afterEach(() => {
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

const open = (): HTMLDialogElement => document.querySelector("dialog[open]") as HTMLDialogElement;
const button = (words: string): HTMLButtonElement =>
  [...open().querySelectorAll("button")].find((b) => b.textContent === words) as HTMLButtonElement;
const boxes = (): HTMLInputElement[] => [...open().querySelectorAll<HTMLInputElement>("input")];
const answer = (): HTMLButtonElement =>
  open().querySelector('button[value="confirm"]') as HTMLButtonElement;

const groups = [
  { value: "managed", label: "3 managed files", note: "Fetched by this app", count: 3 },
  { value: "found", label: "1 found on disk", note: "Not fetched by this app", count: 1 },
] as const;
const deleteWords = (n: number): string =>
  n === 0 ? "Choose what to delete" : `Delete ${String(n)} ${n === 1 ? "file" : "files"}`;

describe("ask", () => {
  it("asks in a modal confirmation and resolves true for the answer", async () => {
    const reply = ask("Delete 4 files?", { confirmLabel: "Delete" });
    const d = open();
    expect(d.matches(":modal")).toBe(true);
    expect(d.dataset["variant"]).toBe("confirm");
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.querySelector("h2")?.textContent).toBe("Delete 4 files?");
    expect(document.activeElement).toBe(button("Delete"));
    await userEvent.click(button("Delete"));
    await expect(reply).resolves.toBe(true);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("resolves false for Cancel and for Escape", async () => {
    const first = ask("Leave setup?");
    await userEvent.click(button("Cancel"));
    await expect(first).resolves.toBe(false);
    const second = ask("Leave setup?");
    await userEvent.keyboard("{Escape}");
    await expect(second).resolves.toBe(false);
  });

  it("paints a danger answer and puts focus on declining by default", async () => {
    const reply = ask("Remove the key?", { tone: "danger", confirmLabel: "Remove" });
    expect(button("Remove").dataset["tone"]).toBe("danger");
    expect(document.activeElement).toBe(button("Cancel"));
    await userEvent.keyboard("{Enter}");
    await expect(reply).resolves.toBe(false);
  });

  it("takes focus from focus, apart from the tone", async () => {
    const unchecked = ask("Apply an unchecked change?", {
      focus: "decline",
      confirmLabel: "Apply",
    });
    expect(button("Apply").dataset["tone"]).toBeUndefined();
    expect(document.activeElement).toBe(button("Cancel"));
    await userEvent.click(button("Apply"));
    await expect(unchecked).resolves.toBe(true);
    const undoable = ask("Archive 3 chats?", {
      tone: "danger",
      focus: "answer",
      confirmLabel: "Archive",
    });
    expect(document.activeElement).toBe(button("Archive"));
    await userEvent.keyboard("{Enter}");
    await expect(undoable).resolves.toBe(true);
  });

  it("shows a title over the message, and facts as label and value pairs", async () => {
    const reply = ask("Rewind the chat to this turn?", {
      title: "Rewind",
      details: [{ label: "Turns removed", value: "4" }],
    });
    const d = open();
    expect(d.querySelector("h2")?.textContent).toBe("Rewind");
    const words = d.querySelector("p");
    expect(words?.textContent).toBe("Rewind the chat to this turn?");
    expect(d.getAttribute("aria-describedby")).toBe(words?.id);
    expect([...d.querySelectorAll("dl.cp-facts > :is(dt, dd)")].map((n) => n.textContent)).toEqual([
      "Turns removed",
      "4",
    ]);
    await userEvent.click(button("OK"));
    await expect(reply).resolves.toBe(true);
  });

  it("links under the message to what it concerns, and declines when the link is followed", async () => {
    const reply = ask("Their unused invites stop working too.", {
      title: "Revoke ci?",
      link: { text: "Show the people ci reached", href: "#reached" },
    });
    const a = open().querySelector("a");
    expect(a?.textContent).toBe("Show the people ci reached");
    expect(a?.getAttribute("href")).toBe("#reached");
    await userEvent.click(a!);
    await expect(reply).resolves.toBe(false);
  });

  it("asks for a value, answering on Enter with what was typed, and null when declined", async () => {
    const name = ask("Rename the passkey", { input: { initialValue: "Laptop", maxLength: 64 } });
    expect(open().getAttribute("role")).toBeNull();
    const field = open().querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.maxLength).toBe(64);
    await userEvent.fill(field, "Work laptop");
    await userEvent.keyboard("{Enter}");
    await expect(name).resolves.toBe("Work laptop");
    const declined = ask("Rename the passkey", { input: true });
    await userEvent.click(button("Cancel"));
    await expect(declined).resolves.toBeNull();
  });

  it("lists the groups with none chosen, and keeps the answer off until one is", async () => {
    const reply = ask("Choose which to delete.", {
      title: "Delete subtitles for 4 episodes?",
      choices: groups,
      tone: "danger",
      confirmLabel: deleteWords,
      cancelLabel: "Keep them",
    });
    const set = open().querySelector("fieldset.cp-choices") as HTMLFieldSetElement;
    expect(set.getAttribute("aria-labelledby")).toBe(open().querySelector("p")?.id);
    expect([...set.querySelectorAll("label.cp-choice")].map((l) => l.textContent)).toEqual([
      "3 managed filesFetched by this app",
      "1 found on diskNot fetched by this app",
    ]);
    expect(boxes().map((b) => b.checked)).toEqual([false, false]);
    expect(answer().textContent).toBe("Choose what to delete");
    expect(answer().disabled).toBe(true);
    expect(answer().dataset["tone"]).toBe("danger");
    expect(document.activeElement).toBe(button("Keep them"));
    await userEvent.click(boxes()[1] as HTMLInputElement);
    expect(answer().textContent).toBe("Delete 1 file");
    expect(answer().disabled).toBe(false);
    await userEvent.click(set.querySelector("label") as HTMLLabelElement);
    expect(answer().textContent).toBe("Delete 4 files");
    await userEvent.click(answer());
    await expect(reply).resolves.toEqual(["managed", "found"]);
  });

  it("counts chosen groups when they carry no count, and resolves null when declined", async () => {
    const reply = ask("Remove from which lists?", {
      choices: [
        { value: "a", label: "Watching" },
        { value: "b", label: "Later" },
      ],
      focus: "answer",
      confirmLabel: (n) => `Remove from ${String(n)}`,
    });
    expect(document.activeElement).toBe(boxes()[0]);
    await userEvent.keyboard(" ");
    expect(answer().textContent).toBe("Remove from 1");
    await userEvent.click(boxes()[1] as HTMLInputElement);
    expect(answer().textContent).toBe("Remove from 2");
    await userEvent.keyboard("{Escape}");
    await expect(reply).resolves.toBeNull();
  });

  it("answers an open question as cancelled when another replaces it", async () => {
    const first = ask("First?");
    const second = ask("Second?");
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
    await userEvent.click(button("OK"));
    await expect(second).resolves.toBe(true);
  });

  it("answers an open question as declined and removes it when its signal aborts", async () => {
    const life = new AbortController();
    const reply = ask("Apply an unchecked change?", { signal: life.signal });
    expect(open().matches(":modal")).toBe(true);
    life.abort();
    await expect(reply).resolves.toBe(false);
    expect(document.querySelector("dialog")).toBeNull();
    const value = new AbortController();
    const name = ask("Rename the passkey", { input: true, signal: value.signal });
    value.abort();
    await expect(name).resolves.toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("opens nothing and leaves the open question for a signal already aborted", async () => {
    const first = ask("First?");
    const gone = AbortSignal.abort();
    await expect(ask("Second?", { signal: gone })).resolves.toBe(false);
    await expect(ask("Which?", { choices: groups, signal: gone })).resolves.toBeNull();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
    await userEvent.click(button("OK"));
    await expect(first).resolves.toBe(true);
  });

  it("leaves the next question open when an answered question's signal aborts later", async () => {
    const life = new AbortController();
    const reply = ask("Leave setup?", { signal: life.signal });
    await userEvent.click(button("OK"));
    await expect(reply).resolves.toBe(true);
    const next = ask("Next?");
    life.abort();
    expect(open().querySelector("h2")?.textContent).toBe("Next?");
    await userEvent.click(button("Cancel"));
    await expect(next).resolves.toBe(false);
  });

  it("refuses details that are not label and value strings, before it opens anything", () => {
    expect(() => ask("x", { details: [{ label: "a" }] as never })).toThrow(TypeError);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("refuses options it cannot draw, before it opens anything", () => {
    const bad: unknown[] = [
      { tone: "warning" },
      { focus: "cancel" },
      { choices: [] },
      { choices: [{ value: "a" }] },
      { choices: [{ value: "a", label: "A", note: 3 }] },
      { choices: [{ value: "a", label: "A", count: -1 }] },
      { choices: [{ value: "a", label: "A", count: 1.5 }] },
      {
        choices: [
          { value: "a", label: "A" },
          { value: "a", label: "B" },
        ],
      },
      { choices: [{ value: "a", label: "A" }], input: true },
      { confirmLabel: () => "Go" },
      { link: { text: "People it reached" } },
      { link: null },
      { signal: "abort" },
    ];
    for (const opts of bad) {
      expect(() => ask("x", opts as never), JSON.stringify(opts)).toThrow(TypeError);
    }
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("ask from inside an open popover", () => {
  /** An open auto popover of `role`, a panel's by default, holding a
   *  focused button, and a button outside it. */
  const opened = (role = "dialog") => {
    const pop = document.createElement("div");
    pop.popover = "auto";
    pop.setAttribute("role", role);
    const inside = document.createElement("button");
    inside.textContent = "Stop";
    pop.append(inside);
    const outside = document.createElement("button");
    outside.textContent = "Elsewhere";
    document.body.append(outside, pop);
    pop.showPopover();
    inside.focus();
    return { pop, inside, outside };
  };

  it.each([
    ["declined", "Cancel", false],
    ["answered", "OK", true],
  ])(
    "keeps the popover open while asked and once %s, and gives focus back to the button",
    async (_how, words, yes) => {
      const { pop, inside } = opened();
      const reply = ask("Stop the scan?");
      expect(open().parentElement).toBe(pop);
      expect(pop.matches(":popover-open")).toBe(true);
      await userEvent.click(button(words));
      await expect(reply).resolves.toBe(yes);
      expect(pop.matches(":popover-open")).toBe(true);
      expect(document.activeElement).toBe(inside);
      expect(document.querySelector("dialog")).toBeNull();
    },
  );

  it("asks from the body when the focus is in no open popover", async () => {
    const { pop, outside } = opened();
    outside.focus();
    const reply = ask("Stop the scan?");
    expect(open().parentElement).toBe(document.body);
    expect(pop.matches(":popover-open")).toBe(false);
    await userEvent.click(button("Cancel"));
    await expect(reply).resolves.toBe(false);
  });

  it("asks from the body when the focus is in an open menu, which closes as it is chosen", async () => {
    const { pop } = opened("menu");
    const reply = ask("Stop the scan?");
    expect(open().parentElement).toBe(document.body);
    expect(pop.matches(":popover-open")).toBe(false);
    await userEvent.click(button("OK"));
    await expect(reply).resolves.toBe(true);
  });

  it("answers as declined and leaves the page usable when the popover holding it closes", async () => {
    const { pop } = opened();
    const reply = ask("Stop the scan?");
    pop.hidePopover();
    await expect(reply).resolves.toBe(false);
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.querySelector(":modal")).toBeNull();
  });
});
