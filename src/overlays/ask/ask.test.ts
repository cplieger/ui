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

describe("ask", () => {
  it("asks in a modal confirmation and resolves true for the answer", async () => {
    const answer = ask("Delete 4 files?", { confirmLabel: "Delete" });
    const d = open();
    expect(d.matches(":modal")).toBe(true);
    expect(d.dataset["variant"]).toBe("confirm");
    expect(d.querySelector("h2")?.textContent).toBe("Delete 4 files?");
    expect(document.activeElement).toBe(button("Delete"));
    await userEvent.click(button("Delete"));
    await expect(answer).resolves.toBe(true);
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

  it("paints a destructive answer in danger and puts focus on declining", async () => {
    const answer = ask("Remove the key?", { variant: "destructive", confirmLabel: "Remove" });
    expect(button("Remove").dataset["tone"]).toBe("danger");
    expect(document.activeElement).toBe(button("Cancel"));
    await userEvent.keyboard("{Enter}");
    await expect(answer).resolves.toBe(false);
  });

  it("shows a title over the message, and facts as label and value pairs", async () => {
    const answer = ask("Rewind the chat to this turn?", {
      title: "Rewind",
      details: [{ label: "Turns removed", value: "4" }],
    });
    const d = open();
    expect(d.querySelector("h2")?.textContent).toBe("Rewind");
    expect(d.querySelector("p")?.textContent).toBe("Rewind the chat to this turn?");
    expect([...d.querySelectorAll("dt, dd")].map((n) => n.textContent)).toEqual([
      "Turns removed",
      "4",
    ]);
    await userEvent.click(button("OK"));
    await expect(answer).resolves.toBe(true);
  });

  it("asks for a value, answering on Enter with what was typed, and null when declined", async () => {
    const name = ask("Rename the passkey", { input: { initialValue: "Laptop", maxLength: 64 } });
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
});
