import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { showError } from "../form/form.js";
import { enhanceFiles, fileSize } from "./file.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function zone(multiple = true): {
  field: HTMLElement;
  drop: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
} {
  const field = document.createElement("div");
  field.className = "cp-field";
  const drop = document.createElement("label");
  drop.className = "cp-drop";
  drop.append("Drop files here");
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ass,.srt";
  input.multiple = multiple;
  drop.append(input);
  const list = document.createElement("ul");
  list.className = "cp-files";
  field.append(drop, list);
  document.body.append(field);
  return { field, drop, input, list };
}

const task = (): Promise<void> => new Promise((r) => setTimeout(r));

const file = (name: string, size = 2048): File => new File([new Uint8Array(size)], name);

function choose(input: HTMLInputElement, files: readonly File[]): void {
  const dt = new DataTransfer();
  for (const f of files) {
    dt.items.add(f);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function drag(target: HTMLElement, type: string, files: readonly File[]): DragEvent {
  const dt = new DataTransfer();
  for (const f of files) {
    dt.items.add(f);
  }
  const e = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("fileSize", () => {
  it("words a size in binary units", () => {
    expect([
      fileSize(10),
      fileSize(2048),
      fileSize(4.2 * 1024 * 1024),
      fileSize(3 * 1024 ** 3),
    ]).toEqual(["1\u00a0KB", "2\u00a0KB", "4.2\u00a0MB", "3\u00a0GB"]);
  });
});

describe("enhanceFiles", () => {
  it("lists the files a choice takes, says how many, and tells the host", () => {
    installAnnouncer({ signal: life.signal });
    const { input, list } = zone();
    const seen: string[][] = [];
    const f = enhanceFiles(input, {
      list,
      onChange: (fs) => seen.push(fs.map((x) => x.name)),
      signal: life.signal,
    });
    choose(input, [file("a.ass"), file("b.SRT", 5000)]);
    expect([...list.children].map((li) => li.textContent)).toEqual([
      "a.ass2\u00a0KB",
      "b.SRT5\u00a0KB",
    ]);
    expect(f.files.map((x) => x.name)).toEqual(["a.ass", "b.SRT"]);
    expect(seen).toEqual([["a.ass", "b.SRT"]]);
  });

  it("refuses a file of another type or over the limit, with its sentence on the field", () => {
    const { input, list } = zone();
    enhanceFiles(input, { list, maxSize: 4096, signal: life.signal });
    choose(input, [file("a.ass"), file("b.mkv"), file("c.srt", 9000)]);
    expect([...(input.files ?? [])].map((x) => x.name)).toEqual(["a.ass"]);
    const error = input.parentElement?.parentElement?.querySelector(".cp-field-error");
    expect([input.getAttribute("aria-invalid"), error?.textContent]).toEqual([
      "true",
      "Only .ass or .srt files can be added.",
    ]);
    expect(input.getAttribute("aria-describedby")).toBe(error?.id);
    choose(input, [file("c.srt", 9000)]);
    expect(error?.textContent).toBe("Files over 4\u00a0KB cannot be added.");
    choose(input, [file("d.srt")]);
    expect([input.hasAttribute("aria-invalid"), (error as HTMLElement).hidden]).toEqual([
      false,
      true,
    ]);
  });

  it("takes only the first file without multiple", () => {
    const { input } = zone(false);
    enhanceFiles(input, { signal: life.signal });
    choose(input, [file("a.ass"), file("b.ass")]);
    expect([...(input.files ?? [])].map((x) => x.name)).toEqual(["a.ass"]);
  });

  it("takes files dropped on its zone, marks the zone while a drag is over it, and tells the form once", () => {
    const { drop, input, list } = zone();
    let changes = 0;
    input.addEventListener("change", () => changes++);
    enhanceFiles(input, { list, signal: life.signal });
    const over = drag(drop, "dragover", [file("a.ass")]);
    expect([over.defaultPrevented, drop.hasAttribute("data-cp-over")]).toEqual([true, true]);
    drag(drop, "drop", [file("a.ass"), file("b.txt")]);
    expect(drop.hasAttribute("data-cp-over")).toBe(false);
    expect([...(input.files ?? [])].map((x) => x.name)).toEqual(["a.ass"]);
    expect([list.children.length, changes]).toEqual([1, 1]);
  });

  it("empties its list and its refusal when its form resets", async () => {
    const { field, input, list } = zone();
    const form = document.createElement("form");
    form.append(field);
    document.body.append(form);
    enhanceFiles(input, { list, signal: life.signal });
    choose(input, [file("a.ass"), file("b.mkv")]);
    expect([list.children.length, input.getAttribute("aria-invalid")]).toEqual([1, "true"]);
    form.reset();
    await task();
    expect([list.children.length, input.hasAttribute("aria-invalid")]).toEqual([0, false]);
  });

  it("empties its list and its refusal when a person presses the form's reset button", async () => {
    const { field, input, list } = zone();
    const form = document.createElement("form");
    const reset = document.createElement("button");
    reset.type = "reset";
    reset.textContent = "Clear";
    form.append(field, reset);
    document.body.append(form);
    enhanceFiles(input, { list, signal: life.signal });
    choose(input, [file("a.ass"), file("b.mkv")]);
    await userEvent.click(reset);
    await task();
    expect([input.files?.length, list.children.length, input.hasAttribute("aria-invalid")]).toEqual(
      [0, 0, false],
    );
  });

  it("keeps its list when a listener cancels the reset", async () => {
    const { field, input, list } = zone();
    const form = document.createElement("form");
    form.append(field);
    document.body.append(form);
    form.addEventListener("reset", (e) => {
      e.preventDefault();
    });
    enhanceFiles(input, { list, signal: life.signal });
    choose(input, [file("a.ass")]);
    form.reset();
    await task();
    expect(list.children.length).toBe(1);
  });

  it("removes its listeners once its signal aborts", () => {
    const { drop, input, list } = zone();
    enhanceFiles(input, { list, signal: life.signal });
    life.abort();
    drag(drop, "drop", [file("a.ass")]);
    expect(list.children.length).toBe(0);
  });

  it("says a refused file after the files taken, and a refusal alone", async () => {
    installAnnouncer({ signal: life.signal });
    const { drop, input } = zone();
    enhanceFiles(input, { signal: life.signal });
    const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;
    drag(drop, "drop", [file("a.ass"), file("b.mkv")]);
    await expect.poll(polite).toBe("1 file chosen. Only .ass or .srt files can be added.");
    drag(drop, "drop", [file("c.mkv")]);
    await expect.poll(polite).toBe("Only .ass or .srt files can be added.");
  });

  it("clears a form's error on the field once a choice is taken whole, and keeps it otherwise", () => {
    const { input } = zone();
    enhanceFiles(input, { signal: life.signal });
    showError(input, "Choose a file to upload.");
    choose(input, [file("a.mkv")]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    choose(input, [file("a.ass")]);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
