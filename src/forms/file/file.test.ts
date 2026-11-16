import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { showError } from "../form/form.js";
import { enhanceFiles, fileSize, uploadFile, type UploadResult } from "./file.js";

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
  list.className = "cp-list";
  list.dataset["density"] = "compact";
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
    expect(
      [...list.querySelectorAll(":scope > li > .cp-list-row")].map((row) =>
        [...row.children].map((part) => part.textContent),
      ),
    ).toEqual([
      ["", "a.ass", "2\u00a0KB"],
      ["", "b.SRT", "5\u00a0KB"],
    ]);
    const [glyph, name, size] = [...(list.querySelector(".cp-list-row")?.children ?? [])];
    expect([
      glyph?.className,
      glyph?.getAttribute("data-cp-icon"),
      glyph?.getAttribute("aria-hidden"),
      name?.className,
      size?.getAttribute("data-part"),
    ]).toEqual(["cp-icon", "file-text", "true", "cp-cell-stack", "end"]);
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

/** A send whose answers the test gives, one per call. */
function server(): {
  send: (f: File, signal: AbortSignal) => Promise<UploadResult>;
  answer: (result: UploadResult | Error) => void;
  calls: AbortSignal[];
} {
  const waiting: ((result: UploadResult | Error) => void)[] = [];
  const calls: AbortSignal[] = [];
  return {
    calls,
    send: (_f, signal) => {
      calls.push(signal);
      return new Promise((resolve, reject) => {
        waiting.push((r) => {
          if (r instanceof Error) {
            reject(r);
          } else {
            resolve(r);
          }
        });
      });
    },
    answer: (result) => {
      waiting.shift()?.(result);
    },
  };
}

function uploads(): HTMLElement {
  const list = document.createElement("ul");
  list.className = "cp-list";
  list.dataset["density"] = "compact";
  list.setAttribute("aria-label", "Uploaded files");
  document.body.append(list);
  return list;
}

const said = (politeness: "polite" | "assertive") => () =>
  document.querySelector(`[aria-live="${politeness}"]`)?.textContent;

