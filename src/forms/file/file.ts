/**
 * file.ts — `enhanceFiles()` gives a file field its limits and its list: a
 * file of a type its `accept` does not name, or over `maxSize`, is refused
 * with a sentence on the field, the files taken are listed by name and
 * size, and a field inside a `.cp-drop` also takes files dropped on it.
 * @module
 */

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
  /** A `<ul class="cp-files">` that lists the files taken. */
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
      list.replaceChildren(
        ...kept.map((f) => {
          const item = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = f.name;
          const size = document.createElement("small");
          size.textContent = fileSize(f.size);
          item.append(name, size);
          return item;
        }),
      );
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
  input.form?.addEventListener(
    "reset",
    () => {
      queueMicrotask(() => {
        if (held().length === 0) {
          list?.replaceChildren();
          clearError(input, "file");
        }
      });
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
