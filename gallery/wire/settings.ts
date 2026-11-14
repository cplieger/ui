/**
 * settings.ts — the gallery's wiring for the forms page's file fields, the
 * upload dialog, Add a source and the pair rows, on the library's modules.
 */

import { enhanceFiles, uploadFile, type UploadResult } from "@cplieger/ui/file";
import { clearError, reportErrors, showError, type Control } from "@cplieger/ui/form";
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
