import { afterEach, describe, expect, it } from "vitest";

import { installAnnouncer } from "../../feedback/announce/announce.js";
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
    ]).toEqual(["1 KB", "2 KB", "4.2 MB", "3 GB"]);
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
    expect([...list.children].map((li) => li.textContent)).toEqual(["a.ass2 KB", "b.SRT5 KB"]);
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
    expect(error?.textContent).toBe("Files over 4 KB can't be added.");
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

  it("removes its listeners once its signal aborts", () => {
    const { drop, input, list } = zone();
    enhanceFiles(input, { list, signal: life.signal });
    life.abort();
    drag(drop, "drop", [file("a.ass")]);
    expect(list.children.length).toBe(0);
  });
});
