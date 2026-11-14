/**
 * file.ts — `enhanceFiles()` gives a file field its limits and its list: a
 * file of a type its `accept` does not name, or over `maxSize`, is refused
 * with a sentence on the field, the files taken are listed by name and
 * size, and a field inside a `.cp-drop` also takes files dropped on it.
 * `uploadFile()` lists one file's upload with its state and Retry.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";
import { clearError, showError } from "../form/field-error.js";

/** The words the field writes and says. */
export interface FilesWords {
  /** A file over the limit. Default "Files over {max} cannot be added." */
  readonly tooBig?: (max: string, file: File) => string;
  /** A file of another type. Default "Only {types} files can be added." */
  readonly wrongType?: (types: string, file: File) => string;
  /** Said once files are taken. Default "{n} files chosen". */
  readonly chosen?: (count: number) => string;
}

export interface FilesOptions {
  /** The largest file taken, in bytes. */
  readonly maxSize?: number;
  /** A `.cp-list`, best `data-density="compact"`, that lists the files taken. */
  readonly list?: HTMLElement;
  readonly words?: FilesWords;
  /** After each choice or drop, with the files taken. */
  readonly onChange?: (files: readonly File[]) => void;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

export interface Files {
  /** The files the field holds now. */
  readonly files: readonly File[];
}

const OVER = "data-cp-over";

/** A size as people read it, "12 KB" or "4.2 MB", in binary units. */
export function fileSize(bytes: number): string {
  const n = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) {
    return `${n.format(Math.max(1, Math.round(bytes / 1024)))}\u00a0KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${n.format(bytes / 1024 ** 2)}\u00a0MB`;
  }
  return `${n.format(bytes / 1024 ** 3)}\u00a0GB`;
}

