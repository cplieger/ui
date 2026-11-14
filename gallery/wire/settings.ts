/**
 * settings.ts — the gallery's wiring for the forms page's file fields, the
 * upload dialog, Add a source, the pair rows, Reset to default and the
 * errors across settings categories with their category select, on the
 * library's modules.
 */

import { enhanceFiles, uploadFile, type UploadResult } from "@cplieger/ui/file";
import {
  clearError,
  reportErrors,
  showError,
  type Control,
  type ReportedError,
} from "@cplieger/ui/form";
import { enhanceSettings } from "@cplieger/ui/settings";
import { toast } from "@cplieger/ui/toast";

// The gallery's made-up server: every second upload fails once, so the card
// shows Retry.
let sent = 0;
const failing = new Set<File>();
const send = (file: File, signal: AbortSignal): Promise<UploadResult> =>
  new Promise((done) => {
    if (sent++ % 2 === 1) {
      failing.add(file);
    }
    const timer = setTimeout(() => {
      done(
        failing.delete(file) ? { ok: false, message: "The server did not answer." } : { ok: true },
      );
    }, 1500);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
    });
  });

// A file field names its list by data-files and its limit by data-max-size.
// In a dialog, Upload with no file says so on the field, and a dialog's
// data-upload names the list its files upload into, in subflux's words.
for (const input of document.querySelectorAll<HTMLInputElement>("input[type='file'][data-files]")) {
  const list = document.getElementById(input.dataset["files"] ?? "");
  const form = input.form;
  const uploads = document.getElementById(
    form?.closest<HTMLElement>("[data-upload]")?.dataset["upload"] ?? "",
  );
  const files = enhanceFiles(input, {
    ...(list === null ? {} : { list }),
    ...(uploads === null
      ? {}
      : { words: { tooBig: (max) => `Files over ${max} can't be uploaded.` } }),
    maxSize: Number(input.dataset["maxSize"] ?? Infinity),
  });
  const summary = form?.querySelector<HTMLElement>("[data-summary]");
  if (form === null || summary === null || summary === undefined) {
    continue;
  }
  form.addEventListener("submit", (e) => {
    if (files.files.length === 0) {
      e.preventDefault();
      reportErrors(form, [{ field: input, message: "Choose a file to upload." }], {
        summary,
        heading: (n) => `${String(n)} fields need a fix`,
      });
      return;
    }
    if (uploads !== null) {
      for (const file of files.files) {
        uploadFile(uploads, file, send);
      }
    }
  });
}

// Add a source runs the gallery's own checks; the library shows what they
// find, and typed values stay.
const source = document.getElementById("f-summary");
const sourceForm = source?.closest("form");
if (source !== null && sourceForm !== null && sourceForm !== undefined) {
  sourceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors = [...sourceForm.querySelectorAll<Control>("[required]")]
      .filter(
        (f) => f.value.trim() === "" || (f.type === "url" && !/^https?:\/\/\S+/.test(f.value)),
      )
      .map((field) => ({
        field,
        message:
          field.type === "url"
            ? "Enter the address, starting with http:// or https://."
            : "Paste the key from Sonarr.",
      }));
    reportErrors(sourceForm, errors, {
      summary: source,
      heading: (n) => `${String(n)} fields need a fix before this saves`,
    });
    if (errors.length === 0) {
      toast({ kind: "success", title: "Source added" });
    }
  });
}

// A path must start with /, said once the field is left.
for (const box of document.querySelectorAll<HTMLElement>("[data-pairs]")) {
  box.addEventListener("focusout", (e) => {
    const f = e.target;
    if (!(f instanceof HTMLInputElement)) {
      return;
    }
    if (f.value.trim() !== "" && !f.value.startsWith("/")) {
      showError(f, "Start with /");
    } else {
      clearError(f);
    }
  });
}

// Reset to default checks the fieldset's boxes its data-reset names, firing
// input and change for each box it changes, as a press would.
for (const reset of document.querySelectorAll<HTMLButtonElement>("button[data-reset]")) {
  const defaults = new Set((reset.dataset["reset"] ?? "").split(" "));
  reset.addEventListener("click", () => {
    for (const box of reset
      .closest("fieldset")
      ?.querySelectorAll<HTMLInputElement>("input[type='checkbox']") ?? []) {
      const on = defaults.has(box.value);
      if (box.checked !== on) {
        box.checked = on;
        box.dispatchEvent(new Event("input", { bubbles: true }));
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });
}

// The categories show one at a time, as an app's router would: a press on a
// link shows its section before the press returns, which reportErrors needs
// to open a category.
for (const box of document.querySelectorAll<HTMLElement>("[data-categories]")) {
  const links = [...box.querySelectorAll<HTMLAnchorElement>(".cp-settings-nav a[href^='#']")];
  for (const link of links) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      for (const other of links) {
        const section = document.getElementById(other.hash.slice(1));
        if (section !== null) {
          section.hidden = other !== link;
        }
        if (other === link) {
          other.setAttribute("aria-current", "page");
        } else {
          other.removeAttribute("aria-current");
        }
      }
    });
  }
}

const across = document.getElementById("se-form");
if (across instanceof HTMLFormElement) {
  enhanceSettings(across);
  const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  across.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors: ReportedError[] = [];
    if (e.submitter?.hasAttribute("data-elsewhere") === true) {
      errors.push({
        message:
          "These settings changed on another device while you were editing. Load the latest, then save again.",
      });
    }
    if (field("se-name").value.trim() === "") {
      errors.push({ field: field("se-name"), message: "Enter the name shown on your sessions." });
    }
    if (field("se-sonarr").value.trim() === field("se-radarr").value.trim()) {
      errors.push({
        section: document.getElementById("se-sources") as HTMLElement,
        message: "Sonarr and Radarr use one address.",
      });
    }
    if (Number(field("se-every").value) < 5) {
      errors.push({ field: field("se-every"), message: "Enter 5 minutes or more." });
    }
    reportErrors(across, errors, {
      summary: document.getElementById("se-summary") as HTMLElement,
      notice: document.getElementById("se-notice") as HTMLElement,
      heading: (n) =>
        n === 1
          ? "1 error to fix before this saves"
          : `${String(n)} errors to fix before this saves`,
    });
    if (errors.length === 0) {
      toast({ kind: "success", title: "Settings saved" });
    }
  });
}
