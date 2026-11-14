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
    ];
    for (const opts of bad) {
      expect(() => ask("x", opts as never), JSON.stringify(opts)).toThrow(TypeError);
    }
    expect(document.querySelector("dialog")).toBeNull();
  });
});