/** Whether `file` matches an `accept` list of extensions and MIME types. */
function accepts(accept: readonly string[], file: File): boolean {
  if (accept.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((a) =>
    a.startsWith(".")
      ? name.endsWith(a)
      : a.endsWith("/*")
        ? type.startsWith(a.slice(0, -1))
        : type === a,
  );
}

/** A file's list item: its glyph, its name and its size. */
function fileRow(file: File): {
  item: HTMLLIElement;
  row: HTMLDivElement;
  body: HTMLSpanElement;
  end: HTMLSpanElement;
} {
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = "file-text";
  glyph.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "cp-cell-stack";
  name.textContent = file.name;
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.textContent = fileSize(file.size);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(glyph, name, end);
  const item = document.createElement("li");
  item.append(row);
  return { item, row, body: name, end };
}

/** "a, b or c". */
function either(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} or ${String(items.at(-1))}`;
}

/** `input` is an `<input type="file">`, with `multiple` to take several. */
export function enhanceFiles(input: HTMLInputElement, options: FilesOptions = {}): Files {
  const { maxSize = Infinity, list, onChange, signal } = options;
  const words = {
    tooBig: options.words?.tooBig ?? ((max: string) => `Files over ${max} cannot be added.`),
    wrongType: options.words?.wrongType ?? ((types: string) => `Only ${types} files can be added.`),
    chosen:
      options.words?.chosen ??
      ((n: number) => (n === 1 ? "1 file chosen" : `${String(n)} files chosen`)),
  };
  const accept = input.accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a !== "");
  const held = (): File[] => [...(input.files ?? [])];
  if (signal?.aborted === true) {
    return { files: [] };
  }
  const listen = until(signal);

  const take = (chosen: readonly File[]): void => {
    const many = input.multiple ? chosen : chosen.slice(0, 1);
    let refusal = "";
    const kept = many.filter((f) => {
      if (!accepts(accept, f)) {
        refusal ||= words.wrongType(either(accept), f);
        return false;
      }
      if (f.size > maxSize) {
        refusal ||= words.tooBig(fileSize(maxSize), f);
        return false;
      }
      return true;
    });
    // The field holds only what it took, so a form sends no refused file.
    const keep = new DataTransfer();
    for (const f of kept) {
      keep.items.add(f);
    }
    input.files = keep.files;
    if (refusal !== "") {
      showError(input, refusal, undefined, "file");
    } else if (kept.length > 0) {
      // A choice the field took whole answers a form's "choose a file" too.
      clearError(input);
    } else {
      clearError(input, "file");
    }
    if (list !== undefined) {
      list.replaceChildren(...kept.map((f) => fileRow(f).item));
    }
    if (kept.length > 0 || refusal !== "") {
      announce(
        kept.length === 0
          ? refusal
          : refusal === ""
            ? words.chosen(kept.length)
            : `${words.chosen(kept.length)}. ${refusal}`,
      );
    }
    onChange?.(kept);
  };

  let dropped = false;
  input.addEventListener(
    "change",
    () => {
      // A drop's own change event: its files are taken already.
      if (!dropped) {
        take(held());
      }
    },
    listen,
  );
  // A form's reset empties the field but fires no change, so the list and
  // the refusal follow once the reset has run, unless a listener cancelled it.
  // The check waits a task, not a microtask: a reset button's event runs a
  // microtask checkpoint before the controls reset
  // (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#concept-form-reset).
  input.form?.addEventListener(
    "reset",
    () => {
      setTimeout(() => {
        if (held().length === 0) {
          list?.replaceChildren();
          clearError(input, "file");
        }
      }, 0);
    },
    listen,
  );
  const zone = input.closest<HTMLElement>(".cp-drop");
  if (zone !== null) {
    zone.addEventListener(
      "dragover",
      (e) => {
        if (e.dataTransfer?.types.includes("Files") === true) {
          e.preventDefault();
          zone.setAttribute(OVER, "");
        }
      },
      listen,
    );
    for (const type of ["dragleave", "dragend"]) {
      zone.addEventListener(
        type,
        (e) => {
          if (!(e instanceof DragEvent) || !zone.contains(e.relatedTarget as Node | null)) {
            zone.removeAttribute(OVER);
          }
        },
        listen,
      );
    }
    zone.addEventListener(
      "drop",
      (e) => {
        e.preventDefault();
        zone.removeAttribute(OVER);
        take([...(e.dataTransfer?.files ?? [])]);
        dropped = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        dropped = false;
      },
      listen,
    );
  }
  return {
    get files() {
      return held();
    },
  };
}

/** What the server made of one upload. A `final` failure, such as a format
 *  the server refuses, would fail the same way again, so it offers no Retry. */
export type UploadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly final?: boolean };

/** The words an upload's row shows and says. */
export interface UploadWords {
  /** Default "Uploading…". */
  readonly uploading?: string;
  /** Default "Uploaded". */
  readonly uploaded?: string;
  /** Default "Not uploaded". */
  readonly failed?: string;
  /** The reason when `send` rejects. Default "The upload did not finish." */
  readonly failedWhy?: string;
  /** Default "Retry". */
  readonly retry?: string;
  /** Default "Retrying…". */
  readonly retrying?: string;
  /** Retry's accessible name. Default "Retry {name}". */
  readonly retryFor?: (name: string) => string;
  /** Said politely once it is uploaded. Default "{name} uploaded". */
  readonly saidUploaded?: (name: string) => string;
  /** Said assertively when it fails. Default "{name} not uploaded. {why}". */
  readonly saidFailed?: (name: string, why: string) => string;
}

export interface UploadOptions {
  readonly words?: UploadWords;
  /** Aborts the send in flight and ends the row's Retry. */
  readonly signal?: AbortSignal;
}

function iconSpan(name: string, part?: string): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = "cp-icon";
  icon.dataset["cpIcon"] = name;
  if (part !== undefined) {
    icon.dataset["part"] = part;
  }
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

/**
 * Appends `file`'s row to `list`, its size under its name, and uploads it
 * through `send`: its state reads Uploading…, then Uploaded, or Not uploaded
 * with the reason in place of the size and Retry, unless the failure is final. A `send` that rejects is
 * a failure that can be retried. Each outcome is announced. Returns the
 * row's item.
 */
export function uploadFile(
  list: HTMLElement,
  file: File,
  send: (file: File, signal: AbortSignal) => Promise<UploadResult>,
  options: UploadOptions = {},
): HTMLLIElement {
  const w = options.words;
  const words = {
    uploading: w?.uploading ?? "Uploading…",
    uploaded: w?.uploaded ?? "Uploaded",
    failed: w?.failed ?? "Not uploaded",
    failedWhy: w?.failedWhy ?? "The upload did not finish.",
    retry: w?.retry ?? "Retry",
    retrying: w?.retrying ?? "Retrying…",
    retryFor: w?.retryFor ?? ((name: string) => `Retry ${name}`),
    saidUploaded: w?.saidUploaded ?? ((name: string) => `${name} uploaded`),
    saidFailed: w?.saidFailed ?? ((name: string, why: string) => `${name} not uploaded. ${why}`),
  };
  const signal = options.signal ?? new AbortController().signal;
  const { item, row, body, end } = fileRow(file);
  // Focus lands on the row when its Retry leaves, so it never falls to the page.
  row.tabIndex = -1;
  // The size moves under the name, so the end holds the state alone and a
  // failed row's Retry still leaves the name room at a phone's width.
  const line = document.createElement("small");
  line.textContent = fileSize(file.size);
  body.append(line);
  const state = document.createElement("span");
  state.className = "cp-state";
  end.replaceChildren(state);
  let retry: HTMLButtonElement | null = null;
  if (signal.aborted) {
    return item;
  }

  const show = (to: "busy" | "done" | "failed", text: string): void => {
    state.dataset["cpState"] = to;
    state.textContent = text;
  };
  const dropRetry = (): void => {
    if (retry !== null && retry === document.activeElement) {
      row.focus();
    }
    retry?.remove();
    retry = null;
  };
  const attempt = async (): Promise<UploadResult | null> => {
    let result: UploadResult;
    try {
      result = await send(file, signal);
    } catch {
      result = { ok: false, message: words.failedWhy };
    }
    return signal.aborted ? null : result;
  };
  const makeRetry = (): HTMLButtonElement => {
    const button = document.createElement("button");
    button.className = "cp-button";
    button.type = "button";
    button.dataset["size"] = "sm";
    button.setAttribute("aria-label", words.retryFor(file.name));
    const roll = document.createElement("span");
    roll.className = "cp-roll";
    roll.textContent = words.retry;
    button.append(iconSpan("refresh-cw"), iconSpan("spinner-arc", "busy"), roll);
    row.append(button);
    const cycle = enhanceConfirm(button, { busy: words.retrying, done: false, signal });
    button.addEventListener(
      "click",
      () => {
        let result: UploadResult | null = null;
        void cycle
          .run(async () => {
            result = await attempt();
          })
          .then(() => {
            if (result !== null) {
              settle(result);
            }
          });
      },
      until(signal),
    );
    return button;
  };

  const settle = (result: UploadResult): void => {
    if (result.ok) {
      line.textContent = fileSize(file.size);
      dropRetry();
      show("done", words.uploaded);
      announce(words.saidUploaded(file.name));
      return;
    }
    show("failed", words.failed);
    line.textContent = result.message;
    if (result.final === true) {
      dropRetry();
    } else {
      retry ??= makeRetry();
    }
    announce(words.saidFailed(file.name, result.message), "assertive");
  };
  show("busy", words.uploading);
  list.append(item);
  void attempt().then((result) => {
    if (result !== null) {
      settle(result);
    }
  });
  return item;
}