describe("uploadFile", () => {
  it("lists the file Uploading…, then Uploaded, and says so politely", async () => {
    installAnnouncer({ signal: life.signal });
    const list = uploads();
    const { send, answer, calls } = server();
    const item = uploadFile(list, file("Frieren.S01E05.en.ass"), send, { signal: life.signal });
    const row = item.querySelector(":scope > .cp-list-row") as HTMLElement;
    const state = row.querySelector('[data-part="end"] > .cp-state') as HTMLElement;
    expect([
      item.parentElement,
      row.tabIndex,
      row.querySelector(".cp-cell-stack")?.firstChild?.textContent,
      row.querySelector(".cp-cell-stack > small")?.textContent,
      row.querySelector('[data-part="end"]')?.childNodes.length,
      state.dataset["cpState"],
      state.textContent,
      calls.length,
    ]).toEqual([list, -1, "Frieren.S01E05.en.ass", "2\u00a0KB", 1, "busy", "Uploading…", 1]);
    answer({ ok: true });
    await expect.poll(() => state.dataset["cpState"]).toBe("done");
    expect([
      state.textContent,
      row.querySelector("button"),
      row.querySelector("small")?.textContent,
    ]).toEqual(["Uploaded", null, "2\u00a0KB"]);
    await expect.poll(said("polite")).toBe("Frieren.S01E05.en.ass uploaded");
  });

  it("shows a failure's reason in place of the size with Retry, keeps the failure while Retry runs, and focuses the row once it is uploaded", async () => {
    installAnnouncer({ signal: life.signal });
    const list = uploads();
    const { send, answer, calls } = server();
    const row = uploadFile(list, file("a.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    const state = row.querySelector(".cp-state") as HTMLElement;
    answer({ ok: false, message: "The server did not answer." });
    await expect.poll(() => state.dataset["cpState"]).toBe("failed");
    const retry = row.querySelector(":scope > button.cp-button") as HTMLButtonElement;
    expect([
      state.textContent,
      row.querySelector(".cp-cell-stack > small")?.textContent,
      retry.getAttribute("aria-label"),
      retry.dataset["size"],
      retry.querySelector(".cp-roll")?.textContent,
      retry.previousElementSibling?.getAttribute("data-part"),
    ]).toEqual(["Not uploaded", "The server did not answer.", "Retry a.ass", "sm", "Retry", "end"]);
    await expect.poll(said("assertive")).toBe("a.ass not uploaded. The server did not answer.");
    retry.focus();
    retry.click();
    await expect.poll(() => calls.length).toBe(2);
    expect([state.dataset["cpState"], row.querySelector("small")?.textContent]).toEqual([
      "failed",
      "The server did not answer.",
    ]);
    retry.click();
    expect(calls.length).toBe(2);
    answer({ ok: true });
    await expect.poll(() => state.dataset["cpState"]).toBe("done");
    expect([
      row.contains(retry),
      document.activeElement,
      row.querySelector("small")?.textContent,
    ]).toEqual([false, row, "2\u00a0KB"]);
  });

  it("puts a second failure's reason in place with Retry back at rest", async () => {
    const list = uploads();
    const { send, answer } = server();
    const row = uploadFile(list, file("a.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    answer({ ok: false, message: "The server did not answer." });
    await expect.poll(() => row.querySelector("button")).not.toBeNull();
    const retry = row.querySelector("button") as HTMLButtonElement;
    retry.click();
    answer({ ok: false, message: "The disk is full." });
    await expect.poll(() => row.querySelector("small")?.textContent).toBe("The disk is full.");
    await expect.poll(() => retry.hasAttribute("data-cp-state")).toBe(false);
    expect([row.querySelectorAll("button").length, row.querySelectorAll("small").length]).toEqual([
      1, 1,
    ]);
  });

  it("offers no Retry for a final failure", async () => {
    const list = uploads();
    const { send, answer } = server();
    const row = uploadFile(list, file("a.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    answer({ ok: false, message: "Only UTF-8 files can be read.", final: true });
    await expect.poll(() => row.querySelector(".cp-state")?.textContent).toBe("Not uploaded");
    expect([row.querySelector("small")?.textContent, row.querySelector("button")]).toEqual([
      "Only UTF-8 files can be read.",
      null,
    ]);
  });

  it("drops Retry when a retry fails for good", async () => {
    const list = uploads();
    const { send, answer } = server();
    const row = uploadFile(list, file("a.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    answer(new TypeError("Failed to fetch"));
    await expect.poll(() => row.querySelector("button")).not.toBeNull();
    expect(row.querySelector("small")?.textContent).toBe("The upload did not finish.");
    const retry = row.querySelector("button") as HTMLButtonElement;
    retry.focus();
    retry.click();
    answer({ ok: false, message: "The file is gone from the server's queue.", final: true });
    await expect.poll(() => row.querySelector("button")).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("takes the app's words", async () => {
    installAnnouncer({ signal: life.signal });
    const list = uploads();
    const { send, answer } = server();
    const row = uploadFile(list, file("a.ass"), send, {
      signal: life.signal,
      words: {
        uploading: "Envoi…",
        failed: "Non envoyé",
        failedWhy: "L'envoi n'a pas abouti.",
        retry: "Réessayer",
        retryFor: (n) => `Réessayer ${n}`,
        saidFailed: (n, why) => `${n} : ${why}`,
      },
    }).firstElementChild as HTMLElement;
    expect(row.querySelector(".cp-state")?.textContent).toBe("Envoi…");
    answer(new Error("boom"));
    await expect
      .poll(() => row.querySelector("button")?.getAttribute("aria-label"))
      .toBe("Réessayer a.ass");
    expect([
      row.querySelector(".cp-state")?.textContent,
      row.querySelector(".cp-roll")?.textContent,
    ]).toEqual(["Non envoyé", "Réessayer"]);
    await expect.poll(said("assertive")).toBe("a.ass : L'envoi n'a pas abouti.");
  });

  it("aborts the send in flight and leaves the row as it was once its signal aborts", async () => {
    const list = uploads();
    const { send, answer, calls } = server();
    const row = uploadFile(list, file("a.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    life.abort();
    expect(calls[0]?.aborted).toBe(true);
    answer({ ok: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(row.querySelector(".cp-state")?.getAttribute("data-cp-state")).toBe("busy");
  });

  it("neither lists nor sends once its signal has aborted", () => {
    const list = uploads();
    const send = vi.fn<(f: File, s: AbortSignal) => Promise<UploadResult>>();
    life.abort();
    uploadFile(list, file("a.ass"), send, { signal: life.signal });
    expect([list.children.length, send.mock.calls.length]).toEqual([0, 0]);
  });
});

describe("a file field's list, drawn by the stylesheet", () => {
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

  it("draws no box before a choice, then each file as a compact row with its glyph painted", () => {
    const { input, list } = zone();
    enhanceFiles(input, { list, signal: life.signal });
    expect(getComputedStyle(list).display).toBe("none");
    choose(input, [file("Frieren.S01E05.en.ass"), file("b.srt")]);
    expect(getComputedStyle(list).display).toBe("grid");
    const row = list.querySelector(".cp-list-row") as HTMLElement;
    expect(row.getBoundingClientRect().height).toBe(26);
    const glyph = getComputedStyle(row.querySelector(".cp-icon") as Element);
    expect(decodeURIComponent(glyph.maskImage)).toContain("M16 13H8");
    const name = (row.querySelector(".cp-cell-stack") as Element).getBoundingClientRect();
    const size = (row.querySelector('[data-part="end"]') as Element).getBoundingClientRect();
    expect(size.left).toBeGreaterThan(name.right - 1);
    expect(size.right).toBeCloseTo(row.getBoundingClientRect().right - 8, 0);
  });

  it("wraps a name with no break point inside its row", () => {
    const { field, input, list } = zone();
    field.style.inlineSize = "16rem";
    enhanceFiles(input, { list, signal: life.signal });
    choose(input, [file(`${"x".repeat(80)}.ass`)]);
    const row = list.querySelector(".cp-list-row") as HTMLElement;
    const name = row.querySelector(".cp-cell-stack") as Element;
    expect(row.scrollWidth).toBe(row.clientWidth);
    expect(name.getBoundingClientRect().height).toBeGreaterThan(40);
  });
  it("draws a failed upload's reason under its name, its state's glyph, and Retry after the end, with room for the name at a phone's width", async () => {
    const list = uploads();
    list.style.inlineSize = "20rem";
    const { send, answer } = server();
    const row = uploadFile(list, file("Frieren.S01E05.en.ass"), send, { signal: life.signal })
      .firstElementChild as HTMLElement;
    answer({ ok: false, message: "The server did not answer." });
    await expect.poll(() => row.querySelector("button")).not.toBeNull();
    const box = (sel: string): DOMRect =>
      (row.querySelector(sel) as Element).getBoundingClientRect();
    const name = box(".cp-cell-stack");
    const reason = box(".cp-cell-stack > small");
    const end = box('[data-part="end"]');
    const retry = box(":scope > button");
    expect(reason.top).toBeGreaterThan(name.top + 10);
    expect(end.left).toBeGreaterThan(name.right - 1);
    expect(retry.left).toBeGreaterThan(end.right - 1);
    expect(retry.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
    expect(name.width).toBeGreaterThan(64);
    const glyph = getComputedStyle(row.querySelector(".cp-state") as Element, "::before");
    expect([glyph.content, decodeURIComponent(glyph.maskImage)]).toEqual([
      '""',
      expect.stringContaining("m15 9-6 6"),
    ]);
    const icons = [...row.querySelectorAll("button > .cp-icon")].map(
      (i) => getComputedStyle(i).display,
    );
    expect(icons[0]).not.toBe("none");
    expect(icons[1]).toBe("none");
  });
});
